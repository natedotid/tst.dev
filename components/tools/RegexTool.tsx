"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CodeMirrorEditor } from "@/components/editor/CodeMirrorEditor";
import { Button, CopyButton, ErrorBanner, Panel } from "@/components/ui";
import { EMPTY_RESULT, MAX_MATCHES, type MatchInfo, type RegexResult } from "@/lib/regex";
import { useRememberedField } from "@/lib/remember";
import { cn } from "@/lib/utils";

const FLAG_OPTIONS = [
  { id: "g", label: "global" },
  { id: "i", label: "ignore case" },
  { id: "m", label: "multiline" },
  { id: "s", label: "dotall" },
  { id: "u", label: "unicode" },
  { id: "y", label: "sticky" },
  { id: "v", label: "unicode sets" },
] as const;

type FlagId = (typeof FLAG_OPTIONS)[number]["id"];

const MAX_TEXT_LENGTH = 1_000_000;

function HighlightedText({ text, matches }: { text: string; matches: MatchInfo[] }) {
  const segments = useMemo(() => {
    const out: Array<{ text: string; match: boolean }> = [];
    let cursor = 0;
    for (const m of matches) {
      if (m.index < cursor) continue; // overlapping safety
      if (m.index > cursor) out.push({ text: text.slice(cursor, m.index), match: false });
      out.push({ text: text.slice(m.index, m.index + m.text.length), match: true });
      cursor = m.index + m.text.length;
    }
    if (cursor < text.length) out.push({ text: text.slice(cursor), match: false });
    return out;
  }, [text, matches]);

  return (
    <div className="max-h-72 overflow-auto rounded-md border border-border-subtle bg-background/60 p-3 font-mono text-[13px] leading-relaxed whitespace-pre-wrap break-all">
      {segments.map((seg, i) =>
        seg.match ? (
          <span key={i} className="rounded-[2px] bg-warning/25 text-foreground">
            {seg.text}
          </span>
        ) : (
          <span key={i}>{seg.text}</span>
        ),
      )}
    </div>
  );
}

const TIMEOUT_MS = 500;
const DEBOUNCE_MS = 80;

interface MatchState {
  /** The pattern/flags/text this state was computed for. */
  key: string;
  result: RegexResult;
  timedOut: boolean;
  workerError: boolean;
}

/**
 * Run matching in a Web Worker. A run that exceeds TIMEOUT_MS is killed
 * (the worker is terminated and recreated on the next input), so
 * catastrophic backtracking can't freeze the page.
 */
function useRegexMatches(pattern: string, flags: string, text: string) {
  const key = `${pattern}\u0000${flags}\u0000${text}`;
  const [state, setState] = useState<MatchState>({
    key: "",
    result: EMPTY_RESULT,
    timedOut: false,
    workerError: false,
  });
  const workerRef = useRef<Worker | null>(null);
  const idRef = useRef(0);

  // Terminate the worker when the tool unmounts.
  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!pattern || !text) return;
    const id = ++idRef.current;
    let killer: ReturnType<typeof setTimeout> | undefined;
    let done = false;
    let started: Worker | null = null;

    const debounce = setTimeout(() => {
      let w = workerRef.current;
      if (!w) {
        w = new Worker(new URL("./regex.worker.ts", import.meta.url));
        workerRef.current = w;
      }
      const worker = w;
      started = worker;
      worker.onmessage = (e: MessageEvent<{ id: number; result: RegexResult }>) => {
        if (e.data.id !== id) return;
        done = true;
        clearTimeout(killer);
        setState({ key, result: e.data.result, timedOut: false, workerError: false });
      };
      worker.onerror = () => {
        done = true;
        clearTimeout(killer);
        worker.terminate();
        if (workerRef.current === worker) workerRef.current = null;
        setState({ key, result: EMPTY_RESULT, timedOut: false, workerError: true });
      };
      killer = setTimeout(() => {
        done = true;
        worker.terminate();
        if (workerRef.current === worker) workerRef.current = null;
        setState({ key, result: EMPTY_RESULT, timedOut: true, workerError: false });
      }, TIMEOUT_MS);
      worker.postMessage({ id, pattern, flags, text });
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(debounce);
      clearTimeout(killer);
      // A run still in progress would block the next request in the same
      // worker, so kill it; the next input starts a fresh worker.
      if (started && !done) {
        started.terminate();
        if (workerRef.current === started) workerRef.current = null;
      }
    };
  }, [key, pattern, flags, text]);

  if (!pattern || !text) return { result: EMPTY_RESULT, timedOut: false, workerError: false, pending: false };
  const fresh = state.key === key;
  return {
    // While a new run is pending, keep showing the last result.
    result: state.result,
    timedOut: fresh && state.timedOut,
    workerError: fresh && state.workerError,
    pending: !fresh,
  };
}

