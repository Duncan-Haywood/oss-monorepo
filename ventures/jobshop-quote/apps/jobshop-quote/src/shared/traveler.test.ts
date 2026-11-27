import { describe, expect, it } from "vitest";
import { type CostInputs, emptyCostInputs } from "./costing";
import {
  blankText,
  GONE,
  isValidOrderQuantity,
  mergeNames,
  minutesText,
  orderQuantity,
  planQuantities,
  type TravelerNames,
  travelerLine,
} from "./traveler";

const names: TravelerNames = {
  machines: [
    { id: "m1", name: "Haas VF-2" },
    { id: "m2", name: "Deburr bench" },
  ],
  materials: [{ id: "al", name: "6061-T6 aluminum", stockDescription: "1 x 2 bar, 12 ft" }],
  finishingOps: [
    { id: "an", name: "Anodize type II black", outsideService: true },
    { id: "pk", name: "Bag and tag", outsideService: false },
  ],
};

const inputs = (over: Partial<CostInputs> = {}): CostInputs => ({
  ...emptyCostInputs([25, 100]),
  material: {
    materialId: "al",
    blank: { shape: "rect", lengthIn: 4, widthIn: 2, thicknessIn: 1 },
    partsPerStock: 30,
  },
  operations: [
    { machineId: "m1", label: "Op 1 mill", setupMinutes: 60, cycleMinutesPerPart: 4.5 },
    { machineId: "m2", label: "Deburr", setupMinutes: 0, cycleMinutesPerPart: 1 },
  ],
  finishing: [{ opId: "an" }, { opId: "pk" }],
  ...over,
});

const line = (i: CostInputs) => ({
  id: "l1",
  partNumber: "BRK-100",
  revision: "C",
  description: "Bracket",
  inputs: i,
});

describe("travelerLine", () => {
  it("lists operations in order with run time on the parts ordered", () => {
    const t = travelerLine(line(inputs()), 40, names);
    expect(t.starts).toBe(40);
    expect(t.operations.map((o) => [o.sequence, o.machine, o.runMinutes])).toEqual([
      [10, "Haas VF-2", 180],
      [20, "Deburr bench", 40],
    ]);
    // Finishing continues the sequence after the machine operations.
    expect(t.finishing).toEqual([
      { sequence: 30, name: "Anodize type II black", outsideService: true },
      { sequence: 40, name: "Bag and tag", outsideService: false },
    ]);
    expect(t.totalMinutes).toBe(60 + 180 + 0 + 40);
    expect(t.notes).toEqual([]);
  });

  it("starts extra parts for the line's fallout and pulls stock for the starts", () => {
    const t = travelerLine(line(inputs({ falloutBps: 500 })), 95, names);
    // 95 good at 5% fallout: ceil(95 / 0.95) = 100 started.
    expect(t.starts).toBe(100);
    expect(t.falloutPercent).toBe(5);
    expect(t.operations[0]?.runMinutes).toBe(450);
    // 100 parts at 30 a bar: 4 bars.
    expect(t.material.stockPieces).toBe(4);
    expect(t.material).toMatchObject({
      name: "6061-T6 aluminum",
      stockDescription: "1 x 2 bar, 12 ft",
      blank: '4" x 2" x 1"',
    });
  });

  it("never guesses a blank cycle time", () => {
    const i = inputs();
    i.operations[1] = {
      machineId: "m2",
      label: "Deburr",
      setupMinutes: 5,
      cycleMinutesPerPart: null,
    };
    const t = travelerLine(line(i), 10, names);
    expect(t.operations[1]?.runMinutes).toBeNull();
    expect(t.totalMinutes).toBeNull();
    expect(t.notes).toEqual(["Op 20: no cycle time on the estimate."]);
  });

  it("names what the rate card no longer has instead of dropping it", () => {
    const i = inputs({ finishing: [{ opId: "gone" }] });
    i.operations[0] = { machineId: "old", label: "", setupMinutes: 0, cycleMinutesPerPart: 1 };
    const t = travelerLine(
      line({ ...i, material: { materialId: "x", blank: null, partsPerStock: null } }),
      1,
      names,
    );
    expect(t.operations[0]?.machine).toBe(GONE);
    expect(t.finishing[0]?.name).toBe(GONE);
    expect(t.material.name).toBe(GONE);
    expect(t.material.stockPieces).toBeNull();
  });

  it("says when material and operations are missing", () => {
    const t = travelerLine(line(emptyCostInputs([5])), 5, names);
    expect(t.totalMinutes).toBeNull();
    expect(t.notes).toEqual(["No material on the estimate.", "No operations on the estimate."]);
    const cs = travelerLine(
      line({ ...emptyCostInputs([5]), customerSuppliedMaterial: true }),
      5,
      names,
    );
    expect(cs.material.customerSupplied).toBe(true);
    expect(cs.notes).toEqual(["No operations on the estimate."]);
  });
});

