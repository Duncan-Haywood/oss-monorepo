// Schedule C line 35 is last year's line 41: the filed figure, when the seller has entered it, with the
// books' own December 31 count beside it and a warning when the two differ.
import { buildScheduleC, type ScInput } from "@worker/services/books/schedule-c";
import { describe, expect, it } from "vitest";

const base: ScInput = {
  year: 2026,
  sales: [],
  charges: [],
  expenses: [],
  items: [
    // On hand at the end of 2025 ($40), sold in 2026.
    { acquiredDate: "2025-10-01", costCents: 4000, status: "sold", disposedDate: "2026-03-01" },
    // Bought in 2026 ($25), still on hand.
    { acquiredDate: "2026-05-01", costCents: 2500, status: "in_stock", disposedDate: null },
  ],
  unallocatedLots: [],
  businessMiles: 0,
  mileageRateCents: null,
};
const p3 = (w: ReturnType<typeof buildScheduleC>, n: string) => w.partIII.find((l) => l.line === n);

describe("line 35 from last year's return", () => {
  it("uses the books alone when nothing is entered", () => {
    const w = buildScheduleC(base);
    expect(p3(w, "35")?.amountCents).toBe(4000);
    expect(p3(w, "35")?.note).toBeUndefined();
    expect(p3(w, "42")?.amountCents).toBe(4000); // 40 + 25 − 25
    expect(w.openingInventory).toEqual({ booksCents: 4000, filedCents: null });
    expect(w.warnings.join(" ")).not.toMatch(/Line 35/);
  });

  it("uses the filed figure with no warning when it matches the books", () => {
    const w = buildScheduleC({ ...base, filedOpeningCents: 4000 });
    expect(p3(w, "35")?.amountCents).toBe(4000);
    expect(p3(w, "35")?.note).toMatch(/Line 41 of your 2025 return.*\$40\.00 on hand/);
    expect(w.warnings.join(" ")).not.toMatch(/Line 35/);
    expect(w.openingInventory).toEqual({ booksCents: 4000, filedCents: 4000 });
  });

  it("uses a larger filed figure, raising line 42, and says by how much", () => {
    const w = buildScheduleC({ ...base, filedOpeningCents: 10000 });
    expect(p3(w, "35")?.amountCents).toBe(10000);
    expect(p3(w, "40")?.amountCents).toBe(12500);
    expect(p3(w, "41")?.amountCents).toBe(2500);
    expect(p3(w, "42")?.amountCents).toBe(10000);
    expect(w.lines.find((l) => l.line === "4")?.amountCents).toBe(10000);
    expect(w.warnings.join(" ")).toMatch(
      /Line 35 uses the \$100\.00 .* books show \$40\.00 .*: \$60\.00 more on the return\. The difference raises/,
    );
  });

  it("uses a smaller filed figure, lowering line 42", () => {
    const w = buildScheduleC({ ...base, filedOpeningCents: 0 });
    expect(p3(w, "35")?.amountCents).toBe(0);
    expect(p3(w, "42")?.amountCents).toBe(0);
    expect(w.warnings.join(" ")).toMatch(/\$40\.00 less on the return\. The difference lowers/);
  });

  it("applies to a year-to-date worksheet too (the estimated-tax periods)", () => {
    const w = buildScheduleC({ ...base, filedOpeningCents: 10000, through: "2026-03-31" });
    expect(p3(w, "35")?.amountCents).toBe(10000);
  });
});
