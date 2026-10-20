export default function Loading() {
  return (
    <div role="status" aria-label="Loading" className="flex flex-col gap-4">
      <div className="h-8 w-56 animate-pulse rounded-control bg-muted" />
      <div className="h-4 w-40 animate-pulse rounded-control bg-muted" />
      <div className="h-48 animate-pulse rounded-card bg-muted" />
    </div>
  );
}
