/**
 * Password entropy estimation: pure, no browser APIs needed.
 *
 * The model is deliberately simple and explainable: a class-based pool
 * (26/26/10/33 per present character class) times the length, minus
 * fixed penalties for the patterns that actually get guessed first:
 * repeats, sequences, keyboard walks, and common substrings. It will
 * overrate long word ladders and underrate dictionary words, and that's
 * fine: the readout is a comparison aid for "is this better than that",
 * not a security proof.
 */

export type CharClass = "lowercase" | "uppercase" | "digits" | "symbols";

const LOWER = "abcdefghijklmnopqrstuvwxyz";
const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const DIGITS = "0123456789";
/** Every printable ASCII char that isn't a letter or digit (33, incl. space). */
const SYMBOLS = Array.from({ length: 0x7f - 0x20 }, (_, i) => String.fromCharCode(i + 0x20))
  .filter((ch) => !/[A-Za-z0-9]/.test(ch))
  .join("");

const POOL_SIZE: Record<CharClass, number> = {
  lowercase: LOWER.length,
  uppercase: UPPER.length,
  digits: DIGITS.length,
  symbols: SYMBOLS.length,
};

const CLASS_ORDER: CharClass[] = ["lowercase", "uppercase", "digits", "symbols"];

/** Character classes present in the candidate, in a fixed order. Non-ASCII
 *  characters count as symbols (the pool stays 33, a slight underestimate
 *  for unicode, which the UI doesn't need to be exact about). */
export function charClasses(s: string): CharClass[] {
  let lower = false;
  let upper = false;
  let digit = false;
  let symbol = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (/[a-z]/.test(c)) lower = true;
    else if (/[A-Z]/.test(c)) upper = true;
    else if (/[0-9]/.test(c)) digit = true;
    else symbol = true;
  }
  return CLASS_ORDER.filter((cl) =>
    cl === "lowercase" ? lower : cl === "uppercase" ? upper : cl === "digits" ? digit : symbol,
  );
}

export interface EntropyEstimate {
  /** Estimated entropy in bits, floored at 0 and rounded to one decimal. */
  bits: number;
  /** Character classes present in the candidate. */
  classes: CharClass[];
  /** Why the raw pool×length estimate was discounted (or other concerns). */
  notes: string[];
}

/**
 * Three or more same-class characters stepping by one code point in a
 * single direction (abc, 321). A zigzag like xyx is not a run: it needs
 * two consecutive steps in the same direction to count.
 */
function hasSequentialRun(s: string): boolean {
  const classOf = (c: string) => (/[a-z]/.test(c) ? "l" : /[A-Z]/.test(c) ? "u" : /[0-9]/.test(c) ? "d" : null);
  let steps = 0;
  let dir = 0;
  for (let i = 1; i < s.length; i++) {
    const a = classOf(s[i - 1]);
    const b = classOf(s[i]);
    const d = s.charCodeAt(i) - s.charCodeAt(i - 1);
    const step = a !== null && a === b && (d === 1 || d === -1) ? d : 0;
    steps = step !== 0 && step === dir ? steps + 1 : step !== 0 ? 1 : 0;
    dir = step;
    if (steps >= 2) return true; // 3+ chars moving in one direction
  }
  return false;
}

const KEYBOARD_ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm", "1234567890"];

/** A 4-char window walking adjacent keys on one keyboard row, either
 *  direction (qwer, asdf, 1234, rewq, …). */
function hasKeyboardWalk(s: string): boolean {
  const pos = new Map<string, [row: number, i: number]>();
  KEYBOARD_ROWS.forEach((row, r) => {
    for (let i = 0; i < row.length; i++) if (!pos.has(row[i])) pos.set(row[i], [r, i]);
  });
  const lower = s.toLowerCase();
  for (let w = 0; w + 4 <= lower.length; w++) {
    const seq = [lower[w], lower[w + 1], lower[w + 2], lower[w + 3]].map((c) => pos.get(c));
    if (seq.some((p) => p === undefined)) continue;
    const [p0, p1, p2, p3] = seq as [number, number][];
    if (p0[0] !== p1[0] || p1[0] !== p2[0] || p2[0] !== p3[0]) continue;
    if (Math.abs(p1[1] - p0[1]) === 1 && Math.abs(p2[1] - p1[1]) === 1 && Math.abs(p3[1] - p2[1]) === 1) {
      return true;
    }
  }
  return false;
}

