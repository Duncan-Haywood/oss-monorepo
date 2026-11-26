// Post-award reporting end to end: awarding an application creates the award, its report schedule,
// report_due follow-ups and the award fact; drafting cites only facts dated in the period, never
// invents results, opens a check-in interview for gaps and runs grounding; tenant isolation.
import { env } from "cloudflare:workers";
import type { AwardDetail, AwardListItem, AwardReportDetail } from "@shared/api/awards";
import type { ApplicationContent } from "@shared/content";
import { createApp } from "@worker/app";
import {
  applications,
  applicationVersions,
  facts,
  followups,
  interviews,
  opportunities,
} from "@worker/db/schema";
import { newId } from "@worker/lib/ids";
import { TEST_USER_HEADER } from "@worker/middleware/session";
import { requireOrg } from "@worker/middleware/tenant";
import awardRoutes from "@worker/routes/org/awards";
import type { AppEnv } from "@worker/types";
import { and, eq, like } from "drizzle-orm";
import { Hono } from "hono";
import { beforeAll, describe, expect, it } from "vitest";
import {
  BASE,
  createTestOrg,
  createTestUser,
  setupTenant,
  testDb,
} from "../../../../test/worker/helpers";

// Until the integration pass exports awards.ts from db/schema/index.ts, TEST_SCHEMA_SQL lacks these
// tables. IF NOT EXISTS keeps this a no-op afterwards. DDL = `drizzle-kit export` of awards.ts.
const DDL = [
  "CREATE TABLE IF NOT EXISTS `award_reports` (`id` text PRIMARY KEY NOT NULL, `org_id` text NOT NULL, `award_id` text NOT NULL, `kind` text NOT NULL, `period_start` text NOT NULL, `period_end` text NOT NULL, `due_at` integer NOT NULL, `status` text DEFAULT 'upcoming' NOT NULL, `version_content` text, `version_number` integer DEFAULT 0 NOT NULL, `grounding_report` text, `flags` text DEFAULT '[]' NOT NULL, `checkin_interview_ids` text DEFAULT '[]' NOT NULL, `submitted_at` integer, `submitted_ref` text, `submitted_by` text, `created_at` integer NOT NULL, `updated_at` integer NOT NULL, FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade, FOREIGN KEY (`award_id`) REFERENCES `awards`(`id`) ON UPDATE no action ON DELETE cascade, FOREIGN KEY (`submitted_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null)",
  "CREATE INDEX IF NOT EXISTS `award_reports_award_idx` ON `award_reports` (`award_id`,`due_at`)",
  "CREATE INDEX IF NOT EXISTS `award_reports_org_due_idx` ON `award_reports` (`org_id`,`status`,`due_at`)",
  "CREATE TABLE IF NOT EXISTS `awards` (`id` text PRIMARY KEY NOT NULL, `org_id` text NOT NULL, `application_id` text, `project_id` text, `title` text NOT NULL, `funder_name` text NOT NULL, `amount_cents` integer, `start_date` text, `end_date` text, `grant_number` text, `terms_notes` text DEFAULT '' NOT NULL, `fact_id` text, `created_by` text, `created_at` integer NOT NULL, `updated_at` integer NOT NULL, FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade, FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE set null, FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null, FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null)",
  "CREATE INDEX IF NOT EXISTS `awards_org_idx` ON `awards` (`org_id`,`created_at`)",
  "CREATE UNIQUE INDEX IF NOT EXISTS `awards_org_app_uq` ON `awards` (`org_id`,`application_id`)",
  "CREATE INDEX IF NOT EXISTS `awards_app_idx` ON `awards` (`application_id`)",
  "CREATE INDEX IF NOT EXISTS `awards_project_idx` ON `awards` (`project_id`)",
];

// Until app.ts mounts the router, mount it on a test instance exactly as app.ts will.
const app = createApp();
const sub = new Hono<AppEnv>();
sub.use("*", requireOrg("viewer"));
sub.route("/", awardRoutes);
app.route("/api/orgs/:orgId/awards", sub);

function call(path: string, init: { method?: string; json?: unknown; as?: string } = {}) {
  const headers = new Headers();
  if (init.json !== undefined) headers.set("Content-Type", "application/json");
  if (init.as) headers.set(TEST_USER_HEADER, init.as);
  return app.fetch(
    new Request(`${BASE}${path}`, {
      method: init.method ?? "GET",
      headers,
      body: init.json !== undefined ? JSON.stringify(init.json) : undefined,
    }),
    env,
  );
}

