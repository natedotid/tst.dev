/**
 * DNS-over-HTTPS (DNS JSON wire format).
 *
 * Lookups run only when the user clicks, and the browser sends them straight
 * to the chosen resolver (cloudflare-dns.com or dns.google). The fetch
 * wrapper at the bottom is deliberately thin and untested; everything
 * parseable is pure and tested.
 */

export type DohType = "A" | "AAAA" | "NS" | "CNAME" | "SOA" | "MX" | "TXT" | "SRV" | "CAA";

/** DNS JSON reports `type` as a number; this is the mapping for the types we query. */
export const DOH_TYPE_NUMBERS: Record<DohType, number> = {
  A: 1,
  NS: 2,
  CNAME: 5,
  SOA: 6,
  MX: 15,
  TXT: 16,
  AAAA: 28,
  SRV: 33,
  CAA: 257,
};

const TYPE_BY_NUMBER: Record<number, DohType> = Object.fromEntries(
  Object.entries(DOH_TYPE_NUMBERS).map(([name, num]) => [num, name]),
) as Record<number, DohType>;

export type DohStatus = "NOERROR" | "SERVFAIL" | "NXDOMAIN" | "REFUSED" | "UNKNOWN";

function mapStatus(code: number): DohStatus {
  if (code === 0) return "NOERROR";
  if (code === 2) return "SERVFAIL";
  if (code === 3) return "NXDOMAIN";
  if (code === 5) return "REFUSED";
  return "UNKNOWN";
}

export interface DohAnswer {
  /** Owner name, trailing dot stripped. */
  name: string;
  type: DohType | "OTHER";
  data: string;
  ttl: number;
}

export interface DohResult {
  status: DohStatus;
  /** All answers in order: includes CNAME chain members, not just the requested type. */
  answers: DohAnswer[];
  /** Set when the request failed at the network/HTTP level (distinct from a DNS status). */
  error?: string;
}

/**
 * Normalize a DNS JSON response. Pure: feed it fixture JSON in tests.
 * Answers whose type number we don't query are kept, labeled "OTHER".
 */
export function parseDohJson(json: unknown): DohResult {
  if (typeof json !== "object" || json === null) {
    return { status: "UNKNOWN", answers: [], error: "Malformed resolver response" };
  }
  const raw = json as Record<string, unknown>;
  const status = mapStatus(typeof raw.Status === "number" ? raw.Status : -1);
  const answers: DohAnswer[] = [];
  if (Array.isArray(raw.Answer)) {
    for (const entry of raw.Answer) {
      if (typeof entry !== "object" || entry === null) continue;
      const rec = entry as Record<string, unknown>;
      const num = typeof rec.type === "number" ? rec.type : -1;
      answers.push({
        name: typeof rec.name === "string" ? rec.name.replace(/\.$/, "") : "",
        type: TYPE_BY_NUMBER[num] ?? "OTHER",
        data: typeof rec.data === "string" ? rec.data : JSON.stringify(rec.data),
        ttl: typeof rec.TTL === "number" ? rec.TTL : 0,
      });
    }
  }
  return { status, answers };
}

/**
 * A TXT record's text. Resolvers render the RDATA as one or more quoted
 * character-strings (`"v=spf1 include:a " "include:b -all"`); SPF (RFC 7208
 * §3.3) and DKIM (RFC 6376 §3.6.2.2) concatenate them with no separator.
 * Backslash escapes inside a string (\" \\ and \DDD decimal) are decoded.
 * Data that isn't a well-formed sequence of quoted strings is returned
 * unchanged.
 */
export function joinTxtStrings(data: string): string {
  const s = data.trim();
  if (!s.startsWith('"')) return data;
  let out = "";
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === " " || c === "\t") {
      i++;
      continue;
    }
    if (c !== '"') return data; // junk between strings
    i++; // opening quote
    let closed = false;
    while (i < s.length) {
      const ch = s[i];
      if (ch === "\\" && i + 1 < s.length) {
        const dec = s.slice(i + 1, i + 4);
        if (/^\d{3}$/.test(dec)) {
          out += String.fromCharCode(Number(dec));
          i += 4;
        } else {
          out += s[i + 1];
          i += 2;
        }
        continue;
      }
      if (ch === '"') {
        closed = true;
        i++;
        break;
      }
      out += ch;
      i++;
    }
    if (!closed) return data;
  }
  return out;
}

/**
 * Reduce pasted input to a bare hostname: drop scheme, userinfo, path,
 * query, fragment, port and a trailing dot. Lowercases. Does not validate.
 */
export function normalizeDomainInput(raw: string): string {
  let s = raw.trim().toLowerCase();
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  s = s.replace(/^[^@/?#]*@/, "");
  s = s.split(/[/?#]/)[0];
  s = s.replace(/:\d+$/, "");
  s = s.replace(/\.$/, "");
  return s;
}

/** Lightweight form gate: ≥2 labels of [a-z0-9-], 1–63 chars, no edge hyphens, ≤253 total. */
export function isValidDomain(d: string): boolean {
  if (!d || d.length > 253) return false;
  const labels = d.split(".");
  if (labels.length < 2) return false;
  return labels.every(
    (l) => l.length >= 1 && l.length <= 63 && /^[a-z0-9-]+$/i.test(l) && !l.startsWith("-") && !l.endsWith("-"),
  );
}

/** Build the resolver's DNS JSON query URL. */
export function doHurl(resolver: "cloudflare" | "google", name: string, type: DohType): string {
  const t = DOH_TYPE_NUMBERS[type];
  return resolver === "cloudflare"
    ? `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${t}`
    : `https://dns.google/resolve?name=${encodeURIComponent(name)}&type=${t}`;
}

/**
 * Thin fetch wrapper (browser-only, untested by design). Never throws:
 * network failures come back as `error` so one dead query can't sink the
 * rest of the lookup.
 */
export async function lookupDoh(
  resolver: "cloudflare" | "google",
  name: string,
  type: DohType,
): Promise<DohResult> {
  try {
    const res = await fetch(doHurl(resolver, name, type), {
      headers: resolver === "cloudflare" ? { accept: "application/dns-json" } : undefined,
    });
    if (!res.ok) {
      return { status: "UNKNOWN", answers: [], error: `Resolver returned HTTP ${res.status}` };
    }
    return parseDohJson(await res.json());
  } catch (e) {
    return { status: "UNKNOWN", answers: [], error: e instanceof Error ? e.message : "Network error" };
  }
}
