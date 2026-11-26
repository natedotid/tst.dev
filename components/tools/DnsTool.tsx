"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Badge, Button, ErrorBanner, Field, Panel } from "@/components/ui";
import {
  isValidDomain,
  joinTxtStrings,
  lookupDoh,
  normalizeDomainInput,
  type DohAnswer,
  type DohResult,
  type DohType,
} from "@/lib/doh";
import { crtShUrl, newestCerts, parseCrtSh, type CtParse } from "@/lib/ct";
import { countSpfLookups, explainSpf, parseSpf } from "@/lib/spf";
import { explainDmarc, parseDmarc } from "@/lib/dmarc";
import { explainDkim, parseDkimRecord } from "@/lib/dkim-records";

const RECORD_TYPES: DohType[] = ["A", "AAAA", "NS", "MX", "TXT", "SOA", "CAA"];

/** DKIM selectors are one or more DNS labels (RFC 6376 §3.1). */
const SELECTOR_RE = /^[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)*$/;

type ResolverId = "cloudflare" | "google";
const RESOLVERS: { id: ResolverId; label: string }[] = [
  { id: "cloudflare", label: "Cloudflare" },
  { id: "google", label: "Google" },
];

interface LookupState {
  domain: string;
  resolver: ResolverId;
  records: Record<DohType, DohResult>;
  /** TXT for `_dmarc.<domain>` (where DMARC lives), separate from the apex TXT. */
  dmarc: DohResult;
  secondary?: { resolver: ResolverId; records: Record<DohType, DohResult> };
}

interface CertState {
  domain: string;
  parse: CtParse;
}

/** Diff two answer sets for the resolver-comparison view. */
function diffAnswers(a: DohAnswer[], b: DohAnswer[]) {
  const key = (x: DohAnswer) => `${x.name}|${x.type}|${x.data}`;
  const setA = new Set(a.map(key));
  const setB = new Set(b.map(key));
  const added = b.filter((x) => !setA.has(key(x))); // in the other resolver, not primary
  const removed = a.filter((x) => !setB.has(key(x))); // in primary, not the other
  return { added, removed, match: added.length === 0 && removed.length === 0 };
}

function resolverLabel(id: ResolverId): string {
  return RESOLVERS.find((r) => r.id === id)?.label ?? id;
}

