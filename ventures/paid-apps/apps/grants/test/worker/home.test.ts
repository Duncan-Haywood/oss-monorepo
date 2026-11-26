// GET /api/orgs/:orgId/home: the personalized grant plan, computed from seeded state, plus tenant
// isolation (another org's facts, drafts, matches and private grants never leak in).
import { env } from "cloudflare:workers";
import type { HomePlanDto } from "@shared/api/home";
import type { ApplicationStatus, MatchStatus } from "@shared/enums";
import { createAppContext } from "@worker/context";
import {
  applicationFlags,
  applications,
  applicationVersions,
  documents,
  facts,
  member,
  opportunities,
  opportunityMatches,
  orgProfiles,
  orgSettings,
  submissions,
} from "@worker/db/schema";
import { AppError } from "@worker/lib/errors";
import { newId } from "@worker/lib/ids";
import { sessionMiddleware, TEST_USER_HEADER } from "@worker/middleware/session";
import { requireOrg } from "@worker/middleware/tenant";
import homeRoutes from "@worker/routes/org/home";
import type { AppEnv } from "@worker/types";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { beforeAll, describe, expect, it } from "vitest";
import { createTestOrg, createTestUser, testDb } from "./helpers";

const DAY = 86_400_000;
const NOW = new Date();
const inDays = (n: number) => new Date(NOW.getTime() + n * DAY);
const db = () => testDb();

/** The org router mounted the way app.ts mounts it at /api/orgs/:orgId/home, with a fixed clock. */
function testApp() {
  const app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    c.set("ctx", createAppContext(c.env, { now: () => NOW }));
    await next();
  });
  app.use("*", sessionMiddleware);
  const org = new Hono<AppEnv>();
  org.use("*", requireOrg("viewer"));
  org.route("/home", homeRoutes);
  app.route("/api/orgs/:orgId", org);
  app.onError((err, c) =>
    err instanceof AppError
      ? c.json({ error: { code: err.code, message: err.message } }, err.status)
      : c.json({ error: { code: "internal_error", message: String(err) } }, 500),
  );
  return (orgId: string, as: string) =>
    app.request(`/api/orgs/${orgId}/home`, { headers: { [TEST_USER_HEADER]: as } }, env);
}
const get = testApp();

async function plan(orgId: string, as: string): Promise<HomePlanDto> {
  const res = await get(orgId, as);
  expect(res.status).toBe(200);
  return (await res.json()) as HomePlanDto;
}

// ---------- seeding ----------

async function insertOpp(v: Partial<typeof opportunities.$inferInsert> & { title: string }) {
  const id = newId("opp");
  await db()
    .insert(opportunities)
    .values({
      id,
      source: "manual",
      sourceId: id,
      funderName: "Sample Foundation",
      status: "posted",
      closeDate: inDays(30),
      ...v,
    });
  return id;
}

async function insertMatch(
  orgId: string,
  opportunityId: string,
  v: Partial<typeof opportunityMatches.$inferInsert> & { status: MatchStatus },
) {
  const id = newId("mat");
  await db()
    .insert(opportunityMatches)
    .values({
      id,
      orgId,
      opportunityId,
      fitScore: 80,
      likelihood: 0.3,
      eligibility: "eligible",
      ...v,
    });
  return id;
}

async function insertApp(
  orgId: string,
  opportunityId: string,
  v: Partial<typeof applications.$inferInsert> & { title: string; status: ApplicationStatus },
) {
  const id = newId("app");
  const versionId = newId("ver");
  await db()
    .insert(applications)
    .values({ id, orgId, opportunityId, ...v });
  await db()
    .insert(applicationVersions)
    .values({
      id: versionId,
      orgId,
      applicationId: id,
      versionNumber: 1,
      content: { sections: [] },
      authorType: "system",
    });
  return { id, versionId };
}

