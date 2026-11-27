// Pricing guards. The margin test fails CI if a plan drops below the 40% floor at full allowance
// (owner, 2026-11-24); the catalog test keeps billing/paddle-catalog.json, which the deploy syncs to
// Paddle (packages/billing/scripts/paddle-catalog.ts), identical to PLAN_LIST. Regenerate it with:
//   UPDATE_PADDLE_CATALOG=1 pnpm exec vitest run --config vitest.unit.config.ts src/shared/plans.test.ts
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  assertPricingBand,
  CLOUDFLARE_HOSTING,
  catalogFromPlans,
  fullMonthlyCost,
  hostingMicros,
} from "@billing";
import { describe, expect, it } from "vitest";
import { catalog, FAIR_USE_ACTIVE_JOBS, PLAN_LIST, type Plan } from "./plans";

// PayApps makes no LLM calls. Per active job per month we budget R2 storage for pay-app PDFs and
// backup (~50 MB at $0.015/GB) plus D1 reads/writes: a generous $0.05 job-month.
const PER_JOB_MICROS = 50_000;
const jobs = (p: Plan) => p.maxActiveJobs ?? FAIR_USE_ACTIVE_JOBS;
const cost = (p: Plan, charge: { cents: number; interval: "month" | "year" }) =>
  fullMonthlyCost(
    {
      variableMicros: jobs(p) * PER_JOB_MICROS,
      hostingMicros: hostingMicros(jobs(p), CLOUDFLARE_HOSTING),
    },
    charge,
  ).totalMicros;

const FILE = fileURLToPath(new URL("../../billing/paddle-catalog.json", import.meta.url));
const generated = () =>
  catalogFromPlans(
    { app: "payapps", productName: "PayApps", currency: "USD", taxCategory: "saas" },
    PLAN_LIST,
  );

describe("plans", () => {
  it("every paid plan keeps at least a 40% margin, monthly and annual", () => {
    const checks = assertPricingBand(catalog.purchasable, cost);
    expect(checks.map((c) => `${c.planKey}:${c.interval}`)).toEqual([
      "solo:month",
      "solo:year",
      "crew:month",
      "crew:year",
      "company:month",
      "company:year",
    ]);
  });

  it("limits grow with price and annual is 10% off", () => {
    const [solo, crew, company] = catalog.purchasable;
    expect(solo?.priceCents).toBeLessThan(crew?.priceCents ?? 0);
    expect(crew?.priceCents).toBeLessThan(company?.priceCents ?? 0);
    expect(solo?.maxActiveJobs).toBeLessThan(crew?.maxActiveJobs ?? 0);
    expect(company?.maxActiveJobs).toBeNull();
    expect(solo?.annualPriceCents).toBe(106_900);
  });

  it("never sells the free or complimentary plan", () => {
    expect(catalog.isPurchasable("free")).toBe(false);
    expect(catalog.isPurchasable("comp")).toBe(false);
    expect(generated().plans.map((p) => p.key)).toEqual(["solo", "crew", "company"]);
  });

  it("billing/paddle-catalog.json matches PLAN_LIST (regenerate with UPDATE_PADDLE_CATALOG=1)", () => {
    const want = `${JSON.stringify(generated(), null, 2)}\n`;
    if (process.env.UPDATE_PADDLE_CATALOG === "1") writeFileSync(FILE, want);
    expect(readFileSync(FILE, "utf8")).toBe(want);
  });
});
