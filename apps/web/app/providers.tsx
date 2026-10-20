"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { Toaster } from "sonner";
import { OfflineBanner } from "@/components/shared/offline-banner";

/** Client-side providers: TanStack Query for mutations (PROMPT D9), toasts and the offline banner. */
export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          // Mutations need connectivity (D15): never queue or retry writes silently.
          mutations: { retry: false, networkMode: "always" },
          queries: { retry: 1, refetchOnWindowFocus: false },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <OfflineBanner />
      {children}
      <Toaster position="top-center" richColors closeButton />
    </QueryClientProvider>
  );
}
