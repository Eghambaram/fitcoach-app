import type { ClientMeResponse } from "@fitcoach/shared";
import { Card } from "@/components/ui/card";

/**
 * Client home (PROMPT §9). Step 4.1 shows who they're connected with; the week strip, today's
 * workout, sessions left and shared metrics arrive with step 4.2.
 */
export function ClientHome({ me }: { me: ClientMeResponse }) {
  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold tracking-tight">Hi {me.client.firstName}</h1>
      <Card className="flex items-center gap-4 p-5">
        {me.trainer.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- public-bucket photo, already resized by the API
          <img
            src={me.trainer.avatarUrl}
            alt=""
            width={48}
            height={48}
            className="size-12 rounded-full object-cover"
          />
        ) : (
          <span
            aria-hidden="true"
            className="flex size-12 items-center justify-center rounded-full bg-lime font-bold text-lime-foreground"
          >
            {me.trainer.displayName.slice(0, 1).toUpperCase()}
          </span>
        )}
        <div>
          <p className="text-sm text-muted-foreground">Your trainer</p>
          <p className="font-semibold">{me.trainer.displayName}</p>
          <p className="text-sm text-muted-foreground">{me.workspace.name}</p>
        </div>
      </Card>
      <p className="text-sm text-muted-foreground">
        You&apos;re signed in. {me.trainer.displayName} will share your workouts, sessions and
        progress with you here.
      </p>
    </div>
  );
}
