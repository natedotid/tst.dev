"use client";

import { useMemo, useState } from "react";
import {
  decodeQueryString,
  decodeText,
  decodeUrl,
  encodeQueryString,
  encodeText,
  encodeUrl,
  parseUrl,
  type TransformResult,
} from "@/lib/url";
import { CodePreview, CopyButton, ErrorBanner, Field, Panel } from "@/components/ui";
import { useRememberedField } from "@/lib/remember";
import { cn } from "@/lib/utils";

type Mode = "inspect" | "encode" | "decode";
type Scope = "url" | "query" | "text";

const MODES: Array<{ id: Mode; label: string }> = [
  { id: "inspect", label: "Inspect" },
  { id: "encode", label: "Encode" },
  { id: "decode", label: "Decode" },
];

const SCOPES: Array<{ id: Scope; label: string }> = [
  { id: "url", label: "URL" },
  { id: "query", label: "Query" },
  { id: "text", label: "Text" },
];

export function UrlTool() {
  const [input, setInput] = useRememberedField("url", "input", "");
  const [mode, setMode] = useState<Mode>("inspect");
  const [scope, setScope] = useState<Scope>("url");

  const trimmed = input.trim();

  const transform = useMemo<TransformResult | null>(() => {
    if (!trimmed) return null;
    if (mode === "encode") {
      return scope === "url"
        ? encodeUrl(trimmed)
        : scope === "query"
          ? encodeQueryString(trimmed)
          : encodeText(trimmed);
    }
    return scope === "url" ? decodeUrl(trimmed) : scope === "query" ? decodeQueryString(trimmed) : decodeText(trimmed);
  }, [trimmed, mode, scope]);

  const transformError = transform !== null && typeof transform === "object" ? transform.error : null;
  const transformOutput = transform !== null && typeof transform === "string" ? transform : "";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex overflow-hidden rounded-md border border-border">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMode(m.id)}
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

        {mode !== "inspect" && (
          <div className="flex overflow-hidden rounded-md border border-border">
            {SCOPES.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setScope(s.id)}
                aria-pressed={scope === s.id}
                className={cn(
                  "h-8 px-3 text-[13px] font-medium transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
                  scope === s.id ? "bg-elevated text-foreground" : "bg-transparent text-muted hover:text-foreground",
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={() => setInput("")}
          className="ml-auto h-8 rounded-md border border-transparent px-3 text-[13px] font-medium text-muted transition-colors hover:bg-elevated hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
        >
          Clear
        </button>
      </div>

      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="https://example.com/path?query=value#hash"
        spellCheck={false}
        aria-label={mode === "inspect" ? "URL input" : `${mode} input`}
        className="h-9 w-full rounded-md border border-border bg-surface px-3 font-mono text-sm text-foreground outline-none transition-colors placeholder:text-faint focus:border-accent/40"
      />

      {mode === "inspect" && <InspectView input={trimmed} />}
      {mode !== "inspect" && (
        <TransformView mode={mode} scope={scope} hasInput={Boolean(trimmed)} output={transformOutput} error={transformError} />
      )}
    </div>
  );
}

function InspectView({ input }: { input: string }) {
  const parsed = useMemo(() => (input ? parseUrl(input) : null), [input]);

  if (!input) {
    return <p className="text-[13px] text-faint">Paste a URL above to see its parts and query parameters.</p>;
  }

  if (parsed === null || "error" in parsed) {
    return <ErrorBanner>{parsed?.error ?? "Could not parse the URL."}</ErrorBanner>;
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Parts">
        <Field label="protocol">{parsed.protocol.replace(/:$/, "")}</Field>
        <Field label="host">{parsed.host}</Field>
        {parsed.port && <Field label="port">{parsed.port}</Field>}
        <Field label="path">{parsed.pathname}</Field>
        <Field label="query">{parsed.search.replace(/^\?/, "") || "—"}</Field>
        <Field label="hash">{parsed.hash.replace(/^#/, "") || "—"}</Field>
      </Panel>

      <Panel
        title="Query parameters"
        actions={
          parsed.search ? (
            <CopyButton text={parsed.search.replace(/^\?/, "")} label="Copy query" />
          ) : undefined
        }
      >
        {parsed.params.length ? (
          <div>
            {parsed.params.map((p, i) => (
              <div
                key={`${p.key}-${i}`}
                className="flex items-center justify-between gap-3 border-b border-border-subtle py-2 last:border-0"
              >
                <span className="min-w-0 break-all font-mono text-[13px]">{p.key}</span>
                <span className="min-w-0 break-all font-mono text-[13px] text-muted">{p.value || "—"}</span>
                <CopyButton text={p.value} label="" className="shrink-0" />
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[13px] text-faint">No query parameters.</p>
        )}
      </Panel>
    </div>
  );
}

function TransformView({
  mode,
  scope,
  hasInput,
  output,
  error,
}: {
  mode: "encode" | "decode";
  scope: Scope;
  hasInput: boolean;
  output: string;
  error: string | null;
}) {
  const scopeNoun = scope === "url" ? "URL" : scope === "query" ? "query string" : "text";

  if (!hasInput) {
    return <p className="text-[13px] text-faint">Paste a {scopeNoun} above to {mode} it.</p>;
  }

  if (error) {
    return <ErrorBanner>{error}</ErrorBanner>;
  }

  return (
    <Panel title={mode === "encode" ? "Encoded output" : "Decoded output"} actions={<CopyButton text={output} label="Copy" />}>
      <CodePreview text={output} />
    </Panel>
  );
}
