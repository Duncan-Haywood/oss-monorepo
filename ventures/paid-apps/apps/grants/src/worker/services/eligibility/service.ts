// Eligibility service: extract criteria per opportunity (cached), check them for an org
// (deterministic first, then a cited LLM assessment), store the checklist per org.
import {
  type ChecklistItem,
  type EligibilityCriterion,
  EligibilityResult,
} from "@shared/eligibility";
import type { FactCategory } from "@shared/enums";
import { and, eq } from "drizzle-orm";
import type { AppContext } from "../../context";
import { opportunities } from "../../db/schema";
import { opportunityCriteria, orgEligibility } from "../../db/schema/eligibility";
import { notFound } from "../../lib/errors";
import { sha256Hex } from "../../lib/hash";
import { LlmOutputError, LlmRefusalError } from "../../ports/llm";
import { getOpportunity, type OpportunityRow, visibleTo } from "../discovery";
import { type FactRow, formatFactsForPrompt, getFactsForDrafting } from "../knowledge";
import { getOrgProfile, type OrgProfile } from "../orgs";
import {
  ASSESS_PURPOSE,
  ASSESS_SYSTEM_PROMPT,
  type AssessedCriterion,
  AssessOutput,
  buildAssessContext,
  buildAssessPrompt,
  type CitableFact,
  missingInfoQuestions,
  overallVerdict,
  renderProfileForPrompt,
  summarize,
  validateAssessments,
} from "./assess";
import {
  buildExtractPrompt,
  type CriteriaOpportunity,
  EXTRACT_PROMPT_VERSION,
  EXTRACT_PURPOSE,
  EXTRACT_SYSTEM_PROMPT,
  ExtractOutput,
  finalizeCriteria,
  hasEligibilitySignal,
  renderOpportunityText,
  STRUCTURED_MODEL,
} from "./criteria";
import { decideDeterministically, type EligibilityProfile, profileEvidence } from "./deterministic";

const MAX_FACTS_IN_PROMPT = 200;
/** ensureEligibility(): reuse a stored check younger than this (unless the listing changed). */
export const ELIGIBILITY_MAX_AGE_MS = 7 * 86_400_000;

export type EligibilityCheck = EligibilityResult & { checkedAt: Date };

export interface ExtractCriteriaResult {
  criteria: EligibilityCriterion[];
  model: string;
  cached: boolean;
}

const isModelFailure = (err: unknown) =>
  err instanceof LlmOutputError || err instanceof LlmRefusalError;

function criteriaInput(o: OpportunityRow): CriteriaOpportunity {
  return {
    title: o.title,
    funderName: o.funderName,
    summary: o.summary,
    description: o.description,
    eligibilityText: o.eligibilityText,
    applicantTypes: o.applicantTypes,
    geographicScope: o.geographicScope,
    costSharingRequired: o.costSharingRequired,
    requirements: o.requirements,
  };
}

/**
 * Criteria for one opportunity, cached in opportunity_criteria until the listing text changes.
 * Every sourceQuote is verified verbatim against the listing; unverifiable criteria are dropped.
 * If the model fails, returns the listing-field criteria only and does not cache them.
 * `orgId` only attributes the LLM call for metering.
 */
export async function extractCriteria(
  ctx: AppContext,
  opportunity: OpportunityRow,
  opts: { orgId?: string | null; force?: boolean } = {},
): Promise<ExtractCriteriaResult> {
  const input = criteriaInput(opportunity);
  const text = renderOpportunityText(input);
  const sourceHash = await sha256Hex(`${EXTRACT_PROMPT_VERSION}\n${text}`);
  if (!opts.force) {
    const cached = await ctx.db
      .select()
      .from(opportunityCriteria)
      .where(eq(opportunityCriteria.opportunityId, opportunity.id))
      .get();
    if (cached && cached.sourceHash === sourceHash) {
      return { criteria: cached.criteria, model: cached.model, cached: true };
    }
  }

  let raw: ExtractOutput["criteria"] = [];
  let model = STRUCTURED_MODEL;
  let cacheable = true;
  if (hasEligibilitySignal(input)) {
    try {
      const { data, usage } = await ctx.llm.generateStructured({
        purpose: EXTRACT_PURPOSE,
        orgId: opts.orgId ?? null,
        system: EXTRACT_SYSTEM_PROMPT,
        prompt: buildExtractPrompt(text),
        schema: ExtractOutput,
        effort: "low",
        maxTokens: 8_000, // up to 25 criteria with verbatim quotes, plus thinking
      });
      raw = data.criteria;
      model = usage.model;
    } catch (err) {
      if (!isModelFailure(err)) throw err;
      ctx.logger.warn("eligibility.extract_failed", {
        opportunityId: opportunity.id,
        error: String(err),
      });
      cacheable = false;
    }
  }

  const { criteria, stats } = finalizeCriteria(raw, input, text);
  const dropped = stats.dropped;
  if (dropped.unverifiedQuote + dropped.duplicate + dropped.notARequirement > 0) {
    ctx.logger.info("eligibility.criteria_dropped", { opportunityId: opportunity.id, ...dropped });
  }
  if (cacheable) {
    const now = ctx.now();
    await ctx.db
      .insert(opportunityCriteria)
      .values({ opportunityId: opportunity.id, criteria, model, sourceHash, createdAt: now })
      .onConflictDoUpdate({
        target: opportunityCriteria.opportunityId,
        set: { criteria, model, sourceHash, createdAt: now },
      });
  }
  return { criteria, model, cached: false };
}

