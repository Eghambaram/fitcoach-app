import type { INestApplication } from "@nestjs/common";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createTestApp } from "../../test/create-test-app";
import { createPool } from "../../test/db";
import { createHttpHelpers } from "../../test/http-helpers";

let app: INestApplication;
let system: Pool;
let owner: Pool;
const { client, signedInTrainer } = createHttpHelpers(
  () => app,
  () => system,
);

type SignedIn = Awaited<ReturnType<typeof signedInTrainer>>;

beforeAll(async () => {
  app = await createTestApp();
  system = createPool(inject("db").systemUrl);
  owner = createPool(inject("db").ownerUrl);
});

afterAll(async () => {
  await app.close();
  await Promise.all([system.end(), owner.end()]);
});

async function workspaceOf(trainer: SignedIn): Promise<string> {
  const { rows } = await owner.query<{ id: string }>(
    "select w.id from workspaces w join users u on u.id = w.owner_user_id where u.email = $1",
    [trainer.email],
  );
  return rows[0]?.id ?? "";
}

function pageInput(trainer: SignedIn, overrides: Record<string, unknown> = {}) {
  return {
    displayName: "Asha Rao",
    businessName: "Asha Strength",
    slug: trainer.input.business.slug,
    headline: "Strength coaching for busy people",
    bio: "Ten years of coaching.",
    location: "Pune",
    coachingTypes: ["Strength", "Mobility"],
    coachingModes: ["in_person", "online"],
    form: {
      email: "optional",
      schedule: true,
      message: true,
      consentText:
        "I agree that this coach may contact me by phone, WhatsApp or email about my enquiry, and keep the details I share here for that purpose. I can ask for them to be deleted at any time.",
    },
    ...overrides,
  };
}

describe("profile & public page settings", () => {
  it("starts unpublished with enquiry form v1 and the page link", async () => {
    const trainer = await signedInTrainer();
    const response = await trainer.http.get("/v1/settings/public-page");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      slug: trainer.input.business.slug,
      isPublished: false,
      publishedAt: null,
      form: { version: 1, email: "optional", schedule: true, message: true },
      publicUrl: `http://localhost:3000/coach/${trainer.input.business.slug}`,
    });
  });

  it("saves the page and versions the form only when wording or fields change", async () => {
    const trainer = await signedInTrainer();
    const saved = await trainer.http.put("/v1/settings/public-page", pageInput(trainer));
    expect(saved.status).toBe(200);
    expect(saved.body).toMatchObject({
      displayName: "Asha Rao",
      businessName: "Asha Strength",
      headline: "Strength coaching for busy people",
      coachingTypes: ["Strength", "Mobility"],
      coachingModes: ["in_person", "online"],
      form: { version: 1 },
    });

    const reworded = await trainer.http.put(
      "/v1/settings/public-page",
      pageInput(trainer, {
        form: { email: "required", schedule: false, message: true, consentText: "x".repeat(40) },
      }),
    );
    expect(reworded.body.form).toMatchObject({ version: 2, email: "required", schedule: false });

    const me = await trainer.http.get("/v1/auth/me");
    expect(me.body.profile.displayName).toBe("Asha Rao");
  });

  it("refuses a page address another trainer already uses", async () => {
    const first = await signedInTrainer();
    const second = await signedInTrainer();
    const response = await second.http.put(
      "/v1/settings/public-page",
      pageInput(second, { slug: first.input.business.slug }),
    );

    expect(response.status).toBe(409);
    expect(response.body.fieldErrors).toEqual({
      slug: ["This address is already taken. Try another one."],
    });
  });

  it("publishes only with a headline, and records the activation event", async () => {
    const trainer = await signedInTrainer();
    const noHeadline = await trainer.http.post("/v1/settings/public-page/publish", {
      published: true,
    });
    expect(noHeadline.status).toBe(400);
    expect(noHeadline.body.fieldErrors.headline).toBeDefined();

    await trainer.http.put("/v1/settings/public-page", pageInput(trainer));
    const published = await trainer.http.post("/v1/settings/public-page/publish", {
      published: true,
    });
    expect(published.status).toBe(200);
    expect(published.body.isPublished).toBe(true);
    expect(published.body.publishedAt).not.toBeNull();

    const { rows } = await owner.query(
      "select 1 from product_events where event = 'public_page_published' and workspace_id = $1",
      [await workspaceOf(trainer)],
    );
    expect(rows).toHaveLength(1);

    const unpublished = await trainer.http.post("/v1/settings/public-page/publish", {
      published: false,
    });
    expect(unpublished.body).toMatchObject({ isPublished: false, publishedAt: null });
  });

  it("serves the page QR code as a PNG or SVG download", async () => {
    const trainer = await signedInTrainer();
    const png = await trainer.http.get("/v1/settings/public-page/qr?format=png").buffer(true);
    expect(png.status).toBe(200);
    expect(png.headers["content-type"]).toBe("image/png");
    expect(png.headers["content-disposition"]).toBe(
      `attachment; filename="fitcoach-${trainer.input.business.slug}-qr.png"`,
    );
    expect((png.body as Buffer).subarray(1, 4).toString()).toBe("PNG");

    const svg = await trainer.http.get("/v1/settings/public-page/qr?format=svg");
    expect(svg.headers["content-type"]).toContain("image/svg+xml");
    expect(String(svg.text ?? svg.body)).toContain("<svg");
  });
});

