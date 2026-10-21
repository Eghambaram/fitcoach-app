import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { TemplateEditor } from "./template-editor";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
}

const TEMPLATE = {
  purpose: "follow_up" as const,
  body: "Hi {first_name}!",
  defaultBody: "Hi {first_name}!",
  isCustomised: false,
};

describe("TemplateEditor", () => {
  it("flags unknown placeholders and blocks saving until they're fixed", async () => {
    render(<TemplateEditor template={TEMPLATE} />, { wrapper });
    const box = screen.getByRole("textbox", { name: "Follow-up" });
    await userEvent.clear(box);
    // userEvent treats "{" as a key descriptor, so escape it as "{{".
    await userEvent.type(box, "Hi {{name}!");

    expect(screen.getByRole("alert")).toHaveTextContent("Unknown placeholder: {name}");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("inserts a placeholder at the cursor", async () => {
    render(<TemplateEditor template={TEMPLATE} />, { wrapper });
    const box = screen.getByRole<HTMLTextAreaElement>("textbox", { name: "Follow-up" });
    box.setSelectionRange(3, 3);
    await userEvent.click(screen.getByRole("button", { name: "{trainer_name}" }));

    expect(box.value).toBe("Hi {trainer_name}{first_name}!");
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });
});
