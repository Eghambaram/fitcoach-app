import type { ProgressOverviewResponse } from "@fitcoach/shared";
import { LineChart } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/status";
import { Card } from "@/components/ui/card";
import { dayLabel } from "../calendar/dates";
import { formatChange, formatValue } from "./format";

/**
 * `/app/progress` (PROMPT §8.8): each client's own recent changes over the last 90 days. Never an
 * average across clients.
 */
export function ProgressOverview({ data }: { data: ProgressOverviewResponse }) {
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Progress"
        description="Recent measurements per client (last 90 days). Open a client for charts."
      />
      {data.clients.length === 0 ? (
        <Card>
          <EmptyState
            icon={LineChart}
            title="No recent measurements"
            description="Values you add on a client's Progress tab show up here."
          />
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {data.clients.map((client) => (
            <li key={client.id}>
              <Link
                href={`/app/clients/${client.id}?tab=progress`}
                className="block rounded-card border border-border bg-card p-4 hover:bg-muted focus-visible:outline-2 focus-visible:outline-charcoal"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-semibold">{client.fullName}</span>
                  <span className="text-xs text-muted-foreground">
                    Last measured {dayLabel(client.lastMeasuredOn)}
                  </span>
                </div>
                <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-3">
                  {client.changes.map((change) => (
                    <div key={change.name}>
                      <dt className="text-muted-foreground">{change.name}</dt>
                      <dd>
                        <span className="font-semibold">
                          {formatValue(change.latest, change.unitKind, data.units)}
                        </span>
                        {change.change !== null && change.since ? (
                          <span className="text-muted-foreground">
                            {" "}
                            ({formatChange(change.change, change.unitKind, data.units)} since{" "}
                            {dayLabel(change.since)})
                          </span>
                        ) : null}
                      </dd>
                    </div>
                  ))}
                </dl>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
