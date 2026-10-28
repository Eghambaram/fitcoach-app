import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import type * as BrowserApiModule from "@/lib/api/browser";
import { SignupForm, stepForField } from "./signup-form";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
}));

const post = vi.fn();
vi.mock("@/lib/api/browser", async (importOriginal) => {
  const actual = await importOriginal<typeof BrowserApiModule>();
  return { ...actual, browserApi: { POST: (...args: unknown[]) => post(...args) } };
});

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
}

async function fillAccountAndProfile() {
  await userEvent.type(screen.getByLabelText(/^Email/), "asha@example.com");
  await userEvent.type(screen.getByLabelText(/^Password/), "a-long-unique-passphrase");
  await userEvent.click(screen.getByRole("button", { name: "Continue" }));
  await userEvent.type(await screen.findByLabelText(/^Your name/), "Asha Rao");
  await userEvent.click(screen.getByRole("button", { name: "Continue" }));
}

describe("stepForField", () => {
  it.each([
    ["account.email", 0],
    ["profile.phone", 1],
    ["business.slug", 2],
    ["inviteCode", 2],
    ["somethingElse", 2],
  ])("%s → step %d", (path, step) => {
    expect(stepForField(path)).toBe(step);
  });
});

describe("SignupForm", () => {
  beforeEach(() => {
    post.mockReset();
    push.mockReset();
  });

  it("validates each step before moving on", async () => {
    render(<SignupForm inviteRequired />, { wrapper });

    await userEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByText("Enter a valid email address")).toBeInTheDocument();
    expect(screen.getByLabelText(/^Email/)).toBeVisible();
  });

  it("suggests the page address from the business name until it's edited", async () => {
    render(<SignupForm inviteRequired />, { wrapper });
    await fillAccountAndProfile();

    await userEvent.type(await screen.findByLabelText(/^Business name/), "Asha’s Fitness Studio");

    expect(screen.getByLabelText(/^Your page address/)).toHaveValue("ashas-fitness-studio");
  });

  it("sends the request and goes to 'check your inbox'", async () => {
    post.mockResolvedValue({
      data: { status: "accepted" },
      response: new Response(null, { status: 202 }),
    });
    render(<SignupForm inviteRequired />, { wrapper });
    await fillAccountAndProfile();

    await userEvent.type(await screen.findByLabelText(/^Business name/), "Asha Fitness");
    await userEvent.click(screen.getByLabelText(/In-person/));
    await userEvent.type(screen.getByLabelText(/^Beta invite code/), "FIT-ABCD-EFGH");
    // The terms and privacy policy are a click away, in a new tab so the form stays filled in.
    expect(screen.getByRole("link", { name: "terms of use" })).toHaveAttribute("href", "/terms");
    expect(screen.getByRole("link", { name: "privacy policy" })).toHaveAttribute(
      "target",
      "_blank",
    );
    await userEvent.click(screen.getByLabelText(/I accept the FitCoach terms/));
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(post).toHaveBeenCalledWith(
      "/v1/auth/signup",
      expect.objectContaining({
        body: expect.objectContaining({
          account: { email: "asha@example.com", password: "a-long-unique-passphrase" },
          business: expect.objectContaining({
            slug: "asha-fitness",
            coachingModes: ["in_person"],
            timezone: "Asia/Kolkata",
          }),
          inviteCode: "FIT-ABCD-EFGH",
        }),
      }),
    );
    expect(push).toHaveBeenCalledWith("/verify-email?sent=1");
  });

  it("shows an API field error on the step it belongs to", async () => {
    post.mockResolvedValue({
      error: {
        code: "VALIDATION_FAILED",
        message: "That invite code isn't valid.",
        fieldErrors: { inviteCode: ["This code isn't valid or has been used up."] },
        requestId: "r1",
      },
      response: new Response(null, { status: 400 }),
    });
    render(<SignupForm inviteRequired />, { wrapper });
    await fillAccountAndProfile();
    await userEvent.type(await screen.findByLabelText(/^Business name/), "Asha Fitness");
    await userEvent.click(screen.getByLabelText(/Online/));
    await userEvent.type(screen.getByLabelText(/^Beta invite code/), "FIT-ZZZZ-ZZZZ");
    await userEvent.click(screen.getByLabelText(/I accept the FitCoach terms/));
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(
      await screen.findByText("This code isn't valid or has been used up."),
    ).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});
