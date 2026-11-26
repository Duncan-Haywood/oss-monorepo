// Calendar feeds (OWNER: calendar): feed tokens (create / list / revoke / resolve), per-org feed
// settings, and the events a feed or a single-opportunity download contains.
//
// What goes into a feed is deliberately thin: anyone holding the URL can read it, so events carry
// grant titles, dates and a link back to the app — never drafts, notes, flags or (unless the org
// opts in) amounts.
import {
  type CalendarScope,
  type CalendarSettingsDto,
  type CalendarTokenDto,
  type CreatedCalendarTokenDto,
  toWebcal,
} from "@shared/api/calendar";
import {
  type ApplicationStatus,
  type FollowupKind,
  type MemberRole,
  ROLE_RANK,
} from "@shared/enums";
import { and, asc, count, eq, gte, isNotNull, isNull, lt, ne, notInArray, or } from "drizzle-orm";
import type { AppContext } from "../../context";
import {
  applications,
  followups,
  member,
  opportunities,
  opportunityMatches,
  organization,
  user,
} from "../../db/schema";
import { calendarSettings, calendarTokens } from "../../db/schema/calendar";
import { AppError, conflict, notFound } from "../../lib/errors";
import { sha256Hex } from "../../lib/hash";
import { newId } from "../../lib/ids";
import { roleRequired } from "../../middleware/tenant";
import type { Tenant } from "../../types";
import { getOpportunity, visibleTo } from "../discovery";
import { audit } from "../privacy/audit";
import { buildIcs, type IcsEvent, isDateOnly } from "./ics";

export * from "./ics";

/** 32 random bytes, base64url without padding = 43 characters. */
export const CALENDAR_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
/** Members below this role can only create "mine" feeds. A demoted member's org feed stops working. */
export const ORG_FEED_MIN_ROLE: MemberRole = "editor";
/** Reviews waiting appear in "mine" feeds of members who can review. */
const REVIEWER_ROLE: MemberRole = "reviewer";
export const MAX_ACTIVE_TOKENS_PER_USER = 10;
/** Deadlines older than this are left out of feeds. Pending follow-ups stay until done. */
const PAST_WINDOW_DAYS = 30;
export const ALARM_DAYS_BEFORE = 3;
/** Review should be done this many days before the deadline. */
const REVIEW_LEAD_DAYS = 3;
const ROW_LIMIT = 500;
const TITLE_MAX = 200;
export const FEED_CACHE_SECONDS = 15 * 60;
const TOUCH_EVERY_MS = 15 * 60_000;

/** Not "active": finished, withdrawn or failed applications drop out of feeds. */
const INACTIVE_APP_STATUSES: ApplicationStatus[] = [
  "submitted",
  "awarded",
  "declined",
  "withdrawn",
  "failed",
];
const REVIEW_STATUSES: ApplicationStatus[] = ["in_review", "changes_requested"];

const FOLLOWUP_LABELS: Record<FollowupKind, string> = {
  deadline_reminder: "Deadline reminder",
  status_check: "Status check",
  report_due: "Report due",
  thank_you: "Thank-you note",
  resubmission: "Resubmission",
  custom: "Follow-up",
};

const rank = (r: MemberRole) => ROLE_RANK[r] ?? 0;
const asRole = (r: string): MemberRole => (r in ROLE_RANK ? (r as MemberRole) : "viewer");

// ---------------------------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------------------------

export function generateCalendarToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export const hashCalendarToken = (token: string) => sha256Hex(token);

/** APP_URL keeps its path: https://marisstella.app/grants -> .../grants/api/calendar/<token>.ics */
export function calendarFeedUrl(appUrl: string, token: string): string {
  return `${appUrl.replace(/\/+$/, "")}/api/calendar/${token}.ics`;
}

type TokenRow = typeof calendarTokens.$inferSelect;

function toDto(row: TokenRow, viewerId: string, userName: string | null): CalendarTokenDto {
  return {
    id: row.id,
    scope: row.scope,
    userId: row.userId,
    userName,
    mine: row.userId === viewerId,
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt ? row.lastUsedAt.toISOString() : null,
  };
}

