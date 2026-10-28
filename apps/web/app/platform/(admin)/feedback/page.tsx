import { FEEDBACK_STATUSES, type FeedbackStatus } from "@fitcoach/shared";
import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { ErrorState } from "@/components/shared/status";
import { Card } from "@/components/ui/card";
import { FeedbackInbox } from "@/features/platform/feedback-inbox";
import { serverApi } from "@/lib/api/server";

export const metadata: Metadata = { title: "Feedback" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function PlatformFeedbackPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const raw = (await searchParams).status;
  const value = Array.isArray(raw) ? raw[0] : raw;
  const status: FeedbackStatus = FEEDBACK_STATUSES.includes(value as FeedbackStatus)
    ? (value as FeedbackStatus)
    : "open";
  const api = await serverApi();
  const { data } = await api.GET("/v1/platform/feedback", { params: { query: { status } } });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Feedback" description="What trainers told us from the app." />
      {data ? (
        <FeedbackInbox data={data} status={status} />
      ) : (
        <Card>
          <ErrorState description="We couldn't load feedback. Please try again." />
        </Card>
      )}
    </div>
  );
}
