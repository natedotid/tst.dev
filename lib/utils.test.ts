import { describe, expect, it } from "vitest";
import {
  base64Decode,
  base64Encode,
  base64UrlDecode,
  cn,
  formatLocal,
  formatUtc,
  relativeTime,
} from "./utils";

describe("cn", () => {
  it("joys truthy class names and drops falsy ones", () => {
    expect(cn("a", false, null, undefined, "b")).toBe("a b");
    expect(cn()).toBe("");
  });
});

describe("base64", () => {
  it("round-trips ASCII", () => {
    expect(base64Decode(base64Encode("Hello, world!"))).toBe("Hello, world!");
  });

  it("round-trips multibyte UTF-8", () => {
    const s = "héllo wörld — 日本語 🎉";
    expect(base64Decode(base64Encode(s))).toBe(s);
  });

  it("handles large input without call-stack overflow (chunking)", () => {
    const s = "a".repeat(200_000) + "é";
    expect(base64Decode(base64Encode(s))).toBe(s);
  });

  it("strips whitespace before decoding", () => {
    expect(base64Decode("SGVs\n bG8=\t")).toBe("Hello");
  });

  it("throws on non-base64 input", () => {
    expect(() => base64Decode("not base64!!!")).toThrow();
  });
});

describe("base64UrlDecode", () => {
  it("decodes an unpadded URL-safe segment", () => {
    // btoa("hello") === "aGVsbG8="
    expect(base64UrlDecode("aGVsbG8")).toBe("hello");
  });

  it("maps - and _ back to + and /", () => {
    const b64 = base64Encode("a+/b");
    const urlSafe = b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    expect(base64UrlDecode(urlSafe)).toBe("a+/b");
  });
});

describe("relativeTime", () => {
  const now = Date.parse("2026-09-15T12:00:00Z");
  const ago = (ms: number) => relativeTime(new Date(now - ms), now);
  const ahead = (ms: number) => relativeTime(new Date(now + ms), now);

  it("snapshots under a second", () => {
    expect(ago(0)).toBe("just now");
    expect(ago(500)).toBe("just now");
    expect(ahead(500)).toBe("in a moment");
  });

  it("steps up the unit ladder at boundaries", () => {
    expect(ago(1_000)).toBe("1 second ago");
    expect(ago(59_000)).toBe("59 seconds ago");
    expect(ago(60_000)).toBe("1 minute ago");
    expect(ago(59 * 60_000)).toBe("59 minutes ago");
    expect(ago(3_600_000)).toBe("1 hour ago");
    expect(ago(23 * 3_600_000)).toBe("23 hours ago");
    expect(ago(86_400_000)).toBe("1 day ago");
    expect(ago(29 * 86_400_000)).toBe("29 days ago");
    expect(ago(30 * 86_400_000)).toBe("1 month ago");
    expect(ago(11 * 30 * 86_400_000)).toBe("11 months ago");
    expect(ago(12 * 30 * 86_400_000)).toBe("1 year ago");
  });

  it("pluralizes and handles the future", () => {
    expect(ago(2 * 60_000)).toBe("2 minutes ago");
    expect(ahead(86_400_000)).toBe("in 1 day");
    expect(ahead(2 * 3_600_000)).toBe("in 2 hours");
  });
});

describe("formatUtc", () => {
  it("formats with a UTC suffix", () => {
    expect(formatUtc(new Date("2026-09-15T12:34:56.789Z"))).toBe("2026-09-15 12:34:56 UTC");
  });
});

describe("formatLocal", () => {
  it("renders midnight as 00:00:00 (h23, never 24:00:00)", () => {
    const out = formatLocal(new Date(2026, 8, 16, 0, 0, 0));
    expect(out).toContain("00:00:00");
    expect(out).not.toContain("24:");
  });

  it("uses a 23-hour clock at 11 PM", () => {
    expect(formatLocal(new Date(2026, 8, 15, 23, 59, 59))).toContain("23:59:59");
  });
});
