import type { Metadata } from "next";
import { ErrorState } from "@/components/shared/status";
import { Card } from "@/components/ui/card";
import { LEAD_PARAMS } from "@/features/leads/lead-params";
import { LeadsScreen } from "@/features/leads/leads-screen";
import { serverApi } from "@/lib/api/server";

export const metadata: Metadata = { title: "Leads" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Leads list (PROMPT §8.2). Filters live in the URL, so every view can be linked and reloaded. */
export default async function LeadsPage({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams;
  const query: Record<string, string> = {};
  for (const name of LEAD_PARAMS) {
    const value = raw[name];
    const single = Array.isArray(value) ? value[0] : value;
    if (single) query[name] = single;
  }
  // Tab counts use every filter except the stage (the tabs) and the sort.
  const filters = Object.fromEntries(
    Object.entries(query).filter(([name]) => name !== "stage" && name !== "sort"),
  );

  const api = await serverApi();
  const [list, summary] = await Promise.all([
    api.GET("/v1/leads", { params: { query: query as never } }),
    api.GET("/v1/leads/summary", { params: { query: filters as never } }),
  ]);

  if (!list.response.ok || !list.data || !summary.response.ok || !summary.data) {
    return (
      <Card>
        <ErrorState description="We couldn't load your leads. Check the filters or try again." />
      </Card>
    );
  }
  return <LeadsScreen list={list.data} summary={summary.data} />;
}
