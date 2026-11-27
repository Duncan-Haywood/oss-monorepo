// The owner's "new paid subscription" email (packages/admin-metrics notify.ts). Off unless
// OWNER_NOTIFICATIONS=on, account mail is configured (or the test/demo fake) and
// PLATFORM_ADMIN_EMAILS names someone. Carries only the org name, plan, and the org owner's name and
// email. A failure is logged and never fails the webhook (Paddle would retry an applied event).
import { monthlyRecurringMinor, newPaidSubscriptionEmail, ownerRecipients } from "@admin-metrics";
import { and, eq } from "drizzle-orm";
import { type AppContext, usesFakeEmail } from "../context";
import { member, organization, subscriptions, user } from "../db/schema";
import { PRODUCT } from "./admin/metrics";

export async function notifyOwnerNewPaid(ctx: AppContext, orgId: string): Promise<void> {
  const to = ownerRecipients(ctx.env, ctx.email.delivers || usesFakeEmail(ctx.env));
  if (to.length === 0) return;
  try {
    const row = await ctx.db
      .select({
        orgName: organization.name,
        planKey: subscriptions.planKey,
        priceAmountMinor: subscriptions.priceAmountMinor,
        priceCurrency: subscriptions.priceCurrency,
        billingInterval: subscriptions.billingInterval,
        billingFrequency: subscriptions.billingFrequency,
        priceQuantity: subscriptions.priceQuantity,
        priceDiscounted: subscriptions.priceDiscounted,
      })
      .from(subscriptions)
      .innerJoin(organization, eq(organization.id, subscriptions.orgId))
      .where(eq(subscriptions.orgId, orgId))
      .get();
    if (!row) return;
    const owner = await ctx.db
      .select({ name: user.name, email: user.email })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(and(eq(member.organizationId, orgId), eq(member.role, "owner")))
      .orderBy(member.createdAt)
      .get();
    const mail = newPaidSubscriptionEmail({
      productName: PRODUCT.name,
      orgName: row.orgName,
      planKey: row.planKey,
      ownerName: owner?.name ?? null,
      ownerEmail: owner?.email ?? null,
      mrr: monthlyRecurringMinor(row),
    });
    await ctx.email.send({ to, subject: mail.subject, text: mail.text });
    ctx.logger.info("owner_notify.new_paid_sent", { orgId, recipients: to.length });
  } catch (e) {
    ctx.logger.error("owner_notify.new_paid_failed", { orgId, error: String(e) });
  }
}
