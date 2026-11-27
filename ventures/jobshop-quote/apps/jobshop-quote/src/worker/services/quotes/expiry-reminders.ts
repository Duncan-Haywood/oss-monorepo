// The day-before email about sent quotes that are about to expire (ROADMAP item 7, Quote revisions
// part 4). The daily cron (src/worker/index.ts) runs it right after expireQuotes: every sent quote
// whose valid-until day is today or tomorrow on its shop's own calendar (shop_settings.time_zone,
// UTC when unset), not yet reminded, is claimed and then listed in one email to the estimator who
// wrote it, so they can follow up or revise before the quote lapses.
//
// Rules (docs/EMAIL.md, "Quotes about to expire"):
// - To the quote's author (`quotes.created_by`) only, while they are still a member of that shop,
//   have a confirmed address where sign-in needs one, and have not turned it off
//   (`member_notifications.quote_expiry`, on by default: the mail is about their own work).
// - One message per estimator per shop per day, listing all their quotes (at most MAX_LISTED).
// - Claimed before sending (`expiry_reminded_at`), so overlapping runs never mail a quote twice; a
//   failed send is logged with counts and not retried (the quote page still shows its date).
// - The text names only the shop's own records: quote label, customer, contact, total, date, link.

import { formatMoney } from "@shared/currency";
import { oneLine } from "@shared/quote-email";
import { quoteLabel } from "@shared/quote-label";
import { addDays, shopDay } from "@shared/time-zone";
import { and, eq, gte, inArray, isNotNull, isNull, lte, sql } from "drizzle-orm";
import type { AppContext } from "../../context";
import { member, memberNotifications, quotes, shopSettings, user } from "../../db/schema";
import { isSafeEmailAddress } from "../../ports/email";
import { requiresEmailVerification } from "../auth/auth";

/** Quotes listed in one email; the rest are counted ("and 3 more"). */
export const MAX_LISTED = 30;

/** Quote ids per claiming UPDATE (D1 binds at most 100 parameters per statement). */
const CLAIM_CHUNK = 90;

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

export interface ExpiringQuote {
  id: string;
  quoteNumber: number;
  revNumber: number;
  customerCompany: string;
  customerContact: string | null;
  customerEmail: string | null;
  headlineTotalCents: number | null;
  validUntil: string;
}

/** The reminder's text. Pure, so the wording is tested without a database. */
export function expiryReminderEmail(f: {
  appUrl: string;
  orgId: string;
  shopName: string;
  today: string;
  quotes: ExpiringQuote[];
  /** The shop's ISO 4217 code (shared/currency.ts); absent or null is USD. */
  currency?: string | null;
}): { subject: string; text: string } {
  const base = f.appUrl.replace(/\/+$/, "");
  const sorted = [...f.quotes].sort(
    (a, b) => a.validUntil.localeCompare(b.validUntil) || a.quoteNumber - b.quoteNumber,
  );
  const when = (d: string) => (d === f.today ? "today" : "tomorrow");
  const listed = sorted.slice(0, MAX_LISTED);
  const lines: string[] = [];
  for (const q of listed) {
    const who = [q.customerContact, q.customerEmail]
      .filter((s): s is string => Boolean(s?.trim()))
      .map((s) => oneLine(s, 120))
      .join(", ");
    const total =
      q.headlineTotalCents === null ? "" : `, ${formatMoney(q.headlineTotalCents, f.currency)}`;
    lines.push(
      `- ${quoteLabel(q.quoteNumber, q.revNumber)} for ${oneLine(q.customerCompany, 120)}${who ? ` (${who})` : ""}${total}: valid until ${q.validUntil} (${when(q.validUntil)})`,
      `  ${base}/app/${encodeURIComponent(f.orgId)}/quotes/${encodeURIComponent(q.id)}`,
    );
  }
  if (sorted.length > listed.length) {
    lines.push(`- and ${sorted.length - listed.length} more on the quote log`);
  }
  const first = sorted[0];
  const subject =
    sorted.length === 1 && first
      ? `${quoteLabel(first.quoteNumber, first.revNumber)} for ${oneLine(first.customerCompany, 60)} expires ${when(first.validUntil)}`
      : `${sorted.length} of your quotes expire soon`;
  const text = [
    sorted.length === 1
      ? `A quote you sent from ${oneLine(f.shopName, 80)} is about to expire:`
      : `${sorted.length} quotes you sent from ${oneLine(f.shopName, 80)} are about to expire:`,
    "",
    ...lines,
    "",
    "A quote stays good through its valid-until day and is marked expired the day after.",
    "To keep the customer, follow up now, or press Revise on the quote to send a new revision",
    "with a new valid-until date.",
    "",
    "Totals are the smallest-quantity price of each line, as on the quote log.",
    "",
    "You get this because you sent these quotes. Turn these emails off on the quote log:",
    `${base}/app/${encodeURIComponent(f.orgId)}`,
  ].join("\n");
  return { subject: oneLine(subject, 160), text };
}

/** The signed-in member's own setting (on when they never changed it). */
export async function quoteExpiryEmailsFor(ctx: AppContext, orgId: string, userId: string) {
  const row = await ctx.db
    .select({ on: memberNotifications.quoteExpiry })
    .from(memberNotifications)
    .where(and(eq(memberNotifications.orgId, orgId), eq(memberNotifications.userId, userId)))
    .get();
  return row?.on ?? true;
}

