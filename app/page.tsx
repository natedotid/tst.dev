import type { Metadata } from "next";
import Link from "next/link";
import { SmartScratchpad } from "@/components/scratchpad/SmartScratchpad";
import { TOOLS } from "@/lib/tools";
import { RouteBadge } from "@/components/ui";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

export default function Home() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
      {/* Hero */}
      <section className="mb-10 text-center">
        <h1 className="mx-auto max-w-xl text-xl font-medium leading-relaxed">
          Simple, client-side developer tools.
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-lg font-medium leading-relaxed text-muted">
          Paste text below for auto-detection and preview, or jump right to a specific tool.
        </p>
      </section>

      {/* Smart Scratchpad omnibox */}
      <section className="mx-auto mb-16 max-w-3xl">
        <SmartScratchpad />
      </section>

      {/* Tool grid: the whole paste-and-transform family; everything else
          lives in a section (DNS, email, generate, reference). */}
      <section>
        <h2 className="mb-4 text-xs font-medium uppercase tracking-wider text-faint">Tools</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {TOOLS.map((tool) => {
            const Icon = tool.icon;
            return (
              <Link
                key={tool.slug}
                href={`/${tool.slug}/`}
                className="group flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 transition-colors hover:border-accent/40 hover:bg-elevated"
              >
                <div className="flex items-center justify-between">
                  <span className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-elevated text-muted transition-colors group-hover:text-accent">
                    <Icon size={15} />
                  </span>
                  <RouteBadge route={`/${tool.slug}`} />
                </div>
                <div>
                  <h3 className="text-sm font-medium text-foreground">{tool.name}</h3>
                  <p className="mt-1 text-[13px] leading-relaxed text-muted">{tool.description}</p>
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
