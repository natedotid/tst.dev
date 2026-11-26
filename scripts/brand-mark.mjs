// The tst.dev brand mark as a Satori element tree, scaled to any pixel size.
// The canonical design lives in public/logo.svg (also served directly to the
// header), so parsing it here keeps every surface from drifting apart.
import { createElement } from "react";
import { readFile } from "fs/promises";

const svgSource = await readFile(new URL("../public/logo.svg", import.meta.url), "utf8");
// logo.svg is written with one `<path fill="…" d="…"/>` per line; this parser
// relies on that shape, so keep it that way when editing the mark.
const paths = [...svgSource.matchAll(/<path fill="(#[0-9a-f]{6})" d="([^"]+)"\/>/g)].map(
  (m) => ({ fill: m[1], d: m[2] }),
);
if (paths.length < 2) throw new Error("logo.svg: expected at least two glyph paths");
const viewBoxMatch = svgSource.match(/viewBox="0 0 (\d+) (\d+)"/);
if (!viewBoxMatch) throw new Error("logo.svg: expected a viewBox attribute");
const [viewBoxW, viewBoxH] = [Number(viewBoxMatch[1]), Number(viewBoxMatch[2])];

/** The mark as a Satori SVG element at an explicit pixel width; the height is
 *  derived from the viewBox aspect. Explicit numbers (not percentages) matter:
 *  satori rasterizes `<svg>` to a bitmap at its declared size, and percentage
 *  dimensions don't survive that round trip: a square container would
 *  otherwise stretch the 16:13 mark. */
export function logoSvg({ width }) {
  return createElement(
    "svg",
    { viewBox: `0 0 ${viewBoxW} ${viewBoxH}`, width, height: (width * viewBoxH) / viewBoxW },
    ...paths.map((p) => createElement("path", { fill: p.fill, d: p.d })),
  );
}
