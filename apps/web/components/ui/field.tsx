import { type ReactElement, cloneElement, isValidElement, type ReactNode, useId } from "react";
import { cn } from "@/lib/utils";

interface FieldProps {
  label: ReactNode;
  /** The control. It receives `id`, `aria-invalid` and `aria-describedby` automatically. */
  children: ReactElement<{
    id?: string;
    "aria-invalid"?: boolean;
    "aria-describedby"?: string;
    "aria-required"?: boolean;
  }>;
  error?: string;
  hint?: ReactNode;
  required?: boolean;
  className?: string;
}

/**
 * Label + control + hint + error, wired for screen readers: the error is linked via
 * aria-describedby (§7.4) and announced when it appears.
 */
export function Field({ label, children, error, hint, required, className }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
        {required ? (
          <span className="text-danger" aria-hidden="true">
            {" "}
            *
          </span>
        ) : null}
      </label>
      {isValidElement(children)
        ? cloneElement(children, {
            id,
            "aria-invalid": error ? true : undefined,
            "aria-describedby": describedBy,
            // The visual asterisk is aria-hidden; this is how assistive tech learns the field is required.
            "aria-required": required || undefined,
          })
        : children}
      {hint ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
