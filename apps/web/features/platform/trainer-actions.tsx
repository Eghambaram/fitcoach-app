"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  type PlatformPlanUpdateInput,
  type PlatformReason,
  type PlatformTrainerDetail,
  platformPlanUpdateSchema,
  platformReasonSchema,
} from "@fitcoach/shared";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { useOnline } from "@/components/shared/offline-banner";
import { ConfirmDialog, Modal } from "@/components/shared/overlays";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { browserApi, unwrap } from "@/lib/api/browser";
import { ApiRequestError, applyFieldErrors } from "@/lib/api/errors";

/** "Approve" for a pending signup (§16.0), used on the overview and the trainer page. */
export function ApproveButton({ workspaceId, name }: { workspaceId: string; name: string }) {
  const router = useRouter();
  const online = useOnline();
  const approve = useMutation({
    mutationFn: () =>
      unwrap(
        browserApi.POST("/v1/platform/trainers/{id}/approve", {
          params: { path: { id: workspaceId } },
        }),
      ),
    onSuccess: () => {
      toast.success(`${name} is approved. We've emailed them.`);
      router.refresh();
    },
    onError: (error) => toast.error(error.message),
  });
  return (
    <Button
      variant="dark"
      loading={approve.isPending}
      disabled={!online}
      onClick={() => approve.mutate()}
      aria-label={`Approve ${name}`}
    >
      Approve
    </Button>
  );
}

