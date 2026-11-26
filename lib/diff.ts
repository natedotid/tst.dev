import { diffLines, diffWords } from "diff";

/** A run of text within one line. `changed` marks inline character edits. */
export interface Segment {
  text: string;
  changed: boolean;
}

export type SideLineType = "same" | "added" | "removed" | "gap";

export interface SideLine {
  type: SideLineType;
  /** 1-based line number in this side's source; null for gap placeholders. */
  lineNo: number | null;
  /** Original text of this line (empty for gaps). */
  raw: string;
  segments: Segment[];
}

export interface SideBySide {
  left: SideLine[];
  right: SideLine[];
  addedLines: number;
  removedLines: number;
}

/**
 * Canonicalize a JSON document (parse → pretty-print with 2-space indent).
 * Returns null when the input is not valid JSON. In "Compare as JSON" mode
 * both sides are canonicalized before diffing, so pure formatting differences
 * don't show up as changes, while real edits (values, key order, structure)
 * still do.
 */
export function normalizeJson(text: string): string | null {
  if (!text.trim()) return null;
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return null;
  }
}

function wordsToSegments(
  a: string,
  b: string,
  side: "left" | "right",
): Segment[] {
  const changes = diffWords(a, b);
  return changes.map((c) => {
    const isEdit = side === "left" ? c.removed : c.added;
    return { text: c.value, changed: isEdit };
  });
}

function valueToLines(value: string): string[] {
  const lines = value.split("\n");
  // A trailing "\n" produces one spurious empty element; the final line of the
  // document (no trailing newline) must be kept as-is.
  if (lines.length > 0 && value.endsWith("\n")) lines.pop();
  return lines;
}

/**
 * Compute a side-by-side line diff. Changed lines are paired (removed ↔ added)
 * so character-level edits are highlighted inline on both sides.
 */
export function computeSideBySide(a: string, b: string): SideBySide {
  const left: SideLine[] = [];
  const right: SideLine[] = [];
  let addedLines = 0;
  let removedLines = 0;
  // Real 1-based line counters, one per side (gap rows don't advance them).
  let leftLine = 1;
  let rightLine = 1;

  const changes = diffLines(a, b);
  let i = 0;
  while (i < changes.length) {
    const change = changes[i];
    if (!change.added && !change.removed) {
      for (const raw of valueToLines(change.value)) {
        left.push({ type: "same", lineNo: leftLine, raw, segments: [{ text: raw, changed: false }] });
        right.push({ type: "same", lineNo: rightLine, raw, segments: [{ text: raw, changed: false }] });
        leftLine++;
        rightLine++;
      }
      i++;
      continue;
    }

    // Collect the consecutive removed block, then the consecutive added block.
    const removed: string[] = [];
    const added: string[] = [];
    while (i < changes.length && changes[i].removed) {
      removed.push(...valueToLines(changes[i].value));
      i++;
    }
    while (i < changes.length && changes[i].added) {
      added.push(...valueToLines(changes[i].value));
      i++;
    }

    const pairs = Math.max(removed.length, added.length);
    for (let p = 0; p < pairs; p++) {
      const rl = p < removed.length ? removed[p] : undefined;
      const al = p < added.length ? added[p] : undefined;
      if (rl !== undefined && al !== undefined) {
        left.push({ type: "removed", lineNo: leftLine, raw: rl, segments: wordsToSegments(rl, al, "left") });
        right.push({ type: "added", lineNo: rightLine, raw: al, segments: wordsToSegments(rl, al, "right") });
        leftLine++;
        rightLine++;
        removedLines++;
        addedLines++;
      } else if (rl !== undefined) {
        left.push({ type: "removed", lineNo: leftLine, raw: rl, segments: [{ text: rl, changed: true }] });
        right.push({ type: "gap", lineNo: null, raw: "", segments: [] });
        leftLine++;
        removedLines++;
      } else {
        left.push({ type: "gap", lineNo: null, raw: "", segments: [] });
        right.push({ type: "added", lineNo: rightLine, raw: al!, segments: [{ text: al!, changed: true }] });
        rightLine++;
        addedLines++;
      }
    }
  }

  return { left, right, addedLines, removedLines };
}
