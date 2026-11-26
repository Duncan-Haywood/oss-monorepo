// Billing security review fixes: org binding via signed checkout tokens (no trust in custom_data),
// token one-time use and expiry, customer takeover refusal, out-of-order events, past_due grace.
import { env } from "cloudflare:workers";
import { PAST_DUE_GRACE_DAYS } from "@shared/billing/grace";
import type { BillingOverviewDto } from "@shared/billing/types";
import { createAppContext } from "@worker/context";
import { auditLog, billingEvents, pendingCheckouts, subscriptions } from "@worker/db/schema";
import type { Env } from "@worker/env";
import { AppError } from "@worker/lib/errors";
import { newId } from "@worker/lib/ids";
import { signCheckoutToken } from "@worker/ports/billing/checkout-token";
import { FAKE_SIGNATURE_HEADER, signFakeWebhook } from "@worker/ports/billing/fake";
import { assertCanDraft } from "@worker/services/billing";
import { CHECKOUT_TOKEN_TTL_MS, createPendingCheckout } from "@worker/services/billing/checkout";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { api, setupTenant, testDb } from "./helpers";

const DAY = 86_400_000;
const ctx = (now?: Date) => createAppContext(env as unknown as Env, now ? { now: () => now } : {});

const uid = () => newId("org").slice(4, 14);

async function pending(orgId: string, now?: Date) {
  return createPendingCheckout(ctx(now), {
    orgId,
    planKey: "standard",
    interval: "month",
    createdBy: null,
  });
}

interface EventOpts {
  token?: string | null;
  customData?: Record<string, unknown>;
  type?: string;
  occurredAt?: Date;
  sub: { id: string; customer: string; status?: string; planKey?: string; cancel?: boolean };
}

function event(opts: EventOpts) {
  return {
    providerEventId: `evt_${uid()}`,
    type: opts.type ?? "subscription.updated",
    occurredAt: (opts.occurredAt ?? new Date()).toISOString(),
    customData: opts.customData ?? (opts.token ? { checkoutToken: opts.token } : {}),
    subscription: {
      planKey: opts.sub.planKey ?? "standard",
      status: opts.sub.status ?? "active",
      providerCustomerId: opts.sub.customer,
      providerSubscriptionId: opts.sub.id,
      currentPeriodStart: new Date().toISOString(),
      currentPeriodEnd: new Date(Date.now() + 30 * DAY).toISOString(),
      cancelAtPeriodEnd: opts.sub.cancel ?? false,
    },
  };
}

async function post(body: ReturnType<typeof event>) {
  const raw = JSON.stringify(body);
  const res = await api("/api/billing/webhook", {
    method: "POST",
    body: raw,
    headers: {
      "Content-Type": "application/json",
      [FAKE_SIGNATURE_HEADER]: await signFakeWebhook(raw),
    },
  });
  expect(res.status).toBe(200);
  const out = (await res.json()) as { outcome: string };
  const row = await testDb()
    .select()
    .from(billingEvents)
    .where(eq(billingEvents.providerEventId, body.providerEventId))
    .get();
  return { outcome: out.outcome, row };
}

const subOf = (orgId: string) =>
  testDb().select().from(subscriptions).where(eq(subscriptions.orgId, orgId)).get();

