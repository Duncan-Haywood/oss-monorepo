// Calendar feeds: token management (roles, audit, hashing), the public ICS feed (isolation,
// revocation, amounts, rate limit) and the single-opportunity .ics download.
import type { CalendarTokenDto, CreatedCalendarTokenDto } from "@shared/api/calendar";
import {
  applications,
  auditLog,
  followups,
  member,
  opportunities,
  opportunityMatches,
} from "@worker/db/schema";
import { calendarTokens } from "@worker/db/schema/calendar";
import { sha256Hex } from "@worker/lib/hash";
import { newId } from "@worker/lib/ids";
import { TEST_RATE_LIMIT_HEADER } from "@worker/middleware/rate-limit";
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { api, BASE, createTestUser, setupTenant, testDb } from "./helpers";

const DAY = 86_400_000;
const at2359 = (daysAhead: number) => {
  const d = new Date(Date.now() + daysAhead * DAY);
  d.setUTCHours(23, 59, 0, 0);
  return d;
};

async function insertOpportunity(
  title: string,
  opts: { privateToOrgId?: string; closeDate?: Date | null } = {},
) {
  const id = newId("opp");
  await testDb()
    .insert(opportunities)
    .values({
      id,
      source: "manual",
      sourceId: id,
      funderName: "Test Funder",
      title,
      summary: "INTERNAL SUMMARY TEXT",
      awardCeilingCents: 25_000_000,
      closeDate: opts.closeDate === undefined ? at2359(40) : opts.closeDate,
      privateToOrgId: opts.privateToOrgId ?? null,
    });
  return id;
}

async function createFeed(orgId: string, as: string, scope: "org" | "mine" = "org") {
  const res = await api(`/api/orgs/${orgId}/calendar/tokens`, {
    method: "POST",
    as,
    headers: { Origin: BASE },
    json: { scope },
  });
  return res;
}

async function feedOf(orgId: string, as: string, scope: "org" | "mine" = "org") {
  const res = await createFeed(orgId, as, scope);
  expect(res.status).toBe(201);
  return (await res.json()) as CreatedCalendarTokenDto;
}

const feedPath = (url: string) => new URL(url).pathname;
const unfold = (ics: string) => ics.replace(/\r\n[ \t]/g, "");

