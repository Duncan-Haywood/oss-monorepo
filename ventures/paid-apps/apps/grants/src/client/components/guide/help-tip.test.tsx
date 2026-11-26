// @vitest-environment happy-dom
import { HELP, HELP_TERMS, matchesHelpQuery } from "@client/content/help";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const navigate = vi.fn();
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
}));

const { HelpTip } = await import("./help-tip");

describe("<HelpTip>", () => {
  it("is a named button that opens an accessible popover and closes on Escape", async () => {
    // HelpTip reads the org from the URL, not the router.
    window.history.pushState({}, "", "/orgs/org_1/opportunities");
    render(
      <p>
        Fit score <HelpTip term="fit_score" />
      </p>,
    );
    const button = screen.getByRole("button", { name: "What is fit score?" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(button).toHaveAttribute("aria-haspopup", "dialog");

    await userEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    const panel = screen.getByRole("dialog", { name: "Fit score" });
    expect(button).toHaveAttribute("aria-controls", panel.id);
    expect(panel).toHaveTextContent(HELP.fit_score.short);
    expect(screen.getByRole("link", { name: "Learn more in the help center" })).toHaveAttribute(
      "href",
      "/orgs/org_1/help#help-fit_score",
    );

    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(button).toHaveFocus();
  });

  it("is reachable by keyboard and toggles with Enter", async () => {
    render(<HelpTip term="proposed_fact" />);
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "What is proposed fact?" })).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    expect(screen.getByRole("dialog", { name: "Proposed fact" })).toBeInTheDocument();
  });
});

describe("help content", () => {
  it("defines every key concept with short, plain copy", () => {
    for (const key of [
      "fit_score",
      "likelihood",
      "expected_value",
      "review_tier",
      "grounding",
      "proposed_fact",
    ] as const) {
      expect(HELP_TERMS).toContain(key);
    }
    for (const t of HELP_TERMS) {
      expect(HELP[t].id).toBe(t);
      expect(HELP[t].short.length).toBeLessThan(220);
    }
  });

  it("search matches terms, bodies and keywords (all words)", () => {
    expect(matchesHelpQuery(HELP.expected_value, "ranking")).toBe(true);
    expect(matchesHelpQuery(HELP.expected_value, "likelihood ask")).toBe(true);
    expect(matchesHelpQuery(HELP.expected_value, "invite")).toBe(false);
    expect(matchesHelpQuery(HELP.expected_value, "  ")).toBe(true);
  });
});
