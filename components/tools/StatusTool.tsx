"use client";

import { useMemo, useState } from "react";
import { Badge, Panel } from "@/components/ui";
import { STATUS_CODES, STATUS_GROUPS, filterStatuses, type StatusGroup, type StatusInfo } from "@/lib/http-status";

function StatusRow({ status, tone }: { status: StatusInfo; tone: StatusGroup["tone"] }) {
  return (
    <div className="flex gap-3 border-b border-border-subtle px-3 py-2.5 last:border-0">
      <Badge tone={tone} className="mt-0.5 h-fit shrink-0 font-mono">
        {status.code}
      </Badge>
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-[13px] font-medium text-foreground">{status.name}</span>
          {status.refs.length > 0 && (
            <span className="font-mono text-xs text-faint">{status.refs.join(" · ")}</span>
          )}
        </div>
        <p className="mt-0.5 text-[13px] leading-relaxed text-muted">{status.note}</p>
      </div>
    </div>
  );
}

export function StatusTool() {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => filterStatuses(query), [query]);

  const groups = useMemo(
    () =>
      STATUS_GROUPS.map((group) => ({
        group,
        codes: filtered.filter((s) => Math.floor(s.code / 100) === group.class),
      })).filter((g) => g.codes.length > 0),
    [filtered],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex-1 overflow-hidden rounded-md border border-border bg-surface focus-within:border-accent/40">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by code (e.g. 4 or 404) or text (e.g. redirect, webdav)…"
            spellCheck={false}
            autoComplete="off"
            aria-label="Filter status codes"
            className="block h-9 w-full bg-transparent px-3 text-sm text-foreground outline-none placeholder:text-faint"
          />
        </div>
        <span className="shrink-0 text-[13px] text-faint">
          {filtered.length} of {STATUS_CODES.length}
        </span>
      </div>

      {groups.length === 0 ? (
        <Panel>
          <p className="py-6 text-center text-[13px] text-faint">No status codes match “{query.trim()}”.</p>
        </Panel>
      ) : (
        groups.map(({ group, codes }) => (
          <Panel key={group.class} title={group.label} className="overflow-hidden">
            <div className="-mx-3">
              {codes.map((s) => (
                <StatusRow key={s.code} status={s} tone={group.tone} />
              ))}
            </div>
          </Panel>
        ))
      )}
    </div>
  );
}
