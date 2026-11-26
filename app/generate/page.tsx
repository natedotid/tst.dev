import type { Metadata } from "next";
import Link from "next/link";
import { RouteBadge } from "@/components/ui";
import { SECTIONS } from "@/lib/sections";

export const metadata: Metadata = {
  alternates: { canonical: "/generate/" },
  title: "Generators",
  description:
    "Generate UUIDs, ULIDs, random passwords, EFF wordlist passphrases, and API tokens.",
};

const section = SECTIONS.find((s) => s.slug === "generate")!;

export default function GenerateLanding() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="mb-6">
        <div className="mb-2 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight">Generate</h1>
          <RouteBadge route="tst.dev/generate" />
        </div>
        <p className="max-w-2xl text-sm text-muted">
          Values are rolled with <span className="font-mono">crypto.getRandomValues()</span> in your browser, and
          nothing is stored or sent.
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

      <p className="mt-8 text-[13px] text-faint">
        Signing email? The{" "}
        <Link href="/email/dkim/" className="text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent">
          DKIM key generator
        </Link>{" "}
        lives in the Email section.
      </p>
    </div>
  );
}
