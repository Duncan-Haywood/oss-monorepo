import { env } from "cloudflare:workers";
import type { MemberRole } from "@shared/enums";
import { POLICY_VERSION } from "@shared/legal";
import { createAppContext } from "@worker/context";
import {
  auditLog,
  consentRecords,
  member,
  organization,
  orgProfiles,
  orgSettings,
} from "@worker/db/schema";
import { newId } from "@worker/lib/ids";
import { hashIp } from "@worker/services/privacy/consents";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { api, createTestUser, setupTenant, testDb } from "./helpers";

/** Consent IPs are hashed (salted) by the privacy module's hashIp, never stored raw. */
const ipHashOf = (ip: string) => hashIp(createAppContext(env), ip);

const validBody = (overrides: Record<string, unknown> = {}) => ({
  name: "Southwest Indian Foundation",
  legalName: "Southwest Indian Foundation, Inc.",
  orgType: "nonprofit_501c3",
  city: "Gallup",
  state: "NM",
  websiteUrl: "swif.org",
  focusAreas: ["workforce development", "construction trades"],
  serviceAreas: ["Gallup, NM", "Navajo Nation"],
  acceptTerms: true,
  policyVersion: POLICY_VERSION,
  ...overrides,
});

async function createOrgVia(userId: string, overrides: Record<string, unknown> = {}) {
  const res = await api("/api/orgs", {
    method: "POST",
    as: userId,
    json: validBody(overrides),
    headers: { "CF-Connecting-IP": "203.0.113.7", "User-Agent": "vitest-agent" },
  });
  return res;
}

async function addMember(orgId: string, role: MemberRole) {
  const u = await createTestUser();
  await testDb()
    .insert(member)
    .values({
      id: newId("org").replace("org_", "mem_"),
      organizationId: orgId,
      userId: u.id,
      role,
    });
  return u.id;
}

describe("POST /api/orgs", () => {
  it("creates org, owner membership, profile, settings and consents in one go", async () => {
    const u = await createTestUser();
    const res = await createOrgVia(u.id);
    expect(res.status).toBe(201);
    const { orgId } = (await res.json()) as { orgId: string };
    expect(orgId).toMatch(/^org_/);

    const db = testDb();
    const org = await db.select().from(organization).where(eq(organization.id, orgId)).get();
    expect(org?.name).toBe("Southwest Indian Foundation");
    expect(org?.slug).toMatch(/^southwest-indian-foundation/);

    const mem = await db
      .select()
      .from(member)
      .where(and(eq(member.organizationId, orgId), eq(member.userId, u.id)))
      .get();
    expect(mem?.role).toBe("owner");

    const profile = await db.select().from(orgProfiles).where(eq(orgProfiles.orgId, orgId)).get();
    expect(profile).toMatchObject({
      legalName: "Southwest Indian Foundation, Inc.",
      orgType: "nonprofit_501c3",
      city: "Gallup",
      state: "NM",
      websiteUrl: "https://swif.org",
      focusAreas: ["workforce development", "construction trades"],
    });

    const settings = await db.select().from(orgSettings).where(eq(orgSettings.orgId, orgId)).get();
    expect(settings?.autopilotEnabled).toBe(false);
    expect(settings?.dataPolicyVersion).toBe(POLICY_VERSION);
    expect(settings?.dataPolicyAcceptedBy).toBe(u.id);
    expect(settings?.dataPolicyAcceptedAt).toBeInstanceOf(Date);

    const consents = await db
      .select()
      .from(consentRecords)
      .where(eq(consentRecords.orgId, orgId))
      .all();
    expect(consents.map((c) => c.scope).sort()).toEqual([
      "data_processing",
      "privacy_policy",
      "terms_of_service",
    ]);
    const ipHash = await ipHashOf("203.0.113.7");
    expect(ipHash).toMatch(/^[0-9a-f]{64}$/);
    for (const c of consents) {
      expect(c).toMatchObject({
        granted: true,
        policyVersion: POLICY_VERSION,
        userId: u.id,
        ipHash,
        userAgent: "vitest-agent",
      });
    }

    const audits = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.orgId, orgId), eq(auditLog.action, "org.created")))
      .all();
    expect(audits).toHaveLength(1);

    // Visible in the user's org list and the org overview.
    const list = (await (await api("/api/orgs", { as: u.id })).json()) as {
      items: { id: string; role: string }[];
    };
    expect(list.items).toContainEqual(expect.objectContaining({ id: orgId, role: "owner" }));

    expect((await api(`/api/orgs/${orgId}/`, { as: u.id })).status).toBe(200);
    const overview = await api(`/api/orgs/${orgId}`, { as: u.id });
    expect(overview.status).toBe(200);
    const body = (await overview.json()) as {
      org: { id: string; slug: string };
      role: string;
      profile: { legalName: string };
      settings: { autoDraftTopN: number };
    };
    expect(body.org.id).toBe(orgId);
    expect(body.role).toBe("owner");
    expect(body.profile.legalName).toBe("Southwest Indian Foundation, Inc.");
    expect(body.settings.autoDraftTopN).toBe(3);
  });

  it("rejects requests without terms acceptance or with a stale policy version", async () => {
    const u = await createTestUser();
    for (const overrides of [
      { acceptTerms: false },
      { acceptTerms: undefined },
      { acceptTerms: "true" },
    ]) {
      const res = await createOrgVia(u.id, overrides);
      expect(res.status).toBe(400);
      const err = (await res.json()) as { error: { code: string } };
      expect(err.error.code).toBe("terms_not_accepted");
    }
    const stale = await createOrgVia(u.id, { policyVersion: "2020-01-01" });
    expect(stale.status).toBe(400);
    expect(((await stale.json()) as { error: { code: string } }).error.code).toBe(
      "policy_version_mismatch",
    );
    const list = (await (await api("/api/orgs", { as: u.id })).json()) as { items: unknown[] };
    expect(list.items).toHaveLength(0);
  });

  it("validates the body and requires sign-in", async () => {
    const u = await createTestUser();
    const bad = await createOrgVia(u.id, {
      orgType: "corporation",
      websiteUrl: "javascript:alert(1)",
    });
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as { error: { code: string } }).error.code).toBe("validation_error");

    const anon = await api("/api/orgs", { method: "POST", json: validBody() });
    expect(anon.status).toBe(401);
    expect((await api("/api/orgs")).status).toBe(401);
  });

  it("adds a suffix when the slug is taken", async () => {
    const u = await createTestUser();
    const name = `Gallup Trades ${newId("org").slice(4, 10)}`;
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const res = await createOrgVia(u.id, { name });
      expect(res.status).toBe(201);
      ids.push(((await res.json()) as { orgId: string }).orgId);
    }
    const db = testDb();
    const slugs = await Promise.all(
      ids.map(
        async (id) =>
          (await db.select().from(organization).where(eq(organization.id, id)).get())?.slug,
      ),
    );
    const base = name.toLowerCase().replace(/\s+/g, "-");
    expect(slugs).toEqual([base, `${base}-2`, `${base}-3`]);
  });
});

