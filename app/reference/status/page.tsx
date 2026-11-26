import type { Metadata } from "next";
import { ToolShell } from "@/components/tools/ToolShell";
import { StatusTool } from "@/components/tools/StatusTool";

export const metadata: Metadata = {
  alternates: { canonical: "/reference/status/" },
  title: "HTTP Status Codes",
  description:
    "Every assigned HTTP status code from the IANA registry, with plain-English meaning and RFC references. Filter by code or keyword.",
};

export default function StatusPage() {
  return (
    <ToolShell
      title="HTTP Status Codes"
      description="The full IANA registry of assigned HTTP status codes with a plain-English note on what each means and where it comes from. Filter by code (4, 404) or keyword (redirect, webdav)."
      route="/reference/status"
      remember={false}
    >
      <StatusTool />
    </ToolShell>
  );
}
