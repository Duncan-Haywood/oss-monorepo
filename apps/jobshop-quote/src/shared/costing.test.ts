import { describe, expect, it } from "vitest";
import {
  blankFromBoundingBox,
  blankFromFlatPattern,
  blankVolumeIn3,
  blankWeightLb,
  type CostInputs,
  computeCost,
  type DrillingMachine,
  drilledHoleSizes,
  extraPecks,
  type FlatPatternMeasures,
  type HoleLocationMeasures,
  MAX_DRILLED_DIAMETER_IN,
  type RateCard,
  type SheetMetalMachine,
  suggestBendingOperation,
  suggestCuttingOperation,
  suggestCycleMinutes,
  suggestDrillingOperation,
  suggestRoughingOperation,
  suggestTappingOperation,
  type TappingMachine,
} from "./costing";

const card: RateCard = {
  laborMarkupBps: 2500,
  materialMarkupBps: 1500,
  outsideServiceMarkupBps: 2000,
  minimumLineCents: 25_000,
  machines: [
    { id: "vmc", name: "Haas VF-2", hourlyRateCents: 9_500, setupRateCents: null },
    { id: "lathe", name: "Lathe", hourlyRateCents: 8_500, setupRateCents: 6_000 },
  ],
  materials: [
    {
      id: "al",
      name: "6061-T6 plate",
      pricingBasis: "per_lb",
      pricePerLbCents: 450,
      densityLbPerIn3: 0.0975,
      stockPriceCents: null,
      stockDescription: null,
      scrapBps: 1_000,
      minChargeCents: 2_500,
    },
    {
      id: "ss",
      name: "303 stainless bar",
      pricingBasis: "per_stock",
      pricePerLbCents: null,
      densityLbPerIn3: null,
      stockPriceCents: 12_000,
      stockDescription: "0.75 in round x 12 ft",
      scrapBps: 0,
      minChargeCents: 0,
    },
  ],
  finishingOps: [
    {
      id: "anod",
      name: "Anodize II",
      perPartCents: 300,
      lotChargeCents: 15_000,
      outsideService: true,
    },
    { id: "deburr", name: "Deburr", perPartCents: 100, lotChargeCents: 0, outsideService: false },
  ],
};

const bracket: CostInputs = {
  quantities: [1, 10, 100],
  customerSuppliedMaterial: false,
  material: {
    materialId: "al",
    blank: { shape: "rect", lengthIn: 4, widthIn: 2, thicknessIn: 1 },
    partsPerStock: null,
  },
  operations: [{ machineId: "vmc", label: "Mill", setupMinutes: 60, cycleMinutesPerPart: 12 }],
  finishing: [{ opId: "anod" }],
  extras: [],
};

function priced(inputs: CostInputs, rc = card) {
  const out = computeCost(rc, inputs);
  if (!out.ok) throw new Error(`unexpected issues: ${JSON.stringify(out.issues)}`);
  return out.result;
}

