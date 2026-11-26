"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, RefreshCw, Check } from "lucide-react";
import { ulid } from "ulid";
import { Button, CopyButton, Panel } from "@/components/ui";
import { copyToClipboard } from "@/lib/utils";

function uuidv4(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback for non-secure contexts
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function IdRow({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-border-subtle bg-background/40 px-3 py-1.5">
      <span className="min-w-0 break-all font-mono text-[13px]">{id}</span>
      <button
        type="button"
        aria-label={`Copy ${id}`}
        onClick={async () => {
          if (await copyToClipboard(id)) {
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          }
        }}
        className={
          "shrink-0 rounded p-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 " +
          (copied ? "text-success" : "text-faint hover:text-foreground")
        }
      >
        {copied ? <Check size={12} /> : <Copy size={12} />}
      </button>
    </div>
  );
}

export function UuidTool() {
  const [count, setCount] = useState(5);
  const [nonce, setNonce] = useState(0);
  const [ids, setIds] = useState<{ uuids: string[]; ulids: string[] }>({ uuids: [], ulids: [] });

  // Random IDs must not be generated during SSR or the hydration render: the
  // prerender would bake build-time values into the HTML and the client would
  // roll different ones (hydration mismatch). Roll in a callback scheduled
  // after mount instead; `nonce` re-rolls on demand, `count` on slider moves.
  useEffect(() => {
    const t = setTimeout(() => {
      setIds({
        uuids: Array.from({ length: count }, uuidv4),
        ulids: Array.from({ length: count }, () => ulid()),
      });
    }, 0);
    return () => clearTimeout(t);
  }, [count, nonce]);

  const regenerate = useCallback(() => setNonce((n) => n + 1), []);

  const { uuids, ulids } = ids;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-surface px-4 py-3">
        <label htmlFor="uuid-count" className="text-[13px] text-muted">
          Count
        </label>
        <input
          id="uuid-count"
          type="range"
          min={1}
          max={100}
          value={count}
          onChange={(e) => setCount(Number(e.target.value))}
          className="h-1.5 w-40 cursor-pointer appearance-none rounded-full bg-border accent-accent"
        />
        <span className="w-10 text-center font-mono text-sm text-foreground">{count}</span>
        <div className="ml-auto">
          <Button variant="primary" onClick={regenerate}>
            <RefreshCw size={13} />
            Generate
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title={`UUID v4 · ${uuids.length}`}
          actions={<CopyButton text={uuids.join("\n")} label="Copy All" />}
          bodyClassName="space-y-1.5"
        >
          {uuids.map((id) => (
            <IdRow key={id} id={id} />
          ))}
        </Panel>

        <Panel
          title={`ULID · ${ulids.length}`}
          actions={<CopyButton text={ulids.join("\n")} label="Copy All" />}
          bodyClassName="space-y-1.5"
        >
          {ulids.map((id) => (
            <IdRow key={id} id={id} />
          ))}
        </Panel>
      </div>

      <p className="text-[13px] text-faint">
        UUIDs use <span className="font-mono">crypto.randomUUID()</span>, and ULIDs follow the ULID spec, which sorts by
        creation time.
      </p>
    </div>
  );
}
