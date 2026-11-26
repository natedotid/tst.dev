import { describe, expect, it } from "vitest";
import { base64ChunkForTxt, formatDkimTxt, pemFromDer } from "./dkim-keygen";
import { parseDkimRecord } from "./dkim-records";

/* Fixture: a real 2048-bit RSA SubjectPublicKeyInfo generated with Web
   Crypto's `exportKey("spki")`: the exact encoding `p=` records carry in
   the wild (RFC 6376's own example, OpenDKIM, GitHub's live record).
   396 base64 chars → 295 DER bytes. */
const FIXTURE_P =
  "MIIBIzANBgkqhkiG9w0BAQEFAAOCARAAMIIBCwKCAQEA+r4+7EBTKe1KUacSsq0MNIi4A8TxDubcMK24gFPALhimeIYmB0VV/AOmyVZd//4gpBfYik5HNYUPx+ASqfNypPFsZB1Q3NOQfdjAtRg6YxsM9oz+N7eMYKLY82Z+rD8p3U4i00cgG+vojWJu59i14BnNPGe6yff6w/koEJuLcqmB5+B7epbXc1nWuJmc9fmXoG9xwKzB/kTCzMzrIH4+oN37rKqVru4e3h5gKAMdKMAZIe5QkYYcS1GB9DcE0mu69wH16Kxospx4UJcV8RgoWJP2sY0CIQnT4nHWlDNnjOgkD406UkSP0Hrr0jtKWjZX8q2QL4JlzTgoX443iJQX+QIEAQAAAQ==";

describe("formatDkimTxt", () => {
  it("builds the record name and TXT value", () => {
    expect(formatDkimTxt("default", "Example.com", FIXTURE_P)).toEqual({
      name: "default._domainkey.example.com",
      txt: `v=DKIM1; k=rsa; p=${FIXTURE_P}`,
    });
  });

  it("strips whitespace from the public key and a trailing dot from the domain", () => {
    const { txt, name } = formatDkimTxt("s1", "example.com.", FIXTURE_P.slice(0, 100) + "\n" + FIXTURE_P.slice(100));
    expect(name).toBe("s1._domainkey.example.com");
    expect(txt).toBe(`v=DKIM1; k=rsa; p=${FIXTURE_P}`);
  });

  it("rejects selectors with dots (would escape the _domainkey zone)", () => {
    expect(() => formatDkimTxt("evil.com", "example.com", FIXTURE_P)).toThrow(/Invalid selector/);
  });

  it("rejects domains without a dot", () => {
    expect(() => formatDkimTxt("default", "localhost", FIXTURE_P)).toThrow(/Invalid domain/);
  });

  it("rejects non-Base64 public keys", () => {
    expect(() => formatDkimTxt("default", "example.com", "not base64 !!!")).toThrow(/Invalid public key/);
  });

  it("produces a record the /dns/ parser reads back as a 2048-bit key", () => {
    const { txt } = formatDkimTxt("default", "example.com", FIXTURE_P);
    const parsed = parseDkimRecord(txt);
    expect(parsed.error).toBeNull();
    expect(parsed.keyType).toBe("rsa");
    expect(parsed.publicKeyBytes).toBe(295);
    expect(parsed.keyBits).toBe(2048);
  });
});

describe("base64ChunkForTxt", () => {
  it("wraps a 2048-bit key (396 chars) into two adjacent quoted strings", () => {
    const out = base64ChunkForTxt(FIXTURE_P);
    const unquoted = out.replace(/"/g, "");
    expect(unquoted).toBe(FIXTURE_P);
    const chunks = out.match(/"[^"]*"/g)!;
    expect(chunks).toHaveLength(2);
    expect(chunks[0].length - 2).toBe(255);
    expect(chunks[1].length - 2).toBe(141);
  });

  it("returns a single quoted string for values ≤ 255 chars", () => {
    expect(base64ChunkForTxt("abc")).toBe('"abc"');
    expect(base64ChunkForTxt("A".repeat(255))).toBe(`"${"A".repeat(255)}"`);
  });

  it("splits at the 255 boundary", () => {
    const out = base64ChunkForTxt("A".repeat(256));
    expect(out.replace(/"/g, "")).toBe("A".repeat(256));
    expect(out).toBe(`"${"A".repeat(255)}""A"`);
  });
});

describe("pemFromDer", () => {
  it("wraps DER bytes in a 64-char-lined PEM block", () => {
    const der = new ArrayBuffer(130);
    const bytes = new Uint8Array(der);
    for (let i = 0; i < 130; i++) bytes[i] = i % 256;
    const pem = pemFromDer(der, "PRIVATE KEY");
    const lines = pem.split("\n");
    expect(lines[0]).toBe("-----BEGIN PRIVATE KEY-----");
    expect(lines[lines.length - 2]).toBe("-----END PRIVATE KEY-----");
    const body = lines.slice(1, -2);
    // 130 bytes → 176 base64 chars → 64 + 64 + 48
    expect(body.map((l) => l.length)).toEqual([64, 64, 48]);
    // Round-trip: decode the PEM body back to the original bytes.
    const decoded = Uint8Array.from(atob(body.join("")), (c) => c.charCodeAt(0));
    expect(Array.from(decoded)).toEqual(Array.from(bytes));
  });
});
