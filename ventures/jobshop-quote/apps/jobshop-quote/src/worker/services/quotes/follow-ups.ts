// Quote follow-up (ROADMAP, "Quote follow-up"; the pure rules are in shared/follow-up.ts).
//
// - Sending a quote sets `quotes.follow_up_on` to the shop's today + `shop_settings.follow_up_days`
//   (services/quotes sendQuote; 0 days leaves it null).
// - The quote log's "Follow up" list shows the shop's sent quotes whose day has come, oldest first,
//   with the last logged note; estimators log what happened and pick the next day or "no more".
// - A daily email (cron, after the expiry emails) lists each estimator's own due quotes, once per
//   follow-up day: `follow_up_reminded_for` is claimed before the send, so overlapping runs never
//   mail a quote twice for the same day, and a newly logged day is mailed again when it comes.
//   Quotes that expire today or tomorrow are left to the expiry email, so no one gets both.
// - Only "sent" quotes are ever due: won, lost, expired and superseded quotes drop off by status.
// Every read and write is scoped to the tenant's orgId; the cron reads all shops, as the expiry job.

import type { FollowUpItemDto, FollowUpQueueDto, QuoteFollowUpsDto } from "@shared/api";
import {
  DEFAULT_FOLLOW_UP_DAYS,
  type FollowUpDigestQuote,
  followUpDigestEmail,
  nextFollowUpError,
} from "@shared/follow-up";
import { addDays, shopDay } from "@shared/time-zone";
import { and, asc, desc, eq, inArray, isNotNull, isNull, lte, ne, or, sql } from "drizzle-orm";
import type { AppContext } from "../../context";
import {
  member,
  memberNotifications,
  quoteFollowUps,
  quotes,
  shopSettings,
  user,
} from "../../db/schema";
import { badRequest, conflict, notFound } from "../../lib/errors";
import { newId } from "../../lib/ids";
import { isSafeEmailAddress } from "../../ports/email";
import { requiresEmailVerification } from "../auth/auth";

/** Quotes on the list at most (due + the next 7 days). */
export const MAX_QUEUE = 300;
/** Days ahead the "Coming up" part of the list covers. */
export const UPCOMING_DAYS = 7;
/** Quote ids per claiming UPDATE (D1 binds at most 100 parameters per statement). */
const CLAIM_CHUNK = 90;

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

async function shopFollowUpSettings(ctx: AppContext, orgId: string) {
  const row = await ctx.db
    .select({ timeZone: shopSettings.timeZone, days: shopSettings.followUpDays })
    .from(shopSettings)
    .where(eq(shopSettings.orgId, orgId))
    .get();
  return {
    timeZone: row?.timeZone ?? null,
    followUpDays: row?.days ?? DEFAULT_FOLLOW_UP_DAYS,
  };
}

/** The newest logged note on the quote (a correlated subquery, same shop). */
const lastNote = sql<
  string | null
>`(select f.note from quote_follow_ups f where f.quote_id = ${quotes.id} and f.org_id = ${quotes.orgId} order by f.created_at desc, f.id desc limit 1)`;
const lastAt = sql<
  number | null
>`(select f.created_at from quote_follow_ups f where f.quote_id = ${quotes.id} and f.org_id = ${quotes.orgId} order by f.created_at desc, f.id desc limit 1)`;
const entryCount = sql<number>`(select count(*) from quote_follow_ups f where f.quote_id = ${quotes.id} and f.org_id = ${quotes.orgId})`;

