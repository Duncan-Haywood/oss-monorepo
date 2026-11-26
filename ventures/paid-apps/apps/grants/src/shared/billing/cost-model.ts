// Cost model: what one drafted application, and one org-month on each plan, costs us to serve.
// Pure functions + documented assumptions. Plans (./plans.ts) are derived from this model and a unit
// test enforces price ≥ 1.67× the estimated full cost (a 40% margin floor; no ceiling). Re-measure the
// token assumptions with `pnpm tsx evals/cost-benchmark.ts` and update STAGE_TOKENS when the pipeline's prompts change.
import { costMicros, MODEL_PRICES } from "@worker/ports/llm-pricing";

export const DEFAULT_MODEL = "claude-haiku-5-5";

/** 1 USD = 1_000_000 micro-USD; 1 cent = 10_000 micro-USD. */
export const MICROS_PER_CENT = 10_000;
export const centsToMicros = (cents: number) => cents * MICROS_PER_CENT;
export const microsToUsd = (micros: number) => micros / 1_000_000;

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

const tok = (input: number, output: number, cacheRead = 0, cacheWrite = 0): TokenUsage => ({
  inputTokens: input,
  outputTokens: output,
  cacheReadTokens: cacheRead,
  cacheWriteTokens: cacheWrite,
});

/**
 * Per-call token assumptions (output includes adaptive-thinking tokens). Sized for a typical foundation
 * / small federal application: ~10k-token RFP, 6 narrative sections, ~15k tokens of confirmed facts +
 * retrieved style chunks shared (prompt-cached) across section drafts.
 */
export const STAGE_TOKENS = {
  /** requirements.parse — system 2k + RFP 10k in; structured requirements out. */
  requirementsParse: tok(12_000, 2_500),
  /** drafting.section, first call: writes the system + fact-context cache (17k). */
  sectionDraftFirst: tok(3_500, 2_500, 0, 17_000),
  /** drafting.section, later calls: read the cached 17k, 3.5k section-specific prompt. */
  sectionDraftCached: tok(3_500, 2_500, 17_000, 0),
  /** drafting.summary — all sections (~9k) in, executive summary out. */
  summary: tok(9_000, 1_200),
  /** grounding.verify per section — claims + cited facts/quotes in, per-claim verdicts out. */
  groundingVerify: tok(7_500, 1_800),
  /** matching.score per opportunity — cached org profile 4k, opportunity 1.5k in, fit rationale out. */
  matchScore: tok(1_500, 450, 4_000, 200),
  /** knowledge.extract per document page — ~900-token page + cached system, atomic facts out. */
  factExtractPage: tok(900, 450, 1_500, 75),
  /** interview.turn — cached system/org context + growing history, next question out. */
  interviewTurn: tok(1_800, 400, 3_000, 150),
} satisfies Record<string, TokenUsage>;

export type StageKey = keyof typeof STAGE_TOKENS;

export interface ApplicationShape {
  sections: number;
  /** Multiplier on drafting + verification for regenerations / edits that re-verify (1.3 = +30%). */
  revisionFactor: number;
}

export const DEFAULT_APPLICATION_SHAPE: ApplicationShape = { sections: 6, revisionFactor: 1.3 };

export interface StageLine {
  stage: string;
  purpose: string;
  calls: number;
  costMicros: number;
}

export function usageCostMicros(u: TokenUsage, model = DEFAULT_MODEL): number {
  return costMicros(model, u);
}

/** Estimated LLM cost of drafting one application end to end, by stage. */
export function applicationCostEstimate(
  model = DEFAULT_MODEL,
  shape: ApplicationShape = DEFAULT_APPLICATION_SHAPE,
): { lines: StageLine[]; totalMicros: number } {
  const c = (k: StageKey) => usageCostMicros(STAGE_TOKENS[k], model);
  const r = shape.revisionFactor;
  const n = Math.max(1, shape.sections);
  const lines: StageLine[] = [
    {
      stage: "Requirements parse",
      purpose: "requirements.parse",
      calls: 1,
      costMicros: c("requirementsParse"),
    },
    {
      stage: "Section drafts (cached facts)",
      purpose: "drafting.section",
      calls: n * r,
      costMicros: Math.round((c("sectionDraftFirst") + (n - 1) * c("sectionDraftCached")) * r),
    },
    { stage: "Executive summary", purpose: "drafting.summary", calls: 1, costMicros: c("summary") },
    {
      stage: "Grounding verification",
      purpose: "grounding.verify",
      calls: n * r,
      costMicros: Math.round(n * c("groundingVerify") * r),
    },
  ];
  return { lines, totalMicros: lines.reduce((s, l) => s + l.costMicros, 0) };
}

