// Opportunity triage in workerd: POST /matches/bulk, dismiss reasons on PATCH, GET /matches/inbox,
// and dismiss reasons feeding later scoring as a soft signal (real D1, FakeLlm).
import { env } from "cloudflare:workers";
import type { EligibilityResult } from "@shared/eligibility";
import type { BulkMatchResult, InboxResponse } from "@shared/match-triage";
import { createAppContext } from "@worker/context";
import {
  auditLog,
  member,
  opportunities,
  opportunityMatches,
  orgEligibility,
  orgProfiles,
  orgSettings,
} from "@worker/db/schema";
import { newId } from "@worker/lib/ids";
import { FakeLlm } from "@worker/ports/fake-llm";
import { allFakeHandlers } from "@worker/ports/fake-llm-handlers";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { api, createTestUser, setupTenant, testDb } from "../../../../test/worker/helpers";
import { defaultMatchingDeps } from "./deps";
import { scoreOrgMatches } from "./score-org";

const DAY = 86_400_000;
const db = () => testDb();

async function insertOpp(v: Partial<typeof opportunities.$inferInsert> = {}) {
  const id = newId("opp");
  await db()
    .insert(opportunities)
    .values({
      id,
      source: "manual",
      sourceId: id,
      funderName: "Test Funder",
      title: `Opportunity ${id}`,
      summary: "Construction trades workforce training for Navajo youth.",
      status: "posted",
      closeDate: new Date(Date.now() + 60 * DAY),
      awardFloorCents: 1_000_000,
      awardCeilingCents: 20_000_000,
      ...v,
    });
  return id;
}

async function insertMatch(
  orgId: string,
  opportunityId: string,
  v: Partial<typeof opportunityMatches.$inferInsert> = {},
) {
  const id = newId("mat");
  await db()
    .insert(opportunityMatches)
    .values({
      id,
      orgId,
      opportunityId,
      fitScore: 70,
      likelihood: 0.2,
      suggestedAskCents: 10_000_000,
      expectedValueCents: 2_000_000,
      status: "new",
      scoredAt: new Date(),
      ...v,
    });
  return id;
}

async function addMember(orgId: string, role: "viewer" | "editor") {
  const u = await createTestUser();
  await db()
    .insert(member)
    .values({
      id: newId("org").replace("org_", "mem_"),
      organizationId: orgId,
      userId: u.id,
      role,
    });
  return u.id;
}

async function statusOf(id: string) {
  return db()
    .select({
      status: opportunityMatches.status,
      dismissReason: opportunityMatches.dismissReason,
      dismissNote: opportunityMatches.dismissNote,
    })
    .from(opportunityMatches)
    .where(eq(opportunityMatches.id, id))
    .get();
}

const bulk = (orgId: string, as: string, json: unknown) =>
  api(`/api/orgs/${orgId}/matches/bulk`, { method: "POST", as, json });