beforeAll(async () => {
  await env.DB.batch(DDL.map((s) => env.DB.prepare(s)));
});

const claim = (id: string, text: string) => ({
  id,
  text,
  kind: "factual" as const,
  factIds: [] as string[],
});

const PROMISED: ApplicationContent = {
  sections: [
    {
      key: "need",
      title: "Statement of need",
      paragraphs: [
        { id: "s1.p1", claims: [claim("s1.p1.c1", "Youth unemployment in Gallup is high.")] },
      ],
      gaps: [],
    },
    {
      key: "goals",
      title: "Goals and objectives",
      paragraphs: [
        {
          id: "s2.p1",
          claims: [
            claim("s2.p1.c1", "We will place 40 graduates in construction jobs."),
            claim("s2.p1.c2", "We will enroll 60 youth in the carpentry training program."),
          ],
        },
      ],
      gaps: [],
    },
  ],
};

const ENROLLED =
  "The organization enrolled 52 youth in the carpentry training program between January and May 2027.";

async function addFact(
  orgId: string,
  statement: string,
  category: "outcome" | "metric" | "program",
  asOf: string | null,
) {
  const id = newId("fct");
  await testDb().insert(facts).values({
    id,
    orgId,
    category,
    statement,
    asOf,
    status: "confirmed",
    sensitivity: "public",
    confidence: 1,
    sourceType: "user_entered",
  });
  return id;
}

/** A submitted application whose final version promises two goals. */
async function seedSubmitted(orgId: string, userId: string) {
  const db = testDb();
  const oppId = newId("opp");
  await db.insert(opportunities).values({
    id: oppId,
    source: "manual",
    sourceId: oppId,
    privateToOrgId: orgId,
    funderName: "Acme Foundation",
    title: "Youth Workforce Grants",
  });
  const appId = newId("app");
  await db.insert(applications).values({
    id: appId,
    orgId,
    opportunityId: oppId,
    title: "Carpentry Pathways",
    status: "submitted",
    requestedAmountCents: 5_000_000,
    createdBy: userId,
  });
  const verId = newId("ver");
  await db.insert(applicationVersions).values({
    id: verId,
    orgId,
    applicationId: appId,
    versionNumber: 1,
    content: PROMISED,
    authorType: "system",
  });
  await db.update(applications).set({ currentVersionId: verId }).where(eq(applications.id, appId));
  return appId;
}

async function listAwards(orgId: string, userId: string) {
  const res = await call(`/api/orgs/${orgId}/awards`, { as: userId });
  return ((await res.json()) as { items: AwardListItem[] }).items;
}

async function award(orgId: string, userId: string, appId: string) {
  const res = await call(`/api/orgs/${orgId}/applications/${appId}/outcome`, {
    method: "POST",
    as: userId,
    json: {
      outcome: "awarded",
      awardedAmountCents: 5_000_000,
      award: { startDate: "2027-01-01", endDate: "2027-12-31", grantNumber: "AF-2027-14" },
    },
  });
  expect(res.status).toBe(200);
  const item = (await listAwards(orgId, userId))[0];
  if (!item) throw new Error("no award");
  return item;
}

async function draft(orgId: string, userId: string, awardId: string, reportId: string) {
  const res = await call(`/api/orgs/${orgId}/awards/${awardId}/reports/${reportId}/draft`, {
    method: "POST",
    as: userId,
  });
  expect(res.status).toBe(200);
  return (await res.json()) as AwardReportDetail;
}

const allClaims = (r: AwardReportDetail) =>
  (r.versionContent?.sections ?? []).flatMap((s) => s.paragraphs.flatMap((p) => p.claims));

const reportPath = (orgId: string, awardId: string, reportId: string, rest = "") =>
  `/api/orgs/${orgId}/awards/${awardId}/reports/${reportId}${rest}`;

