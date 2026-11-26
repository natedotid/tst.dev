/**
 * DKIM public key record (RFC 6376) parsing and explanation.
 * Pure: records are short text, no browser APIs needed.
 */

export type DkimKeyType = "rsa" | "ed25519" | "ecdsa";

export interface DkimParse {
  /** "DKIM1" when the version tag is valid; null when missing or wrong. */
  version: string | null;
  /** Key type; defaults to "rsa" when the k tag is absent. */
  keyType: DkimKeyType;
  /** The p tag value with all whitespace removed (DNS wraps long TXT strings). */
  publicKey: string;
  /** Length of the base64-decoded key material in bytes; 0 when revoked/empty. */
  publicKeyBytes: number;
  /** Estimated key size in bits (null when it can't be determined). */
  keyBits: number | null;
  /** The n tag (human-readable notes), if present. */
  notes: string | null;
  /** All tags keyed by lowercased tag name, raw values. */
  tags: Record<string, string>;
  /** Tags not in the RFC 6376 registry; likely typos. */
  unknownTags: string[];
  /** Set when the record is missing `v=DKIM1`, or `p` is not valid base64. */
  error: string | null;
}

const KNOWN_TAGS = new Set(["v", "k", "p", "n", "s", "t", "ttl", "h"]);
const KEY_TYPES: DkimKeyType[] = ["rsa", "ed25519", "ecdsa"];
// `[\s\S]` (not `.`) so values spanning pasted line breaks aren't truncated.
const TAG_RE = /^([A-Za-z][A-Za-z0-9]*)\s*=\s*([\s\S]*)$/;

/**
 * Read the RSA modulus length in bits from SubjectPublicKeyInfo DER.
 * SPKI layout: SEQUENCE { AlgorithmIdentifier, BIT STRING { 0x00,
 * SEQUENCE { INTEGER n, INTEGER e } } }. The overhead is *not* constant
 * (long-form length fields kick in at different sizes: a 1024-bit key is
 * 162 bytes, a 2048-bit one 295), so walk the structure instead of
 * subtracting a fixed offset. Returns null if the bytes aren't that shape.
 */
function rsaKeyBits(der: Uint8Array): number | null {
  // Read the length field of a TLV whose tag sits at `off`; returns the
  // content length and the offset just past the length field.
  const readLen = (off: number): { len: number; next: number } | null => {
    if (off + 1 >= der.length) return null;
    const b = der[off + 1];
    if (b < 0x80) return { len: b, next: off + 2 };
    const n = b & 0x7f;
    if (n === 0 || n > 4 || off + 2 + n > der.length) return null;
    let len = 0;
    for (let k = 0; k < n; k++) len = len * 256 + der[off + 2 + k];
    return { len, next: off + 2 + n };
  };

  let i = 0;
  if (der[i] !== 0x30) return null; // outer SEQUENCE
  const outer = readLen(i);
  if (!outer) return null;
  i = outer.next;
  if (der[i] !== 0x30) return null; // AlgorithmIdentifier
  const alg = readLen(i);
  if (!alg) return null;
  i = alg.next + alg.len;
  if (der[i] !== 0x03) return null; // BIT STRING
  const bit = readLen(i);
  if (!bit) return null;
  i = bit.next;
  if (der[i] !== 0x00) return null; // unused-bits octet
  i += 1;
  if (der[i] !== 0x30) return null; // RSAPublicKey SEQUENCE
  const inner = readLen(i);
  if (!inner) return null;
  i = inner.next;
  if (der[i] !== 0x02) return null; // INTEGER n
  const n = readLen(i);
  if (!n) return null;
  // The modulus's top bit is set, so valid DER carries a leading 0x00 pad.
  const modLen = der[n.next] === 0x00 ? n.len - 1 : n.len;
  return modLen * 8;
}

