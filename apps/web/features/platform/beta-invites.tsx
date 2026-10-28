"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  type BetaInvite,
  type CreateBetaInviteInput,
  createBetaInviteRequestSchema,
} from "@fitcoach/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Copy, Ticket } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { DataList } from "@/components/shared/data-list";
import { useOnline } from "@/components/shared/offline-banner";
import { ConfirmDialog } from "@/components/shared/overlays";
import { EmptyState, type PillTone, StatusPill } from "@/components/shared/status";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { browserApi, unwrap } from "@/lib/api/browser";
import { ApiRequestError, applyFieldErrors } from "@/lib/api/errors";
import { formatDate } from "./format";

const STATUS: Record<BetaInvite["status"], { label: string; tone: PillTone }> = {
  active: { label: "Active", tone: "success" },
  used_up: { label: "Used up", tone: "neutral" },
  expired: { label: "Expired", tone: "neutral" },
  revoked: { label: "Revoked", tone: "danger" },
};

/** Beta invite codes (ADR-0029): the code is shown once; only uses and status after that. */
export function BetaInvites({ initial }: { initial: BetaInvite[] }) {
  const online = useOnline();
  const [invites, setInvites] = useState(initial);
  const [code, setCode] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<BetaInvite | null>(null);
  const queryClient = useQueryClient();
  const form = useForm<CreateBetaInviteInput>({
    resolver: zodResolver(createBetaInviteRequestSchema),
    defaultValues: { label: "", maxUses: 1, expiresInDays: 14 },
  });

  const create = useMutation({
    mutationFn: (body: CreateBetaInviteInput) =>
      unwrap(
        browserApi.POST("/v1/platform/beta-invites", {
          body: createBetaInviteRequestSchema.parse(body),
        }),
      ),
    onSuccess: (result) => {
      setCode(result.code);
      setInvites((current) => [result.invite, ...current]);
      form.reset({ label: "", maxUses: 1, expiresInDays: 14 });
      void queryClient.invalidateQueries({ queryKey: ["platform-audit"] });
    },
    onError: (error) => {
      if (error instanceof ApiRequestError && error.body.fieldErrors) {
        applyFieldErrors(error, form.setError, ["label", "maxUses", "expiresInDays"]);
      } else toast.error(error.message);
    },
  });
  const revoke = useMutation({
    mutationFn: (id: string) =>
      unwrap(browserApi.DELETE("/v1/platform/beta-invites/{id}", { params: { path: { id } } })),
    onSuccess: (result) => {
      setInvites(result.items);
      setRevoking(null);
      toast.success("Code revoked. It can't be used any more.");
    },
    onError: (error) => toast.error(error.message),
  });
  const errors = form.formState.errors;

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-5">
        <h2 className="font-semibold">New invite code</h2>
        <form
          noValidate
          onSubmit={form.handleSubmit((values) => create.mutate(values))}
          className="mt-4 grid gap-4 sm:grid-cols-[1fr_8rem_8rem_auto] sm:items-end"
        >
          <Field label="Label" error={errors.label?.message} hint="Who it's for (optional).">
            <Input maxLength={80} {...form.register("label")} />
          </Field>
          <Field label="Uses" error={errors.maxUses?.message} required>
            <Input type="number" inputMode="numeric" min={1} {...form.register("maxUses")} />
          </Field>
          <Field label="Valid for (days)" error={errors.expiresInDays?.message} required>
            <Input type="number" inputMode="numeric" min={1} {...form.register("expiresInDays")} />
          </Field>
          <Button type="submit" variant="dark" loading={create.isPending} disabled={!online}>
            Create code
          </Button>
        </form>
        {code ? (
          <div
            role="status"
            className="mt-4 flex flex-wrap items-center gap-3 rounded-control bg-lime/30 p-4"
          >
            <p className="text-sm">
              New code — copy it now, it won&apos;t be shown again:{" "}
              <span className="font-mono text-lg font-bold select-all">{code}</span>
            </p>
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(code);
                  toast.success("Code copied.");
                } catch {
                  toast.error("Couldn't copy. Select the code and copy it by hand.");
                }
              }}
            >
              <Copy className="size-4" aria-hidden="true" />
              Copy
            </Button>
          </div>
        ) : null}
      </Card>

      {invites.length === 0 ? (
        <Card>
          <EmptyState
            icon={Ticket}
            title="No invite codes yet"
            description="Create one above to invite a trainer."
          />
        </Card>
      ) : (
        <DataList<BetaInvite>
          rows={invites}
          rowKey={(row) => row.id}
          caption="Invite codes"
          cardTitle={(row) => row.label ?? "Unlabelled code"}
          columns={[
            { key: "label", header: "Label", desktopOnly: true, cell: (row) => row.label ?? "—" },
            {
              key: "status",
              header: "Status",
              cell: (row) => (
                <StatusPill tone={STATUS[row.status].tone}>{STATUS[row.status].label}</StatusPill>
              ),
            },
            { key: "uses", header: "Used", cell: (row) => `${row.uses} of ${row.maxUses}` },
            { key: "expires", header: "Expires", cell: (row) => formatDate(row.expiresAt) },
            { key: "created", header: "Created", cell: (row) => formatDate(row.createdAt) },
            {
              key: "actions",
              header: "Actions",
              cell: (row) =>
                row.status === "active" ? (
                  <Button variant="outline" disabled={!online} onClick={() => setRevoking(row)}>
                    Revoke
                  </Button>
                ) : (
                  "—"
                ),
            },
          ]}
        />
      )}
      <ConfirmDialog
        open={revoking !== null}
        onOpenChange={(open) => !open && setRevoking(null)}
        title="Revoke this invite code?"
        description="Nobody can sign up with it any more. Trainers who already used it keep their accounts."
        confirmLabel="Revoke"
        destructive
        pending={revoke.isPending}
        onConfirm={() => revoking && revoke.mutate(revoking.id)}
      />
    </div>
  );
}
