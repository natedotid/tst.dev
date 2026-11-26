import type { Metadata } from "next";
import { ToolShell } from "@/components/tools/ToolShell";
import { CronTool } from "@/components/tools/CronTool";

export const metadata: Metadata = {
  alternates: { canonical: "/cron/" },
  title: "Cron Explainer",
  description:
    "Decode 5 or 6-part cron expressions into plain English, with each field explained and the next 5 execution times.",
};

export default function CronPage() {
  return (
    <ToolShell
      title="Cron Explainer"
      description="Enter a 5- or 6-field cron expression to get a plain-English schedule, a per-field breakdown, and the next 5 execution times."
      route="/cron"
    >
      <CronTool />
    </ToolShell>
  );
}
