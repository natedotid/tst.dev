"use client";

import { useMemo, useState } from "react";
import { ArrowLeftRight } from "lucide-react";
import { CodeMirrorEditor } from "@/components/editor/CodeMirrorEditor";
import { Badge, Button, ErrorBanner, Panel } from "@/components/ui";
import { useRememberedField } from "@/lib/remember";
import { cn } from "@/lib/utils";
import { computeSideBySide, normalizeJson, type SideLine } from "@/lib/diff";

function DiffRow({ line, side }: { line: SideLine; side: "left" | "right" }) {
  if (line.type === "gap") {
    return <div className="h-[21px] border-t border-dashed border-border-subtle/60" aria-hidden />;
  }
  const lineBg =
    line.type === "removed"
      ? "bg-danger/10"
      : line.type === "added"
        ? "bg-success/10"
        : "";
  const segBg = side === "left" ? "bg-danger/30" : "bg-success/30";
  return (
    <div className={cn("flex gap-2 px-2", lineBg)}>
      <span className="w-10 shrink-0 select-none text-right font-mono text-xs leading-[21px] text-faint">{line.lineNo}</span>
      <span className="whitespace-pre-wrap break-all font-mono text-[13px] leading-[21px]">
        {line.segments.map((seg, i) =>
          seg.changed ? (
            <span key={i} className={cn("rounded-[2px]", segBg)}>
              {seg.text}
            </span>
          ) : (
            <span key={i}>{seg.text}</span>
          ),
        )}
        {line.raw === "" ? " " : null}
      </span>
    </div>
  );
}

export function DiffTool() {
  const [original, setOriginal] = useRememberedField("diff", "original", "");
  const [modified, setModified] = useRememberedField("diff", "modified", "");
  // UI state only (not a remembered field): Remember stores input values.
  const [jsonMode, setJsonMode] = useState(false);

  const leftJson = useMemo(() => normalizeJson(original), [original]);
  const rightJson = useMemo(() => normalizeJson(modified), [modified]);
  const bothJson = leftJson !== null && rightJson !== null;
  // JSON mode is the user's intent; it only takes effect while both sides are
  // valid JSON, so breaking one side falls back to a plain-text diff.
  const activeJsonMode = jsonMode && bothJson;
  const compareLeft = activeJsonMode ? (leftJson as string) : original;
  const compareRight = activeJsonMode ? (rightJson as string) : modified;

  const result = useMemo(() => computeSideBySide(compareLeft, compareRight), [compareLeft, compareRight]);
  const hasInput = original.length > 0 || modified.length > 0;
  const identical = activeJsonMode
    ? compareLeft === compareRight
    : hasInput && original === modified;

  // Rendering 50k+ DOM rows would freeze the tab; cap the display and say so.
  const MAX_RENDERED_LINES = 50_000;
  const truncated = result.left.length > MAX_RENDERED_LINES;
  const rows = truncated ? result.left.slice(0, MAX_RENDERED_LINES) : result.left;
  const rightRows = truncated ? result.right.slice(0, MAX_RENDERED_LINES) : result.right;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 font-mono text-[13px]">
          <Badge tone="success">+{result.addedLines}</Badge>
          <Badge tone="danger">−{result.removedLines}</Badge>
          {activeJsonMode && <Badge tone="violet">JSON mode</Badge>}
        </div>
        <button
          type="button"
          onClick={() => setJsonMode(!jsonMode)}
          aria-pressed={jsonMode}
          title={
            bothJson
              ? "Canonicalize both sides as JSON so formatting differences don’t count as changes"
              : "Available once both sides are valid JSON"
          }
          className={cn(
            "inline-flex h-8 select-none items-center rounded-md border px-3 text-[13px] font-medium transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
            jsonMode
              ? "border-accent/40 bg-accent/15 text-accent"
              : "border-border bg-elevated text-muted hover:text-foreground",
          )}
        >
          Compare as JSON
        </button>
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="ghost"
            onClick={() => {
              setOriginal(modified);
              setModified(original);
            }}
          >
            <ArrowLeftRight size={13} />
            Swap
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setOriginal("");
              setModified("");
            }}
          >
            Clear
          </Button>
        </div>
      </div>

      {jsonMode && !bothJson && hasInput && (
        <ErrorBanner>
          JSON mode is on, but one or both sides aren’t valid JSON: showing a plain-text diff until they are.
        </ErrorBanner>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Original" bodyClassName="p-0 flex flex-col">
          <CodeMirrorEditor
            value={original}
            onChange={setOriginal}
            language="plaintext"
            placeholder="Paste the original text…"
            ariaLabel="Original text"
            className="h-64 border-0 rounded-none"
          />
        </Panel>
        <Panel title="Modified" bodyClassName="p-0 flex flex-col">
          <CodeMirrorEditor
            value={modified}
            onChange={setModified}
            language="plaintext"
            placeholder="Paste the modified text…"
            ariaLabel="Modified text"
            className="h-64 border-0 rounded-none"
          />
        </Panel>
      </div>

      <Panel title="Side-by-side diff">
        {!hasInput ? (
          <p className="py-6 text-center text-[13px] text-faint">
            Paste text into both panels to compare.
          </p>
        ) : identical ? (
          <p className="py-6 text-center text-[13px] text-muted">
            {activeJsonMode ? "Both documents are identical after JSON normalization." : "Both texts are identical."}
          </p>
        ) : (
          <>
            {activeJsonMode && (
              <p className="border-b border-border-subtle px-3 py-1.5 text-[13px] text-faint">
                Formatting normalized before comparing; only structural differences are shown.
              </p>
            )}
            <div className="grid max-h-[520px] grid-cols-2 overflow-auto">
              <div className="border-r border-border-subtle">
                {rows.map((line, i) => (
                  <DiffRow key={i} line={line} side="left" />
                ))}
              </div>
              <div>
                {rightRows.map((line, i) => (
                  <DiffRow key={i} line={line} side="right" />
                ))}
              </div>
            </div>
            {truncated && (
              <p className="border-t border-border-subtle px-3 py-2 text-[13px] text-faint">
                Showing the first {MAX_RENDERED_LINES.toLocaleString()} lines of{" "}
                {result.left.length.toLocaleString()}. Shorten the inputs to see the rest.
              </p>
            )}
          </>
        )}
      </Panel>
    </div>
  );
}
