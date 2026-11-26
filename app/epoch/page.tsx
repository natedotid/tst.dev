import type { Metadata } from "next";
import { ToolShell } from "@/components/tools/ToolShell";
import { EpochTool } from "@/components/tools/EpochTool";

export const metadata: Metadata = {
  alternates: { canonical: "/epoch/" },
  title: "Epoch Converter",
  description:
    "Convert Unix timestamps to human-readable UTC, local, and relative time, and back. Includes a live clock.",
};

export default function EpochPage() {
  return (
    <ToolShell
      title="Epoch Converter"
      description="Convert between Unix timestamps (seconds or milliseconds), UTC, local time, and relative phrasing, with a live clock."
      route="/epoch"
    >
      <EpochTool />
    </ToolShell>
  );
}
