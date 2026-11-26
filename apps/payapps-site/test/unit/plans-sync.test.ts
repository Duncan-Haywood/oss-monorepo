// The pricing page must show what the app sells. Reads the app's catalog as text (the app's file
// imports packages/billing, which this site does not build against) and compares each plan.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PLANS } from "@shared/plans";
import { describe, expect, it } from "vitest";

const APP_PLANS = fileURLToPath(new URL("../../../payapps/src/shared/plans.ts", import.meta.url));
const BILLING_PRICING = fileURLToPath(
  new URL("../../../../packages/billing/src/pricing.ts", import.meta.url),
);

interface AppPlan {
  key: string;
  name: string;
  priceCents: number;
  maxActiveJobs: number | null;
  maxMembers: number | null;
  storageBytes: number;
}

const num = (s: string) => Number(s.replace(/_/g, ""));

function parseAppPlans(src: string): AppPlan[] {
  const list = src.slice(src.indexOf("export const PLAN_LIST"));
  const blocks = list.split(/\n\s*\{\n/).slice(1);
  return blocks.flatMap((b) => {
    const key = /key: "([a-z]+)"/.exec(b)?.[1];
    const name = /name: "([^"]+)"/.exec(b)?.[1];
    const price = /priceCents: ([\d_]+)/.exec(b)?.[1];
    const jobs = /maxActiveJobs: (null|[\d_]+)/.exec(b)?.[1];
    const members = /maxMembers: (null|[\d_]+)/.exec(b)?.[1];
    const storage = /attachmentStorageBytes: ([\d_]+) \* (MB|GB)/.exec(b);
    if (!key || !name || !price || !jobs || !members || !storage) return [];
    const unit = storage[2] === "GB" ? 1024 ** 3 : 1024 ** 2;
    return [
      {
        key,
        name,
        priceCents: num(price),
        maxActiveJobs: jobs === "null" ? null : num(jobs),
        maxMembers: members === "null" ? null : num(members),
        storageBytes: num(storage[1] ?? "0") * unit,
      },
    ];
  });
}

describe("pricing page matches the app's plans", () => {
  const app = parseAppPlans(readFileSync(APP_PLANS, "utf8"));

  it("parses the app's catalog", () => {
    expect(app.map((p) => p.key)).toEqual(
      expect.arrayContaining(["free", "solo", "crew", "company"]),
    );
  });

  it("shows every plan the app offers, with the same price and limits", () => {
    const shown = app.filter((p) => p.key !== "comp");
    expect(PLANS.map((p) => p.key)).toEqual(shown.map((p) => p.key));
    for (const a of shown) {
      const s = PLANS.find((p) => p.key === a.key);
      expect(s, a.key).toBeDefined();
      expect(s?.name, a.key).toBe(a.name);
      expect(s?.priceCents, a.key).toBe(a.priceCents);
      expect(s?.activeJobs, a.key).toBe(a.maxActiveJobs);
      expect(s?.seats, a.key).toBe(a.maxMembers);
      expect((s?.storageMb ?? 0) * 1024 ** 2, a.key).toBe(a.storageBytes);
    }
  });

  it("shows the app's annual prices (packages/billing's annualPriceFor)", () => {
    const pricing = readFileSync(BILLING_PRICING, "utf8");
    const discount = Number(/ANNUAL_DISCOUNT = ([\d.]+)/.exec(pricing)?.[1]);
    expect(discount).toBeGreaterThan(0);
    for (const p of PLANS) {
      const want =
        p.priceCents > 0 ? Math.round((p.priceCents * 12 * (1 - discount)) / 100) * 100 : null;
      expect(p.annualPriceCents, p.key).toBe(want);
    }
  });
});
