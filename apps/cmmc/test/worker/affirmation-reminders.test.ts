// The affirmation reminder email: 60 and 7 days before a date, to admins and owners, once per stage,
// with a signed one-click stop link (services/affirmations/reminders.ts, routes/unsubscribe.ts).

import { env } from "cloudflare:workers";
import type { AffirmationReminderSettings } from "@shared/affirmation-reminders";
import { createAppContext } from "@worker/context";
import { affirmation, memberNotifications, user } from "@worker/db/schema";
import { newId } from "@worker/lib/ids";
import { FakeEmailSender } from "@worker/ports/email";
import { remindAffirmationsDue } from "@worker/services/affirmations/reminders";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { addToOrg, api, createTestUser, setupTenant, testDb } from "./helpers";

type Tenant = Awaited<ReturnType<typeof setupTenant>>;

/** Level 2, Final, affirmed 2026-01-10: the annual affirmation falls due 2027-01-10. */
async function recordAffirmation(t: Tenant) {
  await testDb()
    .insert(affirmation)
    .values({
      id: newId("aff"),
      orgId: t.orgId,
      level: 2,
      kind: "assessment",
      cmmcStatus: "final",
      cmmcStatusDate: "2026-01-08",
      affirmedOn: "2026-01-10",
      officialName: "J. Smith",
      officialTitle: "President",
      officialContact: "jsmith@example.test",
      sprsScore: 104,
      recordedBy: t.userId,
    });
}

/** One daily run on `day`; returns the mail this run sent to `email`. */
async function runOn(day: string, email: string) {
  const sender = new FakeEmailSender();
  const now = new Date(`${day}T11:23:00Z`);
  const result = await remindAffirmationsDue(
    createAppContext(env, { now: () => now, email: sender }),
  );
  expect(result.failed).toBe(0);
  return sender.sent.filter((m) => m.to.includes(email));
}

const settingsPath = (t: Tenant) => `/api/orgs/${t.orgId}/affirmations/reminders`;

