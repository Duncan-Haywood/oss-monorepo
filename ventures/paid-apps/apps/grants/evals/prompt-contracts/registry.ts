// One entry per LLM purpose: builds the request the module really sends (its own system prompt,
// context and prompt builders and its zod schema) from tiny fictional fixtures, and the
// deterministic post-checks the module applies to the model's output. Effort and maxTokens are read
// from the module's own ctx.llm call site (call-site.ts), so a test or smoke run can't drift from
// production. Used offline by evals/prompt-contracts/*.test.ts and live by evals/live/smoke.ts.
//
// `u(text, kind)` marks a string as untrusted input (see Untrusted). Contract tests pass a `u`
// that appends a prompt-injection payload; smoke runs pass identity. `variant` (0 | 1) changes only per-call inputs, so tests can check that `system` and
// `context` stay byte-identical (cacheable) across calls.

import type { ApplicationContent, RequirementSection } from "@shared/content";
import { DraftSection, OpportunityRequirements } from "@shared/content";
import type { EligibilityCriterion } from "@shared/eligibility";
import {
  PLAN_QUERIES_PURPOSE,
  PLANNER_SYSTEM,
  PlanQueriesOutput,
  renderPlannerContext,
  validateSearchPlans,
} from "@worker/services/discovery/plans";
import {
  buildRequirementsPrompt,
  PARSE_REQUIREMENTS_PURPOSE,
  REQUIREMENTS_SYSTEM,
} from "@worker/services/discovery/requirements";
import {
  buildDraftingContext,
  buildSectionPrompt,
  buildSummaryPrompt,
  DraftSummarySchema,
  REQUESTED_AMOUNT_REF,
  SECTION_SYSTEM_PROMPT,
  SUMMARY_SYSTEM_PROMPT,
} from "@worker/services/drafting/prompts";
import { postProcessSection } from "@worker/services/drafting/text";
import {
  ASSESS_PURPOSE,
  ASSESS_SYSTEM_PROMPT,
  AssessOutput,
  buildAssessContext,
  buildAssessPrompt,
  renderProfileForPrompt,
} from "@worker/services/eligibility/assess";
import {
  buildExtractPrompt as buildCriteriaPrompt,
  EXTRACT_PURPOSE as CRITERIA_PURPOSE,
  EXTRACT_SYSTEM_PROMPT as CRITERIA_SYSTEM,
  type CriteriaOpportunity,
  ExtractOutput as CriteriaOutput,
  renderOpportunityText,
} from "@worker/services/eligibility/criteria";
import type { EligibilityProfile } from "@worker/services/eligibility/deterministic";
import { checkFramingClaim } from "@worker/services/grounding/checks";
import {
  buildVerifyPrompt,
  type JudgeClaim,
  LlmVerdicts,
  VERIFY_PURPOSE,
  VERIFY_SYSTEM,
} from "@worker/services/grounding/verify";
import {
  buildExtractPrompt as buildImportPrompt,
  ExtractedOpportunity,
  EXTRACT_PURPOSE as IMPORT_PURPOSE,
  EXTRACT_SYSTEM as IMPORT_SYSTEM,
  verifyAgainstSource,
} from "@worker/services/imports/extract";
import { validateProjectFields } from "@worker/services/interview/project-fields";
import {
  buildInterviewerContext,
  buildSummaryPrompt as buildInterviewSummaryPrompt,
  buildNextQuestionPrompt,
  buildProjectFieldsPrompt,
  SUMMARY_SYSTEM as INTERVIEW_SUMMARY_SYSTEM,
  INTERVIEWER_SYSTEM,
  NextQuestionSchema,
  PROJECT_FIELDS_SYSTEM,
  ProjectFieldsSchema,
  type RespondentStatement,
  SummarySchema,
} from "@worker/services/interview/prompts";
import {
  acceptExtractedFacts,
  buildDocumentPrompt,
  buildInterviewPrompt,
  DOCUMENT_SYSTEM_PROMPT,
  DocumentExtraction,
  INTERVIEW_SYSTEM_PROMPT,
  InterviewExtraction,
  PURPOSE_EXTRACT_DOCUMENT,
  PURPOSE_EXTRACT_INTERVIEW,
  type SourceChunk,
  type SourceTurn,
} from "@worker/services/knowledge/extract";
import { formatFactsForPrompt, type PromptFact } from "@worker/services/knowledge/format";
import { quoteInText, StatementIndex } from "@worker/services/knowledge/text";
import {
  buildScoreContext,
  buildScorePrompt,
  MATCH_SCORE_PURPOSE,
  SYSTEM_PROMPT as MATCH_SYSTEM,
  MatchScoreOutput,
} from "@worker/services/matching/scoring";
import {
  buildProspectContext,
  buildProspectPrompt,
  funderFacts,
  PROSPECT_SCORE_PURPOSE,
  SYSTEM_PROMPT as PROSPECT_SYSTEM,
  ProspectScoreOutput,
} from "@worker/services/prospecting/scoring";
import type { FoundationCandidate } from "@worker/services/prospecting/search";
import {
  buildQualityContext,
  buildQualitySectionPrompt,
  QUALITY_PURPOSE,
  QUALITY_SYSTEM_PROMPT,
  RubricReviewOutput,
} from "@worker/services/quality/prompts";
import { finalizeSectionReview } from "@worker/services/quality/validate";
import {
  buildDetectPrompt,
  DETECT_PURPOSE,
  DETECT_SYSTEM,
  DetectOutput,
  verifyCandidate,
} from "@worker/services/watchlist/detect";
import type { z } from "zod";

