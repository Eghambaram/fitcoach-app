"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  type PlatformLoginRequest,
  platformLoginRequestSchema,
  type PlatformMfaSetupResponse,
} from "@fitcoach/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Copy, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { useOnline } from "@/components/shared/offline-banner";
import { ErrorState } from "@/components/shared/status";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { browserApi, unwrap } from "@/lib/api/browser";
import { ApiRequestError } from "@/lib/api/errors";
import { FormAlert } from "../auth/auth-layout";
import { PasswordInput } from "../auth/password-input";

export type PlatformLoginStep = "password" | "setup" | "verify";

/**
 * `/platform/login` (PROMPT §16.0): password → authenticator. The first sign-in sets up the
 * authenticator and shows the recovery codes once; later sign-ins ask for a code.
 */
export function PlatformLogin({ initialStep }: { initialStep: PlatformLoginStep }) {
  const [step, setStep] = useState<PlatformLoginStep>(initialStep);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const router = useRouter();
  const done = () => {
    router.replace("/platform");
    router.refresh();
  };

  if (recoveryCodes) return <RecoveryCodes codes={recoveryCodes} onDone={done} />;
  if (step === "password") {
    return <PasswordStep onNext={(next) => setStep(next === "mfa_setup" ? "setup" : "verify")} />;
  }
  if (step === "setup") return <SetupStep onEnabled={setRecoveryCodes} />;
  return <VerifyStep onVerified={done} />;
}

function PasswordStep({ onNext }: { onNext: (next: "mfa_setup" | "mfa_verify") => void }) {
  const online = useOnline();
  const form = useForm<PlatformLoginRequest>({
    resolver: zodResolver(platformLoginRequestSchema),
    defaultValues: { email: "", password: "" },
  });
  const login = useMutation({
    mutationFn: (body: PlatformLoginRequest) =>
      unwrap(browserApi.POST("/v1/platform/auth/login", { body })),
    onSuccess: (result) => onNext(result.next),
  });
  const error = login.error instanceof ApiRequestError ? login.error : null;
  return (
    <form
      noValidate
      onSubmit={form.handleSubmit((values) => login.mutate(values))}
      className="flex flex-col gap-5"
    >
      {error ? <FormAlert tone="danger">{error.message}</FormAlert> : null}
      <Field label="Email" error={form.formState.errors.email?.message} required>
        <Input type="email" autoComplete="email" inputMode="email" {...form.register("email")} />
      </Field>
      <Field label="Password" error={form.formState.errors.password?.message} required>
        <PasswordInput autoComplete="current-password" {...form.register("password")} />
      </Field>
      <Button type="submit" size="lg" loading={login.isPending} disabled={!online}>
        Continue
      </Button>
    </form>
  );
}

/** A 6-digit code input that submits once complete. */
function CodeForm({
  label,
  submitLabel,
  pending,
  error,
  onSubmit,
  recovery = false,
}: {
  label: string;
  submitLabel: string;
  pending: boolean;
  error?: string;
  onSubmit: (value: string) => void;
  recovery?: boolean;
}) {
  const online = useOnline();
  const [value, setValue] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit(value.trim());
  };
  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      <Field label={label} error={error} required>
        <Input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          autoComplete="one-time-code"
          inputMode={recovery ? "text" : "numeric"}
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={recovery ? 11 : 6}
          className="font-mono text-lg tracking-[0.3em]"
        />
      </Field>
      <Button type="submit" size="lg" loading={pending} disabled={!online || value.trim() === ""}>
        {submitLabel}
      </Button>
    </form>
  );
}

function fieldError(error: unknown, field: string): string | undefined {
  if (!(error instanceof ApiRequestError)) return undefined;
  return error.body.fieldErrors?.[field]?.[0] ?? error.message;
}

