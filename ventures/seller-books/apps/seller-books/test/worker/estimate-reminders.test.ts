// The 1040-ES reminder email (services/books/estimate-reminders.ts): owner and admins turn it on for
// themselves; the daily run mails each of them once per due date, from a week before it, with what the
// Estimated tax page shows is still to pay; a covered date, an unconfirmed address or a member no longer
// an admin gets nothing; the signed stop link works without signing in and only for its own member.
import { env } from "cloudflare:workers";
import { createAppContext, testFakes } from "@worker/context";
import { member, user } from "@worker/db/schema";
import type { Env } from "@worker/env";
import { newId } from "@worker/lib/ids";
import { signUnsubscribe } from "@worker/lib/unsubscribe-token";
import {
  reminderUnsubscribeLinks,
  sendEstimateReminders,
} from "@worker/services/books/estimate-reminders";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { api, createTestUser, json, setupTenant, testDb } from "./helpers";

type Tenant = Awaited<ReturnType<typeof setupTenant>>;
const reminderPath = (t: Tenant) => `/api/orgs/${t.orgId}/reports/estimated-tax/reminder`;
const settingsPath = (t: Tenant, year = 2026) =>
  `/api/orgs/${t.orgId}/reports/estimated-tax/settings/${year}`;

const FIGURES = {
  filing: "single",
  wages: 0,
  otherIncome: 0,
  withholding: 0,
  priorYearTax: 4000,
  priorAgiOver150k: false,
  mileageRate: null,
  paid: [0, 0, 0, 0],
};

const runAt = (iso: string) =>
  sendEstimateReminders(
    createAppContext(env as unknown as Env, { now: () => new Date(`${iso}T14:00:00Z`) }),
  );

const mailTo = (address: string) => testFakes.email.sent.filter((m) => m.to.includes(address));

async function turnOn(t: Tenant, as = t.userId) {
  const res = await api(reminderPath(t), { method: "PUT", as, json: { enabled: true } });
  expect(res.status).toBe(200);
  return json<{ enabled: boolean; next: { due: string; sendsOn: string } }>(res);
}

async function addSale(t: Tenant, date: string, cents: number) {
  const res = await api(`/api/orgs/${t.orgId}/sales`, {
    method: "POST",
    as: t.userId,
    json: { date, title: "Mid-century dresser, local pickup", itemCents: cents },
  });
  expect(res.status).toBe(201);
}

async function addMember(t: Tenant, role: "viewer" | "editor" | "admin") {
  const u = await createTestUser();
  await testDb()
    .insert(member)
    .values({ id: newId("mem"), organizationId: t.orgId, userId: u.id, role });
  return u;
}

describe("estimated-tax reminder setting", () => {
  it("turns on and off for the member who asks, owner and admins only", async () => {
    const t = await setupTenant();
    const off = await json<{ enabled: boolean }>(await api(reminderPath(t), { as: t.userId }));
    expect(off.enabled).toBe(false);
    const on = await turnOn(t);
    expect(on.enabled).toBe(true);
    expect(on.next.due).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // Turning it on twice keeps one row.
    expect((await turnOn(t)).enabled).toBe(true);

    const admin = await addMember(t, "admin");
    // Per member: the owner's choice is not the admin's.
    expect(
      (await json<{ enabled: boolean }>(await api(reminderPath(t), { as: admin.id }))).enabled,
    ).toBe(false);
    for (const role of ["editor", "viewer"] as const) {
      const m = await addMember(t, role);
      expect((await api(reminderPath(t), { as: m.id })).status).toBe(403);
      const put = await api(reminderPath(t), { method: "PUT", as: m.id, json: { enabled: true } });
      expect(put.status).toBe(403);
    }
    const other = await setupTenant();
    expect((await api(reminderPath(t), { as: other.userId })).status).toBe(404);
    expect(
      (await api(reminderPath(t), { method: "PUT", as: t.userId, json: { enabled: "yes" } }))
        .status,
    ).toBe(400);

    const offAgain = await api(reminderPath(t), {
      method: "PUT",
      as: t.userId,
      json: { enabled: false },
    });
    expect((await json<{ enabled: boolean }>(offAgain)).enabled).toBe(false);
  });
});

