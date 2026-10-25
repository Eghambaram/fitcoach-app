import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import type * as BrowserApiModule from "@/lib/api/browser";
import { SeriesForm } from "./appointment-forms";

const get = vi.fn();
const post = vi.fn();
vi.mock("@/lib/api/browser", async (importOriginal) => {
  const actual = await importOriginal<typeof BrowserApiModule>();
  return {
    ...actual,
    browserApi: {
      GET: (...args: unknown[]) => get(...args),
      POST: (...args: unknown[]) => post(...args),
    },
  };
});

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
}
const ok = (data: unknown) => ({ data, response: new Response(null, { status: 200 }) });
const CLIENT = "11111111-1111-4111-8111-111111111111";

describe("SeriesForm", () => {
  beforeEach(() => {
    get.mockReset();
    post.mockReset();
    get.mockResolvedValue(
      ok({ clients: [{ id: CLIENT, fullName: "Asha Rao", status: "active" }] }),
    );
  });

  it("checks the pattern first, then skips conflicting dates unless the trainer keeps them", async () => {
    post.mockImplementation((path: string) =>
      Promise.resolve(
        path === "/v1/appointments/series/preview"
          ? ok({
              capped: false,
              occurrences: [
                { date: "2031-01-06", startTime: "07:00", conflict: null },
                {
                  date: "2031-01-08",
                  startTime: "07:00",
                  conflict: {
                    appointmentId: CLIENT,
                    title: "Ravi — Session",
                    startTime: "7:30 AM",
                  },
                },
                { date: "2031-01-10", startTime: "07:00", conflict: null },
              ],
            })
          : ok({ seriesId: CLIENT, created: 2, skipped: 1 }),
      ),
    );
    const onSaved = vi.fn();
    render(<SeriesForm defaultDate="2031-01-06" onSaved={onSaved} />, { wrapper });

    // The shared schema runs before anything is sent.
    await userEvent.click(screen.getByRole("button", { name: "Check dates" }));
    expect(screen.getByText("Choose at least one day")).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();

    await userEvent.selectOptions(
      await screen.findByRole("combobox", { name: "Client" }),
      "Asha Rao",
    );
    for (const day of ["Mon", "Wed", "Fri"]) await userEvent.click(screen.getByText(day));
    await userEvent.click(screen.getByRole("button", { name: "Check dates" }));

    expect(await screen.findByText(/Overlaps Ravi — Session at 7:30 AM/)).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Skip 2031-01-08" })).toBeChecked();
    await userEvent.click(screen.getByRole("button", { name: "Create 2 sessions" }));

    const create = post.mock.calls.find(([path]) => path === "/v1/appointments/series");
    expect(create?.[1].body).toMatchObject({
      clientId: CLIENT,
      weekdays: [1, 3, 5],
      occurrenceCount: 24,
      skipDates: ["2031-01-08"],
    });
    expect(onSaved).toHaveBeenCalledWith(2);
  });
});
