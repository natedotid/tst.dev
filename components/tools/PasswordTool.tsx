"use client";

import { useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Badge, Button, CopyButton, Panel, type BadgeTone } from "@/components/ui";
import { cn } from "@/lib/utils";
import { crackTime, estimateEntropy, randomPasswordBits } from "@/lib/entropy";
import { WORD_COUNT } from "@/lib/wordlist";
import {
  generatePassphrase,
  generateRandomPassword,
  generateToken,
  type TokenEncoding,
} from "@/lib/password";

type Mode = "random" | "passphrase" | "token";

const MODES: Array<{ id: Mode; label: string }> = [
  { id: "random", label: "Random" },
  { id: "passphrase", label: "Passphrase" },
  { id: "token", label: "Token" },
];

type ClKey = "lowercase" | "uppercase" | "digits" | "symbols";

const CLASSES: Array<{ id: ClKey; label: string }> = [
  { id: "lowercase", label: "lowercase" },
  { id: "uppercase", label: "uppercase" },
  { id: "digits", label: "digits" },
  { id: "symbols", label: "symbols" },
];

function strength(bits: number): { tone: BadgeTone; label: string } {
  if (bits >= 80) return { tone: "success", label: "Strong" };
  if (bits >= 60) return { tone: "info", label: "Good" };
  if (bits >= 45) return { tone: "warning", label: "Fair" };
  return { tone: "danger", label: "Weak" };
}