describe("computeCost", () => {
  it("prices each quantity break from the rate card (hand-checked)", () => {
    const r = priced(bracket);
    // 4x2x1 in = 8 in3 x 0.0975 lb/in3 = 0.78 lb
    expect(r.blankWeightLb).toBeCloseTo(0.78, 6);
    expect(r.breaks[0]).toEqual({
      quantity: 1,
      materialCents: 2_500, // 0.78 x $4.50 x 1.10 = $3.86, raised to the $25 material minimum
      setupCents: 9_500, // 60 min at $95/h
      runCents: 1_900, // 12 min at $95/h
      finishingCents: 15_000, // anodize lot charge beats $3 x 1
      extrasCents: 0,
      costCents: 28_900,
      markupCents: 6_225, // 375 material + 2,850 labor + 3,000 outside
      minimumAdjustmentCents: 0,
      unitPriceCents: 35_125,
      totalCents: 35_125,
    });
    expect(r.breaks[1]).toMatchObject({
      quantity: 10,
      materialCents: 3_861,
      runCents: 19_000,
      finishingCents: 15_000,
      costCents: 47_361,
      markupCents: 10_704,
      unitPriceCents: 5_807, // ceil(58,065 / 10)
      totalCents: 58_070,
    });
    expect(r.breaks[2]).toMatchObject({
      quantity: 100,
      materialCents: 38_610,
      runCents: 190_000,
      finishingCents: 30_000, // $3 x 100 beats the lot charge
      costCents: 268_110,
      markupCents: 61_667,
      unitPriceCents: 3_298,
      totalCents: 329_800,
    });
  });

  it("unit price falls as quantity rises (setup and lot charges amortise)", () => {
    const units = priced(bracket).breaks.map((b) => b.unitPriceCents);
    expect(units[0]).toBeGreaterThan(units[1] ?? 0);
    expect(units[1]).toBeGreaterThan(units[2] ?? 0);
  });

  it("raises a small line to the line minimum", () => {
    const r = priced({
      ...bracket,
      quantities: [1],
      customerSuppliedMaterial: true,
      material: null,
      operations: [{ machineId: "vmc", label: "", setupMinutes: 6, cycleMinutesPerPart: 1 }],
      finishing: [],
    });
    expect(r.breaks[0]).toMatchObject({
      materialCents: 0,
      setupCents: 950,
      runCents: 158,
      costCents: 1_108,
      markupCents: 277,
      minimumAdjustmentCents: 23_615,
      unitPriceCents: 25_000,
      totalCents: 25_000,
    });
    expect(r.basis).toContain("Material: customer-supplied");
  });

  it("buys whole stock pieces for per-stock materials and uses the setup rate", () => {
    const r = priced({
      ...bracket,
      quantities: [50],
      material: { materialId: "ss", blank: null, partsPerStock: 20 },
      operations: [{ machineId: "lathe", label: "Turn", setupMinutes: 30, cycleMinutesPerPart: 2 }],
      finishing: [{ opId: "deburr" }],
    });
    const b = r.breaks[0];
    expect(b?.materialCents).toBe(36_000); // ceil(50/20) = 3 bars x $120
    expect(b?.setupCents).toBe(3_000); // 30 min at the $60/h setup rate
    expect(b?.runCents).toBe(14_167); // 2 min x 50 = 100 min at $85/h
    expect(b?.finishingCents).toBe(5_000); // in-house deburr $1 x 50
    // in-house finishing takes the labor markup, not the outside-service markup
    expect(b?.markupCents).toBe(5_400 + 5_542); // 15% of 36,000 + 25% of 22,167
    expect(r.snapshot.materials.map((m) => m.id)).toEqual(["ss"]);
    expect(r.snapshot.machines.map((m) => m.id)).toEqual(["lathe"]);
  });

  it("marks up extras (purchased items) at the material rate", () => {
    const r = priced({
      ...bracket,
      quantities: [10],
      extras: [{ label: "Helicoil inserts", perPartCents: 150, lotCents: 1_000 }],
    });
    const base = priced({ ...bracket, quantities: [10] }).breaks[0];
    const b = r.breaks[0];
    expect(b?.extrasCents).toBe(2_500);
    expect((b?.markupCents ?? 0) - (base?.markupCents ?? 0)).toBe(375);
  });

  it("snapshots only the rate rows the line used", () => {
    const r = priced(bracket);
    expect(r.snapshot.machines).toEqual([card.machines[0]]);
    expect(r.snapshot.finishingOps).toEqual([card.finishingOps[0]]);
    expect(r.snapshot.laborMarkupBps).toBe(2500);
  });

  it("is deterministic", () => {
    expect(computeCost(card, bracket)).toEqual(computeCost(card, bracket));
  });

  describe("never guesses a missing price", () => {
    const codes = (inputs: CostInputs, rc = card) => {
      const out = computeCost(rc, inputs);
      return out.ok ? [] : out.issues.map((i) => i.code);
    };

    it("requires a material choice or an explicit customer-supplied flag", () => {
      expect(codes({ ...bracket, material: null })).toEqual(["material_not_chosen"]);
    });
    it("requires at least one operation", () => {
      expect(codes({ ...bracket, operations: [] })).toEqual(["no_operations"]);
    });
    it("rejects machines, materials and finishing not on the rate card", () => {
      expect(
        codes({
          ...bracket,
          material: { materialId: "ti", blank: null, partsPerStock: null },
          operations: [
            { machineId: "edm", label: "Wire", setupMinutes: 1, cycleMinutesPerPart: 1 },
          ],
          finishing: [{ opId: "plating" }],
        }),
      ).toEqual(["unknown_material", "unknown_machine", "unknown_finishing_op"]);
    });
    it("needs a blank for per-lb material and parts-per-stock for stock material", () => {
      expect(
        codes({ ...bracket, material: { materialId: "al", blank: null, partsPerStock: null } }),
      ).toEqual(["material_needs_blank"]);
      expect(
        codes({ ...bracket, material: { materialId: "ss", blank: null, partsPerStock: null } }),
      ).toEqual(["material_needs_parts_per_stock"]);
    });
    it("needs a density to weigh a dimensioned blank, but accepts a weight", () => {
      const noDensity: RateCard = {
        ...card,
        materials: card.materials.map((m) => (m.id === "al" ? { ...m, densityLbPerIn3: null } : m)),
      };
      expect(codes(bracket, noDensity)).toEqual(["material_needs_density"]);
      expect(
        codes(
          {
            ...bracket,
            material: {
              materialId: "al",
              blank: { shape: "weight", weightLb: 1 },
              partsPerStock: null,
            },
          },
          noDensity,
        ),
      ).toEqual([]);
    });
    it("rejects duplicate quantity breaks", () => {
      expect(codes({ ...bracket, quantities: [10, 10] })).toEqual(["duplicate_quantity"]);
    });
    it("rejects invalid inputs outright", () => {
      expect(() => computeCost(card, { ...bracket, quantities: [0] })).toThrow();
      expect(() => computeCost(card, { ...bracket, quantities: [] })).toThrow();
    });
  });
});

