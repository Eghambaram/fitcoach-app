"use client";

import { useMutation } from "@tanstack/react-query";
import { LogOut } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { Logo } from "@/components/brand/logo";
import { Drawer } from "@/components/shared/overlays";
import { Button } from "@/components/ui/button";
import { browserApi, unwrap } from "@/lib/api/browser";
import { cn } from "@/lib/utils";
import { NotificationBell } from "../notifications/notification-bell";
import {
  isActive,
  MORE_ICON,
  type NavItem,
  PLATFORM_NAV,
  TRAINER_BOTTOM_NAV,
  TRAINER_MORE_NAV,
  TRAINER_NAV,
} from "./navigation";

/**
 * Navigation per area. Server layouts pass the area name, not the items: nav items hold icon
 * components, which can't be serialised from a Server Component into this Client Component.
 */
const AREAS = {
  trainer: { nav: TRAINER_NAV, bottomNav: TRAINER_BOTTOM_NAV, moreNav: TRAINER_MORE_NAV },
  platform: { nav: PLATFORM_NAV, bottomNav: PLATFORM_NAV.slice(0, 4), moreNav: undefined },
} as const satisfies Record<
  string,
  { nav: readonly NavItem[]; bottomNav: readonly NavItem[]; moreNav?: readonly NavItem[] }
>;

export type ShellArea = keyof typeof AREAS;

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

/** Photo when there is one (decorative: the name is always shown next to it), otherwise initials. */
export function Avatar({
  name,
  imageUrl,
  className,
}: {
  name: string;
  imageUrl?: string | null;
  className?: string;
}) {
  if (imageUrl) {
    return (
      <Image
        src={imageUrl}
        alt=""
        width={36}
        height={36}
        unoptimized
        className={cn("size-9 shrink-0 rounded-full object-cover", className)}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-full bg-lime text-sm font-bold text-lime-foreground",
        className,
      )}
    >
      {initials(name) || "?"}
    </span>
  );
}

function SoonBadge() {
  return (
    <span className="ml-auto rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase">
      Soon
    </span>
  );
}

/** One nav entry. Unavailable items are not links: aria-disabled, labelled "Coming soon" (rule 22). */
function SidebarLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const Icon = item.icon;
  const active = isActive(pathname, item.href);
  const classes = "flex h-11 items-center gap-3 rounded-control px-3 text-sm font-medium";
  if (!item.available) {
    return (
      <span
        aria-disabled="true"
        title="Coming soon"
        className={cn(classes, "cursor-not-allowed text-sidebar-muted/70")}
      >
        <Icon className="size-5" aria-hidden="true" />
        {item.label}
        <span className="sr-only"> (coming soon)</span>
        <SoonBadge />
      </span>
    );
  }
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        classes,
        active ? "bg-lime text-lime-foreground" : "text-sidebar-foreground hover:bg-sidebar-hover",
      )}
    >
      <Icon className="size-5" aria-hidden="true" />
      {item.label}
    </Link>
  );
}

function BottomLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const Icon = item.icon;
  const active = isActive(pathname, item.href);
  const classes =
    "flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium";
  if (!item.available) {
    return (
      <span
        aria-disabled="true"
        title="Coming soon"
        className={cn(classes, "text-muted-foreground/60")}
      >
        <Icon className="size-5" aria-hidden="true" />
        {item.label}
        <span className="sr-only"> (coming soon)</span>
      </span>
    );
  }
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(classes, active ? "text-charcoal" : "text-muted-foreground")}
    >
      <span
        className={cn(
          "flex h-7 w-12 items-center justify-center rounded-full",
          active && "bg-lime",
        )}
      >
        <Icon className="size-5" aria-hidden="true" />
      </span>
      {item.label}
    </Link>
  );
}

function useSignOut() {
  const router = useRouter();
  return useMutation({
    mutationFn: () => unwrap(browserApi.POST("/v1/auth/logout")),
    onSuccess: () => {
      router.replace("/login");
      router.refresh();
    },
    onError: (error) => toast.error(error.message),
  });
}

export interface AppShellProps {
  area: ShellArea;
  userName: string;
  avatarUrl?: string | null;
  /** Workspace / context line under the user's name. */
  subtitle?: string;
  badge?: string;
  banner?: ReactNode;
  children: ReactNode;
}

