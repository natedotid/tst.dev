/**
 * Email header analysis (RFC 5322): unfolding, Received-chain delays,
 * Authentication-Results (SPF/DKIM/DMARC), and a plain-English summary.
 * Pure: headers are text, no browser APIs.
 *
 * Privacy note: headers contain IP addresses and envelope details. This
 * module never sends anything anywhere; the tool page says so.
 */

export interface Header {
  name: string;
  value: string;
}

/**
 * Unfold RFC 5322 headers. CRLF is normalized to LF first; a line starting
 * with whitespace is a continuation of the previous header (the CRLF is
 * dropped and the leading linear whitespace is kept, per §2.2.3). The
 * header section ends at the first blank line (the body follows) or the
 * first non-continuation line without a colon. Repeated names are
 * preserved in order.
 */
export function unfoldHeaders(raw: string): Header[] {
  const headers: Header[] = [];
  let current: Header | null = null;
  for (const line of raw.replace(/\r\n/g, "\n").split("\n")) {
    if (line === "") break; // end of headers, body starts
    if (/^[ \t]/.test(line)) {
      if (current) current.value += line; // keep the leading whitespace
      continue; // orphan fold before any header: ignore
    }
    const idx = line.indexOf(":");
    if (idx === -1) break; // not a header line; stop
    current = { name: line.slice(0, idx).trim(), value: line.slice(idx + 1).trim() };
    headers.push(current);
  }
  return headers;
}

/** All values for a header name, case-insensitive, in order. */
export function getHeaderValues(headers: Header[], name: string): string[] {
  const target = name.toLowerCase();
  return headers.filter((h) => h.name.toLowerCase() === target).map((h) => h.value);
}

/**
 * Extract the address domain from a From/To value: "Name <a@b.c>" or a
 * bare "a@b.c" → "b.c".
 */
export function extractAddressDomain(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const m = value.match(/<([^>]+@[^>]+)>/) ?? value.match(/\S+@\S+/);
  if (!m) return undefined;
  const addr = (m[1] ?? m[0]).split("@");
  return addr.length === 2 ? addr[1].toLowerCase() : undefined;
}

/* ------------------------------ Received chain ------------------------------ */

export interface ReceivedHop {
  /** Sending host (the `from` part). */
  from: string;
  /** IP inside the from-parenthetical, if present. */
  ip?: string;
  /** Receiving host (the `by` part). */
  to?: string;
  /** Protocol (the `with` part, e.g. ESMTPS). */
  via?: string;
  /** Parsed delivery date as ISO, if present. */
  date?: string;
  /**
   * Milliseconds since the next-older hop (the hop before this one in the
   * chain). null when either date is missing or unparseable.
   */
  delayMs: number | null;
}

export interface ReceivedChain {
  /** Hops newest-first, as they appear in the header block. */
  hops: ReceivedHop[];
  /** Newest minus oldest parseable date, or null with fewer than two dates. */
  totalMs: number | null;
}

const FROM_RE = /^\s*from\s+(\S+)(?:\s+\(([^)]*)\))?/i;
const BY_RE = /\bby\s+([^\s;]+)/i;
const WITH_RE = /\bwith\s+([^\s;]+)/i;

/**
 * Parse the Received: chain. Tolerates missing or malformed entries; a
 * hop with an unparseable date still appears, with delayMs null.
 */
export function parseReceivedChain(receivedValues: string[]): ReceivedChain {
  const hops: ReceivedHop[] = receivedValues.map((value) => {
    const fromMatch = value.match(FROM_RE);
    const paren = fromMatch?.[2] ?? "";
    const hop: ReceivedHop = {
      from: fromMatch?.[1] ?? "(unparseable)",
      ip: paren.match(/\[([^\]]+)\]/)?.[1],
      to: value.match(BY_RE)?.[1],
      via: value.match(WITH_RE)?.[1],
      delayMs: null,
    };
    // The date follows the last semicolon, optionally with a "(PDT)"-style
    // timezone abbreviation that Date.parse would choke on.
    const semi = value.lastIndexOf(";");
    if (semi !== -1) {
      const dateStr = value
        .slice(semi + 1)
        .trim()
        .replace(/\s*\([A-Za-z]{2,5}\)\s*$/, "");
      const t = Date.parse(dateStr);
      if (!Number.isNaN(t)) {
        hop.date = new Date(t).toISOString();
        hop.delayMs = t; // temporary: hold the epoch, deltas computed below
      }
    }
    return hop;
  });

  // Received headers are newest-first: hop i waited (date[i] - date[i+1]).
  for (let i = 0; i < hops.length; i++) {
    const a = hops[i].delayMs;
    const b = i + 1 < hops.length ? hops[i + 1].delayMs : null;
    hops[i].delayMs = a !== null && b !== null ? a - b : null;
  }
  const dated = hops.filter((h) => h.date !== undefined);
  const totalMs =
    dated.length >= 2 ? Date.parse(dated[0].date!) - Date.parse(dated[dated.length - 1].date!) : null;

  return { hops, totalMs };
}

