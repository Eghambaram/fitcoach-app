import type { Metadata } from "next";
import Link from "next/link";
import { ErrorState } from "@/components/shared/status";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ClientDetailScreen } from "@/features/clients/client-detail";
import { serverApi } from "@/lib/api/server";

export const metadata: Metadata = { title: "Client" };

/** Client profile (PROMPT §8.3). */
export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const api = await serverApi();
  const { data, response } = await api.GET("/v1/clients/{id}", { params: { path: { id } } });
  if (!data) {
    return (
      <Card>
        <ErrorState
          title={
            response.status === 404 || response.status === 400 ? "Client not found" : undefined
          }
          description={
            response.status === 404 || response.status === 400
              ? "They may belong to another workspace, or the link is wrong."
              : "We couldn't load this client. Please try again."
          }
          action={
            <Button variant="outline" asChild>
              <Link href="/app/clients">All clients</Link>
            </Button>
          }
        />
      </Card>
    );
  }
  return <ClientDetailScreen key={data.id} initial={data} />;
}
