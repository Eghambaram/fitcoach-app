import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/** Numbered progress for multi-step forms (signup, onboarding). The current step is announced. */
export function Stepper({ steps, current }: { steps: readonly string[]; current: number }) {
  return (
    <ol className="flex items-start" aria-label="Progress">
      {steps.map((label, index) => {
        const state = index < current ? "done" : index === current ? "current" : "upcoming";
        return (
          <li
            key={label}
            className="flex flex-1 flex-col items-center gap-1.5 text-center last:flex-none"
          >
            <div className="flex w-full items-center">
              <span
                aria-current={state === "current" ? "step" : undefined}
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
                  state === "done" && "bg-lime text-lime-foreground",
                  state === "current" && "bg-charcoal text-white",
                  state === "upcoming" && "border border-border bg-card text-muted-foreground",
                )}
              >
                {state === "done" ? <Check className="size-4" aria-hidden="true" /> : index + 1}
              </span>
              {index < steps.length - 1 ? (
                <span
                  className={cn(
                    "mx-2 h-0.5 flex-1 rounded",
                    index < current ? "bg-lime" : "bg-border",
                  )}
                  aria-hidden="true"
                />
              ) : null}
            </div>
            <span
              className={cn(
                "text-xs",
                state === "upcoming" ? "text-muted-foreground" : "font-medium text-foreground",
              )}
            >
              {label}
              <span className="sr-only">
                {state === "done" ? " (completed)" : state === "current" ? " (current step)" : ""}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
