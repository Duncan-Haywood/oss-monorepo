// Platform admin console (/api/admin): access gate, metadata-only org detail, comp, listings.
// The test env has no PLATFORM_ADMIN_EMAILS, so requests go through createApp() with an env override.
import { env } from "cloudflare:workers";
import type {
  AdminAuditEntryDto,
  AdminLlmCallDto,
  AdminOrgDetailDto,
  AdminOrgRowDto,
  AdminOverviewDto,
  AdminPage,
} from "@shared/admin/types";
import { createApp } from "@worker/app";
import {
  applications,
  applicationVersions,
  auditLog,
  documentChunks,
  documents,
  facts,
  interviews,
  interviewTurns,
  llmCalls,
  opportunities,
  orgProfiles,
  projects,
  subscriptions,
  user,
} from "@worker/db/schema";
import type { Env } from "@worker/env";
import { newId } from "@worker/lib/ids";
import { isPlatformAdminUser } from "@worker/middleware/platform-admin";
import { TEST_USER_HEADER } from "@worker/middleware/session";
import adminRoutes from "@worker/routes/admin";
import { and, eq, isNull } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { createTestOrg, createTestUser, setupTenant, testDb } from "./helpers";

const app = createApp();
// Until the integration pass mounts the router in app.ts, mount it here (same middleware chain).
if (!app.routes.some((r) => r.path.startsWith("/api/admin"))) {
  app.route("/api/admin", adminRoutes);
}

const baseEnv = env as unknown as Env;
const ADMIN_EMAIL = `${newId("usr")}@admin.example.test`;
/** Mixed case + whitespace: the comparison must be case-insensitive and trimmed. */
const adminEnv: Env = {
  ...baseEnv,
  PLATFORM_ADMIN_EMAILS: ` someone-else@example.test , ${ADMIN_EMAIL.toUpperCase()} `,
};

interface CallInit {
  as?: string;
  method?: string;
  json?: unknown;
  env?: Env;
}

function call(path: string, init: CallInit = {}) {
  const headers = new Headers();
  if (init.as) headers.set(TEST_USER_HEADER, init.as);
  if (init.json !== undefined) headers.set("Content-Type", "application/json");
  return app.request(
    path,
    {
      method: init.method ?? "GET",
      headers,
      body: init.json !== undefined ? JSON.stringify(init.json) : undefined,
    },
    init.env ?? adminEnv,
  );
}

async function ok<T>(res: Response | Promise<Response>, status = 200): Promise<T> {
  const r = await res;
  const text = await r.text();
  expect(r.status, text).toBe(status);
  return JSON.parse(text) as T;
}

let adminId = "";
beforeAll(async () => {
  adminId = (await createTestUser({ email: ADMIN_EMAIL, name: "Platform Admin" })).id;
});

async function seedLlmCall(orgId: string | null, purpose: string, costMicros: number) {
  await testDb()
    .insert(llmCalls)
    .values({
      id: newId("llm"),
      orgId,
      purpose,
      model: "claude-opus-5-5",
      inputTokens: 1000,
      outputTokens: 200,
      costMicros,
      latencyMs: 1234,
    });
}

