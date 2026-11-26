/**
 * DKIM keypair generation (RFC 6376) for the /email/dkim/ tool.
 *
 * The `p=` value is the base64 of the public key's X.509
 * SubjectPublicKeyInfo DER encoding: the form in RFC 6376's own example
 * and what OpenDKIM and major providers (GitHub, Microsoft, …) publish.
 * Web Crypto's `exportKey("spki")` produces exactly that, no assembly.
 *
 * Pure functions here are tested. The Web Crypto wrapper at the bottom is
 * browser-only and deliberately thin (untested, like the other fetch/crypto
 * wrappers in this codebase).
 *
 * Privacy: the keypair is generated and held only in the browser; the
 * private key is offered as a download and never stored.
 */

export interface DkimRecord {
  /** The DNS name the TXT record is published under. */
  name: string;
  /** The TXT record value, e.g. `v=DKIM1; k=rsa; p=…`. */
  txt: string;
}

const SELECTOR_RE = /^[A-Za-z0-9_-]+$/;

/**
 * Build the DKIM record name + TXT value. Throws on an invalid selector
 * (selectors are DNS name labels; `.` would escape the `_domainkey` zone).
 */
export function formatDkimTxt(selector: string, domain: string, publicBase64: string): DkimRecord {
  const sel = selector.trim();
  const d = domain.trim().toLowerCase().replace(/\.$/, "");
  if (!SELECTOR_RE.test(sel)) {
    throw new Error("Invalid selector: use letters, digits, '-' or '_' only (no dots).");
  }
  if (!d || !d.includes(".")) {
    throw new Error("Invalid domain: a full domain like example.com is required.");
  }
  const p = publicBase64.replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(p)) {
    throw new Error("Invalid public key: expected Base64.");
  }
  return {
    name: `${sel}._domainkey.${d}`,
    txt: `v=DKIM1; k=rsa; p=${p}`,
  };
}

/**
 * Wrap Base64 for a DNS TXT record: character-strings are limited to 255
 * octets, so longer values are split into adjacent quoted strings
 * (zone-file form). Values ≤ 255 chars come back as a single quoted string.
 */
export function base64ChunkForTxt(base64: string, maxChunk = 255): string {
  const body = base64.replace(/\s+/g, "");
  const chunks: string[] = [];
  for (let i = 0; i < body.length; i += maxChunk) chunks.push(body.slice(i, i + maxChunk));
  return chunks.map((c) => `"${c}"`).join("");
}

/* ------------------------- byte-level Base64 helpers ------------------------- */

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

/** Wrap DER bytes as a PEM block with 64-char lines. */
export function pemFromDer(der: ArrayBuffer, label: string): string {
  const b64 = bytesToBase64(new Uint8Array(der));
  const lines: string[] = [];
  for (let i = 0; i < b64.length; i += 64) lines.push(b64.slice(i, i + 64));
  return `-----BEGIN ${label}-----\n${lines.join("\n")}\n-----END ${label}-----\n`;
}

/* ----------------------------- browser-only keygen ----------------------------- */

/**
 * Generate an RSA DKIM keypair. 2048-bit (default) can take ~1–2 s in the
 * browser; 1024-bit is offered only as a legacy/short-lived option.
 */
export async function generateDkimKeyPair(bits: 2048 | 1024): Promise<{ publicBase64: string; privatePem: string }> {
  const { publicKey, privateKey } = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: bits === 2048 ? "SHA-256" : "SHA-1",
      modulusLength: bits,
      publicExponent: new Uint8Array([1, 0, 0, 1]),
    },
    true,
    ["sign", "verify"],
  );
  // `p=` is the base64 of the SubjectPublicKeyInfo DER: exactly what
  // exportKey("spki") returns (RFC 6376's own example, OpenDKIM, GitHub…).
  const spki = await crypto.subtle.exportKey("spki", publicKey);
  const pkcs8 = await crypto.subtle.exportKey("pkcs8", privateKey);
  return {
    publicBase64: bytesToBase64(new Uint8Array(spki)),
    privatePem: pemFromDer(pkcs8, "PRIVATE KEY"),
  };
}