export function DnsTool() {
  const [domain, setDomain] = useState("");
  const [resolver, setResolver] = useState<ResolverId>("cloudflare");
  const [compare, setCompare] = useState(false);
  const [lookup, setLookup] = useState<LookupState | null>(null);
  const [looking, setLooking] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);

  const [certs, setCerts] = useState<CertState | null>(null);
  const [checkingCerts, setCheckingCerts] = useState(false);
  const [certError, setCertError] = useState<string | null>(null);

  const [dkimSelector, setDkimSelector] = useState("");
  const [dkim, setDkim] = useState<{ selector: string; record: string | null; error: string | null } | null>(null);
  const [checkingDkim, setCheckingDkim] = useState(false);

  const trimmed = normalizeDomainInput(domain);

  async function handleLookup() {
    if (!isValidDomain(trimmed)) {
      setLookupError("Enter a valid domain to look up (e.g. example.com).");
      return;
    }
    setLookupError(null);
    setCerts(null);
    setCertError(null);
    setDkim(null);
    setLooking(true);
    try {
      const other: ResolverId = resolver === "cloudflare" ? "google" : "cloudflare";
      const [recordResults, dmarcResult, secResults] = await Promise.all([
        Promise.all(RECORD_TYPES.map((t) => lookupDoh(resolver, trimmed, t))),
        lookupDoh(resolver, `_dmarc.${trimmed}`, "TXT"),
        compare ? Promise.all(RECORD_TYPES.map((t) => lookupDoh(other, trimmed, t))) : Promise.resolve(null),
      ]);
      const records = {} as Record<DohType, DohResult>;
      RECORD_TYPES.forEach((t, i) => {
        records[t] = recordResults[i];
      });
      let secondary;
      if (secResults) {
        const secRecords = {} as Record<DohType, DohResult>;
        RECORD_TYPES.forEach((t, i) => {
          secRecords[t] = secResults[i];
        });
        secondary = { resolver: other, records: secRecords };
      }
      setLookup({ domain: trimmed, resolver, records, dmarc: dmarcResult, secondary });
    } finally {
      setLooking(false);
    }
  }

  async function handleCerts() {
    const d = lookup?.domain ?? trimmed;
    if (!isValidDomain(d)) {
      setCertError("Look up a domain first, then check its certificates.");
      return;
    }
    setCertError(null);
    setCerts(null);
    setCheckingCerts(true);
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 30_000);
    try {
      const res = await fetch(crtShUrl(d), { headers: { accept: "application/json" }, signal: ac.signal });
      if (!res.ok) throw new Error(`crt.sh returned HTTP ${res.status}`);
      const parse = parseCrtSh(await res.json(), d);
      if (parse.error) {
        setCertError(parse.error);
        return;
      }
      setCerts({ domain: d, parse });
    } catch (e) {
      setCertError(
        e instanceof DOMException && e.name === "AbortError"
          ? "crt.sh didn’t respond within 30 seconds. It is often overloaded; try again later."
          : e instanceof Error
            ? e.message
            : "Failed to fetch certificate-transparency data.",
      );
    } finally {
      clearTimeout(timer);
      setCheckingCerts(false);
    }
  }

  async function handleDkim() {
    if (!lookup) return;
    const selector = dkimSelector.trim();
    if (!SELECTOR_RE.test(selector)) {
      setDkim({ selector, record: null, error: "Enter a selector: letters, digits, '-', '_' or '.'." });
      return;
    }
    setCheckingDkim(true);
    try {
      const name = `${selector}._domainkey.${lookup.domain}`;
      const res = await lookupDoh(lookup.resolver, name, "TXT");
      if (res.error) {
        setDkim({ selector, record: null, error: res.error });
        return;
      }
      // DKIM names are often CNAMEs to a provider; only TXT answers hold the key.
      const texts = res.answers.filter((a) => a.type === "TXT").map((a) => joinTxtStrings(a.data));
      // v= is optional in DKIM records (RFC 6376 §3.6.1), so also accept a bare p= record.
      const record = texts.find((t) => /^\s*v=DKIM1\b/i.test(t) || /(^|;)\s*p=/.test(t)) ?? null;
      setDkim({ selector, record, error: null });
    } finally {
      setCheckingDkim(false);
    }
  }

  const email = useMemo(() => {
    if (!lookup) return null;
    // TXT answers arrive as quoted character-strings; join them before matching.
    const apexTxt = lookup.records.TXT.answers.map((a) => joinTxtStrings(a.data));
    const spfText = apexTxt.find((t) => /^v=spf1\b/i.test(t.trim()));
    const dmarcText = lookup.dmarc.answers
      .map((a) => joinTxtStrings(a.data))
      .find((t) => /^v=DMARC1\b/i.test(t.trim()));
    return {
      spf: spfText ? parseSpf(spfText) : null,
      spfLookups: spfText ? countSpfLookups(spfText) : null,
      spfExplain: spfText ? explainSpf(spfText) : null,
      dmarc: dmarcText ? parseDmarc(dmarcText) : null,
      dmarcExplain: dmarcText ? explainDmarc(dmarcText) : null,
    };
  }, [lookup]);

  return (
    <div className="space-y-4">
      {/* ------------------------------- Controls ------------------------------- */}
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-56 flex-1 overflow-hidden rounded-md border border-border bg-surface focus-within:border-accent/40">
          <input
            type="text"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleLookup()}
            placeholder="example.com"
            spellCheck={false}
            autoComplete="off"
            aria-label="Domain to look up"
            className="block h-9 w-full bg-transparent px-3 font-mono text-sm text-foreground outline-none placeholder:font-sans placeholder:text-faint"
          />
        </div>
        <label className="flex h-9 items-center gap-2 rounded-md border border-border bg-surface px-3 text-[13px] text-muted">
          <span className="whitespace-nowrap">Resolver</span>
          <select
            value={resolver}
            onChange={(e) => setResolver(e.target.value as ResolverId)}
            aria-label="DNS-over-HTTPS resolver"
            className="bg-transparent text-foreground outline-none"
          >
            {RESOLVERS.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
        <Button variant="primary" onClick={handleLookup} disabled={looking}>
          {looking ? "Looking up…" : "Lookup"}
        </Button>
      </div>

      <label className="flex w-fit cursor-pointer items-center gap-2 text-[13px] text-muted">
        <input
          type="checkbox"
          checked={compare}
          onChange={(e) => setCompare(e.target.checked)}
          className="h-3.5 w-3.5 accent-accent"
        />
        Compare against the other resolver
      </label>

      {lookupError && <ErrorBanner>{lookupError}</ErrorBanner>}

      {!lookup && !lookupError && (
        <Panel title="Result">
          <p className="py-4 text-center text-[13px] text-faint">
            Enter a domain and choose a resolver, then click Lookup. Nothing is fetched until you do.
          </p>
        </Panel>
      )}

      {lookup && (
        <RecordsPanel lookup={lookup} />
      )}

      {lookup && email && (
        <EmailAuthPanel
          email={email}
          lookup={lookup}
          dkimSelector={dkimSelector}
          setDkimSelector={setDkimSelector}
          dkim={dkim}
          checkingDkim={checkingDkim}
          onDkim={handleDkim}
        />
      )}

      {lookup?.secondary && (
        <ResolversPanel lookup={lookup} />
      )}

      <CertificatesPanel
        domain={lookup?.domain ?? trimmed}
        certs={certs}
        checking={checkingCerts}
        error={certError}
        onCheck={handleCerts}
      />

      <PrivacyNote />
    </div>
  );
}

