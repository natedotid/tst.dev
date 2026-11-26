import type { Metadata } from "next";
import { ToolShell } from "@/components/tools/ToolShell";
import { PasswordTool } from "@/components/tools/PasswordTool";

export const metadata: Metadata = {
  alternates: { canonical: "/generate/password/" },
  title: "Password & Token Generator",
  description:
    "Generate random passwords, EFF wordlist passphrases, and API tokens, and estimate the entropy of anything you paste.",
};

export default function PasswordPage() {
  return (
    <ToolShell
      title="Password & Token Generator"
      description="Generate random passwords, EFF wordlist passphrases, or API tokens, and check the entropy of any candidate, pasted or generated."
      route="/generate/password"
      remember={false}
    >
      <PasswordTool />
    </ToolShell>
  );
}