describe("geometry helpers", () => {
  it("computes blank volume and weight", () => {
    expect(blankVolumeIn3({ shape: "round", diameterIn: 2, lengthIn: 3 })).toBeCloseTo(9.4248, 3);
    expect(
      blankWeightLb({ shape: "rect", lengthIn: 10, widthIn: 1, thicknessIn: 1 }, 0.284),
    ).toBeCloseTo(2.84);
    expect(
      blankWeightLb({ shape: "rect", lengthIn: 1, widthIn: 1, thicknessIn: 1 }, null),
    ).toBeNull();
    expect(blankWeightLb({ shape: "weight", weightLb: 3 }, null)).toBe(3);
  });

  it("sizes a blank from a bounding box with stock allowance, rounded up to 1/8 in", () => {
    expect(blankFromBoundingBox({ xIn: 3.9, yIn: 1, zIn: 0.5 })).toEqual({
      shape: "rect",
      thicknessIn: 0.75,
      widthIn: 1.25,
      lengthIn: 4.25,
    });
  });

  it("sizes a sheet blank from a flat pattern and the material's sheet thickness", () => {
    const flat = { widthIn: 12.3, heightIn: 6.45, confidence: "high" as const };
    const blank = blankFromFlatPattern(flat, 0.09);
    // Longer side is the length; each side rounds up to 1/8 in; thickness is the card's, unrounded.
    expect(blank).toEqual({ shape: "rect", lengthIn: 12.375, widthIn: 6.5, thicknessIn: 0.09 });
    // 12.375 × 6.5 × 0.09 in³ of 5052 at 0.0968 lb/in³.
    expect(blankWeightLb(blank as NonNullable<typeof blank>, 0.0968)).toBeCloseTo(0.7008, 4);
    expect(blankFromFlatPattern({ ...flat, widthIn: 6 }, 0.09)).toMatchObject({ widthIn: 6 });
  });

  it("gives no sheet blank without a thickness, a size, or with a low-confidence size", () => {
    const flat = { widthIn: 10, heightIn: 4, confidence: "medium" as const };
    expect(blankFromFlatPattern(flat, null)).toBeNull();
    expect(blankFromFlatPattern(flat, 0)).toBeNull();
    expect(blankFromFlatPattern({ ...flat, heightIn: 0 }, 0.125)).toBeNull();
    expect(blankFromFlatPattern({ ...flat, confidence: "low" }, 0.125)).toBeNull();
    expect(blankFromFlatPattern({ ...flat, confidence: null }, 0.125)).not.toBeNull();
  });

  it("suggests cycle minutes only when all inputs are known", () => {
    expect(suggestCycleMinutes(10, 4, 2)).toBe(3);
    expect(suggestCycleMinutes(10, null, 2)).toBeNull();
    expect(suggestCycleMinutes(10, 4, null)).toBeNull();
  });
});

describe("suggestRoughingOperation (CAD → run time, a suggestion)", () => {
  const blank = { shape: "rect", lengthIn: 4, widthIn: 2, thicknessIn: 1 } as const; // 8 in³
  const vmc = { id: "vmc", name: "VMC", defaultSetupMinutes: 45, removalRateIn3PerMin: 2 };
  const part = { volumeIn3: 3, volumeConfidence: "high" } as const;

  it("prices the removed volume at the one measured removal rate", () => {
    expect(suggestRoughingOperation(part, blank, [vmc])).toEqual({
      machineId: "vmc",
      label: "Rough from CAD: 5 in³ removed at 2 in³/min",
      setupMinutes: 45,
      cycleMinutesPerPart: 2.5,
    });
  });

  it("ignores machines with no measured rate", () => {
    const lathe = { ...vmc, id: "lathe", removalRateIn3PerMin: null };
    expect(suggestRoughingOperation(part, blank, [lathe, vmc])?.machineId).toBe("vmc");
  });

  it("suggests nothing when the choice or the numbers are not the app's to make", () => {
    const hmc = { ...vmc, id: "hmc" };
    expect(suggestRoughingOperation(part, blank, [vmc, hmc])).toBeNull(); // two candidates
    expect(suggestRoughingOperation(part, blank, [])).toBeNull();
    expect(suggestRoughingOperation(part, null, [vmc])).toBeNull();
    expect(
      suggestRoughingOperation({ volumeIn3: null, volumeConfidence: null }, blank, [vmc]),
    ).toBeNull();
    expect(suggestRoughingOperation({ ...part, volumeConfidence: "low" }, blank, [vmc])).toBeNull();
    expect(suggestRoughingOperation({ ...part, volumeIn3: 9 }, blank, [vmc])).toBeNull(); // nothing removed
    expect(suggestRoughingOperation(part, { shape: "weight", weightLb: 2 }, [vmc])).toBeNull();
  });

  describe("removal rate per material", () => {
    const lathe = { ...vmc, id: "lathe", name: "Lathe", defaultSetupMinutes: 20 };
    const al = { id: "al", name: "6061 plate" };
    const ti = { id: "ti", name: "Ti-6Al-4V bar" };
    const rates = [
      { machineId: "vmc", materialId: "al", removalRateIn3PerMin: 5 },
      { machineId: "lathe", materialId: "ti", removalRateIn3PerMin: 0.5 },
    ];

    it("uses the material's rate, and the machine that has it, over the defaults", () => {
      // Two machines with a default rate would be the estimator's call; the 6061 row picks one.
      expect(suggestRoughingOperation(part, blank, [vmc, lathe], al, rates)).toEqual({
        machineId: "vmc",
        label: "Rough from CAD: 5 in³ removed at 5 in³/min (rate for 6061 plate)",
        setupMinutes: 45,
        cycleMinutesPerPart: 1,
      });
      expect(suggestRoughingOperation(part, blank, [vmc, lathe], ti, rates)).toMatchObject({
        machineId: "lathe",
        cycleMinutesPerPart: 10,
      });
    });

    it("falls back to the one default rate when the material has none", () => {
      const steel = { id: "steel", name: "4140" };
      expect(suggestRoughingOperation(part, blank, [vmc], steel, rates)?.label).toBe(
        "Rough from CAD: 5 in³ removed at 2 in³/min",
      );
      expect(suggestRoughingOperation(part, blank, [vmc], null, rates)?.cycleMinutesPerPart).toBe(
        2.5,
      );
    });

    it("ignores rates for machines not offered (retired), and leaves a tie to the estimator", () => {
      // The VMC's 6061 row is ignored when only the lathe is active: its default applies.
      expect(suggestRoughingOperation(part, blank, [lathe], al, rates)?.label).toBe(
        "Rough from CAD: 5 in³ removed at 2 in³/min",
      );
      const both = [...rates, { machineId: "lathe", materialId: "al", removalRateIn3PerMin: 3 }];
      expect(suggestRoughingOperation(part, blank, [vmc, lathe], al, both)).toBeNull();
    });
  });
});

