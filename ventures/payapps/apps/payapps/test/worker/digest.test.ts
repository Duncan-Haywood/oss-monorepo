// Weekly "money to chase" email: the member's own opt-in through the API, and the cron's send
// (services/payapps/digest.ts) on a real local D1 with mail in the in-memory fake.

import { env } from "cloudflare:workers";
import type { PayAppDetailDto, ProjectDetailDto, ProjectDto } from "@shared/api/types";
import { createAppContext, testFakes } from "@worker/context";
import { cashDigestSubscriptions, member, user } from "@worker/db/schema";
import { sendWeeklyDigests } from "@worker/services/payapps/digest";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { addToOrg, api, call, createTestUser, grantPlan, setupTenant, testDb } from "./helpers";

/** A job with application #1 sent on 2026-01-31 under 30-day terms: past due by any later date. */
async function lateJob(orgId: string, as: string, name: string) {
  const created = await call<ProjectDto>(`/api/orgs/${orgId}/projects`, {
    method: "POST",
    as,
    expect: 201,
    json: {
      name,
      gcName: "Harbor <Builders>",
      originalContractSumCents: 10_000_000,
      retainagePctBps: 1000,
      storedRetainagePctBps: 1000,
      payTermsDays: 30,
    },
  });
  const base = `/api/orgs/${orgId}/projects/${created.id}`;
  const project = await call<ProjectDetailDto>(`${base}/sov-lines/bulk`, {
    method: "POST",
    as,
    expect: 201,
    json: { lines: [{ itemNumber: "1", description: "Work", originalCents: 10_000_000 }] },
  });
  const app = await call<PayAppDetailDto>(`${base}/pay-apps`, {
    method: "POST",
    as,
    expect: 201,
    json: { periodFrom: "2026-01-01", periodTo: "2026-01-31", applicationDate: "2026-01-31" },
  });
  await call(`${base}/pay-apps/${app.id}/lines`, {
    method: "PUT",
    as,
    json: {
      lines: [
        {
          sovLineId: project.sovLines[0]?.id ?? "",
          workThisPeriodCents: 4_000_000,
          storedMaterialsCents: 0,
          retainageReleasedCents: 0,
        },
      ],
    },
  });
  await call(`${base}/pay-apps/${app.id}/submit`, { method: "POST", as });
  await call(base, { method: "PATCH", as, json: { payTermsDays: 30 } });
  return { id: created.id, base };
}

const at = (iso: string) => createAppContext(env, { now: () => new Date(`${iso}T13:00:00Z`) });
const mailTo = (since: number, email: string) =>
  testFakes.email.sent.slice(since).filter((m) => m.to.includes(email));