function SetupStep({ onEnabled }: { onEnabled: (codes: string[]) => void }) {
  const setup = useQuery({
    queryKey: ["platform-mfa-setup"],
    queryFn: () => unwrap(browserApi.GET("/v1/platform/auth/mfa/setup")),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
  const enable = useMutation({
    mutationFn: (code: string) =>
      unwrap(browserApi.POST("/v1/platform/auth/mfa/enable", { body: { code } })),
    onSuccess: (result) => onEnabled(result.recoveryCodes),
  });

  if (setup.isPending) return <p className="text-sm text-muted-foreground">Preparing…</p>;
  if (setup.isError) {
    return <ErrorState description={setup.error.message} className="py-6" />;
  }
  return (
    <div className="flex flex-col gap-5">
      <FormAlert tone="info">
        Platform accounts need an authenticator app (Google Authenticator, Microsoft Authenticator,
        1Password…). Scan the code to add FitCoach.
      </FormAlert>
      <QrCode setup={setup.data} />
      <CodeForm
        label="6-digit code from the app"
        submitLabel="Turn on and continue"
        pending={enable.isPending}
        error={enable.isError ? fieldError(enable.error, "code") : undefined}
        onSubmit={(code) => enable.mutate(code)}
      />
    </div>
  );
}

function QrCode({ setup }: { setup: PlatformMfaSetupResponse }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div
        role="img"
        aria-label="QR code for your authenticator app"
        className="size-48 rounded-control border border-border bg-white p-2 [&_svg]:size-full"
        // The SVG is generated by the API from our own otpauth URI (qrcode library, no user input).
        dangerouslySetInnerHTML={{ __html: setup.qrSvg }}
      />
      <details className="w-full text-sm">
        <summary className="cursor-pointer font-medium">Can&apos;t scan? Enter the key</summary>
        <p className="mt-2 font-mono break-all select-all">{setup.secret}</p>
      </details>
    </div>
  );
}

function VerifyStep({ onVerified }: { onVerified: () => void }) {
  const [useRecovery, setUseRecovery] = useState(false);
  const verify = useMutation({
    mutationFn: (value: string) =>
      unwrap(
        browserApi.POST("/v1/platform/auth/mfa/verify", {
          body: useRecovery ? { recoveryCode: value } : { code: value },
        }),
      ),
    onSuccess: onVerified,
  });
  return (
    <div className="flex flex-col gap-4">
      <CodeForm
        key={useRecovery ? "recovery" : "code"}
        label={useRecovery ? "Recovery code" : "6-digit code from your authenticator app"}
        submitLabel="Verify"
        recovery={useRecovery}
        pending={verify.isPending}
        error={
          verify.isError
            ? fieldError(verify.error, useRecovery ? "recoveryCode" : "code")
            : undefined
        }
        onSubmit={(value) => verify.mutate(value)}
      />
      <Button
        variant="ghost"
        onClick={() => {
          verify.reset();
          setUseRecovery((current) => !current);
        }}
      >
        {useRecovery ? "Use the authenticator app instead" : "Lost your phone? Use a recovery code"}
      </Button>
    </div>
  );
}

function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const [saved, setSaved] = useState(false);
  return (
    <div className="flex flex-col gap-4">
      <FormAlert tone="info">
        <span className="flex items-center gap-2 font-semibold">
          <ShieldCheck className="size-4" aria-hidden="true" />
          Your authenticator is set up.
        </span>
        Save these recovery codes somewhere safe. Each works once if you lose your phone. They
        won&apos;t be shown again.
      </FormAlert>
      <ol className="grid grid-cols-2 gap-2 rounded-control border border-border bg-muted p-4 font-mono text-sm">
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ol>
      <Button
        variant="outline"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(codes.join("\n"));
            toast.success("Recovery codes copied.");
          } catch {
            toast.error("Couldn't copy. Select the codes and copy them by hand.");
          }
        }}
      >
        <Copy className="size-4" aria-hidden="true" />
        Copy codes
      </Button>
      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          checked={saved}
          onChange={(event) => setSaved(event.target.checked)}
          className="mt-0.5 size-5 accent-charcoal"
        />
        I&apos;ve saved my recovery codes
      </label>
      <Button size="lg" disabled={!saved} onClick={onDone}>
        Go to the platform
      </Button>
    </div>
  );
}
