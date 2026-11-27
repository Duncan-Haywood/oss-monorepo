// Material priced by the foot (bar, tube, extrusion): the engine (computeCost, barStockUse) and the
// rate-card spreadsheet import/export of a supplier's per-foot price list.
import { describe, expect, it } from "vitest";
import type { MaterialDto } from "./api";
import {
  barStockUse,
  type CostInputs,
  computeCost,
  type RateCard,
  type RateMaterial,
} from "./costing";
import { effectivePrice, priceChanged, priceChangeText } from "./material-price";
import {
  EXPORT_HEADERS,
  exportRateCsv,
  type MaterialImportValues,
  planRateImport,
  readRateSheet,
} from "./rate-card-import";
import { parseCsv } from "./sheet";
import { type TravelerNames, travelerLine } from "./traveler";

const bar: RateMaterial = {
  id: "crs",
  name: "1018 CRS 1 in round",
  pricingBasis: "per_ft",
  pricePerLbCents: null,
  densityLbPerIn3: null,
  stockPriceCents: null,
  stockDescription: "1 in round",
  pricePerFootCents: 420,
  cutAllowanceIn: 0.125,
  barLengthIn: 144,
  barRemnantIn: 3,
  scrapBps: 500,
  minChargeCents: 0,
};

const card = (m: RateMaterial = bar): RateCard => ({
  laborMarkupBps: 0,
  materialMarkupBps: 0,
  outsideServiceMarkupBps: 0,
  minimumLineCents: 0,
  machines: [{ id: "lathe", name: "Lathe", hourlyRateCents: 6_000, setupRateCents: null }],
  materials: [m],
  finishingOps: [],
});

const pin = (over: Partial<CostInputs> = {}): CostInputs => ({
  quantities: [10, 47, 48],
  customerSuppliedMaterial: false,
  material: {
    materialId: "crs",
    blank: { shape: "round", diameterIn: 1, lengthIn: 2.875 },
    partsPerStock: null,
  },
  operations: [{ machineId: "lathe", label: "Turn", setupMinutes: 0, cycleMinutesPerPart: 1 }],
  finishing: [],
  extras: [],
  ...over,
});

const priced = (rc: RateCard, inputs: CostInputs) => {
  const out = computeCost(rc, inputs);
  if (!out.ok) throw new Error(out.issues.map((i) => i.message).join("; "));
  return out.result;
};
const codes = (rc: RateCard, inputs: CostInputs) => {
  const out = computeCost(rc, inputs);
  return out.ok ? [] : out.issues.map((i) => i.code);
};

describe("barStockUse", () => {
  it("adds the cut allowance and counts whole parts in the usable bar", () => {
    // 2.875 + 0.125 = 3 in a part; 144 - 3 = 141 in usable; 141 / 3 = 47.
    expect(barStockUse(bar, 2.875)).toEqual({ cutLengthIn: 3, partsPerBar: 47 });
  });
  it("counts an exact fit without float error", () => {
    const exact = { ...bar, cutAllowanceIn: 0.1, barRemnantIn: 0 };
    // 2.9 + 0.1 is 2.9999999999999996 in floating point; 144 / 3 must still be 48.
    expect(barStockUse(exact, 2.9).partsPerBar).toBe(48);
  });
  it("has no bar count without a bar length, and 0 when a part is longer than the usable bar", () => {
    expect(barStockUse({ ...bar, barLengthIn: null }, 2.875)).toEqual({
      cutLengthIn: 3,
      partsPerBar: null,
    });
    expect(barStockUse(bar, 141).partsPerBar).toBe(0);
  });
  it("reads a row saved before per-foot fields existed as no allowance and no bar", () => {
    const old: RateMaterial = {
      ...bar,
      cutAllowanceIn: undefined,
      barLengthIn: undefined,
      barRemnantIn: undefined,
    };
    expect(barStockUse(old, 3)).toEqual({ cutLengthIn: 3, partsPerBar: null });
  });
});