describe("PATCH /api/orgs/:orgId/profile", () => {
  it("lets editors update the profile with validation and audits changed keys only", async () => {
    const { orgId } = await setupTenant();
    const editor = await addMember(orgId, "editor");

    const res = await api(`/api/orgs/${orgId}/profile`, {
      method: "PATCH",
      as: editor,
      json: {
        ein: "85-0123456",
        uei: "abc123def456",
        foundedYear: 1968,
        contactEmail: "grants@swif.example",
        focusAreas: ["workforce development"],
        dba: "",
        name: "SWIF",
      },
    });
    expect(res.status).toBe(200);
    const profile = (await res.json()) as Record<string, unknown>;
    expect(profile).toMatchObject({
      ein: "85-0123456",
      uei: "ABC123DEF456",
      foundedYear: 1968,
      dba: null,
      focusAreas: ["workforce development"],
    });

    const db = testDb();
    const org = await db.select().from(organization).where(eq(organization.id, orgId)).get();
    expect(org?.name).toBe("SWIF");

    const entry = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.orgId, orgId), eq(auditLog.action, "org.profile_updated")))
      .get();
    const meta = entry?.metadata as { changedKeys: string[] };
    expect(meta.changedKeys).toEqual(
      expect.arrayContaining(["ein", "uei", "foundedYear", "contactEmail", "focusAreas", "name"]),
    );
    expect(JSON.stringify(entry?.metadata)).not.toContain("grants@swif.example");
  });

  it("rejects invalid values", async () => {
    const { orgId, userId } = await setupTenant();
    const cases: Record<string, unknown>[] = [
      { ein: "850123456" },
      { uei: "SHORT" },
      { uei: "ABC123DEF45!" },
      { websiteUrl: "ftp://swif.org" },
      { contactEmail: "nope" },
      { focusAreas: Array.from({ length: 21 }, (_, i) => `area ${i}`) },
      { focusAreas: [42] },
      { foundedYear: 3000 },
      { legalName: "" },
      { orgType: "llc" },
    ];
    for (const json of cases) {
      const res = await api(`/api/orgs/${orgId}/profile`, { method: "PATCH", as: userId, json });
      expect(res.status, JSON.stringify(json)).toBe(400);
    }
  });

  it("forbids viewers and reviewers", async () => {
    const { orgId } = await setupTenant();
    for (const role of ["viewer", "reviewer"] as const) {
      const uid = await addMember(orgId, role);
      const res = await api(`/api/orgs/${orgId}/profile`, {
        method: "PATCH",
        as: uid,
        json: { city: "Window Rock" },
      });
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({
        error: {
          code: "forbidden",
          message: "This action needs editor access. Ask an admin of your organization.",
        },
      });
      // ...but can read the org.
      expect((await api(`/api/orgs/${orgId}`, { as: uid })).status).toBe(200);
    }
  });
});

