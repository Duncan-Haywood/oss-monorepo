import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  type Charge,
  fullMonthlyCost,
  hostingMicros,
  llmCostMicros,
  markup,
  merchantFeeMicros,
  tokens,
} from "./cost-model.ts";
import {
  checkoutPriceKey,
  missingPriceIds,
  parseCheckoutPriceKey,
  parsePriceIds,
} from "./price-keys.ts";
import {
  annualPriceFor,
  assertPricingBand,
  type BillablePlan,
  checkPricingBand,
  definePlanCatalog,
  deriveLargestQuota,
  MAX_MARKUP,
  MIN_MARKUP,
} from "./pricing.ts";

// Parity fixture: apps/grants' cost model (src/shared/billing/cost-model.ts) rebuilt on this
// package's generic primitives. It must reproduce the numbers in apps/grants/docs/PRICING.md.
const STAGE = {
  requirementsParse: tokens(12_000, 2_500),
  sectionDraftFirst: tokens(3_500, 2_500, 0, 17_000),
  sectionDraftCached: tokens(3_500, 2_500, 17_000, 0),
  summary: tokens(9_000, 1_200),
  groundingVerify: tokens(7_500, 1_800),
  matchScore: tokens(1_500, 450, 4_000, 200),
  factExtractPage: tokens(900, 450, 1_500, 75),
  interviewTurn: tokens(1_800, 400, 3_000, 150),
};
// Grants runs on Haiku 5.5 (the cheapest model that does the job; owner, 2026-11-24).
const c = (k: keyof typeof STAGE) => llmCostMicros(STAGE[k], "claude-haiku-5-5");
const SECTIONS = 6;
const REVISION = 1.3;
const perDraft =
  c("requirementsParse") +
  Math.round((c("sectionDraftFirst") + (SECTIONS - 1) * c("sectionDraftCached")) * REVISION) +
  c("summary") +
  Math.round(SECTIONS * c("groundingVerify") * REVISION);

interface GrantsPlan extends BillablePlan {
  drafts: number;
  scores: number;
  pages: number;
  turns: number;
}
type Spec = Omit<GrantsPlan, "drafts" | "annualPriceCents" | "purchasable"> & { offer: number };

const costAt = (
  p: Omit<GrantsPlan, "drafts" | "key" | "purchasable" | "annualPriceCents">,
  drafts: number,
  ch: Charge,
) =>
  fullMonthlyCost(
    {
      variableMicros:
        drafts * perDraft +
        p.scores * c("matchScore") +
        p.pages * c("factExtractPage") +
        p.turns * c("interviewTurn"),
      hostingMicros: hostingMicros(drafts),
    },
    ch,
  ).totalMicros;

const build = (spec: Spec): GrantsPlan => {
  const annualPriceCents = annualPriceFor(spec.priceCents);
  const charges: Charge[] = [
    { cents: spec.priceCents, interval: "month" },
    { cents: annualPriceCents, interval: "year" },
  ];
  return {
    ...spec,
    annualPriceCents,
    purchasable: true,
    // The plan's chosen allowance, capped at what the cost model allows at the quota margin.
    drafts: Math.min(
      spec.offer,
      deriveLargestQuota(charges, (q, ch) => costAt(spec, q, ch)),
    ),
  };
};

const catalog = definePlanCatalog<GrantsPlan>([
  {
    key: "comp",
    priceCents: 0,
    annualPriceCents: null,
    purchasable: false,
    drafts: 25,
    scores: 500,
    pages: 500,
    turns: 200,
  },
  build({ key: "starter", priceCents: 1_000, offer: 5, scores: 20, pages: 25, turns: 15 }),
  build({ key: "standard", priceCents: 2_900, offer: 20, scores: 100, pages: 100, turns: 40 }),
  build({ key: "pro", priceCents: 14_900, offer: 120, scores: 400, pages: 400, turns: 150 }),
]);
const costFor = (p: GrantsPlan, ch: Charge) => costAt(p, p.drafts, ch);

