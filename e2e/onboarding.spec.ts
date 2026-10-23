import AxeBuilder from "@axe-core/playwright";
import {
  type APIRequestContext,
  expect,
  type Page,
  type PlaywrightWorkerArgs,
  test,
} from "@playwright/test";
import { createVerifiedTrainer, randomIp, WEB_HEADERS } from "./support";

/**
 * Step 2.5 "Done when": start a client, leave halfway, come back to the draft, and create the client
 * with only the required fields. Also: a converted lead's onboarding with baseline measurements.
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

async function newTrainer(
  page: Page,
  playwright: PlaywrightWorkerArgs["playwright"],
  request: APIRequestContext,
) {
  const api = await playwright.request.newContext({ extraHTTPHeaders: WEB_HEADERS });
  const trainer = await createVerifiedTrainer(api, request);
  await api.dispose();
  await signIn(page, trainer.email, trainer.password);
}

test("a trainer starts a client, leaves halfway, resumes the draft and creates them with only the required fields", async ({
  page,
  playwright,
  request,
}) => {
  test.slow();
  await newTrainer(page, playwright, request);

  // From the dashboard.
  await page.getByRole("link", { name: "Add client" }).click();
  await expect(page).toHaveURL(/\/app\/clients\/new$/);
  await expect(page.getByRole("heading", { name: "Basic information" })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  // Next checks the step.
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByText("Enter a name")).toBeVisible();

  await page.getByRole("textbox", { name: "Full name" }).fill("Asha Rao");
  await page.getByRole("radio", { name: "WhatsApp" }).check();
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByRole("heading", { name: "Goals & training" })).toBeVisible();
  await expect(page).toHaveURL(/\?draft=/);
  await page.getByRole("radio", { name: /Hybrid/ }).check();
  await page.getByRole("button", { name: "Save as draft" }).click();
  await expect(page.getByText("Draft saved.")).toBeVisible();

  // Leave, then come back through the drafts list.
  await page.goto("/app/dashboard");
  await page.getByRole("link", { name: "Add client" }).click();
  await expect(page.getByText("Drafts in progress")).toBeVisible();
  await expect(page.getByText("Step 2 of 4: Goals & training")).toBeVisible();
  await page.getByRole("link", { name: "Continue Asha Rao" }).click();
  await expect(page.getByRole("heading", { name: "Goals & training" })).toBeVisible();
  await expect(page.getByRole("radio", { name: /Hybrid/ })).toBeChecked();

  await page.getByRole("radio", { name: "Build muscle" }).check();
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByRole("heading", { name: "Baseline & consent" })).toBeVisible();
  // Consent is the only required thing here.
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByText("The client's consent to data processing is required")).toBeVisible();
  await page.getByRole("checkbox", { name: /I have the client's consent/ }).check();
  await page.getByRole("button", { name: "Next" }).click();

  await expect(page.getByRole("heading", { name: "Review & create" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Package (optional)" })).toBeDisabled();
  await page.getByRole("button", { name: "Create client" }).click();
  await expect(page.getByText("Asha Rao is now an active client")).toBeVisible();
  await expect(page.getByRole("button", { name: /Invite Asha via WhatsApp/ })).toBeDisabled();

  // The draft is gone from the list.
  await page.getByRole("link", { name: "Add another client" }).click();
  await expect(page.getByRole("heading", { name: "Basic information" })).toBeVisible();
  await expect(page.getByText("Drafts in progress")).toHaveCount(0);
});

test("a converted lead is onboarded with baseline measurements", async ({
  page,
  playwright,
  request,
}) => {
  test.slow();
  await newTrainer(page, playwright, request);

  await page.goto("/app/leads");
  await page.getByRole("button", { name: "Add lead" }).first().click();
  const add = page.getByRole("dialog", { name: "Add lead" });
  await add.getByRole("textbox", { name: "Full name" }).fill("Kiran Rao");
  await add.getByRole("textbox", { name: "Phone" }).fill(`96${String(Date.now()).slice(-8)}`);
  await add.getByRole("combobox", { name: "Main goal" }).selectOption("lose_weight");
  await add
    .getByRole("combobox", { name: "How did they hear about you?" })
    .selectOption("referral");
  await add.getByRole("radio", { name: "Online" }).check();
  await add.getByRole("button", { name: "Create lead" }).click();
  await page
    .getByRole("dialog", { name: "Kiran Rao" })
    .getByRole("button", { name: "Convert to client" })
    .click();
  await page
    .getByRole("dialog", { name: "Convert to client" })
    .getByRole("button", { name: "Convert & Continue" })
    .click();

  // Prefilled from the lead: step 1 and 2 already satisfied.
  await expect(page.getByRole("textbox", { name: "Full name" })).toHaveValue("Kiran Rao");
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByRole("radio", { name: /Online/ })).toBeChecked();
  await expect(page.getByRole("radio", { name: "Lose weight" })).toBeChecked();
  await page.getByRole("button", { name: "Next" }).click();

  await page.getByRole("textbox", { name: "Weight (kg)" }).fill("72.5");
  await page.getByRole("textbox", { name: "Height (cm)" }).fill("abc");
  await page.getByRole("checkbox", { name: /I have the client's consent/ }).check();
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByText("Enter a number")).toBeVisible();
  await page.getByRole("textbox", { name: "Height (cm)" }).fill("170");
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByText("Weight 72.5 kg · Height 170 cm")).toBeVisible();
  await page.getByRole("button", { name: "Create client" }).click();
  await expect(page.getByText("Kiran Rao is now an active client")).toBeVisible();
  await expect(page.getByText("with 2 baseline measurements")).toBeVisible();

  // The lead's onboarding link now says it's done.
  await page.goto("/app/leads?stage=converted");
  await page.getByRole("button", { name: "Kiran Rao" }).first().click();
  await page
    .getByRole("dialog", { name: "Kiran Rao" })
    .getByRole("link", { name: "Client onboarding" })
    .click();
  await expect(page.getByText("Kiran Rao is already onboarded")).toBeVisible();
});
