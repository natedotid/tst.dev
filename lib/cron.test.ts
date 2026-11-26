import { describe, expect, it } from "vitest";
import { nextRuns, parseCron, toCronstrueExpression } from "./cron";

/** Local wall-clock components of a Date, for timezone-independent assertions. */
function wall(d: Date) {
  return {
    y: d.getFullYear(),
    mo: d.getMonth() + 1,
    d: d.getDate(),
    h: d.getHours(),
    mi: d.getMinutes(),
    s: d.getSeconds(),
  };
}

describe("parseCron", () => {
  it("rejects the wrong field count", () => {
    expect(parseCron("* * * *").ok).toBe(false);
    expect(parseCron("* * * * * * *").ok).toBe(false);
  });

  it("rejects out-of-range values", () => {
    expect(parseCron("60 * * * *").ok).toBe(false);
    expect(parseCron("0 24 * * *").ok).toBe(false);
    expect(parseCron("0 0 0 * *").ok).toBe(false);
    expect(parseCron("0 0 * 13 *").ok).toBe(false);
  });

  it("rejects invalid steps and list items", () => {
    expect(parseCron("*/0 * * * *").ok).toBe(false);
    expect(parseCron("*/x * * * *").ok).toBe(false);
    expect(parseCron(",5 * * * *").ok).toBe(false);
    expect(parseCron("1-2-3 * * * *").ok).toBe(false);
  });

  it("accepts ? and names in both 5- and 6-field forms", () => {
    const p = parseCron("0 0 ? * MON-FRI");
    expect(p.ok).toBe(true);
    if (p.ok) expect([...p.fields.daysOfWeek].sort()).toEqual([1, 2, 3, 4, 5]);

    const six = parseCron("5 0 0 * JAN *");
    expect(six.ok).toBe(true);
    if (six.ok) {
      expect(six.fields.hasSeconds).toBe(true);
      expect([...six.fields.months]).toEqual([1]);
    }
  });

  it("normalizes day-of-week 7 to 0 (Sunday)", () => {
    const p = parseCron("0 0 * * 7");
    expect(p.ok).toBe(true);
    if (p.ok) {
      expect(p.fields.daysOfWeek.has(0)).toBe(true);
      expect(p.fields.daysOfWeek.has(7)).toBe(false);
    }
  });

  it("supports step-from-value (5/15)", () => {
    const p = parseCron("5/15 * * * *");
    expect(p.ok).toBe(true);
    if (p.ok) expect([...p.fields.minutes].sort((a, b) => a - b)).toEqual([5, 20, 35, 50]);
  });

  it("supports DOW wrap-around ranges (FRI-MON)", () => {
    const p = parseCron("0 9 * * FRI-MON");
    expect(p.ok).toBe(true);
    if (p.ok) expect([...p.fields.daysOfWeek].sort((a, b) => a - b)).toEqual([0, 1, 5, 6]);
  });

  it("treats anything but bare */? as restricted (documented Vixie deviation)", () => {
    const p = parseCron("0 0 */2 * 1");
    expect(p.ok).toBe(true);
    if (p.ok) {
      expect(p.fields.domRestricted).toBe(true);
      expect(p.fields.dowRestricted).toBe(true);
    }
  });
});

describe("nextRuns (5-field)", () => {
  it("finds the next */15 boundary", () => {
    const runs = nextRuns("*/15 * * * *", new Date(2026, 8, 15, 10, 7, 0), 3);
    expect(runs.map(wall)).toEqual([
      { y: 2026, mo: 9, d: 15, h: 10, mi: 15, s: 0 },
      { y: 2026, mo: 9, d: 15, h: 10, mi: 30, s: 0 },
      { y: 2026, mo: 9, d: 15, h: 10, mi: 45, s: 0 },
    ]);
  });

  it("is strictly after `from` when `from` is itself a match", () => {
    const runs = nextRuns("* * * * *", new Date(2026, 8, 15, 10, 7, 0), 2);
    expect(runs.map((r) => r.getMinutes())).toEqual([8, 9]);
  });

  it("applies DOM/DOW OR semantics when both are restricted", () => {
    // February 2026: the 13th is a Friday; also Fridays 6, 20, 27.
    const days = nextRuns("0 0 13 * 5", new Date(2026, 1, 1), 4).map((d) => d.getDate());
    expect(days).toEqual([6, 13, 20, 27]);
  });

  it("only matches months with 31 days for the 31st", () => {
    const months = nextRuns("0 0 31 * *", new Date(2026, 0, 1), 5).map((d) => d.getMonth() + 1);
    expect(months).toEqual([1, 3, 5, 7, 8]);
  });

  it("finds leap days", () => {
    const years = nextRuns("0 0 29 2 *", new Date(2026, 0, 1), 2).map((d) => d.getFullYear());
    expect(years).toEqual([2028, 2032]);
  });

  it("returns [] for impossible schedules (Feb 30)", () => {
    expect(nextRuns("0 0 30 2 *", new Date(2026, 0, 1), 5)).toEqual([]);
  });

  it("returns [] for unparseable expressions", () => {
    expect(nextRuns("not a cron", new Date(), 5)).toEqual([]);
  });
});

