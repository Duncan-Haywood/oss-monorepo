// Team notification emails (deadline nudges / weekly digest): one copy per recipient with its own
// unsubscribe link + List-Unsubscribe headers, and the one-click endpoint at /api/email/unsubscribe
// (members → email_preferences, other addresses → notification_opt_outs), tenant-bound tokens.
import { env } from "cloudflare:workers";
import { createAppContext, testFakes } from "@worker/context";
import { applications, opportunities, orgSettings } from "@worker/db/schema";
import { notificationOptOuts } from "@worker/db/schema/digest";
import type { Env } from "@worker/env";
import { newId } from "@worker/lib/ids";
import type { EmailMessage } from "@worker/ports/email";
import {
  getEmailPreferences,
  notificationUnsubscribeToken,
  sendDeadlineNudges,
} from "@worker/services/digest";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { api, BASE, setupTenant, testDb } from "./helpers";

const DAY = 86_400_000;
const db = testDb();
const SECRET = (env as unknown as Env).AUTH_SECRET ?? "";
const mailsTo = (addr: string): EmailMessage[] =>
  testFakes.email.sent.filter((m) => m.to.includes(addr));

/** An application due in ~7 days so the deadline nudge fires at `now`. */
async function seedDueApp(orgId: string, now: Date) {
  const oppId = newId("opp");
  await db.insert(opportunities).values({
    id: oppId,
    source: "manual",
    sourceId: oppId,
    funderName: "Four Corners Foundation",
    title: "Community grant",
    closeDate: new Date(now.getTime() + 6.5 * DAY),
  });
  const appId = newId("app");
  await db.insert(applications).values({
    id: appId,
    orgId,
    opportunityId: oppId,
    title: `Application ${appId}`,
    status: "drafting",
  });
  return appId;
}

const oneClick = (token: string) =>
  api(`/api/email/unsubscribe?token=${encodeURIComponent(token)}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "List-Unsubscribe=One-Click",
  });

describe("team notification unsubscribe", () => {
  it("each recipient gets their own copy with List-Unsubscribe headers and a footer link", async () => {
    const a = await setupTenant();
    const outside = `board-${newId("nls").slice(4)}@example.test`;
    await db
      .update(orgSettings)
      .set({ notifyEmails: [a.user.email, outside] })
      .where(eq(orgSettings.orgId, a.orgId));
    const now = new Date();
    await seedDueApp(a.orgId, now);
    await sendDeadlineNudges(createAppContext(env as unknown as Env, { now: () => now }), now);

    for (const addr of [a.user.email, outside]) {
      const mails = mailsTo(addr);
      expect(mails).toHaveLength(1);
      const m = mails[0];
      expect(m?.to).toEqual([addr]);
      const token = await notificationUnsubscribeToken(SECRET, {
        orgId: a.orgId,
        kind: "deadlineReminders",
        email: addr,
      });
      expect(m?.headers).toEqual({
        "List-Unsubscribe": `<${BASE}/api/email/unsubscribe?token=${token}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      });
      expect(m?.text).toContain(`Unsubscribe: ${BASE}/unsubscribe?token=${token}`);
      expect(m?.text).not.toContain(addr === outside ? a.user.email : outside);
    }
  });

  it("one-click turns off a member's preference and suppresses a non-member address", async () => {
    const a = await setupTenant();
    const outside = `treasurer-${newId("nls").slice(4)}@example.test`;
    await db
      .update(orgSettings)
      .set({ notifyEmails: [a.user.email, outside] })
      .where(eq(orgSettings.orgId, a.orgId));

    const memberToken = await notificationUnsubscribeToken(SECRET, {
      orgId: a.orgId,
      kind: "deadlineReminders",
      email: a.user.email.toUpperCase(),
    });
    const res = await oneClick(memberToken);
    expect(await res.json()).toEqual({ ok: true, status: "unsubscribed" });
    const ctx = createAppContext(env as unknown as Env);
    expect(await getEmailPreferences(ctx, a.orgId, a.userId)).toEqual({
      weeklyDigest: true,
      deadlineReminders: false,
    });

    const outsideToken = await notificationUnsubscribeToken(SECRET, {
      orgId: a.orgId,
      kind: "deadlineReminders",
      email: outside,
    });
    expect(await (await oneClick(outsideToken)).json()).toEqual({
      ok: true,
      status: "unsubscribed",
    });
    expect(await (await oneClick(outsideToken)).json()).toEqual({
      ok: true,
      status: "unsubscribed",
    });
    const rows = await db
      .select()
      .from(notificationOptOuts)
      .where(eq(notificationOptOuts.orgId, a.orgId))
      .all();
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toContain(outside);

    const now = new Date();
    await seedDueApp(a.orgId, now);
    await sendDeadlineNudges(createAppContext(env as unknown as Env, { now: () => now }), now);
    expect(mailsTo(a.user.email)).toHaveLength(0);
    expect(mailsTo(outside)).toHaveLength(0);
  });

  it("tokens are bound to their org and kind; forged or cross-tenant tokens do nothing", async () => {
    const a = await setupTenant();
    const b = await setupTenant();
    const token = await notificationUnsubscribeToken(SECRET, {
      orgId: a.orgId,
      kind: "weeklyDigest",
      email: b.user.email,
    });
    // Re-pointing A's token at org B breaks the signature.
    const crossTenant = token.replace(a.orgId, b.orgId);
    expect(await (await oneClick(crossTenant)).json()).toEqual({ ok: false, status: "invalid" });
    const forged = await notificationUnsubscribeToken("not-the-secret", {
      orgId: b.orgId,
      kind: "weeklyDigest",
      email: b.user.email,
    });
    expect(await (await oneClick(forged)).json()).toEqual({ ok: false, status: "invalid" });
    const ctx = createAppContext(env as unknown as Env);
    expect((await getEmailPreferences(ctx, b.orgId, b.userId)).weeklyDigest).toBe(true);

    // A's valid token for a B member (not a member of A) only records an opt-out in A.
    expect(await (await oneClick(token)).json()).toEqual({ ok: true, status: "unsubscribed" });
    expect((await getEmailPreferences(ctx, b.orgId, b.userId)).weeklyDigest).toBe(true);
    const bRows = await db
      .select()
      .from(notificationOptOuts)
      .where(eq(notificationOptOuts.orgId, b.orgId))
      .all();
    expect(bRows).toEqual([]);
  });

  it("GET redirects to the unsubscribe page without changing anything", async () => {
    const a = await setupTenant();
    const token = await notificationUnsubscribeToken(SECRET, {
      orgId: a.orgId,
      kind: "weeklyDigest",
      email: a.user.email,
    });
    const res = await api(`/api/email/unsubscribe?token=${encodeURIComponent(token)}`, {
      redirect: "manual",
    });
    expect(res.status).toBe(303);
    expect(res.headers.get("Location")).toBe(`/unsubscribe?token=${encodeURIComponent(token)}`);
    const ctx = createAppContext(env as unknown as Env);
    expect((await getEmailPreferences(ctx, a.orgId, a.userId)).weeklyDigest).toBe(true);
  });
});
