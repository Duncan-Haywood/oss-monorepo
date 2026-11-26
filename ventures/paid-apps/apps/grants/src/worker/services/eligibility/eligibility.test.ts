// Pure eligibility logic: quote verification, deterministic rules, citation validation, verdicts.
import type { ChecklistItem, EligibilityCriterion } from "@shared/eligibility";
import { describe, expect, it } from "vitest";
import { type AssessOutput, overallVerdict, validateAssessments } from "./assess";
import {
  buildExtractPrompt,
  COST_SHARE_YES,
  type CriteriaOpportunity,
  finalizeCriteria,
  renderOpportunityText,
} from "./criteria";
import { decideDeterministically, type EligibilityProfile } from "./deterministic";
import { fakeAssess, fakeExtractCriteria } from "./fake-llm";

const NONPROFIT = "Nonprofits having a 501(c)(3) status with the IRS";
const NOW = new Date("2026-11-19T12:00:00Z");

const opp = (o: Partial<CriteriaOpportunity> = {}): CriteriaOpportunity => ({
  title: "Rural Trades Apprenticeship Expansion Grant",
  funderName: "Sample Foundation",
  summary: "Supports construction trades pre-apprenticeship programs.",
  description: "",
  eligibilityText:
    "501(c)(3) nonprofit organizations operating workforce training programs. Applicants must have at least two years of program operating history.",
  applicantTypes: [NONPROFIT],
  geographicScope: null,
  costSharingRequired: false,
  requirements: null,
  ...o,
});

const swif: EligibilityProfile = {
  legalName: "Southwest Indian Foundation",
  orgType: "nonprofit_501c3",
  ein: "85-0000000",
  uei: null,
  city: "Gallup",
  state: "NM",
  country: "US",
  serviceAreas: ["Gallup, NM", "McKinley County, NM", "Navajo Nation"],
  foundedYear: 1968,
};

const crit = (kind: EligibilityCriterion["kind"], sourceQuote: string): EligibilityCriterion => ({
  id: "c1",
  kind,
  text: sourceQuote,
  sourceQuote,
});

const decide = (c: EligibilityCriterion, p: EligibilityProfile = swif, types = [NONPROFIT]) =>
  decideDeterministically(c, { applicantTypes: types }, p, NOW);

describe("finalizeCriteria", () => {
  it("keeps only verbatim quotes (whitespace/case-insensitive), dedupes and numbers them", () => {
    const o = opp();
    const text = renderOpportunityText(o);
    const { criteria, stats } = finalizeCriteria(
      [
        {
          kind: "years_operating",
          text: "Two years of history.",
          sourceQuote: "applicants must have at least   two years of program operating history",
        },
        {
          kind: "years_operating",
          text: "dupe",
          sourceQuote: "Applicants must have at least two years of program operating history",
        },
        {
          kind: "tax_status",
          text: "Paraphrase",
          sourceQuote: "Applicants must be tax-exempt charities with audited financials",
        },
        {
          kind: "cost_share",
          text: "No match",
          sourceQuote: "Cost sharing or matching requirement: No",
        },
      ],
      o,
      text,
    );
    expect(stats.dropped).toEqual({ unverifiedQuote: 1, duplicate: 1, notARequirement: 1 });
    expect(criteria.map((c) => [c.id, c.kind])).toEqual([
      ["c1", "years_operating"],
      ["c2", "applicant_type"], // appended from the structured applicant-type list
    ]);
    expect(criteria[1]?.sourceQuote).toBe(NONPROFIT);
  });

  it("adds listing-field criteria for cost share and a non-national scope", () => {
    const o = opp({ costSharingRequired: true, geographicScope: "New Mexico and Arizona" });
    const { criteria } = finalizeCriteria([], o, renderOpportunityText(o));
    expect(criteria.map((c) => c.kind)).toEqual(["applicant_type", "cost_share", "geography"]);
    expect(criteria[1]?.sourceQuote).toBe(COST_SHARE_YES);
    const national = opp({ geographicScope: "United States" });
    expect(
      finalizeCriteria([], national, renderOpportunityText(national)).criteria.map((c) => c.kind),
    ).toEqual(["applicant_type"]);
  });

  it("fake extraction quotes survive verification", () => {
    const o = opp({
      eligibilityText:
        "501(c)(3) organizations with experience in housing. Projects must be located in New Mexico or Arizona. Applicants must have an active SAM.gov registration.",
    });
    const text = renderOpportunityText(o);
    const raw = fakeExtractCriteria({ purpose: "x", system: "", prompt: buildExtractPrompt(text) });
    const { criteria, stats } = finalizeCriteria(raw.criteria, o, text);
    expect(stats.dropped.unverifiedQuote).toBe(0);
    expect(criteria.map((c) => c.kind)).toEqual([
      "applicant_type",
      "applicant_type",
      "geography",
      "registration",
    ]);
  });
});

