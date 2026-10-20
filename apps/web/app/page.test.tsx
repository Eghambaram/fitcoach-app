import { render, screen } from "@testing-library/react";
import HomePage from "./page";

describe("HomePage", () => {
  it("names the product and states the closed beta honestly", () => {
    render(<HomePage />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Personal Trainer Copilot" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/closed beta/i)).toBeInTheDocument();
  });

  it("contains no numeric marketing claims", () => {
    const { container } = render(<HomePage />);

    expect(container.textContent).not.toMatch(/\d/);
  });
});
