import type { Metadata } from "next";
import { ToolShell } from "@/components/tools/ToolShell";
import { DiffTool } from "@/components/tools/DiffTool";

export const metadata: Metadata = {
  alternates: { canonical: "/diff/" },
  title: "Text Diff",
  description:
    "Side-by-side text comparison with line and character-level highlighting.",
};

export default function DiffPage() {
  return (
    <ToolShell
      title="Text Diff"
      description="Compare two texts side by side. Added and removed lines are highlighted, with character-level edits inside each changed line."
      route="/diff"
    >
      <DiffTool />
    </ToolShell>
  );
}
