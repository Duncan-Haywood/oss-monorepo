// Proof of automatic-renewal consent, kept as long as California asks and no longer.
//
// Bus. & Prof. Code 17602 as amended by AB 2863 (from 2025-07-01) asks a business to keep proof of the
// consumer's express consent to the renewal terms for three years, or one year after the contract
// ends, whichever is longer. The consent itself is recorded on the pending checkout (service.ts
// startCheckout), but that row is deleted with its shop (ON DELETE CASCADE), so a subscriber who
// cancels and then deletes the shop would take the proof with them. When a checkout becomes a
// subscription, its consent is copied here, to a table with no foreign keys and no name or email
// address; when the subscription ends, the row gets its `keep_until`; the daily cron deletes it then.
// Read 2026-11-27 by an agent, not a lawyer (docs/BILLING.md, "Automatic renewal").
import { and, eq, isNotNull, isNull, lt } from "drizzle-orm";
import type { AppContext } from "../../context";
import { renewalConsents } from "../../db/schema";

/** Three years from the consent, or one year after the contract ends, whichever is later. */
export function consentKeepUntil(consentedAt: Date, endedAt: Date): Date {
  const plusYears = (d: Date, n: number) => {
    const out = new Date(d.getTime());
    out.setUTCFullYear(out.getUTCFullYear() + n);
    // Feb 29 plus a year lands on Mar 1: later, never earlier, than the law's date.
    return out;
  };
  const a = plusYears(consentedAt, 3);
  const b = plusYears(endedAt, 1);
  return a > b ? a : b;
}

/** Copies a consumed checkout's consent (once per checkout; a retried webhook is a no-op). */
export async function recordRenewalConsent(
  ctx: AppContext,
  pending: {
    id: string;
    orgId: string;
    planKey: string;
    interval: "month" | "year";
    renewalTermsVersion: string | null;
    renewalConsentAt: Date | null;
  },
  sub: { providerSubscriptionId: string; providerCustomerId: string | null },
): Promise<void> {
  // Checkouts from before 2026-11-27 carry no recorded consent: nothing to prove, nothing copied.
  if (!pending.renewalTermsVersion || !pending.renewalConsentAt) return;
  await ctx.db
    .insert(renewalConsents)
    .values({
      checkoutId: pending.id,
      orgId: pending.orgId,
      providerSubscriptionId: sub.providerSubscriptionId,
      providerCustomerId: sub.providerCustomerId,
      planKey: pending.planKey,
      interval: pending.interval,
      termsVersion: pending.renewalTermsVersion,
      consentedAt: pending.renewalConsentAt,
      subscribedAt: ctx.now(),
    })
    .onConflictDoNothing({ target: renewalConsents.checkoutId });
}

/** The subscription ended: start the retention clock on its consent rows (the first end counts). */
export async function endRenewalConsents(
  ctx: AppContext,
  where: { providerSubscriptionId: string } | { orgId: string },
  endedAt: Date,
): Promise<number> {
  const match =
    "orgId" in where
      ? eq(renewalConsents.orgId, where.orgId)
      : eq(renewalConsents.providerSubscriptionId, where.providerSubscriptionId);
  const open = await ctx.db
    .select({ id: renewalConsents.checkoutId, consentedAt: renewalConsents.consentedAt })
    .from(renewalConsents)
    .where(and(match, isNull(renewalConsents.endedAt)))
    .all();
  for (const row of open) {
    await ctx.db
      .update(renewalConsents)
      .set({ endedAt, keepUntil: consentKeepUntil(row.consentedAt, endedAt) })
      .where(and(eq(renewalConsents.checkoutId, row.id), isNull(renewalConsents.endedAt)));
  }
  return open.length;
}

/** Deletes the consent records whose retention date has passed (the daily cron). */
export async function purgeRenewalConsents(ctx: AppContext): Promise<number> {
  const gone = await ctx.db
    .delete(renewalConsents)
    .where(and(isNotNull(renewalConsents.keepUntil), lt(renewalConsents.keepUntil, ctx.now())))
    .returning({ id: renewalConsents.checkoutId });
  if (gone.length) ctx.logger.info("billing.renewal_consents_purged", { count: gone.length });
  return gone.length;
}