// ---- Hosting (Cloudflare) -------------------------------------------------------------------------

/**
 * Workers Paid is $5/month per account and includes Workers/D1/Queues/Workflows quotas far above our
 * scale. We amortize it over a conservative 25 paying orgs. Per-org variable usage beyond the included
 * quotas: R2 storage (~1 GB at $0.015/GB-mo), Vectorize stored/queried dimensions, Workers AI embeddings
 * (bge-m3), toMarkdown conversions, Whisper minutes, email — budgeted generously below.
 */
export const HOSTING = {
  workersPaidBaseMicros: 5_000_000,
  amortizedOverOrgs: 25,
  perOrgVariableMicros: 100_000,
  perDraftMicros: 10_000,
} as const;

export function hostingMicros(drafts: number): number {
  return (
    Math.round(HOSTING.workersPaidBaseMicros / HOSTING.amortizedOverOrgs) +
    HOSTING.perOrgVariableMicros +
    drafts * HOSTING.perDraftMicros
  );
}

// ---- Merchant of record ----------------------------------------------------------------------------

/** Paddle pay-as-you-go: 5% + $0.50 per checkout transaction (tax, invoicing, fraud included). */
export const MERCHANT_FEES = { provider: "paddle", percent: 0.05, fixedCents: 50 } as const;

/** Reserve for the money-back guarantee (refunded charges still cost us the MoR fee + tokens). */
export const REFUND_RESERVE_PERCENT = 0.03;

export function merchantFeeMicros(chargeCents: number): number {
  if (chargeCents <= 0) return 0;
  return Math.round(
    centsToMicros(chargeCents) * MERCHANT_FEES.percent + centsToMicros(MERCHANT_FEES.fixedCents),
  );
}

// ---- Org-month ------------------------------------------------------------------------------------

export type BillingInterval = "month" | "year";

export interface UsageAllowance {
  applicationDrafts: number;
  opportunityScores: number;
  documentPages: number;
  interviewTurns: number;
}

export interface MonthlyCostBreakdown {
  draftsMicros: number;
  matchingMicros: number;
  ingestionMicros: number;
  interviewMicros: number;
  llmMicros: number;
  hostingMicros: number;
  merchantFeeMicros: number;
  refundReserveMicros: number;
  totalMicros: number;
}

/** Fully loaded monthly cost of an org that uses its whole allowance. Annual fees are spread over 12. */
export function monthlyCost(
  allowance: UsageAllowance,
  charge: { cents: number; interval: BillingInterval },
  model = DEFAULT_MODEL,
): MonthlyCostBreakdown {
  const perDraft = applicationCostEstimate(model).totalMicros;
  const s = (k: StageKey) => usageCostMicros(STAGE_TOKENS[k], model);
  const draftsMicros = allowance.applicationDrafts * perDraft;
  const matchingMicros = allowance.opportunityScores * s("matchScore");
  const ingestionMicros = allowance.documentPages * s("factExtractPage");
  const interviewMicros = allowance.interviewTurns * s("interviewTurn");
  const llmMicros = draftsMicros + matchingMicros + ingestionMicros + interviewMicros;
  const months = charge.interval === "year" ? 12 : 1;
  const fee = Math.round(merchantFeeMicros(charge.cents) / months);
  const reserve = Math.round((centsToMicros(charge.cents) * REFUND_RESERVE_PERCENT) / months);
  const hosting = hostingMicros(allowance.applicationDrafts);
  return {
    draftsMicros,
    matchingMicros,
    ingestionMicros,
    interviewMicros,
    llmMicros,
    hostingMicros: hosting,
    merchantFeeMicros: fee,
    refundReserveMicros: reserve,
    totalMicros: llmMicros + hosting + fee + reserve,
  };
}

/** price / cost for one month of service (1.4 = 40% over full cost). */
export function markup(
  charge: { cents: number; interval: BillingInterval },
  costMicrosPerMonth: number,
) {
  const months = charge.interval === "year" ? 12 : 1;
  return centsToMicros(charge.cents) / months / costMicrosPerMonth;
}

export const knownModel = (model: string) => model in MODEL_PRICES;
