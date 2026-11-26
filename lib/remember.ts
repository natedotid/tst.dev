"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

/**
 * Opt-in "remember input" persistence.
 *
 * The site's default is to store nothing. When a user flips a tool's Remember
 * toggle ON, that tool's inputs are written to localStorage under
 * `tst.dev/input/<tool>:<field>`, and the opt-in itself is stored under
 * `tst.dev/remember/<tool>`. Turning the toggle OFF deletes the tool's saved
 * inputs so nothing lingers behind the choice.
 *
 * The storage core (below the hooks) is pure and exported for testing; the
 * hooks are thin React glue over it.
 */

const REMEMBER_NS = "tst.dev/remember/";
const INPUT_NS = "tst.dev/input/";

/** localStorage namespace for a tool's opt-in flag. */
export function rememberKey(tool: string): string {
  return REMEMBER_NS + tool;
}

/** localStorage namespace for one remembered field of a tool. */
export function inputKey(tool: string, field: string): string {
  return INPUT_NS + tool + ":" + field;
}

function storage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

/** Read a tool's opt-in flag. False when storage is unavailable or unset. */
export function readFlag(tool: string): boolean {
  const s = storage();
  return s !== null && s.getItem(rememberKey(tool)) === "1";
}

/** Write a tool's opt-in flag. Disabling also deletes the tool's saved inputs. */
export function writeFlag(tool: string, on: boolean): void {
  const s = storage();
  if (s) {
    try {
      if (on) s.setItem(rememberKey(tool), "1");
      else s.removeItem(rememberKey(tool));
    } catch {
      /* storage unavailable: the toggle still works for this session */
    }
  }
  if (!on) clearInputsFor(tool);
  emit(tool);
}

/** Read a remembered field, or null when absent. */
export function readInput(tool: string, field: string): string | null {
  const s = storage();
  return s ? s.getItem(inputKey(tool, field)) : null;
}

/** Persist a remembered field; an empty value deletes the entry. */
export function writeInput(tool: string, field: string, value: string): void {
  const s = storage();
  if (!s) return;
  try {
    const key = inputKey(tool, field);
    if (value === "") s.removeItem(key);
    else s.setItem(key, value);
  } catch {
    /* quota or unavailable storage: skip the write */
  }
}

/** Delete every saved input for a tool (leaves other tools untouched). */
export function clearInputsFor(tool: string): void {
  const s = storage();
  if (!s) return;
  const prefix = INPUT_NS + tool + ":";
  try {
    const keys: string[] = [];
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i);
      if (k && k.startsWith(prefix)) keys.push(k);
    }
    keys.forEach((k) => s.removeItem(k));
  } catch {
    /* ignore */
  }
}

/* ------------------------------ flag subscribers --------------------------- */

type Listener = () => void;
const listeners = new Map<string, Set<Listener>>();

function emit(tool: string): void {
  listeners.get(tool)?.forEach((l) => l());
}

function subscribeFlag(tool: string, l: Listener): () => void {
  let set = listeners.get(tool);
  if (!set) {
    set = new Set();
    listeners.set(tool, set);
  }
  set.add(l);
  return () => {
    set?.delete(l);
  };
}

const serverFlagSnapshot = () => false;

/**
 * Subscribe to a tool's Remember opt-in. The server snapshot is always false,
 * so SSR and hydration agree; the client snapshot reads storage and takes over
 * right after hydration. Also returns a `toggle` to flip the flag.
 */
export function useRemembered(tool: string): { enabled: boolean; toggle: () => void } {
  const subscribe = useCallback((cb: () => void) => subscribeFlag(tool, cb), [tool]);
  const getSnapshot = useCallback(() => readFlag(tool), [tool]);
  const enabled = useSyncExternalStore(subscribe, getSnapshot, serverFlagSnapshot);

  const toggle = useCallback(() => {
    writeFlag(tool, !readFlag(tool));
  }, [tool]);

  return { enabled, toggle };
}

/**
 * What a field does when its tool's Remember opt-in turns on: restore a
 * saved value if one exists and the user hasn't edited the field yet;
 * otherwise persist what's currently on screen.
 */
export function enableAction(saved: string | null, touched: boolean): "restore" | "persist" {
  return saved !== null && !touched ? "restore" : "persist";
}

/**
 * A single remembered text field. Restores a stored value when the tool is
 * opted in, and persists changes (debounced) while it is. Falls back to
 * `fallback` when nothing is stored.
 *
 * Semantics when the opt-in flips ON:
 *  - if a value is stored and the user has not edited the field, it is restored;
 *  - otherwise (the user edited the field, or nothing is stored) the current
 *    on-screen value is persisted immediately.
 */
export function useRememberedField(
  tool: string,
  field: string,
  fallback: string,
): [string, (value: string) => void] {
  const { enabled } = useRemembered(tool);
  const [value, setValue] = useState(fallback);
  const loaded = useRef(false);
  const touched = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      // Re-arm: the next time Remember turns on, restore or persist again.
      loaded.current = false;
      return;
    }
    if (loaded.current) return;
    loaded.current = true;
    const saved = readInput(tool, field);
    if (enableAction(saved, touched.current) === "restore" && saved !== null) {
      setValue(saved);
    } else {
      writeInput(tool, field, value);
    }
  }, [enabled, tool, field, value]);

  const set = useCallback(
    (next: string) => {
      touched.current = true;
      setValue(next);
      pending.current = next;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        pending.current = null;
        if (!readFlag(tool)) return;
        writeInput(tool, field, next);
      }, 300);
    },
    [tool, field],
  );

  // Flush any pending write on unmount so a fast navigation doesn't drop it.
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
      const v = pending.current;
      if (v === null || !readFlag(tool)) return;
      writeInput(tool, field, v);
    };
  }, [tool, field]);

  return [value, set];
}