describe("the daily reminder run", () => {
  it("mails what the Estimated tax page shows, once per due date, from a week before it", async () => {
    const t = await setupTenant();
    await addSale(t, "2026-02-10", 2_000_000);
    expect(
      (await api(settingsPath(t), { method: "PUT", as: t.userId, json: FIGURES })).status,
    ).toBe(200);
    await turnOn(t);

    // Eight days before June 15: nothing yet.
    expect((await runAt("2026-06-07")).due).toBeNull();
    expect(mailTo(t.email)).toHaveLength(0);

    const run = await runAt("2026-06-10");
    expect(run.due).toBe("2026-06-15");
    const [mail, ...more] = mailTo(t.email);
    expect(more).toHaveLength(0);
    expect(mail?.subject).toBe("Estimated tax due June 15, 2026: your Seller Books reminder");

    // The amount is the page's own figure for the June date on the same day.
    const page = await json<{ rows: { stillToPay: number | null }[] }>(
      await api(`/api/orgs/${t.orgId}/reports/estimated-tax`, {
        method: "POST",
        as: t.userId,
        json: { ...FIGURES, mileageRate: undefined, year: 2026, asOf: "2026-06-10" },
      }),
    );
    const due = page.rows[1]?.stillToPay ?? 0;
    expect(due).toBeGreaterThan(0);
    const dollars = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
      due / 100,
    );
    expect(mail?.text).toContain(`about ${dollars} is still to pay by that date`);
    expect(mail?.text).toContain(
      "The second 2026 estimated payment is due in 5 days, June 15, 2026.",
    );
    expect(mail?.text).toContain("not tax advice");
    expect(mail?.text).toContain(`/orgs/${t.orgId}/estimated-tax`);
    expect(mail?.html).toContain("Stop these reminders");
    expect(mail?.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");

    // The next day's run, and a second run the same day, send nothing more.
    await runAt("2026-06-10");
    await runAt("2026-06-11");
    expect(mailTo(t.email)).toHaveLength(1);
    // The September date gets its own reminder.
    await runAt("2026-09-08");
    expect(mailTo(t.email)).toHaveLength(2);
    expect(mailTo(t.email)[1]?.subject).toContain("September 15, 2026");
  });

  it("sends nothing for a date already covered, and says when no figures are saved", async () => {
    const covered = await setupTenant();
    await addSale(covered, "2026-02-10", 2_000_000);
    await api(settingsPath(covered), {
      method: "PUT",
      as: covered.userId,
      json: { ...FIGURES, paid: [3000, 3000, 0, 0] },
    });
    await turnOn(covered);

    const bare = await setupTenant();
    await turnOn(bare);

    const run = await runAt("2026-06-12");
    expect(run.covered).toBeGreaterThanOrEqual(1);
    expect(mailTo(covered.email)).toHaveLength(0);
    const [mail] = mailTo(bare.email);
    expect(mail?.text).toContain("No figures are saved for 2026");
    expect(mail?.text).not.toMatch(/still to pay by that date/);

    // Covered dates are checked again each day: a payment taken back off sends one.
    await api(settingsPath(covered), { method: "PUT", as: covered.userId, json: FIGURES });
    await runAt("2026-06-13");
    expect(mailTo(covered.email)).toHaveLength(1);
  });

  it("skips an unconfirmed address and a member who is no longer an admin", async () => {
    const t = await setupTenant();
    const admin = await addMember(t, "admin");
    await turnOn(t);
    await turnOn(t, admin.id);
    await testDb().update(user).set({ emailVerified: false }).where(eq(user.id, t.userId));
    await testDb()
      .update(member)
      .set({ role: "editor" })
      .where(and(eq(member.organizationId, t.orgId), eq(member.userId, admin.id)));
    await runAt("2026-09-10");
    expect(mailTo(t.email)).toHaveLength(0);
    expect(mailTo(admin.email)).toHaveLength(0);
  });
});

describe("the stop link", () => {
  it("shows the shop, turns the email off without a session, and only for its own member", async () => {
    const t = await setupTenant();
    await turnOn(t);
    const links = await reminderUnsubscribeLinks(env as unknown as Env, t.orgId, t.userId);
    expect(links?.page).toContain("/unsubscribe?list=estimate-reminder&");
    const url = new URL(links?.oneClick ?? "");
    const path = `${url.pathname}${url.search}`;

    // GET changes nothing (link scanners).
    const look = await json<{ orgName: string; subscribed: boolean }>(await api(path));
    expect(look).toEqual({ orgName: "Test Shop", subscribed: true });
    expect((await json<{ subscribed: boolean }>(await api(path))).subscribed).toBe(true);

    // Another member's id with this token, or a token signed for another list, is refused.
    const q = url.searchParams;
    const forged = new URLSearchParams({ o: t.orgId, u: "usr_someone_else", t: q.get("t") ?? "" });
    expect(
      (await api(`/api/unsubscribe/estimate-reminder?${forged}`, { method: "POST" })).status,
    ).toBe(404);
    const badList = new URLSearchParams({
      o: t.orgId,
      u: t.userId,
      t: await signUnsubscribe("x".repeat(40), t.orgId, t.userId),
    });
    expect((await api(`/api/unsubscribe/estimate-reminder?${badList}`)).status).toBe(404);

    // The one-click POST a mail app sends (form body, no Origin, no session).
    const res = await api(path, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "List-Unsubscribe=One-Click",
    });
    expect(res.status).toBe(200);
    expect((await json<{ subscribed: boolean }>(res)).subscribed).toBe(false);
    expect(
      (await json<{ enabled: boolean }>(await api(reminderPath(t), { as: t.userId }))).enabled,
    ).toBe(false);
  });
});
