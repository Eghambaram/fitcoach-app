import type { Metadata } from "next";
import Link from "next/link";
import { AuthLayout } from "@/features/auth/auth-layout";
import { ForgotPasswordForm } from "@/features/auth/email-flows";

export const metadata: Metadata = { title: "Reset your password" };

export default function ForgotPasswordPage() {
  return (
    <AuthLayout
      title="Reset your password"
      description="Enter your email and we'll send you a link to choose a new password."
      footer={
        <Link href="/login" className="font-semibold text-foreground underline underline-offset-2">
          Back to log in
        </Link>
      }
    >
      <ForgotPasswordForm />
    </AuthLayout>
  );
}
