// The automatic-renewal notice: an email to a shop's owner and admins 26 to 39 days before each
// yearly renewal, and before each twelve-month mark of a monthly plan, saying the plan renews unless
// cancelled, at what price and how often, and how to cancel in one step. Colorado (C.R.S.
// 6-1-732(4)) and California (Bus. & Prof. Code 17602, AB 2863) ask for it when the buyer is a
// consumer, which a reseller often is. Which renewal a day is for: src/shared/renewal-notice.ts.
// Sent by the Worker's daily cron (index.ts). It is a notice the law asks for, about a charge, so it
// has no unsubscribe link; it goes to the people who can cancel (owner and admins).
import { type MemberRole, ROLE_RANK } from "@shared/enums";
import { longDate } from "@shared/estimate-reminder";
import { catalog } from "@shared/plans";
import { type RenewalNotice, renewalNoticeDue } from "@shared/renewal-notice";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { AppContext } from "../../context";
import { member, organization, renewalNotices, subscriptions, user } from "../../db/schema";
import { escapeHtml } from "../auth/emails";
import { appLink } from "./service";

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/** The billed price as the provider reported it, or null when it is unknown or discounted. */
export function billedPrice(row: {
  priceAmountMinor: number | null;
  priceCurrency: string | null;
  priceQuantity: number | null;
  priceDiscounted: boolean | null;
}): string | null {
  if (row.priceAmountMinor == null || !row.priceCurrency || row.priceDiscounted) return null;
  if (!/^[A-Z]{3}$/.test(row.priceCurrency)) return null;
  const amount = (row.priceAmountMinor * Math.max(1, row.priceQuantity ?? 1)) / 100;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: row.priceCurrency }).format(
    amount,
  );
}

export interface RenewalEmail {
  subject: string;
  text: string;
  html: string;
}

/** Plain text + minimal HTML, every interpolated value escaped; the subject carries no shop name. */
export function renewalNoticeEmail(
  n: RenewalNotice,
  opts: {
    orgId: string;
    orgName: string;
    userName: string;
    planName: string;
    price: string | null;
  },
  env: { APP_URL: string },
): RenewalEmail {
  const billingUrl = appLink(env.APP_URL, `/o/${encodeURIComponent(opts.orgId)}/billing`);
  const refundsUrl = appLink(env.APP_URL, "/legal/refunds");
  const name = opts.userName.trim() || "there";
  const amount = opts.price
    ? `${opts.price} plus any sales tax`
    : "the price on your last receipt from Paddle";
  const lead =
    n.cycle === "year"
      ? `The ${opts.planName} plan for ${opts.orgName} renews automatically for another year on ${longDate(n.key)}, at ${amount}, unless you cancel before then.`
      : `The ${opts.planName} plan for ${opts.orgName} renews automatically every month at ${amount}, unless you cancel. This is the yearly reminder: on ${longDate(n.key)} it starts its ${ordinal(n.yearNumber ?? 2)} year, and the next monthly charge is on ${longDate(n.nextCharge)}.`;
  const cancel = [
    `To cancel, open the Billing page and choose "Cancel subscription": ${billingUrl}`,
    "It takes one step after you sign in. You keep the plan until the end of the period you paid for, nothing more is charged, the free plan's limits apply after that, and every record in the shop stays readable and exportable.",
  ];
  const keep =
    "To keep the plan, do nothing. Payments are handled by Paddle, our merchant of record, and the receipt comes from them.";
  const why = `You get this email because you are an owner or admin of ${opts.orgName}, and we send it before every yearly renewal (once a year on a monthly plan) so a renewal never comes as a surprise. Refund Policy: ${refundsUrl}`;
  const text = [
    `Hi ${name},`,
    "",
    lead,
    "",
    ...cancel.flatMap((p) => [p, ""]),
    keep,
    "",
    why,
    "",
    "Questions: reply to hello@marisstella.app",
    "",
    "Seller Books",
  ].join("\n");
  const p = (s: string, style = "margin:0 0 16px") => `<p style="${style}">${escapeHtml(s)}</p>`;
  const small = "margin:0 0 16px;font-size:13px;color:#475569";
  const html = [
    '<!doctype html><html><body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.5;color:#0f172a">',
    p(`Hi ${name},`),
    p(lead, "margin:0 0 16px;font-weight:600"),
    p('To cancel, open the Billing page and choose "Cancel subscription".'),
    `<p style="margin:0 0 16px"><a href="${escapeHtml(billingUrl)}" style="display:inline-block;background:#0f172a;color:#ffffff;padding:10px 16px;border-radius:6px;text-decoration:none">Open the Billing page</a></p>`,
    p(cancel[1] as string),
    p(keep),
    `<p style="${small}">${escapeHtml(`You get this email because you are an owner or admin of ${opts.orgName}, and we send it before every yearly renewal (once a year on a monthly plan) so a renewal never comes as a surprise.`)} <a href="${escapeHtml(refundsUrl)}" style="color:#475569">Refund Policy</a>.</p>`,
    p("Questions: hello@marisstella.app", small),
    '<p style="margin:0">Seller Books</p>',
    "</body></html>",
  ].join("");
  const subject =
    n.cycle === "year"
      ? `Your Seller Books plan renews on ${longDate(n.key)}`
      : `Your Seller Books plan keeps renewing monthly: yearly reminder`;
  return { subject, text, html };
}

