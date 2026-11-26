import type { Metadata } from "next";
import { ToolShell } from "@/components/tools/ToolShell";
import { JwtTool } from "@/components/tools/JwtTool";

export const metadata: Metadata = {
  alternates: { canonical: "/jwt/" },
  title: "JWT Inspector",
  description:
    "Decode JSON Web Tokens and inspect the header, payload, and claims (exp, iat, sub) with live expiry status.",
};

export default function JwtPage() {
  return (
    <ToolShell
      title="JWT Inspector"
      description="Decode a token and inspect its header, payload, and claims. Expiry status updates live."
      route="/jwt"
    >
      <JwtTool />
    </ToolShell>
  );
}