describe("PATCH /api/orgs/:orgId/settings", () => {
  it("requires admin: editors are forbidden", async () => {
    const { orgId } = await setupTenant();
    const editor = await addMember(orgId, "editor");
    const res = await api(`/api/orgs/${orgId}/settings`, {
      method: "PATCH",
      as: editor,
      json: { autoDraftTopN: 5 },
    });
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: { message: string } }).error.message).toBe(
      "This action needs admin access. Ask an owner of your organization.",
    );

    const admin = await addMember(orgId, "admin");
    const ok = await api(`/api/orgs/${orgId}/settings`, {
      method: "PATCH",
      as: admin,
      json: { autoDraftTopN: 5, notifyEmails: ["Grants@SWIF.example"] },
    });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({
      autoDraftTopN: 5,
      notifyEmails: ["grants@swif.example"],
    });
  });

  it("validates bounds", async () => {
    const { orgId, userId } = await setupTenant();
    const cases: Record<string, unknown>[] = [
      { autoSubmitMaxCents: -1 },
      { autoSubmitMaxCents: 10.5 },
      { minFitScoreForAuto: 101 },
      { highLikelihoodThreshold: 1.5 },
      { autoDraftTopN: 11 },
      { maxAutoSubmissionsPerMonth: 101 },
      { notifyEmails: ["not-an-email"] },
      { autopilotEnabled: "yes" },
      // auto-submit ceiling above the full-review threshold (default $100k)
      { autoSubmitMaxCents: 20_000_000 },
    ];
    for (const json of cases) {
      const res = await api(`/api/orgs/${orgId}/settings`, { method: "PATCH", as: userId, json });
      expect(res.status, JSON.stringify(json)).toBe(400);
    }
  });

  it("records autopilot_submission consent when autopilot is turned on", async () => {
    const { orgId, userId } = await setupTenant();
    const res = await api(`/api/orgs/${orgId}/settings`, {
      method: "PATCH",
      as: userId,
      json: { autopilotEnabled: true, autoSubmitMaxCents: 500_000, minFitScoreForAuto: 85 },
      headers: { "CF-Connecting-IP": "198.51.100.1" },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      autopilotEnabled: true,
      autoSubmitMaxCents: 500_000,
      minFitScoreForAuto: 85,
    });

    const db = testDb();
    const consents = await db
      .select()
      .from(consentRecords)
      .where(and(eq(consentRecords.orgId, orgId), eq(consentRecords.scope, "autopilot_submission")))
      .all();
    expect(consents).toHaveLength(1);
    expect(consents[0]).toMatchObject({
      granted: true,
      userId,
      policyVersion: POLICY_VERSION,
      ipHash: await ipHashOf("198.51.100.1"),
    });

    const entry = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.orgId, orgId), eq(auditLog.action, "org.settings_updated")))
      .get();
    expect(((entry?.metadata ?? {}) as { changedKeys?: string[] }).changedKeys?.sort()).toEqual([
      "autoSubmitMaxCents",
      "autopilotEnabled",
      "minFitScoreForAuto",
    ]);

    // Re-sending the same value is a no-op: no extra consent row.
    await api(`/api/orgs/${orgId}/settings`, {
      method: "PATCH",
      as: userId,
      json: { autopilotEnabled: true },
    });
    const after = await db
      .select()
      .from(consentRecords)
      .where(and(eq(consentRecords.orgId, orgId), eq(consentRecords.scope, "autopilot_submission")))
      .all();
    expect(after).toHaveLength(1);
  });
});

describe("tenant isolation", () => {
  it("returns 404 for another org's overview, profile and settings", async () => {
    const a = await setupTenant();
    const b = await setupTenant();
    expect((await api(`/api/orgs/${a.orgId}`, { as: b.userId })).status).toBe(404);
    for (const path of ["profile", "settings"]) {
      const res = await api(`/api/orgs/${a.orgId}/${path}`, {
        method: "PATCH",
        as: b.userId,
        json: { city: "Elsewhere", autoDraftTopN: 1 },
      });
      expect(res.status).toBe(404);
    }
    const profile = await testDb()
      .select()
      .from(orgProfiles)
      .where(eq(orgProfiles.orgId, a.orgId))
      .get();
    expect(profile?.city).toBe("Gallup");
    const list = (await (await api("/api/orgs", { as: b.userId })).json()) as {
      items: { id: string }[];
    };
    expect(list.items.map((i) => i.id)).toEqual([b.orgId]);
  });
});
