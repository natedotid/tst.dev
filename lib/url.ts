/**
 * URL parsing and percent encode/decode. Pure browser/Node APIs only.
 *
 * Encode/decode come in three scopes:
 *  - url:   structure-aware, operates per part (path segments, query key/value pairs, hash)
 *  - query: operates on a bare query string, preserving & and =
 *  - text:  raw encodeURIComponent / decodeURIComponent on the whole string
 */

export interface UrlParam {
  key: string;
  value: string;
}

export interface UrlParts {
  protocol: string; // e.g. "https:"
  hostname: string;
  port: string; // "" when the scheme default
  host: string; // hostname, or hostname:port
  pathname: string;
  search: string; // includes the leading "?", or ""
  hash: string; // includes the leading "#", or ""
  params: UrlParam[]; // decoded, duplicates preserved
}

export type ParseUrlResult = UrlParts | { error: string };
export type TransformResult = string | { error: string };

/** Schemes this tool understands. Anything else is rejected, not guessed. */
const SCHEME_RE = /^([a-z][a-z0-9+.-]*):/i;
/** host:port or ip:port without a scheme, e.g. "localhost:3000/api". */
const HOST_PORT_RE = /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?:\d+/i;

/**
 * Parse user input into a URL. http/https are used as-is; input without a
 * scheme (or that looks like host:port) is assumed to be https. Other
 * schemes (mailto:, ftp:, …) are out of scope and rejected.
 */
function resolveUrl(raw: string): URL | { error: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { error: "Enter a URL." };

  const scheme = SCHEME_RE.exec(trimmed)?.[1]?.toLowerCase() ?? null;
  let candidate: string;
  if (scheme === "http" || scheme === "https") {
    candidate = trimmed;
  } else if (scheme === null || HOST_PORT_RE.test(trimmed)) {
    candidate = `https://${trimmed}`;
  } else {
    return { error: "Only http and https URLs are supported." };
  }

  try {
    return new URL(candidate);
  } catch {
    return { error: `“${trimmed}” is not a valid URL.` };
  }
}

export function parseUrl(raw: string): ParseUrlResult {
  const resolved = resolveUrl(raw);
  if ("error" in resolved) return resolved;

  const params: UrlParam[] = [];
  for (const [key, value] of resolved.searchParams.entries()) {
    params.push({ key, value });
  }

  return {
    protocol: resolved.protocol,
    hostname: resolved.hostname,
    port: resolved.port,
    host: resolved.host,
    pathname: resolved.pathname,
    search: resolved.search,
    hash: resolved.hash,
    params,
  };
}

function decodeSegment(segment: string): string | null {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

/**
 * Decode every part of a URL so both encode and decode start from the same
 * normalized values (encoding is then a single encode, never a double one).
 */
function decodedParts(u: URL):
  | { path: string[]; query: UrlParam[]; hash: string }
  | { error: string } {
  const path: string[] = [];
  for (const segment of u.pathname.split("/")) {
    const decoded = decodeSegment(segment);
    if (decoded === null) return { error: "Invalid percent-encoding in the path." };
    path.push(decoded);
  }

  const query: UrlParam[] = [];
  if (u.search) {
    for (const pair of u.search.slice(1).split("&")) {
      if (!pair) continue;
      const eq = pair.indexOf("=");
      const key = decodeSegment(eq === -1 ? pair : pair.slice(0, eq));
      const value = eq === -1 ? "" : decodeSegment(pair.slice(eq + 1));
      if (key === null || value === null) {
        return { error: "Invalid percent-encoding in the query string." };
      }
      query.push({ key, value });
    }
  }

  const hash = decodeSegment(u.hash.slice(1));
  if (hash === null) return { error: "Invalid percent-encoding in the fragment." };

  return { path, query, hash };
}

function serialize(u: URL, path: string[], query: UrlParam[], hash: string, encode: boolean): string {
  const enc = (s: string) => (encode ? encodeURIComponent(s) : s);
  // path[0] is always "" (pathname starts with "/"), so the join reproduces
  // the leading slash without adding one.
  const pathStr = path.map(enc).join("/");
  const queryStr = query.length
    ? "?" + query.map((p) => `${enc(p.key)}=${enc(p.value)}`).join("&")
    : "";
  const hashStr = u.hash ? "#" + enc(hash) : "";
  return `${u.protocol}//${u.host}${pathStr}${queryStr}${hashStr}`;
}

/** Percent-encode a URL, part by part. Input is normalized first, so already-encoded URLs are not double-encoded. */
export function encodeUrl(raw: string): TransformResult {
  const resolved = resolveUrl(raw);
  if ("error" in resolved) return resolved;
  const parts = decodedParts(resolved);
  if ("error" in parts) return parts;
  return serialize(resolved, parts.path, parts.query, parts.hash, true);
}

/** Decode percent-encoding in a URL, part by part. */
export function decodeUrl(raw: string): TransformResult {
  const resolved = resolveUrl(raw);
  if ("error" in resolved) return resolved;
  const parts = decodedParts(resolved);
  if ("error" in parts) return parts;
  return serialize(resolved, parts.path, parts.query, parts.hash, false);
}

/** Encode a bare query string, preserving `&` and `=` as separators. */
export function encodeQueryString(qs: string): string {
  return qs
    .split("&")
    .map((pair) => {
      const eq = pair.indexOf("=");
      return eq === -1
        ? encodeURIComponent(pair)
        : `${encodeURIComponent(pair.slice(0, eq))}=${encodeURIComponent(pair.slice(eq + 1))}`;
    })
    .join("&");
}

/** Decode a bare query string, preserving `&` and `=` as separators. */
export function decodeQueryString(qs: string): TransformResult {
  try {
    return qs
      .split("&")
      .map((pair) => {
        const eq = pair.indexOf("=");
        return eq === -1
          ? decodeURIComponent(pair)
          : `${decodeURIComponent(pair.slice(0, eq))}=${decodeURIComponent(pair.slice(eq + 1))}`;
      })
      .join("&");
  } catch {
    return { error: "Invalid percent-encoding (malformed % sequence)." };
  }
}

/** Percent-encode any text. */
export function encodeText(text: string): string {
  return encodeURIComponent(text);
}

/** Percent-decode any text. Fails on malformed % sequences. */
export function decodeText(text: string): TransformResult {
  try {
    return decodeURIComponent(text);
  } catch {
    return { error: "Invalid percent-encoding (malformed % sequence)." };
  }
}
