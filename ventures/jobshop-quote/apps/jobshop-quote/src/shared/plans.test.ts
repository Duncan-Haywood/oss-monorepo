// Pricing guards. The margin test fails CI if a paid plan drops below the 40% floor (owner,
// 2026-11-24) with the shop spending its whole AI ceiling; the parity test keeps the app's plans
// identical to what the marketing site's pricing page proposes; the catalog test keeps
// billing/paddle-catalog.json (synced to Paddle by packages/billing/scripts/paddle-catalog.ts) in
// step with PLAN_LIST. Regenerate it with:
//   UPDATE_PADDLE_CATALOG=1 pnpm exec vitest run --config vitest.unit.config.ts src/shared/plans.test.ts
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { assertPricingBand, catalogFromPlans, fullMonthlyCost, hostingMicros } from "@billing";
import { describe, expect, it } from "vitest";
import {
  EARLY_ACCESS_PLAN as SITE_EARLY_ACCESS,
  PLANS as SITE_PLANS,
} from "../../../jobshop-site/src/shared/plans";
import { catalog, FREE_PLAN, PLAN_LIST, type Plan } from "./plans";

const usd = (n: number) => Math.round(n * 1_000_000);
/** Owner's onboarding and support time per shop-month (the site's docs/PRICING.md estimate). */
const SUPPORT_USD: Record<string, number> = { shop: 15, shop_plus: 25 };

// Worst case, not the expected case: the shop spends its whole AI ceiling (the cost model's ~$0.40
// per RFQ on Opus prices puts a full Shop allowance at ~$50; the app runs on Haiku, far cheaper),
// plus hosting per RFQ and per shop, support, Paddle's fee and the refund reserve.
const cost = (p: Plan, charge: { cents: number; interval: "month" | "year" }) =>
  fullMonthlyCost(
    {
      variableMicros: usd(p.llmMonthlyCapUsd) + usd(SUPPORT_USD[p.key] ?? 0),
      hostingMicros: hostingMicros(p.rfqsPerMonth ?? 0),
    },
    charge,
  ).totalMicros;

const FILE = fileURLToPath(new URL("../../billing/paddle-catalog.json", import.meta.url));
const generated = () =>
  catalogFromPlans(
    { app: "jobshop-quote", productName: "Job Shop Quote", currency: "USD", taxCategory: "saas" },
    PLAN_LIST,
  );

describe("plans", () => {
  it("every paid plan keeps at least a 40% margin at its full AI ceiling, monthly and annual", () => {
    const checks = assertPricingBand(catalog.purchasable, cost);
    expect(checks.map((c) => `${c.planKey}:${c.interval}`)).toEqual([
      "shop:month",
      "shop:year",
      "shop_plus:month",
      "shop_plus:year",
    ]);
  });

  it("matches the plans the pricing page proposes (apps/jobshop-site)", () => {
    const paid = catalog.purchasable.map((p) => ({
      key: p.key,
      name: p.name,
      monthly: p.priceCents / 100,
      annual: (p.annualPriceCents ?? 0) / 100,
      rfqs: p.rfqsPerMonth,
      seats: p.maxMembers,
    }));
    expect(paid).toEqual(
      SITE_PLANS.map((p) => ({
        key: p.key,
        name: p.name,
        monthly: p.monthlyPrice,
        annual: p.annualPrice,
        rfqs: p.rfqsPerMonth,
        seats: p.seats,
      })),
    );
    expect(FREE_PLAN.name).toBe(SITE_EARLY_ACCESS.name);
    expect(FREE_PLAN.rfqsPerMonth).toBe(SITE_EARLY_ACCESS.rfqsPerMonth);
    expect(FREE_PLAN.maxMembers).toBe(SITE_EARLY_ACCESS.seats);
  });

  it("every plan's features name its own allowance", () => {
    for (const p of PLAN_LIST) {
      if (p.rfqsPerMonth !== null) expect(p.features[0]).toBe(`${p.rfqsPerMonth} RFQs a month`);
    }
  });

  it("never sells the free or complimentary plan", () => {
    expect(catalog.isPurchasable("free")).toBe(false);
    expect(catalog.isPurchasable("comp")).toBe(false);
    expect(generated().plans.map((p) => p.key)).toEqual(["shop", "shop_plus"]);
  });

  it("billing/paddle-catalog.json matches PLAN_LIST (regenerate with UPDATE_PADDLE_CATALOG=1)", () => {
    const want = `${JSON.stringify(generated(), null, 2)}\n`;
    if (process.env.UPDATE_PADDLE_CATALOG === "1") writeFileSync(FILE, want);
    expect(readFileSync(FILE, "utf8")).toBe(want);
  });
});
