"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { stringify } from "yaml";
import { CodeMirrorEditor } from "@/components/editor/CodeMirrorEditor";
import { Button, CopyButton, ErrorBanner, Panel } from "@/components/ui";
import { useRememberedField } from "@/lib/remember";
import { parseJsonl, toJsonl } from "@/lib/jsonl";
import { cn } from "@/lib/utils";

type OutputMode = "formatted-2" | "formatted-4" | "minified" | "yaml" | "ndjson";

const MODES: Array<{ id: OutputMode; label: string }> = [
  { id: "formatted-2", label: "2-space" },
  { id: "formatted-4", label: "4-space" },
  { id: "minified", label: "Minify" },
  { id: "yaml", label: "YAML" },
  { id: "ndjson", label: "NDJSON" },
];

/** Extract a 1-based line number from a JSON.parse error message. */
function jsonErrorLine(message: string, text: string): number | null {
  const line = message.match(/line (\d+)/i);
  if (line) return Number(line[1]);
  const pos = message.match(/position (\d+)/i);
  if (pos) return text.slice(0, Number(pos[1])).split("\n").length;
  return null;
}

export function JsonTool() {
  const [input, setInput] = useRememberedField("json", "input", "");
  // The scratchpad's NDJSON preview deep-links with ?mode=ndjson. The param
  // is a client fact (location is absent during SSR); the server snapshot
  // keeps the hydration render on the default mode. A clicked tab (userMode)
  // overrides the URL for the rest of the visit.
  const modeSubscribe = () => () => {};
  const urlModeSnapshot = () =>
    typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("mode") : null;
  const urlModeServerSnapshot = () => null;
  const urlMode = useSyncExternalStore(modeSubscribe, urlModeSnapshot, urlModeServerSnapshot);
  const [userMode, setUserMode] = useState<OutputMode | null>(null);
  const mode: OutputMode = userMode ?? (urlMode === "ndjson" ? "ndjson" : "formatted-2");

  const result = useMemo(() => {
    const empty = {
      error: null as string | null,
      errorLines: [] as number[],
      output: "",
      stats: null as string | null,
    };
    if (!input.trim()) return empty;

    if (mode === "ndjson") {
      // A whole-input JSON array converts to one record per line; anything
      // else is parsed line by line, keeping invalid lines verbatim.
      const trimmed = input.trim();
      if (trimmed.startsWith("[")) {
        try {
          const data: unknown = JSON.parse(trimmed);
          if (Array.isArray(data)) {
            return {
              error: null,
              errorLines: [],
              output: toJsonl(data),
              stats: `JSON array → ${data.length} record${data.length === 1 ? "" : "s"}`,
            };
          }
        } catch {
          // Not one array after all; fall through to line-by-line parsing.
        }
      }
      const parsed = parseJsonl(input);
      const output = parsed.lines.map((l) => (l.ok ? JSON.stringify(l.value) : l.text)).join("\n");
      const keys =
        parsed.keyUnion.length > 0
          ? ` · keys: ${parsed.keyUnion.slice(0, 10).join(", ")}${
              parsed.keyUnion.length > 10 ? ` … +${parsed.keyUnion.length - 10} more` : ""
            }`
          : "";
      return {
        error:
          parsed.errorCount > 0
            ? `${parsed.errorCount} of ${parsed.lines.length} lines are not valid JSON`
            : null,
        errorLines: parsed.lines.filter((l) => !l.ok).map((l) => l.lineNo),
        output,
        stats: `${parsed.lines.length} line${parsed.lines.length === 1 ? "" : "s"} · ${parsed.okCount} valid${keys}`,
      };
    }

    try {
      const data: unknown = JSON.parse(input);
      const output =
        mode === "yaml"
          ? stringify(data)
          : mode === "minified"
            ? JSON.stringify(data)
            : JSON.stringify(data, null, mode === "formatted-4" ? 4 : 2);
      return { error: null, errorLines: [], output, stats: null };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const line = jsonErrorLine(message, input);
      return { error: message, errorLines: line ? [line] : [], output: "", stats: null };
    }
  }, [input, mode]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex overflow-hidden rounded-md border border-border">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setUserMode(m.id)}
              aria-pressed={mode === m.id}
              className={cn(
                "h-8 px-3 text-[13px] font-medium transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
                mode === m.id ? "bg-elevated text-foreground" : "bg-transparent text-muted hover:text-foreground",
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <CopyButton text={result.output} label="Copy Output" variant="secondary" size="md" />
          <Button
            variant="ghost"
            onClick={() => {
              setInput("");
              setUserMode("formatted-2");
            }}
          >
            Clear
          </Button>
        </div>
      </div>

      {result.stats && <p className="text-[13px] text-faint">{result.stats}</p>}

      {result.error && (
        <ErrorBanner>
          {mode === "ndjson"
            ? result.error
            : `Invalid JSON${result.errorLines[0] ? ` at line ${result.errorLines[0]}` : ""}: ${result.error}`}
        </ErrorBanner>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Input" bodyClassName="p-0 flex flex-col">
          <CodeMirrorEditor
            value={input}
            onChange={setInput}
            language="json"
            placeholder='{ "paste": "your JSON here" }'
            ariaLabel="JSON input"
            errorLines={result.errorLines}
            className="h-[420px] border-0 rounded-none"
          />
        </Panel>

        <Panel title={`Output · ${MODES.find((m) => m.id === mode)?.label}`} bodyClassName="p-0 flex flex-col">
          <CodeMirrorEditor
            value={result.output}
            readOnly
            language={mode === "yaml" ? "yaml" : mode === "ndjson" ? "plaintext" : "json"}
            showToolbar={false}
            placeholder="Valid JSON appears here."
            ariaLabel="Formatted output"
            className="h-[420px] border-0 rounded-none"
          />
        </Panel>
      </div>
    </div>
  );
}