export async function createCalendarToken(
  ctx: AppContext,
  tenant: Tenant,
  scope: CalendarScope,
  requestId?: string,
): Promise<CreatedCalendarTokenDto> {
  const { orgId, userId } = tenant;
  if (scope === "org" && rank(tenant.role) < rank(ORG_FEED_MIN_ROLE)) {
    throw roleRequired(ORG_FEED_MIN_ROLE);
  }
  const active = await ctx.db
    .select({ n: count() })
    .from(calendarTokens)
    .where(
      and(
        eq(calendarTokens.orgId, orgId),
        eq(calendarTokens.userId, userId),
        isNull(calendarTokens.revokedAt),
      ),
    )
    .get();
  if ((active?.n ?? 0) >= MAX_ACTIVE_TOKENS_PER_USER) {
    throw conflict(
      `You already have ${MAX_ACTIVE_TOKENS_PER_USER} calendar feeds. Revoke one you no longer use first.`,
    );
  }
  const token = generateCalendarToken();
  const [row] = await ctx.db
    .insert(calendarTokens)
    .values({
      id: newId("cal"),
      orgId,
      userId,
      tokenHash: await hashCalendarToken(token),
      scope,
      createdAt: ctx.now(),
    })
    .returning();
  if (!row) throw new AppError(500, "internal_error", "Could not create the calendar feed");
  await audit(ctx, {
    orgId,
    actorType: "user",
    actorId: userId,
    requestId,
    action: "calendar_token.created",
    targetType: "calendar_token",
    targetId: row.id,
    metadata: { scope },
  });
  const me = await ctx.db.select({ name: user.name }).from(user).where(eq(user.id, userId)).get();
  const url = calendarFeedUrl(ctx.env.APP_URL, token);
  return { token: toDto(row, userId, me?.name ?? null), url, webcalUrl: toWebcal(url) };
}

/** Active feeds: the caller's own; admins and owners see every member's. Never includes secrets. */
export async function listCalendarTokens(
  ctx: AppContext,
  tenant: Tenant,
): Promise<CalendarTokenDto[]> {
  const conds = [eq(calendarTokens.orgId, tenant.orgId), isNull(calendarTokens.revokedAt)];
  if (rank(tenant.role) < rank("admin")) conds.push(eq(calendarTokens.userId, tenant.userId));
  const rows = await ctx.db
    .select({ t: calendarTokens, userName: user.name })
    .from(calendarTokens)
    .leftJoin(user, eq(user.id, calendarTokens.userId))
    .where(and(...conds))
    .orderBy(asc(calendarTokens.createdAt))
    .limit(ROW_LIMIT)
    .all();
  return rows.map((r) => toDto(r.t, tenant.userId, r.userName));
}

/** Revoke your own feed (admins: anyone's). Unknown, foreign or already-revoked ids are a 404. */
export async function revokeCalendarToken(
  ctx: AppContext,
  tenant: Tenant,
  id: string,
  requestId?: string,
): Promise<void> {
  const row = await ctx.db
    .select()
    .from(calendarTokens)
    .where(
      and(
        eq(calendarTokens.id, id),
        eq(calendarTokens.orgId, tenant.orgId),
        isNull(calendarTokens.revokedAt),
      ),
    )
    .get();
  const canRevoke = row && (row.userId === tenant.userId || rank(tenant.role) >= rank("admin"));
  if (!row || !canRevoke) throw notFound("Calendar feed");
  await ctx.db
    .update(calendarTokens)
    .set({ revokedAt: ctx.now() })
    .where(and(eq(calendarTokens.id, row.id), eq(calendarTokens.orgId, tenant.orgId)));
  await audit(ctx, {
    orgId: tenant.orgId,
    actorType: "user",
    actorId: tenant.userId,
    requestId,
    action: "calendar_token.revoked",
    targetType: "calendar_token",
    targetId: row.id,
    metadata: { scope: row.scope, ownerUserId: row.userId },
  });
}

export interface ResolvedFeed {
  tokenId: string;
  orgId: string;
  userId: string;
  scope: CalendarScope;
  role: MemberRole;
}

/**
 * The live feed behind a token hash, or null (→ 404) when it is unknown, revoked, its owner has
 * left the org, or (org feeds) the owner no longer has the role needed to create one.
 */
