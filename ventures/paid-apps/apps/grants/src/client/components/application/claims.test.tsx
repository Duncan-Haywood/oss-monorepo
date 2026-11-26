// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type * as React from "react";
import { describe, expect, it, vi } from "vitest";
import type { CitationContext } from "./claims";
import { citationNumbers, requirementFor, verdictMap } from "./model";
import { SectionCard } from "./section-card";
import { makeDetail } from "./test-fixtures";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <a href="/mock" className={className}>
      {children}
    </a>
  ),
  useNavigate: () => vi.fn(),
  useParams: () => ({ orgId: "org_1", applicationId: "app_1" }),
}));

function renderSection() {
  const app = makeDetail();
  const version = app.currentVersion;
  if (!version) throw new Error("fixture has a version");
  const ctx: CitationContext = {
    orgId: "org_1",
    numbers: citationNumbers(version.content),
    facts: new Map(app.citedFacts.map((f) => [f.id, f])),
    verdicts: verdictMap(version.groundingReport),
  };
  const section = version.content.sections[0];
  if (!section) throw new Error("fixture has a section");
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <SectionCard
        section={section}
        requirement={requirementFor(app.opportunity, section.key)}
        ctx={ctx}
        applicationId={app.id}
        canEdit={false}
      />
    </QueryClientProvider>,
  );
}

describe("claim rendering", () => {
  it("renders claims as one flowing paragraph with numbered citation buttons", () => {
    const { container } = renderSection();
    const paragraph = container.querySelector("p.leading-7");
    expect(paragraph?.textContent).toContain(
      "Southwest Indian Foundation has served Gallup since 1968.",
    );
    expect(paragraph?.textContent).toContain("We welcome the opportunity");
    expect(screen.getByRole("button", { name: "View citation 1" })).toHaveAttribute(
      "data-status",
      "confirmed",
    );
    // Citation of a proposed (unconfirmed) fact uses the warning tone.
    const second = screen.getByRole("button", { name: "View citation 2" });
    expect(second).toHaveAttribute("data-status", "unconfirmed");
    expect(second.className).toMatch(/warning/);
    expect(screen.getByRole("heading", { name: "Statement of need" })).toBeInTheDocument();
    expect(screen.getByText(/\d+ \/ 50 words/)).toBeInTheDocument();
  });

  it("opens a popover with the fact statement, status and verbatim source quote on click", async () => {
    const user = userEvent.setup();
    renderSection();
    await user.click(screen.getByRole("button", { name: "View citation 1" }));
    const dialog = await screen.findByRole("dialog", { name: "Citation 1" });
    expect(
      within(dialog).getByText(
        "Southwest Indian Foundation was founded in 1968 in Gallup, New Mexico.",
      ),
    ).toBeInTheDocument();
    expect(within(dialog).getByText("Confirmed")).toBeInTheDocument();
    const quote = dialog.querySelector("blockquote");
    expect(quote?.textContent).toContain(
      "SWIF was founded in 1968 to serve the people of the Navajo Nation around Gallup.",
    );
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("opens on keyboard focus and warns when the cited fact is unconfirmed", async () => {
    const user = userEvent.setup();
    renderSection();
    const second = screen.getByRole("button", { name: "View citation 2" });
    second.focus();
    const dialog = await screen.findByRole("dialog", { name: "Citation 2" });
    expect(within(dialog).getByText("Needs review")).toBeInTheDocument();
    expect(dialog.querySelector("blockquote")?.textContent).toContain(
      "In 2025 the academy trained 85 trainees",
    );
    expect(within(dialog).getByText(/Nobody has confirmed this fact yet/)).toBeInTheDocument();
    await user.tab();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("highlights a claim whose numbers don't match its facts, with the reason in a tooltip", async () => {
    const user = userEvent.setup();
    const { container } = renderSection();
    const flagged = container.querySelector('[data-claim-id="need.p1.c2"]');
    expect(flagged).toHaveAttribute("data-issue", "danger");
    expect(flagged?.className).toMatch(/danger/);
    expect(container.querySelector('[data-claim-id="need.p1.c1"]')).not.toHaveAttribute(
      "data-issue",
    );
    const why = screen.getByRole("button", { name: /Not supported: 120 doesn't appear/ });
    await user.hover(why);
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "120 doesn't appear in the cited facts.",
    );
  });

  it("shows unanswerable questions as gaps instead of invented text", () => {
    renderSection();
    expect(screen.getByText("Needs your input:")).toBeInTheDocument();
    expect(
      screen.getByText("How many participants will the project serve in year one?"),
    ).toBeInTheDocument();
  });
});
