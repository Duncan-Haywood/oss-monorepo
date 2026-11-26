import { env } from "cloudflare:workers";
import { PLANS } from "@shared/billing/plans";
import type { BillingOverviewDto } from "@shared/billing/types";
import type { MemberRole } from "@shared/enums";
import { createAppContext } from "@worker/context";
import { auditLog, billingEvents, llmCalls, member, subscriptions } from "@worker/db/schema";
import type { Env } from "@worker/env";
import { AppError } from "@worker/lib/errors";
import { newId } from "@worker/lib/ids";
import { FAKE_SIGNATURE_HEADER, signFakeWebhook } from "@worker/ports/billing/fake";
import {
  applicationCost,
  assertCanDraft,
  getUsageSummary,
  grantComp,
  recordUsage,
} from "@worker/services/billing";
import { createPendingCheckout } from "@worker/services/billing/checkout";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { api, createTestUser, setupTenant, testDb } from "./helpers";

const ctx = () => createAppContext(env as unknown as Env);

async function setSub(
  orgId: string,
  planKey: string,
  status: "active" | "canceled" | "comp" | "past_due",
) {
  await testDb()
    .insert(subscriptions)
    .values({
      orgId,
      planKey,
      status,
      provider: status === "comp" ? null : "fake",
      providerCustomerId: status === "comp" ? null : `ctm_${orgId}`,
      providerSubscriptionId: status === "comp" ? null : `sub_${orgId}`,
      currentPeriodStart: new Date(Date.now() - 86_400_000),
      currentPeriodEnd: new Date(Date.now() + 20 * 86_400_000),
    })
    .onConflictDoUpdate({ target: subscriptions.orgId, set: { planKey, status } });
}

async function expect402(p: Promise<unknown>) {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(AppError);
  expect((err as AppError).status).toBe(402);
  expect((err as AppError).code).toBe("payment_required");
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

describe("assertCanDraft / recordUsage", () => {
  it("starter: allows the included drafts, then 402 when the quota is used up", async () => {
    const { orgId } = await setupTenant();
    await setSub(orgId, "starter", "active");
    const c = ctx();
    const limit = PLANS.starter.includedApplicationDrafts;
    for (let i = 0; i < limit; i++) {
      const allowance = await assertCanDraft(c, orgId);
      expect(allowance.remaining).toBe(limit - i);
      await recordUsage(c, {
        orgId,
        kind: "application_draft",
        subjectId: `app_${i}`,
        costMicros: 1_200_000,
      });
    }
    await expect402(assertCanDraft(c, orgId));
    const usage = await getUsageSummary(c, orgId);
    expect(usage.applicationDrafts).toBe(limit);
    expect(usage.limit).toBe(limit);
    expect(usage.costMicros).toBe(limit * 1_200_000);
  });

  it("regenerating the same application does not consume more quota", async () => {
    const { orgId } = await setupTenant();
    await setSub(orgId, "starter", "active");
    const c = ctx();
    const first = await recordUsage(c, {
      orgId,
      kind: "application_draft",
      subjectId: "app_x",
      costMicros: 100,
    });
    const again = await recordUsage(c, {
      orgId,
      kind: "application_draft",
      subjectId: "app_x",
      costMicros: 50,
    });
    expect(first.counted).toBe(true);
    expect(again.counted).toBe(false);
    const usage = await getUsageSummary(c, orgId);
    expect(usage.applicationDrafts).toBe(1);
    expect(usage.byKind.application_draft.costMicros).toBe(150);
  });

  it("comp is effectively unlimited for a pilot partner", async () => {
    const { orgId } = await setupTenant();
    const c = ctx();
    await grantComp(c, orgId, "Pilot partner");
    for (let i = 0; i < 12; i++) {
      await assertCanDraft(c, orgId);
      await recordUsage(c, { orgId, kind: "application_draft", subjectId: `a${i}`, costMicros: 1 });
    }
    const allowance = await assertCanDraft(c, orgId);
    expect(allowance.planKey).toBe("comp");
    expect(allowance.remaining).toBe(PLANS.comp.includedApplicationDrafts - 12);
    const audits = await testDb()
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.orgId, orgId), eq(auditLog.action, "billing.comp_granted")))
      .all();
    expect(audits).toHaveLength(1);
  });

  it("canceled / past_due subscriptions cannot draft; demo orgs without a row are comp", async () => {
    const a = await setupTenant();
    await setSub(a.orgId, "standard", "canceled");
    await expect402(assertCanDraft(ctx(), a.orgId));
    await setSub(a.orgId, "standard", "past_due");
    await expect402(assertCanDraft(ctx(), a.orgId));
    const b = await setupTenant();
    expect((await assertCanDraft(ctx(), b.orgId)).planKey).toBe("comp"); // FAKE_EXTERNALS=true
  });

  it("applicationCost sums llm_calls for that org + application only", async () => {
    const a = await setupTenant();
    const b = await setupTenant();
    const row = (orgId: string, applicationId: string, cost: number) => ({
      id: newId("llm"),
      orgId,
      applicationId,
      purpose: "drafting.section",
      model: "claude-opus-5-5",
      costMicros: cost,
    });
    await testDb()
      .insert(llmCalls)
      .values([row(a.orgId, "app_1", 1000), row(a.orgId, "app_1", 500), row(b.orgId, "app_1", 9)]);
    expect(await applicationCost(ctx(), a.orgId, "app_1")).toEqual({ costMicros: 1500, calls: 2 });
  });
});

