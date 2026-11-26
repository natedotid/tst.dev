"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { CodeMirrorEditor } from "@/components/editor/CodeMirrorEditor";
import { Badge, Button, CopyButton, ErrorBanner, Panel } from "@/components/ui";
import { useRememberedField } from "@/lib/remember";
import { HMAC_ALGOS, bufferToHex, computeHmac, type HmacAlgo, type HmacResult } from "@/lib/hmac";
import { base32Decode, base32Encode, hexDecode, hexEncode } from "@/lib/codec";
import { base64Decode, base64Encode, cn } from "@/lib/utils";

const ALGOS = ["SHA-1", "SHA-256", "SHA-384", "SHA-512"] as const;
type Algo = (typeof ALGOS)[number];

const CODEC_FORMATS = ["base64", "base32", "hex"] as const;
type CodecFormat = (typeof CODEC_FORMATS)[number];
const CODEC_LABEL: Record<CodecFormat, string> = { base64: "Base64", base32: "Base32", hex: "Hex" };

// Web Crypto's availability is a client fact (secure-context check). The
// server snapshot keeps SSR and the hydration render in agreement: both
// render the "unavailable" state, and the client snapshot takes over right
// after hydration, so HTTPS users see the digests without a mismatch.
const subtleSubscribe = () => () => {};
const subtleSnapshot = () => typeof window !== "undefined" && Boolean(window.crypto?.subtle);
const subtleServerSnapshot = () => false;

function HashRow({ algo, hex, input }: { algo: Algo; hex: string | undefined; input: string }) {
  return (
    <div className="rounded-md border border-border-subtle bg-background/40 px-3 py-2.5">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <Badge tone={hex ? "accent" : "neutral"}>{algo}</Badge>
        <CopyButton text={hex ?? ""} />
      </div>
      {input ? (
        hex ? (
          <p className="break-all font-mono text-[13px] leading-relaxed text-foreground/90">{hex}</p>
        ) : (
          <p className="font-mono text-[13px] text-faint">computing…</p>
        )
      ) : (
        <p className="font-mono text-[13px] text-faint">—</p>
      )}
    </div>
  );
}

