// Unit tests for the eval metric + adversarial-injection helpers (pure; no LLM, no workerd).
import type { ApplicationContent, Claim, ClaimVerdict } from "@shared/content";
import { computeReport, type NewFlag, type VerifyDraftResult } from "@worker/services/grounding";
import { describe, expect, it } from "vitest";
import type { Fabrication } from "../fixtures";
import { fact, requirements } from "../fixtures/build";
import { claimsOf, detectionResults, draftMetrics, injectFabrications } from "./metrics";

const factual = (id: string, text: string, factIds: string[]): Claim => ({
  id,
  text,
  kind: "factual",
  factIds,
});
const framing = (id: string, text: string): Claim => ({ id, text, kind: "framing", factIds: [] });

const FACTS = [
  fact("f_ok", "program", "The academy trained 48 apprentices in 2024.", "48 apprentices in 2024."),
  fact("f_prop", "program", "The academy offers carpentry.", "We offer carpentry.", {
    status: "proposed",
  }),
  fact(
    "f_restricted",
    "population_served",
    "Trainee J.D. is in recovery.",
    "J.D. is in recovery.",
    {
      sensitivity: "restricted",
    },
  ),
  fact("f_rejected", "metric", "The academy trained 400 adults.", "400 adults!", {
    status: "rejected",
  }),
  fact("f_old", "staff", "The academy has 3 instructors.", "3 instructors.", {
    status: "superseded",
  }),
];

/** need: 2 factual (1 uncited) + 1 framing; ip: a gap, no text; budget: forbidden citations. */
function content(): ApplicationContent {
  return {
    sections: [
      {
        key: "need",
        title: "Need",
        gaps: [],
        paragraphs: [
          {
            id: "s1.p1",
            claims: [
              factual("s1.p1.c1", "The academy trained 48 apprentices in 2024.", ["f_ok"]),
              framing("s1.p1.c2", "We welcome the opportunity to share our work."),
              factual("s1.p1.c3", "The academy is well known.", []),
            ],
          },
        ],
      },
      {
        key: "ip",
        title: "Intellectual Property",
        gaps: [{ question: "Do you hold any patents?", why: "No IP facts." }],
        paragraphs: [],
      },
      {
        key: "budget",
        title: "Budget",
        gaps: [],
        paragraphs: [
          {
            id: "s3.p1",
            claims: [
              factual("s3.p1.c1", "We request $25,000 for carpentry training.", [
                "ask:requested_amount",
                "f_prop",
              ]),
              factual("s3.p1.c2", "One trainee is in recovery.", ["f_restricted"]),
              factual("s3.p1.c3", "The academy trained 400 adults with 3 instructors.", [
                "f_rejected",
                "f_old",
                "f_ghost",
              ]),
            ],
          },
        ],
      },
    ],
  };
}

const verdict = (
  claimId: string,
  v: ClaimVerdict["verdict"],
  extra: Partial<ClaimVerdict> = {},
): ClaimVerdict => ({
  claimId,
  verdict: v,
  reason: "",
  unmatchedNumbers: [],
  unconfirmedFactIds: [],
  ...extra,
});

const flag = (claimId: string | null, kind: NewFlag["kind"], severity: NewFlag["severity"]) =>
  ({
    severity,
    kind,
    sectionKey: "need",
    claimId,
    message: "m",
    suggestedQuestion: null,
  }) satisfies NewFlag;

function verification(
  verdicts: ClaimVerdict[],
  flags: NewFlag[] = [],
  factualClaimIds = verdicts.map((v) => v.claimId),
  gaps = 0,
): VerifyDraftResult {
  return {
    report: computeReport({ verdicts, factualClaimIds, gaps, checkedAt: 0, model: "test" }),
    flags,
  };
}

const REQS = requirements([
  { key: "need", title: "Need", prompt: "Describe the need.", wordLimit: 12 },
  { key: "ip", title: "Intellectual Property", prompt: "List IP.", wordLimit: 100 },
  { key: "budget", title: "Budget", prompt: "Explain the budget." },
  { key: "missing", title: "Never drafted", prompt: "Anything.", wordLimit: 50 },
]);

describe("claimsOf", () => {
  it("flattens claims in document order with their section key", () => {
    expect(claimsOf(content()).map((c) => `${c.sectionKey}:${c.claim.id}`)).toEqual([
      "need:s1.p1.c1",
      "need:s1.p1.c2",
      "need:s1.p1.c3",
      "budget:s3.p1.c1",
      "budget:s3.p1.c2",
      "budget:s3.p1.c3",
    ]);
    expect(claimsOf({ sections: [] })).toEqual([]);
  });
});

