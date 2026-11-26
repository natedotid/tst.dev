import type { Metadata } from "next";
import Link from "next/link";

/**
 * Static redirect for an old URL: it now lives at /reference/status/.
 * location.replace (instant, no history entry) + a plain link as a
 * last resort. No meta-refresh: Next's metadata `other` field renders
 * as a `name` attribute, not `http-equiv`, so it can't emit a spec-valid
 * refresh tag, and the site is JS-dependent anyway. noindex: the
 * canonical page is the new route, and this page is excluded from the
 * sitemap (it isn't in any registry).
 */
export const metadata: Metadata = {
  title: "Moved: HTTP Status Codes",
  robots: { index: false, follow: false },
};

export default function StatusRedirect() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-24 text-center sm:px-6">
      <p className="text-sm uppercase tracking-wider text-faint">This page has moved</p>
      <h1 className="mt-3 text-2xl font-semibold">HTTP Status Codes</h1>
      <p className="mt-2 text-sm text-muted">
        It now lives in the Reference section.{" "}
        <Link href="/reference/status/" className="text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent">
          Continue to /reference/status/
        </Link>
        .
      </p>
      <script dangerouslySetInnerHTML={{ __html: "location.replace('/reference/status/');" }} />
    </main>
  );
}
