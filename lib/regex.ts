/**
 * Regex matching for the /regex/ tool. Pure and framework-free so it can
 * run both in tests and inside the regex Web Worker
 * (components/tools/regex.worker.ts).
 */

export interface MatchInfo {
  index: number;
  text: string;
  /**
   * Numbered capture groups in order. `undefined` means the group did not
   * take part in this match. Positions are preserved so `groups[0]` is
   * always `$1`.
   */
  groups: (string | undefined)[];
  named: Record<string, string | undefined> | null;
}

export interface RegexResult {
  error: string | null;
  matches: MatchInfo[];
  /** True only when more matches exist beyond the cap. */
  truncated: boolean;
}

export const MAX_MATCHES = 1000;

export const EMPTY_RESULT: RegexResult = { error: null, matches: [], truncated: false };

function toInfo(m: RegExpExecArray): MatchInfo {
  return {
    index: m.index,
    text: m[0],
    groups: m.slice(1),
    // Copy into a plain object: `m.groups` has a null prototype, and the
    // result is posted across a worker boundary.
    named: m.groups ? { ...m.groups } : null,
  };
}

/**
 * The index to resume from after a zero-length match at `index`. In
 * unicode mode (`u` or `v` flag) a surrogate pair counts as one character,
 * so step over both halves.
 */
export function advanceIndex(text: string, index: number, unicode: boolean): number {
  if (unicode && index + 1 < text.length) {
    const hi = text.charCodeAt(index);
    const lo = text.charCodeAt(index + 1);
    if (hi >= 0xd800 && hi <= 0xdbff && lo >= 0xdc00 && lo <= 0xdfff) return index + 2;
  }
  return index + 1;
}

/** Run `pattern` with `flags` over `text`. Never throws. */
export function computeMatches(
  pattern: string,
  flags: string,
  text: string,
  max: number = MAX_MATCHES,
): RegexResult {
  if (!pattern || !text) return EMPTY_RESULT;
  let re: RegExp;
  try {
    re = new RegExp(pattern, flags);
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e), matches: [], truncated: false };
  }

  if (!re.global && !re.sticky) {
    const m = re.exec(text);
    return { error: null, matches: m ? [toInfo(m)] : [], truncated: false };
  }

  const unicode = flags.includes("u") || flags.includes("v");
  const matches: MatchInfo[] = [];
  let truncated = false;
  for (;;) {
    const m = re.exec(text);
    if (m === null) break;
    if (matches.length === max) {
      truncated = true; // a (max + 1)th match exists
      break;
    }
    matches.push(toInfo(m));
    if (m[0].length === 0) re.lastIndex = advanceIndex(text, re.lastIndex, unicode);
  }
  return { error: null, matches, truncated };
}
