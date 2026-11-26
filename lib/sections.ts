import { BookOpen, Dices, Fingerprint, Globe, KeyRound, Mail, Server, type LucideIcon } from "lucide-react";

/**
 * Canonical registry of tool *sections*: the path-grouped areas of the site
 * that sit alongside the home-page tools (lib/tools.ts).
 *
 * Home tools are the paste-and-transform family; sections hold everything
 * else: live lookups (DNS), email auth, generators, and reference material.
 * The ToolsMenu (hamburger) and sitemap derive from this registry.
 *
 * Entries are added only when the section's first tool is live, so the menu
 * and sitemap never point at routes that don't exist yet.
 */
export interface SectionTool {
  /** Last path segment, e.g. "headers" in "email/headers". */
  slug: string;
  name: string;
  description: string;
  icon: LucideIcon;
  keywords: string[];
  /** Full route relative to the site root, no leading/trailing slash, e.g. "email/headers". */
  path: string;
  /** True when the tool sends requests from the browser to outside services (only on a user action). */
  network?: boolean;
}

export interface Section {
  /** Route prefix, e.g. "email" for /email/. */
  slug: string;
  name: string;
  description: string;
  icon: LucideIcon;
  /** True when the section has its own landing page at `/${slug}/` (distinct from its tool routes). */
  landing: boolean;
  tools: SectionTool[];
}

export const SECTIONS: Section[] = [
  {
    slug: "dns",
    name: "DNS",
    description: "Domain and DNS inspection.",
    icon: Globe,
    // The /dns/ page is both the section and its (only) tool; no landing.
    landing: false,
    tools: [
      {
        slug: "dns",
        name: "Domain Inspector",
        description: "DNS records, email-auth (SPF/DMARC/DKIM), resolver compare, and certificate history.",
        icon: Globe,
        keywords: [
          "dns",
          "domain",
          "dns lookup",
          "dns-over-https",
          "spf",
          "dmarc",
          "dkim",
          "certificate",
          "crt.sh",
          "dig",
          "nslookup",
        ],
        path: "dns",
        network: true,
      },
    ],
  },
  {
    slug: "email",
    name: "Email",
    description: "Email-authentication (SPF, DKIM, DMARC) tools.",
    icon: Mail,
    // /email/ is a real landing page linking to the section's tools.
    landing: true,
    tools: [
      {
        slug: "headers",
        name: "Email Header Analyzer",
        description:
          "Paste raw headers to read SPF, DKIM, and DMARC results, the hop-by-hop delivery path with delays, and plain-English flags.",
        icon: Mail,
        keywords: [
          "email",
          "email headers",
          "header analyzer",
          "spf",
          "dkim",
          "dmarc",
          "authentication-results",
          "received",
          "bounce",
          "phishing",
        ],
        path: "email/headers",
      },
      {
        slug: "dkim",
        name: "DKIM Key Generator",
        description:
          "Generate an RSA DKIM keypair: the public TXT record for your DNS and the private key for your mail server.",
        icon: KeyRound,
        keywords: ["dkim", "dkim key", "keypair", "rsa", "domainkey", "signing key", "txt record"],
        path: "email/dkim",
      },
    ],
  },
  {
    slug: "generate",
    name: "Generate",
    description: "Identifier and secret generators.",
    icon: Dices,
    // /generate/ is a real landing page linking to the section's tools.
    landing: true,
    tools: [
      {
        slug: "uuid",
        name: "UUID & ULID",
        description: "Bulk-generate up to 100 UUID v4 or ULID identifiers.",
        icon: Fingerprint,
        keywords: ["uuid", "ulid", "guid", "id", "identifier"],
        path: "generate/uuid",
      },
      {
        slug: "password",
        name: "Password & Token",
        description:
          "Generate random passwords, EFF wordlist passphrases, and API tokens, and estimate the entropy of candidates you paste.",
        icon: KeyRound,
        keywords: [
          "password",
          "passphrase",
          "token",
          "secret",
          "entropy",
          "api key",
          "generate",
          "random",
        ],
        path: "generate/password",
      },
    ],
  },
  {
    slug: "reference",
    name: "Reference",
    description: "Browse-only reference tables.",
    icon: BookOpen,
    // /reference/ is a real landing page linking to the section's tools.
    landing: true,
    tools: [
      {
        slug: "status",
        name: "HTTP Status Codes",
        description: "Every assigned IANA status code, with a plain-English note on meaning and origin. Filter by code or keyword.",
        icon: Server,
        keywords: ["http", "status", "status code", "404", "500", "rest", "api", "rfc"],
        path: "reference/status",
      },
    ],
  },
];
