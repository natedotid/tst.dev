import type { Metadata } from "next";
import Link from "next/link";
import { Home } from "lucide-react";
import { SITE_TOOLS } from "@/lib/tools";
import { NetworkBadge } from "@/components/ui";

export const metadata: Metadata = {
  title: "Not Found",
  description: "The page you are looking for does not exist.",
};

export default function NotFound() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col items-center px-4 py-20 text-center sm:px-6 sm:py-28">
      <span className="select-none font-mono text-7xl font-bold leading-none text-faint">404</span>
      <h1 className="mt-5 text-xl font-semibold tracking-tight">Page not found</h1>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">
        Nothing lives at this address. Head back home, or jump straight into a tool.
      </p>

      <Link
        href="/"
        className="mt-6 inline-flex h-8 select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-transparent bg-foreground px-3 text-[13px] font-medium text-background transition-colors duration-150 hover:bg-foreground/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
      >
        <Home size={13} />
        Back home
      </Link>

      <div className="mt-12 grid w-full max-w-2xl grid-cols-2 gap-2 sm:grid-cols-4">
        {SITE_TOOLS.map((tool) => {
          const Icon = tool.icon;
          return (
            <Link
              key={tool.path}
              href={`/${tool.path}/`}
              className="flex items-center gap-2 rounded-md border border-border-subtle bg-surface px-3 py-2 text-[13px] text-muted transition-colors hover:border-border hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
            >
              <Icon size={14} className="shrink-0 text-faint" />
              <span className="truncate">{tool.name}</span>
              {tool.network && <NetworkBadge />}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
