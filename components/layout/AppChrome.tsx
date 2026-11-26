"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Header } from "./Header";
import { Footer } from "./Footer";
import { CommandMenu } from "./CommandMenu";
import { ToolsMenu } from "./ToolsMenu";

/**
 * Client chrome: sticky header, footer, the global ⌘K command palette, and
 * the hamburger tools menu. Open state for both lives here so the Header
 * buttons can drive them.
 */
export function AppChrome({ children }: { children: ReactNode }) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [toolsMenuOpen, setToolsMenuOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <>
      <Header
        onOpenCommand={() => setPaletteOpen(true)}
        onOpenTools={() => setToolsMenuOpen((open) => !open)}
      />
      <main className="min-h-0 flex-1">{children}</main>
      <Footer />
      <CommandMenu open={paletteOpen} onOpenChange={setPaletteOpen} />
      <ToolsMenu open={toolsMenuOpen} onOpenChange={setToolsMenuOpen} />
    </>
  );
}