/** Estimate the key size in bits from the decoded key material. */
function estimateKeyBits(keyType: DkimKeyType, der: Uint8Array): number | null {
  if (der.length === 0) return null;
  if (keyType === "rsa") return rsaKeyBits(der);
  if (keyType === "ed25519") return der.length === 32 ? 256 : null;
  if (keyType === "ecdsa") {
    return { 91: 256, 106: 384, 152: 521 }[der.length] ?? null;
  }
  return null;
}

export function parseDkimRecord(record: string): DkimParse {
  const out: DkimParse = {
    version: null,
    keyType: "rsa",
    publicKey: "",
    publicKeyBytes: 0,
    keyBits: null,
    notes: null,
    tags: {},
    unknownTags: [],
    error: null,
  };
  const text = record.trim();
  if (!text) {
    out.error = "Empty record";
    return out;
  }

  const segments = text
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);

  // The version tag must be the first tag and must be exactly `v=DKIM1`.
  const firstMatch = segments[0].match(/^v\s*=\s*([^;]+)$/);
  if (!firstMatch || firstMatch[1].trim() !== "DKIM1") {
    out.error = `Missing or invalid version tag (expected "v=DKIM1", found "${segments[0]}")`;
    return out;
  }
  out.version = "DKIM1";

  for (const segment of segments) {
    const m = segment.match(TAG_RE);
    if (!m) {
      out.unknownTags.push(segment);
      continue;
    }
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    out.tags[key] = value;

    if (key === "k") {
      const k = value.toLowerCase();
      if (!KEY_TYPES.includes(k as DkimKeyType)) {
        out.error = `Invalid k value "${value}" (expected rsa, ed25519, or ecdsa)`;
        continue;
      }
      out.keyType = k as DkimKeyType;
    } else if (key === "p") {
      // DNS splits TXT records into ≤255-octet strings; the key material may
      // arrive with arbitrary whitespace between fragments.
      const clean = value.replace(/\s+/g, "");
      out.publicKey = clean;
      if (clean === "") {
        out.publicKeyBytes = 0;
      } else if (!/^[A-Za-z0-9+/]+={0,2}$/.test(clean) || clean.length % 4 !== 0) {
        out.error = "The p tag is not valid base64";
      } else {
        // atob can't throw here: the alphabet and length were just validated.
        const bin = atob(clean);
        const der = new Uint8Array(bin.length);
        for (let j = 0; j < bin.length; j++) der[j] = bin.charCodeAt(j);
        out.publicKeyBytes = der.length;
        out.keyBits = estimateKeyBits(out.keyType, der);
      }
    } else if (key === "n") {
      out.notes = value;
    } else if (key !== "v" && !KNOWN_TAGS.has(key)) {
      out.unknownTags.push(key);
    }
  }

  if (!out.error && !("p" in out.tags)) {
    out.error = "Missing required p tag (the base64 public key)";
  }
  return out;
}

/** Plain-English explanation lines for a parsed DKIM record. */
export function explainDkim(record: string): string[] {
  const parsed = parseDkimRecord(record);
  if (parsed.error) return [parsed.error];

  const lines: string[] = [];
  if (parsed.publicKey === "") {
    lines.push("This key is revoked: the p tag is empty, so mail signed with this selector will fail verification.");
    return lines;
  }
  const size = parsed.keyBits ? `${parsed.keyBits}-bit ` : "";
  lines.push(`Public ${size}${parsed.keyType} key, ${parsed.publicKeyBytes} bytes of key material.`);
  if (parsed.keyType === "rsa" && parsed.keyBits !== null && parsed.keyBits < 2048) {
    lines.push(`${parsed.keyBits}-bit RSA is below the current 2048-bit minimum. Consider rotating to a larger key.`);
  }
  if (parsed.tags.s) lines.push(`Hash algorithms: ${parsed.tags.s}.`);
  if (parsed.tags.ttl) lines.push(`Record TTL hint: ${parsed.tags.ttl} seconds (receivers may ignore this).`);
  if (parsed.notes) lines.push(`Notes: ${parsed.notes}`);
  for (const tag of parsed.unknownTags) {
    lines.push(`Unrecognized tag: ${tag}`);
  }
  return lines;
}
