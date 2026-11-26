"use client";

import { useEffect, useRef, type ReactNode } from "react";
import Link from "next/link";
import { TOOLS } from "@/lib/tools";
import { SECTIONS } from "@/lib/sections";
import { NetworkBadge } from "@/components/ui";
import type { LucideIcon } from "lucide-react";

const TRIGGER_SELECTOR = "[data-tools-menu-trigger]";

interface Group {
  label: string;
  items: { key: string; name: string; icon: LucideIcon; path: string; network?: boolean }[];
}

/**
 * Hamburger "browse" menu: grouped index of every tool on the site.
 * Home tools (the paste-and-transform family) first, then the path-grouped
 * sections (DNS, email, …). Fast search stays the ⌘K palette; this is for
 * looking around.
 */
export function ToolsMenu({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const panelRef = useRef<HTMLDivElement>(null);

  const close = () => onOpenChange(false);

  // Close on outside click (the trigger button toggles itself, so exclude it).
  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Element;
      if (panelRef.current?.contains(target)) return;
      if (target.closest(TRIGGER_SELECTOR)) return;
      close();
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Close on Escape; return focus to the trigger if focus was inside the menu.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (panelRef.current?.contains(document.activeElement)) {
        (document.querySelector(TRIGGER_SELECTOR) as HTMLElement | null)?.focus();
      }
      close();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const groups: Group[] = [
    {
      label: "Home tools",
      items: TOOLS.map((t) => ({
        key: t.slug,
        name: t.name,
        icon: t.icon,
        path: t.slug,
      })),
    },
    ...SECTIONS.map((section): Group => ({
      label: section.name,
      items: section.tools.map((t) => ({
        key: t.path,
        name: t.name,
        icon: t.icon,
        path: t.path,
        network: t.network,
      })),
    })),
  ];

  return (
    <div
      ref={panelRef}
      role="menu"
      aria-label="Browse tools"
      className="fixed right-4 top-16 z-50 max-h-[calc(100vh-5rem)] w-72 overflow-y-auto rounded-xl border border-border bg-overlay py-1 shadow-[0_16px_64px_rgba(0,0,0,0.6)]"
    >
      {groups.map((group) => (
        <GroupBlock key={group.label} label={group.label}>
          {group.items.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.key}
                href={`/${item.path}/`}
                role="menuitem"
                onClick={() => onOpenChange(false)}
                className="group flex cursor-pointer items-center justify-between gap-3 rounded-md px-3 py-2 text-sm text-muted transition-colors hover:bg-elevated hover:text-foreground"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <Icon size={15} className="shrink-0 text-faint group-hover:text-accent" />
                  <span className="truncate font-medium">{item.name}</span>
                  {item.network && <NetworkBadge />}
                </span>
                <span className="shrink-0 font-mono text-xs text-faint">/{item.path}</span>
              </Link>
            );
          })}
        </GroupBlock>
      ))}
    </div>
  );
}

function GroupBlock({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="px-1 py-1.5">
      <h3 className="px-2 pb-1 text-xs font-medium uppercase tracking-wider text-faint">{label}</h3>
      {children}
    </div>
  );
}
