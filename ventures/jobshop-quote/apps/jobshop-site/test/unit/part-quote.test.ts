// The /how-to-quote-cnc-machining guide: its arithmetic checked by hand, checked against the app's
// own costing engine, and the page that prints it.
import { buildSite, fileFor } from "@site/build";
import type { Launch } from "@site/config";
import { BRACKET, partQuote, startsFor } from "@site/part-quote";
import { usd } from "@site/shop-rate";
import { describe, expect, it } from "vitest";
import { computeCost, type RateCard } from "../../../jobshop-quote/src/shared/costing";

const SITE = "https://example.test/jobshop";
const OPEN: Launch = {
  appUrl: "https://app.example.test",
  open: true,
  aiReading: false,
  inboundEmail: false,
  paidPlans: false,
};

describe("partQuote", () => {
  const q = partQuote(BRACKET);
  it("matches a hand check of the 10-piece break", () => {
    // 4.25 × 3.25 × 1 = 13.8125 in³ × 0.0975 = 1.34672 lb
    expect(q.blankWeightLb).toBeCloseTo(1.34672, 5);
    const b = q.breaks[1];
    if (!b) throw new Error("no 10-piece break");
    expect(b.quantity).toBe(10);
    expect(b.starts).toBe(11); // 10 / 0.98 = 10.2, up to 11
    expect(b.materialCents).toBe(7_333); // 1.34672 × 11 × 450 × 1.1 = 7,333.3
    expect(b.setupCents).toBe(15_000); // 90 min at $100/h
    expect(b.runCents).toBe(12_833 + 7_333); // 7 and 4 min × 11 parts at $100/h
    expect(b.finishCents).toBe(12_500); // lot minimum beats 11 × $3
    expect(b.costCents).toBe(54_999);
    expect(b.markupCents).toBe(1_100 + 7_033 + 1_875); // 15% material, 20% labor, 15% outside
    expect(b.unitPriceCents).toBe(6_501); // ceil(65,007 / 10)
    expect(b.totalCents).toBe(65_010);
  });
  it("spreads setup over the lot and starts a spare at quantity one", () => {
    expect(q.breaks.map((b) => b.starts)).toEqual([2, 11, 52, 256]);
    expect(q.breaks.map((b) => b.setupPerPartCents)).toEqual([15_000, 1_500, 300, 60]);
    const unit = q.breaks.map((b) => b.unitPriceCents);
    expect([...unit].sort((a, b) => b - a)).toEqual(unit);
    expect(new Set(unit).size).toBe(unit.length);
  });
  it("rounds starts up without float error at exact hits", () => {
    expect(startsFor(49, 0.02)).toBe(50);
    expect(startsFor(10, 0)).toBe(10);
  });
  it("rejects inputs that cannot be right", () => {
    expect(() => partQuote({ ...BRACKET, fallout: 0.5 })).toThrow();
    expect(() => partQuote({ ...BRACKET, quantities: [0] })).toThrow();
  });
  it("agrees with the app's costing engine on every break", () => {
    const card: RateCard = {
      laborMarkupBps: BRACKET.laborMarkup * 10_000,
      materialMarkupBps: BRACKET.materialMarkup * 10_000,
      outsideServiceMarkupBps: BRACKET.outsideMarkup * 10_000,
      minimumLineCents: BRACKET.minimumLineCents,
      machines: [
        {
          id: "m",
          name: "3-axis mill",
          hourlyRateCents: BRACKET.hourlyRateCents,
          setupRateCents: null,
        },
      ],
      materials: [
        {
          id: "al",
          name: "6061",
          pricingBasis: "per_lb",
          pricePerLbCents: BRACKET.pricePerLbCents,
          densityLbPerIn3: BRACKET.densityLbPerIn3,
          stockPriceCents: null,
          stockDescription: null,
          scrapBps: BRACKET.scrap * 10_000,
          minChargeCents: BRACKET.materialMinCents,
        },
      ],
      finishingOps: [
        {
          id: "anod",
          name: BRACKET.finish.label,
          perPartCents: BRACKET.finish.perPartCents,
          lotChargeCents: BRACKET.finish.lotChargeCents,
          outsideService: true,
        },
      ],
    };
    const out = computeCost(card, {
      quantities: [...BRACKET.quantities],
      customerSuppliedMaterial: false,
      material: {
        materialId: "al",
        blank: { shape: "rect", ...BRACKET.blank },
        partsPerStock: null,
      },
      operations: BRACKET.operations.map((o) => ({
        machineId: "m",
        label: o.label,
        setupMinutes: o.setupMinutes,
        cycleMinutesPerPart: o.cycleMinutesPerPart,
      })),
      falloutBps: BRACKET.fallout * 10_000,
      finishing: [{ opId: "anod" }],
      extras: [],
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const ours = partQuote(BRACKET).breaks;
    expect(out.result.breaks).toHaveLength(ours.length);
    out.result.breaks.forEach((b, i) => {
      const o = ours[i];
      if (!o) throw new Error(`no break ${i}`);
      expect(b.starts).toBe(o.starts);
      expect(b.materialCents).toBe(o.materialCents);
      expect(b.setupCents + b.runCents).toBe(o.setupCents + o.runCents);
      expect(b.finishingCents).toBe(o.finishCents);
      expect(b.markupCents).toBe(o.markupCents);
      expect(b.unitPriceCents).toBe(o.unitPriceCents);
    });
  });
});

describe("/how-to-quote-cnc-machining", () => {
  const files = buildSite({ siteUrl: SITE, basePath: "/jobshop", launch: OPEN });
  const page = files.get(fileFor("/how-to-quote-cnc-machining")) ?? "";
  it("is built, in the sitemap and llms.txt, and linked from the hourly-rate guide and footer", () => {
    expect(page).toContain("<h1>How to quote a CNC machined part</h1>");
    expect(files.get("sitemap.xml")).toContain(`${SITE}/how-to-quote-cnc-machining`);
    expect(files.get("llms.txt")).toContain(`${SITE}/how-to-quote-cnc-machining`);
    expect(files.get(fileFor("/machine-shop-hourly-rate"))).toContain(
      'href="/jobshop/how-to-quote-cnc-machining"',
    );
    expect(files.get(fileFor("/"))).toContain('href="/jobshop/how-to-quote-cnc-machining"');
  });
  it("prints the computed figures and says they are made up", () => {
    for (const b of partQuote(BRACKET).breaks) expect(page).toContain(usd(b.unitPriceCents / 100));
    expect(page).toContain("$65.01");
    expect(page).toContain("$396.49");
    expect(page).toContain("Every number here is made up");
    expect(page).toContain("not accounting, tax or financial");
  });
});
