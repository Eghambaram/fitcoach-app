import type { INestApplication } from "@nestjs/common";
import type { Pool } from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createTestApp, WEB_HEADERS } from "../../test/create-test-app";
import { createPool } from "../../test/db";
import { TEST_SESSION_SECRET } from "../../test/fixtures";
import { createHttpHelpers } from "../../test/http-helpers";
import { issueFormToken, MIN_FILL_MS } from "./form-token";

let app: INestApplication;
let system: Pool;
let owner: Pool;
const { client, signedInTrainer } = createHttpHelpers(
  () => app,
  () => system,
);

type SignedIn = Awaited<ReturnType<typeof signedInTrainer>>;
interface Published {
  trainer: SignedIn;
  slug: string;
  workspaceId: string;
  userId: string;
}

beforeAll(async () => {
  app = await createTestApp();
  system = createPool(inject("db").systemUrl);
  owner = createPool(inject("db").ownerUrl);
});

afterAll(async () => {
  await app.close();
  await Promise.all([system.end(), owner.end()]);
});

const CONSENT =
  "I agree that this coach may contact me by phone, WhatsApp or email about my enquiry, and keep the details I share here for that purpose. I can ask for them to be deleted at any time.";

/** A trainer with a published page (in person + online). */
async function publishedTrainer(email: "optional" | "required" = "optional"): Promise<Published> {
  const trainer = await signedInTrainer();
  const slug = trainer.input.business.slug;
  await trainer.http.put("/v1/settings/public-page", {
    displayName: "Asha Rao",
    businessName: "Asha Strength",
    slug,
    headline: "Strength coaching for busy people",
    bio: "",
    location: "Pune",
    coachingTypes: ["Strength"],
    coachingModes: ["in_person", "online"],
    form: { email, schedule: true, message: true, consentText: CONSENT },
  });
  expect(
    (await trainer.http.post("/v1/settings/public-page/publish", { published: true })).status,
  ).toBe(200);
  const { rows } = await owner.query<{ id: string; owner_user_id: string }>(
    "select id, owner_user_id from workspaces where slug = $1",
    [slug],
  );
  return { trainer, slug, workspaceId: rows[0]?.id ?? "", userId: rows[0]?.owner_user_id ?? "" };
}

/** A form token issued long enough ago to pass time-to-submit. */
function humanToken(workspaceId: string): string {
  return issueFormToken(TEST_SESSION_SECRET, workspaceId, Date.now() - MIN_FILL_MS - 1_000);
}

function enquiry(page: Published, overrides: Record<string, unknown> = {}) {
  return {
    slug: page.slug,
    fullName: "Ravi Kumar",
    phone: "98765 43210",
    email: "ravi@example.test",
    goal: "get_stronger",
    preferredMode: "online",
    preferredSchedule: "Weekday evenings",
    message: "I want to deadlift safely.",
    source: "instagram",
    utm: { source: "ig", medium: "bio", campaign: "october" },
    consent: true,
    consentVersion: 1,
    formToken: humanToken(page.workspaceId),
    ...overrides,
  };
}

async function leadsIn(workspaceId: string) {
  const { rows } = await owner.query(
    "select * from leads where workspace_id = $1 order by created_at",
    [workspaceId],
  );
  return rows;
}

describe("public page read model", () => {
  it("is not available until published", async () => {
    const trainer = await signedInTrainer();
    const response = await client().get(`/v1/public/pages/${trainer.input.business.slug}`);
    expect(response.status).toBe(404);
    expect(response.body.message).toBe("This page isn't available.");
  });

  it("exposes only the whitelisted fields of a published page", async () => {
    const page = await publishedTrainer();
    const response = await client().get(`/v1/public/pages/${page.slug.toUpperCase()}`);

    expect(response.status).toBe(200);
    expect(Object.keys(response.body).sort()).toEqual(
      [
        "avatarUrl",
        "bio",
        "businessName",
        "coachingModes",
        "coachingTypes",
        "displayName",
        "form",
        "formToken",
        "headline",
        "location",
        "slug",
      ].sort(),
    );
    expect(response.body).toMatchObject({
      slug: page.slug,
      displayName: "Asha Rao",
      headline: "Strength coaching for busy people",
      coachingModes: ["in_person", "online"],
      form: { version: 1, consentText: CONSENT, fields: { email: "optional" } },
    });
  });

  it("goes offline when the workspace is suspended", async () => {
    const page = await publishedTrainer();
    await owner.query("update workspaces set status = 'suspended' where id = $1", [
      page.workspaceId,
    ]);
    expect((await client().get(`/v1/public/pages/${page.slug}`)).status).toBe(404);
  });
});

