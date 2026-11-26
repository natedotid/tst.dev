import { describe, expect, it } from "vitest";
import { HMAC_ALGOS, bufferToHex, computeHmac } from "./hmac";

const KEY_20B = "\u000b".repeat(20); // RFC 4231: 0x0b repeated 20 times

describe("computeHmac", () => {
  it("matches the RFC 4231 HMAC-SHA-256 vector", async () => {
    const r = await computeHmac("SHA-256", KEY_20B, "Hi There");
    expect(r.hex).toBe("b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7");
  });

  it("matches the RFC 4231 HMAC-SHA-512 vector", async () => {
    const r = await computeHmac("SHA-512", KEY_20B, "Hi There");
    expect(r.hex).toBe(
      "87aa7cdea5ef619d4ff0b4241a1d6cb02379f4e2ce4ec2787ad0b30545e17cdedaa833b7d6b8a702038b274eaea3f4e4be9d914eeb61f1702e696c203a126854",
    );
  });

  it("matches a well-known plain-string vector", async () => {
    const r = await computeHmac("SHA-256", "key", "The quick brown fox jumps over the lazy dog");
    expect(r.hex).toBe("f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8");
  });

  it("emits a Base64 encoding consistent with the hex output", async () => {
    const r = await computeHmac("SHA-256", "key", "hello");
    const bytes = Uint8Array.from(
      Array.from({ length: r.hex.length / 2 }, (_, i) => parseInt(r.hex.slice(i * 2, i * 2 + 2), 16)),
    );
    const bin = String.fromCharCode(...bytes);
    expect(r.base64).toBe(btoa(bin));
  });

  it("produces different MACs for different keys and messages", async () => {
    const a = await computeHmac("SHA-256", "key", "msg");
    const b = await computeHmac("SHA-256", "other", "msg");
    const c = await computeHmac("SHA-256", "key", "different");
    expect(b.hex).not.toBe(a.hex);
    expect(c.hex).not.toBe(a.hex);
  });
});

describe("bufferToHex", () => {
  it("lowercases and zero-pads", () => {
    expect(bufferToHex(new Uint8Array([0, 15, 16, 255]).buffer)).toBe("000f10ff");
  });
});

describe("HMAC_ALGOS", () => {
  it("covers the same digests as the hash panel", () => {
    expect(HMAC_ALGOS).toEqual(["SHA-1", "SHA-256", "SHA-384", "SHA-512"]);
  });
});
