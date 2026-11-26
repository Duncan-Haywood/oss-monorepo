import { ApplicationContent, OpportunityRequirements } from "@shared/content";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppContext } from "../../context";
import { createLogger } from "../../lib/logger";
import { FakeLlm } from "../../ports/fake-llm";
import { LlmRefusalError, type LlmRequestBase } from "../../ports/llm";
import { draftApplication, redraftSection } from "./draft";
import { fakeHandlers } from "./fake-llm";
import { SECTION_SYSTEM_PROMPT } from "./prompts";
import type { DraftInput, DraftingFact } from "./types";

vi.mock("./deps", async () => {
  const { formatFactsForPrompt } = await import("../knowledge/format");
  return {
    draftingDeps: {
      orgProfile: vi.fn(
        async () => "User-entered organization profile:\n- Legal name: Test Foundation",
      ),
      formatFacts: (f: Parameters<typeof formatFactsForPrompt>[0]) => formatFactsForPrompt(f),
      styleExamples: vi.fn(async () => [
        { title: "Past award", text: "We have served 12,345 families." },
      ]),
    },
  };
});
vi.mock("./org-context", () => ({
  loadFeedbackNotes: vi.fn(async () => ({
    doMore: [{ rating: 5, comment: "Lead with outcomes", sectionKey: null }],
    avoid: [],
  })),
  loadProjectFocus: vi.fn(async () => null),
}));

const fact = (
  id: string,
  category: DraftingFact["category"],
  statement: string,
  status: DraftingFact["status"] = "confirmed",
): DraftingFact => ({
  id,
  category,
  statement,
  status,
  sensitivity: "internal",
});

const FACTS: DraftingFact[] = [
  fact(
    "fct_mission",
    "mission",
    "Our mission is to help Navajo families build self-sufficiency through job training.",
  ),
  fact(
    "fct_trades",
    "program",
    "Our trades program trains adults in carpentry, plumbing and electrical work.",
  ),
  fact("fct_grads", "outcome", "In 2025, 38 trainees completed the trades training program."),
  fact(
    "fct_jobs",
    "outcome",
    "Of the 2025 graduates, 30 were employed within six months of completing training.",
  ),
  fact(
    "fct_need",
    "population_served",
    "Unemployment in our service area is far above the state average, and many families lack job training.",
  ),
  fact("fct_rejected", "metric", "We trained 9,000 people last year.", "rejected"),
  {
    ...fact(
      "fct_secret",
      "population_served",
      "A named client in our training program disclosed a medical condition.",
    ),
    sensitivity: "restricted",
  },
];

const REQUIREMENTS = OpportunityRequirements.parse({
  complete: true,
  sections: [
    {
      key: "need",
      title: "Statement of Need",
      prompt: "Describe the need for job training among the families you serve.",
      wordLimit: 300,
    },
    {
      key: "program",
      title: "Program Description",
      prompt: "Describe your trades training program and its outcomes.",
      wordLimit: 400,
    },
    {
      key: "evaluation_partners",
      title: "Evaluation Partners",
      prompt: "Which external evaluator or university partner will assess results?",
    },
    { key: "budget", title: "Budget", kind: "budget", prompt: "Provide a line-item budget." },
    {
      key: "audit",
      title: "Audited Financial Statements",
      kind: "attachment",
      prompt: "Most recent audit.",
    },
  ],
});

function makeCtx(llm = new FakeLlm(fakeHandlers)) {
  const ctx = {
    env: { LLM_MODEL: "claude-opus-5-5" },
    llm,
    logger: createLogger({ test: true }),
    now: () => new Date("2026-11-19T00:00:00Z"),
  } as unknown as AppContext;
  return { ctx, llm };
}

const input = (over: Partial<DraftInput> = {}): DraftInput => ({
  orgId: "org_test",
  applicationId: "app_test",
  opportunity: {
    title: "Rural Workforce Grant",
    funderName: "Example Foundation",
    summary: "Job training for rural communities.",
    description: "",
    eligibilityText: "",
    awardFloorCents: null,
    awardCeilingCents: null,
    closeDate: null,
  },
  requirements: REQUIREMENTS,
  facts: FACTS,
  ...over,
});