/**
 * Marks an untrusted string. "content" (default): text from outside sources (documents, web pages,
 * funder text, interview answers) that must reach the model inside <untrusted_content>.
 * "record": the org's own records and short metadata (facts, profile, titles, file names) that
 * must be tag-neutralized but may sit in a module's own delimiting tags.
 */
export type Untrusted = (text: string, kind?: "content" | "record") => string;
export type Variant = 0 | 1;

export interface BuiltRequest<T> {
  system: string;
  context?: string;
  prompt: string;
  schema: z.ZodType<T>;
}

/** Post-check result: an empty list means the output passed the module's deterministic checks. */
export type Problems = string[];

export interface PurposeSpec<T = unknown> {
  purpose: string;
  /** File (relative to apps/grants) holding this purpose's ctx.llm call. */
  callSite: string;
  /** Output can run long (whole sections, lists with verbatim quotes): needs maxTokens >= 8000. */
  longOutput: boolean;
  /** Lowest and highest effort that make sense for this purpose (inclusive). */
  effortRange: readonly [Effort, Effort];
  /** Whether any input is untrusted (documents, web pages, funder text, interview answers). */
  hasUntrusted: boolean;
  build(u: Untrusted, variant: Variant): BuiltRequest<T>;
  /** The module's own deterministic post-checks, applied to a real output (smoke suite). */
  postCheck(data: T, variant: Variant): Problems;
}

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";
export const EFFORT_ORDER: readonly Effort[] = ["low", "medium", "high", "xhigh", "max"];

const spec = <T>(s: PurposeSpec<T>): PurposeSpec<unknown> => s as PurposeSpec<unknown>;

// ---------------------------------------------------------------------------------------------
// Fictional fixtures (no real org, funder or person)

export const ORG_NAME = "Quillfeather Literacy Collective";
export const FUNDER_NAME = "Riverbend Community Foundation";
const PROFILE_TEXT = `${ORG_NAME} (nonprofit_501c3), Harrow Falls, Oregon. Mission: free one-to-one reading and writing tutoring for adults.`;

interface FixtureFact extends PromptFact {
  sourceQuote: string;
}
const FACTS: FixtureFact[] = [
  {
    id: "fct_qlc01",
    status: "confirmed",
    statement: `${ORG_NAME} provides free adult literacy tutoring in Harrow Falls, Oregon.`,
    sourceQuote: "We provide free adult literacy tutoring in Harrow Falls, Oregon.",
    sourceType: "document",
  },
  {
    id: "fct_qlc02",
    status: "confirmed",
    asOf: "2025",
    statement: `${ORG_NAME} served 214 adult learners in 2025.`,
    sourceQuote: "In 2025 we served 214 adult learners.",
    sourceType: "document",
  },
  {
    id: "fct_qlc03",
    status: "confirmed",
    statement: `${ORG_NAME} is a 501(c)(3) nonprofit organization.`,
    sourceQuote: `${ORG_NAME} is a 501(c)(3) nonprofit organization.`,
    sourceType: "document",
  },
  {
    id: "fct_qlc04",
    status: "confirmed",
    asOf: "2025",
    statement: `${ORG_NAME} has 38 volunteer tutors.`,
    sourceQuote: "Our 38 volunteer tutors meet learners weekly.",
    sourceType: "document",
  },
  {
    id: "fct_qlc05",
    status: "proposed",
    asOf: "2025",
    statement: `${ORG_NAME} was founded in 2016.`,
    sourceQuote: "Founded in 2016, the Collective",
    sourceType: "document",
  },
];
const FACT_IDS = new Set(FACTS.map((f) => f.id));
const PROJECT = {
  id: "prj_qlc1",
  title: "Evening tutoring expansion",
  summary: "Add two evening tutoring sessions per week at the Harrow Falls library.",
  budgetNeededCents: 3_000_000,
};

const factsText = (u: Untrusted) =>
  formatFactsForPrompt(FACTS.map((f) => ({ ...f, statement: u(f.statement, "record") })));

/** The funder's listing / RFP (two variants: different opportunities, same org). */
const OPPORTUNITY_TEXT = [
  `${FUNDER_NAME} Adult Learning Grants 2027`,
  "The Adult Learning Grants program supports community organizations that help adults improve their reading and writing.",
  "Eligibility: Applicants must be 501(c)(3) nonprofit organizations located in Oregon. Applicants must have been operating for at least three years.",
  "Awards of up to $25,000 are available. Applications are due March 15, 2027.",
  "Application questions:",
  "1. Statement of Need (500 words maximum): Describe the literacy needs of the adults you serve.",
  "2. Program Design (750 words maximum): Describe your tutoring model and how volunteers are trained.",
  "Submit your application by email to grants@riverbend-cf.example.org.",
].join("\n");
const OPPORTUNITY_TEXT_B = [
  `${FUNDER_NAME} Library Partnerships Fund`,
  "The fund supports programs delivered in public libraries in Oregon.",
  "Eligibility: Applicants must be 501(c)(3) nonprofit organizations.",
  "Awards of up to $10,000. Applications are due June 1, 2027.",
].join("\n");