/**
 * Desktop: charcoal sidebar + compact top bar. Mobile: top bar + bottom nav + "More" sheet (PROMPT §6, §7).
 */
export function AppShell({
  area,
  userName,
  avatarUrl,
  subtitle,
  badge,
  banner,
  children,
}: AppShellProps) {
  const { nav, bottomNav, moreNav } = AREAS[area];
  const pathname = usePathname();
  const signOut = useSignOut();
  const [moreOpen, setMoreOpen] = useState(false);
  const MoreIcon = MORE_ICON;

  return (
    <div className="min-h-dvh md:pl-64">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-control focus:bg-card focus:px-4 focus:py-2"
      >
        Skip to content
      </a>

      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col bg-sidebar px-4 py-6 md:flex">
        <div className="flex items-center gap-2 px-2">
          <Logo tone="light" />
        </div>
        {badge ? (
          <span className="mt-3 self-start rounded-full bg-lime px-2.5 py-0.5 text-xs font-semibold text-lime-foreground">
            {badge}
          </span>
        ) : null}
        <nav aria-label="Main" className="mt-8 flex flex-1 flex-col gap-1 overflow-y-auto">
          {nav.map((item) => (
            <SidebarLink key={item.href} item={item} pathname={pathname} />
          ))}
        </nav>
        <div className="mt-4 flex items-center gap-3 rounded-card bg-sidebar-hover p-3">
          <Avatar name={userName} imageUrl={avatarUrl} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-sidebar-foreground">{userName}</p>
            {subtitle ? <p className="truncate text-xs text-sidebar-muted">{subtitle}</p> : null}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="text-sidebar-foreground hover:bg-white/10"
            aria-label="Sign out"
            loading={signOut.isPending}
            onClick={() => signOut.mutate()}
          >
            {signOut.isPending ? null : <LogOut aria-hidden="true" />}
          </Button>
        </div>
      </aside>

      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur md:hidden">
        <Logo />
        <div className="flex items-center gap-1">
          {area === "trainer" ? <NotificationBell /> : null}
          <Avatar name={userName} imageUrl={avatarUrl} className="size-8" />
        </div>
      </header>
      {area === "trainer" ? (
        <div className="sticky top-0 z-30 hidden h-14 items-center justify-end border-b border-border bg-background/95 px-8 backdrop-blur md:flex">
          <NotificationBell />
        </div>
      ) : null}

      {banner}

      <main id="main" className="mx-auto w-full max-w-6xl px-4 pt-6 pb-28 md:px-8 md:pt-8 md:pb-12">
        {children}
      </main>

      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-card pb-safe md:hidden"
      >
        {bottomNav.map((item) => (
          <BottomLink key={item.href} item={item} pathname={pathname} />
        ))}
        {moreNav ? (
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className="flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-muted-foreground"
          >
            <span className="flex h-7 w-12 items-center justify-center">
              <MoreIcon className="size-5" aria-hidden="true" />
            </span>
            More
          </button>
        ) : null}
      </nav>

      {moreNav ? (
        <Drawer open={moreOpen} onOpenChange={setMoreOpen} title="More">
          <ul className="flex flex-col gap-1">
            {moreNav.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  {item.available ? (
                    <Link
                      href={item.href}
                      onClick={() => setMoreOpen(false)}
                      className="flex h-12 items-center gap-3 rounded-control px-3 text-sm font-medium hover:bg-muted"
                    >
                      <Icon className="size-5" aria-hidden="true" />
                      {item.label}
                    </Link>
                  ) : (
                    <span
                      aria-disabled="true"
                      className="flex h-12 items-center gap-3 px-3 text-sm text-muted-foreground"
                    >
                      <Icon className="size-5" aria-hidden="true" />
                      {item.label}
                      <span className="ml-auto text-xs">Coming soon</span>
                    </span>
                  )}
                </li>
              );
            })}
            <li className="mt-2 border-t border-border pt-2">
              <button
                type="button"
                onClick={() => signOut.mutate()}
                className="flex h-12 w-full items-center gap-3 rounded-control px-3 text-sm font-medium text-danger hover:bg-danger-soft"
              >
                <LogOut className="size-5" aria-hidden="true" />
                Sign out
              </button>
            </li>
          </ul>
        </Drawer>
      ) : null}
    </div>
  );
}
