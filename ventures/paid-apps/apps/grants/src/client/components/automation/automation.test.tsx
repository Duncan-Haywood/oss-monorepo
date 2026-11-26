// @vitest-environment happy-dom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type * as React from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, params, ...rest }: Record<string, unknown>) => (
    <a
      href={String(to).replace("$orgId", String((params as { orgId?: string })?.orgId))}
      {...(rest as React.AnchorHTMLAttributes<HTMLAnchorElement>)}
    >
      {children as React.ReactNode}
    </a>
  ),
}));

const { AutomationChip, waitingHint } = await import("./automation-chip");
const { AutomationPreviewTable, pickPreview } = await import("./automation-preview");
const { AutomationLevelSelector } = await import("./level-selector");
const { SafetyRailsList } = await import("./safety-rails");
const { consentText } = await import("./consent-dialog");

describe("<AutomationLevelSelector>", () => {
  it("offers five levels, marks Prepared as recommended and reports picks", async () => {
    const onChange = vi.fn();
    render(<AutomationLevelSelector value="prepared" onChange={onChange} />);
    const radios = screen.getAllByRole("radio");
    expect(radios.map((r) => (r as HTMLInputElement).value)).toEqual([
      "manual",
      "assisted",
      "prepared",
      "supervised",
      "full",
    ]);
    expect(screen.getByRole("radio", { name: /Prepared/ })).toBeChecked();
    expect(screen.getByTestId("level-card")).toHaveTextContent("Recommended");
    expect(screen.getByTestId("level-card")).toHaveTextContent("For example");
    await userEvent.click(screen.getByRole("radio", { name: /Supervised/ }));
    expect(onChange).toHaveBeenCalledWith("supervised");
  });

  it("hides the example in compact form and can be disabled", () => {
    render(<AutomationLevelSelector value="manual" onChange={() => {}} compact disabled />);
    expect(screen.getByTestId("level-card")).not.toHaveTextContent("For example");
    for (const r of screen.getAllByRole("radio")) expect(r).toBeDisabled();
  });
});

describe("<SafetyRailsList>", () => {
  it("is a locked list without controls", () => {
    render(<SafetyRailsList />);
    expect(screen.getByText("Always on, at every level")).toBeInTheDocument();
    const list = screen.getByRole("list", { name: "Safety rails (always on)" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(9);
    expect(within(list).getAllByLabelText("Locked")).toHaveLength(9);
    expect(within(list).queryByRole("switch")).toBeNull();
    expect(within(list).queryByRole("checkbox")).toBeNull();
  });
});

describe("automation preview", () => {
  const policy = {
    autopilotEnabled: false,
    autoSubmitMaxCents: 1_000_000,
    fullReviewAboveCents: 10_000_000,
    minFitScoreForAuto: 80,
    highLikelihoodThreshold: 0.6,
    reviewFirstSubmissionPerFunder: true,
    maxAutoSubmissionsPerMonth: 5,
    automationLevel: "full" as const,
  };
  const server = {
    examples: [
      {
        label: "From the server",
        amountCents: 100_000,
        fitScore: 90,
        likelihood: 0.2,
        firstToFunder: true,
        tier: "auto" as const,
        reasons: ["Every rail passed"],
      },
    ],
  };

  it("prefers the server for saved settings and the client estimate otherwise", () => {
    expect(pickPreview(server, policy, false).source).toBe("server");
    expect(pickPreview(server, policy, true).source).toBe("unsaved");
    const fallback = pickPreview(undefined, policy, false);
    expect(fallback.source).toBe("estimate");
    expect(fallback.examples.map((e) => e.tier)).toEqual(["auto", "one_click", "one_click"]);
  });

  it("renders each example with its tier and reasons", () => {
    render(<AutomationPreviewTable examples={server.examples} source="server" />);
    const row = screen.getByText("From the server").closest("tr") as HTMLElement;
    expect(within(row).getByText("$1,000")).toBeInTheDocument();
    expect(within(row).getByText("Automatic")).toBeInTheDocument();
    expect(within(row).getByText("Every rail passed")).toBeInTheDocument();
    expect(within(row).getByText("First time applying to this funder")).toBeInTheDocument();
  });
});

describe("<AutomationChip>", () => {
  it("links to the autopilot settings and says what's waiting", () => {
    render(
      <AutomationChip
        orgId="org_1"
        settings={{ automationLevel: "prepared", autopilotEnabled: false }}
        waiting={2}
        reviews={2}
      />,
    );
    expect(screen.getByRole("link", { name: /Automation: Prepared/ })).toHaveAttribute(
      "href",
      "/orgs/org_1/settings/autopilot",
    );
    expect(screen.getByRole("link", { name: "2 approvals waiting on you" })).toHaveAttribute(
      "href",
      "/orgs/org_1/reviews",
    );
  });

  it("renders nothing until settings load", () => {
    const { container } = render(
      <AutomationChip orgId="org_1" settings={undefined} waiting={0} reviews={0} />,
    );
    expect(container).toBeEmptyDOMElement();
    expect(waitingHint(0, 0)).toBe("Nothing is waiting on you");
    expect(waitingHint(3, 1)).toBe("3 items waiting on you");
  });
});

describe("consentText", () => {
  it("names the org and the money-back guarantee", () => {
    const text = consentText("Acme Youth Services", "supervised");
    expect(text).toMatch(/^On behalf of Acme Youth Services/);
    expect(text).toMatch(/30-day money-back guarantee/);
  });
});
