import { describe, expect, it } from "vitest";
import { base32Decode, base32Encode, hexDecode, hexEncode } from "./codec";

describe("base32Encode (RFC 4648 §10 test vectors)", () => {
  const vectors: Array<[string, string]> = [
    ["", ""],
    ["f", "MY======"],
    ["fo", "MZXQ===="],
    ["foo", "MZXW6==="],
    ["foob", "MZXW6YQ="],
    ["fooba", "MZXW6YTB"],
    ["foobar", "MZXW6YTBOI======"],
  ];
  it.each(vectors)("%j → %j", (input, expected) => {
    expect(base32Encode(input)).toBe(expected);
  });

  it("encodes UTF-8, not UTF-16", () => {
    // "é" is 0xC3 0xA9 in UTF-8 → base32 YOUQ==== (verified vs Python's b32encode)
    expect(base32Encode("é")).toBe("YOUQ====");
  });

  it("round-trips arbitrary text", () => {
    const samples = ["tst.dev", "héllo wörld → ✓", "line one\nline two", "0123456789 +-*/".repeat(20)];
    for (const s of samples) expect(base32Decode(base32Encode(s))).toBe(s);
  });
});

describe("base32Decode", () => {
  it.each([
    ["MZXW6YTBOI====", "foobar"],
    ["MZXW6YTBOI", "foobar"],
    ["mzxw6ytboi====", "foobar"],
    ["MZXW 6YTB", "fooba"],
  ])("decodes %j", (input, expected) => {
    expect(base32Decode(input)).toBe(expected);
  });

  it("throws on out-of-alphabet characters", () => {
    expect(() => base32Decode("MZXW6YTB8")).toThrow(/character/);
    expect(() => base32Decode("MZXW6YTB0")).toThrow(/character/);
    expect(() => base32Decode("MZXW6YTB/")).toThrow(/character/);
  });

  it("throws on impossible lengths", () => {
    expect(() => base32Decode("MZX")).toThrow(/length/);
    expect(() => base32Decode("MZXW6YTBO")).toThrow(/length/);
  });
});

describe("hexEncode / hexDecode", () => {
  it("encodes ASCII", () => {
    expect(hexEncode("A")).toBe("41");
    expect(hexEncode("AB")).toBe("4142");
    expect(hexEncode("Hello")).toBe("48656c6c6f");
  });

  it("encodes UTF-8 multibyte sequences", () => {
    expect(hexEncode("é")).toBe("c3a9");
  });

  it("decodes", () => {
    expect(hexDecode("48656c6c6f")).toBe("Hello");
    expect(hexDecode("48656C6C6F")).toBe("Hello");
  });

  it("accepts an optional 0x prefix and whitespace", () => {
    expect(hexDecode("0x41")).toBe("A");
    expect(hexDecode("0X41 42")).toBe("AB");
  });

  it("round-trips arbitrary text", () => {
    const samples = ["tst.dev", "héllo wörld → ✓", "0123456789 +-*/".repeat(20)];
    for (const s of samples) expect(hexDecode(hexEncode(s))).toBe(s);
  });

  it("handles the empty string", () => {
    expect(hexEncode("")).toBe("");
    expect(hexDecode("")).toBe("");
  });

  it("throws on invalid input", () => {
    expect(() => hexDecode("414")).toThrow(/odd length/);
    expect(() => hexDecode("41g2")).toThrow(/non-hex/);
    expect(() => hexDecode("0x")).not.toThrow();
  });
});