/* --------------------------- Authentication-Results --------------------------- */

export type AuthOutcome =
  | "pass"
  | "fail"
  | "softfail"
  | "neutral"
  | "none"
  | "temperror"
  | "permerror";

const OUTCOMES: AuthOutcome[] = [
  "pass",
  "fail",
  "softfail",
  "neutral",
  "none",
  "temperror",
  "permerror",
];

export interface AuthDkim {
  result: string;
  selector?: string;
  domain?: string;
}

export interface AuthParse {
  evaluatingServers: string[];
  spf?: { result: string; domain?: string; hostname?: string; reason?: string };
  dkim: AuthDkim[];
  dmarc?: { result: string; domain?: string };
  /** A DKIM-Signature header exists even without an Authentication-Results verdict. */
  dkimSignaturePresent: boolean;
  raw: string[];
}

/**
 * Parse Authentication-Results headers. The segment before the first `;`
 * is the evaluating server; the rest are `key=value` tokens (spf/dkim/
 * dmarc) with space-separated attributes (header.s=, header.d=, …).
 */
export function parseAuthenticationResults(headers: Header[]): AuthParse {
  const arValues = getHeaderValues(headers, "Authentication-Results");
  const out: AuthParse = {
    evaluatingServers: [],
    dkim: [],
    dkimSignaturePresent: getHeaderValues(headers, "DKIM-Signature").length > 0,
    raw: arValues,
  };

  for (const value of arValues) {
    const parts = value.split(";").map((s) => s.trim()).filter(Boolean);
    if (parts.length > 1 && !parts[0].includes("=")) {
      out.evaluatingServers.push(parts.shift()!);
    }
    for (const part of parts) {
      const eq = part.indexOf("=");
      if (eq === -1) continue;
      const key = part.slice(0, eq).trim().toLowerCase();
      const [result, ...attrs] = part.slice(eq + 1).trim().split(/\s+/);
      const attr: Record<string, string> = {};
      for (const a of attrs) {
        const i = a.indexOf("=");
        if (i !== -1) attr[a.slice(0, i).toLowerCase()] = a.slice(i + 1);
      }
      if (key === "spf" && !out.spf) {
        out.spf = {
          result,
          domain: attr["smtp.mailfrom"] ?? attr["mailfrom"],
          hostname: attr["hostname"],
          reason: attr["reason"],
        };
      } else if (key === "dkim") {
        out.dkim.push({ result, selector: attr["header.s"], domain: attr["header.d"] });
      } else if (key === "dmarc" && !out.dmarc) {
        out.dmarc = { result, domain: attr["header.from"] };
      }
      // arc-* and other keys are ignored (kept in `raw`).
    }
  }
  return out;
}

/* --------------------------------- Summary --------------------------------- */

export type AuthVerdict = AuthOutcome | "absent" | "unknown";

/**
 * Map a raw outcome string to a verdict. Missing → "absent"; a value
 * outside the RFC outcome set (e.g. a vendor-specific spelling) →
 * "unknown", so the UI can say the result exists but isn't recognized
 * instead of silently treating it as "none".
 */
export function verdictOf(result: string | undefined): AuthVerdict {
  if (!result) return "absent";
  const r = result.toLowerCase();
  return OUTCOMES.includes(r as AuthOutcome) ? (r as AuthOutcome) : "unknown";
}

