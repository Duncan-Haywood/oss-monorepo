// The estimated-tax page's own figures: as typed (strings, so a half-typed "1,2" survives) and as the
// settings API stores them (dollars). Shared by the page and its unit test.
export type Filing = "single" | "mfj" | "hoh";

export interface Inputs {
  filing: Filing;
  wages: string;
  otherIncome: string;
  withholding: string;
  priorYearTax: string;
  priorAgiOver150k: boolean;
  mileageRate: string;
  paid: [string, string, string, string];
}

export const EMPTY: Inputs = {
  filing: "single",
  wages: "",
  otherIncome: "",
  withholding: "",
  priorYearTax: "",
  priorAgiOver150k: false,
  mileageRate: "",
  paid: ["", "", "", ""],
};

export const num = (s: string) => {
  const v = Number(s.replace(/[$,\s]/g, ""));
  return s.trim() && Number.isFinite(v) ? v : null;
};

/** The figures as the settings API carries them (dollars; `paid` one per due date). */
export interface Saved {
  filing: Filing;
  wages: number;
  otherIncome: number;
  withholding: number;
  priorYearTax: number | null;
  priorAgiOver150k: boolean;
  mileageRate: number | null;
  paid: [number, number, number, number];
}

const text = (n: number | null) => (n == null || n === 0 ? "" : String(n));

export function fromSaved(s: Saved): Inputs {
  return {
    filing: s.filing,
    wages: text(s.wages),
    otherIncome: text(s.otherIncome),
    withholding: text(s.withholding),
    priorYearTax: s.priorYearTax == null ? "" : String(s.priorYearTax),
    priorAgiOver150k: s.priorAgiOver150k,
    mileageRate: s.mileageRate == null ? "" : String(s.mileageRate),
    paid: s.paid.map(text) as Inputs["paid"],
  };
}

export function toSaved(i: Inputs): Saved {
  return {
    filing: i.filing,
    wages: num(i.wages) ?? 0,
    otherIncome: num(i.otherIncome) ?? 0,
    withholding: num(i.withholding) ?? 0,
    priorYearTax: num(i.priorYearTax),
    priorAgiOver150k: i.priorAgiOver150k,
    mileageRate: num(i.mileageRate),
    paid: i.paid.map((p) => Math.max(0, num(p) ?? 0)) as Saved["paid"],
  };
}

export const isEmpty = (i: Inputs) => JSON.stringify(i) === JSON.stringify(EMPTY);
