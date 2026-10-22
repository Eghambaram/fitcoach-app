import { redirect } from "next/navigation";

/** Deep link to one lead (e.g. from a notification): the list with that lead's drawer open. */
export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/app/leads?lead=${encodeURIComponent(id)}`);
}
