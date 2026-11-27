// Material prices kept in the supplier's own unit: per hundredweight (100 lb) for per-lb stock and
// per metre for per-foot stock. Stored exactly, priced without rounding the converted $/lb or $/ft
// to a whole cent ($412.50/cwt is $4.125/lb; $10.00/m is $3.048/ft).
import { describe, expect, it } from "vitest";
import { type MaterialDto, materialInputSchema } from "./api";
import { type CostInputs, computeCost, type RateCard, type RateMaterial } from "./costing";
import {
  effectivePrice,
  exactMoneyText,
  footPriceCents,
  lbPriceCents,
  priceChanged,
  priceChangeText,
  priceMoved,
  priceText,
} from "./material-price";
import { exportRateCsv, planRateImport, readRateSheet } from "./rate-card-import";
import { parseCsv } from "./sheet";

const plate: RateMaterial = {
  id: "a36",
  name: "A36 plate",
  pricingBasis: "per_lb",
  pricePerLbCents: null,
  pricePerCwtCents: 41_250,
  densityLbPerIn3: null,
  stockPriceCents: null,
  stockDescription: null,
  scrapBps: 0,
  minChargeCents: 0,
};

const tube: RateMaterial = {
  id: "tube",
  name: "6063 tube 1 in OD",
  pricingBasis: "per_ft",
  pricePerLbCents: null,
  densityLbPerIn3: null,
  stockPriceCents: null,
  stockDescription: null,
  pricePerFootCents: null,
  pricePerMetreCents: 1_000,
  cutAllowanceIn: 0,
  barLengthIn: null,
  barRemnantIn: null,
  scrapBps: 0,
  minChargeCents: 0,
};

const card = (m: RateMaterial): RateCard => ({
  laborMarkupBps: 0,
  materialMarkupBps: 0,
  outsideServiceMarkupBps: 0,
  minimumLineCents: 0,
  currency: "USD",
  machines: [{ id: "saw", name: "Saw", hourlyRateCents: 6_000, setupRateCents: null }],
  materials: [m],
  finishingOps: [],
});

const inputs = (materialId: string, over: Partial<CostInputs> = {}): CostInputs => ({
  quantities: [3, 1],
  customerSuppliedMaterial: false,
  material: {
    materialId,
    blank:
      materialId === "a36"
        ? { shape: "weight", weightLb: 10 }
        : { shape: "round", diameterIn: 1, lengthIn: 12 },
    partsPerStock: null,
  },
  operations: [{ machineId: "saw", label: "Cut", setupMinutes: 1, cycleMinutesPerPart: 0 }],
  finishing: [],
  extras: [],
  ...over,
});

const priced = (rc: RateCard, i: CostInputs) => {
  const out = computeCost(rc, i);
  if (!out.ok) throw new Error(out.issues.map((x) => x.message).join("; "));
  return out.result;
};

describe("exact per-cwt and per-metre prices", () => {
  it("converts without rounding to a whole cent", () => {
    expect(lbPriceCents({ pricePerLbCents: null, pricePerCwtCents: 41_250 })).toBe(412.5);
    expect(lbPriceCents({ pricePerLbCents: 425 })).toBe(425);
    expect(footPriceCents({ pricePerMetreCents: 1_000 })).toBeCloseTo(304.8, 10);
    expect(footPriceCents({ pricePerFootCents: 420 })).toBe(420);
    expect(effectivePrice(plate)).toBe(412.5);
  });

  it("prints sub-cent prices with their digits and whole cents as usual", () => {
    expect(exactMoneyText(412.5, "USD")).toBe("$4.125");
    expect(exactMoneyText(304.8, "USD")).toBe("$3.048");
    expect(exactMoneyText(425, "USD")).toBe("$4.25");
    expect(exactMoneyText(0.25, "USD")).toBe("$0.0025");
  });

  it("prices a per-cwt material at the exact $/lb", () => {
    // 10 lb × 3 parts × 412.5 ¢/lb = 12,375 ¢. Rounded to $4.13/lb first it would be 12,390 ¢.
    const r = priced(card(plate), inputs("a36"));
    expect(r.breaks.map((b) => b.materialCents)).toEqual([12_375, 4_125]);
    expect(r.basis[0]).toMatch(/10 lb per part at \$412\.50\/cwt \(\$4\.125\/lb\)/);
  });

  it("prices a per-metre material at the exact $/ft", () => {
    // 1 ft × 3 parts × 304.8 ¢/ft = 914.4 ¢, so 914 ¢. At a rounded $3.05/ft it would be 915 ¢.
    const r = priced(card(tube), inputs("tube"));
    expect(r.breaks.map((b) => b.materialCents)).toEqual([914, 305]);
    expect(r.basis[0]).toMatch(/12 in per part at \$10\.00\/m \(\$3\.048\/ft\)/);
  });

  it("still asks for a price when neither unit has one", () => {
    const out = computeCost(card({ ...plate, pricePerCwtCents: null }), inputs("a36"));
    expect(out.ok ? [] : out.issues.map((i) => i.code)).toEqual(["material_needs_price"]);
  });

  it("shows the price in the unit the card keeps it in", () => {
    expect(priceText(plate, "USD")).toBe("$412.50/cwt");
    expect(priceText(tube, "USD")).toBe("$10.00/m");
    const before = { ...plate, pricePerCwtCents: 41_250 };
    const after = { ...plate, pricePerCwtCents: 44_000 };
    expect(priceChangeText(after, before, "USD")).toBe("$440.00/cwt, up 6.7% from $412.50/cwt");
  });

  it("dates a unit change as a new price but does not ask open quotes to re-price", () => {
    const perLb = { ...plate, pricePerLbCents: 425, pricePerCwtCents: null };
    const perCwt = { ...plate, pricePerLbCents: null, pricePerCwtCents: 42_500 };
    expect(priceChanged(perLb, perCwt)).toBe(true);
    expect(priceMoved(perLb, perCwt)).toBe(false);
    expect(priceMoved(perLb, { ...perCwt, pricePerCwtCents: 42_600 })).toBe(true);
  });
});

