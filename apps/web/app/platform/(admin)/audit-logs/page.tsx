import { platformAuditQuerySchema } from "@fitcoach/shared";
import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { ErrorState } from "@/components/shared/status";
import { Card } from "@/components/ui/card";
import { AuditLog } from "@/features/platform/audit-log";
import { serverApi } from "@/lib/api/server";

export const metadata: Metadata = { title: "Audit logs" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function PlatformAuditPage({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams;
  const parsed = platformAuditQuerySchema.safeParse({
    action: first(raw.action) || undefined,
    actorKind: first(raw.actorKind) || undefined,
    workspaceId: first(raw.workspaceId) || undefined,
  });
  const filters = parsed.success ? parsed.data : {};
  const api = await serverApi();
  const { data } = await api.GET("/v1/platform/audit-logs", { params: { query: filters } });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Audit logs"
        description="Every sign-in and change that matters, by whom. Entries can't be edited or deleted."
      />
      {data ? (
        <AuditLog key={JSON.stringify(filters)} initial={data} filters={filters} />
      ) : (
        <Card>
          <ErrorState description="We couldn't load the audit log. Please try again." />
        </Card>
      )}
    </div>
  );
}
