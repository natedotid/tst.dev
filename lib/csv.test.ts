import { describe, expect, it } from "vitest";
import { parseCsv, rowsToObjects, objectsToCsv, type CsvParse } from "./csv";

const BOM = String.fromCharCode(0xfeff);

function rows(input: string, delimiter?: Parameters<typeof parseCsv>[1]): string[][] {
  const result: CsvParse = parseCsv(input, delimiter);
  if ("error" in result) throw new Error(`expected parse of ${JSON.stringify(input)} to succeed, got: ${result.error}`);
  return result.rows;
}

describe("parseCsv", () => {
  it("splits simple rows", () => {
    expect(rows("name,age\nAlice,30\nBob,25")).toEqual([
      ["name", "age"],
      ["Alice", "30"],
      ["Bob", "25"],
    ]);
  });

  it("keeps commas inside quoted fields", () => {
    expect(rows('name,note\nAlice,"hello, world"')).toEqual([
      ["name", "note"],
      ["Alice", "hello, world"],
    ]);
  });

  it("keeps newlines inside quoted fields", () => {
    expect(rows('a,b\n"line1\nline2",x')).toEqual([
      ["a", "b"],
      ["line1\nline2", "x"],
    ]);
  });

  it("unescapes doubled quotes", () => {
    expect(rows('a\n"He said ""hi"""')).toEqual([
      ["a"],
      ['He said "hi"'],
    ]);
  });

  it("handles CRLF line endings", () => {
    expect(rows("a,b\r\nc,d\r\n")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("strips a leading BOM", () => {
    expect(rows(`${BOM}a,b\nc,d`)).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("drops blank lines, including trailing ones", () => {
    expect(rows("a,b\n\nc,d\n\n")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("returns no rows for empty or whitespace input", () => {
    expect(parseCsv("")).toEqual({ rows: [] });
    expect(parseCsv("   \n  ")).toEqual({ rows: [] });
  });

  it("keeps empty cells", () => {
    expect(rows("a,,c\n1,2,3")).toEqual([
      ["a", "", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("reports unterminated quotes with the line the quote opened", () => {
    expect(parseCsv('a,b\n"unclosed,field')).toEqual({ error: "Unterminated quoted field", line: 2 });
  });
});

describe("delimiter detection", () => {
  it("defaults to comma", () => {
    expect(rows("a,b\nc,d")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("detects semicolons", () => {
    expect(rows("a;b\nc;d")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("detects tabs", () => {
    expect(rows("a\tb\nc\td")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("detects pipes", () => {
    expect(rows("a|b\nc|d")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("ignores delimiters inside quotes", () => {
    expect(rows('"x,y";a;b')).toEqual([["x,y", "a", "b"]]);
  });

  it("honours an explicit delimiter", () => {
    expect(rows("a;b;c", ";")).toEqual([["a", "b", "c"]]);
  });

  it("falls back to comma when no candidate appears", () => {
    expect(rows("justtext\nmore")).toEqual([["justtext"], ["more"]]);
  });
});

describe("rowsToObjects", () => {
  it("maps rows to objects keyed by the header", () => {
    expect(rowsToObjects(rows("name,age\nAlice,30"), true)).toEqual([{ name: "Alice", age: "30" }]);
  });

  it("fills missing trailing cells with empty strings", () => {
    expect(rowsToObjects(rows("a,b,c\n1,2"), true)).toEqual([{ a: "1", b: "2", c: "" }]);
  });

  it("ignores cells beyond the header", () => {
    expect(rowsToObjects(rows("a,b\n1,2,3"), true)).toEqual([{ a: "1", b: "2" }]);
  });

  it("lets the last column win on duplicate headers", () => {
    expect(rowsToObjects(rows("a,b,a\n1,2,3"), true)).toEqual([{ a: "3", b: "2" }]);
  });

  it("returns an empty array for a header-only input", () => {
    expect(rowsToObjects(rows("a,b"), true)).toEqual([]);
  });

  it("returns rows as arrays when header is off", () => {
    expect(rowsToObjects(rows("a,b\nc,d"), false)).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("returns an empty array for no rows", () => {
    expect(rowsToObjects([], true)).toEqual([]);
  });
});

describe("objectsToCsv", () => {
  it("serializes an array of objects with a header row", () => {
    const { csv } = objectsToCsv([
      { name: "Alice", age: "30" },
      { name: "Bob", age: "25" },
    ]) as { csv: string };
    expect(csv).toBe("name,age\r\nAlice,30\r\nBob,25");
  });

  it("round-trips through parseCsv", () => {
    const data = [
      { a: "1", b: "x" },
      { a: "2", b: "y" },
    ];
    const { csv } = objectsToCsv(data) as { csv: string };
    const parsed = parseCsv(csv);
    expect("error" in parsed ? null : rowsToObjects(parsed.rows, true)).toEqual(data);
  });

  it("quotes fields containing commas, quotes, and newlines", () => {
    const { csv } = objectsToCsv([
      { s: 'say "hi", ok', t: "line1\nline2", u: "plain" },
    ]) as { csv: string };
    expect(csv).toBe('s,t,u\r\n"say ""hi"", ok","line1\nline2",plain');
    const parsed = parseCsv(csv);
    expect("error" in parsed ? null : rowsToObjects(parsed.rows, true)).toEqual([
      { s: 'say "hi", ok', t: "line1\nline2", u: "plain" },
    ]);
  });

  it("quotes headers that need it and escapes quotes in them", () => {
    const { csv } = objectsToCsv([{ 'a,b': "1", 'c"d': "2" }]) as { csv: string };
    expect(csv.split("\r\n")[0]).toBe('"a,b","c""d"');
  });

  it("unions keys in first-seen order and fills missing values with empty strings", () => {
    const { csv } = objectsToCsv([
      { a: "1", b: "2" },
      { c: "3", a: "4" },
      { b: "5" },
    ]) as { csv: string };
    expect(csv).toBe("a,b,c\r\n1,2,\r\n4,,3\r\n,5,");
  });

  it("coerces non-string values and empty keys", () => {
    const { csv } = objectsToCsv([{ n: 0, b: true, x: null, y: undefined }]) as { csv: string };
    expect(csv).toBe("n,b,x,y\r\n0,true,,");
  });

  it("serializes arrays without a header, padding ragged rows", () => {
    const { csv } = objectsToCsv([
      [1, 2, 3],
      [4],
    ]) as { csv: string };
    expect(csv).toBe("1,2,3\r\n4,,");
    const parsed = parseCsv(csv);
    expect("error" in parsed ? null : parsed.rows).toEqual([
      ["1", "2", "3"],
      ["4", "", ""],
    ]);
  });

  it("returns an empty string for an empty array", () => {
    expect(objectsToCsv([])).toEqual({ csv: "" });
  });

  it("writes nested objects and arrays as JSON text", () => {
    expect(objectsToCsv([{ a: 1, b: { c: 2 } }])).toEqual({ csv: 'a,b\r\n1,"{""c"":2}"' });
    expect(objectsToCsv([{ a: [1, 2] }])).toEqual({ csv: 'a\r\n"[1,2]"' });
    expect(objectsToCsv([[1, { x: 1 }]])).toEqual({ csv: '1,"{""x"":1}"' });
  });

  it("rejects non-array and mixed-type input", () => {
    expect(objectsToCsv({ a: 1 })).toEqual({ error: "JSON input must be an array of objects or arrays" });
    expect(objectsToCsv("a,b\n1,2")).toEqual({ error: "JSON input must be an array of objects or arrays" });
    expect(objectsToCsv(42)).toEqual({ error: "JSON input must be an array of objects or arrays" });
    expect(objectsToCsv(null)).toEqual({ error: "JSON input must be an array of objects or arrays" });
    expect(objectsToCsv([1, 2])).toEqual({ error: "JSON input must be an array of objects or arrays" });
    expect(objectsToCsv([{ a: 1 }, "x"])).toEqual({ error: "JSON input must be an array of objects or arrays" });
  });
});
