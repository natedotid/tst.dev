import type { Metadata } from "next";
import { ToolShell } from "@/components/tools/ToolShell";
import { EmailHeaderTool } from "@/components/tools/EmailHeaderTool";

export const metadata: Metadata = {
  alternates: { canonical: "/email/headers/" },
  title: "Email Header Analyzer",
  description:
    "Paste raw email headers to read the SPF, DKIM, and DMARC results, the delivery path with per-hop delays, and a plain-English summary.",
};

export default function EmailHeadersPage() {
  return (
    <ToolShell
      title="Email Header Analyzer"
      description="Paste a message's raw headers to see its SPF, DKIM, and DMARC verdicts, the hop-by-hop delivery path, and any flags worth investigating."
      route="/email/headers"
    >
      <EmailHeaderTool />
    </ToolShell>
  );
}