export function toEligibilityProfile(p: OrgProfile): EligibilityProfile {
  return {
    legalName: p.legalName,
    orgType: p.orgType,
    ein: p.ein,
    uei: p.uei,
    city: p.city,
    state: p.state,
    country: p.country,
    serviceAreas: p.serviceAreas,
    foundedYear: p.foundedYear,
  };
}

/** Identity / governance / geography facts first: they settle most eligibility questions. */
const CATEGORY_PRIORITY: FactCategory[] = [
  "identity",
  "governance",
  "geography",
  "financial",
  "history",
  "population_served",
  "capacity",
  "staff",
  "program",
  "partner",
  "outcome",
  "metric",
  "mission",
  "project",
  "other",
];

function factsForPrompt(rows: readonly FactRow[]): FactRow[] {
  const rank = (c: FactCategory) => {
    const i = CATEGORY_PRIORITY.indexOf(c);
    return i < 0 ? CATEGORY_PRIORITY.length : i;
  };
  return [...rows]
    .sort((a, b) => rank(a.category) - rank(b.category))
    .slice(0, MAX_FACTS_IN_PROMPT);
}

function undecidedItem(
  c: EligibilityCriterion,
  assessed: AssessedCriterion | undefined,
  assessRan: boolean,
): ChecklistItem {
  if (assessed) {
    return {
      criterionId: c.id,
      kind: c.kind,
      text: c.text,
      sourceQuote: c.sourceQuote,
      status: assessed.status,
      method: "assessed",
      reason: assessed.reason,
      evidence: assessed.evidence,
    };
  }
  return {
    criterionId: c.id,
    kind: c.kind,
    text: c.text,
    sourceQuote: c.sourceQuote,
    status: "unknown",
    method: "none",
    reason: assessRan
      ? "The assessment did not address this requirement."
      : "This requirement could not be assessed automatically. Answer the question below or recheck later.",
    evidence: [],
  };
}

/**
 * Checks every criterion for the org: deterministic rules first (org type, location, UEI, EIN,
 * founding year), then one "eligibility.assess" call for the rest, whose citations are validated
 * against the facts and profile fields it was given. Unprovable criteria are `unknown`, never
 * `met`. Throws 404 when the opportunity is not visible to the org. Stores the result.
 */
