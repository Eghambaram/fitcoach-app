"use client";

import type { ClientMeResponse } from "@fitcoach/shared";
import { useMutation } from "@tanstack/react-query";
import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { browserApi, unwrap } from "@/lib/api/browser";

/**
 * The client portal frame (PROMPT §9): calmer than the trainer app. Navigation arrives with the
 * client screens (step 4.2); until then only what works is shown.
 */
export function ClientShell({ me, children }: { me: ClientMeResponse; children: ReactNode }) {
  const router = useRouter();
  const signOut = useMutation({
    mutationFn: () => unwrap(browserApi.POST("/v1/auth/logout")),
    onSuccess: () => {
      router.replace("/client/login");
      router.refresh();
    },
    onError: (error) => toast.error(error.message),
  });
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="flex items-center justify-between gap-3 border-b border-border bg-card px-4 py-3">
        <Logo />
        <Button
          variant="ghost"
          loading={signOut.isPending}
          onClick={() => signOut.mutate()}
          aria-label="Sign out"
        >
          <LogOut aria-hidden="true" />
          <span className="hidden sm:inline">Sign out</span>
        </Button>
      </header>
      {me.workspace.readOnly ? (
        <div
          role="status"
          className="bg-warning-soft px-4 py-2 text-center text-sm font-medium text-warning"
        >
          {me.trainer.displayName}&apos;s account is paused, so changes can&apos;t be saved right
          now.
        </div>
      ) : null}
      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
