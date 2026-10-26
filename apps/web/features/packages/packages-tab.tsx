"use client";

import {
  type ClientPackagesResponse,
  formatInr,
  type LedgerEntry,
  PACKAGE_KIND_LABELS,
  type PackageCard as PackageCardData,
  type PackageSummary,
  PAYMENT_METHOD_LABELS,
  type Payment,
} from "@fitcoach/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Package, Plus, Wallet } from "lucide-react";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { useOnline } from "@/components/shared/offline-banner";
import { ConfirmDialog, Drawer, Modal } from "@/components/shared/overlays";
import { EmptyState, ErrorState, StatusPill } from "@/components/shared/status";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { browserApi, unwrap } from "@/lib/api/browser";
import { dayLabel, timeLabel } from "../calendar/dates";
import { AdjustSessionsForm, RecordPaymentForm, SellPackageForm } from "./package-forms";
import { dateLabel, PackageStatusPill, SessionsProgress, sessionsLine } from "./package-display";

export const clientPackagesKey = (clientId: string) => ["client-packages", clientId];

const REASON_LABELS: Record<LedgerEntry["reason"], string> = {
  attended: "Attended",
  no_show: "No-show",
  late_cancel: "Late cancel",
  manual_adjustment: "Adjusted by you",
};

function ledgerLabel(entry: LedgerEntry): string {
  const when = entry.appointment
    ? ` · ${dayLabel(entry.appointment.date)}, ${timeLabel(entry.appointment.startTime)}`
    : "";
  if (entry.reversal) return `Undone: ${REASON_LABELS[entry.reason].toLowerCase()}${when}`;
  return `${REASON_LABELS[entry.reason]}${when}`;
}

function sessionsDelta(value: number): string {
  if (value === 0) return "No session used";
  const count = Math.abs(value);
  return `${value > 0 ? "−" : "+"}${count} session${count === 1 ? "" : "s"}`;
}

/** Money and dates of a package: what was sold, what's due and what's been paid. */
function MoneyFacts({ pkg }: { pkg: PackageSummary }) {
  return (
    <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
      <Fact label="Price">{formatInr(pkg.pricePaise)}</Fact>
      <Fact label="Amount due">{formatInr(pkg.amountDuePaise)}</Fact>
      <Fact label="Paid (recorded)">{formatInr(pkg.paidPaise)}</Fact>
      <Fact label="Balance">
        <span className={pkg.paymentOverdue ? "text-danger" : undefined}>
          {formatInr(pkg.balancePaise)}
        </span>
      </Fact>
    </dl>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-semibold">{children}</dd>
    </div>
  );
}

function datesLine(pkg: Pick<PackageSummary, "startsOn" | "expiresOn">): string {
  return pkg.expiresOn
    ? `${dateLabel(pkg.startsOn)} – ${dateLabel(pkg.expiresOn)}`
    : `From ${dateLabel(pkg.startsOn)}, no expiry`;
}

/** Shared mutation plumbing: show the new state, refresh the profile, close the sheet. */
function useApplied(clientId: string, onChanged: () => void) {
  const queryClient = useQueryClient();
  return (next: ClientPackagesResponse, message: string) => {
    queryClient.setQueryData(clientPackagesKey(clientId), next);
    toast.success(message);
    onChanged();
  };
}

