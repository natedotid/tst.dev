import { describe, expect, it } from "vitest";
import { computeSideBySide, normalizeJson, type SideLine } from "./diff";

const types = (lines: SideLine[]) => lines.map((l) => l.type);
const lineNos = (lines: SideLine[]) => lines.map((l) => l.lineNo);

describe("computeSideBySide", () => {
  it("returns all-same rows for identical inputs", () => {
    const { left, right, addedLines, removedLines } = computeSideBySide("a\nb\nc", "a\nb\nc");
    expect(types(left)).toEqual(["same", "same", "same"]);
    expect(left).toEqual(right);
    expect(addedLines).toBe(0);
    expect(removedLines).toBe(0);
  });

  it("uses real line numbers, not display indexes", () => {
    // b inserts a line at position 2 and another before the last line.
    const { left, right, addedLines, removedLines } = computeSideBySide(
      "1\n2\n3\n4\n5",
      "1\nX\n3\n4\nY\n5",
    );
    expect(types(left)).toEqual(["same", "removed", "same", "same", "gap", "same"]);
    expect(types(right)).toEqual(["same", "added", "same", "same", "added", "same"]);
    expect(lineNos(left)).toEqual([1, 2, 3, 4, null, 5]);
    expect(lineNos(right)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(addedLines).toBe(2);
    expect(removedLines).toBe(1);
  });

  it("emits a gap on the opposite side of a pure insertion", () => {
    const { left, right } = computeSideBySide("a\nb", "a\nX\nb");
    expect(types(left)).toEqual(["same", "gap", "same"]);
    expect(types(right)).toEqual(["same", "added", "same"]);
    expect(right[1].raw).toBe("X");
    expect(right[1].lineNo).toBe(2);
    expect(left[1].lineNo).toBeNull();
  });

  it("emits a gap on the opposite side of a pure deletion", () => {
    const { left, right } = computeSideBySide("a\nX\nb", "a\nb");
    expect(types(left)).toEqual(["same", "removed", "same"]);
    expect(types(right)).toEqual(["same", "gap", "same"]);
    expect(left[1].lineNo).toBe(2);
    expect(right[2].lineNo).toBe(2); // "b" keeps its real number on the right
  });

  it("pairs a modified line and highlights the word-level change on both sides", () => {
    const { left, right } = computeSideBySide("a\nfoo bar\nb", "a\nfoo baz\nb");
    expect(types(left)).toEqual(["same", "removed", "same"]);
    expect(types(right)).toEqual(["same", "added", "same"]);

    const l = left[1].segments;
    const r = right[1].segments;
    expect(l.find((s) => s.changed)?.text).toBe("bar");
    expect(r.find((s) => s.changed)?.text).toBe("baz");
    expect(l.find((s) => s.changed === false)?.text).toBe("foo ");
  });

  it("aligns multiple deletions against gaps", () => {
    const { left, right } = computeSideBySide("a\nX\nY\nb", "a\nb");
    expect(types(left)).toEqual(["same", "removed", "removed", "same"]);
    expect(types(right)).toEqual(["same", "gap", "gap", "same"]);
    expect(lineNos(left)).toEqual([1, 2, 3, 4]);
    expect(lineNos(right)).toEqual([1, null, null, 2]);
  });

  it("handles a trailing newline without a spurious empty final line", () => {
    const { left, right } = computeSideBySide("a\nb\n", "a\nc\n");
    expect(left.map((l) => l.raw)).toEqual(["a", "b"]);
    expect(right.map((l) => l.raw)).toEqual(["a", "c"]);
    expect(left[1].lineNo).toBe(2);
    expect(right[1].lineNo).toBe(2);
  });

  it("handles input with no trailing newline", () => {
    const { left, right } = computeSideBySide("a\nb", "a\nc");
    expect(left.map((l) => l.raw)).toEqual(["a", "b"]);
    expect(right.map((l) => l.raw)).toEqual(["a", "c"]);
  });

  it("handles empty inputs", () => {
    const empty = computeSideBySide("", "");
    expect(empty.left).toEqual([]);
    expect(empty.right).toEqual([]);

    const oneSided = computeSideBySide("", "x\ny");
    // Row counts stay balanced: the empty side is padded with gaps.
    expect(oneSided.left.map((l) => l.type)).toEqual(["gap", "gap"]);
    expect(oneSided.right.map((l) => l.lineNo)).toEqual([1, 2]);
    expect(oneSided.addedLines).toBe(2);
  });

  it("keeps left and right row counts equal", () => {
    const cases: Array<[string, string]> = [
      ["a\nb\nc", "d"],
      ["a\nb\nc", "a\nB\nC\nD"],
      ["x", "x\nx\nx\nx\nx"],
      ["a\nb", "b\na"],
    ];
    for (const [a, b] of cases) {
      const { left, right } = computeSideBySide(a, b);
      expect(left.length, `for ${JSON.stringify([a, b])}`).toBe(right.length);
    }
  });
});

describe("normalizeJson", () => {
  it("canonicalizes formatting", () => {
    const minified = '{"a":1,"b":[1,2]}';
    const pretty = '{\n  "a": 1,\n  "b": [\n    1, 2\n  ]\n}\n';
    expect(normalizeJson(minified)).toBe(normalizeJson(pretty));
  });

  it("returns null for non-JSON and empty input", () => {
    expect(normalizeJson("not json")).toBeNull();
    expect(normalizeJson("{oops")).toBeNull();
    expect(normalizeJson("")).toBeNull();
    expect(normalizeJson("   ")).toBeNull();
  });

  it("accepts any valid JSON document, not just objects", () => {
    expect(normalizeJson("[1, 2]")).toBe("[\n  1,\n  2\n]");
    expect(normalizeJson('"hi"')).toBe('"hi"');
    expect(normalizeJson("42")).toBe("42");
  });
});

describe("JSON mode (canonicalized computeSideBySide)", () => {
  it("hides formatting-only differences", () => {
    const a = '{"a":1,"b":2}';
    const b = '{\n  "a": 1,\n  "b": 2\n}';
    const naive = computeSideBySide(a, b);
    expect(naive.addedLines + naive.removedLines).toBeGreaterThan(0);
    const canonical = computeSideBySide(normalizeJson(a)!, normalizeJson(b)!);
    expect(canonical.addedLines).toBe(0);
    expect(canonical.removedLines).toBe(0);
  });

  it("still detects real value changes", () => {
    const a = '{"a": 1, "b": 2}';
    const b = '{"a": 1, "b": 3}';
    const canonical = computeSideBySide(normalizeJson(a)!, normalizeJson(b)!);
    expect(canonical.addedLines).toBe(1);
    expect(canonical.removedLines).toBe(1);
  });

  it("still detects key reordering", () => {
    const a = '{"a": 1, "b": 2}';
    const b = '{"b": 2, "a": 1}';
    const canonical = computeSideBySide(normalizeJson(a)!, normalizeJson(b)!);
    expect(canonical.addedLines + canonical.removedLines).toBeGreaterThan(0);
  });
});
