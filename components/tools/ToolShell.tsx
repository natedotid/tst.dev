"use client";

import type { ReactNode } from "react";
import { PageHeader, RememberToggle } from "@/components/ui";

export function ToolShell({
  title,
  description,
  route,
  remember = true,
  aside,
  children,
}: {
  title: string;
  description: string;
  route: string;
  /** Opt into the per-tool "remember input" toggle. Off for tools without pasted input (e.g. UUID). */
  remember?: boolean;
  /** Right-aligned header action, shown when `remember` is off (the toggle occupies the slot otherwise). */
  aside?: ReactNode;
  children: ReactNode;
}) {
  const slug = route.replace(/^\/+/, "").replace(/\/+$/, "");
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <PageHeader
        title={title}
        description={description}
        route={route}
        aside={remember ? <RememberToggle tool={slug} /> : aside}
      />
      {children}
    </div>
  );
}
