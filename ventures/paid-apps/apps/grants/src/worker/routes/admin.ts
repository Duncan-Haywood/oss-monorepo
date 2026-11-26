// OWNER: platform admin console — /api/admin/* (mounted after sessionMiddleware).
// Everything here is cross-tenant METADATA for operators: counts, spend, statuses, settings, audit.
// Tenant content (document text, chunks, facts, interview turns, application versions, profiles)
// is never selected, so it cannot leak through this router. Admin actions are audited with
// orgId = null and action "admin.*" (middleware/platform-admin.ts#auditAdmin).

import type { AdminFailureDto, AdminOverviewDto, AdminPage } from "@shared/admin/types";
import { APPLICATION_STATUSES } from "@shared/enums";
import { and, count, desc, eq, gte, isNotNull, isNull, lt, or, type SQL, sql } from "drizzle-orm";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import { Hono } from "hono";
import { z } from "zod";
import {
  applications,
  auditLog,
  billingEvents,
  discoveryRuns,
  documents,
  facts,
  llmCalls,
  member,
  organization,
  orgSettings,
  submissions,
  subscriptions,
  user,
} from "../db/schema";
import { notFound } from "../lib/errors";
import { validate } from "../lib/validate";
import { auditAdmin, requirePlatformAdmin } from "../middleware/platform-admin";
import { enqueue } from "../queues/enqueue";
import { grantComp, type Subscription } from "../services/billing";
import { listDiscoveryRuns } from "../services/discovery";
import { startOfUtcMonth } from "../services/guards/llm-budget";
import { marketingConfig, subscriberCounts } from "../services/marketing";
import { decodeCursor, encodeCursor } from "../services/privacy/audit-log";
import { tenantTables } from "../services/privacy/tenant-tables";
import type { AppEnv } from "../types";

const DAY_MS = 86_400_000;
const DEFAULT_LIMIT = 50;

const routes = new Hono<AppEnv>();
routes.use("*", requirePlatformAdmin);

// --- validation + pagination helpers -----------------------------------------------------------

/** Optional query string param; "" (an empty form field) means "not set". */
const optStr = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => v || undefined);

const pageQuery = {
  cursor: optStr(200),
  limit: z.coerce.number().int().min(1).max(100).optional(),
};

const orgIdParam = z.string().min(1).max(64);

/** Keyset condition for `ORDER BY ts DESC, id DESC` pages (cursor = last row's ts + id). */
function afterCursor(tsCol: AnySQLiteColumn, idCol: AnySQLiteColumn, cursor?: string) {
  if (!cursor) return undefined;
  const cur = decodeCursor(cursor);
  const t = new Date(cur.t);
  return or(lt(tsCol, t), and(eq(tsCol, t), lt(idCol, cur.id)));
}

function toPage<R extends { id: string }, T>(
  rows: R[],
  limit: number,
  tsOf: (r: R) => Date,
  map: (r: R) => T,
): AdminPage<T> {
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  const nextCursor =
    rows.length > limit && last ? encodeCursor({ t: tsOf(last).getTime(), id: last.id }) : null;
  return { items: items.map(map), nextCursor };
}

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
const truncate = (s: string | null | undefined, n = 300) => (s ? s.slice(0, n) : null);
const costSum = sql<number>`coalesce(sum(${llmCalls.costMicros}), 0)`.mapWith(Number);
const toCounts = (rows: { k: string; n: number }[]) =>
  Object.fromEntries(rows.map((r) => [r.k, r.n])) as Record<string, number>;

function subscriptionDto(sub: Subscription | null | undefined) {
  if (!sub) return null;
  const note = sub.metadata?.compNote;
  return {
    planKey: sub.planKey,
    status: sub.status,
    provider: sub.provider,
    currentPeriodEnd: iso(sub.currentPeriodEnd),
    compNote: typeof note === "string" ? note : null,
  };
}

async function requireOrgRow(c: { var: AppEnv["Variables"] }, orgId: string) {
  const org = await c.var.ctx.db
    .select({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      createdAt: organization.createdAt,
    })
    .from(organization)
    .where(eq(organization.id, orgId))
    .get();
  if (!org) throw notFound("Organization");
  return org;
}

// --- GET /overview -----------------------------------------------------------------------------

