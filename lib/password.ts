/**
 * Password, passphrase, and token generation, browser-only (uses
 * crypto.getRandomValues), deliberately NOT unit-tested: the randomness
 * comes from the platform CSPRNG and the helpers are thin. The pure
 * logic worth testing (entropy estimation) lives in entropy.ts.
 */

import { EFF_LARGE } from "./wordlist";

const LOWER = "abcdefghijklmnopqrstuvwxyz";
const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const DIGITS = "0123456789";
export const PASSWORD_SYMBOLS = "!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~";

/** Uniform random integer in [0, max) via rejection sampling: modulo
 *  2^32 would skew the low end of the range. */
function randomInt(max: number): number {
  const limit = Math.floor(0x1_0000_0000 / max) * max;
  const buf = new Uint32Array(1);
  let x: number;
  do {
    crypto.getRandomValues(buf);
    x = buf[0];
  } while (x >= limit);
  return x % max;
}

function pick(chars: string): string {
  return chars[randomInt(chars.length)];
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export interface RandomPasswordOptions {
  /** 8–64 characters. */
  length: number;
  lowercase?: boolean;
  uppercase?: boolean;
  digits?: boolean;
  symbols?: boolean;
}

/**
 * Generate a random password. At least one character from each enabled
 * class is guaranteed, then the rest is drawn from the combined pool and
 * the result is shuffled so the guaranteed characters aren't positional.
 */
export function generateRandomPassword(opts: RandomPasswordOptions): string {
  const { length } = opts;
  if (!Number.isInteger(length) || length < 8 || length > 64) {
    throw new Error("length must be an integer between 8 and 64");
  }
  const classes: [string, boolean][] = [
    [LOWER, opts.lowercase ?? true],
    [UPPER, opts.uppercase ?? true],
    [DIGITS, opts.digits ?? true],
    [PASSWORD_SYMBOLS, opts.symbols ?? true],
  ];
  const enabled = classes.filter(([, on]) => on).map(([chars]) => chars);
  if (enabled.length === 0) throw new Error("at least one character class must be enabled");

  const pool = enabled.join("");
  const out = enabled.map(pick); // one guaranteed char per class
  while (out.length < length) out.push(pick(pool));
  return shuffle(out).join("");
}

export interface PassphraseOptions {
  /** 4–8 words. */
  wordCount: number;
  /** Word separator; default a single space. */
  separator?: string;
  /** Word list; default the EFF large wordlist (7,776 words). */
  words?: readonly string[];
}

/** Generate a word-sequence passphrase from the EFF large wordlist. */
export function generatePassphrase(opts: PassphraseOptions): string {
  const { wordCount, separator = " " } = opts;
  const words = opts.words ?? EFF_LARGE;
  if (!Number.isInteger(wordCount) || wordCount < 4 || wordCount > 8) {
    throw new Error("wordCount must be an integer between 4 and 8");
  }
  if (words.length === 0) throw new Error("the word list is empty");
  const out: string[] = [];
  for (let i = 0; i < wordCount; i++) out.push(words[randomInt(words.length)]);
  return out.join(separator);
}

export type TokenEncoding = "hex" | "base64url";

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Generate an API-style token: `bytes` of random data (8–64), encoded
 *  as hex or unpadded base64url. Entropy is exactly bytes × 8 bits. */
export function generateToken(bytes: number, encoding: TokenEncoding = "hex"): string {
  if (!Number.isInteger(bytes) || bytes < 8 || bytes > 64) {
    throw new Error("bytes must be an integer between 8 and 64");
  }
  const data = crypto.getRandomValues(new Uint8Array(bytes));
  if (encoding === "hex") {
    let out = "";
    for (let i = 0; i < data.length; i++) out += data[i].toString(16).padStart(2, "0");
    return out;
  }
  return bytesToBase64Url(data);
}
