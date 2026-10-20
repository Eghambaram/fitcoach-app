import type { Metadata } from "next";
import Link from "next/link";
import { AuthLayout, FormAlert } from "@/features/auth/auth-layout";
import { ConfirmEmail, ResendVerificationForm } from "@/features/auth/email-flows";

export const metadata: Metadata = { title: "Confirm your email" };

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; sent?: string }>;
}) {
  const { token, sent } = await searchParams;

  if (token) {
    return (
      <AuthLayout title="Confirm your email" description="One click and your account is ready.">
        <ConfirmEmail token={token} />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Check your inbox"
      description="We've sent you a link to confirm your email address. It expires in 24 hours."
      footer={
        <Link href="/login" className="font-semibold text-foreground underline underline-offset-2">
          Back to log in
        </Link>
      }
    >
      <div className="flex flex-col gap-6">
        {sent ? (
          <FormAlert tone="success">
            Account created. Open the email from FitCoach to finish.
          </FormAlert>
        ) : null}
        <div>
          <h2 className="mb-3 text-sm font-semibold">Didn't get it?</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Check spam, or enter your email for a new link.
          </p>
          <ResendVerificationForm />
        </div>
      </div>
    </AuthLayout>
  );
}
