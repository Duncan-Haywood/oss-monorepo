// Cross-module calls used by matching, in one place, so tests can inject stubs instead of
// mocking modules (see scoreOrgMatches(ctx, job, deps)).
import type { AppContext } from "../../context";
import type { facts } from "../../db/schema";
import { recordUsage, remainingOpportunityScores } from "../billing";
import { formatFactsForPrompt, getFactsForDrafting } from "../knowledge";
import { getOrgPromptProfile } from "../orgs";
import { createApplication } from "../pipeline";

export type MatchingFact = typeof facts.$inferSelect;

export interface AutoDraftInput {
  orgId: string;
  opportunityId: string;
  projectId: string | null;
  requestedAmountCents: number | null;
}

export interface MatchingDeps {
  /** Facts the matcher may cite (never rejected/superseded/restricted). Confirmed first. */
  factsForMatching(ctx: AppContext, orgId: string): Promise<MatchingFact[]>;
  formatFacts(facts: readonly MatchingFact[]): string;
  promptProfile(ctx: AppContext, orgId: string): Promise<string>;
  /** Starts the drafting pipeline; returns the new application's id (or null if unknown). */
  createApplication(ctx: AppContext, input: AutoDraftInput): Promise<string | null>;
  /** LLM fit-scores the org's plan still allows this period (billing). Infinity = unmetered. */
  remainingScores(ctx: AppContext, orgId: string): Promise<number>;
  /** Meter one LLM fit-score as `opportunity_match` usage (billing). */
  recordScoreUsage(
    ctx: AppContext,
    input: { orgId: string; opportunityId: string; costMicros: number },
  ): Promise<void>;
}

export const defaultMatchingDeps: MatchingDeps = {
  factsForMatching: (ctx, orgId) =>
    getFactsForDrafting(ctx, orgId, { includeProposed: true, allProjects: true }),
  formatFacts: (rows) => formatFactsForPrompt(rows),
  promptProfile: (ctx, orgId) => getOrgPromptProfile(ctx, orgId),
  async createApplication(ctx, input) {
    const app: unknown = await createApplication(ctx, {
      orgId: input.orgId,
      opportunityId: input.opportunityId,
      projectId: input.projectId,
      requestedAmountCents: input.requestedAmountCents,
      startedBy: "autopilot",
    });
    if (app && typeof app === "object" && "id" in app && typeof app.id === "string") return app.id;
    return null;
  },
  // The offline demo (FAKE_EXTERNALS) never blocks on quota; usage is still recorded.
  remainingScores: async (ctx, orgId) =>
    ctx.env.FAKE_EXTERNALS === "true"
      ? Number.POSITIVE_INFINITY
      : remainingOpportunityScores(ctx, orgId),
  async recordScoreUsage(ctx, input) {
    await recordUsage(ctx, {
      orgId: input.orgId,
      kind: "opportunity_match",
      subjectId: input.opportunityId,
      costMicros: input.costMicros,
    });
  },
};
