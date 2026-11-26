import { afterEach, describe, expect, it } from "vitest";
import {
  clearInputsFor,
  enableAction,
  inputKey,
  readFlag,
  readInput,
  rememberKey,
  writeFlag,
  writeInput,
} from "./remember";

/** Minimal in-memory localStorage stand-in. */
function makeMemoryStorage() {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
    key: (i: number) => [...map.keys()][i] ?? null,
    removeItem: (k: string) => {
      map.delete(k);
    },
    setItem: (k: string, v: string) => {
      map.set(k, String(v));
    },
  };
}

const g = globalThis as { window?: { localStorage: ReturnType<typeof makeMemoryStorage> } };

function installWindow(): ReturnType<typeof makeMemoryStorage> {
  const storage = makeMemoryStorage();
  g.window = { localStorage: storage };
  return storage;
}

afterEach(() => {
  delete g.window;
});

describe("key namespacing", () => {
  it("scopes flags and inputs per tool and field", () => {
    expect(rememberKey("jwt")).toBe("tst.dev/remember/jwt");
    expect(inputKey("jwt", "token")).toBe("tst.dev/input/jwt:token");
    expect(inputKey("regex", "pattern")).toBe("tst.dev/input/regex:pattern");
  });
});

describe("opt-in flag", () => {
  it("defaults to off", () => {
    installWindow();
    expect(readFlag("jwt")).toBe(false);
  });

  it("turns on and off", () => {
    const s = installWindow();
    writeFlag("jwt", true);
    expect(readFlag("jwt")).toBe(true);
    expect(s.getItem(rememberKey("jwt"))).toBe("1");
    writeFlag("jwt", false);
    expect(readFlag("jwt")).toBe(false);
    expect(s.getItem(rememberKey("jwt"))).toBeNull();
  });

  it("turning off deletes the tool's saved inputs, not other tools'", () => {
    const s = installWindow();
    writeFlag("jwt", true);
    writeFlag("cron", true);
    writeInput("jwt", "token", "abc");
    writeInput("cron", "expression", "*/5 * * * *");
    writeFlag("jwt", false);
    expect(readInput("jwt", "token")).toBeNull();
    expect(readInput("cron", "expression")).toBe("*/5 * * * *");
    // The cron opt-in flag is untouched.
    expect(readFlag("cron")).toBe(true);
    // Storage holds only the cron entries now.
    const keys = [0, 1, 2].map((i) => s.key(i)).filter((k): k is string => k !== null);
    expect(keys).toHaveLength(2);
    expect(keys.every((k) => k.startsWith("tst.dev/") && k.includes("cron"))).toBe(true);
  });
});

describe("remembered fields", () => {
  it("round-trips a value", () => {
    installWindow();
    expect(readInput("json", "input")).toBeNull();
    writeInput("json", "input", '{"a":1}');
    expect(readInput("json", "input")).toBe('{"a":1}');
  });

  it("an empty value deletes the entry", () => {
    installWindow();
    writeInput("epoch", "input", "1700000000");
    writeInput("epoch", "input", "");
    expect(readInput("epoch", "input")).toBeNull();
  });
});

describe("clearInputsFor", () => {
  it("removes only the tool's inputs", () => {
    const s = installWindow();
    writeInput("regex", "pattern", "abc");
    writeInput("regex", "test", "hello");
    writeInput("diff", "original", "x");
    clearInputsFor("regex");
    expect(readInput("regex", "pattern")).toBeNull();
    expect(readInput("regex", "test")).toBeNull();
    expect(readInput("diff", "original")).toBe("x");
    const keys = [0, 1, 2, 3].map((i) => s.key(i)).filter((k): k is string => k !== null);
    expect(keys).toEqual(["tst.dev/input/diff:original"]);
  });
});

describe("without a window (SSR / unavailable storage)", () => {
  it("readFlag is false and writers are no-ops", () => {
    delete g.window;
    expect(readFlag("jwt")).toBe(false);
    expect(() => writeFlag("jwt", true)).not.toThrow();
    expect(() => writeInput("jwt", "token", "x")).not.toThrow();
    expect(() => clearInputsFor("jwt")).not.toThrow();
    expect(readInput("jwt", "token")).toBeNull();
  });
});

describe("enableAction", () => {
  it("restores a saved value the user hasn't overwritten", () => {
    expect(enableAction("saved", false)).toBe("restore");
  });
  it("persists when the user has edited the field", () => {
    expect(enableAction("saved", true)).toBe("persist");
  });
  it("persists when nothing is saved (e.g. after toggling off and on)", () => {
    expect(enableAction(null, false)).toBe("persist");
    expect(enableAction(null, true)).toBe("persist");
  });
});
