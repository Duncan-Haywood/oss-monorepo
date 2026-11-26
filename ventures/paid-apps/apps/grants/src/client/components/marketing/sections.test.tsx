// @vitest-environment happy-dom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

const { LandingPage } = await import("@client/routes/public/landing");

describe("<LandingPage>", () => {
  it("has one h1, labelled sections and a sign-up call to action", () => {
    render(<LandingPage />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    for (const name of [
      /Good work goes unfunded/,
      /Four steps/,
      /Built to never make things up/,
      /Your data stays yours/,
      /Priced close to what it costs us/,
      /Frequently asked questions/,
    ]) {
      expect(screen.getByRole("region", { name })).toBeInTheDocument();
    }
    expect(screen.getByRole("link", { name: "Get started" })).toHaveAttribute("href", "/signup");
    expect(document.title).toMatch(/^Grant Autopilot/);
  });

  it("answers the core questions and expands an answer on click", async () => {
    const user = userEvent.setup();
    render(<LandingPage />);
    const faq = within(screen.getByRole("region", { name: /Frequently asked questions/ }));
    for (const q of [
      /accurate/,
      /train AI/,
      /cost/,
      /Grants\.gov/,
      /refund/,
      /documents and data/,
    ]) {
      expect(faq.getByText(q, { selector: "summary span" })).toBeInTheDocument();
    }
    const summary = faq.getByText(/Grants\.gov/, { selector: "summary span" });
    const details = summary.closest("details");
    expect(details).not.toHaveAttribute("open");
    await user.click(summary);
    expect(details).toHaveAttribute("open");
  });

  it("lists every policy and names the operator in the footer", () => {
    render(<LandingPage />);
    const policies = within(screen.getByRole("navigation", { name: "Policies" }));
    expect(policies.getByRole("link", { name: "Refund Policy" })).toHaveAttribute(
      "href",
      "/legal/refunds",
    );
    expect(policies.getAllByRole("link")).toHaveLength(5);
    expect(screen.getByText(/operated by Mary Stella Labs, LLC/)).toBeInTheDocument();
  });
});
