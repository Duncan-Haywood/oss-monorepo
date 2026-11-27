// The /how-to-quote-sheet-metal guide: its arithmetic checked by hand, and the page that prints it.
// (apps/jobshop-quote/test/unit/site-sheet-metal-example.test.ts checks the same figures, the nest
// count and the DXF cut and bend times against the app's own engine.)
import { buildSite, fileFor } from "@site/build";
import type { Launch } from "@site/config";
import { usdCents } from "@site/quote-example";
import { priceSheetExample, SHEET_EXAMPLE, startsFor } from "@site/sheet-metal-example";
import { describe, expect, it } from "vitest";

const SITE = "https://example.test/jobshop";
const OPEN: Launch = {
  appUrl: "https://app.example.test",
  open: true,
  aiReading: false,
  inboundEmail: false,
  paidPlans: false,
};

describe("priceSheetExample", () => {
  const r = priceSheetExample(SHEET_EXAMPLE);
  it("matches a hand check of the worked example", () => {
    // 62.4 in ÷ 200 in/min = 0.312 min + 9 pierces × 0.5 s = 0.075 min → 0.387, up to 0.39
    expect(r.cutMinutesPerPart).toBe(0.39);
    // 3 bends × 8 s = 24 s = 0.4 min
    expect(r.bendMinutesPerPart).toBe(0.4);
    // 2% fallout: ceil(10/0.98) = 11, ceil(100/0.98) = 103, ceil(500/0.98) = 511
    expect(r.breaks.map((b) => b.starts)).toEqual([11, 103, 511]);
    // 88 per sheet: 1, 2 and 6 sheets at $180
    expect(r.breaks.map((b) => b.sheets)).toEqual([1, 2, 6]);
    expect(r.breaks.map((b) => b.materialCents)).toEqual([18_000, 36_000, 108_000]);
    // Setup: 20 + 10 min at $180/h = 6,000 + 3,000; 25 min at $95/h = 3,958.33 → 3,958
    expect(r.breaks.map((b) => b.setupCents)).toEqual([12_958, 12_958, 12_958]);
    const [ten, , five] = r.breaks;
    // Run at 11 starts: laser 0.39/60×18,000×11 = 1,287; brake 0.4/60×9,500×11 = 696.67 → 697;
    // bench 1.5/60×7,000×11 = 1,925
    expect(ten?.runCents).toBe(1_287 + 697 + 1_925);
    // Powder coat: the $175 lot minimum at 10; 511 × $4.50 = $2,299.50 at 500
    expect(ten?.finishingCents).toBe(17_500);
    expect(five?.finishingCents).toBe(229_950);
    // Hardware on parts shipped, not started
    expect(ten?.extrasCents).toBe(720);
    // Markup 15% of material, coat and hardware: 2,700 + 2,625 + 108
    expect(ten?.markupCents).toBe(5_433);
    expect(r.breaks.map((b) => b.unitPriceCents)).toEqual([5_852, 1_526, 1_250]);
    expect(five?.totalCents).toBe(625_000);
  });
  it("applies the line minimum and rejects impossible inputs", () => {
    const tiny = priceSheetExample({ ...SHEET_EXAMPLE, minimumLineCents: 100_000 });
    expect(tiny.breaks[0]?.totalCents).toBe(100_000);
    expect(tiny.breaks[0]?.minimumAdjustmentCents).toBe(100_000 - 58_520);
    expect(() => priceSheetExample({ ...SHEET_EXAMPLE, falloutBps: 10_000 })).toThrow();
    expect(() => priceSheetExample({ ...SHEET_EXAMPLE, quantities: [0] })).toThrow();
    expect(() => priceSheetExample({ ...SHEET_EXAMPLE, partsPerSheet: 0 })).toThrow();
    expect(startsFor(98, 200)).toBe(100);
  });
});

describe("/how-to-quote-sheet-metal", () => {
  const files = buildSite({ siteUrl: SITE, basePath: "/jobshop", launch: OPEN });
  const page = files.get(fileFor("/how-to-quote-sheet-metal")) ?? "";
  it("is built, in the sitemap and llms.txt, and linked from the CNC guide and footer", () => {
    expect(page).toContain("<h1>How to quote sheet metal and laser cut parts</h1>");
    expect(files.get("sitemap.xml")).toContain(`${SITE}/how-to-quote-sheet-metal`);
    expect(files.get("llms.txt")).toContain(`${SITE}/how-to-quote-sheet-metal`);
    expect(files.get(fileFor("/how-to-quote-cnc-machining"))).toContain(
      'href="/jobshop/how-to-quote-sheet-metal"',
    );
    expect(files.get(fileFor("/"))).toContain('href="/jobshop/how-to-quote-sheet-metal"');
  });
  it("prints the computed figures and says they are made up", () => {
    for (const b of priceSheetExample(SHEET_EXAMPLE).breaks) {
      expect(page).toContain(usdCents(b.unitPriceCents));
      expect(page).toContain(usdCents(b.totalCents));
    }
    expect(page).toContain("$58.52");
    expect(page).toContain("$6,250.00");
    expect(page).toContain("fits\n      <strong>88 times</strong>");
    expect(page).toContain("Every number here is made up");
    expect(page).toContain("not accounting, tax,");
    expect(page).toContain('href="https://app.example.test/sign-up"');
  });
});