describe("POST /v1/public/enquiries", () => {
  it("stores lead + consent + activity + notification in one go", async () => {
    const page = await publishedTrainer();
    const response = await client().post("/v1/public/enquiries", enquiry(page));
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });

    const [lead] = await leadsIn(page.workspaceId);
    expect(lead).toMatchObject({
      full_name: "Ravi Kumar",
      phone_e164: "+919876543210",
      email: "ravi@example.test",
      goal: "get_stronger",
      training_mode: "online",
      preferred_schedule: "Weekday evenings",
      message: "I want to deadlift safely.",
      source: "instagram",
      campaign: "october",
      utm: { source: "ig", medium: "bio", campaign: "october" },
      stage: "new",
      created_via: "public_page",
    });

    const consent = await owner.query(
      `select f.version, f.consent_text, c.ip_hash from lead_consents c
       join lead_forms f on f.id = c.lead_form_id where c.lead_id = $1`,
      [lead.id],
    );
    expect(consent.rows).toEqual([
      { version: 1, consent_text: CONSENT, ip_hash: expect.stringMatching(/^[a-f0-9]{32}$/) },
    ]);
    const activity = await owner.query(
      "select type, actor_kind from lead_activities where lead_id = $1",
      [lead.id],
    );
    expect(activity.rows).toEqual([{ type: "enquiry_received", actor_kind: "system" }]);
    const notification = await owner.query(
      "select recipient_user_id, type, title, link from notifications where workspace_id = $1",
      [page.workspaceId],
    );
    expect(notification.rows).toEqual([
      {
        recipient_user_id: page.userId,
        type: "new_lead",
        title: "New enquiry from Ravi Kumar",
        link: `/app/leads/${lead.id}`,
      },
    ]);
    const event = await owner.query(
      "select properties from product_events where event = 'lead_captured' and workspace_id = $1",
      [page.workspaceId],
    );
    expect(event.rows).toEqual([{ properties: { source: "instagram", hasEmail: true } }]);
  });

  it("files the lead under the page's workspace whatever the body claims (tampering)", async () => {
    const page = await publishedTrainer();
    const other = await publishedTrainer();
    const response = await client().post(
      "/v1/public/enquiries",
      enquiry(page, { workspaceId: other.workspaceId, stage: "converted", createdVia: "manual" }),
    );
    expect(response.status).toBe(200);
    expect(await leadsIn(other.workspaceId)).toHaveLength(0);
    const [lead] = await leadsIn(page.workspaceId);
    expect(lead).toMatchObject({ stage: "new", created_via: "public_page" });
  });

  it("drops bots silently: honeypot filled, or sent faster than a person could type", async () => {
    const page = await publishedTrainer();
    const honeypot = await client().post(
      "/v1/public/enquiries",
      enquiry(page, { website: "https://spam.example" }),
    );
    const tooFast = await client().post(
      "/v1/public/enquiries",
      enquiry(page, { formToken: issueFormToken(TEST_SESSION_SECRET, page.workspaceId) }),
    );
    expect([honeypot.status, tooFast.status]).toEqual([200, 200]);
    expect([honeypot.body, tooFast.body]).toEqual([{ ok: true }, { ok: true }]);
    expect(await leadsIn(page.workspaceId)).toHaveLength(0);
  });

  it("asks for a reload when the form changed or the token is forged", async () => {
    const page = await publishedTrainer();
    const outdated = await client().post(
      "/v1/public/enquiries",
      enquiry(page, { consentVersion: 2 }),
    );
    const forged = await client().post(
      "/v1/public/enquiries",
      enquiry(page, { formToken: `${Date.now() - 60_000}.forged` }),
    );
    const otherWorkspace = await publishedTrainer();
    const wrongPage = await client().post(
      "/v1/public/enquiries",
      enquiry(page, { formToken: humanToken(otherWorkspace.workspaceId) }),
    );

    for (const response of [outdated, forged, wrongPage]) {
      expect(response.status).toBe(409);
      expect(response.body.code).toBe("FORM_OUTDATED");
    }
    expect(await leadsIn(page.workspaceId)).toHaveLength(0);
  });

  it("applies the trainer's form settings and the offered modes", async () => {
    // Requiring email changed the form, so it's now version 2.
    const page = await publishedTrainer("required");
    const noEmail = await client().post(
      "/v1/public/enquiries",
      enquiry(page, { email: "", consentVersion: 2 }),
    );
    expect(noEmail.status).toBe(400);
    expect(noEmail.body.fieldErrors).toEqual({ email: ["Enter your email address"] });

    const hybrid = await client().post(
      "/v1/public/enquiries",
      enquiry(page, { preferredMode: "hybrid", source: "tiktok", consentVersion: 2 }),
    );
    expect(hybrid.status).toBe(200);
    const [lead] = await leadsIn(page.workspaceId);
    // Hybrid isn't offered by this trainer; an unknown ?src= counts as the plain page.
    expect(lead).toMatchObject({ training_mode: null, source: "public_page" });
  });

  it("validates the form with field errors", async () => {
    const page = await publishedTrainer();
    const response = await client().post(
      "/v1/public/enquiries",
      enquiry(page, { fullName: "", phone: "123", consent: false, goal: "get_rich" }),
    );
    expect(response.status).toBe(400);
    expect(Object.keys(response.body.fieldErrors).sort()).toEqual([
      "consent",
      "fullName",
      "goal",
      "phone",
    ]);
  });

  it("is refused for unpublished pages", async () => {
    const page = await publishedTrainer();
    await page.trainer.http.post("/v1/settings/public-page/publish", { published: false });
    const response = await client().post("/v1/public/enquiries", enquiry(page));
    expect(response.status).toBe(404);
  });

  it("rate-limits repeated enquiries from one address", async () => {
    const page = await publishedTrainer();
    const visitor = client();
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 6; attempt++) {
      statuses.push(
        (await visitor.post("/v1/public/enquiries", enquiry(page, { fullName: `Ravi ${attempt}` })))
          .status,
      );
    }
    expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);
    expect(await leadsIn(page.workspaceId)).toHaveLength(5);
  });

  it("still requires the same-origin request headers (CSRF)", async () => {
    const page = await publishedTrainer();
    const response = await request(app.getHttpServer())
      .post("/v1/public/enquiries")
      .set({ origin: "https://evil.example", "x-fitcoach-request": "1" })
      .send(enquiry(page));
    expect(response.status).toBe(403);
    expect(response.body.code).toBe("CSRF_REJECTED");
    expect(WEB_HEADERS.origin).toBe("http://localhost:3000");
  });
});
