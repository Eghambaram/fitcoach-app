"use client";

import {
  type CreateInviteResponse,
  type InviteChannel,
  PORTAL_STATUS_LABELS,
  type PortalAccess,
  type PortalStatus,
} from "@fitcoach/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Mail, MessageCircle, Smartphone } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useOnline } from "@/components/shared/offline-banner";
import { ConfirmDialog, Modal } from "@/components/shared/overlays";
import { type PillTone, StatusPill } from "@/components/shared/status";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/input";
import { browserApi, unwrap } from "@/lib/api/browser";
import { cn } from "@/lib/utils";
import { formatDateTime } from "../leads/lead-display";

const STATUS_TONES: Record<PortalStatus, PillTone> = {
  not_invited: "neutral",
  invited: "info",
  expired: "warning",
  active: "success",
  revoked: "danger",
};

export const portalAccessKey = (clientId: string) => ["portal-access", clientId];

/** Creates a new invite link (older open links stop working) and shows how to share it. */
function useInvite(clientId: string, onCreated: (result: CreateInviteResponse) => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (channel: InviteChannel) =>
      unwrap(
        browserApi.POST("/v1/clients/{id}/portal/invite", {
          params: { path: { id: clientId } },
          body: { channel },
        }),
      ),
    onSuccess: (result, channel) => {
      queryClient.setQueryData(portalAccessKey(clientId), result.access);
      if (channel === "email") {
        if (result.emailed) toast.success("Invite emailed.");
        else toast.error("We couldn't send the email. Copy the link and share it instead.");
      }
      onCreated(result);
    },
    onError: (failure) => toast.error(failure.message),
  });
}

/**
 * The invite link, once: open WhatsApp with the prefilled message (nothing is sent by FitCoach,
 * CLAUDE.md rule 20d) or copy the link.
 */
function InviteLinkDialog({
  invite,
  name,
  onClose,
}: {
  invite: CreateInviteResponse | null;
  name: string;
  onClose: () => void;
}) {
  return (
    <Modal
      open={invite !== null}
      onOpenChange={(open) => (open ? null : onClose())}
      title={`Invite link for ${name}`}
      description={
        invite
          ? `It works once and expires ${formatDateTime(invite.expiresAt)}. Any older link no longer works.`
          : undefined
      }
    >
      {invite ? (
        <div className="flex flex-col gap-4">
          {invite.whatsApp ? (
            <>
              <p className="rounded-control bg-muted p-3 text-sm whitespace-pre-line">
                {invite.whatsApp.text}
              </p>
              <Button asChild size="lg">
                <a href={invite.whatsApp.url} target="_blank" rel="noreferrer" onClick={onClose}>
                  <MessageCircle aria-hidden="true" />
                  Open WhatsApp
                </a>
              </Button>
              <p className="text-xs text-muted-foreground">
                WhatsApp opens with this message. Press Send there to share it.
              </p>
            </>
          ) : null}
          <Button
            variant="outline"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(invite.link);
                toast.success("Link copied.");
              } catch {
                toast.error("Couldn't copy. Select the link and copy it instead.");
              }
            }}
          >
            <Copy aria-hidden="true" />
            Copy link
          </Button>
          <p className="text-xs break-all text-muted-foreground">{invite.link}</p>
        </div>
      ) : null}
    </Modal>
  );
}

/** "Invite via WhatsApp" — on the onboarding success screen and the client profile. */
export function InviteViaWhatsAppButton({
  clientId,
  name,
  className,
  variant = "outline",
}: {
  clientId: string;
  name: string;
  className?: string;
  variant?: "outline" | "primary";
}) {
  const online = useOnline();
  const [created, setCreated] = useState<CreateInviteResponse | null>(null);
  const invite = useInvite(clientId, setCreated);
  return (
    <>
      <Button
        variant={variant}
        className={className}
        loading={invite.isPending}
        disabled={!online}
        onClick={() => invite.mutate("whatsapp")}
      >
        <MessageCircle aria-hidden="true" />
        Invite {name.split(" ")[0]} via WhatsApp
      </Button>
      <InviteLinkDialog invite={created} name={name} onClose={() => setCreated(null)} />
    </>
  );
}

function statusLine(access: PortalAccess): string {
  switch (access.status) {
    case "not_invited":
      return "They haven't been invited to the client app yet.";
    case "invited":
      return access.invite
        ? `Link sent by ${access.invite.channel === "email" ? "email" : "WhatsApp"}; it expires ${formatDateTime(access.invite.expiresAt)}.`
        : "Invited.";
    case "expired":
      return "Their last link expired before it was used. Send a new one.";
    case "active":
      return access.joinedAt
        ? `Joined ${formatDateTime(access.joinedAt)}. They can sign in with an email code, or you can send a new link.`
        : "They can use the client app.";
    case "revoked":
      return "Access is off. Sending a new link turns it back on.";
  }
}

