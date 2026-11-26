// Structured content stored in JSON columns and exchanged between pipeline stages.
// These are the core anti-fabrication contracts: every factual claim in a draft must cite
// fact ids, and the grounding verifier records a verdict per claim.
import { z } from "zod";

/** One requirement (question / section / field / attachment) parsed from a funder's RFP. */
export const RequirementSection = z.object({
  key: z.string().min(1), // stable slug, e.g. "need_statement"
  title: z.string(),
  prompt: z.string().default(""), // the funder's question, verbatim when available
  kind: z.enum(["narrative", "budget", "form_field", "attachment"]).default("narrative"),
  required: z.boolean().default(true),
  wordLimit: z
    .number()
    .int()
    .positive()
    .nullable()
    .default(null)
    .describe("Maximum words the funder allows for this answer, only if stated; else null"),
  charLimit: z
    .number()
    .int()
    .positive()
    .nullable()
    .default(null)
    .describe("Maximum characters the funder allows for this answer, only if stated; else null"),
  guidance: z.string().default(""), // scoring criteria / reviewer guidance if published
});
export type RequirementSection = z.infer<typeof RequirementSection>;

export const OpportunityRequirements = z.object({
  sections: z.array(RequirementSection).default([]),
  attachments: z
    .array(
      z.object({ name: z.string(), required: z.boolean(), description: z.string().default("") }),
    )
    .default([]),
  eligibilityCriteria: z.array(z.string()).default([]),
  submissionInstructions: z.string().default(""),
  /** true when parsed from the full RFP; false when we only know the listing summary. */
  complete: z.boolean().default(false),
});
export type OpportunityRequirements = z.infer<typeof OpportunityRequirements>;

/**
 * factual – asserts something about the org/project/world. MUST cite >= 1 fact.
 * framing – connective or persuasive language with no checkable assertion ("We welcome the
 *           opportunity to..."). Must not contain numbers, names, dates or outcomes.
 */
export const ClaimKind = z.enum(["factual", "framing"]);
export type ClaimKind = z.infer<typeof ClaimKind>;

export const Claim = z.object({
  id: z.string(), // unique within a version, e.g. "s1.p2.c3"
  text: z.string(),
  kind: ClaimKind,
  factIds: z.array(z.string()).default([]),
});
export type Claim = z.infer<typeof Claim>;

export const Paragraph = z.object({
  id: z.string(),
  claims: z.array(Claim),
});
export type Paragraph = z.infer<typeof Paragraph>;

export const DraftSection = z.object({
  key: z.string(), // RequirementSection.key
  title: z.string(),
  paragraphs: z.array(Paragraph),
  /** Questions the drafter could not answer from facts. Never filled with invented text. */
  gaps: z.array(z.object({ question: z.string(), why: z.string() })).default([]),
});
export type DraftSection = z.infer<typeof DraftSection>;

export const ApplicationContent = z.object({
  sections: z.array(DraftSection),
});
export type ApplicationContent = z.infer<typeof ApplicationContent>;

export const ClaimVerdict = z.object({
  claimId: z.string(),
  verdict: z.enum(["supported", "partially_supported", "unsupported", "not_checkable"]),
  reason: z.string().default(""),
  /** Deterministic check: numbers/dates/amounts in the claim that do not appear in cited facts. */
  unmatchedNumbers: z.array(z.string()).default([]),
  /** Cited facts that are only `proposed` (not human-confirmed). */
  unconfirmedFactIds: z.array(z.string()).default([]),
});
export type ClaimVerdict = z.infer<typeof ClaimVerdict>;

export const GroundingReport = z.object({
  totalClaims: z.number().int(),
  factualClaims: z.number().int(),
  supported: z.number().int(),
  partiallySupported: z.number().int(),
  unsupported: z.number().int(),
  numericMismatches: z.number().int(),
  unconfirmedFactCitations: z.number().int(),
  gaps: z.number().int(),
  /** true only when there are zero unsupported claims, zero numeric mismatches and zero gaps. */
  passed: z.boolean(),
  verdicts: z.array(ClaimVerdict),
  checkedAt: z.number().int(), // epoch ms
  model: z.string(),
});
export type GroundingReport = z.infer<typeof GroundingReport>;

export const MatchReason = z.object({
  text: z.string(),
  polarity: z.enum(["positive", "negative", "neutral"]),
  factIds: z.array(z.string()).default([]),
});
export type MatchReason = z.infer<typeof MatchReason>;

/** Stored on facts.value for quantitative facts so numbers can be checked deterministically. */
export const FactValue = z
  .object({
    number: z.number().nullable().default(null),
    unit: z.string().nullable().default(null), // "people", "USD", "percent", "years"...
    year: z.number().int().nullable().default(null),
    text: z.string().nullable().default(null),
  })
  .partial();
export type FactValue = z.infer<typeof FactValue>;
