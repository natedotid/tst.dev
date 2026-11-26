import type { Metadata } from "next";
import { ToolShell } from "@/components/tools/ToolShell";
import { RegexTool } from "@/components/tools/RegexTool";

export const metadata: Metadata = {
  alternates: { canonical: "/regex/" },
  title: "Regex Tester",
  description:
    "Interactive regular expression tester with flag toggles, live match highlighting, and capture group inspection.",
};

export default function RegexPage() {
  return (
    <ToolShell
      title="Regex Tester"
      description="Build a pattern, toggle flags, and watch matches highlight in real time. Capture groups are listed for every match."
      route="/regex"
    >
      <RegexTool />
    </ToolShell>
  );
}