routes.get("/overview", async (c) => {
  const { db } = c.var.ctx;
  const now = c.var.ctx.now();
  const monthStart = startOfUtcMonth(now);
  const since30 = new Date(now.getTime() - 30 * DAY_MS);
  const mtd = gte(llmCalls.createdAt, monthStart);

  const [
    orgs,
    users,
    appStatus,
    subs30,
    spend,
    byPurpose,
    topOrgs,
    failedDocs,
    failedApps,
    failedRuns,
    recentDocs,
    recentApps,
    runs,
  ] = await Promise.all([
    db.select({ n: count() }).from(organization).get(),
    db.select({ n: count() }).from(user).get(),
    db
      .select({ k: applications.status, n: count() })
      .from(applications)
      .groupBy(applications.status)
      .all(),
    db.select({ n: count() }).from(submissions).where(gte(submissions.createdAt, since30)).get(),
    db.select({ cost: costSum, n: count() }).from(llmCalls).where(mtd).get(),
    db
      .select({ purpose: llmCalls.purpose, calls: count(), costMicros: costSum })
      .from(llmCalls)
      .where(mtd)
      .groupBy(llmCalls.purpose)
      .orderBy(desc(costSum))
      .all(),
    db
      .select({
        orgId: llmCalls.orgId,
        orgName: organization.name,
        calls: count(),
        costMicros: costSum,
      })
      .from(llmCalls)
      .leftJoin(organization, eq(organization.id, llmCalls.orgId))
      .where(and(mtd, isNotNull(llmCalls.orgId)))
      .groupBy(llmCalls.orgId, organization.name)
      .orderBy(desc(costSum))
      .limit(10)
      .all(),
    db.select({ n: count() }).from(documents).where(eq(documents.status, "failed")).get(),
    db.select({ n: count() }).from(applications).where(eq(applications.status, "failed")).get(),
    db
      .select({ n: count() })
      .from(discoveryRuns)
      .where(and(eq(discoveryRuns.status, "failed"), gte(discoveryRuns.startedAt, since30)))
      .get(),
    db
      .select({
        id: documents.id,
        orgId: documents.orgId,
        orgName: organization.name,
        error: documents.error,
        updatedAt: documents.updatedAt,
      })
      .from(documents)
      .leftJoin(organization, eq(organization.id, documents.orgId))
      .where(eq(documents.status, "failed"))
      .orderBy(desc(documents.updatedAt))
      .limit(10)
      .all(),
    db
      .select({
        id: applications.id,
        orgId: applications.orgId,
        orgName: organization.name,
        error: applications.lastError,
        updatedAt: applications.updatedAt,
      })
      .from(applications)
      .leftJoin(organization, eq(organization.id, applications.orgId))
      .where(eq(applications.status, "failed"))
      .orderBy(desc(applications.updatedAt))
      .limit(10)
      .all(),
    listDiscoveryRuns(c.var.ctx, 5),
  ]);

  const applicationsByStatus: Record<string, number> = Object.fromEntries(
    APPLICATION_STATUSES.map((s) => [s, 0]),
  );
  for (const r of appStatus) applicationsByStatus[r.k] = r.n;

  const recent: AdminFailureDto[] = [
    ...recentDocs.map((r) => ({ kind: "document" as const, ...r })),
    ...recentApps.map((r) => ({ kind: "application" as const, ...r })),
  ]
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    .slice(0, 10)
    .map((r) => ({ ...r, error: truncate(r.error), updatedAt: r.updatedAt.toISOString() }));

  const body: AdminOverviewDto = {
    generatedAt: now.toISOString(),
    monthStart: monthStart.toISOString(),
    counts: { orgs: orgs?.n ?? 0, users: users?.n ?? 0 },
    applicationsByStatus,
    submissionsLast30Days: subs30?.n ?? 0,
    llm: {
      monthToDateCostMicros: spend?.cost ?? 0,
      monthToDateCalls: spend?.n ?? 0,
      byPurpose,
      topOrgs: topOrgs.map((r) => ({ ...r, orgId: r.orgId ?? "" })),
    },
    failedJobs: {
      documents: failedDocs?.n ?? 0,
      applications: failedApps?.n ?? 0,
      discoveryRuns: failedRuns?.n ?? 0,
      recent,
    },
    lastDiscoveryRuns: runs.map(discoveryRunDto),
  };
  return c.json(body);
});