/* ------------------------------ Records panel ------------------------------ */

function RecordsPanel({ lookup }: { lookup: LookupState }) {
  return (
    <Panel
      title={`Records · ${lookup.domain} · ${resolverLabel(lookup.resolver)}`}
    >
      <div className="space-y-0.5">
        {RECORD_TYPES.map((t) => (
          <RecordRow key={t} type={t} result={lookup.records[t]} />
        ))}
      </div>
    </Panel>
  );
}

function RecordRow({ type, result }: { type: DohType; result: DohResult }) {
  const answers = result.answers;
  return (
    <div className="border-b border-border-subtle py-2 last:border-0">
      <div className="mb-1 flex items-center gap-2">
        <Badge tone="accent" className="font-mono">
          {type}
        </Badge>
        {result.error && <span className="text-[12px] text-danger">{result.error}</span>}
        {!result.error && result.status === "NXDOMAIN" && (
          <span className="text-[12px] text-faint">NXDOMAIN (no such name)</span>
        )}
        {!result.error && result.status !== "NOERROR" && result.status !== "NXDOMAIN" && (
          <span className="text-[12px] text-danger">{result.status}</span>
        )}
      </div>
      {!result.error && answers.length === 0 && (
        <p className="text-[13px] text-faint">No {type} records.</p>
      )}
      <div className="space-y-1">
        {answers.map((a, i) => (
          <div key={i} className="flex gap-3 font-mono text-[13px] leading-relaxed">
            <span className="w-40 shrink-0 break-all text-faint">{a.name}</span>
            <span className="min-w-0 break-all text-foreground/90">{a.data}</span>
            <span className="ml-auto shrink-0 text-faint">{a.ttl}s</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* --------------------------- Email auth panel ------------------------------ */

type DkimState = { selector: string; record: string | null; error: string | null } | null;

function EmailAuthPanel({
  email,
  lookup,
  dkimSelector,
  setDkimSelector,
  dkim,
  checkingDkim,
  onDkim,
}: {
  email: EmailShape;
  lookup: LookupState;
  dkimSelector: string;
  setDkimSelector: (value: string) => void;
  dkim: DkimState;
  checkingDkim: boolean;
  onDkim: () => void;
}) {
  const dkimParsed = dkim?.record ? parseDkimRecord(dkim.record) : null;
  return (
    <Panel title="Email authentication">
      <div className="space-y-4">
        {/* SPF */}
        <div>
          <SubHeading label="SPF" present={!!email.spf} />
          {email.spf && email.spfExplain && email.spfLookups ? (
            <div className="space-y-1">
              <ul className="space-y-0.5 text-[13px] leading-relaxed text-foreground/90">
                {email.spfExplain.map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
              </ul>
              <Field label="DNS lookups" mono={false}>
                {email.spfLookups.staticLookups} of 10
                {email.spfLookups.wouldExceed && (
                  <span className="ml-1 text-danger">(over the limit)</span>
                )}
              </Field>
              {email.spf.unknownTokens.length > 0 && (
                <p className="text-[12px] text-warning">
                  Unrecognized: {email.spf.unknownTokens.join(", ")}
                </p>
              )}
            </div>
          ) : (
            <p className="text-[13px] text-faint">No SPF record found in the apex TXT.</p>
          )}
        </div>

        {/* DMARC */}
        <div>
          <SubHeading label="DMARC" present={!!email.dmarc} />
          {email.dmarc && email.dmarcExplain ? (
            <div className="space-y-1">
              <ul className="space-y-0.5 text-[13px] leading-relaxed text-foreground/90">
                {email.dmarcExplain.map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
              </ul>
              {email.dmarc.unknownTags.length > 0 && (
                <p className="text-[12px] text-warning">Unrecognized tags: {email.dmarc.unknownTags.join(", ")}</p>
              )}
            </div>
          ) : (
            <p className="text-[13px] text-faint">
              No DMARC record at <span className="font-mono">_dmarc.{lookup.domain}</span>.
            </p>
          )}
        </div>

        {/* DKIM */}
        <div>
          <SubHeading label="DKIM" present={!!dkim?.record} />
          <p className="text-[13px] leading-relaxed text-muted">
            DKIM keys live at{" "}
            <span className="font-mono text-foreground/90">&lt;selector&gt;._domainkey.{lookup.domain}</span>.
            Find the selector (the s= tag) in a message&rsquo;s DKIM-Signature header with the{" "}
            <Link
              href="/email/headers/"
              className="text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent"
            >
              email header analyzer
            </Link>
            .
          </p>
          <div className="mt-2 flex items-center gap-2">
            <div className="flex min-w-0 flex-1 items-center rounded-md border border-border bg-surface px-3 transition-colors focus-within:border-accent/40">
              <input
                type="text"
                value={dkimSelector}
                onChange={(e) => setDkimSelector(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && onDkim()}
                placeholder="selector, e.g. google"
                spellCheck={false}
                autoComplete="off"
                aria-label="DKIM selector"
                className="block h-8 w-full min-w-0 bg-transparent font-mono text-[13px] text-foreground outline-none placeholder:font-sans placeholder:text-faint"
              />
            </div>
            <Button size="sm" onClick={onDkim} disabled={checkingDkim}>
              {checkingDkim ? "Checking…" : "Check"}
            </Button>
          </div>
          {dkim && dkim.error && <ErrorBanner className="mt-2">{dkim.error}</ErrorBanner>}
          {dkim && !dkim.error && dkim.record ? (
            <div className="mt-2 space-y-1">
              <ul className="space-y-0.5 text-[13px] leading-relaxed text-foreground/90">
                {explainDkim(dkim.record).map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
              </ul>
              {dkimParsed && dkimParsed.unknownTags.length > 0 && (
                <p className="text-[12px] text-warning">Unrecognized tags: {dkimParsed.unknownTags.join(", ")}</p>
              )}
            </div>
          ) : (
            dkim && !dkim.error && (
              <p className="mt-2 text-[13px] text-faint">
                No DKIM record at{" "}
                <span className="font-mono">
                  {dkim.selector}._domainkey.{lookup.domain}
                </span>
                .
              </p>
            )
          )}
        </div>
      </div>
    </Panel>
  );
}

// The derived email-authentication shape computed by the useMemo in DnsTool.
type EmailShape = {
  spf: ReturnType<typeof parseSpf> | null;
  spfLookups: ReturnType<typeof countSpfLookups> | null;
  spfExplain: string[] | null;
  dmarc: ReturnType<typeof parseDmarc> | null;
  dmarcExplain: string[] | null;
};

function SubHeading({ label, present }: { label: string; present: boolean }) {
  return (
    <div className="mb-1.5 flex items-center gap-2">
      <h3 className="text-xs font-medium uppercase tracking-wider text-muted">{label}</h3>
      <Badge tone={present ? "success" : "neutral"}>{present ? "found" : "not found"}</Badge>
    </div>
  );
}

/* ---------------------------- Resolvers panel ------------------------------ */

function ResolversPanel({ lookup }: { lookup: LookupState }) {
  if (!lookup.secondary) return null;
  const primary = lookup.resolver;
  const other = lookup.secondary.resolver;
  return (
    <Panel title={`Resolvers · ${resolverLabel(primary)} vs ${resolverLabel(other)}`}>
      <div className="space-y-0.5">
        {RECORD_TYPES.map((t) => {
          const a = lookup.records[t];
          const b = lookup.secondary!.records[t];
          const diff = diffAnswers(a.answers, b.answers);
          return (
            <div key={t} className="border-b border-border-subtle py-2 last:border-0">
              <div className="mb-1 flex items-center gap-2">
                <Badge tone="accent" className="font-mono">
                  {t}
                </Badge>
                {diff.match ? (
                  <span className="text-[12px] text-success">identical</span>
                ) : (
                  <span className="text-[12px] text-warning">
                    {diff.added.length > 0 && `+${diff.added.length}`}
                    {diff.added.length > 0 && diff.removed.length > 0 && " "}
                    {diff.removed.length > 0 && `−${diff.removed.length}`}
                  </span>
                )}
              </div>
              {!diff.match && (
                <div className="space-y-1 font-mono text-[13px]">
                  {diff.added.map((x, i) => (
                    <div key={`a${i}`} className="flex gap-2 text-success">
                      <span className="shrink-0">+</span>
                      <span className="min-w-0 break-all">{x.data}</span>
                    </div>
                  ))}
                  {diff.removed.map((x, i) => (
                    <div key={`r${i}`} className="flex gap-2 text-danger">
                      <span className="shrink-0">−</span>
                      <span className="min-w-0 break-all">{x.data}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

/* --------------------------- Certificates panel ---------------------------- */

function certState(notAfter: string): { label: string; expired: boolean } {
  const d = new Date(notAfter.replace(" ", "T") + "Z");
  const expired = !Number.isNaN(d.getTime()) && d.getTime() < Date.now();
  return { label: expired ? "expired" : "valid", expired };
}

function CertificatesPanel({
  domain,
  certs,
  checking,
  error,
  onCheck,
}: {
  domain: string;
  certs: CertState | null;
  checking: boolean;
  error: string | null;
  onCheck: () => void;
}) {
  return (
    <Panel
      title="Certificates"
      actions={
        <Button size="sm" onClick={onCheck} disabled={checking || !isValidDomain(domain)}>
          {checking ? "Checking…" : "Check certificates"}
        </Button>
      }
    >
      <p className="mb-2 text-[12px] text-faint">
        Source: crt.sh, a third-party certificate-transparency index. Requests go directly from your
        browser to crt.sh.
      </p>
      {error && <ErrorBanner>{error}</ErrorBanner>}
      {certs && (
        <div className="space-y-3">
          {certs.parse.certs.length === 0 ? (
            <p className="text-[13px] text-faint">No certificates found for {certs.domain}.</p>
          ) : (
            <>
              {certs.parse.certs.length > 200 && (
                <p className="text-[12px] text-faint">
                  Showing the 200 newest of {certs.parse.certs.length} certificates.
                </p>
              )}
              <div className="overflow-x-auto rounded-md border border-border-subtle">
                <table className="w-full text-left text-[13px]">
                  <thead>
                    <tr className="border-b border-border-subtle text-[11px] uppercase tracking-wider text-faint">
                      <th className="px-3 py-2 font-medium">Common name</th>
                      <th className="px-3 py-2 font-medium">Issuer</th>
                      <th className="px-3 py-2 font-medium">Valid until</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {newestCerts(certs.parse.certs, 200).map((c, i) => {
                      const st = certState(c.notAfter);
                      return (
                        <tr key={i} className="border-b border-border-subtle last:border-0">
                          <td className="break-all px-3 py-2 font-mono text-foreground/90">{c.commonName}</td>
                          <td className="break-all px-3 py-2 text-muted">{c.issuer}</td>
                          <td className="whitespace-nowrap px-3 py-2 font-mono text-muted">{c.notAfter}</td>
                          <td className="px-3 py-2">
                            <Badge tone={st.expired ? "danger" : "success"}>{st.label}</Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {certs.parse.subdomains.length > 0 && (
                <div>
                  <p className="mb-1.5 text-[12px] uppercase tracking-wider text-faint">
                    Discovered subdomains
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {certs.parse.subdomains.map((s) => (
                      <Badge key={s} tone="info" className="font-mono">
                        {s}.{certs.domain}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </Panel>
  );
}

/* ------------------------------ Privacy note ------------------------------- */

function PrivacyNote() {
  return (
    <Panel title="Privacy">
      <p className="text-[13px] leading-relaxed text-muted">
        Lookups go <strong className="text-foreground/90">directly from your browser</strong> to the
        DNS-over-HTTPS resolver you chose (Cloudflare or Google) and, for certificates, to crt.sh’s
        public certificate-transparency index. The DKIM selector check uses the same resolver.
        Nothing is looked up until you click.
      </p>
    </Panel>
  );
}
