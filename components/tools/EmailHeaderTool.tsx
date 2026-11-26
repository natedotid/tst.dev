"use client";

import { useMemo } from "react";
import { CodeMirrorEditor } from "@/components/editor/CodeMirrorEditor";
import { Badge, ErrorBanner, Field, Panel, type BadgeTone } from "@/components/ui";
import { useRememberedField } from "@/lib/remember";
import { formatLocal } from "@/lib/utils";
import { summarizeEmail, unfoldHeaders, type AuthVerdict, type EmailSummary } from "@/lib/email-headers";

/* --------------------------------- verdict UI -------------------------------- */

function toneOf(verdict: AuthVerdict): BadgeTone {
  switch (verdict) {
    case "pass":
      return "success";
    case "fail":
    case "permerror":
      return "danger";
    case "softfail":
    case "neutral":
    case "temperror":
    case "unknown":
      return "warning";
    default:
      return "neutral";
  }
}

const VERDICT_LABEL: Record<AuthVerdict, string> = {
  pass: "pass",
  fail: "fail",
  softfail: "softfail",
  neutral: "neutral",
  none: "none",
  temperror: "temperror",
  permerror: "permerror",
  absent: "none",
  unknown: "unknown",
};

function AuthRow({ label, verdict, detail }: { label: string; verdict: AuthVerdict; detail?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border-subtle py-2 last:border-0">
      <span className="w-16 shrink-0 text-[13px] text-muted">{label}</span>
      <Badge tone={toneOf(verdict)}>{VERDICT_LABEL[verdict]}</Badge>
      {detail && <span className="min-w-0 break-all font-mono text-xs text-faint">{detail}</span>}
    </div>
  );
}

/* --------------------------------- duration -------------------------------- */

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem ? `${m} m ${rem} s` : `${m} m`;
}

/* ---------------------------------- summary -------------------------------- */

function Summary({ summary }: { summary: EmailSummary }) {
  const { from, to, subject, fromDomain, auth, hops, totalMs, flags } = summary;

  return (
    <div className="space-y-4">
      <Panel title="Authentication">
        <AuthRow label="SPF" verdict={auth.spf} />
        {auth.dkim.length > 0 ? (
          auth.dkim.map((d, i) => (
            <AuthRow
              key={i}
              label="DKIM"
              verdict={d.verdict}
              detail={[d.selector && `s=${d.selector}`, d.domain && `d=${d.domain}`].filter(Boolean).join("  ")}
            />
          ))
        ) : (
          <AuthRow label="DKIM" verdict="absent" detail={auth.dkimSignatureOnly ? "signature present, no verdict recorded" : undefined} />
        )}
        <AuthRow label="DMARC" verdict={auth.dmarc} />
      </Panel>

      {(from || to || subject || fromDomain) && (
        <Panel title="Key fields">
          {from && <Field label="From">{from}</Field>}
          {to && <Field label="To">{to}</Field>}
          {subject && <Field label="Subject" mono={false}>{subject}</Field>}
          {fromDomain && <Field label="From domain">{fromDomain}</Field>}
        </Panel>
      )}

      {hops.length > 0 && (
        <Panel title={`Delivery path · ${hops.length} hops`}>
          <div className="space-y-1.5">
            {hops.map((h, i) => (
              <div
                key={i}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 rounded-md border border-border-subtle bg-background/40 px-3 py-2 font-mono text-[13px]"
              >
                <span className="w-4 shrink-0 text-right text-faint">{i + 1}</span>
                <span className="text-foreground">
                  {h.from}
                  {h.to ? (
                    <>
                      {" → "}
                      <span className="text-info">{h.to}</span>
                    </>
                  ) : null}
                </span>
                {h.via && <span className="text-faint">via {h.via}</span>}
                {h.ip && <span className="text-faint">[{h.ip}]</span>}
                {h.date && <span className="text-faint">{formatLocal(new Date(h.date))}</span>}
                {h.delayMs !== null &&
                  (h.delayMs >= 0 ? (
                    <span className="text-violet">+{formatDuration(h.delayMs)}</span>
                  ) : (
                    <span className="text-warning">−{formatDuration(Math.abs(h.delayMs))} (clock skew)</span>
                  ))}
              </div>
            ))}
          </div>
          {totalMs !== null && (
            <p className="mt-2 text-[13px] text-muted">
              Total time across the chain:{" "}
              {totalMs >= 0 ? (
                <span className="font-mono text-violet">{formatDuration(totalMs)}</span>
              ) : (
                <span className="font-mono text-warning">
                  {formatDuration(Math.abs(totalMs))} (clock skew)
                </span>
              )}
            </p>
          )}
        </Panel>
      )}

      <Panel title="Flags">
        {flags.length === 0 ? (
          <p className="text-[13px] text-muted">No issues found. All recorded checks passed.</p>
        ) : (
          <ul className="space-y-1.5">
            {flags.map((f, i) => (
              <li key={i} className="flex items-start gap-2 text-[13px] leading-relaxed text-warning">
                <span aria-hidden className="mt-0.5 shrink-0">⚠</span>
                <span>{f}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

/* ------------------------------------ tool ---------------------------------- */

export function EmailHeaderTool() {
  const [raw, setRaw] = useRememberedField("email/headers", "headers", "");
  const headers = useMemo(() => unfoldHeaders(raw), [raw]);
  const summary = useMemo(() => (headers.length > 0 ? summarizeEmail(headers) : null), [headers]);

  const hasInput = raw.trim() !== "";

  return (
    <div className="space-y-4">
      <CodeMirrorEditor
        value={raw}
        onChange={setRaw}
        language="plaintext"
        placeholder={"Paste raw email headers here (from your mail client’s “Show original” / “View source”)…\n\nReceived: from mail.example.com (mail.example.com [203.0.113.10])\n\tby mx.example.com with ESMTPS;\n\tThu, 18 Oct 2026 09:12:31 -0700 (PDT)\nAuthentication-Results: mx.example.com; spf=pass smtp.mailfrom=…"}
        ariaLabel="Email headers"
      />
      <p className="text-[13px] text-faint">Headers contain IP addresses; they never leave your browser.</p>

      {hasInput && headers.length === 0 && (
        <ErrorBanner>
          No headers detected. Paste the raw header block (lines of <span className="font-mono">Name: value</span>),
          not the rendered message.
        </ErrorBanner>
      )}

      {summary && <Summary summary={summary} />}

      {!hasInput && (
        <p className="text-[13px] text-faint">
          Paste a message’s raw headers to see its SPF, DKIM, and DMARC results, the delivery path with per-hop
          delays, and a plain-English summary of anything worth flagging.
        </p>
      )}
    </div>
  );
}
