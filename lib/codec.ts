/**
 * Base32 (RFC 4648) and hex codecs, pure functions.
 * Base64 lives in utils.ts; these join it in the /hash/ tool's codec panel.
 */

const B32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const B32_INDEX: Record<string, number> = {};
for (let i = 0; i < B32_ALPHABET.length; i++) B32_INDEX[B32_ALPHABET[i]] = i;

/** Base32-encode a UTF-8 string (RFC 4648, uppercase, `=`-padded). */
export function base32Encode(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32_ALPHABET[(value << (5 - bits)) & 31];
  if (out.length % 8 !== 0) out += "=".repeat(8 - (out.length % 8));
  return out;
}

/**
 * Base32-decode a string to UTF-8 text. Case-insensitive; whitespace and
 * trailing `=` padding are ignored. Throws on out-of-alphabet characters or
 * a length that cannot represent a whole number of bytes.
 */
export function base32Decode(encoded: string): string {
  const clean = encoded.toUpperCase().replace(/[\s=]/g, "");
  for (const ch of clean) {
    if (B32_INDEX[ch] === undefined) {
      throw new Error(`Invalid Base32 character: “${ch}”`);
    }
  }
  const rem = clean.length % 8;
  if (rem === 1 || rem === 3 || rem === 6) {
    throw new Error("Invalid Base32 length");
  }
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const ch of clean) {
    value = (value << 5) | B32_INDEX[ch];
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new TextDecoder().decode(Uint8Array.from(bytes));
}

/** Hex-encode a UTF-8 string (lowercase, two digits per byte). */
export function hexEncode(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

/**
 * Hex-decode a string to UTF-8 text. An optional `0x` prefix and whitespace
 * are ignored; the remaining digits must be even-count. Throws on invalid
 * input.
 */
export function hexDecode(hex: string): string {
  const clean = hex.replace(/\s+/g, "");
  const stripped = clean.toLowerCase().startsWith("0x") ? clean.slice(2) : clean;
  if (!/^[0-9a-fA-F]*$/.test(stripped)) {
    throw new Error("Invalid hex: non-hex characters");
  }
  if (stripped.length % 2 !== 0) {
    throw new Error("Invalid hex: odd length");
  }
  const bytes = new Uint8Array(stripped.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(stripped.slice(i * 2, i * 2 + 2), 16);
  }
  return new TextDecoder().decode(bytes);
}
