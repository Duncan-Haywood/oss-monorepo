// AWS runtime: applies Paddle subscription state that arrived through the starter's payments
// sub-stack (docs/AWS.md, "Billing").
//
//   Paddle -> payments account (function URL, HMAC verified there) -> SQS -> entitlement consumer
//          -> platform.entitlements in this product's database (one row per product + user_sub)
//
// Grants bills orgs, not users, and binds an org only through its own signed one-time checkout
// token (./checkout.ts). So checkouts on AWS put that same token in custom_data.user_sub
// (ports/billing/paddle.ts `entitlementProduct`), and this sync turns each changed entitlement row
// back into a Paddle subscription event and runs it through the SAME path as the Worker's webhook
// (applyBillingEvent): token or existing-subscription binding, plan from the billed price only,
// out-of-order protection, idempotency on billing_events, audit log. It runs every minute from
// the AWS schedule and is a no-op unless BILLING_ENTITLEMENT_PRODUCT is set.
//
// What platform.entitlements does not carry (so it is not applied here): the period start and a
// scheduled cancellation (cancelAtPeriodEnd). Both are display-only in grants; a cancellation still
// arrives as status "canceled" when it takes effect.
import type { AppContext } from "../../context";
import { PaddleBillingProvider } from "../../ports/billing/paddle";
import { type ApplyResult, applyBillingEvent } from "./webhooks";

export const ENTITLEMENT_WATERMARK_KEY = "entitlements_watermark";

interface EntitlementRow {
  user_sub: string;
  status: string;
  plan: string | null;
  subscription_id: string;
  customer_id: string | null;
  period_end_ms: number | null;
  occurred_ms: number;
  updated_text: string;
}

export interface EntitlementSyncResult {
  skipped?: string;
  seen: number;
  outcomes: Record<ApplyResult["outcome"], number>;
}

/** The Paddle subscription notification an entitlement row stands for. */
export function entitlementToPaddleEvent(row: EntitlementRow): Record<string, unknown> {
  const occurredAt = new Date(row.occurred_ms).toISOString();
  return {
    // Stable per (subscription, state version): a re-read of the same row is a duplicate.
    event_id: `ent_${row.subscription_id}_${row.occurred_ms}`,
    event_type: "subscription.updated",
    occurred_at: occurredAt,
    data: {
      id: row.subscription_id,
      status: row.status,
      customer_id: row.customer_id,
      items: row.plan ? [{ price: { id: row.plan } }] : [],
      current_billing_period: row.period_end_ms
        ? { ends_at: new Date(row.period_end_ms).toISOString() }
        : null,
      // user_sub is the opaque checkout token this app put there (never an org id).
      custom_data: { checkoutToken: row.user_sub },
    },
  };
}

export async function syncPlatformEntitlements(
  ctx: AppContext,
  opts: { limit?: number } = {},
): Promise<EntitlementSyncResult> {
  const outcomes: EntitlementSyncResult["outcomes"] = { applied: 0, duplicate: 0, ignored: 0 };
  const product = ctx.env.BILLING_ENTITLEMENT_PRODUCT?.trim();
  if (!product) return { skipped: "BILLING_ENTITLEMENT_PRODUCT not set", seen: 0, outcomes };
  if (!(ctx.billing instanceof PaddleBillingProvider)) {
    return { skipped: "Paddle is not configured", seen: 0, outcomes };
  }
  const db = ctx.env.DB;
  const mark = await db
    .prepare("SELECT value FROM aws_state WHERE key = ?")
    .bind(ENTITLEMENT_WATERMARK_KEY)
    .first<{ value: string }>();
  const { results } = await db
    .prepare(
      `SELECT user_sub, status, plan, subscription_id, customer_id,
              (extract(epoch from current_period_end) * 1000)::bigint AS period_end_ms,
              (extract(epoch from source_occurred_at) * 1000)::bigint AS occurred_ms,
              updated_at::text AS updated_text
         FROM platform.entitlements
        WHERE product = ? AND updated_at > ?::timestamptz
        ORDER BY updated_at
        LIMIT ?`,
    )
    .bind(product, mark?.value ?? "-infinity", opts.limit ?? 200)
    .all<EntitlementRow>();

  for (const row of results) {
    const event = ctx.billing.normalize(entitlementToPaddleEvent(row));
    const r = await applyBillingEvent(ctx, "paddle", event);
    outcomes[r.outcome]++;
    if (r.outcome === "ignored") {
      ctx.logger.warn("billing.entitlement_ignored", {
        subscriptionId: row.subscription_id,
        reason: r.reason,
      });
    }
    // Advance only past rows that were handled, so a failure is retried next minute.
    await db
      .prepare(
        `INSERT INTO aws_state (key, value) VALUES (?, ?)
         ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
      )
      .bind(ENTITLEMENT_WATERMARK_KEY, row.updated_text)
      .run();
  }
  return { seen: results.length, outcomes };
}
