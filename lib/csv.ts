/**
 * Minimal RFC 4180 CSV parsing, pure and dependency-free.
 * Handles quoted fields, "" escapes, embedded commas/newlines, CRLF, and a
 * leading BOM. Delimiter auto-detection counts candidates in the first line.
 */

export type Delimiter = "," | ";" | "\t" | "|" | "auto";
export type ConcreteDelimiter = Exclude<Delimiter, "auto">;

export type CsvParse =
  | { rows: string[][] }
  | { error: string; line: number };

const CANDIDATES: ConcreteDelimiter[] = [",", ";", "\t", "|"];

export function parseCsv(input: string, delimiter: Delimiter = "auto"): CsvParse {
  // Strip a leading UTF-8 BOM (U+FEFF) if present.
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  if (!text.trim()) return { rows: [] };

  const delim = delimiter === "auto" ? detectDelimiter(text) : delimiter;
  return parseRows(text, delim);
}

/** Count each candidate delimiter outside quotes in the first non-empty line. */
function detectDelimiter(text: string): ConcreteDelimiter {
  const firstLine = text.split(/\r?\n/).find((l) => l.trim() !== "") ?? "";
  const counts: Record<ConcreteDelimiter, number> = { ",": 0, ";": 0, "\t": 0, "|": 0 };
  let inQuotes = false;

  for (let i = 0; i < firstLine.length; i++) {
    const c = firstLine[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if (!inQuotes && (CANDIDATES as readonly string[]).includes(c)) {
      counts[c as ConcreteDelimiter]++;
    }
  }

  let best: ConcreteDelimiter = ",";
  let max = 0;
  for (const c of CANDIDATES) {
    if (counts[c] > max) {
      best = c;
      max = counts[c];
    }
  }
  return best;
}

function parseRows(text: string, delim: string): CsvParse {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let quoteLine = 0;
  let line = 1;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
        if (c === "\n") line++;
      }
      continue;
    }

    if (c === '"' && field === "") {
      inQuotes = true;
      quoteLine = line;
    } else if (c === delim) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
      line++;
    } else {
      field += c;
    }
  }

  if (inQuotes) {
    return { error: "Unterminated quoted field", line: quoteLine };
  }

  // Flush the final row when the input does not end with a newline.
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // Drop blank lines (a single empty field), including trailing ones.
  return { rows: rows.filter((r) => !(r.length === 1 && r[0] === "")) };
}

/**
 * Serialize one value as an RFC 4180 field for a fixed "," delimiter. Quote
 * when the field contains the delimiter, a double quote, CR, or LF; embedded
 * quotes double to "".
 */
function csvField(value: unknown): string {
  const s =
    value === null || value === undefined
      ? ""
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Convert JSON data to CSV (the inverse of parseCsv + rowsToObjects).
 *  - array of objects → header row is the union of keys in first-seen order;
 *    keys missing from a row emit "".
 *  - array of arrays  → no header; ragged rows are padded with "".
 *  - nested objects/arrays in a cell are written as JSON text.
 *  - anything else    → error.
 * Always emits CRLF line endings and a fixed "," delimiter (delimiter
 * auto-detection is a parse-direction concern).
 */
export function objectsToCsv(data: unknown): { csv: string } | { error: string } {
  if (
    !Array.isArray(data) ||
    data.some((v) => !Array.isArray(v) && (typeof v !== "object" || v === null))
  ) {
    return { error: "JSON input must be an array of objects or arrays" };
  }
  if (data.length === 0) return { csv: "" };

  // Array of arrays: no header; ragged rows padded with "".
  if (data.every((v) => Array.isArray(v))) {
    const width = Math.max(...(data as unknown[][]).map((r) => r.length));
    const lines = (data as unknown[][]).map((r) =>
      Array.from({ length: width }, (_, i) => csvField(r[i])),
    );
    return { csv: lines.map((line) => line.join(",")).join("\r\n") };
  }

  // Array of objects: header row is the union of keys in first-seen order.
  const keys = data.reduce<string[]>((acc, v) => {
    for (const k of Object.keys(v as Record<string, unknown>)) {
      if (!acc.includes(k)) acc.push(k);
    }
    return acc;
  }, []);
  const lines = [
    keys.map((k) => csvField(k)),
    ...data.map((v) => keys.map((k) => csvField((v as Record<string, unknown>)[k]))),
  ];
  return { csv: lines.map((line) => line.join(",")).join("\r\n") };
}

/**
 * Map parsed rows to JSON-friendly values.
 *  - header: true  → array of objects keyed by the first row. Missing trailing
 *    cells become ""; extra cells are ignored; duplicate header names: last
 *    column wins.
 *  - header: false → array of rows (arrays).
 */
export function rowsToObjects(rows: string[][], header: boolean): unknown[] {
  if (rows.length === 0) return [];
  if (!header) return rows;

  const [head, ...rest] = rows;
  return rest.map((r) => {
    const obj: Record<string, string> = {};
    head.forEach((key, i) => {
      obj[key] = r[i] ?? "";
    });
    return obj;
  });
}
