import { base64UrlDecode } from "./utils";
import { base32Decode, hexDecode } from "./codec";
import { parseJsonl } from "./jsonl";

/** Result of running the smart-detection heuristics over a scratchpad input. */
export type Detection =
  | {
      kind: "jwt";
      header: Record<string, unknown> | null;
      payload: Record<string, unknown> | null;
      signature: string;
      headerError: string | null;
      payloadError: string | null;
      exp: number | null;
      iat: number | null;
      nbf: number | null;
      sub: string | null;
      /** null when the token carries no `exp` claim. */
      expired: boolean | null;
    }
  | { kind: "json"; data: unknown; formatted: string; minified: string }
  | { kind: "epoch"; value: number; date: Date; unit: "seconds" | "milliseconds" }
  | { kind: "cron"; expression: string }
  | { kind: "url"; raw: string; parsed: URL }
  | { kind: "base64"; encoded: string; decoded: string }
  | {
      /** Raw email headers (Received/From/Authentication-Results/DKIM-Signature). */
      kind: "headers";
      /** Parsed `name: value` pairs; folded continuation lines are appended. */
      pairs: { name: string; value: string }[];
    }
  | {
      kind: "jsonl";
      lineCount: number;
      okCount: number;
      errorCount: number;
      keyUnion: string[];
      /** First non-empty line, for the preview. */
      firstLine: string;
    }
  | { kind: "domain"; host: string }
  | { kind: "hex"; encoded: string; /** null when the bytes are not UTF-8 text. */ decoded: string | null; byteLength: number }
  | { kind: "base32"; encoded: string; /** null when the bytes are not UTF-8 text. */ decoded: string | null; byteLength: number }
  | { kind: "text"; length: number };

const JWT_RE = /^\s*([A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{0,})\s*$/;
const EPOCH_RE = /^\s*(\d{10}|\d{13})\s*$/;
const CRON_TOKEN_RE = /^[0-9A-Za-z*,/?LW#-]+$/;
const BASE64_RE = /^[A-Za-z0-9+/]{16,}={0,2}$/;
const URL_RE = /^\s*(https?:\/\/[^\s]+)\s*$/i;
/** One line of a header block: `Name: value` (name is a bare token). */
const HEADER_LINE_RE = /^[A-Za-z][A-Za-z0-9-]*:\s*\S/;

function tryB64UrlJson(segment: string): { value: Record<string, unknown> } | { error: string } {
  try {
    const json = JSON.parse(base64UrlDecode(segment));
    if (json === null || typeof json !== "object" || Array.isArray(json)) {
      return { error: "not a JSON object" };
    }
    return { value: json };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "decode failed" };
  }
}

function looksTextual(decoded: string): boolean {
  if (decoded.length === 0) return false;
  let printable = 0;
  const sample = Math.min(decoded.length, 512);
  for (let i = 0; i < sample; i++) {
    const c = decoded.charCodeAt(i);
    // U+FFFD marks bytes that failed UTF-8 decoding; a run of them is binary
    // data, not text, even though it's a "high" code point.
    if (c === 9 || c === 10 || c === 13 || (c >= 32 && c < 0x7f) || (c > 0x9f && c !== 0xfffd)) printable++;
  }
  return printable / sample > 0.9;
}

function detectJwt(input: string): Extract<Detection, { kind: "jwt" }> | null {
  const m = input.match(JWT_RE);
  if (!m) return null;
  // m[1] is the full token; the segments are its dot-separated parts.
  const [hSeg, pSeg, sSeg] = m[1].split(".");
  const header = tryB64UrlJson(hSeg);
  const payload = tryB64UrlJson(pSeg);
  if (!("value" in header) && !("value" in payload)) return null;

  const claims = "value" in payload ? payload.value : null;
  const expRaw = claims ? claims["exp"] : undefined;
  const iatRaw = claims ? claims["iat"] : undefined;
  const nbfRaw = claims ? claims["nbf"] : undefined;
  const subRaw = claims ? claims["sub"] : undefined;
  const exp = typeof expRaw === "number" ? expRaw : null;
  const iat = typeof iatRaw === "number" ? iatRaw : null;
  const nbf = typeof nbfRaw === "number" ? nbfRaw : null;
  const sub = typeof subRaw === "string" || typeof subRaw === "number" ? String(subRaw) : null;

  return {
    kind: "jwt",
    header: "value" in header ? header.value : null,
    payload: "value" in payload ? payload.value : null,
    signature: sSeg,
    headerError: "value" in header ? null : header.error,
    payloadError: "value" in payload ? null : payload.error,
    exp,
    iat,
    nbf,
    sub,
    expired: exp === null ? null : exp * 1000 < Date.now(),
  };
}

function detectEpoch(input: string): Extract<Detection, { kind: "epoch" }> | null {
  const m = input.match(EPOCH_RE);
  if (!m) return null;
  const digits = m[1];
  const n = Number(digits);
  // 10 digits → Unix seconds; 13 digits → already milliseconds.
  const value = digits.length === 10 ? n * 1000 : n;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return { kind: "epoch", value, date, unit: digits.length === 10 ? "seconds" : "milliseconds" };
}

function detectJson(input: string): Extract<Detection, { kind: "json" }> | null {
  const trimmed = input.trim();
  // Require an object/array shape so bare numbers don't shadow epoch detection.
  if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) return null;
  try {
    const data: unknown = JSON.parse(trimmed);
    return {
      kind: "json",
      data,
      formatted: JSON.stringify(data, null, 2),
      minified: JSON.stringify(data),
    };
  } catch {
    return null;
  }
}

