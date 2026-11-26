// Renders app/apple-icon.png (180×180): the brand mark iOS uses for
// "Add to Home Screen" (auto-emitted as <link rel="apple-touch-icon">).
// Re-run after changing the design: node scripts/generate-apple-icon.mjs
import { writeFile } from "fs/promises";
import { createElement } from "react";
// Node ESM needs the explicit extension; Next-compiled files use "next/og".
import { ImageResponse } from "next/og.js";
import { logoSvg } from "./brand-mark.mjs";

// The mark has no tile background of its own, so the square icon gets
// the site background behind it; the mark fills the width, centered vertically.
const res = await new ImageResponse(
  createElement(
    "div",
    {
      style: {
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0d0d18",
      },
    },
    logoSvg({ width: 180 }),
  ),
  { width: 180, height: 180 },
);

const out = new URL("../app/apple-icon.png", import.meta.url);
await writeFile(out, Buffer.from(await res.arrayBuffer()));
console.log(`wrote ${out.pathname} (180×180)`);