/** GET /quotes/follow-ups: the shop's sent quotes due for a follow-up, and those coming up. */
export async function followUpQueue(ctx: AppContext, orgId: string): Promise<FollowUpQueueDto> {
  const s = await shopFollowUpSettings(ctx, orgId);
  const today = shopDay(ctx.now(), s.timeZone);
  const rows = await ctx.db
    .select({
      quoteId: quotes.id,
      quoteNumber: quotes.quoteNumber,
      revNumber: quotes.revNumber,
      customerCompany: quotes.customerCompany,
      customerContact: quotes.customerContact,
      customerEmail: quotes.customerEmail,
      headlineTotalCents: quotes.headlineTotalCents,
      sentAt: quotes.sentAt,
      validUntil: quotes.validUntil,
      followUpOn: quotes.followUpOn,
      estimatorName: user.name,
      lastNote,
      lastAt,
      count: entryCount,
    })
    .from(quotes)
    .leftJoin(user, eq(user.id, quotes.createdBy))
    .where(
      and(
        eq(quotes.orgId, orgId),
        eq(quotes.status, "sent"),
        isNotNull(quotes.followUpOn),
        lte(quotes.followUpOn, addDays(today, UPCOMING_DAYS)),
      ),
    )
    .orderBy(asc(quotes.followUpOn), asc(quotes.quoteNumber))
    .limit(MAX_QUEUE + 1)
    .all();
  const truncated = rows.length > MAX_QUEUE;
  const items: FollowUpItemDto[] = rows.slice(0, MAX_QUEUE).map((r) => ({
    quoteId: r.quoteId,
    quoteNumber: r.quoteNumber,
    revNumber: r.revNumber,
    customerCompany: r.customerCompany,
    customerContact: r.customerContact,
    customerEmail: r.customerEmail,
    headlineTotalCents: r.headlineTotalCents,
    sentAt: r.sentAt?.toISOString() ?? null,
    validUntil: r.validUntil,
    followUpOn: r.followUpOn ?? today,
    estimatorName: r.estimatorName,
    lastNote: r.lastNote,
    lastAt: r.lastAt === null ? null : new Date(Number(r.lastAt)).toISOString(),
    count: Number(r.count),
  }));
  return {
    today,
    followUpDays: s.followUpDays,
    due: items.filter((i) => i.followUpOn <= today),
    upcoming: items.filter((i) => i.followUpOn > today),
    truncated,
  };
}

/** GET /quotes/:id/follow-ups: the quote's next follow-up day and its log, newest first. */
export async function quoteFollowUpLog(
  ctx: AppContext,
  orgId: string,
  quoteId: string,
): Promise<QuoteFollowUpsDto> {
  const q = await ctx.db
    .select({ id: quotes.id, status: quotes.status, followUpOn: quotes.followUpOn })
    .from(quotes)
    .where(and(eq(quotes.id, quoteId), eq(quotes.orgId, orgId)))
    .get();
  if (!q) throw notFound("Quote");
  const s = await shopFollowUpSettings(ctx, orgId);
  const rows = await ctx.db
    .select({
      id: quoteFollowUps.id,
      byName: user.name,
      note: quoteFollowUps.note,
      nextOn: quoteFollowUps.nextOn,
      createdAt: quoteFollowUps.createdAt,
    })
    .from(quoteFollowUps)
    .leftJoin(user, eq(user.id, quoteFollowUps.byUserId))
    .where(and(eq(quoteFollowUps.orgId, orgId), eq(quoteFollowUps.quoteId, quoteId)))
    .orderBy(desc(quoteFollowUps.createdAt), desc(quoteFollowUps.id))
    .limit(200)
    .all();
  return {
    quoteId: q.id,
    status: q.status,
    followUpOn: q.status === "sent" ? q.followUpOn : null,
    today: shopDay(ctx.now(), s.timeZone),
    entries: rows.map((r) => ({
      id: r.id,
      byName: r.byName,
      note: r.note,
      nextOn: r.nextOn,
      createdAt: r.createdAt.toISOString(),
      day: shopDay(r.createdAt, s.timeZone),
    })),
  };
}

/**
 * POST /quotes/:id/follow-ups: log what happened and set the next follow-up day (null: no more).
 * Only a sent quote takes one; a note or a new day is required, so an empty click logs nothing.
 */
