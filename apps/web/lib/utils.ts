import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merges Tailwind class lists; later classes win (used by shadcn/ui components). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
