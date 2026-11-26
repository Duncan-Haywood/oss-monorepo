// Billing service: subscriptions, quota enforcement, usage metering and per-application cost.
// The pipeline calls assertCanDraft() before drafting and recordUsage() after; see docs/PRICING.md.

import {
  isWithinPastDueGrace,
  PAST_DUE_GRACE_DAYS,
  pastDueGraceUntil,
} from "@shared/billing/grace";
import { periodKeyFor } from "@shared/billing/period";
import { getPlan, PLANS, type Plan } from "@shared/billing/plans";
import type { BillingUsageDto } from "@shared/billing/types";
import { type SubscriptionStatus, USAGE_KINDS, type UsageKind } from "@shared/enums";
import { and, count, eq, sql, sum } from "drizzle-orm";
import type { AppContext } from "../../context";
import { llmCalls, subscriptions, usageEvents } from "../../db/schema";
import { paymentRequired } from "../../lib/errors";
import { newId } from "../../lib/ids";
import { audit } from "../privacy/audit";

export type Subscription = typeof subscriptions.$inferSelect;

/** Statuses that allow drafting (subject to quota). past_due also does, within its grace period. */
export const DRAFTABLE_STATUSES: ReadonlySet<SubscriptionStatus> = new Set([
  "active",
  "trialing",
  "comp",
]);

/** Offline demo: an org without a subscription row is treated as comp. */
const isDemo = (ctx: AppContext) => ctx.env.FAKE_EXTERNALS === "true";

export async function getSubscription(
  ctx: AppContext,
  orgId: string,
): Promise<Subscription | null> {
  const row = await ctx.db.select().from(subscriptions).where(eq(subscriptions.orgId, orgId)).get();
  return row ?? null;
}

/** "YYYY-MM" of the current monthly quota period (anniversary of the provider period, else calendar). */
export function currentPeriodKey(
  sub: Pick<Subscription, "currentPeriodStart"> | null,
  now: Date,
): string {
  return periodKeyFor(sub?.currentPeriodStart ?? null, now);
}

export interface Entitlement {
  subscription: Subscription | null;
  plan: Plan | null;
  status: SubscriptionStatus | "none";
  /** Status allows drafting (quota still applies). */
  active: boolean;
  /** past_due only: end of the grace period (drafting is blocked from then on). */
  graceUntil: Date | null;
  periodKey: string;
}

export async function getEntitlement(ctx: AppContext, orgId: string): Promise<Entitlement> {
  const sub = await getSubscription(ctx, orgId);
  const periodKey = currentPeriodKey(sub, ctx.now());
  if (!sub) {
    return isDemo(ctx)
      ? {
          subscription: null,
          plan: PLANS.comp,
          status: "comp",
          active: true,
          graceUntil: null,
          periodKey,
        }
      : {
          subscription: null,
          plan: null,
          status: "none",
          active: false,
          graceUntil: null,
          periodKey,
        };
  }
  const plan = getPlan(sub.planKey) ?? (sub.status === "comp" ? PLANS.comp : null);
  const inGrace = isWithinPastDueGrace(sub.status, sub.pastDueSince, ctx.now());
  return {
    subscription: sub,
    plan,
    status: sub.status,
    active: plan !== null && (DRAFTABLE_STATUSES.has(sub.status) || inGrace),
    graceUntil: pastDueGraceUntil(sub.status, sub.pastDueSince),
    periodKey,
  };
}

async function usedInPeriod(ctx: AppContext, orgId: string, periodKey: string, kind: UsageKind) {
  const row = await ctx.db
    .select({ n: sum(usageEvents.quantity) })
    .from(usageEvents)
    .where(
      and(
        eq(usageEvents.orgId, orgId),
        eq(usageEvents.periodKey, periodKey),
        eq(usageEvents.kind, kind),
      ),
    )
    .get();
  return Number(row?.n ?? 0);
}

export interface DraftAllowance {
  planKey: string;
  periodKey: string;
  used: number;
  limit: number;
  remaining: number;
}

/**
 * Throws 402 payment_required unless the org has an active / trialing / comp subscription with draft
 * quota left this period. Call before starting a new application draft (regenerating an existing
 * application does not consume quota — see recordUsage).
 */
export async function assertCanDraft(ctx: AppContext, orgId: string): Promise<DraftAllowance> {
  const ent = await getEntitlement(ctx, orgId);
  if (!ent.plan || !ent.active) {
    throw paymentRequired(
      ent.status === "none"
        ? "Choose a plan to start drafting applications."
        : ent.status === "past_due"
          ? `Your last payment failed and the ${PAST_DUE_GRACE_DAYS}-day grace period has ended. Update your payment method to keep drafting applications.`
          : `Your subscription is ${ent.status}. Update billing to keep drafting applications.`,
    );
  }
  const used = await usedInPeriod(ctx, orgId, ent.periodKey, "application_draft");
  const limit = ent.plan.includedApplicationDrafts;
  if (used >= limit) {
    throw paymentRequired(
      `You've used all ${limit} application draft${limit === 1 ? "" : "s"} included in the ${ent.plan.name} plan this month. Upgrade to draft more.`,
    );
  }
  return { planKey: ent.plan.key, periodKey: ent.periodKey, used, limit, remaining: limit - used };
}

