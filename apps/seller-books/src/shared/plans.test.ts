// Pricing guards. The margin test fails CI if a paid plan drops below the 40% floor (owner,
// 2026-11-24) at its full order allowance. Seller Books makes no model calls, so the cost is
// hosting per order imported, the owner's support time and Paddle's fees; the catalog test keeps
// billing/paddle-catalog.json (synced to Paddle by packages/billing/scripts/paddle-catalog.ts) in
// step with PLAN_LIST. Regenerate it with:
//   UPDATE_PADDLE_CATALOG=1 pnpm exec vitest run --config vitest.unit.config.ts src/shared/plans.test.ts
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  assertPricingBand,
  CLOUDFLARE_HOSTING,
  catalogFromPlans,
  fullMonthlyCost,
  type HostingModel,
  hostingMicros,
} from "@billing";
import { describe, expect, it } from "vitest";
import { catalog, FREE_PLAN, PLAN_LIST, type Plan, planFor } from "./plans";

const usd = (n: number) => Math.round(n * 1_000_000);
/**
 * Owner's support time per org-month, deliberately pessimistic: report formats change and tax-season
 * questions arrive in bulk. At $60 an hour, 5 / 10 / 20 minutes a month.
 */
const SUPPORT_USD: Record<string, number> = { side: 5, fulltime: 10, business: 20 };
/**
 * Hosting: grants' base fee and per-org budget, but metered per order instead of per AI draft. An
 * order is a sale row plus a few fee rows and later P&L reads in D1; $0.00001 an order pays for ten
 * rows at D1's list price of about $1 per million rows written (re-check on Cloudflare's pricing page).
 */
const SELLER_BOOKS_HOSTING: HostingModel = { ...CLOUDFLARE_HOSTING, perUnitMicros: 10 };

const cost = (p: Plan, charge: { cents: number; interval: "month" | "year" }) => {
  // A soft cap is a guide, so price at twice the allowance: a busy month must not sink the margin.
  const orders = (p.ordersPerMonth ?? 5_000) * 2;
  return fullMonthlyCost(
    {
      variableMicros: usd(SUPPORT_USD[p.key] ?? 0),
      hostingMicros: hostingMicros(orders, SELLER_BOOKS_HOSTING),
    },
    charge,
  ).totalMicros;
};

const FILE = fileURLToPath(new URL("../../billing/paddle-catalog.json", import.meta.url));
const generated = () =>
  catalogFromPlans(
    { app: "seller-books", productName: "Seller Books", currency: "USD", taxCategory: "saas" },
    PLAN_LIST,
  );

describe("plans", () => {
  it("every paid plan keeps at least a 40% margin at twice its order allowance, monthly and annual", () => {
    const checks = assertPricingBand(catalog.purchasable, cost);
    expect(checks.map((c) => `${c.planKey}:${c.interval}`)).toEqual([
      "side:month",
      "side:year",
      "fulltime:month",
      "fulltime:year",
      "business:month",
      "business:year",
    ]);
  });

  it("matches the marketing site's proposal (annual = 10 × monthly)", () => {
    const sold = catalog.purchasable.map((p) => [p.key, p.priceCents, p.annualPriceCents]);
    expect(sold).toEqual([
      ["side", 1_500, 15_000],
      ["fulltime", 3_500, 35_000],
      ["business", 6_900, 69_000],
    ]);
  });

  it("only the free plan has a hard order cap", () => {
    expect(FREE_PLAN.hardOrderCap).toBe(true);
    for (const p of catalog.purchasable) expect(p.hardOrderCap).toBe(false);
  });

  it("never sells the free or complimentary plan", () => {
    expect(catalog.isPurchasable("free")).toBe(false);
    expect(catalog.isPurchasable("comp")).toBe(false);
    expect(generated().plans.map((p) => p.key)).toEqual(["side", "fulltime", "business"]);
  });

  it("suggests the cheapest plan that fits the busiest month and the platforms used", () => {
    expect(planFor(40, 1)?.key).toBe("side");
    expect(planFor(100, 2)?.key).toBe("side");
    expect(planFor(101, 2)?.key).toBe("fulltime");
    expect(planFor(20, 3)?.key).toBe("fulltime");
    expect(planFor(2_000, 6)?.key).toBe("business");
    expect(planFor(3_000, 1)).toBeNull();
  });

  it("billing/paddle-catalog.json matches PLAN_LIST (regenerate with UPDATE_PADDLE_CATALOG=1)", () => {
    const want = `${JSON.stringify(generated(), null, 2)}\n`;
    if (process.env.UPDATE_PADDLE_CATALOG === "1") writeFileSync(FILE, want);
    expect(readFileSync(FILE, "utf8")).toBe(want);
  });
});