describe("POST /api/billing/webhook", () => {
  /** A signed checkout token for orgId, as POST /billing/checkout would put in custom_data. */
  const tokenFor = async (orgId: string) =>
    (
      await createPendingCheckout(ctx(), {
        orgId,
        planKey: "standard",
        interval: "month",
        createdBy: null,
      })
    ).token;
  const event = (token: string | null, id: string, over: Record<string, unknown> = {}) => ({
    providerEventId: id,
    type: "subscription.activated",
    customData: token ? { checkoutToken: token } : {},
    subscription: {
      planKey: "standard",
      status: "active",
      providerCustomerId: "ctm_1",
      providerSubscriptionId: "sub_1",
      currentPeriodStart: new Date().toISOString(),
      currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      cancelAtPeriodEnd: false,
      ...over,
    },
  });
  const post = async (body: unknown, signature?: string) => {
    const raw = JSON.stringify(body);
    const sig = signature ?? (await signFakeWebhook(raw));
    return api("/api/billing/webhook", {
      method: "POST",
      body: raw,
      headers: { "Content-Type": "application/json", [FAKE_SIGNATURE_HEADER]: sig },
    });
  };

  it("rejects missing and invalid signatures without touching state", async () => {
    const { orgId } = await setupTenant();
    const body = event(await tokenFor(orgId), `evt_${orgId}_bad`);
    const bad = await post(body, "00".repeat(32));
    expect(bad.status).toBe(401);
    expect(((await bad.json()) as { error: { code: string } }).error.code).toBe(
      "invalid_signature",
    );
    const unsigned = await api("/api/billing/webhook", { method: "POST", json: body });
    expect(unsigned.status).toBe(401);
    const tampered = JSON.stringify(body);
    const sig = await signFakeWebhook(tampered);
    const res = await post({ ...body, customData: { checkoutToken: "forged" } }, sig);
    expect(res.status).toBe(401);
    const sub = await testDb()
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.orgId, orgId))
      .get();
    expect(sub).toBeUndefined();
  });

  it("applies a signed event once; replays are idempotent; audit is written", async () => {
    const { orgId } = await setupTenant();
    const token = await tokenFor(orgId);
    const body = event(token, `evt_${orgId}_1`);
    const first = await post(body);
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ received: true, outcome: "applied" });
    const replay = await post(body);
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual({ received: true, outcome: "duplicate" });

    const sub = await testDb()
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.orgId, orgId))
      .get();
    expect(sub?.planKey).toBe("standard");
    expect(sub?.status).toBe("active");
    expect(sub?.provider).toBe("fake");
    const events = await testDb()
      .select()
      .from(billingEvents)
      .where(eq(billingEvents.providerEventId, body.providerEventId))
      .all();
    expect(events).toHaveLength(1);
    expect(events[0]?.processedAt).toBeTruthy();
    const audits = await testDb()
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.orgId, orgId), eq(auditLog.action, "billing.subscription_updated")))
      .all();
    expect(audits).toHaveLength(1);

    // Cancellation at period end, then a stale cancel for some other subscription is ignored.
    await post(event(token, `evt_${orgId}_2`, { cancelAtPeriodEnd: true }));
    const other = await post(
      event(token, `evt_${orgId}_3`, { status: "canceled", providerSubscriptionId: "sub_old" }),
    );
    expect(await other.json()).toEqual({ received: true, outcome: "ignored" });
    const after = await testDb()
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.orgId, orgId))
      .get();
    expect(after?.status).toBe("active");
    expect(after?.cancelAtPeriodEnd).toBe(true);
  });

  it("never grants comp or unknown plans from a webhook", async () => {
    const { orgId } = await setupTenant();
    const token = await tokenFor(orgId);
    for (const [i, planKey] of ["comp", "enterprise"].entries()) {
      const res = await post(event(token, `evt_${orgId}_plan_${i}`, { planKey }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true, outcome: "ignored" });
    }
    const sub = await testDb()
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.orgId, orgId))
      .get();
    expect(sub).toBeUndefined();
  });

  it("ignores events that are not bound to an org (no checkout token)", async () => {
    const res = await post(
      event(null, "evt_unknown_org", { providerSubscriptionId: "sub_unbound" }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, outcome: "ignored" });
  });
});

