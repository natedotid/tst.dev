/**
 * HTTP status codes, transcribed from the IANA "HTTP Status Code Registry"
 * (registry updated 2025-09-15). Names and RFC references follow the registry;
 * the one-line notes are tst.dev's own. Only assigned codes are listed:
 * unassigned ranges are omitted.
 */

export interface StatusInfo {
  code: number;
  /** IANA-registered name. */
  name: string;
  /** One-line summary of meaning and typical use. */
  note: string;
  /** RFC / draft references from the registry. */
  refs: string[];
}

export interface StatusGroup {
  /** Class digit, e.g. 4 for 4xx. */
  class: number;
  label: string;
  /** Badge tone for the group's code chips. */
  tone: "neutral" | "success" | "accent" | "warning" | "danger";
}

/** Group labels follow the IANA registry note. */
export const STATUS_GROUPS: StatusGroup[] = [
  { class: 1, label: "1xx · Informational: request received, continuing process", tone: "neutral" },
  { class: 2, label: "2xx · Success: the action was successfully received, understood, and accepted", tone: "success" },
  { class: 3, label: "3xx · Redirection: further action must be taken to complete the request", tone: "accent" },
  { class: 4, label: "4xx · Client Error: the request contains bad syntax or cannot be fulfilled", tone: "warning" },
  { class: 5, label: "5xx · Server Error: the server failed to fulfill an apparently valid request", tone: "danger" },
];

type Entry = [number, string, string, string[]];

const R9 = "RFC 9110";

