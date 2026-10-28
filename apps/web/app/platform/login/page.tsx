import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthLayout } from "@/features/auth/auth-layout";
import { PlatformLogin, type PlatformLoginStep } from "@/features/platform/platform-login";
import { getSession, serverApi } from "@/lib/api/server";

export const metadata: Metadata = { title: "Platform sign in" };

/**
 * Platform owner sign-in (PROMPT §16.0), separate from the trainer login. A platform session that
 * hasn't passed MFA yet resumes at the authenticator step; a finished one goes straight in.
 */
export default async function PlatformLoginPage() {
  let step: PlatformLoginStep = "password";
  const session = await getSession();
  if (session.status === "signed_in" && session.me.actor === "platform_owner") {
    const api = await serverApi();
    const { data } = await api.GET("/v1/platform/auth/status");
    if (data?.aal === 2) redirect("/platform");
    if (data) step = data.mfaEnabled ? "verify" : "setup";
  }

  return (
    <AuthLayout
      title={step === "password" ? "FitCoach platform" : "Two-step verification"}
      description={
        step === "password"
          ? "For the FitCoach team. Trainers sign in at the main login page."
          : "Platform accounts always need a code from an authenticator app."
      }
    >
      <PlatformLogin initialStep={step} />
    </AuthLayout>
  );
}