async function insertGapFlag(
  orgId: string,
  app: { id: string; versionId: string },
  message: string,
) {
  await db()
    .insert(applicationFlags)
    .values({
      id: newId("flg"),
      orgId,
      applicationId: app.id,
      versionId: app.versionId,
      severity: "blocker",
      kind: "missing_info",
      sectionKey: "evaluation",
      message,
      suggestedQuestion: "What measurable outcomes did last year's cohort achieve?",
    });
}

async function insertDocWithFacts(
  orgId: string,
  title: string,
  n: number,
  status: "proposed" | "confirmed" = "proposed",
) {
  const docId = newId("doc");
  await db()
    .insert(documents)
    .values({
      id: docId,
      orgId,
      title,
      kind: "annual_report",
      mimeType: "application/pdf",
      sizeBytes: 1000,
      sha256: docId,
      r2Key: `orgs/${orgId}/documents/${docId}/original`,
      status: "ready",
    });
  // One statement per row (a batch) so seeding stays under D1's 100-parameter limit.
  const [first, ...rest] = Array.from({ length: n }, (_, i) =>
    db()
      .insert(facts)
      .values({
        id: newId("fct"),
        orgId,
        category: "program",
        statement: `${title} program fact ${i}`,
        status,
        sourceType: "document",
        sourceDocumentId: docId,
        sourceQuote: `quote ${i}`,
      }),
  );
  if (first) await db().batch([first, ...rest]);
  return docId;
}

async function insertFact(orgId: string, v: Partial<typeof facts.$inferInsert> = {}) {
  await db()
    .insert(facts)
    .values({
      id: newId("fct"),
      orgId,
      category: "outcome",
      statement: "Placed graduates in jobs",
      status: "confirmed",
      sourceType: "user_entered",
      ...v,
    });
}

/** Org with a user named "Ana Begay"; profile focused on workforce development in Gallup, NM. */
async function seedOrg(name: string, role: "owner" | "viewer" | "reviewer" = "owner") {
  const user = await createTestUser({ name: "Ana Begay" });
  const { orgId } = await createTestOrg(user.id, { name, role });
  await db()
    .update(orgProfiles)
    .set({
      focusAreas: ["workforce development", "construction trades"],
      serviceAreas: ["Gallup, NM", "McKinley County, NM"],
      orgType: "nonprofit_501c3",
      uei: null,
    })
    .where(eq(orgProfiles.orgId, orgId));
  return { orgId, userId: user.id };
}

async function addMember(orgId: string, role: "viewer" | "reviewer" | "editor") {
  const u = await createTestUser({ name: "Lee Viewer" });
  await db()
    .insert(member)
    .values({ id: newId("mem"), organizationId: orgId, userId: u.id, role });
  return u.id;
}

// ---------- the busy org ----------

interface Busy {
  orgId: string;
  userId: string;
  needsInfo: { id: string; versionId: string };
  inReview: { id: string; versionId: string };
  manualApp: { id: string };
  manualSubId: string;
  annualReportId: string;
  shortlistedOppId: string;
  otherOrg: { orgId: string; userId: string; secretTitles: string[] };
}
let busy: Busy;