describe("/api/orgs/:orgId/billing", () => {
  it("GET is open to viewers and returns plan, usage and purchasable plans", async () => {
    const { orgId } = await setupTenant();
    const viewer = await addMember(orgId, "viewer");
    const res = await api(`/api/orgs/${orgId}/billing`, { as: viewer });
    expect(res.status).toBe(200);
    const body = (await res.json()) as BillingOverviewDto;
    expect(body.subscription).toBeNull();
    expect(body.plan?.key).toBe("comp"); // offline demo
    expect(body.usage.limit).toBe(PLANS.comp.includedApplicationDrafts);
    expect(body.plans.map((p) => p.key)).toEqual(["starter", "standard", "pro"]);
    expect(body.provider).toBe("fake");
  });

  it("checkout and portal require admin", async () => {
    const { orgId } = await setupTenant();
    for (const role of ["viewer", "reviewer", "editor"] as const) {
      const uid = await addMember(orgId, role);
      const co = await api(`/api/orgs/${orgId}/billing/checkout`, {
        method: "POST",
        as: uid,
        json: { planKey: "starter" },
      });
      expect(co.status).toBe(403);
      const po = await api(`/api/orgs/${orgId}/billing/portal`, { method: "POST", as: uid });
      expect(po.status).toBe(403);
    }
  });

  it("admin checkout (with promo code) activates the plan in demo mode; portal then works", async () => {
    const { orgId } = await setupTenant();
    const admin = await addMember(orgId, "admin");
    const noSub = await api(`/api/orgs/${orgId}/billing/portal`, { method: "POST", as: admin });
    expect(noSub.status).toBe(400);

    const badPromo = await api(`/api/orgs/${orgId}/billing/checkout`, {
      method: "POST",
      as: admin,
      json: { planKey: "starter", promoCode: "NOPE" },
    });
    expect(badPromo.status).toBe(400);
    const badPlan = await api(`/api/orgs/${orgId}/billing/checkout`, {
      method: "POST",
      as: admin,
      json: { planKey: "comp" },
    });
    expect(badPlan.status).toBe(400);

    const co = await api(`/api/orgs/${orgId}/billing/checkout`, {
      method: "POST",
      as: admin,
      json: { planKey: "standard", promoCode: "PILOT50", interval: "year" },
    });
    expect(co.status).toBe(200);
    const { url } = (await co.json()) as { url: string };
    expect(url).toContain(`/orgs/${orgId}/settings/billing`);
    expect(url).toContain("fake_checkout=standard%3Aannual");

    const overview = (await (
      await api(`/api/orgs/${orgId}/billing`, { as: admin })
    ).json()) as BillingOverviewDto;
    expect(overview.subscription?.planKey).toBe("standard");
    expect(overview.status).toBe("active");
    expect(overview.usage.limit).toBe(PLANS.standard.includedApplicationDrafts);

    const po = await api(`/api/orgs/${orgId}/billing/portal`, { method: "POST", as: admin });
    expect(po.status).toBe(200);
    expect(((await po.json()) as { url: string }).url).toContain("fake_portal=1");
  });

  it("is tenant-isolated", async () => {
    const a = await setupTenant();
    const b = await setupTenant();
    expect((await api(`/api/orgs/${a.orgId}/billing`, { as: b.userId })).status).toBe(404);
    const co = await api(`/api/orgs/${a.orgId}/billing/checkout`, {
      method: "POST",
      as: b.userId,
      json: { planKey: "pro" },
    });
    expect(co.status).toBe(404);
  });
});
