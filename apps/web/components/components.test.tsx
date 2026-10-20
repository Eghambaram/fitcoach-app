import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DataList, FilterBar } from "./shared/data-list";
import { EnvironmentRibbon } from "./shared/environment-ribbon";
import { KpiCard } from "./shared/page-header";
import {
  EmptyState,
  ErrorState,
  NotConfiguredNotice,
  PermissionDenied,
  StatusPill,
} from "./shared/status";
import { Stepper } from "./shared/stepper";
import { Button } from "./ui/button";
import { Field } from "./ui/field";
import { Input } from "./ui/input";

describe("Field", () => {
  it("labels the control and links hint and error for screen readers", () => {
    render(
      <Field label="Email" hint="We never share it" error="Enter a valid email address" required>
        <Input />
      </Field>,
    );

    const input = screen.getByRole("textbox", { name: "Email" });
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("aria-required", "true");
    expect(input).toHaveAccessibleDescription("We never share it Enter a valid email address");
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a valid email address");
  });
});

describe("Button", () => {
  it("is a 44px-tall button that ignores clicks while loading", async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Save
      </Button>,
    );

    const button = screen.getByRole("button", { name: "Save" });
    expect(button.className).toContain("h-11");
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe("Stepper", () => {
  it("announces the current step", () => {
    render(<Stepper steps={["Account", "Profile", "Business"]} current={1} />);

    expect(screen.getByText("2")).toHaveAttribute("aria-current", "step");
    expect(screen.getByText("Account")).toHaveTextContent("Account (completed)");
  });
});

describe("status components", () => {
  it("always shows a text label on pills (no colour-only status)", () => {
    render(<StatusPill tone="success">Active</StatusPill>);
    expect(screen.getByText("Active")).toBeVisible();
  });

  it("renders empty, error, permission and not-configured states", () => {
    render(
      <>
        <EmptyState title="No leads yet" description="Share your page to get enquiries." />
        <ErrorState requestId="req-123" />
        <PermissionDenied />
        <NotConfiguredNotice name="Email" />
      </>,
    );

    expect(screen.getByRole("heading", { name: "No leads yet" })).toBeInTheDocument();
    expect(screen.getByText("Reference: req-123")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "You don't have access to this" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Email: Not configured.");
  });

  it("shows a KPI value it was given — and nothing invented", () => {
    render(<KpiCard label="Active clients" value={0} caption="Clients with status active" />);
    expect(screen.getByText("0")).toBeInTheDocument();
  });
});

describe("DataList", () => {
  const rows = [
    { id: "1", name: "Asha", goal: "Strength" },
    { id: "2", name: "Ravi", goal: "Mobility" },
  ];
  const columns = [
    { key: "name", header: "Name", cell: (row: (typeof rows)[number]) => row.name },
    { key: "goal", header: "Goal", cell: (row: (typeof rows)[number]) => row.goal },
  ];

  it("renders the same rows as a table and as cards", () => {
    render(
      <DataList
        rows={rows}
        columns={columns}
        rowKey={(row) => row.id}
        caption="Clients"
        cardTitle={(row) => row.name}
      />,
    );

    expect(screen.getByRole("table", { name: "Clients" })).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(3);
    expect(screen.getByRole("list", { name: "Clients" }).querySelectorAll("li")).toHaveLength(2);
  });
});

describe("FilterBar", () => {
  it("reports tab changes and marks the selected tab", async () => {
    const onTabChange = vi.fn();
    render(
      <FilterBar
        tabs={[
          { value: "all", label: "All", count: 3 },
          { value: "new", label: "New", count: 1 },
        ]}
        activeTab="all"
        onTabChange={onTabChange}
      />,
    );

    expect(screen.getByRole("tab", { name: /All/ })).toHaveAttribute("aria-selected", "true");
    await userEvent.click(screen.getByRole("tab", { name: /New/ }));
    expect(onTabChange).toHaveBeenCalledWith("new");
  });
});

describe("EnvironmentRibbon", () => {
  it("labels staging and stays hidden everywhere else", () => {
    const { rerender } = render(<EnvironmentRibbon appEnv="staging" />);
    expect(screen.getByRole("note")).toHaveTextContent("Staging environment — test data only");

    for (const appEnv of ["production", "development", "test", undefined]) {
      rerender(<EnvironmentRibbon appEnv={appEnv} />);
      expect(screen.queryByRole("note")).not.toBeInTheDocument();
    }
  });
});