describe("the material editor's schema", () => {
  const base = { name: "A36 plate", pricingBasis: "per_lb" as const };
  it("takes a per-lb material priced per cwt", () => {
    expect(materialInputSchema.safeParse({ ...base, pricePerCwtCents: 41_250 }).success).toBe(true);
  });
  it("refuses a price per lb and per cwt on one material", () => {
    const r = materialInputSchema.safeParse({
      ...base,
      pricePerLbCents: 425,
      pricePerCwtCents: 41_250,
    });
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toMatch(/not both/);
  });
  it("takes a per-foot material priced per metre and refuses both units", () => {
    const ft = { name: "Tube", pricingBasis: "per_ft" as const };
    expect(materialInputSchema.safeParse({ ...ft, pricePerMetreCents: 1_000 }).success).toBe(true);
    expect(
      materialInputSchema.safeParse({ ...ft, pricePerMetreCents: 1_000, pricePerFootCents: 305 })
        .success,
    ).toBe(false);
    expect(materialInputSchema.safeParse(ft).success).toBe(false);
  });
});

const dto: MaterialDto = {
  id: "mat_a36",
  name: "A36 plate",
  pricingBasis: "per_lb",
  pricePerLbCents: 425,
  densityLbPerIn3: 0.284,
  sheetThicknessIn: null,
  sheetWidthIn: null,
  sheetLengthIn: null,
  nestGapIn: null,
  stockPriceCents: null,
  stockDescription: null,
  pricePerFootCents: null,
  pricePerCwtCents: null,
  pricePerMetreCents: null,
  cutAllowanceIn: null,
  barLengthIn: null,
  barRemnantIn: null,
  scrapBps: 0,
  minChargeCents: 0,
  active: true,
  priceSetAt: "2026-11-01T00:00:00.000Z",
};

describe("a supplier's per-cwt or per-metre price list in the rate-card import", () => {
  it("reads a cwt column as the supplier quotes it", () => {
    const sheet = readRateSheet("materials", parseCsv("Material,Price/cwt\nA36 plate,412.50\n"));
    expect(sheet.ignored).toEqual([]);
    expect(sheet.rows[0]?.values).toEqual({
      name: "A36 plate",
      pricePerCwtCents: 41_250,
      pricingBasis: "per_lb",
    });
  });

  it("reads a per-metre column as per-foot stock", () => {
    const sheet = readRateSheet(
      "materials",
      parseCsv("Material,Price per metre\n6063 tube 1 in OD,10.00\n"),
    );
    expect(sheet.rows[0]?.values).toEqual({
      name: "6063 tube 1 in OD",
      pricePerMetreCents: 1_000,
      pricingBasis: "per_ft",
    });
  });

  it("replaces the card's $/lb with the sheet's cwt price", () => {
    const sheet = readRateSheet(
      "materials",
      parseCsv("Material,Price per cwt\nA36 plate,412.50\n"),
    );
    const plan = planRateImport("materials", sheet.rows, [dto]);
    expect(plan.errors).toEqual([]);
    const row = plan.rows[0];
    expect(row?.values.pricePerLbCents).toBeNull();
    expect(row?.values.pricePerCwtCents).toBe(41_250);
    expect(row?.changes).toEqual(["Price per lb", "Price per cwt"]);
  });

  it("refuses a row with both a price per lb and a price per cwt", () => {
    const sheet = readRateSheet(
      "materials",
      parseCsv("Material,Price per lb,Price per cwt\nA36 plate,4.25,412.50\n"),
    );
    const plan = planRateImport("materials", sheet.rows, [dto]);
    expect(plan.rows).toEqual([]);
    expect(plan.errors[0]?.message).toMatch(/per lb or per cwt, not both/);
  });

  it("exports a cwt row the import reads back as no change", () => {
    const cwt = { ...dto, pricePerLbCents: null, pricePerCwtCents: 41_250 };
    const csv = exportRateCsv("materials", [cwt]);
    expect(csv).toContain("A36 plate,per lb,,412.50,");
    const sheet = readRateSheet("materials", parseCsv(csv));
    expect(sheet.errors).toEqual([]);
    const plan = planRateImport("materials", sheet.rows, [cwt]);
    expect(plan.errors).toEqual([]);
    expect(plan.rows.map((r) => [r.action, r.changes])).toEqual([["update", []]]);
  });
});
