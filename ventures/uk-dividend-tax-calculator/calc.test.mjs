import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, summaryText, SAMPLE, VERIFY, parse } from "./calc.mjs";

const run = (o) => compute({ ...SAMPLE, ...o });

test("sample: allowance used by salary, 500 allowance, band split at 8.75% then 33.75%", () => {
  const r = run({});
  assert.equal(r.divTaxable, 40000);
  assert.equal(r.inAllowance, 500);
  assert.deepEqual(r.divParts, [37200, 2300, 0]);
  assert.equal(r.divTax, 4031.25);
  assert.equal(r.takeHome, 35968.75);
});

test("dividends up to the personal allowance and dividend allowance pay nothing", () => {
  const r = run({ other: 0, dividends: 13070 });
  assert.equal(r.divTax, 0);
  assert.ok(r.findings[0].title.includes("No dividend tax"));
});

test("unused personal allowance shelters dividends first", () => {
  const r = run({ other: 5000, dividends: 20000 });
  assert.equal(r.divTaxable, 12430);
  assert.equal(r.divCharged, 11930);
  assert.equal(r.divTax, Math.round(11930 * 0.0875 * 100) / 100);
});

test("higher-rate salary puts dividends in the 33.75% band; income tax is reported", () => {
  const r = run({ other: 50270, dividends: 10000 });
  assert.deepEqual(r.divParts, [0, 9500, 0]);
  assert.equal(r.incomeTax, 7540);
  assert.equal(r.divTax, 3206.25);
  assert.equal(r.totalTax, 10746.25);
});

test("allowance taper above 100,000 and additional-rate dividends", () => {
  const r = run({ other: 110000, dividends: 20000 });
  assert.equal(r.allowance, 0);
  assert.deepEqual(r.divParts, [0, 14640, 4860]);
  assert.equal(r.divTax, 6853.41);
  assert.ok(run({ other: 100000, dividends: 5000 }).findings.some((f) => /60%/.test(f.title)));
  assert.ok(!r.findings.some((f) => /60%/.test(f.title)));
});

test("2026/27 uses the higher ordinary and upper rates", () => {
  const r = run({ year: 2026 });
  assert.equal(r.divTax, Math.round((37200 * 0.1075 + 2300 * 0.3575) * 100) / 100);
  assert.ok(r.findings.some((f) => /Confirm they were enacted/.test(f.title)));
});

test("marginal cost of the next 1,000 follows the top band", () => {
  assert.equal(run({}).next, 337.5);
  assert.equal(run({ other: 110000, dividends: 20000 }).next, 393.5);
});

test("self assessment duty appears only when dividends are charged", () => {
  assert.ok(run({}).obligations.some((o) => o.ref === "SA"));
  assert.ok(!run({ other: 0, dividends: 400 }).obligations.some((o) => o.ref === "SA"));
});

test("bad input is rejected, not clamped", () => {
  assert.ok(run({ dividends: -1 }).errors.length);
  assert.ok(run({ other: "" }).errors.length);
  assert.ok(run({ year: 2020 }).errors.length);
  assert.ok(parse({ ...SAMPLE, dividends: "x" }).errors.length);
});

test("summary names the source and is not advice", () => {
  const t = summaryText(run({}));
  assert.ok(t.includes(VERIFY));
  assert.match(t, /Not tax advice/);
});
