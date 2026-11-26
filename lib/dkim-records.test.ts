import { describe, expect, it } from "vitest";
import { explainDkim, parseDkimRecord } from "./dkim-records";

/*
 * Fixtures are real SubjectPublicKeyInfo DER encodings (generated with
 * Web Crypto's `exportKey("spki")`: the same call the DKIM generator
 * tool makes), not synthetic byte strings: the bit-size estimate walks
 * the DER structure, so the fixtures have to be structurally valid.
 *
 * Real-world SPKI sizes: 1024-bit → 162–163 bytes, 2048-bit → 295,
 * 3072-bit → 423: the overhead is *not* constant (long-form length
 * fields and the exponent's encoding both vary), which is why the
 * parser reads the modulus length instead of subtracting an offset.
 */
/** 220 chars → 163 bytes, 1024-bit RSA (Web Crypto pads the exponent to 4 bytes). */
const B64_1024 =
  "MIGgMA0GCSqGSIb3DQEBAQUAA4GOADCBigKBgQC8TLoUbxq85Cq9bJ21xNX8TOktNWhX7wauMVaSUPHYJUitioL3+lFw7Wtsa8ELox0eRCbILLbTFiXgOavrxNLNE/4FzHA+qg223nBDmgTKyDbzKa4rAOuC/gZtKcNhVoLkvZSRD7I5UbdM/wOLcvlmgyBdfItAiHrn8iWpQ5FBhQIEAQAAAQ==";
/** 396 chars → 295 bytes, 2048-bit RSA. */
const B64_2048 =
  "MIIBIzANBgkqhkiG9w0BAQEFAAOCARAAMIIBCwKCAQEA+r4+7EBTKe1KUacSsq0MNIi4A8TxDubcMK24gFPALhimeIYmB0VV/AOmyVZd//4gpBfYik5HNYUPx+ASqfNypPFsZB1Q3NOQfdjAtRg6YxsM9oz+N7eMYKLY82Z+rD8p3U4i00cgG+vojWJu59i14BnNPGe6yff6w/koEJuLcqmB5+B7epbXc1nWuJmc9fmXoG9xwKzB/kTCzMzrIH4+oN37rKqVru4e3h5gKAMdKMAZIe5QkYYcS1GB9DcE0mu69wH16Kxospx4UJcV8RgoWJP2sY0CIQnT4nHWlDNnjOgkD406UkSP0Hrr0jtKWjZX8q2QL4JlzTgoX443iJQX+QIEAQAAAQ==";
/** 564 chars → 423 bytes, 3072-bit RSA. */
const B64_3072 =
  "MIIBozANBgkqhkiG9w0BAQEFAAOCAZAAMIIBiwKCAYEAui1e0778jDBOHS3yAqaKIsd829RTv6m2ue7Xc8spF7tiPG4niztzsaq3HB6lQwiOJpV8RMn9v14msFsNoxk+f8u+kRQFkxddroVxKGummBV3fRCvwKvuFLdj8dDWVUPhrSvvqVvlBQbFYQrB4l1G450rpgBi3kbeIsn9W0UmZx4y8na3tpZn26vME1EsnTl4n9fb4ao8kHtNaju8LaB6Rr/yg0447cXNhJgV4Cj7iSW/4SPFdAUSxO4nrVFUVDbcAqCU7pHIsKcIMn33y40Wak2UtTOJ6W/hu5ySbp2OXAPlanxXVEbKdYLH3lf1OyXxrclPA/94TIW2GP4BYPIohLEtmGUEQ6luwM9SGwZDuU1d4PUdml+EJ1z4csrh7xHwhOMJKClqvShlgBHD3C0+6A3KHo/9kFhRiyCtISfF+CwbEX971FIS464S90pM33I6/vuA6TXh76iQsZ207u3V5UTuNlM3ut8/U4vtLiRBKb9MxiwTrFiXHC8EBvTU4GizAgQBAAAB";
/**
 * 216 chars → 162 bytes, 1024-bit RSA: the live public record published
 * for github.com (selector1, via microsoft.onmicrosoft.com), fetched over
 * DNS. OpenSSL-style: minimal 3-byte exponent, one byte shorter than the
 * Web Crypto encoding above. Proves the walk handles real-world variants.
 */
const B64_1024_OPENSSL =
  "MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCxZC/z2cK+2s1f/ktzSDSeFzkfIHrjwtGFsfKMAYvKaXjPVNzKykpbXBkX5nB7dVUTFttda7aROr2iSrIseQ27Ui+4rUZVzgFanE8RaXhYM9n5wPKNv8GtLJk7JgcsYZ7ErgID4uW2sEYyV/dnRYw6rDzOaeRKkKELTUfJI5ebLQIDAQAB";
/** 44-char base64 with "=" padding decoding to 32 bytes (an ed25519 key). */
const B64_ED25519 = "A".repeat(43) + "=";