/** Remaining opportunity fit-scores this period (matching should stop LLM scoring at 0). */
export async function remainingOpportunityScores(ctx: AppContext, orgId: string): Promise<number> {
  const ent = await getEntitlement(ctx, orgId);
  if (!ent.plan || !ent.active) return 0;
  const used = await usedInPeriod(ctx, orgId, ent.periodKey, "opportunity_match");
  return Math.max(0, ent.plan.maxOpportunityScoresPerMonth - used);
}

export interface RecordUsageInput {
  orgId: string;
  kind: UsageKind;
  subjectId?: string | null;
  costMicros: number;
  quantity?: number;
}

/**
 * Meter one unit of work with its measured cost. An `application_draft` for a subjectId (applicationId)
 * already recorded this period is not counted again: its cost is added to the existing row, so
 * regenerations and re-verification never consume extra quota.
 */
export async function recordUsage(
  ctx: AppContext,
  input: RecordUsageInput,
): Promise<{ id: string; periodKey: string; counted: boolean }> {
  const sub = await getSubscription(ctx, input.orgId);
  const periodKey = currentPeriodKey(sub, ctx.now());
  const cost = Math.max(0, Math.round(input.costMicros));
  if (input.kind === "application_draft" && input.subjectId) {
    const existing = await ctx.db
      .select({ id: usageEvents.id })
      .from(usageEvents)
      .where(
        and(
          eq(usageEvents.orgId, input.orgId),
          eq(usageEvents.kind, "application_draft"),
          eq(usageEvents.subjectId, input.subjectId),
          eq(usageEvents.periodKey, periodKey),
        ),
      )
      .get();
    if (existing) {
      await ctx.db
        .update(usageEvents)
        .set({ costMicros: sql`${usageEvents.costMicros} + ${cost}` })
        .where(and(eq(usageEvents.id, existing.id), eq(usageEvents.orgId, input.orgId)));
      return { id: existing.id, periodKey, counted: false };
    }
  }
  const id = newId("use");
  await ctx.db.insert(usageEvents).values({
    id,
    orgId: input.orgId,
    kind: input.kind,
    quantity: Math.max(1, Math.round(input.quantity ?? 1)),
    costMicros: cost,
    subjectId: input.subjectId ?? null,
    periodKey,
  });
  return { id, periodKey, counted: true };
}

export async function getUsageSummary(ctx: AppContext, orgId: string): Promise<BillingUsageDto> {
  const ent = await getEntitlement(ctx, orgId);
  const rows = await ctx.db
    .select({
      kind: usageEvents.kind,
      quantity: sum(usageEvents.quantity),
      costMicros: sum(usageEvents.costMicros),
    })
    .from(usageEvents)
    .where(and(eq(usageEvents.orgId, orgId), eq(usageEvents.periodKey, ent.periodKey)))
    .groupBy(usageEvents.kind)
    .all();
  const byKind = Object.fromEntries(
    USAGE_KINDS.map((k) => [k, { quantity: 0, costMicros: 0 }]),
  ) as BillingUsageDto["byKind"];
  for (const r of rows) {
    byKind[r.kind] = { quantity: Number(r.quantity ?? 0), costMicros: Number(r.costMicros ?? 0) };
  }
  const usable = ent.active ? ent.plan : null;
  return {
    periodKey: ent.periodKey,
    applicationDrafts: byKind.application_draft.quantity,
    limit: usable?.includedApplicationDrafts ?? 0,
    opportunityScores: byKind.opportunity_match.quantity,
    opportunityScoreLimit: usable?.maxOpportunityScoresPerMonth ?? 0,
    costMicros: Object.values(byKind).reduce((s, v) => s + v.costMicros, 0),
    byKind,
  };
}

/** Measured LLM cost of one application (sum of llm_calls attributed to it) + call count. */
export async function applicationCost(
  ctx: AppContext,
  orgId: string,
  applicationId: string,
): Promise<{ costMicros: number; calls: number }> {
  const row = await ctx.db
    .select({ cost: sum(llmCalls.costMicros), calls: count() })
    .from(llmCalls)
    .where(and(eq(llmCalls.orgId, orgId), eq(llmCalls.applicationId, applicationId)))
    .get();
  return { costMicros: Number(row?.cost ?? 0), calls: Number(row?.calls ?? 0) };
}

export async function applicationCostMicros(
  ctx: AppContext,
  orgId: string,
  applicationId: string,
): Promise<number> {
  return (await applicationCost(ctx, orgId, applicationId)).costMicros;
}

/** Put an org (e.g. a pilot partner like SWIF) on the complimentary plan. */
export async function grantComp(
  ctx: AppContext,
  orgId: string,
  note: string,
  actor: { type: "user" | "system"; id?: string | null } = { type: "system" },
): Promise<Subscription> {
  const metadata = { compNote: note, compGrantedAt: ctx.now().toISOString() };
  await ctx.db
    .insert(subscriptions)
    .values({
      orgId,
      planKey: "comp",
      status: "comp",
      provider: null,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      metadata,
    })
    .onConflictDoUpdate({
      target: subscriptions.orgId,
      set: {
        planKey: "comp",
        status: "comp",
        currentPeriodStart: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        metadata,
        updatedAt: ctx.now(),
      },
    });
  await audit(ctx, {
    orgId,
    actorType: actor.type,
    actorId: actor.id ?? null,
    action: "billing.comp_granted",
    targetType: "subscription",
    targetId: orgId,
    metadata: { note },
  });
  const sub = await getSubscription(ctx, orgId);
  if (!sub) throw new Error("grantComp: subscription row missing after upsert");
  return sub;
}

export { applyBillingEvent, upsertProviderSubscription } from "./webhooks";
