import type { Metadata } from "next";
import { CheckInsInbox } from "@/features/check-ins/check-ins-inbox";

export const metadata: Metadata = { title: "Check-ins" };

/** Check-in inbox (PROMPT §8.7). */
export default function CheckInsPage() {
  return <CheckInsInbox />;
}
