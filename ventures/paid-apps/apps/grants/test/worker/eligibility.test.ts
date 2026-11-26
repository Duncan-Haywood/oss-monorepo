// Eligibility intelligence in workerd: criteria extraction (verbatim quotes, cache), the checklist
// (deterministic rules, cited assessment, unknown-never-met), the router and tenant isolation.
import { env } from "cloudflare:workers";
import type { EligibilityCheckDto } from "@shared/eligibility";
import { createAppContext } from "@worker/context";
import { facts, member, opportunities, orgProfiles } from "@worker/db/schema";
import { opportunityCriteria, orgEligibility } from "@worker/db/schema/eligibility";
import { AppError } from "@worker/lib/errors";
import { newId } from "@worker/lib/ids";
import { sessionMiddleware, TEST_USER_HEADER } from "@worker/middleware/session";
import { requireOrg } from "@worker/middleware/tenant";
import { FakeLlm } from "@worker/ports/fake-llm";
import { allFakeHandlers } from "@worker/ports/fake-llm-handlers";
import eligibilityRoutes from "@worker/routes/org/eligibility";
import { getOpportunity } from "@worker/services/discovery";
import {
  ASSESS_PURPOSE,
  checkEligibility,
  EXTRACT_PURPOSE,
  extractCriteria,
} from "@worker/services/eligibility";
import { fakeHandlers as eligibilityFakes } from "@worker/services/eligibility/fake-llm";
import type { AppEnv } from "@worker/types";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { beforeAll, describe, expect, it } from "vitest";
import { createTestUser, setupTenant, testDb } from "./helpers";

// Matches db/schema/eligibility.ts (drizzle-kit export) until the schema index exports it.
const DDL = [
  `CREATE TABLE IF NOT EXISTS \`opportunity_criteria\` (
    \`opportunity_id\` text PRIMARY KEY NOT NULL,
    \`criteria\` text NOT NULL,
    \`model\` text NOT NULL,
    \`source_hash\` text NOT NULL,
    \`created_at\` integer NOT NULL,
    FOREIGN KEY (\`opportunity_id\`) REFERENCES \`opportunities\`(\`id\`) ON UPDATE no action ON DELETE cascade
  )`,
  `CREATE TABLE IF NOT EXISTS \`org_eligibility\` (
    \`org_id\` text NOT NULL,
    \`opportunity_id\` text NOT NULL,
    \`result\` text NOT NULL,
    \`checked_at\` integer NOT NULL,
    PRIMARY KEY(\`org_id\`, \`opportunity_id\`),
    FOREIGN KEY (\`org_id\`) REFERENCES \`organization\`(\`id\`) ON UPDATE no action ON DELETE cascade,
    FOREIGN KEY (\`opportunity_id\`) REFERENCES \`opportunities\`(\`id\`) ON UPDATE no action ON DELETE cascade
  )`,
];

beforeAll(async () => {
  await env.DB.batch(DDL.map((s) => env.DB.prepare(s)));
});

const NONPROFIT = "Nonprofits having a 501(c)(3) status with the IRS";
const db = () => testDb();
const fakeLlm = () => new FakeLlm({ ...allFakeHandlers, ...eligibilityFakes });

async function insertOpp(v: Partial<typeof opportunities.$inferInsert> = {}) {
  const id = newId("opp");
  await db()
    .insert(opportunities)
    .values({
      id,
      source: "manual",
      sourceId: id,
      funderName: "Sample Foundation",
      title: "Construction Trades Training Grant",
      status: "posted",
      closeDate: new Date(Date.now() + 60 * 86_400_000),
      applicantTypes: [NONPROFIT],
      ...v,
    });
  return id;
}

/** SWIF-like tenant: 501(c)(3) in Gallup, NM, no UEI on file, one confirmed fact. */
async function seedOrg(role: "owner" | "viewer" = "owner") {
  const t = await setupTenant(role);
  await db()
    .update(orgProfiles)
    .set({
      orgType: "nonprofit_501c3",
      ein: "85-0000000",
      uei: null,
      foundedYear: 1968,
      serviceAreas: ["Gallup, NM", "McKinley County, NM", "Navajo Nation"],
    })
    .where(eq(orgProfiles.orgId, t.orgId));
  const factId = newId("fct");
  await db().insert(facts).values({
    id: factId,
    orgId: t.orgId,
    category: "population_served",
    statement: "The organization trains Native American young adults in construction trades.",
    status: "confirmed",
    sourceType: "user_entered",
  });
  return { ...t, factId };
}

