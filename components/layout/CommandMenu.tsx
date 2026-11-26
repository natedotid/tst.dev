"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "cmdk";
import { CornerDownLeft, Search } from "lucide-react";
import { SITE_TOOLS } from "@/lib/tools";
import { NetworkBadge } from "@/components/ui";

export function CommandMenu({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  // Element that held focus before the palette opened, so it can be restored on close.
  const lastFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (open) {
      lastFocus.current = (document.activeElement as HTMLElement | null) ?? null;
    } else if (lastFocus.current) {
      lastFocus.current.focus();
      lastFocus.current = null;
    }
  }, [open]);

  // Reset the query when the palette opens (render-time state adjustment).
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setQuery("");
  }

  const tools = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SITE_TOOLS;
    return SITE_TOOLS.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.path.includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.keywords.some((k) => k.includes(q)),
    );
  }, [query]);

  if (!open) return null;

  const close = () => onOpenChange(false);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <Command
        shouldFilter={false}
        role="dialog"
        aria-modal="true"
        aria-label="Tool search"
        className="mt-[12vh] w-full max-w-lg overflow-hidden rounded-xl border border-border bg-overlay shadow-[0_16px_64px_rgba(0,0,0,0.6)]"
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            close();
          } else if (e.key === "Tab") {
            // Only the search input is tabbable inside the dialog; keep focus in it.
            e.preventDefault();
            (document.querySelector("[cmdk-input]") as HTMLInputElement | null)?.focus();
          }
        }}
      >
        <div className="flex items-center gap-2.5 border-b border-border-subtle px-4">
          <Search size={14} className="shrink-0 text-muted" />
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder="Jump to a tool…"
            className="h-12 w-full bg-transparent text-sm text-foreground outline-none placeholder:text-faint"
          />
          <kbd>esc</kbd>
        </div>
        <CommandList className="max-h-96 overflow-y-auto p-2">
          {tools.length === 0 ? (
            <CommandEmpty className="px-3 py-8 text-center text-sm text-faint">
              No tools match “{query}”.
            </CommandEmpty>
          ) : (
            <CommandGroup
              heading="Tools"
              className="text-xs font-medium uppercase tracking-wider text-faint"
            >
              {tools.map((tool) => {
                const Icon = tool.icon;
                return (
                  <CommandItem
                    key={tool.path}
                    value={tool.path}
                    onSelect={() => {
                      router.push(`/${tool.path}/`);
                      close();
                    }}
                    className="group flex cursor-pointer items-center justify-between gap-3 rounded-md px-3 py-2.5 text-sm text-muted data-[selected=true]:bg-elevated data-[selected=true]:text-foreground"
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <Icon size={15} className="shrink-0 text-faint group-data-[selected=true]:text-accent" />
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate font-medium">{tool.name}</span>
                          {tool.network && <NetworkBadge />}
                        </span>
                        <span className="block truncate text-[13px] text-faint">{tool.description}</span>
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="font-mono text-xs text-faint">/{tool.path}</span>
                      <CornerDownLeft size={12} className="text-faint" />
                    </span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          )}
        </CommandList>
        <div className="flex items-center gap-3 border-t border-border-subtle px-4 py-2 text-xs text-faint">
          <span className="inline-flex items-center gap-1">
            <kbd>↑</kbd>
            <kbd>↓</kbd> navigate
          </span>
          <span className="inline-flex items-center gap-1">
            <kbd>↵</kbd> open
          </span>
        </div>
      </Command>
    </div>
  );
}