describe("requirePlatformAdmin", () => {
  it("isPlatformAdminUser: listed + verified only; unset list denies everyone", () => {
    const u = { email: "Ops@Example.test", emailVerified: true };
    expect(isPlatformAdminUser({ PLATFORM_ADMIN_EMAILS: "a@x.test, ops@example.test" }, u)).toBe(
      true,
    );
    expect(
      isPlatformAdminUser(
        { PLATFORM_ADMIN_EMAILS: "ops@example.test" },
        { ...u, emailVerified: false },
      ),
    ).toBe(false);
    expect(isPlatformAdminUser({ PLATFORM_ADMIN_EMAILS: "other@example.test" }, u)).toBe(false);
    expect(isPlatformAdminUser({}, u)).toBe(false);
    expect(isPlatformAdminUser({ PLATFORM_ADMIN_EMAILS: " , " }, u)).toBe(false);
    expect(isPlatformAdminUser({ PLATFORM_ADMIN_EMAILS: "ops@example.test" }, null)).toBe(false);
  });

  it("returns 403 for a signed-in non-admin and 401 when signed out", async () => {
    const { userId, orgId } = await setupTenant("owner");
    for (const [path, method] of [
      ["/api/admin/overview", "GET"],
      ["/api/admin/orgs", "GET"],
      [`/api/admin/orgs/${orgId}`, "GET"],
      ["/api/admin/llm-calls", "GET"],
      ["/api/admin/audit", "GET"],
    ] as const) {
      const res = await call(path, { as: userId, method });
      expect(res.status, path).toBe(403);
      expect(((await res.json()) as { error: { code: string } }).error.code).toBe("forbidden");
    }
    // An org owner cannot comp their own org through the admin API.
    const comp = await call(`/api/admin/orgs/${orgId}/comp`, {
      as: userId,
      method: "POST",
      json: { note: "please" },
    });
    expect(comp.status).toBe(403);
    expect(
      await testDb().select().from(subscriptions).where(eq(subscriptions.orgId, orgId)).get(),
    ).toBeUndefined();
    expect((await call("/api/admin/overview")).status).toBe(401);
  });

  it("returns 403 to everyone, the listed admin included, when PLATFORM_ADMIN_EMAILS is unset", async () => {
    const { PLATFORM_ADMIN_EMAILS: _unset, ...noVar } = adminEnv;
    for (const e of [noVar as Env, baseEnv, { ...adminEnv, PLATFORM_ADMIN_EMAILS: "" }]) {
      expect((await call("/api/admin/overview", { as: adminId, env: e })).status).toBe(403);
    }
  });

  it("returns 403 for a listed email that is not verified", async () => {
    const email = `${newId("usr")}@admin.example.test`;
    const u = await createTestUser({ email });
    await testDb().update(user).set({ emailVerified: false }).where(eq(user.id, u.id));
    const e = { ...adminEnv, PLATFORM_ADMIN_EMAILS: email };
    expect((await call("/api/admin/overview", { as: u.id, env: e })).status).toBe(403);
    await testDb().update(user).set({ emailVerified: true }).where(eq(user.id, u.id));
    expect((await call("/api/admin/overview", { as: u.id, env: e })).status).toBe(200);
  });
});

describe("GET /api/admin/overview", () => {
  it("aggregates orgs, users, spend by purpose, top orgs and failures", async () => {
    const { orgId } = await setupTenant();
    await seedLlmCall(orgId, "admin_test.alpha", 2_500_000);
    await seedLlmCall(orgId, "admin_test.alpha", 500_000);
    await seedLlmCall(null, "admin_test.beta", 100_000);
    await testDb()
      .insert(documents)
      .values({
        id: newId("doc"),
        orgId,
        title: "broken.pdf",
        kind: "other",
        mimeType: "application/pdf",
        sizeBytes: 10,
        sha256: "x",
        r2Key: `orgs/${orgId}/documents/x/original`,
        status: "failed",
        error: "Conversion failed",
      });

    const o = await ok<AdminOverviewDto>(call("/api/admin/overview", { as: adminId }));
    expect(o.counts.orgs).toBeGreaterThanOrEqual(1);
    expect(o.counts.users).toBeGreaterThanOrEqual(2);
    expect(o.applicationsByStatus).toHaveProperty("failed");
    expect(typeof o.submissionsLast30Days).toBe("number");
    expect(o.llm.monthToDateCostMicros).toBeGreaterThanOrEqual(3_100_000);
    expect(o.llm.byPurpose).toContainEqual({
      purpose: "admin_test.alpha",
      calls: 2,
      costMicros: 3_000_000,
    });
    expect(o.llm.byPurpose).toContainEqual({
      purpose: "admin_test.beta",
      calls: 1,
      costMicros: 100_000,
    });
    expect(o.llm.topOrgs.find((t) => t.orgId === orgId)).toMatchObject({
      orgName: "Test Org",
      calls: 2,
      costMicros: 3_000_000,
    });
    expect(o.failedJobs.documents).toBeGreaterThanOrEqual(1);
    const failure = o.failedJobs.recent.find((f) => f.orgId === orgId);
    expect(failure).toMatchObject({ kind: "document", error: "Conversion failed" });
    expect(failure).not.toHaveProperty("title");
    expect(Array.isArray(o.lastDiscoveryRuns)).toBe(true);
  });
});