/** Client detail → Packages tab (§8.3A). */
export function PackagesTab({
  clientId,
  archived,
  onChanged,
}: {
  clientId: string;
  archived: boolean;
  onChanged: () => void;
}) {
  const online = useOnline();
  const applied = useApplied(clientId, onChanged);
  const [sheet, setSheet] = useState<"sell" | "pay" | "adjust" | "cancel" | null>(null);
  const [voiding, setVoiding] = useState<Payment | null>(null);
  const [reason, setReason] = useState("");
  const query = useQuery({
    queryKey: clientPackagesKey(clientId),
    queryFn: () =>
      unwrap(browserApi.GET("/v1/clients/{id}/packages", { params: { path: { id: clientId } } })),
  });

  const cancel = useMutation({
    mutationFn: (packageId: string) =>
      unwrap(
        browserApi.POST("/v1/packages/{id}/cancel", {
          params: { path: { id: packageId } },
          body: { reason: reason.trim() },
        }),
      ),
    onSuccess: (next) => {
      setSheet(null);
      setReason("");
      applied(next, "Package cancelled.");
    },
    onError: (failure) => toast.error(failure.message),
  });
  const voidPayment = useMutation({
    mutationFn: (paymentId: string) =>
      unwrap(
        browserApi.POST("/v1/payments/{id}/void", {
          params: { path: { id: paymentId } },
          body: { reason: reason.trim() },
        }),
      ),
    onSuccess: (next) => {
      setVoiding(null);
      setReason("");
      applied(next, "Payment voided.");
    },
    onError: (failure) => toast.error(failure.message),
  });

  if (query.isPending) {
    return (
      <p role="status" className="py-8 text-center text-sm text-muted-foreground">
        Loading…
      </p>
    );
  }
  if (query.isError || !query.data) {
    return <ErrorState description="We couldn't load their packages. Please try again." />;
  }
  const { active, history, payments, ledger, lowSessionsThreshold } = query.data;
  const low =
    active?.sessionsLeft !== null &&
    active?.sessionsLeft !== undefined &&
    active.sessionsLeft <= lowSessionsThreshold;

  return (
    <div className="flex flex-col gap-5">
      {active ? (
        <Card className="flex flex-col gap-4 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold">{active.name}</h2>
                <PackageStatusPill status={active.status} />
                {low ? <StatusPill tone="warning">Running low</StatusPill> : null}
                {active.paymentOverdue ? <StatusPill tone="danger">Payment due</StatusPill> : null}
              </div>
              <p className="text-sm text-muted-foreground">
                {PACKAGE_KIND_LABELS[active.kind]} · {datesLine(active)}
              </p>
            </div>
            <Button variant="dark" disabled={!online || archived} onClick={() => setSheet("sell")}>
              <Plus aria-hidden="true" />
              Renew package
            </Button>
          </div>
          {active.kind === "session_pack" && active.sessionsIncluded !== null ? (
            <SessionsProgress used={active.sessionsUsed} included={active.sessionsIncluded} />
          ) : (
            <p className="text-sm">{sessionsLine(active)}</p>
          )}
          {active.sessionsLeft === 0 ? (
            <p role="status" className="rounded-control bg-warning-soft p-3 text-sm">
              No sessions left. Renew the package, or attendance is recorded without one.
            </p>
          ) : null}
          {active.status === "expired" ? (
            <p role="status" className="rounded-control bg-warning-soft p-3 text-sm">
              Expired on {dateLabel(active.expiresOn ?? active.startsOn)}. Sessions after that day
              don&apos;t use it; renew to continue.
            </p>
          ) : null}
          <MoneyFacts pkg={active} />
          {active.paymentDueOn ? (
            <p className="text-xs text-muted-foreground">
              Payment due by {dateLabel(active.paymentDueOn)}
            </p>
          ) : null}
          {active.notes ? <p className="text-sm whitespace-pre-line">{active.notes}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={!online || active.balancePaise === 0}
              onClick={() => setSheet("pay")}
            >
              <Wallet aria-hidden="true" />
              Record payment
            </Button>
            {active.kind === "session_pack" ? (
              <Button variant="outline" disabled={!online} onClick={() => setSheet("adjust")}>
                Adjust sessions
              </Button>
            ) : null}
            <Button variant="ghost" disabled={!online} onClick={() => setSheet("cancel")}>
              Cancel package
            </Button>
          </div>
        </Card>
      ) : (
        <Card>
          <EmptyState
            icon={Package}
            title="No active package"
            description={
              archived
                ? "Restore this client to sell them a package."
                : "Sell a package to track sessions left, expiry and what they've paid."
            }
            action={
              archived ? undefined : (
                <Button variant="dark" disabled={!online} onClick={() => setSheet("sell")}>
                  <Plus aria-hidden="true" />
                  Sell package
                </Button>
              )
            }
          />
        </Card>
      )}

      <section aria-labelledby="payments-heading" className="flex flex-col gap-2">
        <h3 id="payments-heading" className="font-semibold">
          Payments{" "}
          <span className="text-sm font-normal text-muted-foreground">· recorded manually</span>
        </h3>
        {payments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-card border border-border bg-card">
            {payments.map((payment) => (
              <li key={payment.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className={payment.voided ? "line-through" : "font-semibold"}>
                    {formatInr(payment.amountPaise)} · {PAYMENT_METHOD_LABELS[payment.method]}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {dateLabel(payment.paidOn)} · {payment.packageName}
                    {payment.reference ? ` · Ref ${payment.reference}` : ""}
                    {payment.note ? ` · ${payment.note}` : ""}
                  </p>
                  {payment.voided ? (
                    <p className="text-xs text-danger">Voided: {payment.voided.reason}</p>
                  ) : null}
                </div>
                {payment.voided ? (
                  <StatusPill tone="neutral">Voided</StatusPill>
                ) : (
                  <Button
                    variant="ghost"
                    disabled={!online}
                    onClick={() => setVoiding(payment)}
                    aria-label={`Void payment of ${formatInr(payment.amountPaise)} on ${dateLabel(payment.paidOn)}`}
                  >
                    Void
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {active ? (
        <section aria-labelledby="ledger-heading" className="flex flex-col gap-2">
          <h3 id="ledger-heading" className="font-semibold">
            Session use
          </h3>
          {ledger.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing yet. Marking a session attended uses one.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-border rounded-card border border-border bg-card">
              {ledger.map((entry) => (
                <li
                  key={entry.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
                >
                  <span>
                    {ledgerLabel(entry)}
                    {entry.note ? (
                      <span className="block text-xs text-muted-foreground">{entry.note}</span>
                    ) : null}
                  </span>
                  <span className="text-muted-foreground">{sessionsDelta(entry.sessionsUsed)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {history.length > 0 ? (
        <section aria-labelledby="history-heading" className="flex flex-col gap-2">
          <h3 id="history-heading" className="font-semibold">
            Earlier packages
          </h3>
          <ul className="flex flex-col gap-3">
            {history.map((pkg) => (
              <li key={pkg.id}>
                <Card className="flex flex-col gap-3 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{pkg.name}</p>
                    <PackageStatusPill status={pkg.status} />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {datesLine(pkg)} ·{" "}
                    {pkg.kind === "session_pack"
                      ? `${pkg.sessionsUsed} of ${pkg.sessionsIncluded ?? 0} used`
                      : PACKAGE_KIND_LABELS[pkg.kind]}
                    {pkg.closedReason ? ` · ${pkg.closedReason}` : ""}
                  </p>
                  <MoneyFacts pkg={pkg} />
                </Card>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <Drawer
        open={sheet === "sell"}
        onOpenChange={(open) => setSheet(open ? "sell" : null)}
        title={active ? "Renew package" : "Sell package"}
      >
        {sheet === "sell" ? (
          <SellPackageForm
            clientId={clientId}
            current={active}
            onSold={(next) => {
              setSheet(null);
              applied(next, active ? "Package renewed." : "Package sold.");
            }}
          />
        ) : null}
      </Drawer>
      <Modal
        open={sheet === "pay"}
        onOpenChange={(open) => setSheet(open ? "pay" : null)}
        title="Record payment"
      >
        {sheet === "pay" && active ? (
          <RecordPaymentForm
            packageId={active.id}
            packageName={active.name}
            balancePaise={active.balancePaise}
            onSaved={(next) => {
              setSheet(null);
              applied(next, "Payment recorded.");
            }}
          />
        ) : null}
      </Modal>
      <Modal
        open={sheet === "adjust"}
        onOpenChange={(open) => setSheet(open ? "adjust" : null)}
        title="Adjust sessions"
      >
        {sheet === "adjust" && active ? (
          <AdjustSessionsForm
            packageId={active.id}
            sessionsLeft={active.sessionsLeft ?? 0}
            sessionsUsed={active.sessionsUsed}
            onSaved={(next) => {
              setSheet(null);
              applied(next, "Sessions adjusted.");
            }}
          />
        ) : null}
      </Modal>
      <ConfirmDialog
        open={sheet === "cancel"}
        onOpenChange={(open) => (open ? null : setSheet(null))}
        title="Cancel this package?"
        description={
          <>
            Use this for a package sold by mistake or refunded. It stops being used for sessions;
            its history and payments are kept.
            <span className="mt-3 block">
              <Field label="Reason" required>
                <Input
                  maxLength={200}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
              </Field>
            </span>
          </>
        }
        confirmLabel="Cancel package"
        cancelLabel="Keep it"
        destructive
        pending={cancel.isPending}
        onConfirm={() => {
          if (!reason.trim()) return toast.error("Add a reason.");
          if (active) cancel.mutate(active.id);
        }}
      />
      <ConfirmDialog
        open={voiding !== null}
        onOpenChange={(open) => (open ? null : setVoiding(null))}
        title="Void this payment?"
        description={
          <>
            {voiding ? `${formatInr(voiding.amountPaise)} on ${dateLabel(voiding.paidOn)}` : ""}{" "}
            stays in the list, marked voided, and no longer counts as paid.
            <span className="mt-3 block">
              <Field label="Reason" required>
                <Input
                  maxLength={200}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
              </Field>
            </span>
          </>
        }
        confirmLabel="Void payment"
        destructive
        pending={voidPayment.isPending}
        onConfirm={() => {
          if (!reason.trim()) return toast.error("Add a reason.");
          if (voiding) voidPayment.mutate(voiding.id);
        }}
      />
    </div>
  );
}

/** Overview package card (§8.3): sessions left, expiry, amount due, Record payment. */
export function PackageCard({
  pkg,
  archived,
  onOpenPackages,
  onRecordPayment,
}: {
  pkg: PackageCardData | null;
  archived: boolean;
  onOpenPackages: () => void;
  onRecordPayment: () => void;
}) {
  const online = useOnline();
  if (!pkg) {
    return (
      <Card className="flex flex-wrap items-center justify-between gap-3 p-5">
        <div className="flex items-center gap-3">
          <Package className="size-6 text-muted-foreground" aria-hidden="true" />
          <div>
            <h2 className="font-semibold">No active package</h2>
            <p className="text-sm text-muted-foreground">
              Sessions attended aren&apos;t counted against one.
            </p>
          </div>
        </div>
        {archived ? null : (
          <Button variant="outline" onClick={onOpenPackages}>
            Sell package
          </Button>
        )}
      </Card>
    );
  }
  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Package className="size-5 text-success" aria-hidden="true" />
        <h2 className="font-semibold">{pkg.name}</h2>
        <PackageStatusPill status={pkg.status} />
        {pkg.paymentOverdue ? <StatusPill tone="danger">Payment due</StatusPill> : null}
      </div>
      {pkg.kind === "session_pack" && pkg.sessionsIncluded !== null ? (
        <SessionsProgress used={pkg.sessionsUsed} included={pkg.sessionsIncluded} />
      ) : (
        <p className="text-sm">{sessionsLine(pkg)}</p>
      )}
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <Fact label="Expires">{pkg.expiresOn ? dateLabel(pkg.expiresOn) : "No expiry"}</Fact>
        <Fact label="Amount due">
          <span className={pkg.paymentOverdue ? "text-danger" : undefined}>
            {formatInr(pkg.balancePaise)}
          </span>
        </Fact>
      </dl>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          disabled={!online || pkg.balancePaise === 0}
          onClick={onRecordPayment}
        >
          <Wallet aria-hidden="true" />
          Record payment
        </Button>
        <Button variant="ghost" onClick={onOpenPackages}>
          Package details
        </Button>
      </div>
    </Card>
  );
}
