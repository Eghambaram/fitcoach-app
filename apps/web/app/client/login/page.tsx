import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ClientAuthLayout } from "@/features/client-portal/client-auth-layout";
import { ClientLogin } from "@/features/client-portal/client-login";
import { getSession } from "@/lib/api/server";

export const metadata: Metadata = { title: "Sign in" };

/** Client re-login with an email code (PROMPT §9, §12.2). */
export default async function ClientLoginPage() {
  const session = await getSession();
  if (session.status === "signed_in" && session.me.actor === "client") redirect("/client/home");
  return (
    <ClientAuthLayout
      title="Sign in"
      description="We'll email you a 6-digit code."
      footer="No email on file? Ask your trainer to send you a new link on WhatsApp."
    >
      <ClientLogin />
    </ClientAuthLayout>
  );
}
