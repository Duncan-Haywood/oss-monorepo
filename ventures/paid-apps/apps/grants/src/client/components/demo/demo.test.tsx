// @vitest-environment happy-dom
import { createHash } from "node:crypto";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DraftState } from "./model";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, ...rest }: Record<string, unknown>) => (
    <a href={String(to)} {...(rest as React.AnchorHTMLAttributes<HTMLAnchorElement>)}>
      {children as React.ReactNode}
    </a>
  ),
  useNavigate: () => vi.fn(),
}));

const data = await import("./data");
const model = await import("./model");
const { DemoTour } = await import("./demo-tour");
const { DemoCta } = await import("./demo-cta");

const { DEMO_DOCUMENTS, DEMO_DRAFT, DEMO_FACTS, MISMATCH, factById } = data;
const {
  AUTOMATION_LEVELS,
  draftFlags,
  expectedValueCents,
  factCheck,
  initialFactStatuses,
  levelById,
  packageText,
  proposeFactFromAnswer,
  quoteSegments,
  rankOpportunities,
  routeDemoMatches,
  sha256Hex,
} = model;

const numbersIn = (s: string) => (s.match(/\d[\d,.]*\d|\d/g) ?? []).map((n) => n.replace(/,/g, ""));
const clean: DraftState = { fixed: true, gapAnswer: 40 };
const fresh: DraftState = { fixed: false, gapAnswer: null };

let fetchSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, "fetch");
});
afterEach(() => {
  expect(fetchSpy).not.toHaveBeenCalled();
  fetchSpy.mockRestore();
});

describe("demo fixtures", () => {
  it("has about fifteen facts across three short source documents", () => {
    expect(DEMO_DOCUMENTS).toHaveLength(3);
    expect(DEMO_FACTS.length).toBeGreaterThanOrEqual(14);
    expect(DEMO_FACTS.length).toBeLessThanOrEqual(18);
    expect(new Set(DEMO_FACTS.map((f) => f.id)).size).toBe(DEMO_FACTS.length);
  });

  it("quotes every fact word for word from its source document", () => {
    for (const f of DEMO_FACTS) {
      const doc = DEMO_DOCUMENTS.find((d) => d.id === f.documentId);
      const hit = doc?.paragraphs.some((p) => p.text.includes(f.quote));
      expect(hit, `${f.id} quote not found in ${f.documentId}`).toBe(true);
    }
  });

  it("highlights every quote in its document without overlaps", () => {
    for (const doc of DEMO_DOCUMENTS) {
      const facts = DEMO_FACTS.filter((f) => f.documentId === doc.id);
      const highlighted = doc.paragraphs.flatMap((p) =>
        quoteSegments(p.text, facts).flatMap((s) => (s.factId ? [s.factId] : [])),
      );
      expect(highlighted.sort()).toEqual(facts.map((f) => f.id).sort());
      for (const p of doc.paragraphs) {
        expect(
          quoteSegments(p.text, facts)
            .map((s) => s.text)
            .join(""),
        ).toBe(p.text);
      }
    }
  });

  it("only states numbers the cited facts support, except the deliberate 500 families", () => {
    const claims = model.resolveDraft(clean, initialFactStatuses()).flat();
    for (const c of claims.filter((x) => x.factIds.every((id) => factById(id)))) {
      const supported = new Set(
        c.factIds.flatMap((id) => {
          const f = factById(id);
          return f ? [...numbersIn(f.quote), ...(f.asOf ? [f.asOf] : [])] : [];
        }),
      );
      for (const n of numbersIn(c.text)) expect(supported, `${c.id}: ${n}`).toContain(n);
    }
    const families = factById(MISMATCH.factId);
    expect(numbersIn(MISMATCH.unsupportedText)).toEqual(["500"]);
    expect(families?.quote).toContain("320");
    expect(families?.quote).not.toContain("500");
  });

  it("labels the charity as imagined", () => {
    expect(data.DEMO_DISCLAIMER).toBe("Demo data: Juniper Mesa is an imagined charity");
  });
});

describe("proposeFactFromAnswer", () => {
  it("quotes the sentence with a number and rewrites it in the third person", () => {
    const r = proposeFactFromAnswer(
      "Honestly it varies. In 2025, 35 volunteers gave about 1,200 hours alongside our crews.",
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.fact.quote).toBe("In 2025, 35 volunteers gave about 1,200 hours alongside our crews.");
    expect(r.fact.statement).toBe(
      "In 2025, 35 volunteers gave about 1,200 hours alongside Juniper Mesa's crews.",
    );
    expect(r.fact.numbers).toEqual(["35", "1,200"]);
    expect(r.fact.asOf).toBe("2025");
    expect(r.fact.category).toBe("capacity");
    expect(r.fact.notes.join(" ")).toMatch(/approximate/);
    expect(r.fact.notes.join(" ")).toMatch(/Only one sentence/);
  });

  it("flags vague answers and missing years instead of inventing numbers", () => {
    const r = proposeFactFromAnswer("We had lots of volunteers last year");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.fact.statement).toBe("Juniper Mesa had lots of volunteers last year.");
    expect(r.fact.numbers).toEqual([]);
    expect(r.fact.notes.join(" ")).toMatch(/No number found/);
    expect(r.fact.notes.join(" ")).toMatch(/“lots” is vague/);
    expect(r.fact.notes.join(" ")).toMatch(/which year/);
  });

  it("asks for more than a couple of words", () => {
    expect(proposeFactFromAnswer("  35 ")).toEqual({ ok: false, reason: expect.any(String) });
  });
});

