// Billing (Paddle via packages/billing). One subscription row per org; pending checkouts bind a
// Paddle checkout to an org through a signed token (never an orgId in custom_data); billing_events
// makes webhook processing idempotent. Rows are written only by the webhook and by operators.
import { SUBSCRIPTION_STATUSES } from "@billing";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { bool, createdAt, json, ts, updatedAt } from "./_columns";
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
    /**
     * The billed recurring price exactly as the last applied Paddle webhook reported it (packages/
     * billing SubscriptionPrice). The only source of MRR (routes/admin.ts); null = not reported.
     */
    priceAmountMinor: integer("price_amount_minor"),
    priceCurrency: text("price_currency"),
    billingInterval: text("billing_interval"),
    billingFrequency: integer("billing_frequency"),
    priceQuantity: integer("price_quantity"),
    priceDiscounted: bool("price_discounted"),
    /** Lifecycle stamps from webhooks (packages/billing nextLifecycleStamps); never back-filled. */
    trialStartedAt: ts("trial_started_at"),
    firstPaidAt: ts("first_paid_at"),
    canceledAt: ts("canceled_at"),
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

/**
 * Platform audit trail: every read of /api/admin/* (and anything else an operator does across
 * tenants). Not tenant data: it has no org_id, so it is never shown to or deleted with an org.
 */
export const adminAuditLog = sqliteTable(
  "admin_audit_log",
  {
    id: text("id").primaryKey(),
    /** "user" (a platform admin's session) or "service" (the owner console's token). */
    actorType: text("actor_type", { enum: ["user", "service"] }).notNull(),
    /** User id, or the service name ("admin-console"). */
    actorId: text("actor_id").notNull(),
    /** e.g. "admin.metrics_read", "admin.accounts_read". */
    action: text("action").notNull(),
    metadata: json<Record<string, unknown>>("metadata"),
    createdAt: createdAt(),
  },
  (t) => [index("admin_audit_log_created_idx").on(t.createdAt)],
);
