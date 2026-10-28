import { render, screen } from "@testing-library/react";
import { Landing } from "./landing";
import { RequestAccessForm } from "./request-access";

describe("Landing", () => {
  it("names the product and states the closed beta honestly", () => {
    render(<Landing />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Personal Trainer Copilot" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/closed beta/i).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "Request beta access" })).toHaveAttribute(
      "href",
      "/pricing#request-access",
    );
  });

  it("contains no numeric marketing claims or social proof", () => {
    const { container } = render(<Landing />);

    expect(container.textContent).not.toMatch(/\d/);
    expect(container.textContent).not.toMatch(/trusted by|#1|worldwide/i);
  });
});

describe("RequestAccessForm", () => {
  it("says it's not configured when there's no contact address", () => {
    render(<RequestAccessForm contactEmail="" />);
    expect(screen.getByText(/Beta requests: Not configured/)).toBeInTheDocument();
  });

  it("explains that it opens the email app", () => {
    render(<RequestAccessForm contactEmail="beta@example.com" />);
    expect(
      screen.getByText(/opens your email app with a message to beta@example.com/),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Request beta access" })).toBeInTheDocument();
  });
});
