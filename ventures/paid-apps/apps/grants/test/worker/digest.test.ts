// Weekly digest, deadline nudges and email preferences: content, idempotency, opt-out, tenancy.
import { env } from "cloudflare:workers";
import type { ApplicationStatus, MatchStatus, MemberRole } from "@shared/enums";
import { createApp } from "@worker/app";
import { createAppContext, testFakes } from "@worker/context";
import {
  applicationFlags,
  applications,
  applicationVersions,
  facts,
  followups,
  member,
  opportunities,
  opportunityMatches,
  orgSettings,
} from "@worker/db/schema";
import { digestLog } from "@worker/db/schema/digest";
import { newId } from "@worker/lib/ids";
import { TEST_USER_HEADER } from "@worker/middleware/session";
import { requireOrg } from "@worker/middleware/tenant";
import type { EmailMessage } from "@worker/ports/email";
import emailPreferenceRoutes from "@worker/routes/org/email-preferences";
import {
  buildWeeklyDigest,
  deadlineThreshold,
  isoWeek,
  sendDeadlineNudges,
  sendWeeklyDigests,
  updateEmailPreferences,
} from "@worker/services/digest";
import type { AppEnv } from "@worker/types";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { beforeAll, describe, expect, it } from "vitest";
import { type ApiInit, BASE, createTestUser, setupTenant, testDb } from "./helpers";

// Hand-written to match db/schema/digest.ts (`drizzle-kit export` output) until the schema is
// exported from db/schema/index.ts and lands in TEST_SCHEMA_SQL; IF NOT EXISTS keeps it harmless after.
const DDL = [
  `CREATE TABLE IF NOT EXISTS \`digest_log\` (
    \`org_id\` text NOT NULL, \`key\` text NOT NULL, \`sent_at\` integer NOT NULL,
    FOREIGN KEY (\`org_id\`) REFERENCES \`organization\`(\`id\`) ON UPDATE no action ON DELETE cascade)`,
  "CREATE UNIQUE INDEX IF NOT EXISTS `digest_log_org_key_uq` ON `digest_log` (`org_id`,`key`)",
  `CREATE TABLE IF NOT EXISTS \`email_preferences\` (
    \`user_id\` text NOT NULL, \`org_id\` text NOT NULL,
    \`weekly_digest\` integer DEFAULT true NOT NULL, \`deadline_reminders\` integer DEFAULT true NOT NULL,
    \`updated_at\` integer NOT NULL, PRIMARY KEY(\`user_id\`, \`org_id\`),
    FOREIGN KEY (\`user_id\`) REFERENCES \`user\`(\`id\`) ON UPDATE no action ON DELETE cascade,
    FOREIGN KEY (\`org_id\`) REFERENCES \`organization\`(\`id\`) ON UPDATE no action ON DELETE cascade)`,
  "CREATE INDEX IF NOT EXISTS `email_preferences_org_idx` ON `email_preferences` (`org_id`)",
];

beforeAll(async () => {
  await env.DB.batch(DDL.map((s) => env.DB.prepare(s)));
});

// Until app.ts mounts the router (integration pass), mount it on a test instance of the full app.
const app = createApp();
const mount = new Hono<AppEnv>();
mount.use("*", requireOrg("viewer"));
mount.route("/", emailPreferenceRoutes);
app.route("/api/orgs/:orgId", mount);

function oapi(path: string, init: ApiInit = {}) {
  const { json, as, ...rest } = init;
  const headers = new Headers(rest.headers);
  headers.set("Origin", BASE);
  if (json !== undefined) headers.set("Content-Type", "application/json");
  if (as) headers.set(TEST_USER_HEADER, as);
  return app.fetch(
    new Request(`${BASE}${path}`, {
      ...rest,
      headers,
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    }),
    env,
  );
}

