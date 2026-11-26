import type { MetadataRoute } from "next";
import { TOOLS } from "@/lib/tools";
import { SECTIONS } from "@/lib/sections";

// Production origin; keep in sync with app/robots.ts and the layout metadata.
const BASE_URL = "https://tst.dev";

// Required: route handlers must be explicitly static for `output: "export"`.
export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const toolUrls: MetadataRoute.Sitemap = TOOLS.map((tool) => ({
    url: `${BASE_URL}/${tool.slug}/`,
    lastModified: now,
    changeFrequency: "monthly",
    priority: 0.8,
  }));
  const sectionToolUrls: MetadataRoute.Sitemap = SECTIONS.flatMap((section) => section.tools).map(
    (tool) => ({
      url: `${BASE_URL}/${tool.path}/`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.7,
    }),
  );
  const sectionLandingUrls: MetadataRoute.Sitemap = SECTIONS.filter((section) => section.landing).map(
    (section) => ({
      url: `${BASE_URL}/${section.slug}/`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.6,
    }),
  );
  return [
    {
      url: `${BASE_URL}/`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1,
    },
    ...toolUrls,
    ...sectionToolUrls,
    ...sectionLandingUrls,
  ];
}