export function RegexTool() {
  const [pattern, setPattern] = useRememberedField("regex", "pattern", "([a-z]+)\\s+([a-z]+)");
  const [flags, setFlags] = useState<Record<FlagId, boolean>>({
    g: true,
    i: false,
    m: false,
    s: false,
    u: false,
    y: false,
    v: false,
  });
  const [test, setTest] = useRememberedField("regex", "test", "hello world\nfoo bar\nbaz qux");

  const flagString = FLAG_OPTIONS.filter((f) => flags[f.id]).map((f) => f.id).join("");
  const { result, timedOut, workerError, pending } = useRegexMatches(pattern, flagString, test);

  const toggleFlag = (id: FlagId) => setFlags((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div
          className={cn(
            "flex min-w-0 flex-1 items-center gap-2 rounded-md border bg-surface px-3 transition-colors focus-within:border-accent/40",
            result.error ? "border-danger/40" : "border-border",
          )}
        >
          <span className="select-none font-mono text-muted">/</span>
          <input
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
            placeholder="regex pattern"
            spellCheck={false}
            aria-label="Regex pattern"
            className="h-9 min-w-0 flex-1 bg-transparent font-mono text-sm text-foreground outline-none placeholder:text-faint"
          />
          <span className="select-none font-mono text-muted">/</span>
          <span className="select-none font-mono text-[13px] text-accent">{flagString}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {FLAG_OPTIONS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => toggleFlag(f.id)}
              title={f.label}
              aria-pressed={flags[f.id]}
              className={cn(
                "h-8 w-8 rounded-md border font-mono text-[13px] transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
                flags[f.id]
                  ? "border-accent/40 bg-accent/15 text-accent"
                  : "border-border bg-elevated text-muted hover:text-foreground",
              )}
            >
              {f.id}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <CopyButton text={pattern} label="Copy Pattern" variant="secondary" size="md" />
          <Button
            variant="ghost"
            onClick={() => {
              setPattern("");
              setTest("");
            }}
          >
            Clear
          </Button>
        </div>
      </div>

      {result.error && <ErrorBanner>Invalid regular expression: {result.error}</ErrorBanner>}
      {timedOut && (
        <ErrorBanner>
          Matching took longer than {TIMEOUT_MS} ms and was stopped. The pattern probably backtracks
          catastrophically (for example, nested quantifiers like (a+)+). Simplify the pattern or shorten
          the test string.
        </ErrorBanner>
      )}
      {workerError && <ErrorBanner>The matcher couldn’t start in this browser.</ErrorBanner>}

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title="Test string"
          bodyClassName="p-0 flex flex-col"
          actions={
            test.length >= MAX_TEXT_LENGTH ? (
              <span className="text-xs text-faint">
                capped at {MAX_TEXT_LENGTH.toLocaleString()} chars
              </span>
            ) : undefined
          }
        >
          <CodeMirrorEditor
            value={test}
            onChange={(value) => setTest(value.slice(0, MAX_TEXT_LENGTH))}
            language="plaintext"
            placeholder="Text to test against the pattern…"
            ariaLabel="Test string"
            className="h-64 border-0 rounded-none"
          />
        </Panel>

        <Panel
          title={`Matches · ${result.matches.length}${result.truncated ? "+" : ""}`}
          actions={
            result.truncated ? (
              <span className="text-xs text-warning">capped at {MAX_MATCHES}</span>
            ) : undefined
          }
        >
          {test && !result.error && !timedOut ? (
            <div className={pending ? "opacity-60" : undefined}>
              <HighlightedText text={test} matches={result.matches} />
            </div>
          ) : (
            <p className="py-6 text-center text-[13px] text-faint">Matches are highlighted in real time.</p>
          )}
        </Panel>
      </div>

      {result.matches.length > 0 && (
        <Panel title="Match details">
          <div className="max-h-80 space-y-2 overflow-auto">
            {result.matches.map((m, i) => (
              <div key={i} className="rounded-md border border-border-subtle bg-background/40 px-3 py-2 font-mono text-[13px]">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="text-faint">#{i + 1}</span>
                  <span className="break-all text-foreground">
                    {m.text === "" ? "∅ (zero-length)" : m.text}
                  </span>
                  <span className="text-faint">at index {m.index}</span>
                </div>
                {(m.groups.length > 0 || m.named) && (
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-muted">
                    {m.groups.map((g, gi) => (
                      <span key={gi}>
                        <span className="text-faint">${gi + 1} · </span>
                        {g === undefined ? (
                          <span className="text-faint">unmatched</span>
                        ) : (
                          <span className="break-all">{g}</span>
                        )}
                      </span>
                    ))}
                    {m.named &&
                      Object.entries(m.named).map(([k, v]) => (
                        <span key={k}>
                          <span className="text-faint">${k} · </span>
                          {v === undefined ? (
                            <span className="text-faint">unmatched</span>
                          ) : (
                            <span className="break-all">{v}</span>
                          )}
                        </span>
                      ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}