const DAY = 86_400_000;
// A Monday, at the daily cron's time.
const NOW = new Date("2026-11-23T13:17:00Z");
const at = (days: number, from = NOW) => new Date(from.getTime() + days * DAY);
const ctxAt = (now: Date) => createAppContext(env, { now: () => now });
const db = testDb();

const sentTo = (addr: string): EmailMessage[] =>
  testFakes.email.sent.filter((m) => m.to.includes(addr));

let seq = 0;
async function seedOpp(opts: { closeDate?: Date | null; title?: string; privateTo?: string } = {}) {
  const id = newId("opp");
  await db.insert(opportunities).values({
    id,
    source: "manual",
    sourceId: id,
    funderName: "Four Corners Foundation",
    title: opts.title ?? `Opportunity ${++seq}`,
    closeDate: opts.closeDate === undefined ? at(60) : opts.closeDate,
    privateToOrgId: opts.privateTo ?? null,
  });
  return id;
}

async function seedMatch(
  orgId: string,
  oppId: string,
  opts: { fit?: number; ev?: number; status?: MatchStatus; scoredAt?: Date } = {},
) {
  const id = newId("mat");
  await db.insert(opportunityMatches).values({
    id,
    orgId,
    opportunityId: oppId,
    fitScore: opts.fit ?? 80,
    likelihood: 0.5,
    expectedValueCents: opts.ev ?? 100_000,
    status: opts.status ?? "new",
    scoredAt: opts.scoredAt ?? at(-2),
  });
  return id;
}

async function seedApp(
  orgId: string,
  oppId: string,
  opts: {
    status?: ApplicationStatus;
    deadline?: Date | null;
    title?: string;
    submittedAt?: Date;
    outcomeAt?: Date;
    awardedAmountCents?: number;
  } = {},
) {
  const id = newId("app");
  await db.insert(applications).values({
    id,
    orgId,
    opportunityId: oppId,
    title: opts.title ?? `Application ${++seq}`,
    status: opts.status ?? "drafting",
    deadline: opts.deadline ?? null,
    submittedAt: opts.submittedAt ?? null,
    outcomeAt: opts.outcomeAt ?? null,
    awardedAmountCents: opts.awardedAmountCents ?? null,
  });
  return id;
}

async function seedVersionWithFlags(
  orgId: string,
  appId: string,
  flags: { question: string; status?: "open" | "resolved" }[],
) {
  const verId = newId("ver");
  await db.insert(applicationVersions).values({
    id: verId,
    orgId,
    applicationId: appId,
    versionNumber: 1,
    content: { sections: [] },
    authorType: "system",
  });
  await db.update(applications).set({ currentVersionId: verId }).where(eq(applications.id, appId));
  for (const f of flags) {
    await db.insert(applicationFlags).values({
      id: newId("flg"),
      orgId,
      applicationId: appId,
      versionId: verId,
      severity: "blocker",
      kind: "missing_info",
      message: "Missing information",
      suggestedQuestion: f.question,
      status: f.status ?? "open",
    });
  }
}

async function seedFact(orgId: string, statement: string, status: "proposed" | "confirmed") {
  await db.insert(facts).values({
    id: newId("fct"),
    orgId,
    category: "metric",
    statement,
    status,
    sourceType: "user_entered",
  });
}

async function addMember(orgId: string, role: MemberRole) {
  const u = await createTestUser();
  await db
    .insert(member)
    .values({ id: newId("mem"), organizationId: orgId, userId: u.id, role: role });
  return u;
}

async function setNotifyEmails(orgId: string, emails: string[]) {
  await db.update(orgSettings).set({ notifyEmails: emails }).where(eq(orgSettings.orgId, orgId));
}

