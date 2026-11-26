import { describe, expect, it } from "vitest";
import {
  charClasses,
  crackTime,
  estimateEntropy,
  GENERATOR_SYMBOL_COUNT,
  passwordHint,
  randomPasswordBits,
} from "./entropy";
import { PASSWORD_SYMBOLS } from "./password";

describe("charClasses", () => {
  it("reports present classes in a fixed order", () => {
    expect(charClasses("Abc3!")).toEqual(["lowercase", "uppercase", "digits", "symbols"]);
    expect(charClasses("abc")).toEqual(["lowercase"]);
    expect(charClasses("3!")).toEqual(["digits", "symbols"]);
  });

  it("counts space and non-ASCII as symbols", () => {
    expect(charClasses("a b")).toEqual(["lowercase", "symbols"]);
    expect(charClasses("päss")).toEqual(["lowercase", "symbols"]);
  });
});

describe("estimateEntropy", () => {
  it("gives a single repeated character zero bits", () => {
    const est = estimateEntropy("aaaaaaaaaaaaaaaa");
    expect(est.bits).toBe(0);
    expect(est.notes).toContain("a single repeated character");
  });

  it("computes pool×length for a pattern-free candidate", () => {
    // 11 chars, all four classes → pool 95: 11 × log2(95) = 72.3
    const est = estimateEntropy("Tr0ub4dour&");
    expect(est.bits).toBe(72.3);
    expect(est.classes).toEqual(["lowercase", "uppercase", "digits", "symbols"]);
    expect(est.notes).toEqual([]);
  });

  it("discounts repeated characters (aaa)", () => {
    // 14 chars, pool 26: 14 × log2(26) = 65.8, −10 for the "aaa" run
    const est = estimateEntropy("aaahhhllooooww");
    expect(est.notes).toContain("repeated characters");
    expect(est.bits).toBe(55.8);
  });

  it("discounts sequential runs (abc, 321)", () => {
    const abc = estimateEntropy("abcdef");
    expect(abc.notes).toContain("sequential characters");
    expect(abc.bits).toBe(18.2); // 6 × log2(26) = 28.2, −10
    // Descending digits are sequential too.
    expect(estimateEntropy("x987x").notes).toContain("sequential characters");
  });

  it("does not flag two-step or cross-class steps as sequential", () => {
    expect(estimateEntropy("azc").notes).not.toContain("sequential characters"); // a→z is 25 apart
    expect(estimateEntropy("9a9a9a9a").notes).toEqual([]); // 9→a crosses classes
    expect(estimateEntropy("xyx").notes).not.toContain("sequential characters"); // zigzag, not a run
    // …but a zigzag that contains a real 3-char run is still flagged.
    expect(estimateEntropy("xabcx").notes).toContain("sequential characters");
  });

  it("discounts keyboard walks (qwer, asdf, 1234)", () => {
    const est = estimateEntropy("qwer");
    expect(est.notes).toContain("keyboard walk");
    expect(est.bits).toBe(3.8); // 4 × log2(26) = 18.8, −15
    for (const walk of ["asdf", "zxcv", "4321", "REWQ"]) {
      expect(estimateEntropy(walk).notes).toContain("keyboard walk");
    }
    // Three in a row on a keyboard row is not a 4-gram walk.
    expect(estimateEntropy("qwe").notes).not.toContain("keyboard walk");
  });

  it("discounts common substrings", () => {
    expect(estimateEntropy("mypassword99").notes).toContain("contains “password”");
    // Case-insensitive.
    expect(estimateEntropy("MyPaSsWoRd99").notes).toContain("contains “password”");
    expect(estimateEntropy("x123456y").notes).toContain("contains “123456”");
  });

  it("discounts year suffixes but not embedded years", () => {
    const est = estimateEntropy("S0larpunk!2026");
    expect(est.notes).toContain("ends in a year");
    expect(est.bits).toBe(87); // 14 × log2(95) = 92, −5
    expect(estimateEntropy("S0larpunk2026x").notes).not.toContain("ends in a year");
  });

  it("notes (but does not discount) candidates under 8 characters", () => {
    const est = estimateEntropy("abc123!");
    expect(est.notes).toContain("under 8 characters");
    // 7 × log2(69) = 42.8, −10 for the sequential run (abc and 123 share one note)
    expect(est.bits).toBe(32.8);
  });

  it("floors at zero when penalties exceed the raw estimate", () => {
    expect(estimateEntropy("1234").bits).toBe(0);
    expect(estimateEntropy("password").bits).toBe(0);
  });

  it("applies multiple penalties at once", () => {
    // 15 × log2(95) = 98.5, −10 sequential, −15 keyboard walk, −25 for "123456"
    const est = estimateEntropy("P@ssw0rd!123456");
    expect(est.bits).toBe(48.5);
    expect(est.notes).toEqual(["sequential characters", "keyboard walk", "contains “123456”"]);
  });

  it("keeps a strong random-looking candidate high", () => {
    // 20 × log2(95) = 131.4, no penalties
    expect(estimateEntropy("g7#Kq2$vLm9@xR4nWp1Z").bits).toBe(131.4);
  });

  it("returns zero with an empty note for the empty string", () => {
    expect(estimateEntropy("")).toEqual({ bits: 0, classes: [], notes: ["empty"] });
  });
});

