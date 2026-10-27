import type { ClientHomeResponse, ClientMeResponse } from "@fitcoach/shared";
import { CalendarDays, Dumbbell, Flame, Ticket } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { dayLabel, timeLabel } from "../calendar/dates";
import {
  ContactTrainerButtons,
  packageLine,
  TrainerAvatar,
  workoutAction,
  WorkoutStatusPill,
} from "./client-display";

const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function Tile({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof Ticket;
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <Card className="flex flex-col gap-1 p-4">
      <span className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="size-4" aria-hidden="true" />
        {label}
      </span>
      <span className="text-xl font-semibold">{value}</span>
      {detail ? <span className="text-xs text-muted-foreground">{detail}</span> : null}
    </Card>
  );
}

/** Client home (PROMPT §9, client board 2): this week, today's workout, sessions left, next session. */
export function ClientHome({ me, home }: { me: ClientMeResponse; home: ClientHomeResponse }) {
  const canLog = me.features.workoutSelfLogging;
  const today = home.todayWorkout;
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Hi {me.client.firstName}</h1>
        <p className="text-sm text-muted-foreground">{dayLabel(home.today, "long")}</p>
      </div>

      <ol aria-label="This week" className="grid grid-cols-7 gap-1">
        {home.week.map((day, index) => {
          const isToday = day.date === home.today;
          const planned = day.workouts.length + day.sessions;
          const done =
            day.workouts.length > 0 && day.workouts.every((w) => w.status === "completed");
          return (
            <li
              key={day.date}
              aria-current={isToday ? "date" : undefined}
              className={cn(
                "flex flex-col items-center gap-1 rounded-control py-2 text-xs",
                isToday ? "bg-lime text-lime-foreground" : "bg-card",
              )}
            >
              <span>{WEEKDAY_SHORT[index]}</span>
              <span className="text-base font-semibold">{Number(day.date.slice(8))}</span>
              <span className="sr-only">
                {planned === 0
                  ? "nothing planned"
                  : `${day.workouts.length} workout${day.workouts.length === 1 ? "" : "s"}, ${day.sessions} session${day.sessions === 1 ? "" : "s"}${done ? ", done" : ""}`}
              </span>
              <span aria-hidden="true" className="h-1.5">
                {planned > 0 ? (
                  <span
                    className={cn(
                      "block size-1.5 rounded-full",
                      done ? "bg-success" : isToday ? "bg-charcoal" : "bg-muted-foreground",
                    )}
                  />
                ) : null}
              </span>
            </li>
          );
        })}
      </ol>

      <Card className="flex flex-col gap-3 p-5">
        <h2 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Dumbbell className="size-4" aria-hidden="true" />
          Today&apos;s workout
        </h2>
        {today ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-lg font-semibold">{today.name}</p>
              {today.status !== "planned" ? <WorkoutStatusPill status={today.status} /> : null}
            </div>
            {home.programName ? (
              <p className="text-sm text-muted-foreground">{home.programName}</p>
            ) : null}
            <Button asChild className="self-start">
              <Link href={`/client/workouts/${today.id}`}>
                {workoutAction(today, canLog, home.today)} workout
              </Link>
            </Button>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            {home.programName
              ? "Rest day: no workout planned for today."
              : `${me.trainer.displayName} hasn't assigned you a program yet.`}
          </p>
        )}
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Tile
          icon={Ticket}
          label="Sessions left"
          value={
            home.package
              ? home.package.sessionsLeft !== null
                ? String(home.package.sessionsLeft)
                : "Active"
              : "—"
          }
          detail={home.package ? packageLine(home.package, home.today) : "No active package"}
        />
        <Tile
          icon={Flame}
          label="Streak"
          value={`${home.streakWeeks} week${home.streakWeeks === 1 ? "" : "s"}`}
          detail="Weeks with every planned workout done"
        />
      </div>

      <Card className="flex flex-col gap-2 p-5">
        <h2 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <CalendarDays className="size-4" aria-hidden="true" />
          Next session
        </h2>
        {home.nextSession ? (
          <>
            <p className="font-semibold">
              {dayLabel(home.nextSession.date, "long")} · {timeLabel(home.nextSession.startTime)}
            </p>
            <Link href="/client/schedule" className="w-fit text-sm underline underline-offset-2">
              See your schedule
            </Link>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">No session booked.</p>
        )}
      </Card>

      <Card className="flex flex-col gap-3 p-5">
        <div className="flex items-center gap-3">
          <TrainerAvatar name={me.trainer.displayName} url={me.trainer.avatarUrl} />
          <div>
            <p className="text-sm text-muted-foreground">Contact your trainer</p>
            <p className="font-semibold">{me.trainer.displayName}</p>
          </div>
        </div>
        <ContactTrainerButtons phone={me.trainer.phoneE164} name={me.trainer.displayName} />
      </Card>
    </div>
  );
}
