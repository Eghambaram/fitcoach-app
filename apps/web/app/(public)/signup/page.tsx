import type { Metadata } from "next";
import Link from "next/link";
import { AuthLayout } from "@/features/auth/auth-layout";
import { SignupForm } from "@/features/auth/signup-form";

export const metadata: Metadata = { title: "Create your account" };

export default function SignupPage() {
  return (
    <AuthLayout
      title="Create your trainer account"
      description="Three short steps. You'll confirm your email before you sign in."
      footer={
        <>
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-semibold text-foreground underline underline-offset-2"
          >
            Log in
          </Link>
        </>
      }
    >
      {/* The closed beta requires an invite code; the API enforces it either way. */}
      <SignupForm inviteRequired />
    </AuthLayout>
  );
}
