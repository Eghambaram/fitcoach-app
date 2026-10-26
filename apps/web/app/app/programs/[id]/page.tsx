import type { Metadata } from "next";
import Link from "next/link";
import { ErrorState } from "@/components/shared/status";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ProgramBuilder } from "@/features/programs/program-builder";
import { TemplateView } from "@/features/programs/programs-screen";
import { serverApi } from "@/lib/api/server";

export const metadata: Metadata = { title: "Program" };

/** Program builder (PROMPT §8.5). Starter templates open read-only, with "Use template". */
export default async function ProgramPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const api = await serverApi();
  const { data, response } = await api.GET("/v1/programs/{id}", { params: { path: { id } } });
  if (!data) {
    const missing = response.status === 404 || response.status === 400;
    return (
      <Card>
        <ErrorState
          title={missing ? "Program not found" : undefined}
          description={
            missing
              ? "It may belong to another workspace, or the link is wrong."
              : "We couldn't load this program. Please try again."
          }
          action={
            <Button variant="outline" asChild>
              <Link href="/app/programs">All programs</Link>
            </Button>
          }
        />
      </Card>
    );
  }
  if (data.global) return <TemplateView template={data} />;
  return <ProgramBuilder key={data.id} initial={data} />;
}
