// POST /api/demo/start: one-click live demo sessions (demo deployment only) and their hourly cleanup.
// Start -> the Better Auth cookie works with /api/me -> the fictional org is seeded; per-IP rate limit;
// active-session cap (friendly 503); cleanup deletes only expired demo data and never a real user/org;
// plain 404 without DEMO_MODE=true + FAKE_EXTERNALS=true.
import { env } from "cloudflare:workers";
import { createApp } from "@worker/app";
import { createAppContext } from "@worker/context";
import { demoSessions, documents, member, organization, session, user } from "@worker/db/schema";
import type { Env } from "@worker/env";
import { newId } from "@worker/lib/ids";
import { DEMO_ORG } from "@worker/services/demo";
import { cleanupExpiredSessions } from "@worker/services/demo/jobs";
import {
  countActiveDemoSessions,
  DEMO_SESSION_TTL_MS,
  DEMO_START_RATE_LIMIT,
  isDemoEmail,
  isDemoSessionUser,
  reserveDemoSlot,
} from "@worker/services/demo/sessions";
import { listKeys, orgPrefix } from "@worker/services/privacy/r2";
import { and, eq, like } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { BASE, cookieFrom, createTestOrg, createTestUser, testDb } from "./helpers";

const SEED_TIMEOUT = 120_000;
const base = env as unknown as Env; // APP_ENV=test, FAKE_EXTERNALS=true, no DEMO_MODE
const demoEnv = { ...base, DEMO_MODE: "true" } as Env;
const withCap = (cap: number) => ({ ...demoEnv, DEMO_MAX_SESSIONS: String(cap) }) as Env;
const app = createApp();
const ctxFor = (e: Env) => createAppContext(e);

let ipSeq = 0;
const freshIp = () => `198.51.100.${++ipSeq}`;

function start(
  e: Env,
  opts: { ip?: string; cookie?: string; enforceRateLimit?: boolean } = {},
): Promise<Response> {
  const headers: Record<string, string> = {
    Origin: BASE,
    "cf-connecting-ip": opts.ip ?? freshIp(),
    "User-Agent": "vitest demo-start",
  };
  if (opts.cookie) headers.Cookie = opts.cookie;
  if (opts.enforceRateLimit) headers["x-test-rate-limit"] = "enforce";
  return Promise.resolve(app.request("/api/demo/start", { method: "POST", headers }, e));
}

const get = (path: string, cookie: string, e: Env = demoEnv) =>
  Promise.resolve(app.request(path, { headers: { Cookie: cookie } }, e));

const demoUserCount = async () =>
  (
    await testDb()
      .select({ id: user.id })
      .from(user)
      .where(like(user.email, "%@demo.invalid"))
      .all()
  ).length;

/** A demo visitor without the (slow) seed: demo-address user + their own org + a session row. */
async function insertDemoSession(expiresAt: Date) {
  const db = testDb();
  const u = await createTestUser({
    name: "Demo Visitor",
    email: `demo-${newId("usr").slice(4, 24)}@demo.invalid`,
  });
  const { orgId } = await createTestOrg(u.id, { name: "Demo copy" });
  const id = newId("job").replace("job_", "dms_");
  await db.insert(demoSessions).values({ id, userId: u.id, demoOrgId: orgId, expiresAt });
  return { id, userId: u.id, orgId };
}

const ago = (ms: number) => new Date(Date.now() - ms);
const ahead = (ms: number) => new Date(Date.now() + ms);

let started: { orgId: string; userId: string; cookie: string } | null = null;

describe("POST /api/demo/start gate", () => {
  it("is a plain 404 without DEMO_MODE=true and FAKE_EXTERNALS=true, and creates nothing", async () => {
    const before = await demoUserCount();
    const prodDemoMode = {
      ...base,
      APP_ENV: "production",
      FAKE_EXTERNALS: "false",
      DEMO_MODE: "true",
    } as Env;
    const prod = { ...base, APP_ENV: "production", FAKE_EXTERNALS: "false", DEMO_MODE: "" } as Env;
    for (const e of [base, prod, prodDemoMode, { ...base, DEMO_MODE: "false" } as Env]) {
      const res = await start(e);
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: { code: "not_found", message: "Not found" } });
    }
    expect(await demoUserCount()).toBe(before);
  });
});

