import { describe, expect, it } from "vitest";
import { STATUS_CODES, STATUS_GROUPS, findStatus, filterStatuses } from "./http-status";

describe("STATUS_CODES", () => {
  it("lists exactly the 64 assigned codes from the IANA registry", () => {
    expect(STATUS_CODES).toHaveLength(64);
  });

  it("has unique, sorted codes", () => {
    const codes = STATUS_CODES.map((s) => s.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect([...codes].sort((a, b) => a - b)).toEqual(codes);
  });

  it("keeps every code in its group's class", () => {
    for (const s of STATUS_CODES) {
      expect(Math.floor(s.code / 100)).toBeGreaterThanOrEqual(1);
      expect(Math.floor(s.code / 100)).toBeLessThanOrEqual(5);
    }
  });

  it("gives every entry a non-empty name, note, and at least one reference", () => {
    for (const s of STATUS_CODES) {
      expect(s.name.length, String(s.code)).toBeGreaterThan(0);
      expect(s.note.length, String(s.code)).toBeGreaterThan(0);
      expect(s.refs.length, String(s.code)).toBeGreaterThan(0);
    }
  });

  it("uses the RFC 9110 names for the renamed 4xx codes", () => {
    expect(findStatus(413)?.name).toBe("Content Too Large");
    expect(findStatus(414)?.name).toBe("URI Too Long");
    expect(findStatus(422)?.name).toBe("Unprocessable Content");
  });

  it("marks 306 and 418 as unused and 510 as obsoleted", () => {
    expect(findStatus(306)?.name).toBe("(Unused)");
    expect(findStatus(418)?.name).toBe("(Unused)");
    expect(findStatus(510)?.name).toBe("Not Extended (OBSOLETED)");
  });
});

describe("findStatus", () => {
  it("finds known codes and misses unknown ones", () => {
    expect(findStatus(404)?.name).toBe("Not Found");
    expect(findStatus(200)?.name).toBe("OK");
    expect(findStatus(999)).toBeUndefined();
    expect(findStatus(309)).toBeUndefined(); // unassigned
  });
});

describe("filterStatuses", () => {
  it("returns everything for an empty query", () => {
    expect(filterStatuses("")).toHaveLength(64);
    expect(filterStatuses("   ")).toHaveLength(64);
  });

  it("matches numeric prefixes", () => {
    expect(filterStatuses("4")).toHaveLength(29);
    expect(filterStatuses("40")).toHaveLength(10);
    expect(filterStatuses("404")).toEqual([findStatus(404)!]);
  });

  it("matches names and notes as case-insensitive substrings", () => {
    expect(filterStatuses("not found").map((s) => s.code)).toEqual([404]);
    expect(filterStatuses("redirect").map((s) => s.code)).toEqual([306, 307, 308]);
    expect(filterStatuses("webdav").map((s) => s.code)).toEqual([207, 208, 423, 424, 507]);
    expect(filterStatuses("gateway")).toEqual(
      expect.arrayContaining([findStatus(502)!, findStatus(504)!]),
    );
  });

  it("returns nothing for a non-matching query", () => {
    expect(filterStatuses("zzzz")).toEqual([]);
  });
});

describe("STATUS_GROUPS", () => {
  it("covers classes 1–5 in order", () => {
    expect(STATUS_GROUPS.map((g) => g.class)).toEqual([1, 2, 3, 4, 5]);
  });
});