describe("sheet-metal suggestions from a DXF flat pattern", () => {
  const flat: FlatPatternMeasures = {
    cutLengthIn: 84.25,
    pierceCount: 5,
    bendLineCount: 2,
    measuresConfidence: "high",
    holesConfidence: "high",
    bendsConfidence: "high",
  };
  const none = { cutSpeedInPerMin: null, pierceSeconds: null, secondsPerBend: null };
  const laser: SheetMetalMachine = {
    id: "laser",
    name: "Fiber laser",
    defaultSetupMinutes: 15,
    ...none,
    cutSpeedInPerMin: 300,
    pierceSeconds: 1.5,
  };
  const brake: SheetMetalMachine = {
    id: "brake",
    name: "Press brake",
    defaultSetupMinutes: 20,
    ...none,
    secondsPerBend: 8,
  };
  const mill: SheetMetalMachine = { id: "vmc", name: "VMC", defaultSetupMinutes: 45, ...none };

  it("prices the cut path at the cut speed plus one pierce per contour", () => {
    // 84.25 / 300 = 0.2808 min + 5 × 1.5 s = 0.125 min -> 0.4058, rounded up to 0.41
    expect(suggestCuttingOperation(flat, [mill, laser, brake])).toEqual({
      machineId: "laser",
      label: "Cut from DXF: 84.3 in at 300 in/min + 5 pierces × 1.5 s",
      setupMinutes: 15,
      cycleMinutesPerPart: 0.41,
    });
  });

  it("says when the rate card has no pierce time", () => {
    const op = suggestCuttingOperation(flat, [{ ...laser, pierceSeconds: null }]);
    expect(op?.label).toBe("Cut from DXF: 84.3 in at 300 in/min (no pierce time on the rate card)");
    expect(op?.cycleMinutesPerPart).toBe(0.29);
  });

  describe("cut speed per material and thickness", () => {
    const plasma: SheetMetalMachine = {
      ...laser,
      id: "plasma",
      name: "Plasma table",
      cutSpeedInPerMin: 120,
      pierceSeconds: 1,
    };
    const ss14 = { id: "ss14", name: "304 SS 14 ga" };
    const plate = { id: "a36-050", name: "A36 plate 0.5 in" };
    const speeds = [
      { machineId: "laser", materialId: "ss14", cutSpeedInPerMin: 150, pierceSeconds: null },
      { machineId: "plasma", materialId: "a36-050", cutSpeedInPerMin: 80, pierceSeconds: 3 },
    ];

    it("uses the material's speed and the machine's pierce time when the row has none", () => {
      // 84.25 / 150 = 0.5617 min + 5 × 1.5 s = 0.125 min -> 0.6867, rounded up to 0.69
      expect(suggestCuttingOperation(flat, [laser, plasma], ss14, speeds)).toEqual({
        machineId: "laser",
        label: "Cut from DXF: 84.3 in at 150 in/min + 5 pierces × 1.5 s (rate for 304 SS 14 ga)",
        setupMinutes: 15,
        cycleMinutesPerPart: 0.69,
      });
    });

    it("picks the one machine with a speed for the material, with that row's pierce time", () => {
      // two machines have a default speed (no suggestion without rows); only plasma cuts the plate
      expect(suggestCuttingOperation(flat, [laser, plasma])).toBeNull();
      // 84.25 / 80 = 1.0531 + 5 × 3 s = 0.25 -> 1.3031 -> 1.31
      expect(suggestCuttingOperation(flat, [laser, plasma], plate, speeds)).toMatchObject({
        machineId: "plasma",
        cycleMinutesPerPart: 1.31,
      });
    });

    it("falls back to the machine default when the material has no row", () => {
      const other = { id: "al", name: "5052 0.063" };
      expect(suggestCuttingOperation(flat, [mill, laser], other, speeds)).toMatchObject({
        machineId: "laser",
        label: "Cut from DXF: 84.3 in at 300 in/min + 5 pierces × 1.5 s",
      });
    });

    it("suggests nothing when two machines have a speed for the material", () => {
      const both = [
        ...speeds,
        { machineId: "plasma", materialId: "ss14", cutSpeedInPerMin: 90, pierceSeconds: null },
      ];
      expect(suggestCuttingOperation(flat, [laser, plasma], ss14, both)).toBeNull();
    });

    it("ignores rows for a machine that is not among the active ones", () => {
      // the laser is retired: its row for 14 ga does not count, and the plasma default applies
      expect(suggestCuttingOperation(flat, [plasma], ss14, speeds)).toMatchObject({
        machineId: "plasma",
        label: "Cut from DXF: 84.3 in at 120 in/min + 5 pierces × 1 s",
      });
    });
  });

  it("prices the bend lines at the brake's seconds per bend", () => {
    expect(suggestBendingOperation(flat, [mill, laser, brake])).toEqual({
      machineId: "brake",
      label: "Bend from DXF: 2 bend lines × 8 s",
      setupMinutes: 20,
      cycleMinutesPerPart: 0.27,
    });
  });

  it("suggests no cut when the machine or the measurement is not the app's to pick", () => {
    expect(suggestCuttingOperation(flat, [laser, { ...laser, id: "plasma" }])).toBeNull();
    expect(suggestCuttingOperation(flat, [mill, brake])).toBeNull();
    expect(suggestCuttingOperation({ ...flat, measuresConfidence: "low" }, [laser])).toBeNull();
    expect(suggestCuttingOperation({ ...flat, holesConfidence: "low" }, [laser])).toBeNull();
    expect(suggestCuttingOperation({ ...flat, cutLengthIn: 0 }, [laser])).toBeNull();
  });

  it("suggests no bend from dashed lines alone, no bend lines, or two brakes", () => {
    expect(suggestBendingOperation({ ...flat, bendsConfidence: "low" }, [brake])).toBeNull();
    expect(suggestBendingOperation({ ...flat, bendsConfidence: null }, [brake])).toBeNull();
    expect(suggestBendingOperation({ ...flat, bendLineCount: 0 }, [brake])).toBeNull();
    expect(suggestBendingOperation(flat, [brake, { ...brake, id: "brake2" }])).toBeNull();
  });
});