describe("pricing band (at least a 40% margin over the fully loaded cost)", () => {
  it("reproduces apps/grants' derived quotas, annual prices and markups (PRICING.md table)", () => {
    assert.equal(perDraft > 30_000 && perDraft < 36_000, true, `per draft ${perDraft}`);
    assert.deepEqual(
      catalog.purchasable.map((p) => [p.key, p.annualPriceCents, p.drafts]),
      [
        ["starter", 10_800, 5],
        ["standard", 31_300, 20],
        ["pro", 160_900, 120],
      ],
    );
    const table = checkPricingBand(catalog.plans, costFor).map(
      (r) => `${r.planKey}:${r.interval}:${r.markup.toFixed(2)}`,
    );
    assert.deepEqual(table, [
      "starter:month:5.44",
      "starter:year:6.92",
      "standard:month:7.11",
      "standard:year:7.70",
      "pro:month:8.15",
      "pro:year:8.07",
    ]);
    // Full cost/mo column: $1.84 / $4.08 / $18.28.
    const monthly = catalog.purchasable.map((p) =>
      (costFor(p, { cents: p.priceCents, interval: "month" }) / 1e6).toFixed(2),
    );
    assert.deepEqual(monthly, ["1.84", "4.08", "18.28"]);
  });

  it("assertPricingBand passes for every purchasable plan and skips comp", () => {
    const checks = assertPricingBand(catalog.plans, costFor);
    assert.equal(checks.length, 6);
    for (const r of checks) {
      assert.ok(r.markup >= MIN_MARKUP && r.markup <= MAX_MARKUP, `${r.planKey} ${r.interval}`);
    }
  });

  it("fails loudly when a plan drifts below the 40% margin floor", () => {
    const starter = catalog.get("starter");
    assert.ok(starter);
    assert.throws(
      () => assertPricingBand([{ ...starter, drafts: 200 }], costFor),
      /starter \(month\): \d\.\d\d× \(-?\d+% margin\) outside \[1\.67×, Infinity×\]/,
    );
    // No ceiling: a plan priced far above cost passes.
    assert.equal(assertPricingBand([{ ...starter, priceCents: 50_000 }], costFor).length, 2);
    assert.throws(() => assertPricingBand([], costFor), /no purchasable plans/);
  });

  it("tiers are monotonic: more money buys more units at a lower unit price", () => {
    const [s, st, p] = catalog.purchasable;
    assert.ok(s && st && p);
    assert.ok(s.drafts < st.drafts && st.drafts < p.drafts);
    const unit = (x: GrantsPlan) => x.priceCents / x.drafts;
    assert.ok(unit(st) <= unit(s) && unit(p) <= unit(st));
  });
});

describe("cost model primitives", () => {
  it("MoR fee is 5% + $0.50 per charge; annual billing spreads fee and reserve over 12 months", () => {
    assert.equal(merchantFeeMicros(500), 750_000);
    assert.equal(merchantFeeMicros(0), 0);
    const m = fullMonthlyCost(
      { variableMicros: 1_000_000, hostingMicros: 300_000 },
      { cents: 500, interval: "month" },
    );
    const y = fullMonthlyCost(
      { variableMicros: 1_000_000, hostingMicros: 300_000 },
      { cents: 5_400, interval: "year" },
    );
    assert.ok(y.merchantFeeMicros < m.merchantFeeMicros);
    assert.equal(
      m.variableMicros + m.hostingMicros + m.merchantFeeMicros + m.refundReserveMicros,
      m.totalMicros,
    );
    assert.equal(m.refundReserveMicros, 150_000);
  });

  it("prices tokens per model; unknown models are priced as Opus 5.5", () => {
    const u = tokens(1_000_000, 1_000_000, 1_000_000, 1_000_000);
    assert.equal(llmCostMicros(u), 29_200_000);
    assert.equal(llmCostMicros(u, "claude-haiku-5-5"), 735_000);
    assert.equal(llmCostMicros(u, "not-a-model"), llmCostMicros(u));
    assert.equal(markup({ cents: 1_200, interval: "year" }, 50_000), 20);
  });

  it("deriveLargestQuota returns 0 when even one unit is unprofitable", () => {
    assert.equal(
      deriveLargestQuota([{ cents: 100, interval: "month" }], (q) => q * 10_000_000),
      0,
    );
  });

  it("catalog rejects duplicate keys and ':' in keys", () => {
    const p = { key: "a", priceCents: 1, annualPriceCents: null, purchasable: true };
    assert.throws(() => definePlanCatalog([p, p]), /duplicate/);
    assert.throws(() => definePlanCatalog([{ ...p, key: "a:annual" }]), /must not contain/);
    assert.equal(catalog.isPurchasable("comp"), false);
    assert.deepEqual(catalog.purchasableKeys, ["starter", "standard", "pro"]);
    assert.equal(catalog.get(undefined), null);
  });
});

describe("price keys", () => {
  it("round-trips plan + interval and honours the purchasable allow-list", () => {
    assert.deepEqual(parseCheckoutPriceKey(checkoutPriceKey("starter", "year")), {
      planKey: "starter",
      interval: "year",
    });
    assert.deepEqual(parseCheckoutPriceKey("pro"), { planKey: "pro", interval: "month" });
    assert.equal(parseCheckoutPriceKey("comp", catalog.purchasableKeys), null);
    assert.equal(parseCheckoutPriceKey("pro:weekly"), null);
    assert.equal(parseCheckoutPriceKey("pro:annual:x"), null);
  });

  it("parses BILLING_PRICE_IDS defensively and reports missing ids", () => {
    assert.deepEqual(parsePriceIds('{"starter":"pri_1","bad":3,"empty":""}'), { starter: "pri_1" });
    for (const bad of [undefined, "", "nope", "[1]", "null"])
      assert.deepEqual(parsePriceIds(bad), {});
    assert.deepEqual(missingPriceIds({ starter: "pri_1" }, catalog.purchasable), [
      "starter:annual",
      "standard",
      "standard:annual",
      "pro",
      "pro:annual",
    ]);
  });
});