describe("webhook org binding", () => {
  it("crafted custom_data naming another org changes nothing for that org", async () => {
    const victim = await setupTenant();
    const bare = await setupTenant(); // no subscription at all
    // The victim has a live subscription of their own.
    const t = (await pending(victim.orgId)).token;
    const own = { id: `sub_${uid()}`, customer: `ctm_${uid()}` };
    expect((await post(event({ token: t, sub: own }))).outcome).toBe("applied");
    const before = await subOf(victim.orgId);

    const attacker = { id: `sub_${uid()}`, customer: `ctm_${uid()}` };
    for (const target of [victim.orgId, bare.orgId]) {
      const crafted = await post(
        event({
          customData: { orgId: target, planKey: "pro" },
          sub: { ...attacker, status: "canceled" },
        }),
      );
      expect(crafted.outcome).toBe("ignored");
      expect(crafted.row?.orgId).toBeNull();
      expect(crafted.row?.error).toBe("unknown org");
    }

    // A token that names the victim's checkout id but carries a MAC made for another org.
    const victimCheckout = await pending(victim.orgId);
    const forgedSig = (
      await signCheckoutToken("guessed-secret", victimCheckout.id, victim.orgId)
    ).split(".")[1];
    const forged = await post(event({ token: `${victimCheckout.id}.${forgedSig}`, sub: attacker }));
    expect(forged.outcome).toBe("ignored");
    expect(forged.row?.error).toBe("invalid checkout token");
    // Correct secret, but the MAC binds the victim's checkout id to a different org.
    const secret = (env as unknown as Env).AUTH_SECRET ?? "";
    const reboundSig = (await signCheckoutToken(secret, victimCheckout.id, bare.orgId)).split(
      ".",
    )[1];
    const rebound = await post(
      event({ token: `${victimCheckout.id}.${reboundSig}`, sub: attacker }),
    );
    expect(rebound.row?.error).toBe("invalid checkout token");

    expect(await subOf(victim.orgId)).toEqual(before);
    expect(await subOf(bare.orgId)).toBeUndefined();
    const unconsumed = await testDb()
      .select()
      .from(pendingCheckouts)
      .where(eq(pendingCheckouts.id, victimCheckout.id))
      .get();
    expect(unconsumed?.consumedAt).toBeNull();
  });

  it("a valid token creates the subscription and is consumed", async () => {
    const { orgId } = await setupTenant();
    const checkout = await pending(orgId);
    const sub = { id: `sub_${uid()}`, customer: `ctm_${uid()}` };
    const occurredAt = new Date(Date.now() - 60_000);
    const res = await post(
      event({ token: checkout.token, type: "subscription.created", occurredAt, sub }),
    );
    expect(res.outcome).toBe("applied");
    expect(res.row?.orgId).toBe(orgId);
    expect(res.row?.occurredAt).toEqual(occurredAt);
    const row = await subOf(orgId);
    expect(row).toMatchObject({
      planKey: "standard",
      status: "active",
      providerCustomerId: sub.customer,
      providerSubscriptionId: sub.id,
      providerUpdatedAt: occurredAt,
      pastDueSince: null,
    });
    const pco = await testDb()
      .select()
      .from(pendingCheckouts)
      .where(eq(pendingCheckouts.id, checkout.id))
      .get();
    expect(pco?.consumedAt).toBeTruthy();
    expect(pco?.providerSubscriptionId).toBe(sub.id);
    // Later events for the subscription resolve the org from the subscription row.
    const later = await post(event({ sub: { ...sub, cancel: true } }));
    expect(later.outcome).toBe("applied");
    expect((await subOf(orgId))?.cancelAtPeriodEnd).toBe(true);
  });

  it("token replay and expired tokens are ignored", async () => {
    const a = await setupTenant();
    const { token } = await pending(a.orgId);
    const customer = `ctm_${uid()}`;
    const first = { id: `sub_${uid()}`, customer };
    expect((await post(event({ token, sub: first }))).outcome).toBe("applied");
    // Same token, a second subscription (a second checkout reusing the leaked token).
    const replay = await post(
      event({ token, sub: { id: `sub_${uid()}`, customer, planKey: "pro" } }),
    );
    expect(replay.outcome).toBe("ignored");
    expect(replay.row?.error).toBe("checkout token replay");
    expect(await subOf(a.orgId)).toMatchObject({
      providerSubscriptionId: first.id,
      planKey: "standard",
    });

    const b = await setupTenant();
    const stale = await pending(b.orgId, new Date(Date.now() - CHECKOUT_TOKEN_TTL_MS - 60_000));
    const expired = await post(
      event({ token: stale.token, sub: { id: `sub_${uid()}`, customer: `ctm_${uid()}` } }),
    );
    expect(expired.outcome).toBe("ignored");
    expect(expired.row?.error).toBe("expired checkout token");
    expect(await subOf(b.orgId)).toBeUndefined();
  });

  it("refuses to overwrite an org's subscription with another provider customer (audited)", async () => {
    const { orgId } = await setupTenant();
    const original = { id: `sub_${uid()}`, customer: `ctm_${uid()}` };
    await post(event({ token: (await pending(orgId)).token, sub: original }));
    const second = await pending(orgId);
    const takeover = await post(
      event({ token: second.token, sub: { id: `sub_${uid()}`, customer: `ctm_${uid()}` } }),
    );
    expect(takeover.outcome).toBe("ignored");
    expect(takeover.row?.error).toBe("customer mismatch");
    expect(takeover.row?.orgId).toBe(orgId);
    expect(await subOf(orgId)).toMatchObject({
      providerSubscriptionId: original.id,
      providerCustomerId: original.customer,
    });
    const audits = await testDb()
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.orgId, orgId), eq(auditLog.action, "billing.subscription_conflict")))
      .all();
    expect(audits).toHaveLength(1);
    // The refused event did not burn the checkout token.
    const pco = await testDb()
      .select()
      .from(pendingCheckouts)
      .where(eq(pendingCheckouts.id, second.id))
      .get();
    expect(pco?.consumedAt).toBeNull();
  });

  it("POST /checkout records a pending checkout for the org and admin", async () => {
    const { orgId, userId } = await setupTenant();
    const before = Date.now();
    const res = await api(`/api/orgs/${orgId}/billing/checkout`, {
      method: "POST",
      as: userId,
      json: { planKey: "pro", interval: "year" },
    });
    expect(res.status).toBe(200);
    const rows = await testDb()
      .select()
      .from(pendingCheckouts)
      .where(eq(pendingCheckouts.orgId, orgId))
      .all();
    expect(rows).toHaveLength(1);
    const [row] = rows;
    expect(row).toMatchObject({ planKey: "pro", interval: "year", createdBy: userId });
    expect(row?.expiresAt.getTime()).toBeGreaterThanOrEqual(before + CHECKOUT_TOKEN_TTL_MS - 1000);
    // Offline demo activates the plan immediately and consumes the checkout.
    expect(row?.consumedAt).toBeTruthy();
    expect(row?.providerSubscriptionId).toBe((await subOf(orgId))?.providerSubscriptionId);
  });
});

