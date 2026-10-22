import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import type * as BrowserApiModule from "@/lib/api/browser";
import { PackagePresets } from "./package-presets";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const post = vi.fn();
vi.mock("@/lib/api/browser", async (importOriginal) => {
  const actual = await importOriginal<typeof BrowserApiModule>();
  return { ...actual, browserApi: { POST: (...args: unknown[]) => post(...args) } };
});

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
}

describe("PackagePresets", () => {
  it("adds a package from the drawer, sending the price in paise", async () => {
    post.mockResolvedValue({
      data: { presets: [] },
      response: new Response(null, { status: 200 }),
    });
    render(<PackagePresets presets={[]} />, { wrapper });

    await userEvent.click(screen.getByRole("button", { name: "Add package" }));
    const drawer = screen.getByRole("dialog", { name: "Add package" });
    await userEvent.type(within(drawer).getByRole("textbox", { name: "Name" }), "10 sessions");
    await userEvent.type(within(drawer).getByRole("spinbutton", { name: "Sessions" }), "10");
    await userEvent.type(
      within(drawer).getByRole("spinbutton", { name: "Default price (₹)" }),
      "12000",
    );
    await userEvent.click(within(drawer).getByRole("button", { name: "Save package" }));

    expect(post).toHaveBeenCalledWith("/v1/settings/package-presets", {
      body: {
        name: "10 sessions",
        kind: "session_pack",
        sessionsIncluded: 10,
        durationDays: null,
        sessionsPerWeek: null,
        defaultPricePaise: 1_200_000,
      },
    });
  });
});
