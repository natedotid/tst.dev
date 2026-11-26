import { describe, expect, it } from "vitest";
import { parseJsonl, toJsonl } from "./jsonl";

describe("parseJsonl", () => {
  it("parses valid lines", () => {
    const r = parseJsonl('{"id":1,"name":"a"}\n{"id":2}\n[1,2,3]');
    expect(r.lines).toHaveLength(3);
    expect(r.okCount).toBe(3);
    expect(r.errorCount).toBe(0);
    expect(r.objectCount).toBe(2);
    expect(r.values).toEqual([{ id: 1, name: "a" }, { id: 2 }, [1, 2, 3]]);
  });

  it("reports per-line errors without throwing", () => {
    const r = parseJsonl('{"id":1}\n{bad json}\n{"id":2}');
    expect(r.okCount).toBe(2);
    expect(r.errorCount).toBe(1);
    const bad = r.lines[1];
    expect(bad.ok).toBe(false);
    expect(bad.lineNo).toBe(2);
    expect(bad.error).toBeTruthy();
  });

  it("skips empty lines but keeps original line numbers", () => {
    const r = parseJsonl('\n{"a":1}\n\n  \n{"a":2}\n');
    expect(r.lines).toHaveLength(2);
    expect(r.lines.map((l) => l.lineNo)).toEqual([2, 5]);
    expect(r.okCount).toBe(2);
  });

  it("computes the key union in first-seen order", () => {
    const r = parseJsonl('{"b":1,"a":2}\n{"a":3,"c":4}\n42');
    expect(r.keyUnion).toEqual(["b", "a", "c"]);
  });

  it("ignores array and scalar lines for the key union", () => {
    const r = parseJsonl('[1,2]\n"hi"\n{"x":1}');
    expect(r.keyUnion).toEqual(["x"]);
    expect(r.objectCount).toBe(1);
  });

  it("handles CRLF line endings", () => {
    const r = parseJsonl('{"a":1}\r\n{"a":2}\r\n');
    expect(r.okCount).toBe(2);
  });

  it("returns an empty result for empty input", () => {
    const r = parseJsonl("");
    expect(r.lines).toEqual([]);
    expect(r.okCount).toBe(0);
    expect(r.errorCount).toBe(0);
    expect(r.keyUnion).toEqual([]);
  });

  it("accepts a single valid line", () => {
    const r = parseJsonl('{"only":true}');
    expect(r.okCount).toBe(1);
    expect(r.keyUnion).toEqual(["only"]);
  });
});

describe("toJsonl", () => {
  it("serializes an array to one record per line", () => {
    expect(toJsonl([{ a: 1 }, { b: 2 }])).toBe('{"a":1}\n{"b":2}');
  });

  it("serializes a non-array value as a single line", () => {
    expect(toJsonl({ a: 1 })).toBe('{"a":1}');
    expect(toJsonl(42)).toBe("42");
  });

  it("round-trips through parseJsonl", () => {
    const records = [{ id: 1, tags: ["a"] }, { id: 2, tags: [] }, "scalar", 7];
    const parsed = parseJsonl(toJsonl(records));
    expect(parsed.okCount).toBe(records.length);
    expect(parsed.values).toEqual(records);
  });

  it("throws on top-level non-serializable values", () => {
    expect(() => toJsonl(undefined)).toThrow(/serializable/);
    expect(() => toJsonl(() => 1)).toThrow(/serializable/);
    // Nested functions are dropped by JSON.stringify, standard behavior.
    expect(toJsonl({ fn: () => 1 })).toBe("{}");
  });
});