describe("matches", () => {
  it("ranks by expected value (likelihood × ask), then fit", () => {
    const ranked = rankOpportunities();
    expect(ranked.map((o) => o.id)).toEqual([
      "opp-trades",
      "opp-federal",
      "opp-repair",
      "opp-arts",
    ]);
    expect(ranked.map(expectedValueCents)).toEqual([2_520_000, 2_400_000, 480_000, 30_000]);
    for (const r of ranked[0]?.reasons ?? []) {
      for (const id of r.factIds) expect(factById(id)).toBeDefined();
    }
  });
});

describe("draft flags and fact-check", () => {
  it("starts with the number mismatch and the gap as blockers", () => {
    const statuses = initialFactStatuses();
    expect(draftFlags(fresh, statuses).map((f) => [f.kind, f.severity])).toEqual([
      ["numeric_mismatch", "blocker"],
      ["missing_info", "blocker"],
    ]);
    expect(factCheck(fresh, statuses)).toMatchObject({
      numericMismatches: 1,
      gaps: 1,
      passed: false,
    });
    expect(factCheck(clean, statuses)).toMatchObject({
      numericMismatches: 0,
      gaps: 0,
      passed: true,
    });
  });

  it("flags sentences that cite rejected or unconfirmed facts", () => {
    const statuses = {
      ...initialFactStatuses(),
      "f-staff": "rejected" as const,
      "f-mission": "proposed" as const,
    };
    const flags = draftFlags(clean, statuses);
    expect(flags.map((f) => [f.claimId, f.severity])).toEqual([
      ["c-mission", "warning"],
      ["c-staff", "blocker"],
    ]);
    expect(factCheck(clean, statuses).passed).toBe(false);
  });
});

describe("automation levels", () => {
  it("mirrors the real routing: autopilot off routes to people, small asks can go automatically", () => {
    const statuses = initialFactStatuses();
    const tiers = (id: Parameters<typeof levelById>[0], d = clean) =>
      Object.fromEntries(
        routeDemoMatches(levelById(id), d, statuses).map((r) => [r.opportunity.id, r.route.tier]),
      );
    expect(tiers("manual")).toEqual({
      "opp-trades": "one_click",
      "opp-federal": "full_review",
      "opp-repair": "one_click",
    });
    expect(tiers("small_auto")["opp-repair"]).toBe("auto");
    expect(tiers("full")["opp-federal"]).toBe("full_review");
    // Open blockers in the live draft keep it in full review at every level.
    for (const l of AUTOMATION_LEVELS) expect(tiers(l.id, fresh)["opp-trades"]).toBe("full_review");
    expect(levelById("manual").policy.autoDraftTopN).toBe(0);
    expect(levelById("assisted").policy.autopilotEnabled).toBe(false);
  });
});

describe("package fingerprint", () => {
  it("is the SHA-256 of the exact package text", async () => {
    const text = packageText(clean, initialFactStatuses());
    expect(text).toContain(MISMATCH.supportedText);
    expect(text).not.toContain(MISMATCH.unsupportedText);
    expect(text).toContain("train 40 adults");
    expect(await sha256Hex(text)).toBe(createHash("sha256").update(text).digest("hex"));
    expect(DEMO_DRAFT.paragraphs.length).toBeGreaterThan(0);
  });
});

describe("<DemoTour> draft review", { timeout: 30_000 }, () => {
  it("shows the source quote in a citation popover and clears the flag with Fix it", async () => {
    const user = userEvent.setup();
    render(<DemoTour initialStep={3} />);
    expect(screen.getByRole("heading", { level: 2, name: /Review a draft/ })).toBeInTheDocument();

    const draft = screen.getByTestId("demo-draft");
    const flagged = draft.querySelector('[data-claim-id="c-families"]');
    expect(flagged).toHaveAttribute("data-issue", "danger");
    expect(flagged).toHaveTextContent("We served 500 families across both counties.");

    const citation = within(flagged as HTMLElement).getByRole("button", { name: /View citation/ });
    await user.click(citation);
    const popover = await screen.findByRole("dialog", { name: /Citation/ });
    expect(popover).toHaveTextContent("our programs served 320 families across both counties");
    await user.keyboard("{Escape}");

    const flags = screen.getByRole("region", { name: "Flags" });
    expect(within(flags).getByText("Number mismatch")).toBeInTheDocument();
    await user.click(within(flags).getByRole("button", { name: /Fix it/ }));

    const fixed = draft.querySelector('[data-claim-id="c-families"]');
    expect(fixed).not.toHaveAttribute("data-issue");
    expect(fixed).toHaveTextContent(MISMATCH.supportedText);
    expect(draft).not.toHaveTextContent("500 families");
    expect(within(flags).queryByText("Number mismatch")).not.toBeInTheDocument();
    expect(screen.getByTestId("fact-check-status")).toHaveTextContent("Failed"); // gap still open

    await user.type(within(flags).getByLabelText("Trainees in the first year"), "40");
    await user.click(within(flags).getByRole("button", { name: "Answer" }));
    expect(screen.getByTestId("fact-check-status")).toHaveTextContent("Passed");
    expect(draft).toHaveTextContent("we plan to train 40 adults in the first year");
    await waitFor(() => expect(within(flags).getByText(/No open flags/)).toBeInTheDocument());
  });
});

describe("<DemoCta>", { timeout: 30_000 }, () => {
  it("links to /demo as a card or a single button", () => {
    const { unmount } = render(<DemoCta />);
    expect(screen.getByRole("complementary", { name: "Interactive demo" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(/imagined charity/);
    expect(screen.getByRole("link", { name: "See the demo" })).toHaveAttribute("href", "/demo");
    unmount();
    render(<DemoCta variant="button" />);
    expect(screen.getByRole("link", { name: "See the demo" })).toHaveAttribute("href", "/demo");
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
  });
});