describe("POST /matches/bulk", () => {
  it("shortlists and dismisses (with a reason), skipping drafting/applied matches", async () => {
    const t = await setupTenant();
    const editor = await addMember(t.orgId, "editor");
    const opp = () => insertOpp();
    const a = await insertMatch(t.orgId, await opp());
    const b = await insertMatch(t.orgId, await opp());
    const c = await insertMatch(t.orgId, await opp(), { status: "shortlisted" });
    const drafting = await insertMatch(t.orgId, await opp(), { status: "drafting" });
    const applied = await insertMatch(t.orgId, await opp(), { status: "applied" });

    const res = await bulk(t.orgId, editor, {
      ids: [a, b, c, a, drafting, applied, "mat_missing"],
      status: "shortlisted",
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as BulkMatchResult;
    expect(body.updated.sort()).toEqual([a, b].sort());
    expect(body.unchanged).toEqual([c]);
    expect(body.skipped).toEqual([
      { id: drafting, status: "drafting" },
      { id: applied, status: "applied" },
    ]);
    expect(body.notFound).toEqual(["mat_missing"]);
    expect((await statusOf(a))?.status).toBe("shortlisted");
    expect((await statusOf(drafting))?.status).toBe("drafting");
    expect((await statusOf(applied))?.status).toBe("applied");

    const dismiss = await bulk(t.orgId, editor, {
      ids: [a, b, drafting],
      status: "dismissed",
      dismissReason: "too_small",
      dismissNote: "  Awards are under $5k.  ",
    });
    expect(dismiss.status).toBe(200);
    const d = (await dismiss.json()) as BulkMatchResult;
    expect(d.updated.sort()).toEqual([a, b].sort());
    expect(d.skipped).toEqual([{ id: drafting, status: "drafting" }]);
    expect(await statusOf(a)).toEqual({
      status: "dismissed",
      dismissReason: "too_small",
      dismissNote: "Awards are under $5k.",
    });

    // Back to the shortlist clears the reason.
    await bulk(t.orgId, editor, { ids: [a], status: "shortlisted" });
    expect(await statusOf(a)).toEqual({
      status: "shortlisted",
      dismissReason: null,
      dismissNote: null,
    });

    const audits = await db()
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.orgId, t.orgId), eq(auditLog.targetId, b)))
      .all();
    expect(audits.map((x) => x.metadata)).toEqual([
      expect.objectContaining({ from: "new", to: "shortlisted", bulk: true }),
      expect.objectContaining({ from: "shortlisted", to: "dismissed", dismissReason: "too_small" }),
    ]);
    expect(audits.every((x) => x.actorId === editor && x.action === "match.status_changed")).toBe(
      true,
    );
  });

  it("validates the body", async () => {
    const t = await setupTenant();
    const m = await insertMatch(t.orgId, await insertOpp());
    const tooMany = Array.from({ length: 101 }, (_, i) => `mat_${i}`);
    for (const json of [
      { ids: [], status: "shortlisted" },
      { ids: tooMany, status: "shortlisted" },
      { ids: [m], status: "new" },
      { ids: [m], status: "drafting" },
      { ids: [m], status: "dismissed", dismissReason: "boring" },
      { ids: [m], status: "shortlisted", dismissReason: "wrong_focus" },
      { ids: [m], status: "dismissed", dismissNote: "x".repeat(501) },
    ]) {
      expect((await bulk(t.orgId, t.userId, json)).status).toBe(400);
    }
    const max = await bulk(t.orgId, t.userId, {
      ids: [m, ...tooMany.slice(0, 99)],
      status: "dismissed",
    });
    expect(max.status).toBe(200);
    expect(((await max.json()) as BulkMatchResult).notFound).toHaveLength(99);
    expect((await statusOf(m))?.status).toBe("dismissed");
  });

  it("requires editor", async () => {
    const t = await setupTenant();
    const viewer = await addMember(t.orgId, "viewer");
    const m = await insertMatch(t.orgId, await insertOpp());
    expect((await bulk(t.orgId, viewer, { ids: [m], status: "dismissed" })).status).toBe(403);
    expect((await statusOf(m))?.status).toBe("new");
  });

  it("isolates tenants", async () => {
    const a = await setupTenant();
    const b = await setupTenant();
    const mine = await insertMatch(b.orgId, await insertOpp());
    const theirs = await insertMatch(a.orgId, await insertOpp());

    // Not a member of org A.
    expect((await bulk(a.orgId, b.userId, { ids: [theirs], status: "dismissed" })).status).toBe(
      404,
    );
    // Org A's id through org B's path: not found, untouched.
    const res = await bulk(b.orgId, b.userId, { ids: [theirs, mine], status: "dismissed" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as BulkMatchResult;
    expect(body.updated).toEqual([mine]);
    expect(body.notFound).toEqual([theirs]);
    expect((await statusOf(theirs))?.status).toBe("new");
  });
});

describe("PATCH /matches/:id dismiss reason", () => {
  it("stores the reason and note, keeps them on a bare re-dismiss, clears them otherwise", async () => {
    const t = await setupTenant();
    const m = await insertMatch(t.orgId, await insertOpp());
    const patch = (json: unknown) =>
      api(`/api/orgs/${t.orgId}/matches/${m}`, { method: "PATCH", as: t.userId, json });

    const res = await patch({ status: "dismissed", dismissReason: "deadline" });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "dismissed", dismissReason: "deadline" });

    // A note alone counts as "other"; a bare re-dismiss keeps what is stored.
    await patch({ status: "dismissed", dismissNote: "Board said no." });
    expect(await statusOf(m)).toEqual({
      status: "dismissed",
      dismissReason: "other",
      dismissNote: "Board said no.",
    });
    expect((await patch({ status: "dismissed" })).status).toBe(200);
    expect((await statusOf(m))?.dismissReason).toBe("other");

    expect((await patch({ status: "new", dismissReason: "deadline" })).status).toBe(400);
    expect(await (await patch({ status: "new" })).json()).toMatchObject({
      status: "new",
      dismissReason: null,
      dismissNote: null,
    });
  });
});