export async function checkEligibility(
  ctx: AppContext,
  orgId: string,
  opportunityId: string,
): Promise<EligibilityCheck> {
  const opp = await getOpportunity(ctx, orgId, opportunityId);
  const [profileRow, factRows] = await Promise.all([
    getOrgProfile(ctx, orgId),
    getFactsForDrafting(ctx, orgId, { includeProposed: true, allProjects: true }),
  ]);
  const extracted = await extractCriteria(ctx, opp, { orgId });
  const profile = toEligibilityProfile(profileRow);
  const now = ctx.now();

  const decided = new Map<string, ChecklistItem>();
  const pending: EligibilityCriterion[] = [];
  for (const c of extracted.criteria) {
    const d = decideDeterministically(c, opp, profile, now);
    const evidence = (d?.evidence ?? []).flatMap((f) => profileEvidence(profile, f) ?? []);
    if (!d || evidence.length === 0) {
      pending.push(c);
      continue;
    }
    decided.set(c.id, {
      criterionId: c.id,
      kind: c.kind,
      text: c.text,
      sourceQuote: c.sourceQuote,
      status: d.status,
      method: "deterministic",
      reason: d.reason,
      evidence,
    });
  }

  let assessModel: string | null = null;
  let assessed = new Map<string, AssessedCriterion>();
  if (pending.length > 0) {
    const facts = factsForPrompt(factRows);
    const citable = new Map<string, CitableFact>(
      facts.map((f) => [f.id, { id: f.id, statement: f.statement, status: f.status }]),
    );
    try {
      const { data, usage } = await ctx.llm.generateStructured({
        purpose: ASSESS_PURPOSE,
        orgId,
        system: ASSESS_SYSTEM_PROMPT,
        context: buildAssessContext(renderProfileForPrompt(profile), formatFactsForPrompt(facts)),
        prompt: buildAssessPrompt(pending),
        schema: AssessOutput,
        effort: "medium",
        maxTokens: 8_000, // one assessment per criterion (up to 25), plus thinking
      });
      assessModel = usage.model;
      assessed = validateAssessments(pending, data, citable, profile);
    } catch (err) {
      if (!isModelFailure(err)) throw err;
      ctx.logger.warn("eligibility.assess_failed", { orgId, opportunityId, error: String(err) });
    }
  }

  const checklist = extracted.criteria.map(
    (c) => decided.get(c.id) ?? undecidedItem(c, assessed.get(c.id), assessModel !== null),
  );
  const modelQuestions = new Map([...assessed].map(([id, a]) => [id, a.question]));
  const overall = overallVerdict(checklist);
  const result: EligibilityResult = {
    opportunityId: opp.id,
    overall,
    summary: summarize(overall, checklist),
    checklist,
    missingInfoQuestions: missingInfoQuestions(checklist, modelQuestions, extracted.criteria),
    criteriaModel: extracted.model,
    assessModel,
  };
  await ctx.db
    .insert(orgEligibility)
    .values({ orgId, opportunityId: opp.id, result, checkedAt: now })
    .onConflictDoUpdate({
      target: [orgEligibility.orgId, orgEligibility.opportunityId],
      set: { result, checkedAt: now },
    });
  return { ...result, checkedAt: now };
}

interface StoredCheck {
  check: EligibilityCheck | null;
  opportunityUpdatedAt: Date;
}

async function loadStored(
  ctx: AppContext,
  orgId: string,
  opportunityId: string,
): Promise<StoredCheck> {
  const row = await ctx.db
    .select({
      updatedAt: opportunities.updatedAt,
      result: orgEligibility.result,
      checkedAt: orgEligibility.checkedAt,
    })
    .from(opportunities)
    .leftJoin(
      orgEligibility,
      and(eq(orgEligibility.opportunityId, opportunities.id), eq(orgEligibility.orgId, orgId)),
    )
    .where(and(eq(opportunities.id, opportunityId), visibleTo(orgId)))
    .get();
  if (!row) throw notFound("Opportunity");
  const parsed = row.result && row.checkedAt ? EligibilityResult.safeParse(row.result) : null;
  return {
    check: parsed?.success && row.checkedAt ? { ...parsed.data, checkedAt: row.checkedAt } : null,
    opportunityUpdatedAt: row.updatedAt,
  };
}

/**
 * The org's stored check, or null if never checked (or stored in an older shape).
 * Throws 404 when the opportunity is not visible to the org.
 */
export async function getEligibility(
  ctx: AppContext,
  orgId: string,
  opportunityId: string,
): Promise<EligibilityCheck | null> {
  return (await loadStored(ctx, orgId, opportunityId)).check;
}

/**
 * Stored check if fresh (younger than maxAgeMs and newer than the listing), else a new check.
 * For automated gates such as autopilot drafting.
 */
export async function ensureEligibility(
  ctx: AppContext,
  orgId: string,
  opportunityId: string,
  maxAgeMs = ELIGIBILITY_MAX_AGE_MS,
): Promise<EligibilityCheck> {
  const { check, opportunityUpdatedAt } = await loadStored(ctx, orgId, opportunityId);
  const checkedAt = check?.checkedAt.getTime() ?? 0;
  if (
    check &&
    checkedAt >= opportunityUpdatedAt.getTime() &&
    ctx.now().getTime() - checkedAt < maxAgeMs
  ) {
    return check;
  }
  return checkEligibility(ctx, orgId, opportunityId);
}
