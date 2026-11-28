// The /machine-shop-minimum-charge guide: its arithmetic checked by hand, and the page that prints it.
// (apps/jobshop-quote/test/unit/site-minimum-charge-example.test.ts checks the same breaks against the
// app's costing engine.)
import { buildSite, fileFor } from "@site/build";
import type { Launch } from "@site/config";
import {
  BARE_SPACER,
  minimumFloor,
  minimumReach,
  priceWithMinimums,
  SPACER,
} from "@site/minimum-charge-example";
import { EXAMPLE as BASE, usdCents } from "@site/quote-example";
import { describe, expect, it } from "vitest";

const SITE = "https://example.test/jobshop";
const OPEN: Launch = {
  appUrl: "https://app.example.test",
  open: true,
  aiReading: false,
  inboundEmail: false,
  paidPlans: false,
};

describe("minimum-charge example arithmetic", () => {
  const anodized = priceWithMinimums(SPACER);
  const bare = priceWithMinimums(BARE_SPACER);
  it("matches a hand check of one anodized spacer", () => {
    const one = anodized[0];
    // 2 starts at 3% fallout. Plate 1.75×1.75×0.625 in × 0.0975 lb/in³ = 0.18662 lb; ×2 × $5 × 1.1
    // = $2.05, under the $25 minimum.
    expect(one?.starts).toBe(2);
    expect(one?.materialCents).toBe(2_500);
    expect(one?.materialAtMinimum).toBe(true);
    // Setups 20 + 25 min at $123.85 = 4,128.33→4,128 + 5,160.42→5,160; run 3 and 1 min × 2 starts.
    expect(one?.setupCents).toBe(4_128 + 5_160);
    expect(one?.runCents).toBe(1_239 + 413);
    // Anodize: 2 × $3.50 is under the $150 lot charge.
    expect(one?.finishingCents).toBe(15_000);
    // Markup 15% on material and on the anodize; labor at 0%.
    expect(one?.markupCents).toBe(375 + 2_250);
    expect(one?.totalCents).toBe(31_065);
    expect(one?.lineAtMinimum).toBe(false);
  });
  it("finds where each minimum lets go", () => {
    // Material: 0.18662 lb × starts × $5.50 ≥ $25 from 25 starts, i.e. 24 parts at 3% fallout.
    // Anodize: starts × $3.50 ≥ $150 from 43 starts, i.e. 41 parts.
    expect(minimumReach(SPACER)).toEqual({ material: 24, finishing: 41, line: 1 });
    expect(minimumReach(BARE_SPACER).line).toBe(15);
    expect(anodized.every((b) => !b.lineAtMinimum)).toBe(true);
    expect(bare.slice(0, 4).every((b) => b.totalCents === BASE.minimumLineCents)).toBe(true);
    expect(anodized.at(-1)?.minimumsAddCents).toBe(0);
  });
  it("works the line minimum out to the CNC guide's $250", () => {
    const f = minimumFloor();
    expect(f.officeMinutes).toBe(80);
    expect(f.officeCents).toBe(7_333); // 80/60 × $55 = $73.333
    expect(f.smallestLineCents).toBe(13_815);
    expect(f.floorCents).toBe(21_148);
    expect(f.suggestedMinimumCents).toBe(BASE.minimumLineCents);
  });
});

describe("/machine-shop-minimum-charge", () => {
  const files = buildSite({ siteUrl: SITE, basePath: "/jobshop", launch: OPEN });
  const page = files.get(fileFor("/machine-shop-minimum-charge")) ?? "";
  it("is built, in the sitemap and llms.txt, and linked from the CNC guide and the footer", () => {
    expect(page).toContain("<h1>How to set a minimum charge in a machine shop</h1>");
    expect(files.get("sitemap.xml")).toContain(`${SITE}/machine-shop-minimum-charge`);
    expect(files.get("llms.txt")).toContain(`${SITE}/machine-shop-minimum-charge`);
    for (const from of ["/how-to-quote-cnc-machining", "/"])
      expect(files.get(fileFor(from))).toContain('href="/jobshop/machine-shop-minimum-charge"');
  });
  it("prints the engine-checked figures and labels them made up", () => {
    for (const b of [...priceWithMinimums(SPACER), ...priceWithMinimums(BARE_SPACER)]) {
      expect(page).toContain(usdCents(b.totalCents));
      expect(page).toContain(usdCents(b.noMinimumsTotalCents));
    }
    expect(page).toContain(usdCents(minimumFloor().floorCents));
    expect(page).toContain("Every number is made up");
    expect(page).toContain("until 23 parts");
    expect(page).toContain("until 40 parts");
    expect(page).toMatch(/through\s+14 parts/);
    expect(page).not.toMatch(/industry standard|typically charge/i);
  });
});
