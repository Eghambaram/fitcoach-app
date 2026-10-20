"use client";

import type { SessionSummary } from "@fitcoach/shared";
import { useMutation } from "@tanstack/react-query";
import { Monitor, Smartphone } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/shared/overlays";
import { EmptyState, StatusPill } from "@/components/shared/status";
import { Button } from "@/components/ui/button";
import { browserApi, unwrap } from "@/lib/api/browser";

/** A readable device name from the user agent — a hint, not something to rely on. */
export function describeDevice(userAgent: string | null): { label: string; mobile: boolean } {
  if (!userAgent) return { label: "Unknown device", mobile: false };
  const mobile = /Mobile|Android|iPhone|iPad/i.test(userAgent);
  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /Chrome\//.test(userAgent)
      ? "Chrome"
      : /Firefox\//.test(userAgent)
        ? "Firefox"
        : /Safari\//.test(userAgent)
          ? "Safari"
          : "Browser";
  const os = /Android/i.test(userAgent)
    ? "Android"
    : /iPhone|iPad/i.test(userAgent)
      ? "iOS"
      : /Windows/i.test(userAgent)
        ? "Windows"
        : /Mac OS X/i.test(userAgent)
          ? "macOS"
          : /Linux/i.test(userAgent)
            ? "Linux"
            : "";
  return { label: os ? `${browser} on ${os}` : browser, mobile };
}

function when(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(iso),
  );
}

export function SessionsList({ sessions }: { sessions: SessionSummary[] }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState<SessionSummary | null>(null);

  const revoke = useMutation({
    mutationFn: (id: string) =>
      unwrap(browserApi.DELETE("/v1/auth/sessions/{id}", { params: { path: { id } } })),
    onSuccess: (_data, id) => {
      setConfirming(null);
      if (sessions.find((s) => s.id === id)?.current) {
        router.replace("/login");
      } else {
        toast.success("Signed out of that device.");
      }
      router.refresh();
    },
    onError: (error) => toast.error(error.message),
  });

  if (sessions.length === 0) {
    return (
      <EmptyState
        title="No active sessions"
        description="Sign in again to see your devices here."
      />
    );
  }

  return (
    <>
      <ul className="divide-y divide-border">
        {sessions.map((session) => {
          const device = describeDevice(session.userAgent);
          const Icon = device.mobile ? Smartphone : Monitor;
          return (
            <li
              key={session.id}
              className="flex flex-col gap-3 px-2 py-4 sm:flex-row sm:items-center"
            >
              <Icon className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 font-medium">
                  {device.label}
                  {session.current ? <StatusPill tone="success">This device</StatusPill> : null}
                </p>
                <p className="text-sm text-muted-foreground">
                  Signed in {when(session.createdAt)} · last active {when(session.lastSeenAt)}
                </p>
              </div>
              <Button variant="outline" onClick={() => setConfirming(session)}>
                {session.current ? "Sign out" : "Sign out device"}
              </Button>
            </li>
          );
        })}
      </ul>
      <ConfirmDialog
        open={confirming !== null}
        onOpenChange={(open) => !open && setConfirming(null)}
        title={confirming?.current ? "Sign out of this device?" : "Sign out of that device?"}
        description={
          confirming?.current
            ? "You'll need to sign in again here."
            : "That device will need to sign in again. Use this if you lost a phone or used a shared computer."
        }
        confirmLabel="Sign out"
        destructive
        pending={revoke.isPending}
        onConfirm={() => confirming && revoke.mutate(confirming.id)}
      />
    </>
  );
}
