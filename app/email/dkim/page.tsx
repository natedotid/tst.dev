import type { Metadata } from "next";
import { ToolShell } from "@/components/tools/ToolShell";
import { DkimTool } from "@/components/tools/DkimTool";

export const metadata: Metadata = {
  alternates: { canonical: "/email/dkim/" },
  title: "DKIM Key Generator",
  description:
    "Generate an RSA DKIM keypair: the public TXT record to publish at selector._domainkey.yourdomain and the private key for your mail server.",
};

export default function EmailDkimPage() {
  return (
    <ToolShell
      title="DKIM Key Generator"
      description="Generate an RSA keypair for DKIM. You get the public TXT record for your DNS and the private key as a download for your mail server."
      route="/email/dkim"
    >
      <DkimTool />
    </ToolShell>
  );
}
