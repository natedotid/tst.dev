// Renders public/opengraph-image.png (1200×630): the static OG/Twitter card
// image. Referenced via openGraph.images in app/layout.tsx (kept in public/
// rather than app/ so Next's opengraph-image file convention doesn't take
// over the emitted meta tags). A static image file is used instead of an
// opengraph-image.tsx route because the CloudFront viewer-request function
// rewrites extensionless URLs to /index.html, which would 404 the generated
// route.
// Re-run after changing the design: node scripts/generate-opengraph-image.mjs
import { readFile, writeFile } from "fs/promises";
import { createElement } from "react";
// Node ESM needs the explicit extension; Next-compiled files use "next/og".
import { ImageResponse } from "next/og.js";
import { logoSvg } from "./brand-mark.mjs";

const root = new URL("..", import.meta.url);
const [geist400, geist500, geistMono600, geistMono700] = await Promise.all(
  ["Geist-400.ttf", "Geist-500.ttf", "GeistMono-600.ttf", "GeistMono-700.ttf"].map(
    (f) => readFile(new URL(`fonts/${f}`, root)),
  ),
);

const image = createElement(
  "div",
  {
    style: {
      width: "100%",
      height: "100%",
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      alignItems: "flex-start",
      background: "#0d0d18",
      padding: "0 90px",
      fontFamily: "Geist",
    },
  },
  createElement(
    "div",
    {
      style: {
        display: "flex",
        alignItems: "flex-start",
        gap: 34,
      },
    },
    // The icon-only mark (no tile) sits directly on the dark background,
    // sized slightly larger than the wordmark. The row is flex-start and
    // the marginTop centers the mark on the wordmark's glyph box (tuned by
    // pixel measurement to within 2px): the text's line box leaves
    // descender space below the baseline, so a plain alignItems center
    // would top-align the mark with the text.
    createElement(
      "div",
      { style: { display: "flex", marginTop: 20 } },
      logoSvg({ width: 175 }),
    ),
    createElement(
      "div",
      {
        style: {
          display: "flex",
          alignItems: "baseline",
          fontFamily: "Geist Mono",
          fontWeight: 600,
          fontSize: 148,
          letterSpacing: "-0.03em",
        },
      },
      createElement("span", { style: { color: "#f4f4fa" } }, "tst"),
      createElement("span", { style: { color: "#8795ff" } }, ".dev"),
    ),
  ),
  createElement(
    "div",
    {
      style: {
        marginTop: 46,
        fontSize: 44,
        color: "#b8b8ca",
        lineHeight: 1.4,
      },
    },
    "Simple, client-side developer tools.",
  ),
);

const res = await new ImageResponse(image, {
  width: 1200,
  height: 630,
  fonts: [
    { name: "Geist", data: geist400, weight: 400, style: "normal" },
    { name: "Geist", data: geist500, weight: 500, style: "normal" },
    { name: "Geist Mono", data: geistMono600, weight: 600, style: "normal" },
    { name: "Geist Mono", data: geistMono700, weight: 700, style: "normal" },
  ],
});

const out = new URL("../public/opengraph-image.png", import.meta.url);
await writeFile(out, Buffer.from(await res.arrayBuffer()));
console.log(`wrote ${out.pathname} (1200×630)`);
