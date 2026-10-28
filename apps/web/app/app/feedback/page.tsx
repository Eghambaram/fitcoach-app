import { feedbackRequestSchema } from "@fitcoach/shared";
import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { Card } from "@/components/ui/card";
import { FeedbackForm } from "@/features/beta/feedback-form";

export const metadata: Metadata = { title: "Send feedback" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Beta feedback (PROMPT §16.0). `?from=/app/...` names the screen it was opened from. */
export default async function FeedbackPage({ searchParams }: { searchParams: SearchParams }) {
  const raw = (await searchParams).from;
  const from = Array.isArray(raw) ? raw[0] : raw;
  const page = feedbackRequestSchema.shape.page.safeParse(from);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <PageHeader
        title="Send feedback"
        description="You're one of the first trainers on FitCoach. Tell us what to fix or build next."
      />
      <Card className="p-4 md:p-6">
        <FeedbackForm
          page={page.success && page.data?.startsWith("/app") ? page.data : undefined}
        />
      </Card>
    </div>
  );
}