describe("calendar feeds", () => {
  let orgA: string;
  let owner: string;
  let otherOrg: string;
  let otherOwner: string;
  let editorApp: string;
  let oppActive: string;
  let oppPrivateB: string;

  beforeAll(async () => {
    const a = await setupTenant("owner");
    orgA = a.orgId;
    owner = a.userId;
    const b = await setupTenant("owner");
    otherOrg = b.orgId;
    otherOwner = b.userId;
    const db = testDb();

    oppActive = await insertOpportunity("Rural Health, Access; Grant");
    const oppReview = await insertOpportunity("Youth Literacy Fund");
    const oppShort = await insertOpportunity("Shortlisted Water Grant");
    const oppSubmitted = await insertOpportunity("Already Submitted Grant");
    oppPrivateB = await insertOpportunity("Other Org Private Grant", { privateToOrgId: otherOrg });

    editorApp = newId("app");
    const reviewApp = newId("app");
    await db.insert(applications).values([
      {
        id: editorApp,
        orgId: orgA,
        opportunityId: oppActive,
        title: "App title internal",
        status: "drafting",
        requestedAmountCents: 5_000_000,
        deadline: at2359(30),
        createdBy: owner,
      },
      {
        id: reviewApp,
        orgId: orgA,
        opportunityId: oppReview,
        title: "Review app",
        status: "in_review",
        deadline: at2359(20),
      },
      {
        id: newId("app"),
        orgId: orgA,
        opportunityId: oppSubmitted,
        title: "Done",
        status: "submitted",
        deadline: at2359(10),
      },
      {
        id: newId("app"),
        orgId: otherOrg,
        opportunityId: oppPrivateB,
        title: "Other org app",
        status: "drafting",
        requestedAmountCents: 9_900_000,
        deadline: at2359(15),
      },
    ]);
    await db.insert(opportunityMatches).values([
      { id: newId("mat"), orgId: orgA, opportunityId: oppShort, status: "shortlisted" },
      { id: newId("mat"), orgId: otherOrg, opportunityId: oppPrivateB, status: "shortlisted" },
    ]);
    await db.insert(followups).values([
      {
        id: newId("fup"),
        orgId: orgA,
        applicationId: editorApp,
        kind: "report_due",
        title: "Annual report",
        notes: "SECRET NOTES",
        dueAt: at2359(90),
      },
      {
        id: newId("fup"),
        orgId: orgA,
        applicationId: editorApp,
        kind: "deadline_reminder",
        title: "Reminder dup",
        dueAt: at2359(16),
      },
      {
        id: newId("fup"),
        orgId: otherOrg,
        kind: "custom",
        title: "Other org followup",
        dueAt: at2359(5),
      },
    ]);
  });

  describe("management API", () => {
    it("creates a feed, returns the URL once and stores only the token's SHA-256", async () => {
      const created = await feedOf(orgA, owner);
      const m = /\/api\/calendar\/([A-Za-z0-9_-]{43})\.ics$/.exec(created.url);
      expect(m).not.toBeNull();
      const token = m?.[1] ?? "";
      expect(created.webcalUrl).toBe(created.url.replace(/^https?:/, "webcal:"));

      const row = await testDb()
        .select()
        .from(calendarTokens)
        .where(eq(calendarTokens.id, created.token.id))
        .get();
      expect(row?.tokenHash).toBe(await sha256Hex(token));
      expect(JSON.stringify(row)).not.toContain(token);
      expect(row).toMatchObject({ orgId: orgA, userId: owner, scope: "org", revokedAt: null });

      const list = await api(`/api/orgs/${orgA}/calendar/tokens`, { as: owner });
      const body = await list.text();
      expect(body).not.toContain(token);
      expect(body).not.toContain(row?.tokenHash ?? "-");
      const items = (JSON.parse(body) as { items: CalendarTokenDto[] }).items;
      expect(items.map((t) => t.id)).toContain(created.token.id);

      const aud = await testDb()
        .select()
        .from(auditLog)
        .where(
          and(
            eq(auditLog.action, "calendar_token.created"),
            eq(auditLog.targetId, created.token.id),
          ),
        )
        .get();
      expect(aud).toMatchObject({ orgId: orgA, actorId: owner });
      expect(JSON.stringify(aud)).not.toContain(token);
    });

    it("viewers can manage their own feed but not org-wide ones", async () => {
      const viewer = await createTestUser();
      await testDb()
        .insert(member)
        .values({ id: newId("mem"), organizationId: orgA, userId: viewer.id, role: "viewer" });

      expect((await createFeed(orgA, viewer.id, "org")).status).toBe(403);
      const mine = await feedOf(orgA, viewer.id, "mine");
      expect(mine.token.scope).toBe("mine");

      const ownerFeed = await feedOf(orgA, owner);
      const list = (await (
        await api(`/api/orgs/${orgA}/calendar/tokens`, { as: viewer.id })
      ).json()) as {
        items: CalendarTokenDto[];
      };
      expect(list.items.every((t) => t.userId === viewer.id)).toBe(true);

      // Can't revoke someone else's feed (looks like it doesn't exist).
      const del = await api(`/api/orgs/${orgA}/calendar/tokens/${ownerFeed.token.id}`, {
        method: "DELETE",
        as: viewer.id,
        headers: { Origin: BASE },
      });
      expect(del.status).toBe(404);
      // ...but can revoke their own.
      const ownDel = await api(`/api/orgs/${orgA}/calendar/tokens/${mine.token.id}`, {
        method: "DELETE",
        as: viewer.id,
        headers: { Origin: BASE },
      });
      expect(ownDel.status).toBe(200);
      // Admin-only setting.
      const patch = await api(`/api/orgs/${orgA}/calendar/settings`, {
        method: "PATCH",
        as: viewer.id,
        headers: { Origin: BASE },
        json: { includeAmounts: true },
      });
      expect(patch.status).toBe(403);
    });

    it("editors can create org feeds; admins see and revoke everyone's", async () => {
      const editor = await createTestUser();
      const admin = await createTestUser();
      await testDb()
        .insert(member)
        .values([
          { id: newId("mem"), organizationId: orgA, userId: editor.id, role: "editor" },
          { id: newId("mem"), organizationId: orgA, userId: admin.id, role: "admin" },
        ]);
      const editorFeed = await feedOf(orgA, editor.id, "org");
      const list = (await (
        await api(`/api/orgs/${orgA}/calendar/tokens`, { as: admin.id })
      ).json()) as {
        items: CalendarTokenDto[];
      };
      expect(list.items.some((t) => t.id === editorFeed.token.id && !t.mine)).toBe(true);
      const del = await api(`/api/orgs/${orgA}/calendar/tokens/${editorFeed.token.id}`, {
        method: "DELETE",
        as: admin.id,
        headers: { Origin: BASE },
      });
      expect(del.status).toBe(200);
      expect((await api(feedPath(editorFeed.url))).status).toBe(404);
    });

    it("is tenant-isolated: non-members get 404 and can't touch another org's feeds", async () => {
      const feed = await feedOf(orgA, owner);
      expect((await api(`/api/orgs/${orgA}/calendar/tokens`, { as: otherOwner })).status).toBe(404);
      // Revoking org A's token through org B's route: not found.
      const del = await api(`/api/orgs/${otherOrg}/calendar/tokens/${feed.token.id}`, {
        method: "DELETE",
        as: otherOwner,
        headers: { Origin: BASE },
      });
      expect(del.status).toBe(404);
      const b = (await (
        await api(`/api/orgs/${otherOrg}/calendar/tokens`, { as: otherOwner })
      ).json()) as {
        items: CalendarTokenDto[];
      };
      expect(b.items.some((t) => t.id === feed.token.id)).toBe(false);
      expect((await api(feedPath(feed.url))).status).toBe(200);
    });

    it("requires a session", async () => {
      expect((await api(`/api/orgs/${orgA}/calendar/tokens`)).status).toBe(401);
    });
  });

  describe("GET /api/calendar/:token.ics", () => {
    it("serves a valid feed with the org's dates and nothing else", async () => {
      const feed = await feedOf(orgA, owner);
      const res = await api(feedPath(feed.url));
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("text/calendar; charset=utf-8");
      expect(res.headers.get("Cache-Control")).toBe("private, max-age=900");
      const raw = await res.text();
      expect(raw.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
      for (const line of raw.split("\r\n")) {
        expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
      }
      const ics = unfold(raw);
      expect(ics).toContain("SUMMARY:Deadline: Rural Health\\, Access\\; Grant\r\n");
      expect(ics).toContain(`UID:deadline-${editorApp}@localhost`);
      expect(ics).toContain("SUMMARY:Deadline: Shortlisted Water Grant\r\n");
      expect(ics).toContain("SUMMARY:Deadline: Youth Literacy Fund\r\n");
      expect(ics).toContain("SUMMARY:Review due: Youth Literacy Fund\r\n");
      expect(ics).toContain("SUMMARY:Report due: Rural Health\\, Access\\; Grant\r\n");
      expect(ics).toContain("TRIGGER:-P3D");
      expect(ics).toMatch(/DTSTART;VALUE=DATE:\d{8}\r\n/);
      expect(ics).toContain(`DESCRIPTION:${BASE}/orgs/${orgA}/applications/${editorApp}\r\n`);
      // Finished applications and deadline reminders are left out.
      expect(ics).not.toContain("Already Submitted Grant");
      expect(ics).not.toContain("Reminder dup");
      // No internal content.
      expect(ics).not.toContain("SECRET NOTES");
      expect(ics).not.toContain("INTERNAL SUMMARY");
      expect(ics).not.toContain("App title internal");
      // No amounts by default.
      expect(ics).not.toMatch(/\$\d/);
      // Feed isolation: nothing from the other org.
      expect(ics).not.toContain("Other Org");
      expect(ics).not.toContain(otherOrg);
      // Stable UIDs across refreshes.
      const again = unfold(await (await api(feedPath(feed.url))).text());
      const uids = (s: string) => s.match(/^UID:.*$/gm)?.sort();
      expect(uids(again)).toEqual(uids(ics));
    });

    it("shows amounts only after an admin opts in", async () => {
      const feed = await feedOf(orgA, owner);
      const on = await api(`/api/orgs/${orgA}/calendar/settings`, {
        method: "PATCH",
        as: owner,
        headers: { Origin: BASE },
        json: { includeAmounts: true },
      });
      expect(await on.json()).toEqual({ includeAmounts: true });
      const ics = unfold(await (await api(feedPath(feed.url))).text());
      expect(ics).toContain("($50\\,000 requested)");
      expect(ics).toContain("Shortlisted Water Grant (up to $250\\,000)");
      await api(`/api/orgs/${orgA}/calendar/settings`, {
        method: "PATCH",
        as: owner,
        headers: { Origin: BASE },
        json: { includeAmounts: false },
      });
      expect(await (await api(feedPath(feed.url))).text()).not.toMatch(/\$\d/);
    });

    it("'mine' feeds only include my applications", async () => {
      const editor = await createTestUser();
      await testDb()
        .insert(member)
        .values({ id: newId("mem"), organizationId: orgA, userId: editor.id, role: "editor" });
      const feed = await feedOf(orgA, editor.id, "mine");
      const ics = unfold(await (await api(feedPath(feed.url))).text());
      expect(ics).not.toContain("Rural Health"); // created by the owner
      expect(ics).not.toContain("Shortlisted Water Grant");
      expect(ics).toContain("Review due: Youth Literacy Fund"); // editors can review
      const ownerMine = unfold(
        await (await api(feedPath((await feedOf(orgA, owner, "mine")).url))).text(),
      );
      expect(ownerMine).toContain("Deadline: Rural Health");
      expect(ownerMine).toContain("Report due: Rural Health");
    });

    it("returns 404 for revoked, unknown and malformed tokens, and audits revocation", async () => {
      const feed = await feedOf(orgA, owner);
      expect((await api(feedPath(feed.url))).status).toBe(200);
      const del = await api(`/api/orgs/${orgA}/calendar/tokens/${feed.token.id}`, {
        method: "DELETE",
        as: owner,
        headers: { Origin: BASE },
      });
      expect(del.status).toBe(200);
      expect((await api(feedPath(feed.url))).status).toBe(404);
      const aud = await testDb()
        .select()
        .from(auditLog)
        .where(
          and(eq(auditLog.action, "calendar_token.revoked"), eq(auditLog.targetId, feed.token.id)),
        )
        .get();
      expect(aud).toMatchObject({ orgId: orgA, actorId: owner });

      expect((await api(`/api/calendar/${"A".repeat(43)}.ics`)).status).toBe(404);
      expect((await api("/api/calendar/short.ics")).status).toBe(404);
      expect((await api(`/api/calendar/${"A".repeat(43)}`)).status).toBe(404);
    });

    it("stops working when the owner leaves the org", async () => {
      const u = await createTestUser();
      const memId = newId("mem");
      await testDb()
        .insert(member)
        .values({ id: memId, organizationId: orgA, userId: u.id, role: "editor" });
      const feed = await feedOf(orgA, u.id, "org");
      expect((await api(feedPath(feed.url))).status).toBe(200);
      await testDb().delete(member).where(eq(member.id, memId));
      expect((await api(feedPath(feed.url))).status).toBe(404);
    });

    it("records last use and works without cookies or Origin", async () => {
      const feed = await feedOf(orgA, owner);
      await api(feedPath(feed.url));
      const row = await testDb()
        .select()
        .from(calendarTokens)
        .where(eq(calendarTokens.id, feed.token.id))
        .get();
      expect(row?.lastUsedAt).toBeInstanceOf(Date);
    });

    it("is rate-limited per token", async () => {
      const feed = await feedOf(orgA, owner);
      const other = await feedOf(orgA, owner);
      const enforce = { headers: { [TEST_RATE_LIMIT_HEADER]: "enforce" } };
      let last = 200;
      for (let i = 0; i < 21; i++) last = (await api(feedPath(feed.url), enforce)).status;
      expect(last).toBe(429);
      // A different feed is unaffected.
      expect((await api(feedPath(other.url), enforce)).status).toBe(200);
    });
  });

  describe("GET /api/orgs/:orgId/opportunities/:id/calendar.ics", () => {
    it("downloads one deadline event with a reminder", async () => {
      const res = await api(`/api/orgs/${orgA}/opportunities/${oppActive}/calendar.ics`, {
        as: owner,
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("text/calendar; charset=utf-8");
      expect(res.headers.get("Content-Disposition")).toMatch(
        /^attachment; filename="deadline-rural-health-access-grant\.ics"$/,
      );
      const ics = unfold(await res.text());
      expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
      expect(ics).toContain("SUMMARY:Deadline: Rural Health\\, Access\\; Grant\r\n");
      expect(ics).toContain("TRIGGER:-P3D");
      expect(ics).not.toMatch(/\$\d/);
    });

    it("hides other orgs' private opportunities and needs a session", async () => {
      expect(
        (await api(`/api/orgs/${orgA}/opportunities/${oppPrivateB}/calendar.ics`, { as: owner }))
          .status,
      ).toBe(404);
      expect((await api(`/api/orgs/${orgA}/opportunities/${oppActive}/calendar.ics`)).status).toBe(
        401,
      );
      expect(
        (await api(`/api/orgs/${orgA}/opportunities/${oppActive}/calendar.ics`, { as: otherOwner }))
          .status,
      ).toBe(404);
    });

    it("409s when there is no deadline yet", async () => {
      const forecast = await insertOpportunity("Forecast only", { closeDate: null });
      const res = await api(`/api/orgs/${orgA}/opportunities/${forecast}/calendar.ics`, {
        as: owner,
      });
      expect(res.status).toBe(409);
    });
  });
});
