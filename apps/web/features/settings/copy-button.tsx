"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button, type ButtonProps } from "@/components/ui/button";

/** Copies `value` to the clipboard and confirms in place (and to screen readers via the toast). */
export function CopyButton({
  value,
  label = "Copy link",
  ...props
}: { value: string; label?: string } & Omit<ButtonProps, "onClick">) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success("Copied.");
      setTimeout(() => setCopied(false), 2_000);
    } catch {
      toast.error("Couldn't copy. Select the link and copy it instead.");
    }
  }

  return (
    <Button variant="outline" onClick={copy} {...props}>
      {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
      {copied ? "Copied" : label}
    </Button>
  );
}
