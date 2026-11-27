// The /machine-shop-hourly-rate guide: its arithmetic, checked by hand, and the page that prints it.
import { buildSite, fileFor } from "@site/build";
import type { Launch } from "@site/config";
import { EXAMPLE, shopRate, usd } from "@site/shop-rate";
import { describe, expect, it } from "vitest";

const SITE = "https://example.test/jobshop";
const OPEN: Launch = {
  appUrl: "https://app.example.test",
  open: true,
  aiReading: false,
  inboundEmail: false,
  paidPlans: false,
};

describe("shopRate", () => {
  it("matches a hand check of the worked example", () => {
    const r = shopRate(EXAMPLE);
    // (180,000 - 40,000) / 10 = 14,000; + 12,000 + 30,000 = 56,000; / 1,300 = 43.0769
    expect(r.ownershipPerYear).toBe(14_000);
    expect(r.machinePerBillableHour).toBeCloseTo(43.0769, 3);
    // 28 * 1.3 = 36.40 per paid hour; * 2,000 / 1,300 = 56.00 per billable hour
    expect(r.operatorPerPaidHour).toBeCloseTo(36.4, 6);
    expect(r.operatorPerBillableHour).toBeCloseTo(56, 6);
    expect(r.costPerBillableHour).toBeCloseTo(99.0769, 3);
    expect(r.rateAtMargin).toBeCloseTo(123.846, 2); // 99.0769 / 0.8
    expect(r.rateAtSameMarkup).toBeCloseTo(118.892, 2); // 99.0769 * 1.2
    expect(r.utilisation).toBeCloseTo(0.65, 6);
  });
  it("splits the operator across tended machines", () => {
    expect(shopRate({ ...EXAMPLE, machinesPerOperator: 2 }).operatorPerBillableHour).toBeCloseTo(
      28,
      6,
    );
  });
  it("rejects inputs that cannot be right", () => {
    expect(() => shopRate({ ...EXAMPLE, billableHoursPerYear: 0 })).toThrow();
    expect(() => shopRate({ ...EXAMPLE, billableHoursPerYear: 2_500 })).toThrow();
    expect(() => shopRate({ ...EXAMPLE, margin: 1 })).toThrow();
  });
});

describe("/machine-shop-hourly-rate", () => {
  const files = buildSite({ siteUrl: SITE, basePath: "/jobshop", launch: OPEN });
  const page = files.get(fileFor("/machine-shop-hourly-rate")) ?? "";
  it("is built, in the sitemap and llms.txt, and linked from the compare page and footer", () => {
    expect(page).toContain("<h1>How to work out a machine shop hourly rate</h1>");
    expect(files.get("sitemap.xml")).toContain(`${SITE}/machine-shop-hourly-rate`);
    expect(files.get("llms.txt")).toContain(`${SITE}/machine-shop-hourly-rate`);
    expect(files.get(fileFor("/compare"))).toContain('href="/jobshop/machine-shop-hourly-rate"');
    expect(files.get(fileFor("/"))).toContain('href="/jobshop/machine-shop-hourly-rate"');
  });
  it("prints the computed figures and says they are made up", () => {
    const r = shopRate(EXAMPLE);
    for (const v of [r.costPerBillableHour, r.rateAtMargin, r.rateAtSameMarkup])
      expect(page).toContain(usd(v));
    expect(page).toContain("$99.08");
    expect(page).toContain("$123.85");
    expect(page).toContain("Every number here is made up");
    expect(page).toContain("not accounting, tax or financial");
  });
});
