"use client";

import { useEffect, useRef } from "react";
import {
  drawSelection,
  Decoration,
  type DecorationSet,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  placeholder,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { EditorState, StateField, type Range } from "@codemirror/state";
import {
  HighlightStyle,
  bracketMatching,
  indentOnInput,
  syntaxHighlighting,
} from "@codemirror/language";
import { json } from "@codemirror/lang-json";
import { yaml } from "@codemirror/lang-yaml";
import { tags } from "@lezer/highlight";
import { Trash2, Wand2 } from "lucide-react";
import { Button, CopyButton } from "@/components/ui";
import { cn } from "@/lib/utils";

/**
 * Minimal pastel syntax theme built from the site's design tokens; the
 * editor is the biggest colored surface on the site, so it should look like
 * it belongs here, not like VS Code.
 * The editor chrome (background, gutters, cursor, selection) comes from
 * globals.css; this only colors syntax tokens.
 */
const pastelHighlight = HighlightStyle.define([
  { tag: tags.comment, color: "var(--color-faint)" },
  { tag: tags.special(tags.string), color: "var(--color-success)" },
  { tag: tags.string, color: "var(--color-success)" },
  { tag: tags.propertyName, color: "var(--color-info)" },
  { tag: tags.number, color: "var(--color-violet)" },
  { tag: tags.bool, color: "var(--color-violet)" },
  { tag: tags.null, color: "var(--color-violet)" },
  { tag: tags.atom, color: "var(--color-violet)" },
  { tag: tags.keyword, color: "var(--color-warning)" },
  { tag: tags.operatorKeyword, color: "var(--color-warning)" },
  { tag: tags.invalid, color: "var(--color-danger)" },
]);

export type EditorLanguage = "json" | "yaml" | "plaintext";

interface CodeMirrorEditorProps {
  value: string;
  onChange?: (value: string) => void;
  language?: EditorLanguage;
  readOnly?: boolean;
  placeholder?: string;
  className?: string;
  /** 1-based line numbers to mark as validation errors. */
  errorLines?: number[];
  ariaLabel?: string;
  /** Show the copy/clear/format toolbar. Defaults to true. */
  showToolbar?: boolean;
  showCopy?: boolean;
  showClear?: boolean;
  onFormat?: () => void;
  formatLabel?: string;
}

function buildErrorDecorations(lines: number[], state: EditorState): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  for (const line of lines) {
    if (Number.isInteger(line) && line >= 1 && line <= state.doc.lines) {
      ranges.push(
        Decoration.line({ class: "tst-error-line" }).range(state.doc.line(line).from),
      );
    }
  }
  return ranges.length
    ? Decoration.set(ranges.sort((a, b) => a.from - b.from))
    : Decoration.none;
}

/** Field that keeps a DecorationSet in sync with externally supplied line numbers. */
function errorLinesField(getLines: () => number[]) {
  let lastKey: string | null = null;
  return StateField.define<DecorationSet>({
    create: (state) => {
      const lines = getLines();
      lastKey = lines.join("|");
      return buildErrorDecorations(lines, state);
    },
    update: (value, transaction) => {
      const lines = getLines();
      const key = lines.join("|");
      if (key !== lastKey || transaction.docChanged) {
        lastKey = key;
        return buildErrorDecorations(lines, transaction.state);
      }
      return value.map(transaction.changes);
    },
  });
}

/* --------------------------------- component -------------------------------- */

export function CodeMirrorEditor({
  value,
  onChange,
  language = "plaintext",
  readOnly = false,
  placeholder: placeholderText = "",
  className,
  errorLines = [],
  ariaLabel,
  showToolbar = true,
  showCopy = true,
  showClear = true,
  onFormat,
  formatLabel = "Format",
}: CodeMirrorEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const errorLinesRef = useRef(errorLines);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Mount the editor (re-created when the language changes, which is rare and cheap).
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const languageExtension =
      language === "json" ? json() : language === "yaml" ? yaml() : [];

    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: "",
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          highlightActiveLine(),
          history(),
          drawSelection(),
          indentOnInput(),
          bracketMatching(),
          languageExtension,
          syntaxHighlighting(pastelHighlight),
          EditorView.lineWrapping,
          placeholder(placeholderText),
          EditorState.readOnly.of(readOnly),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          errorLinesField(() => errorLinesRef.current),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              onChangeRef.current?.(update.state.doc.toString());
            }
          }),
        ],
      }),
    });

    viewRef.current = view;
    // Destroy the view so Strict Mode re-mounts and unmounts don't
    // leave duplicate DOM nodes or leak scroll/keyboard listeners.
    return () => {
      view.destroy();
      if (viewRef.current === view) viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language, readOnly]);

  // Keep the document in sync with the controlled `value` prop.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (value !== current) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      });
    }
  }, [value, language, readOnly]);

  // Push error-line markers into the running view (no-op transaction re-evaluates the field).
  useEffect(() => {
    errorLinesRef.current = errorLines;
    const view = viewRef.current;
    if (view) view.dispatch({});
  }, [errorLines]);

  const handleClear = () => {
    onChangeRef.current?.("");
  };

  const body = (
    <div
      ref={hostRef}
      role={readOnly ? "textbox" : undefined}
      aria-label={ariaLabel}
      aria-readonly={readOnly || undefined}
      className="min-h-0 flex-1 overflow-hidden"
    />
  );

  if (!showToolbar) {
    return (
      <div
        className={cn(
          "flex flex-col overflow-hidden rounded-lg border border-border bg-surface transition-colors focus-within:border-accent/40 focus-within:ring-2 focus-within:ring-accent/40",
          className,
        )}
      >
        {body}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-lg border border-border bg-surface transition-colors focus-within:border-accent/40 focus-within:ring-2 focus-within:ring-accent/40",
        className,
      )}
    >
      <div className="flex shrink-0 items-center justify-end gap-1 border-b border-border-subtle px-2 py-1.5">
        {onFormat && (
          <Button size="sm" variant="ghost" onClick={onFormat}>
            <Wand2 size={12} />
            {formatLabel}
          </Button>
        )}
        {showClear && !readOnly && (
          <Button size="sm" variant="ghost" onClick={handleClear}>
            <Trash2 size={12} />
            Clear
          </Button>
        )}
        {showCopy && <CopyButton text={value} label="Copy" />}
      </div>
      {body}
    </div>
  );
}
