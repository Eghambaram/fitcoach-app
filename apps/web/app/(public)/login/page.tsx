import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthLayout } from "@/features/auth/auth-layout";
import { LoginForm } from "@/features/auth/login-form";
import { getSession } from "@/lib/api/server";
import { safeNextPath } from "@/lib/safe-redirect";

export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const destination = safeNextPath(next);
  const session = await getSession();
  if (session.status === "signed_in" && session.me.actor === "trainer") redirect(destination);

  return (
    <AuthLayout
      title="Welcome back"
      description="Log in to your FitCoach workspace."
      footer={
        <>
          New to FitCoach?{" "}
          <Link
            href="/signup"
            className="font-semibold text-foreground underline underline-offset-2"
          >
            Create your account
          </Link>
        </>
      }
    >
      <LoginForm next={destination} />
    </AuthLayout>
  );
}
