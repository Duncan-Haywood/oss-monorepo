// Budget proposal anti-fabrication guard, the drafting budget table, and `budget:<lineId>`
// pseudo-citations verified by grounding against the saved lines. Pure / FakeLlm only.
import {
  BUDGET_TOTALS_REF,
  type BudgetGroundingInput,
  type BudgetLine,
  budgetRef,
  computeLine,
  computeTotals,
  NEEDS_INPUT_NOTE,
} from "@shared/budget";
import type { ApplicationContent, Claim, OpportunityRequirements } from "@shared/content";
import { describe, expect, it, vi } from "vitest";
import { FakeLlm } from "../../ports/fake-llm";
import { unsupportedSectionGap } from "../drafting/draft";
import { fakeDraftSection } from "../drafting/fake-llm";
import { buildSectionPrompt } from "../drafting/prompts";
import type { FactRow } from "../grounding";
import { fakeHandlers as groundingFakes } from "../grounding/fake-llm";
import { verifyDraft } from "../grounding/verify";
import { fakeProposeBudget } from "./fake-llm";
import {
  amountInFacts,
  buildProposeContext,
  finalizeProposal,
  type ProposedBudget,
  quantityInFacts,
} from "./propose";

// Pure, but the shared CI box is busy: allow for slow module loading.
vi.setConfig({ testTimeout: 30_000 });

const fact = (id: string, statement: string, extra: Partial<FactRow> = {}): FactRow => ({
  id,
  statement,
  status: "confirmed",
  sensitivity: "internal",
  sourceQuote: statement,
  value: null,
  asOf: null,
  category: "financial",
  ...extra,
});

const SOURCES: FactRow[] = [
  fact("fct_coord", "The program coordinator salary is $30,000 per year."),
  fact("fct_vans", "The project needs 2 vans at $25,000 each."),
  fact("fct_tools", "Tool kits for the trades program cost $12,500 in total."),
  fact("fct_inkind", "SWIF contributes $8,000 of in-kind classroom space as match.", {
    value: { number: 8000, unit: "USD", year: null, text: null },
  }),
  fact("fct_rejected", "Rent is $99,000.", { status: "rejected" }),
  fact("fct_secret", "A named client paid $4,400.", { sensitivity: "restricted" }),
];

let seq = 0;
const ids = () => `bln_t${String(++seq).padStart(10, "0")}`;
const proposed = (lines: Partial<ProposedBudget["lines"][number]>[]): ProposedBudget => ({
  lines: lines.map((l) => ({
    category: "other",
    description: "Line",
    quantity: 1,
    unitCostDollars: 0,
    fundingSource: "request",
    factIds: [],
    ...l,
  })),
});

/** The invariant: every non-zero amount is a dollar figure in the line's own cited facts. */
function assertNoUncitedAmounts(lines: BudgetLine[], sources: FactRow[]) {
  const byId = new Map(sources.map((f) => [f.id, f]));
  for (const l of lines) {
    if (l.totalCents === 0) {
      expect(l.note).toBe(NEEDS_INPUT_NOTE);
      expect(l.factIds).toEqual([]);
      continue;
    }
    const cited = l.factIds.map((id) => byId.get(id)).filter((f): f is FactRow => !!f);
    expect(cited.length, l.description).toBeGreaterThan(0);
    expect(cited.every((f) => f.status === "confirmed" && f.sensitivity !== "restricted")).toBe(
      true,
    );
    expect(amountInFacts(l.unitCostCents, cited), l.description).toBe(true);
    expect(quantityInFacts(l.quantity, cited), l.description).toBe(true);
    expect(l.totalCents).toBe(Math.round(l.quantity * l.unitCostCents));
    expect(l.source).toBe("fact");
  }
}