describe("decideDeterministically", () => {
  it("applicant types: the structured list decides both ways", () => {
    expect(decide(crit("applicant_type", NONPROFIT))).toMatchObject({
      status: "met",
      evidence: ["orgType"],
    });
    const stateOnly = ["State governments"];
    expect(decide(crit("applicant_type", "State governments"), swif, stateOnly)).toMatchObject({
      status: "not_met",
      evidence: ["orgType"],
    });
    expect(decide(crit("applicant_type", NONPROFIT), { ...swif, orgType: "other" })).toBeNull();
  });

  it("applicant types: free text only ever proves a positive, non-negated match", () => {
    const listed = crit(
      "applicant_type",
      "Eligible applicants are nonprofit organizations or units of local government",
    );
    expect(decide(listed, swif, [])?.status).toBe("met");
    expect(
      decide(crit("applicant_type", "Nonprofit organizations are not eligible"), swif, []),
    ).toBeNull();
    expect(
      decide(crit("applicant_type", "Eligible applicants are State governments"), swif, []),
    ).toBeNull();
    expect(
      decide(crit("applicant_type", "All applicants must be tribal governments"), swif, []),
    ).toBeNull();
  });

  it("geography: state / service area / national match, other states exclude", () => {
    expect(
      decide(crit("geography", "Projects must be located in New Mexico or Arizona")),
    ).toMatchObject({
      status: "met",
      evidence: ["state"],
    });
    expect(decide(crit("geography", "Applicants must be located in Texas"))).toMatchObject({
      status: "not_met",
    });
    expect(
      decide(crit("geography", "Programs must serve McKinley County residents")),
    ).toMatchObject({
      status: "met",
      evidence: ["serviceAreas"],
    });
    expect(
      decide(crit("geography", "Open to organizations anywhere in the United States")),
    ).toMatchObject({
      status: "met",
      evidence: ["country"],
    });
  });

  it("geography: qualifiers, regions and sub-state places are left to the assessment", () => {
    for (const q of [
      "Projects must serve rural areas of New Mexico",
      "Applicants must operate in the U.S. Southwest",
      "Projects must serve Bernalillo County, New Mexico",
      "Programs located in southern New Mexico",
      "Applicants may not be located in New Mexico",
      "Programs must serve communities in Arizona or Utah", // service, not location
    ]) {
      expect(decide(crit("geography", q)), q).toBeNull();
    }
  });

  it("registration: UEI present proves SAM; missing UEI or Grants.gov stays undecided", () => {
    const sam = crit("registration", "Applicants must have an active SAM.gov registration");
    expect(decide(sam)).toBeNull();
    expect(decide(sam, { ...swif, uei: "ABCDEF123456" })).toMatchObject({
      status: "met",
      evidence: ["uei"],
    });
    const both = crit("registration", "Applicants must be registered in SAM.gov and Grants.gov");
    expect(decide(both, { ...swif, uei: "ABCDEF123456" })).toBeNull();
  });

  it("tax status and years operating use profile fields", () => {
    expect(
      decide(crit("tax_status", "Applicants must be 501(c)(3) organizations with an EIN")),
    ).toMatchObject({
      status: "met",
      evidence: ["orgType", "ein"],
    });
    expect(
      decide(crit("tax_status", "Applicants must have an EIN"), { ...swif, ein: null }),
    ).toBeNull();
    const years = crit(
      "years_operating",
      "Applicants must have at least two years of program operating history",
    );
    expect(decide(years)?.status).toBe("met");
    expect(decide(years, { ...swif, foundedYear: 2025 })?.status).toBe("not_met");
    expect(decide(years, { ...swif, foundedYear: 2024 })).toBeNull(); // boundary year
    expect(decide(years, { ...swif, foundedYear: null })).toBeNull();
  });
});