const NEED_SECTION: RequirementSection = {
  key: "statement_of_need",
  title: "Statement of Need",
  prompt: "Describe the literacy needs of the adults you serve.",
  kind: "narrative",
  required: true,
  wordLimit: 500,
  charLimit: null,
  guidance: "",
};
const DESIGN_SECTION: RequirementSection = {
  key: "program_design",
  title: "Program Design",
  prompt: "Describe your tutoring model and how volunteers are trained.",
  kind: "narrative",
  required: true,
  wordLimit: 750,
  charLimit: null,
  guidance: "",
};

const criteriaOpportunity = (u: Untrusted, v: Variant): CriteriaOpportunity => ({
  title: v === 0 ? "Adult Learning Grants 2027" : "Library Partnerships Fund",
  funderName: FUNDER_NAME,
  summary: "",
  description: u(v === 0 ? OPPORTUNITY_TEXT : OPPORTUNITY_TEXT_B),
  eligibilityText: u(
    "Applicants must be 501(c)(3) nonprofit organizations located in Oregon. Applicants must have been operating for at least three years.",
  ),
  applicantTypes: ["Nonprofits having a 501(c)(3) status with the IRS"],
  geographicScope: "Oregon",
  costSharingRequired: false,
  requirements: null,
});

const ELIGIBILITY_PROFILE: EligibilityProfile = {
  legalName: ORG_NAME,
  orgType: "nonprofit_501c3",
  ein: "93-0000000",
  uei: null,
  city: "Harrow Falls",
  state: "OR",
  country: "US",
  serviceAreas: ["Harrow Falls, Oregon"],
  foundedYear: null,
};

const CRITERIA: EligibilityCriterion[] = [
  {
    id: "c1",
    kind: "tax_status",
    text: "The applicant must be a 501(c)(3) nonprofit organization.",
    sourceQuote: "Applicants must be 501(c)(3) nonprofit organizations located in Oregon.",
  },
  {
    id: "c2",
    kind: "years_operating",
    text: "The applicant must have been operating for at least three years.",
    sourceQuote: "Applicants must have been operating for at least three years.",
  },
];

const FOUNDATION: FoundationCandidate = {
  source: "propublica",
  ein: "930000001",
  name: "Harrow Falls Family Foundation",
  city: "Harrow Falls",
  state: "OR",
  nteeCode: "T20",
  subsectionCode: 3,
  foundationType: "private_non_operating",
  latestFilingYear: 2024,
  latestFormType: 2,
  totalAssetsCents: 420_000_000,
  totalGivingCents: 18_000_000,
  website: null,
  propublicaUrl: null,
  rawR2Key: null,
  fetchedAt: new Date("2026-01-01T00:00:00Z"),
  matchedQueries: ["Harrow Falls"],
  filings: [],
};

const DOC_CHUNK = `${ORG_NAME} — 2025 annual report.\nFounded in 2016, the Collective pairs adult learners with trained volunteers.\nIn 2025 we served 214 adult learners. Our 38 volunteer tutors meet learners weekly.\nOne learner, Dana R., passed her GED exam in May after two years of tutoring.`;

const TURNS = (u: Untrusted): SourceTurn[] => [
  {
    ref: "T1",
    id: "trn_1",
    role: "interviewer",
    content: "How many adult learners did you work with last year?",
  },
  {
    ref: "T2",
    id: "trn_2",
    role: "respondent",
    content: u("We served 214 adult learners in 2025, mostly at the Harrow Falls library."),
  },
  { ref: "T3", id: "trn_3", role: "interviewer", content: "How are tutors trained?" },
  {
    ref: "T4",
    id: "trn_4",
    role: "respondent",
    content: u("Every volunteer tutor completes a 12-hour training before meeting a learner."),
  },
];

const STATEMENTS = (u: Untrusted): RespondentStatement[] => [
  {
    turnId: "trn_2",
    topicKey: "reach",
    text: u("We served 214 adult learners in 2025, mostly at the Harrow Falls library."),
  },
  {
    turnId: "trn_4",
    topicKey: "approach",
    text: u(
      "The evening expansion would need $30,000 and start in March 2027. Every volunteer tutor completes a 12-hour training.",
    ),
  },
];

const draftContent = (u: Untrusted): ApplicationContent => ({
  sections: [
    {
      key: "statement_of_need",
      title: "Statement of Need",
      paragraphs: [
        {
          id: "s1.p1",
          claims: [
            {
              id: "s1.p1.c1",
              kind: "factual",
              text: u("In 2025 we served 214 adult learners in Harrow Falls.", "record"),
              factIds: ["fct_qlc02", "fct_qlc01"],
            },
            {
              id: "s1.p1.c2",
              kind: "factual",
              text: u("Our 38 volunteer tutors meet learners every week.", "record"),
              factIds: ["fct_qlc04"],
            },
          ],
        },
      ],
      gaps: [
        {
          question: "How many adults are on the waiting list?",
          why: "The funder asks about unmet need.",
        },
      ],
    },
  ],
});

const PAGE_TEXT = `# Funding opportunities\nWe fund community projects across Harrow County.\n## 2027 Adult Literacy Mini-Grants\nThe 2027 Adult Literacy Mini-Grants program is now accepting applications.\nAwards of up to $5,000 for nonprofit organizations serving adults in Harrow County.\nDeadline: April 30, 2027.\nLinks on this page:\n- https://harrowcounty-cf.example.org/grants/literacy-2027`;
const PAGE_URL = "https://harrowcounty-cf.example.org/grants";

