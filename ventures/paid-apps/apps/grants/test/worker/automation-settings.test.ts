// PATCH /settings automation fields (validation, roles, consent) and GET /settings/automation-preview.
import type { MemberRole } from "@shared/enums";
import { auditLog, consentRecords, member } from "@worker/db/schema";
import { newId } from "@worker/lib/ids";
import { and, asc, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { api, createTestUser, setupTenant, testDb } from "./helpers";

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

const patch = (orgId: string, as: string, json: Record<string, unknown>) =>
  api(`/api/orgs/${orgId}/settings`, { method: "PATCH", as, json });

const autopilotConsents = (orgId: string) =>
  testDb()
    .select()
    .from(consentRecords)
    .where(and(eq(consentRecords.orgId, orgId), eq(consentRecords.scope, "autopilot_submission")))
    .orderBy(asc(consentRecords.createdAt))
    .all();

interface Preview {
  automation: { level: string; source: string; autoSubmit: boolean; autoDraft: boolean };
  presets: { level: string; label: string; checkpoints: Record<string, boolean> }[];
  safetyRails: { key: string; description: string }[];
  assumptions: string[];
  examples: {
    key: string;
    label: string;
    amountCents: number;
    fitScore: number;
    likelihood: number;
    firstToFunder: boolean;
    tier: string;
    reasons: string[];
    requiredApprovals: number;
    drafting: string;
  }[];
}

const preview = async (orgId: string, as: string, query = "") => {
  const res = await api(`/api/orgs/${orgId}/settings/automation-preview${query}`, { as });
  return { res, body: res.ok ? ((await res.json()) as Preview) : null };
};

describe("PATCH /settings: automation level", () => {
  it("new orgs default to prepared (derived from autopilot off)", async () => {
    const { orgId, userId } = await setupTenant();
    const { body } = await preview(orgId, userId);
    expect(body?.automation).toMatchObject({
      level: "prepared",
      source: "legacy",
      autoDraft: true,
      autoSubmit: false,
    });
  });

  it("turning on full needs admin; it records the autopilot_submission consent", async () => {
    const { orgId, userId } = await setupTenant();
    for (const role of ["viewer", "reviewer", "editor"] as const) {
      const uid = await addMember(orgId, role);
      const res = await patch(orgId, uid, { automationLevel: "full" });
      expect(res.status, role).toBe(403);
    }
    expect(await autopilotConsents(orgId)).toHaveLength(0);

    const admin = await addMember(orgId, "admin");
    const ok = await patch(orgId, admin, { automationLevel: "full" });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ automationLevel: "full", autopilotEnabled: true });
    const consents = await autopilotConsents(orgId);
    expect(consents).toHaveLength(1);
    expect(consents[0]).toMatchObject({ granted: true, userId: admin });

    const entry = await testDb()
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.orgId, orgId), eq(auditLog.action, "org.settings_updated")))
      .get();
    expect(entry?.metadata).toMatchObject({
      automationLevelFrom: "prepared",
      automationLevelTo: "full",
      consentScopes: ["autopilot_submission"],
    });
    // The owner can too (owner ⊇ admin).
    expect((await patch(orgId, userId, { automationLevel: "supervised" })).status).toBe(200);
  });

  it("records consent again for supervised → full and a revocation when leaving autopilot", async () => {
    const { orgId, userId } = await setupTenant();
    await patch(orgId, userId, { automationLevel: "supervised" });
    await patch(orgId, userId, { automationLevel: "full" });
    const res = await patch(orgId, userId, { automationLevel: "prepared" });
    expect(await res.json()).toMatchObject({
      automationLevel: "prepared",
      autopilotEnabled: false,
    });
    expect((await autopilotConsents(orgId)).map((c) => c.granted)).toEqual([true, true, false]);
    // No change, no new consent row.
    await patch(orgId, userId, { automationLevel: "prepared" });
    expect(await autopilotConsents(orgId)).toHaveLength(3);
  });

  it("keeps the legacy autopilotEnabled switch in sync with an explicit level", async () => {
    const { orgId, userId } = await setupTenant();
    await patch(orgId, userId, { automationLevel: "manual" });
    const on = await patch(orgId, userId, { autopilotEnabled: true });
    expect(await on.json()).toMatchObject({
      automationLevel: "supervised",
      autopilotEnabled: true,
    });
    const off = await patch(orgId, userId, { autopilotEnabled: false });
    expect(await off.json()).toMatchObject({
      automationLevel: "prepared",
      autopilotEnabled: false,
    });
  });

  it("stores per-stage overrides; null resets to the preset", async () => {
    const { orgId, userId } = await setupTenant();
    const res = await patch(orgId, userId, {
      automationLevel: "prepared",
      requireMatchApproval: true,
      requireDraftReview: true,
      requireFollowupApproval: false,
      twoPersonRuleAboveCents: 2_500_000,
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      requireMatchApproval: true,
      requireDraftReview: true,
      requireFollowupApproval: false,
      twoPersonRuleAboveCents: 2_500_000,
    });
    const reset = await patch(orgId, userId, {
      requireDraftReview: null,
      twoPersonRuleAboveCents: null,
    });
    expect(await reset.json()).toMatchObject({
      requireDraftReview: null,
      twoPersonRuleAboveCents: null,
    });
  });

  it("validates automation fields", async () => {
    const { orgId, userId } = await setupTenant();
    const cases: Record<string, unknown>[] = [
      { automationLevel: "turbo" },
      { automationLevel: null },
      { requireDraftReview: "yes" },
      { requireMatchApproval: 1 },
      { twoPersonRuleAboveCents: -1 },
      { twoPersonRuleAboveCents: 10.5 },
      // contradicting the level
      { automationLevel: "full", autopilotEnabled: false },
      { automationLevel: "manual", autopilotEnabled: true },
      // fact confirmation is always required where autopilot submits
      { automationLevel: "full", requireFactConfirmation: false },
      { automationLevel: "supervised", requireFactConfirmation: false },
      // submission approval can only be switched off at supervised/full
      { requireSubmissionApproval: false },
      { automationLevel: "assisted", requireSubmissionApproval: false },
    ];
    for (const json of cases) {
      const res = await patch(orgId, userId, json);
      expect(res.status, JSON.stringify(json)).toBe(400);
    }
    expect(await autopilotConsents(orgId)).toHaveLength(0);
    // Allowed: fact confirmation off below supervised...
    expect((await patch(orgId, userId, { requireFactConfirmation: false })).status).toBe(200);
    // ...and moving up to full later forces it back on (the stored override is ignored there).
    const up = await patch(orgId, userId, {
      automationLevel: "full",
      requireSubmissionApproval: false,
    });
    expect(up.status).toBe(200);
    const { body } = await preview(orgId, userId);
    expect(body?.automation).toMatchObject({
      level: "full",
      requireFactConfirmation: true,
      autoSubmit: true,
    });
  });
});

