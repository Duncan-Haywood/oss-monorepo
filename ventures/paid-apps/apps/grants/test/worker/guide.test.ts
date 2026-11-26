// GET /api/orgs/:orgId/guide: the getting-started checklist is computed from real org data, and one
// org's progress never leaks into (or counts towards) another org's checklist.
import { env } from "cloudflare:workers";
import type { GuideDto, GuideStepKey } from "@shared/guide";
import { createApp } from "@worker/app";
import {
  applicationFlags,
  applications,
  applicationVersions,
  documents,
  facts,
  interviews,
  invitation,
  member,
  opportunities,
  opportunityMatches,
  orgProfiles,
  orgSettings,
  projects,
} from "@worker/db/schema";
import { newId } from "@worker/lib/ids";
import { TEST_USER_HEADER } from "@worker/middleware/session";
import { requireOrg } from "@worker/middleware/tenant";
import guideRoutes from "@worker/routes/org/guide";
import type { AppEnv } from "@worker/types";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { BASE, createTestUser, setupTenant, testDb } from "./helpers";

// Until app.ts mounts the router, mount it on a test instance exactly as app.ts will.
const app = createApp();
const sub = new Hono<AppEnv>();
sub.use("*", requireOrg("viewer"));
sub.route("/", guideRoutes);
app.route("/api/orgs/:orgId/guide", sub);

function getGuide(orgId: string, as: string) {
  const headers = new Headers({ [TEST_USER_HEADER]: as });
  return app.fetch(new Request(`${BASE}/api/orgs/${orgId}/guide`, { headers }), env);
}

const stepMap = (g: GuideDto) =>
  Object.fromEntries(g.steps.map((s) => [s.key, s])) as Record<GuideStepKey, GuideDto["steps"][0]>;

/** Seeds an org that has done every step (and, with `partial`, only some of them). */
async function seedProgress(orgId: string, userId: string, partial = false) {
  const db = testDb();
  await db
    .update(orgProfiles)
    .set({ ein: "12-3456789", focusAreas: ["food security"], serviceAreas: ["Gallup, NM"] })
    .where(eq(orgProfiles.orgId, orgId));
  const kinds = partial
    ? (["annual_report", "budget"] as const)
    : (["annual_report", "budget", "past_application"] as const);
  for (const kind of kinds) {
    const id = newId("doc");
    await db.insert(documents).values({
      id,
      orgId,
      title: kind,
      kind,
      mimeType: "text/markdown",
      sizeBytes: 10,
      sha256: id,
      r2Key: `orgs/${orgId}/documents/${id}/original`,
      status: "ready",
    });
  }
  const confirmed = partial ? 4 : 10;
  for (let i = 0; i < confirmed + 2; i++) {
    await db.insert(facts).values({
      id: newId("fct"),
      orgId,
      category: "program",
      statement: `Fact ${i}`,
      status: i < confirmed ? "confirmed" : "proposed",
      sourceType: "user_entered",
    });
  }
  await db.insert(interviews).values({
    id: newId("int"),
    orgId,
    kind: "onboarding",
    title: "Onboarding",
    status: partial ? "active" : "completed",
  });
  if (partial) return;
  await db.insert(projects).values({ id: newId("prj"), orgId, title: "Mobile pantry" });
  let appId = "";
  for (let i = 0; i < 3; i++) {
    const oppId = newId("opp");
    await db.insert(opportunities).values({
      id: oppId,
      source: "manual",
      sourceId: oppId,
      privateToOrgId: orgId,
      funderName: "Funder",
      title: `Grant ${i}`,
    });
    await db.insert(opportunityMatches).values({
      id: newId("mat"),
      orgId,
      opportunityId: oppId,
      fitScore: 80,
      likelihood: 0.2,
      status: i === 0 ? "drafting" : "shortlisted",
    });
    if (i === 0) {
      appId = newId("app");
      const verId = newId("ver");
      await db.insert(applications).values({
        id: appId,
        orgId,
        opportunityId: oppId,
        title: "First draft",
        status: "in_review",
        currentVersionId: verId,
      });
      await db.insert(applicationVersions).values({
        id: verId,
        orgId,
        applicationId: appId,
        versionNumber: 1,
        content: { sections: [] },
        authorType: "system",
      });
      await db.insert(applicationFlags).values({
        id: newId("flg"),
        orgId,
        applicationId: appId,
        versionId: verId,
        severity: "warning",
        kind: "unconfirmed_fact",
        message: "Cites a proposed fact",
        status: "resolved",
        resolvedBy: userId,
        resolvedAt: new Date(),
      });
    }
  }
  await db
    .update(orgSettings)
    .set({ automationLevel: "prepared" })
    .where(eq(orgSettings.orgId, orgId));
  await db.insert(invitation).values({
    id: newId("org").replace("org_", "inv_"),
    organizationId: orgId,
    email: "reviewer@example.test",
    role: "reviewer",
    expiresAt: new Date(Date.now() + 86_400_000),
    inviterId: userId,
  });
}

