import type { Metadata } from "next";
import { ToolShell } from "@/components/tools/ToolShell";
import { DnsTool } from "@/components/tools/DnsTool";
import { NetworkBadge } from "@/components/ui";

export const metadata: Metadata = {
  alternates: { canonical: "/dns/" },
  title: "Domain Inspector",
  description:
    "DNS record lookup over DNS-over-HTTPS (A, AAAA, NS, MX, TXT, SOA, CAA), SPF/DMARC/DKIM email-auth explanation, resolver comparison, and certificate-transparency history.",
};

export default function DnsPage() {
  return (
    <ToolShell
      title="Domain Inspector"
      description="Enter a domain to inspect its DNS records, email-authentication policy (SPF, DMARC, DKIM), and certificate history."
      route="/dns"
      remember={false}
      aside={<NetworkBadge />}
    >
      <DnsTool />
    </ToolShell>
  );
}