const ENTRIES: Entry[] = [
  // 1xx
  [100, "Continue", "The server has received the request headers; the client may continue sending the body.", [`${R9} § 15.2.1`]],
  [101, "Switching Protocols", "The server agrees to switch protocols (e.g. HTTP to WebSocket) as requested.", [`${R9} § 15.2.2`]],
  [102, "Processing", "The server has received and is still processing the request; a final response will follow.", ["RFC 2518"]],
  [103, "Early Hints", "The server sends hint headers (e.g. resources to preload) before the final response.", ["RFC 8297"]],
  [104, "Upload Resumption Supported (TEMPORARY)", "Temporary registration: the server supports resumable uploads. Expires unless it becomes a standard.", ["draft-ietf-httpbis-resumable-upload-05"]],

  // 2xx
  [200, "OK", "The request succeeded; the response body carries the result.", [`${R9} § 15.3.1`]],
  [201, "Created", "A new resource was created; the Location header gives its URI.", [`${R9} § 15.3.2`]],
  [202, "Accepted", "The request was accepted for processing, but the processing has not yet completed.", [`${R9} § 15.3.3`]],
  [203, "Non-Authoritative Information", "The returned representation is a transform of the original and may be non-authoritative (e.g. from a proxy cache).", [`${R9} § 15.3.4`]],
  [204, "No Content", "The request succeeded and the server is intentionally not returning a body.", [`${R9} § 15.3.5`]],
  [205, "Reset Content", "The request succeeded; the client should reset the document view (e.g. clear a form).", [`${R9} § 15.3.6`]],
  [206, "Partial Content", "The server is returning part of the body, as selected by a Range header.", [`${R9} § 15.3.7`]],
  [207, "Multi-Status", "WebDAV: the response carries status information for multiple operations.", ["RFC 4918"]],
  [208, "Already Reported", "WebDAV: the collection's members were already enumerated in an earlier part of the response.", ["RFC 5842"]],
  [226, "IM Used", "The server applied one or more instances to the resource's current state (delta encoding).", ["RFC 3229"]],

  // 3xx
  [300, "Multiple Choices", "The resource has multiple representations; the client (or user) may pick one.", [`${R9} § 15.4.1`]],
  [301, "Moved Permanently", "The resource now lives at the URI in Location; clients should use it from now on.", [`${R9} § 15.4.2`]],
  [302, "Found", "The resource is temporarily at a different URI; a subsequent fetch uses GET regardless of the original method.", [`${R9} § 15.4.3`]],
  [303, "See Other", "Fetch the result at the Location URI using GET.", [`${R9} § 15.4.4`]],
  [304, "Not Modified", "A conditional request matched; the client may keep its cached copy.", [`${R9} § 15.4.5`]],
  [305, "Use Proxy", "Registered but unused: was meant to require accessing the resource through the proxy in Location.", [`${R9} § 15.4.6`]],
  [306, "(Unused)", "Reserved and must not be assigned; kept to stay compatible with clients that treat 305 as a redirect.", [`${R9} § 15.4.7`]],
  [307, "Temporary Redirect", "The resource is temporarily at a different URI; retries must preserve the method and body.", [`${R9} § 15.4.8`]],
  [308, "Permanent Redirect", "The resource has permanently moved; retries must preserve the method and body.", [`${R9} § 15.4.9`]],

  // 4xx
  [400, "Bad Request", "The server cannot process the request because of malformed syntax.", [`${R9} § 15.5.1`]],
  [401, "Unauthorized", "Authentication is required, or the supplied credentials were rejected; WWW-Authenticate names the scheme.", [`${R9} § 15.5.2`]],
  [402, "Payment Required", "Reserved for future use; occasionally returned for paywalled content.", [`${R9} § 15.5.3`]],
  [403, "Forbidden", "The server understood the request but refuses to fulfill it.", [`${R9} § 15.5.4`]],
  [404, "Not Found", "The server has no resource matching the request target.", [`${R9} § 15.5.5`]],
  [405, "Method Not Allowed", "The method exists but is not allowed for this resource; the Allow header lists what is.", [`${R9} § 15.5.6`]],
  [406, "Not Acceptable", "The resource cannot produce a representation matching the Accept headers.", [`${R9} § 15.5.7`]],
  [407, "Proxy Authentication Required", "Like 401, but the client must first authenticate with the intervening proxy.", [`${R9} § 15.5.8`]],
  [408, "Request Timeout", "The client did not finish the request within the time the server is willing to wait.", [`${R9} § 15.5.9`]],
  [409, "Conflict", "The request conflicts with the current state of the resource (e.g. a version or uniqueness clash).", [`${R9} § 15.5.10`]],
  [410, "Gone", "The resource is no longer available and the absence is intentional and permanent.", [`${R9} § 15.5.11`]],
  [411, "Length Required", "The request lacks a Content-Length the server requires to process it.", [`${R9} § 15.5.12`]],
  [412, "Precondition Failed", "A conditional header (If-Match, If-Unmodified-Since, …) evaluated to false.", [`${R9} § 15.5.13`]],
  [413, "Content Too Large", "The request entity is larger than the server is willing or able to process. Renamed from “Payload Too Large” in RFC 9110.", [`${R9} § 15.5.14`]],
  [414, "URI Too Long", "The request URI is longer than the server is willing to interpret. Renamed from “Request-URI Too Long” in RFC 9110.", [`${R9} § 15.5.15`]],
  [415, "Unsupported Media Type", "The request entity is in a content type the server does not support.", [`${R9} § 15.5.16`]],
  [416, "Range Not Satisfiable", "No Range in the request applies to the current length of the resource.", [`${R9} § 15.5.17`]],
  [417, "Expectation Failed", "An expectation in an Expect header (e.g. 100-continue) cannot be met by this server.", [`${R9} § 15.5.18`]],
  [418, "(Unused)", "Registered but unused: the “I’m a teapot” code of the April Fools' RFC 2324, widely deployed as an easter egg.", [`${R9} § 15.5.19`, "RFC 2324"]],
  [421, "Misdirected Request", "The request was sent to a server that cannot produce a response for it (e.g. the wrong origin for the target).", [`${R9} § 15.5.20`]],
  [422, "Unprocessable Content", "The server understands the content type and syntax, but the contained instructions are semantically invalid. Renamed from “Unprocessable Entity” in RFC 9110.", [`${R9} § 15.5.21`]],
  [423, "Locked", "WebDAV: the resource is locked.", ["RFC 4918"]],
  [424, "Failed Dependency", "WebDAV: the method failed because a dependent action (e.g. on a parent resource) failed.", ["RFC 4918"]],
  [425, "Too Early", "The server is unwilling to risk processing a request that might be a replay of an earlier one (anti-replay protection).", ["RFC 8470"]],
  [426, "Upgrade Required", "The server refuses to fulfill the request unless the client switches to a different protocol (see Upgrade).", [`${R9} § 15.5.22`]],
  [428, "Precondition Required", "The server requires this request to be conditional.", ["RFC 6585"]],
  [429, "Too Many Requests", "The client has sent too many requests in a given time (rate limiting); Retry-After may say when to try again.", ["RFC 6585"]],
  [431, "Request Header Fields Too Large", "The request headers are larger than the server is willing to read.", ["RFC 6585"]],
  [451, "Unavailable For Legal Reasons", "The resource is unavailable due to a legal demand.", ["RFC 7725"]],

  // 5xx
  [500, "Internal Server Error", "The server encountered an unexpected condition and could not complete the request.", [`${R9} § 15.6.1`]],
  [501, "Not Implemented", "The server does not support the functionality required to fulfill the request.", [`${R9} § 15.6.2`]],
  [502, "Bad Gateway", "The server, acting as a gateway, received an invalid response from the upstream server.", [`${R9} § 15.6.3`]],
  [503, "Service Unavailable", "The server is temporarily unable to handle the request (overloaded or down); Retry-After may be set.", [`${R9} § 15.6.4`]],
  [504, "Gateway Timeout", "The server, acting as a gateway, did not receive a timely response from the upstream server.", [`${R9} § 15.6.5`]],
  [505, "HTTP Version Not Supported", "The server does not support the HTTP protocol version used in the request.", [`${R9} § 15.6.6`]],
  [506, "Variant Also Negotiates", "The resource has an intervariant dependency loop during content negotiation.", ["RFC 2295"]],
  [507, "Insufficient Storage", "WebDAV: the server cannot store the representation needed to complete the request.", ["RFC 4918"]],
  [508, "Loop Detected", "The server detected an infinite loop while processing the request (often through a proxy).", ["RFC 5842"]],
  [510, "Not Extended (OBSOLETED)", "Historic: further extensions to the request are required. Obsoleted when the HTTP experiments became Historic.", ["RFC 2774"]],
  [511, "Network Authentication Required", "The client needs to authenticate to gain network access (captive portal).", ["RFC 6585"]],
];

export const STATUS_CODES: StatusInfo[] = ENTRIES.map(([code, name, note, refs]) => ({
  code,
  name,
  note,
  refs,
}));

/** Look up a single status by numeric code. */
export function findStatus(code: number): StatusInfo | undefined {
  return STATUS_CODES.find((s) => s.code === code);
}

/**
 * Filter the registry. An all-digit query matches codes by prefix ("4" → all
 * 4xx, "404" → exactly 404); anything else matches name or note as a
 * case-insensitive substring.
 */
export function filterStatuses(query: string): StatusInfo[] {
  const q = query.trim().toLowerCase();
  if (!q) return STATUS_CODES;
  if (/^\d+$/.test(q)) {
    return STATUS_CODES.filter((s) => String(s.code).startsWith(q));
  }
  return STATUS_CODES.filter(
    (s) => s.name.toLowerCase().includes(q) || s.note.toLowerCase().includes(q),
  );
}
