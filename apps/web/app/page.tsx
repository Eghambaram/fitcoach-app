/**
 * Temporary home page while the foundation is built. The real public landing page
 * (PROMPT §6, board 01) replaces it in step 5.3. No product claims or numbers here (§7.3).
 */
export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-4 px-4 py-12">
      <p className="text-muted-foreground text-sm font-semibold tracking-widest uppercase">
        FitCoach
      </p>
      <h1 className="text-charcoal text-3xl font-bold tracking-tight">Personal Trainer Copilot</h1>
      <p className="text-muted-foreground text-base">
        Spend less time managing your coaching business and more time helping clients get results.
      </p>
      <p className="rounded-control border-border bg-card text-muted-foreground border px-4 py-3 text-sm">
        The app is being built for a closed beta. Sign-up opens to invited trainers only.
      </p>
    </main>
  );
}