/** Org A with one of everything (plus decoys that must be excluded). */
async function seedBusyOrg() {
  const t = await setupTenant();
  const { orgId } = t;
  // Six qualifying matches: the digest keeps the top 5 by expected value.
  const top: string[] = [];
  for (let i = 1; i <= 6; i++) top.push(await seedMatch(orgId, await seedOpp(), { ev: i * 1000 }));
  const lowFit = await seedMatch(orgId, await seedOpp(), { fit: 55, ev: 999_999 });
  const dismissed = await seedMatch(orgId, await seedOpp(), { status: "dismissed", ev: 999_999 });
  const stale = await seedMatch(orgId, await seedOpp(), { scoredAt: at(-10), ev: 999_999 });
  const closedMatch = await seedMatch(orgId, await seedOpp({ closeDate: at(-1) }), { ev: 999_999 });

  // closingSoon: an in-progress application and a shortlisted match without one.
  const closingOpp = await seedOpp({ closeDate: at(10), title: "Closing with application" });
  const closingApp = await seedApp(orgId, closingOpp, { status: "drafting" });
  const shortlistOpp = await seedOpp({ closeDate: at(5), title: "Shortlisted and closing" });
  await seedMatch(orgId, shortlistOpp, { status: "shortlisted", fit: 40, scoredAt: at(-30) });
  const farOpp = await seedOpp({ closeDate: at(30) });
  await seedMatch(orgId, farOpp, { status: "shortlisted", scoredAt: at(-30) });

  const review = await seedApp(orgId, await seedOpp(), { status: "in_review" });
  const needsInfo = await seedApp(orgId, await seedOpp(), { status: "needs_info" });
  await seedVersionWithFlags(orgId, needsInfo, [
    { question: "How many apprentices finished the program in 2025?" },
    { question: "Already answered question", status: "resolved" },
  ]);
  const submitted = await seedApp(orgId, await seedOpp(), {
    status: "submitted",
    submittedAt: at(-2),
  });
  const oldSubmitted = await seedApp(orgId, await seedOpp(), {
    status: "submitted",
    submittedAt: at(-10),
  });
  const awarded = await seedApp(orgId, await seedOpp(), {
    status: "awarded",
    submittedAt: at(-40),
    outcomeAt: at(-1),
    awardedAmountCents: 2_500_000,
  });
  const followup = newId("fup");
  await db.insert(followups).values([
    {
      id: followup,
      orgId,
      applicationId: submitted,
      kind: "status_check",
      title: "Check status with the funder",
      dueAt: at(3),
    },
    {
      id: newId("fup"),
      orgId,
      applicationId: closingApp,
      kind: "deadline_reminder",
      title: "Deadline reminder (covered by closingSoon)",
      dueAt: at(1),
    },
  ]);
  await seedFact(orgId, "SECRET-FACT-TEXT served 412 apprentices", "proposed");
  await seedFact(orgId, "SECRET-FACT-TEXT budget is $1.2M", "proposed");
  await seedFact(orgId, "Confirmed fact", "confirmed");
  const ids = {
    awarded,
    closedMatch,
    closingApp,
    closingOpp,
    dismissed,
    farOpp,
    followup,
    lowFit,
    needsInfo,
    oldSubmitted,
    review,
    shortlistOpp,
    stale,
    submitted,
  };
  return { ...t, ids, top };
}

describe("isoWeek / deadlineThreshold", () => {
  it("computes ISO weeks across year boundaries", () => {
    expect(isoWeek(new Date("2026-11-23T13:17:00Z"))).toBe("2026-W48");
    expect(isoWeek(new Date("2026-01-01T00:00:00Z"))).toBe("2026-W01");
    expect(isoWeek(new Date("2021-01-03T23:59:00Z"))).toBe("2020-W53");
    expect(isoWeek(new Date("2024-12-30T00:00:00Z"))).toBe("2025-W01");
  });

  it("picks the most urgent crossed threshold", () => {
    const deadline = new Date("2026-12-01T00:00:00Z");
    const t = (iso: string) => deadlineThreshold(deadline, new Date(iso));
    expect(t("2026-11-10T13:17:00Z")).toBeNull(); // 21 days out
    expect(t("2026-11-17T13:17:00Z")).toBe(14);
    expect(t("2026-11-20T13:17:00Z")).toBe(14); // 11 days
    expect(t("2026-11-24T13:17:00Z")).toBe(7);
    expect(t("2026-11-28T13:17:00Z")).toBe(3);
    expect(t("2026-11-29T13:17:00Z")).toBe(3); // 2 days: 3 already sent, no new threshold
    expect(t("2026-11-30T13:17:00Z")).toBe(1);
    expect(t("2026-12-01T00:00:00Z")).toBeNull(); // past
  });
});