describe("GET /matches/inbox", () => {
  it("lists new, open matches by expected value with the stored eligibility check", async () => {
    const t = await setupTenant();
    const other = await setupTenant();
    const viewer = await addMember(t.orgId, "viewer");
    const oppHigh = await insertOpp({ title: "High EV" });
    const oppLow = await insertOpp({ title: "Low EV" });
    const oppPast = await insertOpp({ closeDate: new Date(Date.now() - DAY) });
    const oppPrivate = await insertOpp({ privateToOrgId: other.orgId });
    const high = await insertMatch(t.orgId, oppHigh, { expectedValueCents: 9_000_000 });
    const low = await insertMatch(t.orgId, oppLow, { expectedValueCents: 1_000 });
    await insertMatch(t.orgId, await insertOpp(), {
      status: "shortlisted",
      expectedValueCents: 99_000_000,
    });
    await insertMatch(t.orgId, oppPast, { expectedValueCents: 50_000_000 });
    await insertMatch(t.orgId, oppPrivate, { expectedValueCents: 50_000_000 });
    await insertMatch(other.orgId, oppHigh, { expectedValueCents: 99_000_000 });

    const result: EligibilityResult = {
      opportunityId: oppHigh,
      overall: "likely",
      summary: "Likely eligible.",
      checklist: [
        {
          criterionId: "c1",
          kind: "registration",
          text: "Active SAM.gov registration.",
          sourceQuote: "Applicants must be registered in SAM.gov.",
          status: "unknown",
          method: "none",
          reason: "Not on file.",
          evidence: [],
        },
      ],
      missingInfoQuestions: [],
      criteriaModel: "structured",
      assessModel: null,
    };
    await db()
      .insert(orgEligibility)
      .values({ orgId: t.orgId, opportunityId: oppHigh, result, checkedAt: new Date() });
    // Another org's check for the same opportunity never leaks into this inbox.
    await db()
      .insert(orgEligibility)
      .values({
        orgId: other.orgId,
        opportunityId: oppLow,
        result: { ...result, opportunityId: oppLow, overall: "ineligible" },
        checkedAt: new Date(),
      });

    const res = await api(`/api/orgs/${t.orgId}/matches/inbox`, { as: viewer });
    expect(res.status).toBe(200);
    const body = (await res.json()) as InboxResponse;
    expect(body.total).toBe(2);
    expect(body.items.map((i) => i.id)).toEqual([high, low]);
    expect(body.items[0]?.opportunity.title).toBe("High EV");
    expect(body.items[0]?.eligibilityCheck).toMatchObject({
      overall: "likely",
      items: [{ criterionId: "c1", kind: "registration", status: "unknown" }],
    });
    expect(body.items[1]?.eligibilityCheck).toBeNull();

    const count = (await (
      await api(`/api/orgs/${t.orgId}/matches/inbox?limit=0`, { as: viewer })
    ).json()) as InboxResponse;
    expect(count).toEqual({ items: [], total: 2 });
    expect((await api(`/api/orgs/${t.orgId}/matches/inbox?limit=999`, { as: viewer })).status).toBe(
      400,
    );
    // Non-members get 404.
    expect((await api(`/api/orgs/${t.orgId}/matches/inbox`, { as: other.userId })).status).toBe(
      404,
    );
  });
});