/** The org router mounted like app.ts will, with a FakeLlm that knows eligibility.* purposes. */
function testApp(llm: FakeLlm) {
  const app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    c.set("ctx", createAppContext(c.env, { llm }));
    await next();
  });
  app.use("*", sessionMiddleware);
  const org = new Hono<AppEnv>();
  org.use("*", requireOrg("viewer"));
  org.route("/eligibility", eligibilityRoutes);
  app.route("/api/orgs/:orgId", org);
  app.onError((err, c) =>
    err instanceof AppError
      ? c.json({ error: { code: err.code, message: err.message } }, err.status)
      : c.json({ error: { code: "internal_error", message: String(err) } }, 500),
  );
  return {
    call: (path: string, as: string, method = "GET") =>
      app.request(path, { method, headers: { [TEST_USER_HEADER]: as } }, env),
  };
}

describe("extractCriteria", () => {
  it("keeps only criteria whose sourceQuote is verbatim, caches per opportunity, re-extracts on change", async () => {
    const oppId = await insertOpp({
      eligibilityText:
        "Applicants must have at least two years of program operating history. Projects must be located in New Mexico or Arizona.",
    });
    const llm = fakeLlm().on(EXTRACT_PURPOSE, () => ({
      criteria: [
        {
          kind: "years_operating",
          text: "Two years of operating history.",
          sourceQuote: "applicants must have at least two years of program operating history",
        },
        {
          kind: "geography",
          text: "Must be in the Southwest.",
          sourceQuote: "Projects must be located in the American Southwest", // paraphrase
        },
        {
          kind: "registration",
          text: "SAM required.",
          sourceQuote: "Applicants must hold an active SAM.gov registration", // invented
        },
      ],
    }));
    const ctx = createAppContext(env, { llm });
    const t = await seedOrg();
    const opp = await getOpportunity(ctx, t.orgId, oppId);

    const first = await extractCriteria(ctx, opp, { orgId: t.orgId });
    expect(first.cached).toBe(false);
    expect(first.criteria).toEqual([
      expect.objectContaining({ id: "c1", kind: "years_operating" }),
      expect.objectContaining({ id: "c2", kind: "applicant_type", sourceQuote: NONPROFIT }),
    ]);
    const row = await db()
      .select()
      .from(opportunityCriteria)
      .where(eq(opportunityCriteria.opportunityId, oppId))
      .get();
    expect(row?.criteria).toHaveLength(2);
    expect(row?.model).toBe("fake-llm");

    const again = await extractCriteria(ctx, opp, { orgId: t.orgId });
    expect(again.cached).toBe(true);
    expect(llm.calls.filter((c) => c.purpose === EXTRACT_PURPOSE)).toHaveLength(1);

    await db()
      .update(opportunities)
      .set({
        eligibilityText: "Applicants must have at least two years of program operating history.",
      })
      .where(eq(opportunities.id, oppId));
    const changed = await extractCriteria(ctx, await getOpportunity(ctx, t.orgId, oppId));
    expect(changed.cached).toBe(false);
    expect(llm.calls.filter((c) => c.purpose === EXTRACT_PURPOSE)).toHaveLength(2);
  });
});

