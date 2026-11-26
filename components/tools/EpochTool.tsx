"use client";

import { useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Badge, Button, CopyButton, ErrorBanner, Field, Panel } from "@/components/ui";
import { useRememberedField } from "@/lib/remember";
import { formatLocal, formatUtc, relativeTime } from "@/lib/utils";

/** Parse a user-supplied timestamp: 10/13-digit epoch or any ISO/parseable string. */
function parseInput(raw: string): Date | null {
  const t = raw.trim();
  if (!t) return null;
  if (/^\d{10}$/.test(t)) return new Date(Number(t) * 1000);
  if (/^\d{13}$/.test(t)) return new Date(Number(t));
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function EpochTool() {
  // The live clock must not render during static prerender: Date.now() at
  // build time would bake a stale timestamp into the HTML that mismatches the
  // client's first render (hydration error). null = not yet mounted.
  const [now, setNow] = useState<number | null>(null);
  const [input, setInput] = useRememberedField("epoch", "input", "");

  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const nowDate = now !== null ? new Date(now) : null;
  const trimmed = input.trim();
  const parsed = useMemo(() => (trimmed ? parseInput(trimmed) : null), [trimmed]);
  const invalid = trimmed !== "" && parsed === null;
  const shown = parsed ?? nowDate;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Current time (live)" actions={<Badge tone="success">ticking</Badge>}>
        <Field label="epoch · seconds">{now !== null ? Math.floor(now / 1000) : "—"}</Field>
        <Field label="epoch · milliseconds">{now ?? "—"}</Field>
        <Field label="UTC ISO">{nowDate ? nowDate.toISOString() : "—"}</Field>
        <Field label="local">{nowDate ? formatLocal(nowDate) : "—"}</Field>
      </Panel>

      <div className="space-y-4">
        <Panel title="Convert">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="1700000000 · 1700000000000 · 2024-01-01T00:00:00Z"
                spellCheck={false}
                aria-label="Timestamp input"
                className="h-9 min-w-0 flex-1 rounded-md border border-border bg-surface px-3 font-mono text-sm text-foreground outline-none transition-colors placeholder:text-faint focus:border-accent/40"
              />
              <Button
                variant="secondary"
                onClick={() => setInput(String(Math.floor(Date.now() / 1000)))}
                title="Insert the current timestamp"
              >
                <RefreshCw size={13} />
                Now
              </Button>
            </div>

            {invalid ? (
              <ErrorBanner>
                Can’t parse “{trimmed}”. Use epoch seconds (10 digits), epoch milliseconds (13 digits), or an ISO
                date string.
              </ErrorBanner>
            ) : (
              <div>
                <Field label="epoch · seconds">
                  {shown ? Math.floor(shown.getTime() / 1000) : "—"}
                </Field>
                <Field label="epoch · milliseconds">{shown ? shown.getTime() : "—"}</Field>
                <Field label="UTC">{shown ? formatUtc(shown) : "—"}</Field>
                <Field label="UTC ISO">{shown ? shown.toISOString() : "—"}</Field>
                <Field label="local">{shown ? formatLocal(shown) : "—"}</Field>
                <Field label="relative" mono={false}>
                  {shown && now !== null ? relativeTime(shown, now) : "—"}
                </Field>
              </div>
            )}

            <div className="flex items-center justify-between">
              <CopyButton
                text={parsed ? parsed.toISOString() : ""}
                label="Copy ISO"
                variant="secondary"
                size="md"
                disabled={!parsed}
              />
              <Button variant="ghost" onClick={() => setInput("")}>
                Clear
              </Button>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}
