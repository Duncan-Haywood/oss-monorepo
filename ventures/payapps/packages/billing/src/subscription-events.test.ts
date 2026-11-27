import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ProviderSubscription } from "./provider.ts";
import {
  decideSubscriptionUpdate,
  isNewPaidSubscription,
  nextLifecycleStamps,
  type StoredSubscription,
} from "./subscription-events.ts";

const now = new Date("2026-11-24T00:00:00Z");
const t = (iso: string) => new Date(iso);
const isPurchasable = (k: string) => k === "starter" || k === "pro";
const opts = { isPurchasable, now };

const s = (over: Partial<ProviderSubscription> = {}): ProviderSubscription => ({
  planKey: "starter",
  status: "active",
  providerCustomerId: "ctm_1",
  providerSubscriptionId: "sub_1",
  currentPeriodStart: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  ...over,
});
const row = (over: Partial<StoredSubscription> = {}): StoredSubscription => ({
  status: "active",
  providerCustomerId: "ctm_1",
  providerSubscriptionId: "sub_1",
  providerUpdatedAt: t("2026-11-20T00:00:00Z"),
  pastDueSince: null,
  ...over,
});

describe("decideSubscriptionUpdate", () => {
  it("applies a first event and sets the watermark", () => {
    const d = decideSubscriptionUpdate(
      null,
      { subscription: s(), occurredAt: t("2026-11-21T00:00:00Z") },
      opts,
    );
    assert.deepEqual(d, {
      apply: true,
      subscription: s(),
      providerUpdatedAt: t("2026-11-21T00:00:00Z"),
      pastDueSince: null,
    });
  });

  it("ignores events without subscription data and plans webhooks may not grant", () => {
    assert.deepEqual(decideSubscriptionUpdate(null, { occurredAt: null }, opts), {
      apply: false,
      reason: "no subscription data",
    });
    assert.deepEqual(
      decideSubscriptionUpdate(
        null,
        { subscription: s({ planKey: "comp" }), occurredAt: null },
        opts,
      ),
      {
        apply: false,
        reason: "unknown plan",
      },
    );
  });

  it("never lets another provider customer take over the org's subscription", () => {
    const d = decideSubscriptionUpdate(
      row(),
      { subscription: s({ providerCustomerId: "ctm_evil" }), occurredAt: now },
      opts,
    );
    assert.deepEqual(d, { apply: false, reason: "customer mismatch" });
  });

  it("drops out-of-order and stale events", () => {
    const older = t("2026-11-19T00:00:00Z");
    assert.deepEqual(
      decideSubscriptionUpdate(row(), { subscription: s(), occurredAt: older }, opts),
      {
        apply: false,
        reason: "out-of-order event",
      },
    );
    assert.deepEqual(
      decideSubscriptionUpdate(
        row(),
        { subscription: s({ providerSubscriptionId: "sub_0" }), occurredAt: older },
        opts,
      ),
      { apply: false, reason: "stale subscription" },
    );
    // A late cancel of an old subscription must not wipe a comp grant or a newer subscription.
    const cancelOld = {
      subscription: s({ providerSubscriptionId: "sub_0", status: "canceled" as const }),
      occurredAt: now,
    };
    assert.equal(decideSubscriptionUpdate(row(), cancelOld, opts).apply, false);
    const comp = row({
      status: "comp",
      providerCustomerId: null,
      providerSubscriptionId: null,
      providerUpdatedAt: null,
    });
    assert.equal(
      decideSubscriptionUpdate(
        comp,
        { subscription: s({ status: "canceled" }), occurredAt: now },
        opts,
      ).apply,
      false,
    );
    // ...but a new purchase on top of comp applies.
    assert.equal(
      decideSubscriptionUpdate(comp, { subscription: s(), occurredAt: now }, opts).apply,
      true,
    );
  });

  it("an event without a timestamp keeps the watermark; past_due grace starts once", () => {
    const d1 = decideSubscriptionUpdate(
      row(),
      { subscription: s({ status: "past_due" }), occurredAt: null },
      opts,
    );
    assert.ok(d1.apply);
    assert.deepEqual(d1.providerUpdatedAt, t("2026-11-20T00:00:00Z"));
    assert.deepEqual(d1.pastDueSince, now);
    const since = t("2026-11-21T00:00:00Z");
    const d2 = decideSubscriptionUpdate(
      row({ status: "past_due", pastDueSince: since }),
      { subscription: s({ status: "past_due" }), occurredAt: t("2026-11-23T00:00:00Z") },
      opts,
    );
    assert.ok(d2.apply);
    assert.deepEqual(d2.pastDueSince, since);
    const d3 = decideSubscriptionUpdate(
      row({ status: "past_due", pastDueSince: since }),
      { subscription: s(), occurredAt: now },
      opts,
    );
    assert.ok(d3.apply);
    assert.equal(d3.pastDueSince, null);
  });
});

describe("nextLifecycleStamps", () => {
  const at = t("2026-11-25T00:00:00Z");
  const earlier = t("2026-11-01T00:00:00Z");

  it("stamps a trial start, a first payment and a cancel once each", () => {
    assert.deepEqual(nextLifecycleStamps(null, "trialing", at), {
      trialStartedAt: at,
      firstPaidAt: null,
      canceledAt: null,
    });
    const converted = nextLifecycleStamps({ trialStartedAt: earlier }, "active", at);
    assert.deepEqual(converted, { trialStartedAt: earlier, firstPaidAt: at, canceledAt: null });
    const canceled = nextLifecycleStamps(converted, "canceled", t("2026-12-01T00:00:00Z"));
    assert.equal(canceled.firstPaidAt, at);
    assert.equal(canceled.canceledAt?.toISOString(), "2026-12-01T00:00:00.000Z");
    // A redelivered cancel keeps the first cancel time; a re-subscription clears it.
    assert.equal(
      nextLifecycleStamps(canceled, "canceled", t("2027-01-01T00:00:00Z")).canceledAt,
      canceled.canceledAt,
    );
    assert.equal(
      nextLifecycleStamps(canceled, "active", t("2027-01-01T00:00:00Z")).canceledAt,
      null,
    );
  });

  it("never back-fills: an active row with no stamps gets firstPaidAt only from this event", () => {
    assert.equal(nextLifecycleStamps({}, "past_due", at).firstPaidAt, null);
    assert.equal(nextLifecycleStamps({}, "past_due", at).trialStartedAt, null);
  });
});

describe("isNewPaidSubscription", () => {
  const next = { status: "active", providerSubscriptionId: "sub_1" };
  it("is true for a first payment, a trial converting and a re-subscription", () => {
    assert.equal(isNewPaidSubscription(null, next), true);
    assert.equal(
      isNewPaidSubscription({ status: "trialing", providerSubscriptionId: "sub_1" }, next),
      true,
    );
    assert.equal(
      isNewPaidSubscription({ status: "canceled", providerSubscriptionId: "sub_0" }, next),
      true,
    );
    assert.equal(
      isNewPaidSubscription({ status: "comp", providerSubscriptionId: null }, next),
      true,
    );
  });
  it("is false for renewals, recoveries from past_due and non-active events", () => {
    assert.equal(
      isNewPaidSubscription({ status: "active", providerSubscriptionId: "sub_1" }, next),
      false,
    );
    assert.equal(
      isNewPaidSubscription({ status: "past_due", providerSubscriptionId: "sub_1" }, next),
      false,
    );
    assert.equal(isNewPaidSubscription(null, { ...next, status: "trialing" }), false);
  });
});
