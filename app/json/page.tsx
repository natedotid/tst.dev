import type { Metadata } from "next";
import { ToolShell } from "@/components/tools/ToolShell";
import { JsonTool } from "@/components/tools/JsonTool";

export const metadata: Metadata = {
  alternates: { canonical: "/json/" },
  title: "JSON Formatter",
  description:
    "Format, minify, validate, and convert JSON to YAML or NDJSON, with error markers on the exact line.",
};

export default function JsonPage() {
  return (
    <ToolShell
      title="JSON Formatter"
      description="Format with 2 or 4-space indent, minify, or convert between JSON, YAML, and NDJSON. Parse errors are marked on the exact line."
      route="/json"
    >
      <JsonTool />
    </ToolShell>
  );
}