// --- GET /orgs ---------------------------------------------------------------------------------

const orgsQuery = z.object({ q: optStr(100), ...pageQuery });

routes.get("/orgs", validate("query", orgsQuery), async (c) => {
  const { q, cursor, limit = DEFAULT_LIMIT } = c.req.valid("query");
  const monthStartMs = startOfUtcMonth(c.var.ctx.now()).getTime();
  const conds: (SQL | undefined)[] = [afterCursor(organization.createdAt, organization.id, cursor)];
  if (q) {
    const pattern = `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
    conds.push(
      or(
        sql`${organization.name} like ${pattern} escape '\\'`,
        sql`${organization.slug} like ${pattern} escape '\\'`,
        eq(organization.id, q),
      ),
    );
  }
  const rows = await c.var.ctx.db
    .select({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      createdAt: organization.createdAt,
      planKey: subscriptions.planKey,
      subStatus: subscriptions.status,
      memberCount:
        sql<number>`(select count(*) from ${member} where ${member.organizationId} = ${organization.id})`.mapWith(
          Number,
        ),
      applicationCount:
        sql<number>`(select count(*) from ${applications} where ${applications.orgId} = ${organization.id})`.mapWith(
          Number,
        ),
      monthToDateCostMicros:
        sql<number>`(select coalesce(sum(${llmCalls.costMicros}), 0) from ${llmCalls} where ${llmCalls.orgId} = ${organization.id} and ${llmCalls.createdAt} >= ${monthStartMs})`.mapWith(
          Number,
        ),
      lastAuditMs: sql<
        number | null
      >`(select max(${auditLog.createdAt}) from ${auditLog} where ${auditLog.orgId} = ${organization.id})`,
    })
    .from(organization)
    .leftJoin(subscriptions, eq(subscriptions.orgId, organization.id))
    .where(and(...conds))
    .orderBy(desc(organization.createdAt), desc(organization.id))
    .limit(limit + 1)
    .all();

  return c.json(
    toPage(
      rows,
      limit,
      (r) => r.createdAt,
      (r) => ({
        id: r.id,
        name: r.name,
        slug: r.slug,
        createdAt: r.createdAt.toISOString(),
        memberCount: r.memberCount,
        applicationCount: r.applicationCount,
        monthToDateCostMicros: r.monthToDateCostMicros,
        lastActivityAt: new Date(
          Math.max(Number(r.lastAuditMs ?? 0), r.createdAt.getTime()),
        ).toISOString(),
        subscription: r.planKey && r.subStatus ? { planKey: r.planKey, status: r.subStatus } : null,
      }),
    ),
  );
});

// --- GET /orgs/:orgId (counts + settings only; never content) ----------------------------------

routes.get("/orgs/:orgId", async (c) => {
  const orgId = orgIdParam.parse(c.req.param("orgId"));
  const { db } = c.var.ctx;
  const org = await requireOrgRow(c, orgId);
  const monthStart = startOfUtcMonth(c.var.ctx.now());
  const tables = tenantTables();

  const [tableCounts, docStatus, factStatus, appStatus, llmAll, llmMtd, lastAudit, settings, sub] =
    await Promise.all([
      Promise.all(
        tables.map(async (t) => {
          const row = await db
            .select({ n: count() })
            .from(t.table)
            .where(eq(t.orgColumn, orgId))
            .get();
          return [t.name, row?.n ?? 0] as const;
        }),
      ),
      db
        .select({ k: documents.status, n: count() })
        .from(documents)
        .where(eq(documents.orgId, orgId))
        .groupBy(documents.status)
        .all(),
      db
        .select({ k: facts.status, n: count() })
        .from(facts)
        .where(eq(facts.orgId, orgId))
        .groupBy(facts.status)
        .all(),
      db
        .select({ k: applications.status, n: count() })
        .from(applications)
        .where(eq(applications.orgId, orgId))
        .groupBy(applications.status)
        .all(),
      db
        .select({ cost: costSum, n: count() })
        .from(llmCalls)
        .where(eq(llmCalls.orgId, orgId))
        .get(),
      db
        .select({ cost: costSum })
        .from(llmCalls)
        .where(and(eq(llmCalls.orgId, orgId), gte(llmCalls.createdAt, monthStart)))
        .get(),
      db
        .select({ t: sql<number | null>`max(${auditLog.createdAt})` })
        .from(auditLog)
        .where(eq(auditLog.orgId, orgId))
        .get(),
      db.select().from(orgSettings).where(eq(orgSettings.orgId, orgId)).get(),
      db.select().from(subscriptions).where(eq(subscriptions.orgId, orgId)).get(),
    ]);

  await auditAdmin(c, { action: "org_viewed", targetType: "organization", targetId: orgId });

  const { orgId: _orgId, ...settingsFields } = settings ?? { orgId: null };
  return c.json({
    org: { ...org, createdAt: org.createdAt.toISOString() },
    subscription: subscriptionDto(sub),
    tableCounts: Object.fromEntries(tableCounts),
    statusCounts: {
      documents: toCounts(docStatus),
      facts: toCounts(factStatus),
      applications: toCounts(appStatus),
    },
    llm: {
      totalCostMicros: llmAll?.cost ?? 0,
      monthToDateCostMicros: llmMtd?.cost ?? 0,
      calls: llmAll?.n ?? 0,
    },
    lastActivityAt: new Date(
      Math.max(Number(lastAudit?.t ?? 0), org.createdAt.getTime()),
    ).toISOString(),
    settings: settings ? settingsFields : null,
  });
});

// --- POST /orgs/:orgId/comp --------------------------------------------------------------------

const compBody = z.object({ note: z.string().trim().min(1).max(500) });

routes.post("/orgs/:orgId/comp", validate("json", compBody), async (c) => {
  const orgId = orgIdParam.parse(c.req.param("orgId"));
  const { note } = c.req.valid("json");
  const ctx = c.var.ctx;
  await requireOrgRow(c, orgId);
  const before = await ctx.db
    .select({ planKey: subscriptions.planKey, status: subscriptions.status })
    .from(subscriptions)
    .where(eq(subscriptions.orgId, orgId))
    .get();
  const sub = await grantComp(ctx, orgId, note, { type: "user", id: c.var.user?.id ?? null });
  await auditAdmin(c, {
    action: "comp_granted",
    targetType: "organization",
    targetId: orgId,
    metadata: {
      note,
      previousPlanKey: before?.planKey ?? null,
      previousStatus: before?.status ?? null,
    },
  });
  return c.json({ subscription: subscriptionDto(sub) });
});

// Suspension: there is no org suspension flag in the schema (organization / org_settings /
// subscriptions), so POST /orgs/:orgId/suspend and /unsuspend are intentionally not implemented.

// --- GET /llm-calls ----------------------------------------------------------------------------

const llmQuery = z.object({
  orgId: optStr(64),
  purpose: optStr(100),
  since: z.coerce.date().optional(),
  ...pageQuery,
});

routes.get("/llm-calls", validate("query", llmQuery), async (c) => {
  const { orgId, purpose, since, cursor, limit = DEFAULT_LIMIT } = c.req.valid("query");
  const rows = await c.var.ctx.db
    .select({
      id: llmCalls.id,
      orgId: llmCalls.orgId,
      applicationId: llmCalls.applicationId,
      purpose: llmCalls.purpose,
      model: llmCalls.model,
      inputTokens: llmCalls.inputTokens,
      outputTokens: llmCalls.outputTokens,
      cacheReadTokens: llmCalls.cacheReadTokens,
      cacheWriteTokens: llmCalls.cacheWriteTokens,
      costMicros: llmCalls.costMicros,
      latencyMs: llmCalls.latencyMs,
      stopReason: llmCalls.stopReason,
      error: llmCalls.error,
      createdAt: llmCalls.createdAt,
    })
    .from(llmCalls)
    .where(
      and(
        orgId ? eq(llmCalls.orgId, orgId) : undefined,
        purpose ? eq(llmCalls.purpose, purpose) : undefined,
        since ? gte(llmCalls.createdAt, since) : undefined,
        afterCursor(llmCalls.createdAt, llmCalls.id, cursor),
      ),
    )
    .orderBy(desc(llmCalls.createdAt), desc(llmCalls.id))
    .limit(limit + 1)
    .all();
  return c.json(
    toPage(
      rows,
      limit,
      (r) => r.createdAt,
      (r) => ({ ...r, error: truncate(r.error, 200), createdAt: r.createdAt.toISOString() }),
    ),
  );
});

// --- discovery ---------------------------------------------------------------------------------

function discoveryRunDto(r: typeof discoveryRuns.$inferSelect) {
  return {
    id: r.id,
    source: r.source,
    trigger: r.trigger,
    status: r.status,
    found: r.found,
    created: r.created,
    updated: r.updated,
    error: truncate(r.error),
    startedAt: r.startedAt.toISOString(),
    finishedAt: iso(r.finishedAt),
  };
}

routes.get("/discovery-runs", validate("query", z.object(pageQuery)), async (c) => {
  const { cursor, limit = DEFAULT_LIMIT } = c.req.valid("query");
  const rows = await c.var.ctx.db
    .select()
    .from(discoveryRuns)
    .where(afterCursor(discoveryRuns.startedAt, discoveryRuns.id, cursor))
    .orderBy(desc(discoveryRuns.startedAt), desc(discoveryRuns.id))
    .limit(limit + 1)
    .all();
  return c.json(toPage(rows, limit, (r) => r.startedAt, discoveryRunDto));
});

routes.post("/discovery/run", async (c) => {
  const source = "grants_gov" as const;
  await auditAdmin(c, {
    action: "discovery_run_requested",
    targetType: "discovery_source",
    targetId: source,
  });
  await enqueue(c.var.ctx, { type: "discovery.run", source, trigger: "manual" });
  return c.json({ queued: true, source }, 202);
});

// --- GET /newsletter (counts only; addresses are never listed here) -----------------------------

routes.get("/newsletter", async (c) => {
  const ctx = c.var.ctx;
  const cfg = marketingConfig(ctx.env);
  return c.json({
    sendingEnabled: cfg.sendingEnabled,
    blockers: cfg.blockers,
    counts: await subscriberCounts(ctx),
  });
});

// --- GET /billing-events (no payloads: they carry customer PII) --------------------------------

const billingQuery = z.object({ orgId: optStr(64), ...pageQuery });

routes.get("/billing-events", validate("query", billingQuery), async (c) => {
  const { orgId, cursor, limit = DEFAULT_LIMIT } = c.req.valid("query");
  const rows = await c.var.ctx.db
    .select({
      id: billingEvents.id,
      provider: billingEvents.provider,
      providerEventId: billingEvents.providerEventId,
      type: billingEvents.type,
      orgId: billingEvents.orgId,
      processedAt: billingEvents.processedAt,
      error: billingEvents.error,
      createdAt: billingEvents.createdAt,
    })
    .from(billingEvents)
    .where(
      and(
        orgId ? eq(billingEvents.orgId, orgId) : undefined,
        afterCursor(billingEvents.createdAt, billingEvents.id, cursor),
      ),
    )
    .orderBy(desc(billingEvents.createdAt), desc(billingEvents.id))
    .limit(limit + 1)
    .all();
  return c.json(
    toPage(
      rows,
      limit,
      (r) => r.createdAt,
      (r) => ({
        ...r,
        error: truncate(r.error),
        processedAt: iso(r.processedAt),
        createdAt: r.createdAt.toISOString(),
      }),
    ),
  );
});

// --- GET /audit?orgId= (an org id, "platform" for admin/platform entries, or omitted for all) ---

const auditQuery = z.object({ orgId: optStr(64), ...pageQuery });

routes.get("/audit", validate("query", auditQuery), async (c) => {
  const { orgId, cursor, limit = DEFAULT_LIMIT } = c.req.valid("query");
  const scope =
    orgId === "platform" ? isNull(auditLog.orgId) : orgId ? eq(auditLog.orgId, orgId) : undefined;
  const rows = await c.var.ctx.db
    .select()
    .from(auditLog)
    .where(and(scope, afterCursor(auditLog.createdAt, auditLog.id, cursor)))
    .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
    .limit(limit + 1)
    .all();
  return c.json(
    toPage(
      rows,
      limit,
      (r) => r.createdAt,
      (r) => ({ ...r, createdAt: r.createdAt.toISOString() }),
    ),
  );
});

export default routes;