describe("drilling suggestion from STEP hole locations", () => {
  // the NEMA 17 bracket: four Ø3.3 mm screw holes and a Ø32 mm shaft bore, 3 mm plate
  const bracket: HoleLocationMeasures = {
    locations: [
      ...Array.from({ length: 4 }, () => ({ diametersIn: [0.1299], depthIn: 0.1181 })),
      { diametersIn: [1.2598], depthIn: 0.1181 },
    ],
    holesConfidence: "high",
  };
  const vmc: DrillingMachine = {
    id: "vmc",
    name: "VMC",
    defaultSetupMinutes: 45,
    secondsPerHole: 9,
  };
  const lathe: DrillingMachine = {
    id: "lathe",
    name: "Lathe",
    defaultSetupMinutes: 30,
    secondsPerHole: null,
  };

  it("times each drill-sized location and leaves the bore to the estimator", () => {
    // 4 × 9 s = 36 s = 0.6 min
    expect(suggestDrillingOperation(bracket, [lathe, vmc])).toEqual({
      machineId: "vmc",
      label: "Drill from CAD: 4 holes × 9 s (1 bore over 1 in left out)",
      setupMinutes: 45,
      cycleMinutesPerPart: 0.6,
    });
  });

  it("counts a counterbored hole once and says it is stepped", () => {
    const op = suggestDrillingOperation(
      {
        locations: [
          { diametersIn: [0.26, 0.433], depthIn: 0.75 },
          { diametersIn: [0.26, 0.433], depthIn: 0.75 },
          { diametersIn: [0.201], depthIn: 0.5 },
        ],
        holesConfidence: "medium",
      },
      [vmc],
    );
    // 3 × 9 s = 27 s = 0.45 min
    expect(op).toMatchObject({
      label: "Drill from CAD: 3 holes × 9 s (2 stepped)",
      cycleMinutesPerPart: 0.45,
    });
  });

  it("does not count the setup twice on the roughing machine", () => {
    expect(suggestDrillingOperation(bracket, [vmc], ["vmc"])?.setupMinutes).toBe(0);
    expect(suggestDrillingOperation(bracket, [vmc], ["other"])?.setupMinutes).toBe(45);
  });

  it("drills a hole exactly at the limit, and rounds a short cycle up", () => {
    const one = suggestDrillingOperation(
      {
        locations: [{ diametersIn: [MAX_DRILLED_DIAMETER_IN], depthIn: 1 }],
        holesConfidence: "high",
      },
      [{ ...vmc, secondsPerHole: 1 }],
    );
    // 1 s = 0.01667 min, up to 0.02
    expect(one).toMatchObject({ label: "Drill from CAD: 1 hole × 1 s", cycleMinutesPerPart: 0.02 });
  });

  it("adds each hole's depth at the machine's drill feed", () => {
    const plate: HoleLocationMeasures = {
      locations: [
        ...Array.from({ length: 6 }, () => ({ diametersIn: [0.257], depthIn: 0.5 })),
        { diametersIn: [0.201, 0.39], depthIn: 1 },
      ],
      holesConfidence: "high",
    };
    // 7 × 4 s = 28 s; 3 + 1 = 4 in at 8 in/min = 0.5 min; 0.4667 + 0.5 = 0.9667, up to 0.97
    expect(
      suggestDrillingOperation(plate, [{ ...vmc, secondsPerHole: 4, drillFeedInPerMin: 8 }]),
    ).toEqual({
      machineId: "vmc",
      label: "Drill from CAD: 7 holes × 4 s + 4 in deep at 8 in/min (1 stepped, 1 deep, over 3×D)",
      setupMinutes: 45,
      cycleMinutesPerPart: 0.97,
    });
  });

  it("times by feed alone when the machine has no seconds per hole", () => {
    const op = suggestDrillingOperation(
      { locations: [{ diametersIn: [0.25], depthIn: 1.5 }], holesConfidence: "medium" },
      [lathe, { ...vmc, secondsPerHole: null, drillFeedInPerMin: 6 }],
    );
    // 1.5 in at 6 in/min = 0.25 min; 1.5 > 3 × 0.25, so it is called deep
    expect(op).toMatchObject({
      machineId: "vmc",
      label: "Drill from CAD: 1 hole, 1.5 in deep at 6 in/min (1 deep, over 3×D)",
      cycleMinutesPerPart: 0.25,
    });
  });

  it("says how many holes had no depth, and still times the rest", () => {
    const op = suggestDrillingOperation(
      {
        locations: [
          { diametersIn: [0.25], depthIn: 0.5 },
          { diametersIn: [0.25], depthIn: 0 },
        ],
        holesConfidence: "high",
      },
      [{ ...vmc, secondsPerHole: 3, drillFeedInPerMin: 10 }],
    );
    // 2 × 3 s = 0.1 min + 0.5 in / 10 = 0.05 min
    expect(op).toMatchObject({
      label: "Drill from CAD: 2 holes × 3 s + 0.5 in deep at 10 in/min (1 without a depth)",
      cycleMinutesPerPart: 0.15,
    });
  });

  it("picks one machine among those with either drilling rate", () => {
    expect(suggestDrillingOperation(bracket, [vmc, { ...lathe, drillFeedInPerMin: 5 }])).toBeNull();
  });

  it("suggests nothing it cannot back", () => {
    expect(suggestDrillingOperation({ ...bracket, holesConfidence: "low" }, [vmc])).toBeNull();
    expect(suggestDrillingOperation({ ...bracket, holesConfidence: null }, [vmc])).toBeNull();
    expect(suggestDrillingOperation(bracket, [lathe])).toBeNull();
    expect(suggestDrillingOperation(bracket, [vmc, { ...vmc, id: "vmc2" }])).toBeNull();
    expect(suggestDrillingOperation({ locations: [], holesConfidence: "high" }, [vmc])).toBeNull();
    expect(
      suggestDrillingOperation(
        { locations: [{ diametersIn: [2], depthIn: 1 }], holesConfidence: "high" },
        [vmc],
      ),
    ).toBeNull();
  });
});

