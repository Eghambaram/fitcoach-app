import type { LeadDetailResponse } from "@fitcoach/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import type * as BrowserApiModule from "@/lib/api/browser";
import { ConvertLeadForm } from "./convert-lead";

const post = vi.fn();
const get = vi.fn();
vi.mock("@/lib/api/browser", async (importOriginal) => {
  const actual = await importOriginal<typeof BrowserApiModule>();
  return {
    ...actual,
    browserApi: {
      POST: (...args: unknown[]) => post(...args),
      GET: (...args: unknown[]) => get(...args),
    },
  };
});

const PRESET_ID = "33333333-3333-4333-8333-333333333333";
const presets = {
  presets: [
    {
      id: PRESET_ID,
      name: "12 sessions",
      kind: "session_pack",
      sessionsIncluded: 12,
      durationDays: 42,
      sessionsPerWeek: null,
      defaultPricePaise: 1_200_000,
      archived: false,
    },
  ],
};

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {children}
    </QueryClientProvider>
  );
}

const LEAD_ID = "11111111-1111-4111-8111-111111111111";
const CLIENT_ID = "22222222-2222-4222-8222-222222222222";
const lead = {
  id: LEAD_ID,
  fullName: "Kiran Rao",
  phoneE164: "+919812345678",
  email: null,
} as LeadDetailResponse;

const reply = (status: number, data: unknown) =>
  status < 300
    ? { data, response: new Response(null, { status }) }
    : { error: data, response: new Response(null, { status }) };

describe("ConvertLeadForm", () => {
  beforeEach(() => {
    post.mockReset();
    get.mockReset();
    get.mockResolvedValue({ data: presets, response: new Response(null, { status: 200 }) });
  });

  it("sends one Idempotency-Key per opening and reuses it when retrying", async () => {
    post.mockImplementation((path: string) =>
      Promise.resolve(
        path === "/v1/leads/duplicates"
          ? reply(200, { matches: [] })
          : reply(500, {
              code: "INTERNAL_ERROR",
              message: "Something went wrong.",
              requestId: "r",
            }),
      ),
    );
    render(<ConvertLeadForm lead={lead} onConverted={vi.fn()} />, { wrapper });

    const button = screen.getByRole("button", { name: "Convert & Continue" });
    await userEvent.click(button);
    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong.");
    await userEvent.click(button);

    const converts = post.mock.calls.filter(([path]) => path === "/v1/leads/{id}/convert");
    expect(converts).toHaveLength(2);
    const keys = converts.map(([, options]) => options.params.header["Idempotency-Key"]);
    expect(keys[0]).toMatch(/^[0-9a-f-]{36}$/);
    expect(keys[1]).toBe(keys[0]);
  });

  it("offers linking to an existing client and reports where to continue", async () => {
    post.mockImplementation((path: string) =>
      Promise.resolve(
        path === "/v1/leads/duplicates"
          ? reply(200, {
              matches: [
                {
                  kind: "client",
                  id: CLIENT_ID,
                  fullName: "Kiran R",
                  status: "active",
                  matchedOn: ["phone"],
                },
              ],
            })
          : reply(200, { clientId: CLIENT_ID, linkedExisting: true, next: "/app/leads?lead=x" }),
      ),
    );
    const onConverted = vi.fn();
    render(<ConvertLeadForm lead={lead} onConverted={onConverted} />, { wrapper });

    await userEvent.click(await screen.findByRole("radio", { name: /Link to Kiran R/ }));
    await userEvent.click(screen.getByRole("button", { name: "Link to client" }));

    const convert = post.mock.calls.find(([path]) => path === "/v1/leads/{id}/convert");
    expect(convert?.[1].body).toEqual({ linkClientId: CLIENT_ID });
    expect(onConverted).toHaveBeenCalledWith("/app/leads?lead=x");
  });

  it("sells the picked package with its price, in paise", async () => {
    post.mockImplementation((path: string) =>
      Promise.resolve(
        path === "/v1/leads/duplicates"
          ? reply(200, { matches: [] })
          : reply(200, { clientId: CLIENT_ID, linkedExisting: false, next: "/app/clients/new" }),
      ),
    );
    render(<ConvertLeadForm lead={lead} onConverted={vi.fn()} />, { wrapper });

    const select = screen.getByRole("combobox", { name: "Initial package (optional)" });
    await screen.findByRole("option", { name: "12 sessions" });
    await userEvent.selectOptions(select, PRESET_ID);
    const price = screen.getByRole("spinbutton", { name: /Price/ });
    expect(price).toHaveValue(12000);
    await userEvent.clear(price);
    await userEvent.type(price, "9999.50");
    await userEvent.click(screen.getByRole("button", { name: "Convert & Continue" }));

    const convert = post.mock.calls.find(([path]) => path === "/v1/leads/{id}/convert");
    expect(convert?.[1].body).toEqual({
      initialPackage: { presetId: PRESET_ID, pricePaise: 999_950 },
    });
  });
});