describe("computeCost with a per-foot material", () => {
  it("charges whole bars: 12 ft at $4.20/ft is $50.40 a bar", () => {
    const r = priced(card(), pin());
    expect(r.breaks.map((b) => b.materialCents)).toEqual([5_040, 5_040, 10_080]);
    expect(r.basis[0]).toBe(
      "Material: 1018 CRS 1 in round (1 in round), 2.875 in blank + 0.125 in cut allowance = 3 in per part at $4.20/ft, bought in 144 in bars (3 in remnant): 47 parts per bar, whole bars charged",
    );
  });
  it("buys bars for the parts started, not only the good ones", () => {
    // 47 good at 10% fallout starts ceil(47 / 0.9) = 53 parts: two bars.
    const r = priced(card(), pin({ quantities: [47], falloutBps: 1_000 }));
    expect(r.breaks[0]?.starts).toBe(53);
    expect(r.breaks[0]?.materialCents).toBe(10_080);
  });
  it("charges the length used plus scrap when the row has no bar length", () => {
    // 8 parts × 3 in = 2 ft × $4.20 = $8.40, plus 5% scrap = $8.82.
    const r = priced(
      card({ ...bar, barLengthIn: null, barRemnantIn: null }),
      pin({ quantities: [8] }),
    );
    expect(r.breaks[0]?.materialCents).toBe(882);
    expect(r.basis[0]).toMatch(/3 in per part at \$4\.20\/ft plus 5% scrap$/);
  });
  it("applies the row's minimum charge", () => {
    const r = priced(card({ ...bar, minChargeCents: 7_500 }), pin({ quantities: [10] }));
    expect(r.breaks[0]?.materialCents).toBe(7_500);
  });
  it("prices a rectangular blank by its length too (flat bar, extrusion)", () => {
    const r = priced(
      card(),
      pin({
        quantities: [47],
        material: {
          materialId: "crs",
          blank: { shape: "rect", lengthIn: 2.875, widthIn: 2, thicknessIn: 0.5 },
          partsPerStock: null,
        },
      }),
    );
    expect(r.breaks[0]?.materialCents).toBe(5_040);
  });
  it("blocks instead of guessing: no length, no price, a part longer than the bar", () => {
    expect(
      codes(
        card(),
        pin({
          material: {
            materialId: "crs",
            blank: { shape: "weight", weightLb: 2 },
            partsPerStock: null,
          },
        }),
      ),
    ).toEqual(["material_needs_length"]);
    expect(
      codes(card(), pin({ material: { materialId: "crs", blank: null, partsPerStock: null } })),
    ).toEqual(["material_needs_length"]);
    expect(codes(card({ ...bar, pricePerFootCents: null }), pin())).toEqual([
      "material_needs_price",
    ]);
    const long = pin({
      material: {
        materialId: "crs",
        blank: { shape: "round", diameterIn: 1, lengthIn: 141 },
        partsPerStock: null,
      },
    });
    const out = computeCost(card(), long);
    expect(out.ok ? [] : out.issues.map((i) => i.code)).toEqual(["material_bar_too_short"]);
    expect(out.ok ? "" : out.issues[0]?.message).toMatch(
      /141\.125 in cut does not fit the usable length of one 144 in bar .*\(3 in remnant\)/,
    );
  });
  it("keeps the per-foot fields in the rate snapshot a saved quote prices from", () => {
    const r = priced(card(), pin());
    expect(r.snapshot.materials[0]).toMatchObject({
      pricePerFootCents: 420,
      cutAllowanceIn: 0.125,
      barLengthIn: 144,
      barRemnantIn: 3,
    });
  });
});

const dto: MaterialDto = {
  id: "mat_ft",
  name: "1018 CRS 1 in round",
  pricingBasis: "per_ft",
  pricePerLbCents: null,
  densityLbPerIn3: 0.284,
  sheetThicknessIn: null,
  sheetWidthIn: null,
  sheetLengthIn: null,
  nestGapIn: null,
  stockPriceCents: null,
  stockDescription: "1 in round",
  pricePerFootCents: 420,
  pricePerCwtCents: null,
  pricePerMetreCents: null,
  cutAllowanceIn: 0.125,
  barLengthIn: 144,
  barRemnantIn: 3,
  scrapBps: 0,
  minChargeCents: 0,
  active: true,
  priceSetAt: "2026-11-27T00:00:00.000Z",
};

