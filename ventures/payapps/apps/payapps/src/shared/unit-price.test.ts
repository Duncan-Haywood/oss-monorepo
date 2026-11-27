import { describe, expect, it } from "vitest";
import {
  entryQuantityProblem,
  extendCents,
  formatQuantity,
  formatUnitPrice,
  isUnitPriced,
  parseQuantity,
  parseUnitPrice,
  quantityDecimal,
  quantityToDate,
  unitPriceDecimal,
  unitPricingProblem,
} from "./unit-price";

describe("extendCents", () => {
  it("multiplies quantity by unit price to the cent", () => {
    // 1,200 CY at $145.50 = $174,600.00
    expect(extendCents(1_200_000, 145_500_000)).toBe(17_460_000);
    // 12.5 LF at $18.25 = $228.125 -> $228.13 (half away from zero)
    expect(extendCents(12_500, 18_250_000)).toBe(22_813);
    // 3 EA at $0.875 = $2.625 -> $2.63
    expect(extendCents(3_000, 875_000)).toBe(263);
  });
  it("rounds a negative correction away from zero", () => {
    expect(extendCents(-12_500, 18_250_000)).toBe(-22_813);
    expect(extendCents(-1_000, 1_000_000)).toBe(-100);
  });
  it("stays exact when the intermediate product passes 2^53", () => {
    // 1,000,000 units at $9,999.999999: the product of the integers is about 1e19
    expect(extendCents(1_000_000_000, 9_999_999_999)).toBe(999_999_999_900);
  });
});

describe("parsing and formatting", () => {
  it("reads quantities with up to three decimals", () => {
    expect(parseQuantity("1,200")).toBe(1_200_000);
    expect(parseQuantity("12.5")).toBe(12_500);
    expect(parseQuantity(".125")).toBe(125);
    expect(parseQuantity("-3")).toBe(-3_000);
    expect(parseQuantity("0")).toBe(0);
    expect(parseQuantity("1.2345")).toBeNull();
    expect(parseQuantity("12 CY")).toBeNull();
    expect(parseQuantity("1,2345")).toBeNull();
    expect(parseQuantity("")).toBeNull();
    expect(parseQuantity("-")).toBeNull();
  });
  it("reads unit prices with up to six decimals, never negative", () => {
    expect(parseUnitPrice("$145.50")).toBe(145_500_000);
    expect(parseUnitPrice("0.875")).toBe(875_000);
    expect(parseUnitPrice("1,250")).toBe(1_250_000_000);
    expect(parseUnitPrice("0.1234567")).toBeNull();
    expect(parseUnitPrice("-5")).toBeNull();
  });
  it("formats for people and for spreadsheet cells", () => {
    expect(formatQuantity(1_200_000)).toBe("1,200");
    expect(formatQuantity(12_500)).toBe("12.5");
    expect(formatQuantity(-3_000)).toBe("-3");
    expect(formatUnitPrice(145_500_000)).toBe("$145.50");
    expect(formatUnitPrice(875_000)).toBe("$0.875");
    expect(formatUnitPrice(1_250_000_000)).toBe("$1,250.00");
    expect(quantityDecimal(1_200_000)).toBe("1200");
    expect(unitPriceDecimal(1_250_000_000)).toBe("1250");
    expect(unitPriceDecimal(18_250_000)).toBe("18.25");
  });
});

