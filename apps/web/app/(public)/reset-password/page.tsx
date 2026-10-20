import type { Metadata } from "next";
import Link from "next/link";
import { AuthLayout, FormAlert } from "@/features/auth/auth-layout";
import { ResetPasswordForm } from "@/features/auth/email-flows";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return (
    <AuthLayout
      title="Choose a new password"
      description="You'll be signed out on every device after changing it."
    >
      {token ? (
        <ResetPasswordForm token={token} />
      ) : (
        <FormAlert>
          This link is incomplete.{" "}
          <Link href="/forgot-password" className="underline underline-offset-2">
            Request a new one
          </Link>
          .
        </FormAlert>
      )}
    </AuthLayout>
  );
}
