import type { Metadata } from "next";
import { LayoutDashboard } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState, NotConfiguredNotice } from "@/components/shared/status";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = { title: "Platform overview" };

/** Real counts (trainers, activation, feedback, health) arrive in step 6.1 — no sample numbers until then. */
export default function PlatformOverviewPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Platform overview"
        description="Trainers, activation and platform health."
      />
      <NotConfiguredNotice
        name="Billing"
        description="The beta is free; revenue cards appear when billing is set up (v1.1)."
      />
      <Card>
        <EmptyState
          icon={LayoutDashboard}
          title="Platform tools are on the way"
          description="Trainer counts, approvals, feedback and system health appear here with the platform owner release."
        />
      </Card>
    </div>
  );
}
