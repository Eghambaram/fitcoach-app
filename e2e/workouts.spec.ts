import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { createVerifiedTrainer, randomIp, WEB_HEADERS } from "./support";

/**
 * Step 3.5 "Done when": log a full workout, refresh mid-way without losing sets, and the session
 * counts against the package once.
 */

const ZONE = "Asia/Kolkata";
test.use({ timezoneId: ZONE });

test.beforeEach(async ({ context }) => {
  await context.setExtraHTTPHeaders({ "x-forwarded-for": randomIp() });
});

const day = (offset = 0) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: ZONE }).format(
    new Date(Date.now() + offset * 86_400_000),
  );
const isoWeekday = (date: string) => {
  const value = new Date(`${date}T00:00:00Z`).getUTCDay();
  return value === 0 ? 7 : value;
};
const clock = (minutesFromNow: number) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(Date.now() + minutesFromNow * 60_000));

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel(/^Password/).fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/app\/dashboard$/);
}

async function api(page: Page, path: string, data: object, headers: Record<string, string> = {}) {
  const response = await page.request.post(`/api${path}`, {
    headers: { ...WEB_HEADERS, ...headers },
    data,
  });
  expect(response.ok(), await response.text()).toBe(true);
  return response.json();
}

test("a trainer logs a workout set by set, survives a refresh, finishes and marks attended once", async ({
  page,
  playwright,
  request,
}) => {
  test.slow();
  const apiContext = await playwright.request.newContext({ extraHTTPHeaders: WEB_HEADERS });
  const trainer = await createVerifiedTrainer(apiContext, request);
  await apiContext.dispose();
  await signIn(page, trainer.email, trainer.password);

  // Setup through the API: a client with a 12-session pack, a session now, and a program whose
  // first workout is today.
  const { clientId } = await api(page, "/v1/onboarding/finalize", {
    fullName: "Asha Rao",
    primaryGoal: "build_muscle",
    trainingMode: "in_person",
    consentDataProcessing: true,
    units: { weightUnit: "kg", lengthUnit: "cm" },
  });
  await api(
    page,
    `/v1/clients/${clientId}/packages`,
    {
      name: "12 sessions",
      kind: "session_pack",
      sessionsIncluded: 12,
      sessionsPerWeek: null,
      startsOn: day(-1),
      expiresOn: day(60),
      pricePaise: 1_200_000,
      amountDuePaise: 0,
      paymentDueOn: null,
    },
    { "Idempotency-Key": crypto.randomUUID() },
  );
  await api(page, "/v1/appointments", {
    clientId,
    kind: "session",
    date: day(0),
    startTime: clock(-2),
    durationMin: 60,
  });
  const templates = await (await page.request.get("/api/v1/programs/templates")).json();
  const template = templates.templates.find(
    (t: { name: string }) => t.name === "Beginner Full Body 3×/week",
  );
  const program = await api(page, "/v1/programs", { fromProgramId: template.id });
  const today = isoWeekday(day(0));
  const others = [1, 2, 3, 4, 5, 6, 7].filter((value) => value !== today);
  await api(
    page,
    `/v1/programs/${program.id}/assign`,
    {
      clientId,
      startsOn: day(0),
      schedule: program.workouts.map((_: unknown, workoutIndex: number) => ({
        workoutIndex,
        weekday: workoutIndex === 0 ? today : others[workoutIndex],
      })),
    },
    { "Idempotency-Key": crypto.randomUUID() },
  );

  // From the client's Workouts tab to today's workout.
  await page.goto(`/app/clients/${clientId}?tab=workouts`);
  await page
    .getByRole("link", { name: /Full Body A.*Open/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/app\/workouts\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: "Full Body A", level: 1 })).toBeVisible();
  await expect(page.getByText("Planned", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Start workout" }).click();
  await expect(page.getByText("In progress", { exact: true })).toBeVisible();
  await expect(page.getByText(/0 of \d+ exercises completed/)).toBeVisible();

  // Set 1 with the steppers.
  const reps = page.getByRole("spinbutton", { name: "Reps" });
  await reps.fill("10");
  await page.getByRole("spinbutton", { name: "Weight" }).fill("12.5");
  await page.getByRole("button", { name: "Increase weight" }).click();
  await page.getByRole("button", { name: "Complete set 1" }).click();
  const sets = page.getByRole("list", { name: "Sets" });
  await expect(sets.getByRole("button", { name: /Set 1.*10 reps × 15 kg.*Done/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Complete set 2" })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  // Refresh mid-way: the set comes back from the API.
  await page.reload();
  await expect(sets.getByRole("button", { name: /Set 1.*10 reps × 15 kg.*Done/ })).toBeVisible();

  // Finish the first exercise, then the workout.
  for (let set = 2; ; set += 1) {
    const complete = page.getByRole("button", { name: `Complete set ${set}` });
    if (!(await complete.isVisible())) break;
    await complete.click();
    await expect(sets.getByRole("button", { name: new RegExp(`Set ${set}.*Done`) })).toBeVisible();
  }
  await expect(page.getByText(/1 of \d+ exercises completed/)).toBeVisible();
  await page.getByRole("button", { name: "Finish workout" }).click();
  const finish = page.getByRole("dialog", { name: "Finish workout?" });
  await finish.getByRole("textbox", { name: /Feedback/ }).fill("Good depth on squats.");
  await finish.getByRole("button", { name: "Finish workout" }).click();
  await expect(page.getByRole("heading", { name: "Workout summary" })).toBeVisible();
  await expect(page.getByText("Completed", { exact: true })).toBeVisible();

  // "Mark attended" uses one package session.
  await page.getByRole("button", { name: "Mark attended" }).click();
  await expect(page.getByText("Session marked attended.")).toBeVisible();
  const packages = await (await page.request.get(`/api/v1/clients/${clientId}/packages`)).json();
  expect(packages.active).toMatchObject({ sessionsUsed: 1, sessionsLeft: 11 });
});
