import type { Metadata } from "next";
import { ClientAuthLayout } from "@/features/client-portal/client-auth-layout";
import { InviteWelcome } from "@/features/client-portal/invite-welcome";

// The token is in the path: never send it on as a referrer, never index the page.
export const metadata: Metadata = {
  title: "Welcome",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

/** Client arrival from a WhatsApp or email invite (PROMPT §9, D19). */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <ClientAuthLayout title="Welcome to FitCoach">
      <InviteWelcome token={token} />
    </ClientAuthLayout>
  );
}