export function PasswordTool() {
  const [mode, setMode] = useState<Mode>("random");
  // Random options
  const [length, setLength] = useState(16);
  const [cl, setCl] = useState<Record<ClKey, boolean>>({
    lowercase: true,
    uppercase: true,
    digits: true,
    symbols: true,
  });
  // Passphrase options
  const [wordCount, setWordCount] = useState(5);
  const [separator, setSeparator] = useState(" ");
  // Token options
  const [tokenBytes, setTokenBytes] = useState(32);
  const [tokenEncoding, setTokenEncoding] = useState<TokenEncoding>("hex");
  // Output + paste-to-check input
  const [output, setOutput] = useState("");
  const [check, setCheck] = useState("");
  const [nonce, setNonce] = useState(0);

  // Generation must not run during SSR or the hydration render: the
  // prerender would bake build-time values into the HTML and the client
  // would roll different ones (hydration mismatch). Roll in a callback
  // scheduled after mount instead; option changes regenerate immediately.
  useEffect(() => {
    const t = setTimeout(() => {
      setOutput(
        mode === "random"
          ? generateRandomPassword({
              length,
              lowercase: cl.lowercase,
              uppercase: cl.uppercase,
              digits: cl.digits,
              symbols: cl.symbols,
            })
          : mode === "passphrase"
            ? generatePassphrase({ wordCount, separator })
            : generateToken(tokenBytes, tokenEncoding),
      );
    }, 0);
    return () => clearTimeout(t);
  }, [mode, length, cl, wordCount, separator, tokenBytes, tokenEncoding, nonce]);

  // At least one character class must stay enabled: the generator throws
  // otherwise, and auto-regeneration would surface that as an uncaught error.
  const toggleClass = (id: ClKey) =>
    setCl((c) => {
      const othersOn = (Object.keys(c) as ClKey[]).some((k) => k !== id && c[k]);
      return c[id] && !othersOn ? c : { ...c, [id]: !c[id] };
    });

  const entropy = useMemo(() => {
    if (!output) return null;
    if (mode === "passphrase") {
      // Exact: each word is one of WORD_COUNT, chosen uniformly.
      return { bits: Math.round(wordCount * Math.log2(WORD_COUNT) * 10) / 10, notes: [] as string[] };
    }
    if (mode === "token") return { bits: tokenBytes * 8, notes: [] };
    return { bits: randomPasswordBits(length, cl), notes: [] as string[] };
  }, [output, mode, wordCount, tokenBytes, length, cl]);

  const checkEst = useMemo(() => {
    const s = check.trim();
    return s ? estimateEntropy(s) : null;
  }, [check]);

  const strengthOf = entropy ? strength(entropy.bits) : null;

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
        <div className="ml-auto">
          <Button variant="primary" onClick={() => setNonce((n) => n + 1)}>
            <RefreshCw size={13} />
            Generate
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-lg border border-border bg-surface px-4 py-3">
        {mode === "random" && (
          <>
            <label htmlFor="pw-length" className="flex items-center gap-2 text-[13px] text-muted">
              Length
              <input
                id="pw-length"
                type="range"
                min={8}
                max={64}
                value={length}
                onChange={(e) => setLength(Number(e.target.value))}
                className="h-1.5 w-36 cursor-pointer appearance-none rounded-full bg-border accent-accent"
              />
              <span className="w-8 text-center font-mono text-sm text-foreground">{length}</span>
            </label>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              {CLASSES.map((c) => (
                <label key={c.id} className="flex cursor-pointer items-center gap-1.5 text-[13px] text-muted">
                  <input
                    type="checkbox"
                    checked={cl[c.id]}
                    onChange={() => toggleClass(c.id)}
                    className="h-3.5 w-3.5 accent-accent"
                  />
                  {c.label}
                </label>
              ))}
            </div>
          </>
        )}
        {mode === "passphrase" && (
          <>
            <label htmlFor="pw-words" className="flex items-center gap-2 text-[13px] text-muted">
              Words
              <input
                id="pw-words"
                type="range"
                min={4}
                max={8}
                value={wordCount}
                onChange={(e) => setWordCount(Number(e.target.value))}
                className="h-1.5 w-32 cursor-pointer appearance-none rounded-full bg-border accent-accent"
              />
              <span className="w-5 text-center font-mono text-sm text-foreground">{wordCount}</span>
            </label>
            <label htmlFor="pw-sep" className="flex items-center gap-2 text-[13px] text-muted">
              Separator
              <select
                id="pw-sep"
                value={separator}
                onChange={(e) => setSeparator(e.target.value)}
                className="h-7 rounded-md border border-border bg-elevated px-2 font-mono text-[13px] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
              >
                <option value=" ">space</option>
                <option value="-">dash</option>
                <option value="_">underscore</option>
                <option value=".">dot</option>
              </select>
            </label>
            <span className="text-[13px] text-faint">{wordCount} × log₂({WORD_COUNT.toLocaleString()}) words</span>
          </>
        )}
        {mode === "token" && (
          <>
            <label htmlFor="pw-bytes" className="flex items-center gap-2 text-[13px] text-muted">
              Bytes
              <input
                id="pw-bytes"
                type="range"
                min={8}
                max={64}
                value={tokenBytes}
                onChange={(e) => setTokenBytes(Number(e.target.value))}
                className="h-1.5 w-36 cursor-pointer appearance-none rounded-full bg-border accent-accent"
              />
              <span className="w-8 text-center font-mono text-sm text-foreground">{tokenBytes}</span>
            </label>
            <label htmlFor="pw-enc" className="flex items-center gap-2 text-[13px] text-muted">
              Encoding
              <select
                id="pw-enc"
                value={tokenEncoding}
                onChange={(e) => setTokenEncoding(e.target.value as TokenEncoding)}
                className="h-7 rounded-md border border-border bg-elevated px-2 font-mono text-[13px] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
              >
                <option value="hex">hex</option>
                <option value="base64url">base64url</option>
              </select>
            </label>
            <span className="text-[13px] text-faint">{tokenBytes * 8} bits of uniform randomness</span>
          </>
        )}
      </div>

      <Panel title="Result" actions={<CopyButton text={output} label="Copy" disabled={!output} />}>
        <div className="break-all font-mono text-sm leading-relaxed text-foreground">{output || "…"}</div>
        {entropy && strengthOf && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border-subtle pt-3">
            <Badge tone={strengthOf.tone}>{strengthOf.label}</Badge>
            <span className="text-[13px] text-muted">
              {entropy.bits} bits · guessable in {crackTime(entropy.bits)}
            </span>
            {entropy.notes.length > 0 && (
              <span className="text-[13px] text-faint">({entropy.notes.join(", ")})</span>
            )}
          </div>
        )}
      </Panel>

      <Panel title="Check an existing password" bodyClassName="space-y-3">
        <input
          type="text"
          value={check}
          onChange={(e) => setCheck(e.target.value)}
          placeholder="Paste or type a candidate to estimate its entropy"
          spellCheck={false}
          autoComplete="off"
          aria-label="Password to check"
          className="w-full rounded-md border border-border bg-elevated/50 px-3 py-2 font-mono text-sm text-foreground outline-none placeholder:text-faint focus-visible:ring-2 focus-visible:ring-accent/50"
        />
        {checkEst && (
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={strength(checkEst.bits).tone}>{strength(checkEst.bits).label}</Badge>
            <span className="text-[13px] text-muted">
              {checkEst.bits} bits · guessable in {crackTime(checkEst.bits)}
            </span>
            {checkEst.notes.length > 0 && (
              <span className="text-[13px] text-faint">({checkEst.notes.join(", ")})</span>
            )}
          </div>
        )}
      </Panel>

      <p className="text-[13px] text-faint">
        Generated with <span className="font-mono">crypto.getRandomValues()</span> in your browser. Nothing is
        stored or sent anywhere.
      </p>
    </div>
  );
}
