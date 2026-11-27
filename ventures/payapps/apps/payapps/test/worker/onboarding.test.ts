// Getting-started emails (services/payapps/onboarding.ts) on a real local D1, mail in the fake:
// the welcome email on creating a first company, and the one reminder from the weekly cron.
import { env } from "cloudflare:workers";
import type { PayAppDetailDto, ProjectDetailDto, ProjectDto } from "@shared/api/types";
import { createAppContext, testFakes } from "@worker/context";
import { onboardingEmails, organization, user } from "@worker/db/schema";
import {
  reminderStopLinks,
  sendFirstSendReminders,
  sendNoJobReminders,
} from "@worker/services/payapps/onboarding";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { addToOrg, call, createTestUser, setupTenant, testDb } from "./helpers";

const at = (iso: string) => createAppContext(env, { now: () => new Date(`${iso}T13:00:00Z`) });
const mailTo = (since: number, email: string) =>
  testFakes.email.sent.slice(since).filter((m) => m.to.includes(email));

/** Back-date a company so the cron's 5-to-60-day window can be tested without waiting. */
async function createdOn(orgId: string, iso: string) {
  await testDb()
    .update(organization)
    .set({ createdAt: new Date(`${iso}T09:00:00Z`) })
    .where(eq(organization.id, orgId));
}

async function jobWithLines(orgId: string, as: string, name: string) {
  const job = await call<ProjectDto>(`/api/orgs/${orgId}/projects`, {
    method: "POST",
    as,
    expect: 201,
    json: { name, gcName: "Harbor Builders", originalContractSumCents: 2_000_000 },
  });
  const base = `/api/orgs/${orgId}/projects/${job.id}`;
  const p = await call<ProjectDetailDto>(`${base}/sov-lines/bulk`, {
    method: "POST",
    as,
    expect: 201,
    json: { lines: [{ itemNumber: "1", description: "Work", originalCents: 2_000_000 }] },
  });
  return { id: job.id, base, lineId: p.sovLines[0]?.id ?? "" };
}

describe("welcome email", () => {
  it("goes once, to a verified user creating their first company, with the steps and a link", async () => {
    const u = await createTestUser();
    const before = testFakes.email.sent.length;
    const { orgId } = await call<{ orgId: string }>("/api/orgs", {
      method: "POST",
      as: u.id,
      expect: 201,
      json: { name: "Owl <Electric>" },
    });
    const mine = mailTo(before, u.email);
    expect(mine).toHaveLength(1);
    const m = mine[0];
    expect(m?.subject).toBe("Welcome to PayApps: five steps to your first paid application");
    expect(m?.text).toContain("Owl <Electric> is set up on PayApps.");
    expect(m?.text).toContain("1. Add your first job.");
    expect(m?.text).toContain("5. Record the GC's payment.");
    expect(m?.text).toContain(`Open your checklist: http://localhost:5173/orgs/${orgId}`);
    // Customer text is escaped in HTML and never in the subject.
    expect(m?.html).toContain("Owl &lt;Electric&gt;");
    expect(m?.html).not.toContain("<Electric>");

    // A second company: they already know PayApps.
    const n = testFakes.email.sent.length;
    await call("/api/orgs", { method: "POST", as: u.id, expect: 201, json: { name: "Owl Two" } });
    expect(mailTo(n, u.email)).toHaveLength(0);
  });

  it("is not sent to an unverified address, and the company is still created", async () => {
    const u = await createTestUser();
    await testDb().update(user).set({ emailVerified: false }).where(eq(user.id, u.id));
    const before = testFakes.email.sent.length;
    const { orgId } = await call<{ orgId: string }>("/api/orgs", {
      method: "POST",
      as: u.id,
      expect: 201,
      json: { name: "Unverified Drywall" },
    });
    expect(orgId).toMatch(/^org_/);
    expect(mailTo(before, u.email)).toHaveLength(0);
  });
});