describe("awarding an application", () => {
  it("creates the award, the default schedule, report_due follow-ups and the award fact", async () => {
    const { userId, orgId } = await setupTenant();
    const appId = await seedSubmitted(orgId, userId);
    const a = await award(orgId, userId, appId);
    expect(a).toMatchObject({
      applicationId: appId,
      funderName: "Acme Foundation",
      title: "Carpentry Pathways",
      amountCents: 5_000_000,
      startDate: "2027-01-01",
      endDate: "2027-12-31",
      grantNumber: "AF-2027-14",
    });
    expect(
      a.reports.map((r) => [r.kind, r.periodStart, r.periodEnd, r.dueAt.slice(0, 10)]),
    ).toEqual([
      ["interim", "2027-01-01", "2027-07-02", "2027-07-02"],
      ["final", "2027-01-01", "2027-12-31", "2028-01-30"],
    ]);
    expect(a.nextReport?.kind).toBe("interim");

    const fups = await testDb()
      .select()
      .from(followups)
      .where(and(eq(followups.orgId, orgId), eq(followups.kind, "report_due")))
      .all();
    expect(fups).toHaveLength(6);
    const interimId = a.reports[0]?.id;
    const interimDue = fups
      .filter((f) => f.dedupeKey?.startsWith(`report_due:${interimId}:`))
      .map((f) => f.dueAt.toISOString().slice(0, 10))
      .sort();
    expect(interimDue).toEqual(["2027-06-02", "2027-06-18", "2027-06-29"]);
    expect(fups.every((f) => f.applicationId === appId && f.status === "pending")).toBe(true);

    const year = new Date().getUTCFullYear();
    const fact = await testDb()
      .select()
      .from(facts)
      .where(and(eq(facts.orgId, orgId), like(facts.statement, "Awarded %")))
      .get();
    expect(fact).toMatchObject({
      id: a.factId,
      statement: `Awarded $50,000 by Acme Foundation in ${year} for Carpentry Pathways.`,
      sourceType: "user_entered",
      status: "confirmed",
      category: "financial",
      asOf: String(year),
    });

    // Recording the outcome again is idempotent.
    await award(orgId, userId, appId);
    expect(await listAwards(orgId, userId)).toHaveLength(1);
  });

  it("schedules reports once grant dates are entered later, and edits move reminders", async () => {
    const { userId, orgId } = await setupTenant();
    const created = await call(`/api/orgs/${orgId}/awards`, {
      method: "POST",
      as: userId,
      json: { funderName: "Pinon Trust", title: "Tool Library", amountCents: 1_000_000 },
    });
    expect(created.status).toBe(201);
    const d = (await created.json()) as AwardDetail;
    expect(d.reports).toEqual([]);
    expect(d.factId).toBeTruthy();
    const res = await call(`/api/orgs/${orgId}/awards/${d.id}`, {
      method: "PATCH",
      as: userId,
      json: { startDate: "2027-03-01", endDate: "2027-04-15" },
    });
    const patched = (await res.json()) as AwardDetail;
    expect(patched.reports.map((r) => r.kind)).toEqual(["final"]);
    expect(patched.followups).toHaveLength(3);
    const finalId = patched.reports[0]?.id ?? "";
    const moved = await call(reportPath(orgId, d.id, finalId), {
      method: "PATCH",
      as: userId,
      json: { dueDate: "2027-06-30" },
    });
    expect(moved.status).toBe(200);
    const after = (await (
      await call(`/api/orgs/${orgId}/awards/${d.id}`, { as: userId })
    ).json()) as AwardDetail;
    expect(after.followups.map((f) => f.dueAt.slice(0, 10)).sort()).toEqual([
      "2027-05-31",
      "2027-06-16",
      "2027-06-27",
    ]);
    const bad = await call(`/api/orgs/${orgId}/awards/${d.id}`, {
      method: "PATCH",
      as: userId,
      json: { startDate: "2027-05-01", endDate: "2027-04-01" },
    });
    expect(bad.status).toBe(400);
  });
});

