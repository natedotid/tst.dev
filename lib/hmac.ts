/**
 * HMAC via Web Crypto, in both hex and Base64. Works in the browser (secure
 * context) and in Node 20+, where `crypto.subtle` is global, so the logic
 * stays in lib/ with co-located tests.
 */

export const HMAC_ALGOS = ["SHA-1", "SHA-256", "SHA-384", "SHA-512"] as const;
export type HmacAlgo = (typeof HMAC_ALGOS)[number];

/** Hex-encode an ArrayBuffer, lowercase, no separators. */
export function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Base64-encode raw bytes (chunked to avoid call-stack overflow on large input). */
function bytesToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

export interface HmacResult {
  hex: string;
  base64: string;
}

/**
 * Compute the keyed MAC of `message` under `key` (both UTF-8) with the given
 * HMAC variant. Throws if the algorithm is unavailable (non-secure context).
 */
export async function computeHmac(algo: HmacAlgo, key: string, message: string): Promise<HmacResult> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error("Web Crypto is unavailable in this context");
  }
  const bytes = new TextEncoder();
  const keyHandle = await subtle.importKey("raw", bytes.encode(key), { name: "HMAC", hash: algo }, false, [
    "sign",
  ]);
  const sig = await subtle.sign("HMAC", keyHandle, bytes.encode(message));
  return { hex: bufferToHex(sig), base64: bytesToBase64(sig) };
}
