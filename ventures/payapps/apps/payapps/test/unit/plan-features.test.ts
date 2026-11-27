import { PLAN_LIST, PUBLIC_PLANS, planFeatures, STORAGE_FEATURE } from "@shared/plans";
import { describe, expect, it } from "vitest";

describe("planFeatures", () => {
  it("keeps the catalog's lines when the deployment has file storage", () => {
    for (const p of PLAN_LIST) expect(planFeatures(p, true)).toEqual(p.features);
  });

  it("marks every plan's storage line as not switched on when there is no file storage", () => {
    for (const p of PUBLIC_PLANS) {
      const off = planFeatures(p, false);
      const storage = off.filter((f) => STORAGE_FEATURE.test(f));
      // Each public plan sells storage, so each has exactly one line to mark.
      expect(storage).toHaveLength(1);
      expect(storage[0]).toMatch(/\(not switched on yet\)$/);
      // Nothing else changes.
      expect(off.filter((f) => !STORAGE_FEATURE.test(f))).toEqual(
        p.features.filter((f) => !STORAGE_FEATURE.test(f)),
      );
    }
    expect(planFeatures(PUBLIC_PLANS[0], false)).toContain(
      "250 MB of attached backup and photos (not switched on yet)",
    );
  });

  it("does not mistake other lines for storage", () => {
    expect(STORAGE_FEATURE.test("5 active jobs")).toBe(false);
    expect(STORAGE_FEATURE.test("PDF + CSV")).toBe(false);
    expect(STORAGE_FEATURE.test("Send pay apps to QuickBooks Online as invoices, with retainage")).toBe(false);
  });
});
