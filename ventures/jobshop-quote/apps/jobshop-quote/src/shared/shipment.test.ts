import { describe, expect, it } from "vitest";
import type { CostInputs } from "./costing";
import { cleanText, parseShipmentQuery, planShipment, ShipmentQueryError } from "./shipment";

const inputs = (over: Partial<CostInputs>): CostInputs =>
  ({
    quantities: [10],
    falloutBps: null,
    material: null,
    customerSuppliedMaterial: false,
    operations: [],
    finishing: [],
    ...over,
  }) as unknown as CostInputs;

const names = () => ({
  machines: [],
  materials: [{ id: "m1", name: "6061-T6 plate" }],
  finishingOps: [
    { id: "f1", name: "Anodize Type II", outsideService: true },
    { id: "f2", name: "Deburr", outsideService: false },
  ],
});

describe("parseShipmentQuery", () => {
  it("reads every field and trims control characters", () => {
    const q = parseShipmentQuery({
      ship: "2026-12-10",
      "qty.a": "40",
      "lot.a": " H-1\u0007 ",
      signer: "Pat Lee, QA",
      to: "Acme\r\n\r\nDock 3",
      coc: "0",
    });
    expect(q).toEqual({
      ship: "2026-12-10",
      quantities: { a: 40 },
      lots: { a: "H-1" },
      signer: "Pat Lee, QA",
      shipTo: ["Acme", "Dock 3"],
      certificate: false,
    });
  });

  it("refuses bad values rather than defaulting", () => {
    const bads: Record<string, string>[] = [
      { ship: "2026-02-30" },
      { "qty.a": "1.5" },
      { "qty.a": "0" },
      { "lot.a": "x".repeat(61) },
      { to: "1\n2\n3\n4\n5\n6" },
      { coc: "no" },
    ];
    for (const bad of bads) {
      expect(() => parseShipmentQuery(bad)).toThrow(ShipmentQueryError);
    }
    expect(parseShipmentQuery({ ship: "", "qty.a": "", "lot.a": "  " })).toEqual({
      quantities: {},
      lots: {},
      shipTo: [],
      certificate: true,
    });
  });

  it("cleanText collapses whitespace", () => {
    expect(cleanText("a\tb\n\nc  ")).toBe("a b c");
  });
});

describe("planShipment", () => {
  const lines = [
    {
      id: "a",
      partNumber: "A-1",
      revision: "C",
      description: null,
      inputs: inputs({
        material: { materialId: "m1", blank: null, partsPerStock: null },
        finishing: [{ opId: "f1" }, { opId: "f2" }],
      } as Partial<CostInputs>),
    },
    {
      id: "b",
      partNumber: "B-2",
      revision: null,
      description: null,
      inputs: inputs({ quantities: [10, 100] }),
    },
  ];

  it("ships the ordered quantity, a typed partial, and only outside processes", () => {
    const p = planShipment(
      lines,
      { b: 100 },
      null,
      { quantities: { b: 60 }, lots: { a: "H1" } },
      names,
    );
    expect(p.missing).toEqual([]);
    expect(p.lines).toMatchObject([
      {
        partNumber: "A-1",
        ordered: 10,
        shipped: 10,
        partial: false,
        material: "6061-T6 plate",
        lot: "H1",
        outsideProcesses: ["Anodize Type II"],
      },
      { partNumber: "B-2", ordered: 100, shipped: 60, partial: true, material: null, lot: null },
    ]);
  });

  it("names a multi-break line with no quantity, and leaves off what was not accepted", () => {
    expect(planShipment(lines, {}, null, { quantities: {}, lots: {} }, names).missing).toEqual([
      "B-2",
    ]);
    const accepted = planShipment(
      lines,
      {},
      [{ lineId: "a", quantity: 10 }],
      { quantities: {}, lots: {} },
      names,
    );
    expect(accepted.leftOff).toEqual(["B-2"]);
    expect(accepted.lines.map((l) => l.partNumber)).toEqual(["A-1"]);
  });
});
