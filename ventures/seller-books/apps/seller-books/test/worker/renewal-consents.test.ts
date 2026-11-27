// Proof of automatic-renewal consent (services/billing/renewal-consents.ts): copied when a checkout
// becomes a subscription, kept after the shop is deleted, given its retention date when the
// subscription ends (three years from consent or one year after the end, whichever is later), and
// deleted by the daily run only once that date has passed.
import { env } from "cloudflare:workers";
import { fakeWebhookRequest, signCheckoutToken } from "@billing";
import { RENEWAL_TERMS_VERSION } from "@shared/renewal-notice";
import { createAppContext } from "@worker/context";
import { pendingCheckouts, renewalConsents, subscriptions } from "@worker/db/schema";
import type { Env } from "@worker/env";
import { consentKeepUntil, purgeRenewalConsents } from "@worker/services/billing/renewal-consents";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { api, BASE, setupTenant, testDb, worker } from "./helpers";

const TEST_AUTH_SECRET = "test-secret-test-secret-test-secret-0123456789";
type Tenant = Awaited<ReturnType<typeof setupTenant>>;
const path = (t: Tenant, p = "") => `/api/orgs/${t.orgId}${p}`;

async function checkout(t: Tenant, plan = "side", interval = "year") {
  const res = await api(path(t, "/billing/checkout"), {
    method: "POST",
    as: t.userId,
    json: { plan, interval, renewalConsent: true },
  });
  expect(res.status).toBe(200);
  const [pending] = await testDb()
    .select()
    .from(pendingCheckouts)
    .where(eq(pendingCheckouts.orgId, t.orgId))
    .all();
  if (!pending) throw new Error("no pending checkout");
  return pending;
}

async function webhook(body: Parameters<typeof fakeWebhookRequest>[1]) {
  const res = await worker.fetch(await fakeWebhookRequest(`${BASE}/api/billing/webhook`, body));
  expect(res.status).toBe(200);
}

const subBody = (t: Tenant, status: "active" | "canceled", cancelAtPeriodEnd = false) => ({
  planKey: "side",
  status,
  providerCustomerId: `ctm_${t.orgId}`,
  providerSubscriptionId: `sub_${t.orgId}`,
  currentPeriodStart: "2026-11-01T00:00:00Z",
  currentPeriodEnd: "2027-11-01T00:00:00Z",
  cancelAtPeriodEnd,
});

async function subscribe(t: Tenant) {
  const pending = await checkout(t);
  const token = await signCheckoutToken(TEST_AUTH_SECRET, pending.id, t.orgId);
  const created = {
    providerEventId: `evt_created_${t.orgId}`,
    type: "subscription.created",
    occurredAt: "2026-11-01T00:00:00Z",
    customData: { checkoutToken: token },
    subscription: subBody(t, "active"),
  };
  await webhook(created);
  return { pending, token, created };
}

const consentRows = (t: Tenant) =>
  testDb().select().from(renewalConsents).where(eq(renewalConsents.orgId, t.orgId)).all();

const purgeAt = (iso: string) =>
  purgeRenewalConsents(createAppContext(env as unknown as Env, { now: () => new Date(iso) }));

describe("consentKeepUntil", () => {
  it("is three years from consent, or one year after the end when that is later", () => {
    const consent = new Date("2026-11-27T10:00:00Z");
    expect(consentKeepUntil(consent, new Date("2027-03-01T00:00:00Z")).toISOString()).toBe(
      "2029-11-27T10:00:00.000Z",
    );
    expect(consentKeepUntil(consent, new Date("2029-06-30T00:00:00Z")).toISOString()).toBe(
      "2030-06-30T00:00:00.000Z",
    );
  });

  it("a February 29 lands on March 1, never earlier", () => {
    const leap = new Date("2028-02-29T00:00:00Z");
    expect(consentKeepUntil(leap, leap).toISOString()).toBe("2031-03-01T00:00:00.000Z");
  });
});