describe("nextRuns (6-field, seconds)", () => {
  it("does not repeat the same instant (regression)", () => {
    const runs = nextRuns("0 0 * * * *", new Date(2026, 8, 15, 10, 0, 30), 3);
    const times = runs.map((d) => d.toTimeString());
    expect(new Set(times).size).toBe(3);
    expect(runs.map((d) => d.getHours())).toEqual([11, 12, 13]);
  });

  it("advances minute-by-minute for second 30", () => {
    const runs = nextRuns("30 * * * * *", new Date(2026, 8, 15, 10, 0, 0), 3);
    expect(runs.map((d) => [d.getMinutes(), d.getSeconds()])).toEqual([
      [0, 30],
      [1, 30],
      [2, 30],
    ]);
  });

  it("is strictly after `from` at the second boundary", () => {
    // from is exactly 10:00:30 → the 10:00:30 run must not be returned.
    const runs = nextRuns("30 * * * * *", new Date(2026, 8, 15, 10, 0, 30), 2);
    expect(runs.map((d) => [d.getMinutes(), d.getSeconds()])).toEqual([
      [1, 30],
      [2, 30],
    ]);
  });

  it("handles multiple seconds per minute", () => {
    const runs = nextRuns("0,30 * * * * *", new Date(2026, 8, 15, 10, 0, 45), 4);
    expect(runs.map((d) => [d.getMinutes(), d.getSeconds()])).toEqual([
      [1, 0],
      [1, 30],
      [2, 0],
      [2, 30],
    ]);
  });
});

describe("Quartz extensions", () => {
  it("reports L, W and # as unsupported, not invalid", () => {
    for (const expr of ["0 0 L * ?", "0 0 15W * ?", "0 0 ? * 6#3", "0 0 5L * ?", "0 0 LW * ?", "0 0 L-3 * ?"]) {
      const r = parseCron(expr);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.unsupported).toBe(true);
    }
  });

  it("does not mistake month or day names for extensions", () => {
    expect(parseCron("0 0 1 JUL *").ok).toBe(true);
    expect(parseCron("0 0 * * WED").ok).toBe(true);
  });

  it("returns no next runs for unsupported expressions", () => {
    expect(nextRuns("0 0 L * ?", new Date(2026, 0, 1), 3)).toEqual([]);
  });
});

describe("6-field format detection", () => {
  it("keeps seconds-first for existing forms", () => {
    const a = parseCron("0 0 * * * *");
    expect(a.ok && a.fields.sixFieldFormat).toBe("seconds");
    const b = parseCron("5 0 0 * JAN *");
    expect(b.ok && b.fields.sixFieldFormat).toBe("seconds");
  });

  it("reads AWS EventBridge expressions as year-last", () => {
    const a = parseCron("0 12 * * ? *");
    expect(a.ok && a.fields.sixFieldFormat).toBe("year");
    const b = parseCron("0 18 ? * MON-FRI *");
    expect(b.ok && b.fields.sixFieldFormat).toBe("year");
    const c = parseCron("0 10 * * ? 2027");
    expect(c.ok && c.fields.sixFieldFormat).toBe("year");
  });

  it("honors an explicit format", () => {
    const r = parseCron("0 12 * * ? *", "seconds");
    expect(r.ok && r.fields.sixFieldFormat).toBe("seconds");
  });

  it("computes AWS next runs at 12:00 daily", () => {
    const runs = nextRuns("0 12 * * ? *", new Date(2026, 10, 1, 0, 0, 0), 2);
    expect(runs.map((d) => [d.getDate(), d.getHours(), d.getMinutes()])).toEqual([
      [1, 12, 0],
      [2, 12, 0],
    ]);
  });

  it("respects the year field", () => {
    const runs = nextRuns("0 0 1 1 ? 2028", new Date(2026, 0, 15), 3);
    expect(runs).toHaveLength(1);
    expect(runs[0].getFullYear()).toBe(2028);
  });

  it("builds cronstrue input", () => {
    expect(toCronstrueExpression("0 12 * * ? *", "year")).toBe("0 0 12 * * ? *");
    expect(toCronstrueExpression("*/5 * * * *", null)).toBe("*/5 * * * *");
  });
});