export function HashTool() {
  const [input, setInput] = useRememberedField("hash", "input", "hello, tst.dev");
  const [hashes, setHashes] = useState<Partial<Record<Algo, string>>>({});
  // Which input the current digests were computed from: the rows and "Copy
  // All" only show a digest while it matches the input, so a mid-debounce
  // edit can't display (or copy) a hash of different text.
  const [hashedInput, setHashedInput] = useState("");
  const [codecMode, setCodecMode] = useState<"encode" | "decode">("encode");
  // Remembered key stays "b64" so input saved by the old Base64 panel carries over.
  const [codecInput, setCodecInput] = useRememberedField("hash", "b64", "hello, tst.dev");
  // The scratchpad's hex/Base32 previews deep-link with ?codec=<format>. The
  // param is a client fact (location is absent during SSR); the server
  // snapshot keeps the hydration render on the default format. A clicked tab
  // (userFormat) overrides the URL for the rest of the visit.
  const codecSubscribe = () => () => {};
  const urlCodecSnapshot = () =>
    typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("codec") : null;
  const urlCodecServerSnapshot = () => null;
  const urlCodec = useSyncExternalStore(codecSubscribe, urlCodecSnapshot, urlCodecServerSnapshot);
  const [userFormat, setUserFormat] = useState<CodecFormat | null>(null);
  const codecFormat: CodecFormat = userFormat ?? (urlCodec === "base32" || urlCodec === "hex" ? urlCodec : "base64");
  // HMAC key is deliberately a plain useState, not a remembered field: the
  // Remember opt-in is about keeping working text handy, and persisting a key
  // to localStorage is a needless credential-retention risk.
  const [hmacKey, setHmacKey] = useState("");
  const [hmacAlgo, setHmacAlgo] = useState<HmacAlgo>("SHA-256");
  const [hmacResult, setHmacResult] = useState<HmacResult | null>(null);
  // Which (input, key, algo) produced the current MAC, so a mid-debounce edit
  // can't display (or copy) a MAC of different data; same guard as the digests.
  const [hmacStamp, setHmacStamp] = useState("");

  const subtleOk = useSyncExternalStore(subtleSubscribe, subtleSnapshot, subtleServerSnapshot);

  // The digests belong to the input that produced them: clearing the input
  // clears them, so stale values can't linger after a clear.
  const handleInputChange = (next: string) => {
    setInput(next);
    if (next === "") {
      setHashes({});
      setHashedInput("");
      setHmacResult(null);
      setHmacStamp("");
    }
  };

  // Same staleness guard for the key: a cleared key can't keep showing a MAC.
  const handleKeyChange = (next: string) => {
    setHmacKey(next);
    if (next === "") {
      setHmacResult(null);
      setHmacStamp("");
    }
  };

  useEffect(() => {
    if (!input || !subtleOk) return;
    let cancelled = false;
    // Debounce so a long paste/typo session doesn't queue four digests per keystroke.
    const t = setTimeout(() => {
      const bytes = new TextEncoder().encode(input);
      Promise.all(
        ALGOS.map(async (algo) => {
          const digest = await crypto.subtle.digest(algo, bytes);
          return [algo, bufferToHex(digest)] as const;
        }),
      ).then((entries) => {
        if (!cancelled) {
          setHashes(Object.fromEntries(entries));
          setHashedInput(input);
        }
      });
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [input, subtleOk]);

  const hmacStampNow = `${hmacAlgo}\u0000${hmacKey}\u0000${input}`;
  const hmacFresh = hmacResult !== null && hmacStamp === hmacStampNow;

  useEffect(() => {
    // Clearing happens in the input/key handlers (above), so this effect only
    // ever schedules or cancels a computation.
    if (!input || !hmacKey || !subtleOk) return;
    let cancelled = false;
    const stamp = `${hmacAlgo}\u0000${hmacKey}\u0000${input}`;
    const t = setTimeout(() => {
      computeHmac(hmacAlgo, hmacKey, input)
        .then((r) => {
          if (!cancelled) {
            setHmacResult(r);
            setHmacStamp(stamp);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setHmacResult(null);
            setHmacStamp("");
          }
        });
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [input, hmacKey, hmacAlgo, subtleOk]);

  const codecResult = useMemo(() => {
    if (!codecInput) return { value: "", error: null as string | null };
    const encode =
      codecFormat === "base64"
        ? base64Encode
        : codecFormat === "base32"
          ? base32Encode
          : hexEncode;
    const decode =
      codecFormat === "base64"
        ? base64Decode
        : codecFormat === "base32"
          ? base32Decode
          : hexDecode;
    try {
      return { value: codecMode === "encode" ? encode(codecInput) : decode(codecInput), error: null as string | null };
    } catch (e) {
      return { value: "", error: e instanceof Error ? e.message : `Invalid ${CODEC_LABEL[codecFormat]} input` };
    }
  }, [codecInput, codecFormat, codecMode]);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-4">
        <Panel title="Input" bodyClassName="p-0 flex flex-col">
          <CodeMirrorEditor
            value={input}
            onChange={handleInputChange}
            language="plaintext"
            placeholder="Text to hash…"
            ariaLabel="Hash input"
            className="h-40 border-0 rounded-none"
          />
        </Panel>

        <Panel
          title="SHA digests"
          actions={
            input !== "" && input === hashedInput && Object.values(hashes).some(Boolean) ? (
              <CopyButton
                text={ALGOS.map((a) => `${a}: ${hashes[a]}`).join("\n")}
                label="Copy All"
              />
            ) : undefined
          }
        >
          {!subtleOk ? (
            <ErrorBanner>
              Web Crypto is unavailable in this context. Hashing requires a secure context (HTTPS or localhost).
            </ErrorBanner>
          ) : (
            <div className="space-y-2">
              {ALGOS.map((algo) => (
                <HashRow key={algo} algo={algo} hex={input === hashedInput ? hashes[algo] : undefined} input={input} />
              ))}
            </div>
          )}
        </Panel>

        <Panel title="HMAC · keyed MAC of the input">
          {!subtleOk ? (
            <ErrorBanner>
              Web Crypto is unavailable in this context. Hashing requires a secure context (HTTPS or localhost).
            </ErrorBanner>
          ) : (
            <div className="space-y-3">
              <div className="flex overflow-hidden rounded-md border border-border">
                {HMAC_ALGOS.map((algo) => (
                  <button
                    key={algo}
                    type="button"
                    onClick={() => setHmacAlgo(algo)}
                    aria-pressed={hmacAlgo === algo}
                    className={cn(
                      "h-8 flex-1 font-mono text-xs font-medium transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
                      hmacAlgo === algo ? "bg-elevated text-foreground" : "bg-transparent text-muted hover:text-foreground",
                    )}
                  >
                    {algo}
                  </button>
                ))}
              </div>

              <div className="overflow-hidden rounded-md border border-border bg-surface focus-within:border-accent/40">
                <input
                  type="text"
                  value={hmacKey}
                  onChange={(e) => handleKeyChange(e.target.value)}
                  placeholder="Key…"
                  spellCheck={false}
                  autoComplete="off"
                  aria-label="HMAC key"
                  className="block h-9 w-full bg-transparent px-3 font-mono text-[13px] text-foreground outline-none placeholder:text-faint"
                />
              </div>

              {input && hmacKey ? (
                hmacFresh && hmacResult ? (
                  <div className="space-y-2">
                    <div className="rounded-md border border-border-subtle bg-background/40 px-3 py-2.5">
                      <div className="mb-1.5 flex items-center justify-between gap-2">
                        <span className="text-xs uppercase tracking-wider text-faint">Hex</span>
                        <CopyButton text={hmacResult.hex} />
                      </div>
                      <p className="break-all font-mono text-[13px] leading-relaxed text-foreground/90">{hmacResult.hex}</p>
                    </div>
                    <div className="rounded-md border border-border-subtle bg-background/40 px-3 py-2.5">
                      <div className="mb-1.5 flex items-center justify-between gap-2">
                        <span className="text-xs uppercase tracking-wider text-faint">Base64</span>
                        <CopyButton text={hmacResult.base64} />
                      </div>
                      <p className="break-all font-mono text-[13px] leading-relaxed text-foreground/90">{hmacResult.base64}</p>
                    </div>
                  </div>
                ) : (
                  <p className="font-mono text-[13px] text-faint">computing…</p>
                )
              ) : (
                <p className="text-[13px] text-faint">
                  {hmacKey ? "Type in the input above to compute the keyed MAC." : "Enter a key to compute the keyed MAC of the input text."}
                </p>
              )}
            </div>
          )}
        </Panel>
      </div>

      <Panel title="Codec · Base64 / Base32 / Hex">
        <div className="space-y-3">
          <div className="flex gap-2">
            <div className="flex flex-1 overflow-hidden rounded-md border border-border">
              {CODEC_FORMATS.map((format) => (
                <button
                  key={format}
                  type="button"
                  onClick={() => setUserFormat(format)}
                  aria-pressed={codecFormat === format}
                  className={cn(
                    "h-8 flex-1 text-[13px] font-medium transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
                    codecFormat === format
                      ? "bg-elevated text-foreground"
                      : "bg-transparent text-muted hover:text-foreground",
                  )}
                >
                  {CODEC_LABEL[format]}
                </button>
              ))}
            </div>
            <div className="flex w-40 overflow-hidden rounded-md border border-border">
              {(["encode", "decode"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setCodecMode(mode)}
                  aria-pressed={codecMode === mode}
                  className={cn(
                    "h-8 flex-1 text-[13px] font-medium capitalize transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
                    codecMode === mode
                      ? "bg-elevated text-foreground"
                      : "bg-transparent text-muted hover:text-foreground",
                  )}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-hidden rounded-md border border-border bg-surface focus-within:border-accent/40">
            <textarea
              value={codecInput}
              onChange={(e) => setCodecInput(e.target.value)}
              placeholder={
                codecMode === "encode"
                  ? "Text to encode…"
                  : `${CODEC_LABEL[codecFormat]} to decode…`
              }
              spellCheck={false}
              aria-label="Codec input"
              className="block h-28 w-full resize-none bg-transparent p-3 font-mono text-[13px] leading-relaxed text-foreground outline-none placeholder:text-faint"
            />
          </div>

          {codecResult.error ? (
            <ErrorBanner>{codecResult.error}</ErrorBanner>
          ) : (
            <div className="rounded-md border border-border-subtle bg-background/40 px-3 py-2.5">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="text-xs uppercase tracking-wider text-faint">
                  {codecMode === "encode" ? `${CODEC_LABEL[codecFormat]} output` : "Decoded text"}
                </span>
                <CopyButton text={codecResult.value} />
              </div>
              <p className="max-h-40 overflow-auto break-all font-mono text-[13px] leading-relaxed whitespace-pre-wrap">
                {codecResult.value || <span className="text-faint">—</span>}
              </p>
            </div>
          )}

          <div className="flex justify-end">
            <Button variant="ghost" onClick={() => setCodecInput("")}>
              Clear
            </Button>
          </div>
        </div>
      </Panel>
    </div>
  );
}