describe("report drafting", () => {
  it("cites only facts dated in the period and compares promised vs achieved", async () => {
    const { userId, orgId } = await setupTenant();
    const appId = await seedSubmitted(orgId, userId);
    const inPeriod = await addFact(orgId, ENROLLED, "outcome", "2027-05");
    const oldResult = await addFact(
      orgId,
      "The organization placed 38 graduates in construction jobs.",
      "metric",
      "2024",
    );
    const undated = await addFact(
      orgId,
      "The organization placed 12 graduates in jobs.",
      "metric",
      null,
    );
    await addFact(
      orgId,
      "The organization runs a carpentry training program in Gallup.",
      "program",
      null,
    );
    const a = await award(orgId, userId, appId);
    const interimId = a.reports[0]?.id ?? "";
    const r = await draft(orgId, userId, a.id, interimId);

    expect(r.status).toBe("in_review");
    expect(r.versionNumber).toBe(1);
    const cited = new Set([
      ...allClaims(r).flatMap((c) => c.factIds),
      ...(r.versionContent?.comparisons ?? []).flatMap((c) => c.factIds),
    ]);
    expect(cited.has(inPeriod)).toBe(true);
    expect(cited.has(oldResult)).toBe(false);
    expect(cited.has(undated)).toBe(false);
    expect(r.citedFacts.map((f) => f.id).sort()).toEqual([...cited].sort());

    const cmp = r.versionContent?.comparisons ?? [];
    expect(cmp.map((c) => c.promised)).toEqual([
      "We will place 40 graduates in construction jobs.",
      "We will enroll 60 youth in the carpentry training program.",
    ]);
    expect(cmp[1]).toMatchObject({ status: "met", factIds: [inPeriod] });
    // No placement result in the period: unknown (the 2024 "38" is not this period's result).
    expect(cmp[0]).toMatchObject({ status: "unknown", achieved: null, factIds: [] });
  });

  it("turns missing metrics into gaps and a check-in interview, never invented numbers", async () => {
    const { userId, orgId } = await setupTenant();
    const appId = await seedSubmitted(orgId, userId);
    await addFact(
      orgId,
      "The organization placed 38 graduates in construction jobs.",
      "metric",
      "2024",
    );
    const a = await award(orgId, userId, appId);
    const interimId = a.reports[0]?.id ?? "";
    const r = await draft(orgId, userId, a.id, interimId);

    const cmp = r.versionContent?.comparisons ?? [];
    expect(cmp).toHaveLength(2);
    for (const c of cmp)
      expect(c).toMatchObject({ status: "unknown", achieved: null, factIds: [] });
    const text = allClaims(r)
      .map((c) => c.text)
      .join(" ");
    for (const n of ["40", "60", "38"]) expect(text).not.toContain(n);
    const outcomeGaps = r.gaps.filter((g) => g.sectionKey === "outcomes").map((g) => g.question);
    expect(outcomeGaps.some((q) => q.includes('"We will place 40 graduates'))).toBe(true);

    expect(r.checkinInterview).toMatchObject({ status: "active" });
    const interview = await testDb()
      .select()
      .from(interviews)
      .where(and(eq(interviews.id, r.checkinInterview?.id ?? ""), eq(interviews.orgId, orgId)))
      .get();
    expect(interview?.kind).toBe("follow_up");
    expect(interview?.focusApplicationId).toBe(appId);
    expect(interview?.agendaItems[0]?.question).toContain("place 40 graduates");

    // Re-drafting while the check-in is still open reuses it.
    const again = await draft(orgId, userId, a.id, interimId);
    expect(again.checkinInterviewIds).toEqual(r.checkinInterviewIds);
    expect(again.versionNumber).toBe(2);
  });

  it("runs grounding on the report, including the comparisons, and re-verifies edits", async () => {
    const { userId, orgId } = await setupTenant();
    const appId = await seedSubmitted(orgId, userId);
    await addFact(orgId, ENROLLED, "outcome", "2027-05");
    const a = await award(orgId, userId, appId);
    const interimId = a.reports[0]?.id ?? "";
    const r = await draft(orgId, userId, a.id, interimId);
    const g = r.groundingReport;
    expect(g).not.toBeNull();
    const ids = new Set(g?.verdicts.map((v) => v.claimId));
    for (const c of allClaims(r)) expect(ids.has(c.id)).toBe(true);
    expect(ids.has("cmp.g2")).toBe(true);
    expect(g?.gaps).toBeGreaterThan(0);
    expect(g?.passed).toBe(false);

    // An edit that adds an invented figure is flagged by the verifier.
    const cited = allClaims(r).find((c) => c.kind === "factual" && c.factIds.length > 0);
    const res = await call(reportPath(orgId, a.id, interimId), {
      method: "PATCH",
      as: userId,
      json: {
        section: {
          key: "outcomes",
          paragraphs: [
            {
              id: "r3.p1",
              claims: [
                {
                  id: "r3.p1.c1",
                  text: "We enrolled 95 youth.",
                  kind: "factual",
                  factIds: cited?.factIds ?? [],
                },
              ],
            },
          ],
        },
      },
    });
    expect(res.status).toBe(200);
    const edited = (await res.json()) as AwardReportDetail;
    expect(edited.versionNumber).toBe(2);
    expect(edited.groundingReport?.numericMismatches).toBeGreaterThan(0);
    expect(
      edited.flags.some((f) => f.kind === "numeric_mismatch" && f.claimId === "r3.p1.c1"),
    ).toBe(true);
  });

  it("exports DOCX and marks a report submitted with a reference", async () => {
    const { userId, orgId } = await setupTenant();
    const appId = await seedSubmitted(orgId, userId);
    const a = await award(orgId, userId, appId);
    const interimId = a.reports[0]?.id ?? "";
    const exportPath = reportPath(orgId, a.id, interimId, "/export?format=docx");
    expect((await call(exportPath, { as: userId })).status).toBe(409);
    await draft(orgId, userId, a.id, interimId);
    const doc = await call(exportPath, { as: userId });
    expect(doc.status).toBe(200);
    expect(doc.headers.get("Content-Type")).toContain("wordprocessingml");
    const bytes = new Uint8Array(await doc.arrayBuffer());
    expect([bytes[0], bytes[1]]).toEqual([0x50, 0x4b]); // "PK" (zip)

    const submitted = await call(reportPath(orgId, a.id, interimId, "/submit"), {
      method: "POST",
      as: userId,
      json: { externalRef: "Portal #8812" },
    });
    expect(submitted.status).toBe(200);
    expect(await submitted.json()).toMatchObject({
      status: "submitted",
      submittedRef: "Portal #8812",
    });
    const reminders = await testDb()
      .select()
      .from(followups)
      .where(
        and(eq(followups.orgId, orgId), like(followups.dedupeKey, `report_due:${interimId}:%`)),
      )
      .all();
    expect(reminders.length).toBeGreaterThan(0);
    expect(reminders.every((f) => f.status === "skipped")).toBe(true);
    const twice = await call(reportPath(orgId, a.id, interimId, "/submit"), {
      method: "POST",
      as: userId,
      json: {},
    });
    expect(twice.status).toBe(409);
  });
});

