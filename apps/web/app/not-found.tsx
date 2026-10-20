import Link from "next/link";
import { EmptyState } from "@/components/shared/status";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-lg px-4 py-16">
      <EmptyState
        title="Page not found"
        description="The page you're looking for doesn't exist or has moved."
        action={
          <Button asChild variant="outline">
            <Link href="/">Go home</Link>
          </Button>
        }
      />
    </main>
  );
}
