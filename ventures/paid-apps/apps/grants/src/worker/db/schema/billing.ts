// Subscriptions (via a merchant-of-record payment provider), metered usage and webhook idempotency.
// Pricing is cost-plus: see src/shared/billing/plans.ts and docs/PRICING.md.
import type { SubscriptionStatus, UsageKind } from "@shared/enums";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { bool, createdAt, json, ts, updatedAt } from "./_columns";
import { organization, user } from "./auth";

export const subscriptions = sqliteTable(
  "subscriptions",
  {
    orgId: text("org_id")
      .primaryKey()
      .references(() => organization.id, { onDelete: "cascade" }),
    planKey: text("plan_key").notNull(), // key in PLANS
    status: text("status").$type<SubscriptionStatus>().notNull(),
    provider: text("provider"), // e.g. "paddle" | "polar" | null for comp
    providerCustomerId: text("provider_customer_id"),
    providerSubscriptionId: text("provider_subscription_id"),
    currentPeriodStart: ts("current_period_start"),
    currentPeriodEnd: ts("current_period_end"),
    cancelAtPeriodEnd: bool("cancel_at_period_end").notNull().default(false),
    /** Provider `occurred_at` of the last applied webhook event (older events are ignored). */
    providerUpdatedAt: ts("provider_updated_at"),
    /** When the subscription first went past_due (start of the grace period); null otherwise. */
    pastDueSince: ts("past_due_since"),
    metadata: json<Record<string, unknown>>("metadata"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("subscriptions_provider_sub_idx").on(t.provider, t.providerSubscriptionId)],
);

/**
 * Server-side record of a checkout started by an org admin. The provider only ever sees an opaque
 * HMAC-signed token for it (custom_data.checkoutToken); the webhook binds the org from this row,
 * never from raw custom_data. One-time: consumedAt + providerSubscriptionId are set on first use.
 */
export const pendingCheckouts = sqliteTable(
  "pending_checkouts",
  {
    id: text("id").primaryKey(), // pco_...
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    planKey: text("plan_key").notNull(),
    interval: text("interval").$type<"month" | "year">().notNull(),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    expiresAt: ts("expires_at").notNull(),
    consumedAt: ts("consumed_at"),
    /** The provider subscription that consumed the token (lets a failed delivery be retried). */
    providerSubscriptionId: text("provider_subscription_id"),
  },
  (t) => [index("pending_checkouts_org_idx").on(t.orgId)],
);

/** One row per billable unit of work, with its measured cost (micro-USD) for margin tracking. */
export const usageEvents = sqliteTable(
  "usage_events",
  {
    id: text("id").primaryKey(), // use_...
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    kind: text("kind").$type<UsageKind>().notNull(),
    quantity: integer("quantity").notNull().default(1),
    /** Measured provider cost attributed to this unit (sum of llm_calls.cost_micros etc.). */
    costMicros: integer("cost_micros").notNull().default(0),
    subjectId: text("subject_id"), // applicationId / matchId / interviewId / documentId
    /** "YYYY-MM" of the org's billing period start, for quota counting. */
    periodKey: text("period_key").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("usage_org_period_idx").on(t.orgId, t.periodKey, t.kind)],
);

/** Webhook idempotency + audit for payment provider events. */
export const billingEvents = sqliteTable(
  "billing_events",
  {
    id: text("id").primaryKey(), // bev_...
    provider: text("provider").notNull(),
    providerEventId: text("provider_event_id").notNull(),
    type: text("type").notNull(),
    orgId: text("org_id").references(() => organization.id, { onDelete: "cascade" }),
    payload: json<Record<string, unknown>>("payload"),
    /** Provider-side event time (Paddle `occurred_at`), used to order out-of-order deliveries. */
    occurredAt: ts("occurred_at"),
    processedAt: ts("processed_at"),
    error: text("error"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("billing_events_provider_uq").on(t.provider, t.providerEventId),
    // Privacy export/delete by org
    index("billing_events_org_idx").on(t.orgId),
  ],
);
