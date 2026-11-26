import type { Metadata } from "next";
import Link from "next/link";

/**
 * Static stub instead of a bare 404: the IP & Subnet tool was retired,
 * so /ip/ location.replace's to home (instant, no history entry) +
 * a plain link as a last resort. noindex: the page is excluded from the
 * sitemap (it isn't in any registry).
 */
export const metadata: Metadata = {
  title: "IP & Subnet",
  robots: { index: false, follow: false },
};

export default function IpRemoved() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-24 text-center sm:px-6">
      <p className="text-sm uppercase tracking-wider text-faint">This page has been removed</p>
      <h1 className="mt-3 text-2xl font-semibold">IP &amp; Subnet</h1>
      <p className="mt-2 text-sm text-muted">
        The IP &amp; Subnet tool has been retired. The remaining tools are on the home page.{" "}
        <Link href="/" className="text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent">
          Back to home
        </Link>
        .
      </p>
      <script dangerouslySetInnerHTML={{ __html: "location.replace('/');" }} />
    </main>
  );
}