describe("finalizeProposal — never invents costs", () => {
  it("keeps amounts that the cited facts state, with code-computed totals", () => {
    const { lines, stats } = finalizeProposal(
      proposed([
        { category: "personnel", unitCostDollars: 30000, factIds: ["fct_coord"] },
        { category: "equipment", quantity: 2, unitCostDollars: 25000, factIds: ["fct_vans"] },
        {
          category: "other",
          unitCostDollars: 8000,
          factIds: ["fct_inkind"],
          fundingSource: "match",
        },
      ]),
      SOURCES,
      ids,
    );
    expect(lines.map((l) => [l.category, l.quantity, l.unitCostCents, l.totalCents])).toEqual([
      ["personnel", 1, 3_000_000, 3_000_000],
      ["equipment", 2, 2_500_000, 5_000_000],
      ["other", 1, 800_000, 800_000],
    ]);
    expect(stats).toEqual({ grounded: 3, placeholders: 0, droppedFactIds: 0 });
    assertNoUncitedAmounts(lines, SOURCES);
  });

  it("turns invented, inflated, uncited and wrongly cited amounts into $0 placeholders", () => {
    const { lines, stats } = finalizeProposal(
      proposed([
        { description: "Laptops", unitCostDollars: 4800 }, // no citation
        { description: "Coordinator", unitCostDollars: 35000, factIds: ["fct_coord"] }, // inflated
        {
          description: "Coordinator (cents slip)",
          unitCostDollars: 3_000_000,
          factIds: ["fct_coord"],
        },
        { description: "Vans", unitCostDollars: 25000, factIds: ["fct_coord", "fct_ghost"] }, // wrong fact + unknown id
        { description: "Rent", unitCostDollars: 99000, factIds: ["fct_rejected"] }, // rejected fact
        { description: "Client fees", unitCostDollars: 4400, factIds: ["fct_secret"] }, // restricted
        { description: "Vans x3", quantity: 3, unitCostDollars: 25000, factIds: ["fct_vans"] }, // count not stated
        { description: "NaN", unitCostDollars: Number.NaN, factIds: ["fct_tools"] },
        { description: "Negative", unitCostDollars: -12500, factIds: ["fct_tools"] },
      ]),
      SOURCES,
      ids,
    );
    expect(lines.every((l) => l.totalCents === 0)).toBe(true);
    expect(stats.placeholders).toBe(9);
    expect(stats.droppedFactIds).toBe(3); // fct_ghost, fct_rejected, fct_secret
    assertNoUncitedAmounts(lines, SOURCES);
  });

  it("splits nothing: a documented total stays 1 × that total", () => {
    const { lines } = finalizeProposal(
      // The model split $12,500 into 5 × $2,500: only the total is documented.
      proposed([
        { category: "supplies", quantity: 5, unitCostDollars: 2500, factIds: ["fct_tools"] },
      ]),
      SOURCES,
      ids,
    );
    expect(lines[0]).toMatchObject({
      quantity: 1,
      unitCostCents: 1_250_000,
      totalCents: 1_250_000,
    });
    assertNoUncitedAmounts(lines, SOURCES);
  });

  it("holds for the FakeLlm proposal and for random adversarial output", () => {
    const fake = fakeProposeBudget({
      purpose: "budgets.propose",
      system: "",
      context: buildProposeContext(SOURCES.filter((f) => f.status === "confirmed")),
      prompt: "",
    });
    const fromFake = finalizeProposal(fake, SOURCES, ids);
    expect(fromFake.lines.some((l) => l.totalCents > 0)).toBe(true);
    expect(fromFake.lines.some((l) => l.totalCents === 0)).toBe(true);
    assertNoUncitedAmounts(fromFake.lines, SOURCES);

    let s = 42;
    const rnd = () => {
      s = (s * 1103515245 + 12345) % 2 ** 31;
      return s / 2 ** 31;
    };
    const amounts = [30000, 25000, 12500, 8000, 99000, 4400, 50000, 1, 0, 250.5];
    const allIds = [...SOURCES.map((f) => f.id), "fct_ghost", "ask:requested_amount"];
    for (let i = 0; i < 20; i++) {
      const raw = proposed(
        Array.from({ length: 6 }, () => ({
          quantity: [1, 2, 3, 0.5, 0][Math.floor(rnd() * 5)] ?? 1,
          unitCostDollars: amounts[Math.floor(rnd() * amounts.length)] ?? 0,
          factIds: allIds.filter(() => rnd() < 0.3),
        })),
      );
      assertNoUncitedAmounts(finalizeProposal(raw, SOURCES, ids).lines, SOURCES);
    }
  });
});

// --------------------------------------------------------------------------- drafting + grounding

const saved = (lines: BudgetLine[]): BudgetGroundingInput => {
  const m = computeTotals(lines).match;
  return {
    lines,
    totals: {
      requestCents: m.requestCents,
      matchCents: m.matchCents,
      otherCents: m.otherCents,
      totalProjectCents: m.totalProjectCents,
    },
  };
};
const L = (id: string, over: Partial<BudgetLine>): BudgetLine =>
  computeLine({
    id,
    category: "personnel",
    description: "Program coordinator",
    quantity: 1,
    unitCostCents: 0,
    source: "user",
    factIds: [],
    fundingSource: "request",
    note: "",
    ...over,
  });

const COORD = L("bln_coord000001", { unitCostCents: 3_000_000 });
const SPACE = L("bln_space000001", {
  category: "other",
  description: "Classroom space (in-kind)",
  unitCostCents: 1_500_000,
  fundingSource: "match",
});
const OPEN = L("bln_open0000001", { category: "contractual", description: "Evaluation" });
const BUDGET = saved([COORD, SPACE, OPEN]);

const REQS: OpportunityRequirements = {
  sections: [
    {
      key: "budget",
      title: "Budget Narrative",
      prompt: "Explain each budget line.",
      kind: "budget",
      required: true,
      wordLimit: 300,
      charLimit: null,
      guidance: "",
    },
  ],
  attachments: [],
  eligibilityCriteria: [],
  submissionInstructions: "",
  complete: true,
};

