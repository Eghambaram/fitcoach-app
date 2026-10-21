"use client";

import {
  MESSAGE_TEMPLATE_PLACEHOLDERS,
  type MessageTemplate,
  type MessageTemplatePurpose,
  messageTemplateBodySchema,
} from "@fitcoach/shared";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import { toast } from "sonner";
import { useOnline } from "@/components/shared/offline-banner";
import { ConfirmDialog } from "@/components/shared/overlays";
import { StatusPill } from "@/components/shared/status";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/input";
import { browserApi, unwrap } from "@/lib/api/browser";

export const TEMPLATE_PURPOSE_INFO: Record<
  MessageTemplatePurpose,
  { title: string; description: string }
> = {
  follow_up: { title: "Follow-up", description: "After a new enquiry, to start the conversation." },
  trial_confirmation: {
    title: "Trial confirmation",
    description: "When you book a trial session.",
  },
  client_invite: {
    title: "Client invite",
    description: "Sends the link that opens the client app.",
  },
  payment_reminder: { title: "Payment reminder", description: "When a package payment is due." },
  package_renewal: { title: "Package renewal", description: "When sessions are running low." },
  check_in_nudge: { title: "Check-in nudge", description: "When a client hasn't checked in." },
  session_reminder: { title: "Session reminder", description: "Before an upcoming session." },
};

/** wa.me links get unreliable on some phones when the text is very long (CLAUDE.md gotchas). */
const LONG_MESSAGE = 500;

export function TemplateEditor({ template }: { template: MessageTemplate }) {
  const router = useRouter();
  const online = useOnline();
  const id = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [body, setBody] = useState(template.body);
  const [confirmReset, setConfirmReset] = useState(false);
  const info = TEMPLATE_PURPOSE_INFO[template.purpose];

  const check = messageTemplateBodySchema.safeParse(body);
  const error = check.success ? null : (check.error.issues[0]?.message ?? "Check this message");
  const dirty = body !== template.body;

  const save = useMutation({
    mutationFn: () =>
      unwrap(
        browserApi.PUT("/v1/settings/message-templates/{purpose}", {
          params: { path: { purpose: template.purpose } },
          body: { body },
        }),
      ),
    onSuccess: () => {
      toast.success(`${info.title} message saved.`);
      router.refresh();
    },
    onError: (failure) => toast.error(failure.message),
  });

  const reset = useMutation({
    mutationFn: () =>
      unwrap(
        browserApi.POST("/v1/settings/message-templates/{purpose}/reset", {
          params: { path: { purpose: template.purpose } },
        }),
      ),
    onSuccess: () => {
      setBody(template.defaultBody);
      setConfirmReset(false);
      toast.success(`${info.title} message reset.`);
      router.refresh();
    },
    onError: (failure) => toast.error(failure.message),
  });

  function insert(placeholder: string) {
    const token = `{${placeholder}}`;
    const element = textareaRef.current;
    const start = element?.selectionStart ?? body.length;
    const end = element?.selectionEnd ?? body.length;
    setBody(body.slice(0, start) + token + body.slice(end));
    requestAnimationFrame(() => {
      element?.focus();
      element?.setSelectionRange(start + token.length, start + token.length);
    });
  }

  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold" id={`${id}-title`}>
            {info.title}
          </h2>
          <p className="text-sm text-muted-foreground">{info.description}</p>
        </div>
        {template.isCustomised ? <StatusPill tone="info">Edited</StatusPill> : null}
      </div>
      <Textarea
        ref={textareaRef}
        rows={4}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        maxLength={1000}
        aria-labelledby={`${id}-title`}
        aria-invalid={error ? true : undefined}
        aria-describedby={`${id}-help${error ? ` ${id}-error` : ""}`}
      />
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Insert a placeholder">
        {MESSAGE_TEMPLATE_PLACEHOLDERS.map((placeholder) => (
          <button
            key={placeholder}
            type="button"
            onClick={() => insert(placeholder)}
            className="min-h-9 rounded-full border border-border bg-card px-3 text-xs font-medium hover:bg-muted"
          >
            {`{${placeholder}}`}
          </button>
        ))}
      </div>
      <p id={`${id}-help`} className="text-xs text-muted-foreground">
        {body.length}/1000 characters.{" "}
        {body.length > LONG_MESSAGE
          ? "Long messages may not open in WhatsApp on some phones — keep it short."
          : "Placeholders are filled in when you send the message from WhatsApp."}
      </p>
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap justify-end gap-2">
        {template.isCustomised ? (
          <Button variant="ghost" disabled={!online} onClick={() => setConfirmReset(true)}>
            Reset to default
          </Button>
        ) : null}
        <Button
          variant="dark"
          loading={save.isPending}
          disabled={!online || !dirty || error !== null}
          onClick={() => save.mutate()}
        >
          Save
        </Button>
      </div>
      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title={`Reset the ${info.title.toLowerCase()} message?`}
        description={`It goes back to: “${template.defaultBody}”`}
        confirmLabel="Reset"
        pending={reset.isPending}
        onConfirm={() => reset.mutate()}
      />
    </Card>
  );
}
