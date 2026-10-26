import type { Metadata } from "next";
import { ErrorState } from "@/components/shared/status";
import { Card } from "@/components/ui/card";
import { CLIENT_PARAMS } from "@/features/clients/client-params";
import { ClientsScreen } from "@/features/clients/clients-screen";
import { serverApi } from "@/lib/api/server";

export const metadata: Metadata = { title: "Clients" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Clients list (PROMPT §8.3). Tabs, search and filters live in the URL. */
export default async function ClientsPage({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams;
  const query: Record<string, string> = {};
  for (const name of CLIENT_PARAMS) {
    const value = raw[name];
    const single = Array.isArray(value) ? value[0] : value;
    if (single) query[name] = single;
  }
  const api = await serverApi();
  const { data } = await api.GET("/v1/clients", { params: { query: query as never } });
  if (!data) {
    return (
      <Card>
        <ErrorState description="We couldn't load your clients. Check the filters or try again." />
      </Card>
    );
  }
  return <ClientsScreen list={data} />;
}