const content = (claims: Claim[]): ApplicationContent => ({
  sections: [
    { key: "budget", title: "Budget Narrative", gaps: [], paragraphs: [{ id: "s1.p1", claims }] },
  ],
});
const claim = (id: string, text: string, factIds: string[]): Claim => ({
  id,
  text,
  kind: "factual",
  factIds,
});
const verify = (c: ApplicationContent, budget: BudgetGroundingInput | null = BUDGET) =>
  verifyDraft(
    { llm: new FakeLlm(groundingFakes) },
    {
      orgId: "org_1",
      applicationId: "app_1",
      content: c,
      facts: [],
      requirements: REQS,
      autopilot: false,
      budget,
    },
  );

describe("drafting — the saved budget is a source for budget sections", () => {
  it("puts priced lines (with budget: ids) and totals in the budget section prompt", () => {
    const prompt = buildSectionPrompt({
      sectionIndex: 1,
      requirement: REQS.sections[0] as OpportunityRequirements["sections"][number],
      budget: BUDGET,
    });
    expect(prompt).toContain("<budget>");
    expect(prompt).toContain(`[${budgetRef(COORD.id)}] Personnel: Program coordinator.`);
    expect(prompt).toContain(`[${BUDGET_TOTALS_REF}] Total project cost $45,000`);
    expect(prompt).not.toContain(budgetRef(OPEN.id)); // placeholders are not citable
    expect(prompt).toMatch(/no amount yet.*Evaluation/);
  });

  it("drafts a budget section from a saved budget even without financial facts", () => {
    const r = REQS.sections[0] as OpportunityRequirements["sections"][number];
    expect(unsupportedSectionGap(r, [], null)?.gaps).toHaveLength(1);
    expect(unsupportedSectionGap(r, [], null, true)).toBeNull();
  });

  it("round trip: the fake drafter's budget claims pass grounding against the saved lines", async () => {
    const prompt = buildSectionPrompt({
      sectionIndex: 1,
      requirement: REQS.sections[0] as OpportunityRequirements["sections"][number],
      budget: BUDGET,
    });
    const section = fakeDraftSection({ purpose: "drafting.section", system: "", prompt });
    const cited = section.paragraphs.flatMap((p) => p.claims).flatMap((c) => c.factIds);
    expect(cited).toContain(budgetRef(COORD.id));
    const { report, flags } = await verify({ sections: [{ ...section, gaps: [] }] });
    expect(flags.filter((f) => f.severity === "blocker")).toEqual([]);
    expect(report.numericMismatches).toBe(0);
    expect(report.unsupported).toBe(0);
  });
});

describe("grounding — budget:<lineId> citations", () => {
  it("accepts a claim whose amount matches the cited saved line, and totals via budget:totals", async () => {
    const { report, flags } = await verify(
      content([
        claim(
          "s1.p1.c1",
          "Personnel: program coordinator, $30,000 per the saved application budget.",
          [budgetRef(COORD.id)],
        ),
        claim(
          "s1.p1.c2",
          "Total project cost: $45,000, with $15,000 in match, per the saved application budget.",
          [BUDGET_TOTALS_REF],
        ),
      ]),
    );
    expect(flags).toEqual([]);
    expect(report.supported).toBe(2);
    expect(report.unconfirmedFactCitations).toBe(0);
    expect(report.passed).toBe(true);
  });

  it("rejects an amount that differs from the saved line", async () => {
    const { report, flags } = await verify(
      content([
        claim(
          "s1.p1.c1",
          "Personnel: program coordinator, $35,000 per the saved application budget.",
          [budgetRef(COORD.id)],
        ),
      ]),
    );
    expect(report.numericMismatches).toBe(1);
    expect(report.passed).toBe(false);
    expect(flags).toContainEqual(
      expect.objectContaining({
        severity: "blocker",
        kind: "numeric_mismatch",
        claimId: "s1.p1.c1",
      }),
    );
  });

  it("rejects a citation to a line that is not saved, a $0 placeholder, or with no budget", async () => {
    const c = (id: string) =>
      content([claim("s1.p1.c1", "Evaluation: $5,000 per the saved application budget.", [id])]);
    for (const [id, budget, msg] of [
      ["budget:bln_ghost000001", BUDGET, /isn't in the saved budget/],
      [budgetRef(OPEN.id), BUDGET, /has no amount yet/],
      [budgetRef(COORD.id), null, /isn't in the saved budget/],
    ] as const) {
      const { report, flags } = await verify(c(id), budget);
      expect(report.unsupported, id).toBe(1);
      expect(report.passed).toBe(false);
      expect(flags.find((f) => f.claimId === "s1.p1.c1")?.message).toMatch(msg);
    }
  });
});