describe("webhook event ordering", () => {
  it("out-of-order deliveries leave the newest state in place", async () => {
    const { orgId } = await setupTenant();
    const { token } = await pending(orgId);
    const sub = { id: `sub_${uid()}`, customer: `ctm_${uid()}` };
    const t0 = new Date(Date.now() - 3 * 60_000);
    const t1 = new Date(t0.getTime() + 60_000);
    const t2 = new Date(t1.getTime() + 60_000);
    const created = event({ token, type: "subscription.created", occurredAt: t0, sub });
    const pastDue = event({ token, occurredAt: t1, sub: { ...sub, status: "past_due" } });
    const renewed = event({ token, occurredAt: t2, sub: { ...sub, cancel: true } });

    // Delivered newest first: the newest binds the org via the token, the older two are stale.
    expect((await post(renewed)).outcome).toBe("applied");
    const late1 = await post(created);
    const late2 = await post(pastDue);
    expect([late1.outcome, late2.outcome]).toEqual(["ignored", "ignored"]);
    expect(late1.row?.error).toBe("out-of-order event");
    expect(late2.row?.occurredAt).toEqual(t1);
    expect(await subOf(orgId)).toMatchObject({
      status: "active",
      cancelAtPeriodEnd: true,
      providerUpdatedAt: t2,
      pastDueSince: null,
    });

    // A newer event still applies; a stale cancel of an older subscription never does.
    const t3 = new Date(t2.getTime() + 60_000);
    expect((await post(event({ occurredAt: t3, sub: { ...sub, status: "paused" } }))).outcome).toBe(
      "applied",
    );
    expect((await subOf(orgId))?.status).toBe("paused");
  });
});

describe("past_due grace period", () => {
  it(`keeps drafting for ${PAST_DUE_GRACE_DAYS} days from the first past_due event, then blocks`, async () => {
    const { orgId, userId } = await setupTenant();
    const { token } = await pending(orgId);
    const sub = { id: `sub_${uid()}`, customer: `ctm_${uid()}` };
    const firstFailure = new Date(Date.now() - 2 * DAY);
    await post(event({ token, occurredAt: new Date(Date.now() - 10 * DAY), sub }));
    await post(event({ occurredAt: firstFailure, sub: { ...sub, status: "past_due" } }));
    // A later retry failure does not restart the grace period.
    await post(
      event({ occurredAt: new Date(Date.now() - DAY), sub: { ...sub, status: "past_due" } }),
    );
    expect((await subOf(orgId))?.pastDueSince).toEqual(firstFailure);

    const graceUntil = new Date(firstFailure.getTime() + PAST_DUE_GRACE_DAYS * DAY);
    expect((await assertCanDraft(ctx(), orgId)).planKey).toBe("standard");
    const overview = (await (
      await api(`/api/orgs/${orgId}/billing`, { as: userId })
    ).json()) as BillingOverviewDto;
    expect(overview.status).toBe("past_due");
    expect(overview.active).toBe(true);
    expect(overview.graceUntil).toBe(graceUntil.toISOString());

    const after = ctx(new Date(graceUntil.getTime() + 1000));
    const err = await assertCanDraft(after, orgId).then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).status).toBe(402);

    // Payment recovers: grace cleared, banner gone.
    await post(event({ occurredAt: new Date(), sub }));
    expect((await subOf(orgId))?.pastDueSince).toBeNull();
    const recovered = (await (
      await api(`/api/orgs/${orgId}/billing`, { as: userId })
    ).json()) as BillingOverviewDto;
    expect(recovered.graceUntil).toBeNull();
    expect(recovered.active).toBe(true);
  });
});