describe("POST /api/demo/start", () => {
  it(
    "signs in a throwaway visitor whose cookie works with /api/me, with the demo org seeded",
    async () => {
      const res = await start(demoEnv);
      const text = await res.text();
      expect(res.status, text.slice(0, 500)).toBe(201);
      const body = JSON.parse(text) as { orgId: string; redirect: string };
      expect(body.orgId).toMatch(/^org_/);
      expect(body.redirect).toBe(`/orgs/${body.orgId}`);
      expect(res.headers.get("Cache-Control")).toBe("no-store");

      const setCookie = res.headers.getSetCookie().join("\n");
      expect(setCookie).toMatch(/better-auth\.session_token=/);
      expect(setCookie).toMatch(/HttpOnly/i);
      const cookie = cookieFrom(res);

      // The cookie is a real Better Auth session.
      const meRes = await get("/api/me", cookie);
      expect(meRes.status).toBe(200);
      const me = (await meRes.json()) as {
        user: { id: string; email: string; name: string };
        memberships: { orgId: string; role: string }[];
        isDemo?: boolean;
      };
      expect(me.isDemo).toBe(true);
      expect(isDemoEmail(me.user.email)).toBe(true);
      expect(me.user.name).toBe("Demo Visitor");
      expect(me.memberships).toEqual([
        expect.objectContaining({ orgId: body.orgId, role: "owner" }),
      ]);
      expect(await isDemoSessionUser(ctxFor(demoEnv), me.user.id)).toBe(true);
      // Off the demo deployment nobody is a demo user (and no query is made).
      expect(await isDemoSessionUser(ctxFor(base), me.user.id)).toBe(false);

      const db = testDb();
      const row = await db.select().from(user).where(eq(user.id, me.user.id)).get();
      expect(row?.emailVerified).toBe(true);
      const ds = await db
        .select()
        .from(demoSessions)
        .where(eq(demoSessions.userId, me.user.id))
        .get();
      expect(ds?.demoOrgId).toBe(body.orgId);
      const ttl = (ds?.expiresAt.getTime() ?? 0) - Date.now();
      expect(ttl).toBeGreaterThan(DEMO_SESSION_TTL_MS - 5 * 60_000);
      expect(ttl).toBeLessThanOrEqual(DEMO_SESSION_TTL_MS);

      // The org is the seeded fictional charity, marked as this session's.
      const org = await db.select().from(organization).where(eq(organization.id, body.orgId)).get();
      expect(org?.name).toBe(DEMO_ORG.name);
      const meta = JSON.parse(org?.metadata ?? "{}") as {
        demo?: { complete?: boolean; session?: { id?: string } };
      };
      expect(meta.demo?.complete).toBe(true);
      expect(meta.demo?.session?.id).toBe(ds?.id);
      const docs = await db.select().from(documents).where(eq(documents.orgId, body.orgId)).all();
      expect(docs).toHaveLength(5);
      const overview = await get(`/api/orgs/${body.orgId}`, cookie);
      expect(overview.status).toBe(200);
      expect(((await overview.json()) as { role: string }).role).toBe("owner");

      // Clicking again while the demo runs returns the same org instead of a new visitor.
      const again = await start(demoEnv, { cookie });
      expect(again.status).toBe(200);
      expect(await again.json()).toEqual(body);
      expect(
        await db.select().from(demoSessions).where(eq(demoSessions.userId, me.user.id)).all(),
      ).toHaveLength(1);

      started = { orgId: body.orgId, userId: me.user.id, cookie };
    },
    SEED_TIMEOUT,
  );

  it("rate-limits starts per client IP", async () => {
    // Cap 0: every start is a cheap 503 after the limiter has counted it.
    const e = withCap(0);
    const ip = freshIp();
    for (let i = 0; i < DEMO_START_RATE_LIMIT.limit; i++) {
      expect((await start(e, { ip, enforceRateLimit: true })).status).toBe(503);
    }
    const limited = await start(e, { ip, enforceRateLimit: true });
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(((await limited.json()) as { error: { code: string } }).error.code).toBe("rate_limited");
    // Another IP is not affected.
    expect((await start(e, { ip: freshIp(), enforceRateLimit: true })).status).toBe(503);
  });

  it("returns a friendly 503 when the active-session cap is reached", async () => {
    const before = await demoUserCount();
    const active = await countActiveDemoSessions(ctxFor(demoEnv));
    for (const cap of [0, active]) {
      const res = await start(withCap(cap));
      expect(res.status).toBe(503);
      expect(res.headers.get("Retry-After")).toBeTruthy();
      const err = ((await res.json()) as { error: { code: string; message: string } }).error;
      expect(err.code).toBe("demo_full");
      expect(err.message).toMatch(/demo is full right now/i);
    }
    expect(await demoUserCount()).toBe(before);

    // Expired sessions do not count towards the cap; the reservation itself is atomic.
    const ctx = ctxFor(demoEnv);
    const expired = await insertDemoSession(ago(60_000));
    expect(await reserveDemoSlot(ctx, active)).toBeNull();
    const slot = await reserveDemoSlot(ctx, active + 1);
    expect(slot).not.toBeNull();
    expect(await countActiveDemoSessions(ctx)).toBe(active + 1);
    expect(await reserveDemoSlot(ctx, active + 1)).toBeNull();
    const db = testDb();
    await db.delete(demoSessions).where(eq(demoSessions.id, slot?.id ?? ""));
    await db.delete(demoSessions).where(eq(demoSessions.id, expired.id));
  });
});

