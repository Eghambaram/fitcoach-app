import type * as Shared from "@fitcoach/shared";
import type { PublicPageResponse } from "@fitcoach/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import type * as BrowserApiModule from "@/lib/api/browser";
import { EnquiryForm } from "./enquiry-form";

// The real form waits out the time-to-submit minimum; tests don't need to.
vi.mock("@fitcoach/shared", async (importOriginal) => ({
  ...(await importOriginal<typeof Shared>()),
  ENQUIRY_MIN_FILL_MS: -1_000,
}));

const post = vi.fn();
vi.mock("@/lib/api/browser", async (importOriginal) => {
  const actual = await importOriginal<typeof BrowserApiModule>();
  return { ...actual, browserApi: { POST: (...args: unknown[]) => post(...args) } };
});

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
}

const PAGE: PublicPageResponse = {
  slug: "asha-strength",
  displayName: "Asha Rao",
  businessName: "Asha Strength",
  headline: null,
  bio: null,
  location: null,
  coachingTypes: [],
  coachingModes: ["in_person", "online"],
  avatarUrl: null,
  form: {
    version: 3,
    consentText: "I agree this coach may contact me about my enquiry.",
    fields: { email: "optional", schedule: false, message: true },
  },
  formToken: "1800000000000.sig",
};

const attribution = { source: "instagram", utm: { campaign: "october" } };

async function fillRequired() {
  await userEvent.type(screen.getByLabelText(/^Your name/), "Ravi Kumar");
  await userEvent.type(screen.getByLabelText(/^Phone/), "98765 43210");
  await userEvent.selectOptions(screen.getByLabelText(/^Your main goal/), "get_stronger");
  await userEvent.click(screen.getByRole("checkbox", { name: PAGE.form.consentText }));
}

describe("EnquiryForm", () => {
  beforeEach(() => {
    post.mockReset();
  });

  it("asks only what the trainer's form settings ask, and keeps the honeypot out of reach", () => {
    render(<EnquiryForm page={PAGE} attribution={attribution} />, { wrapper });

    expect(screen.getByLabelText("Email (optional)")).toBeInTheDocument();
    expect(screen.getByLabelText("Anything else?")).toBeInTheDocument();
    expect(screen.queryByLabelText("Preferred days and times")).not.toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Online" })).toBeInTheDocument();
    // The honeypot sits in an aria-hidden container and can't be tabbed to.
    expect(screen.queryByRole("textbox", { name: "Website" })).not.toBeInTheDocument();
  });

  it("requires consent before sending", async () => {
    render(<EnquiryForm page={PAGE} attribution={attribution} />, { wrapper });
    await userEvent.type(screen.getByLabelText(/^Your name/), "Ravi Kumar");
    await userEvent.type(screen.getByLabelText(/^Phone/), "98765 43210");
    await userEvent.selectOptions(screen.getByLabelText(/^Your main goal/), "get_stronger");
    await userEvent.click(screen.getByRole("button", { name: "Send enquiry" }));

    expect(
      await screen.findByText("Please agree so the coach can contact you"),
    ).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  it("sends the form version, token and attribution, then thanks the person", async () => {
    post.mockResolvedValue({ data: { ok: true }, response: new Response(null, { status: 200 }) });
    render(<EnquiryForm page={PAGE} attribution={attribution} />, { wrapper });
    await fillRequired();
    await userEvent.click(screen.getByRole("button", { name: "Send enquiry" }));

    expect(await screen.findByText("Thanks, Ravi!")).toBeInTheDocument();
    expect(post).toHaveBeenCalledWith("/v1/public/enquiries", {
      body: expect.objectContaining({
        slug: "asha-strength",
        fullName: "Ravi Kumar",
        consentVersion: 3,
        formToken: "1800000000000.sig",
        source: "instagram",
        utm: { campaign: "october" },
        website: "",
      }),
    });
  });

  it("offers a reload when the form changed since it was opened", async () => {
    post.mockResolvedValue({
      error: {
        code: "FORM_OUTDATED",
        message: "This form has changed since you opened it. Reload the page and try again.",
        requestId: "r1",
      },
      response: new Response(null, { status: 409 }),
    });
    render(<EnquiryForm page={PAGE} attribution={attribution} />, { wrapper });
    await fillRequired();
    await userEvent.click(screen.getByRole("button", { name: "Send enquiry" }));

    expect(await screen.findByRole("button", { name: "Reload page" })).toBeInTheDocument();
  });
});
