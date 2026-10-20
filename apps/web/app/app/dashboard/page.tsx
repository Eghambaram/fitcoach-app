import type { Metadata } from "next";
import { CalendarCheck } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/status";
import { Card } from "@/components/ui/card";
import { firstName, greeting, longDate } from "@/features/dashboard/greeting";
import { getSession } from "@/lib/api/server";

export const metadata: Metadata = { title: "Dashboard" };

/**
 * The dashboard's KPIs, schedule, needs-attention list and first-run checklist arrive in step 5.1,
 * once there is data to show. Until then it says so honestly — no sample numbers (§7.3).
 */
export default async function DashboardPage() {
  const session = await getSession();
  if (session.status !== "signed_in" || !session.me.workspace) return null;
  const { me } = session;
  const timeZone = me.workspace?.timezone ?? "Asia/Kolkata";
  const now = new Date();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`${greeting(now, timeZone)}, ${firstName(me.profile.displayName)}`}
        description={longDate(now, timeZone)}
      />
      <Card>
        <EmptyState
          icon={CalendarCheck}
          title="Your day will show up here"
          description="Today's sessions, follow-ups due, check-ins to review and payments due appear here as you add leads and clients."
        />
      </Card>
    </div>
  );
}