export interface EmailSummary {
  from?: string;
  to?: string;
  subject?: string;
  /** Domain of the From address, lowercased. */
  fromDomain?: string;
  auth: {
    spf: AuthVerdict;
    dkim: { verdict: AuthVerdict; selector?: string; domain?: string }[];
    dmarc: AuthVerdict;
    /** True when a DKIM-Signature header exists without a verdict. */
    dkimSignatureOnly: boolean;
  };
  hops: ReceivedHop[];
  totalMs: number | null;
  /** Human-readable warnings, empty when everything is healthy. */
  flags: string[];
}

const BIG_DELAY_MS = 60_000;

/**
 * One pass over the headers: key fields, auth verdicts, hop chain, and a
 * small set of high-signal flags (SPF/DKIM/DMARC problems, large hop
 * delays, From/domain mismatch).
 */
export function summarizeEmail(headers: Header[]): EmailSummary {
  const from = getHeaderValues(headers, "From")[0];
  const to = getHeaderValues(headers, "To")[0];
  const subject = getHeaderValues(headers, "Subject")[0];
  const fromDomain = extractAddressDomain(from);

  const auth = parseAuthenticationResults(headers);
  const chain = parseReceivedChain(getHeaderValues(headers, "Received"));

  const spf = verdictOf(auth.spf?.result);
  const dmarc = verdictOf(auth.dmarc?.result);
  const dkim = auth.dkim.map(({ result, selector, domain }) => ({
    verdict: verdictOf(result),
    selector,
    domain,
  }));
  const dkimSignatureOnly =
    dkim.length === 0 && auth.dkimSignaturePresent;

  const flags: string[] = [];
  if (spf === "fail") flags.push("SPF fail: the sending IP is not authorized for the mail-from domain");
  else if (spf === "softfail") flags.push("SPF softfail: the sending IP is likely not authorized");
  else if (spf === "permerror" || spf === "temperror")
    flags.push(`SPF ${spf}: the SPF check itself errored`);
  else if (spf === "unknown")
    flags.push(`Unrecognized SPF result "${auth.spf?.result}" (outside the RFC 7208 outcome set)`);
  else if (spf === "absent") flags.push("No SPF result in Authentication-Results");

  if (dkim.length === 0) {
    flags.push(
      dkimSignatureOnly
        ? "DKIM signature present but no verification result recorded"
        : "No DKIM result or signature",
    );
  } else {
    const pass = dkim.some((d) => d.verdict === "pass");
    const fail = dkim.some((d) => d.verdict === "fail");
    if (!pass && fail) flags.push("DKIM fail: the signature did not verify");
    else if (!pass) flags.push(`DKIM ${dkim.map((d) => d.verdict).join(", ")}: no passing signature`);
  }

  if (dmarc === "fail") flags.push("DMARC fail: authentication and/or alignment failed");
  else if (dmarc === "unknown")
    flags.push(`Unrecognized DMARC result "${auth.dmarc?.result}" (outside the RFC 7489 outcome set)`);
  else if (dmarc === "absent") flags.push("No DMARC result in Authentication-Results");

  if (auth.dmarc?.domain && fromDomain && !domainsMatch(fromDomain, auth.dmarc.domain)) {
    flags.push(`From domain (${fromDomain}) does not match the DMARC-checked domain (${auth.dmarc.domain})`);
  }

  chain.hops.forEach((h, i) => {
    if (h.delayMs !== null && h.delayMs > BIG_DELAY_MS) {
      flags.push(`Large hop delay: hop ${i + 1} of ${chain.hops.length} took ${Math.round(h.delayMs / 1000)}s`);
    }
  });

  return {
    from,
    to,
    subject,
    fromDomain,
    auth: { spf, dkim, dmarc, dkimSignatureOnly },
    hops: chain.hops,
    totalMs: chain.totalMs,
    flags,
  };
}

/**
 * Alignment-style domain comparison: equal, or one is a subdomain of the
 * other (relaxed DMARC alignment semantics).
 */
export function domainsMatch(a: string, b: string): boolean {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  if (x === y) return true;
  const rd = (d: string) => {
    // registered domain ≈ last two labels (good enough for flagging)
    const labels = d.split(".");
    return labels.slice(-2).join(".");
  };
  return rd(x) === rd(y);
}
