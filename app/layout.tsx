import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AppChrome } from "@/components/layout/AppChrome";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Read once at module level so the static export inlines the value at build
// time. When unset, the site builds without any analytics script.
const fathomSiteId = process.env.NEXT_PUBLIC_FATHOM_SITE_ID;

export const metadata: Metadata = {
  // Required for absolute og:/canonical URLs. Keep in sync with sitemap.ts / robots.ts.
  metadataBase: new URL("https://tst.dev"),
  title: {
    default: "tst.dev - Client-side developer utilities",
    template: "%s · tst.dev",
  },
  description:
    "Client-side developer tools for JWT, JSON, diff, regex, hashing, cron, DNS and more.",
  openGraph: {
    title: "tst.dev - Client-side developer utilities",
    description:
      "Client-side developer tools for JWT, JSON, diff, regex, hashing, cron, DNS and more.",
    url: "/",
    siteName: "tst.dev",
    type: "website",
    // Set explicitly so the emitted og:image / twitter:image URLs are the
    // clean static-file paths (auto-detection would append Next's asset
    // fingerprint query string).
    images: [
      {
        url: "/opengraph-image.png",
        width: 1200,
        height: 630,
        alt: "tst.dev - client-side developer utilities",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "tst.dev - Client-side developer utilities",
    description:
      "Client-side developer tools for JWT, JSON, diff, regex, hashing, cron, DNS and more.",
  },
};

export const viewport: Viewport = {
  themeColor: "#0d0d18",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <head>
        {/* Fathom Analytics is optional: the script is included only when
            NEXT_PUBLIC_FATHOM_SITE_ID is set at build time. It records a
            cookieless pageview with no personal data. The Domain Inspector's
            user-triggered DNS and crt.sh requests go straight from the browser
            to those services. */}
        {fathomSiteId ? (
          <script
            src="https://cdn.usefathom.com/script.js"
            data-site={fathomSiteId}
            defer
          />
        ) : null}
      </head>
      <body className="flex min-h-full flex-col">
        <AppChrome>{children}</AppChrome>
      </body>
    </html>
  );
}
