// Entitlements: what an org's stored subscription allows right now. Pure: the app loads its
// subscription row (filtered by the tenant's orgId) and passes it in.
import { isWithinPastDueGrace, PAST_DUE_GRACE_DAYS, pastDueGraceUntil } from "./grace.ts";
import { periodKeyFor } from "./period.ts";
import type { ProviderSubscriptionStatus } from "./provider.ts";

/** Stored statuses: everything a provider reports, plus "comp" (granted by staff, never sold). */
export const SUBSCRIPTION_STATUSES = [
  "trialing",
  "active",
  "past_due",
  "paused",
  "canceled",
  "comp",
] as const;
export type SubscriptionStatus = ProviderSubscriptionStatus | "comp";

export const isSubscriptionStatus = (s: string): s is SubscriptionStatus =>
  (SUBSCRIPTION_STATUSES as readonly string[]).includes(s);

/** Statuses that grant the plan (quota still applies). past_due also does, within its grace period. */
export const ENTITLED_STATUSES: ReadonlySet<SubscriptionStatus> = new Set([
  "active",
  "trialing",
  "comp",
]);

/** The fields of an app's subscription row that entitlement needs. */
export interface SubscriptionSnapshot {
  planKey: string;
  status: SubscriptionStatus;
  /** Provider period start: anchors the monthly quota period (null -> calendar month). */
  currentPeriodStart: Date | null;
  /** Start of the past_due grace period (see grace.ts nextPastDueSince). */
  pastDueSince: Date | null;
}

export type BlockedReason = "no_subscription" | "grace_ended" | "inactive" | "unknown_plan";

export interface Entitlement<P> {
  plan: P | null;
  status: SubscriptionStatus | "none";
  /** True when the plan's features/quotas may be used now. */
  active: boolean;
  /** past_due only: ISO-able end of the grace period. Show a banner while set. */
  graceUntil: Date | null;
  /** Why `active` is false (null when active). */
  blockedReason: BlockedReason | null;
  /** "YYYY-MM" of the current monthly quota period. */
  periodKey: string;
}

export interface EntitlementOptions<P> {
  /** Plan lookup (e.g. catalog.get). Return null for unknown keys. */
  getPlan: (key: string) => P | null;
  now: Date;
  /** Plan used when status is "comp" and planKey is unknown. */
  compPlan?: P;
  /** Offline demo only: plan granted when the org has no subscription row (treated as comp). */
  demoPlan?: P | null;
  graceDays?: number;
}

export function resolveEntitlement<P>(
  sub: SubscriptionSnapshot | null | undefined,
  opts: EntitlementOptions<P>,
): Entitlement<P> {
  const periodKey = periodKeyFor(sub?.currentPeriodStart ?? null, opts.now);
  if (!sub) {
    return opts.demoPlan
      ? {
          plan: opts.demoPlan,
          status: "comp",
          active: true,
          graceUntil: null,
          blockedReason: null,
          periodKey,
        }
      : {
          plan: null,
          status: "none",
          active: false,
          graceUntil: null,
          blockedReason: "no_subscription",
          periodKey,
        };
  }
  const graceDays = opts.graceDays ?? PAST_DUE_GRACE_DAYS;
  const plan =
    opts.getPlan(sub.planKey) ?? (sub.status === "comp" ? (opts.compPlan ?? null) : null);
  const inGrace = isWithinPastDueGrace(sub.status, sub.pastDueSince, opts.now, graceDays);
  const statusOk = ENTITLED_STATUSES.has(sub.status) || inGrace;
  const active = plan !== null && statusOk;
  return {
    plan,
    status: sub.status,
    active,
    graceUntil: pastDueGraceUntil(sub.status, sub.pastDueSince, graceDays),
    blockedReason: active
      ? null
      : plan === null
        ? "unknown_plan"
        : sub.status === "past_due"
          ? "grace_ended"
          : "inactive",
    periodKey,
  };
}

export interface QuotaCheck {
  used: number;
  limit: number;
  remaining: number;
  /** True when one more unit may be consumed. */
  allowed: boolean;
}

/** Quota arithmetic for one metered unit in the current period. */
export function checkQuota(limit: number, used: number, requested = 1): QuotaCheck {
  const remaining = Math.max(0, limit - used);
  return { used, limit, remaining, allowed: requested <= remaining };
}
