import type { MetadataRoute } from "next";

// Production origin; keep in sync with app/sitemap.ts and the layout metadata.
const BASE_URL = "https://tst.dev";

// Required: route handlers must be explicitly static for `output: "export"`.
export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
