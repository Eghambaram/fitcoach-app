import { CheckCircle2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState, ErrorState } from "@/components/shared/status";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { serverApi } from "@/lib/api/server";

export const metadata: Metadata = { title: "New client" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Where "Convert & Continue" lands (PROMPT §8.2 → §8.4). The onboarding wizard replaces this page in
 * step 2.5; until then it confirms the conversion honestly instead of pretending onboarding exists.
 */
export default async function NewClientPage({ searchParams }: { searchParams: SearchParams }) {
  const raw = (await searchParams).fromLead;
  const fromLead = Array.isArray(raw) ? raw[0] : raw;
  if (!fromLead) {
    return (
      <Card>
        <EmptyState
          title="Adding clients directly is coming soon"
          description="For now, convert a lead to a client from the Leads screen."
          action={
            <Button variant="outline" asChild>
              <Link href="/app/leads">Go to leads</Link>
            </Button>
          }
        />
      </Card>
    );
  }

  const api = await serverApi();
  const { data: lead, response } = await api.GET("/v1/leads/{id}", {
    params: { path: { id: fromLead } },
  });
  if (!response.ok || !lead || lead.stage !== "converted") {
    return (
      <Card>
        <ErrorState
          title="Lead not found"
          description="It may not be converted yet, or the link is wrong."
          action={
            <Button variant="outline" asChild>
              <Link href="/app/leads">Go to leads</Link>
            </Button>
          }
        />
      </Card>
    );
  }

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <PageHeader title="New client" description="From lead to client." />
      <Card className="flex flex-col gap-4 p-6">
        <p className="flex items-center gap-2 text-lg font-semibold">
          <CheckCircle2 className="size-6 text-success" aria-hidden="true" />
          {lead.fullName} is now a client
        </p>
        <p className="text-sm text-muted-foreground">
          Their contact details, goal and training mode came across, and the lead keeps its notes
          and history. They&apos;re marked as <strong>onboarding</strong> until their profile,
          baseline and consent are complete.
        </p>
        <p className="rounded-control bg-muted p-3 text-sm">
          The onboarding wizard is coming in the next update. You&apos;ll be able to finish{" "}
          {lead.fullName.split(" ")[0]}&apos;s onboarding from here.
        </p>
        <Button variant="outline" className="self-start" asChild>
          <Link href={`/app/leads?lead=${lead.id}`}>Back to the lead</Link>
        </Button>
      </Card>
    </div>
  );
}
