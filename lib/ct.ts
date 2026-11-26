/**
 * crt.sh certificate-transparency index: response parsing and URL builder.
 *
 * The fetch runs only when the user clicks "Check certificates", and the
 * browser sends it straight to crt.sh. Everything parseable is pure and
 * tested; there is deliberately no fetch wrapper here (the component calls
 * fetch inline so the third-party call stays visible at the call site).
 */

export interface CtCertificate {
  /** The primary name (crt.sh `common_name`). */
  commonName: string;
  /**
   * Every name the certificate covers, newline-separated exactly as crt.sh
   * reports it (`name_value`); it may include wildcard entries.
   */
  nameValue: string;
  issuer: string;
  /** Raw crt.sh date string, e.g. "2026-01-01 00:00:00". */
  notBefore: string;
  notAfter: string;
}

export interface CtParse {
  certs: CtCertificate[];
  /**
   * Subdomain parts relative to the queried domain, sorted and deduped:
   * "www.mail.example.com" for "example.com" → "www.mail";
   * "*.example.com" → "*". The apex itself is not included.
   */
  subdomains: string[];
  /** Set when the payload is not a crt.sh JSON array. */
  error?: string;
}

/** Build the crt.sh query URL for a domain's certificate history (%25. = "%."). */
export function crtShUrl(domain: string): string {
  return `https://crt.sh/?q=%25.${encodeURIComponent(domain.toLowerCase())}&output=json`;
}

/** Certificates sorted newest first (by notBefore), capped at `limit`. */
export function newestCerts(certs: CtCertificate[], limit: number): CtCertificate[] {
  return [...certs].sort((a, b) => b.notBefore.localeCompare(a.notBefore)).slice(0, limit);
}

export function parseCrtSh(json: unknown, domain: string): CtParse {
  if (!Array.isArray(json)) {
    return { certs: [], subdomains: [], error: "Malformed certificate transparency response" };
  }
  const base = domain.toLowerCase();
  const certs: CtCertificate[] = [];
  const names = new Set<string>();

  for (const entry of json) {
    if (typeof entry !== "object" || entry === null) continue;
    const rec = entry as Record<string, unknown>;
    if (typeof rec.common_name !== "string" || typeof rec.name_value !== "string") continue;
    certs.push({
      commonName: rec.common_name,
      nameValue: rec.name_value,
      issuer: typeof rec.issuer_name === "string" ? rec.issuer_name : "",
      notBefore: typeof rec.not_before === "string" ? rec.not_before : "",
      notAfter: typeof rec.not_after === "string" ? rec.not_after : "",
    });
    for (const raw of rec.name_value.split("\n")) {
      const name = raw.trim().toLowerCase();
      if (name === base) continue; // apex, not a subdomain
      if (name === `*.${base}`) {
        names.add("*");
        continue;
      }
      if (name.endsWith(`.${base}`)) names.add(name.slice(0, -(base.length + 1)));
      // Names for other domains in the response are ignored.
    }
  }

  const subdomains = [...names].filter((n) => n !== "").sort();
  return { certs, subdomains };
}
