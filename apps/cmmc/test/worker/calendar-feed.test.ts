// The subscribable calendar link: admins make, reset and turn it off; the link works without a
// session; a reset or a delete stops the old link; nothing crosses organizations.
import type { CalendarFeedStatus } from "@shared/affirmation-ics";
import { affirmationCalendarFeed, auditLog } from "@worker/db/schema";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { addToOrg, api, createTestUser, setupTenant, testDb } from "./helpers";

type Tenant = Awaited<ReturnType<typeof setupTenant>>;
const feedPath = (t: Tenant) => `/api/orgs/${t.orgId}/affirmations/calendar-feed`;

async function json<T>(res: Response | Promise<Response>, status = 200): Promise<T> {
  const r = await res;
  expect(r.status, await r.clone().text()).toBe(status);
  return (await r.json()) as T;
}

const affirmation = {
  level: 2,
  kind: "assessment",
  cmmcStatus: "final",
  cmmcStatusDate: "2026-03-02",
  affirmedOn: "2026-03-05",
  officialName: "J. Smith",
  officialTitle: "President",
  officialContact: "jsmith@example.test",
  sprsScore: 104,
};

/** The feed's path on this host, from the absolute link the API answers with. */
const pathOf = (url: string | null) => {
  expect(url).toMatch(/\/api\/calendar\/cmcal_[A-Za-z0-9_-]{43}\.ics$/);
  return new URL(url as string).pathname;
};

const make = (t: Tenant, as = t.userId) =>
  json<CalendarFeedStatus>(api(feedPath(t), { method: "POST", as }), 201);

describe("calendar feed", () => {
  it("serves the due dates to a calendar app with no session", async () => {
    const t = await setupTenant();
    expect(await json<CalendarFeedStatus>(api(feedPath(t), { as: t.userId }))).toMatchObject({
      on: false,
      url: null,
    });
    const made = await make(t);
    expect(made).toMatchObject({ on: true, createdByName: "Test User", lastFetchedAt: null });
    const feed = pathOf(made.url);
    // The link is shown once: the status afterwards has no URL, and only a hash is stored.
    const status = await json<CalendarFeedStatus>(api(feedPath(t), { as: t.userId }));
    expect(status.url).toBeNull();
    const row = await testDb()
      .select()
      .from(affirmationCalendarFeed)
      .where(eq(affirmationCalendarFeed.orgId, t.orgId))
      .get();
    expect(row?.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(made.url).not.toContain(row?.tokenHash);

    // An affirmation recorded after subscribing shows up on the next fetch: no re-download.
    const empty = await api(feed);
    expect(empty.status).toBe(200);
    expect(await empty.text()).not.toContain("BEGIN:VEVENT");
    expect(
      (
        await api(`/api/orgs/${t.orgId}/affirmations`, {
          method: "POST",
          as: t.userId,
          json: affirmation,
        })
      ).status,
    ).toBe(201);
    const res = await api(feed);
    expect(res.headers.get("Content-Type")).toBe("text/calendar; charset=utf-8");
    expect(res.headers.get("X-Robots-Tag")).toBe("noindex");
    const ics = (await res.text()).replace(/\r\n /g, "");
    expect(ics).toContain("DTSTART;VALUE=DATE:20270305");
    expect(ics).toContain(`UID:cmmc-${t.orgId}-l2-annual_affirmation@cmmc-workspace`);
    // The first fetch is recorded for the admin to see.
    const after = await json<CalendarFeedStatus>(api(feedPath(t), { as: t.userId }));
    expect(after.lastFetchedAt).not.toBeNull();
  });

  it("stops the old link on a reset and every link when turned off", async () => {
    const t = await setupTenant();
    const first = pathOf((await make(t)).url);
    const second = pathOf((await make(t)).url);
    expect(second).not.toBe(first);
    expect((await api(first)).status).toBe(404);
    expect((await api(second)).status).toBe(200);
    const off = await json<CalendarFeedStatus>(
      api(feedPath(t), { method: "DELETE", as: t.userId }),
    );
    expect(off.on).toBe(false);
    expect((await api(second)).status).toBe(404);
    const actions = (
      await testDb().select().from(auditLog).where(eq(auditLog.orgId, t.orgId)).all()
    ).map((a) => a.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        "calendar_feed.create",
        "calendar_feed.reset",
        "calendar_feed.delete",
      ]),
    );
  });

  it("is for admins only and never crosses organizations", async () => {
    const a = await setupTenant();
    const b = await setupTenant();
    const editor = await createTestUser("Editor");
    await addToOrg(a.orgId, editor.id, "editor");
    expect((await api(feedPath(a), { as: editor.id })).status).toBe(403);
    expect((await api(feedPath(a), { method: "POST", as: editor.id })).status).toBe(403);
    expect((await api(feedPath(a), { method: "DELETE", as: editor.id })).status).toBe(403);
    // B's admin cannot see, make or delete A's link.
    expect((await api(feedPath(a), { as: b.userId })).status).toBe(404);
    expect((await api(feedPath(a), { method: "POST", as: b.userId })).status).toBe(404);
    const aFeed = pathOf((await make(a)).url);
    expect((await api(feedPath(a), { method: "DELETE", as: b.userId })).status).toBe(404);
    expect((await api(aFeed)).status).toBe(200);
    // B's own link serves B's (empty) calendar, not A's.
    const bIcs = await (await api(pathOf((await make(b)).url))).text();
    expect(bIcs).not.toContain(a.orgId);
  });

  it("answers 404 for malformed and unknown tokens alike", async () => {
    for (const p of [
      "/api/calendar/nope.ics",
      `/api/calendar/cmcal_${"A".repeat(43)}.ics`,
      `/api/calendar/cmcal_${"A".repeat(43)}`,
      "/api/calendar/",
    ]) {
      expect((await api(p)).status, p).toBe(404);
    }
  });
});
