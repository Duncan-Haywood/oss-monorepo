// Pricing guards. The margin test fails CI if a paid plan drops below the 40% floor (owner,
// 2026-11-24) with the org using its whole draft allowance at Opus list prices (the app runs on
// Haiku, about 40 times cheaper) and its whole evidence allowance; the catalog test keeps
// billing/paddle-catalog.json (synced to Paddle by packages/billing/scripts/paddle-catalog.ts) in
// step with PLAN_LIST. Regenerate it with:
//   UPDATE_PADDLE_CATALOG=1 pnpm exec vitest run --config vitest.unit.config.ts src/shared/plans.test.ts
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  assertPricingBand,
  catalogFromPlans,
  fullMonthlyCost,
  hostingMicros,
  llmCostMicros,
  tokens,
} from "@billing";
import { describe, expect, it } from "vitest";
import {
  catalog,
  FAIR_USE_DRAFTS,
  FREE_PLAN,
  isLevel2Control,
  PLAN_LIST,
  type Plan,
} from "./plans";

const usd = (n: number) => Math.round(n * 1_000_000);
/** One draft, worst case: a long profile and notes in (8k tokens), the 4k-token output cap out. */
const PER_DRAFT = llmCostMicros(tokens(8_000, 4_000), "claude-opus-5-5");
/** R2 standard storage, $0.015 per GB-month (Cloudflare R2 pricing). */
const R2_PER_GB_MONTH = usd(0.015);
/** Owner's onboarding and support time per org-month: compliance buyers ask questions. */
const SUPPORT_USD: Record<string, number> = { level2: 30, team: 50 };

const cost = (p: Plan, charge: { cents: number; interval: "month" | "year" }) => {
  const drafts = p.draftsPerMonth ?? FAIR_USE_DRAFTS;
  const storage = (p.evidenceStorageBytes / 1024 ** 3) * R2_PER_GB_MONTH;
  return fullMonthlyCost(
    {
      variableMicros: drafts * PER_DRAFT + Math.round(storage) + usd(SUPPORT_USD[p.key] ?? 0),
      hostingMicros: hostingMicros(drafts),
    },
    charge,
  ).totalMicros;
};

const FILE = fileURLToPath(new URL("../../billing/paddle-catalog.json", import.meta.url));
const generated = () =>
  catalogFromPlans(
    { app: "cmmc", productName: "CMMC Workspace", currency: "USD", taxCategory: "saas" },
    PLAN_LIST,
  );

describe("plans", () => {
  it("every paid plan keeps at least a 40% margin at its full allowance, monthly and annual", () => {
    const checks = assertPricingBand(catalog.purchasable, cost);
    expect(checks.map((c) => `${c.planKey}:${c.interval}`)).toEqual([
      "level2:month",
      "level2:year",
      "team:month",
      "team:year",
    ]);
  });

  it("the free plan is Level 1 only; every paid plan records Level 2", () => {
    expect(FREE_PLAN.level2).toBe(false);
    for (const p of catalog.purchasable) expect(p.level2).toBe(true);
  });

  it("never sells the free or complimentary plan", () => {
    expect(catalog.isPurchasable("free")).toBe(false);
    expect(catalog.isPurchasable("comp")).toBe(false);
    expect(generated().plans.map((p) => p.key)).toEqual(["level2", "team"]);
  });

  it("tells Level 1 and Level 2 requirement ids apart", () => {
    expect(isLevel2Control("AC.L2-3.1.1")).toBe(true);
    expect(isLevel2Control("AC.L1-b.1.i")).toBe(false);
  });

  it("billing/paddle-catalog.json matches PLAN_LIST (regenerate with UPDATE_PADDLE_CATALOG=1)", () => {
    const want = `${JSON.stringify(generated(), null, 2)}\n`;
    if (process.env.UPDATE_PADDLE_CATALOG === "1") writeFileSync(FILE, want);
    expect(readFileSync(FILE, "utf8")).toBe(want);
  });
});
