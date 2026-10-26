import type { Metadata } from "next";
import { ErrorState } from "@/components/shared/status";
import { Card } from "@/components/ui/card";
import { ProgramsScreen } from "@/features/programs/programs-screen";
import { serverApi } from "@/lib/api/server";

export const metadata: Metadata = { title: "Programs" };

/** Programs (PROMPT §8.5): yours, your templates and the starter templates. */
export default async function ProgramsPage() {
  const api = await serverApi();
  const [mine, archived, templates] = await Promise.all([
    api.GET("/v1/programs"),
    api.GET("/v1/programs", { params: { query: { archived: true } } }),
    api.GET("/v1/programs/templates"),
  ]);
  if (!mine.data || !archived.data || !templates.data) {
    return (
      <Card>
        <ErrorState description="We couldn't load your programs. Please try again." />
      </Card>
    );
  }
  return <ProgramsScreen mine={mine.data} archived={archived.data} templates={templates.data} />;
}
