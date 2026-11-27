import { describe, expect, it } from "vitest";
import { EMPTY, fromSaved, isEmpty, type Saved, toSaved } from "./estimate-figures";

const SAVED: Saved = {
  filing: "hoh",
  wages: 41000.5,
  otherIncome: -120,
  withholding: 0,
  priorYearTax: 0,
  priorAgiOver150k: true,
  mileageRate: 0,
  paid: [900, 0, 900.25, 0],
};

describe("estimated-tax figures", () => {
  it("round-trips the saved figures, keeping a typed zero for last year's tax and the rate", () => {
    const typed = fromSaved(SAVED);
    expect(typed.withholding).toBe("");
    expect(typed.priorYearTax).toBe("0");
    expect(typed.mileageRate).toBe("0");
    expect(typed.paid).toEqual(["900", "", "900.25", ""]);
    expect(toSaved(typed)).toEqual(SAVED);
  });

  it("reads what a seller types: commas, dollar signs, blanks and half-typed text", () => {
    const s = toSaved({
      ...EMPTY,
      wages: "$52,000.50",
      priorYearTax: "",
      mileageRate: "",
      paid: ["1,200", "abc", "-5", " "],
    });
    expect(s.wages).toBe(52000.5);
    expect(s.priorYearTax).toBeNull();
    expect(s.mileageRate).toBeNull();
    expect(s.paid).toEqual([1200, 0, 0, 0]);
  });

  it("knows an untouched page", () => {
    expect(isEmpty(EMPTY)).toBe(true);
    expect(isEmpty({ ...EMPTY, wages: "1" })).toBe(false);
  });
});
