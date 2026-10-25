import {
  Activity,
  CalendarDays,
  ClipboardCheck,
  Dumbbell,
  FileClock,
  HeartPulse,
  Home,
  LayoutDashboard,
  ListChecks,
  type LucideIcon,
  MessageSquareText,
  MoreHorizontal,
  Settings,
  ShieldCheck,
  TrendingUp,
  UserPlus,
  Users,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /**
   * false until the screen exists: rendered disabled with "Coming soon", never as a dead link
   * (CLAUDE.md rule 22). Flip to true in the step that builds the screen.
   */
  available: boolean;
}

/**
 * Trainer navigation — MVP items only (PROMPT §6). Not shown in the MVP: Nutrition, Messages,
 * Billing, Templates (message templates live in Settings).
 */
export const TRAINER_NAV: readonly NavItem[] = [
  { label: "Dashboard", href: "/app/dashboard", icon: LayoutDashboard, available: true },
  { label: "Leads", href: "/app/leads", icon: UserPlus, available: true },
  { label: "Clients", href: "/app/clients", icon: Users, available: false },
  { label: "Calendar", href: "/app/calendar", icon: CalendarDays, available: true },
  { label: "Programs", href: "/app/programs", icon: ListChecks, available: false },
  { label: "Workouts", href: "/app/workouts", icon: Dumbbell, available: false },
  { label: "Check-ins", href: "/app/check-ins", icon: ClipboardCheck, available: false },
  { label: "Progress", href: "/app/progress", icon: TrendingUp, available: false },
  { label: "Settings", href: "/app/settings", icon: Settings, available: true },
];

/** Mobile bottom nav: Home · Leads · Clients · Calendar · More (§6). */
export const TRAINER_BOTTOM_NAV: readonly NavItem[] = [
  { ...navItem(TRAINER_NAV, "/app/dashboard"), label: "Home", icon: Home },
  navItem(TRAINER_NAV, "/app/leads"),
  navItem(TRAINER_NAV, "/app/clients"),
  navItem(TRAINER_NAV, "/app/calendar"),
];

/** Behind "More" on mobile: Programs, Workouts, Check-ins, Progress, Settings, Send feedback, Help. */
export const TRAINER_MORE_NAV: readonly NavItem[] = [
  navItem(TRAINER_NAV, "/app/programs"),
  navItem(TRAINER_NAV, "/app/workouts"),
  navItem(TRAINER_NAV, "/app/check-ins"),
  navItem(TRAINER_NAV, "/app/progress"),
  navItem(TRAINER_NAV, "/app/settings"),
  // Feedback and the beta FAQ arrive in step 5.3.
  { label: "Send feedback", href: "/app/feedback", icon: MessageSquareText, available: false },
  { label: "Help", href: "/beta", icon: HeartPulse, available: false },
];

export const MORE_ICON = MoreHorizontal;

/** Client portal bottom nav: Home · Workouts · Progress · Check-in · More (§6). Screens arrive in phase 4. */
export const CLIENT_NAV: readonly NavItem[] = [
  { label: "Home", href: "/client/home", icon: Home, available: false },
  { label: "Workouts", href: "/client/workouts", icon: Dumbbell, available: false },
  { label: "Progress", href: "/client/progress", icon: TrendingUp, available: false },
  { label: "Check-in", href: "/client/check-in", icon: ClipboardCheck, available: false },
];

/** Platform owner nav — §16.0 MVP items only. Screens arrive in step 6.1. */
export const PLATFORM_NAV: readonly NavItem[] = [
  { label: "Overview", href: "/platform", icon: LayoutDashboard, available: true },
  { label: "Trainers", href: "/platform/trainers", icon: Users, available: false },
  { label: "Feedback", href: "/platform/feedback", icon: MessageSquareText, available: false },
  { label: "System Health", href: "/platform/health", icon: Activity, available: false },
  { label: "Audit Logs", href: "/platform/audit-logs", icon: FileClock, available: false },
  { label: "Settings", href: "/platform/settings", icon: ShieldCheck, available: false },
];

function navItem(items: readonly NavItem[], href: string): NavItem {
  const item = items.find((candidate) => candidate.href === href);
  if (!item) throw new Error(`Unknown nav item ${href}`);
  return item;
}

export function isActive(pathname: string, href: string): boolean {
  if (href === "/platform") return pathname === "/platform";
  return pathname === href || pathname.startsWith(`${href}/`);
}
