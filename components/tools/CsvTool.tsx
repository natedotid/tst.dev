"use client";

import { useMemo, useState } from "react";
import { objectsToCsv, parseCsv, rowsToObjects, type Delimiter } from "@/lib/csv";
import { CodeMirrorEditor } from "@/components/editor/CodeMirrorEditor";
import { Button, CopyButton, ErrorBanner, Panel } from "@/components/ui";
import { useRememberedField } from "@/lib/remember";
import { cn } from "@/lib/utils";

const DELIMITERS: Array<{ id: Delimiter; label: string }> = [
  { id: "auto", label: "Auto" },
  { id: ",", label: "Comma" },
  { id: ";", label: "Semicolon" },
  { id: "\t", label: "Tab" },
  { id: "|", label: "Pipe" },
];

type Direction = "to-json" | "to-csv";

interface ToolResult {
  error: string | null;
  line: number | null;
  output: string;
  count: number;
}

const EMPTY: ToolResult = { error: null, line: null, output: "", count: 0 };

export function CsvTool() {
  const [direction, setDirection] = useState<Direction>("to-json");
  // One remembered input per direction so Remember keeps working per mode.
  const [input, setInput] = useRememberedField("csv", "input", "");
  const [jsonInput, setJsonInput] = useRememberedField("csv", "json", "");
  const [delimiter, setDelimiter] = useState<Delimiter>("auto");
  const [header, setHeader] = useState(true);

  const result = useMemo<ToolResult>(() => {
    if (direction === "to-json") {
      if (!input.trim()) return EMPTY;
      const parsed = parseCsv(input, delimiter);
      if ("error" in parsed) {
        return { error: parsed.error, line: parsed.line, output: "", count: 0 };
      }
      const data = rowsToObjects(parsed.rows, header);
      return { error: null, line: null, output: JSON.stringify(data, null, 2), count: data.length };
    }

    if (!jsonInput.trim()) return EMPTY;
    let data: unknown;
    try {
      data = JSON.parse(jsonInput);
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Invalid JSON", line: null, output: "", count: 0 };
    }
    const converted = objectsToCsv(data);
    if ("error" in converted) {
      return { error: converted.error, line: null, output: "", count: 0 };
    }
    return { error: null, line: null, output: converted.csv, count: Array.isArray(data) ? data.length : 0 };
  }, [direction, input, jsonInput, delimiter, header]);

  const activeInput = direction === "to-json" ? input : jsonInput;
  const clearActive = () => (direction === "to-json" ? setInput("") : setJsonInput(""));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex overflow-hidden rounded-md border border-border">
          {(["to-json", "to-csv"] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDirection(d)}
              aria-pressed={direction === d}
              className={cn(
                "h-8 px-3 text-[13px] font-medium transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
                direction === d ? "bg-elevated text-foreground" : "bg-transparent text-muted hover:text-foreground",
              )}
            >
              {d === "to-json" ? "CSV → JSON" : "JSON → CSV"}
            </button>
          ))}
        </div>

        {direction === "to-json" && (
          <>
            <div className="flex overflow-hidden rounded-md border border-border">
              {DELIMITERS.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setDelimiter(d.id)}
                  aria-pressed={delimiter === d.id}
                  className={cn(
                    "h-8 px-3 text-[13px] font-medium transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
                    delimiter === d.id ? "bg-elevated text-foreground" : "bg-transparent text-muted hover:text-foreground",
                  )}
                >
                  {d.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setHeader(!header)}
              aria-pressed={header}
              title={header ? "First row is used as object keys" : "Rows are emitted as arrays"}
              className={cn(
                "inline-flex h-8 select-none items-center rounded-md border px-3 text-[13px] font-medium transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
                header
                  ? "border-accent/40 bg-accent/15 text-accent"
                  : "border-border bg-elevated text-muted hover:text-foreground",
              )}
            >
              Header row
            </button>
          </>
        )}

        <div className="ml-auto flex items-center gap-2">
          <CopyButton text={result.output} label="Copy Output" variant="secondary" size="md" />
          <Button variant="ghost" onClick={clearActive}>
            Clear
          </Button>
        </div>
      </div>

      {result.error && (
        <ErrorBanner>
          {direction === "to-json"
            ? `Invalid CSV${result.line ? ` at line ${result.line}` : ""}: ${result.error}`
            : `Invalid JSON: ${result.error}`}
        </ErrorBanner>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={direction === "to-json" ? "Input" : "Input (JSON)"} bodyClassName="p-0 flex flex-col">
          <CodeMirrorEditor
            value={activeInput}
            onChange={direction === "to-json" ? setInput : setJsonInput}
            language={direction === "to-json" ? "plaintext" : "json"}
            placeholder={
              direction === "to-json" ? "Paste CSV here, e.g. name,age" : "Paste JSON here, e.g. [{\"name\":\"Alice\",\"age\":30}]"
            }
            ariaLabel={direction === "to-json" ? "CSV input" : "JSON input"}
            errorLines={direction === "to-json" && result.line ? [result.line] : []}
            className="h-[420px] border-0 rounded-none"
          />
        </Panel>

        <Panel
          title={
            direction === "to-json"
              ? result.count
                ? `Output · ${result.count} ${header ? "objects" : "rows"}`
                : "Output"
              : result.count
                ? `Output · ${result.count} rows`
                : "Output"
          }
          bodyClassName="p-0 flex flex-col"
        >
          <CodeMirrorEditor
            value={result.output}
            readOnly
            language={direction === "to-json" ? "json" : "plaintext"}
            showToolbar={false}
            placeholder={direction === "to-json" ? "JSON appears here." : "CSV appears here."}
            ariaLabel={direction === "to-json" ? "JSON output" : "CSV output"}
            className="h-[420px] border-0 rounded-none"
          />
        </Panel>
      </div>
    </div>
  );
}
