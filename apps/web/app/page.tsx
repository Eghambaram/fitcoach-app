import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";

/**
 * Temporary home page while the foundation is built. The public landing page (PROMPT §6, board 01)
 * replaces it in step 5.3. No product claims or numbers here (§7.3).
 */
export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-6 px-4 py-12">
      <Logo />
      <h1 className="text-3xl font-bold tracking-tight text-charcoal">Personal Trainer Copilot</h1>
      <p className="text-base text-muted-foreground">
        Spend less time managing your coaching business and more time helping clients get results.
      </p>
      <p className="rounded-control border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
        The app is being built for a closed beta. Sign-up opens to invited trainers only.
      </p>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button asChild size="lg">
          <Link href="/signup">Sign up with an invite code</Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href="/login">Log in</Link>
        </Button>
      </div>
    </main>
  );
}
