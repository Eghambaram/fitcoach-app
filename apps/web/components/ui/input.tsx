import type { ComponentProps, InputHTMLAttributes, SelectHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const controlStyles =
  "h-11 w-full rounded-control border border-border bg-card px-3.5 text-sm text-foreground placeholder:text-muted-foreground transition-colors focus-visible:border-charcoal disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-danger";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(controlStyles, className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(controlStyles, "h-auto min-h-24 py-3 leading-relaxed", className)}
      {...props}
    />
  );
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(controlStyles, "appearance-auto pr-8", className)} {...props}>
      {children}
    </select>
  );
}

/** Native checkbox, styled — keeps keyboard and form behaviour for free. */
export function Checkbox({
  className,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  return (
    <input
      type="checkbox"
      className={cn("size-5 shrink-0 rounded-md border-border accent-charcoal", className)}
      {...props}
    />
  );
}