const IMPORT_TEXT = `${OPPORTUNITY_TEXT}\nOpportunity number: RCF-ALG-2027.`;

// ---------------------------------------------------------------------------------------------
// Helpers for post-checks

const numbersIn = (s: string) =>
  (s.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((n) => n.replace(/,/g, ""));
/** Numbers in `text` that do not appear in `source` (digits only, commas ignored). */
function unmatchedNumbers(text: string, source: string): string[] {
  const have = new Set(numbersIn(source));
  return numbersIn(text).filter((n) => !have.has(n));
}

// ---------------------------------------------------------------------------------------------
// Specs

const sectionFor = (v: Variant) => (v === 0 ? NEED_SECTION : DESIGN_SECTION);

export const PURPOSE_SPECS: PurposeSpec[] = [
  spec({
    purpose: "drafting.section",
    callSite: "src/worker/services/drafting/draft.ts",
    longOutput: true,
    effortRange: ["high", "xhigh"],
    hasUntrusted: true,
    build: (u, v) => ({
      system: SECTION_SYSTEM_PROMPT,
      context: buildDraftingContext({
        orgProfile: u(PROFILE_TEXT, "record"),
        factsBlock: factsText(u),
        opportunity: {
          title: "Adult Learning Grants 2027",
          funderName: FUNDER_NAME,
          summary: u("Supports organizations that help adults improve their reading and writing."),
          description: u(OPPORTUNITY_TEXT),
          eligibilityText: u(
            "Applicants must be 501(c)(3) nonprofit organizations located in Oregon.",
          ),
          awardFloorCents: null,
          awardCeilingCents: 2_500_000,
          closeDate: new Date("2027-03-15T00:00:00Z"),
        },
        styleExamples: [],
        feedback: { doMore: [], avoid: [] },
      }),
      prompt: buildSectionPrompt({
        sectionIndex: v + 1,
        requirement: { ...sectionFor(v), prompt: u(sectionFor(v).prompt) },
        projectFocus: { title: PROJECT.title, summary: u(PROJECT.summary, "record") },
        projectFactIds: [],
        requestedAmountCents: 2_000_000,
        reviewerNotes: u("Lead with the number of learners.", "record"),
      }),
      schema: DraftSection,
    }),
    postCheck: (data, v) => {
      const allowed = new Set([...FACT_IDS, REQUESTED_AMOUNT_REF]);
      const { section, droppedFactIds } = postProcessSection(data, {
        sectionIndex: v + 1,
        requirement: sectionFor(v),
        allowedFactIds: allowed,
      });
      const problems: Problems = [];
      if (droppedFactIds.length)
        problems.push(`cited unknown fact ids: ${droppedFactIds.join(", ")}`);
      const claims = section.paragraphs.flatMap((p) => p.claims);
      if (claims.length === 0 && section.gaps.length === 0) problems.push("no claims and no gaps");
      for (const c of claims) {
        if (c.kind === "factual" && c.factIds.length === 0)
          problems.push(`factual claim without citation: ${c.id}`);
        if (c.kind === "framing" && !checkFramingClaim(c, { allowedNames: [ORG_NAME] }).ok)
          problems.push(`framing claim makes a checkable assertion: ${c.id}`);
      }
      return problems;
    },
  }),
  spec({
    purpose: "drafting.summary",
    callSite: "src/worker/services/drafting/draft.ts",
    longOutput: false,
    effortRange: ["low", "high"],
    hasUntrusted: true,
    build: (u) => ({
      system: SUMMARY_SYSTEM_PROMPT,
      prompt: buildSummaryPrompt({
        content: draftContent(u),
        opportunityTitle: "Adult Learning Grants 2027",
        funderName: FUNDER_NAME,
        requestedAmountCents: 2_000_000,
      }),
      schema: DraftSummarySchema,
    }),
    postCheck: (data) => {
      const source = `${JSON.stringify(draftContent((s) => s))} 20000 2027 501(c)(3)`;
      const extra = unmatchedNumbers([data.executiveSummary, ...data.keyPoints].join(" "), source);
      const problems: Problems = [];
      if (!data.executiveSummary.trim()) problems.push("empty executive summary");
      if (extra.length) problems.push(`numbers not in the draft: ${extra.join(", ")}`);
      return problems;
    },
  }),
  spec({
    purpose: PURPOSE_EXTRACT_DOCUMENT,
    callSite: "src/worker/services/knowledge/jobs.ts",
    longOutput: true,
    effortRange: ["low", "high"],
    hasUntrusted: true,
    build: (u, v) => ({
      system: DOCUMENT_SYSTEM_PROMPT,
      prompt: buildDocumentPrompt({
        orgName: ORG_NAME,
        title: u(v === 0 ? "2025 annual report" : "2025 annual report (revised)", "record"),
        kind: "annual_report",
        sourceUrl: null,
        chunks: docChunks(u),
      }),
      schema: DocumentExtraction,
    }),
    postCheck: (data) => {
      const res = acceptExtractedFacts(
        data.facts,
        docChunks((s) => s),
        new StatementIndex(),
        {
          context: [ORG_NAME],
        },
      );
      const problems: Problems = [];
      if (res.accepted.length === 0) problems.push("no fact accepted");
      if (res.droppedUnverified)
        problems.push(`${res.droppedUnverified} fact(s) without a verbatim quote`);
      if (res.droppedInvalid) problems.push(`${res.droppedInvalid} invalid fact(s)`);
      const dana = data.facts.find((f) => /Dana/.test(f.statement));
      if (dana && dana.sensitivity !== "restricted")
        problems.push("named learner not marked restricted");
      return problems;
    },
  }),
  spec({
    purpose: PURPOSE_EXTRACT_INTERVIEW,
    callSite: "src/worker/services/knowledge/jobs.ts",
    longOutput: true,
    effortRange: ["low", "high"],
    hasUntrusted: true,
    build: (u, v) => ({
      system: INTERVIEW_SYSTEM_PROMPT,
      prompt: buildInterviewPrompt({
        orgName: ORG_NAME,
        title: u(v === 0 ? "Program interview" : "Program interview, part 2", "record"),
        kind: "project",
        focusProject: { title: PROJECT.title },
        turns: TURNS(u),
      }),
      schema: InterviewExtraction,
    }),
    postCheck: (data) => {
      const respondent = TURNS((s) => s)
        .filter((t) => t.role === "respondent")
        .map((t) => ({ ref: t.ref, id: t.id, text: t.content }));
      const res = acceptExtractedFacts(data.facts, respondent, new StatementIndex(), {
        context: [ORG_NAME, PROJECT.title],
      });
      const problems: Problems = [];
      if (res.accepted.length === 0) problems.push("no fact accepted");
      if (res.droppedUnverified)
        problems.push(`${res.droppedUnverified} fact(s) without a verbatim respondent quote`);
      return problems;
    },
  }),
  spec({
    purpose: VERIFY_PURPOSE,
    callSite: "src/worker/services/grounding/verify.ts",
    longOutput: true,
    effortRange: ["high", "max"],
    hasUntrusted: true,
    build: (u, v) => ({
      system: VERIFY_SYSTEM,
      prompt: buildVerifyPrompt(
        u(v === 0 ? "Statement of Need" : "Program Design", "record"),
        judgeClaims(u),
      ),
      schema: LlmVerdicts,
    }),
    postCheck: (data) => {
      const byId = new Map(data.verdicts.map((x) => [x.claimId, x.verdict]));
      const problems: Problems = [];
      for (const c of judgeClaims((s) => s))
        if (!byId.has(c.claimId)) problems.push(`no verdict for ${c.claimId}`);
      for (const id of byId.keys())
        if (!judgeClaims((s) => s).some((c) => c.claimId === id))
          problems.push(`unknown claimId ${id}`);
      if (byId.get("k1") !== "supported")
        problems.push(`faithful claim k1 judged ${byId.get("k1")}`);
      for (const id of ["k2", "k3"]) {
        const verdict = byId.get(id);
        if (verdict === "supported" || verdict === "not_checkable")
          problems.push(`fabricated claim ${id} judged ${verdict}`);
      }
      return problems;
    },
  }),
  spec({
    purpose: MATCH_SCORE_PURPOSE,
    callSite: "src/worker/services/matching/score-org.ts",
    longOutput: false,
    effortRange: ["low", "high"],
    hasUntrusted: true,
    build: (u, v) => ({
      system: MATCH_SYSTEM,
      context: buildScoreContext({
        profileText: u(PROFILE_TEXT, "record"),
        factsText: factsText(u),
        projects: [{ ...PROJECT, summary: u(PROJECT.summary, "record") }],
      }),
      prompt: buildScorePrompt(
        {
          title: v === 0 ? "Adult Learning Grants 2027" : "Library Partnerships Fund",
          funderName: FUNDER_NAME,
          funderType: "foundation",
          summary: u("Supports organizations that help adults improve their reading and writing."),
          description: u(v === 0 ? OPPORTUNITY_TEXT : OPPORTUNITY_TEXT_B),
          eligibilityText: u(
            "Applicants must be 501(c)(3) nonprofit organizations located in Oregon.",
          ),
          applicantTypes: ["Nonprofits having a 501(c)(3) status with the IRS"],
          geographicScope: "Oregon",
          awardFloorCents: null,
          awardCeilingCents: v === 0 ? 2_500_000 : 1_000_000,
          totalFundingCents: null,
          expectedAwards: 10,
          costSharingRequired: false,
          closeDate: new Date(v === 0 ? "2027-03-15T00:00:00Z" : "2027-06-01T00:00:00Z"),
          status: "posted",
          prefilterEligibility: "likely_eligible",
          prefilterNotes: [],
        },
        new Date(v === 0 ? "2026-11-19T00:00:00Z" : "2026-11-20T00:00:00Z"),
      ),
      schema: MatchScoreOutput,
    }),
    postCheck: (data) => {
      const problems: Problems = [];
      for (const r of data.reasons)
        for (const id of r.factIds) if (!FACT_IDS.has(id)) problems.push(`unknown fact id ${id}`);
      if (data.projectId !== null && data.projectId !== PROJECT.id)
        problems.push(`unknown project id ${data.projectId}`);
      if (!(data.fitScore >= 0 && data.fitScore <= 100)) problems.push(`fitScore ${data.fitScore}`);
      if (!(data.likelihood >= 0 && data.likelihood <= 1))
        problems.push(`likelihood ${data.likelihood}`);
      return problems;
    },
  }),
  spec({
    purpose: PROSPECT_SCORE_PURPOSE,
    callSite: "src/worker/services/prospecting/build.ts",
    longOutput: false,
    effortRange: ["low", "medium"],
    hasUntrusted: true,
    build: (u, v) => {
      const c = {
        ...FOUNDATION,
        name: u(FOUNDATION.name, "record"),
        ein: v === 0 ? "930000001" : "930000002",
      };
      return {
        system: PROSPECT_SYSTEM,
        context: buildProspectContext({
          profileText: u(PROFILE_TEXT, "record"),
          geography: { states: ["OR"], places: ["Harrow Falls"] },
          factsText: factsText(u),
        }),
        prompt: buildProspectPrompt(c, funderFacts(c)),
        schema: ProspectScoreOutput,
      };
    },
    postCheck: (data) => {
      const funderIds = new Set(funderFacts(FOUNDATION).map((f) => f.id));
      const problems: Problems = [];
      for (const r of data.reasons) {
        if (r.factIds.length === 0) problems.push("reason without a citation");
        for (const id of r.factIds)
          if (!FACT_IDS.has(id) && !funderIds.has(id)) problems.push(`unknown fact id ${id}`);
      }
      return problems;
    },
  }),
  spec({
    purpose: PARSE_REQUIREMENTS_PURPOSE,
    callSite: "src/worker/services/discovery/requirements.ts",
    longOutput: true,
    effortRange: ["low", "high"],
    hasUntrusted: true,
    build: (u, v) => ({
      system: REQUIREMENTS_SYSTEM,
      prompt: buildRequirementsPrompt({
        source: "private_import",
        funderName: FUNDER_NAME,
        funderType: "foundation",
        title: v === 0 ? "Adult Learning Grants 2027" : "Library Partnerships Fund",
        summary: "",
        description: u(v === 0 ? OPPORTUNITY_TEXT : OPPORTUNITY_TEXT_B),
        eligibilityText: "",
        applicantTypes: [],
        submissionMethod: "email",
      }),
      schema: OpportunityRequirements,
    }),
    postCheck: (data) => {
      const problems: Problems = [];
      if (data.sections.length < 2)
        problems.push(`expected 2 sections, got ${data.sections.length}`);
      for (const s of data.sections) {
        if (s.prompt && !quoteInText(s.prompt, OPPORTUNITY_TEXT))
          problems.push(`section "${s.key}" prompt is not verbatim`);
        for (const n of [s.wordLimit, s.charLimit])
          if (n != null && !OPPORTUNITY_TEXT.includes(String(n)))
            problems.push(`section "${s.key}" limit ${n} is not in the funder text`);
      }
      return problems;
    },
  }),
  spec({
    purpose: PLAN_QUERIES_PURPOSE,
    callSite: "src/worker/services/discovery/plans.ts",
    longOutput: false,
    effortRange: ["low", "medium"],
    hasUntrusted: true,
    build: (u) => ({
      system: PLANNER_SYSTEM,
      context: renderPlannerContext(u(PROFILE_TEXT, "record"), factsText(u), [
        `[${PROJECT.id}] ${PROJECT.title} — ${u(PROJECT.summary, "record")}`,
      ]),
      prompt: "Plan up to 12 Grants.gov searches for this organization.",
      schema: PlanQueriesOutput,
    }),
    postCheck: (data) => {
      const v = validateSearchPlans(data);
      const problems: Problems = [];
      if (v.plans.length === 0) problems.push("no valid plan");
      if (v.droppedPlans) problems.push(`${v.droppedPlans} plan(s) dropped by validation`);
      if (v.droppedValues)
        problems.push(`${v.droppedValues} code(s)/ALN(s) not on the official lists`);
      return problems;
    },
  }),
  spec({
    purpose: CRITERIA_PURPOSE,
    callSite: "src/worker/services/eligibility/service.ts",
    longOutput: true,
    effortRange: ["low", "high"],
    hasUntrusted: true,
    build: (u, v) => ({
      system: CRITERIA_SYSTEM,
      prompt: buildCriteriaPrompt(renderOpportunityText(criteriaOpportunity(u, v))),
      schema: CriteriaOutput,
    }),
    postCheck: (data, v) => {
      const text = renderOpportunityText(criteriaOpportunity((s) => s, v));
      const problems: Problems = [];
      if (data.criteria.length === 0) problems.push("no criteria");
      for (const c of data.criteria)
        if (!quoteInText(c.sourceQuote, text))
          problems.push(`quote not verbatim: "${c.sourceQuote.slice(0, 60)}"`);
      return problems;
    },
  }),
  spec({
    purpose: ASSESS_PURPOSE,
    callSite: "src/worker/services/eligibility/service.ts",
    longOutput: true,
    effortRange: ["low", "high"],
    hasUntrusted: true,
    build: (u, v) => ({
      system: ASSESS_SYSTEM_PROMPT,
      context: buildAssessContext(renderProfileForPrompt(ELIGIBILITY_PROFILE), factsText(u)),
      prompt: buildAssessPrompt(
        CRITERIA.slice(0, v === 0 ? 2 : 1).map((c) => ({ ...c, sourceQuote: u(c.sourceQuote) })),
      ),
      schema: AssessOutput,
    }),
    postCheck: (data, v) => {
      const wanted = new Set(CRITERIA.slice(0, v === 0 ? 2 : 1).map((c) => c.id));
      const problems: Problems = [];
      for (const a of data.assessments) {
        if (!wanted.has(a.criterionId)) problems.push(`unknown criterion ${a.criterionId}`);
        for (const e of a.evidence)
          if (!FACT_IDS.has(e) && !/^profile:[A-Za-z]+$/.test(e))
            problems.push(`unknown evidence id ${e}`);
        if (a.status !== "unknown" && a.evidence.length === 0)
          problems.push(`${a.criterionId}: ${a.status} without evidence`);
      }
      for (const id of wanted)
        if (!data.assessments.some((a) => a.criterionId === id))
          problems.push(`criterion ${id} not assessed`);
      // Nothing in the fixture proves three years of operation except a *proposed* founding fact.
      const c2 = data.assessments.find((a) => a.criterionId === "c2");
      if (c2?.status === "not_met") problems.push("c2 judged not_met on missing evidence");
      return problems;
    },
  }),
  spec({
    purpose: DETECT_PURPOSE,
    callSite: "src/worker/services/watchlist/detect.ts",
    longOutput: true,
    effortRange: ["low", "medium"],
    hasUntrusted: true,
    build: (u, v) => ({
      system: DETECT_SYSTEM,
      prompt: buildDetectPrompt({
        pageUrl: PAGE_URL,
        funderName: "Harrow County Community Fund",
        kind: "listing_page",
        changedText: u(PAGE_TEXT),
        firstCheck: v === 0,
      }),
      schema: DetectOutput,
    }),
    postCheck: (data) => {
      const page = { url: PAGE_URL, text: PAGE_TEXT, links: [`${PAGE_URL}/literacy-2027`] };
      const problems: Problems = [];
      if (data.candidates.length !== 1)
        problems.push(`expected 1 candidate, got ${data.candidates.length}`);
      for (const c of data.candidates) {
        const r = verifyCandidate(c, page);
        if (!r.ok) problems.push(`candidate "${c.title}" dropped: ${r.reason}`);
        else if (c.amountCents !== null && r.candidate.amountCents === null)
          problems.push("amount not traceable to the page");
      }
      return problems;
    },
  }),
  spec({
    purpose: IMPORT_PURPOSE,
    callSite: "src/worker/services/imports/extract.ts",
    longOutput: true,
    effortRange: ["low", "high"],
    hasUntrusted: true,
    build: (u, v) => ({
      system: IMPORT_SYSTEM,
      prompt: buildImportPrompt(
        u(v === 0 ? IMPORT_TEXT : OPPORTUNITY_TEXT_B),
        u("upload: rfp.pdf", "record"),
      ),
      schema: ExtractedOpportunity,
    }),
    postCheck: (data) => {
      const problems: Problems = [];
      if (!data.isGrantOpportunity) problems.push("isGrantOpportunity=false for an RFP");
      const verified = verifyAgainstSource(data, IMPORT_TEXT);
      for (const k of Object.keys(data) as (keyof typeof data)[]) {
        if (k === "requirements") continue;
        if (JSON.stringify(data[k]) !== JSON.stringify(verified[k]))
          problems.push(`${String(k)} stripped by verifyAgainstSource (not in the source)`);
      }
      if (data.awardCeilingCents !== 2_500_000)
        problems.push(`awardCeilingCents ${data.awardCeilingCents}`);
      return problems;
    },
  }),
  spec({
    purpose: "interview.next_question",
    callSite: "src/worker/services/interview/engine.ts",
    longOutput: false,
    effortRange: ["low", "medium"],
    hasUntrusted: true,
    build: (u, v) => ({
      system: INTERVIEWER_SYSTEM,
      context: buildInterviewerContext(ORG_NAME, factsText(u)),
      prompt: buildNextQuestionPrompt(
        {
          kind: "project",
          orgName: ORG_NAME,
          projectTitle: PROJECT.title,
          agenda: AGENDA,
          coveredTopics: v === 0 ? [] : ["reach"],
          questionsAsked: v === 0 ? 1 : 2,
          maxQuestions: 12,
          currentTopic: "reach",
          followUpsOnCurrentTopic: 0,
          lastAnswer: u("We served 214 adult learners in 2025."),
        },
        TURNS(u)
          .slice(0, v === 0 ? 2 : 4)
          .map((t) => ({ role: t.role, content: t.content, topicKey: "reach" })),
      ),
      schema: NextQuestionSchema,
    }),
    postCheck: (data) => {
      const problems: Problems = [];
      if (!data.done && !data.question.trim().endsWith("?"))
        problems.push("question is not a question");
      if (!AGENDA.some((a) => a.key === data.topicKey))
        problems.push(`unknown topicKey ${data.topicKey}`);
      for (const k of data.coveredTopics)
        if (!AGENDA.some((a) => a.key === k)) problems.push(`unknown covered topic ${k}`);
      return problems;
    },
  }),
  spec({
    purpose: "interview.summary",
    callSite: "src/worker/services/interview/engine.ts",
    longOutput: false,
    effortRange: ["low", "medium"],
    hasUntrusted: true,
    build: (u) => ({
      system: INTERVIEW_SUMMARY_SYSTEM,
      prompt: buildInterviewSummaryPrompt(STATEMENTS(u)),
      schema: SummarySchema,
    }),
    postCheck: (data) => {
      const source = STATEMENTS((s) => s)
        .map((s) => s.text)
        .join(" ");
      const extra = unmatchedNumbers(data.summary, source);
      const problems: Problems = [];
      if (!data.summary.trim()) problems.push("empty summary");
      if (extra.length) problems.push(`numbers the respondent did not say: ${extra.join(", ")}`);
      return problems;
    },
  }),
  spec({
    purpose: "interview.project_fields",
    callSite: "src/worker/services/interview/engine.ts",
    longOutput: false,
    effortRange: ["low", "high"],
    hasUntrusted: true,
    build: (u, v) => ({
      system: PROJECT_FIELDS_SYSTEM,
      prompt: buildProjectFieldsPrompt(
        PROJECT.title,
        v === 0 ? ["budgetNeeded", "timelineStart"] : ["budgetNeeded"],
        STATEMENTS(u),
      ),
      schema: ProjectFieldsSchema,
    }),
    postCheck: (data, v) => {
      const empty =
        v === 0 ? (["budgetNeeded", "timelineStart"] as const) : (["budgetNeeded"] as const);
      const { accepted } = validateProjectFields(
        data,
        [...empty],
        STATEMENTS((s) => s),
      );
      const problems: Problems = [];
      if (accepted.length < data.fields.length)
        problems.push(
          `${data.fields.length - accepted.length} field(s) rejected by validateProjectFields`,
        );
      if (!accepted.some((a) => a.field === "budgetNeeded"))
        problems.push("budgetNeeded not filled");
      return problems;
    },
  }),
  spec({
    purpose: QUALITY_PURPOSE,
    callSite: "src/worker/services/quality/review.ts",
    longOutput: true,
    effortRange: ["medium", "high"],
    hasUntrusted: true,
    build: (u, v) => ({
      system: QUALITY_SYSTEM_PROMPT,
      context: buildQualityContext({ opportunity: qualityOpportunity(u), facts: qualityFacts(u) }),
      prompt: buildQualitySectionPrompt({
        sectionIndex: v + 1,
        requirement: { ...sectionFor(v), prompt: u(sectionFor(v).prompt) },
        section: draftContent(u).sections[0] as DraftSection,
        criteria: QUALITY_CRITERIA.map((c) => ({ ...c, description: u(c.description) })),
      }),
      schema: RubricReviewOutput,
    }),
    postCheck: (data, v) => {
      const section = draftContent((s) => s).sections[0] as DraftSection;
      const res = finalizeSectionReview(data, {
        sectionKey: section.key,
        facts: new Map(FACTS.map((f) => [f.id, `${f.statement} ${f.sourceQuote}`])),
        sourceText: `${JSON.stringify(section)} ${sectionFor(v).prompt} ${QUALITY_CRITERIA[0]?.description}`,
        published: QUALITY_CRITERIA,
      });
      const problems: Problems = [];
      if (res.criteria.length === 0) problems.push("no criterion scored");
      if (res.droppedFactIds) problems.push(`${res.droppedFactIds} unknown fact id(s) cited`);
      if (res.droppedSuggestions)
        problems.push(`${res.droppedSuggestions} suggestion(s) dropped by validation`);
      return problems;
    },
  }),
];

const QUALITY_CRITERIA = [
  {
    name: "Clarity of need",
    description: "The application documents the need with local data.",
    weight: 10,
    sectionKeys: [],
  },
];
const qualityOpportunity = (u: Untrusted) => ({
  title: "Adult Learning Grants 2027",
  funderName: FUNDER_NAME,
  summary: u("Supports organizations that help adults improve their reading and writing."),
  description: u(OPPORTUNITY_TEXT),
  eligibilityText: "",
  awardFloorCents: null,
  awardCeilingCents: 2_500_000,
  closeDate: null,
});
const qualityFacts = (u: Untrusted) =>
  FACTS.map((f) => ({
    id: f.id,
    category: "metric" as const,
    statement: u(f.statement, "record"),
    status: f.status,
    sourceQuote: f.sourceQuote,
    asOf: f.asOf ?? null,
  }));

const AGENDA = [
  { key: "reach", label: "Reach", question: "How many people does the project serve?" },
  { key: "approach", label: "Approach", question: "How does the project work?" },
  { key: "budget", label: "Budget", question: "What will the project cost?" },
];

function docChunks(u: Untrusted): SourceChunk[] {
  return [{ ref: "C1", id: "chk_1", heading: "Our year", text: u(DOC_CHUNK) }];
}

function judgeClaims(u: Untrusted): JudgeClaim[] {
  const f = (id: string) => {
    const fact = FACTS.find((x) => x.id === id);
    if (!fact) throw new Error(id);
    return {
      id,
      statement: u(fact.statement),
      sourceQuote: u(fact.sourceQuote),
      asOf: fact.asOf ?? null,
    };
  };
  return [
    {
      claimId: "k1",
      text: u("In 2025 we served 214 adult learners."),
      citedFacts: [f("fct_qlc02")],
    },
    {
      claimId: "k2",
      text: u("In 2025 we served 900 adult learners across three counties."),
      citedFacts: [f("fct_qlc02")],
    },
    {
      claimId: "k3",
      text: u("Our 38 volunteer tutors are certified by the Oregon Literacy Board."),
      citedFacts: [f("fct_qlc04")],
    },
  ];
}