beforeAll(async () => {
  const { orgId, userId } = await seedOrg("Gallup Trades Academy");

  // Facts: 7 proposed program facts from the Annual Report, 1 confirmed outcome (outcomes = thin).
  const annualReportId = await insertDocWithFacts(orgId, "Annual Report", 7);
  await insertFact(orgId);

  // Drafts in flight.
  const oppA = await insertOpp({
    title: "Navajo Youth Trades Fund",
    funderName: "Pinon Foundation",
  });
  const oppB = await insertOpp({ title: "Rural Skills Initiative", funderName: "Mesa Trust" });
  const oppC = await insertOpp({
    title: "State Apprenticeship Grant",
    funderName: "NM Workforce Solutions",
    closeDate: inDays(40),
  });
  await insertMatch(orgId, oppA, { status: "drafting", expectedValueCents: 1_000_000 });
  const needsInfo = await insertApp(orgId, oppA, {
    title: "Youth Trades 2027",
    status: "needs_info",
    deadline: inDays(12),
  });
  const inReview = await insertApp(orgId, oppB, {
    title: "Rural Skills 2027",
    status: "in_review",
    reviewTier: "one_click",
    deadline: inDays(12),
  });
  await insertGapFlag(orgId, needsInfo, "No outcome data for the evaluation section");
  await insertGapFlag(orgId, needsInfo, "Missing outcomes for the 2025 cohort");
  await insertGapFlag(orgId, inReview, "Impact numbers are missing");
  const manualApp = await insertApp(orgId, oppC, {
    title: "Apprenticeship 2027",
    status: "submitting",
  });
  const manualSubId = newId("sub");
  await db()
    .insert(submissions)
    .values({
      id: manualSubId,
      orgId,
      applicationId: manualApp.id,
      versionId: manualApp.versionId,
      channel: "manual",
      status: "pending",
      packageR2Key: `orgs/${orgId}/submissions/${manualSubId}/package.json`,
      packageSha256: "x",
      submittedByType: "user",
    });

  // Outcomes: one win, one loss (win rate 50%).
  const oppWon = await insertOpp({ title: "Won Grant", status: "closed", closeDate: inDays(-100) });
  const oppLost = await insertOpp({
    title: "Lost Grant",
    status: "closed",
    closeDate: inDays(-90),
  });
  await insertApp(orgId, oppWon, {
    title: "Won",
    status: "awarded",
    awardedAmountCents: 2_500_000,
  });
  await insertApp(orgId, oppLost, { title: "Lost", status: "declined" });

  // Matches: two new federal ones, a shortlisted foundation grant, and noise that must be skipped.
  const fed1 = await insertOpp({
    title: "Workforce Development Training Grants",
    funderName: "U.S. Department of Labor",
    source: "grants_gov",
    closeDate: inDays(20),
  });
  const fed2 = await insertOpp({
    title: "Construction Trades Apprenticeship Expansion",
    funderName: "U.S. Department of Labor",
    source: "grants_gov",
    closeDate: inDays(50),
  });
  await insertMatch(orgId, fed1, { status: "new", expectedValueCents: 300_000 });
  await insertMatch(orgId, fed2, { status: "new", expectedValueCents: 200_000 });
  const shortlistedOppId = await insertOpp({
    title: "Community Builders Award",
    funderName: "Four Corners Fund",
    closeDate: inDays(30),
  });
  await insertMatch(orgId, shortlistedOppId, {
    status: "shortlisted",
    expectedValueCents: 500_000,
  });
  const far = await insertOpp({ title: "Far Future Grant", closeDate: inDays(120) });
  await insertMatch(orgId, far, { status: "shortlisted", expectedValueCents: 10 });
  const weak = await insertOpp({ title: "Weak Fit Grant", closeDate: inDays(15) });
  await insertMatch(orgId, weak, { status: "new", fitScore: 30 });
  const nope = await insertOpp({ title: "Ineligible Grant", closeDate: inDays(15) });
  await insertMatch(orgId, nope, { status: "new", eligibility: "ineligible" });

  // ---- another tenant, with more of everything ----
  const other = await seedOrg("Other Tenant Org");
  await insertDocWithFacts(other.orgId, "Secret Strategic Plan", 30);
  const otherOpp = await insertOpp({ title: "Other Tenant Opportunity", closeDate: inDays(9) });
  await insertMatch(other.orgId, otherOpp, {
    status: "shortlisted",
    expectedValueCents: 99_000_000,
  });
  const otherApp = await insertApp(other.orgId, otherOpp, {
    title: "Other Tenant Draft",
    status: "in_review",
    deadline: inDays(3),
  });
  await insertGapFlag(other.orgId, otherApp, "Missing outcomes everywhere");
  await insertApp(other.orgId, oppWon, {
    title: "Other Tenant Award",
    status: "awarded",
    awardedAmountCents: 50_000_000,
  });
  // A grant private to the other tenant, plus a (corrupt) match row in our org pointing at it.
  const privateOpp = await insertOpp({
    title: "Other Tenant Private Import",
    privateToOrgId: other.orgId,
    closeDate: inDays(10),
  });
  await insertMatch(orgId, privateOpp, { status: "shortlisted", expectedValueCents: 7_777_700 });

  busy = {
    orgId,
    userId,
    needsInfo,
    inReview,
    manualApp,
    manualSubId,
    annualReportId,
    shortlistedOppId,
    otherOrg: {
      ...other,
      secretTitles: [
        "Secret Strategic Plan",
        "Other Tenant Opportunity",
        "Other Tenant Draft",
        "Other Tenant Private Import",
      ],
    },
  };
});