const factualClaims = (c: ApplicationContent) =>
  c.sections
    .flatMap((s) => s.paragraphs.flatMap((p) => p.claims))
    .filter((cl) => cl.kind === "factual");

describe("draftApplication (FakeLlm)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("produces valid content where every factual claim cites provided facts", async () => {
    const { ctx, llm } = makeCtx();
    const res = await draftApplication(ctx, input());
    expect(ApplicationContent.safeParse(res.content).success).toBe(true);
    expect(res.content.sections.map((s) => s.key)).toEqual([
      "need",
      "program",
      "evaluation_partners",
      "budget",
      "audit",
    ]);

    const allowed = new Set(
      FACTS.filter((f) => f.status !== "rejected" && f.sensitivity !== "restricted").map(
        (f) => f.id,
      ),
    );
    const claims = factualClaims(res.content);
    expect(claims.length).toBeGreaterThan(2);
    for (const c of claims) {
      expect(c.factIds.length).toBeGreaterThan(0);
      for (const id of c.factIds) expect(allowed.has(id)).toBe(true);
    }
    // rejected / restricted facts never reach the model
    const sectionCalls = llm.calls.filter((c) => c.purpose === "drafting.section");
    for (const call of sectionCalls) {
      expect(call.context).not.toContain("fct_rejected");
      expect(call.context).not.toContain("fct_secret");
      expect(call.system).toBe(SECTION_SYSTEM_PROMPT);
      expect(call.effort).toBe("high");
    }
    // context identical across sections (prompt caching)
    expect(new Set(sectionCalls.map((c) => c.context)).size).toBe(1);

    // claim ids follow s{n}.p{m}.c{k}
    const program = res.content.sections[1];
    expect(program?.paragraphs[0]?.claims[0]?.id).toBe("s2.p1.c1");

    expect(res.executiveSummary.length).toBeGreaterThan(0);
    expect(res.keyPoints.length).toBeGreaterThanOrEqual(3);
    expect(res.keyPoints.length).toBeLessThanOrEqual(6);
    expect(res.model).toBe("fake-llm");
    expect(res.promptVersion).toMatch(/^drafting-v/);
  });

  it("emits gaps (not text) for unsupported sections", async () => {
    const { ctx, llm } = makeCtx();
    const res = await draftApplication(ctx, input());
    const byKey = Object.fromEntries(res.content.sections.map((s) => [s.key, s]));
    // budget without financial facts and attachments: no LLM call, gap only
    expect(byKey.budget?.paragraphs).toEqual([]);
    expect(byKey.budget?.gaps[0]?.question).toMatch(/budget/i);
    expect(byKey.audit?.paragraphs).toEqual([]);
    expect(byKey.audit?.gaps[0]?.question).toMatch(/upload/i);
    // narrative with < 2 relevant facts gets a gap
    expect(byKey.evaluation_partners?.gaps.length).toBeGreaterThan(0);
    const drafted = llm.calls.filter((c) => c.purpose === "drafting.section").map((c) => c.prompt);
    expect(drafted.some((p) => p.includes('key="budget"'))).toBe(false);
    expect(drafted.some((p) => p.includes('key="audit"'))).toBe(false);
  });

  it("summary is built from drafted claims only", async () => {
    const { ctx, llm } = makeCtx();
    await draftApplication(ctx, input());
    const summaryCall = llm.calls.find((c) => c.purpose === "drafting.summary");
    expect(summaryCall).toBeDefined();
    expect(summaryCall?.context).toBeUndefined();
    expect(summaryCall?.prompt).not.toContain("fct_");
    expect(summaryCall?.prompt).toContain("<claims>");
  });

  it("drafts budget sections when financial facts exist", async () => {
    const { ctx } = makeCtx();
    const facts = [
      ...FACTS,
      fact(
        "fct_budget",
        "financial",
        "The trades program budget is $250,000 per year, including instructor salaries and line-item tool costs.",
      ),
    ];
    const res = await draftApplication(ctx, input({ facts }));
    const budget = res.content.sections.find((s) => s.key === "budget");
    expect(factualClaims({ sections: budget ? [budget] : [] }).flatMap((c) => c.factIds)).toContain(
      "fct_budget",
    );
  });

  it("drops hallucinated fact ids and trims over-long sections", async () => {
    // 60 claims x 7 words = 420 words against a 300-word limit
    const long = Array.from(
      { length: 60 },
      (_, i) => `Sentence number ${i} has exactly seven words.`,
    );
    const llm = new FakeLlm(fakeHandlers).on("drafting.section", () => ({
      key: "wrong",
      title: "wrong",
      paragraphs: [
        {
          id: "p",
          claims: long.map((t) => ({
            id: "c",
            text: t,
            kind: "factual",
            factIds: ["fct_trades", "fct_invented"],
          })),
        },
      ],
      gaps: [],
    }));
    const { ctx } = makeCtx(llm);
    const only = OpportunityRequirements.parse({ sections: [REQUIREMENTS.sections[0]] });
    const res = await draftApplication(ctx, input({ requirements: only }));
    const s = res.content.sections[0];
    expect(s?.key).toBe("need");
    expect(s?.title).toBe("Statement of Need");
    const claims = s?.paragraphs.flatMap((p) => p.claims) ?? [];
    for (const c of claims) expect(c.factIds).toEqual(["fct_trades"]);
    expect(claims.length).toBe(42);
    expect(claims.at(-1)?.id).toBe("s1.p1.c42");
  });

  it("turns a refused section into a gap instead of failing the draft", async () => {
    const llm = new FakeLlm(fakeHandlers).on("drafting.section", (req: LlmRequestBase) => {
      if (req.prompt.includes('key="need"')) throw new LlmRefusalError("drafting.section", null);
      return fakeHandlers["drafting.section"]?.(req);
    });
    const { ctx } = makeCtx(llm);
    const res = await draftApplication(ctx, input());
    const need = res.content.sections.find((s) => s.key === "need");
    expect(need?.paragraphs).toEqual([]);
    expect(need?.gaps).toHaveLength(1);
    expect(
      res.content.sections.find((s) => s.key === "program")?.paragraphs.length,
    ).toBeGreaterThan(0);
  });

  it("uses default sections when requirements are unknown and runs at most 2 sections at once", async () => {
    let inFlight = 0;
    let peak = 0;
    const llm = new FakeLlm(fakeHandlers).on("drafting.section", async (req: LlmRequestBase) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return fakeHandlers["drafting.section"]?.(req);
    });
    const { ctx } = makeCtx(llm);
    const res = await draftApplication(
      ctx,
      input({ requirements: OpportunityRequirements.parse({}) }),
    );
    expect(res.content.sections.length).toBe(4);
    expect(peak).toBe(2);
  });

  it("passes reviewer notes and the previous section when re-drafting", async () => {
    const { ctx, llm } = makeCtx();
    const first = await draftApplication(ctx, input());
    const section = await redraftSection(ctx, {
      ...input({ previous: first.content, reviewerNotes: "Mention employment outcomes first." }),
      sectionKey: "program",
      instructions: "Keep it short.",
    });
    expect(section.key).toBe("program");
    expect(section.paragraphs[0]?.claims[0]?.id).toBe("s2.p1.c1");
    const last = llm.calls.at(-1);
    expect(last?.prompt).toContain("Mention employment outcomes first.");
    expect(last?.prompt).toContain("Keep it short.");
    expect(last?.prompt).toContain("<previous_draft>");
  });

  it("rejects unknown section keys on redraft", async () => {
    const { ctx } = makeCtx();
    await expect(redraftSection(ctx, { ...input(), sectionKey: "nope" })).rejects.toThrow(
      /Unknown section/,
    );
  });
});
