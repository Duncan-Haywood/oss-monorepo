// Billing API DTOs (GET /api/orgs/:orgId/billing). Import in the client.
import type { SubscriptionDto } from "@shared/api/types";
import type { SubscriptionStatus, UsageKind } from "@shared/enums";
import type { Plan } from "./plans";

export interface BillingUsageDto {
  periodKey: string;
  /** Applications drafted this quota period (each application counts once, regenerations are free). */
  applicationDrafts: number;
  /** includedApplicationDrafts of the effective plan (0 when there is no active plan). */
  limit: number;
  opportunityScores: number;
  opportunityScoreLimit: number;
  /** Measured provider cost recorded this period, micro-USD (for transparency / margin tracking). */
  costMicros: number;
  byKind: Record<UsageKind, { quantity: number; costMicros: number }>;
}

export interface BillingOverviewDto {
  subscription: SubscriptionDto | null;
  /** Effective plan (comp when no subscription exists in the offline demo), null when none. */
  plan: Plan | null;
  status: SubscriptionStatus | "none";
  /** True when drafting is currently allowed by status (quota is in `usage`). */
  active: boolean;
  /**
   * past_due only: ISO end of the payment grace period (PAST_DUE_GRACE_DAYS from the first failed
   * payment). Show a banner while set; drafting stays allowed until then and is blocked after.
   */
  graceUntil: string | null;
  usage: BillingUsageDto;
  /** Purchasable plans. */
  plans: Plan[];
  /** Billing provider name ("paddle" | "fake") or null when checkout is unavailable. */
  provider: string | null;
}

export interface CheckoutBody {
  planKey: "starter" | "standard" | "pro";
  promoCode?: string;
  /** Extension: annual billing (10% off). Defaults to "month". */
  interval?: "month" | "year";
}