describe("validateAssessments", () => {
  const pending = [
    crit("population", "Programs must serve Native American youth"),
    { ...crit("budget_size", "Annual budget under $5 million"), id: "c2" },
    { ...crit("other", "Applicants must have a board of directors"), id: "c3" },
    { ...crit("cost_share", "A 1:1 match is required"), id: "c4" },
  ];
  const facts = new Map([
    [
      "fct_youth",
      { id: "fct_youth", statement: "Serves Navajo youth.", status: "confirmed" as const },
    ],
  ]);
  const output: AssessOutput = {
    assessments: [
      {
        criterionId: "c1",
        status: "met",
        reason: "Serves youth",
        evidence: ["[fct_youth]"],
        question: null,
      },
      {
        criterionId: "c2",
        status: "met",
        reason: "Budget ok",
        evidence: ["fct_invented"],
        question: null,
      },
      {
        criterionId: "c3",
        status: "met",
        reason: "Has UEI",
        evidence: ["profile:uei"],
        question: null,
      },
      { criterionId: "c4", status: "not_met", reason: "No match", evidence: [], question: null },
      { criterionId: "c9", status: "met", reason: "?", evidence: ["fct_youth"], question: null },
      {
        criterionId: "c1",
        status: "not_met",
        reason: "dupe",
        evidence: ["fct_youth"],
        question: null,
      },
    ],
  };

  it("unprovable met / not_met become unknown; only provided ids are evidence", () => {
    const r = validateAssessments(pending, output, facts, swif);
    expect(r.get("c1")).toMatchObject({
      status: "met",
      evidence: [{ ref: "fct_youth", factStatus: "confirmed" }],
    });
    expect(r.get("c2")).toMatchObject({ status: "unknown", evidence: [] }); // invented fact id
    expect(r.get("c3")).toMatchObject({ status: "unknown", evidence: [] }); // empty profile field
    expect(r.get("c4")).toMatchObject({ status: "unknown" }); // not_met without proof
    expect(r.has("c9")).toBe(false);
    expect([...r.keys()]).toEqual(["c1", "c2", "c3", "c4"]);
  });

  it("the fake assessor cites only fact ids present in the context", () => {
    const out = fakeAssess({
      purpose: "x",
      system: "",
      context:
        "<facts>\n[fct_a] (confirmed) Trains Native American youth in construction trades — source: entered by org staff\n</facts>",
      prompt:
        '<criteria>\n[c1] (population) Programs must train Native American youth in construction trades — funder: "x"\n[c2] (other) Board of directors — funder: "y"\n</criteria>',
    });
    expect(out.assessments).toEqual([
      expect.objectContaining({ criterionId: "c1", status: "met", evidence: ["fct_a"] }),
      expect.objectContaining({ criterionId: "c2", status: "unknown", evidence: [] }),
    ]);
  });
});

describe("overallVerdict", () => {
  const item = (
    status: ChecklistItem["status"],
    kind: ChecklistItem["kind"] = "other",
    factStatus: "confirmed" | "proposed" | null = null,
  ): ChecklistItem => ({
    criterionId: "c",
    kind,
    text: "",
    sourceQuote: "",
    status,
    method: "assessed",
    reason: "",
    evidence:
      status === "unknown"
        ? []
        : factStatus
          ? [{ ref: "fct_1", kind: "fact", label: "", factStatus }]
          : [{ ref: "profile:orgType", kind: "profile", label: "", factStatus: null }],
  });

  it("maps checklists to eligible / likely / unknown / ineligible", () => {
    expect(overallVerdict([])).toBe("unknown");
    expect(overallVerdict([item("met"), item("met", "other", "confirmed")])).toBe("eligible");
    expect(overallVerdict([item("met"), item("met", "other", "proposed")])).toBe("likely");
    expect(overallVerdict([item("met", "applicant_type"), item("unknown", "cost_share")])).toBe(
      "likely",
    );
    expect(overallVerdict([item("met"), item("unknown", "geography")])).toBe("unknown");
    expect(overallVerdict([item("unknown"), item("unknown")])).toBe("unknown");
    expect(overallVerdict([item("met"), item("not_met"), item("unknown")])).toBe("ineligible");
  });
});
