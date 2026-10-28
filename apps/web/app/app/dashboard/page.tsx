import type { Metadata } from "next";
import { ErrorState } from "@/components/shared/status";
import { Card } from "@/components/ui/card";
import { DashboardScreen } from "@/features/dashboard/dashboard-screen";
import { firstName, greeting } from "@/features/dashboard/greeting";
import { getSession, serverApi } from "@/lib/api/server";

export const metadata: Metadata = { title: "Dashboard" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Dashboard (PROMPT §8.1): "What do I need to do today?" `?date=` moves the schedule only. */
export default async function DashboardPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const session = await getSession();
  if (session.status !== "signed_in" || !session.me.workspace) return null;
  const { me } = session;
  const raw = Array.isArray(params.date) ? params.date[0] : params.date;
  const date = raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : undefined;
  const api = await serverApi();
  const { data } = await api.GET("/v1/dashboard/summary", { params: { query: { date } } });
  if (!data) {
    return (
      <Card>
        <ErrorState description="We couldn't load your dashboard. Please try again." />
      </Card>
    );
  }
  const title = `${greeting(new Date(), data.timezone)}, ${firstName(me.profile.displayName)}`;
  return <DashboardScreen summary={data} title={title} />;
}