describe("GET /settings/automation-preview", () => {
  it("returns four example grants with tier and reasons under the current config", async () => {
    const { orgId, userId } = await setupTenant();
    const { res, body } = await preview(orgId, userId);
    expect(res.status).toBe(200);
    expect(body?.examples.map((e) => e.key)).toEqual([
      "small",
      "medium",
      "large",
      "first_to_funder",
    ]);
    for (const e of body?.examples ?? []) {
      expect(e.reasons.length).toBeGreaterThan(0);
      expect(typeof e.label).toBe("string");
      expect(e.requiredApprovals).toBe(1);
    }
    // prepared: nothing auto-submits; the large ask needs a full review.
    expect(body?.examples.map((e) => e.tier)).toEqual([
      "one_click",
      "one_click",
      "full_review",
      "one_click",
    ]);
    expect(body?.examples[0]?.drafting).toBe("auto");
    expect(body?.presets.map((p) => p.level)).toEqual([
      "manual",
      "assisted",
      "prepared",
      "supervised",
      "full",
    ]);
    expect(body?.safetyRails).toHaveLength(9);
  });

  it("reflects supervised and full once saved (consent recorded by the PATCH)", async () => {
    const { orgId, userId } = await setupTenant();
    await patch(orgId, userId, {
      automationLevel: "supervised",
      reviewFirstSubmissionPerFunder: true,
    });
    const sup = await preview(orgId, userId);
    expect(sup.body?.examples.map((e) => e.tier)).toEqual([
      "auto",
      "one_click",
      "full_review",
      "one_click",
    ]);
    await patch(orgId, userId, { automationLevel: "full", twoPersonRuleAboveCents: 10_000_000 });
    const full = await preview(orgId, userId);
    expect(full.body?.examples.map((e) => e.tier)).toEqual([
      "auto",
      "auto",
      "one_click",
      "one_click",
    ]);
    const large = full.body?.examples.find((e) => e.key === "large");
    expect(large?.requiredApprovals).toBe(2);
    expect(large?.reasons.join("\n")).toMatch(/Two different reviewers/);
  });

  it("previews unsaved changes from the query string without saving them", async () => {
    const { orgId, userId } = await setupTenant();
    const manual = await preview(orgId, userId, "?automationLevel=manual");
    expect(manual.body?.automation.level).toBe("manual");
    expect(new Set(manual.body?.examples.map((e) => e.tier))).toEqual(new Set(["full_review"]));
    expect(manual.body?.examples[0]?.drafting).toBe("manual");
    const shortlist = await preview(orgId, userId, "?requireMatchApproval=true");
    expect(shortlist.body?.examples[0]?.drafting).toBe("after_shortlist");
    // Nothing was saved.
    expect((await preview(orgId, userId)).body?.automation.level).toBe("prepared");
    expect((await preview(orgId, userId, "?automationLevel=turbo")).res.status).toBe(400);
  });

  it("is readable by any member and isolated per tenant", async () => {
    const a = await setupTenant();
    const viewer = await addMember(a.orgId, "viewer");
    expect((await preview(a.orgId, viewer)).res.status).toBe(200);
    const b = await setupTenant();
    expect((await preview(a.orgId, b.userId)).res.status).toBe(404);
  });
});
