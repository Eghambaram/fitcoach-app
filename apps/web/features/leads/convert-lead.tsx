"use client";

import {
  CLIENT_STATUS_LABELS,
  type ConvertLeadRequest,
  convertLeadRequestSchema,
  type DuplicateCheckResponse,
  ERROR_CODES,
  type LeadDetailResponse,
} from "@fitcoach/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, CircleDashed } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useOnline } from "@/components/shared/offline-banner";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { browserApi, unwrap } from "@/lib/api/browser";
import { ApiRequestError } from "@/lib/api/errors";
import { cn } from "@/lib/utils";
import { Avatar } from "../shell/app-shell";

type ClientMatch = Extract<DuplicateCheckResponse["matches"][number], { kind: "client" }>;

function Step({ done, title, detail }: { done: boolean; title: string; detail: ReactNode }) {
  const Icon = done ? CheckCircle2 : CircleDashed;
  return (
    <li className="flex gap-3">
      <Icon
        className={cn("mt-0.5 size-5 shrink-0", done ? "text-success" : "text-muted-foreground")}
        aria-hidden="true"
      />
      <div>
        <p className={cn("text-sm font-medium", !done && "text-muted-foreground")}>{title}</p>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </div>
    </li>
  );
}

/**
 * "Convert to Client" confirm sheet (PROMPT §8.2, Leads board). One Idempotency-Key per opening of
 * the sheet, so a double tap or a retry after a dropped connection still creates one client.
 */
export function ConvertLeadForm({
  lead,
  onConverted,
}: {
  lead: LeadDetailResponse;
  onConverted: (next: string) => void;
}) {
  const online = useOnline();
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [startOn, setStartOn] = useState("");
  const [linkTo, setLinkTo] = useState<string>("");
  const [problem, setProblem] = useState<string | null>(null);

  // Existing clients with the same phone or email: the trainer may link instead of creating one.
  const matches = useQuery({
    queryKey: ["lead-client-matches", lead.id],
    queryFn: async () => {
      const result = await unwrap(
        browserApi.POST("/v1/leads/duplicates", {
          body: {
            phone: lead.phoneE164 ?? undefined,
            email: lead.email ?? undefined,
            excludeLeadId: lead.id,
          },
        }),
      );
      return result.matches.filter((match): match is ClientMatch => match.kind === "client");
    },
  });
  const clientMatches = matches.data ?? [];

  const convert = useMutation({
    mutationFn: (body: ConvertLeadRequest) =>
      unwrap(
        browserApi.POST("/v1/leads/{id}/convert", {
          params: { path: { id: lead.id }, header: { "Idempotency-Key": idempotencyKey } },
          body,
        }),
      ),
    onSuccess: (result) => onConverted(result.next),
    onError: (failure) => {
      if (
        failure instanceof ApiRequestError &&
        failure.code === ERROR_CODES.CONFLICT_DUPLICATE &&
        failure.body.fieldErrors?.linkClientId?.[0]
      ) {
        setLinkTo(failure.body.fieldErrors.linkClientId[0]);
        void matches.refetch();
      }
      setProblem(failure.message);
    },
  });

  function submit() {
    setProblem(null);
    const parsed = convertLeadRequestSchema.safeParse({
      linkClientId: linkTo || undefined,
      coachingStartOn: !linkTo && startOn ? startOn : undefined,
    });
    if (!parsed.success) {
      setProblem(parsed.error.issues[0]?.message ?? "Check the details.");
      return;
    }
    convert.mutate(parsed.data);
  }

  const linking = linkTo !== "";
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <Avatar name={lead.fullName} className="size-12" />
        <div>
          <p className="font-semibold">{lead.fullName}</p>
          <p className="text-xs text-muted-foreground">From lead to client</p>
        </div>
      </div>

      <ul className="flex flex-col gap-3" aria-label="What happens">
        <Step
          done
          title="Import lead information"
          detail="Contact details, goal, training mode and where they found you"
        />
        <Step
          done
          title="Preserve history"
          detail="All notes, contacts and activity stay on the lead"
        />
        <Step
          done={false}
          title="Set initial package"
          detail="Available after packages are set up"
        />
        <Step
          done={!linking}
          title="Start client onboarding"
          detail={
            linking
              ? "Not needed: they're already a client"
              : "Complete their profile, baseline and consent next"
          }
        />
      </ul>

      {clientMatches.length > 0 ? (
        <fieldset className="flex flex-col gap-2 rounded-control bg-warning-soft p-3 text-sm">
          <legend className="sr-only">Already a client?</legend>
          <p className="font-semibold text-warning">Possible match: already a client</p>
          <label className="flex min-h-11 items-center gap-2">
            <input
              type="radio"
              name="convert-target"
              className="size-4 accent-charcoal"
              checked={!linking}
              onChange={() => setLinkTo("")}
            />
            Create a new client
          </label>
          {clientMatches.map((match) => (
            <label key={match.id} className="flex min-h-11 items-center gap-2">
              <input
                type="radio"
                name="convert-target"
                className="size-4 accent-charcoal"
                checked={linkTo === match.id}
                onChange={() => setLinkTo(match.id)}
              />
              Link to {match.fullName} ({CLIENT_STATUS_LABELS[match.status]}, same{" "}
              {match.matchedOn.join(" and ")})
            </label>
          ))}
        </fieldset>
      ) : null}

      <Field label="Initial package" hint="Available after packages are set up.">
        <Select disabled defaultValue="">
          <option value="">No package yet</option>
        </Select>
      </Field>
      {linking ? null : (
        <Field label="Start date (optional)">
          <Input type="date" value={startOn} onChange={(event) => setStartOn(event.target.value)} />
        </Field>
      )}

      {problem ? (
        <p role="alert" className="text-sm font-medium text-danger">
          {problem}
        </p>
      ) : null}
      <Button loading={convert.isPending} disabled={!online || convert.isSuccess} onClick={submit}>
        {linking ? "Link to client" : "Convert & Continue"}
      </Button>
    </div>
  );
}