describe("GET /guide", () => {
  it("starts with every step to do for a new org, profile first", async () => {
    const t = await setupTenant();
    const res = await getGuide(t.orgId, t.userId);
    expect(res.status).toBe(200);
    const g = (await res.json()) as GuideDto;
    expect(g.total).toBe(9);
    expect(g.doneCount).toBe(0);
    expect(g.complete).toBe(false);
    expect(g.nextStep).toBe("profile");
    const s = stepMap(g);
    expect(s.profile.detail).toBe("Missing: EIN, focus areas, service areas");
    expect(s.documents.progress).toEqual({ current: 0, target: 3 });
    expect(s.facts.path).toBe("/knowledge/facts?status=proposed");
    for (const step of g.steps) {
      expect(step.why.length).toBeGreaterThan(20);
      expect(step.minutes).toBeGreaterThan(0);
      expect(step.path.startsWith("/")).toBe(true);
    }
  });

  it("marks steps done from seeded data, with counted progress for partial steps", async () => {
    const t = await setupTenant();
    await seedProgress(t.orgId, t.userId, true);
    const g = (await (await getGuide(t.orgId, t.userId)).json()) as GuideDto;
    const s = stepMap(g);
    expect(s.profile.done).toBe(true);
    expect(s.documents.done).toBe(false);
    expect(s.documents.detail).toBe("2 of 3 uploaded");
    expect(s.facts).toMatchObject({ done: false, progress: { current: 4, target: 10 } });
    expect(s.facts.detail).toContain("2 facts waiting for you");
    expect(s.interview).toMatchObject({ done: false, detail: "You have an interview in progress" });
    expect(g.nextStep).toBe("documents");
    expect(g.doneCount).toBe(1);
  });

  it("is complete when every step is backed by data", async () => {
    const t = await setupTenant();
    await seedProgress(t.orgId, t.userId);
    const g = (await (await getGuide(t.orgId, t.userId)).json()) as GuideDto;
    expect(g.steps.filter((s) => !s.done).map((s) => s.key)).toEqual([]);
    expect(g.complete).toBe(true);
    expect(g.nextStep).toBeNull();
    expect(stepMap(g).teammate.detail).toBe("1 invitation sent");
  });

  it("counts a joined teammate and is readable by viewers", async () => {
    const t = await setupTenant();
    const viewer = await createTestUser();
    await testDb()
      .insert(member)
      .values({
        id: newId("org").replace("org_", "mem_"),
        organizationId: t.orgId,
        userId: viewer.id,
        role: "viewer",
      });
    const res = await getGuide(t.orgId, viewer.id);
    expect(res.status).toBe(200);
    const g = (await res.json()) as GuideDto;
    expect(stepMap(g).teammate.done).toBe(true);
  });

  it("isolates tenants: another org's data never counts, and non-members get 404", async () => {
    const a = await setupTenant();
    const b = await setupTenant();
    await seedProgress(a.orgId, a.userId);

    const asB = (await (await getGuide(b.orgId, b.userId)).json()) as GuideDto;
    expect(asB.doneCount).toBe(0);
    expect(stepMap(asB).facts.progress).toEqual({ current: 0, target: 10 });

    const cross = await getGuide(a.orgId, b.userId);
    expect(cross.status).toBe(404);
    expect(await cross.text()).not.toContain("Fact");
  });
});