describe("buildWeeklyDigest", () => {
  it("collects every section, scoped to the org, without fact text", async () => {
    const a = await seedBusyOrg();
    // Another tenant with the same kinds of activity: none of it may leak into A's digest.
    const b = await seedBusyOrg();

    const d = await buildWeeklyDigest(ctxAt(NOW), a.orgId, NOW);

    const evs = d.newTopMatches.map((m) => m.expectedValueCents);
    expect(evs).toEqual([6000, 5000, 4000, 3000, 2000]);
    const matchIds = d.newTopMatches.map((m) => m.matchId);
    for (const x of [a.ids.lowFit, a.ids.dismissed, a.ids.stale, a.ids.closedMatch]) {
      expect(matchIds).not.toContain(x);
    }

    expect(d.closingSoon.map((c) => c.opportunityId)).toEqual([
      a.ids.shortlistOpp,
      a.ids.closingOpp,
    ]);
    expect(d.closingSoon[1]).toMatchObject({
      applicationId: a.ids.closingApp,
      applicationStatus: "drafting",
      daysLeft: 10,
    });
    expect(d.closingSoon[0]).toMatchObject({ applicationId: null, daysLeft: 5 });

    expect(d.pendingReviews.map((r) => r.applicationId)).toEqual([a.ids.review]);
    expect(d.needsInfo).toEqual([
      expect.objectContaining({
        applicationId: a.ids.needsInfo,
        questions: ["How many apprentices finished the program in 2025?"],
      }),
    ]);
    expect(d.submittedThisWeek.map((s) => s.applicationId)).toEqual([a.ids.submitted]);
    expect(d.awardedThisWeek).toEqual([
      expect.objectContaining({ applicationId: a.ids.awarded, awardedAmountCents: 2_500_000 }),
    ]);
    expect(d.followupsDue.map((f) => f.followupId)).toEqual([a.ids.followup]);
    expect(d.factsAwaitingConfirmation).toBe(2);
    expect(d.week).toBe("2026-W48");
    expect(d.checkIn).toBeNull(); // only the first digest of a month carries the check-in

    const json = JSON.stringify(d);
    expect(json).not.toContain("SECRET-FACT-TEXT");
    for (const id of [b.orgId, ...Object.values(b.ids), ...b.top].filter(Boolean)) {
      expect(json).not.toContain(id);
    }
  });

  it("ignores another org's private opportunities even if a match row points at one", async () => {
    const a = await setupTenant();
    const b = await setupTenant();
    const privateToB = await seedOpp({ privateTo: b.orgId, title: "B private" });
    await seedMatch(a.orgId, privateToB);
    const d = await buildWeeklyDigest(ctxAt(NOW), a.orgId, NOW);
    expect(d.newTopMatches).toEqual([]);
  });

  it("adds the monthly check-in to the first digest of a month", async () => {
    const a = await setupTenant();
    const firstMonday = new Date("2026-12-07T13:17:00Z");
    const d = await buildWeeklyDigest(ctxAt(firstMonday), a.orgId, firstMonday);
    expect(d.checkIn).toMatchObject({ title: "What's new?", cta: "Share an update" });
  });
});

