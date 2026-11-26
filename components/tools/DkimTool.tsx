"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { CodePreview, ErrorBanner, Field, Panel, Button, CopyButton } from "@/components/ui";
import { base64ChunkForTxt, formatDkimTxt, generateDkimKeyPair, type DkimRecord } from "@/lib/dkim-keygen";
import { useRememberedField } from "@/lib/remember";

type KeyBits = 2048 | 1024;

interface Generated {
  record: DkimRecord;
  /** The TXT value split into ≤255-octet quoted strings (zone-file form). */
  chunked: string;
  privatePem: string;
  bits: KeyBits;
}

function downloadPem(pem: string, filename: string) {
  const blob = new Blob([pem], { type: "application/x-pem-file" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const inputClass =
  "h-8 min-w-0 flex-1 rounded-md border border-border bg-surface px-2.5 font-mono text-[13px] text-foreground outline-none transition-colors placeholder:text-faint focus:border-accent/40";

export function DkimTool() {
  const [selector, setSelector] = useRememberedField("email/dkim", "selector", "default");
  const [domain, setDomain] = useRememberedField("email/dkim", "domain", "");
  const [bits, setBits] = useState<KeyBits>(2048);
  const [result, setResult] = useState<Generated | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const handleGenerate = async () => {
    setError(null);
    // Validate before the ~1–2 s key generation so bad input fails fast.
    try {
      formatDkimTxt(selector, domain, "QUJD");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return;
    }
    setGenerating(true);
    try {
      const kp = await generateDkimKeyPair(bits);
      const record = formatDkimTxt(selector, domain, kp.publicBase64);
      setResult({ record, chunked: base64ChunkForTxt(kp.publicBase64), privatePem: kp.privatePem, bits });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-4">
      <Panel title="Key parameters">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-40 flex-1 flex-col gap-1.5">
            <span className="text-xs uppercase tracking-wider text-faint">Selector</span>
            <input
              value={selector}
              onChange={(e) => setSelector(e.target.value)}
              placeholder="default"
              spellCheck={false}
              className={inputClass}
            />
          </label>
          <label className="flex min-w-52 flex-[2] flex-col gap-1.5">
            <span className="text-xs uppercase tracking-wider text-faint">Domain</span>
            <input
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="example.com"
              spellCheck={false}
              className={inputClass}
            />
          </label>
          <label className="flex min-w-44 flex-col gap-1.5">
            <span className="text-xs uppercase tracking-wider text-faint">Key size</span>
            <select
              value={bits}
              onChange={(e) => setBits(Number(e.target.value) as KeyBits)}
              className={inputClass + " flex-none"}
            >
              <option value={2048}>2048-bit (recommended)</option>
              <option value={1024}>1024-bit (legacy)</option>
            </select>
          </label>
          <Button
            variant="primary"
            onClick={handleGenerate}
            disabled={generating || domain.trim() === ""}
            className="mb-px flex-none"
          >
            {generating ? "Generating…" : "Generate key"}
          </Button>
        </div>
        {bits === 1024 && (
          <p className="mt-3 text-[13px] leading-relaxed text-faint">
            1024-bit keys are legacy: still accepted by major providers, but shorter. Plan to rotate them more
            often.
          </p>
        )}
      </Panel>

      {error && <ErrorBanner>{error}</ErrorBanner>}

      {result && (
        <>
          <Panel title="Public key: DNS record" actions={<CopyButton text={result.record.txt} />}>
            <Field label="Record name">{result.record.name}</Field>
            <Field label="Record type" mono={false}>TXT</Field>
            <p className="mt-3 mb-1.5 text-xs uppercase tracking-wider text-faint">
              Value (wrapped for DNS; paste as-is)
            </p>
            <CodePreview text={result.chunked} />
            <p className="mt-3 text-[13px] leading-relaxed text-muted">
              Then verify it published:{" "}
              <a href="/dns/" className="text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent">
                check {result.record.name} in the Domain Inspector
              </a>
              , or just send a test email and analyze its headers.
            </p>
          </Panel>

          <Panel
            title="Private key"
            actions={
              <Button size="sm" variant="secondary" onClick={() => downloadPem(result.privatePem, `dkim-${result.bits}-${result.record.name.split(".")[0]}.pem`)}>
                <Download size={13} />
                Download .pem
              </Button>
            }
          >
            <p className="mb-3 text-[13px] leading-relaxed text-warning">
              Keep this key secret. Anyone with it can sign mail as your domain. It exists only in this tab:
              tst.dev never stores or transmits it, so <strong className="font-medium">save the file before closing
              this page</strong>.
            </p>
            <CodePreview text={result.privatePem} className="max-h-40" />
          </Panel>
        </>
      )}

      {!result && !error && (
        <p className="text-[13px] text-faint">
          Generate an RSA keypair for DKIM signing. You get the public TXT record to publish at{" "}
          <span className="font-mono">{selector.trim() || "selector"}._domainkey.{domain.trim() || "example.com"}</span>{" "}
          and the private key to hand to your mail server.
        </p>
      )}
    </div>
  );
}