describe("draftMetrics", () => {
  const factualIds = ["s1.p1.c1", "s1.p1.c3", "s3.p1.c1", "s3.p1.c2", "s3.p1.c3"];
  const v = verification(
    [
      verdict("s1.p1.c1", "supported"),
      verdict("s1.p1.c2", "not_checkable"),
      verdict("s1.p1.c3", "unsupported"),
      verdict("s3.p1.c1", "partially_supported", { unconfirmedFactIds: ["f_prop"] }),
      verdict("s3.p1.c2", "unsupported"),
      verdict("s3.p1.c3", "unsupported", { unmatchedNumbers: ["400", "3"] }),
    ],
    [
      flag("s1.p1.c3", "unsupported_claim", "blocker"),
      flag("s3.p1.c1", "unconfirmed_fact", "warning"),
      flag("s3.p1.c3", "numeric_mismatch", "blocker"),
      flag(null, "missing_info", "blocker"),
    ],
    factualIds,
    1,
  );
  const metrics = (over: Partial<Parameters<typeof draftMetrics>[0]> = {}) =>
    draftMetrics({
      content: content(),
      requirements: REQS,
      facts: FACTS,
      verification: v,
      expectGapSections: ["ip"],
      allowedNames: [],
      ...over,
    });

  it("counts claims and copies the verifier's report", () => {
    expect(metrics()).toMatchObject({
      sections: 3,
      claims: 6,
      factualClaims: 5,
      framingClaims: 1,
      citedRate: 4 / 5,
      supportedRate: 1 / 5,
      partiallySupported: 1,
      unsupported: 3,
      numericMismatches: 1,
      unconfirmedFactCitations: 1,
      gaps: 1,
      groundingPassed: false,
    });
  });

  it("lists every restricted / rejected / superseded / unknown citation, but not the ask", () => {
    expect(metrics().forbiddenCitations).toEqual([
      { claimId: "s3.p1.c2", factId: "f_restricted", why: "restricted" },
      { claimId: "s3.p1.c3", factId: "f_rejected", why: "rejected" },
      { claimId: "s3.p1.c3", factId: "f_old", why: "superseded" },
      { claimId: "s3.p1.c3", factId: "f_ghost", why: "unknown" },
    ]);
  });

  it("re-checks framing claims independently, honoring allowed names", () => {
    expect(metrics().framingViolations).toEqual([]);
    const c = content();
    c.sections[0]?.paragraphs[0]?.claims.push(
      framing("s1.p1.c4", "Acme Trades Academy served 95% of families."),
    );
    const flagged = metrics({ content: c }).framingViolations;
    expect(flagged).toHaveLength(1);
    expect(flagged[0]).toMatchObject({ claimId: "s1.p1.c4" });
    expect(flagged[0]?.problems).toEqual(
      expect.arrayContaining(["number:95%", "name:Acme Trades Academy", "outcome:served"]),
    );
    const allowed = metrics({ content: c, allowedNames: ["Acme Trades Academy"] });
    expect(allowed.framingViolations[0]?.problems).not.toContain("name:Acme Trades Academy");
  });

  it("measures gap recall over the sections the fact base cannot answer", () => {
    expect(metrics()).toMatchObject({
      gapRecall: 1,
      gapSectionDetail: [{ key: "ip", gaps: 1, factualClaims: 0, unsupportedClaims: 0 }],
    });
    const m = metrics({ expectGapSections: ["ip", "need", "missing"] });
    expect(m.gapRecall).toBeCloseTo(1 / 3);
    // "need" drafted text instead of a gap: 2 factual claims, 1 not verified as supported
    expect(m.gapSectionDetail).toEqual([
      { key: "ip", gaps: 1, factualClaims: 0, unsupportedClaims: 0 },
      { key: "need", gaps: 0, factualClaims: 2, unsupportedClaims: 1 },
      { key: "missing", gaps: 0, factualClaims: 0, unsupportedClaims: 0 },
    ]);
    expect(metrics({ expectGapSections: [] }).gapRecall).toBe(1);
  });

  it("checks word limits only on sections that have one (undrafted sections count as 0 words)", () => {
    const m = metrics();
    // need = 7 + 8 + 5 = 20 words > 12; ip = 0 <= 100; missing = 0 <= 50; budget has no limit
    expect(m.overLimit).toEqual([{ key: "need", words: 20, limit: 12 }]);
    expect(m.wordLimitCompliance).toBeCloseTo(2 / 3);
    const noLimits = metrics({
      requirements: requirements([{ key: "a", title: "A", prompt: "p" }]),
    });
    expect(noLimits).toMatchObject({ wordLimitCompliance: 1, overLimit: [] });
  });

  it("tallies flags by severity and kind", () => {
    expect(metrics()).toMatchObject({
      flagsBySeverity: { blocker: 3, warning: 1 },
      flagsByKind: {
        unsupported_claim: 1,
        unconfirmed_fact: 1,
        numeric_mismatch: 1,
        missing_info: 1,
      },
    });
  });

  it("handles a draft with no factual claims", () => {
    const empty: ApplicationContent = {
      sections: [
        {
          key: "need",
          title: "Need",
          gaps: [],
          paragraphs: [{ id: "s1.p1", claims: [framing("s1.p1.c1", "Thank you.")] }],
        },
      ],
    };
    const m = metrics({ content: empty, verification: verification([], [], [], 0) });
    expect(m).toMatchObject({ factualClaims: 0, citedRate: 1, supportedRate: 0, flagsByKind: {} });
  });
});

