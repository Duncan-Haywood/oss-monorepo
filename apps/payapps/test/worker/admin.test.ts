// Platform admin API (/api/admin/*): the gate (verified PLATFORM_ADMIN_EMAILS session or the
// console's service token), the audit trail, cross-tenant reads, and metrics built only from what
// the Paddle webhook recorded (MRR, trials, cancellations, failed payments) + the owner email.
import type { AdminAccountsPage, ProductAdminMetrics } from "@admin-metrics";
import { fakeWebhookRequest, signCheckoutToken } from "@billing";
import { testFakes } from "@worker/context";
import { adminAuditLog, organization, pendingCheckouts, user } from "@worker/db/schema";
import { newId } from "@worker/lib/ids";
import { desc, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { api, BASE, call, setupTenant, testDb, worker } from "./helpers";

const ADMIN_EMAIL = "owner-admin@example.test";
const SERVICE_TOKEN = "test-admin-service-token-0123456789abcdef";
const AUTH_SECRET = "test-secret-test-secret-test-secret-0123456789";
const bearer = { Authorization: `Bearer ${SERVICE_TOKEN}` };

/** The listed admin (verified), or the same address upper-cased and NOT verified. */
async function adminUser(verified = true) {
  const email = verified ? ADMIN_EMAIL : ADMIN_EMAIL.toUpperCase();
  await testDb()
    .insert(user)
    .values({ id: newId("usr"), name: "Owner", email, emailVerified: verified })
    .onConflictDoNothing();
  const row = await testDb().select({ id: user.id }).from(user).where(eq(user.email, email)).get();
  if (!row) throw new Error("admin user missing");
  return row.id;
}

let seq = 0;
async function paidWebhook(
  orgId: string,
  subId: string,
  status: "trialing" | "active" | "past_due" | "canceled",
  extra: { price?: Record<string, unknown>; cancelAtPeriodEnd?: boolean; checkout?: boolean } = {},
) {
  let customData: Record<string, unknown> | undefined;
  if (extra.checkout) {
    const id = `pco_${newId("bev").slice(4)}`;
    await testDb()
      .insert(pendingCheckouts)
      .values({
        id,
        orgId,
        planKey: "solo",
        interval: "month",
        expiresAt: new Date(Date.now() + 3_600_000),
      });
    customData = { checkoutToken: await signCheckoutToken(AUTH_SECRET, id, orgId) };
  }
  const req = await fakeWebhookRequest(`${BASE}/api/billing/webhook`, {
    providerEventId: `evt_admin_${++seq}`,
    type: "subscription.updated",
    occurredAt: new Date(Date.now() - 60_000 + seq).toISOString(),
    customData,
    subscription: {
      planKey: "solo",
      status,
      providerCustomerId: `ctm_${subId}`,
      providerSubscriptionId: subId,
      cancelAtPeriodEnd: extra.cancelAtPeriodEnd ?? false,
      price: {
        unitAmountMinor: 9900,
        currency: "USD",
        interval: "month",
        frequency: 1,
        quantity: 1,
        discounted: false,
        ...extra.price,
      } as never,
    },
  });
  const res = await worker.fetch(req);
  expect(await res.json()).toEqual({ outcome: "applied" });
}

describe("admin gate", () => {
  it("401 signed out, 403 for a normal member, an unverified listed address, or a wrong token", async () => {
    expect((await api("/api/admin/metrics")).status).toBe(401);
    const t = await setupTenant();
    expect((await api("/api/admin/metrics", { as: t.userId })).status).toBe(403);
    const unverified = await adminUser(false);
    expect((await api("/api/admin/metrics", { as: unverified })).status).toBe(403);
    expect(
      (await api("/api/admin/accounts", { headers: { Authorization: "Bearer wrong-token" } }))
        .status,
    ).toBe(403);
    // A wrong token is refused even alongside an admin session.
    const admin = await adminUser();
    expect(
      (await api("/api/admin/metrics", { as: admin, headers: { Authorization: "Bearer nope" } }))
        .status,
    ).toBe(403);
  });

  it("lets a verified listed admin and the service token in, and audits every read", async () => {
    const admin = await adminUser();
    const m = await call<ProductAdminMetrics>("/api/admin/metrics?days=7", { as: admin });
    expect(m.product).toBe("payapps");
    expect(m.signups.byDay).toHaveLength(7);
    const res = await api("/api/admin/accounts?list=recent", { headers: bearer });
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");

    const rows = await testDb()
      .select()
      .from(adminAuditLog)
      .orderBy(desc(adminAuditLog.createdAt))
      .all();
    expect(
      rows.some(
        (r) => r.action === "admin.metrics_read" && r.actorType === "user" && r.actorId === admin,
      ),
    ).toBe(true);
    expect(
      rows.some(
        (r) =>
          r.action === "admin.accounts_read" &&
          r.actorType === "service" &&
          r.actorId === "admin-console",
      ),
    ).toBe(true);
  });

  it("validates query parameters", async () => {
    expect((await api("/api/admin/metrics?days=0", { headers: bearer })).status).toBe(400);
    expect((await api("/api/admin/accounts?list=everything", { headers: bearer })).status).toBe(
      400,
    );
  });
});

describe("read-only metrics token (agents)", () => {
  const metricsBearer = { Authorization: "Bearer test-admin-metrics-token-0123456789abcdef" };
  it("reads aggregate metrics but never the per-person account lists", async () => {
    const res = await api("/api/admin/metrics", { headers: metricsBearer });
    expect(res.status).toBe(200);
    for (const list of ["recent", "trials", "churn"]) {
      expect(
        (await api(`/api/admin/accounts?list=${list}`, { headers: metricsBearer })).status,
      ).toBe(403);
    }
    const rows = await testDb().select().from(adminAuditLog).all();
    expect(
      rows.some((r) => r.actorId === "metrics-agent" && r.action === "admin.metrics_read"),
    ).toBe(true);
    expect(
      rows.some((r) => r.actorId === "metrics-agent" && r.action === "admin.accounts_read"),
    ).toBe(false);
  });
});

describe("cross-tenant reads", () => {
  it("only a platform admin sees every org; a tenant member sees neither the admin API nor another org", async () => {
    const a = await setupTenant();
    const b = await setupTenant();
    await testDb()
      .update(organization)
      .set({ name: "Bravo Electric" })
      .where(eq(organization.id, b.orgId));

    expect((await api("/api/admin/accounts", { as: a.userId })).status).toBe(403);
    expect((await api(`/api/orgs/${b.orgId}/projects`, { as: a.userId })).status).toBe(404);

    const page = await call<AdminAccountsPage>("/api/admin/accounts?list=recent&limit=200", {
      headers: bearer,
    });
    const ids = page.items.map((i) => i.orgId);
    expect(ids).toContain(a.orgId);
    expect(ids).toContain(b.orgId);
    const bravo = page.items.find((i) => i.orgId === b.orgId);
    expect(bravo?.orgName).toBe("Bravo Electric");
    expect(bravo?.owner?.email).toBe(b.user.email);
    // Metadata only: no tenant content keys.
    expect(Object.keys(bravo ?? {}).sort()).toEqual(
      [
        "cancelAtPeriodEnd",
        "canceledAt",
        "createdAt",
        "currentPeriodEnd",
        "firstPaidAt",
        "mrr",
        "orgId",
        "orgName",
        "owner",
        "planKey",
        "status",
        "trialStartedAt",
      ].sort(),
    );
  });
});

describe("metrics from webhooks", () => {
  it("MRR, trials, conversions, cancellations and failed payments come only from recorded events", async () => {
    const before = await call<ProductAdminMetrics>("/api/admin/metrics", { headers: bearer });
    const usd = (m: ProductAdminMetrics) =>
      m.mrr.byCurrency.find((c) => c.currency === "USD")?.amountMinor ?? 0;
    expect(before.llmSpend).toBeNull();

    // A trial that converts: counted once as started, once as converted, and its MRR appears.
    const t1 = await setupTenant();
    await paidWebhook(t1.orgId, "sub_admin_1", "trialing", { checkout: true });
    const mid = await call<ProductAdminMetrics>("/api/admin/metrics", { headers: bearer });
    expect(mid.trials.current).toBe(before.trials.current + 1);
    expect(mid.trials.startedInWindow).toBe(before.trials.startedInWindow + 1);
    expect(usd(mid)).toBe(usd(before)); // trialing is not revenue

    const mailBefore = testFakes.email.sent.length;
    await paidWebhook(t1.orgId, "sub_admin_1", "active");
    const newMail = testFakes.email.sent.slice(mailBefore);
    expect(newMail).toHaveLength(1);
    expect(newMail[0]?.to).toEqual([ADMIN_EMAIL]);
    expect(newMail[0]?.text).toContain("Test Mechanical");
    expect(newMail[0]?.text).toContain(t1.user.email);
    expect(newMail[0]?.text).toContain("USD 99.00 per month");
    // A renewal on the same subscription is not "new".
    await paidWebhook(t1.orgId, "sub_admin_1", "active");
    expect(testFakes.email.sent.length).toBe(mailBefore + 1);

    // An annual subscription (×1/12), a discounted one (unpriced, never guessed), a past_due one.
    const t2 = await setupTenant();
    await paidWebhook(t2.orgId, "sub_admin_2", "active", {
      checkout: true,
      price: { interval: "year", unitAmountMinor: 99_000 },
    });
    const t3 = await setupTenant();
    await paidWebhook(t3.orgId, "sub_admin_3", "active", {
      checkout: true,
      price: { discounted: true },
    });
    const t4 = await setupTenant();
    await paidWebhook(t4.orgId, "sub_admin_4", "active", {
      checkout: true,
      cancelAtPeriodEnd: true,
    });
    await paidWebhook(t4.orgId, "sub_admin_4", "past_due", { cancelAtPeriodEnd: true });

    // A trial canceled without paying: expired. A paid one canceled: a cancellation.
    const t5 = await setupTenant();
    await paidWebhook(t5.orgId, "sub_admin_5", "trialing", { checkout: true });
    await paidWebhook(t5.orgId, "sub_admin_5", "canceled");

    // A failed payment event (no subscription data; recorded by type only).
    const failed = await fakeWebhookRequest(`${BASE}/api/billing/webhook`, {
      providerEventId: `evt_admin_fail_${++seq}`,
      type: "transaction.payment_failed",
      providerSubscriptionId: "sub_admin_4",
    });
    await worker.fetch(failed);

    const after = await call<ProductAdminMetrics>("/api/admin/metrics", { headers: bearer });
    expect(usd(after) - usd(before)).toBe(9_900 + 8_250 + 9_900);
    expect(after.mrr.subscriptionsCounted - before.mrr.subscriptionsCounted).toBe(3);
    expect(after.mrr.subscriptionsUnpriced - before.mrr.subscriptionsUnpriced).toBe(1);
    expect(after.mrr.source).toBe("paddle_webhook");
    expect(after.trials.converted - before.trials.converted).toBe(1);
    expect(after.trials.expired - before.trials.expired).toBe(1);
    expect(after.cancellations.inWindow - before.cancellations.inWindow).toBe(1);
    expect(after.cancellations.scheduled - before.cancellations.scheduled).toBe(1);
    expect(after.failedPayments.pastDueNow - before.failedPayments.pastDueNow).toBe(1);
    expect(after.failedPayments.inWindow).toBe((before.failedPayments.inWindow ?? 0) + 1);
    expect(after.subscriptions.paid - before.subscriptions.paid).toBe(4);

    const trials = await call<AdminAccountsPage>("/api/admin/accounts?list=trials", {
      headers: bearer,
    });
    expect(trials.items.map((i) => i.orgId)).toEqual(expect.arrayContaining([t1.orgId, t5.orgId]));
    const churn = await call<AdminAccountsPage>("/api/admin/accounts?list=churn", {
      headers: bearer,
    });
    const churnIds = churn.items.map((i) => i.orgId);
    expect(churnIds).toEqual(expect.arrayContaining([t4.orgId, t5.orgId]));
    expect(churnIds).not.toContain(t1.orgId);
    const recent = await call<AdminAccountsPage>("/api/admin/accounts?list=recent&limit=200", {
      headers: bearer,
    });
    expect(recent.items.find((i) => i.orgId === t2.orgId)?.mrr).toEqual({
      currency: "USD",
      amountMinor: 8_250,
    });
    expect(recent.items.find((i) => i.orgId === t3.orgId)?.mrr).toBeNull();
  });

  it("counts sign-ups per day, verified vs not", async () => {
    const before = await call<ProductAdminMetrics>("/api/admin/metrics", { headers: bearer });
    await testDb()
      .insert(user)
      .values({
        id: newId("usr"),
        name: "U",
        email: `${newId("usr")}@example.test`,
        emailVerified: false,
      });
    const after = await call<ProductAdminMetrics>("/api/admin/metrics", { headers: bearer });
    expect(after.signups.total - before.signups.total).toBe(1);
    expect((after.signups.unverified ?? 0) - (before.signups.unverified ?? 0)).toBe(1);
    const today = after.signups.byDay.at(-1);
    expect(today?.total).toBe((before.signups.byDay.at(-1)?.total ?? 0) + 1);
    expect(after.signups.byWeek.at(-1)?.total).toBe((before.signups.byWeek.at(-1)?.total ?? 0) + 1);
  });
});

describe("activation funnel", () => {
  const cohort = (m: ProductAdminMetrics, key: "all" | "window") => {
    const c = m.activation?.cohorts.find((x) => x.key === key);
    if (!c) throw new Error(`no ${key} cohort`);
    return c;
  };
  const step = (c: ReturnType<typeof cohort>, key: string) => {
    const s = c.steps.find((x) => x.key === key);
    if (!s) throw new Error(`no step ${key}`);
    return s;
  };

  it("counts companies per checklist step and where each stalls, from counts only", async () => {
    const before = await call<ProductAdminMetrics>("/api/admin/metrics?days=7", {
      headers: bearer,
    });
    const b = cohort(before, "window");
    expect(b.steps.map((s) => s.key)).toEqual([
      "job",
      "sov",
      "pay-app",
      "send",
      "paid",
      "team",
      "quickbooks",
    ]);

    // Company 1: signed up, tried only the sample job.
    const one = await setupTenant("owner");
    await call(`/api/orgs/${one.orgId}/projects/sample`, {
      method: "POST",
      as: one.userId,
      expect: 201,
    });
    // Company 2: a real job with a schedule of values, no pay application yet.
    const two = await setupTenant("owner");
    const job = await call<{ id: string }>(`/api/orgs/${two.orgId}/projects`, {
      method: "POST",
      as: two.userId,
      expect: 201,
      json: { name: "Secret Clinic", gcName: "Harbor Builders", originalContractSumCents: 900_000 },
    });
    await call(`/api/orgs/${two.orgId}/projects/${job.id}/sov-lines/bulk`, {
      method: "POST",
      as: two.userId,
      expect: 201,
      json: { lines: [{ itemNumber: "1", description: "Work", originalCents: 900_000 }] },
    });

    const res = await api("/api/admin/metrics?days=7", { headers: bearer });
    const text = await res.text();
    // Tenant content never reaches the owner's metrics.
    expect(text).not.toContain("Secret Clinic");
    expect(text).not.toContain("Harbor Builders");
    const after = JSON.parse(text) as ProductAdminMetrics;
    const a = cohort(after, "window");
    expect(a.orgs).toBe(b.orgs + 2);
    expect(cohort(after, "all").orgs).toBe(cohort(before, "all").orgs + 2);
    // The sample job does not count: company 1 stalls on adding a job.
    expect(step(a, "job").stalledHere).toBe((step(b, "job").stalledHere ?? 0) + 1);
    expect(step(a, "job").reached).toBe(step(b, "job").reached + 1);
    expect(step(a, "sov").reached).toBe(step(b, "sov").reached + 1);
    expect(step(a, "pay-app").stalledHere).toBe((step(b, "pay-app").stalledHere ?? 0) + 1);
    expect(step(a, "team").stalledHere).toBeNull();
    expect(a.complete).toBe(b.complete);
    // Every company is complete or stalled on exactly one required step.
    const stalled = a.steps.reduce((n, s) => n + (s.stalledHere ?? 0), 0);
    expect(stalled + a.complete).toBe(a.orgs);
  });
});
