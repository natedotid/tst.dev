/**
 * Minimal client-side cron parser + next-run calculator.
 * Supports 5-field (min hour dom mon dow) and 6-field (sec min hour dom mon dow)
 * expressions with: * ? numbers, lists (,), ranges (-), steps (/), and
 * JAN-DEC / SUN-SAT names. DOM/DOW follow standard cron OR semantics.
 */

const MONTH_NAMES: Record<string, number> = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6,
  JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
};

const DOW_NAMES: Record<string, number> = {
  SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6,
};

/**
 * Quartz scheduler extensions: L (last), W (nearest weekday), # (nth
 * weekday of the month), e.g. "L", "5L", "15W", "LW", "6#3", "L-3".
 * Month/day names like JUL or WED also contain L/W, so match whole tokens.
 */
const QUARTZ_TOKEN_RE = /^(L|LW|\d+L|\d+W|\d+#\d+|L-\d+)$/i;

export function usesQuartzExtensions(parts: string[]): boolean {
  return parts.some((p) => p.split(",").some((item) => QUARTZ_TOKEN_RE.test(item.split("/")[0])));
}

export type SixFieldFormat = "seconds" | "year";
export type CronFormat = "auto" | SixFieldFormat;

export interface CronFields {
  seconds: Set<number> | null; // null → 5-field expression (no seconds part)
  minutes: Set<number>;
  hours: Set<number>;
  daysOfMonth: Set<number>;
  months: Set<number>;
  daysOfWeek: Set<number>;
  /** Allowed years, or null when the expression has no year field. */
  years: Set<number> | null;
  hasSeconds: boolean;
  /** How a 6-field expression was read; null for 5-field expressions. */
  sixFieldFormat: SixFieldFormat | null;
  domRestricted: boolean;
  dowRestricted: boolean;
}

export type CronParseResult =
  | { ok: true; parts: string[]; fields: CronFields }
  | {
      ok: false;
      error: string;
      /** True when the expression uses Quartz-only syntax (L, W, #) we can describe but not schedule. */
      unsupported?: boolean;
    };

function resolveToken(
  tok: string,
  min: number,
  max: number,
  names?: Record<string, number>,
): number {
  if (names) {
    const upper = tok.toUpperCase();
    if (Object.prototype.hasOwnProperty.call(names, upper)) return names[upper];
  }
  if (!/^\d+$/.test(tok)) throw new Error(`invalid value "${tok}"`);
  const n = Number(tok);
  if (n < min || n > max) throw new Error(`value ${n} out of range ${min}-${max}`);
  return n;
}

function addRange(set: Set<number>, start: number, end: number, step: number): void {
  for (let v = start; v <= end; v += step) set.add(v);
}

function parseField(
  field: string,
  min: number,
  max: number,
  names?: Record<string, number>,
): Set<number> {
  const set = new Set<number>();
  for (const part of field.split(",")) {
    if (!part) throw new Error("empty list item");
    let rangePart = part;
    let step = 1;
    const slash = part.indexOf("/");
    if (slash !== -1) {
      rangePart = part.slice(0, slash);
      const stepStr = part.slice(slash + 1);
      if (!/^\d+$/.test(stepStr)) throw new Error(`invalid step "${stepStr}"`);
      step = Number(stepStr);
      if (step < 1) throw new Error("step must be ≥ 1");
    }

    if (rangePart === "*" || rangePart === "?") {
      addRange(set, min, max, step);
    } else if (rangePart.includes("-")) {
      const pieces = rangePart.split("-");
      if (pieces.length !== 2) throw new Error(`invalid range "${rangePart}"`);
      const [a, b] = pieces;
      const start = resolveToken(a, min, max, names);
      const end = resolveToken(b, min, max, names);
      if (start > end) {
        if (names === DOW_NAMES) {
          // Wrap-around ranges for weekdays, e.g. FRI-MON
          addRange(set, start, max, step);
          addRange(set, min, end, step);
          continue;
        }
        throw new Error(`invalid range "${rangePart}"`);
      }
      addRange(set, start, end, step);
    } else {
      const start = resolveToken(rangePart, min, max, names);
      // "5/15" means starting at 5, every 15 up to max
      addRange(set, start, step > 1 ? max : start, step);
    }
  }
  return set;
}

function buildFields(parts: string[], format: SixFieldFormat | null): CronFields {
  const [sec, min, hour, dom, mon, dow] =
    format === "seconds"
      ? [parts[0], parts[1], parts[2], parts[3], parts[4], parts[5]]
      : ["*", parts[0], parts[1], parts[2], parts[3], parts[4]];
  const year = format === "year" ? parts[5] : null;

  const daysOfWeek = parseField(dow, 0, 7, DOW_NAMES);
  if (daysOfWeek.has(7)) {
    daysOfWeek.delete(7);
    daysOfWeek.add(0);
  }

  // "Restricted" follows the common interpretation (croniter et al.): any
  // field that is not exactly `*`/`?` (including stepped forms like `*/2`)
  // counts as restricted. Classic Vixie cron instead keys off a *leading* `*`,
  // so `0 0 */2 * 1` would run only on Mondays there, but on Mondays OR odd
  // days of the month here.
  return {
    seconds: format === "seconds" ? parseField(sec, 0, 59) : null,
    minutes: parseField(min, 0, 59),
    hours: parseField(hour, 0, 23),
    daysOfMonth: parseField(dom, 1, 31),
    months: parseField(mon, 1, 12, MONTH_NAMES),
    daysOfWeek,
    years: year === null ? null : parseField(year, 1970, 2199),
    hasSeconds: format === "seconds",
    sixFieldFormat: format,
    domRestricted: dom !== "*" && dom !== "?",
    dowRestricted: dow !== "*" && dow !== "?",
  };
}

export function parseCron(expression: string, format: CronFormat = "auto"): CronParseResult {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5 && parts.length !== 6) {
    return { ok: false, error: `expected 5 or 6 fields, got ${parts.length}` };
  }
  if (usesQuartzExtensions(parts)) {
    return {
      ok: false,
      unsupported: true,
      error: "uses Quartz extensions (L, W or #), which can be described but not scheduled here",
    };
  }

  const attempt = (f: SixFieldFormat | null): CronParseResult => {
    try {
      return { ok: true, parts, fields: buildFields(parts, f) };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "invalid expression" };
    }
  };

  if (parts.length === 5) return attempt(null);
  if (format !== "auto") return attempt(format);
  if (/^\d{4}/.test(parts[5]) || parts[4] === "?") return attempt("year");
  const asSeconds = attempt("seconds");
  if (asSeconds.ok) return asSeconds;
  const asYear = attempt("year");
  return asYear.ok ? asYear : asSeconds;
}

