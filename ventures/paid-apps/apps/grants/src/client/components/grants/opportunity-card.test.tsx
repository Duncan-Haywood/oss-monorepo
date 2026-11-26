// @vitest-environment happy-dom
import { cleanup, render, screen, within } from "@testing-library/react";
import type * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OpportunityCard } from "./opportunity-card";
import { inDays, makeMatch, makeOpportunity, NOW } from "./test-fixtures";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    params,
    children,
    ...rest
  }: {
    to: string;
    params?: Record<string, string>;
    children: React.ReactNode;
  } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => {
    let href = to;
    for (const [k, v] of Object.entries(params ?? {})) href = href.replace(`$${k}`, v);
    return (
      <a href={href} {...rest}>
        {children}
      </a>
    );
  },
}));

function urgencyOf(container: HTMLElement) {
  return container.querySelector("[data-urgency]")?.getAttribute("data-urgency");
}

afterEach(cleanup);

describe("OpportunityCard", () => {
  it("marks deadlines under 14 days as urgent (red) with relative + absolute date", () => {
    const { container } = render(
      <OpportunityCard
        orgId="org_1"
        now={NOW}
        opportunity={makeOpportunity({ closeDate: inDays(5) })}
      />,
    );
    expect(urgencyOf(container)).toBe("urgent");
    const deadline = container.querySelector("[data-urgency]") as HTMLElement;
    expect(deadline).toHaveClass("text-danger-700");
    expect(deadline).toHaveTextContent("Closes in 5 days");
    expect(deadline).toHaveTextContent("Nov 24, 2026");
  });

  it("does not flag deadlines 14+ days out as urgent", () => {
    const { container } = render(
      <OpportunityCard
        orgId="org_1"
        now={NOW}
        opportunity={makeOpportunity({ closeDate: inDays(45) })}
      />,
    );
    expect(urgencyOf(container)).toBe("normal");
    expect(container.querySelector("[data-urgency]")).not.toHaveClass("text-danger-700");
    expect(screen.getByText(/Closes in 45 days/)).toBeInTheDocument();
  });

  it("renders title link, funder, award range and match badges", () => {
    render(
      <OpportunityCard
        orgId="org_1"
        now={NOW}
        opportunity={makeOpportunity({
          match: makeMatch({
            fitScore: 82,
            eligibility: "likely_eligible",
            likelihood: 0.35,
            expectedValueCents: 5_250_000,
            status: "shortlisted",
          }),
        })}
      />,
    );
    const link = screen.getByRole("link", { name: "YouthBuild Construction Training" });
    expect(link).toHaveAttribute("href", "/orgs/org_1/opportunities/opp_1");
    expect(screen.getByText("U.S. Department of Labor")).toBeInTheDocument();
    expect(screen.getByText("$50,000 – $250,000")).toBeInTheDocument();

    const meter = screen.getByRole("meter", { name: "Fit score" });
    expect(meter).toHaveAttribute("aria-valuenow", "82");
    expect(screen.getByText("82/100")).toBeInTheDocument();
    expect(screen.getByText("Likely eligible")).toBeInTheDocument();
    expect(screen.getByText("35% likely")).toBeInTheDocument();
    expect(screen.getByText("$52,500")).toBeInTheDocument();
    expect(screen.getByText("Shortlisted")).toBeInTheDocument();
  });

  it("shows a not-scored hint and a private badge for unmatched imported grants", () => {
    const { container } = render(
      <OpportunityCard
        orgId="org_1"
        now={NOW}
        opportunity={makeOpportunity({ match: null, privateToOrgId: "org_1", closeDate: null })}
      />,
    );
    expect(screen.queryByRole("meter")).not.toBeInTheDocument();
    expect(screen.getByText(/Not scored yet/)).toBeInTheDocument();
    expect(screen.getByText("Private import")).toBeInTheDocument();
    expect(within(container).getByText("No deadline listed")).toBeInTheDocument();
  });

  it("renders funder HTML as inert plain text", () => {
    render(
      <OpportunityCard
        orgId="org_1"
        now={NOW}
        opportunity={makeOpportunity({
          summary: '<p>Line one</p><img src=x onerror="alert(1)"><script>alert(2)</script>',
        })}
      />,
    );
    expect(document.querySelector("img")).toBeNull();
    expect(document.querySelector("script")).toBeNull();
    expect(screen.getByText(/Line one/)).toBeInTheDocument();
  });
});