describe("injectFabrications", () => {
  const fab = (text: string, factIds: string[] = ["f_ok"]): Fabrication => ({
    kind: "wrong_number",
    text,
    factIds,
    truth: "t",
  });

  it("appends each fabrication as its own factual paragraph, round-robin over drafted sections", () => {
    const original = content();
    const fabs = [fab("A 1."), fab("B 2."), fab("C 3.", [])];
    const { content: out, injected } = injectFabrications(original, fabs);
    // "ip" has no paragraphs, so it is skipped
    expect(injected.map((x) => [x.sectionKey, x.claimId, x.fabrication.text])).toEqual([
      ["need", "s1.p2.c1", "A 1."],
      ["budget", "s3.p2.c1", "B 2."],
      ["need", "s1.p3.c1", "C 3."],
    ]);
    expect(out.sections[0]?.paragraphs.map((p) => p.id)).toEqual(["s1.p1", "s1.p2", "s1.p3"]);
    expect(out.sections[0]?.paragraphs[1]?.claims).toEqual([
      { id: "s1.p2.c1", text: "A 1.", kind: "factual", factIds: ["f_ok"] },
    ]);
    expect(out.sections[1]?.paragraphs).toEqual([]);
  });

  it("does not mutate the input draft or share fact-id arrays with the fixture", () => {
    const original = content();
    const before = structuredClone(original);
    const f = fab("A 1.");
    const { content: out } = injectFabrications(original, [f]);
    expect(original).toEqual(before);
    f.factIds.push("f_later");
    expect(out.sections[0]?.paragraphs[1]?.claims[0]?.factIds).toEqual(["f_ok"]);
  });

  it("falls back to the first section when nothing is drafted, and no-ops with no sections", () => {
    const bare: ApplicationContent = {
      sections: [{ key: "ip", title: "IP", gaps: [], paragraphs: [] }],
    };
    expect(injectFabrications(bare, [fab("A 1.")]).injected).toEqual([
      expect.objectContaining({ sectionKey: "ip", claimId: "s1.p1.c1" }),
    ]);
    expect(injectFabrications({ sections: [] }, [fab("A 1.")])).toEqual({
      content: { sections: [] },
      injected: [],
    });
  });

  it("never reuses an id that is already in the draft", () => {
    const c = content();
    const need = c.sections[0];
    if (!need) throw new Error("fixture");
    need.paragraphs.push({
      id: "s1.p2",
      claims: [factual("s1.p2.c1", "Already here.", ["f_ok"])],
    });
    need.paragraphs.splice(1, 0, {
      id: "s1.p3",
      claims: [factual("s1.p3.c1", "Out of order.", ["f_ok"])],
    });
    // 3 paragraphs → the naive next id would be s1.p4; make that taken too
    need.paragraphs.push({ id: "s1.p4", claims: [factual("s1.p4.c1", "Taken.", ["f_ok"])] });
    const { content: out, injected } = injectFabrications(c, [fab("A 1.")]);
    expect(injected[0]?.claimId).toBe("s1.p5.c1");
    const ids = claimsOf(out).map((x) => x.claim.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("detectionResults", () => {
  const injected = (claimId: string) => ({
    claimId,
    sectionKey: "need",
    fabrication: { kind: "inflated_outcome", text: "x", factIds: [], truth: "t" } as Fabrication,
  });

  it("counts a fabrication as detected by verdict, unmatched numbers or a claim-level flag", () => {
    const res = detectionResults(
      ["a", "b", "c", "d", "e", "f"].map(injected),
      verification(
        [
          verdict("a", "unsupported", { reason: "r" }),
          verdict("b", "partially_supported"),
          verdict("c", "supported", { unmatchedNumbers: ["98%"] }),
          verdict("d", "supported"),
          verdict("e", "supported"),
          verdict("f", "not_checkable"),
        ],
        [
          flag("d", "numeric_mismatch", "blocker"),
          flag("d", "numeric_mismatch", "blocker"),
          flag("d", "unsupported_claim", "warning"),
          // these do not count: not about support, or not on the injected claim
          flag("e", "unconfirmed_fact", "warning"),
          flag("f", "length_limit", "warning"),
          flag(null, "unsupported_claim", "blocker"),
        ],
      ),
    );
    expect(res.map((r) => [r.claimId, r.detected])).toEqual([
      ["a", true],
      ["b", true],
      ["c", true],
      ["d", true],
      ["e", false],
      ["f", false],
    ]);
    expect(res[0]).toMatchObject({ kind: "inflated_outcome", verdict: "unsupported", reason: "r" });
    expect(res[2]?.unmatchedNumbers).toEqual(["98%"]);
    expect(res[3]?.flagKinds).toEqual(["numeric_mismatch", "unsupported_claim"]);
  });

  it("reports a missing verdict as not detected unless the claim was flagged", () => {
    const res = detectionResults(
      [injected("gone"), injected("flagged")],
      verification([], [flag("flagged", "unsupported_claim", "blocker")]),
    );
    expect(res).toEqual([
      expect.objectContaining({ claimId: "gone", verdict: "missing", detected: false, reason: "" }),
      expect.objectContaining({ claimId: "flagged", verdict: "missing", detected: true }),
    ]);
  });
});