describe("peck cycles on deep holes", () => {
  const vmc: DrillingMachine = {
    id: "vmc",
    name: "VMC",
    defaultSetupMinutes: 45,
    secondsPerHole: null,
    drillFeedInPerMin: 6,
  };
  const deepHole: HoleLocationMeasures = {
    locations: [{ diametersIn: [0.25], depthIn: 1.5 }],
    holesConfidence: "high",
  };

  it("counts the retracts beyond the first plunge, on deep holes only", () => {
    // 1.5 in at Ø0.25 is 6×D: six 1×D plunges, five extra retracts
    expect(extraPecks(1.5, 0.25, 1)).toBe(5);
    // 0.8 in at Ø0.25 is 3.2×D: ceil(3.2 / 1.5) = 3 plunges, 2 extra
    expect(extraPecks(0.8, 0.25, 1.5)).toBe(2);
    // exactly 3×D is not deep: one plunge
    expect(extraPecks(0.75, 0.25, 1)).toBe(0);
    // a peck deeper than the hole: one plunge
    expect(extraPecks(1, 0.25, 5)).toBe(0);
    expect(extraPecks(0, 0.25, 1)).toBe(0);
    expect(extraPecks(1, 0, 1)).toBe(0);
    expect(extraPecks(1, 0.25, 0)).toBe(0);
  });

  it("adds the machine's seconds per peck to the drilling cycle", () => {
    const op = suggestDrillingOperation(deepHole, [
      { ...vmc, peckDepthDiameters: 1, secondsPerPeck: 2 },
    ]);
    // 1.5 in at 6 in/min = 0.25 min; 5 pecks × 2 s = 10 s = 0.1667 min; 0.4167, up to 0.42
    expect(op).toEqual({
      machineId: "vmc",
      label:
        "Drill from CAD: 1 hole, 1.5 in deep at 6 in/min + 5 pecks × 2 s (1 deep, pecked every 1×D)",
      setupMinutes: 45,
      cycleMinutesPerPart: 0.42,
    });
  });

  it("pecks only the deep holes on a part with both", () => {
    const op = suggestDrillingOperation(
      {
        locations: [
          { diametersIn: [0.25], depthIn: 0.5 },
          { diametersIn: [0.25], depthIn: 0.5 },
          { diametersIn: [0.201], depthIn: 1 },
        ],
        holesConfidence: "high",
      },
      [
        {
          ...vmc,
          secondsPerHole: 4,
          drillFeedInPerMin: 8,
          peckDepthDiameters: 1.5,
          secondsPerPeck: 1.5,
        },
      ],
    );
    // 3 × 4 s = 12 s; 2 in at 8 in/min = 0.25 min; the Ø0.201 × 1 in hole is 4.98×D:
    // ceil(4.98 / 1.5) = 4 plunges, 3 pecks × 1.5 s = 4.5 s; 16.5 s = 0.275 + 0.25 = 0.525, up to 0.53
    expect(op).toMatchObject({
      label:
        "Drill from CAD: 3 holes × 4 s + 2 in deep at 8 in/min + 3 pecks × 1.5 s (1 deep, pecked every 1.5×D)",
      cycleMinutesPerPart: 0.53,
    });
  });

  it("only flags deep holes when the rate card lacks either peck value", () => {
    for (const m of [
      { ...vmc, peckDepthDiameters: 1 },
      { ...vmc, secondsPerPeck: 2 },
      { ...vmc, peckDepthDiameters: 1, secondsPerPeck: null },
    ]) {
      expect(suggestDrillingOperation(deepHole, [m])).toMatchObject({
        label: "Drill from CAD: 1 hole, 1.5 in deep at 6 in/min (1 deep, over 3×D)",
        cycleMinutesPerPart: 0.25,
      });
    }
  });

  it("leaves shallow holes as one plunge", () => {
    const op = suggestDrillingOperation(
      { locations: [{ diametersIn: [0.25], depthIn: 0.75 }], holesConfidence: "high" },
      [{ ...vmc, peckDepthDiameters: 0.5, secondsPerPeck: 2 }],
    );
    expect(op).toMatchObject({
      label: "Drill from CAD: 1 hole, 0.75 in deep at 6 in/min",
      cycleMinutesPerPart: 0.13,
    });
  });
});

