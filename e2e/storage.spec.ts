import { expect, type Page, test } from "@playwright/test";
import { createVerifiedTrainer, randomIp, WEB_HEADERS } from "./support";

/** Step 1.5 "Done when": upload a profile photo, it's stored as WebP, an over-limit upload is refused clearly. */

// A tiny valid PNG; the API re-encodes whatever it gets.
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

test.beforeEach(async ({ context }) => {
  await context.setExtraHTTPHeaders({ "x-forwarded-for": randomIp() });
});

async function signInAndOpenProfile(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel(/^Password/).fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/app\/dashboard$/);
  await page.goto("/app/settings/profile");
  await expect(
    page.getByRole("heading", { name: "Profile & public page", level: 1 }),
  ).toBeVisible();
}

test("a trainer uploads a profile photo, stored as WebP, and can remove it", async ({
  page,
  playwright,
  request,
}) => {
  const api = await playwright.request.newContext({ extraHTTPHeaders: WEB_HEADERS });
  const trainer = await createVerifiedTrainer(api, request);
  await api.dispose();
  await signInAndOpenProfile(page, trainer.email, trainer.password);

  await page
    .getByLabel("Choose a photo")
    .setInputFiles({ name: "me.png", mimeType: "image/png", buffer: PNG_1X1 });

  const photo = page.getByRole("img", { name: "Your photo" });
  await expect(photo).toBeVisible();
  const src = await photo.getAttribute("src");
  expect(src).toMatch(/trainer-avatars\/.+\.webp$/);
  const stored = await request.get(src ?? "");
  expect(stored.status()).toBe(200);
  expect(stored.headers()["content-type"]).toBe("image/webp");

  await page.getByRole("button", { name: "Remove" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Remove photo" }).click();
  await expect(page.getByRole("img", { name: "Your photo" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Upload photo" })).toBeVisible();
});

test("an over-limit or wrong-type file is refused with a readable message", async ({
  page,
  playwright,
  request,
}) => {
  const api = await playwright.request.newContext({ extraHTTPHeaders: WEB_HEADERS });
  const trainer = await createVerifiedTrainer(api, request);
  await api.dispose();
  await signInAndOpenProfile(page, trainer.email, trainer.password);
  const input = page.getByLabel("Choose a photo");

  await input.setInputFiles({
    name: "huge.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.alloc(11 * 1024 * 1024, 1),
  });
  await expect(page.getByRole("main").getByRole("alert")).toHaveText("Photos can be up to 10 MB.");

  await input.setInputFiles({
    name: "photo.heic",
    mimeType: "image/heic",
    buffer: Buffer.from("heic"),
  });
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Choose a JPEG, PNG or WebP photo",
  );

  // The API refuses on its own too, whatever the browser claims the type is.
  await input.setInputFiles({
    name: "fake.png",
    mimeType: "image/png",
    buffer: Buffer.from("not really a png"),
  });
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(
    "Upload a JPEG, PNG or WebP image.",
  );
});
