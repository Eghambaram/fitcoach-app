"use client";

import type { PublicPageSettingsResponse } from "@fitcoach/shared";
import { useMutation } from "@tanstack/react-query";
import { ExternalLink, Share2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useOnline } from "@/components/shared/offline-banner";
import { StatusPill } from "@/components/shared/status";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { browserApi, unwrap } from "@/lib/api/browser";
import { CopyButton } from "./copy-button";

/** Publish / unpublish the enquiry page, with its link (PROMPT §8.12). */
export function PublishCard({ page }: { page: PublicPageSettingsResponse }) {
  const router = useRouter();
  const online = useOnline();
  const publish = useMutation({
    mutationFn: (published: boolean) =>
      unwrap(browserApi.POST("/v1/settings/public-page/publish", { body: { published } })),
    onSuccess: (saved) => {
      toast.success(saved.isPublished ? "Your page is live." : "Your page is offline.");
      router.refresh();
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="font-semibold">Your enquiry page</h2>
          <StatusPill tone={page.isPublished ? "success" : "neutral"}>
            {page.isPublished ? "Published" : "Not published"}
          </StatusPill>
        </div>
        {page.isPublished ? (
          <Button
            variant="outline"
            loading={publish.isPending}
            disabled={!online}
            onClick={() => publish.mutate(false)}
          >
            Unpublish
          </Button>
        ) : (
          <Button
            loading={publish.isPending}
            disabled={!online}
            onClick={() => publish.mutate(true)}
          >
            Publish page
          </Button>
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        {page.isPublished
          ? "People can find your page and send you enquiries. New enquiries become leads."
          : "Only you can see your settings. Publish to start receiving enquiries — you'll need a headline first."}
      </p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <code className="min-w-0 flex-1 truncate rounded-control bg-muted px-3 py-2.5 text-sm">
          {page.publicUrl}
        </code>
        <div className="flex flex-wrap gap-2">
          <CopyButton value={page.publicUrl} />
          {page.isPublished ? (
            <Button variant="outline" asChild>
              <a href={page.publicUrl} target="_blank" rel="noreferrer">
                <ExternalLink aria-hidden="true" />
                View page
              </a>
            </Button>
          ) : null}
          <Button variant="dark" asChild>
            <Link href="/app/settings/public-page/share">
              <Share2 aria-hidden="true" />
              Share
            </Link>
          </Button>
        </div>
      </div>
    </Card>
  );
}
