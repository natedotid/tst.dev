"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import cronstrue from "cronstrue";
import { stringify } from "yaml";
import { detect, type Detection } from "@/lib/detectors";
import { passwordHint } from "@/lib/entropy";
import { nextRuns, parseCron, toCronstrueExpression } from "@/lib/cron";
import { cn, formatLocal, formatUtc, relativeTime } from "@/lib/utils";
import { Badge, CodePreview, CopyButton, NetworkBadge, RememberToggle, RouteBadge } from "@/components/ui";
import { useRememberedField } from "@/lib/remember";

/** Ticking clock (1s) for relative-time displays; paused while `active` is false. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    // Refresh right away (as a callback, not a synchronous effect update),
    // then keep ticking once per second.
    const tick = () => setNow(Date.now());
    const immediate = setTimeout(tick, 0);
    const id = setInterval(tick, 1000);
    return () => {
      clearTimeout(immediate);
      clearInterval(id);
    };
  }, [active]);
  return now;
}

function truncateLines(text: string, maxLines: number): string {
  const lines = text.split("\n");
  if (lines.length <= maxLines) return text;
  return `${lines.slice(0, maxLines).join("\n")}\n… (+${lines.length - maxLines} more lines)`;
}

/** "Open in full …" action row shown when a tool is detected. */
function OpenFullView({
  route,
  toolName,
  query = "",
  network = false,
}: {
  route: string;
  toolName: string;
  query?: string;
  network?: boolean;
}) {
  return (
    <div className="mt-3 flex items-center justify-between gap-3 rounded-md border border-border bg-elevated/50 px-3 py-2">
      <span className="text-[13px] text-muted">Detected input matches a full tool.</span>
      <Link
        href={`/${route}/${query}`}
        className="group inline-flex items-center gap-2 text-[13px] font-medium text-foreground transition-colors hover:text-accent"
      >
        Open in full {toolName} view
        {network && <NetworkBadge />}
        <RouteBadge route={`tst.dev/${route}`} />
        <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
      </Link>
    </div>
  );
}

