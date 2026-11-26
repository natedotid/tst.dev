import { describe, expect, it } from "vitest";
import { advanceIndex, computeMatches } from "./regex";

describe("computeMatches", () => {
  it("returns no matches for an empty pattern or text", () => {
    expect(computeMatches("", "g", "abc").matches).toEqual([]);
    expect(computeMatches("a", "g", "").matches).toEqual([]);
  });

  it("reports an invalid pattern as an error", () => {
    const r = computeMatches("(", "g", "abc");
    expect(r.error).not.toBeNull();
    expect(r.matches).toEqual([]);
  });

  it("returns only the first match without g or y", () => {
    const r = computeMatches("a", "", "aaa");
    expect(r.matches.map((m) => m.index)).toEqual([0]);
  });

  it("keeps capture-group positions when a group does not participate", () => {
    const r = computeMatches("(a)?(b)", "g", "b");
    expect(r.matches[0].groups).toEqual([undefined, "b"]);
  });

  it("returns named groups as a plain object", () => {
    const r = computeMatches("(?<word>[a-z]+)", "g", "hi");
    expect(r.matches[0].named).toEqual({ word: "hi" });
  });

  it("terminates on zero-length matches", () => {
    const r = computeMatches("x*", "g", "abc");
    expect(r.matches.map((m) => m.index)).toEqual([0, 1, 2, 3]);
  });

  it("does not split surrogate pairs in unicode mode", () => {
    // "😀" is two UTF-16 code units.
    expect(computeMatches("(?:)", "gu", "😀a").matches.map((m) => m.index)).toEqual([0, 2, 3]);
    expect(computeMatches("(?:)", "g", "😀a").matches.map((m) => m.index)).toEqual([0, 1, 2, 3]);
  });

  it("flags truncation only when more matches exist past the cap", () => {
    expect(computeMatches("a", "g", "aaa", 3).truncated).toBe(false);
    const r = computeMatches("a", "g", "aaa", 2);
    expect(r.matches).toHaveLength(2);
    expect(r.truncated).toBe(true);
  });
});

describe("advanceIndex", () => {
  it("steps by one outside unicode mode or outside a pair", () => {
    expect(advanceIndex("😀", 0, false)).toBe(1);
    expect(advanceIndex("ab", 0, true)).toBe(1);
  });

  it("steps over a whole surrogate pair in unicode mode", () => {
    expect(advanceIndex("😀", 0, true)).toBe(2);
  });
});
