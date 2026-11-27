// Worked by hand: a small ductwork bid with two bid items, 7.5% tax on material, 15% on labor,
// 10% on material (tax included), 5% on the subcontractor, 0% on the rest.
import { describe, expect, it } from "vitest";
import {
  alternatesFor,
  bidItemKey,
  computeEstimate,
  type EstimateLineInput,
  type EstimateRates,
  estimateLabel,
  jobFromEstimate,
  lineProblems,
  winProblems,
} from "./estimate";

const rates: EstimateRates = {
  markupBps: { labor: 1500, material: 1000, equipment: 0, subcontract: 500, other: 0 },
  materialTaxBps: 750,
};

const line = (
  bidItem: string,
  category: EstimateLineInput["category"],
  qty: number,
  unitCost: number,
): EstimateLineInput => ({
  bidItem,
  category,
  description: `${category} for ${bidItem}`,
  quantityMilli: Math.round(qty * 1000),
  unit: "EA",
  unitCostMicros: Math.round(unitCost * 1_000_000),
});

describe("computeEstimate", () => {
  it("rolls cost lines into bid items with tax and markup by category", () => {
    const r = computeEstimate(
      [
        line("Ductwork", "labor", 120, 68.5), // 8,220.00
        line("Ductwork", "material", 1450, 4.875), // 7,068.75
        line("Equipment", "subcontract", 1, 3200), // 3,200.00
        line("ductwork ", "equipment", 3, 145.333), // 435.999 -> 436.00
      ],
      rates,
    );
    expect(r.lineCostCents).toEqual([822_000, 706_875, 320_000, 43_600]);
    expect(r.bidItems.map((b) => b.description)).toEqual(["Ductwork", "Equipment"]);
    const duct = r.bidItems[0];
    // tax 7,068.75 × 7.5% = 530.15625 -> 530.16
    expect(duct?.taxCents).toBe(53_016);
    // labor 8,220 × 15% = 1,233.00; material (7,068.75 + 530.16) × 10% = 759.891 -> 759.89
    expect(duct?.markupCents).toBe(123_300 + 75_989);
    expect(duct?.costCents).toBe(822_000 + 706_875 + 43_600);
    expect(duct?.priceCents).toBe(1_572_475 + 53_016 + 199_289);
    expect(duct?.lineCount).toBe(3);
    const eq = r.bidItems[1];
    expect(eq?.priceCents).toBe(320_000 + 16_000);
    expect(r.totals.priceCents).toBe((duct?.priceCents ?? 0) + (eq?.priceCents ?? 0));
    expect(r.totals.costByCategory.material).toBe(706_875);
    // margin = markup / price
    expect(r.totals.marginBps).toBe(
      Math.round(((199_289 + 16_000) / r.totals.priceCents) * 10_000),
    );
  });

  it("numbers bid items in order of first appearance", () => {
    const r = computeEstimate(
      [line("B", "labor", 1, 1), line("A", "labor", 1, 1), line("b", "other", 1, 1)],
      rates,
    );
    expect(r.bidItems.map((b) => [b.itemNumber, b.description, b.lineCount])).toEqual([
      ["1", "B", 2],
      ["2", "A", 1],
    ]);
  });

  it("totals nothing for no lines", () => {
    const r = computeEstimate([], rates);
    expect(r.bidItems).toEqual([]);
    expect(r.totals.priceCents).toBe(0);
    expect(r.totals.marginBps).toBeNull();
    expect(winProblems(r)).toHaveLength(1);
  });

  it("always prices the total as the sum of the items (random lines)", () => {
    let seed = 7;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed / 2 ** 31;
    };
    const cats = ["labor", "material", "equipment", "subcontract", "other"] as const;
    for (let k = 0; k < 50; k++) {
      const lines = Array.from({ length: 1 + Math.floor(rnd() * 30) }, () =>
        line(
          `Item ${Math.floor(rnd() * 6)}`,
          cats[Math.floor(rnd() * 5)] ?? "other",
          Math.floor(rnd() * 100000) / 1000,
          Math.floor(rnd() * 10_000_000) / 1_000_000,
        ),
      );
      const r = computeEstimate(lines, rates);
      const sum = r.bidItems.reduce((s, b) => s + b.priceCents, 0);
      expect(sum).toBe(r.totals.priceCents);
      for (const b of r.bidItems)
        expect(b.priceCents).toBe(b.costCents + b.taxCents + b.markupCents);
      const job = jobFromEstimate(r);
      expect(job.lines.reduce((s, l) => s + l.originalCents, 0)).toBe(job.contractSumCents);
    }
  });
});

describe("jobFromEstimate", () => {
  it("makes one SOV line per bid item at its price, budgeted at cost with tax", () => {
    const r = computeEstimate(
      [line("Rough-in", "labor", 10, 100), line("Rough-in", "material", 10, 50)],
      rates,
    );
    const job = jobFromEstimate(r);
    // cost 1,500; tax 37.50; markup 150 + 53.75 = 203.75; price 1,741.25
    expect(job).toEqual({
      contractSumCents: 174_125,
      lines: [
        {
          itemNumber: "1",
          description: "Rough-in",
          originalCents: 174_125,
          budgetCents: 153_750,
          // Split as bid: labor 1,000; material 500 + tax 37.50.
          budgetByCategory: { labor: 100_000, material: 53_750 },
        },
      ],
    });
    expect(winProblems(r)).toEqual([]);
  });
});

