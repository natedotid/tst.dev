import {
  Braces,
  CalendarClock,
  Clock,
  FileDiff,
  Hash,
  KeyRound,
  Link2,
  Regex,
  Table2,
  type LucideIcon,
} from "lucide-react";
import { SECTIONS } from "./sections";

export interface Tool {
  /** Route without leading slash, e.g. "jwt". Links use `/${slug}/`. */
  slug: string;
  name: string;
  description: string;
  icon: LucideIcon;
  keywords: string[];
}

export const TOOLS: Tool[] = [
  {
    slug: "jwt",
    name: "JWT Inspector",
    description: "Decode tokens, inspect claims, check expiry.",
    icon: KeyRound,
    keywords: ["jwt", "token", "json web token", "auth", "exp"],
  },
  {
    slug: "json",
    name: "JSON Formatter",
    description: "Format, minify, validate & convert to YAML or NDJSON.",
    icon: Braces,
    keywords: ["json", "yaml", "ndjson", "jsonl", "format", "minify", "pretty", "parse"],
  },
  {
    slug: "diff",
    name: "Text Diff",
    description: "Side-by-side comparison with inline highlights.",
    icon: FileDiff,
    keywords: ["diff", "compare", "compare text", "patch"],
  },
  {
    slug: "regex",
    name: "Regex Tester",
    description: "Test patterns with live match highlighting.",
    icon: Regex,
    keywords: ["regex", "regexp", "pattern", "match", "capture"],
  },
  {
    slug: "hash",
    name: "Hash, HMAC & Codecs",
    description: "SHA-1/256/384/512 digests, HMAC, and Base64/Base32/hex codecs.",
    icon: Hash,
    keywords: ["hash", "sha", "sha256", "digest", "hmac", "signature", "base64", "base32", "hex", "codec", "encode", "decode"],
  },
  {
    slug: "epoch",
    name: "Epoch Converter",
    description: "Unix timestamps ↔ human-readable time.",
    icon: Clock,
    keywords: ["epoch", "unix", "timestamp", "time", "date", "utc"],
  },
  {
    slug: "cron",
    name: "Cron Explainer",
    description: "Plain-English schedules with next 5 runs.",
    icon: CalendarClock,
    keywords: ["cron", "schedule", "crontab", "job"],
  },
  {
    slug: "url",
    name: "URL Inspector",
    description: "Parse URLs, list query params, encode & decode.",
    icon: Link2,
    keywords: ["url", "uri", "link", "encode", "decode", "percent", "query", "query string"],
  },
  {
    slug: "csv",
    name: "CSV ↔ JSON",
    description: "Convert between CSV and JSON with header mapping.",
    icon: Table2,
    keywords: ["csv", "json", "convert", "comma", "delimited", "table", "import"],
  },
];

/**
 * Every tool on the site in one flat list: the home tools, then the section
 * tools in registry order. The ⌘K palette and the 404 page derive from this
 * so they can't miss a tool.
 */
export interface SiteTool {
  name: string;
  description: string;
  icon: LucideIcon;
  /** Route relative to the site root, no leading/trailing slash: "jwt", "email/headers". */
  path: string;
  keywords: string[];
  /** True when the tool sends requests from the browser to outside services (only on a user action). */
  network?: boolean;
}

export const SITE_TOOLS: SiteTool[] = [
  ...TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    icon: t.icon,
    path: t.slug,
    keywords: t.keywords,
  })),
  ...SECTIONS.flatMap((section) =>
    section.tools.map((t) => ({
      name: t.name,
      description: t.description,
      icon: t.icon,
      path: t.path,
      keywords: t.keywords,
      network: t.network,
    })),
  ),
];