describe("checkEligibility", () => {
  it("decides applicant type and geography deterministically, without asking the model", async () => {
    const t = await seedOrg();
    const llm = fakeLlm();
    const ctx = createAppContext(env, { llm });

    const nm = await insertOpp({
      eligibilityText: "Projects must be located in New Mexico or Arizona.",
    });
    const ok = await checkEligibility(ctx, t.orgId, nm);
    expect(ok.checklist).toEqual([
      expect.objectContaining({
        kind: "applicant_type",
        status: "met",
        method: "deterministic",
        sourceQuote: NONPROFIT,
        evidence: [expect.objectContaining({ ref: "profile:orgType" })],
      }),
      expect.objectContaining({
        kind: "geography",
        status: "met",
        method: "deterministic",
        evidence: [expect.objectContaining({ ref: "profile:state", kind: "profile" })],
      }),
    ]);
    expect(ok.overall).toBe("eligible");
    expect(ok.missingInfoQuestions).toEqual([]);
    expect(llm.calls.filter((c) => c.purpose === ASSESS_PURPOSE)).toHaveLength(0);

    const texas = await insertOpp({
      eligibilityText: "Projects must be located in Texas.",
      applicantTypes: ["State governments", "County governments"],
    });
    const no = await checkEligibility(ctx, t.orgId, texas);
    expect(no.overall).toBe("ineligible");
    expect(no.checklist.map((i) => [i.kind, i.status, i.method])).toEqual([
      ["applicant_type", "not_met", "deterministic"],
      ["geography", "not_met", "deterministic"],
    ]);
    const stored = await db()
      .select()
      .from(orgEligibility)
      .where(and(eq(orgEligibility.orgId, t.orgId), eq(orgEligibility.opportunityId, texas)))
      .get();
    expect(stored?.result.overall).toBe("ineligible");
  });

  it("anything the model cannot prove is unknown, never met; unknowns become interview questions", async () => {
    const t = await seedOrg();
    const other = await seedOrg(); // a fact id from another tenant must not count as evidence
    const oppId = await insertOpp({
      eligibilityText:
        "Applicants must have an active SAM.gov registration. Annual operating budget must be under $5 million. Programs must serve Native American young adults in construction trades.",
    });
    const llm = fakeLlm().on(ASSESS_PURPOSE, (req) => {
      const ids = [...req.prompt.matchAll(/^\[(c\d+)\]/gm)].map((m) => m[1] ?? "");
      return {
        assessments: ids.map((criterionId, i) => ({
          criterionId,
          status: "met",
          reason: "Looks fine.",
          evidence: [
            ["profile:uei"], // empty profile field
            [other.factId], // other tenant's fact
            [t.factId], // genuine
            ["fct_madeup"],
          ][i % 4],
          question: null,
        })),
      };
    });
    const r = await checkEligibility(createAppContext(env, { llm }), t.orgId, oppId);

    const assessPrompt = llm.calls.find((c) => c.purpose === ASSESS_PURPOSE);
    expect(assessPrompt?.context).toContain(t.factId);
    expect(assessPrompt?.context).not.toContain(other.factId);
    expect(assessPrompt?.context).toContain("profile:uei: (not on file)");

    const byKind = Object.fromEntries(r.checklist.map((i) => [i.kind, i]));
    expect(byKind.registration).toMatchObject({ status: "unknown", evidence: [] });
    expect(byKind.budget_size).toMatchObject({ status: "unknown", evidence: [] });
    expect(byKind.population).toMatchObject({
      status: "met",
      method: "assessed",
      evidence: [{ ref: t.factId, kind: "fact", factStatus: "confirmed" }],
    });
    expect(byKind.applicant_type).toMatchObject({ status: "met", method: "deterministic" });
    expect(r.checklist.filter((i) => i.status === "met")).toHaveLength(2);
    expect(r.overall).toBe("likely");
    expect(r.missingInfoQuestions.map((q) => q.question)).toEqual([
      expect.stringMatching(/SAM\.gov/),
      expect.stringMatching(/budget/),
    ]);
  });

  it("treats a model failure as unknown rather than failing the check", async () => {
    const t = await seedOrg();
    const oppId = await insertOpp({
      eligibilityText: "Applicants must have a board of directors.",
    });
    const llm = fakeLlm().on(ASSESS_PURPOSE, () => ({ nope: true }));
    const r = await checkEligibility(createAppContext(env, { llm }), t.orgId, oppId);
    expect(r.assessModel).toBeNull();
    expect(r.checklist.find((i) => i.kind === "other")).toMatchObject({
      status: "unknown",
      method: "none",
    });
    expect(r.overall).toBe("likely");
  });
});