describe("a supplier's per-foot price list in the rate-card import", () => {
  it("reads price per foot, bar length, cut allowance and remnant, and infers the basis", () => {
    const sheet = readRateSheet(
      "materials",
      parseCsv(
        [
          "Metals Supply — bar price list,,,,,",
          "Material,Size,Price/ft,Bar length (in),Cut allowance,Remnant (in)",
          "1018 CRS 1 in round,1 in round,$4.20,144,0.125,3",
          "6061-T6511 1.5 in round,1.5 in round,7.85,144,0.0625,",
        ].join("\n"),
      ),
    );
    expect(sheet.fatal).toBeNull();
    expect(sheet.ignored).toEqual([]);
    expect(sheet.errors).toEqual([]);
    expect(sheet.rows.map((r) => r.values as MaterialImportValues)).toEqual([
      {
        name: "1018 CRS 1 in round",
        stockDescription: "1 in round",
        pricePerFootCents: 420,
        barLengthIn: 144,
        cutAllowanceIn: 0.125,
        barRemnantIn: 3,
        pricingBasis: "per_ft",
      },
      {
        name: "6061-T6511 1.5 in round",
        stockDescription: "1.5 in round",
        pricePerFootCents: 785,
        barLengthIn: 144,
        cutAllowanceIn: 0.0625,
        pricingBasis: "per_ft",
      },
    ]);
  });

  it("reads 'per ft' in a Pricing basis column, and refuses two prices without one", () => {
    const sheet = readRateSheet(
      "materials",
      parseCsv(
        [
          "Material,Pricing basis,Price per lb,Price per ft",
          "4140 HT 2 in round,by the foot,3.10,12.40",
          "4140 HT 3 in round,,3.10,26.00",
        ].join("\n"),
      ),
    );
    expect(sheet.rows[0]?.values).toMatchObject({
      pricingBasis: "per_ft",
      pricePerFootCents: 1_240,
    });
    expect(sheet.errors.map((e) => e.row)).toEqual([3]);
    expect(sheet.errors[0]?.message).toMatch(/price per ft/);
  });

  it("refuses non-inch length columns rather than converting by guess", () => {
    const sheet = readRateSheet(
      "materials",
      parseCsv("Material,Bar length (ft),Price/ft\nA36 flat,20,4.00\n"),
    );
    expect(sheet.ignored.map((i) => i.header)).toEqual(["Bar length (ft)"]);
    expect(sheet.ignored[0]?.reason).toMatch(/inches/);
    expect(sheet.rows[0]?.values).toEqual({
      name: "A36 flat",
      pricePerFootCents: 400,
      pricingBasis: "per_ft",
    });
  });

  it("exports a per-foot row in the layout the import reads back as no change", () => {
    const csv = exportRateCsv("materials", [dto]);
    expect(EXPORT_HEADERS.materials).toEqual(
      expect.arrayContaining([
        "Price per ft",
        "Cut allowance (in)",
        "Bar length (in)",
        "Bar remnant (in)",
      ]),
    );
    expect(csv).toContain("1018 CRS 1 in round,per ft,");
    const sheet = readRateSheet("materials", parseCsv(csv));
    expect(sheet.errors).toEqual([]);
    expect(sheet.ignored).toEqual([]);
    const plan = planRateImport("materials", sheet.rows, [dto]);
    expect(plan.errors).toEqual([]);
    expect(plan.rows.map((r) => [r.action, r.changes])).toEqual([["update", []]]);
    // An edited price per foot is that one change.
    const edited = readRateSheet("materials", parseCsv(csv.replace(",4.20,", ",4.55,")));
    const plan2 = planRateImport("materials", edited.rows, [dto]);
    expect(plan2.rows[0]?.changes).toEqual(["Price per ft"]);
    expect(plan2.rows[0]?.values.pricePerFootCents).toBe(455);
  });

  it("refuses a new per-foot row with a remnant as long as its bar", () => {
    const sheet = readRateSheet(
      "materials",
      parseCsv("Material,Price per ft,Bar length (in),Remnant (in)\nBrass 360 hex,9.00,144,144\n"),
    );
    const plan = planRateImport("materials", sheet.rows, []);
    expect(plan.errors.map((e) => e.row)).toEqual([2]);
    expect(plan.errors[0]?.message).toMatch(/remnant must be shorter/);
  });
});

describe("the job traveler for per-foot stock", () => {
  const names: TravelerNames = {
    machines: [{ id: "lathe", name: "Lathe" }],
    materials: [
      { ...bar, stockDescription: "1 in round" },
      { ...bar, id: "loose", barLengthIn: null, barRemnantIn: null },
    ],
    finishingOps: [],
  };
  const line = (materialId: string) => ({
    id: "l1",
    partNumber: "PIN-7",
    revision: null,
    description: "Pin",
    inputs: pin({
      material: {
        materialId,
        blank: { shape: "round", diameterIn: 1, lengthIn: 2.875 },
        partsPerStock: null,
      },
    }),
  });
  it("gives the cut list and the whole bars to pull", () => {
    const t = travelerLine(line("crs"), 53, names);
    expect(t.material).toMatchObject({
      cutList: 'Cut 53 blanks at 3" (13.25 ft)',
      partsPerStock: 47,
      stockPieces: 2,
      stockUnit: "bar",
    });
  });
  it("gives the cut list alone when the row has no bar length", () => {
    const t = travelerLine(line("loose"), 8, names);
    expect(t.material).toMatchObject({
      cutList: 'Cut 8 blanks at 3" (2 ft)',
      partsPerStock: null,
      stockPieces: null,
      stockUnit: "piece",
    });
  });
});

describe("price dates and history for a per-foot row", () => {
  const ft = { pricingBasis: "per_ft" as const, pricePerLbCents: null, stockPriceCents: null };
  it("charges by the price per foot, and a new price per foot is a price change", () => {
    expect(effectivePrice({ ...ft, pricePerFootCents: 420 })).toBe(420);
    expect(priceChanged({ ...ft, pricePerFootCents: 420 }, { pricePerFootCents: 455 })).toBe(true);
    expect(priceChanged({ ...ft, pricePerFootCents: 420 }, { pricePerLbCents: 300 })).toBe(false);
  });
  it("words a history row in $/ft", () => {
    const at = "2026-11-27T00:00:00.000Z";
    expect(
      priceChangeText(
        { ...ft, pricePerFootCents: 455, createdAt: at },
        { ...ft, pricePerFootCents: 420, createdAt: at },
        null,
      ),
    ).toBe("$4.55/ft, up 8.3% from $4.20/ft");
  });
});
