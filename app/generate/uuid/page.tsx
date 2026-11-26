import type { Metadata } from "next";
import { ToolShell } from "@/components/tools/ToolShell";
import { UuidTool } from "@/components/tools/UuidTool";

export const metadata: Metadata = {
  alternates: { canonical: "/generate/uuid/" },
  title: "UUID & ULID",
  description:
    "Bulk-generate UUID v4 and ULID identifiers, with a count slider and one-click copy.",
};

export default function UuidPage() {
  return (
    <ToolShell
      title="UUID & ULID"
      description="Generate up to 100 UUID v4 or ULID identifiers with one click."
      route="/generate/uuid"
      remember={false}
    >
      <UuidTool />
    </ToolShell>
  );
}
