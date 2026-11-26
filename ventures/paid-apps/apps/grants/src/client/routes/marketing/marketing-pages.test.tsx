// @vitest-environment happy-dom
import { SITE_URL } from "@client/components/marketing/meta";
import { CONTACT_EMAIL } from "@client/components/marketing/site-map";
import { formatCents } from "@client/lib/api";
import { PAID_PLAN_KEYS, PLANS } from "@shared/billing/plans";
import { cleanup, render, screen, within } from "@testing-library/react";
import type * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

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

const { HowItWorksPage } = await import("./how-it-works");
const { PricingPage } = await import("./pricing");
const { TrustPage } = await import("./trust");
const { FaqPage } = await import("./faq");
const { AboutPage } = await import("./about");
const { ContactPage } = await import("./contact");
const { WorkforcePage } = await import("./workforce");

afterEach(cleanup);

const pages: [string, React.ComponentType, RegExp, string][] = [
  ["how it works", HowItWorksPage, /From your own records/, "/how-it-works"],
  ["pricing", PricingPage, /Priced close to what it costs us to run/, "/pricing"],
  ["trust", TrustPage, /Your records are safe with us/, "/trust"],
  ["faq", FaqPage, /Frequently asked questions/, "/faq"],
  ["about", AboutPage, /teams without a grant writer/, "/about"],
  ["contact", ContactPage, /Contact us/, "/contact"],
  ["workforce", WorkforcePage, /workforce and trades training programs/, "/for-workforce-programs"],
];

describe("marketing pages", () => {
  it.each(pages)("%s renders exactly one h1 and sets its meta", (_, Page, h1, path) => {
    const { unmount } = render(<Page />);
    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent(h1);
    expect(document.title).toMatch(/ · Grant Autopilot$/);
    expect(document.head.querySelector('link[rel="canonical"]')).toHaveAttribute(
      "href",
      `${SITE_URL}${path}`,
    );
    expect(
      document.head.querySelector('meta[name="description"]')?.getAttribute("content"),
    ).toBeTruthy();
    // The shared footer CTA and site map are on every page.
    expect(screen.getByRole("navigation", { name: "Product" })).toBeInTheDocument();
    unmount();
    expect(document.head.querySelector('link[rel="canonical"]')).toBeNull();
  });

  it("does not name clients or show testimonials", () => {
    for (const [, Page] of pages) {
      const { container, unmount } = render(<Page />);
      expect(container.textContent).not.toMatch(/Southwest Indian|SWIF|testimonial|trusted by/i);
      unmount();
    }
  });
});

describe("<PricingPage>", () => {
  it("renders every paid plan from PLANS and never the comp plan", () => {
    render(<PricingPage />);
    for (const key of PAID_PLAN_KEYS) {
      const plan = PLANS[key];
      const card = within(screen.getByRole("article", { name: plan.name }));
      expect(card.getByText(formatCents(plan.priceCents))).toBeInTheDocument();
      expect(screen.getByRole("columnheader", { name: plan.name })).toBeInTheDocument();
    }
    expect(screen.queryByText(PLANS.comp.name)).not.toBeInTheDocument();
    expect(screen.queryByText(/complimentary/i)).not.toBeInTheDocument();
  });

  it("explains drafts, the cost-based rationale, refunds and promo codes", () => {
    render(<PricingPage />);
    for (const name of [
      /What counts as a draft/,
      /Why it costs what it does/,
      /Refunds and promo codes/,
      /Pricing questions/,
    ]) {
      expect(screen.getByRole("region", { name })).toBeInTheDocument();
    }
    expect(screen.getByText(/plus a margin to keep the lights on/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Read the full Refund Policy/ })).toHaveAttribute(
      "href",
      "/legal/refunds",
    );
  });
});

describe("<FaqPage>", () => {
  it("answers the required questions", () => {
    render(<FaqPage />);
    for (const q of [
      "Will it make things up?",
      "Do we lose control?",
      "Do you train AI on our data?",
      "What if we're not registered on SAM.gov?",
      "Can multiple staff use it?",
      "What does it cost?",
      "Refunds?",
      "Can it submit to Grants.gov?",
    ]) {
      expect(screen.getByText(q, { selector: "summary span" })).toBeInTheDocument();
    }
    const grantsGov = screen.getByText("Can it submit to Grants.gov?").closest("details");
    expect(grantsGov).toHaveTextContent(/Not yet/);
  });
});

describe("<TrustPage>", () => {
  it("lists subprocessors and links every policy", () => {
    render(<TrustPage />);
    const table = within(screen.getByRole("table", { name: /Subprocessors/ }));
    expect(table.getByRole("rowheader", { name: "Anthropic, PBC" })).toBeInTheDocument();
    expect(table.getByRole("rowheader", { name: "Cloudflare, Inc." })).toBeInTheDocument();
    const policies = within(screen.getByRole("region", { name: "Read the policies" }));
    expect(policies.getAllByRole("link")).toHaveLength(5);
    expect(policies.getByRole("link", { name: /Data Use Policy/ })).toHaveAttribute(
      "href",
      "/legal/data-use",
    );
  });
});

describe("<ContactPage>", () => {
  it("offers a mailto link and no form", () => {
    const { container } = render(<ContactPage />);
    expect(screen.getByRole("link", { name: /Send an email/ })).toHaveAttribute(
      "href",
      `mailto:${CONTACT_EMAIL}`,
    );
    expect(container.querySelector("form")).toBeNull();
  });
});
