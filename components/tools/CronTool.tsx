"use client";

import { useEffect, useMemo, useState } from "react";
import cronstrue from "cronstrue";
import { Badge, Button, CopyButton, ErrorBanner, Panel } from "@/components/ui";
import { parseCron, nextRuns, toCronstrueExpression, type CronFormat } from "@/lib/cron";
import { useRememberedField } from "@/lib/remember";
import { cn, formatLocal, formatUtc } from "@/lib/utils";

const FIELD_LABELS_5 = ["minute", "hour", "day of month", "month", "day of week"];
const FIELD_LABELS_6S = ["second", "minute", "hour", "day of month", "month", "day of week"];
const FIELD_LABELS_6Y = ["minute", "hour", "day of month", "month", "day of week", "year"];

const FORMAT_OPTIONS: { id: CronFormat; label: string }[] = [
  { id: "auto", label: "Auto" },
  { id: "seconds", label: "Seconds first" },
  { id: "year", label: "Year last (AWS)" },
];

export function CronTool() {
  const [expression, setExpression] = useRememberedField("cron", "expression", "*/15 * * * *");
  const [format, setFormat] = useState<CronFormat>("auto");

  const parsed = useMemo(() => parseCron(expression, format), [expression, format]);
  const describable = parsed.ok || parsed.unsupported === true;
  const sentence = useMemo(() => {
    if (!describable) return null;
    try {
      return cronstrue.toString(
        toCronstrueExpression(expression, parsed.ok ? parsed.fields.sixFieldFormat : null),
        { use24HourTimeFormat: true },
      );
    } catch {
      return null;
    }
  }, [expression, describable, parsed]);
  // Next runs depend on "now", which must not be evaluated during static
  // prerender: build-time run times would mismatch the client's first render
  // (hydration error). Roll in a callback scheduled after mount instead;
  // null = not yet computed.
  const [runs, setRuns] = useState<Date[] | null>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      setRuns(parsed.ok ? nextRuns(expression, new Date(), 5, format) : []);
    }, 0);
    return () => clearTimeout(t);
  }, [expression, parsed.ok, format]);

  const isSixField = expression.trim().split(/\s+/).length === 6;

  const hasInput = expression.trim() !== "";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-border bg-surface px-3 transition-colors focus-within:border-accent/40">
          <span aria-hidden className="select-none font-mono text-[13px] text-faint">$ crontab</span>
          <input
            value={expression}
            onChange={(e) => setExpression(e.target.value)}
            placeholder="*/15 * * * *  (5 or 6 fields)"
            spellCheck={false}
            aria-label="Cron expression"
            className="h-9 min-w-0 flex-1 bg-transparent font-mono text-sm text-foreground outline-none placeholder:text-faint"
          />
        </div>
        <div className="flex items-center gap-2">
          <CopyButton text={expression.trim()} label="Copy" variant="secondary" size="md" />
          <Button variant="ghost" onClick={() => setExpression("")}>
            Clear
          </Button>
        </div>
      </div>

      {isSixField && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs text-faint">6-field format</span>
          {FORMAT_OPTIONS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFormat(f.id)}
              aria-pressed={format === f.id}
              className={cn(
                "h-7 rounded-md border px-2.5 text-xs transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
                format === f.id
                  ? "border-accent/40 bg-accent/15 text-accent"
                  : "border-border bg-elevated text-muted hover:text-foreground",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {hasInput && !parsed.ok && !parsed.unsupported && <ErrorBanner>Invalid cron: {parsed.error}</ErrorBanner>}

      {!parsed.ok && parsed.unsupported && (
        <Panel title="Schedule">
          {sentence && (
            <p className="text-[15px]">
              <span className="text-faint">“</span>
              {sentence}
              <span className="text-faint">”</span>
            </p>
          )}
          <p className="mt-3 text-[13px] leading-relaxed text-faint">
            This expression uses Quartz extensions (L, W or #). Next runs aren’t available for them.
          </p>
        </Panel>
      )}

      {parsed.ok && (
        <>
          <Panel title="Schedule">
            <div className="flex flex-wrap items-center gap-2">
              {parsed.fields.sixFieldFormat === "seconds" && (
                <Badge tone="neutral">6-field · seconds first</Badge>
              )}
              {parsed.fields.sixFieldFormat === "year" && (
                <Badge tone="neutral">6-field · year last (AWS)</Badge>
              )}
              {sentence ? (
                <p className="text-[15px]">
                  <span className="text-faint">“</span>
                  {sentence}
                  <span className="text-faint">”</span>
                </p>
              ) : (
                <p className="text-sm text-muted">
                  Structurally valid, but this schedule can’t be described in plain English.
                </p>
              )}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {parsed.parts.map((part, i) => (
                <div key={i} className="rounded-md border border-border-subtle bg-background/40 px-3 py-2">
                  <div className="text-xs uppercase tracking-wider text-faint">
                    {parsed.fields.sixFieldFormat === "year"
                      ? FIELD_LABELS_6Y[i]
                      : (parsed.parts.length === 6 ? FIELD_LABELS_6S : FIELD_LABELS_5)[i]}
                  </div>
                  <div className="mt-1 truncate font-mono text-[13px] text-foreground">{part}</div>
                </div>
              ))}
            </div>

            {parsed.fields.domRestricted && parsed.fields.dowRestricted && (
              <p className="mt-3 text-[13px] leading-relaxed text-faint">
                Day-of-month and day-of-week are both restricted, so the job runs when <em>either</em> matches
                (standard cron behavior).
              </p>
            )}
          </Panel>

          <Panel title="Next 5 runs">
            {runs === null ? (
              <p className="py-4 text-center font-mono text-[13px] text-faint">computing…</p>
            ) : runs.length === 0 ? (
              <p className="py-4 text-center text-[13px] text-faint">
                No execution found within the search horizon. The schedule is impossible (e.g. Feb 30) or recurs
                only very rarely.
              </p>
            ) : (
              <div className="space-y-1.5">
                {runs.map((run, i) => (
                  <div
                    key={i}
                    className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5 rounded-md border border-border-subtle bg-background/40 px-3 py-2 font-mono text-[13px]"
                  >
                    <span className="w-4 text-right text-faint">{i + 1}</span>
                    <span className="text-foreground">{formatLocal(run)}</span>
                    <span className="text-faint">{formatUtc(run)}</span>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </>
      )}

      {!hasInput && (
        <p className="text-[13px] text-faint">
          Enter a 5-field cron expression, or 6 fields with seconds first (Quartz, Spring) or year
          last (AWS EventBridge).
        </p>
      )}
    </div>
  );
}