describe("unitPricingProblem", () => {
  const base = { originalCents: 17_460_000, isChangeOrderLine: false };
  it("accepts a lump-sum line and a matching unit-price line", () => {
    expect(
      unitPricingProblem({ unit: null, unitPriceMicros: null, quantityMilli: null }, base),
    ).toBeNull();
    expect(
      unitPricingProblem(
        { unit: "CY", unitPriceMicros: 145_500_000, quantityMilli: 1_200_000 },
        base,
      ),
    ).toBeNull();
    expect(isUnitPriced({ unit: "CY", unitPriceMicros: 145_500_000 })).toBe(true);
    expect(isUnitPriced({ unit: null, unitPriceMicros: null })).toBe(false);
  });
  it("names both figures when quantity x price misses the scheduled value", () => {
    expect(
      unitPricingProblem(
        { unit: "CY", unitPriceMicros: 145_000_000, quantityMilli: 1_200_000 },
        base,
      ),
    ).toBe("Quantity × unit price is $174,000.00, but the scheduled value is $174,600.00");
  });
  it("needs unit and price together, and a price for a quantity", () => {
    expect(
      unitPricingProblem({ unit: "CY", unitPriceMicros: null, quantityMilli: null }, base),
    ).toMatch(/both/);
    expect(
      unitPricingProblem({ unit: null, unitPriceMicros: 5, quantityMilli: null }, base),
    ).toMatch(/both/);
    expect(
      unitPricingProblem({ unit: null, unitPriceMicros: null, quantityMilli: 5 }, base),
    ).toMatch(/needs a unit/);
    expect(
      unitPricingProblem({ unit: "CY", unitPriceMicros: 0, quantityMilli: null }, base),
    ).toMatch(/more than zero/);
  });
  it("lets a change-order line have a unit price but no quantity", () => {
    const co = { originalCents: 0, isChangeOrderLine: true };
    expect(
      unitPricingProblem({ unit: "LF", unitPriceMicros: 18_250_000, quantityMilli: null }, co),
    ).toBeNull();
    expect(
      unitPricingProblem({ unit: "LF", unitPriceMicros: 18_250_000, quantityMilli: 1_000 }, co),
    ).toMatch(/change order/);
  });
  it("lets a unit-price line leave its contract quantity blank", () => {
    expect(
      unitPricingProblem({ unit: "TON", unitPriceMicros: 98_000_000, quantityMilli: null }, base),
    ).toBeNull();
  });
});

describe("entryQuantityProblem", () => {
  const line = { itemNumber: "3", unit: "CY", unitPriceMicros: 145_500_000 };
  it("accepts an entry with no quantity, or one whose cents match", () => {
    expect(entryQuantityProblem(null, 12_345, line)).toBeNull();
    expect(entryQuantityProblem(undefined, 12_345, line)).toBeNull();
    expect(entryQuantityProblem(300_000, 4_365_000, line)).toBeNull();
  });
  it("refuses cents that do not match the quantity", () => {
    expect(entryQuantityProblem(300_000, 4_000_000, line)).toBe(
      "Line 3: 300 CY × $145.50 is $43,650.00, not $40,000.00",
    );
  });
  it("refuses a quantity on a lump-sum line", () => {
    expect(
      entryQuantityProblem(1_000, 100, { itemNumber: "1", unit: null, unitPriceMicros: null }),
    ).toMatch(/not a unit-price line/);
  });
});

describe("quantityToDate", () => {
  const line = { unitPriceMicros: 145_500_000, openingCompletedCents: 0 };
  it("sums the quantities entered", () => {
    expect(
      quantityToDate(line, [
        { workThisPeriodCents: 4_365_000, quantityThisPeriodMilli: 300_000 },
        { workThisPeriodCents: 3_637_500, quantityThisPeriodMilli: 250_000 },
      ]),
    ).toEqual({ quantityMilli: 550_000, exact: true });
  });
  it("converts dollars entered without a quantity back at the price, and says so", () => {
    expect(
      quantityToDate({ ...line, openingCompletedCents: 1_455_000 }, [
        { workThisPeriodCents: 4_365_000, quantityThisPeriodMilli: 300_000 },
      ]),
    ).toEqual({ quantityMilli: 400_000, exact: false });
  });
  it("is null on a lump-sum line", () => {
    expect(quantityToDate({ unitPriceMicros: null, openingCompletedCents: 0 }, [])).toBeNull();
  });
});