export async function resolveCalendarToken(
  ctx: AppContext,
  tokenHash: string,
): Promise<ResolvedFeed | null> {
  const row = await ctx.db
    .select({ t: calendarTokens, role: member.role })
    .from(calendarTokens)
    .innerJoin(
      member,
      and(
        eq(member.organizationId, calendarTokens.orgId),
        eq(member.userId, calendarTokens.userId),
      ),
    )
    .where(and(eq(calendarTokens.tokenHash, tokenHash), isNull(calendarTokens.revokedAt)))
    .get();
  if (!row) return null;
  const role = asRole(row.role);
  if (row.t.scope === "org" && rank(role) < rank(ORG_FEED_MIN_ROLE)) return null;
  return { tokenId: row.t.id, orgId: row.t.orgId, userId: row.t.userId, scope: row.t.scope, role };
}

/** Record use, at most once per 15 minutes per feed (calendar apps poll). */
export async function touchCalendarToken(ctx: AppContext, tokenId: string): Promise<void> {
  const now = ctx.now();
  await ctx.db
    .update(calendarTokens)
    .set({ lastUsedAt: now })
    .where(
      and(
        eq(calendarTokens.id, tokenId),
        or(
          isNull(calendarTokens.lastUsedAt),
          lt(calendarTokens.lastUsedAt, new Date(now.getTime() - TOUCH_EVERY_MS)),
        ),
      ),
    );
}

// ---------------------------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------------------------

export async function getCalendarSettings(
  ctx: AppContext,
  orgId: string,
): Promise<CalendarSettingsDto> {
  const row = await ctx.db
    .select({ includeAmounts: calendarSettings.includeAmounts })
    .from(calendarSettings)
    .where(eq(calendarSettings.orgId, orgId))
    .get();
  return { includeAmounts: row?.includeAmounts ?? false };
}

export async function updateCalendarSettings(
  ctx: AppContext,
  tenant: Tenant,
  patch: CalendarSettingsDto,
  requestId?: string,
): Promise<CalendarSettingsDto> {
  const { orgId, userId } = tenant;
  await ctx.db
    .insert(calendarSettings)
    .values({ orgId, includeAmounts: patch.includeAmounts, updatedBy: userId })
    .onConflictDoUpdate({
      target: calendarSettings.orgId,
      set: { includeAmounts: patch.includeAmounts, updatedBy: userId, updatedAt: ctx.now() },
    });
  await audit(ctx, {
    orgId,
    actorType: "user",
    actorId: userId,
    requestId,
    action: "calendar_settings.updated",
    targetType: "calendar_settings",
    targetId: orgId,
    metadata: { includeAmounts: patch.includeAmounts },
  });
  return getCalendarSettings(ctx, orgId);
}

// ---------------------------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------------------------

const usd = (cents: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);

const clip = (s: string) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > TITLE_MAX ? `${t.slice(0, TITLE_MAX - 1)}…` : t;
};

const DAY_MS = 86_400_000;

interface EventCtx {
  orgId: string;
  /** APP_URL without a trailing slash (origin + base path). */
  appBase: string;
  uidHost: string;
  includeAmounts: boolean;
}

/**
 * The host part of event UIDs. Calendar clients match events by UID, so it must not change when the
 * app moves: production moved from grants.marisstella.app to marisstella.app/grants on 2026-11-24 and
 * keeps the old host here, so subscribers don't see every deadline twice.
 */
export function calendarUidHost(appUrl: string): string {
  const host = new URL(appUrl).hostname;
  return host === "marisstella.app" ? "grants.marisstella.app" : host;
}

function eventCtx(ctx: AppContext, orgId: string, includeAmounts: boolean): EventCtx {
  const u = new URL(ctx.env.APP_URL);
  return {
    orgId,
    appBase: `${u.origin}${u.pathname.replace(/\/+$/, "")}`,
    uidHost: calendarUidHost(ctx.env.APP_URL),
    includeAmounts,
  };
}

const appLink = (e: EventCtx, path: string) =>
  `${e.appBase}/orgs/${encodeURIComponent(e.orgId)}${path}`;

