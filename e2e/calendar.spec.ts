import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { createVerifiedTrainer, randomIp, WEB_HEADERS } from "./support";

/**
 * Step 2.6 "Done when": book a trial, create a Mon/Wed/Fri series for 8 weeks for a client, see a
 * conflict when double-booking, and mark attendance.
 */

test.use({ timezoneId: "Asia/Kolkata" });

test.beforeEach(async ({ context }) => {
  await context.setExtraHTTPHeaders({ "x-forwarded-for": randomIp() });
});

const ZONE = "Asia/Kolkata";
function day(offset: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: ZONE }).format(
    new Date(Date.now() + offset * 86_400_000),
  );
}
function nextMonday(): string {
  for (let offset = 7; offset < 14; offset++) {
    if (new Date(`${day(offset)}T00:00:00Z`).getUTCDay() === 1) return day(offset);
  }
  throw new Error("unreachable");
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel(/^Password/).fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/app\/dashboard$/);
}

/** Calls the API as the signed-in trainer, through the web origin. */
async function api(page: Page, path: string, data: object) {
  const response = await page.request.post(`/api${path}`, { headers: WEB_HEADERS, data });
  expect(response.ok(), await response.text()).toBe(true);
  return response.json();
}

test("a trainer books a trial, creates a weekly series, hits a conflict and marks attendance", async ({
  page,
  playwright,
  request,
}) => {
  test.slow();
  const apiContext = await playwright.request.newContext({ extraHTTPHeaders: WEB_HEADERS });
  const trainer = await createVerifiedTrainer(apiContext, request);
  await apiContext.dispose();
  await signIn(page, trainer.email, trainer.password);

  // A client, and a session yesterday that still needs attendance.
  const { clientId } = await api(page, "/v1/onboarding/finalize", {
    fullName: "Asha Rao",
    primaryGoal: "build_muscle",
    trainingMode: "in_person",
    consentDataProcessing: true,
    units: { weightUnit: "kg", lengthUnit: "cm" },
  });
  await api(page, "/v1/appointments", {
    clientId,
    kind: "session",
    date: day(-1),
    startTime: "09:00",
    durationMin: 60,
  });

  // Book a trial from the lead drawer (Book Trial Session board).
  await page.goto("/app/leads");
  await page.getByRole("button", { name: "Add lead" }).first().click();
  const add = page.getByRole("dialog", { name: "Add lead" });
  await add.getByRole("textbox", { name: "Full name" }).fill("Ravi Kumar");
  await add.getByRole("textbox", { name: "Phone" }).fill(`92${String(Date.now()).slice(-8)}`);
  await add.getByRole("combobox", { name: "Main goal" }).selectOption("lose_weight");
  await add.getByRole("combobox", { name: "How did they hear about you?" }).selectOption("walk_in");
  await add.getByRole("button", { name: "Create lead" }).click();
  const lead = page.getByRole("dialog", { name: "Ravi Kumar" });
  await lead.getByRole("button", { name: "Book trial" }).click();
  const trial = page.getByRole("dialog", { name: "Book trial session" });
  await trial.getByLabel("Start time").fill("18:00");
  await trial.getByRole("radio", { name: /Online/ }).check();
  await trial
    .getByRole("textbox", { name: "Meeting link (optional)" })
    .fill("https://meet.example.test/ravi");
  await trial.getByRole("button", { name: "Book trial session" }).click();
  await expect(page.getByText("Trial booked.")).toBeVisible();
  await expect(lead.getByRole("combobox", { name: "Stage" })).toHaveValue("trial_booked");
  await expect(lead.getByRole("link", { name: /Trial · .*6:00 pm/ })).toBeVisible();
  await page.keyboard.press("Escape");

  // The calendar asks for yesterday's attendance.
  await page.goto("/app/calendar");
  await expect(page.getByText("1 past session needs attendance")).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole("button", { name: "Mark Asha Rao attended" }).click();
  await expect(page.getByText("1 past session needs attendance")).toHaveCount(0);

  // Mon/Wed/Fri at 7:00 for 8 weeks = 24 sessions.
  const monday = nextMonday();
  await page.getByRole("button", { name: "Recurring series" }).click();
  const series = page.getByRole("dialog", { name: "Recurring series" });
  await series.getByRole("combobox", { name: "Client" }).selectOption({ label: "Asha Rao" });
  for (const weekday of ["Mon", "Wed", "Fri"])
    await series.getByText(weekday, { exact: true }).click();
  await series.getByLabel("Start time").fill("07:00");
  await series.getByLabel("First day").fill(monday);
  await series.getByRole("spinbutton", { name: "Number of sessions" }).fill("24");
  await series.getByRole("button", { name: "Check dates" }).click();
  await expect(series.getByRole("heading", { name: "24 sessions" })).toBeVisible();
  await series.getByRole("button", { name: "Create 24 sessions" }).click();
  await expect(page.getByText("24 sessions booked.")).toBeVisible();

  // Double-booking the first one is refused, naming what's already there.
  await page.getByRole("button", { name: "Book session" }).click();
  const book = page.getByRole("dialog", { name: "Book a session" });
  await book.getByRole("combobox", { name: "Client" }).selectOption({ label: "Asha Rao" });
  await book.getByLabel("Date").fill(monday);
  await book.getByLabel("Start time").fill("07:30");
  await book.getByRole("button", { name: "Book session" }).click();
  await expect(book.getByText("You already have Asha Rao — Session at 7:00 AM.")).toBeVisible();
  await page.keyboard.press("Escape");

  // The series shows on the agenda; an occurrence opens with its details.
  await page.goto(`/app/calendar?view=agenda&date=${monday}`);
  await page
    .getByRole("button", { name: /7:00 am\s*Asha Rao/ })
    .first()
    .click();
  const drawer = page.getByRole("dialog", { name: "Asha Rao" });
  await expect(drawer.getByText("Part of a recurring series", { exact: true })).toBeVisible();
  await expect(drawer.getByText("Attendance can be marked once the session starts.")).toBeVisible();
});
