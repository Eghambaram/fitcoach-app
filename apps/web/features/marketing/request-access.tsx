"use client";

import { Mail } from "lucide-react";
import { type FormEvent, useState } from "react";
import { NotConfiguredNotice } from "@/components/shared/status";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";

/** Build-time contact address for beta requests (ADR-0061). Unset → honest "not configured". */
const CONTACT_EMAIL = process.env.NEXT_PUBLIC_BETA_CONTACT_EMAIL;

/**
 * "Request beta access" (PROMPT §6, board 01 adjusted). Nothing is stored: the form opens the
 * visitor's email app with a pre-filled message to the FitCoach team, and says so.
 */
export function RequestAccessForm({ contactEmail = CONTACT_EMAIL }: { contactEmail?: string }) {
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [about, setAbout] = useState("");

  if (!contactEmail) {
    return (
      <NotConfiguredNotice
        name="Beta requests"
        description="Ask the FitCoach team you heard about us from for an invite code."
      />
    );
  }

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const subject = "FitCoach beta access request";
    const body = [
      `Name: ${name}`,
      `City: ${city}`,
      "",
      about || "I'd like to try FitCoach with my clients.",
    ].join("\n");
    window.location.href = `mailto:${contactEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" aria-label="Request beta access">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Your name" required>
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            autoComplete="name"
          />
        </Field>
        <Field label="City">
          <Input
            value={city}
            onChange={(event) => setCity(event.target.value)}
            autoComplete="address-level2"
          />
        </Field>
      </div>
      <Field label="How do you coach today?" hint="In person, online, or both. Optional.">
        <Textarea rows={3} value={about} onChange={(event) => setAbout(event.target.value)} />
      </Field>
      <p className="text-sm text-muted-foreground">
        This opens your email app with a message to {contactEmail}. We reply with an invite code
        while beta places last.
      </p>
      <div>
        <Button type="submit">
          <Mail className="size-4" aria-hidden="true" />
          Request beta access
        </Button>
      </div>
    </form>
  );
}
