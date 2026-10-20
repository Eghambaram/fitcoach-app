"use client";

import { ErrorState } from "@/components/shared/status";
import { Button } from "@/components/ui/button";

/** Error boundary for trainer pages: never shows stack traces (PROMPT §4.3). */
export default function TrainerError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorState
      requestId={error.digest}
      action={
        <Button variant="outline" onClick={reset}>
          Try again
        </Button>
      }
    />
  );
}
