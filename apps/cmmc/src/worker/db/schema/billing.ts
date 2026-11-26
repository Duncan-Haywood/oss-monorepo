// Billing (Paddle via packages/billing). One subscription row per org; pending checkouts bind a
// Paddle checkout to an org through a signed token (never an orgId in custom_data); billing_events
// makes webhook processing idempotent. Rows are written only by the webhook and by operators.
import { SUBSCRIPTION_STATUSES } from "@billing";
import { index, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { bool, createdAt, ts, updatedAt } from "./_columns";
import { organization, user } from "./auth";

export const subscriptions = sqliteTable(
  "subscriptions",
  {
    orgId: text("org_id")
      .primaryKey()
      .references(() => organization.id, { onDelete: "cascade" }),
    planKey: text("plan_key").notNull(),
    status: text("status", { enum: SUBSCRIPTION_STATUSES }).notNull(),
    provider: text("provider"),
    providerCustomerId: text("provider_customer_id"),
    providerSubscriptionId: text("provider_subscription_id"),
    currentPeriodStart: ts("current_period_start"),
    currentPeriodEnd: ts("current_period_end"),
    cancelAtPeriodEnd: bool("cancel_at_period_end").notNull().default(false),
    /** Provider occurred_at of the last applied event (ordering watermark). */
    providerUpdatedAt: ts("provider_updated_at"),
    /** Start of the past_due grace period. */
    pastDueSince: ts("past_due_since"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("subscriptions_provider_sub_idx").on(t.providerSubscriptionId)],
);

export const pendingCheckouts = sqliteTable(
  "pending_checkouts",
  {
    /** pco_… (packages/billing newCheckoutId). */
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    planKey: text("plan_key").notNull(),
    interval: text("interval", { enum: ["month", "year"] }).notNull(),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    expiresAt: ts("expires_at").notNull(),
    consumedAt: ts("consumed_at"),
    providerSubscriptionId: text("provider_subscription_id"),
    createdAt: createdAt(),
  },
  (t) => [index("pending_checkouts_org_idx").on(t.orgId)],
);

export const billingEvents = sqliteTable(
  "billing_events",
  {
    id: text("id").primaryKey(),
    provider: text("provider").notNull(),
    providerEventId: text("provider_event_id").notNull(),
    type: text("type").notNull(),
    /** Resolved org, when the event could be bound to one. */
    orgId: text("org_id"),
    outcome: text("outcome", { enum: ["applied", "ignored"] }),
    reason: text("reason"),
    /** Set once handled; an unprocessed row (an earlier attempt threw) is retried on redelivery. */
    processedAt: ts("processed_at"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("billing_events_provider_event_idx").on(t.provider, t.providerEventId)],
);
