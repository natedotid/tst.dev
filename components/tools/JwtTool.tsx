"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy } from "lucide-react";
import { CodeMirrorEditor } from "@/components/editor/CodeMirrorEditor";
import { Badge, CopyButton, ErrorBanner, Field, Panel } from "@/components/ui";
import { useRememberedField } from "@/lib/remember";
import { base64UrlDecode, formatLocal, relativeTime } from "@/lib/utils";

interface JwtParse {
  error: string | null;
  headerText: string;
  payloadText: string;
  signature: string;
  header: Record<string, unknown> | null;
  payload: Record<string, unknown> | null;
  headerError: string | null;
  payloadError: string | null;
  exp: number | null;
  iat: number | null;
  nbf: number | null;
  sub: string | null;
}

function decodeSegment(segment: string): { text: string; json: Record<string, unknown> | null; error: string | null } {
  try {
    const decoded = base64UrlDecode(segment);
    const json = JSON.parse(decoded) as unknown;
    if (json === null || typeof json !== "object" || Array.isArray(json)) {
      return { text: "", json: null, error: "the segment is not a JSON object" };
    }
    return { text: JSON.stringify(json, null, 2), json: json as Record<string, unknown>, error: null };
  } catch (e) {
    return { text: "", json: null, error: e instanceof Error ? e.message : "decode failed" };
  }
}

function parseJwt(token: string): JwtParse {
  const trimmed = token.trim();
  if (!trimmed) return empty();

  const parts = trimmed.split(".");
  if (parts.length !== 3) {
    return { ...empty(), error: `Expected 3 dot-separated segments (header.payload.signature), found ${parts.length}.` };
  }

  const [h, p] = parts.map(decodeSegment);
  const claims = p.json;
  const num = (v: unknown) => (typeof v === "number" ? v : null);
  const subRaw = claims ? claims["sub"] : undefined;

  return {
    error: null,
    headerText: h.text,
    payloadText: p.text,
    signature: parts[2],
    header: h.json,
    payload: claims,
    headerError: h.error,
    payloadError: p.error,
    exp: claims ? num(claims["exp"]) : null,
    iat: claims ? num(claims["iat"]) : null,
    nbf: claims ? num(claims["nbf"]) : null,
    // `sub` is a string per the JWT spec but many issuers emit numbers.
    sub: typeof subRaw === "string" || typeof subRaw === "number" ? String(subRaw) : null,
  };
}

function empty(): JwtParse {
  return {
    error: null,
    headerText: "",
    payloadText: "",
    signature: "",
    header: null,
    payload: null,
    headerError: null,
    payloadError: null,
    exp: null,
    iat: null,
    nbf: null,
    sub: null,
  };
}

const TIME_CLAIMS: Record<string, string> = {
  exp: "Expires at",
  iat: "Issued at",
  nbf: "Not valid before",
};

function ClaimRow({ k, v, now }: { k: string; v: unknown; now: number }) {
  const isTime = typeof v === "number" && k in TIME_CLAIMS;
  const isKeyClaim = k === "sub" || k in TIME_CLAIMS;
  return (
    <div className="border-b border-border-subtle py-2 last:border-0">
      <div className="flex items-baseline justify-between gap-3">
        <span
          className={
            "shrink-0 font-mono text-[13px] " +
            (k === "exp" ? "text-danger" : isKeyClaim ? "text-violet" : "text-muted")
          }
        >
          {k}
        </span>
        <span className="min-w-0 break-all text-right font-mono text-[13px] text-info">
          {typeof v === "string" ? v : JSON.stringify(v)}
        </span>
      </div>
      {isTime && (
        <div className="mt-1 text-right text-xs text-faint">
          {TIME_CLAIMS[k]} · {formatLocal(new Date(v * 1000))} · {relativeTime(new Date(v * 1000), now)}
        </div>
      )}
    </div>
  );
}

