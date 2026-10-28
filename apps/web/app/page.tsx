import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Landing } from "@/features/marketing/landing";
import { getSession } from "@/lib/api/server";

/**
 * `/` (PROMPT §14): signed-in users go to their home; everyone else sees the landing page. The API
 * is only asked when a session cookie exists, so anonymous visits stay cheap.
 */
export default async function HomePage() {
  if ((await cookies()).has("fc_session")) {
    const session = await getSession();
    if (session.status === "signed_in") {
      if (session.me.actor === "trainer") redirect("/app/dashboard");
      if (session.me.actor === "client") redirect("/client/home");
    }
  }
  return <Landing />;
}
