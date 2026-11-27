import { describe, expect, it } from "vitest";
import type { CostBreak, CostInputs } from "./costing";
import {
  type DiffLine,
  type DiffNames,
  type DiffQuote,
  describeBlank,
  diffQuotes,
} from "./quote-diff";

const names: DiffNames = {
  machines: { m1: "Haas VF-2", m2: "Okuma 5-axis" },
  materials: { al: "6061-T6 aluminum", ss: "304 stainless" },
  finishingOps: { an: "Type II anodize, black", pass: "Passivate" },
};

const brk = (quantity: number, unitPriceCents: number): CostBreak => ({
  quantity,
  materialCents: 0,
  setupCents: 0,
  runCents: 0,
  finishingCents: 0,
  extrasCents: 0,
  costCents: 0,
  markupCents: 0,
  minimumAdjustmentCents: 0,
  unitPriceCents,
  totalCents: unitPriceCents * quantity,
});

const inputs = (over: Partial<CostInputs> = {}): CostInputs => ({
  quantities: [10, 50],
  customerSuppliedMaterial: false,
  material: {
    materialId: "al",
    blank: { shape: "rect", lengthIn: 4, widthIn: 2, thicknessIn: 0.5 },
    partsPerStock: null,
  },
  operations: [
    { machineId: "m1", label: "OP10", setupMinutes: 60, cycleMinutesPerPart: 12 },
    { machineId: "m1", label: "OP20", setupMinutes: 30, cycleMinutesPerPart: 6 },
  ],
  finishing: [{ opId: "an" }],
  extras: [{ label: "Material cert", perPartCents: 0, lotCents: 2500 }],
  ...over,
});

const line = (over: Partial<DiffLine> = {}): DiffLine => ({
  id: "l1",
  rfqPartId: "p1",
  partNumber: "BRK-1001",
  revision: "B",
  description: "Bracket",
  inputs: inputs(),
  breaks: [brk(10, 4200), brk(50, 1900)],
  ...over,
});

const quote = (lines: DiffLine[], over: Partial<DiffQuote> = {}): DiffQuote => ({
  customerCompany: "Example Robotics LLC",
  customerContact: "Pat Buyer",
  customerEmail: null,
  leadTimeText: "3 weeks ARO",
  validUntil: "2026-12-25",
  notes: null,
  headlineTotalCents: 4200,
  lines,
  ...over,
});