export async function logFollowUp(
  ctx: AppContext,
  orgId: string,
  userId: string,
  quoteId: string,
  input: { note: string; nextOn: string | null },
): Promise<QuoteFollowUpsDto> {
  const q = await ctx.db
    .select({ status: quotes.status, followUpOn: quotes.followUpOn })
    .from(quotes)
    .where(and(eq(quotes.id, quoteId), eq(quotes.orgId, orgId)))
    .get();
  if (!q) throw notFound("Quote");
  if (q.status !== "sent") {
    throw conflict(`Follow-ups are for sent quotes; this quote is ${q.status}`);
  }
  const s = await shopFollowUpSettings(ctx, orgId);
  const today = shopDay(ctx.now(), s.timeZone);
  const error = nextFollowUpError(input.nextOn, today);
  if (error) throw badRequest(error);
  const note = input.note.replace(/\r\n?/g, "\n").trim() || null;
  if (!note && input.nextOn === q.followUpOn) {
    throw badRequest("Write what happened, or pick a different next follow-up day");
  }
  // The day moves only while the quote is still sent; if it was decided a moment ago, nothing is
  // logged. The entry is written after, so a refused update leaves no orphan note.
  const moved = await ctx.db
    .update(quotes)
    .set({ followUpOn: input.nextOn })
    .where(and(eq(quotes.id, quoteId), eq(quotes.orgId, orgId), eq(quotes.status, "sent")))
    .returning({ id: quotes.id });
  if (moved.length === 0) throw conflict("This quote was decided while you were writing");
  await ctx.db.insert(quoteFollowUps).values({
    id: newId("qfu"),
    orgId,
    quoteId,
    byUserId: userId,
    note,
    nextOn: input.nextOn,
    createdAt: ctx.now(),
  });
  ctx.logger.info("quote.follow_up_logged", { orgId, quoteId, more: input.nextOn !== null });
  return quoteFollowUpLog(ctx, orgId, quoteId);
}

/** PUT /quotes/follow-ups/settings (admins): the first follow-up N days after sending, 0 off. */
export async function setFollowUpDays(ctx: AppContext, orgId: string, followUpDays: number) {
  const rows = await ctx.db
    .update(shopSettings)
    .set({ followUpDays })
    .where(eq(shopSettings.orgId, orgId))
    .returning({ days: shopSettings.followUpDays });
  if (rows.length === 0) throw notFound("Shop settings");
  ctx.logger.info("quote.follow_up_days_changed", { orgId, followUpDays });
  return { followUpDays };
}

/** The member's own follow-up email setting (on when they never changed it). */
export async function quoteFollowUpEmailsFor(ctx: AppContext, orgId: string, userId: string) {
  const row = await ctx.db
    .select({ on: memberNotifications.quoteFollowUp })
    .from(memberNotifications)
    .where(and(eq(memberNotifications.orgId, orgId), eq(memberNotifications.userId, userId)))
    .get();
  return row?.on ?? true;
}

export async function saveQuoteFollowUpEmails(
  ctx: AppContext,
  orgId: string,
  userId: string,
  on: boolean,
) {
  await ctx.db
    .insert(memberNotifications)
    .values({ orgId, userId, quoteFollowUp: on })
    .onConflictDoUpdate({
      target: [memberNotifications.orgId, memberNotifications.userId],
      set: { quoteFollowUp: on, updatedAt: ctx.now() },
    });
  ctx.logger.info("quote.follow_up_emails_changed", { orgId, on });
  return { quoteFollowUp: on };
}

type Claimed = Omit<FollowUpDigestQuote, "sentDay" | "lastDay"> & {
  orgId: string;
  createdBy: string | null;
  sentAt: Date | null;
  lastAt: number | null;
};

