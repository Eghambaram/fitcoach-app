import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { createVerifiedTrainer, randomIp, WEB_HEADERS } from "./support";

/**
 * Step 2.3 "Done when": a follow-up shows as Today/Overdue, WhatsApp opens with the right prefilled
 * text, and the contact appears in the Activity timeline.
 */

// The browser and the workspace (Asia/Kolkata by default) agree on what "today" is.
test.use({ timezoneId: "Asia/Kolkata" });

test.beforeEach(async ({ context }) => {
  await context.setExtraHTTPHeaders({ "x-forwarded-for": randomIp() });
  // Never leave the test environment: answer wa.me locally.
  await context.route("https://wa.me/**", (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: "<title>WhatsApp</title>" }),
  );
});

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel(/^Password/).fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/app\/dashboard$/);
}

function today(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

test("a trainer schedules a follow-up, messages on WhatsApp, logs contacts and finishes it", async ({
  page,
  playwright,
  request,
}) => {
  test.slow();
  const api = await playwright.request.newContext({ extraHTTPHeaders: WEB_HEADERS });
  const trainer = await createVerifiedTrainer(api, request);
  await api.dispose();
  await signIn(page, trainer.email, trainer.password);

  // A lead to follow up with.
  await page.goto("/app/leads");
  await page.getByRole("button", { name: "Add lead" }).first().click();
  const add = page.getByRole("dialog", { name: "Add lead" });
  await add.getByRole("textbox", { name: "Full name" }).fill("Meena Singh");
  await add.getByRole("textbox", { name: "Phone" }).fill("98123 45678");
  await add.getByRole("combobox", { name: "Main goal" }).selectOption("get_stronger");
  await add.getByRole("combobox", { name: "How did they hear about you?" }).selectOption("walk_in");
  await add.getByRole("button", { name: "Create lead" }).click();
  const lead = page.getByRole("dialog", { name: "Meena Singh" });
  await expect(lead.getByText("No follow-up scheduled.")).toBeVisible();

  // Schedule one for later today: it shows as due today, in the drawer and in the list.
  await lead.getByRole("button", { name: "Schedule", exact: true }).click();
  const schedule = page.getByRole("dialog", { name: "Schedule a follow-up" });
  await schedule.getByRole("combobox", { name: "What to do" }).selectOption("whatsapp");
  await schedule.getByLabel("Date").fill(today());
  await schedule.getByLabel("Time").fill("23:59");
  await schedule.getByRole("button", { name: "Schedule follow-up" }).click();
  await expect(page.getByText("Follow-up scheduled.")).toBeVisible();
  await expect(lead.getByText("Due today")).toBeVisible();
  await expect(lead.getByText(/^Today, 11:59/i)).toBeVisible();
  expect((await new AxeBuilder({ page }).include('[role="dialog"]').analyze()).violations).toEqual(
    [],
  );

  // WhatsApp opens click-to-chat prefilled from the follow_up template; "Not sent" logs nothing.
  const [chat] = await Promise.all([
    page.waitForEvent("popup"),
    lead.getByRole("link", { name: "WhatsApp" }).first().click(),
  ]);
  const url = new URL(chat.url());
  expect(url.hostname).toBe("wa.me");
  expect(url.pathname).toBe("/919812345678");
  expect(url.searchParams.get("text")).toMatch(/^Hi Meena, this is .+ Thanks for your enquiry!/);
  await chat.close();
  const confirm = page.getByRole("alertdialog", { name: "Did you send it?" });
  await confirm.getByRole("button", { name: "Yes, I sent it" }).click();
  await expect(page.getByText("WhatsApp message logged.")).toBeVisible();
  // Logging a contact moves a new lead to Contacted.
  await expect(lead.getByRole("combobox", { name: "Stage" })).toHaveValue("contacted");

  // Log a call by hand.
  await lead.getByRole("button", { name: "Log contact" }).click();
  const log = page.getByRole("dialog", { name: "Log contact" });
  await log.getByRole("combobox", { name: "Channel" }).selectOption("call");
  await log.getByRole("combobox", { name: "Outcome" }).selectOption("no_answer");
  await log.getByRole("textbox", { name: "Note (optional)" }).fill("Try after 6");
  await log.getByRole("button", { name: "Log contact" }).click();
  await expect(page.getByText("Contact logged.")).toBeVisible();

  // Finish the follow-up and book the next one in the same step.
  await lead.getByRole("button", { name: "Done or skip" }).click();
  const finish = page.getByRole("dialog", { name: "Finish follow-up" });
  await finish.getByRole("combobox", { name: "How did it go?" }).selectOption("replied");
  await finish.getByRole("button", { name: "Mark done" }).click();
  await expect(page.getByText("Follow-up done.")).toBeVisible();
  await expect(lead.getByText("Due today")).toHaveCount(0);

  // Everything is on the timeline.
  await lead.getByRole("tab", { name: "Activity" }).click();
  await expect(lead.getByText("WhatsApp: Message sent (from your template)")).toBeVisible();
  await expect(lead.getByText("Call: No answer")).toBeVisible();
  await expect(lead.getByText("Try after 6")).toBeVisible();
  await expect(lead.getByText("Follow-up done: WhatsApp message — They replied")).toBeVisible();
  await expect(lead.getByText(/^Follow-up scheduled: WhatsApp message for/).first()).toBeVisible();
  await page.keyboard.press("Escape");

  // The list shows the next follow-up and filters by it.
  await page.getByRole("combobox", { name: "Follow-up" }).selectOption("next_7_days");
  await expect(page).toHaveURL(/followUp=next_7_days/);
  await expect(page.getByRole("button", { name: "Meena Singh" }).first()).toBeVisible();
  await page.getByRole("combobox", { name: "Follow-up" }).selectOption("overdue");
  await expect(page.getByText("No leads match")).toBeVisible();
});
