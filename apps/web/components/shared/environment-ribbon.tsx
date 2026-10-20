/**
 * Thin ribbon on every page outside production and local development, so nobody mistakes staging
 * for the real app (PROMPT §17.3, NEXT_PUBLIC_APP_ENV). The value is inlined at build time.
 */
export function EnvironmentRibbon({
  appEnv = process.env.NEXT_PUBLIC_APP_ENV,
}: {
  appEnv?: string;
}) {
  if (appEnv !== "staging") return null;
  return (
    <div
      role="note"
      className="bg-warning-soft px-4 py-1 text-center text-xs font-semibold text-warning"
    >
      Staging environment — test data only
    </div>
  );
}
