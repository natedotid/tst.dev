/** Join class names, dropping falsy values. */
export function cn(...inputs: Array<string | false | null | undefined>): string {
  return inputs.filter(Boolean).join(" ");
}

/** Copy text to the clipboard. Returns false if the API is unavailable or rejected. */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for non-secure contexts
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

/** Base64-encode a UTF-8 string (chunked to avoid call-stack overflow on large input). */
export function base64Encode(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

/** Base64-decode a string to UTF-8 text. Throws on invalid input. */
export function base64Decode(b64: string): string {
  const normalized = b64.replace(/\s+/g, "");
  const bin = atob(normalized);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/** Decode a base64url segment (JWT part) to a UTF-8 string. Throws on invalid input. */
export function base64UrlDecode(segment: string): string {
  let b64 = segment.replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4 !== 0) b64 += "=";
  return base64Decode(b64);
}

/** Human-readable relative time, e.g. "5 minutes ago" / "in 2 hours". */
export function relativeTime(date: Date, now: number = Date.now()): string {
  const diff = date.getTime() - now;
  const abs = Math.abs(diff);
  const future = diff > 0;

  let amount = Math.floor(abs / 1000);
  let label = "second";
  while (amount >= 60 && label === "second") {
    amount = Math.floor(amount / 60);
    label = "minute";
  }
  while (amount >= 60 && label === "minute") {
    amount = Math.floor(amount / 60);
    label = "hour";
  }
  while (amount >= 24 && label === "hour") {
    amount = Math.floor(amount / 24);
    label = "day";
  }
  while (amount >= 30 && label === "day") {
    amount = Math.floor(amount / 30);
    label = "month";
  }
  while (amount >= 12 && label === "month") {
    amount = Math.floor(amount / 12);
    label = "year";
  }

  if (amount < 1) return future ? "in a moment" : "just now";
  const noun = `${amount} ${label}${amount === 1 ? "" : "s"}`;
  return future ? `in ${noun}` : `${noun} ago`;
}

/** Format a Date as a local human-readable string.
 *  `hourCycle: "h23"` (rather than `hour12: false`) pins the 24-hour clock
 *  to 00–23; a bare `hour12: false` leaves midnight ambiguous on some engines. */
export function formatLocal(date: Date): string {
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
}

/** Format a Date as a UTC string. */
export function formatUtc(date: Date): string {
  return date.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, " UTC");
}
