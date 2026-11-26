import type { Metadata } from "next";
import { ToolShell } from "@/components/tools/ToolShell";
import { UrlTool } from "@/components/tools/UrlTool";

export const metadata: Metadata = {
  alternates: { canonical: "/url/" },
  title: "URL Inspector",
  description:
    "Parse a URL into its parts and query parameters, or percent-encode and decode URLs, query strings, and text.",
};

export default function UrlPage() {
  return (
    <ToolShell
      title="URL Inspector"
      description="Inspect a URL's protocol, host, path, and query parameters, or percent-encode and decode URLs, query strings, and plain text."
      route="/url"
    >
      <UrlTool />
    </ToolShell>
  );
}