describe("drilling at the line material's feed", () => {
  // six 1/4 in holes 0.5 in deep in a 304 stainless plate
  const plate: HoleLocationMeasures = {
    locations: Array.from({ length: 6 }, () => ({ diametersIn: [0.25], depthIn: 0.5 })),
    holesConfidence: "high",
  };
  const vmc: DrillingMachine = {
    id: "vmc",
    name: "VMC",
    defaultSetupMinutes: 45,
    secondsPerHole: 4,
    drillFeedInPerMin: 12,
  };
  const press: DrillingMachine = {
    id: "press",
    name: "Drill press",
    defaultSetupMinutes: 10,
    secondsPerHole: 20,
    drillFeedInPerMin: null,
  };
  const ss304 = { id: "ss304", name: "304 SS plate" };
  const al = { id: "al", name: "6061 plate" };
  const feeds = [
    { machineId: "vmc", materialId: "ss304", drillFeedInPerMin: 3 },
    { machineId: "vmc", materialId: "al", drillFeedInPerMin: 15 },
  ];

  it("uses the material's feed with the machine's seconds per hole", () => {
    // 6 × 4 s = 0.4 min; 3 in at 3 in/min = 1 min
    expect(suggestDrillingOperation(plate, [vmc], [], ss304, feeds)).toEqual({
      machineId: "vmc",
      label: "Drill from CAD: 6 holes × 4 s + 3 in deep at 3 in/min (feed for 304 SS plate)",
      setupMinutes: 45,
      cycleMinutesPerPart: 1.4,
    });
    // 3 in at 15 in/min = 0.2 min
    expect(suggestDrillingOperation(plate, [vmc], [], al, feeds)?.cycleMinutesPerPart).toBe(0.6);
  });

  it("chooses the machine with a feed for the material over the others", () => {
    // without the material, two machines time holes and the estimator picks
    expect(suggestDrillingOperation(plate, [vmc, press])).toBeNull();
    expect(suggestDrillingOperation(plate, [vmc, press], [], ss304, feeds)).toMatchObject({
      machineId: "vmc",
      cycleMinutesPerPart: 1.4,
    });
  });

  it("times a machine with only a material feed by depth alone", () => {
    const bare = { ...vmc, secondsPerHole: null, drillFeedInPerMin: null };
    expect(suggestDrillingOperation(plate, [bare], [], ss304, feeds)).toMatchObject({
      label: "Drill from CAD: 6 holes, 3 in deep at 3 in/min (feed for 304 SS plate)",
      cycleMinutesPerPart: 1,
    });
    expect(suggestDrillingOperation(plate, [bare], [], null, feeds)).toBeNull();
  });

  it("falls back to the machine's own feed for a material with no row", () => {
    const brass = { id: "brass", name: "360 brass" };
    // 0.4 min + 3 in at 12 in/min = 0.25 min
    expect(suggestDrillingOperation(plate, [vmc], [], brass, feeds)).toMatchObject({
      label: "Drill from CAD: 6 holes × 4 s + 3 in deep at 12 in/min",
      cycleMinutesPerPart: 0.65,
    });
  });

  it("ignores a feed on a machine not given (retired) and leaves a tie to the estimator", () => {
    const retired = [{ machineId: "gone", materialId: "ss304", drillFeedInPerMin: 2 }];
    expect(suggestDrillingOperation(plate, [vmc], [], ss304, retired)).toMatchObject({
      label: "Drill from CAD: 6 holes × 4 s + 3 in deep at 12 in/min",
    });
    const both = [...feeds, { machineId: "press", materialId: "ss304", drillFeedInPerMin: 2 }];
    expect(suggestDrillingOperation(plate, [vmc, press], [], ss304, both)).toBeNull();
  });
});