describe("GET /home: next best actions", () => {
  it("ranks the busy org's real next steps, with reasons and in-app links", async () => {
    const p = await plan(busy.orgId, busy.userId);
    const base = `/orgs/${busy.orgId}`;
    expect(p.nextBestActions).toHaveLength(5);
    expect(p.nextBestActions.map((a) => a.kind)).toEqual([
      "answer_questions",
      "confirm_submission",
      "review_draft",
      "fill_gap",
      "add_uei",
    ]);
    const [answer, confirm, review, gap, uei] = p.nextBestActions;
    expect(answer).toMatchObject({
      title: "Answer 2 questions for Youth Trades 2027 (due in 12 days)",
      href: `${base}/applications/${busy.needsInfo.id}`,
      priority: "high",
    });
    expect(confirm).toMatchObject({
      title: "Mark the manual submission to NM Workforce Solutions as submitted",
      href: `${base}/applications/${busy.manualApp.id}`,
    });
    expect(review).toMatchObject({
      title: "Review the draft for Rural Skills 2027 (due in 12 days)",
      reason: "Fact-checked and ready for one-click approval for Mesa Trust.",
      href: `${base}/applications/${busy.inReview.id}`,
    });
    expect(gap).toMatchObject({
      id: "fill_gap:outcomes",
      title: "Your fact base is thin on Outcomes; a 10-minute interview would strengthen 2 drafts",
      href: `${base}/interviews`,
    });
    expect(uei).toMatchObject({
      title: "Add your SAM.gov UEI to qualify for 2 federal grants",
      href: `${base}/settings/general`,
    });
    for (const a of p.nextBestActions) {
      expect(a.reason.length).toBeGreaterThan(0);
      expect(a.href.startsWith(`${base}/`)).toBe(true);
    }
  });

  it("names the document, the focus area and the UEI for a newer org", async () => {
    const { orgId, userId } = await seedOrg("Newer Org");
    const docId = await insertDocWithFacts(orgId, "Annual Report", 7);
    for (const [i, days] of [20, 35].entries()) {
      const opp = await insertOpp({
        title: `Workforce Development Pathways ${i}`,
        source: "grants_gov",
        funderName: "U.S. Department of Labor",
        closeDate: inDays(days),
      });
      await insertMatch(orgId, opp, { status: "new" });
    }
    const p = await plan(orgId, userId);
    const titles = p.nextBestActions.map((a) => a.title);
    expect(titles).toEqual([
      "Add your SAM.gov UEI to qualify for 2 federal grants",
      "Confirm 7 facts extracted from your Annual Report",
      "2 new grants match your focus on workforce development",
      "Your fact base has nothing on Outcomes yet; a 10-minute interview would fill it in",
    ]);
    expect(p.nextBestActions[1]?.href).toBe(`/orgs/${orgId}/knowledge/documents/${docId}`);
    expect(p.nextBestActions[2]?.href).toBe(`/orgs/${orgId}/opportunities`);

    // Once the UEI is on file the nudge disappears.
    await db().update(orgProfiles).set({ uei: "ABCDEF123456" }).where(eq(orgProfiles.orgId, orgId));
    const after = await plan(orgId, userId);
    expect(after.nextBestActions.map((a) => a.kind)).not.toContain("add_uei");
  });

  it("starts a brand-new org with uploads and an onboarding interview", async () => {
    const { orgId, userId } = await seedOrg("Brand New Org");
    const p = await plan(orgId, userId);
    expect(p.firstRun).toBe(true);
    expect(p.nextBestActions.map((a) => a.kind)).toEqual([
      "upload_documents",
      "onboarding_interview",
    ]);
    expect(p.nextBestActions[1]?.title).toBe(
      "Tell us about Brand New Org in a 10-minute interview",
    );
    expect(p.calendar.total).toBe(0);
    expect(p.pipelineValue).toMatchObject({
      expectedValueCents: 0,
      awardedCents: 0,
      winRate: null,
    });
  });

  it("only offers actions the caller's role can take", async () => {
    const viewer = await addMember(busy.orgId, "viewer");
    const v = await plan(busy.orgId, viewer);
    expect(v.greeting.role).toBe("viewer");
    expect(v.nextBestActions.map((a) => a.kind)).toEqual(["new_matches"]);

    const reviewer = await addMember(busy.orgId, "reviewer");
    const r = await plan(busy.orgId, reviewer);
    expect(r.nextBestActions.map((a) => a.kind)).toEqual(["review_draft", "new_matches"]);
  });

  it("reads gap flags past the first IN-list chunk (more than 90 open drafts)", async () => {
    const { orgId, userId } = await seedOrg("Many Drafts Org");
    await insertFact(orgId); // outcomes: thin
    const opp = await insertOpp({ title: "Shared Opportunity", closeDate: inDays(85) });
    const drafts = Array.from({ length: 95 }, (_, i) => ({
      id: newId("app"),
      versionId: newId("ver"),
      // Drafts are read soonest-deadline first, so the last two land in the second IN chunk.
      deadline: inDays(10 + Math.floor(i / 2)),
      title: `Draft ${i}`,
    }));
    const stmts = drafts.flatMap((d) => [
      db().insert(applications).values({
        id: d.id,
        orgId,
        opportunityId: opp,
        title: d.title,
        status: "needs_info",
        deadline: d.deadline,
      }),
      db()
        .insert(applicationVersions)
        .values({
          id: d.versionId,
          orgId,
          applicationId: d.id,
          versionNumber: 1,
          content: { sections: [] },
          authorType: "system",
        }),
    ]);
    const [first, ...rest] = stmts;
    if (first) await db().batch([first, ...rest]);
    for (const d of drafts.slice(93)) await insertGapFlag(orgId, d, "Missing outcomes");

    const p = await plan(orgId, userId);
    expect(p.automationSummary.waitingOnHumans.questions).toBe(95);
    expect(p.nextBestActions.find((a) => a.kind === "fill_gap")?.title).toBe(
      "Your fact base is thin on Outcomes; a 10-minute interview would strengthen 2 drafts",
    );
  });
});