describe("first-send reminder", () => {
  it("reminds the owners once, 5 to 60 days in, when a job exists but nothing is sent", async () => {
    const { orgId, userId: as, user: owner } = await setupTenant("owner");
    const editor = await createTestUser();
    await addToOrg(orgId, editor.id, "editor");
    await createdOn(orgId, "2020-01-01");
    const job = await jobWithLines(orgId, as, "Clinic TI");

    // Day 3: too early.
    let before = testFakes.email.sent.length;
    await sendFirstSendReminders(at("2020-01-04"));
    expect(mailTo(before, owner.email)).toHaveLength(0);

    before = testFakes.email.sent.length;
    const run = await sendFirstSendReminders(at("2020-01-08"));
    expect(run.sent).toBeGreaterThanOrEqual(1);
    const mine = mailTo(before, owner.email);
    expect(mine).toHaveLength(1);
    expect(mailTo(before, editor.email)).toHaveLength(0); // owners only
    const m = mine[0];
    expect(m?.subject).toBe("Your first pay application on PayApps");
    expect(m?.text).toContain("You set up Test Mechanical on PayApps 7 days ago.");
    expect(m?.text).toContain("Clinic TI is set up.");
    expect(m?.text).toContain("Next: Start your first pay application.");
    expect(m?.text).toContain(`http://localhost:5173/orgs/${orgId}/projects/${job.id}`);
    expect(m?.text).toContain("This is the last getting-started reminder");

    // Never twice.
    before = testFakes.email.sent.length;
    await sendFirstSendReminders(at("2020-01-15"));
    expect(mailTo(before, owner.email)).toHaveLength(0);
  });

  it("names the send step on a started draft, and says to mark it submitted", async () => {
    const { orgId, userId: as, user: owner } = await setupTenant("owner");
    await createdOn(orgId, "2020-01-01");
    const job = await jobWithLines(orgId, as, "Warehouse");
    const app = await call<PayAppDetailDto>(`${job.base}/pay-apps`, {
      method: "POST",
      as,
      expect: 201,
      json: { periodFrom: "2020-01-01", periodTo: "2020-01-31", applicationDate: "2020-01-31" },
    });
    const before = testFakes.email.sent.length;
    await sendFirstSendReminders(at("2020-01-10"));
    const m = mailTo(before, owner.email)[0];
    expect(m?.text).toContain("Next: Send it to the GC.");
    expect(m?.text).toContain("Mark the application submitted");
    expect(m?.text).toContain(`/orgs/${orgId}/projects/${job.id}/pay-apps/${app.id}`);
  });

  it("is not sent with an application already sent, with only the sample job, or after 60 days", async () => {
    const sent = await setupTenant("owner");
    await createdOn(sent.orgId, "2020-01-01");
    const job = await jobWithLines(sent.orgId, sent.userId, "Done Job");
    const app = await call<PayAppDetailDto>(`${job.base}/pay-apps`, {
      method: "POST",
      as: sent.userId,
      expect: 201,
      json: { periodFrom: "2020-01-01", periodTo: "2020-01-31", applicationDate: "2020-01-31" },
    });
    await call(`${job.base}/pay-apps/${app.id}/lines`, {
      method: "PUT",
      as: sent.userId,
      json: {
        lines: [
          {
            sovLineId: job.lineId,
            workThisPeriodCents: 500_000,
            storedMaterialsCents: 0,
            retainageReleasedCents: 0,
          },
        ],
      },
    });
    await call(`${job.base}/pay-apps/${app.id}/submit`, { method: "POST", as: sent.userId });

    const sampleOnly = await setupTenant("owner");
    await createdOn(sampleOnly.orgId, "2020-01-01");
    await call(`/api/orgs/${sampleOnly.orgId}/projects/sample`, {
      method: "POST",
      as: sampleOnly.userId,
      expect: 201,
    });

    const old = await setupTenant("owner");
    await createdOn(old.orgId, "2019-10-01");
    await jobWithLines(old.orgId, old.userId, "Old Job");

    const before = testFakes.email.sent.length;
    await sendFirstSendReminders(at("2020-01-10"));
    for (const t of [sent, sampleOnly, old]) {
      expect(mailTo(before, t.user.email)).toHaveLength(0);
    }
    // Not due is not claimed: the sample-only company is checked again next week.
    const rows = await testDb()
      .select()
      .from(onboardingEmails)
      .where(
        and(eq(onboardingEmails.orgId, sampleOnly.orgId), eq(onboardingEmails.kind, "first-send")),
      );
    expect(rows).toHaveLength(0);
  });

  it("lets a later run retry when the send fails", async () => {
    const { orgId, userId: as, user: owner } = await setupTenant("owner");
    await createdOn(orgId, "2020-01-01");
    await jobWithLines(orgId, as, "Retry Job");
    const failing = createAppContext(env, {
      now: () => new Date("2020-01-09T13:00:00Z"),
      email: {
        delivers: false,
        send: async () => {
          throw new Error("provider down");
        },
      },
    });
    const run = await sendFirstSendReminders(failing);
    expect(run.failed).toBeGreaterThanOrEqual(1);
    const before = testFakes.email.sent.length;
    await sendFirstSendReminders(at("2020-01-16"));
    expect(mailTo(before, owner.email)).toHaveLength(1);
  });
});