describe("tapping from the hole sizes the estimator marked threaded", () => {
  const plate = {
    locations: [
      // four 1/4-20 tap drills (#7, 0.201 in), two of them under a counterbore
      { diametersIn: [0.201], depthIn: 0.5 },
      { diametersIn: [0.201], depthIn: 0.5 },
      { diametersIn: [0.201, 0.375], depthIn: 0.75 },
      { diametersIn: [0.2010001, 0.375], depthIn: 0.75 },
      // two 0.257 in clearance holes and a bore left to the estimator
      { diametersIn: [0.257], depthIn: 0.5 },
      { diametersIn: [0.257], depthIn: 0.5 },
      { diametersIn: [1.5], depthIn: 0.5 },
    ],
    holesConfidence: "high" as const,
  };
  const vmc: TappingMachine = {
    id: "vmc",
    name: "VMC",
    defaultSetupMinutes: 45,
    secondsPerTappedHole: 6,
  };
  const saw: TappingMachine = { id: "saw", name: "Saw", defaultSetupMinutes: 5 };

  it("lists the drill-sized hole sizes by their smallest diameter, bores left out", () => {
    expect(drilledHoleSizes(plate)).toEqual([
      { diameterIn: 0.201, count: 4 },
      { diameterIn: 0.257, count: 2 },
    ]);
    expect(drilledHoleSizes({ ...plate, holesConfidence: "low" })).toEqual([]);
    expect(drilledHoleSizes({ ...plate, holesConfidence: null })).toEqual([]);
  });

  it("times every location of a marked size at the machine's seconds per tapped hole", () => {
    // 4 × 6 s = 24 s = 0.4 min
    expect(suggestTappingOperation(plate, [0.201], [saw, vmc])).toEqual({
      machineId: "vmc",
      label: "Tap from CAD: 4 holes × 6 s (4× Ø0.201)",
      setupMinutes: 45,
      cycleMinutesPerPart: 0.4,
    });
    expect(suggestTappingOperation(plate, [0.201, 0.257], [vmc])?.label).toBe(
      "Tap from CAD: 6 holes × 6 s (4× Ø0.201, 2× Ø0.257)",
    );
  });

  it("suggests nothing without a marked size on the part, a single tapping machine or trusted holes", () => {
    expect(suggestTappingOperation(plate, [], [vmc])).toBeNull();
    // a size marked on an earlier file that the new model no longer has
    expect(suggestTappingOperation(plate, [0.159], [vmc])).toBeNull();
    // a bore is never tapped from CAD
    expect(suggestTappingOperation(plate, [1.5], [vmc])).toBeNull();
    expect(suggestTappingOperation(plate, [0.201], [saw])).toBeNull();
    expect(suggestTappingOperation(plate, [0.201], [vmc, { ...vmc, id: "drill" }])).toBeNull();
    expect(
      suggestTappingOperation({ ...plate, holesConfidence: "low" }, [0.201], [vmc]),
    ).toBeNull();
  });

  it("shares the setup with roughing or drilling on the same machine", () => {
    expect(suggestTappingOperation(plate, [0.201], [vmc], ["vmc"])?.setupMinutes).toBe(0);
    expect(suggestTappingOperation(plate, [0.201], [vmc], ["lathe"])?.setupMinutes).toBe(45);
  });
});