describe("GET /home: greeting, calendar, pipeline, automation", () => {
  it("greets with the user's first name and the org's own profile", async () => {
    const p = await plan(busy.orgId, busy.userId);
    expect(p.greeting).toEqual({
      firstName: "Ana",
      orgName: "Gallup Trades Academy",
      role: "owner",
      focusAreas: ["workforce development", "construction trades"],
      serviceAreas: ["Gallup, NM", "McKinley County, NM"],
      orgTypeLabel: "501(c)(3) nonprofit",
      location: "Gallup, NM",
    });
    expect(p.firstRun).toBe(false);
  });

  it("puts 90 days of application and match deadlines into months", async () => {
    const p = await plan(busy.orgId, busy.userId);
    const c = p.calendar;
    expect(c.windowDays).toBe(90);
    expect(c.months.length).toBeGreaterThanOrEqual(3);
    expect(c.months[0]?.month).toBe(NOW.toISOString().slice(0, 7));
    const entries = c.months.flatMap((m) => m.entries);
    expect(c.total).toBe(entries.length);
    expect(entries.map((e) => e.title).sort()).toEqual(
      [
        "Apprenticeship 2027",
        "Community Builders Award",
        "Construction Trades Apprenticeship Expansion",
        "Rural Skills 2027",
        "Workforce Development Training Grants",
        "Youth Trades 2027",
      ].sort(),
    );
    for (const m of c.months) {
      for (const e of m.entries) expect(e.date.slice(0, 7)).toBe(m.month);
    }
    // Soonest first; applications link to the draft, matches to the grant.
    const days = entries.map((e) => e.daysLeft);
    expect(days).toEqual([...days].sort((a, b) => a - b));
    const shortlisted = entries.find((e) => e.title === "Community Builders Award");
    expect(shortlisted).toMatchObject({
      kind: "match",
      status: "shortlisted",
      daysLeft: 30,
      href: `/orgs/${busy.orgId}/opportunities/${busy.shortlistedOppId}`,
    });
    expect(entries.find((e) => e.title === "Youth Trades 2027")).toMatchObject({
      kind: "application",
      href: `/orgs/${busy.orgId}/applications/${busy.needsInfo.id}`,
    });
  });

  it("sums expected value for shortlisted + drafting, awards and win rate", async () => {
    const p = await plan(busy.orgId, busy.userId);
    expect(p.pipelineValue).toEqual({
      expectedValueCents: 500_000 + 10 + 1_000_000,
      shortlistedCount: 2,
      draftingCount: 1,
      awardedCents: 2_500_000,
      awardedCount: 1,
      declinedCount: 1,
      winRate: 0.5,
    });
  });

  it("summarizes the automation level and what is waiting on people", async () => {
    const p = await plan(busy.orgId, busy.userId);
    // Default settings (no explicit level, autopilot off) resolve to the recommended "prepared".
    expect(p.automationSummary).toMatchObject({
      level: "prepared",
      label: "Prepared (recommended)",
      autoSubmit: false,
      autoSubmitMaxCents: null,
      href: `/orgs/${busy.orgId}/settings/autopilot`,
      waitingOnHumans: {
        reviews: 1,
        questions: 1,
        changesRequested: 0,
        manualSubmissions: 1,
        proposedFacts: 7,
        total: 10,
      },
    });
    const { orgId, userId } = await seedOrg("Autopilot Org");
    await db()
      .update(orgSettings)
      .set({ autopilotEnabled: true, autoSubmitMaxCents: 500_000 })
      .where(eq(orgSettings.orgId, orgId));
    const auto = await plan(orgId, userId);
    expect(auto.automationSummary).toMatchObject({
      level: "supervised",
      autoSubmit: true,
      autoSubmitMaxCents: 500_000,
    });
    await db()
      .update(orgSettings)
      .set({ automationLevel: "manual" })
      .where(eq(orgSettings.orgId, orgId));
    const manual = await plan(orgId, userId);
    expect(manual.automationSummary).toMatchObject({
      level: "manual",
      label: "Manual",
      autoSubmit: false,
      autoSubmitMaxCents: null,
    });
  });
});

