// The T&M rate sheet panel's form (src/client/pages/tm-rate-sheet.tsx): a saved sheet back into
// the form, the PUT body (blank rows dropped, dollars and percents read, unit kept for material
// only, a blank markup meaning "not set"), and problems in words.
import { expect, it } from "vitest";
import { rateSheetBody, rateSheetFormOf } from "../../src/client/pages/tm-rate-sheet";

it("round-trips a sheet and drops blank rows", () => {
  const f = rateSheetFormOf({
    labor: [{ name: "Foreman", rateCents: 11_050, unit: null }],
    material: [{ name: "Wire", rateCents: 12, unit: "ft" }],
    equipment: [],
    laborMarkupBps: 1250,
    materialMarkupBps: null,
    equipmentMarkupBps: 0,
    source: "Exhibit D",
  });
  expect(f.labor).toEqual([{ name: "Foreman", rate: "110.50", unit: "" }]);
  expect(f.laborMarkup).toBe("12.5");
  expect(f.materialMarkup).toBe("");
  const body = rateSheetBody({
    ...f,
    labor: [
      ...f.labor,
      { name: " ", rate: "", unit: "" },
      { name: "Laborer", rate: "$62", unit: "x" },
    ],
  });
  expect(body).toEqual({
    labor: [
      { name: "Foreman", rateCents: 11_050, unit: null },
      { name: "Laborer", rateCents: 6200, unit: null },
    ],
    material: [{ name: "Wire", rateCents: 12, unit: "ft" }],
    equipment: [],
    laborMarkupBps: 1250,
    materialMarkupBps: null,
    equipmentMarkupBps: 0,
    source: "Exhibit D",
  });
});

it("starts a blank sheet with one labor row", () => {
  const f = rateSheetFormOf(null);
  expect(f.labor).toHaveLength(1);
  expect(rateSheetBody(f).labor).toEqual([]);
});

it("says what is wrong", () => {
  const f = rateSheetFormOf(null);
  expect(() =>
    rateSheetBody({ ...f, labor: [{ name: "Foreman", rate: "abc", unit: "" }] }),
  ).toThrow("Labor rate 1: enter the rate in dollars and cents");
  expect(() => rateSheetBody({ ...f, laborMarkup: "120" })).toThrow(/Labor markup/);
  expect(() =>
    rateSheetBody({
      ...f,
      equipment: [
        { name: "Lift", rate: "1", unit: "" },
        { name: "lift", rate: "2", unit: "" },
      ],
    }),
  ).toThrow(/on the sheet twice/);
});
