import { describe, expect, it } from "vitest";
import type { CostBreak, CostInputs } from "./costing";
import { customerChangeSummary } from "./quote-change-summary";
import { type DiffLine, type DiffNames, type DiffQuote, diffQuotes } from "./quote-diff";

const names: DiffNames = {
  machines: { m1: "Haas VF-2", m2: "Okuma 5-axis" },
  materials: { al: "6061-T6 aluminum", ss: "304 stainless" },
  finishingOps: { an: "Type II anodize, black" },
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
  operations: [{ machineId: "m1", label: "OP10", setupMinutes: 60, cycleMinutesPerPart: 12 }],
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
  customerContact: "Pat Example",
  customerEmail: "pat@example.com",
  leadTimeText: "3 weeks ARO",
  validUntil: "2026-12-01",
  notes: null,
  headlineTotalCents: 42000,
  lines,
  ...over,
});

const summary = (a: DiffQuote, b: DiffQuote) => customerChangeSummary(diffQuotes(a, b, names));

describe("customerChangeSummary", () => {
  it("is empty when only the valid-until date moved", () => {
    expect(
      summary(quote([line()]), quote([line({ id: "l2" })], { validUntil: "2026-12-20" })),
    ).toEqual([]);
  });

  it("lists unit price changes per quantity, and added and dropped quantities", () => {
    const b = line({
      id: "l2",
      inputs: inputs({ quantities: [50, 100] }),
      breaks: [brk(50, 1750), brk(100, 1500)],
    });
    expect(summary(quote([line()]), quote([b]))).toEqual([
      "BRK-1001 Rev B, qty 10: no longer quoted",
      "BRK-1001 Rev B, qty 50: $19.00 to $17.50 each",
      "BRK-1001 Rev B, qty 100: added at $15.00 each",
    ]);
  });

  it("names a part revision change and added or removed parts", () => {
    const b = line({ id: "l2", revision: "C" });
    const extra = line({ id: "l3", rfqPartId: "p2", partNumber: "PLT-7", revision: null });
    const gone = line({ id: "l4", rfqPartId: "p3", partNumber: "SPC-2", revision: "A" });
    expect(summary(quote([line(), gone]), quote([b, extra]))).toEqual([
      "BRK-1001 Rev C: part revision B to C",
      "PLT-7: added",
      "SPC-2 Rev A: no longer quoted",
    ]);
  });

  it("prints the lead time change and no other header field", () => {
    expect(
      summary(
        quote([line()]),
        quote([line({ id: "l2" })], {
          leadTimeText: "2 weeks ARO",
          customerContact: "Sam Buyer",
          notes: "Internal note",
        }),
      ),
    ).toEqual(["Lead time: 3 weeks ARO to 2 weeks ARO"]);
  });

  it("never shows cost basis: operations, material, finishing and extras alone print nothing", () => {
    const b = line({
      id: "l2",
      inputs: inputs({
        material: { materialId: "ss", blank: { shape: "weight", weightLb: 3 }, partsPerStock: 4 },
        operations: [{ machineId: "m2", label: "OP10", setupMinutes: 90, cycleMinutesPerPart: 8 }],
        finishing: [],
        extras: [{ label: "Expedite", perPartCents: 300, lotCents: 0 }],
      }),
    });
    const changes = diffQuotes(quote([line()]), quote([b]), names);
    expect(changes.lines[0]?.kind).toBe("changed");
    const out = customerChangeSummary(changes);
    expect(out).toEqual([]);
    const all = out.join("\n");
    for (const secret of ["Haas", "Okuma", "stainless", "anodize", "Expedite", "setup", "$3.00"]) {
      expect(all).not.toContain(secret);
    }
  });

  it("does not print a price for a break that was unpriced on either side", () => {
    const b = line({ id: "l2", breaks: null });
    expect(summary(quote([line()]), quote([b]))).toEqual([]);
  });
});