/** Estimate the entropy of a candidate password in bits. */
export function estimateEntropy(candidate: string): EntropyEstimate {
  if (candidate.length === 0) return { bits: 0, classes: [], notes: ["empty"] };

  // A single repeated character ("aaaa") has no entropy at all: the
  // pool×length formula would credit it with some, so short-circuit.
  if (/^(.)\1*$/.test(candidate)) {
    return { bits: 0, classes: charClasses(candidate), notes: ["a single repeated character"] };
  }

  const classes = charClasses(candidate);
  const pool = classes.reduce((sum, c) => sum + POOL_SIZE[c], 0);
  let bits = candidate.length * Math.log2(pool);
  const notes: string[] = [];

  if (/(.)\1{2,}/.test(candidate)) {
    bits -= 10;
    notes.push("repeated characters");
  }
  if (hasSequentialRun(candidate)) {
    bits -= 10;
    notes.push("sequential characters");
  }
  if (hasKeyboardWalk(candidate)) {
    bits -= 15;
    notes.push("keyboard walk");
  }
  if (candidate.toLowerCase().includes("password")) {
    bits -= 40;
    notes.push("contains “password”");
  }
  if (candidate.includes("123456")) {
    bits -= 25;
    notes.push("contains “123456”");
  }
  if (/(19|20)\d{2}$/.test(candidate)) {
    bits -= 5;
    notes.push("ends in a year");
  }
  if (candidate.length < 8) notes.push("under 8 characters");

  return { bits: Math.round(Math.max(0, bits) * 10) / 10, classes, notes };
}

const LOG10_2 = Math.log10(2);
/** ~13.8 billion years. */
const AGE_OF_UNIVERSE_YEARS = 1.38e10;

function fmt(n: number): string {
  if (n < 10) {
    const r = Math.round(n * 10) / 10;
    return Number.isInteger(r) ? String(r) : r.toFixed(1);
  }
  return String(Math.round(n));
}

/**
 * Humanize the time to guess `bits` of entropy by exhaustive search.
 * A correct guess lands after roughly half the keyspace on average; the
 * math is done in log10 space so large bit counts can't overflow.
 *
 * @param guessesPerSecond offline cracking speed; 10 billion/s is a fast
 *   modern GPU rig.
 */
export function crackTime(bits: number, guessesPerSecond = 1e10): string {
  if (bits <= 0) return "instantly";
  const log10Seconds = bits * LOG10_2 - Math.log10(2 * guessesPerSecond);
  const seconds = 10 ** log10Seconds;
  if (seconds < 1) return "a split second";
  const minutes = seconds / 60;
  if (minutes < 1) return `${fmt(seconds)} seconds`;
  const hours = minutes / 60;
  if (hours < 1) return `${fmt(minutes)} minutes`;
  const days = hours / 24;
  if (days < 1) return `${fmt(hours)} hours`;
  const years = days / 365.25;
  if (years < 1) return `${fmt(days)} days`;
  if (years < 1e3) return `${fmt(years)} years`;
  if (years < 1e6) return `${fmt(years / 1e3)} thousand years`;
  if (years < 1e9) return `${fmt(years / 1e6)} million years`;
  if (years < AGE_OF_UNIVERSE_YEARS) return `${fmt(years / 1e9)} billion years`;
  return "longer than the age of the universe";
}

export interface PasswordHint {
  /** The trimmed candidate. */
  candidate: string;
  /** Estimated entropy in bits. */
  bits: number;
  /** Humanized guess time at the default 10 billion guesses/second. */
  guessTime: string;
  /** Penalties that were applied (see {@link estimateEntropy}). */
  notes: string[];
}

/**
 * Omnibox annotation for text that looks like a password: single line,
 * 8–128 chars, at least two character classes. Callers must only invoke
 * this for input no other detector claimed (kind "text"): the "not
 * matched by anything above" rule is the caller's to enforce.
 */
export function passwordHint(input: string): PasswordHint | null {
  const candidate = input.trim();
  if (candidate.length < 8 || candidate.length > 128) return null;
  if (candidate.includes("\n") || candidate.includes("\r")) return null;
  if (charClasses(candidate).length < 2) return null;
  const est = estimateEntropy(candidate);
  return { candidate, bits: est.bits, guessTime: crackTime(est.bits), notes: est.notes };
}

export interface RandomPasswordClasses {
  lowercase: boolean;
  uppercase: boolean;
  digits: boolean;
  symbols: boolean;
}

/** Symbol count of the generator's set (PASSWORD_SYMBOLS in password.ts); a test keeps them in sync. */
export const GENERATOR_SYMBOL_COUNT = 32;

/**
 * Exact entropy of a password from the random generator: each character is
 * drawn uniformly from the enabled classes. Ignores the small reduction
 * from guaranteeing one character per class (well under one bit).
 * Rounded to one decimal.
 */
export function randomPasswordBits(length: number, classes: RandomPasswordClasses): number {
  const pool =
    (classes.lowercase ? 26 : 0) +
    (classes.uppercase ? 26 : 0) +
    (classes.digits ? 10 : 0) +
    (classes.symbols ? GENERATOR_SYMBOL_COUNT : 0);
  if (pool === 0 || length <= 0) return 0;
  return Math.round(length * Math.log2(pool) * 10) / 10;
}