export function JwtTool() {
  const [token, setToken] = useRememberedField("jwt", "token", "");
  const parsed = useMemo(() => parseJwt(token), [token]);

  // Tick only while a time claim (exp/iat/nbf) needs a live relative time.
  const needsTick = parsed.exp !== null || parsed.iat !== null || parsed.nbf !== null;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!needsTick) return;
    const tick = () => setNow(Date.now());
    const immediate = setTimeout(tick, 0);
    const id = setInterval(tick, 1000);
    return () => {
      clearTimeout(immediate);
      clearInterval(id);
    };
  }, [needsTick]);

  const expired = parsed.exp !== null ? parsed.exp * 1000 < now : null;
  const alg = parsed.header && parsed.header["alg"] != null ? String(parsed.header["alg"]) : null;
  const typ = parsed.header && parsed.header["typ"] != null ? String(parsed.header["typ"]) : null;

  return (
    <div className="space-y-4">
      <CodeMirrorEditor
        value={token}
        onChange={setToken}
        language="plaintext"
        placeholder="Paste a JWT here (eyJhbGciOi…)…"
        ariaLabel="JWT input"
        className="h-32"
      />

      {parsed.error && <ErrorBanner>{parsed.error}</ErrorBanner>}

      {token.trim() && !parsed.error && (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Header" actions={<CopyButton text={parsed.headerText} />}>
              {parsed.headerError ? (
                <p className="flex h-44 items-center justify-center px-4 text-center text-[13px] leading-relaxed text-danger">
                  Couldn’t decode the header segment: {parsed.headerError}
                </p>
              ) : (
                <CodeMirrorEditor value={parsed.headerText} readOnly language="json" showToolbar={false} className="h-44" />
              )}
            </Panel>
            <Panel title="Payload" actions={<CopyButton text={parsed.payloadText} />}>
              {parsed.payloadError ? (
                <p className="flex h-44 items-center justify-center px-4 text-center text-[13px] leading-relaxed text-danger">
                  Couldn’t decode the payload segment: {parsed.payloadError}
                </p>
              ) : (
                <CodeMirrorEditor value={parsed.payloadText} readOnly language="json" showToolbar={false} className="h-44" />
              )}
            </Panel>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Claims inspector">
              {parsed.payload && Object.keys(parsed.payload).length > 0 ? (
                <div>
                  {Object.entries(parsed.payload).map(([k, v]) => (
                    <ClaimRow key={k} k={k} v={v} now={now} />
                  ))}
                </div>
              ) : (
                <p className="flex h-24 items-center justify-center px-4 text-center text-[13px] text-faint">
                  No claims to inspect.
                </p>
              )}
            </Panel>

            <div className="flex flex-col gap-4">
              <Panel title="Token status">
                <div className="flex flex-wrap items-center gap-2">
                  {parsed.exp !== null ? (
                    expired ? (
                      <Badge tone="danger">Expired {relativeTime(new Date(parsed.exp * 1000), now)}</Badge>
                    ) : (
                      <Badge tone="success">Not expired · expires {relativeTime(new Date(parsed.exp * 1000), now)}</Badge>
                    )
                  ) : (
                    <Badge tone="neutral">No `exp` claim, never expires</Badge>
                  )}
                  {parsed.nbf !== null && parsed.nbf * 1000 > now && (
                    <Badge tone="warning">Not valid yet · valid {relativeTime(new Date(parsed.nbf * 1000), now)}</Badge>
                  )}
                  {alg && (
                    <Badge tone="neutral">
                      alg · <span className="font-mono">{alg}</span>
                    </Badge>
                  )}
                  {typ && (
                    <Badge tone="neutral">
                      typ · <span className="font-mono">{typ}</span>
                    </Badge>
                  )}
                </div>
                {parsed.sub && (
                  <div className="mt-3">
                    <Field label="subject">{parsed.sub}</Field>
                  </div>
                )}
                <p className="mt-3 text-[12px] text-faint">Signature not verified. This tool decodes the token only.</p>
              </Panel>

              <Panel title="Signature" actions={<CopyButton text={parsed.signature} />}>
                <p className="break-all font-mono text-[13px] leading-relaxed text-muted">{parsed.signature}</p>
              </Panel>
            </div>
          </div>
        </>
      )}

      {!token.trim() && (
        <p className="flex items-center gap-2 text-[13px] text-faint">
          <Copy size={13} />
          Paste a token above. The header, payload, claims, and expiry appear here instantly.
        </p>
      )}
    </div>
  );
}
