import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describeActivity } from "./lead-drawer";
import { describeDue, localDate, WhatsAppButton } from "./follow-ups";

const LINK = {
  purpose: "follow_up" as const,
  text: "Hi Meena, free for a trial?",
  url: "https://wa.me/919812345678?text=Hi%20Meena%2C%20free%20for%20a%20trial%3F",
};

describe("WhatsAppButton", () => {
  it("opens the prefilled chat and logs only after the trainer confirms sending", async () => {
    const onSent = vi.fn();
    render(<WhatsAppButton link={LINK} name="Meena" onSent={onSent} />);
    const link = screen.getByRole("link", { name: "WhatsApp Meena" });
    expect(link).toHaveAttribute("href", LINK.url);
    expect(link).toHaveAttribute("target", "_blank");

    await userEvent.click(link);
    expect(await screen.findByText("Did you send it?")).toBeInTheDocument();
    expect(screen.getByText(LINK.text)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Not sent" }));
    expect(onSent).not.toHaveBeenCalled();

    await userEvent.click(link);
    await userEvent.click(await screen.findByRole("button", { name: "Yes, I sent it" }));
    expect(onSent).toHaveBeenCalledWith("follow_up");
  });

  it("just opens the chat when there is nothing to log", async () => {
    render(<WhatsAppButton link={LINK} name="Meena" />);
    await userEvent.click(screen.getByRole("link", { name: "WhatsApp Meena" }));
    expect(screen.queryByText("Did you send it?")).not.toBeInTheDocument();
  });

  it("renders nothing without a phone number", () => {
    const { container } = render(<WhatsAppButton link={null} name="Meena" onSent={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("follow-up wording", () => {
  it("says Today and Overdue from the server's state, never from colour alone", () => {
    expect(describeDue("2026-10-23", "18:30", "today")).toMatch(/^Today, 6:30\s?pm$/i);
    expect(describeDue("2026-10-20", "09:00", "overdue")).toMatch(/^Overdue · 20 Oct/);
    expect(describeDue(localDate(1), "09:00", "upcoming")).toMatch(/^Tomorrow, 9:00\s?am$/i);
  });

  it("describes follow-up and contact entries in the timeline", () => {
    const base = { id: "1", actorKind: "trainer" as const, createdAt: new Date().toISOString() };
    expect(
      describeActivity({
        ...base,
        type: "follow_up_completed",
        data: { actionType: "call", outcome: "no_answer" },
      }),
    ).toBe("Follow-up done: Call — No answer");
    expect(
      describeActivity({
        ...base,
        type: "contact_logged",
        data: { channel: "whatsapp", outcome: "message_sent", templatePurpose: "follow_up" },
      }),
    ).toBe("WhatsApp: Message sent (from your template)");
    expect(
      describeActivity({
        ...base,
        type: "stage_changed",
        data: { from: "new", to: "contacted", automatic: true },
      }),
    ).toBe("Stage changed from New to Contacted (after a contact)");
  });
});
