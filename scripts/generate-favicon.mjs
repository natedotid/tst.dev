// Renders app/favicon.ico (16/32/48/256, PNG-compressed entries): the
// browser-tab icon, auto-emitted by Next's `app/favicon.ico` file convention.
// Re-run after changing the design: node scripts/generate-favicon.mjs
import { writeFile } from "fs/promises";
import { createElement } from "react";
// Node ESM needs the explicit extension; Next-compiled files use "next/og".
import { ImageResponse } from "next/og.js";
import { logoSvg } from "./brand-mark.mjs";

// The mark has no tile background of its own, so each square favicon
// gets the site background behind it; the mark fills the width, centered
// vertically.
const sizes = [16, 32, 48, 256];
const entries = await Promise.all(
  sizes.map(async (size) => {
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
        logoSvg({ width: size }),
      ),
      { width: size, height: size },
    );
    return { size, png: Buffer.from(await res.arrayBuffer()) };
  }),
);

// ICO container: 6-byte ICONDIR, one 16-byte directory entry per image, then
// the PNG payloads. PNG compression is spec-legal for 256px entries and
// accepted by all modern browsers at smaller sizes too.
const dir = Buffer.alloc(entries.length * 16);
let offset = 6 + dir.length;
entries.forEach((e, i) => {
  const b = i * 16;
  const dim = e.size >= 256 ? 0 : e.size; // 0 encodes 256
  dir.writeUInt8(dim, b);
  dir.writeUInt8(dim, b + 1);
  dir.writeUInt16LE(1, b + 4); // color planes
  dir.writeUInt16LE(32, b + 6); // bits per pixel
  dir.writeUInt32LE(e.png.length, b + 8);
  dir.writeUInt32LE(offset, b + 12);
  offset += e.png.length;
});
const header = Buffer.alloc(6);
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(entries.length, 4);

const out = new URL("../app/favicon.ico", import.meta.url);
await writeFile(out, Buffer.concat([header, dir, ...entries.map((e) => e.png)]));
console.log(`wrote ${out.pathname} (${sizes.join("/")} px)`);
