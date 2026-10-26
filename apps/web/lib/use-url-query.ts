"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useTransition } from "react";

/**
 * Updates list filters kept in the URL (`?q=&goal=…`). Each change starts from the newest URL —
 * the one still being navigated to if there is one — never the render-time params, so a debounced
 * search or two quick filter changes can't undo each other.
 */
export function useUrlQuery({ clearValues = [] }: { clearValues?: readonly string[] } = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const inFlight = useRef<string | null>(null);

  useEffect(() => {
    if (inFlight.current === params.toString()) inFlight.current = null;
  }, [params]);

  function update(changes: Record<string, string | null>) {
    const next = new URLSearchParams(inFlight.current ?? window.location.search);
    for (const [name, value] of Object.entries(changes)) {
      if (value === null || value === "" || clearValues.includes(value)) next.delete(name);
      else next.set(name, value);
    }
    const query = next.toString();
    inFlight.current = query;
    startTransition(() =>
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false }),
    );
  }

  return { params, update, pending };
}
