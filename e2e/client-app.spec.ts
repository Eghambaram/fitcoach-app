import AxeBuilder from "@axe-core/playwright";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { createVerifiedTrainer, randomIp, WEB_HEADERS } from "./support";

/**
 * Step 4.2 "Done when": the client sees only their own workouts, schedule and sessions left — no
 * prices, notes or other clients.
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

async function phone(browser: Browser) {
  const context = await browser.newContext({
    extraHTTPHeaders: { "x-forwarded-for": randomIp() },
    timezoneId: ZONE,
  });
  return { context, page: await context.newPage() };
}

test("a client sees their own workouts, schedule and sessions left, and logs a workout when allowed", async ({
  page,
  browser,
  playwright,
  request,
}) => {
  test.slow();
  const apiContext = await playwright.request.newContext({ extraHTTPHeaders: WEB_HEADERS });
  const trainer = await createVerifiedTrainer(apiContext, request);
  await apiContext.dispose();
  await signIn(page, trainer.email, trainer.password);

  // Trainer setup: client, 12-session pack (with a price), a session with a private note, a program.
  const { clientId } = await api(page, "/v1/onboarding/finalize", {
    fullName: "Asha Rao",
    phone: `97${String(Date.now()).slice(-8)}`,
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
      pricePaise: 1_234_500,
      amountDuePaise: 1_234_500,
      paymentDueOn: null,
    },
    { "Idempotency-Key": crypto.randomUUID() },
  );
  const appointment = await api(page, "/v1/appointments", {
    clientId,
    kind: "session",
    date: day(1),
    startTime: clock(0),
    durationMin: 60,
    location: "Studio 2",
  });
  const note = await page.request.put(`/api/v1/appointments/${appointment.id}/notes`, {
    headers: WEB_HEADERS,
    data: { notes: "Private: knee history" },
  });
  expect(note.ok()).toBe(true);
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

  // Trainer: invite, and let her log her own workouts.
  await page.goto(`/app/clients/${clientId}`);
  const card = page.getByRole("region", { name: "Client app" });
  const selfLogging = card.getByRole("checkbox", { name: /Let Asha log their own workouts/ });
  // The box flips once the server has saved it.
  await selfLogging.click();
  await expect(selfLogging).toBeChecked();
  await expect(page.getByText("They can now log their own workouts.")).toBeVisible();
  const invite = await api(page, `/v1/clients/${clientId}/portal/invite`, { channel: "whatsapp" });

  // Client: lands on home.
  const client = await phone(browser);
  await client.page.goto(invite.link);
  await client.page.getByRole("checkbox").check();
  await client.page.getByRole("button", { name: "Continue" }).click();
  await expect(client.page.getByRole("heading", { name: "Hi Asha" })).toBeVisible();
  await expect(client.page.getByText("Full Body A")).toBeVisible();
  await expect(client.page.getByText(/12 of 12 sessions left/)).toBeVisible();
  await expect(client.page.getByText(/12,345|1234500|knee history/)).toHaveCount(0);
  expect((await new AxeBuilder({ page: client.page }).analyze()).violations).toEqual([]);

  // Schedule: the session, never the trainer's note.
  await client.page.getByRole("link", { name: "Schedule" }).first().click();
  await expect(client.page.getByRole("heading", { name: "My schedule" })).toBeVisible();
  await expect(client.page.getByText(/Studio 2/)).toBeVisible();
  await expect(client.page.getByText(/knee history/)).toHaveCount(0);

  // Workouts → today's workout → log a set → finish.
  await client.page.getByRole("link", { name: "Workouts" }).first().click();
  await client.page.getByRole("link", { name: /Full Body A.*Start/ }).click();
  await expect(client.page.getByRole("tab", { name: "Overview" })).toBeVisible();
  await expect(client.page.getByText("Muscle groups")).toBeVisible();
  expect((await new AxeBuilder({ page: client.page }).analyze()).violations).toEqual([]);
  await client.page.getByRole("button", { name: "Start workout" }).click();
  await client.page.getByRole("spinbutton", { name: "Reps" }).fill("10");
  await client.page.getByRole("button", { name: "Complete set 1" }).click();
  await expect(
    client.page.getByRole("list", { name: "Sets" }).getByRole("button", { name: /Set 1.*Done/ }),
  ).toBeVisible();
  await expect(client.page.getByRole("button", { name: "Swap" })).toHaveCount(0);
  await expect(client.page.getByRole("button", { name: "Skip workout" })).toHaveCount(0);
  await client.page.getByRole("button", { name: "Finish workout" }).click();
  const finish = client.page.getByRole("dialog", { name: "Finish workout?" });
  await finish.getByRole("textbox", { name: /How did it go/ }).fill("Felt good");
  await finish.getByRole("button", { name: "Finish workout" }).click();
  await expect(client.page.getByRole("heading", { name: "Workout summary" })).toBeVisible();
  await expect(client.page.getByText("Felt good")).toBeVisible();

  // Profile: goals read-only, units editable.
  await client.page.getByRole("link", { name: "More" }).first().click();
  await client.page.getByRole("link", { name: "Profile & settings" }).click();
  await expect(client.page.getByText("Build muscle")).toBeVisible();
  await client.page.getByRole("combobox", { name: "Weight" }).selectOption("lb");
  await client.page.getByRole("button", { name: "Save settings" }).click();
  await expect(client.page.getByText("Settings saved.")).toBeVisible();

  // The trainer sees what she logged.
  await page.goto(`/app/clients/${clientId}?tab=workouts`);
  await page
    .getByRole("link", { name: /Full Body A.*View/ })
    .first()
    .click();
  await expect(page.getByText("Client's feedback:")).toBeVisible();
  await expect(page.getByText("Felt good")).toBeVisible();

  await client.context.close();
});
