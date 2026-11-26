// Server-side checkout binding: POST /billing/checkout records a pending_checkouts row and hands the
// provider only an opaque signed token. The webhook resolves the org from that token (valid MAC,
// unexpired, one-time) — never from raw custom_data, which a crafted checkout could set to any org.
import { and, eq, isNull, or } from "drizzle-orm";
import type { AppContext } from "../../context";
import { pendingCheckouts } from "../../db/schema";
import { newId } from "../../lib/ids";
import {
  parseCheckoutToken,
  signCheckoutToken,
  verifyCheckoutToken,
} from "../../ports/billing/checkout-token";

/** A checkout token is accepted for this long after POST /billing/checkout. */
export const CHECKOUT_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

/** Offline demo only: lets FAKE_EXTERNALS run without secrets. Real billing requires AUTH_SECRET. */
const DEMO_CHECKOUT_SECRET = "grant-autopilot-offline-demo-checkout";

export function checkoutTokenSecret(env: AppContext["env"]): string {
  if (env.AUTH_SECRET) return env.AUTH_SECRET;
  if (env.FAKE_EXTERNALS === "true") return DEMO_CHECKOUT_SECRET;
  throw new Error("AUTH_SECRET is not configured (required to sign checkout tokens)");
}

export interface PendingCheckoutInput {
  orgId: string;
  planKey: string;
  interval: "month" | "year";
  createdBy: string | null;
}

export async function createPendingCheckout(
  ctx: AppContext,
  input: PendingCheckoutInput,
): Promise<{ id: string; token: string; expiresAt: Date }> {
  const secret = checkoutTokenSecret(ctx.env);
  const id = newId("pco");
  const now = ctx.now();
  const expiresAt = new Date(now.getTime() + CHECKOUT_TOKEN_TTL_MS);
  await ctx.db.insert(pendingCheckouts).values({
    id,
    orgId: input.orgId,
    planKey: input.planKey,
    interval: input.interval,
    createdBy: input.createdBy,
    createdAt: now,
    expiresAt,
  });
  return { id, token: await signCheckoutToken(secret, id, input.orgId), expiresAt };
}

export type TokenResolution =
  | { ok: true; orgId: string; checkoutId: string }
  | {
      ok: false;
      reason: "invalid checkout token" | "expired checkout token" | "checkout token replay";
    };

/**
 * Verifies a token from custom_data for `providerSubscriptionId`. Accepts an unconsumed, unexpired
 * token, or one this same subscription already consumed (a retried delivery). Does not consume.
 */
export async function resolveCheckoutToken(
  ctx: AppContext,
  token: string,
  providerSubscriptionId: string,
): Promise<TokenResolution> {
  const parsed = parseCheckoutToken(token);
  if (!parsed) return { ok: false, reason: "invalid checkout token" };
  const row = await ctx.db
    .select()
    .from(pendingCheckouts)
    .where(eq(pendingCheckouts.id, parsed.checkoutId))
    .get();
  if (!row || !(await verifyCheckoutToken(checkoutTokenSecret(ctx.env), token, row.orgId))) {
    return { ok: false, reason: "invalid checkout token" };
  }
  if (row.consumedAt) {
    return row.providerSubscriptionId === providerSubscriptionId
      ? { ok: true, orgId: row.orgId, checkoutId: row.id }
      : { ok: false, reason: "checkout token replay" };
  }
  if (row.expiresAt.getTime() <= ctx.now().getTime()) {
    return { ok: false, reason: "expired checkout token" };
  }
  return { ok: true, orgId: row.orgId, checkoutId: row.id };
}

/**
 * Atomically marks the checkout consumed by `providerSubscriptionId`. False when another
 * subscription won the race: the caller must not apply the event.
 */
export async function consumePendingCheckout(
  ctx: AppContext,
  checkoutId: string,
  orgId: string,
  providerSubscriptionId: string,
): Promise<boolean> {
  const now = ctx.now();
  const rows = await ctx.db
    .update(pendingCheckouts)
    .set({ consumedAt: now, providerSubscriptionId })
    .where(
      and(
        eq(pendingCheckouts.id, checkoutId),
        eq(pendingCheckouts.orgId, orgId),
        or(
          isNull(pendingCheckouts.consumedAt),
          eq(pendingCheckouts.providerSubscriptionId, providerSubscriptionId),
        ),
      ),
    )
    .returning({ id: pendingCheckouts.id });
  return rows.length > 0;
}