/**
 * The expression in the form cronstrue expects. cronstrue reads 6 fields
 * as seconds-first, so a year-last expression gets a leading "0" seconds
 * field to become cronstrue's 7-field form.
 */
export function toCronstrueExpression(expression: string, format: SixFieldFormat | null): string {
  const trimmed = expression.trim();
  return format === "year" ? `0 ${trimmed}` : trimmed;
}

function dayMatches(f: CronFields, d: Date): boolean {
  const dom = f.daysOfMonth.has(d.getDate());
  const dow = f.daysOfWeek.has(d.getDay());
  // Standard cron: if both DOM and DOW are restricted, match either one.
  if (f.domRestricted && f.dowRestricted) return dom || dow;
  if (f.domRestricted) return dom;
  if (f.dowRestricted) return dow;
  return true;
}

/** Compute the next `count` execution times strictly after `from` (local time). */
export function nextRuns(
  expression: string,
  from: Date,
  count: number,
  format: CronFormat = "auto",
): Date[] {
  const parsed = parseCron(expression, format);
  if (!parsed.ok) return [];
  const f = parsed.fields;
  const sortedSeconds = f.seconds ? [...f.seconds].sort((a, b) => a - b) : null;

  const d = new Date(from.getTime());
  if (f.hasSeconds) {
    d.setMilliseconds(0);
    d.setSeconds(d.getSeconds() + 1); // strictly after `from`
  } else {
    d.setMilliseconds(0);
    d.setSeconds(0);
    d.setMinutes(d.getMinutes() + 1);
  }

  const out: Date[] = [];
  const maxYear = f.years ? Math.max(...f.years) : Infinity;
  let guard = 0;
  while (out.length < count && guard++ < 200_000) {
    if (d.getFullYear() > maxYear) break;
    if (f.years && !f.years.has(d.getFullYear())) {
      d.setTime(new Date(d.getFullYear() + 1, 0, 1, 0, 0, 0).getTime());
      continue;
    }
    if (!f.months.has(d.getMonth() + 1)) {
      d.setTime(new Date(d.getFullYear(), d.getMonth() + 1, 1, 0, 0, 0).getTime());
      continue;
    }
    if (!dayMatches(f, d)) {
      d.setTime(new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 0, 0, 0).getTime());
      continue;
    }
    if (!f.hours.has(d.getHours())) {
      d.setTime(new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours() + 1, 0, 0, 0).getTime());
      continue;
    }
    if (!f.minutes.has(d.getMinutes())) {
      d.setTime(new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes() + 1, 0, 0).getTime());
      continue;
    }
    if (f.hasSeconds && sortedSeconds) {
      // Strictly after: require a second at or beyond the current one. After a
      // match, `d` sits 1 s past it, so this never re-emits the same instant.
      const s = sortedSeconds.find((v) => v >= d.getSeconds());
      if (s === undefined) {
        d.setTime(new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes() + 1, 0, 0).getTime());
        continue;
      }
      d.setSeconds(s);
    }
    out.push(new Date(d.getTime()));
    d.setTime(d.getTime() + (f.hasSeconds ? 1000 : 60_000));
  }
  return out;
}
