// Plans, limits, checkout and the provider webhook, through the HTTP API. APP_ENV=test selects
// packages/billing's signed fake provider, so signature rejection is exercised for real.
import { fakeWebhookRequest } from "@billing";
import type { BillingDto, PlanDto, ProjectDto } from "@shared/api/types";
import { pendingCheckouts, subscriptions } from "@worker/db/schema";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  addToOrg,
  api,
  BASE,
  call,
  createTestUser,
  grantPlan,
  setupTenant,
  testDb,
  worker,
} from "./helpers";

const newJob = (orgId: string, as: string, name = "Job") =>
  api(`/api/orgs/${orgId}/projects`, {
    method: "POST",
    as,
    json: { name, gcName: "GC", originalContractSumCents: 100_000 },
  });

async function checkout(orgId: string, as: string, plan = "solo", interval = "month") {
  const { url } = await call<{ url: string }>(`/api/orgs/${orgId}/billing/checkout`, {
    method: "POST",
    as,
    json: { plan, interval },
  });
  const row = await testDb()
    .select()
    .from(pendingCheckouts)
    .where(eq(pendingCheckouts.orgId, orgId))
    .all();
  return { url, pending: row.at(-1) };
}

/** The token the app signed for a pending checkout, recovered the way Paddle would echo it. */
async function tokenFor(orgId: string, checkoutId: string) {
  const { signCheckoutToken } = await import("@billing");
  return signCheckoutToken("test-secret-test-secret-test-secret-0123456789", checkoutId, orgId);
}

let seq = 0;
async function webhook(body: Parameters<typeof fakeWebhookRequest>[1], secret?: string) {
  const req = await fakeWebhookRequest(`${BASE}/api/billing/webhook`, body, secret);
  const res = await worker.fetch(req);
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}
const sub = (planKey: string, id: string, customer: string, status = "active" as const) => ({
  planKey,
  status,
  providerCustomerId: customer,
  providerSubscriptionId: id,
  currentPeriodStart: "2026-11-01T00:00:00Z",
  currentPeriodEnd: "2026-12-01T00:00:00Z",
});

describe("plans and limits", () => {
  it("lists public plans without signing in, never the complimentary plan", async () => {
    const { items } = await call<{ items: PlanDto[] }>("/api/billing/plans");
    expect(items.map((p) => p.key)).toEqual(["free", "solo", "crew", "company"]);
    expect(items.find((p) => p.key === "solo")?.priceCents).toBe(9_900);
  });

  it("a new org is on Free: one active job, and closing it frees the slot", async () => {
    const t = await setupTenant();
    const b = await call<BillingDto>(`/api/orgs/${t.orgId}/billing`, { as: t.userId });
    expect(b.plan.key).toBe("free");
    expect(b.status).toBe("none");
    expect(b.checkoutAvailable).toBe(true);
    expect(b.limits).toEqual({ activeJobs: 1, members: 1 });

    const first = (await (await newJob(t.orgId, t.userId)).json()) as ProjectDto;
    const second = await newJob(t.orgId, t.userId);
    expect(second.status).toBe(402);
    expect(((await second.json()) as { error: { code: string } }).error.code).toBe(
      "payment_required",
    );

    await call(`/api/orgs/${t.orgId}/projects/${first.id}`, {
      method: "PATCH",
      as: t.userId,
      json: { status: "closed" },
    });
    expect((await newJob(t.orgId, t.userId, "Next")).status).toBe(201);
    // Reopening the closed job would make two active jobs.
    const reopen = await api(`/api/orgs/${t.orgId}/projects/${first.id}`, {
      method: "PATCH",
      as: t.userId,
      json: { status: "active" },
    });
    expect(reopen.status).toBe(402);
  });

  it("Free allows one user; adding a second needs a paid plan", async () => {
    const t = await setupTenant();
    const other = await createTestUser();
    const res = await api(`/api/orgs/${t.orgId}/members`, {
      method: "POST",
      as: t.userId,
      json: { email: other.email, role: "editor" },
    });
    expect(res.status).toBe(402);
  });

  it("a lapsed subscription keeps every job readable but blocks new pay apps over the Free limit", async () => {
    const t = await setupTenant();
    await grantPlan(t.orgId, "crew", "active");
    const jobs: ProjectDto[] = [];
    for (const name of ["A", "B"]) {
      jobs.push((await (await newJob(t.orgId, t.userId, name)).json()) as ProjectDto);
    }
    const job = jobs[0] as ProjectDto;
    const base = `/api/orgs/${t.orgId}/projects/${job.id}`;
    await call(`${base}/sov-lines`, {
      method: "POST",
      as: t.userId,
      expect: 201,
      json: { itemNumber: "1", description: "Work", originalCents: 100_000 },
    });
    await grantPlan(t.orgId, "crew", "canceled");

    const b = await call<BillingDto>(`/api/orgs/${t.orgId}/billing`, { as: t.userId });
    expect(b.plan.key).toBe("free");
    expect(b.lapsed).toBe(true);
    expect((await api(base, { as: t.userId })).status).toBe(200);
    const pa = await api(`${base}/pay-apps`, {
      method: "POST",
      as: t.userId,
      json: { periodFrom: "2026-11-01", periodTo: "2026-11-30", applicationDate: "2026-11-30" },
    });
    expect(pa.status).toBe(402);
  });
});