describe("parseDkimRecord", () => {
  it("parses a 2048-bit RSA key", () => {
    const r = parseDkimRecord(`v=DKIM1; k=rsa; p=${B64_2048}`);
    expect(r.version).toBe("DKIM1");
    expect(r.keyType).toBe("rsa");
    expect(r.publicKey).toBe(B64_2048);
    expect(r.publicKeyBytes).toBe(295);
    expect(r.keyBits).toBe(2048);
    expect(r.error).toBeNull();
  });

  it("detects a 1024-bit RSA key", () => {
    const r = parseDkimRecord(`v=DKIM1; p=${B64_1024}`);
    expect(r.keyType).toBe("rsa");
    expect(r.publicKeyBytes).toBe(163);
    expect(r.keyBits).toBe(1024);
  });

  it("detects a 3072-bit RSA key", () => {
    const r = parseDkimRecord(`v=DKIM1; p=${B64_3072}`);
    expect(r.keyBits).toBe(3072);
  });

  it("parses the live OpenSSL-style 1024-bit record (github.com)", () => {
    const r = parseDkimRecord(`v=DKIM1; p=${B64_1024_OPENSSL}`);
    expect(r.publicKeyBytes).toBe(162);
    expect(r.keyBits).toBe(1024);
  });

  it("returns a null key size for valid base64 that is not SPKI DER", () => {
    const r = parseDkimRecord(`v=DKIM1; p=${"A".repeat(224)}`);
    expect(r.error).toBeNull();
    expect(r.publicKeyBytes).toBe(168);
    expect(r.keyBits).toBeNull();
  });

  it("parses an ed25519 key", () => {
    const r = parseDkimRecord(`v=DKIM1; k=ed25519; p=${B64_ED25519}`);
    expect(r.keyBits).toBe(256);
  });

  it("reports an empty p tag as a revoked key", () => {
    const r = parseDkimRecord("v=DKIM1; p=");
    expect(r.publicKey).toBe("");
    expect(r.publicKeyBytes).toBe(0);
    expect(r.keyBits).toBeNull();
    expect(r.error).toBeNull();
  });

  it("strips whitespace from the p tag (DNS TXT chunking)", () => {
    const r = parseDkimRecord(`v=DKIM1; p=${B64_2048.slice(0, 100)} ${B64_2048.slice(100, 200)}\n${B64_2048.slice(200)}`);
    expect(r.publicKey).toBe(B64_2048);
    expect(r.publicKeyBytes).toBe(295);
    expect(r.keyBits).toBe(2048);
  });

  it("requires the v=DKIM1 version tag first", () => {
    expect(parseDkimRecord("p=abc").error).toMatch(/version tag/);
    expect(parseDkimRecord(`v=DKIM2; p=${B64_2048}`).error).toMatch(/version tag/);
  });

  it("requires a p tag", () => {
    expect(parseDkimRecord("v=DKIM1").error).toMatch(/p tag/);
  });

  it("rejects invalid base64 in p", () => {
    expect(parseDkimRecord("v=DKIM1; p=nope!!").error).toMatch(/not valid base64/);
  });

  it("rejects an invalid k value", () => {
    expect(parseDkimRecord(`v=DKIM1; k=dsa; p=${B64_2048}`).error).toMatch(/Invalid k value/);
  });

  it("captures the n notes tag", () => {
    const r = parseDkimRecord(`v=DKIM1; n=Rotated 2026-01; p=${B64_2048}`);
    expect(r.notes).toBe("Rotated 2026-01");
  });

  it("flags unrecognized tags instead of failing", () => {
    const r = parseDkimRecord(`v=DKIM1; xyz=1; p=${B64_2048}`);
    expect(r.unknownTags).toEqual(["xyz"]);
    expect(r.error).toBeNull();
  });

  it("rejects an empty record", () => {
    expect(parseDkimRecord("   ").error).toBe("Empty record");
  });
});

describe("explainDkim", () => {
  it("states the key size for a healthy record", () => {
    const lines = explainDkim(`v=DKIM1; p=${B64_2048}`);
    expect(lines.some((l) => l.includes("2048-bit"))).toBe(true);
  });

  it("warns about sub-2048-bit RSA keys", () => {
    const lines = explainDkim(`v=DKIM1; p=${B64_1024}`);
    expect(lines.some((l) => l.includes("below the current 2048-bit minimum"))).toBe(true);
  });

  it("reports a revoked key", () => {
    const lines = explainDkim("v=DKIM1; p=");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/revoked/);
  });

  it("includes notes in the explanation", () => {
    const lines = explainDkim(`v=DKIM1; n=Rotated 2026-01; p=${B64_2048}`);
    expect(lines.some((l) => l.includes("Rotated 2026-01"))).toBe(true);
  });

  it("returns the parse error for invalid records", () => {
    const lines = explainDkim("nope");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/version tag/);
  });
});
