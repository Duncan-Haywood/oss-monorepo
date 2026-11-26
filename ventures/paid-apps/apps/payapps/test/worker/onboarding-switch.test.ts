// The getting-started reminders' switch on the checklist (GET/PUT /api/orgs/:orgId/getting-started/
// reminders): the signed-in member's own setting for this company, the same stop row as the
// email's one-click link, and the way to turn the reminders back on. Owners are the only ones sent
// reminders, so others are told so; another company's members cannot read or change it.
import { env } from "cloudflare:workers";
import type { ReminderSettingDto } from "@shared/api/types";
import { createAppContext, testFakes } from "@worker/context";
import { organization } from "@worker/db/schema";
import { reminderStopLinks, sendNoJobReminders } from "@worker/services/payapps/onboarding";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { addToOrg, api, call, createTestUser, setupTenant, testDb } from "./helpers";

const at = (iso: string) => createAppContext(env, { now: () => new Date(`${iso}T13:00:00Z`) });
const mailTo = (since: number, email: string) =>
  testFakes.email.sent.slice(since).filter((m) => m.to.includes(email));
const url = (orgId: string) => `/api/orgs/${orgId}/getting-started/reminders`;

describe("getting-started reminder switch", () => {
  it("is on for an owner until switched off, and off skips that owner on the cron", async () => {
    const { orgId, user: owner } = await setupTenant("owner");
    const coOwner = await createTestUser();
    await addToOrg(orgId, coOwner.id, "owner");
    await testDb()
      .update(organization)
      .set({ createdAt: new Date("2020-06-01T09:00:00Z") })
      .where(eq(organization.id, orgId));

    expect(await call<ReminderSettingDto>(url(orgId), { as: owner.id })).toEqual({
      sentToRole: true,
      on: true,
    });
    for (let i = 0; i < 2; i++) {
      expect(
        await call<ReminderSettingDto>(url(orgId), {
          method: "PUT",
          as: owner.id,
          json: { on: false },
        }),
      ).toEqual({ sentToRole: true, on: false });
    }
    // Only this member: the co-owner's setting is untouched.
    expect((await call<ReminderSettingDto>(url(orgId), { as: coOwner.id })).on).toBe(true);
    // The email's signed link reads the same row.
    const q = (await reminderStopLinks(env, orgId, owner.id))?.oneClick.split("?")[1] ?? "";
    expect(
      ((await call(`/api/unsubscribe/onboarding?${q}`)) as { subscribed: boolean }).subscribed,
    ).toBe(false);

    const before = testFakes.email.sent.length;
    await sendNoJobReminders(at("2020-06-05"));
    expect(mailTo(before, owner.email)).toHaveLength(0);
    expect(mailTo(before, coOwner.email)).toHaveLength(1);
  });

  it("turns back on a reminder stopped from the email's link", async () => {
    const { orgId, user: owner } = await setupTenant("owner");
    await testDb()
      .update(organization)
      .set({ createdAt: new Date("2020-07-01T09:00:00Z") })
      .where(eq(organization.id, orgId));
    const q = (await reminderStopLinks(env, orgId, owner.id))?.oneClick.split("?")[1] ?? "";
    await call(`/api/unsubscribe/onboarding?${q}`, { method: "POST" });
    expect((await call<ReminderSettingDto>(url(orgId), { as: owner.id })).on).toBe(false);

    const on = await call<ReminderSettingDto>(url(orgId), {
      method: "PUT",
      as: owner.id,
      json: { on: true },
    });
    expect(on.on).toBe(true);
    const before = testFakes.email.sent.length;
    await sendNoJobReminders(at("2020-07-06"));
    expect(mailTo(before, owner.email)).toHaveLength(1);
  });

  it("tells a non-owner they are sent none, and refuses a bad body", async () => {
    const { orgId } = await setupTenant("owner");
    const viewer = await createTestUser();
    await addToOrg(orgId, viewer.id, "viewer");
    expect(await call<ReminderSettingDto>(url(orgId), { as: viewer.id })).toEqual({
      sentToRole: false,
      on: true,
    });
    const bad = await api(url(orgId), { method: "PUT", as: viewer.id, json: { on: "no" } });
    expect(bad.status).toBe(400);
    const extra = await api(url(orgId), {
      method: "PUT",
      as: viewer.id,
      json: { on: false, userId: "someone" },
    });
    expect(extra.status).toBe(400);
  });

  it("another company's member cannot read or change it", async () => {
    const { orgId } = await setupTenant("owner");
    const other = await setupTenant("owner");
    expect((await api(url(orgId), { as: other.userId })).status).toBe(404);
    const put = await api(url(orgId), { method: "PUT", as: other.userId, json: { on: false } });
    expect(put.status).toBe(404);
    expect((await api(url(orgId))).status).toBe(401);
  });
});
