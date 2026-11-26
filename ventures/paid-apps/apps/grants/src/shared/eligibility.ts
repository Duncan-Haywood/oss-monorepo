// Eligibility intelligence contracts (worker <-> client). Criteria are extracted once per
// opportunity (every sourceQuote verified verbatim against the listing); each org's check stores a
// checklist where every `met` / `not_met` is backed by fact ids or profile fields, else `unknown`.
import { z } from "zod";
import type { Eligibility } from "./enums";
import { FACT_STATUSES } from "./enums";

export const CRITERION_KINDS = [
  "applicant_type",
  "tax_status",
  "registration",
  "geography",
  "population",
  "budget_size",
  "years_operating",
  "cost_share",
  "prior_funding_restriction",
  "other",
] as const;
export type CriterionKind = (typeof CRITERION_KINDS)[number];

export const CRITERION_KIND_LABELS: Record<CriterionKind, string> = {
  applicant_type: "Applicant type",
  tax_status: "Tax status",
  registration: "Registration",
  geography: "Geography",
  population: "Population served",
  budget_size: "Budget size",
  years_operating: "Years operating",
  cost_share: "Cost share / match",
  prior_funding_restriction: "Prior funding",
  other: "Other",
};

/** One funder requirement. `sourceQuote` is verbatim from the opportunity listing. */
export const EligibilityCriterion = z.object({
  id: z.string(), // "c1", "c2"... stable within one extraction
  kind: z.enum(CRITERION_KINDS),
  text: z.string(), // plain-language restatement
  sourceQuote: z.string(),
});
export type EligibilityCriterion = z.infer<typeof EligibilityCriterion>;

export const CHECK_STATUSES = ["met", "not_met", "unknown"] as const;
export type CheckStatus = (typeof CHECK_STATUSES)[number];

/** Org profile fields that may be cited as evidence, as `profile:<field>`. */
export const PROFILE_EVIDENCE_FIELDS = [
  "legalName",
  "orgType",
  "ein",
  "uei",
  "city",
  "state",
  "country",
  "serviceAreas",
  "foundedYear",
] as const;
export type ProfileEvidenceField = (typeof PROFILE_EVIDENCE_FIELDS)[number];

export const EvidenceRef = z.object({
  /** "fct_..." or "profile:<field>". */
  ref: z.string(),
  kind: z.enum(["fact", "profile"]),
  /** Snapshot of the fact statement / profile value at check time. */
  label: z.string(),
  /** Facts only: `proposed` evidence is unconfirmed and caps the overall verdict at "likely". */
  factStatus: z.enum(FACT_STATUSES).nullable().default(null),
});
export type EvidenceRef = z.infer<typeof EvidenceRef>;

export const ChecklistItem = z.object({
  criterionId: z.string(),
  kind: z.enum(CRITERION_KINDS),
  text: z.string(),
  sourceQuote: z.string(),
  status: z.enum(CHECK_STATUSES),
  /** deterministic = profile/listing rule; assessed = LLM with validated citations; none = undecided. */
  method: z.enum(["deterministic", "assessed", "none"]),
  reason: z.string(),
  evidence: z.array(EvidenceRef),
});
export type ChecklistItem = z.infer<typeof ChecklistItem>;

export const MissingInfoQuestion = z.object({
  criterionId: z.string(),
  question: z.string(),
});
export type MissingInfoQuestion = z.infer<typeof MissingInfoQuestion>;

export const ELIGIBILITY_OVERALL = ["eligible", "likely", "unknown", "ineligible"] as const;
export type EligibilityOverall = (typeof ELIGIBILITY_OVERALL)[number];

/** Stored in org_eligibility.result. */
export const EligibilityResult = z.object({
  opportunityId: z.string(),
  overall: z.enum(ELIGIBILITY_OVERALL),
  summary: z.string(),
  checklist: z.array(ChecklistItem),
  missingInfoQuestions: z.array(MissingInfoQuestion),
  /** Model that extracted the criteria ("structured" = listing fields only, no LLM). */
  criteriaModel: z.string(),
  /** Model that assessed undecided criteria (null = no LLM assessment ran). */
  assessModel: z.string().nullable(),
});
export type EligibilityResult = z.infer<typeof EligibilityResult>;

/** GET /api/orgs/:orgId/eligibility/:opportunityId and POST .../recheck. */
export type EligibilityCheckDto = EligibilityResult & { checkedAt: string };

/** Map onto opportunity_matches.eligibility (the matching module's enum). */
export const OVERALL_TO_MATCH_ELIGIBILITY: Record<EligibilityOverall, Eligibility> = {
  eligible: "eligible",
  likely: "likely_eligible",
  unknown: "unknown",
  ineligible: "ineligible",
};