function detectCron(input: string): Extract<Detection, { kind: "cron" }> | null {
  const trimmed = input.trim();
  const parts = trimmed.split(/\s+/);
  if (parts.length < 5 || parts.length > 6) return null;
  if (!parts.every((p) => CRON_TOKEN_RE.test(p))) return null;
  // At least one part must constrain something: "  *  *  *  *  *  " is noise.
  if (parts.every((p) => p === "*" || p === "?")) return null;
  // Every field must contain a digit, `*`, or `?`; or be made of month/day
  // names (JAN–DEC, SUN–SAT), including ranges and lists (MON-FRI, JAN,JUL).
  // A run of plain words ("I have 5 apples today") is prose, not a schedule.
  const isName = (t: string) =>
    /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|sun|mon|tue|wed|thu|fri|sat)$/i.test(t);
  if (!parts.every((p) => /[*?\d]/.test(p) || p.split(/[-/,]/).every((t) => t !== "" && isName(t)))) {
    return null;
  }
  return { kind: "cron", expression: trimmed };
}

function detectUrl(input: string): Extract<Detection, { kind: "url" }> | null {
  const m = input.match(URL_RE);
  if (!m) return null;
  try {
    return { kind: "url", raw: m[1], parsed: new URL(m[1]) };
  } catch {
    return null;
  }
}

function detectBase64(input: string): Extract<Detection, { kind: "base64" }> | null {
  const trimmed = input.trim();
  if (trimmed.length % 4 !== 0 || !BASE64_RE.test(trimmed)) return null;
  try {
    const bin = atob(trimmed);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (!looksTextual(decoded)) return null;
    return { kind: "base64", encoded: trimmed, decoded };
  } catch {
    return null;
  }
}

/**
 * Raw email headers: ≥2 newlines, ≥60% of the non-empty lines are
 * `Name: value` lines (with ≥3 such lines), and at least one email-
 * specific header name (Received, From, Authentication-Results,
 * DKIM-Signature) so a generic name/value block isn't claimed. Continuation
 * lines (leading whitespace) are folded onto the previous header. Runs
 * after Base64: a multi-line paste can't reach any earlier detector
 * (they're all single-token or anchored single-line checks), and before
 * JSONL, which it must: JSONL lines start with `{`, `[`, or a quote and
 * never match the header shape.
 */
const EMAIL_MARKER_RE = /(^|\n)\s*(Received|From|Authentication-Results|DKIM-Signature):/i;

function detectHeaders(input: string): Extract<Detection, { kind: "headers" }> | null {
  const lines = input.split(/\r?\n/);
  if (lines.length < 3) return null; // ≥2 newlines
  const nonEmpty = lines.filter((l) => l.trim() !== "");
  if (nonEmpty.length < 3) return null;
  const matching = nonEmpty.filter((l) => HEADER_LINE_RE.test(l)).length;
  if (matching < 3 || matching / nonEmpty.length < 0.6) return null;
  if (!EMAIL_MARKER_RE.test(input)) return null;

  const pairs: { name: string; value: string }[] = [];
  for (const line of lines) {
    if (line.trim() === "") continue;
    if (/^[ \t]/.test(line)) {
      if (pairs.length) pairs[pairs.length - 1].value += " " + line.trim();
      continue;
    }
    const m = line.match(/^([A-Za-z][A-Za-z0-9-]*):\s*(.*)$/);
    if (m) pairs.push({ name: m[1], value: m[2] });
  }
  return { kind: "headers", pairs };
}