describe("affirmation reminder email", () => {
  it("emails the owner at 60 days and at 7 days, once each", async () => {
    const t = await setupTenant();
    await recordAffirmation(t);
    expect(await runOn("2026-11-10", t.user.email)).toHaveLength(0); // 61 days out
    const first = await runOn("2026-11-11", t.user.email);
    expect(first).toHaveLength(1);
    expect(first[0]?.subject).toBe("Annual affirmation in SPRS due in 60 days (Acme Machining)");
    expect(first[0]?.text).toContain("due 2027-01-10 (in 60 days)");
    expect(first[0]?.fromName).toBe("CMMC Workspace");
    // Same day again, and later in the same stage: nothing new.
    expect(await runOn("2026-11-11", t.user.email)).toHaveLength(0);
    expect(await runOn("2026-12-01", t.user.email)).toHaveLength(0);
    // A missed day still sends the stage on the next run.
    const week = await runOn("2027-01-04", t.user.email);
    expect(week).toHaveLength(1);
    expect(week[0]?.subject).toContain("due in 6 days");
    expect(await runOn("2027-01-05", t.user.email)).toHaveLength(0);
    // Overdue: one notice, then nothing more for that date.
    const late = await runOn("2027-01-12", t.user.email);
    expect(late).toHaveLength(1);
    expect(late[0]?.subject).toBe("Annual affirmation in SPRS was due 2027-01-10 (Acme Machining)");
    expect(late[0]?.text).toContain("due 2027-01-10 (passed 2 days ago)");
    expect(late[0]?.text).toContain("This is the only email about a passed date.");
    expect(await runOn("2027-01-13", t.user.email)).toHaveLength(0);
    expect(await runOn("2027-02-05", t.user.email)).toHaveLength(0);
  });

  it("sends no overdue notice for a date that passed over 30 days before the run", async () => {
    const t = await setupTenant();
    await recordAffirmation(t);
    // 2027-01-10 + 30 days = 2027-02-09 is the last day a notice can go.
    expect(await runOn("2027-02-10", t.user.email)).toHaveLength(0);
    const t2 = await setupTenant();
    await recordAffirmation(t2);
    expect(await runOn("2027-02-09", t2.user.email)).toHaveLength(1);
  });

  it("goes to admins and owners who have not turned it off, not editors or viewers", async () => {
    const t = await setupTenant();
    await recordAffirmation(t);
    const admin = await createTestUser("Admin");
    const editor = await createTestUser("Editor");
    const viewer = await createTestUser("Viewer");
    const optedOut = await createTestUser("Opted out");
    await addToOrg(t.orgId, admin.id, "admin");
    await addToOrg(t.orgId, editor.id, "editor");
    await addToOrg(t.orgId, viewer.id, "viewer");
    await addToOrg(t.orgId, optedOut.id, "admin");
    const off = await api(settingsPath(t), { method: "PUT", as: optedOut.id, json: { on: false } });
    expect(off.status).toBe(200);
    const sender = new FakeEmailSender();
    const now = new Date("2026-11-11T11:23:00Z");
    await remindAffirmationsDue(createAppContext(env, { now: () => now, email: sender }));
    const to = sender.sent.flatMap((m) => m.to);
    expect(to).toContain(t.user.email);
    expect(to).toContain(admin.email);
    expect(to).not.toContain(editor.email);
    expect(to).not.toContain(viewer.email);
    expect(to).not.toContain(optedOut.email);
    // Each recipient gets their own message, never a shared To line.
    expect(sender.sent.every((m) => m.to.length === 1)).toBe(true);
  });

  it("stops by the signed one-click link, and only for that member and org", async () => {
    const t = await setupTenant();
    await recordAffirmation(t);
    const [mail] = await runOn("2026-11-11", t.user.email);
    const header = mail?.headers?.["List-Unsubscribe"] ?? "";
    expect(mail?.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    const oneClick = new URL(header.replace(/^<|>$/g, ""));
    expect(oneClick.pathname).toBe("/api/unsubscribe/affirmation-reminders");
    expect(mail?.text).toContain(`/unsubscribe?${oneClick.search.slice(1)}`);
    const link = `${oneClick.pathname}${oneClick.search}`;

    // GET changes nothing (scanners open links).
    const status = await api(link);
    expect(await status.json()).toEqual({ orgName: "Acme Machining", on: true });
    // A tampered link is a 404, for the same member in another org too.
    const other = await setupTenant();
    const forged = link.replace(t.orgId, other.orgId);
    expect((await api(forged, { method: "POST" })).status).toBe(404);
    expect((await api(`${oneClick.pathname}?o=${t.orgId}&u=${t.userId}&t=x`)).status).toBe(404);

    const res = await api(link, { method: "POST", body: "List-Unsubscribe=One-Click" });
    expect(await res.json()).toEqual({ orgName: "Acme Machining", on: false });
    expect(await runOn("2027-01-04", t.user.email)).toHaveLength(0);

    // The member sees it off on the page and can turn it back on.
    const s = await api(settingsPath(t), { as: t.userId });
    expect(((await s.json()) as AffirmationReminderSettings).on).toBe(false);
    const back = await api(settingsPath(t), { method: "PUT", as: t.userId, json: { on: true } });
    expect(((await back.json()) as AffirmationReminderSettings).on).toBe(true);
  });

  it("keeps each member's setting to their own org", async () => {
    const t = await setupTenant();
    const stranger = await setupTenant();
    expect((await api(settingsPath(t), { as: stranger.userId })).status).toBe(404);
    const put = await api(settingsPath(t), {
      method: "PUT",
      as: stranger.userId,
      json: { on: false },
    });
    expect(put.status).toBe(404);
    const rows = await testDb()
      .select()
      .from(memberNotifications)
      .where(eq(memberNotifications.orgId, t.orgId))
      .all();
    expect(rows).toHaveLength(0);
    // An editor sees the setting but is not on the list.
    const editor = await createTestUser("Editor");
    await addToOrg(t.orgId, editor.id, "editor");
    const s = (await (
      await api(settingsPath(t), { as: editor.id })
    ).json()) as AffirmationReminderSettings;
    expect(s).toMatchObject({ on: true, eligible: false, delivers: false });
  });

  it("skips an address that is not one safe address", async () => {
    const t = await setupTenant();
    await recordAffirmation(t);
    await testDb()
      .update(user)
      .set({ email: `bad address ${t.userId}@example.test` })
      .where(eq(user.id, t.userId));
    expect(await runOn("2026-11-11", `bad address ${t.userId}@example.test`)).toHaveLength(0);
  });
});
