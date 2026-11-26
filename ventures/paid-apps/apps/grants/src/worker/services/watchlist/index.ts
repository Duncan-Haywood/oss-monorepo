// Funder watchlist: org (or platform-curated) pages we re-check politely for new grant opportunities.
import { and, desc, eq, inArray, isNull, ne, or } from "drizzle-orm";
import type { AppContext } from "../../context";
import {
  WATCH_SOURCE_KINDS,
  type WatchSourceKind,
  watchEvents,
  watchSources,
} from "../../db/schema/watchlist";
import { AppError, conflict, forbidden, notFound, tooManyRequests } from "../../lib/errors";
import { newId } from "../../lib/ids";
import { WebFetchError } from "../../ports/polite-fetcher";
import { normalizeUrl, parsePublicUrl } from "../imports";
import { audit } from "../privacy/audit";
import {
  type CheckResult,
  checkSource,
  snapshotKey,
  WATCH_LIMITS,
  type WatchSourceRow,
} from "./check";
import { watchFetcher } from "./fetch";

export {
  backoffHours,
  type CheckOutcome,
  type CheckResult,
  checkSource,
  runDueChecks,
  snapshotKey,
  WATCH_LIMITS,
  type WatchSourceRow,
} from "./check";
export { DETECT_PURPOSE } from "./detect";
export {
  ConditionalPoliteFetcher,
  fetchPageConditional,
  supportsConditional,
  watchFetcher,
} from "./fetch";
export { PLATFORM_SOURCES_SUGGESTED } from "./seed";

export const MAX_SOURCES_PER_ORG = 100;
export { WATCH_SOURCE_KINDS };

const unprocessable = (code: string, message: string) => new AppError(422, code, message);

/** Platform admins are configured by email in PLATFORM_ADMIN_EMAILS (comma-separated). */
export function isPlatformAdmin(env: { PLATFORM_ADMIN_EMAILS?: string }, email: string | null) {
  if (!email) return false;
  const list = (env.PLATFORM_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.trim().toLowerCase());
}

export function inferKind(url: URL): WatchSourceKind {
  return /(\.rss|\.atom|\/feed\/?|\/rss\/?|feed\.xml|rss\.xml|atom\.xml)$/i.test(url.pathname)
    ? "rss"
    : "rfp_page";
}

export function clampInterval(hours: number | undefined): number {
  const h = Math.round(hours ?? WATCH_LIMITS.defaultIntervalHours);
  return Math.max(WATCH_LIMITS.minIntervalHours, Math.min(WATCH_LIMITS.maxIntervalHours, h));
}

export type WatchSourceDto = Omit<WatchSourceRow, "etag" | "lastModified" | "contentHash"> & {
  scope: "org" | "platform";
  readOnly: boolean;
};

export function toDto(row: WatchSourceRow, opts: { platformAdmin?: boolean } = {}): WatchSourceDto {
  const { etag: _e, lastModified: _l, contentHash: _h, ...rest } = row;
  const platform = row.orgId === null;
  return {
    ...rest,
    scope: platform ? "platform" : "org",
    readOnly: platform && !opts.platformAdmin,
  };
}

/** The org's own sources plus platform-curated sources (read-only for the org). */
export async function listSources(ctx: AppContext, orgId: string): Promise<WatchSourceRow[]> {
  return ctx.db
    .select()
    .from(watchSources)
    .where(or(eq(watchSources.orgId, orgId), isNull(watchSources.orgId)))
    .orderBy(desc(watchSources.createdAt))
    .limit(500)
    .all();
}

/**
 * Loads a source visible to `orgId`. With `write`, platform sources need a platform admin.
 * Other orgs' sources are always 404.
 */
export async function getSourceForOrg(
  ctx: AppContext,
  orgId: string,
  id: string,
  opts: { write?: boolean; platformAdmin?: boolean } = {},
): Promise<WatchSourceRow> {
  const row = await ctx.db
    .select()
    .from(watchSources)
    .where(
      and(eq(watchSources.id, id), or(eq(watchSources.orgId, orgId), isNull(watchSources.orgId))),
    )
    .get();
  if (!row) throw notFound("Watch source");
  if (opts.write && row.orgId === null && !opts.platformAdmin) {
    throw forbidden("Platform-curated sources are read-only");
  }
  return row;
}

