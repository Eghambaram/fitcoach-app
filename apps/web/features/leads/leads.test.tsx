import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import type * as BrowserApiModule from "@/lib/api/browser";
import { describeActivity } from "./lead-drawer";
import { LeadForm } from "./lead-form";

const post = vi.fn();
vi.mock("@/lib/api/browser", async (importOriginal) => {
  const actual = await importOriginal<typeof BrowserApiModule>();
  return { ...actual, browserApi: { POST: (...args: unknown[]) => post(...args) } };
});

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
}

const ok = (data: unknown) => ({ data, response: new Response(null, { status: 200 }) });

describe("LeadForm", () => {
  beforeEach(() => post.mockReset());

  it("shows a non-blocking Possible match panel for a known phone number", async () => {
    post.mockResolvedValue(
      ok({
        matches: [
          {
            kind: "lead",
            id: "11111111-1111-4111-8111-111111111111",
            fullName: "Meena Singh",
            stage: "contacted",
            matchedOn: ["phone"],
          },
        ],
      }),
    );
    const onOpenLead = vi.fn();
    render(<LeadForm onSaved={vi.fn()} onOpenLead={onOpenLead} />, { wrapper });

    await userEvent.type(screen.getByRole("textbox", { name: "Phone" }), "98123 45678");
    await userEvent.tab();

    expect(await screen.findByText("Possible match")).toBeInTheDocument();
    expect(screen.getByText("Meena Singh")).toBeInTheDocument();
    expect(post).toHaveBeenCalledWith("/v1/leads/duplicates", {
      body: { phone: "98123 45678", email: undefined, excludeLeadId: undefined },
    });
    await userEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(onOpenLead).toHaveBeenCalledWith("11111111-1111-4111-8111-111111111111");
  });

  it("can carry on after a match, and requires a phone or an email", async () => {
    post.mockResolvedValueOnce(
      ok({
        matches: [
          {
            kind: "lead",
            id: "11111111-1111-4111-8111-111111111111",
            fullName: "Meena Singh",
            stage: "new",
            matchedOn: ["email"],
          },
        ],
      }),
    );
    render(<LeadForm onSaved={vi.fn()} onOpenLead={vi.fn()} />, { wrapper });
    await userEvent.type(screen.getByRole("textbox", { name: "Email" }), "meena@example.test");
    await userEvent.tab();
    await userEvent.click(await screen.findByRole("button", { name: "Create anyway" }));
    expect(screen.queryByText("Possible match")).not.toBeInTheDocument();

    await userEvent.clear(screen.getByRole("textbox", { name: "Email" }));
    await userEvent.type(screen.getByRole("textbox", { name: /^Full name/ }), "Meena Singh");
    await userEvent.click(screen.getByRole("button", { name: "Create lead" }));
    expect(await screen.findByText("Add a phone number or an email")).toBeInTheDocument();
  });

  it("creates the lead with the chosen goal and source", async () => {
    post.mockResolvedValue(ok({ matches: [] }));
    const onSaved = vi.fn();
    render(<LeadForm onSaved={onSaved} onOpenLead={vi.fn()} />, { wrapper });
    await userEvent.type(screen.getByRole("textbox", { name: /^Full name/ }), "Ravi Kumar");
    await userEvent.type(screen.getByRole("textbox", { name: "Phone" }), "98765 43210");
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: /^Main goal/ }),
      "get_stronger",
    );
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: /^How did they hear/ }),
      "referral",
    );
    await userEvent.click(screen.getByRole("radio", { name: "Online" }));

    post.mockResolvedValue(ok({ id: "22222222-2222-4222-8222-222222222222" }));
    await userEvent.click(screen.getByRole("button", { name: "Create lead" }));

    expect(post).toHaveBeenLastCalledWith("/v1/leads", {
      body: expect.objectContaining({
        fullName: "Ravi Kumar",
        phone: "98765 43210",
        goal: "get_stronger",
        source: "referral",
        trainingMode: "online",
      }),
    });
    expect(onSaved).toHaveBeenCalled();
  });
});

describe("describeActivity", () => {
  const base = { id: "a", actorKind: "trainer" as const, createdAt: "2026-10-22T10:00:00.000Z" };

  it("reads like a sentence for each kind of entry", () => {
    expect(
      describeActivity({ ...base, type: "enquiry_received", data: { source: "instagram" } }),
    ).toBe("Enquiry received via Instagram");
    expect(
      describeActivity({
        ...base,
        type: "stage_changed",
        data: { from: "contacted", to: "lost", lostReason: "price" },
      }),
    ).toBe("Stage changed from Contacted to Lost (Price)");
    expect(
      describeActivity({
        ...base,
        type: "details_updated",
        data: { fields: ["fullName", "phoneE164"] },
      }),
    ).toBe("Updated name, phone");
  });
});
