import { describe, expect, it } from "vitest";
import { SECTIONS } from "./sections";
import { SITE_TOOLS, TOOLS } from "./tools";

/**
 * Registry consistency: sections feed the ToolsMenu and the sitemap, so a
 * malformed entry would ship a dead link to production.
 */
describe("SECTIONS registry", () => {
  it("has unique section slugs", () => {
    const slugs = SECTIONS.map((s) => s.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("section slugs are lowercase route-safe tokens", () => {
    for (const section of SECTIONS) {
      expect(section.slug).toMatch(/^[a-z][a-z0-9-]*$/);
    }
  });

  it("every tool path is the section root or lives under its section slug", () => {
    // A section whose page is also its only tool (e.g. /dns/) has a tool whose
    // path equals the section slug; every other tool lives beneath it.
    for (const section of SECTIONS) {
      for (const tool of section.tools) {
        expect(tool.path === section.slug || tool.path.startsWith(`${section.slug}/`)).toBe(true);
      }
    }
  });

  it("tool slug is the last segment of its path", () => {
    for (const section of SECTIONS) {
      for (const tool of section.tools) {
        expect(tool.path.split("/").at(-1)).toBe(tool.slug);
      }
    }
  });

  it("tool paths are unique across sections and do not collide with home tools", () => {
    const homeSlugs = new Set(TOOLS.map((t) => t.slug));
    const paths = SECTIONS.flatMap((s) => s.tools.map((t) => t.path));
    expect(new Set(paths).size).toBe(paths.length);
    for (const path of paths) {
      expect(homeSlugs.has(path)).toBe(false);
    }
  });

  it("sections with tools render at least one tool", () => {
    for (const section of SECTIONS) {
      expect(section.tools.length).toBeGreaterThan(0);
    }
  });

  it("exactly one tool across SITE_TOOLS uses the network, and it is the Domain Inspector", () => {
    const networked = SITE_TOOLS.filter((t) => t.network === true);
    expect(networked).toHaveLength(1);
    expect(networked[0].path).toBe("dns");
  });
});
