// The /how-to-quote-cnc-machining guide: its arithmetic checked by hand, and the page that prints it.
// (apps/jobshop-quote/test/unit/site-quote-example.test.ts checks the same figures against the app's
// costing engine.)
import { buildSite, fileFor } from "@site/build";
import type { Launch } from "@site/config";
import { EXAMPLE, priceExample, startsFor, usdCents } from "@site/quote-example";
import { describe, expect, it } from "vitest";

const SITE = "https://example.test/jobshop";
const OPEN: Launch = {
  appUrl: "https://app.example.test",
  open: true,
  aiReading: false,
  inboundEmail: false,
  paidPlans: false,
};

describe("priceExample", () => {
  const r = priceExample(EXAMPLE);
  it("matches a hand check of the worked example", () => {
    // 4.25 × 3.25 × 1 in × 0.0975 lb/in³ = 1.3467 lb
    expect(r.blankWeightLb).toBeCloseTo(1.34672, 4);
    // 135 setup minutes at $123.85/h: 60, 45 and 30 min = 12,385 + 9,288.75→9,289 + 6,192.5→6,193 cents
    expect(r.breaks.map((b) => b.setupCents)).toEqual([27_867, 27_867, 27_867]);
    // 3% fallout: ceil(1/0.97) = 2, ceil(10/0.97) = 11, ceil(100/0.97) = 104
    expect(r.breaks.map((b) => b.starts)).toEqual([2, 11, 104]);
    const [one, ten, hundred] = r.breaks;
    // One part: material at its $25 minimum, anodize at its $150 lot minimum
    expect(one?.materialCents).toBe(2_500);
    expect(one?.finishingCents).toBe(15_000);
    // 104 starts × 1.3467 lb × $5 × 1.1 = $770.32; anodize 104 × $3.50 = $364
    expect(hundred?.materialCents).toBe(77_032);
    expect(hundred?.finishingCents).toBe(36_400);
    // markup: 15% of material + 15% of anodize (labor 0%)
    expect(one?.markupCents).toBe(375 + 2_250);
    expect(r.breaks.map((b) => b.unitPriceCents)).toEqual([58_726, 11_353, 7_165]);
    expect(ten?.totalCents).toBe(113_530);
  });
  it("applies the line minimum and rejects impossible inputs", () => {
    const tiny = priceExample({ ...EXAMPLE, minimumLineCents: 100_000 });
    expect(tiny.breaks[0]?.totalCents).toBe(100_000);
    expect(tiny.breaks[0]?.minimumAdjustmentCents).toBe(100_000 - 58_726);
    expect(() => priceExample({ ...EXAMPLE, falloutBps: 10_000 })).toThrow();
    expect(() => priceExample({ ...EXAMPLE, quantities: [0] })).toThrow();
    expect(startsFor(97, 300)).toBe(100);
  });
});

describe("/how-to-quote-cnc-machining", () => {
  const files = buildSite({ siteUrl: SITE, basePath: "/jobshop", launch: OPEN });
  const page = files.get(fileFor("/how-to-quote-cnc-machining")) ?? "";
  it("is built, in the sitemap and llms.txt, and linked from the rate guide and footer", () => {
    expect(page).toContain("<h1>How to quote a CNC machining job</h1>");
    expect(files.get("sitemap.xml")).toContain(`${SITE}/how-to-quote-cnc-machining`);
    expect(files.get("llms.txt")).toContain(`${SITE}/how-to-quote-cnc-machining`);
    expect(files.get(fileFor("/machine-shop-hourly-rate"))).toContain(
      'href="/jobshop/how-to-quote-cnc-machining"',
    );
    expect(files.get(fileFor("/"))).toContain('href="/jobshop/how-to-quote-cnc-machining"');
  });
  it("prints the computed figures and says they are made up", () => {
    for (const b of priceExample(EXAMPLE).breaks) {
      expect(page).toContain(usdCents(b.unitPriceCents));
      expect(page).toContain(usdCents(b.totalCents));
    }
    expect(page).toContain("$587.26");
    expect(page).toContain("$7,165.00");
    expect(page).toContain("Every number here is made up");
    expect(page).toContain("not accounting, tax or");
    expect(page).toContain('href="https://app.example.test/sign-up?from=jobshop-site%2F');
  });
});

describe("/how-to-quote-sheet-metal", () => {
  const files = buildSite({ siteUrl: SITE, basePath: "/jobshop", launch: OPEN });
  it("is built, in the sitemap and llms.txt, and linked from every page's footer", () => {
    expect(files.get(fileFor("/how-to-quote-sheet-metal"))).toContain("<h1>");
    expect(files.get("sitemap.xml")).toContain(`${SITE}/how-to-quote-sheet-metal`);
    expect(files.get("llms.txt")).toContain(`${SITE}/how-to-quote-sheet-metal`);
    for (const path of ["/", "/pricing", "/machine-shop-hourly-rate"]) {
      expect(files.get(fileFor(path))).toContain('href="/jobshop/how-to-quote-sheet-metal"');
    }
  });
});
