// The Paddle catalog file (billing/paddle-catalog.json) is generated from PLAN_LIST, committed, and
// synced to Paddle by grants-deploy (packages/billing/scripts/paddle-catalog.ts). Committing it means
// every price change shows up as a reviewable JSON diff. Regenerate after a plan change with:
//   UPDATE_PADDLE_CATALOG=1 pnpm exec vitest run --config vitest.unit.config.ts src/shared/billing/paddle-catalog.test.ts
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { catalogFromPlans } from "../../../../../packages/billing/src/paddle-catalog.ts";
import { PLAN_LIST } from "./plans";

const FILE = fileURLToPath(new URL("../../../billing/paddle-catalog.json", import.meta.url));

const generated = () =>
  catalogFromPlans(
    { app: "grants", productName: "Grant Autopilot", currency: "USD", taxCategory: "saas" },
    PLAN_LIST,
  );

describe("Paddle catalog file", () => {
  it("matches the plan catalog (regenerate with UPDATE_PADDLE_CATALOG=1)", () => {
    const want = `${JSON.stringify(generated(), null, 2)}\n`;
    if (process.env.UPDATE_PADDLE_CATALOG === "1") writeFileSync(FILE, want);
    expect(readFileSync(FILE, "utf8")).toBe(want);
  });

  it("sells only purchasable plans, never the complimentary one", () => {
    const keys = generated().plans.map((p) => p.key);
    expect(keys).not.toContain("comp");
    expect(keys).toEqual(PLAN_LIST.filter((p) => p.purchasable).map((p) => p.key));
  });
});
