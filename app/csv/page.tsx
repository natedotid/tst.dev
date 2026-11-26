import type { Metadata } from "next";
import { ToolShell } from "@/components/tools/ToolShell";
import { CsvTool } from "@/components/tools/CsvTool";

export const metadata: Metadata = {
  alternates: { canonical: "/csv/" },
  title: "CSV ↔ JSON",
  description:
    "Convert between CSV and JSON with automatic delimiter detection, quoted fields, header mapping, and RFC 4180 output.",
};

export default function CsvPage() {
  return (
    <ToolShell
      title="CSV ↔ JSON"
      description="Paste CSV to get a JSON array of objects, or paste JSON to get RFC 4180 CSV. Handles quoted fields, embedded commas and newlines, and auto-detects the delimiter."
      route="/csv"
    >
      <CsvTool />
    </ToolShell>
  );
}