/** Client profile → Overview: client app access (PROMPT §8.3 "Status shown"). */
export function PortalAccessCard({
  clientId,
  name,
  archived,
}: {
  clientId: string;
  name: string;
  archived: boolean;
}) {
  const online = useOnline();
  const queryClient = useQueryClient();
  const [created, setCreated] = useState<CreateInviteResponse | null>(null);
  const [revoking, setRevoking] = useState(false);
  const query = useQuery({
    queryKey: portalAccessKey(clientId),
    queryFn: () =>
      unwrap(browserApi.GET("/v1/clients/{id}/portal", { params: { path: { id: clientId } } })),
  });
  const invite = useInvite(clientId, setCreated);
  const features = useMutation({
    mutationFn: (workoutSelfLogging: boolean) =>
      unwrap(
        browserApi.PUT("/v1/clients/{id}/portal/features", {
          params: { path: { id: clientId } },
          body: { workoutSelfLogging },
        }),
      ),
    onSuccess: (access) => {
      queryClient.setQueryData(portalAccessKey(clientId), access);
      toast.success(
        access.features.workoutSelfLogging
          ? "They can now log their own workouts."
          : "Workout logging is back with you.",
      );
    },
    onError: (failure) => toast.error(failure.message),
  });
  const revoke = useMutation({
    mutationFn: () =>
      unwrap(
        browserApi.POST("/v1/clients/{id}/portal/revoke", { params: { path: { id: clientId } } }),
      ),
    onSuccess: (access) => {
      queryClient.setQueryData(portalAccessKey(clientId), access);
      setRevoking(false);
      toast.success("Client app access turned off. They've been signed out.");
    },
    onError: (failure) => toast.error(failure.message),
  });

  return (
    <Card role="region" aria-labelledby="client-app-heading" className="flex flex-col gap-3 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="client-app-heading" className="flex items-center gap-2 font-semibold">
          <Smartphone className="size-5" aria-hidden="true" />
          Client app
        </h2>
        {query.data ? (
          <StatusPill tone={STATUS_TONES[query.data.status]}>
            {PORTAL_STATUS_LABELS[query.data.status]}
          </StatusPill>
        ) : null}
      </div>
      {query.isPending ? (
        <p role="status" className="text-sm text-muted-foreground">
          Loading…
        </p>
      ) : query.isError || !query.data ? (
        <p role="alert" className="text-sm text-danger">
          We couldn&apos;t load their app access. Please try again.
        </p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">{statusLine(query.data)}</p>
          {archived ? null : (
            <label className="flex min-h-11 items-start gap-3 text-sm">
              <Checkbox
                checked={query.data.features.workoutSelfLogging}
                disabled={!online || features.isPending}
                onChange={(event) => features.mutate(event.target.checked)}
              />
              <span>
                <span className="font-medium">Let {name.split(" ")[0]} log their own workouts</span>
                <span className="block text-muted-foreground">
                  Off: they can see their workouts, and you log them together.
                </span>
              </span>
            </label>
          )}
          {archived ? (
            <p className="text-sm text-muted-foreground">Restore this client to invite them.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {query.data.canWhatsApp ? (
                <Button
                  variant={query.data.status === "not_invited" ? "primary" : "outline"}
                  loading={invite.isPending && invite.variables === "whatsapp"}
                  disabled={!online || invite.isPending}
                  onClick={() => invite.mutate("whatsapp")}
                >
                  <MessageCircle aria-hidden="true" />
                  {query.data.status === "not_invited"
                    ? "Invite via WhatsApp"
                    : "New WhatsApp link"}
                </Button>
              ) : null}
              {query.data.canEmail ? (
                <Button
                  variant="outline"
                  loading={invite.isPending && invite.variables === "email"}
                  disabled={!online || invite.isPending}
                  onClick={() => invite.mutate("email")}
                >
                  <Mail aria-hidden="true" />
                  Send link by email
                </Button>
              ) : null}
              {query.data.status === "active" || query.data.status === "invited" ? (
                <Button
                  variant="ghost"
                  className={cn("text-danger")}
                  disabled={!online}
                  onClick={() => setRevoking(true)}
                >
                  Turn off access
                </Button>
              ) : null}
            </div>
          )}
          {!archived && !query.data.canWhatsApp && !query.data.canEmail ? (
            <p className="text-sm text-muted-foreground">
              Add a phone number or email address to invite them.
            </p>
          ) : null}
        </>
      )}
      <InviteLinkDialog invite={created} name={name} onClose={() => setCreated(null)} />
      <ConfirmDialog
        open={revoking}
        onOpenChange={setRevoking}
        title="Turn off client app access?"
        description={`${name} is signed out everywhere and any open link stops working. Their history stays. You can invite them again later.`}
        confirmLabel="Turn off access"
        destructive
        pending={revoke.isPending}
        onConfirm={() => revoke.mutate()}
      />
    </Card>
  );
}