describe("diffQuotes", () => {
  it("reports a straight copy as identical apart from the new valid-until date", () => {
    const a = quote([line()]);
    const b = quote([line({ id: "l2" })], { validUntil: "2027-01-10" });
    const d = diffQuotes(a, b, names);
    expect(d.identical).toBe(true);
    expect(d.header).toEqual([
      { field: "validUntil", label: "Valid until", from: "2026-12-25", to: "2027-01-10" },
    ]);
    expect(d.lines).toHaveLength(1);
    expect(d.lines[0]).toMatchObject({ kind: "unchanged", fromLineId: "l1", toLineId: "l2" });
    // Side by side keeps the unchanged rows.
    expect(d.lines[0]?.prices.map((p) => p.kind)).toEqual(["unchanged", "unchanged"]);
  });

  it("shows new and dropped quantity breaks and changed unit prices", () => {
    const a = quote([line()]);
    const b = quote([
      line({
        id: "l2",
        inputs: inputs({ quantities: [10, 100] }),
        breaks: [brk(10, 3900), brk(100, 1500)],
      }),
    ]);
    const [l] = diffQuotes(a, b, names).lines;
    expect(l?.kind).toBe("changed");
    expect(l?.prices).toEqual([
      {
        quantity: 10,
        fromUnitCents: 4200,
        toUnitCents: 3900,
        fromTotalCents: 42000,
        toTotalCents: 39000,
        kind: "changed",
      },
      {
        quantity: 50,
        fromUnitCents: 1900,
        toUnitCents: null,
        fromTotalCents: 95000,
        toTotalCents: null,
        kind: "removed",
      },
      {
        quantity: 100,
        fromUnitCents: null,
        toUnitCents: 1500,
        fromTotalCents: null,
        toTotalCents: 150000,
        kind: "added",
      },
    ]);
  });

  it("compares a line that no longer prices as not priced, never as zero", () => {
    const a = quote([line()]);
    const b = quote([line({ id: "l2", breaks: null })]);
    const [l] = diffQuotes(a, b, names).lines;
    expect(l?.prices[0]).toMatchObject({ fromUnitCents: 4200, toUnitCents: null, kind: "changed" });
  });

  it("names operation changes by machine and label, and a machine swap as removed plus added", () => {
    const a = quote([line()]);
    const b = quote([
      line({
        id: "l2",
        inputs: inputs({
          operations: [
            // OP10 cycle time cut; OP20 moved to the 5-axis; a new OP30 deburr on the mill.
            { machineId: "m1", label: "OP10", setupMinutes: 60, cycleMinutesPerPart: 9 },
            { machineId: "m2", label: "OP20", setupMinutes: 45, cycleMinutesPerPart: 5 },
            { machineId: "m1", label: "OP30 deburr", setupMinutes: 0, cycleMinutesPerPart: 2 },
          ],
        }),
      }),
    ]);
    const ops = diffQuotes(a, b, names).lines[0]?.operations;
    expect(ops).toEqual([
      {
        kind: "changed",
        machine: "Haas VF-2",
        label: "OP10",
        from: { setupMinutes: 60, cycleMinutesPerPart: 12 },
        to: { setupMinutes: 60, cycleMinutesPerPart: 9 },
      },
      {
        kind: "added",
        machine: "Okuma 5-axis",
        label: "OP20",
        from: null,
        to: { setupMinutes: 45, cycleMinutesPerPart: 5 },
      },
      // Same machine, different label: matched in order, so it reads as OP20 relabelled.
      {
        kind: "changed",
        machine: "Haas VF-2",
        label: "OP30 deburr",
        from: { setupMinutes: 30, cycleMinutesPerPart: 6 },
        to: { setupMinutes: 0, cycleMinutesPerPart: 2 },
      },
    ]);
  });

  it("reports material, blank, finishing and extras changes in words", () => {
    const a = quote([line()]);
    const b = quote([
      line({
        id: "l2",
        inputs: inputs({
          material: {
            materialId: "ss",
            blank: { shape: "round", diameterIn: 1.25, lengthIn: 3 },
            partsPerStock: null,
          },
          finishing: [{ opId: "pass" }],
          extras: [
            { label: "material cert", perPartCents: 0, lotCents: 3500 },
            { label: "Crating", perPartCents: 0, lotCents: 9000 },
          ],
        }),
      }),
    ]);
    const l = diffQuotes(a, b, names).lines[0];
    expect(l?.fields).toEqual([
      { field: "material", label: "Material", from: "6061-T6 aluminum", to: "304 stainless" },
      { field: "blank", label: "Blank", from: "4 × 2 × 0.5 in", to: "Ø1.25 × 3 in" },
    ]);
    expect(l?.finishing).toEqual({ added: ["Passivate"], removed: ["Type II anodize, black"] });
    expect(l?.extras).toEqual([
      {
        kind: "changed",
        label: "material cert",
        from: { perPartCents: 0, lotCents: 2500 },
        to: { perPartCents: 0, lotCents: 3500 },
      },
      { kind: "added", label: "Crating", from: null, to: { perPartCents: 0, lotCents: 9000 } },
    ]);
  });

  it("matches lines by RFQ part, then part number, and lists added and removed lines", () => {
    const a = quote([
      line({ id: "a1", rfqPartId: null, partNumber: "brk-1001 ", revision: "B" }),
      line({ id: "a2", rfqPartId: null, partNumber: "PLT-200", revision: null }),
    ]);
    const b = quote([
      line({ id: "b1", rfqPartId: null, partNumber: "BRK-1001", revision: "C" }),
      line({ id: "b2", rfqPartId: null, partNumber: "SPC-9", revision: null }),
    ]);
    const lines = diffQuotes(a, b, names).lines;
    expect(lines.map((l) => [l.kind, l.fromLineId, l.toLineId])).toEqual([
      ["changed", "a1", "b1"],
      ["added", null, "b2"],
      ["removed", "a2", null],
    ]);
    // The PDF prints the part number as typed, so a case change is reported too.
    expect(lines[0]?.fields).toEqual([
      { field: "partNumber", label: "Part number", from: "brk-1001", to: "BRK-1001" },
      { field: "revision", label: "Part revision", from: "B", to: "C" },
    ]);
  });

  it("says when a material or machine is no longer known instead of dropping it", () => {
    const a = quote([line()]);
    const b = quote([
      line({ id: "l2", inputs: inputs({ material: null, customerSuppliedMaterial: true }) }),
    ]);
    expect(diffQuotes(a, b, { ...names, machines: {} }).lines[0]?.fields).toEqual([
      { field: "material", label: "Material", from: "6061-T6 aluminum", to: "Customer-supplied" },
      { field: "blank", label: "Blank", from: "4 × 2 × 0.5 in", to: null },
    ]);
    const c = quote([
      line({
        id: "l3",
        inputs: inputs({
          operations: [
            { machineId: "gone", label: "OP10", setupMinutes: 1, cycleMinutesPerPart: 1 },
          ],
        }),
      }),
    ]);
    const ops = diffQuotes(a, c, names).lines[0]?.operations ?? [];
    expect(ops.find((o) => o.kind === "added")?.machine).toBe("Unknown machine");
  });

  it("describes blanks without float noise", () => {
    expect(describeBlank({ shape: "rect", lengthIn: 0.1 + 0.2, widthIn: 1, thicknessIn: 2 })).toBe(
      "0.3 × 1 × 2 in",
    );
    expect(describeBlank({ shape: "weight", weightLb: 12.5 })).toBe("12.5 lb");
    expect(describeBlank(null)).toBeNull();
  });
});