describe("crackTime", () => {
  it("handles the zero and sub-second cases", () => {
    expect(crackTime(0)).toBe("instantly");
    expect(crackTime(30)).toBe("a split second"); // ~0.05s at 10 G guesses/s
  });

  it("walks the unit tiers at 10 G guesses/second", () => {
    expect(crackTime(40)).toBe("55 seconds");
    expect(crackTime(45)).toBe("29 minutes");
    expect(crackTime(50)).toBe("16 hours");
    expect(crackTime(60)).toBe("1.8 years");
    expect(crackTime(65)).toBe("58 years");
    expect(crackTime(70)).toBe("1.9 thousand years");
    expect(crackTime(80)).toBe("1.9 million years");
    expect(crackTime(90)).toBe("2 billion years");
  });

  it("caps at the age of the universe instead of overflowing", () => {
    expect(crackTime(100)).toBe("longer than the age of the universe");
    expect(crackTime(1024)).toBe("longer than the age of the universe");
  });

  it("scales with the guesses-per-second argument", () => {
    expect(crackTime(40, 1e6)).toBe("6.4 days"); // 10000× slower than 1e10
    expect(crackTime(33, 1e6)).toBe("1.2 hours");
  });
});

describe("passwordHint", () => {
  it("flags a plausible single-line password candidate", () => {
    const hint = passwordHint("Tr0ub4dour&");
    expect(hint).not.toBeNull();
    expect(hint?.candidate).toBe("Tr0ub4dour&");
    expect(hint?.bits).toBe(72.3);
    expect(hint?.guessTime).toBe("9.2 thousand years");
  });

  it("trims the candidate", () => {
    expect(passwordHint("  Tr0ub4dour&  ")?.candidate).toBe("Tr0ub4dour&");
  });

  it("rejects out-of-range lengths (8–128)", () => {
    expect(passwordHint("short7!")).toBeNull();
    expect(passwordHint("a1!B".repeat(33))).toBeNull(); // 132 chars
  });

  it("rejects multi-line input", () => {
    expect(passwordHint("multi\nline1!")).toBeNull();
  });

  it("requires at least two character classes", () => {
    expect(passwordHint("justlowercasechars")).toBeNull();
    expect(passwordHint("12345678")).toBeNull();
  });
});

describe("randomPasswordBits", () => {
  it("matches the generator's symbol set size", () => {
    expect(PASSWORD_SYMBOLS.length).toBe(GENERATOR_SYMBOL_COUNT);
  });

  it("computes length × log2(pool)", () => {
    const all = { lowercase: true, uppercase: true, digits: true, symbols: true };
    expect(randomPasswordBits(20, all)).toBe(131.1); // 20 × log2(94)
    expect(randomPasswordBits(16, { lowercase: true, uppercase: false, digits: false, symbols: false })).toBe(75.2);
  });

  it("returns 0 for an empty pool", () => {
    expect(randomPasswordBits(16, { lowercase: false, uppercase: false, digits: false, symbols: false })).toBe(0);
  });
});