describe("checks", () => {
  it("refuses a blank bid item and a negative quantity", () => {
    expect(lineProblems([{ ...line("  ", "labor", 1, 1) }, line("A", "labor", -1, 1)])).toEqual([
      "Line 1: name its bid item.",
      "Line 2: the quantity is below 0.",
    ]);
  });
  it("labels and keys", () => {
    expect(estimateLabel(7)).toBe("EST-0007");
    expect(bidItemKey("  Duct   Work ")).toBe("duct work");
  });
});

describe("alternates", () => {
  // Ductwork 17,811.80 (as above, without the equipment line); Equipment 3,360.00; Controls (other,
  // no markup) 1,500.00.
  const lines = [
    line("Ductwork", "labor", 120, 68.5),
    line("Ductwork", "material", 1450, 4.875),
    line("Equipment", "subcontract", 1, 3200),
    line("Controls", "other", 1, 1500),
  ];
  const alts = { equipment: "deduct", controls: "add" } as const;

  it("leaves add alternates out of the base bid and numbers alternates apart", () => {
    const r = computeEstimate(lines, rates, alts);
    expect(
      r.bidItems.map((b) => [b.itemNumber, b.description, b.alternate, b.alternateNumber]),
    ).toEqual([
      ["1", "Ductwork", null, null],
      ["2", "Equipment", "deduct", 1],
      ["Alt 2", "Controls", "add", 2],
    ]);
    expect(r.bidItems.map((b) => b.priceCents)).toEqual([1_781_180, 336_000, 150_000]);
    // The base bid: Ductwork and the deductible Equipment, not Controls.
    expect(r.totals.priceCents).toBe(2_117_180);
    expect(r.totals.costByCategory.other).toBe(0);
    expect(r.totals.addAlternatesCents).toBe(150_000);
    expect(r.totals.deductAlternatesCents).toBe(336_000);
    // Without alternates the same lines total all three items.
    expect(computeEstimate(lines, rates).totals.priceCents).toBe(2_267_180);
  });

  it("builds the job from the base bid and the alternates accepted", () => {
    const r = computeEstimate(lines, rates, alts);
    expect(jobFromEstimate(r).contractSumCents).toBe(2_117_180);
    const withAdd = jobFromEstimate(r, ["Controls"]);
    expect(withAdd.lines.map((l) => [l.itemNumber, l.description])).toEqual([
      ["1", "Ductwork"],
      ["2", "Equipment"],
      ["3", "Controls"],
    ]);
    expect(withAdd.contractSumCents).toBe(2_267_180);
    const both = jobFromEstimate(r, ["equipment", " CONTROLS "]);
    expect(both.lines.map((l) => [l.itemNumber, l.description, l.originalCents])).toEqual([
      ["1", "Ductwork", 1_781_180],
      ["2", "Controls", 150_000],
    ]);
    expect(both.contractSumCents).toBe(1_931_180);
    expect(winProblems(r, ["Controls", "Equipment"])).toEqual([]);
  });

  it("refuses accepting a base item, an empty base bid, and a job deducted to nothing", () => {
    const r = computeEstimate(lines, rates, alts);
    expect(winProblems(r, ["Ductwork"])).toEqual([
      '"Ductwork" is not an alternate on this estimate.',
    ]);
    const onlyAdds = computeEstimate([line("A", "labor", 1, 10)], rates, { a: "add" });
    expect(winProblems(onlyAdds)).toContain(
      "The base bid is empty: make at least one bid item part of it.",
    );
    const allDeduct = computeEstimate([line("A", "labor", 1, 10)], rates, { a: "deduct" });
    expect(winProblems(allDeduct)).toEqual([]);
    expect(winProblems(allDeduct, ["A"])).toEqual(["With those alternates the job totals $0."]);
  });

  it("drops an alternate whose bid item is gone", () => {
    expect(alternatesFor(lines, { controls: "add", "old name": "deduct" })).toEqual({
      controls: "add",
    });
  });

  it("keeps the contract sum the sum of the job's lines (random alternates)", () => {
    let seed = 11;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed / 2 ** 31;
    };
    for (let k = 0; k < 50; k++) {
      const ls = Array.from({ length: 1 + Math.floor(rnd() * 20) }, () =>
        line(`Item ${Math.floor(rnd() * 6)}`, "labor", Math.floor(rnd() * 9000) / 100, 12.34),
      );
      const a: Record<string, "add" | "deduct"> = {};
      for (let i = 0; i < 6; i++) {
        const x = rnd();
        if (x < 0.3) a[`item ${i}`] = "add";
        else if (x < 0.5) a[`item ${i}`] = "deduct";
      }
      const r = computeEstimate(ls, rates, alternatesFor(ls, a));
      const base = r.bidItems.filter((b) => b.alternate !== "add");
      expect(base.reduce((s, b) => s + b.priceCents, 0)).toBe(r.totals.priceCents);
      const accepted = Object.keys(a).filter(() => rnd() < 0.5);
      const job = jobFromEstimate(r, accepted);
      expect(job.lines.reduce((s, l) => s + l.originalCents, 0)).toBe(job.contractSumCents);
      expect(job.lines.map((l) => l.itemNumber)).toEqual(job.lines.map((_, i) => String(i + 1)));
    }
  });
});
