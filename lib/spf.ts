/**
 * SPF (Sender Policy Framework) record parsing and explanation.
 * Pure: SPF records are short text, no browser APIs needed.
 */

export type SpfQualifier = "+" | "-" | "~" | "?";

export interface SpfMechanism {
  /** Mechanism name: all, include, ip4, ip6, a, mx, ptr, exists. */
  type: string;
  qualifier: SpfQualifier;
  /** Argument after the colon (include domain, ip4 CIDR, exists query). Empty for `all`, `a`, `mx`, `ptr`. */
  value: string;
}

export interface SpfParse {
  /** "spf1" when the version tag is valid; null when missing or wrong. */
  version: string | null;
  mechanisms: SpfMechanism[];
  /** Non-mechanism key=value tokens (exp, redirect, reroot, …). */
  modifiers: Record<string, string>;
  /** Qualifier of the `all` mechanism, if present. */
  all: SpfQualifier | null;
  /** Tokens that are neither a known mechanism nor a modifier; likely typos. */
  unknownTokens: string[];
  /** Set when the record has no usable `v=spf1` version tag. */
  error: string | null;
}

/** Mechanism types that require an argument after a colon (`exist` is the pre-RFC alias of `exists`). */
const ARG_MACHINES = new Set(["include", "ip4", "ip6", "exists", "exist"]);
/** Mechanism types with an optional domain argument (RFC 7208 §5). */
const OPTARG_MACHINES = new Set(["a", "mx", "ptr"]);
const BARE_MACHINES = new Set(["all"]);

const MECHANISM_RE = /^([+~?-]?)([a-z][a-z0-9]*)(?::(.+))?$/;
const MODIFIER_RE = /^([a-z][a-z0-9-]*)=(.+)$/i;

export function parseSpf(record: string): SpfParse {
  const out: SpfParse = {
    version: null,
    mechanisms: [],
    modifiers: {},
    all: null,
    unknownTokens: [],
    error: null,
  };
  const tokens = record.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    out.error = "Empty record";
    return out;
  }

  // The version tag must be the first token and must be exactly `v=spf1`.
  const [versionTag, ...rest] = tokens;
  const vMatch = versionTag.match(/^v=([a-z0-9-]+)$/);
  if (!vMatch || vMatch[1] !== "spf1") {
    out.error = `Missing or invalid version tag (expected "v=spf1", found "${versionTag}")`;
    return out;
  }
  out.version = "spf1";

  for (const token of rest) {
    const mech = token.match(MECHANISM_RE);
    if (mech) {
      const qualifier = (mech[1] || "+") as SpfQualifier;
      const type = mech[2];
      const value = mech[3] ?? "";
      const known = ARG_MACHINES.has(type) || OPTARG_MACHINES.has(type) || BARE_MACHINES.has(type);
      const missingRequiredArg = ARG_MACHINES.has(type) && value === "";
      if (!known || missingRequiredArg) {
        out.unknownTokens.push(token);
        continue;
      }
      out.mechanisms.push({ type, qualifier, value });
      if (type === "all") out.all = qualifier;
      continue;
    }
    const mod = token.match(MODIFIER_RE);
    if (mod) {
      out.modifiers[mod[1].toLowerCase()] = mod[2];
      continue;
    }
    out.unknownTokens.push(token);
  }
  return out;
}

/**
 * Count the mechanisms that cause DNS lookups during evaluation (a, mx,
 * include, exist/exists): the RFC 7208 limit is 10 queries per evaluation.
 * Static count only: an `include`'s own record can add more.
 */
export function countSpfLookups(record: string): { staticLookups: number; wouldExceed: boolean } {
  const parsed = parseSpf(record);
  const staticLookups = parsed.mechanisms.filter((m) =>
    ["a", "mx", "include", "exists", "exist"].includes(m.type),
  ).length;
  return { staticLookups, wouldExceed: staticLookups > 10 };
}

const QUALIFIER_WORD: Record<SpfQualifier, string> = {
  "+": "pass",
  "-": "fail",
  "~": "softfail",
  "?": "neutral",
};

/** Plain-English explanation lines for a parsed SPF record. */
export function explainSpf(record: string): string[] {
  const parsed = parseSpf(record);
  if (parsed.error) return [parsed.error];

  const lines: string[] = [];
  for (const m of parsed.mechanisms) {
    const q = QUALIFIER_WORD[m.qualifier];
    switch (m.type) {
      case "all":
        lines.push(
          m.qualifier === "-"
            ? "Everything not matched above is explicitly rejected (−all, the recommended ending)."
            : m.qualifier === "+"
              ? "Everything not matched above is accepted (+all: this is an open relay and should be tightened)."
              : `Everything not matched above is ${q} (~all softfails, ?all is neutral).`,
        );
        break;
      case "include":
        lines.push(`Delegates to the SPF policy of ${m.value} (its lookups count against yours).`);
        break;
      case "ip4":
        lines.push(`Allows the IPv4 address or range ${m.value}.`);
        break;
      case "ip6":
        lines.push(`Allows the IPv6 address or range ${m.value}.`);
        break;
      case "a":
        lines.push(`Allows the address(es) of this domain's own A record${m.value ? ` for ${m.value}` : ""}.`);
        break;
      case "mx":
        lines.push(`Allows this domain's mail exchanger(s)${m.value ? ` for ${m.value}` : ""}.`);
        break;
      case "ptr":
        lines.push("Allows senders whose reverse DNS matches (reverse lookups; discouraged).");
        break;
      case "exists":
      case "exist":
        lines.push(`Allows if the DNS lookup ${m.value} resolves to anything.`);
        break;
    }
  }
  if (parsed.all === null) {
    lines.push('No "all" mechanism: senders not matched above are implicitly neutral (effectively open).');
  }
  for (const [key, value] of Object.entries(parsed.modifiers)) {
    if (key === "exp") lines.push(`Fail-explanation template is hosted at ${value}.`);
    else if (key === "redirect") lines.push(`Evaluation redirects to ${value}'s SPF record.`);
  }
  for (const token of parsed.unknownTokens) {
    lines.push(`Unrecognized token: ${token}`);
  }
  return lines;
}