describe("message templates", () => {
  it("lists all seven, rejects unknown placeholders, saves and resets", async () => {
    const trainer = await signedInTrainer();
    const listed = await trainer.http.get("/v1/settings/message-templates");
    expect(listed.body.templates).toHaveLength(7);
    expect(listed.body.templates.every((t: { isCustomised: boolean }) => !t.isCustomised)).toBe(
      true,
    );

    const rejected = await trainer.http.put("/v1/settings/message-templates/follow_up", {
      body: "Hi {name}, shall we book a trial?",
    });
    expect(rejected.status).toBe(400);
    expect(rejected.body.fieldErrors).toEqual({ body: ["Unknown placeholder: {name}"] });

    const saved = await trainer.http.put("/v1/settings/message-templates/follow_up", {
      body: "Hey {first_name}! {trainer_name} here.",
    });
    const followUp = saved.body.templates.find(
      (t: { purpose: string }) => t.purpose === "follow_up",
    );
    expect(followUp).toMatchObject({
      body: "Hey {first_name}! {trainer_name} here.",
      isCustomised: true,
    });

    const reset = await trainer.http.post("/v1/settings/message-templates/follow_up/reset");
    const restored = reset.body.templates.find(
      (t: { purpose: string }) => t.purpose === "follow_up",
    );
    expect(restored.isCustomised).toBe(false);
    expect(restored.body).toBe(restored.defaultBody);
  });

  it("rejects purposes that don't exist", async () => {
    const trainer = await signedInTrainer();
    const response = await trainer.http.put("/v1/settings/message-templates/marketing_blast", {
      body: "Hi",
    });
    expect(response.status).toBe(400);
  });
});

describe("package presets", () => {
  const preset = {
    name: "10 sessions",
    kind: "session_pack",
    sessionsIncluded: 10,
    durationDays: 60,
    sessionsPerWeek: null,
    defaultPricePaise: 1_200_000,
  };

  it("starts with the three default shapes without prices, then creates, edits and archives", async () => {
    const trainer = await signedInTrainer();
    const initial = await trainer.http.get("/v1/settings/package-presets");
    expect(initial.body.presets).toHaveLength(3);
    expect(
      initial.body.presets.every(
        (p: { defaultPricePaise: number | null }) => p.defaultPricePaise === null,
      ),
    ).toBe(true);

    const created = await trainer.http.post("/v1/settings/package-presets", preset);
    const mine = created.body.presets.find((p: { name: string }) => p.name === "10 sessions");
    expect(mine).toMatchObject({ defaultPricePaise: 1_200_000, archived: false });

    const edited = await trainer.http.put(`/v1/settings/package-presets/${mine.id}`, {
      ...preset,
      name: "10 sessions (6 weeks)",
      durationDays: 42,
    });
    expect(edited.body.presets.find((p: { id: string }) => p.id === mine.id)).toMatchObject({
      name: "10 sessions (6 weeks)",
      durationDays: 42,
    });

    const archived = await trainer.http.post(`/v1/settings/package-presets/${mine.id}/archive`);
    expect(archived.body.presets.find((p: { id: string }) => p.id === mine.id).archived).toBe(true);
    const restored = await trainer.http.post(`/v1/settings/package-presets/${mine.id}/restore`);
    expect(restored.body.presets.find((p: { id: string }) => p.id === mine.id).archived).toBe(
      false,
    );
  });

  it("can't touch another trainer's preset or a global default (tampering)", async () => {
    const a = await signedInTrainer();
    const b = await signedInTrainer();
    const created = await a.http.post("/v1/settings/package-presets", preset);
    const aPreset = created.body.presets.find((p: { name: string }) => p.name === "10 sessions");
    const { rows } = await owner.query<{ id: string }>(
      "select id from package_presets where workspace_id is null limit 1",
    );

    for (const id of [aPreset.id, rows[0]?.id]) {
      const edit = await b.http.put(`/v1/settings/package-presets/${id}`, preset);
      const archive = await b.http.post(`/v1/settings/package-presets/${id}/archive`);
      expect([edit.status, archive.status]).toEqual([404, 404]);
    }
    const still = await a.http.get("/v1/settings/package-presets");
    expect(still.body.presets.find((p: { id: string }) => p.id === aPreset.id).archived).toBe(
      false,
    );
  });

  it("requires sessions for a session pack", async () => {
    const trainer = await signedInTrainer();
    const response = await trainer.http.post("/v1/settings/package-presets", {
      ...preset,
      sessionsIncluded: null,
    });
    expect(response.status).toBe(400);
    expect(response.body.fieldErrors.sessionsIncluded).toBeDefined();
  });
});