describe("dismiss reasons as a matching signal", () => {
  const fixedScore = () =>
    new FakeLlm(allFakeHandlers).on("matching.score", () => ({
      eligibility: "likely_eligible",
      eligibilityNotes: "",
      fitScore: 70,
      likelihood: 0.2,
      suggestedAskCents: null,
      effortHours: 10,
      reasons: [{ text: "Solid fit", polarity: "positive", factIds: [] }],
      projectId: null,
    }));

  async function scoringOrg() {
    const t = await setupTenant();
    await db()
      .update(orgProfiles)
      .set({ orgType: "nonprofit_501c3", focusAreas: ["workforce development"] })
      .where(eq(orgProfiles.orgId, t.orgId));
    await db().update(orgSettings).set({ autoDraftTopN: 0 }).where(eq(orgSettings.orgId, t.orgId));
    return t;
  }

  async function dismiss(orgId: string, as: string, opportunityId: string, reason: string) {
    const m = await insertMatch(orgId, opportunityId);
    const res = await api(`/api/orgs/${orgId}/matches/${m}`, {
      method: "PATCH",
      as,
      json: { status: "dismissed", dismissReason: reason },
    });
    expect(res.status).toBe(200);
  }

  const fitOf = async (orgId: string, opportunityId: string) =>
    db()
      .select({ fit: opportunityMatches.fitScore, reasons: opportunityMatches.reasons })
      .from(opportunityMatches)
      .where(
        and(
          eq(opportunityMatches.orgId, orgId),
          eq(opportunityMatches.opportunityId, opportunityId),
        ),
      )
      .get();

  it("lowers the fit of later grants from the same funder (wrong_focus, too_small)", async () => {
    const t = await scoringOrg();
    const bystander = await scoringOrg();
    const acme = "Acme Community Foundation";
    const small = "Small Grants Fund";
    await dismiss(t.orgId, t.userId, await insertOpp({ funderName: acme }), "wrong_focus");
    await dismiss(
      t.orgId,
      t.userId,
      await insertOpp({ funderName: small, awardCeilingCents: 500_000, awardFloorCents: null }),
      "too_small",
    );
    // Reasons that say nothing about the funder carry no signal.
    const busyFunder = "Busy Funder";
    await dismiss(t.orgId, t.userId, await insertOpp({ funderName: busyFunder }), "deadline");

    const acmeNew = await insertOpp({ funderName: "ACME community foundation" });
    const smallSame = await insertOpp({
      funderName: small,
      awardCeilingCents: 500_000,
      awardFloorCents: null,
    });
    const smallBigger = await insertOpp({ funderName: small, awardCeilingCents: 50_000_000 });
    const busyNew = await insertOpp({ funderName: busyFunder });
    const unrelated = await insertOpp({ funderName: "Unrelated Trust" });
    const ids = [acmeNew, smallSame, smallBigger, busyNew, unrelated];

    const res = await scoreOrgMatches(
      createAppContext(env, { llm: fixedScore() }),
      { orgId: t.orgId, opportunityIds: ids },
      defaultMatchingDeps,
    );
    expect(res.scored).toBe(ids.length);

    const acmeRow = await fitOf(t.orgId, acmeNew);
    expect(acmeRow?.fit).toBe(55);
    expect(acmeRow?.reasons.at(-1)).toEqual({
      text: "Fit lowered by 15 points: you dismissed 1 similar grant from ACME community foundation (wrong focus).",
      polarity: "negative",
      factIds: [],
    });
    expect((await fitOf(t.orgId, smallSame))?.fit).toBe(60);
    expect((await fitOf(t.orgId, smallBigger))?.fit).toBe(70);
    expect((await fitOf(t.orgId, busyNew))?.fit).toBe(70);
    expect((await fitOf(t.orgId, unrelated))?.fit).toBe(70);

    // Another org's dismissals never affect this org's scores.
    await scoreOrgMatches(
      createAppContext(env, { llm: fixedScore() }),
      { orgId: bystander.orgId, opportunityIds: [acmeNew] },
      defaultMatchingDeps,
    );
    expect((await fitOf(bystander.orgId, acmeNew))?.fit).toBe(70);
  });
});
