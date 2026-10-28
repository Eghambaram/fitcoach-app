"use client";

import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function RetryButton() {
  return (
    <Button variant="dark" onClick={() => window.location.reload()}>
      <RotateCw className="size-4" aria-hidden="true" />
      Try again
    </Button>
  );
}