/** A deadline (all-day when stored without a time) with a reminder 3 days before. */
function deadlineEvent(e: EventCtx, uid: string, title: string, at: Date, link: string): IcsEvent {
  const summary = `Deadline: ${title}`;
  return {
    uid: `${uid}@${e.uidHost}`,
    summary,
    description: link,
    url: link,
    start: at,
    allDay: isDateOnly(at),
    alarm: { daysBefore: ALARM_DAYS_BEFORE, description: summary },
  };
}

function plainEvent(e: EventCtx, uid: string, summary: string, at: Date, link: string): IcsEvent {
  return {
    uid: `${uid}@${e.uidHost}`,
    summary,
    description: link,
    url: link,
    start: at,
    allDay: isDateOnly(at),
  };
}

export interface FeedQuery {
  orgId: string;
  userId: string;
  scope: CalendarScope;
  role: MemberRole;
}

/**
 * Events for a feed, every query scoped to `orgId`:
 * - deadlines of active applications ("mine": ones I created)
 * - deadlines of shortlisted matches without an application yet (org feeds only)
 * - pending follow-ups incl. report_due (deadline reminders are skipped: the deadline itself is
 *   in the feed with an alarm) ("mine": follow-ups on my applications)
 * - reviews waiting, due 3 days before the deadline ("mine": if I can review)
 */
export async function collectFeedEvents(ctx: AppContext, q: FeedQuery): Promise<IcsEvent[]> {
  const { orgId } = q;
  const now = ctx.now();
  const cutoff = new Date(now.getTime() - PAST_WINDOW_DAYS * DAY_MS);
  const { includeAmounts } = await getCalendarSettings(ctx, orgId);
  const e = eventCtx(ctx, orgId, includeAmounts);
  const mine = q.scope === "mine";
  const events: IcsEvent[] = [];

  const apps = await ctx.db
    .select({
      id: applications.id,
      status: applications.status,
      deadline: applications.deadline,
      requestedAmountCents: applications.requestedAmountCents,
      createdBy: applications.createdBy,
      opportunityId: applications.opportunityId,
      title: opportunities.title,
      closeDate: opportunities.closeDate,
    })
    .from(applications)
    .innerJoin(
      opportunities,
      and(eq(opportunities.id, applications.opportunityId), visibleTo(orgId)),
    )
    .where(
      and(eq(applications.orgId, orgId), notInArray(applications.status, INACTIVE_APP_STATUSES)),
    )
    .limit(ROW_LIMIT)
    .all();

  const appliedOpportunities = new Set<string>();
  const canReview = rank(q.role) >= rank(REVIEWER_ROLE);
  for (const a of apps) {
    appliedOpportunities.add(a.opportunityId);
    const deadline = a.deadline ?? a.closeDate;
    if (!deadline || deadline < cutoff) continue;
    const title = clip(a.title);
    const link = appLink(e, `/applications/${encodeURIComponent(a.id)}`);
    if (!mine || a.createdBy === q.userId) {
      const amount =
        e.includeAmounts && a.requestedAmountCents
          ? ` (${usd(a.requestedAmountCents)} requested)`
          : "";
      events.push(deadlineEvent(e, `deadline-${a.id}`, `${title}${amount}`, deadline, link));
    }
    if (REVIEW_STATUSES.includes(a.status) && (!mine || canReview)) {
      const due = new Date(deadline.getTime() - REVIEW_LEAD_DAYS * DAY_MS);
      events.push({
        ...plainEvent(e, `review-${a.id}`, `Review due: ${title}`, due, link),
        allDay: true,
      });
    }
  }

  if (!mine) {
    const matches = await ctx.db
      .select({
        id: opportunityMatches.id,
        opportunityId: opportunities.id,
        title: opportunities.title,
        closeDate: opportunities.closeDate,
        awardCeilingCents: opportunities.awardCeilingCents,
      })
      .from(opportunityMatches)
      .innerJoin(
        opportunities,
        and(eq(opportunities.id, opportunityMatches.opportunityId), visibleTo(orgId)),
      )
      .where(
        and(
          eq(opportunityMatches.orgId, orgId),
          eq(opportunityMatches.status, "shortlisted"),
          isNotNull(opportunities.closeDate),
          gte(opportunities.closeDate, cutoff),
        ),
      )
      .limit(ROW_LIMIT)
      .all();
    for (const m of matches) {
      if (!m.closeDate || appliedOpportunities.has(m.opportunityId)) continue;
      const amount =
        e.includeAmounts && m.awardCeilingCents ? ` (up to ${usd(m.awardCeilingCents)})` : "";
      const link = appLink(e, `/opportunities/${encodeURIComponent(m.opportunityId)}`);
      events.push(
        deadlineEvent(e, `match-${m.id}`, `${clip(m.title)}${amount}`, m.closeDate, link),
      );
    }
  }

  const fups = await ctx.db
    .select({
      id: followups.id,
      kind: followups.kind,
      title: followups.title,
      dueAt: followups.dueAt,
      applicationId: applications.id,
      createdBy: applications.createdBy,
      grantTitle: opportunities.title,
    })
    .from(followups)
    .leftJoin(
      applications,
      and(eq(applications.id, followups.applicationId), eq(applications.orgId, orgId)),
    )
    .leftJoin(
      opportunities,
      and(eq(opportunities.id, applications.opportunityId), visibleTo(orgId)),
    )
    .where(
      and(
        eq(followups.orgId, orgId),
        eq(followups.status, "pending"),
        ne(followups.kind, "deadline_reminder"),
      ),
    )
    .orderBy(asc(followups.dueAt))
    .limit(ROW_LIMIT)
    .all();
  for (const f of fups) {
    if (mine && (!f.applicationId || f.createdBy !== q.userId)) continue;
    const subject = f.kind === "custom" || !f.grantTitle ? f.title : f.grantTitle;
    const link = f.applicationId
      ? appLink(e, `/applications/${encodeURIComponent(f.applicationId)}`)
      : appLink(e, "/submissions");
    events.push(
      plainEvent(
        e,
        `followup-${f.id}`,
        `${FOLLOWUP_LABELS[f.kind]}: ${clip(subject)}`,
        f.dueAt,
        link,
      ),
    );
  }

  return events.sort((a, b) => a.start.getTime() - b.start.getTime() || (a.uid < b.uid ? -1 : 1));
}