describe("sendWeeklyDigests", () => {
  it("sends one email per org per ISO week, with escaped HTML and no fact text", async () => {
    const a = await seedBusyOrg();
    const team = `team-${a.orgId}@example.org`;
    await setNotifyEmails(a.orgId, [team]);
    await db
      .update(applications)
      .set({ title: "<script>alert(1)</script> Trades" })
      .where(eq(applications.id, a.ids.review));

    const r1 = await sendWeeklyDigests(ctxAt(NOW), NOW);
    const r2 = await sendWeeklyDigests(ctxAt(at(0.1)), at(0.1));
    expect(r1.sent).toBeGreaterThanOrEqual(1);
    expect(r2.alreadySent).toBeGreaterThanOrEqual(1);

    const mails = sentTo(team);
    expect(mails).toHaveLength(1);
    const [mail] = mails;
    expect(mail?.to).toEqual([team]);
    expect(mail?.subject).toContain("Weekly digest");
    expect(mail?.text).toContain("Submitted this week (1)");
    expect(mail?.text).toContain("Follow-ups due (1)");
    expect(mail?.text).toContain("2 facts from your documents");
    expect(mail?.html).toContain("&lt;script&gt;");
    expect(mail?.html).not.toContain("<script>alert");
    expect(`${mail?.text}${mail?.html}`).not.toContain("SECRET-FACT-TEXT");

    const log = await db.select().from(digestLog).where(eq(digestLog.orgId, a.orgId)).all();
    expect(log.map((l) => l.key)).toEqual(["weekly:2026-W48"]);

    // Next ISO week sends again.
    await sendWeeklyDigests(ctxAt(at(7)), at(7));
    expect(sentTo(team)).toHaveLength(2);
  });

  it("skips orgs with nothing to report", async () => {
    const quiet = await setupTenant();
    const team = `quiet-${quiet.orgId}@example.org`;
    await setNotifyEmails(quiet.orgId, [team]);
    await sendWeeklyDigests(ctxAt(NOW), NOW);
    expect(sentTo(team)).toHaveLength(0);
    const log = await db.select().from(digestLog).where(eq(digestLog.orgId, quiet.orgId)).all();
    expect(log).toEqual([]);
  });

  it("falls back to owners/admins and respects opt-outs (also for listed notifyEmails)", async () => {
    const a = await seedBusyOrg();
    const admin = await addMember(a.orgId, "admin");
    const editor = await addMember(a.orgId, "editor");
    await updateEmailPreferences(ctxAt(NOW), a.orgId, admin.id, { weeklyDigest: false });

    await sendWeeklyDigests(ctxAt(NOW), NOW);
    expect(sentTo(a.user.email)).toHaveLength(1);
    expect(sentTo(admin.email)).toHaveLength(0);
    expect(sentTo(editor.email)).toHaveLength(0); // editors are not in the fallback list

    // Listed explicitly: the opted-out member is still dropped; others on the list get it.
    const b = await seedBusyOrg();
    const bAdmin = await addMember(b.orgId, "admin");
    const outside = `board-${b.orgId}@example.org`;
    await setNotifyEmails(b.orgId, [bAdmin.email.toUpperCase(), outside]);
    await updateEmailPreferences(ctxAt(NOW), b.orgId, bAdmin.id, { weeklyDigest: false });
    await sendWeeklyDigests(ctxAt(NOW), NOW);
    expect(sentTo(outside)).toHaveLength(1);
    expect(sentTo(outside)[0]?.to).toEqual([outside]);
    expect(testFakes.email.sent.some((m) => m.to.includes(bAdmin.email.toUpperCase()))).toBe(false);
  });

  it("releases the claim when sending fails so the next run retries", async () => {
    const a = await seedBusyOrg();
    const team = `retry-${a.orgId}@example.org`;
    await setNotifyEmails(a.orgId, [team]);
    const failing = createAppContext(env, {
      now: () => NOW,
      email: {
        send: async (m) => {
          if (m.to.includes(team)) throw new Error("smtp down");
          return testFakes.email.send(m);
        },
      },
    });
    const r = await sendWeeklyDigests(failing, NOW);
    expect(r.failed).toBeGreaterThanOrEqual(1);
    const log = await db
      .select()
      .from(digestLog)
      .where(and(eq(digestLog.orgId, a.orgId), eq(digestLog.key, "weekly:2026-W48")))
      .all();
    expect(log).toEqual([]);
    await sendWeeklyDigests(ctxAt(NOW), NOW);
    expect(sentTo(team)).toHaveLength(1);
  });
});

