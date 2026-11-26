"use client";

import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Check, Copy, Save } from "lucide-react";
import { cn, copyToClipboard } from "@/lib/utils";
import { useRemembered } from "@/lib/remember";

/* ---------------------------------- Button --------------------------------- */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: "sm" | "md";
}

export function Button({ variant = "secondary", size = "md", className, type, ...props }: ButtonProps) {
  return (
    <button
      type={type ?? "button"}
      className={cn(
        "inline-flex select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium transition-colors duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
        "disabled:pointer-events-none disabled:opacity-40",
        size === "sm" ? "h-7 px-2.5 text-[13px]" : "h-8 px-3 text-[13px]",
        variant === "primary" && "border border-transparent bg-foreground text-background hover:bg-foreground/85",
        variant === "secondary" && "border border-border bg-elevated text-foreground hover:border-border hover:bg-overlay",
        variant === "ghost" && "border border-transparent text-muted hover:bg-elevated hover:text-foreground",
        variant === "danger" && "border border-danger/30 text-danger hover:bg-danger/10",
        className,
      )}
      {...props}
    />
  );
}

/* ---------------------------------- Badge ---------------------------------- */

export type BadgeTone = "neutral" | "success" | "danger" | "warning" | "accent" | "info" | "violet";

export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: BadgeTone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium",
        tone === "neutral" && "border-border bg-elevated text-muted",
        tone === "success" && "border-success/30 bg-success/10 text-success",
        tone === "danger" && "border-danger/30 bg-danger/10 text-danger",
        tone === "warning" && "border-warning/30 bg-warning/10 text-warning",
        tone === "accent" && "border-accent/30 bg-accent/10 text-accent",
        tone === "info" && "border-info/30 bg-info/10 text-info",
        tone === "violet" && "border-violet/30 bg-violet/10 text-violet",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Neutral "uses network" label for a tool that makes browser-direct requests. */
export function NetworkBadge() {
  return (
    <span
      className="shrink-0"
      title="Looks up the domain you enter with public DNS and certificate services, from your browser, when you click."
    >
      <Badge tone="neutral">uses network</Badge>
    </span>
  );
}

/** Monospace chip showing a short route, e.g. `tst.dev/jwt`. */
export function RouteBadge({ route, className }: { route: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border border-border bg-elevated px-1.5 py-0.5 font-mono text-xs text-info",
        className,
      )}
    >
      {route}
    </span>
  );
}

/* -------------------------------- CopyButton ------------------------------- */

export function CopyButton({
  text,
  label = "Copy",
  size = "sm",
  variant = "ghost",
  disabled,
  className,
}: {
  text: string;
  label?: string;
  size?: "sm" | "md";
  variant?: ButtonVariant;
  disabled?: boolean;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const handleCopy = async () => {
    if (await copyToClipboard(text)) {
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1600);
    }
  };

  return (
    <Button size={size} variant={variant} disabled={disabled || !text} onClick={handleCopy} aria-label={label || "Copy"} className={className}>
      {copied ? <Check size={13} className="text-success" /> : <Copy size={13} />}
      {copied ? "Copied" : label}
    </Button>
  );
}

/* ---------------------------------- Panel ---------------------------------- */

export function Panel({
  title,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("flex flex-col overflow-hidden rounded-lg border border-border bg-surface", className)}>
      {(title || actions) && (
        <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border-subtle px-3 py-2">
          <h2 className="text-xs font-medium uppercase tracking-wider text-muted">{title}</h2>
          <div className="flex items-center gap-1.5">{actions}</div>
        </header>
      )}
      <div className={cn("min-h-0 flex-1 p-3", bodyClassName)}>{children}</div>
    </section>
  );
}

/* -------------------------------- ErrorBanner ------------------------------ */

/** Scrollable monospace preview block. */
export function CodePreview({ text, className }: { text: string; className?: string }) {
  return (
    <pre
      className={cn(
        "max-h-48 overflow-auto rounded-md border border-border-subtle bg-background/60 p-3 font-mono text-[13px] leading-relaxed text-foreground/90",
        className,
      )}
    >
      {text}
    </pre>
  );
}

export function ErrorBanner({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-2 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-[13px] leading-relaxed text-danger",
        className,
      )}
    >
      <span aria-hidden>⚠</span>
      <span>{children}</span>
    </div>
  );
}

/* ----------------------------------- Field --------------------------------- */

/** Label/value row used in output panels. Values use the info pastel so data pops. */
export function Field({ label, children, mono = true }: { label: string; children: ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border-subtle py-2 last:border-0">
      <span className="shrink-0 text-[13px] text-muted">{label}</span>
      <span className={cn("min-w-0 break-all text-right text-[13px] text-info", mono && "font-mono")}>{children}</span>
    </div>
  );
}

/* ----------------------------- RememberToggle ------------------------------ */

/**
 * Opt-in "remember input" switch for one tool. Off by default: nothing is
 * written to localStorage until it is turned on, and turning it off deletes
 * the tool's saved inputs.
 */
export function RememberToggle({ tool, className }: { tool: string; className?: string }) {
  const { enabled, toggle } = useRemembered(tool);
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={enabled}
      title={
        enabled
          ? "This tool’s input is saved in this browser (localStorage). Turn off to stop saving and delete what’s stored."
          : "Remember this tool’s input in this browser (localStorage). Off by default. Nothing is saved until you turn it on."
      }
      className={cn(
        "inline-flex h-7 select-none items-center gap-1.5 whitespace-nowrap rounded-md border px-2.5 text-[13px] font-medium transition-colors duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
        enabled
          ? "border-accent/40 bg-accent/15 text-accent"
          : "border-border bg-elevated text-muted hover:text-foreground",
        className,
      )}
    >
      {enabled ? <Check size={12} /> : <Save size={12} />}
      {enabled ? "Remembering" : "Remember input"}
    </button>
  );
}

/* --------------------------------- PageHeader ------------------------------ */

export function PageHeader({
  title,
  description,
  route,
  aside,
}: {
  title: string;
  description: string;
  route: string;
  /** Right-aligned action slot on the title row (e.g. RememberToggle). */
  aside?: ReactNode;
}) {
  return (
    <div className="mb-6">
      <div className="mb-2 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        <RouteBadge route={`tst.dev${route}`} />
        {aside && <div className="ml-auto">{aside}</div>}
      </div>
      <p className="max-w-2xl text-sm text-muted">{description}</p>
    </div>
  );
}