describe("GET /home: tenant isolation", () => {
  it("never includes another org's facts, drafts, matches, awards or private grants", async () => {
    const p = await plan(busy.orgId, busy.userId);
    const json = JSON.stringify(p);
    for (const t of busy.otherOrg.secretTitles) expect(json).not.toContain(t);
    expect(json).not.toContain(busy.otherOrg.orgId);
    // The corrupt match row pointing at the other org's private grant adds no value either.
    expect(p.pipelineValue.expectedValueCents).toBe(1_500_010);
    expect(p.pipelineValue.awardedCents).toBe(2_500_000);

    const theirs = await plan(busy.otherOrg.orgId, busy.otherOrg.userId);
    expect(JSON.stringify(theirs)).not.toContain("Gallup Trades Academy");
    expect(theirs.pipelineValue.awardedCents).toBe(50_000_000);
    expect(theirs.nextBestActions.map((a) => a.title)).toContain(
      "Confirm 30 facts extracted from your Secret Strategic Plan",
    );
  });

  it("404s for a non-member, even one who belongs to another org", async () => {
    const res = await get(busy.orgId, busy.otherOrg.userId);
    expect(res.status).toBe(404);
    const stranger = await createTestUser();
    expect((await get(busy.orgId, stranger.id)).status).toBe(404);
  });
});
