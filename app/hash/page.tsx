import type { Metadata } from "next";
import { ToolShell } from "@/components/tools/ToolShell";
import { HashTool } from "@/components/tools/HashTool";

export const metadata: Metadata = {
  alternates: { canonical: "/hash/" },
  title: "Hash, HMAC & Codecs",
  description:
    "Generate SHA-1, SHA-256, SHA-384, and SHA-512 digests, HMAC keyed MACs in hex and Base64, plus Base64, Base32, and hex encoding and decoding.",
};

export default function HashPage() {
  return (
    <ToolShell
      title="Hash, HMAC & Codecs"
      description="Real-time SHA-1, SHA-256, SHA-384, and SHA-512 digests, HMAC keyed MACs (hex and Base64), and a Base64 / Base32 / hex codec with encode and decode."
      route="/hash"
    >
      <HashTool />
    </ToolShell>
  );
}
