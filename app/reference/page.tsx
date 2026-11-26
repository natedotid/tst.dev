import type { Metadata } from "next";
import Link from "next/link";
import { RouteBadge } from "@/components/ui";
import { SECTIONS } from "@/lib/sections";

export const metadata: Metadata = {
  alternates: { canonical: "/reference/" },
  title: "Reference",
  description:
    "Browse-only reference tables for developers: the full IANA HTTP status code registry with meanings and RFC references.",
};

const section = SECTIONS.find((s) => s.slug === "reference")!;

export default function ReferenceLanding() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="mb-6">
        <div className="mb-2 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight">Reference</h1>
          <RouteBadge route="tst.dev/reference" />
        </div>
        <p className="max-w-2xl text-sm text-muted">
          Browse-only reference tables. No input to paste, nothing to transform.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {section.tools.map((tool) => {
          const Icon = tool.icon;
          return (
            <Link
              key={tool.path}
              href={`/${tool.path}/`}
              className="group flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 transition-colors hover:border-accent/40 hover:bg-elevated"
            >
              <div className="flex items-center justify-between">
                <span className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-elevated text-muted transition-colors group-hover:text-accent">
                  <Icon size={15} />
                </span>
                <RouteBadge route={`/${tool.path}`} />
              </div>
              <div>
                <h2 className="text-sm font-medium text-foreground">{tool.name}</h2>
                <p className="mt-1 text-[13px] leading-relaxed text-muted">{tool.description}</p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
