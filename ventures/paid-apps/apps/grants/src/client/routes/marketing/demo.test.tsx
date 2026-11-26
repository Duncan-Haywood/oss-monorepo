// @vitest-environment happy-dom
import { createHash } from "node:crypto";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, ...rest }: Record<string, unknown>) => (
    <a href={String(to)} {...(rest as React.AnchorHTMLAttributes<HTMLAnchorElement>)}>
      {children as React.ReactNode}
    </a>
  ),
  useNavigate: () => vi.fn(),
}));

const { DemoPage } = await import("./demo");
const { SITE_URL } = await import("@client/components/marketing/meta");
const { DEMO_DISCLAIMER } = await import("@client/components/demo/data");
const { initialFactStatuses, packageText } = await import("@client/components/demo/model");

let fetchSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, "fetch");
});
afterEach(() => {
  fetchSpy.mockRestore();
});

const stepHeading = () => document.getElementById("demo-step-title");
const next = (user: ReturnType<typeof userEvent.setup>, label: RegExp) =>
  user.click(screen.getByRole("button", { name: label }));

// Generous timeouts: the full page is a large DOM and CI machines are small.
describe("<DemoPage>", { timeout: 60_000 }, () => {
  it("has one h1, sets its meta and says the charity is imagined", () => {
    const { unmount } = render(<DemoPage />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(document.title).toBe("Interactive demo · Grant Autopilot");
    expect(document.head.querySelector('link[rel="canonical"]')).toHaveAttribute(
      "href",
      `${SITE_URL}/demo`,
    );
    expect(
      document.head.querySelector('meta[name="description"]')?.getAttribute("content"),
    ).toMatch(/imagined charity/);
    expect(screen.getAllByText(DEMO_DISCLAIMER).length).toBeGreaterThanOrEqual(2);
    unmount();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("walks through all six steps without a single network request", async () => {
    const user = userEvent.setup();
    render(<DemoPage />);
    const steps = screen.getByRole("navigation", { name: "Demo steps" });
    expect(within(steps).getAllByRole("button")).toHaveLength(6);
    expect(within(steps).getByRole("button", { current: "step" })).toHaveTextContent("Documents");
    expect(screen.getByRole("button", { name: "Back" })).toBeDisabled();

    // 1. Documents → facts: pick a document, see its facts and highlighted quotes, confirm one.
    expect(screen.getByText("Documents become facts")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Mission statement/ }));
    expect(screen.getByRole("heading", { name: "Mission statement" })).toBeInTheDocument();
    expect(document.querySelectorAll("mark[data-fact-id]")).toHaveLength(5);
    await user.click(screen.getByRole("button", { name: /2025 annual report/ }));
    const wage = screen.getByRole("article", { name: /median starting wage/ });
    expect(wage).toHaveAttribute("data-status", "proposed");
    await user.click(within(wage).getByRole("button", { name: /^Confirm/ }));
    expect(wage).toHaveAttribute("data-status", "confirmed");
    expect(within(wage).getByText("Confirmed")).toBeInTheDocument();

    // 2. Interview: scripted Q&A, then a typed answer becomes a proposed fact.
    await next(user, /Next: Interview/);
    expect(stepHeading()).toHaveTextContent("An interview fills the gaps");
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: /interview fills/ }));
    await user.click(screen.getByRole("button", { name: /Next question/ }));
    await user.click(screen.getByRole("button", { name: /Next question/ }));
    const box = screen.getByLabelText("Type your own answer");
    await user.type(box, "We had 35 volunteers in 2025.");
    const preview = screen.getByTestId("fact-proposal");
    expect(preview).toHaveTextContent("Juniper Mesa had 35 volunteers in 2025.");
    expect(preview).toHaveTextContent("“We had 35 volunteers in 2025.”");
    await user.click(screen.getByRole("button", { name: /Propose this fact/ }));
    expect(
      screen.getByRole("article", { name: "Juniper Mesa had 35 volunteers in 2025." }),
    ).toHaveAttribute("data-status", "proposed");

    // 3. Grant matches: ranked list, and the reasons open the facts behind them.
    await next(user, /Next: Grant matches/);
    const ranked = screen.getByRole("list", { name: "Ranked grant matches" });
    expect(within(ranked).getAllByRole("article")[0]).toHaveAccessibleName(
      "Rural Trades Pathways Grant",
    );
    expect(
      screen.getByRole("heading", { name: /Rural Trades Pathways Grant ranks first/ }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Supporting fact: Founded in 2014/ }));
    expect(await screen.findByRole("dialog", { name: "Supporting fact" })).toHaveTextContent(
      "“Founded in 2014 in Alder Flats”",
    );
    await user.keyboard("{Escape}");

    // 4. Draft review: citation popover with the verbatim quote, then Fix it clears the flag.
    await next(user, /Next: Draft review/);
    const draft = screen.getByTestId("demo-draft");
    expect(draft).toHaveTextContent("We served 500 families across both counties.");
    const flagged = draft.querySelector('[data-claim-id="c-families"]') as HTMLElement;
    await user.click(within(flagged).getByRole("button", { name: /View citation/ }));
    expect(await screen.findByRole("dialog", { name: /Citation/ })).toHaveTextContent(
      "“our programs served 320 families across both counties”",
    );
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: /Fix it/ }));
    expect(draft).toHaveTextContent(
      "In 2025, our programs served 320 families across both counties.",
    );
    expect(draft.querySelector('[data-issue="danger"]')).toBeNull();
    await user.type(screen.getByLabelText("Trainees in the first year"), "40");
    await user.click(screen.getByRole("button", { name: "Answer" }));
    expect(screen.getByTestId("fact-check-status")).toHaveTextContent("Passed");

    // 5. Automation level: the selector changes who does what and how matches are routed.
    await next(user, /Next: Automation/);
    const repair = () => document.querySelector('[data-opportunity="opp-repair"]');
    expect(repair()).toHaveAttribute("data-tier", "one_click");
    await user.click(screen.getByRole("radio", { name: /Autopilot for small grants/ }));
    expect(repair()).toHaveAttribute("data-tier", "auto");
    expect(document.querySelector('[data-opportunity="opp-federal"]')).toHaveAttribute(
      "data-tier",
      "full_review",
    );
    await user.click(screen.getByRole("radio", { name: /Manual/ }));
    expect(screen.getByRole("heading", { name: "Who does what: Manual" })).toBeInTheDocument();
    expect(screen.getByText(/Safety rails at every level/)).toBeInTheDocument();

    // 6. Submit: integrity hash of the exact package, simulated approval, follow-ups, sign-up CTA.
    await next(user, /Next: Submit/);
    const expected = createHash("sha256")
      .update(packageText({ fixed: true, gapAnswer: 40 }, initialFactStatuses()))
      .digest("hex");
    await waitFor(() => expect(screen.getByTestId("package-hash")).toHaveTextContent(expected));
    await user.click(screen.getByRole("button", { name: /Approve & submit/ }));
    expect(screen.getByText(/Approved and submitted \(simulated/)).toBeInTheDocument();
    expect(screen.getByText(/Follow-up reminders/)).toBeInTheDocument();
    const ctas = screen.getAllByRole("link", { name: /Start with your own organization/ });
    for (const a of ctas) expect(a).toHaveAttribute("href", "/signup");
    expect(screen.queryByRole("button", { name: /^Next:/ })).not.toBeInTheDocument();

    // Back keeps earlier work: the draft is still fixed.
    await user.click(screen.getByRole("button", { name: "Back" }));
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByTestId("demo-draft")).not.toHaveTextContent("500 families");

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("moves between steps with the keyboard", async () => {
    const user = userEvent.setup();
    render(<DemoPage />);
    const steps = screen.getByRole("navigation", { name: "Demo steps" });
    const [first, second] = within(steps).getAllByRole("button");
    first?.focus();
    await user.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(second);
    await user.keyboard("{Enter}");
    expect(second).toHaveAttribute("aria-current", "step");
    expect(stepHeading()).toHaveTextContent("An interview fills the gaps");
    // Activating a step moves focus to its heading, so screen readers announce it.
    expect(document.activeElement).toBe(stepHeading());
    second?.focus();
    await user.keyboard("{End}{Enter}");
    expect(stepHeading()).toHaveTextContent("Submit and follow up");
    // With blockers still open, approval is disabled and points back to the draft.
    expect(screen.getByRole("button", { name: /Approve & submit/ })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: /Back to the draft review/ }));
    expect(stepHeading()).toHaveTextContent("Review a draft, claim by claim");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