/**
 * NDJSON: several lines, each a JSON value, at least one of them an object.
 * Runs after the single-document JSON detector, which already claims any
 * whole input that parses as one value (including pretty-printed objects).
 * Requiring every line to parse keeps a lone JSON line inside code from
 * being mistaken for a stream.
 */
function detectJsonl(input: string): Extract<Detection, { kind: "jsonl" }> | null {
  const nonEmpty = input.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (nonEmpty.length < 2) return null;
  const parsed = parseJsonl(input);
  if (parsed.errorCount > 0 || parsed.objectCount < 1) return null;
  return {
    kind: "jsonl",
    lineCount: parsed.lines.length,
    okCount: parsed.okCount,
    errorCount: 0,
    keyUnion: parsed.keyUnion,
    firstLine: parsed.lines[0].text,
  };
}

/**
 * Hostname: ≥2 dot-separated labels, each 1–63 chars of [a-z0-9-] with no
 * leading/trailing hyphen, a final (TLD) label of letters only, total ≤253.
 * All-numeric labels are rejected (IP-shaped, not a real domain). Sits
 * before hex/base32 so dotted hostnames never reach the codec checks.
 */
function detectDomain(input: string): Extract<Detection, { kind: "domain" }> | null {
  const trimmed = input.trim().toLowerCase();
  if (trimmed.length > 253 || trimmed.includes("/")) return null;
  const labels = trimmed.split(".");
  if (labels.length < 2) return null;
  // 1–63 chars, no leading/trailing hyphen. The length cap is checked per label.
  const labelRe = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
  for (const l of labels) {
    if (l.length > 63 || !labelRe.test(l)) return null;
  }
  if (!/^[a-z]+$/.test(labels[labels.length - 1])) return null; // TLD is letters only
  if (labels.every((l) => /^[0-9]+$/.test(l))) return null; // all-numeric → not a domain
  return { kind: "domain", host: trimmed };
}

/**
 * Hex: even-count hex digits (≥8), optional 0x prefix. Checked after Base64
 * so shared-alphabet input that decodes to text stays a Base64 detection.
 * Binary decodes still resolve to `hex` (with `decoded: null`); a pasted
 * digest is hex, and the byte count is a useful preview.
 */
function detectHex(input: string): Extract<Detection, { kind: "hex" }> | null {
  const trimmed = input.trim();
  const body = /^0[xX]/.test(trimmed) ? trimmed.slice(2) : trimmed;
  if (body.length < 8 || body.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(body)) return null;
  const decoded = hexDecode(body);
  return {
    kind: "hex",
    encoded: trimmed,
    decoded: looksTextual(decoded) ? decoded : null,
    byteLength: body.length / 2,
  };
}

/**
 * Base32: RFC 4648 alphabet (A–Z, 2–7) with optional padding, ≥16 chars,
 * and a length that can represent whole bytes. Checked after Base64: the
 * Base32 alphabet is a subset of Base64's, so any input that decodes to
 * text as Base64 has already been claimed there.
 */
function detectBase32(input: string): Extract<Detection, { kind: "base32" }> | null {
  const trimmed = input.trim();
  if (trimmed.length < 16 || !/^[A-Za-z2-7]+=*$/.test(trimmed)) return null;
  const clean = trimmed.replace(/=+$/, "");
  const rem = clean.length % 8;
  if (rem === 1 || rem === 3 || rem === 6) return null;
  try {
    const decoded = base32Decode(trimmed);
    return {
      kind: "base32",
      encoded: trimmed,
      decoded: looksTextual(decoded) ? decoded : null,
      byteLength: Math.floor((clean.length * 5) / 8),
    };
  } catch {
    return null;
  }
}

/**
 * Auto-detect what the user pasted. Order matters: JWT → epoch → JSON → cron → URL → Base64 → headers → JSONL → domain → hex → Base32 → text.
 * New kinds are appended, never interleaved: every detector classifies the
 * entire paste by unambiguous shape, so later kinds only see input the
 * earlier kinds already rejected.
 * Returns null for empty input.
 */
export function detect(input: string): Detection | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  return (
    detectJwt(trimmed) ??
    detectEpoch(trimmed) ??
    detectJson(trimmed) ??
    detectCron(trimmed) ??
    detectUrl(trimmed) ??
    detectBase64(trimmed) ??
    detectHeaders(trimmed) ??
    detectJsonl(trimmed) ??
    detectDomain(trimmed) ??
    detectHex(trimmed) ??
    detectBase32(trimmed) ?? {
      kind: "text",
      length: trimmed.length,
    }
  );
}