function JwtPreview({ d, now }: { d: Extract<Detection, { kind: "jwt" }>; now: number }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="violet">JWT</Badge>
        {d.exp !== null &&
          (d.expired ? (
            <Badge tone="danger">Expired {relativeTime(new Date(d.exp * 1000), now)}</Badge>
          ) : (
            <Badge tone="success">Not expired · expires {relativeTime(new Date(d.exp * 1000), now)}</Badge>
          ))}
        {d.nbf !== null && d.nbf * 1000 > now && (
          <Badge tone="warning">Not valid yet · valid {relativeTime(new Date(d.nbf * 1000), now)}</Badge>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <CodePreview text={d.header ? truncateLines(JSON.stringify(d.header, null, 2), 14) : `⚠ ${d.headerError}`} />
        <CodePreview text={d.payload ? truncateLines(JSON.stringify(d.payload, null, 2), 14) : `⚠ ${d.payloadError}`} />
      </div>
    </div>
  );
}

function JsonPreview({ d }: { d: Extract<Detection, { kind: "json" }> }) {
  const asYaml = useMemo(() => {
    try {
      return stringify(d.data);
    } catch {
      return null;
    }
  }, [d.data]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Badge tone="accent">JSON</Badge>
        <span className="text-[13px] text-faint">
          {d.formatted.split("\n").length} lines · {d.minified.length} chars minified
        </span>
      </div>
      <CodePreview text={truncateLines(d.formatted, 24)} />
      <div className="flex flex-wrap items-center gap-2">
        <CopyButton text={d.minified} label="Copy Minified" variant="secondary" />
        {asYaml && <CopyButton text={asYaml} label="Copy as YAML" variant="secondary" />}
      </div>
    </div>
  );
}

function EpochPreview({ d, now }: { d: Extract<Detection, { kind: "epoch" }>; now: number }) {
  return (
    <div className="space-y-3">
      <Badge tone="accent">Epoch · {d.unit}</Badge>
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="rounded-md border border-border bg-elevated/50 px-3 py-2">
          <div className="text-xs uppercase tracking-wider text-faint">UTC</div>
          <div className="mt-1 font-mono text-[13px] text-info">{formatUtc(d.date)}</div>
        </div>
        <div className="rounded-md border border-border bg-elevated/50 px-3 py-2">
          <div className="text-xs uppercase tracking-wider text-faint">Local</div>
          <div className="mt-1 font-mono text-[13px] text-info">{formatLocal(d.date)}</div>
        </div>
        <div className="rounded-md border border-border bg-elevated/50 px-3 py-2">
          <div className="text-xs uppercase tracking-wider text-faint">Relative</div>
          <div className="mt-1 text-[13px] text-info">{relativeTime(d.date, now)}</div>
        </div>
      </div>
    </div>
  );
}

function CronPreview({ d }: { d: Extract<Detection, { kind: "cron" }> }) {
  const sentence = useMemo(() => {
    const parsed = parseCron(d.expression);
    try {
      return cronstrue.toString(
        toCronstrueExpression(d.expression, parsed.ok ? parsed.fields.sixFieldFormat : null),
        { use24HourTimeFormat: true },
      );
    } catch {
      return null;
    }
  }, [d.expression]);
  const runs = useMemo(() => nextRuns(d.expression, new Date(), 5), [d.expression]);

  return (
    <div className="space-y-3">
      <Badge tone="accent">Cron</Badge>
      {sentence ? (
        <p className="text-[15px]">
          <span className="text-faint">“</span>
          {sentence}
          <span className="text-faint">”</span>
        </p>
      ) : (
        <p className="text-[13px] text-muted">Parsed shape, but the schedule couldn’t be described.</p>
      )}
      {runs.length > 0 && (
        <div className="space-y-1 font-mono text-[13px] text-muted">
          <div className="text-xs uppercase tracking-wider text-faint">Next 5 runs (local)</div>
          {runs.map((r, i) => (
            <div key={i} className="flex gap-3">
              <span className="text-faint">{i + 1}.</span>
              <span>{formatLocal(r)}</span>
              <span className="text-faint">{formatUtc(r)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function UrlPreview({ d }: { d: Extract<Detection, { kind: "url" }> }) {
  return (
    <div className="space-y-3">
      <Badge tone="accent">URL</Badge>
      <div className="grid gap-2 font-mono text-[13px] sm:grid-cols-2">
        <div className="rounded-md border border-border bg-elevated/50 px-3 py-2">
          <span className="text-faint">host · </span>
          <span className="text-info">{d.parsed.host}</span>
        </div>
        <div className="rounded-md border border-border bg-elevated/50 px-3 py-2">
          <span className="text-faint">path · </span>
          <span className="text-info">{d.parsed.pathname}</span>
        </div>
      </div>
      {d.parsed.search && (
        <CodePreview text={d.parsed.searchParams.toString()} />
      )}
    </div>
  );
}

function Base64Preview({ d }: { d: Extract<Detection, { kind: "base64" }> }) {
  return (
    <div className="space-y-3">
      <Badge tone="accent">Base64</Badge>
      <CodePreview text={truncateLines(d.decoded, 12)} />
    </div>
  );
}

function HeadersPreview({ d }: { d: Extract<Detection, { kind: "headers" }> }) {
  const shown = d.pairs.slice(0, 6);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="accent">Email headers</Badge>
        <span className="text-[13px] text-faint">
          {d.pairs.length} header{d.pairs.length === 1 ? "" : "s"}
        </span>
      </div>
      <div className="space-y-1 font-mono text-[13px]">
        {shown.map((p, i) => (
          <div key={i} className="break-all">
            <span className="text-info">{p.name}</span>
            <span className="text-faint">: </span>
            <span className="text-muted">{p.value.length > 80 ? p.value.slice(0, 80) + "…" : p.value}</span>
          </div>
        ))}
        {d.pairs.length > shown.length && <div className="text-faint">… (+{d.pairs.length - shown.length} more)</div>}
      </div>
    </div>
  );
}

function JsonlPreview({ d }: { d: Extract<Detection, { kind: "jsonl" }> }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="accent">NDJSON</Badge>
        <span className="text-[13px] text-faint">
          {d.lineCount} lines · {d.okCount} valid
          {d.keyUnion.length > 0 && ` · keys: ${d.keyUnion.slice(0, 8).join(", ")}${d.keyUnion.length > 8 ? " …" : ""}`}
        </span>
      </div>
      <CodePreview text={d.firstLine} />
    </div>
  );
}

function DomainPreview({ d }: { d: Extract<Detection, { kind: "domain" }> }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Badge tone="accent">Domain</Badge>
        <span className="font-mono text-[13px] text-info">{d.host}</span>
        <span className="text-[13px] text-faint">
          {d.host.split(".").length} labels · {d.host.length} chars
        </span>
      </div>
      <p className="text-[13px] text-faint">
        Open in the Domain Inspector to look up DNS records, email-auth policy, and certificates.
      </p>
    </div>
  );
}

function HexPreview({ d }: { d: Extract<Detection, { kind: "hex" }> }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Badge tone="accent">Hex</Badge>
        <span className="text-[13px] text-faint">{d.byteLength} bytes</span>
      </div>
      {d.decoded ? (
        <CodePreview text={truncateLines(d.decoded, 12)} />
      ) : (
        <p className="text-[13px] text-faint">Binary data. Open in the hash tool to inspect and convert.</p>
      )}
    </div>
  );
}

function Base32Preview({ d }: { d: Extract<Detection, { kind: "base32" }> }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Badge tone="accent">Base32</Badge>
        <span className="text-[13px] text-faint">{d.byteLength} bytes</span>
      </div>
      {d.decoded ? (
        <CodePreview text={truncateLines(d.decoded, 12)} />
      ) : (
        <p className="text-[13px] text-faint">Binary data. Open in the hash tool to inspect and convert.</p>
      )}
    </div>
  );
}

const DETECTED_TOOL: Partial<
  Record<Detection["kind"], { route: string; name: string; query?: string; network?: boolean }>
> = {
  jwt: { route: "jwt", name: "JWT Inspector" },
  json: { route: "json", name: "JSON Formatter" },
  epoch: { route: "epoch", name: "Epoch Converter" },
  cron: { route: "cron", name: "Cron Explainer" },
  url: { route: "url", name: "URL Inspector" },
  base64: { route: "hash", name: "Hash, HMAC & Codecs" },
  headers: { route: "email/headers", name: "Email Header Analyzer" },
  jsonl: { route: "json", name: "JSON Formatter", query: "?mode=ndjson" },
  domain: { route: "dns", name: "Domain Inspector", network: true },
  hex: { route: "hash", name: "Hash, HMAC & Codecs", query: "?codec=hex" },
  base32: { route: "hash", name: "Hash, HMAC & Codecs", query: "?codec=base32" },
};

export function SmartScratchpad() {
  const [input, setInput] = useRememberedField("scratchpad", "input", "");
  const detection = useMemo(() => detect(input), [input]);
  // Text-kind annotation (never its own kind): a single-line 8–128-char
  // paste with ≥2 character classes looks like a password candidate.
  const hint = detection?.kind === "text" ? passwordHint(input) : null;
  const tool = detection ? DETECTED_TOOL[detection.kind] : undefined;
  // Only epoch previews and JWTs with an `exp` claim show a relative time.
  const needsNow =
    detection !== null &&
    (detection.kind === "epoch" || (detection.kind === "jwt" && detection.exp !== null));
  const now = useNow(needsNow);

  return (
    <div className="w-full">
      <div
        className={cn(
          "overflow-hidden rounded-xl border bg-surface transition-colors",
          detection && detection.kind !== "text" ? "border-accent/40" : "border-border",
        )}
      >
        <div className="flex items-center gap-2 border-b border-border-subtle px-4 py-2.5">
          <Sparkles size={13} className="text-accent" />
          <span className="text-xs font-medium uppercase tracking-wider text-muted">Smart Scratchpad</span>
          <div className="ml-auto flex items-center gap-2">
            {detection && detection.kind !== "text" && (
              <Badge tone="success">Detected: {detection.kind}</Badge>
            )}
            <RememberToggle tool="scratchpad" />
          </div>
        </div>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Paste anything here (JWT, JSON, Base64, Epoch, Cron, or text)..."
          spellCheck={false}
          aria-label="Smart scratchpad input"
          className="block min-h-[160px] w-full resize-y bg-transparent p-4 font-mono text-sm leading-relaxed text-foreground outline-none placeholder:text-faint"
        />
      </div>

      {detection && (
        <div className="mt-4 space-y-3">
          {detection.kind === "jwt" && <JwtPreview d={detection} now={now} />}
          {detection.kind === "json" && <JsonPreview d={detection} />}
          {detection.kind === "epoch" && <EpochPreview d={detection} now={now} />}
          {detection.kind === "cron" && <CronPreview d={detection} />}
          {detection.kind === "url" && <UrlPreview d={detection} />}
          {detection.kind === "base64" && <Base64Preview d={detection} />}
          {detection.kind === "headers" && <HeadersPreview d={detection} />}
          {detection.kind === "jsonl" && <JsonlPreview d={detection} />}
          {detection.kind === "domain" && <DomainPreview d={detection} />}
          {detection.kind === "hex" && <HexPreview d={detection} />}
          {detection.kind === "base32" && <Base32Preview d={detection} />}
          {detection.kind === "text" &&
            (hint ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="accent">Text</Badge>
                  <span className="text-[13px] text-muted">
                    Looks like a password or secret: {hint.bits} bits of entropy, guessable in {hint.guessTime}.
                  </span>
                </div>
                {hint.notes.length > 0 && (
                  <p className="text-[13px] text-faint">
                    Discounted for: {hint.notes.join(", ")}.
                  </p>
                )}
                <OpenFullView route="generate/password" toolName="Password & Token" />
              </div>
            ) : (
              <p className="text-[13px] text-faint">
                {detection.length.toLocaleString()} characters of plain text; nothing special detected.
              </p>
            ))}
          {tool && <OpenFullView route={tool.route} toolName={tool.name} query={tool.query} network={tool.network} />}
        </div>
      )}
    </div>
  );
}
