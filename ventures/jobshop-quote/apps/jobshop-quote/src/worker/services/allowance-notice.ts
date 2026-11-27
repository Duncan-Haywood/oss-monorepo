// "You have used 80% of this month's RFQs": after an AI read counts against the plan's monthly
// allowance, a shop's owners and admins get one email when the month's count first reaches 80% of
// the allowance, and one more when it reaches 100% (docs/BILLING.md, "Allowance emails").
//
// Rules:
// - At most one email per shop, month and threshold: an `allowance_notices` row is inserted (primary
//   key org + month + threshold) before anything is sent, so two reads that cross the line at once
//   send it once. A read that jumps straight past 100% sends only the 100% email.
// - Only owners and admins (they can change the plan), at most MAX_RECIPIENTS, one message each.
//   Where sign-in needs a confirmed address, only confirmed addresses are mailed.
// - Facts only: the counts, the plan, the reset date and what still works. Prices and the next
//   plan's allowance come from `PLAN_LIST`, and only when checkout is on (`ctx.billing`); while paid
//   plans are dark the email says they are not on sale yet instead of pointing at a checkout.
// - Plans with no allowance (complimentary) never get one.
// - Never fails or undoes the read: errors are logged with ids only.
import { type NoticeThreshold, reachedThreshold } from "@shared/allowance";
import { type Plan, PUBLIC_PLANS } from "@shared/plans";
import { and, eq, inArray } from "drizzle-orm";
import type { AppContext } from "../context";
import { allowanceNotices, member, shopSettings, user } from "../db/schema";
import { isSafeEmailAddress } from "../ports/email";
import { requiresEmailVerification } from "./auth/auth";
import { defang } from "./inbound/notify";

export const MAX_RECIPIENTS = 10;
// The thresholds live in @shared/allowance so the RFQ page's banner uses the same counts.
export {
  NOTICE_THRESHOLDS,
  type NoticeThreshold,
  reachedThreshold,
  thresholdCount,
} from "@shared/allowance";

