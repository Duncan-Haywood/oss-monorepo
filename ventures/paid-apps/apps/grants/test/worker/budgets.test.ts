// /api/orgs/:orgId/applications/:id/budget (GET / PUT / POST propose): proposal only from facts,
// totals in code, ceiling + cost-share warnings, audit, roles, tenant isolation, export, and
// `budget:<lineId>` citations checked by the pipeline's verifier against the saved lines.
import { env } from "cloudflare:workers";
import type { ApplicationDto } from "@shared/api/types";
import { type BudgetDto, budgetRef } from "@shared/budget";
import { createApp } from "@worker/app";
import { createAppContext } from "@worker/context";
import { auditLog, facts, member, opportunities, projects, subscriptions } from "@worker/db/schema";
import { newId } from "@worker/lib/ids";
import { TEST_USER_HEADER } from "@worker/middleware/session";
import { requireOrg } from "@worker/middleware/tenant";
import budgetRoutes from "@worker/routes/org/application-budget";
import { amountInFacts } from "@worker/services/budgets";
import { pipelineDeps } from "@worker/services/pipeline/deps";
import type { AppEnv } from "@worker/types";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { beforeAll, describe, expect, it } from "vitest";
import { api, BASE, createTestUser, setupTenant, testDb } from "./helpers";

// Mounted exactly as app.ts will mount it (integration pass): /api/orgs/:orgId/applications.
const app = createApp();
const mount = new Hono<AppEnv>();
mount.use("*", requireOrg("viewer"));
mount.route("/", budgetRoutes);
app.route("/api/orgs/:orgId/applications", mount);