export interface CreateSourceInput {
  /** null = platform source (caller must have verified platform-admin rights). */
  orgId: string | null;
  /** Org the request came from (for audit) when creating a platform source. */
  actingOrgId: string;
  userId: string;
  url: string;
  label?: string | null;
  funderName?: string | null;
  kind?: WatchSourceKind;
  checkIntervalHours?: number;
}

export async function createSource(
  ctx: AppContext,
  input: CreateSourceInput,
): Promise<WatchSourceRow> {
  const parsed = parsePublicUrl(input.url); // SSRF guard → 400
  const url = normalizeUrl(parsed);
  const host = parsed.hostname.toLowerCase().replace(/\.$/, "");

  const dup = await ctx.db
    .select({ id: watchSources.id, orgId: watchSources.orgId })
    .from(watchSources)
    .where(
      and(
        eq(watchSources.url, url),
        input.orgId
          ? or(eq(watchSources.orgId, input.orgId), isNull(watchSources.orgId))
          : isNull(watchSources.orgId),
      ),
    )
    .get();
  if (dup) {
    throw conflict(
      dup.orgId === null
        ? "This page is already on the platform watchlist"
        : "This page is already on your watchlist",
    );
  }
  if (input.orgId) {
    const count = (
      await ctx.db
        .select({ id: watchSources.id })
        .from(watchSources)
        .where(eq(watchSources.orgId, input.orgId))
        .all()
    ).length;
    if (count >= MAX_SOURCES_PER_ORG) {
      throw unprocessable(
        "too_many_sources",
        `A watchlist can hold up to ${MAX_SOURCES_PER_ORG} pages`,
      );
    }
  }

  // robots.txt is checked before anything is stored.
  let allowed: boolean;
  try {
    allowed = await watchFetcher(ctx).robotsAllows(url);
  } catch (e) {
    if (e instanceof WebFetchError && e.code === "blocked_url") {
      throw new AppError(400, "bad_request", e.message);
    }
    throw unprocessable(
      "robots_unavailable",
      "We could not read this site's robots.txt right now, so we can't confirm automated checks are allowed. Try again later.",
    );
  }
  if (!allowed) {
    throw unprocessable(
      "robots_disallowed",
      "This site's robots.txt does not allow automated access to that page, so it can't be watched. Check the funder's page manually or import the RFP instead.",
    );
  }

  const now = ctx.now();
  const id = newId("job").replace("job_", "wch_");
  const row = {
    id,
    orgId: input.orgId,
    url,
    host,
    label: input.label?.trim() || null,
    funderName: input.funderName?.trim() || null,
    kind: input.kind ?? inferKind(parsed),
    status: "active" as const,
    checkIntervalHours: clampInterval(input.checkIntervalHours),
    nextCheckAt: null,
    createdBy: input.userId,
    createdAt: now,
    updatedAt: now,
  };
  await ctx.db.insert(watchSources).values(row);
  await audit(ctx, {
    orgId: input.actingOrgId,
    actorType: "user",
    actorId: input.userId,
    action: input.orgId ? "watchlist.source_added" : "watchlist.platform_source_added",
    targetType: "watch_source",
    targetId: id,
    metadata: { host, kind: row.kind },
  });
  const saved = await ctx.db.select().from(watchSources).where(eq(watchSources.id, id)).get();
  if (!saved) throw new Error("watch source insert failed");
  return saved;
}

export interface UpdateSourceInput {
  status?: "active" | "paused";
  checkIntervalHours?: number;
  label?: string | null;
  funderName?: string | null;
}

export async function updateSource(
  ctx: AppContext,
  orgId: string,
  id: string,
  patch: UpdateSourceInput,
  opts: { platformAdmin?: boolean; userId?: string } = {},
): Promise<WatchSourceRow> {
  const row = await getSourceForOrg(ctx, orgId, id, { write: true, ...opts });
  const set: Partial<typeof watchSources.$inferInsert> = { updatedAt: ctx.now() };
  if (patch.checkIntervalHours !== undefined) {
    set.checkIntervalHours = clampInterval(patch.checkIntervalHours);
  }
  if (patch.label !== undefined) set.label = patch.label?.trim() || null;
  if (patch.funderName !== undefined) set.funderName = patch.funderName?.trim() || null;
  if (patch.status === "paused") {
    set.status = "paused";
  } else if (patch.status === "active" && row.status !== "active") {
    // Resume (also from error / blocked_by_robots): due now; robots is re-checked on that run.
    Object.assign(set, {
      status: "active",
      consecutiveErrors: 0,
      lastError: null,
      nextCheckAt: null,
    });
  }
  await ctx.db
    .update(watchSources)
    .set(set)
    .where(and(eq(watchSources.id, row.id), rowScope(row)));
  if (patch.status && patch.status !== row.status) {
    await audit(ctx, {
      orgId,
      actorType: "user",
      actorId: opts.userId ?? null,
      action: patch.status === "paused" ? "watchlist.source_paused" : "watchlist.source_resumed",
      targetType: "watch_source",
      targetId: row.id,
    });
  }
  return getSourceForOrg(ctx, orgId, id);
}

