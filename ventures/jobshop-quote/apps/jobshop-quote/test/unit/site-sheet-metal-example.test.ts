// The marketing site's /how-to-quote-sheet-metal guide prints a worked example priced by its own small
// copy of this app's arithmetic (apps/jobshop-site/src/site/sheet-metal-example.ts). This test prices
// the same made-up part with the real engine, and checks the nest count and the cut and bend times
// against the app's own DXF suggestions, so the page cannot drift from what the app would quote.
import {
  type CostInputs,
  computeCost,
  type RateCard,
  type SheetMetalMachine,
  suggestBendingOperation,
  suggestCuttingOperation,
} from "@shared/costing";
import { nestYield } from "@shared/nest";
import { describe, expect, it } from "vitest";
import {
  priceSheetExample,
  SHEET_EXAMPLE,
} from "../../../jobshop-site/src/site/sheet-metal-example";

const e = SHEET_EXAMPLE;
const machineIds: Record<string, string> = {
  [e.laser.name]: "laser",
  [e.brake.name]: "brake",
  [e.bench.name]: "bench",
};
const card: RateCard = {
  laborMarkupBps: e.laborMarkupBps,
  materialMarkupBps: e.materialMarkupBps,
  outsideServiceMarkupBps: e.outsideServiceMarkupBps,
  minimumLineCents: e.minimumLineCents,
  machines: [
    {
      id: "laser",
      name: e.laser.name,
      hourlyRateCents: e.laser.hourlyRateCents,
      setupRateCents: null,
    },
    {
      id: "brake",
      name: e.brake.name,
      hourlyRateCents: e.brake.hourlyRateCents,
      setupRateCents: null,
    },
    {
      id: "bench",
      name: e.bench.name,
      hourlyRateCents: e.bench.hourlyRateCents,
      setupRateCents: null,
    },
  ],
  materials: [
    {
      id: "crs14",
      name: e.materialName,
      pricingBasis: "per_stock",
      pricePerLbCents: null,
      densityLbPerIn3: null,
      stockPriceCents: e.sheetPriceCents,
      stockDescription: `${e.sheet.widthIn} × ${e.sheet.lengthIn} in sheet`,
      scrapBps: 0,
      minChargeCents: e.materialMinChargeCents,
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

describe("the site's sheet metal guide example", () => {
  const site = priceSheetExample(e);

  it("uses the parts per sheet the app's nest finds", () => {
    expect(nestYield(e.flat.widthIn, e.flat.heightIn, e.sheet)?.partsPerSheet).toBe(
      e.partsPerSheet,
    );
  });

  it("uses the cut and bend times the app suggests from the flat pattern", () => {
    const machines: SheetMetalMachine[] = [
      {
        id: "laser",
        name: e.laser.name,
        defaultSetupMinutes: e.laserSetupMinutes,
        cutSpeedInPerMin: e.laser.cutSpeedInPerMin,
        pierceSeconds: e.laser.pierceSeconds,
        secondsPerBend: null,
      },
      {
        id: "brake",
        name: e.brake.name,
        defaultSetupMinutes: e.brakeSetupMinutes,
        cutSpeedInPerMin: null,
        pierceSeconds: null,
        secondsPerBend: e.brake.secondsPerBend,
      },
    ];
    const flat = {
      cutLengthIn: e.flat.cutLengthIn,
      pierceCount: e.flat.pierces,
      bendLineCount: e.flat.bends,
      measuresConfidence: "high" as const,
      holesConfidence: "high" as const,
      bendsConfidence: "high" as const,
    };
    const cut = suggestCuttingOperation(flat, machines);
    const bend = suggestBendingOperation(flat, machines);
    expect(cut?.cycleMinutesPerPart).toBe(site.cutMinutesPerPart);
    expect(cut?.setupMinutes).toBe(e.laserSetupMinutes);
    expect(bend?.cycleMinutesPerPart).toBe(site.bendMinutesPerPart);
    expect(bend?.setupMinutes).toBe(e.brakeSetupMinutes);
  });

  it("prices to the same cent as the costing engine", () => {
    const inputs: CostInputs = {
      quantities: e.quantities,
      customerSuppliedMaterial: false,
      material: { materialId: "crs14", blank: null, partsPerStock: e.partsPerSheet },
      operations: site.operations.map((o) => ({
        machineId: machineIds[o.machine] ?? "missing",
        label: o.label,
        setupMinutes: o.setupMinutes,
        cycleMinutesPerPart: o.cycleMinutesPerPart,
      })),
      falloutBps: e.falloutBps,
      finishing: [{ opId: "powder" }],
      extras: [{ label: e.hardwareLabel, perPartCents: e.hardwarePerPartCents, lotCents: 0 }],
    };
    const outcome = computeCost(card, inputs);
    if (!outcome.ok) throw new Error(JSON.stringify(outcome.issues));
    expect(site.breaks.map(({ sheets, ...rest }) => rest)).toEqual(outcome.result.breaks);
  });
});
