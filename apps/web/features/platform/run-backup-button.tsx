"use client";

import { useMutation } from "@tanstack/react-query";
import { DatabaseBackup } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useOnline } from "@/components/shared/offline-banner";
import { Button } from "@/components/ui/button";
import { browserApi, unwrap } from "@/lib/api/browser";

/** Runs the in-API database backup now (ADR-0064); the Backups check shows the result. */
export function RunBackupButton() {
  const router = useRouter();
  const online = useOnline();
  const run = useMutation({
    mutationFn: () => unwrap(browserApi.POST("/v1/platform/backups/run")),
    onSuccess: () => {
      toast.success("Backup started. The Backups check updates when it's done (about a minute).");
      setTimeout(() => router.refresh(), 30_000);
    },
    onError: (error) => toast.error(error.message),
  });
  return (
    <Button
      variant="outline"
      loading={run.isPending}
      disabled={!online}
      onClick={() => run.mutate()}
    >
      <DatabaseBackup className="size-4" aria-hidden="true" />
      Run backup now
    </Button>
  );
}