/** The cheapest plan on sale with a larger monthly allowance than `plan`'s, if any. */
export function nextPlanUp(plan: Plan): Plan | null {
  const current = plan.rfqsPerMonth;
  if (current === null) return null;
  const bigger = PUBLIC_PLANS.filter(
    (p) => p.purchasable && p.rfqsPerMonth !== null && p.rfqsPerMonth > current,
  ).sort((a, b) => a.priceCents - b.priceCents);
  return bigger[0] ?? null;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const dollars = (cents: number) =>
  `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: cents % 100 ? 2 : 0 })}`;

export interface NoticeFacts {
  shopName: string;
  orgId: string;
  plan: Plan;
  threshold: NoticeThreshold;
  used: number;
  /** YYYY-MM-DD (UTC): the first day of next month. */
  resetsOn: string;
  /** Checkout is on for this deployment (paid plans can be bought). */
  checkoutOn: boolean;
}

export function allowanceEmail(appUrl: string, f: NoticeFacts): { subject: string; text: string } {
  const base = appUrl.replace(/\/+$/, "");
  const shop = defang(f.shopName, 80);
  const allowance = f.plan.rfqsPerMonth ?? 0;
  const left = Math.max(0, allowance - f.used);
  const billingUrl = `${base}/app/${encodeURIComponent(f.orgId)}/billing`;
  const full = f.threshold === 100;
  const up = nextPlanUp(f.plan);
  const upgrade = !f.checkoutOn
    ? [
        `Paid plans are not on sale yet, so the allowance cannot be raised today; it starts again on ${f.resetsOn} (UTC).`,
      ]
    : up
      ? [
          `The ${up.name} plan includes ${plural(up.rfqsPerMonth ?? 0, "RFQ")} a month for ${dollars(up.priceCents)} a month.`,
          `Change plans on the Billing page: ${billingUrl}`,
        ]
      : [`See your plan on the Billing page: ${billingUrl}`];
  const text = [
    full
      ? `${shop} has used all ${plural(allowance, "RFQ")} of this month's AI reads on the ${f.plan.name} plan.`
      : `${shop} has used ${f.used} of this month's ${plural(allowance, "RFQ")} on the ${f.plan.name} plan (${f.threshold}%); ${left} ${left === 1 ? "is" : "are"} left.`,
    "",
    full
      ? `New RFQs cannot be read by AI until ${f.resetsOn} (UTC). Every RFQ, quote and PDF stays where it is: you can still enter parts by hand, price them and send quotes.`
      : `The allowance starts again on ${f.resetsOn} (UTC). An RFQ counts once per 10 drawing pages, the first time the AI reads it; re-reading, editing and re-pricing are free.`,
    "",
    ...upgrade,
    "",
    `You get this because you are an owner or admin of ${shop} on Job Shop Quote. It is sent at most`,
    "once a month at 80% and once at 100%.",
  ].join("\n");
  const subject = full
    ? `${shop}: this month's RFQ allowance is used`
    : `${shop}: ${f.threshold}% of this month's RFQs used`;
  return { subject, text };
}

/** Owners and admins of this shop with an address we may mail. */
async function recipients(ctx: AppContext, orgId: string) {
  const rows = await ctx.db
    .select({ userId: user.id, email: user.email, verified: user.emailVerified })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(and(eq(member.organizationId, orgId), inArray(member.role, ["owner", "admin"])))
    .limit(MAX_RECIPIENTS)
    .all();
  const needVerified = requiresEmailVerification(ctx.env);
  return rows.filter((r) => isSafeEmailAddress(r.email) && (!needVerified || r.verified));
}

/**
 * Called after a read's count is kept. `used` is the month's count including that read. Returns
 * what was sent (for tests and logs); never throws.
 */
export async function notifyAllowanceUsage(
  ctx: AppContext,
  orgId: string,
  plan: Plan,
  used: number,
  now: Date,
): Promise<{ threshold: NoticeThreshold | null; sent: number; failed: number }> {
  const log = ctx.logger.child({ orgId });
  const none = { threshold: null, sent: 0, failed: 0 };
  if (plan.rfqsPerMonth === null) return none;
  const threshold = reachedThreshold(used, plan.rfqsPerMonth);
  if (threshold === null) return none;
  const period = now.toISOString().slice(0, 7);
  let sent = 0;
  let failed = 0;
  try {
    // Claim the notice first: only the read whose insert lands sends it.
    const claimed = await ctx.db
      .insert(allowanceNotices)
      .values({ orgId, period, threshold, used, allowance: plan.rfqsPerMonth, createdAt: now })
      .onConflictDoNothing()
      .returning({ orgId: allowanceNotices.orgId });
    if (claimed.length === 0) return { threshold, sent, failed };
    if (threshold === 100) {
      // A jump straight to 100% makes a later 80% email pointless.
      await ctx.db
        .insert(allowanceNotices)
        .values({
          orgId,
          period,
          threshold: 80,
          used,
          allowance: plan.rfqsPerMonth,
          createdAt: now,
        })
        .onConflictDoNothing();
    }
    const to = await recipients(ctx, orgId);
    const shop = await ctx.db
      .select({ name: shopSettings.displayName })
      .from(shopSettings)
      .where(eq(shopSettings.orgId, orgId))
      .get();
    const resetsOn = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1))
      .toISOString()
      .slice(0, 10);
    const mail = allowanceEmail(ctx.env.APP_URL, {
      shopName: shop?.name ?? "Your shop",
      orgId,
      plan,
      threshold,
      used,
      resetsOn,
      checkoutOn: ctx.billing !== null,
    });
    for (const r of to) {
      try {
        await ctx.email.send({ to: [r.email], subject: mail.subject, text: mail.text });
        sent++;
      } catch (e) {
        failed++;
        log.warn("billing.allowance_notice_failed", {
          userId: r.userId,
          error: String(e)
            .replace(/[^\s@<>"']+@[^\s@<>"']+/g, "[address]")
            .slice(0, 300),
        });
      }
    }
    await ctx.db
      .update(allowanceNotices)
      .set({ sent, failed })
      .where(
        and(
          eq(allowanceNotices.orgId, orgId),
          eq(allowanceNotices.period, period),
          eq(allowanceNotices.threshold, threshold),
        ),
      );
  } catch (e) {
    log.error("billing.allowance_notice_error", { error: String(e).slice(0, 300) });
  }
  log.info("billing.allowance_notice", { threshold, used, sent, failed });
  return { threshold, sent, failed };
}