describe("no-job reminder", () => {
  it("reminds the owners once, 3 to 30 days in, while the company has no real job", async () => {
    const { orgId, user: owner } = await setupTenant("owner");
    const editor = await createTestUser();
    await addToOrg(orgId, editor.id, "editor");
    await createdOn(orgId, "2020-02-01");

    let before = testFakes.email.sent.length;
    await sendNoJobReminders(at("2020-02-03"));
    expect(mailTo(before, owner.email)).toHaveLength(0); // day 2: too early

    before = testFakes.email.sent.length;
    await sendNoJobReminders(at("2020-02-05"));
    const mine = mailTo(before, owner.email);
    expect(mine).toHaveLength(1);
    expect(mailTo(before, editor.email)).toHaveLength(0); // owners only
    const m = mine[0];
    expect(m?.subject).toBe("Add your first job to PayApps");
    expect(m?.text).toContain("You set up Test Mechanical on PayApps 4 days ago.");
    expect(m?.text).toContain(`Add your first job: http://localhost:5173/orgs/${orgId}`);
    expect(m?.text).toContain('"Try a sample job"');
    // A signed stop link, in the text and as one-click headers for mail apps.
    expect(m?.text).toMatch(
      /Stop these reminders for this company \(one click, no sign-in\): http:\/\/localhost:5173\/unsubscribe\?list=onboarding&o=/,
    );
    expect(m?.headers?.["List-Unsubscribe"]).toMatch(
      /^<http:\/\/localhost:5173\/api\/unsubscribe\/onboarding\?o=[^>]+>$/,
    );
    expect(m?.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");

    before = testFakes.email.sent.length;
    await sendNoJobReminders(at("2020-02-12"));
    expect(mailTo(before, owner.email)).toHaveLength(0); // never twice
  });

  it("goes with only the sample job, but not with a real job or after 30 days", async () => {
    const sampleOnly = await setupTenant("owner");
    await createdOn(sampleOnly.orgId, "2020-03-01");
    await call(`/api/orgs/${sampleOnly.orgId}/projects/sample`, {
      method: "POST",
      as: sampleOnly.userId,
      expect: 201,
    });
    const withJob = await setupTenant("owner");
    await createdOn(withJob.orgId, "2020-03-01");
    await jobWithLines(withJob.orgId, withJob.userId, "Real Job");
    const old = await setupTenant("owner");
    await createdOn(old.orgId, "2020-01-15");

    const before = testFakes.email.sent.length;
    await sendNoJobReminders(at("2020-03-06"));
    const sample = mailTo(before, sampleOnly.user.email);
    expect(sample).toHaveLength(1);
    expect(sample[0]?.text).toContain("Your sample job is still there to look around.");
    expect(mailTo(before, withJob.user.email)).toHaveLength(0);
    expect(mailTo(before, old.user.email)).toHaveLength(0);
    // Not due is not claimed.
    const rows = await testDb()
      .select()
      .from(onboardingEmails)
      .where(and(eq(onboardingEmails.orgId, withJob.orgId), eq(onboardingEmails.kind, "no-job")));
    expect(rows).toHaveLength(0);
  });

  it("stops both reminders for that member and company from the signed link, and only those", async () => {
    const { orgId, user: owner } = await setupTenant("owner");
    const coOwner = await createTestUser();
    await addToOrg(orgId, coOwner.id, "owner");
    await createdOn(orgId, "2020-04-01");

    // The co-owner's link from an earlier email, pressed before any reminder goes.
    const links = await reminderStopLinks(env, orgId, coOwner.id);
    const q = links?.oneClick.split("?")[1] ?? "";
    expect(await call(`/api/unsubscribe/onboarding?${q}`)).toEqual({
      orgName: "Test Mechanical",
      subscribed: true,
    });
    // The digest endpoint refuses an onboarding link, and a forged user is refused.
    await call(`/api/unsubscribe/digest?${q}`, { method: "POST", expect: 404 });
    const forged = q.replace(`u=${coOwner.id}`, `u=${owner.id}`);
    await call(`/api/unsubscribe/onboarding?${forged}`, { method: "POST", expect: 404 });
    // RFC 8058 POST from a mail app; pressing it twice is fine.
    for (let i = 0; i < 2; i++) {
      expect(
        await call(`/api/unsubscribe/onboarding?${q}`, {
          method: "POST",
          body: "List-Unsubscribe=One-Click",
          headers: { "content-type": "application/x-www-form-urlencoded" },
        }),
      ).toEqual({ orgName: "Test Mechanical", subscribed: false });
    }

    let before = testFakes.email.sent.length;
    await sendNoJobReminders(at("2020-04-06"));
    expect(mailTo(before, owner.email)).toHaveLength(1);
    expect(mailTo(before, coOwner.email)).toHaveLength(0);

    // The first-send reminder skips them too once there is a job.
    await jobWithLines(orgId, owner.id, "Later Job");
    before = testFakes.email.sent.length;
    await sendFirstSendReminders(at("2020-04-13"));
    expect(mailTo(before, owner.email)).toHaveLength(1);
    expect(mailTo(before, coOwner.email)).toHaveLength(0);
  });

  it("is never claimed when every owner stopped it, so nothing is marked sent", async () => {
    const { orgId, user: owner } = await setupTenant("owner");
    await createdOn(orgId, "2020-05-01");
    const q = (await reminderStopLinks(env, orgId, owner.id))?.oneClick.split("?")[1] ?? "";
    await call(`/api/unsubscribe/onboarding?${q}`, { method: "POST" });
    const before = testFakes.email.sent.length;
    const run = await sendNoJobReminders(at("2020-05-06"));
    expect(run.notDue).toBeGreaterThanOrEqual(1);
    expect(mailTo(before, owner.email)).toHaveLength(0);
    const rows = await testDb()
      .select()
      .from(onboardingEmails)
      .where(and(eq(onboardingEmails.orgId, orgId), eq(onboardingEmails.kind, "no-job")));
    expect(rows).toHaveLength(0);
  });
});
