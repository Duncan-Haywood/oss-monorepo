// A subscribable calendar link for the affirmation due dates: the same file as
// GET /affirmations/calendar.ics (affirmation dates, policy review dates, training refresher dates, suppliers' current-through dates, controlled documents' review dates, planned internal audits and corrective-action dates), served from /api/calendar/<token>.ics without a session, so a
// calendar app can refresh it on its own and a new affirmation moves the dates with no re-download.
//
// The token is 32 random bytes; only its SHA-256 is stored, so the link is shown once, when an
// admin makes it. Resetting replaces the hash (the old link stops at once) and turning it off
// deletes the row. Anyone holding the link can read the organization's due dates (dates, the
// eCFR basis, how many people a training date covers, how many suppliers a current-through date covers, how many documents, audits or corrective actions fall on a date; no names, titles or scores), which the page says before an admin makes one.
import {
  CALENDAR_TOKEN_PREFIX,
  type CalendarFeedStatus,
  isCalendarToken,
  renderAffirmationCalendar,
} from "@shared/affirmation-ics";
import { eq } from "drizzle-orm";
import type { AppContext } from "../../context";
import { affirmationCalendarFeed, organization, user } from "../../db/schema";
import { sha256Hex } from "../../lib/hash";
import { audit } from "../audit";
import { documentReviewDatesFor } from "../documents";
import { qualityDueDatesFor } from "../internal-audits";
import { trainingDueDatesFor } from "../personnel";
import { policyReviewDates } from "../security-policies";
import { supplierDueDatesFor } from "../suppliers";
import { listAffirmations } from "./index";

/** A fetch is recorded at most this often, so a calendar polling every few minutes costs no writes. */
const FETCH_STAMP_MS = 60 * 60 * 1000;

function newToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const b64 = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `${CALENDAR_TOKEN_PREFIX}${b64}`;
}

export const feedUrl = (appUrl: string, token: string) =>
  `${appUrl.replace(/\/+$/, "")}/api/calendar/${token}.ics`;

export async function calendarFeedStatus(
  ctx: AppContext,
  orgId: string,
): Promise<CalendarFeedStatus> {
  const row = await ctx.db
    .select({ f: affirmationCalendarFeed, createdByName: user.name })
    .from(affirmationCalendarFeed)
    .leftJoin(user, eq(user.id, affirmationCalendarFeed.createdBy))
    .where(eq(affirmationCalendarFeed.orgId, orgId))
    .get();
  return {
    on: Boolean(row),
    createdAt: row?.f.createdAt.toISOString() ?? null,
    createdByName: row?.createdByName ?? null,
    lastFetchedAt: row?.f.lastFetchedAt?.toISOString() ?? null,
    url: null,
  };
}

/** Makes the link, or replaces it (the old one stops working). Answers with the new link once. */
export async function resetCalendarFeed(
  ctx: AppContext,
  orgId: string,
  actorUserId: string,
): Promise<CalendarFeedStatus> {
  const token = newToken();
  const tokenHash = await sha256Hex(token);
  const now = ctx.now();
  const had = (await calendarFeedStatus(ctx, orgId)).on;
  await ctx.db
    .insert(affirmationCalendarFeed)
    .values({ orgId, tokenHash, createdBy: actorUserId, createdAt: now, lastFetchedAt: null })
    .onConflictDoUpdate({
      target: affirmationCalendarFeed.orgId,
      set: { tokenHash, createdBy: actorUserId, createdAt: now, lastFetchedAt: null },
    });
  await audit(ctx, {
    orgId,
    actorUserId,
    action: had ? "calendar_feed.reset" : "calendar_feed.create",
    targetType: "calendar_feed",
  });
  return { ...(await calendarFeedStatus(ctx, orgId)), url: feedUrl(ctx.env.APP_URL, token) };
}

export async function deleteCalendarFeed(ctx: AppContext, orgId: string, actorUserId: string) {
  const gone = await ctx.db
    .delete(affirmationCalendarFeed)
    .where(eq(affirmationCalendarFeed.orgId, orgId))
    .returning({ orgId: affirmationCalendarFeed.orgId });
  if (gone.length) {
    await audit(ctx, {
      orgId,
      actorUserId,
      action: "calendar_feed.delete",
      targetType: "calendar_feed",
    });
  }
  return calendarFeedStatus(ctx, orgId);
}

/** The calendar text for a token, or null for a malformed, unknown or revoked one. */
export async function calendarForToken(ctx: AppContext, token: string): Promise<string | null> {
  if (!isCalendarToken(token)) return null;
  const tokenHash = await sha256Hex(token);
  const row = await ctx.db
    .select({
      orgId: affirmationCalendarFeed.orgId,
      lastFetchedAt: affirmationCalendarFeed.lastFetchedAt,
      orgName: organization.name,
    })
    .from(affirmationCalendarFeed)
    .innerJoin(organization, eq(organization.id, affirmationCalendarFeed.orgId))
    .where(eq(affirmationCalendarFeed.tokenHash, tokenHash))
    .get();
  if (!row) return null;
  const now = ctx.now();
  if (!row.lastFetchedAt || now.getTime() - row.lastFetchedAt.getTime() >= FETCH_STAMP_MS) {
    await ctx.db
      .update(affirmationCalendarFeed)
      .set({ lastFetchedAt: now })
      .where(eq(affirmationCalendarFeed.orgId, row.orgId));
  }
  const [data, policyReviews, trainingDue, supplierDue, documentReviews, qualityDue] =
    await Promise.all([
      listAffirmations(ctx, row.orgId),
      policyReviewDates(ctx, row.orgId),
      trainingDueDatesFor(ctx, row.orgId),
      supplierDueDatesFor(ctx, row.orgId),
      documentReviewDatesFor(ctx, row.orgId),
      qualityDueDatesFor(ctx, row.orgId),
    ]);
  return renderAffirmationCalendar({
    orgId: row.orgId,
    orgName: row.orgName,
    schedules: data.schedules,
    policyReviews,
    trainingDue,
    supplierDue,
    documentReviews,
    qualityDue,
    now,
  });
}
