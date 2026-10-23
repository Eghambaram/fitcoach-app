import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { createVerifiedTrainer, randomIp, WEB_HEADERS } from "./support";

/**
 * Step 2.4 "Done when": converting a lead twice quickly still gives one client; the lead's history
 * is preserved. Also: an existing client with the same phone is offered for linking.
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

async function addLead(page: Page, name: string, phone: string, duplicate = false) {
  await page.goto("/app/leads");
  await page.getByRole("button", { name: "Add lead" }).first().click();
  const add = page.getByRole("dialog", { name: "Add lead" });
  await add.getByRole("textbox", { name: "Full name" }).fill(name);
  await add.getByRole("textbox", { name: "Phone" }).fill(phone);
  await add.getByRole("combobox", { name: "Main goal" }).selectOption("build_muscle");
  await add
    .getByRole("combobox", { name: "How did they hear about you?" })
    .selectOption("referral");
  if (duplicate) {
    await add.getByRole("textbox", { name: "Email" }).focus();
    await expect(add.getByText("Possible match")).toBeVisible();
    await expect(add.getByText(/Client · Onboarding/)).toBeVisible();
    await add.getByRole("button", { name: "Create anyway" }).click();
  }
  await add.getByRole("button", { name: "Create lead" }).click();
  return page.getByRole("dialog", { name });
}

test("a trainer converts a lead once, keeps its history, and links a repeat enquiry", async ({
  page,
  playwright,
  request,
}) => {
  test.slow();
  const api = await playwright.request.newContext({ extraHTTPHeaders: WEB_HEADERS });
  const trainer = await createVerifiedTrainer(api, request);
  await api.dispose();
  await signIn(page, trainer.email, trainer.password);

  const phone = `98${String(Date.now()).slice(-8)}`;
  const lead = await addLead(page, "Kiran Rao", phone);
  await lead.getByRole("tab", { name: /Notes/ }).click();
  await lead.getByRole("textbox", { name: "Add a note" }).fill("Shoulder rehab first");
  await lead.getByRole("button", { name: "Save note" }).click();
  await expect(lead.getByText("Shoulder rehab first")).toBeVisible();

  // The confirm sheet; the package is visibly not available yet.
  await lead.getByRole("button", { name: "Convert to client" }).click();
  const sheet = page.getByRole("dialog", { name: "Convert to client" });
  await expect(sheet.getByText("Available after packages are set up").first()).toBeVisible();
  await expect(sheet.getByRole("combobox", { name: "Initial package" })).toBeDisabled();
  expect((await new AxeBuilder({ page }).include('[role="dialog"]').analyze()).violations).toEqual(
    [],
  );

  // Double-click: one client.
  await sheet.getByRole("button", { name: "Convert & Continue" }).dblclick();
  await expect(page).toHaveURL(/\/app\/clients\/new\?fromLead=/);
  // Onboarding continues, prefilled from the lead.
  await expect(page.getByRole("heading", { name: "Basic information" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Full name" })).toHaveValue("Kiran Rao");

  // The lead keeps its notes and shows the conversion.
  await page.goto("/app/leads?lead=" + new URL(page.url()).searchParams.get("fromLead"));
  const converted = page.getByRole("dialog", { name: "Kiran Rao" });
  await expect(converted.getByText(/Converted to a client on/)).toBeVisible();
  await expect(converted.getByRole("button", { name: "Convert to client" })).toHaveCount(0);
  await converted.getByRole("tab", { name: "Activity" }).click();
  await expect(converted.getByText("Converted to a client", { exact: true })).toHaveCount(1);
  await converted.getByRole("tab", { name: /Notes/ }).click();
  await expect(converted.getByText("Shoulder rehab first")).toBeVisible();
  await page.keyboard.press("Escape");

  // The same person enquires again: Possible match → link to the existing client.
  const repeat = await addLead(page, "Kiran R", phone, true);
  await repeat.getByRole("button", { name: "Convert to client" }).click();
  const linkSheet = page.getByRole("dialog", { name: "Convert to client" });
  await expect(linkSheet.getByText("Possible match: already a client")).toBeVisible();
  // Exactly one client exists for the double-clicked conversion.
  await expect(linkSheet.getByRole("radio", { name: /Link to Kiran Rao/ })).toHaveCount(1);
  await linkSheet.getByRole("radio", { name: /Link to Kiran Rao/ }).check();
  await linkSheet.getByRole("button", { name: "Link to client" }).click();
  const linked = page.getByRole("dialog", { name: "Kiran R" });
  await expect(linked.getByText(/Converted to a client on/)).toBeVisible();
  await linked.getByRole("tab", { name: "Activity" }).click();
  await expect(linked.getByText("Linked to an existing client")).toBeVisible();
});