describe("GET /api/admin/orgs", () => {
  it("searches, reports per-org stats and paginates with a cursor", async () => {
    const tag = newId("org").slice(4, 12);
    const owner = await createTestUser();
    const a = await createTestOrg(owner.id, { name: `Searchable ${tag} A` });
    const b = await createTestOrg(owner.id, { name: `Searchable ${tag} B` });
    await seedLlmCall(a.orgId, "admin_test.gamma", 750_000);
    await testDb()
      .insert(subscriptions)
      .values({ orgId: a.orgId, planKey: "starter", status: "active" });

    const first = await ok<AdminPage<AdminOrgRowDto>>(
      call(`/api/admin/orgs?q=${encodeURIComponent(tag.toUpperCase())}&limit=1`, { as: adminId }),
    );
    expect(first.items).toHaveLength(1);
    expect(first.nextCursor).toBeTruthy();
    const second = await ok<AdminPage<AdminOrgRowDto>>(
      call(`/api/admin/orgs?q=${tag}&limit=1&cursor=${first.nextCursor}`, { as: adminId }),
    );
    expect(second.items).toHaveLength(1);
    expect(second.nextCursor).toBeNull();
    const rows = [...first.items, ...second.items];
    expect(rows.map((r) => r.id).sort()).toEqual([a.orgId, b.orgId].sort());

    const rowA = rows.find((r) => r.id === a.orgId);
    expect(rowA).toMatchObject({
      memberCount: 1,
      applicationCount: 0,
      monthToDateCostMicros: 750_000,
      subscription: { planKey: "starter", status: "active" },
    });
    expect(rows.find((r) => r.id === b.orgId)?.subscription).toBeNull();

    // LIKE wildcards in q are literals.
    const none = await ok<AdminPage<AdminOrgRowDto>>(
      call(`/api/admin/orgs?q=${encodeURIComponent(`${tag}%`)}`, { as: adminId }),
    );
    expect(none.items).toHaveLength(0);

    expect((await call("/api/admin/orgs?cursor=not-a-cursor", { as: adminId })).status).toBe(400);
    expect((await call("/api/admin/orgs?limit=1000", { as: adminId })).status).toBe(400);
  });
});

