// In-app notifications (OWNER: notifications). notify() fans one event out to an org's members (one
// row per recipient) and never throws: a failed notification must never fail the step, job or
// request that triggered it. Every read/write below is scoped to (orgId, userId) of the caller.
// Email delivery is out of scope here (the digest/email work reads `notification_preferences.email`).
import { type MemberRole, ROLE_RANK } from "@shared/enums";
import {
  isSafeAppLink,
  NOTIFICATION_DEFAULTS,
  NOTIFICATION_KIND_LABELS,
  NOTIFICATION_KINDS,
  type NotificationDto,
  type NotificationKind,
  type NotificationListDto,
  type NotificationPreferenceDto,
  type NotificationSeverity,
} from "@shared/notifications";
import { and, count, desc, eq, inArray, isNull, lt, or } from "drizzle-orm";
import type { AppContext } from "../../context";
import { member } from "../../db/schema";
import { notificationPreferences, notifications } from "../../db/schema/notifications";
import { chunk, D1_BATCH_CHUNK, D1_IN_CHUNK } from "../../lib/chunk";
import { notFound } from "../../lib/errors";
import { newId } from "../../lib/ids";
import { forwardNotificationToIntegrations } from "../integrations/hook";
import { decodeCursor, encodeCursor } from "../privacy/audit-log";

export type NotificationRow = typeof notifications.$inferSelect;

/** Role groups (each includes the roles above it), or explicit user ids (must be org members). */
export type NotifyRecipients = "admins" | "editors" | "members" | string[];

export interface NotifyInput {
  orgId: string;
  recipients: NotifyRecipients;
  kind: NotificationKind;
  title: string;
  body?: string;
  /** App-relative path; an unsafe link is dropped (logged), the notification is still sent. */
  link?: string | null;
  severity?: NotificationSeverity;
  /** Idempotency key per event: notifying again with the same key creates nothing new. */
  dedupeKey?: string;
}

export interface NotifyResult {
  created: number;
}

/** The caller: requireOrg()'s tenant (orgId + userId). */
export interface NotificationScope {
  orgId: string;
  userId: string;
}

export const MAX_TITLE = 200;
export const MAX_BODY = 1_000;
const DEFAULT_PAGE = 20;
const MAX_PAGE = 100;

const MIN_ROLE: Record<Exclude<NotifyRecipients, string[]>, MemberRole | null> = {
  admins: "admin",
  editors: "editor",
  members: null,
};

const rolesAtLeast = (min: MemberRole) =>
  (Object.keys(ROLE_RANK) as MemberRole[]).filter((r) => ROLE_RANK[r] >= ROLE_RANK[min]);

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Members of `orgId` matching `recipients`, with their in-app preference for `kind`. */
async function resolveRecipients(
  ctx: AppContext,
  orgId: string,
  recipients: NotifyRecipients,
  kind: NotificationKind,
): Promise<string[]> {
  const select = (where: ReturnType<typeof and>) =>
    ctx.db
      .select({ userId: member.userId, inApp: notificationPreferences.inApp })
      .from(member)
      .leftJoin(
        notificationPreferences,
        and(
          eq(notificationPreferences.userId, member.userId),
          eq(notificationPreferences.orgId, orgId),
          eq(notificationPreferences.kind, kind),
        ),
      )
      .where(where)
      .all();

  let rows: { userId: string; inApp: boolean | null }[];
  if (Array.isArray(recipients)) {
    const ids = [...new Set(recipients.filter((id) => typeof id === "string" && id))];
    rows = (
      await Promise.all(
        chunk(ids, D1_IN_CHUNK).map((part) =>
          select(and(eq(member.organizationId, orgId), inArray(member.userId, part))),
        ),
      )
    ).flat();
  } else {
    const min = MIN_ROLE[recipients];
    rows = await select(
      min
        ? and(eq(member.organizationId, orgId), inArray(member.role, rolesAtLeast(min)))
        : eq(member.organizationId, orgId),
    );
  }
  const fallback = NOTIFICATION_DEFAULTS[kind].inApp;
  return [...new Set(rows.filter((r) => (r.inApp ?? fallback) !== false).map((r) => r.userId))];
}