const rowScope = (row: WatchSourceRow) =>
  row.orgId ? eq(watchSources.orgId, row.orgId) : isNull(watchSources.orgId);

export async function deleteSource(
  ctx: AppContext,
  orgId: string,
  id: string,
  opts: { platformAdmin?: boolean; userId?: string } = {},
): Promise<void> {
  const row = await getSourceForOrg(ctx, orgId, id, { write: true, ...opts });
  await ctx.db.delete(watchSources).where(and(eq(watchSources.id, row.id), rowScope(row)));
  try {
    const prefix = snapshotKey(row).replace(/latest\.txt$/, "");
    const listed = await ctx.env.FILES.list({ prefix, limit: 1000 });
    const keys = listed.objects.map((o) => o.key);
    if (keys.length) await ctx.env.FILES.delete(keys);
  } catch (e) {
    ctx.logger.warn("watchlist.snapshot_delete_failed", { sourceId: row.id, error: String(e) });
  }
  await audit(ctx, {
    orgId,
    actorType: "user",
    actorId: opts.userId ?? null,
    action: "watchlist.source_removed",
    targetType: "watch_source",
    targetId: row.id,
    metadata: { host: row.host },
  });
}

/** User-triggered check: at most once per source per 10 minutes, not while paused. */
export async function requestManualCheck(
  ctx: AppContext,
  orgId: string,
  id: string,
  opts: { platformAdmin?: boolean } = {},
): Promise<CheckResult> {
  const row = await getSourceForOrg(ctx, orgId, id, { write: true, ...opts });
  if (row.status === "paused") throw conflict("Resume this source before checking it");
  const now = ctx.now().getTime();
  const last = row.lastManualCheckAt?.getTime() ?? 0;
  if (now - last < WATCH_LIMITS.manualCooldownMs) {
    const wait = Math.ceil((last + WATCH_LIMITS.manualCooldownMs - now) / 60_000);
    throw tooManyRequests(`This page was checked recently. Try again in ${wait} minute(s).`);
  }
  const res = await checkSource(ctx, row.id, { manual: true });
  if (res.outcome === "host_busy") {
    throw tooManyRequests(
      `Another page on ${row.host} was just checked. Try again in ${res.retryAfterSeconds ?? 60} seconds.`,
    );
  }
  return res;
}

export type WatchEventRow = typeof watchEvents.$inferSelect;

/** The org's events plus non-error events of platform sources, newest first. */
export async function listEvents(
  ctx: AppContext,
  orgId: string,
  opts: { sourceId?: string; limit?: number } = {},
): Promise<(WatchEventRow & { source: { id: string; url: string; label: string | null } })[]> {
  const visible = or(
    eq(watchEvents.orgId, orgId),
    and(isNull(watchEvents.orgId), inArray(watchEvents.kind, ["changed", "opportunity_found"])),
  );
  const rows = await ctx.db
    .select({
      event: watchEvents,
      source: { id: watchSources.id, url: watchSources.url, label: watchSources.label },
    })
    .from(watchEvents)
    .innerJoin(watchSources, eq(watchSources.id, watchEvents.sourceId))
    .where(
      and(
        visible,
        or(eq(watchSources.orgId, orgId), isNull(watchSources.orgId)),
        opts.sourceId ? eq(watchEvents.sourceId, opts.sourceId) : ne(watchEvents.id, ""),
      ),
    )
    .orderBy(desc(watchEvents.createdAt), desc(watchEvents.id))
    .limit(Math.max(1, Math.min(opts.limit ?? 100, 200)))
    .all();
  return rows.map((r) => ({ ...r.event, source: r.source }));
}