describe("GET /api/admin/orgs/:orgId", () => {
  it("returns counts and settings only: no document text, facts, turns or application content", async () => {
    const SECRET = `SECRET-${newId("doc")}`;
    const { orgId } = await setupTenant();
    const db = testDb();
    await db
      .update(orgProfiles)
      .set({ contactEmail: `${SECRET}@example.test`, ein: SECRET })
      .where(eq(orgProfiles.orgId, orgId));
    const docId = newId("doc");
    await db.insert(documents).values({
      id: docId,
      orgId,
      title: `${SECRET} annual report`,
      kind: "annual_report",
      mimeType: "text/markdown",
      sizeBytes: 100,
      sha256: "abc",
      r2Key: `orgs/${orgId}/documents/${docId}/original`,
      status: "ready",
      notes: SECRET,
    });
    await db.insert(documentChunks).values({
      id: newId("chk"),
      orgId,
      documentId: docId,
      ordinal: 0,
      text: `${SECRET} served 1,200 families`,
      tokenEstimate: 5,
      charStart: 0,
      charEnd: 30,
    });
    await db.insert(facts).values({
      id: newId("fct"),
      orgId,
      category: "program",
      statement: `${SECRET} fact statement`,
      sourceQuote: SECRET,
      status: "confirmed",
      sourceType: "user_entered",
    });
    await db.insert(projects).values({ id: newId("prj"), orgId, title: SECRET, summary: SECRET });
    const interviewId = newId("int");
    await db
      .insert(interviews)
      .values({ id: interviewId, orgId, kind: "onboarding", title: SECRET, summary: SECRET });
    await db.insert(interviewTurns).values({
      id: newId("trn"),
      orgId,
      interviewId,
      ordinal: 0,
      role: "respondent",
      content: `${SECRET} interview answer`,
    });
    const oppId = newId("opp");
    await db.insert(opportunities).values({
      id: oppId,
      source: "manual",
      sourceId: oppId,
      privateToOrgId: orgId,
      funderName: SECRET,
      title: SECRET,
      description: SECRET,
    });
    const appId = newId("app");
    await db.insert(applications).values({
      id: appId,
      orgId,
      opportunityId: oppId,
      title: `${SECRET} application`,
      status: "in_review",
      outcomeNotes: SECRET,
    });
    await db.insert(applicationVersions).values({
      id: newId("ver"),
      orgId,
      applicationId: appId,
      versionNumber: 1,
      content: { sections: [] },
      executiveSummary: `${SECRET} executive summary`,
      keyPoints: [SECRET],
      authorType: "system",
    });

    const res = await call(`/api/admin/orgs/${orgId}`, { as: adminId });
    const text = await res.text();
    expect(res.status, text).toBe(200);
    expect(text).not.toContain(SECRET);

    const body = JSON.parse(text) as AdminOrgDetailDto;
    const keys = new Set<string>();
    const walk = (v: unknown) => {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object") {
        for (const [k, child] of Object.entries(v)) {
          keys.add(k);
          walk(child);
        }
      }
    };
    walk({ ...body, tableCounts: {} });
    for (const forbiddenKey of [
      "text",
      "content",
      "statement",
      "sourceQuote",
      "executiveSummary",
      "keyPoints",
      "summary",
      "title",
      "description",
      "notes",
      "ein",
      "contactEmail",
      "legalName",
    ]) {
      expect(keys.has(forbiddenKey), forbiddenKey).toBe(false);
    }

    expect(body.org.id).toBe(orgId);
    expect(body.tableCounts).toMatchObject({
      member: 1,
      documents: 1,
      document_chunks: 1,
      facts: 1,
      projects: 1,
      interviews: 1,
      interview_turns: 1,
      applications: 1,
      application_versions: 1,
      opportunities: 1,
    });
    expect(body.statusCounts.applications).toEqual({ in_review: 1 });
    expect(body.statusCounts.facts).toEqual({ confirmed: 1 });
    expect(body.settings).toMatchObject({ autopilotEnabled: false, autoDraftTopN: 3 });
    expect(body.settings).not.toHaveProperty("orgId");

    // Viewing an org is audited on the platform trail (orgId null), not in the tenant's log.
    const trail = await db
      .select()
      .from(auditLog)
      .where(and(isNull(auditLog.orgId), eq(auditLog.targetId, orgId)))
      .all();
    expect(trail.map((r) => [r.action, r.actorId])).toContainEqual(["admin.org_viewed", adminId]);

    expect((await call("/api/admin/orgs/org_missing", { as: adminId })).status).toBe(404);
  });
});

describe("POST /api/admin/orgs/:orgId/comp", () => {
  it("comps the org's plan and audits it on both trails", async () => {
    const { orgId } = await setupTenant();
    await testDb()
      .insert(subscriptions)
      .values({ orgId, planKey: "starter", status: "past_due", provider: "fake" });

    const body = await ok<{ subscription: { planKey: string; status: string; compNote: string } }>(
      call(`/api/admin/orgs/${orgId}/comp`, {
        as: adminId,
        method: "POST",
        json: { note: "SWIF pilot partner" },
      }),
    );
    expect(body.subscription).toMatchObject({
      planKey: "comp",
      status: "comp",
      compNote: "SWIF pilot partner",
    });
    const sub = await testDb()
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.orgId, orgId))
      .get();
    expect(sub).toMatchObject({ planKey: "comp", status: "comp" });

    const rows = await testDb().select().from(auditLog).where(eq(auditLog.targetId, orgId)).all();
    const platform = rows.find((r) => r.action === "admin.comp_granted");
    expect(platform).toMatchObject({ orgId: null, actorType: "user", actorId: adminId });
    expect(platform?.metadata).toMatchObject({
      note: "SWIF pilot partner",
      previousPlanKey: "starter",
      previousStatus: "past_due",
    });
    expect(rows.find((r) => r.action === "billing.comp_granted")).toMatchObject({
      orgId,
      actorId: adminId,
    });

    const detail = await ok<AdminOrgDetailDto>(call(`/api/admin/orgs/${orgId}`, { as: adminId }));
    expect(detail.subscription).toMatchObject({ status: "comp", compNote: "SWIF pilot partner" });

    const post = (path: string, json: unknown) => call(path, { as: adminId, method: "POST", json });
    expect((await post(`/api/admin/orgs/${orgId}/comp`, { note: "  " })).status).toBe(400);
    expect((await post(`/api/admin/orgs/${orgId}/comp`, {})).status).toBe(400);
    expect((await post("/api/admin/orgs/org_missing/comp", { note: "x" })).status).toBe(404);
  });
});

