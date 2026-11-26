// Criteria extraction, pure half: render the listing text the model sees, the prompt, and the
// deterministic post-processing (verbatim-quote check, dedupe, listing-field criteria).
// Imports only pure helpers (knowledge/text) so it unit-tests in Node.
import type { OpportunityRequirements } from "@shared/content";
import {
  CRITERION_KINDS,
  type CriterionKind,
  type EligibilityCriterion,
} from "@shared/eligibility";
import { z } from "zod";
import { normalizeForMatch, quoteInText } from "../knowledge/text";
import { UNTRUSTED_CONTENT_POLICY, wrapUntrusted } from "../safety/untrusted";

export const EXTRACT_PURPOSE = "eligibility.extract_criteria";
export const EXTRACT_PROMPT_VERSION = "eligibility.extract_criteria/v1";
/** criteriaModel when no LLM ran (listing fields only). */
export const STRUCTURED_MODEL = "structured";

export const MAX_CRITERIA = 25;
const MAX_QUOTE_CHARS = 1_000;
const MAX_TEXT_CHARS = 400;

export const ExtractOutput = z.object({
  criteria: z.array(
    z.object({
      kind: z.enum(CRITERION_KINDS),
      text: z.string().describe("The requirement restated plainly in one sentence"),
      sourceQuote: z
        .string()
        .describe("An exact span copied character-for-character from the opportunity text"),
    }),
  ),
});
export type ExtractOutput = z.infer<typeof ExtractOutput>;

export interface CriteriaOpportunity {
  title: string;
  funderName: string;
  summary: string;
  description: string;
  eligibilityText: string;
  applicantTypes: string[];
  geographicScope: string | null;
  costSharingRequired: boolean | null;
  requirements: OpportunityRequirements | null;
}

const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max)}…` : s);

/** grants.gov's own field label; the value is the funder's flag. */
export const COST_SHARE_YES = "Cost sharing or matching requirement: Yes";
export const APPLICANTS_LABEL = "Eligible applicants: ";
export const SCOPE_LABEL = "Geographic scope: ";

export const applicantsLine = (types: readonly string[]) =>
  types.length > 0 ? `${APPLICANTS_LABEL}${types.join("; ")}` : "";

/**
 * The listing as one text: the funder's fields under grants.gov-style labels. Quotes are verified
 * against exactly this text, so the model can only cite what the funder published.
 */
export function renderOpportunityText(o: CriteriaOpportunity): string {
  const criteria = o.requirements?.eligibilityCriteria ?? [];
  const parts = [
    `Title: ${o.title}`,
    `Funder: ${o.funderName}`,
    applicantsLine(o.applicantTypes),
    o.geographicScope?.trim() ? `${SCOPE_LABEL}${o.geographicScope.trim()}` : "",
    o.costSharingRequired == null
      ? ""
      : o.costSharingRequired
        ? COST_SHARE_YES
        : "Cost sharing or matching requirement: No",
    o.eligibilityText.trim() ? `Eligibility:\n${clip(o.eligibilityText.trim(), 8_000)}` : "",
    criteria.length > 0
      ? `Eligibility criteria:\n${criteria.map((c) => `- ${clip(c, 600)}`).join("\n")}`
      : "",
    o.summary.trim() ? `Summary:\n${clip(o.summary.trim(), 3_000)}` : "",
    o.description.trim() ? `Description:\n${clip(o.description.trim(), 12_000)}` : "",
  ];
  return parts.filter(Boolean).join("\n\n");
}

/** True when the listing has something beyond title/funder worth sending to the model. */
export function hasEligibilitySignal(o: CriteriaOpportunity): boolean {
  return Boolean(
    o.eligibilityText.trim() ||
      o.description.trim() ||
      o.summary.trim() ||
      (o.requirements?.eligibilityCriteria.length ?? 0) > 0,
  );
}

export const EXTRACT_SYSTEM_PROMPT = `You extract the eligibility requirements from a grant opportunity listing.

Return every requirement an APPLICANT must satisfy to be eligible to apply or to receive the award. Use these kinds:
- applicant_type: which kinds of entities may apply (nonprofits, tribal governments, schools...)
- tax_status: IRS tax-exempt status such as 501(c)(3), or an EIN
- registration: SAM.gov / UEI, Grants.gov, state charity or other registrations
- geography: where the applicant must be located or whom/where it must serve
- population: the population the project must serve
- budget_size: limits on the applicant's annual budget or revenue
- years_operating: minimum years in operation or program history
- cost_share: required cost sharing or matching funds
- prior_funding_restriction: rules about current or past awards from this funder
- other: any other hard requirement