const call = (path: string, as: string, init: { method?: string; json?: unknown } = {}) =>
  app.fetch(
    new Request(`${BASE}${path}`, {
      method: init.method ?? "GET",
      headers: {
        [TEST_USER_HEADER]: as,
        Origin: BASE,
        ...(init.json !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: init.json !== undefined ? JSON.stringify(init.json) : undefined,
    }),
    env,
  );

const s = {} as {
  orgId: string;
  userId: string;
  appId: string;
  viewerId: string;
  otherOrgId: string;
  otherUserId: string;
  otherFactId: string;
  factIds: Record<string, string>;
};
const path = (suffix = "", appId = s.appId, orgId = s.orgId) =>
  `/api/orgs/${orgId}/applications/${appId}/budget${suffix}`;

async function addFact(
  orgId: string,
  statement: string,
  extra: Partial<typeof facts.$inferInsert> = {},
) {
  const id = newId("fct");
  await testDb()
    .insert(facts)
    .values({
      id,
      orgId,
      category: "financial",
      statement,
      sourceQuote: statement,
      status: "confirmed",
      sourceType: "user_entered",
      ...extra,
    });
  return id;
}

beforeAll(async () => {
  const t = await setupTenant("owner");
  const db = testDb();
  await db.insert(subscriptions).values({ orgId: t.orgId, planKey: "comp", status: "comp" });
  const oppId = newId("opp");
  await db.insert(opportunities).values({
    id: oppId,
    source: "manual",
    sourceId: oppId,
    funderName: "Gallup Community Foundation",
    title: "Workforce Pathways Grant",
    summary: "Supports job training in construction trades.",
    awardCeilingCents: 5_000_000,
    costSharingRequired: true,
    closeDate: new Date("2027-01-15T00:00:00Z"),
    submissionMethod: "portal",
    submissionUrl: "https://funder.example.org/apply",
  });
  const prjId = newId("prj");
  await db.insert(projects).values({
    id: prjId,
    orgId: t.orgId,
    title: "Trades Academy expansion",
    budgetNeededCents: 9_000_000,
  });
  const factIds = {
    coord: await addFact(t.orgId, "The program coordinator salary is $30,000 per year.", {
      projectId: prjId,
    }),
    tools: await addFact(t.orgId, "Tool kits for the trades program cost $12,500 in total."),
    match: await addFact(t.orgId, "SWIF contributes $8,000 of in-kind classroom space as match."),
    proposed: await addFact(t.orgId, "Rent for the workshop is $40,000 per year.", {
      status: "proposed",
    }),
    restricted: await addFact(t.orgId, "A named client paid $4,400 in fees.", {
      sensitivity: "restricted",
    }),
  };
  const res = await api(`/api/orgs/${t.orgId}/applications`, {
    method: "POST",
    as: t.userId,
    json: { opportunityId: oppId, projectId: prjId },
  });
  expect(res.status).toBe(201);
  const created = (await res.json()) as ApplicationDto;

  const viewer = await createTestUser();
  await db.insert(member).values({
    id: newId("mem"),
    organizationId: t.orgId,
    userId: viewer.id,
    role: "viewer",
  });
  const other = await setupTenant("owner");
  const otherFactId = await addFact(other.orgId, "The other org's director earns $95,000.");
  Object.assign(s, {
    orgId: t.orgId,
    userId: t.userId,
    appId: created.id,
    viewerId: viewer.id,
    otherOrgId: other.orgId,
    otherUserId: other.userId,
    otherFactId,
    factIds,
  });
}, 120_000);

const auditActions = async (action: string) =>
  testDb()
    .select()
    .from(auditLog)
    .where(and(eq(auditLog.orgId, s.orgId), eq(auditLog.action, action)))
    .all();

describe("application budget API", () => {
  it("GET returns an empty budget with the funder's ceiling and cost-share rule", async () => {
    const res = await call(path(), s.viewerId);
    expect(res.status).toBe(200);
    const b = (await res.json()) as BudgetDto;
    expect(b).toMatchObject({
      exists: false,
      lines: [],
      rules: {
        awardCeilingCents: 5_000_000,
        costSharingRequired: true,
        projectNeedCents: 9_000_000,
      },
    });
    expect(b.warnings.map((w) => w.code)).toContain("cost_share_missing");
  });

  it("proposes only fact-backed amounts; everything else is a $0 'needs your input' line", async () => {
    const res = await call(path("/propose"), s.userId, { method: "POST", json: {} });
    expect(res.status).toBe(200);
    const b = (await res.json()) as BudgetDto;
    expect(b.exists).toBe(true);
    const rows = await testDb().select().from(facts).where(eq(facts.orgId, s.orgId)).all();
    const byId = new Map(rows.map((f) => [f.id, f]));
    const priced = b.lines.filter((l) => l.totalCents > 0);
    expect(priced.map((l) => l.unitCostCents).sort()).toEqual(
      [1_250_000, 3_000_000, 800_000].sort(),
    );
    for (const l of b.lines) {
      if (l.totalCents === 0) {
        expect(l.note).toBe("needs your input");
        expect(l.factIds).toEqual([]);
        continue;
      }
      const cited = l.factIds.map((id) => byId.get(id)).filter((f) => !!f);
      expect(cited.length).toBeGreaterThan(0);
      expect(cited.every((f) => f?.status === "confirmed" && f.sensitivity !== "restricted")).toBe(
        true,
      );
      expect(amountInFacts(l.unitCostCents, cited as NonNullable<(typeof cited)[number]>[])).toBe(
        true,
      );
      expect(l.source).toBe("fact");
    }
    // Unconfirmed and restricted facts are never sources.
    const allCited = b.lines.flatMap((l) => l.factIds);
    expect(allCited).not.toContain(s.factIds.proposed);
    expect(allCited).not.toContain(s.factIds.restricted);
    expect(b.lines.some((l) => l.totalCents === 0)).toBe(true);
    expect(b.totals.match.matchCents).toBe(800_000);
    expect(await auditActions("application.budget_proposed")).toHaveLength(1);

    // A second proposal must not silently overwrite lines.
    const again = await call(path("/propose"), s.userId, { method: "POST", json: {} });
    expect(again.status).toBe(409);
    const replaced = await call(path("/propose"), s.userId, {
      method: "POST",
      json: { replace: true },
    });
    expect(replaced.status).toBe(200);
  });

  it("PUT computes totals in code, re-checks fact lines, and flags ceiling and cost share", async () => {
    const res = await call(path(), s.userId, {
      method: "PUT",
      json: {
        lines: [
          // Claims to come from a fact but the amount was edited: becomes "user".
          {
            category: "personnel",
            description: "Coordinator",
            quantity: 1,
            unitCostCents: 3_500_000,
            fundingSource: "request",
            source: "fact",
            factIds: [s.factIds.coord],
            totalCents: 1,
          },
          // Still matches its fact: stays "fact".
          {
            category: "supplies",
            description: "Tool kits",
            quantity: 1,
            unitCostCents: 1_250_000,
            fundingSource: "request",
            source: "fact",
            factIds: [s.factIds.tools],
          },
          // Another org's fact id is dropped.
          {
            category: "equipment",
            description: "Vans",
            quantity: 2,
            unitCostCents: 1_000_000,
            fundingSource: "match",
            factIds: [s.otherFactId],
            note: "",
          },
        ],
        notes: "Draft budget",
        requiredMatchCents: 2_500_000,
      },
    });
    expect(res.status).toBe(200);
    const b = (await res.json()) as BudgetDto;
    expect(b.lines.map((l) => [l.source, l.totalCents, l.factIds])).toEqual([
      ["user", 3_500_000, [s.factIds.coord]],
      ["fact", 1_250_000, [s.factIds.tools]],
      ["user", 2_000_000, []],
    ]);
    expect(b.lines.every((l) => /^bln_[0-9a-z]+$/.test(l.id))).toBe(true);
    expect(b.totals.match).toMatchObject({
      requestCents: 4_750_000,
      matchCents: 2_000_000,
      totalProjectCents: 6_750_000,
      shortfallCents: 500_000,
    });
    // (request_mismatch may also appear: the application's ask defaults from the project.)
    const codes = (d: BudgetDto) =>
      d.warnings.map((w) => w.code).filter((c) => c !== "request_mismatch");
    expect(codes(b)).toEqual(["cost_share_short"]);

    const over = await call(path(), s.userId, {
      method: "PUT",
      json: {
        lines: [
          {
            category: "other",
            description: "Big",
            quantity: 1,
            unitCostCents: 6_000_000,
            fundingSource: "request",
          },
        ],
      },
    });
    const ob = (await over.json()) as BudgetDto;
    expect(codes(ob)).toEqual(["over_ceiling", "cost_share_missing", "cost_share_amount_unknown"]);
    expect((await auditActions("application.budget_updated")).length).toBeGreaterThanOrEqual(2);
  });

  it("rejects invalid input and lets viewers read but not write", async () => {
    const bad = await call(path(), s.userId, {
      method: "PUT",
      json: {
        lines: [
          {
            category: "bribes",
            description: "x",
            quantity: 1,
            unitCostCents: 1,
            fundingSource: "request",
          },
        ],
      },
    });
    expect(bad.status).toBe(400);
    const neg = await call(path(), s.userId, {
      method: "PUT",
      json: {
        lines: [
          {
            category: "other",
            description: "x",
            quantity: 1,
            unitCostCents: -5,
            fundingSource: "request",
          },
        ],
      },
    });
    expect(neg.status).toBe(400);
    expect((await call(path(), s.viewerId)).status).toBe(200);
    expect((await call(path(), s.viewerId, { method: "PUT", json: { lines: [] } })).status).toBe(
      403,
    );
    expect((await call(path("/propose"), s.viewerId, { method: "POST", json: {} })).status).toBe(
      403,
    );
  });

  it("isolates tenants: another org's member gets 404 and cannot read or write", async () => {
    expect((await call(path(), s.otherUserId)).status).toBe(404); // not a member of s.orgId
    // Their own org, our application id: 404, nothing written.
    const asOwnOrg = (suffix = "", method = "GET", json?: unknown) =>
      call(path(suffix, s.appId, s.otherOrgId), s.otherUserId, { method, json });
    expect((await asOwnOrg()).status).toBe(404);
    expect((await asOwnOrg("", "PUT", { lines: [] })).status).toBe(404);
    expect((await asOwnOrg("/propose", "POST", {})).status).toBe(404);
    const mine = (await (await call(path(), s.userId)).json()) as BudgetDto;
    expect(mine.lines.length).toBe(1);
  });

  it("includes the saved budget table in the export", async () => {
    const res = await api(`/api/orgs/${s.orgId}/applications/${s.appId}/export?format=html`, {
      as: s.userId,
    });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('id="budget"');
    expect(html).toContain("<td>Big</td>");
    expect(html).toContain("$60,000");
  });

  it("the pipeline verifier checks budget:<lineId> citations against the saved lines", async () => {
    const b = (await (await call(path(), s.userId)).json()) as BudgetDto;
    const lineId = b.lines[0]?.id ?? "";
    const ctx = createAppContext(env);
    const content = (text: string, id = budgetRef(lineId)) => ({
      sections: [
        {
          key: "budget",
          title: "Budget",
          gaps: [],
          paragraphs: [
            {
              id: "s1.p1",
              claims: [{ id: "s1.p1.c1", text, kind: "factual" as const, factIds: [id] }],
            },
          ],
        },
      ],
    });
    const verify = (text: string, id?: string) =>
      pipelineDeps.verify(ctx, {
        orgId: s.orgId,
        applicationId: s.appId,
        content: content(text, id),
        facts: [],
        requirements: {
          sections: [],
          attachments: [],
          eligibilityCriteria: [],
          submissionInstructions: "",
          complete: true,
        },
        autopilot: false,
      });
    const ok = await verify("Other: Big, $60,000 per the saved application budget.");
    expect(ok.flags).toEqual([]);
    expect(ok.report.passed).toBe(true);
    const wrong = await verify("Other: Big, $65,000 per the saved application budget.");
    expect(wrong.report.numericMismatches).toBe(1);
    expect(wrong.flags.some((f) => f.severity === "blocker")).toBe(true);
    const ghost = await verify("Other: Big, $60,000.", "budget:bln_ghost0000000");
    expect(ghost.report.passed).toBe(false);
    // The same application id under another org: no saved budget is visible, so it fails closed.
    const cross = await pipelineDeps.verify(ctx, {
      orgId: s.otherOrgId,
      applicationId: s.appId,
      content: content("Other: Big, $60,000 per the saved application budget."),
      facts: [],
      requirements: {
        sections: [],
        attachments: [],
        eligibilityCriteria: [],
        submissionInstructions: "",
        complete: true,
      },
      autopilot: false,
    });
    expect(cross.report.passed).toBe(false);
  });
});