describe("sendDeadlineNudges", () => {
  const deadline = new Date("2026-12-01T00:00:00Z");
  const runAt = (iso: string) => sendDeadlineNudges(ctxAt(new Date(iso)), new Date(iso));

  it("sends one email per threshold (14, 7, 3, 1) and never twice", async () => {
    const t = await setupTenant();
    const team = `nudge-${t.orgId}@example.org`;
    await setNotifyEmails(t.orgId, [team]);
    const appId = await seedApp(t.orgId, await seedOpp({ closeDate: deadline }), {
      status: "needs_info",
      title: "Trades Academy",
    });
    // Not nudged: not being worked on, or no deadline in range.
    await seedApp(t.orgId, await seedOpp({ closeDate: deadline }), { status: "approved" });
    await seedApp(t.orgId, await seedOpp({ closeDate: deadline }), { status: "submitted" });

    await runAt("2026-11-10T13:17:00Z"); // 21 days: nothing
    expect(sentTo(team)).toHaveLength(0);
    for (const day of ["17", "18", "20", "24", "25", "28", "29", "30", "30"]) {
      await runAt(`2026-11-${day}T13:17:00Z`);
    }
    const mails = sentTo(team);
    expect(mails).toHaveLength(4);
    expect(mails.map((m) => m.subject)).toEqual([
      'Deadline in 14 days: "Trades Academy"',
      'Deadline in 7 days: "Trades Academy"',
      'Deadline in 3 days: "Trades Academy"',
      'Deadline tomorrow: "Trades Academy"',
    ]);
    const keys = (await db.select().from(digestLog).where(eq(digestLog.orgId, t.orgId)).all())
      .map((l) => l.key)
      .sort();
    expect(keys).toEqual([1, 14, 3, 7].map((d) => `deadline:${appId}:${d}`));
  });

  it("leaves thresholds the submission follow-ups already cover to them", async () => {
    const t = await setupTenant();
    const team = `covered-${t.orgId}@example.org`;
    await setNotifyEmails(t.orgId, [team]);
    const appId = await seedApp(t.orgId, await seedOpp({ closeDate: deadline }), {
      status: "drafting",
    });
    // As submission/index.ts#scheduleDeadlineReminders creates them (14 and 3 days).
    await db.insert(followups).values(
      [14, 3].map((d) => ({
        id: newId("fup"),
        orgId: t.orgId,
        applicationId: appId,
        kind: "deadline_reminder" as const,
        title: `due in ${d} days`,
        dueAt: new Date(deadline.getTime() - d * DAY),
        dedupeKey: `deadline:${appId}:${d}d`,
      })),
    );
    for (const day of ["17", "24", "28", "30"]) await runAt(`2026-11-${day}T13:17:00Z`);
    expect(sentTo(team).map((m) => m.subject)).toEqual([
      expect.stringContaining("in 7 days"),
      expect.stringContaining("tomorrow"),
    ]);
  });

  it("respects deadline-reminder opt-outs and sends each org only its own applications", async () => {
    const a = await setupTenant();
    const b = await setupTenant();
    const aAdmin = await addMember(a.orgId, "admin");
    await updateEmailPreferences(ctxAt(NOW), a.orgId, a.userId, { deadlineReminders: false });
    // Opting out of the digest does not opt out of deadline reminders.
    await updateEmailPreferences(ctxAt(NOW), a.orgId, aAdmin.id, { weeklyDigest: false });
    const aApp = await seedApp(a.orgId, await seedOpp({ closeDate: deadline }), {
      status: "in_review",
      title: "A only",
    });
    const bApp = await seedApp(b.orgId, await seedOpp({ closeDate: deadline }), {
      status: "changes_requested",
      title: "B only",
    });
    await runAt("2026-11-24T13:17:00Z");
    expect(sentTo(a.user.email)).toHaveLength(0);
    const toAdmin = sentTo(aAdmin.email);
    expect(toAdmin).toHaveLength(1);
    expect(toAdmin[0]?.text).toContain(aApp);
    expect(toAdmin[0]?.text).not.toContain(bApp);
    const toB = sentTo(b.user.email);
    expect(toB).toHaveLength(1);
    expect(toB[0]?.to).toEqual([b.user.email]);
    expect(toB[0]?.text).toContain("B only");
    expect(toB[0]?.text).not.toContain("A only");
  });
});