async function fanOut(ctx: AppContext, input: NotifyInput): Promise<NotifyResult> {
  const { orgId, kind } = input;
  let link: string | null = input.link ?? null;
  if (link !== null && !isSafeAppLink(link)) {
    ctx.logger.warn("notifications.unsafe_link_dropped", { orgId, kind });
    link = null;
  }
  const userIds = await resolveRecipients(ctx, orgId, input.recipients, kind);
  if (userIds.length === 0) return { created: 0 };

  const now = ctx.now();
  const base = {
    orgId,
    kind,
    title: clip(input.title.trim() || NOTIFICATION_KIND_LABELS[kind], MAX_TITLE),
    body: clip((input.body ?? "").trim(), MAX_BODY),
    link,
    severity: input.severity ?? "info",
    dedupeKey: input.dedupeKey ?? null,
    createdAt: now,
  };
  // One statement per recipient (11 bound params each; a multi-row insert would hit D1's
  // 100-parameter cap at 10 recipients), batched per chunk.
  const inserts = userIds.map((userId) =>
    ctx.db
      .insert(notifications)
      .values({ id: newId("ntf"), userId, ...base })
      .onConflictDoNothing()
      .returning({ id: notifications.id }),
  );
  let created = 0;
  for (const part of chunk(inserts, D1_BATCH_CHUNK)) {
    const [first, ...rest] = part;
    if (!first) continue;
    const results = await ctx.db.batch([first, ...rest]);
    for (const r of results) created += r.length;
  }
  return { created };
}

/**
 * Notify an org's members. Role groups: "admins" = owner+admin, "editors" = owner+admin+editor,
 * "members" = everyone; an explicit list is filtered to current members. Members who turned this
 * kind off in-app get nothing. Never throws (failures are logged and reported as `created: 0`).
 */
export async function notify(ctx: AppContext, input: NotifyInput): Promise<NotifyResult> {
  // Slack / Teams fan-out (titles + links only; never throws). Independent of in-app recipients.
  await forwardNotificationToIntegrations(ctx, input);
  try {
    return await fanOut(ctx, input);
  } catch (e) {
    try {
      ctx.logger.warn("notifications.notify_failed", {
        orgId: input.orgId,
        kind: input.kind,
        error: String(e),
      });
    } catch {
      // Logging is best-effort too: the caller's work must never fail because of a notification.
    }
    return { created: 0 };
  }
}

export function toNotificationDto(r: NotificationRow): NotificationDto {
  return {
    id: r.id,
    kind: r.kind,
    title: r.title,
    body: r.body,
    link: isSafeAppLink(r.link) ? r.link : null,
    severity: r.severity,
    readAt: r.readAt ? r.readAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
  };
}

const own = (s: NotificationScope) =>
  and(eq(notifications.userId, s.userId), eq(notifications.orgId, s.orgId));

/** The caller's notifications, newest first, keyset-paginated by (createdAt, id). */
export async function listForUser(
  ctx: AppContext,
  scope: NotificationScope,
  opts: { unreadOnly?: boolean; cursor?: string; limit?: number } = {},
): Promise<NotificationListDto> {
  const limit = Math.min(Math.max(opts.limit ?? DEFAULT_PAGE, 1), MAX_PAGE);
  const cur = opts.cursor ? decodeCursor(opts.cursor) : null;
  const rows = await ctx.db
    .select()
    .from(notifications)
    .where(
      and(
        own(scope),
        opts.unreadOnly ? isNull(notifications.readAt) : undefined,
        cur
          ? or(
              lt(notifications.createdAt, new Date(cur.t)),
              and(eq(notifications.createdAt, new Date(cur.t)), lt(notifications.id, cur.id)),
            )
          : undefined,
      ),
    )
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(limit + 1)
    .all();
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  return {
    items: items.map(toNotificationDto),
    nextCursor:
      rows.length > limit && last
        ? encodeCursor({ t: last.createdAt.getTime(), id: last.id })
        : null,
  };
}

