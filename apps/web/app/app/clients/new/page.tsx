import { CheckCircle2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { ErrorState } from "@/components/shared/status";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { OnboardingStart } from "@/features/onboarding/onboarding-start";
import { OnboardingWizard } from "@/features/onboarding/onboarding-wizard";
import { serverApi } from "@/lib/api/server";

export const metadata: Metadata = { title: "Add new client" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const single = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

function Problem({ title, description }: { title: string; description: string }) {
  return (
    <Card className="max-w-2xl">
      <ErrorState
        title={title}
        description={description}
        action={
          <Button variant="outline" asChild>
            <Link href="/app/clients/new">Start or resume a client</Link>
          </Button>
        }
      />
    </Card>
  );
}

/**
 * Add Client onboarding (PROMPT §8.4): `?draft=` resumes a saved draft, `?fromLead=` continues a
 * converted lead's client, and no parameter lists drafts in progress or starts a new client.
 */
export default async function NewClientPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const draftId = single(params.draft);
  const fromLead = single(params.fromLead);
  const api = await serverApi();

  let body: ReactNode;
  if (draftId) {
    const { data, response } = await api.GET("/v1/onboarding/drafts/{id}", {
      params: { path: { id: draftId } },
    });
    body = data ? (
      <OnboardingWizard key={draftId} initial={data} />
    ) : response.status === 409 ? (
      <Problem title="This client has already been created" description="The draft was finished." />
    ) : (
      <Problem
        title="Draft not found"
        description="It may have been finished, or the link is wrong."
      />
    );
  } else if (fromLead) {
    const { data, response } = await api.GET("/v1/onboarding/from-lead/{leadId}", {
      params: { path: { leadId: fromLead } },
    });
    if (data?.status === "onboarded") {
      body = (
        <Card className="flex max-w-xl flex-col gap-3 p-6">
          <p className="flex items-center gap-2 text-lg font-semibold">
            <CheckCircle2 className="size-6 text-success" aria-hidden="true" />
            {data.fullName} is already onboarded
          </p>
          <Button variant="outline" className="self-start" asChild>
            <Link href={`/app/leads?lead=${fromLead}`}>Back to the lead</Link>
          </Button>
        </Card>
      );
    } else if (data?.draft) {
      body = <OnboardingWizard key={fromLead} initial={data.draft} />;
    } else {
      body = (
        <Problem
          title={response.status === 409 ? "Convert the lead first" : "Lead not found"}
          description={
            response.status === 409
              ? "Only a converted lead can be onboarded. Convert it from the lead's drawer."
              : "It may have been deleted, or the link is wrong."
          }
        />
      );
    }
  } else {
    const { data } = await api.GET("/v1/onboarding/drafts");
    body = data ? (
      <OnboardingStart drafts={data.drafts} units={data.units} />
    ) : (
      <Problem
        title="Something went wrong"
        description="We couldn't load your drafts. Try again."
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Add new client" description="Onboard a client in four short steps." />
      {body}
    </div>
  );
}
