/**
 * NDJSON (newline-delimited JSON) helpers: one JSON value per line.
 * Parsing never throws: per-line errors are reported so the tool can show
 * which lines are broken. Empty lines are skipped, not errors.
 */

export interface JsonlLine {
  /** 1-based line number in the original text. */
  lineNo: number;
  /** The line, trimmed. */
  text: string;
  ok: boolean;
  /** Parsed value when `ok` is true. */
  value: unknown;
  /** Parse error message when `ok` is false. */
  error: string | null;
}

export interface JsonlParse {
  /** Non-empty lines, in order. */
  lines: JsonlLine[];
  okCount: number;
  errorCount: number;
  /** Count of lines that parsed to a JSON object (arrays and scalars don't count). */
  objectCount: number;
  /** Union of object keys, in first-seen order across object lines. */
  keyUnion: string[];
  /** Values of the ok lines, in order (for re-serialization). */
  values: unknown[];
}

export function parseJsonl(text: string): JsonlParse {
  const lines: JsonlLine[] = [];
  const values: unknown[] = [];
  const keyUnion: string[] = [];
  const seenKeys = new Set<string>();
  let objectCount = 0;

  text.split(/\r?\n/).forEach((raw, i) => {
    const trimmed = raw.trim();
    if (trimmed === "") return;
    try {
      const value: unknown = JSON.parse(trimmed);
      lines.push({ lineNo: i + 1, text: trimmed, ok: true, value, error: null });
      values.push(value);
      if (value !== null && typeof value === "object" && !Array.isArray(value)) {
        objectCount++;
        for (const key of Object.keys(value)) {
          if (!seenKeys.has(key)) {
            seenKeys.add(key);
            keyUnion.push(key);
          }
        }
      }
    } catch (e) {
      lines.push({
        lineNo: i + 1,
        text: trimmed,
        ok: false,
        value: null,
        error: e instanceof Error ? e.message : "invalid JSON",
      });
    }
  });

  const okCount = lines.filter((l) => l.ok).length;
  return { lines, okCount, errorCount: lines.length - okCount, objectCount, keyUnion, values };
}

/**
 * Serialize to NDJSON. Arrays become one record per line; any other JSON
 * value becomes a single line. Throws if the value is not JSON-serializable.
 */
export function toJsonl(value: unknown): string {
  const records: unknown[] = Array.isArray(value) ? value : [value];
  const out: string[] = [];
  for (const record of records) {
    const line = JSON.stringify(record);
    if (line === undefined) {
      throw new Error("Value is not JSON-serializable");
    }
    out.push(line);
  }
  return out.join("\n");
}