describe("orderQuantity", () => {
  it("takes the quantity asked for, else the only break, else none", () => {
    expect(orderQuantity(emptyCostInputs([25, 100]), 60)).toBe(60);
    expect(orderQuantity(emptyCostInputs([25]), undefined)).toBe(25);
    expect(orderQuantity(emptyCostInputs([25, 100]), undefined)).toBeNull();
  });
  it("accepts whole quantities in range only", () => {
    expect(isValidOrderQuantity(1)).toBe(true);
    expect(isValidOrderQuantity(0)).toBe(false);
    expect(isValidOrderQuantity(2.5)).toBe(false);
    expect(isValidOrderQuantity(1_000_001)).toBe(false);
  });
});

describe("mergeNames", () => {
  it("prefers the snapshot's names and falls back to today's card", () => {
    const merged = mergeNames(
      { machines: [{ id: "m1", name: "Mill (as priced)" }], materials: [], finishingOps: [] },
      names,
    );
    expect(merged.machines).toEqual([
      { id: "m1", name: "Mill (as priced)" },
      { id: "m2", name: "Deburr bench" },
    ]);
    expect(merged.materials).toEqual(names.materials);
    expect(mergeNames(null, names)).toBe(names);
  });
});

describe("text helpers", () => {
  it("formats blanks and minutes", () => {
    expect(blankText({ shape: "round", diameterIn: 1.25, lengthIn: 3 })).toBe('1.25" dia x 3"');
    expect(blankText({ shape: "weight", weightLb: 4.2 })).toBe("4.2 lb");
    expect(blankText(null)).toBeNull();
    expect(minutesText(45)).toBe("45 min");
    expect(minutesText(125.4)).toBe("2 h 05 min");
  });
});

describe("planQuantities", () => {
  const a = { id: "a", partNumber: "A-1", inputs: emptyCostInputs([10, 100]) };
  const b = { id: "b", partNumber: "B-1", inputs: emptyCostInputs([5]) };
  it("asks for the PO quantity on a multi-break line and takes the only break otherwise", () => {
    const r = planQuantities([a, b], {}, null);
    expect(r.plan.map((p) => [p.line.id, p.quantity])).toEqual([["b", 5]]);
    expect(r.missing).toEqual(["A-1"]);
  });
  it("uses the customer's accepted breaks and leaves off parts they did not order", () => {
    const r = planQuantities([a, b], {}, [{ lineId: "a", quantity: 100 }]);
    expect(r.plan.map((p) => [p.line.id, p.quantity])).toEqual([["a", 100]]);
    expect(r.leftOff).toEqual(["B-1"]);
    expect(r.missing).toEqual([]);
  });
  it("lets a quantity typed by the shop win over both", () => {
    const r = planQuantities([a, b], { a: 60, b: 7 }, [{ lineId: "a", quantity: 100 }]);
    expect(r.plan.map((p) => [p.line.id, p.quantity])).toEqual([
      ["a", 60],
      ["b", 7],
    ]);
  });
});