describe("checkout", () => {
  it("is admin-only and never sells the free or complimentary plan", async () => {
    const t = await setupTenant();
    const editor = await createTestUser();
    await addToOrg(t.orgId, editor.id, "editor");
    const denied = await api(`/api/orgs/${t.orgId}/billing/checkout`, {
      method: "POST",
      as: editor.id,
      json: { plan: "solo" },
    });
    expect(denied.status).toBe(403);
    for (const plan of ["free", "comp", "nope"]) {
      const res = await api(`/api/orgs/${t.orgId}/billing/checkout`, {
        method: "POST",
        as: t.userId,
        json: { plan },
      });
      expect(res.status).toBe(400);
    }
  });

  it("stores a pending checkout and returns the provider URL", async () => {
    const t = await setupTenant();
    const { url, pending } = await checkout(t.orgId, t.userId, "crew", "year");
    expect(url).toContain("fake_checkout=crew%3Aannual");
    expect(pending).toMatchObject({ planKey: "crew", interval: "year", consumedAt: null });
  });

  it("rejects an unknown promo code with 400", async () => {
    const t = await setupTenant();
    const res = await api(`/api/orgs/${t.orgId}/billing/checkout`, {
      method: "POST",
      as: t.userId,
      json: { plan: "solo", promoCode: "NOTREAL" },
    });
    expect(res.status).toBe(400);
  });
});