describe("units & locale, check-in rules, package policy, plan", () => {
  it("round-trips each section and shows the beta plan read-only", async () => {
    const trainer = await signedInTrainer();
    const initial = await trainer.http.get("/v1/settings");
    expect(initial.body).toMatchObject({
      locale: { weightUnit: "kg", lengthUnit: "cm", timezone: "Asia/Kolkata", country: "IN" },
      checkIns: { checkInFrequency: "daily", noCheckInDays: 3, noMeasurementDays: 14 },
      packagePolicy: { noShowUsesSession: true, lateCancelWindowHours: 12 },
      plan: { planName: "Free beta", maxActiveClients: 50, trialEndsAt: null },
    });

    await trainer.http.put("/v1/settings/locale", {
      weightUnit: "lb",
      lengthUnit: "in",
      timezone: "Asia/Dubai",
      country: "AE",
    });
    await trainer.http.put("/v1/settings/check-ins", {
      checkInFrequency: "weekly",
      noCheckInDays: 10,
      noMeasurementDays: 30,
    });
    const policy = await trainer.http.put("/v1/settings/package-policy", {
      noShowUsesSession: false,
      lateCancelWindowHours: 24,
      lateCancelUsesSession: false,
      lowSessionsThreshold: 3,
      expiryWarningDays: 10,
    });
    expect(policy.body).toMatchObject({
      locale: { weightUnit: "lb", lengthUnit: "in", timezone: "Asia/Dubai", country: "AE" },
      checkIns: { checkInFrequency: "weekly", noCheckInDays: 10, noMeasurementDays: 30 },
      packagePolicy: { noShowUsesSession: false, lateCancelWindowHours: 24, expiryWarningDays: 10 },
    });
  });

  it("validates each field", async () => {
    const trainer = await signedInTrainer();
    const response = await trainer.http.put("/v1/settings/locale", {
      weightUnit: "stone",
      lengthUnit: "cm",
      timezone: "+05:30",
      country: "India",
    });
    expect(response.status).toBe(400);
    expect(Object.keys(response.body.fieldErrors).sort()).toEqual([
      "country",
      "timezone",
      "weightUnit",
    ]);
  });
});

describe("access", () => {
  it("needs a signed-in trainer", async () => {
    const anonymous = client();
    expect((await anonymous.get("/v1/settings")).status).toBe(401);
    expect((await anonymous.get("/v1/settings/public-page")).status).toBe(401);
  });

  it("keeps a suspended workspace's settings readable but read-only", async () => {
    const trainer = await signedInTrainer();
    await owner.query("update workspaces set status = 'suspended' where id = $1", [
      await workspaceOf(trainer),
    ]);
    expect((await trainer.http.get("/v1/settings")).status).toBe(200);
    const write = await trainer.http.put("/v1/settings/check-ins", {
      checkInFrequency: "weekly",
      noCheckInDays: 5,
      noMeasurementDays: 20,
    });
    expect(write.status).toBe(403);
    expect(write.body.code).toBe("WORKSPACE_READ_ONLY");
  });
});

describe("change password", () => {
  it("checks the current password, then signs out every other device", async () => {
    const trainer = await signedInTrainer();
    const otherDevice = client();
    await otherDevice.post("/v1/auth/login", { email: trainer.email, password: trainer.password });
    expect((await otherDevice.get("/v1/auth/me")).status).toBe(200);

    const wrong = await trainer.http.post("/v1/auth/password/change", {
      currentPassword: "not-my-password",
      newPassword: "a-brand-new-passphrase",
    });
    expect(wrong.status).toBe(400);
    expect(wrong.body.fieldErrors).toEqual({
      currentPassword: ["That's not your current password."],
    });

    const changed = await trainer.http.post("/v1/auth/password/change", {
      currentPassword: trainer.password,
      newPassword: "a-brand-new-passphrase",
    });
    expect(changed.status).toBe(200);
    expect((await trainer.http.get("/v1/auth/me")).status).toBe(200);
    expect((await otherDevice.get("/v1/auth/me")).status).toBe(401);

    const fresh = client();
    expect(
      (await fresh.post("/v1/auth/login", { email: trainer.email, password: trainer.password }))
        .status,
    ).toBe(401);
    expect(
      (
        await fresh.post("/v1/auth/login", {
          email: trainer.email,
          password: "a-brand-new-passphrase",
        })
      ).status,
    ).toBe(200);
  });
});
