// POST /api/demo/seed: fictional sample org for the offline demo. Seeds once per user, is blocked
// (plain 404) in a production config without DEMO_MODE/FAKE_EXTERNALS, and stays tenant-isolated.
import { env } from "cloudflare:workers";
import { createApp } from "@worker/app";
import { documents, facts, organization, projects, subscriptions } from "@worker/db/schema";
import type { Env } from "@worker/env";
import { DEMO_ORG, demoSeedAllowed } from "@worker/services/demo";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { api, BASE, createTestUser, testDb } from "./helpers";

const SEED_TIMEOUT = 120_000;

const seed = (userId: string) =>
  api("/api/demo/seed", { method: "POST", as: userId, headers: { Origin: BASE } });

async function seedOk(userId: string, status: number) {
  const res = await seed(userId);
  const text = await res.text();
  expect(res.status, text.slice(0, 500)).toBe(status);
  return JSON.parse(text) as { orgId: string; created: boolean };
}

describe("POST /api/demo/seed", () => {
  it(
    "creates the fictional demo org with documents, facts, projects, opportunities and matches",
    async () => {
      const u = await createTestUser();
      const { orgId, created } = await seedOk(u.id, 201);
      expect(created).toBe(true);
      expect(orgId).toMatch(/^org_/);

      const db = testDb();
      const org = await db.select().from(organization).where(eq(organization.id, orgId)).get();
      expect(org?.name).toBe(DEMO_ORG.name);
      expect(org?.name).not.toMatch(/swif|southwest indian/i);

      const overview = await api(`/api/orgs/${orgId}`, { as: u.id });
      expect(overview.status).toBe(200);
      const body = (await overview.json()) as {
        role: string;
        profile: { state: string | null; focusAreas: string[]; onboardingCompletedAt: unknown };
      };
      expect(body.role).toBe("owner");
      expect(body.profile.state).toBe("NM");
      expect(body.profile.focusAreas).toContain("construction trades");
      expect(body.profile.onboardingCompletedAt).toBeTruthy();

      const docs = await db.select().from(documents).where(eq(documents.orgId, orgId)).all();
      expect(docs).toHaveLength(5);
      expect(docs.every((d) => d.status === "ready")).toBe(true);
      expect(docs.find((d) => d.kind === "past_application")?.pastOutcome).toBe("awarded");
      expect(new Set(docs.map((d) => d.kind))).toEqual(
        new Set([
          "mission_statement",
          "annual_report",
          "program_description",
          "past_application",
          "interview_transcript",
        ]),
      );

      const confirmed = await db
        .select({ id: facts.id })
        .from(facts)
        .where(
          and(
            eq(facts.orgId, orgId),
            eq(facts.status, "confirmed"),
            eq(facts.sourceType, "document"),
          ),
        )
        .all();
      expect(confirmed.length).toBeGreaterThan(0);
      const proposed = await db
        .select({ id: facts.id })
        .from(facts)
        .where(and(eq(facts.orgId, orgId), eq(facts.status, "proposed")))
        .all();
      expect(proposed.length).toBeGreaterThan(0); // only "a few" are confirmed

      const prj = await db.select().from(projects).where(eq(projects.orgId, orgId)).all();
      expect(prj).toHaveLength(2);

      const sub = await db.select().from(subscriptions).where(eq(subscriptions.orgId, orgId)).get();
      expect(sub?.status).toBe("comp");

      const opps = await api(`/api/orgs/${orgId}/opportunities`, { as: u.id });
      expect(opps.status).toBe(200);
      const oppItems = ((await opps.json()) as { items: { match: unknown }[] }).items;
      expect(oppItems.length).toBeGreaterThan(0);
      expect(oppItems.some((o) => o.match !== null)).toBe(true);
    },
    SEED_TIMEOUT,
  );

  it(
    "is idempotent per user and isolated between users",
    async () => {
      const a = await createTestUser();
      const b = await createTestUser();
      const first = await seedOk(a.id, 201);
      const again = await seedOk(a.id, 200);
      expect(again).toEqual({ orgId: first.orgId, created: false });

      const me = await api("/api/me", { as: a.id });
      const memberships = ((await me.json()) as { memberships: { orgId: string }[] }).memberships;
      expect(memberships.map((m) => m.orgId)).toEqual([first.orgId]);
      const orgs = await testDb()
        .select({ id: organization.id })
        .from(organization)
        .where(eq(organization.name, DEMO_ORG.name))
        .all();
      expect(orgs.filter((o) => o.id === first.orgId)).toHaveLength(1);

      // Another user cannot see A's demo org and gets their own.
      expect((await api(`/api/orgs/${first.orgId}`, { as: b.id })).status).toBe(404);
      const other = await seedOk(b.id, 201);
      expect(other.orgId).not.toBe(first.orgId);
    },
    SEED_TIMEOUT,
  );

  it("requires a signed-in user", async () => {
    const res = await api("/api/demo/seed", { method: "POST", headers: { Origin: BASE } });
    expect(res.status).toBe(401);
  });
});

describe("demo gate", () => {
  const base = env as unknown as Env;
  const prod: Env = { ...base, APP_ENV: "production", FAKE_EXTERNALS: "false", DEMO_MODE: "" };
  const app = createApp();
  const call = (e: Env, userId?: string) =>
    app.fetch(
      new Request(`${BASE}/api/demo/seed`, {
        method: "POST",
        headers: { Origin: BASE, ...(userId ? { "x-test-user-id": userId } : {}) },
      }),
      e,
    );

  it("allows fake/offline, demo deployments and non-production; blocks plain production", () => {
    expect(demoSeedAllowed({ APP_ENV: "production", FAKE_EXTERNALS: "false" })).toBe(false);
    expect(demoSeedAllowed({ APP_ENV: "production", FAKE_EXTERNALS: "true" })).toBe(true);
    expect(
      demoSeedAllowed({ APP_ENV: "production", FAKE_EXTERNALS: "false", DEMO_MODE: "true" }),
    ).toBe(true);
    expect(demoSeedAllowed({ APP_ENV: "development", FAKE_EXTERNALS: "false" })).toBe(true);
  });

  it("returns a plain 404 in a production config, signed in or not", async () => {
    const u = await createTestUser();
    for (const res of [await call(prod), await call(prod, u.id)]) {
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: { code: "not_found", message: "Not found" } });
    }
    const owned = await api("/api/me", { as: u.id });
    expect(((await owned.json()) as { memberships: unknown[] }).memberships).toEqual([]);
  });

  it("is reachable in production when DEMO_MODE=true (still requires sign-in)", async () => {
    const res = await call({ ...prod, DEMO_MODE: "true" });
    expect(res.status).toBe(401);
  });
});