describe("weekly digest", () => {
  it("is off by default, turned on and off by the member, and previews the list", async () => {
    const { orgId, userId: as } = await setupTenant("viewer");
    let r = await call<{ setting: { enabled: boolean }; preview: unknown }>(
      `/api/orgs/${orgId}/digest`,
      { as },
    );
    expect(r.setting.enabled).toBe(false);
    expect(r.preview).toBeNull(); // no jobs, nothing to chase

    const on = await call<{ enabled: boolean }>(`/api/orgs/${orgId}/digest`, {
      method: "PUT",
      as,
      json: { enabled: true },
    });
    expect(on.enabled).toBe(true);
    // Twice is the same as once.
    await call(`/api/orgs/${orgId}/digest`, { method: "PUT", as, json: { enabled: true } });
    await call(`/api/orgs/${orgId}/digest`, {
      method: "PUT",
      as,
      expect: 400,
      json: { enabled: "yes" },
    });
    r = await call(`/api/orgs/${orgId}/digest`, { as });
    expect(r.setting.enabled).toBe(true);
    await call(`/api/orgs/${orgId}/digest`, { method: "PUT", as, json: { enabled: false } });
    r = await call(`/api/orgs/${orgId}/digest`, { as });
    expect(r.setting.enabled).toBe(false);
  });

  it("is per company: another company's member cannot read or set it", async () => {
    const a = await setupTenant("owner");
    const b = await setupTenant("owner");
    await call(`/api/orgs/${a.orgId}/digest`, { as: b.userId, expect: 404 });
    await call(`/api/orgs/${a.orgId}/digest`, {
      method: "PUT",
      as: b.userId,
      expect: 404,
      json: { enabled: true },
    });
  });

  it("mails each opted-in member once a week, with the report's next steps, escaped", async () => {
    const { orgId, userId: as, user: owner } = await setupTenant("owner");
    await grantPlan(orgId);
    await lateJob(orgId, as, "Clinic TI");
    // A sample job is never in the email.
    await call(`/api/orgs/${orgId}/projects/sample`, { method: "POST", as, expect: 201 });
    const pm = await createTestUser();
    await addToOrg(orgId, pm.id, "viewer");
    const quiet = await createTestUser(); // member, not opted in
    await addToOrg(orgId, quiet.id, "editor");
    await call(`/api/orgs/${orgId}/digest`, { method: "PUT", as, json: { enabled: true } });
    await call(`/api/orgs/${orgId}/digest`, { method: "PUT", as: pm.id, json: { enabled: true } });

    const preview = await call<{ preview: { jobs: { name: string }[] } }>(
      `/api/orgs/${orgId}/digest`,
      { as },
    );
    expect(preview.preview.jobs.map((j) => j.name)).toEqual(["Clinic TI"]);

    const before = testFakes.email.sent.length;
    await sendWeeklyDigests(at("2026-11-23"));
    const mine = mailTo(before, owner.email);
    expect(mine).toHaveLength(1);
    expect(mailTo(before, pm.email)).toHaveLength(1);
    expect(mailTo(before, quiet.email)).toHaveLength(0);
    const m = mine[0];
    expect(m?.subject).toBe("Your weekly PayApps list: money to chase");
    expect(m?.text).toContain("Clinic TI, Harbor <Builders>");
    expect(m?.text).toMatch(/Application #1 was due on 2026-03-02 \(30 days\)/);
    expect(m?.text).toContain(`http://localhost:5173/orgs/${orgId}/cash`);
    expect(m?.text).not.toMatch(/sample/i);
    // The past-due application has a follow-up draft waiting on the cash page.
    expect(m?.text).toContain("A follow-up email to the GC is drafted for the 1 application");
    expect(m?.text).toContain(`http://localhost:5173/orgs/${orgId}/cash#follow-ups`);
    expect(m?.html).toContain(`/orgs/${orgId}/cash#follow-ups">Open the drafts</a>`);
    // And a link straight to that application's own draft, under its job.
    expect(m?.text).toMatch(
      new RegExp(
        `  - Draft email for application #1 \\(second request\\): http://localhost:5173/orgs/${orgId}/cash#follow-up-[\\w-]+\n`,
      ),
    );
    expect(m?.html).toMatch(
      new RegExp(
        `<li style="margin:0 0 6px"><a href="http://localhost:5173/orgs/${orgId}/cash#follow-up-[\\w-]+">Draft email for application #1 \\(second request\\)</a></li>`,
      ),
    );
    expect(m?.html).toContain("Harbor &lt;Builders&gt;");
    expect(m?.html).not.toContain("<Builders>");

    // A retried or second run the same week sends nothing more.
    const again = testFakes.email.sent.length;
    await sendWeeklyDigests(at("2026-11-23"));
    await sendWeeklyDigests(at("2026-11-26"));
    expect(mailTo(again, owner.email)).toHaveLength(0);
    // Next week it goes again.
    await sendWeeklyDigests(at("2026-11-30"));
    expect(mailTo(again, owner.email)).toHaveLength(1);
    const [row] = await testDb()
      .select()
      .from(cashDigestSubscriptions)
      .where(and(eq(cashDigestSubscriptions.orgId, orgId), eq(cashDigestSubscriptions.userId, as)));
    expect(row?.lastSentOn).toBe("2026-11-30");
  });

  it("goes out on the member's chosen weekday, once a week; Monday when no day is sent", async () => {
    const { orgId, userId: as, user: owner } = await setupTenant("owner");
    await grantPlan(orgId);
    await lateJob(orgId, as, "Clinic TI");
    const pm = await createTestUser();
    await addToOrg(orgId, pm.id, "viewer");
    // Thursday for the owner; the PM never picks a day and gets Monday.
    const set = await call<{ weekday: number; nextOn: string | null }>(
      `/api/orgs/${orgId}/digest`,
      {
        method: "PUT",
        as,
        json: { enabled: true, weekday: 4 },
      },
    );
    expect(set.weekday).toBe(4);
    expect(set.nextOn).not.toBeNull();
    await call(`/api/orgs/${orgId}/digest`, { method: "PUT", as: pm.id, json: { enabled: true } });

    const before = testFakes.email.sent.length;
    await sendWeeklyDigests(at("2026-11-23")); // Monday
    expect(mailTo(before, owner.email)).toHaveLength(0);
    expect(mailTo(before, pm.email)).toHaveLength(1);
    await sendWeeklyDigests(at("2026-11-26")); // Thursday
    expect(mailTo(before, owner.email)).toHaveLength(1);
    expect(mailTo(before, pm.email)).toHaveLength(1);

    // Moving to Friday the day after Thursday's email waits for the next Friday, not tomorrow.
    await call(`/api/orgs/${orgId}/digest`, {
      method: "PUT",
      as,
      json: { enabled: true, weekday: 5 },
    });
    await sendWeeklyDigests(at("2026-11-27"));
    expect(mailTo(before, owner.email)).toHaveLength(1);
    await sendWeeklyDigests(at("2026-12-04"));
    expect(mailTo(before, owner.email)).toHaveLength(2);

    // Sent again without a day while on, the day stays; turned off, the row goes, so a fresh opt-in
    // without a day starts on Monday (the page always sends the day it shows).
    await call(`/api/orgs/${orgId}/digest`, { method: "PUT", as, json: { enabled: true } });
    let r = await call<{ setting: { weekday: number } }>(`/api/orgs/${orgId}/digest`, { as });
    expect(r.setting.weekday).toBe(5);
    await call(`/api/orgs/${orgId}/digest`, { method: "PUT", as, json: { enabled: false } });
    await call(`/api/orgs/${orgId}/digest`, { method: "PUT", as, json: { enabled: true } });
    r = await call<{ setting: { weekday: number } }>(`/api/orgs/${orgId}/digest`, { as });
    expect(r.setting.weekday).toBe(1);
    await call(`/api/orgs/${orgId}/digest`, {
      method: "PUT",
      as,
      json: { enabled: true, weekday: 7 },
      expect: 400,
    });
  });

  it("goes out at the member's own hour in their own time zone", async () => {
    const { orgId, userId: as, user: owner } = await setupTenant("owner");
    await grantPlan(orgId);
    await lateJob(orgId, as, "Clinic TI");
    // Tuesdays at 6:00 in Denver (MST, UTC-7, in December): 13:00 UTC.
    const set = await call<{ weekday: number; hour: number; timeZone: string; nextOn: string }>(
      `/api/orgs/${orgId}/digest`,
      {
        method: "PUT",
        as,
        json: { enabled: true, weekday: 2, hour: 6, timeZone: "America/Denver" },
      },
    );
    expect(set).toMatchObject({ weekday: 2, hour: 6, timeZone: "America/Denver" });
    const hourly = (iso: string) => createAppContext(env, { now: () => new Date(iso) });
    const before = testFakes.email.sent.length;
    await sendWeeklyDigests(hourly("2026-12-01T12:00:00Z")); // 05:00 in Denver
    expect(mailTo(before, owner.email)).toHaveLength(0);
    await sendWeeklyDigests(hourly("2026-12-01T13:00:00Z")); // 06:00 in Denver
    expect(mailTo(before, owner.email)).toHaveLength(1);
    await sendWeeklyDigests(hourly("2026-12-01T14:00:00Z")); // the next hour: nothing more
    expect(mailTo(before, owner.email)).toHaveLength(1);
    const [row] = await testDb()
      .select()
      .from(cashDigestSubscriptions)
      .where(and(eq(cashDigestSubscriptions.orgId, orgId), eq(cashDigestSubscriptions.userId, as)));
    expect(row?.lastSentOn).toBe("2026-12-01");

    // Tuesday evening in Denver is Wednesday in UTC; a member in Auckland whose Wednesday 8:00 is
    // Tuesday 19:00 UTC gets theirs then, on their own Wednesday.
    const nz = await createTestUser();
    await addToOrg(orgId, nz.id, "viewer");
    await call(`/api/orgs/${orgId}/digest`, {
      method: "PUT",
      as: nz.id,
      json: { enabled: true, weekday: 3, hour: 8, timeZone: "Pacific/Auckland" },
    });
    await sendWeeklyDigests(hourly("2026-12-08T18:00:00Z")); // Wednesday 07:00 in Auckland
    expect(mailTo(before, nz.email)).toHaveLength(0);
    await sendWeeklyDigests(hourly("2026-12-08T19:00:00Z")); // Wednesday 08:00 in Auckland
    expect(mailTo(before, nz.email)).toHaveLength(1);

    // Changing only the hour keeps the day and zone; a zone that does not exist is refused.
    const moved = await call<{ weekday: number; hour: number; timeZone: string }>(
      `/api/orgs/${orgId}/digest`,
      { method: "PUT", as, json: { enabled: true, hour: 9 } },
    );
    expect(moved).toMatchObject({ weekday: 2, hour: 9, timeZone: "America/Denver" });
    for (const bad of [{ timeZone: "Mars/Olympus_Mons" }, { hour: 24 }, { hour: -1 }]) {
      await call(`/api/orgs/${orgId}/digest`, {
        method: "PUT",
        as,
        json: { enabled: true, ...bad },
        expect: 400,
      });
    }
  });

  it("skips a removed member, an unconfirmed address and a week with nothing to chase", async () => {
    const { orgId, userId: as, user: owner } = await setupTenant("owner");
    await call(`/api/orgs/${orgId}/digest`, { method: "PUT", as, json: { enabled: true } });
    // Nothing to chase: no email, and the week counts as done.
    let before = testFakes.email.sent.length;
    await sendWeeklyDigests(at("2026-11-23"));
    expect(mailTo(before, owner.email)).toHaveLength(0);

    await grantPlan(orgId);
    await lateJob(orgId, as, "Clinic TI");
    const gone = await createTestUser();
    await addToOrg(orgId, gone.id, "viewer");
    await call(`/api/orgs/${orgId}/digest`, {
      method: "PUT",
      as: gone.id,
      json: { enabled: true },
    });
    await testDb()
      .delete(member)
      .where(and(eq(member.organizationId, orgId), eq(member.userId, gone.id)));
    const unconfirmed = await createTestUser();
    await addToOrg(orgId, unconfirmed.id, "viewer");
    await call(`/api/orgs/${orgId}/digest`, {
      method: "PUT",
      as: unconfirmed.id,
      json: { enabled: true },
    });
    await testDb().update(user).set({ emailVerified: false }).where(eq(user.id, unconfirmed.id));

    before = testFakes.email.sent.length;
    await sendWeeklyDigests(at("2026-11-30"));
    expect(mailTo(before, owner.email)).toHaveLength(1);
    expect(mailTo(before, gone.email)).toHaveLength(0);
    expect(mailTo(before, unconfirmed.email)).toHaveLength(0);
  });
  it("mails a company with nothing to chase but a lapsed insurance certificate, escaped", async () => {
    const { orgId, userId: as, user: owner } = await setupTenant("owner");
    await call(`/api/orgs/${orgId}/digest`, { method: "PUT", as, json: { enabled: true } });
    const add = (json: Record<string, unknown>) =>
      call(`/api/orgs/${orgId}/insurance`, { method: "POST", as, expect: 201, json });
    await add({ kind: "other", label: "Inland <marine>", expiresOn: "2026-11-20" });
    await add({ kind: "auto", carrier: "Acme Mutual", expiresOn: "2026-12-10" });
    await add({ kind: "general_liability", expiresOn: "2027-06-30" }); // current: not listed
    const archived = await call<{ id: string }>(`/api/orgs/${orgId}/insurance`, {
      method: "POST",
      as,
      expect: 201,
      json: { kind: "umbrella", expiresOn: "2026-10-01" },
    });
    await call(`/api/orgs/${orgId}/insurance/${archived.id}`, {
      method: "PATCH",
      as,
      json: { archived: true },
    });

    const before = testFakes.email.sent.length;
    await sendWeeklyDigests(at("2026-11-23"));
    const mine = mailTo(before, owner.email);
    expect(mine).toHaveLength(1);
    const m = mine[0];
    expect(m?.text).toContain("from your insurance certificates as of 2026-11-23");
    expect(m?.text).toContain("- Insurance certificates to renew: 2, of which 1 has expired.");
    expect(m?.text).toContain(
      "  - Inland <marine>: expired 2026-11-20. Send your GCs the renewal certificate, then enter it in PayApps.",
    );
    expect(m?.text).toContain("  - Commercial auto (Acme Mutual): expires 2026-12-10, in 17 days.");
    expect(m?.text).toContain(`  Insurance page: http://localhost:5173/orgs/${orgId}/insurance`);
    expect(m?.text).not.toMatch(/General liability|Umbrella/);
    expect(m?.html).toContain("Inland &lt;marine&gt;");
    expect(m?.html).not.toContain("<marine>");
    expect(m?.html).toContain(`/orgs/${orgId}/insurance">Open the insurance page</a>`);

    // Another company's certificates never reach this company's email.
    const other = await setupTenant("owner");
    await call(`/api/orgs/${other.orgId}/digest`, {
      method: "PUT",
      as: other.userId,
      json: { enabled: true },
    });
    const b = testFakes.email.sent.length;
    await sendWeeklyDigests(at("2026-11-30"));
    expect(mailTo(b, other.user.email)).toHaveLength(0);
    expect(mailTo(b, owner.email)).toHaveLength(1);
  });

  it("mails a company with nothing to chase but a lapsed license, escaped and kept to its own org", async () => {
    const { orgId, userId: as, user: owner } = await setupTenant("owner");
    await call(`/api/orgs/${orgId}/digest`, { method: "PUT", as, json: { enabled: true } });
    const add = (json: Record<string, unknown>) =>
      call<{ id: string }>(`/api/orgs/${orgId}/documents`, {
        method: "POST",
        as,
        expect: 201,
        json,
      });
    await add({
      kind: "contractor_license",
      label: "<Electrical>",
      jurisdiction: "NV",
      expiresOn: "2026-11-20",
    });
    await add({ kind: "bonding_letter", issuer: "Surety Co", expiresOn: "2026-12-10" });
    await add({ kind: "w9" }); // no expiry: never listed
    await add({ kind: "emr_letter", expiresOn: "2027-06-30" }); // current: not listed
    const archived = await add({ kind: "business_license", expiresOn: "2026-10-01" });
    await call(`/api/orgs/${orgId}/documents/${archived.id}`, {
      method: "PATCH",
      as,
      json: { archived: true },
    });

    const preview = await call<{ preview: { documents: unknown[] } | null }>(
      `/api/orgs/${orgId}/digest`,
      { as },
    );
    expect(preview.preview?.documents).toHaveLength(2);

    const before = testFakes.email.sent.length;
    await sendWeeklyDigests(at("2026-11-23"));
    const mine = mailTo(before, owner.email);
    expect(mine).toHaveLength(1);
    const m = mine[0];
    expect(m?.text).toContain("from your company documents as of 2026-11-23");
    expect(m?.text).toContain(
      "- Licenses and company documents to renew: 2, of which 1 has expired.",
    );
    expect(m?.text).toContain(
      "  - Contractor's license: <Electrical> (NV): expired 2026-11-20. Renew it, send any GC who keeps a copy on file the new one, then enter it in PayApps.",
    );
    expect(m?.text).toContain("  - Bonding letter: expires 2026-12-10, in 17 days.");
    expect(m?.text).toContain(`  Documents page: http://localhost:5173/orgs/${orgId}/documents`);
    expect(m?.text).not.toMatch(/W-9|EMR letter|Business license/);
    expect(m?.html).toContain("&lt;Electrical&gt;");
    expect(m?.html).not.toContain("<Electrical>");
    expect(m?.html).toContain(`/orgs/${orgId}/documents">Open the documents page</a>`);

    // Another company's documents never reach this company's email.
    const other = await setupTenant("owner");
    await call(`/api/orgs/${other.orgId}/digest`, {
      method: "PUT",
      as: other.userId,
      json: { enabled: true },
    });
    const b = testFakes.email.sent.length;
    await sendWeeklyDigests(at("2026-11-30"));
    expect(mailTo(b, other.user.email)).toHaveLength(0);
    expect(mailTo(b, owner.email)).toHaveLength(1);
  });

  it("mails overdue RFIs across active jobs, linked to each job's log, escaped", async () => {
    const { orgId, userId: as, user: owner } = await setupTenant("owner");
    await grantPlan(orgId);
    await call(`/api/orgs/${orgId}/digest`, { method: "PUT", as, json: { enabled: true } });
    const newJob = async (name: string, number: string | null = null) =>
      call<ProjectDto>(`/api/orgs/${orgId}/projects`, {
        method: "POST",
        as,
        expect: 201,
        json: { name, number, gcName: "Harbor <Builders>", originalContractSumCents: 1_000_000 },
      });
    const rfi = (projectId: string, json: Record<string, unknown>) =>
      call(`/api/orgs/${orgId}/projects/${projectId}/rfis`, {
        method: "POST",
        as,
        expect: 201,
        json: { question: "Which detail governs?", ...json },
      });
    const clinic = await newJob("Clinic TI", "2207");
    const school = await newJob("School <gym>");
    const closed = await newJob("Old job");
    await rfi(clinic.id, {
      subject: "Ceiling height",
      sentOn: "2026-11-09",
      responseDueOn: "2026-11-16",
    }); // 7 days overdue on 2026-11-23
    await rfi(school.id, {
      subject: "Beam <size>",
      sentOn: "2026-11-01",
      responseDueOn: "2026-11-08",
    }); // 15 days: listed first
    await rfi(clinic.id, {
      subject: "Not yet due",
      sentOn: "2026-11-20",
      responseDueOn: "2026-11-27",
    });
    await rfi(clinic.id, { subject: "No date asked", sentOn: "2026-10-01" }); // never overdue
    await rfi(clinic.id, { subject: "Never sent" });
    const answered = await call<{ id: string }>(`/api/orgs/${orgId}/projects/${clinic.id}/rfis`, {
      method: "POST",
      as,
      expect: 201,
      json: {
        subject: "Answered late",
        question: "Q",
        sentOn: "2026-11-01",
        responseDueOn: "2026-11-05",
      },
    });
    await call(`/api/orgs/${orgId}/projects/${clinic.id}/rfis/${answered.id}`, {
      method: "PATCH",
      as,
      json: { answeredOn: "2026-11-12", answer: "Use detail 4" },
    });
    await rfi(closed.id, {
      subject: "On a closed job",
      sentOn: "2026-10-01",
      responseDueOn: "2026-10-08",
    });
    await call(`/api/orgs/${orgId}/projects/${closed.id}`, {
      method: "PATCH",
      as,
      json: { status: "closed" },
    });

    const before = testFakes.email.sent.length;
    await sendWeeklyDigests(at("2026-11-23"));
    const mine = mailTo(before, owner.email);
    expect(mine).toHaveLength(1);
    const m = mine[0];
    const url = (id: string) => `http://localhost:5173/orgs/${orgId}/projects/${id}#rfis`;
    expect(m?.text).toContain("from your RFI logs as of 2026-11-23");
    expect(m?.text).toContain("- RFIs past the response date with no answer: 2.");
    expect(m?.text).toContain("RFIs waiting on an answer");
    const school1 = `  - School <gym>, RFI 001: Beam <size>: answer due 2026-11-08, 15 days overdue (Harbor <Builders>). ${url(school.id)}`;
    const clinic1 = `  - Clinic TI (#2207), RFI 001: Ceiling height: answer due 2026-11-16, 7 days overdue (Harbor <Builders>). ${url(clinic.id)}`;
    expect(m?.text).toContain(school1);
    expect(m?.text).toContain(clinic1);
    expect(m?.text.indexOf(school1)).toBeLessThan(m?.text.indexOf(clinic1) ?? 0);
    expect(m?.text).not.toMatch(/Not yet due|No date asked|Never sent|Answered late|closed job/);
    expect(m?.html).toContain("School &lt;gym&gt;, RFI 001: Beam &lt;size&gt;");
    expect(m?.html).not.toMatch(/<gym>|<size>|<Builders>/);
    expect(m?.html).toContain(`href="${url(clinic.id)}"`);

    // Another company's RFIs never reach this company's email, and it gets none of its own.
    const other = await setupTenant("owner");
    await call(`/api/orgs/${other.orgId}/digest`, {
      method: "PUT",
      as: other.userId,
      json: { enabled: true },
    });
    const b = testFakes.email.sent.length;
    await sendWeeklyDigests(at("2026-11-30"));
    expect(mailTo(b, other.user.email)).toHaveLength(0);
    expect(mailTo(b, owner.email)).toHaveLength(1);
  });

  it("mails submittals to chase across active jobs, linked to each job's log, escaped", async () => {
    const { orgId, userId: as, user: owner } = await setupTenant("owner");
    await grantPlan(orgId);
    await call(`/api/orgs/${orgId}/digest`, { method: "PUT", as, json: { enabled: true } });
    const newJob = async (name: string) =>
      call<ProjectDto>(`/api/orgs/${orgId}/projects`, {
        method: "POST",
        as,
        expect: 201,
        json: { name, gcName: "Harbor <Builders>", originalContractSumCents: 1_000_000 },
      });
    const sub = (projectId: string, json: Record<string, unknown>) =>
      call(`/api/orgs/${orgId}/projects/${projectId}/submittals`, {
        method: "POST",
        as,
        expect: 201,
        json: { type: "shop_drawings", ...json },
      });
    const clinic = await newJob("Clinic <TI>");
    const closed = await newJob("Old job");
    await sub(clinic.id, {
      title: "Ductwork <shop>",
      specSection: "23 31 13",
      submittedOn: "2026-11-02",
      requiredBy: "2026-11-16",
    }); // 7 days overdue back on 2026-11-23
    await sub(clinic.id, {
      title: "VAV boxes",
      neededOnSite: "2026-12-20",
      leadTimeDays: 30,
      reviewDays: 10,
    }); // last day to send 2026-11-10: late, delivery at risk, listed first
    await sub(clinic.id, { title: "Not due", submittedOn: "2026-11-20", requiredBy: "2026-12-04" });
    await sub(closed.id, {
      title: "On a closed job",
      submittedOn: "2026-10-01",
      requiredBy: "2026-10-08",
    });
    await call(`/api/orgs/${orgId}/projects/${closed.id}`, {
      method: "PATCH",
      as,
      json: { status: "closed" },
    });

    const before = testFakes.email.sent.length;
    await sendWeeklyDigests(at("2026-11-23"));
    const mine = mailTo(before, owner.email);
    expect(mine).toHaveLength(1);
    const m = mine[0];
    const url = `http://localhost:5173/orgs/${orgId}/projects/${clinic.id}/submittals`;
    expect(m?.text).toContain("from your submittal logs as of 2026-11-23");
    expect(m?.text).toContain(
      "- Submittals to chase: 2, of which 1 puts delivery on site at risk.",
    );
    const vav = `  - Clinic <TI>, #2 VAV boxes: not sent, last day to send was 2026-11-10, 13 days ago (Harbor <Builders>). Delivery on site is at risk. ${url}`;
    const duct = `  - Clinic <TI>, 23 31 13 #1 Ductwork <shop>: back from the GC by 2026-11-16, 7 days overdue (Harbor <Builders>). ${url}`;
    expect(m?.text).toContain(vav);
    expect(m?.text).toContain(duct);
    expect(m?.text.indexOf(vav)).toBeLessThan(m?.text.indexOf(duct) ?? 0);
    expect(m?.text).not.toMatch(/Not due|closed job/);
    expect(m?.html).toContain("Clinic &lt;TI&gt;, 23 31 13 #1 Ductwork &lt;shop&gt;");
    expect(m?.html).not.toMatch(/<TI>|<shop>|<Builders>/);
    expect(m?.html).toContain(`href="${url}"`);
  });

  it("lists last week's weekdays without a daily report on active jobs, never alone", async () => {
    const { orgId, userId: as, user: owner } = await setupTenant("owner");
    await grantPlan(orgId);
    await call(`/api/orgs/${orgId}/digest`, { method: "PUT", as, json: { enabled: true } });
    const newJob = async (name: string, number: string | null = null) =>
      call<ProjectDto>(`/api/orgs/${orgId}/projects`, {
        method: "POST",
        as,
        expect: 201,
        json: { name, number, gcName: "Harbor <Builders>", originalContractSumCents: 1_000_000 },
      });
    const report = (projectId: string, reportDate: string, org = orgId, by = as) =>
      call(`/api/orgs/${org}/projects/${projectId}/daily-reports`, {
        method: "POST",
        as: by,
        expect: 201,
        json: { reportDate },
      });
    const school = await newJob("School <gym>", "31");
    const stopped = await newJob("Finished job");
    const closed = await newJob("Closed job");
    for (const d of ["2026-11-13", "2026-11-16", "2026-11-17", "2026-11-19"]) {
      await report(school.id, d);
    }
    await report(stopped.id, "2026-11-02"); // log stopped three weeks ago: never listed
    await report(closed.id, "2026-11-16");
    await call(`/api/orgs/${orgId}/projects/${closed.id}`, {
      method: "PATCH",
      as,
      json: { status: "closed" },
    });

    // Gaps alone send nothing (the preview is what the cron mails): a sub is often not on site
    // every weekday.
    const quiet = await call<{ preview: unknown }>(`/api/orgs/${orgId}/digest`, { as });
    expect(quiet.preview).toBeNull();

    // With money to chase, the email goes out and lists the missing days.
    await lateJob(orgId, as, "Clinic TI");
    const preview = await call<{
      preview: { dailyGaps: { projectId: string; days: string[] }[] };
    }>(`/api/orgs/${orgId}/digest`, { as });
    expect(preview.preview.dailyGaps.map((g) => g.projectId)).toEqual([school.id]);
    let before = testFakes.email.sent.length;
    await sendWeeklyDigests(at("2026-11-23"));
    const mine = mailTo(before, owner.email);
    expect(mine).toHaveLength(1);
    const m = mine[0];
    const url = `http://localhost:5173/orgs/${orgId}/projects/${school.id}/daily-reports`;
    expect(m?.text).toContain("and your daily reports as of 2026-11-23");
    expect(m?.text).toContain("- Weekdays without a daily report last week: 2 on 1 job.");
    expect(m?.text).toContain(
      `Weekdays without a daily report\n  - School <gym> (#31), Harbor <Builders>: no report for Wednesday 2026-11-18 and Friday 2026-11-20. ${url}`,
    );
    expect(m?.text).not.toMatch(/Finished job|Closed job/);
    expect(m?.html).toContain(`<a href="${url}">School &lt;gym&gt; (#31), Harbor &lt;Builders&gt;`);
    expect(m?.html).not.toMatch(/<gym>|<Builders>/);

    // Another company's logs never reach this company's email.
    const other = await setupTenant("owner");
    const theirs = await call<ProjectDto>(`/api/orgs/${other.orgId}/projects`, {
      method: "POST",
      as: other.userId,
      expect: 201,
      json: { name: "Their job", gcName: "GC", originalContractSumCents: 1 },
    });
    await report(theirs.id, "2026-11-23", other.orgId, other.userId);
    // This company lists Thanksgiving and the Friday after; the other one lists the Wednesday.
    const holidays = (org: string, by: string, list: { on: string; name: string }[]) =>
      call(`/api/orgs/${org}/schedule/holidays`, {
        method: "POST",
        as: by,
        expect: 201,
        json: { holidays: list },
      });
    await holidays(orgId, as, [
      { on: "2026-11-26", name: "Thanksgiving Day" },
      { on: "2026-11-27", name: "Day after Thanksgiving" },
    ]);
    await holidays(other.orgId, other.userId, [{ on: "2026-11-25", name: "Their shop day" }]);
    before = testFakes.email.sent.length;
    await sendWeeklyDigests(at("2026-11-30"));
    const next = mailTo(before, owner.email)[0];
    expect(next?.text).not.toContain("Their job");
    // The next week School has no report at all: every weekday of the week is listed but the
    // company's own holidays (another company's holiday is not this one's).
    expect(next?.text).toContain(
      "School <gym> (#31), Harbor <Builders>: no report for Monday 2026-11-23, Tuesday 2026-11-24 and Wednesday 2026-11-25.",
    );
    expect(next?.text).toContain("company holidays listed on the crews page are left out");
  });

  it("puts a failed send back so the next run tries again", async () => {
    const { orgId, userId: as, user: owner } = await setupTenant("owner");
    await grantPlan(orgId);
    await lateJob(orgId, as, "Clinic TI");
    await call(`/api/orgs/${orgId}/digest`, { method: "PUT", as, json: { enabled: true } });
    const failing = createAppContext(env, {
      now: () => new Date("2026-11-23T13:00:00Z"),
      email: {
        delivers: true,
        send: async () => {
          throw new Error("Email send failed: provider down");
        },
      },
    });
    const run = await sendWeeklyDigests(failing);
    expect(run.failed).toBeGreaterThanOrEqual(1);
    const [row] = await testDb()
      .select()
      .from(cashDigestSubscriptions)
      .where(and(eq(cashDigestSubscriptions.orgId, orgId), eq(cashDigestSubscriptions.userId, as)));
    expect(row?.lastSentOn).toBeNull();
    const before = testFakes.email.sent.length;
    await sendWeeklyDigests(at("2026-11-23"));
    expect(mailTo(before, owner.email)).toHaveLength(1);
  });

  it("carries a signed one-click unsubscribe link that stops only that member's email", async () => {
    const { orgId, userId: as, user: owner } = await setupTenant("owner");
    await grantPlan(orgId);
    await lateJob(orgId, as, "Clinic TI");
    const pm = await createTestUser();
    await addToOrg(orgId, pm.id, "viewer");
    await call(`/api/orgs/${orgId}/digest`, { method: "PUT", as, json: { enabled: true } });
    await call(`/api/orgs/${orgId}/digest`, { method: "PUT", as: pm.id, json: { enabled: true } });

    const before = testFakes.email.sent.length;
    await sendWeeklyDigests(at("2026-11-23"));
    const m = mailTo(before, owner.email)[0];
    expect(m?.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    const header = m?.headers?.["List-Unsubscribe"] ?? "";
    const oneClick = /^<(http:\/\/localhost:5173\/api\/unsubscribe\/digest\?[^>]+)>$/.exec(
      header,
    )?.[1];
    expect(oneClick).toBeDefined();
    const pageLink = /http:\/\/localhost:5173\/unsubscribe\?\S+/.exec(m?.text ?? "")?.[0];
    expect(pageLink).toBeDefined();
    expect(m?.html).toContain("Stop this weekly email");
    const path = (u: string) => u.replace("http://localhost:5173", "");
    const q = new URL(oneClick ?? "").searchParams;
    expect(new URL(pageLink ?? "").search).toBe(new URL(oneClick ?? "").search);

    // GET (a mail scanner, a link preview) reads, never changes.
    const status = await call<{ orgName: string; subscribed: boolean }>(path(oneClick ?? ""));
    expect(status).toEqual({ orgName: "Test Mechanical", subscribed: true });

    // A forged or altered link answers 404 and changes nothing.
    const forged = new URLSearchParams({ o: orgId, u: pm.id, t: q.get("t") ?? "" });
    await call(`/api/unsubscribe/digest?${forged}`, { method: "POST", expect: 404 });
    // Change the last character to another canonical one (A and Q both leave the spare bits 0), so
    // the signature really differs; a token already ending in A stayed valid one run in 16.
    const t = q.get("t") ?? "";
    const bad = new URLSearchParams({
      o: orgId,
      u: as,
      t: `${t.slice(0, -1)}${t.endsWith("A") ? "Q" : "A"}`,
    });
    await call(`/api/unsubscribe/digest?${bad}`, { method: "POST", expect: 404 });
    await call(`/api/unsubscribe/digest?o=${orgId}&u=${as}`, { method: "POST", expect: 404 });
    expect(
      (await call<{ setting: { enabled: boolean } }>(`/api/orgs/${orgId}/digest`, { as })).setting
        .enabled,
    ).toBe(true);

    // RFC 8058 one-click: a mail app POSTs the form body with no session and no Origin.
    const res = await api(path(oneClick ?? ""), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "List-Unsubscribe=One-Click",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ orgName: "Test Mechanical", subscribed: false });
    // Again is the same as once.
    await call(path(oneClick ?? ""), { method: "POST" });

    expect(
      (await call<{ setting: { enabled: boolean } }>(`/api/orgs/${orgId}/digest`, { as })).setting
        .enabled,
    ).toBe(false);
    expect(
      (await call<{ setting: { enabled: boolean } }>(`/api/orgs/${orgId}/digest`, { as: pm.id }))
        .setting.enabled,
    ).toBe(true);
    const next = testFakes.email.sent.length;
    await sendWeeklyDigests(at("2026-11-30"));
    expect(mailTo(next, owner.email)).toHaveLength(0);
    expect(mailTo(next, pm.email)).toHaveLength(1);
  });
});