export async function unreadCount(ctx: AppContext, scope: NotificationScope): Promise<number> {
  const row = await ctx.db
    .select({ n: count() })
    .from(notifications)
    .where(and(own(scope), isNull(notifications.readAt)))
    .get();
  return Number(row?.n ?? 0);
}

/** Marks one of the caller's notifications read (idempotent). 404 for anyone else's id. */
export async function markRead(
  ctx: AppContext,
  scope: NotificationScope,
  id: string,
): Promise<NotificationDto> {
  const where = and(eq(notifications.id, id), own(scope));
  await ctx.db
    .update(notifications)
    .set({ readAt: ctx.now() })
    .where(and(where, isNull(notifications.readAt)));
  const row = await ctx.db.select().from(notifications).where(where).get();
  if (!row) throw notFound("Notification");
  return toNotificationDto(row);
}

export async function markAllRead(
  ctx: AppContext,
  scope: NotificationScope,
): Promise<{ updated: number }> {
  const res = await ctx.db
    .update(notifications)
    .set({ readAt: ctx.now() })
    .where(and(own(scope), isNull(notifications.readAt)))
    .run();
  return { updated: res.meta.changes ?? 0 };
}

/** Every kind with the caller's choice, or the default when they never changed it. */
export async function getPreferences(
  ctx: AppContext,
  scope: NotificationScope,
): Promise<NotificationPreferenceDto[]> {
  const rows = await ctx.db
    .select({
      kind: notificationPreferences.kind,
      inApp: notificationPreferences.inApp,
      email: notificationPreferences.email,
    })
    .from(notificationPreferences)
    .where(
      and(
        eq(notificationPreferences.userId, scope.userId),
        eq(notificationPreferences.orgId, scope.orgId),
      ),
    )
    .all();
  const byKind = new Map(rows.map((r) => [r.kind, r]));
  return NOTIFICATION_KINDS.map((kind) => {
    const r = byKind.get(kind);
    const d = NOTIFICATION_DEFAULTS[kind];
    return {
      kind,
      label: NOTIFICATION_KIND_LABELS[kind],
      inApp: r?.inApp ?? d.inApp,
      email: r?.email ?? d.email,
    };
  });
}

export interface PreferencePatch {
  kind: NotificationKind;
  inApp?: boolean;
  email?: boolean;
}

/** Upserts the caller's choices (unspecified fields keep their current value). */
export async function updatePreferences(
  ctx: AppContext,
  scope: NotificationScope,
  patches: PreferencePatch[],
): Promise<NotificationPreferenceDto[]> {
  const current = new Map((await getPreferences(ctx, scope)).map((p) => [p.kind, p]));
  const merged = new Map<NotificationKind, { inApp: boolean; email: boolean }>();
  for (const p of patches) {
    const base = merged.get(p.kind) ?? current.get(p.kind) ?? NOTIFICATION_DEFAULTS[p.kind];
    merged.set(p.kind, { inApp: p.inApp ?? base.inApp, email: p.email ?? base.email });
  }
  const now = ctx.now();
  const upserts = [...merged].map(([kind, v]) =>
    ctx.db
      .insert(notificationPreferences)
      .values({ userId: scope.userId, orgId: scope.orgId, kind, ...v, updatedAt: now })
      .onConflictDoUpdate({
        target: [
          notificationPreferences.userId,
          notificationPreferences.orgId,
          notificationPreferences.kind,
        ],
        set: { ...v, updatedAt: now },
      }),
  );
  const [first, ...rest] = upserts;
  if (first) await ctx.db.batch([first, ...rest]);
  return getPreferences(ctx, scope);
}