describe("listings", () => {
  it("GET /llm-calls filters by org and purpose and returns metadata only", async () => {
    const { orgId } = await setupTenant();
    await seedLlmCall(orgId, "admin_test.delta", 10);
    await seedLlmCall(orgId, "admin_test.epsilon", 20);
    await seedLlmCall(orgId, "admin_test.epsilon", 30);

    const all = await ok<AdminPage<AdminLlmCallDto>>(
      call(`/api/admin/llm-calls?orgId=${orgId}`, { as: adminId }),
    );
    expect(all.items).toHaveLength(3);
    expect(Object.keys(all.items[0] ?? {}).sort()).toEqual(
      [
        "applicationId",
        "cacheReadTokens",
        "cacheWriteTokens",
        "costMicros",
        "createdAt",
        "error",
        "id",
        "inputTokens",
        "latencyMs",
        "model",
        "orgId",
        "outputTokens",
        "purpose",
        "stopReason",
      ].sort(),
    );

    const p1 = await ok<AdminPage<AdminLlmCallDto>>(
      call(`/api/admin/llm-calls?orgId=${orgId}&purpose=admin_test.epsilon&limit=1`, {
        as: adminId,
      }),
    );
    expect(p1.items.map((i) => i.purpose)).toEqual(["admin_test.epsilon"]);
    const p2 = await ok<AdminPage<AdminLlmCallDto>>(
      call(
        `/api/admin/llm-calls?orgId=${orgId}&purpose=admin_test.epsilon&limit=1&cursor=${p1.nextCursor}`,
        { as: adminId },
      ),
    );
    expect(p2.items).toHaveLength(1);
    expect(p2.items[0]?.id).not.toBe(p1.items[0]?.id);
    expect(p2.nextCursor).toBeNull();

    const future = new Date(Date.now() + 86_400_000).toISOString();
    const none = await ok<AdminPage<AdminLlmCallDto>>(
      call(`/api/admin/llm-calls?orgId=${orgId}&since=${encodeURIComponent(future)}`, {
        as: adminId,
      }),
    );
    expect(none.items).toHaveLength(0);
    expect((await call("/api/admin/llm-calls?since=yesterday", { as: adminId })).status).toBe(400);
  });

  it("GET /audit?orgId=platform lists admin actions; GET /billing-events and /discovery-runs page", async () => {
    const { orgId } = await setupTenant();
    await call(`/api/admin/orgs/${orgId}`, { as: adminId });
    const platform = await ok<AdminPage<AdminAuditEntryDto>>(
      call("/api/admin/audit?orgId=platform", { as: adminId }),
    );
    expect(platform.items.length).toBeGreaterThan(0);
    expect(platform.items.every((i) => i.orgId === null && i.action.startsWith("admin."))).toBe(
      true,
    );
    const scoped = await ok<AdminPage<AdminAuditEntryDto>>(
      call(`/api/admin/audit?orgId=${orgId}`, { as: adminId }),
    );
    expect(scoped.items.every((i) => i.orgId === orgId)).toBe(true);

    const events = await ok<AdminPage<unknown>>(call("/api/admin/billing-events", { as: adminId }));
    expect(Array.isArray(events.items)).toBe(true);
    const runs = await ok<AdminPage<unknown>>(call("/api/admin/discovery-runs", { as: adminId }));
    expect(Array.isArray(runs.items)).toBe(true);
  });

  it("POST /discovery/run enqueues a manual grants_gov run (inline in tests) and audits it", async () => {
    const res = await ok<{ queued: boolean; source: string }>(
      call("/api/admin/discovery/run", { as: adminId, method: "POST" }),
      202,
    );
    expect(res).toEqual({ queued: true, source: "grants_gov" });
    const runs = await ok<AdminPage<{ trigger: string; source: string }>>(
      call("/api/admin/discovery-runs?limit=5", { as: adminId }),
    );
    expect(runs.items[0]).toMatchObject({ trigger: "manual" });
    const trail = await testDb()
      .select()
      .from(auditLog)
      .where(and(isNull(auditLog.orgId), eq(auditLog.action, "admin.discovery_run_requested")))
      .all();
    expect(trail.length).toBeGreaterThan(0);
  }, 60_000);
});