const PROD_ID = "-//Grant Autopilot//Calendar feed//EN";

export async function buildFeedIcs(ctx: AppContext, feed: ResolvedFeed): Promise<string> {
  const org = await ctx.db
    .select({ name: organization.name })
    .from(organization)
    .where(eq(organization.id, feed.orgId))
    .get();
  const events = await collectFeedEvents(ctx, feed);
  const label = feed.scope === "mine" ? "My grant dates" : "Grant dates";
  return buildIcs({
    prodId: PROD_ID,
    name: org ? `${label} – ${org.name}` : label,
    refreshMinutes: 60,
    dtstamp: ctx.now(),
    events,
  });
}

/** One opportunity's deadline as a downloadable .ics (session-authenticated, org-visible only). */
export async function opportunityDeadlineIcs(
  ctx: AppContext,
  orgId: string,
  opportunityId: string,
): Promise<{ ics: string; filename: string }> {
  const opp = await getOpportunity(ctx, orgId, opportunityId);
  if (!opp.closeDate) {
    throw new AppError(409, "no_deadline", "This opportunity has no announced deadline yet");
  }
  const { includeAmounts } = await getCalendarSettings(ctx, orgId);
  const e = eventCtx(ctx, orgId, includeAmounts);
  const amount =
    includeAmounts && opp.awardCeilingCents ? ` (up to ${usd(opp.awardCeilingCents)})` : "";
  const link = appLink(e, `/opportunities/${encodeURIComponent(opp.id)}`);
  const event = deadlineEvent(
    e,
    `opportunity-${opp.id}-${orgId}`,
    `${clip(opp.title)}${amount}`,
    opp.closeDate,
    link,
  );
  const slug =
    opp.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "grant";
  return {
    ics: buildIcs({ prodId: PROD_ID, dtstamp: ctx.now(), events: [event] }),
    filename: `deadline-${slug}.ics`,
  };
}
