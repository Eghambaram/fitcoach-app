import { COACHING_MODE_LABELS, type CoachingMode, type PublicPageResponse } from "@fitcoach/shared";
import {
  Building2,
  Laptop,
  MapPin,
  MessageCircle,
  Repeat,
  ShieldCheck,
  UserCheck,
} from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { cache } from "react";
import { ErrorState } from "@/components/shared/status";
import { Card } from "@/components/ui/card";
import { type Attribution, EnquiryForm } from "@/features/public-page/enquiry-form";
import { Avatar } from "@/features/shell/app-shell";
import { serverApi } from "@/lib/api/server";

type PageResult =
  { status: "ok"; page: PublicPageResponse } | { status: "missing" } | { status: "error" };

/** One read per request, shared by the metadata and the page (each read issues a form token). */
const loadPage = cache(async (slug: string): Promise<PageResult> => {
  try {
    const api = await serverApi();
    const { data, response } = await api.GET("/v1/public/pages/{slug}", {
      params: { path: { slug } },
    });
    if (response.status === 404 || response.status === 400) return { status: "missing" };
    if (!response.ok || !data) return { status: "error" };
    return { status: "ok", page: data };
  } catch {
    return { status: "error" };
  }
});

const MODE_DETAILS: Record<CoachingMode, { description: string; icon: typeof Building2 }> = {
  in_person: { description: "Train together at a gym, studio or home.", icon: Building2 },
  online: { description: "Video sessions and coaching wherever you are.", icon: Laptop },
  hybrid: { description: "A mix of in-person and online.", icon: Repeat },
};

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const result = await loadPage(slug);
  if (result.status !== "ok") return { title: "Coach not found", robots: { index: false } };
  const { page } = result;
  return {
    title: { absolute: `${page.displayName} — ${page.businessName}` },
    description: page.headline ?? `Enquire about coaching with ${page.displayName}.`,
  };
}

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
const utmValue = (value: string | string[] | undefined) => first(value)?.slice(0, 100);

/** The public enquiry page (PROMPT §8.2, board 01 "Public Enquiry Page"). No reviews or ratings (§7.3). */
export default async function CoachPage({ params, searchParams }: Props) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const result = await loadPage(slug);
  if (result.status === "missing") notFound();
  if (result.status === "error") {
    return (
      <main className="mx-auto flex min-h-dvh max-w-lg items-center px-4">
        <ErrorState title="This page didn't load" description="Please try again in a moment." />
      </main>
    );
  }
  const { page } = result;
  const firstName = page.displayName.split(" ")[0] ?? page.displayName;
  const attribution: Attribution = {
    source: first(query.src),
    utm: {
      source: utmValue(query.utm_source),
      medium: utmValue(query.utm_medium),
      campaign: utmValue(query.utm_campaign),
      content: utmValue(query.utm_content),
      term: utmValue(query.utm_term),
    },
  };

  return (
    <div className="min-h-dvh bg-background">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:py-12">
        <main className="flex flex-col gap-8">
          <header className="flex flex-col gap-5 sm:flex-row sm:items-center">
            {page.avatarUrl ? (
              <Image
                src={page.avatarUrl}
                alt={page.displayName}
                width={112}
                height={112}
                unoptimized
                priority
                className="size-28 rounded-full object-cover"
              />
            ) : (
              <Avatar name={page.displayName} className="size-28 text-3xl" />
            )}
            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold text-muted-foreground">{page.businessName}</p>
              <h1 className="text-3xl font-bold tracking-tight text-charcoal">
                {page.displayName}
              </h1>
              {page.headline ? <p className="text-lg text-foreground">{page.headline}</p> : null}
              {page.location ? (
                <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <MapPin className="size-4" aria-hidden="true" />
                  {page.location}
                </p>
              ) : null}
            </div>
          </header>

          {page.coachingTypes.length > 0 ? (
            <ul className="flex flex-wrap gap-2" aria-label="Coaching types">
              {page.coachingTypes.map((type) => (
                <li
                  key={type}
                  className="rounded-full bg-card px-3 py-1 text-sm font-medium ring-1 ring-border"
                >
                  {type}
                </li>
              ))}
            </ul>
          ) : null}

          <section aria-labelledby="modes-heading" className="flex flex-col gap-3">
            <h2 id="modes-heading" className="text-lg font-semibold">
              Ways to train with {firstName}
            </h2>
            <ul className="grid gap-3 sm:grid-cols-3">
              {page.coachingModes.map((mode) => {
                const { description, icon: Icon } = MODE_DETAILS[mode];
                return (
                  <li key={mode}>
                    <Card className="flex h-full flex-col gap-2 p-4">
                      <span className="flex size-10 items-center justify-center rounded-control bg-lime">
                        <Icon className="size-5 text-lime-foreground" aria-hidden="true" />
                      </span>
                      <span className="font-semibold">{COACHING_MODE_LABELS[mode]}</span>
                      <span className="text-sm text-muted-foreground">{description}</span>
                    </Card>
                  </li>
                );
              })}
            </ul>
          </section>

          {page.bio ? (
            <section aria-labelledby="about-heading" className="flex flex-col gap-2">
              <h2 id="about-heading" className="text-lg font-semibold">
                About
              </h2>
              <p className="whitespace-pre-line text-foreground">{page.bio}</p>
            </section>
          ) : null}

          <Card className="p-5 sm:p-6">
            <section aria-labelledby="enquiry-heading" className="flex flex-col gap-5">
              <div>
                <h2 id="enquiry-heading" className="text-xl font-bold">
                  Send an enquiry
                </h2>
                <p className="text-sm text-muted-foreground">
                  Tell {firstName} a little about yourself. No account needed.
                </p>
              </div>
              <EnquiryForm page={page} attribution={attribution} />
            </section>
          </Card>
        </main>

        <aside
          aria-label={`About enquiring with ${page.displayName}`}
          className="lg:sticky lg:top-8 lg:self-start"
        >
          <div className="flex flex-col gap-6 overflow-hidden rounded-card bg-sidebar p-6 text-sidebar-foreground">
            {page.avatarUrl ? (
              <Image
                src={page.avatarUrl}
                alt=""
                width={640}
                height={640}
                unoptimized
                className="aspect-square w-full rounded-control object-cover"
              />
            ) : null}
            <ul className="flex flex-col gap-4 text-sm">
              <li className="flex gap-3">
                <MessageCircle className="size-5 shrink-0 text-lime" aria-hidden="true" />
                <span>{firstName} replies to you directly, by phone or WhatsApp.</span>
              </li>
              <li className="flex gap-3">
                <UserCheck className="size-5 shrink-0 text-lime" aria-hidden="true" />
                <span>No account or payment needed to enquire.</span>
              </li>
              <li className="flex gap-3">
                <ShieldCheck className="size-5 shrink-0 text-lime" aria-hidden="true" />
                <span>Your details go only to {page.displayName}.</span>
              </li>
            </ul>
          </div>
          <p className="mt-4 text-center text-xs text-muted-foreground">Enquiry page by FitCoach</p>
        </aside>
      </div>
    </div>
  );
}