describe("webhook", () => {
  it("rejects a bad signature with 401", async () => {
    const res = await webhook({ providerEventId: "evt_bad" }, "wrong-secret");
    expect(res.status).toBe(401);
  });

  it("a checkout's webhook upgrades the org; a duplicate delivery is a no-op", async () => {
    const t = await setupTenant();
    const { pending } = await checkout(t.orgId, t.userId, "solo");
    const token = await tokenFor(t.orgId, pending?.id ?? "");
    const body = {
      providerEventId: `evt_${++seq}`,
      type: "subscription.created",
      occurredAt: "2026-11-01T00:00:01Z",
      customData: { checkoutToken: token },
      subscription: sub("solo", "sub_upgrade", "ctm_upgrade"),
    };
    expect((await webhook(body)).body).toEqual({ outcome: "applied" });
    expect((await webhook(body)).body).toEqual({ outcome: "duplicate" });

    const b = await call<BillingDto>(`/api/orgs/${t.orgId}/billing`, { as: t.userId });
    expect(b.plan.key).toBe("solo");
    expect(b.status).toBe("active");
    expect(b.portalAvailable).toBe(true);
    expect((await newJob(t.orgId, t.userId, "1")).status).toBe(201);
    expect((await newJob(t.orgId, t.userId, "2")).status).toBe(201);

    // Later events bind through the stored subscription id, with no token.
    const canceled = await webhook({
      providerEventId: `evt_${++seq}`,
      occurredAt: "2026-11-20T00:00:00Z",
      subscription: { ...sub("solo", "sub_upgrade", "ctm_upgrade"), status: "canceled" },
    });
    expect(canceled.body).toEqual({ outcome: "applied" });
    const after = await call<BillingDto>(`/api/orgs/${t.orgId}/billing`, { as: t.userId });
    expect(after.plan.key).toBe("free");
    expect(after.lapsed).toBe(true);
  });

  it("ignores a crafted custom_data.orgId and an unsigned token", async () => {
    const victim = await setupTenant();
    const res = await webhook({
      providerEventId: `evt_${++seq}`,
      customData: { orgId: victim.orgId, checkoutToken: "pco_aaaaaaaaaaaaaaaaaaaa.00" },
      subscription: sub("company", "sub_crafted", "ctm_attacker"),
    });
    expect(res.status).toBe(200);
    expect(res.body.outcome).toBe("ignored");
    const row = await testDb()
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.orgId, victim.orgId))
      .get();
    expect(row).toBeUndefined();
  });

  it("a token is consumed once: a second subscription replaying it is ignored", async () => {
    const t = await setupTenant();
    const { pending } = await checkout(t.orgId, t.userId, "solo");
    const token = await tokenFor(t.orgId, pending?.id ?? "");
    const first = await webhook({
      providerEventId: `evt_${++seq}`,
      customData: { checkoutToken: token },
      subscription: sub("solo", "sub_first", "ctm_same"),
    });
    expect(first.body.outcome).toBe("applied");
    const replay = await webhook({
      providerEventId: `evt_${++seq}`,
      customData: { checkoutToken: token },
      subscription: sub("company", "sub_second", "ctm_same"),
    });
    expect(replay.body).toEqual({ outcome: "ignored", reason: "checkout token replay" });
  });

  it("never grants the complimentary plan, and never lets another customer take over", async () => {
    const t = await setupTenant();
    const { pending } = await checkout(t.orgId, t.userId, "solo");
    const token = await tokenFor(t.orgId, pending?.id ?? "");
    const comp = await webhook({
      providerEventId: `evt_${++seq}`,
      customData: { checkoutToken: token },
      subscription: sub("comp", "sub_comp", "ctm_owner"),
    });
    expect(comp.body).toEqual({ outcome: "ignored", reason: "unknown plan" });

    await webhook({
      providerEventId: `evt_${++seq}`,
      customData: { checkoutToken: token },
      subscription: sub("solo", "sub_owner", "ctm_owner"),
    });
    const { pending: p2 } = await checkout(t.orgId, t.userId, "company");
    const takeover = await webhook({
      providerEventId: `evt_${++seq}`,
      customData: { checkoutToken: await tokenFor(t.orgId, p2?.id ?? "") },
      subscription: sub("company", "sub_other", "ctm_other"),
    });
    expect(takeover.body).toEqual({ outcome: "ignored", reason: "customer mismatch" });
  });

  it("a webhook for one org's subscription cannot touch another org", async () => {
    const a = await setupTenant();
    const b = await setupTenant();
    const { pending } = await checkout(a.orgId, a.userId, "crew");
    await webhook({
      providerEventId: `evt_${++seq}`,
      customData: { checkoutToken: await tokenFor(a.orgId, pending?.id ?? "") },
      subscription: sub("crew", "sub_a", "ctm_a"),
    });
    // A token signed for org A's checkout id but claiming org B fails verification.
    const forged = await webhook({
      providerEventId: `evt_${++seq}`,
      customData: { checkoutToken: await tokenFor(b.orgId, pending?.id ?? "") },
      subscription: sub("company", "sub_b", "ctm_b"),
    });
    expect(forged.body).toEqual({ outcome: "ignored", reason: "invalid checkout token" });
    const billingB = await call<BillingDto>(`/api/orgs/${b.orgId}/billing`, { as: b.userId });
    expect(billingB.plan.key).toBe("free");
    // And B's members cannot read A's billing.
    expect((await api(`/api/orgs/${a.orgId}/billing`, { as: b.userId })).status).toBe(404);
  });
});