function useAction() {
  const router = useRouter();
  return (message: string) => ({
    onSuccess: () => {
      toast.success(message);
      router.refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

/** Everything a platform owner can do to a trainer account (§16.0). Each action is audited. */
export function TrainerActions({ trainer }: { trainer: PlatformTrainerDetail }) {
  const online = useOnline();
  const done = useAction();
  const id = trainer.workspaceId;
  const [confirm, setConfirm] = useState<"reset" | "revoke" | null>(null);
  const [reasonFor, setReasonFor] = useState<"suspend" | "reactivate" | null>(null);
  const [planOpen, setPlanOpen] = useState(false);

  const reset = useMutation({
    mutationFn: () =>
      unwrap(
        browserApi.POST("/v1/platform/trainers/{id}/password-reset", {
          params: { path: { id } },
        }),
      ),
    ...done("Password reset email sent."),
    onSettled: () => setConfirm(null),
  });
  const revoke = useMutation({
    mutationFn: () =>
      unwrap(
        browserApi.POST("/v1/platform/trainers/{id}/revoke-sessions", {
          params: { path: { id } },
        }),
      ),
    ...done("Signed out everywhere."),
    onSettled: () => setConfirm(null),
  });

  return (
    <div className="flex flex-wrap gap-2">
      {trainer.status === "pending_approval" ? (
        <ApproveButton workspaceId={id} name={trainer.businessName} />
      ) : null}
      <Button variant="outline" disabled={!online} onClick={() => setPlanOpen(true)}>
        Plan &amp; limits
      </Button>
      {trainer.status === "suspended" ? (
        <Button variant="dark" disabled={!online} onClick={() => setReasonFor("reactivate")}>
          Reactivate
        </Button>
      ) : trainer.status !== "pending_approval" && trainer.status !== "cancelled" ? (
        <Button variant="danger" disabled={!online} onClick={() => setReasonFor("suspend")}>
          Suspend
        </Button>
      ) : null}
      <Button
        variant="outline"
        disabled={!online || !trainer.ownerEmail}
        onClick={() => setConfirm("reset")}
      >
        Send password reset
      </Button>
      <Button
        variant="outline"
        disabled={!online || trainer.activeSessions === 0}
        onClick={() => setConfirm("revoke")}
      >
        Sign out everywhere
      </Button>

      <ConfirmDialog
        open={confirm === "reset"}
        onOpenChange={(open) => !open && setConfirm(null)}
        title="Send a password reset email?"
        description={`${trainer.ownerName} gets the same one-hour reset link as "Forgot password". You never see the link.`}
        confirmLabel="Send email"
        pending={reset.isPending}
        onConfirm={() => reset.mutate()}
      />
      <ConfirmDialog
        open={confirm === "revoke"}
        onOpenChange={(open) => !open && setConfirm(null)}
        title="Sign this trainer out everywhere?"
        description={`Ends ${trainer.activeSessions} active session(s). They can sign in again with their password.`}
        confirmLabel="Sign out"
        destructive
        pending={revoke.isPending}
        onConfirm={() => revoke.mutate()}
      />
      {reasonFor ? (
        <ReasonModal
          key={reasonFor}
          workspaceId={id}
          action={reasonFor}
          name={trainer.businessName}
          onClose={() => setReasonFor(null)}
        />
      ) : null}
      {planOpen ? <PlanModal trainer={trainer} onClose={() => setPlanOpen(false)} /> : null}
    </div>
  );
}

function ReasonModal({
  workspaceId,
  action,
  name,
  onClose,
}: {
  workspaceId: string;
  action: "suspend" | "reactivate";
  name: string;
  onClose: () => void;
}) {
  const online = useOnline();
  const router = useRouter();
  const form = useForm<PlatformReason>({
    resolver: zodResolver(platformReasonSchema),
    defaultValues: { reason: "" },
  });
  const save = useMutation({
    mutationFn: (body: PlatformReason) =>
      unwrap(
        action === "suspend"
          ? browserApi.POST("/v1/platform/trainers/{id}/suspend", {
              params: { path: { id: workspaceId } },
              body,
            })
          : browserApi.POST("/v1/platform/trainers/{id}/reactivate", {
              params: { path: { id: workspaceId } },
              body,
            }),
      ),
    onSuccess: () => {
      toast.success(action === "suspend" ? `${name} is suspended.` : `${name} is active again.`);
      onClose();
      router.refresh();
    },
    onError: (error) => {
      if (error instanceof ApiRequestError && error.body.fieldErrors) {
        applyFieldErrors(error, form.setError, ["reason"]);
      } else toast.error(error.message);
    },
  });
  return (
    <Modal
      open
      onOpenChange={(open) => !open && onClose()}
      title={action === "suspend" ? `Suspend ${name}?` : `Reactivate ${name}?`}
      description={
        action === "suspend"
          ? "The workspace becomes read-only and the trainer is signed out. Their clients' app becomes read-only too. Nothing is deleted, and they can still export their data. They see your reason."
          : "The workspace works normally again. The trainer is told in the app."
      }
    >
      <form
        noValidate
        onSubmit={form.handleSubmit((values) => save.mutate(values))}
        className="flex flex-col gap-4"
      >
        <Field label="Reason" error={form.formState.errors.reason?.message} required>
          <Textarea rows={3} maxLength={500} {...form.register("reason")} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant={action === "suspend" ? "danger" : "dark"}
            loading={save.isPending}
            disabled={!online}
          >
            {action === "suspend" ? "Suspend" : "Reactivate"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function PlanModal({ trainer, onClose }: { trainer: PlatformTrainerDetail; onClose: () => void }) {
  const online = useOnline();
  const router = useRouter();
  const form = useForm<PlatformPlanUpdateInput>({
    resolver: zodResolver(platformPlanUpdateSchema),
    defaultValues: {
      planId: trainer.plan?.planId ?? trainer.plans[0]?.id ?? "",
      maxActiveClients: trainer.plan?.maxActiveClients ?? 50,
      trialEndsOn: trainer.plan?.trialEndsAt
        ? new Intl.DateTimeFormat("en-CA", { timeZone: trainer.timezone }).format(
            new Date(new Date(trainer.plan.trialEndsAt).getTime() - 1),
          )
        : null,
    },
  });
  const save = useMutation({
    mutationFn: (body: PlatformPlanUpdateInput) =>
      unwrap(
        browserApi.PATCH("/v1/platform/trainers/{id}/plan", {
          params: { path: { id: trainer.workspaceId } },
          body: platformPlanUpdateSchema.parse(body),
        }),
      ),
    onSuccess: () => {
      toast.success("Plan updated.");
      onClose();
      router.refresh();
    },
    onError: (error) => {
      if (error instanceof ApiRequestError && error.body.fieldErrors) {
        applyFieldErrors(error, form.setError, ["planId", "maxActiveClients", "trialEndsOn"]);
      } else toast.error(error.message);
    },
  });
  const errors = form.formState.errors;
  return (
    <Modal
      open
      onOpenChange={(open) => !open && onClose()}
      title="Plan & limits"
      description="Billing isn't set up in the beta: this only sets the plan name, the client limit and an optional trial end."
    >
      <form
        noValidate
        onSubmit={form.handleSubmit((values) => save.mutate(values))}
        className="flex flex-col gap-4"
      >
        <Field label="Plan" error={errors.planId?.message} required>
          <Select {...form.register("planId")}>
            {trainer.plans.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Active client limit" error={errors.maxActiveClients?.message} required>
          <Input type="number" inputMode="numeric" min={1} {...form.register("maxActiveClients")} />
        </Field>
        <Field
          label="Trial ends on"
          error={errors.trialEndsOn?.message}
          hint={`Optional. End of that day in ${trainer.timezone}.`}
        >
          <Input
            type="date"
            {...form.register("trialEndsOn", { setValueAs: (value: string) => value || null })}
          />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="dark" loading={save.isPending} disabled={!online}>
            Save
          </Button>
        </div>
      </form>
    </Modal>
  );
}