describe("tenant isolation", () => {
  it("never shows or changes another org's awards and reports", async () => {
    const owner = await setupTenant();
    const appId = await seedSubmitted(owner.orgId, owner.userId);
    const a = await award(owner.orgId, owner.userId, appId);
    const reportId = a.reports[0]?.id ?? "";
    const intruder = await setupTenant();
    const o = intruder.orgId;
    const as = intruder.userId;

    expect(await listAwards(o, as)).toEqual([]);
    const attempts: [string, string, unknown?][] = [
      ["GET", `/api/orgs/${o}/awards/${a.id}`],
      ["PATCH", `/api/orgs/${o}/awards/${a.id}`, { grantNumber: "X" }],
      ["GET", reportPath(o, a.id, reportId)],
      ["PATCH", reportPath(o, a.id, reportId), { dueDate: "2027-01-01" }],
      ["POST", reportPath(o, a.id, reportId, "/draft")],
      ["POST", reportPath(o, a.id, reportId, "/submit"), {}],
      ["GET", reportPath(o, a.id, reportId, "/export?format=docx")],
      ["DELETE", reportPath(o, a.id, reportId)],
      ["POST", `/api/orgs/${o}/awards`, { applicationId: appId }],
    ];
    for (const [method, path, json] of attempts) {
      const res = await call(path, { method, as, json });
      expect(res.status, `${method} ${path}`).toBe(404);
    }
    // A non-member can't reach the owner's org at all.
    const outsider = await createTestUser();
    expect((await call(`/api/orgs/${owner.orgId}/awards`, { as: outsider.id })).status).toBe(404);
    // Viewers read but can't write.
    const viewer = await createTestUser();
    const { orgId: viewerOrg } = await createTestOrg(viewer.id, { role: "viewer" });
    expect((await call(`/api/orgs/${viewerOrg}/awards`, { as: viewer.id })).status).toBe(200);
    const write = await call(`/api/orgs/${viewerOrg}/awards`, {
      method: "POST",
      as: viewer.id,
      json: { funderName: "X", title: "Y" },
    });
    expect(write.status).toBe(403);
    // The owner's award and report are untouched.
    const mine = (await (
      await call(`/api/orgs/${owner.orgId}/awards/${a.id}`, { as: owner.userId })
    ).json()) as AwardDetail;
    expect(mine.grantNumber).toBe("AF-2027-14");
    expect(mine.reports.find((r) => r.id === reportId)?.status).toBe("upcoming");
    expect(mine.followups).toHaveLength(6);
  });
});
