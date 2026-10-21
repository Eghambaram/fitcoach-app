"use client";

import {
  LEAD_SOURCE_LABELS,
  type PublicPageSettingsResponse,
  SHARE_LINK_SOURCES,
} from "@fitcoach/shared";
import { Download, ExternalLink, Share2 } from "lucide-react";
import Link from "next/link";
import { useSyncExternalStore } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CopyButton } from "./copy-button";

const noSubscription = () => () => undefined;

/** Web Share exists on phones and some desktops; the button only shows where it works. */
function useCanShare(): boolean {
  return useSyncExternalStore(
    noSubscription,
    () => typeof navigator.share === "function",
    () => false,
  );
}

const QR_PATH = "/api/v1/settings/public-page/qr";

/** What the enquiry form asks, from the trainer's own form settings. */
function formFieldList(form: PublicPageSettingsResponse["form"]): string[] {
  return [
    "Name",
    "Phone (with WhatsApp)",
    ...(form.email === "hidden" ? [] : [form.email === "required" ? "Email" : "Email (optional)"]),
    "Main goal",
    "Preferred way to train",
    ...(form.schedule ? ["Preferred days and times"] : []),
    ...(form.message ? ["Message"] : []),
    "Consent to be contacted",
  ];
}

export function ShareScreen({ page }: { page: PublicPageSettingsResponse }) {
  const canShare = useCanShare();

  async function share() {
    try {
      await navigator.share({
        title: `${page.displayName} — ${page.businessName}`,
        text: page.headline || `Enquire about coaching with ${page.displayName}`,
        url: page.publicUrl,
      });
    } catch (error) {
      // Closing the share sheet isn't an error worth showing.
      if ((error as { name?: string }).name !== "AbortError") toast.error("Couldn't open sharing.");
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <div className="flex flex-col gap-6">
        {page.isPublished ? null : (
          <div
            role="status"
            className="rounded-control bg-warning-soft px-4 py-3 text-sm text-warning"
          >
            Your page isn&apos;t published yet, so the link and QR code won&apos;t work for others.{" "}
            <Link href="/app/settings/profile" className="font-semibold underline">
              Publish it in Profile & public page
            </Link>
            .
          </div>
        )}

        <Card className="flex flex-col gap-4 p-5">
          <h2 className="font-semibold">Your page link</h2>
          <code className="truncate rounded-control bg-muted px-3 py-2.5 text-sm">
            {page.publicUrl}
          </code>
          <div className="flex flex-wrap gap-2">
            <CopyButton value={page.publicUrl} />
            {canShare ? (
              <Button variant="dark" onClick={share}>
                <Share2 aria-hidden="true" />
                Share page
              </Button>
            ) : null}
            <Button variant="outline" asChild>
              <a href={page.publicUrl} target="_blank" rel="noreferrer">
                <ExternalLink aria-hidden="true" />
                Preview
              </a>
            </Button>
          </div>
        </Card>

        <Card className="flex flex-col gap-4 p-5">
          <div>
            <h2 className="font-semibold">Links for each place you share</h2>
            <p className="text-sm text-muted-foreground">
              Each link records where an enquiry came from, so you can see which channel works.
            </p>
          </div>
          <ul className="flex flex-col divide-y divide-border">
            {SHARE_LINK_SOURCES.map((source) => {
              const url = `${page.publicUrl}?src=${source}`;
              return (
                <li
                  key={source}
                  className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <span className="w-24 text-sm font-semibold">{LEAD_SOURCE_LABELS[source]}</span>
                  <code className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                    {url}
                  </code>
                  <CopyButton
                    value={url}
                    label="Copy"
                    aria-label={`Copy ${LEAD_SOURCE_LABELS[source]} link`}
                  />
                </li>
              );
            })}
          </ul>
        </Card>

        <Card className="flex flex-col gap-3 p-5">
          <h2 className="font-semibold">What people fill in</h2>
          <ul className="grid gap-1 text-sm sm:grid-cols-2">
            {formFieldList(page.form).map((field) => (
              <li key={field} className="rounded-control bg-muted px-3 py-2">
                {field}
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            Change these in{" "}
            <Link href="/app/settings/profile" className="underline">
              Profile & public page
            </Link>
            .
          </p>
        </Card>
      </div>

      <Card className="flex flex-col items-center gap-4 self-start p-5 text-center">
        <h2 className="font-semibold">QR code</h2>
        {/* Generated by the API for this page; scans are recorded as "QR code". */}
        {/* eslint-disable-next-line @next/next/no-img-element -- authenticated same-origin image, no optimisation wanted */}
        <img
          src={`${QR_PATH}?format=svg`}
          alt={`QR code that opens ${page.publicUrl}`}
          width={224}
          height={224}
          className="size-56 rounded-control border border-border bg-white p-2"
        />
        <p className="text-xs text-muted-foreground">
          Print it for your gym or studio, or add it to a flyer.
        </p>
        <div className="flex w-full flex-col gap-2">
          <Button variant="outline" asChild>
            <a href={`${QR_PATH}?format=png`} download>
              <Download aria-hidden="true" />
              Download PNG
            </a>
          </Button>
          <Button variant="outline" asChild>
            <a href={`${QR_PATH}?format=svg`} download>
              <Download aria-hidden="true" />
              Download SVG (for print)
            </a>
          </Button>
        </div>
      </Card>
    </div>
  );
}