Rules:
- "sourceQuote" MUST be copied exactly, character for character, from the opportunity text: one contiguous span (a phrase or sentence), never paraphrased, merged or abbreviated. Requirements without such a span are omitted.
- "text" restates the requirement plainly in one sentence, adding nothing that the quote does not say.
- Skip funding priorities, preferences, scoring criteria, allowable costs and statements that something is NOT required.
- One requirement per item; split sentences that combine unrelated requirements. Do not repeat a requirement.
- The listing is the <untrusted_content label="funder_listing"> block inside <opportunity>.

${UNTRUSTED_CONTENT_POLICY}`;

export function buildExtractPrompt(text: string): string {
  // The listing is funder-published (untrusted): normalized, tag-neutralized and delimited.
  // Quotes are still verified against the raw text with normalizeForMatch (same normalization).
  return `Extract the eligibility requirements from this opportunity.\n\n<opportunity>\n${wrapUntrusted("funder_listing", text)}\n</opportunity>`;
}

/** "No cost sharing is required", "Cost sharing is not required", "...matching requirement: No". */
const NOT_REQUIRED =
  /\b(no|not)\s+(?:\w+\s+){0,2}?(cost[- ]?shar\w*|match\w*)\b[^.]{0,30}\b(requir\w*|necessary|expected)\b|\b(cost[- ]?shar\w*|match\w*)\b[^.]{0,40}(\bnot required\b|:\s*(no|none|n\/a)\b)/i;

export interface FinalizeStats {
  dropped: { unverifiedQuote: number; duplicate: number; notARequirement: number };
}

/**
 * Keeps only criteria whose sourceQuote is verbatim in `sourceText` (whitespace/case-insensitive),
 * drops duplicates and "not required" statements, appends criteria the listing's structured fields
 * imply, and assigns ids c1..cN.
 */
export function finalizeCriteria(
  raw: ExtractOutput["criteria"],
  o: CriteriaOpportunity,
  sourceText: string,
): { criteria: EligibilityCriterion[]; stats: FinalizeStats } {
  const stats: FinalizeStats = {
    dropped: { unverifiedQuote: 0, duplicate: 0, notARequirement: 0 },
  };
  const kept: Omit<EligibilityCriterion, "id">[] = [];
  const seen = new Set<string>();
  for (const c of raw) {
    const quote = c.sourceQuote.trim();
    if (!quote || quote.length > MAX_QUOTE_CHARS || !quoteInText(quote, sourceText)) {
      stats.dropped.unverifiedQuote++;
      continue;
    }
    if (c.kind === "cost_share" && NOT_REQUIRED.test(quote)) {
      stats.dropped.notARequirement++;
      continue;
    }
    const key = `${c.kind}|${normalizeForMatch(quote)}`;
    if (seen.has(key)) {
      stats.dropped.duplicate++;
      continue;
    }
    seen.add(key);
    const text = c.text.replace(/\s+/g, " ").trim() || quote;
    kept.push({ kind: c.kind, text: clip(text, MAX_TEXT_CHARS), sourceQuote: quote });
  }
  for (const s of structuredCriteria(o, kept)) kept.push(s);
  return {
    criteria: kept.slice(0, MAX_CRITERIA).map((c, i) => ({ id: `c${i + 1}`, ...c })),
    stats,
  };
}

const NATIONAL = /\b(national|nationwide|united states|all states|any state)\b|\bU\.?S\.?A?\b/i;

/**
 * Criteria implied by structured listing fields that the model did not already cover, so the
 * deterministic checks always run on them. Their quotes are lines of the rendered listing text.
 */
export function structuredCriteria(
  o: CriteriaOpportunity,
  existing: readonly Omit<EligibilityCriterion, "id">[],
): Omit<EligibilityCriterion, "id">[] {
  const out: Omit<EligibilityCriterion, "id">[] = [];
  const has = (kind: CriterionKind, pred: (quote: string) => boolean = () => true) =>
    existing.some((c) => c.kind === kind && pred(c.sourceQuote));
  const line = applicantsLine(o.applicantTypes);
  if (line && !has("applicant_type", (q) => quoteInText(q, line))) {
    out.push({
      kind: "applicant_type",
      text: "The applicant must be one of the eligible applicant types listed.",
      sourceQuote: o.applicantTypes.join("; "),
    });
  }
  if (o.costSharingRequired === true && !has("cost_share")) {
    out.push({
      kind: "cost_share",
      text: "The funder requires cost sharing or matching funds.",
      sourceQuote: COST_SHARE_YES,
    });
  }
  const scope = o.geographicScope?.trim();
  if (scope && scope.length >= 4 && !NATIONAL.test(scope) && !has("geography")) {
    out.push({
      kind: "geography",
      text: `Applicants must be located in or serve: ${scope}.`,
      sourceQuote: `${SCOPE_LABEL}${scope}`,
    });
  }
  return out;
}
