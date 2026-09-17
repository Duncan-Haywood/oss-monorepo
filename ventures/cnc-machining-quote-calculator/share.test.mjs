import test from "node:test";
import assert from "node:assert/strict";
import { computeMachiningJob } from "./calculator.mjs";
import { FIELD_IDS, NUMBER_FIELDS, STOCK_FORMS, encodeInputs, decodeInputs, formValues } from "./share.mjs";

const EXAMPLE = {
  quantity: 25, pricePerPart: 42, setupFeeCharged: 0, scrapPct: 3,
  stockForm: "bar", stockUnitCost: 118, partLengthIn: 2.5,
  barLengthIn: 144, barEndLossIn: 4, partingAllowanceIn: 0.14,
  sheetLengthIn: 48, sheetWidthIn: 24, partWidthIn: 3, nestGapIn: 0.25,
  materialCostPerPart: 6.5,
  cycleMinutesPerPart: 4.2, handlingMinutesPerPart: 0.8, machineBurdenPerHour: 22,
  hourlyWage: 28, burdenRate: 26, overheadRate: 18, targetMargin: 35,
  setupHours: 2.5, programmingHours: 3, amortiseProgrammingOverParts: 25,
  firstArticleHours: 1.25,
  toolCostPerCuttingEdge: 9.4, partsPerCuttingEdge: 60, inspectionMinutesPerPart: 0.6,
  outsideCostPerPart: 2.1, outsideLotMinimum: 75,
};

test("FIELD_IDS is every number field plus the stock-form select", () => {
  assert.deepEqual(FIELD_IDS, [...NUMBER_FIELDS, "stockForm"]);
});

test("round-trips every field of the worked example and reproduces the same quote", () => {
  const encoded = encodeInputs({ ...EXAMPLE, unknown: 99 });
  const decoded = decodeInputs(`?${encoded}`);
  for (const field of NUMBER_FIELDS) {
    assert.equal(decoded[field], EXAMPLE[field]);
  }
  assert.equal(decoded.stockForm, EXAMPLE.stockForm);
  assert.equal(decoded.unknown, undefined);
  assert.equal(
    computeMachiningJob(decoded).totalCost,
    computeMachiningJob(EXAMPLE).totalCost,
  );
});

test("a non-string source decodes to nothing rather than throwing", () => {
  assert.deepEqual(decodeInputs(null), {});
  assert.deepEqual(decodeInputs(undefined), {});
  assert.deepEqual(decodeInputs(42), {});
});

test("a leading ? or # is accepted so location.hash needs no trimming", () => {
  assert.deepEqual(decodeInputs("?quantity=50"), { quantity: 50 });
  assert.deepEqual(decodeInputs("#quantity=50"), { quantity: 50 });
});

test("ignores a crafted non-numeric or negative query value", () => {
  assert.deepEqual(decodeInputs("quantity=abc&scrapPct=8"), { scrapPct: 8 });
  assert.equal(encodeInputs({ quantity: -5 }).includes("quantity="), false);
});

test("an out-of-enum stockForm is dropped rather than carried through", () => {
  assert.equal(encodeInputs({ stockForm: "titanium" }).includes("stockForm="), false);
  assert.deepEqual(decodeInputs("stockForm=titanium"), {});
  for (const form of STOCK_FORMS) {
    assert.deepEqual(decodeInputs(encodeInputs({ stockForm: form })), { stockForm: form });
  }
});

test("a lot with zero outside-process cost still round-trips a legitimate zero", () => {
  const noOutside = { ...EXAMPLE, outsideCostPerPart: 0 };
  const decoded = decodeInputs(encodeInputs(noOutside));
  assert.equal(decoded.outsideCostPerPart, 0);
});

test("blank or missing fields are simply absent from the encoded query", () => {
  const encoded = encodeInputs({ quantity: "", pricePerPart: undefined, scrapPct: 8 });
  const decoded = decodeInputs(encoded);
  assert.equal(decoded.quantity, undefined);
  assert.equal(decoded.pricePerPart, undefined);
  assert.equal(decoded.scrapPct, 8);
});

test("formValues covers every field the form owns, not just the ones a link carried", () => {
  const values = formValues({ scrapPct: 8 });
  assert.deepEqual(Object.keys(values).sort(), [...FIELD_IDS].sort());
});

test("formValues clears a field a link did not carry, rather than leaving it unwritten", () => {
  // The exact defect this module exists to prevent: a link that omits
  // hourlyWage must not leave the recipient's own saved draft value in that
  // box -- see check_shared_link_clears.py and the index.html restore.
  const { hourlyWage, ...withoutWage } = EXAMPLE;
  const decoded = decodeInputs(encodeInputs(withoutWage));
  const values = formValues(decoded);
  assert.equal(values.hourlyWage, "");
  assert.equal(values.quantity, String(EXAMPLE.quantity));
  assert.equal(values.stockForm, EXAMPLE.stockForm);
});

test("formValues clears stockForm when a link carries no valid form", () => {
  const values = formValues({ quantity: 10 });
  assert.equal(values.stockForm, "");
});

test("formValues on an empty decode clears the whole form", () => {
  const values = formValues({});
  for (const id of FIELD_IDS) assert.equal(values[id], "");
});

test("formValues on a missing argument clears the whole form rather than throwing", () => {
  const values = formValues();
  for (const id of FIELD_IDS) assert.equal(values[id], "");
});
