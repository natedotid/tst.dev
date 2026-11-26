"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { Command, Menu, Search } from "lucide-react";

const noopSubscribe = () => () => {};
const isMacSnapshot = () =>
  typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);

/** True on macOS / iOS. The server snapshot keeps the first render stable;
 *  the client snapshot takes over right after hydration. */
function useIsMac(): boolean {
  return useSyncExternalStore(noopSubscribe, isMacSnapshot, () => false);
}

export function Header({
  onOpenCommand,
  onOpenTools,
}: {
  onOpenCommand: () => void;
  onOpenTools: () => void;
}) {
  const isMac = useIsMac();
  return (
    <header className="sticky top-0 z-40 border-b border-border-subtle bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5" aria-label="tst.dev home">
          {/* public/logo.svg is the canonical mark (icon-only, 16:13); w-auto
              keeps its aspect at a fixed 36px height. */}
          <img src="/logo.svg" alt="" aria-hidden className="h-9 w-auto" />
          <span className="font-mono text-lg font-semibold tracking-tight">
            tst<span className="text-accent">.dev</span>
          </span>
        </Link>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenTools}
            data-tools-menu-trigger
            aria-haspopup="menu"
            aria-label="Browse tools"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-elevated text-muted transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
          >
            <Menu size={15} />
          </button>
          <button
            type="button"
            onClick={onOpenCommand}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-elevated px-3 text-sm text-muted transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
          >
            <Search size={14} />
            <span className="hidden sm:inline">Search</span>
            <kbd className="hidden items-center gap-1 text-[13px] sm:inline-flex">
              {isMac ? (
                <>
                  <Command size={12} strokeWidth={2.4} />
                  K
                </>
              ) : (
                "Ctrl K"
              )}
            </kbd>
          </button>
        </div>
      </div>
    </header>
  );
}
