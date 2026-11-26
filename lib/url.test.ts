import { describe, expect, it } from "vitest";
import {
  decodeQueryString,
  decodeText,
  decodeUrl,
  encodeQueryString,
  encodeText,
  encodeUrl,
  parseUrl,
  type ParseUrlResult,
} from "./url";

function parts(input: string): Exclude<ParseUrlResult, { error: string }> {
  const result = parseUrl(input);
  if ("error" in result) throw new Error(`expected parse of ${input} to succeed, got: ${result.error}`);
  return result;
}

describe("parseUrl", () => {
  it("parses a full https URL", () => {
    const p = parts("https://example.com:8443/a/b?x=1&y=two#frag");
    expect(p.protocol).toBe("https:");
    expect(p.hostname).toBe("example.com");
    expect(p.port).toBe("8443");
    expect(p.host).toBe("example.com:8443");
    expect(p.pathname).toBe("/a/b");
    expect(p.search).toBe("?x=1&y=two");
    expect(p.hash).toBe("#frag");
    expect(p.params).toEqual([
      { key: "x", value: "1" },
      { key: "y", value: "two" },
    ]);
  });

  it("assumes https when no scheme is given", () => {
    const p = parts("example.com/path?x=1");
    expect(p.protocol).toBe("https:");
    expect(p.hostname).toBe("example.com");
    expect(p.pathname).toBe("/path");
  });

  it("treats host:port input as https", () => {
    expect(parts("localhost:3000/api").host).toBe("localhost:3000");
    expect(parts("127.0.0.1:5000/x").host).toBe("127.0.0.1:5000");
  });

  it("leaves percent-encoding in place (decoding is decodeUrl's job)", () => {
    expect(parts("https://example.com/%C3%A4").pathname).toBe("/%C3%A4");
  });

  it("keeps decoded values for query params, duplicates included", () => {
    const p = parts("https://example.com/?a=%20b&a=c");
    expect(p.params).toEqual([
      { key: "a", value: " b" },
      { key: "a", value: "c" },
    ]);
  });

  it("returns empty params and hash for a bare URL", () => {
    const p = parts("https://example.com");
    expect(p.params).toEqual([]);
    expect(p.search).toBe("");
    expect(p.hash).toBe("");
    expect(p.port).toBe("");
  });

  it("rejects other schemes", () => {
    expect(parseUrl("mailto:dev@example.com")).toEqual({
      error: "Only http and https URLs are supported.",
    });
  });

  it("rejects empty and garbage input", () => {
    expect(parseUrl("   ")).toEqual({ error: "Enter a URL." });
    expect("error" in parseUrl("https://ex.com:badport/")).toBe(true);
  });
});

describe("encodeUrl", () => {
  it("encodes spaces and unicode in each part", () => {
    expect(encodeUrl("https://example.com/a b?x=1 2#f g")).toBe(
      "https://example.com/a%20b?x=1%202#f%20g",
    );
  });

  it("encodes unicode in the path", () => {
    expect(encodeUrl("https://example.com/äö")).toBe("https://example.com/%C3%A4%C3%B6");
  });

  it("does not double-encode already-encoded URLs", () => {
    const encoded = encodeUrl("https://example.com/a b?x=1 2") as string;
    expect(encodeUrl(encoded)).toBe(encoded);
  });

  it("adds https for schemeless input", () => {
    expect(encodeUrl("example.com/a b")).toBe("https://example.com/a%20b");
  });

  it("rejects invalid percent-sequences it cannot normalize", () => {
    expect(encodeUrl("https://example.com/%zz")).toEqual({
      error: "Invalid percent-encoding in the path.",
    });
  });

  it("round-trips with decodeUrl", () => {
    const original = "https://example.com/a b/c?x=1 2&y=ü#f g";
    expect(decodeUrl(encodeUrl(original) as string)).toBe(original);
  });
});

describe("decodeUrl", () => {
  it("decodes each part", () => {
    expect(decodeUrl("https://example.com/a%20b?x=1%202&y=%C3%BC#f%20g")).toBe(
      "https://example.com/a b?x=1 2&y=ü#f g",
    );
  });

  it("is idempotent on already-decoded URLs", () => {
    const decoded = decodeUrl("https://example.com/a%20b?x=1%202");
    expect(decodeUrl(decoded as string)).toBe(decoded);
  });

  it("reports invalid percent-encoding with a part", () => {
    expect(decodeUrl("https://example.com/%zz")).toEqual({
      error: "Invalid percent-encoding in the path.",
    });
    expect(decodeUrl("https://example.com/?a=%zz")).toEqual({
      error: "Invalid percent-encoding in the query string.",
    });
    expect(decodeUrl("https://example.com/#%zz")).toEqual({
      error: "Invalid percent-encoding in the fragment.",
    });
  });

  it("keeps key-only query pairs as key=", () => {
    expect(decodeUrl("https://example.com/?x")).toBe("https://example.com/?x=");
  });
});

describe("query string scope", () => {
  it("encodes keys and values, preserving & and =", () => {
    expect(encodeQueryString("a=1 2&b=three&flag")).toBe("a=1%202&b=three&flag");
  });

  it("decodes keys and values", () => {
    expect(decodeQueryString("a=1%202&b=%C3%BC")).toBe("a=1 2&b=ü");
  });

  it("handles empty input and malformed sequences", () => {
    expect(encodeQueryString("")).toBe("");
    expect(decodeQueryString("a=%zz")).toEqual({
      error: "Invalid percent-encoding (malformed % sequence).",
    });
  });
});

describe("text scope", () => {
  it("encodes and decodes arbitrary text", () => {
    expect(encodeText("hello world & more")).toBe("hello%20world%20%26%20more");
    expect(decodeText("hello%20world%20%26%20more")).toBe("hello world & more");
  });

  it("rejects malformed sequences on decode", () => {
    expect(decodeText("%zz")).toEqual({ error: "Invalid percent-encoding (malformed % sequence)." });
  });

  it("round-trips", () => {
    const text = "a/b?c=d#e f&g";
    expect(decodeText(encodeText(text))).toBe(text);
  });
});