describe("demo session cleanup", () => {
  it(
    "deletes only expired demo data and never a non-demo user or org",
    async () => {
      const db = testDb();
      if (!started) {
        // Run on its own (e.g. `-t cleanup`): start a session here.
        const res = await start(demoEnv);
        expect(res.status).toBe(201);
        const { orgId } = (await res.json()) as { orgId: string };
        const cookie = cookieFrom(res);
        const me = (await (await get("/api/me", cookie)).json()) as { user: { id: string } };
        started = { orgId, userId: me.user.id, cookie };
      }
      const s = started;
      const filesBefore = await listKeys(env.FILES, orgPrefix(s.orgId));
      expect(filesBefore.length).toBeGreaterThan(0);

      // The demo visitor also made a second org of their own, and joined a real org.
      const extra = await createTestOrg(s.userId, { name: "Visitor's second org" });
      const realOwner = await createTestUser({ name: "Real Owner" });
      const realOrg = await createTestOrg(realOwner.id, { name: "Real Org" });
      await db.insert(member).values({
        id: newId("mem"),
        organizationId: realOrg.orgId,
        userId: s.userId,
        role: "editor",
      });

      // Expire the started session.
      await db
        .update(demoSessions)
        .set({ expiresAt: ago(1000) })
        .where(eq(demoSessions.userId, s.userId));

      // A still-running demo session, with a file.
      const running = await insertDemoSession(ahead(60 * 60_000));
      const runningKey = `${orgPrefix(running.orgId)}documents/x/original`;
      await env.FILES.put(runningKey, "still here");

      // Forged / stale rows that must never delete real data:
      //  - a session row pointing at a real (non-demo) user and their org;
      const realUser = await createTestUser({
        name: "Real User",
        email: "real.person@example.org",
      });
      const realUserOrg = await createTestOrg(realUser.id, { name: "Real User Org" });
      await env.FILES.put(`${orgPrefix(realUserOrg.orgId)}documents/y/original`, "real file");
      const forgedReal = newId("job").replace("job_", "dms_");
      await db.insert(demoSessions).values({
        id: forgedReal,
        userId: realUser.id,
        demoOrgId: realUserOrg.orgId,
        expiresAt: ago(1000),
      });
      //  - a demo user's row whose org reference points at someone else's real org.
      const strayDemo = await insertDemoSession(ago(1000));
      await db
        .update(demoSessions)
        .set({ demoOrgId: realOrg.orgId })
        .where(eq(demoSessions.id, strayDemo.id));

      // Not the demo deployment: the job does nothing at all.
      await cleanupExpiredSessions(ctxFor(base), { type: "demo.cleanup_expired" });
      expect(await db.select().from(user).where(eq(user.id, s.userId)).get()).toBeTruthy();
      expect(
        await db.select().from(demoSessions).where(eq(demoSessions.id, forgedReal)).get(),
      ).toBeTruthy();

      await cleanupExpiredSessions(ctxFor(demoEnv), { type: "demo.cleanup_expired" });

      // The expired demo: org rows, R2 files, the visitor's own extra org, the user and sessions.
      const orgGone = await db
        .select({ id: organization.id })
        .from(organization)
        .where(eq(organization.id, s.orgId))
        .get();
      expect(orgGone).toBeUndefined();
      expect(await db.select().from(documents).where(eq(documents.orgId, s.orgId)).all()).toEqual(
        [],
      );
      expect(await listKeys(env.FILES, orgPrefix(s.orgId))).toEqual([]);
      expect(
        await db.select().from(organization).where(eq(organization.id, extra.orgId)).get(),
      ).toBeUndefined();
      expect(await db.select().from(user).where(eq(user.id, s.userId)).get()).toBeUndefined();
      expect(await db.select().from(session).where(eq(session.userId, s.userId)).all()).toEqual([]);
      expect(
        await db.select().from(demoSessions).where(eq(demoSessions.userId, s.userId)).get(),
      ).toBeUndefined();
      expect((await get("/api/me", s.cookie)).status).toBe(401);

      // The real org the visitor joined stays, minus the visitor.
      expect(
        await db.select().from(organization).where(eq(organization.id, realOrg.orgId)).get(),
      ).toBeTruthy();
      const realMembers = await db
        .select({ userId: member.userId })
        .from(member)
        .where(eq(member.organizationId, realOrg.orgId))
        .all();
      expect(realMembers).toEqual([{ userId: realOwner.id }]);

      // The forged row: real user, org and file untouched; only the bogus row is dropped.
      expect(await db.select().from(user).where(eq(user.id, realUser.id)).get()).toBeTruthy();
      expect(
        await db.select().from(organization).where(eq(organization.id, realUserOrg.orgId)).get(),
      ).toBeTruthy();
      expect(
        await db
          .select()
          .from(member)
          .where(and(eq(member.organizationId, realUserOrg.orgId), eq(member.userId, realUser.id)))
          .get(),
      ).toBeTruthy();
      expect(await listKeys(env.FILES, orgPrefix(realUserOrg.orgId))).toHaveLength(1);
      expect(
        await db.select().from(demoSessions).where(eq(demoSessions.id, forgedReal)).get(),
      ).toBeUndefined();

      // The stray demo row: its demo user and own org go, the real org it pointed at stays.
      expect(
        await db.select().from(user).where(eq(user.id, strayDemo.userId)).get(),
      ).toBeUndefined();
      expect(
        await db.select().from(organization).where(eq(organization.id, strayDemo.orgId)).get(),
      ).toBeUndefined();
      expect(await db.select().from(user).where(eq(user.id, realOwner.id)).get()).toBeTruthy();

      // The running demo session is untouched.
      expect(await db.select().from(user).where(eq(user.id, running.userId)).get()).toBeTruthy();
      expect(
        await db.select().from(organization).where(eq(organization.id, running.orgId)).get(),
      ).toBeTruthy();
      expect(await env.FILES.head(runningKey)).not.toBeNull();
      expect(
        await db.select().from(demoSessions).where(eq(demoSessions.id, running.id)).get(),
      ).toBeTruthy();
    },
    SEED_TIMEOUT,
  );
});