const ORDINALS = ["", "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth"];
const ordinal = (n: number) => ORDINALS[n] ?? `${n}th`;

export interface RenewalRun {
  checked: number;
  due: number;
  sent: number;
  late: number;
  failed: number;
  /** Due, but the shop has no owner or admin to tell (logged as an error). */
  noRecipient: number;
}

/** At most this many notices per run; the rest go out on the next day's run, still in the window. */
export const RENEWAL_NOTICES_PER_RUN = 200;

/**
 * Send today's notices. Each one is claimed first by inserting its (org, renewal date) row, so two
 * runs never send it twice; when no recipient could be mailed the row is deleted again and the next
 * run retries (still inside the window, or late).
 */
export async function sendRenewalNotices(
  ctx: AppContext,
  opts: { perRun?: number } = {},
): Promise<RenewalRun> {
  const today = isoDay(ctx.now());
  const run: RenewalRun = { checked: 0, due: 0, sent: 0, late: 0, failed: 0, noRecipient: 0 };
  const rows = await ctx.db
    .select({
      orgId: subscriptions.orgId,
      orgName: organization.name,
      planKey: subscriptions.planKey,
      status: subscriptions.status,
      cancelAtPeriodEnd: subscriptions.cancelAtPeriodEnd,
      currentPeriodStart: subscriptions.currentPeriodStart,
      currentPeriodEnd: subscriptions.currentPeriodEnd,
      billingInterval: subscriptions.billingInterval,
      billingFrequency: subscriptions.billingFrequency,
      firstPaidAt: subscriptions.firstPaidAt,
      createdAt: subscriptions.createdAt,
      providerSubscriptionId: subscriptions.providerSubscriptionId,
      priceAmountMinor: subscriptions.priceAmountMinor,
      priceCurrency: subscriptions.priceCurrency,
      priceQuantity: subscriptions.priceQuantity,
      priceDiscounted: subscriptions.priceDiscounted,
    })
    .from(subscriptions)
    .innerJoin(organization, eq(organization.id, subscriptions.orgId))
    .where(inArray(subscriptions.status, ["active", "trialing"]))
    .orderBy(asc(subscriptions.orgId));
  const limit = opts.perRun ?? RENEWAL_NOTICES_PER_RUN;
  for (const r of rows) {
    run.checked++;
    const notice = renewalNoticeDue({ ...r, startedAt: r.firstPaidAt ?? r.createdAt }, today);
    if (!notice) continue;
    if (run.due >= limit) break;
    const claimed = await ctx.db
      .insert(renewalNotices)
      .values({
        orgId: r.orgId,
        renewsOn: notice.key,
        providerSubscriptionId: r.providerSubscriptionId,
        late: notice.late,
      })
      .onConflictDoNothing()
      .returning({ orgId: renewalNotices.orgId });
    if (claimed.length === 0) continue; // already sent for this renewal
    run.due++;
    const people = (
      await ctx.db
        .select({ email: user.email, name: user.name, role: member.role })
        .from(member)
        .innerJoin(user, eq(user.id, member.userId))
        .where(eq(member.organizationId, r.orgId))
        .orderBy(asc(member.createdAt))
    ).filter((m) => canCancel(m.role));
    const release = () =>
      ctx.db
        .delete(renewalNotices)
        .where(and(eq(renewalNotices.orgId, r.orgId), eq(renewalNotices.renewsOn, notice.key)));
    if (people.length === 0) {
      run.noRecipient++;
      ctx.logger.error("renewal_notice.no_recipient", { orgId: r.orgId, renewsOn: notice.key });
      await release();
      continue;
    }
    const planName = catalog.get(r.planKey)?.name ?? r.planKey;
    const price = billedPrice(r);
    let delivered = 0;
    for (const m of people) {
      const mail = renewalNoticeEmail(
        notice,
        { orgId: r.orgId, orgName: r.orgName, userName: m.name, planName, price },
        ctx.env,
      );
      try {
        await ctx.email.send({ to: [m.email], ...mail });
        delivered++;
      } catch (e) {
        run.failed++;
        ctx.logger.warn("renewal_notice.email_failed", { orgId: r.orgId, error: String(e) });
      }
    }
    if (delivered === 0) {
      await release();
      continue;
    }
    run.sent += delivered;
    if (notice.late) {
      run.late++;
      ctx.logger.warn("renewal_notice.late", {
        orgId: r.orgId,
        renewsOn: notice.key,
        daysLeft: notice.daysLeft,
      });
    }
    await ctx.db
      .update(renewalNotices)
      .set({ recipients: delivered })
      .where(and(eq(renewalNotices.orgId, r.orgId), eq(renewalNotices.renewsOn, notice.key)));
  }
  ctx.logger.info("renewal_notice.run", { ...run });
  return run;
}

const canCancel = (role: string) =>
  ROLE_RANK[(role in ROLE_RANK ? role : "viewer") as MemberRole] >= ROLE_RANK.admin;