describe("/api/orgs/:orgId/eligibility", () => {
  it("GET computes for editors and caches; viewers read only; recheck needs editor", async () => {
    const t = await seedOrg();
    const llm = fakeLlm();
    const app = testApp(llm);
    const oppId = await insertOpp({ eligibilityText: "Projects must be located in New Mexico." });

    const viewer = await createTestUser();
    await db()
      .insert(member)
      .values({
        id: newId("mem"),
        organizationId: t.orgId,
        userId: viewer.id,
        role: "viewer",
      });
    const before = await app.call(`/api/orgs/${t.orgId}/eligibility/${oppId}`, viewer.id);
    expect(before.status).toBe(404);
    expect(((await before.json()) as { error: { code: string } }).error.code).toBe("not_checked");

    const res = await app.call(`/api/orgs/${t.orgId}/eligibility/${oppId}`, t.userId);
    expect(res.status).toBe(200);
    const body = (await res.json()) as EligibilityCheckDto;
    expect(body.overall).toBe("eligible");
    expect(typeof body.checkedAt).toBe("string");
    const extracts = llm.calls.length;

    const cached = await app.call(`/api/orgs/${t.orgId}/eligibility/${oppId}`, viewer.id);
    expect(cached.status).toBe(200);
    expect(((await cached.json()) as EligibilityCheckDto).checkedAt).toBe(body.checkedAt);
    expect(llm.calls.length).toBe(extracts);

    const denied = await app.call(
      `/api/orgs/${t.orgId}/eligibility/${oppId}/recheck`,
      viewer.id,
      "POST",
    );
    expect(denied.status).toBe(403);
    const re = await app.call(
      `/api/orgs/${t.orgId}/eligibility/${oppId}/recheck`,
      t.userId,
      "POST",
    );
    expect(re.status).toBe(200);
  });

  it("isolates tenants: no access to other orgs, their private opportunities or their results", async () => {
    const a = await seedOrg();
    const b = await seedOrg();
    const app = testApp(fakeLlm());
    const privateToA = await insertOpp({
      privateToOrgId: a.orgId,
      eligibilityText: "Programs must serve Native American young adults in construction trades.",
    });
    const publicOpp = await insertOpp({
      eligibilityText: "Programs must serve Native American young adults in construction trades.",
    });

    const own = await app.call(`/api/orgs/${a.orgId}/eligibility/${privateToA}`, a.userId);
    expect(own.status).toBe(200);
    const aBody = (await own.json()) as EligibilityCheckDto;
    expect(JSON.stringify(aBody)).toContain(a.factId);

    // B cannot use A's org path, nor see A's private opportunity through its own org.
    expect(
      (await app.call(`/api/orgs/${a.orgId}/eligibility/${privateToA}`, b.userId)).status,
    ).toBe(404);
    expect(
      (await app.call(`/api/orgs/${b.orgId}/eligibility/${privateToA}`, b.userId)).status,
    ).toBe(404);
    expect(
      (await app.call(`/api/orgs/${b.orgId}/eligibility/${privateToA}/recheck`, b.userId, "POST"))
        .status,
    ).toBe(404);

    // Public opportunity: each org gets its own result built from its own facts only.
    const aPub = (await (
      await app.call(`/api/orgs/${a.orgId}/eligibility/${publicOpp}`, a.userId)
    ).json()) as EligibilityCheckDto;
    const bPub = (await (
      await app.call(`/api/orgs/${b.orgId}/eligibility/${publicOpp}`, b.userId)
    ).json()) as EligibilityCheckDto;
    expect(JSON.stringify(aPub)).toContain(a.factId);
    expect(JSON.stringify(bPub)).toContain(b.factId);
    expect(JSON.stringify(bPub)).not.toContain(a.factId);
    const rows = await db()
      .select({ orgId: orgEligibility.orgId })
      .from(orgEligibility)
      .where(eq(orgEligibility.opportunityId, publicOpp))
      .all();
    expect(rows.map((r) => r.orgId).sort()).toEqual([a.orgId, b.orgId].sort());
    const leaked = await db()
      .select()
      .from(orgEligibility)
      .where(and(eq(orgEligibility.orgId, b.orgId), eq(orgEligibility.opportunityId, privateToA)))
      .get();
    expect(leaked).toBeUndefined();
  });
});