describe("routes", () => {
  it("GET/PUT /email-preferences reads and writes only the caller's own row", async () => {
    const a = await setupTenant("viewer");
    const other = await addMember(a.orgId, "owner");
    const b = await setupTenant();
    await db
      .insert(member)
      .values({ id: newId("mem"), organizationId: b.orgId, userId: a.userId, role: "editor" });

    const get0 = await oapi(`/api/orgs/${a.orgId}/email-preferences`, { as: a.userId });
    expect(get0.status).toBe(200);
    expect(await get0.json()).toEqual({ weeklyDigest: true, deadlineReminders: true });

    const put = await oapi(`/api/orgs/${a.orgId}/email-preferences`, {
      method: "PUT",
      as: a.userId,
      json: { weeklyDigest: false },
    });
    expect(put.status).toBe(200);
    expect(await put.json()).toEqual({ weeklyDigest: false, deadlineReminders: true });

    const put2 = await oapi(`/api/orgs/${a.orgId}/email-preferences`, {
      method: "PUT",
      as: a.userId,
      json: { deadlineReminders: false },
    });
    expect(await put2.json()).toEqual({ weeklyDigest: false, deadlineReminders: false });

    // Another member of the same org, and the same user in another org, are untouched.
    const otherGet = await oapi(`/api/orgs/${a.orgId}/email-preferences`, { as: other.id });
    expect(await otherGet.json()).toEqual({ weeklyDigest: true, deadlineReminders: true });
    const inB = await oapi(`/api/orgs/${b.orgId}/email-preferences`, { as: a.userId });
    expect(await inB.json()).toEqual({ weeklyDigest: true, deadlineReminders: true });

    const bad = await oapi(`/api/orgs/${a.orgId}/email-preferences`, {
      method: "PUT",
      as: a.userId,
      json: { weeklyDigest: "no", userId: other.id },
    });
    expect(bad.status).toBe(400);

    // Non-member: 404, so org ids cannot be probed.
    const outsider = await createTestUser();
    const res = await oapi(`/api/orgs/${a.orgId}/email-preferences`, { as: outsider.id });
    expect(res.status).toBe(404);
  });

  it("GET /digest/preview is admin+ and returns this org's digest JSON", async () => {
    const a = await seedBusyOrg();
    const b = await seedBusyOrg();
    const viewer = await addMember(a.orgId, "viewer");
    const ok = await oapi(`/api/orgs/${a.orgId}/digest/preview`, { as: a.userId });
    expect(ok.status).toBe(200);
    const body = (await ok.json()) as { orgId: string; factsAwaitingConfirmation: number };
    expect(body.orgId).toBe(a.orgId);
    expect(body.factsAwaitingConfirmation).toBe(2);
    const text = JSON.stringify(body);
    expect(text).not.toContain(b.orgId);
    expect(text).not.toContain("SECRET-FACT-TEXT");

    const forbidden = await oapi(`/api/orgs/${a.orgId}/digest/preview`, { as: viewer.id });
    expect(forbidden.status).toBe(403);
    const cross = await oapi(`/api/orgs/${b.orgId}/digest/preview`, { as: a.userId });
    expect(cross.status).toBe(404);
  });
});
