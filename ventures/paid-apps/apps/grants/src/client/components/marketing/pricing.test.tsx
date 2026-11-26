// @vitest-environment happy-dom
import { formatCents } from "@client/lib/api";
import { PLAN_LIST, PLANS, type Plan } from "@shared/billing/plans";
import { render, screen, within } from "@testing-library/react";
import type * as React from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, params, ...rest }: Record<string, unknown>) => (
    <a
      href={String(to).replace("$doc", String((params as { doc?: string } | undefined)?.doc))}
      {...(rest as React.AnchorHTMLAttributes<HTMLAnchorElement>)}
    >
      {children as React.ReactNode}
    </a>
  ),
  useNavigate: () => vi.fn(),
}));

const { PricingSection } = await import("./pricing");
const { draftsPerMonthLabel, marketingPlans, seatsLabel } = await import("./plan-copy");

const forSale = PLAN_LIST.filter((p) => p.purchasable);

function planCard(name: string) {
  const card = screen.getByRole("article", { name });
  return within(card);
}

describe("<PricingSection>", () => {
  it("renders one card per purchasable plan, cheapest first, and never the comp plan", () => {
    render(<PricingSection />);
    const names = screen
      .getAllByRole("article")
      .map((a) => within(a).getByRole("heading", { level: 3 }).textContent);
    expect(names).toEqual(
      [...forSale].sort((a, b) => a.priceCents - b.priceCents).map((p) => p.name),
    );
    expect(forSale.length).toBeGreaterThan(0);
    expect(screen.queryByText(PLANS.comp.name)).not.toBeInTheDocument();
  });

  it("shows each plan's monthly price, yearly price, drafts per month, seats and features from PLANS", () => {
    render(<PricingSection />);
    for (const plan of forSale) {
      const card = planCard(plan.name);
      expect(card.getByText(formatCents(plan.priceCents))).toBeInTheDocument();
      if (plan.annualPriceCents) {
        expect(
          card.getByText(`or ${formatCents(plan.annualPriceCents)} a year if you pay yearly`),
        ).toBeInTheDocument();
      }
      expect(
        card.getByText(draftsPerMonthLabel(plan.includedApplicationDrafts)),
      ).toBeInTheDocument();
      expect(card.getByText(seatsLabel(plan.seats))).toBeInTheDocument();
      for (const feature of plan.features) expect(card.getByText(feature)).toBeInTheDocument();
      expect(card.getByRole("link", { name: `Choose ${plan.name}` })).toHaveAttribute(
        "href",
        "/signup",
      );
    }
  });

  it("states the 30-day money-back guarantee and links the refund policy", () => {
    render(<PricingSection />);
    expect(
      screen.getByRole("heading", { name: "30-day money-back guarantee" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/full refund within 30 days of your first payment/),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Refund Policy/ })).toHaveAttribute(
      "href",
      "/legal/refunds",
    );
  });

  it("shows no struck-through prices, percent-off claims or popularity badges", () => {
    const { container } = render(<PricingSection />);
    expect(container.querySelectorAll("s, del, strike")).toHaveLength(0);
    expect(container.textContent).not.toMatch(
      /% off|save \d|most popular|best value|limited time/i,
    );
  });

  it("follows the plan data it is given", () => {
    const custom: Plan = {
      ...PLANS.standard,
      key: "standard",
      name: "Coalition",
      priceCents: 1_200,
      annualPriceCents: null,
      includedApplicationDrafts: 1,
      seats: 1,
      features: ["Shared calendar"],
    };
    render(<PricingSection plans={[custom, PLANS.comp]} />);
    expect(screen.getAllByRole("article")).toHaveLength(1);
    const card = planCard("Coalition");
    expect(card.getByText("$12")).toBeInTheDocument();
    expect(card.getByText("1 application draft a month")).toBeInTheDocument();
    expect(card.getByText("Up to 1 team member")).toBeInTheDocument();
    expect(card.getByText("Room for 12 applications a year")).toBeInTheDocument();
    expect(card.queryByText(/a year if you pay yearly/)).not.toBeInTheDocument();
    expect(marketingPlans([custom, PLANS.comp])).toEqual([custom]);
  });
});