describe("renewal consent records", () => {
  it("are copied once when the checkout becomes a subscription", async () => {
    const t = await setupTenant("owner", null);
    const { pending, created } = await subscribe(t);
    await webhook({ ...created, providerEventId: `evt_retry_${t.orgId}` }); // a redelivery
    const rows = await consentRows(t);
    expect(rows).toHaveLength(1);
    const [row] = rows;
    expect(row?.checkoutId).toBe(pending.id);
    expect(row?.termsVersion).toBe(RENEWAL_TERMS_VERSION);
    expect(row?.consentedAt.getTime()).toBe(pending.renewalConsentAt?.getTime());
    expect(row?.providerSubscriptionId).toBe(`sub_${t.orgId}`);
    expect(row?.providerCustomerId).toBe(`ctm_${t.orgId}`);
    expect([row?.planKey, row?.interval]).toEqual(["side", "year"]);
    expect(row?.endedAt).toBeNull();
    expect(row?.keepUntil).toBeNull();
  });

  it("a started checkout that never became a subscription leaves no record", async () => {
    const t = await setupTenant("owner", null);
    await checkout(t);
    expect(await consentRows(t)).toHaveLength(0);
  });

  it("get their retention date when the subscription is canceled", async () => {
    const t = await setupTenant("owner", null);
    const { pending } = await subscribe(t);
    await webhook({
      providerEventId: `evt_canceled_${t.orgId}`,
      type: "subscription.canceled",
      occurredAt: "2027-02-01T00:00:00Z",
      subscription: subBody(t, "canceled"),
    });
    const [row] = await consentRows(t);
    expect(row?.endedAt?.toISOString()).toBe("2027-02-01T00:00:00.000Z");
    const consent = pending.renewalConsentAt ?? new Date(0);
    expect(row?.keepUntil?.getTime()).toBe(
      consentKeepUntil(consent, new Date("2027-02-01T00:00:00Z")).getTime(),
    );
  });

  it("outlive the shop: deleting it after cancelling ends the record at the paid period's end", async () => {
    const t = await setupTenant("owner", null);
    const { pending } = await subscribe(t);
    await webhook({
      providerEventId: `evt_cancel_at_end_${t.orgId}`,
      type: "subscription.updated",
      occurredAt: "2026-11-02T00:00:00Z",
      subscription: subBody(t, "active", true),
    });
    const res = await api(path(t), {
      method: "DELETE",
      as: t.userId,
      json: { confirmName: "Test Shop" },
    });
    expect(res.status).toBe(200);
    expect(
      await testDb().select().from(subscriptions).where(eq(subscriptions.orgId, t.orgId)).all(),
    ).toHaveLength(0);
    expect(
      await testDb()
        .select()
        .from(pendingCheckouts)
        .where(eq(pendingCheckouts.orgId, t.orgId))
        .all(),
    ).toHaveLength(0);
    const [row] = await consentRows(t);
    // The plan runs to 2027-11-01, so the contract ends then, not on the day of deletion.
    expect(row?.endedAt?.toISOString()).toBe("2027-11-01T00:00:00.000Z");
    expect(row?.keepUntil?.getTime()).toBe(
      consentKeepUntil(
        pending.renewalConsentAt ?? new Date(0),
        new Date("2027-11-01T00:00:00Z"),
      ).getTime(),
    );
  });

  it("are deleted by the daily run only after their retention date", async () => {
    const ended = await setupTenant("owner", null);
    await subscribe(ended);
    await webhook({
      providerEventId: `evt_end_${ended.orgId}`,
      type: "subscription.canceled",
      occurredAt: "2027-02-01T00:00:00Z",
      subscription: subBody(ended, "canceled"),
    });
    const running = await setupTenant("owner", null);
    await subscribe(running);
    const [row] = await consentRows(ended);
    const keepUntil = row?.keepUntil ?? new Date(0);

    await purgeAt(new Date(keepUntil.getTime() - 1000).toISOString());
    expect(await consentRows(ended)).toHaveLength(1);
    await purgeAt(new Date(keepUntil.getTime() + 1000).toISOString());
    expect(await consentRows(ended)).toHaveLength(0);
    // A subscription that has not ended is never purged, however late the run.
    await purgeAt("2099-01-01T00:00:00Z");
    expect(await consentRows(running)).toHaveLength(1);
  });
});