/** The daily run, after the expiry emails. Never throws; returns counts for the log and tests. */
export async function remindFollowUps(
  ctx: AppContext,
): Promise<{ quotes: number; emails: number; skipped: number; failed: number }> {
  const out = { quotes: 0, emails: 0, skipped: 0, failed: 0 };
  const now = ctx.now();
  // A shop's today is at most a day from UTC's, so every due quote has follow_up_on on or before
  // UTC's tomorrow; each candidate is then checked against its own shop's calendar.
  const utcToday = isoDay(now);
  const todayFor = new Map<string, string>();
  const tzFor = new Map<string, string | null>();
  const claimed: Claimed[] = [];
  try {
    const candidates = await ctx.db
      .select({
        id: quotes.id,
        orgId: quotes.orgId,
        followUpOn: quotes.followUpOn,
        validUntil: quotes.validUntil,
        timeZone: shopSettings.timeZone,
      })
      .from(quotes)
      .leftJoin(shopSettings, eq(shopSettings.orgId, quotes.orgId))
      .where(
        and(
          eq(quotes.status, "sent"),
          isNotNull(quotes.followUpOn),
          isNotNull(quotes.createdBy),
          lte(quotes.followUpOn, addDays(utcToday, 1)),
          or(isNull(quotes.followUpRemindedFor), ne(quotes.followUpRemindedFor, quotes.followUpOn)),
        ),
      )
      .limit(5000)
      .all();
    const due: string[] = [];
    for (const c of candidates) {
      const today = shopDay(now, c.timeZone);
      todayFor.set(c.orgId, today);
      tzFor.set(c.orgId, c.timeZone);
      if (!c.followUpOn || c.followUpOn > today) continue;
      // Expiring today or tomorrow: the expiry email already names it, with Revise.
      if (c.validUntil && c.validUntil <= addDays(today, 1)) continue;
      due.push(c.id);
    }
    for (let i = 0; i < due.length; i += CLAIM_CHUNK) {
      const rows = (await ctx.db
        .update(quotes)
        .set({ followUpRemindedFor: sql`${quotes.followUpOn}` })
        .where(
          and(
            inArray(quotes.id, due.slice(i, i + CLAIM_CHUNK)),
            eq(quotes.status, "sent"),
            isNotNull(quotes.followUpOn),
            or(
              isNull(quotes.followUpRemindedFor),
              ne(quotes.followUpRemindedFor, quotes.followUpOn),
            ),
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
          sentAt: quotes.sentAt,
          followUpOn: quotes.followUpOn,
          lastNote,
          lastAt,
        })) as (Omit<Claimed, "followUpOn"> & { followUpOn: string | null })[];
      for (const r of rows) {
        if (r.followUpOn) claimed.push({ ...r, followUpOn: r.followUpOn });
      }
    }
  } catch (e) {
    ctx.logger.error("quote.follow_up_claim_failed", { error: String(e).slice(0, 300) });
    if (claimed.length === 0) return out;
  }
  out.quotes = claimed.length;
  if (claimed.length === 0) return out;

  // One email per (shop, estimator).
  const groups = new Map<string, { orgId: string; userId: string; quotes: Claimed[] }>();
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
          on: memberNotifications.quoteFollowUp,
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
      const tz = tzFor.get(g.orgId) ?? null;
      const mail = followUpDigestEmail({
        appUrl: ctx.env.APP_URL,
        orgId: g.orgId,
        shopName: to.shopName ?? "your shop",
        today: todayFor.get(g.orgId) ?? utcToday,
        currency: to.currency,
        quotes: g.quotes.map((q) => ({
          id: q.id,
          quoteNumber: q.quoteNumber,
          revNumber: q.revNumber,
          customerCompany: q.customerCompany,
          customerContact: q.customerContact,
          customerEmail: q.customerEmail,
          headlineTotalCents: q.headlineTotalCents,
          sentDay: q.sentAt ? shopDay(q.sentAt, tz) : null,
          followUpOn: q.followUpOn,
          lastNote: q.lastNote,
          lastDay: q.lastAt === null ? null : shopDay(Number(q.lastAt), tz),
        })),
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
      log.warn("quote.follow_up_reminder_failed", {
        quotes: g.quotes.length,
        error: String(e)
          .replace(/[^\s@<>"']+@[^\s@<>"']+/g, "[address]")
          .slice(0, 300),
      });
    }
  }
  ctx.logger.info("quote.follow_up_reminders", out);
  return out;
}
