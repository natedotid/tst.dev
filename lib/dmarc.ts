/**
 * DMARC record parsing and explanation (RFC 7489).
 * Pure: records are short text, no browser APIs needed.
 */

export type DmarcPolicy = "reject" | "quarantine" | "none";

export interface DmarcParse {
  /** "DMARC1" when the version tag is valid; null when missing or wrong. */
  version: string | null;
  /** The `p` tag (domain policy). null when missing or invalid. */
  policy: DmarcPolicy | null;
  /** The `sp` tag (subdomain policy). null when absent. */
  subdomainPolicy: DmarcPolicy | null;
  /** `pct` as a number; defaults to 100, null when the tag is present but malformed. */
  pct: number | null;
  /** All tags keyed by lowercased tag name, raw values. */
  tags: Record<string, string>;
  /** Tags not in the RFC 7489 registry; likely typos. */
  unknownTags: string[];
  /** Set when the record is missing `v=DMARC1` or a valid `p` tag. */
  error: string | null;
}

const KNOWN_TAGS = new Set([
  "v",
  "p",
  "sp",
  "pct",
  "adkim",
  "aspf",
  "rua",
  "ruf",
  "fo",
  "rf",
  "ri",
  "align",
  "overrides",
  "include",
  "authfail",
  "permfail",
  "policyoverride",
  "knockrdns",
]);
const POLICIES: DmarcPolicy[] = ["reject", "quarantine", "none"];
// `[\s\S]` (not `.`) so values spanning pasted line breaks aren't truncated.
const TAG_RE = /^([A-Za-z][A-Za-z0-9]*)\s*=\s*([\s\S]*)$/;

export function parseDmarc(record: string): DmarcParse {
  const out: DmarcParse = {
    version: null,
    policy: null,
    subdomainPolicy: null,
    pct: 100,
    tags: {},
    unknownTags: [],
    error: null,
  };
  const text = record.trim();
  if (!text) {
    out.error = "Empty record";
    return out;
  }

  // Tags are `;`-separated (values may contain spaces, e.g. multiple rua
  // mailto addresses), so split on the semicolon only.
  const segments = text
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);

  // The version tag must be the first tag and must be exactly `v=DMARC1`.
  const firstMatch = segments[0].match(/^v\s*=\s*([^;]+)$/);
  if (!firstMatch || firstMatch[1].trim() !== "DMARC1") {
    out.error = `Missing or invalid version tag (expected "v=DMARC1", found "${segments[0]}")`;
    return out;
  }
  out.version = "DMARC1";

  for (const segment of segments) {
    const m = segment.match(TAG_RE);
    if (!m) {
      out.unknownTags.push(segment);
      continue;
    }
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    out.tags[key] = value;

    if (key === "p" || key === "sp") {
      const policy = value.toLowerCase();
      if (!POLICIES.includes(policy as DmarcPolicy)) {
        out.error = `Invalid ${key} value "${value}" (expected reject, quarantine, or none)`;
        continue;
      }
      if (key === "p") out.policy = policy as DmarcPolicy;
      else out.subdomainPolicy = policy as DmarcPolicy;
    } else if (key === "pct") {
      out.pct = /^\d{1,3}$/.test(value) && Number(value) <= 100 ? Number(value) : null;
    } else if (key !== "v" && !KNOWN_TAGS.has(key)) {
      out.unknownTags.push(key);
    }
  }

  if (!out.error && !out.policy) {
    out.error = 'Missing required p tag (e.g. "p=reject")';
  }
  return out;
}

const POLICY_TEXT: Record<DmarcPolicy, string> = {
  reject: "Unauthenticated mail claiming this domain should be rejected by receivers.",
  quarantine:
    "Unauthenticated mail claiming this domain should be flagged for spam review (quarantine) by receivers.",
  none: "Monitor-only mode: receivers collect reports but take no action on unauthenticated mail.",
};

/** Plain-English explanation lines for a parsed DMARC record. */
export function explainDmarc(record: string): string[] {
  const parsed = parseDmarc(record);
  if (parsed.error) return [parsed.error];

  const lines: string[] = [];
  lines.push(`Domain policy (p=${parsed.policy}): ${POLICY_TEXT[parsed.policy!]}`);
  if (parsed.subdomainPolicy) {
    lines.push(
      parsed.subdomainPolicy === parsed.policy
        ? `Subdomain policy (sp=${parsed.subdomainPolicy}): subdomains follow the same policy.`
        : `Subdomain policy (sp=${parsed.subdomainPolicy}): subdomains follow a different policy than the apex domain.`,
    );
  }
  if (parsed.pct !== null && parsed.pct !== 100) {
    lines.push(`pct=${parsed.pct}: the policy applies to ${parsed.pct}% of mail, not all of it.`);
  }
  if (parsed.tags.rua) lines.push(`Aggregate reports are delivered to: ${parsed.tags.rua}`);
  if (parsed.tags.ruf) lines.push(`Forensic (failure) reports are delivered to: ${parsed.tags.ruf}`);
  const alignment: Record<string, string> = {
    r: "relaxed alignment (shared registered domain is enough)",
    s: "strict alignment (exact domain match required)",
  };
  if (parsed.tags.adkim && alignment[parsed.tags.adkim]) {
    lines.push(`Authentication alignment (adkim): ${alignment[parsed.tags.adkim]}.`);
  }
  if (parsed.tags.aspf && alignment[parsed.tags.aspf]) {
    lines.push(`SPF alignment (aspf): ${alignment[parsed.tags.aspf]}.`);
  }
  for (const tag of parsed.unknownTags) {
    lines.push(`Unrecognized tag: ${tag}`);
  }
  return lines;
}
