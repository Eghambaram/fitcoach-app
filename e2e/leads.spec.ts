import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { createVerifiedTrainer, randomIp, WEB_HEADERS } from "./support";

/**
 * Step 2.2 "Done when": add, search, filter, edit and change stage of leads on mobile and desktop;
 * a duplicate phone number shows the "Possible match" panel.
 */

test.beforeEach(async ({ context }) => {
  await context.setExtraHTTPHeaders({ "x-forwarded-for": randomIp() });
});

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel(/^Password/).fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/app\/dashboard$/);
}

async function addLead(page: Page, name: string, phone: string) {
  await page.getByRole("button", { name: "Add lead" }).first().click();
  const drawer = page.getByRole("dialog", { name: "Add lead" });
  await drawer.getByRole("textbox", { name: "Full name" }).fill(name);
  await drawer.getByRole("textbox", { name: "Phone" }).fill(phone);
  await drawer.getByRole("combobox", { name: "Main goal" }).selectOption("get_stronger");
  await drawer
    .getByRole("combobox", { name: "How did they hear about you?" })
    .selectOption("walk_in");
  return drawer;
}

test("a trainer adds, finds, edits and moves a lead, and sees a possible duplicate", async ({
  page,
  playwright,
  request,
}) => {
  test.slow();
  const api = await playwright.request.newContext({ extraHTTPHeaders: WEB_HEADERS });
  const trainer = await createVerifiedTrainer(api, request);
  await api.dispose();
  await signIn(page, trainer.email, trainer.password);

  await page.goto("/app/leads");
  await expect(page.getByRole("heading", { name: "Leads", level: 1 })).toBeVisible();
  await expect(page.getByText("No leads yet")).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  // Add: the new lead opens in its drawer.
  const add = await addLead(page, "Meena Singh", "98123 45678");
  await add.getByRole("button", { name: "Create lead" }).click();
  const lead = page.getByRole("dialog", { name: "Meena Singh" });
  await expect(lead.getByText("+919812345678")).toBeVisible();

  // Stage change and a note, both on the record.
  await lead.getByRole("combobox", { name: "Stage" }).selectOption("contacted");
  await expect(page.getByText("Stage changed to Contacted.")).toBeVisible();
  await lead.getByRole("tab", { name: /Notes/ }).click();
  await lead.getByRole("textbox", { name: "Add a note" }).fill("Prefers mornings");
  await lead.getByRole("button", { name: "Save note" }).click();
  await expect(lead.getByText("Prefers mornings")).toBeVisible();
  await lead.getByRole("tab", { name: "Activity" }).click();
  await expect(lead.getByText("Stage changed from New to Contacted")).toBeVisible();

  // Edit inline.
  await lead.getByRole("tab", { name: "Overview" }).click();
  await lead.getByRole("button", { name: "Edit" }).click();
  await lead.getByRole("textbox", { name: "Location" }).fill("Pune");
  await lead.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Lead updated.")).toBeVisible();
  await expect(lead.getByText("Pune")).toBeVisible();
  await page.keyboard.press("Escape");

  // A second lead with the same number (written differently) → Possible match.
  const second = await addLead(page, "Meena S", "+91 98123-45678");
  await second.getByRole("textbox", { name: "Email" }).focus();
  await expect(second.getByText("Possible match")).toBeVisible();
  await second.getByRole("button", { name: "Create anyway" }).click();
  await second.getByRole("button", { name: "Create lead" }).click();
  await expect(page.getByRole("dialog", { name: "Meena S" })).toBeVisible();
  await page.keyboard.press("Escape");

  // Search and stage tabs.
  await page.getByRole("searchbox", { name: /Search by name/ }).fill("Meena S");
  await expect(page).toHaveURL(/q=Meena\+S/);
  await page.getByRole("tab", { name: /Contacted/ }).click();
  await expect(page).toHaveURL(/stage=contacted/);
  await expect(page.getByRole("button", { name: "Meena Singh" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Meena S", exact: true })).toHaveCount(0);
});
