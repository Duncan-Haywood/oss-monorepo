// The marketing site's /how-to-quote-sheet-metal guide prints a worked example priced by its own small
// copy of this app's arithmetic (apps/jobshop-site/src/site/sheet-metal-example.ts). This test runs the
// same made-up job through the real code a quote from a DXF uses: the flat blank, the rectangular
// nest, the "Cut from DXF" and "Bend from DXF" suggestions and the costing engine, so the page cannot
// drift from what the app would quote.
import {
  blankFromFlatPattern,
  type CostInputs,
  computeCost,
  type FlatPatternMeasures,
  type RateCard,
  type SheetMetalMachine,
  suggestBendingOperation,
  suggestCuttingOperation,
} from "@shared/costing";
import { nestYield } from "@shared/nest";
import { describe, expect, it } from "vitest";
import {
  EXAMPLE,
  flatBlank,
  priceSheetExample,
} from "../../../jobshop-site/src/site/sheet-metal-example";

const e = EXAMPLE;
const ids = e.machines.map((_, i) => `m${i}`);
const thickness = 0.075;

const flat: FlatPatternMeasures = {
  cutLengthIn: e.flat.cutLengthIn,
  pierceCount: e.flat.pierceCount,
  bendLineCount: e.flat.bendLines,
  measuresConfidence: "high",
  holesConfidence: "high",
  bendsConfidence: "high",
};
const sheetMachines: SheetMetalMachine[] = [
  {
    id: ids[e.laserMachine] as string,
    name: "Fiber laser",
    defaultSetupMinutes: e.laser.setupMinutes,
    cutSpeedInPerMin: e.laser.cutSpeedInPerMin,
    pierceSeconds: e.laser.pierceSeconds,
    secondsPerBend: null,
  },
  {
    id: ids[e.brakeMachine] as string,
    name: "Press brake",
    defaultSetupMinutes: e.brake.setupMinutes,
    cutSpeedInPerMin: null,
    pierceSeconds: null,
    secondsPerBend: e.brake.secondsPerBend,
  },
];

describe("the site's sheet-metal guide example", () => {
  const site = priceSheetExample(e);

  it("times the cut and the bends as the app's DXF suggestions do", () => {
    const cut = suggestCuttingOperation(flat, sheetMachines);
    const bend = suggestBendingOperation(flat, sheetMachines);
    expect(cut).not.toBeNull();
    expect(bend).not.toBeNull();
    expect(cut?.machineId).toBe(ids[e.laserMachine]);
    expect(cut?.cycleMinutesPerPart).toBe(site.cutMinutes);
    expect(cut?.setupMinutes).toBe(e.laser.setupMinutes);
    expect(bend?.machineId).toBe(ids[e.brakeMachine]);
    expect(bend?.cycleMinutesPerPart).toBe(site.bendMinutes);
    expect(bend?.setupMinutes).toBe(e.brake.setupMinutes);
  });

  it("sizes the blank and nests it to the parts per sheet the page prints", () => {
    const blank = blankFromFlatPattern(
      { widthIn: e.flat.widthIn, heightIn: e.flat.heightIn, confidence: "high" },
      thickness,
    );
    const mine = flatBlank(e);
    expect(blank).toEqual({ shape: "rect", ...mine, thicknessIn: thickness });
    expect(nestYield(mine.widthIn, mine.lengthIn, e.sheet)?.partsPerSheet).toBe(e.partsPerSheet);
  });

  it("prices to the same cent as the costing engine", () => {
    const card: RateCard = {
      laborMarkupBps: e.laborMarkupBps,
      materialMarkupBps: e.materialMarkupBps,
      outsideServiceMarkupBps: e.outsideServiceMarkupBps,
      minimumLineCents: e.minimumLineCents,
      machines: e.machines.map((m, i) => ({
        id: ids[i] as string,
        name: m.name,
        hourlyRateCents: m.hourlyRateCents,
        setupRateCents: null,
      })),
      materials: [
        {
          id: "crs14",
          name: e.materialName,
          pricingBasis: "per_stock",
          pricePerLbCents: null,
          densityLbPerIn3: null,
          stockPriceCents: e.sheetPriceCents,
          stockDescription: e.sheetDescription,
          scrapBps: 0,
          minChargeCents: 0,
        },
      ],
      finishingOps: [
        {
          id: "powder",
          name: e.finishingName,
          perPartCents: e.finishingPerPartCents,
          lotChargeCents: e.finishingLotChargeCents,
          outsideService: true,
        },
      ],
    };
    const inputs: CostInputs = {
      quantities: e.quantities,
      customerSuppliedMaterial: false,
      material: { materialId: "crs14", blank: null, partsPerStock: e.partsPerSheet },
      operations: site.operations.map((o) => ({
        machineId: ids[o.machine] as string,
        label: o.label,
        setupMinutes: o.setupMinutes,
        cycleMinutesPerPart: o.cycleMinutesPerPart,
      })),
      falloutBps: e.falloutBps,
      finishing: [{ opId: "powder" }],
      extras: [],
    };
    const outcome = computeCost(card, inputs);
    if (!outcome.ok) throw new Error(JSON.stringify(outcome.issues));
    expect(site.breaks.map(({ sheets, ...rest }) => rest)).toEqual(
      outcome.result.breaks.map(({ extrasCents, ...rest }) => {
        expect(extrasCents).toBe(0);
        return rest;
      }),
    );
    for (const b of site.breaks) expect(b.sheets).toBe(Math.ceil(b.starts / e.partsPerSheet));
  });
});
