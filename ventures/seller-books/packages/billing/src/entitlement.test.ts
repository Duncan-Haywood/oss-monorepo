import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checkQuota, resolveEntitlement, type SubscriptionSnapshot } from "./entitlement.ts";
import { definePlanCatalog } from "./pricing.ts";

const catalog = definePlanCatalog([
  { key: "comp", priceCents: 0, annualPriceCents: null, purchasable: false, drafts: 25 },
  { key: "starter", priceCents: 500, annualPriceCents: 5_400, purchasable: true, drafts: 1 },
]);
const comp = catalog.get("comp") ?? undefined;
const now = new Date("2026-11-24T12:00:00Z");
const opts = { getPlan: catalog.get, now, compPlan: comp };
const sub = (over: Partial<SubscriptionSnapshot> = {}): SubscriptionSnapshot => ({
  planKey: "starter",
  status: "active",
  currentPeriodStart: new Date("2026-10-20T00:00:00Z"),
  pastDueSince: null,
  ...over,
});

describe("resolveEntitlement", () => {
  it("active / trialing / comp subscriptions are entitled; quota period follows the anniversary", () => {
    const e = resolveEntitlement(sub(), opts);
    assert.equal(e.active, true);
    assert.equal(e.plan?.drafts, 1);
    assert.equal(e.periodKey, "2026-11");
    assert.equal(e.blockedReason, null);
    assert.equal(resolveEntitlement(sub({ status: "trialing" }), opts).active, true);
    const c = resolveEntitlement(
      sub({ planKey: "legacy", status: "comp", currentPeriodStart: null }),
      opts,
    );
    assert.equal(c.active, true);
    assert.equal(c.plan?.key, "comp");
  });

  it("no subscription: blocked, unless the offline demo grants a plan", () => {
    const none = resolveEntitlement(null, opts);
    assert.deepEqual(
      [none.status, none.active, none.blockedReason],
      ["none", false, "no_subscription"],
    );
    const demo = resolveEntitlement(null, { ...opts, demoPlan: comp });
    assert.deepEqual([demo.status, demo.active, demo.plan?.key], ["comp", true, "comp"]);
  });

  it("past_due keeps access during grace (with graceUntil), then blocks", () => {
    const inGrace = resolveEntitlement(
      sub({ status: "past_due", pastDueSince: new Date("2026-11-20T00:00:00Z") }),
      opts,
    );
    assert.equal(inGrace.active, true);
    assert.deepEqual(inGrace.graceUntil, new Date("2026-11-27T00:00:00Z"));
    const ended = resolveEntitlement(
      sub({ status: "past_due", pastDueSince: new Date("2026-11-01T00:00:00Z") }),
      opts,
    );
    assert.deepEqual([ended.active, ended.blockedReason], [false, "grace_ended"]);
    assert.equal(resolveEntitlement(sub({ status: "past_due" }), opts).active, false);
  });

  it("paused / canceled and unknown plans are blocked", () => {
    assert.equal(resolveEntitlement(sub({ status: "canceled" }), opts).blockedReason, "inactive");
    assert.equal(resolveEntitlement(sub({ status: "paused" }), opts).active, false);
    assert.equal(resolveEntitlement(sub({ planKey: "gone" }), opts).blockedReason, "unknown_plan");
  });
});

describe("checkQuota", () => {
  it("computes remaining and whether the request fits", () => {
    assert.deepEqual(checkQuota(5, 4), { used: 4, limit: 5, remaining: 1, allowed: true });
    assert.equal(checkQuota(5, 5).allowed, false);
    assert.equal(checkQuota(5, 7).remaining, 0);
    assert.equal(checkQuota(5, 3, 3).allowed, false);
  });
});