export async function saveQuoteExpiryEmails(
  ctx: AppContext,
  orgId: string,
  userId: string,
  on: boolean,
) {
  await ctx.db
    .insert(memberNotifications)
    .values({ orgId, userId, quoteExpiry: on })
    .onConflictDoUpdate({
      target: [memberNotifications.orgId, memberNotifications.userId],
      set: { quoteExpiry: on, updatedAt: ctx.now() },
    });
  ctx.logger.info("quote.expiry_emails_changed", { orgId, on });
  return { quoteExpiry: on };
}

/** The daily run. Never throws; returns counts for the log and tests. */
export async function remindExpiringQuotes(
  ctx: AppContext,
): Promise<{ quotes: number; emails: number; skipped: number; failed: number }> {
  const out = { quotes: 0, emails: 0, skipped: 0, failed: 0 };
  const now = ctx.now();
  // A shop's today is UTC's yesterday, today or tomorrow (zones run UTC-12 to UTC+14), so its
  // "today or tomorrow" lies inside UTC's yesterday to the day after tomorrow; each candidate is
  // then checked against its own shop's calendar before it is claimed.
  const utcToday = isoDay(now);
  const todayFor = new Map<string, string>();
  const claimed: (ExpiringQuote & { orgId: string; createdBy: string | null })[] = [];
  try {
    const candidates = await ctx.db
      .select({
        id: quotes.id,
        orgId: quotes.orgId,
        validUntil: quotes.validUntil,
        timeZone: shopSettings.timeZone,
      })
      .from(quotes)
      .leftJoin(shopSettings, eq(shopSettings.orgId, quotes.orgId))
      .where(
        and(
          eq(quotes.status, "sent"),
          isNull(quotes.expiryRemindedAt),
          isNotNull(quotes.createdBy),
          sql`${quotes.validUntil} glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'`,
          gte(quotes.validUntil, addDays(utcToday, -1)),
          lte(quotes.validUntil, addDays(utcToday, 2)),
        ),
      )
      .all();
    const due: string[] = [];
    for (const c of candidates) {
      const today = shopDay(now, c.timeZone);
      todayFor.set(c.orgId, today);
      if (c.validUntil && c.validUntil >= today && c.validUntil <= addDays(today, 1)) {
        due.push(c.id);
      }
    }
    for (let i = 0; i < due.length; i += CLAIM_CHUNK) {
      // Claimed before sending: a run that overlaps this one finds expiry_reminded_at set.
      const rows = (await ctx.db
        .update(quotes)
        .set({ expiryRemindedAt: now })
        .where(
          and(
            inArray(quotes.id, due.slice(i, i + CLAIM_CHUNK)),
            eq(quotes.status, "sent"),
            isNull(quotes.expiryRemindedAt),
          ),
        )
        .returning({
          id: quotes.id,
          orgId: quotes.orgId,
          createdBy: quotes.createdBy,
          quoteNumber: quotes.quoteNumber,
          revNumber: quotes.revNumber,
          customerCompany: quotes.customerCompany,
          customerContact: quotes.customerContact,
          customerEmail: quotes.customerEmail,
          headlineTotalCents: quotes.headlineTotalCents,
          validUntil: quotes.validUntil,
        })) as (ExpiringQuote & { orgId: string; createdBy: string | null })[];
      claimed.push(...rows);
    }
  } catch (e) {
    ctx.logger.error("quote.expiry_reminder_claim_failed", { error: String(e).slice(0, 300) });
    if (claimed.length === 0) return out;
  }
  out.quotes = claimed.length;
  if (claimed.length === 0) return out;

  // One email per (shop, estimator).
  const groups = new Map<string, { orgId: string; userId: string; quotes: ExpiringQuote[] }>();
  for (const q of claimed) {
    if (!q.createdBy) continue;
    const key = `${q.orgId}\u0000${q.createdBy}`;
    const g = groups.get(key) ?? { orgId: q.orgId, userId: q.createdBy, quotes: [] };
    g.quotes.push(q);
    groups.set(key, g);
  }
  const needVerified = requiresEmailVerification(ctx.env);

  for (const g of groups.values()) {
    const log = ctx.logger.child({ orgId: g.orgId });
    try {
      const to = await ctx.db
        .select({
          email: user.email,
          verified: user.emailVerified,
          on: memberNotifications.quoteExpiry,
          shopName: shopSettings.displayName,
          currency: shopSettings.currency,
        })
        .from(member)
        .innerJoin(user, eq(user.id, member.userId))
        .leftJoin(
          memberNotifications,
          and(
            eq(memberNotifications.orgId, member.organizationId),
            eq(memberNotifications.userId, member.userId),
          ),
        )
        .leftJoin(shopSettings, eq(shopSettings.orgId, member.organizationId))
        .where(and(eq(member.organizationId, g.orgId), eq(member.userId, g.userId)))
        .get();
      if (
        !to ||
        to.on === false ||
        (needVerified && !to.verified) ||
        !isSafeEmailAddress(to.email)
      ) {
        out.skipped += g.quotes.length;
        continue;
      }
      const mail = expiryReminderEmail({
        appUrl: ctx.env.APP_URL,
        orgId: g.orgId,
        shopName: to.shopName ?? "your shop",
        today: todayFor.get(g.orgId) ?? utcToday,
        quotes: g.quotes,
        currency: to.currency,
      });
      await ctx.email.send({
        to: [to.email],
        subject: mail.subject,
        text: mail.text,
        fromName: "Job Shop Quote",
      });
      out.emails++;
    } catch (e) {
      out.failed++;
      log.warn("quote.expiry_reminder_failed", {
        quotes: g.quotes.length,
        error: String(e)
          .replace(/[^\s@<>"']+@[^\s@<>"']+/g, "[address]")
          .slice(0, 300),
      });
    }
  }
  ctx.logger.info("quote.expiry_reminders", out);
  return out;
}
