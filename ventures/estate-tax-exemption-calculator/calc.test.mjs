import { test } from "node:test";
import assert from "node:assert/strict";
import { estateTaxOutcome, money, BASIC_EXCLUSION_2026, ESTATE_TAX_RATE } from "./calc.mjs";

test("estate well under the exclusion: no tax, fully shielded", () => {
  const r = estateTaxOutcome({ grossEstate: 5_000_000, filingStatus: "single" });
  assert.equal(r.taxableEstate, 0);
  assert.equal(r.estateTax, 0);
  assert.equal(r.remainingExclusion, BASIC_EXCLUSION_2026);
  assert.equal(r.shielded, 5_000_000);
});

test("single filer exclusion is exactly $15,000,000 for 2026", () => {
  assert.equal(BASIC_EXCLUSION_2026, 15_000_000);
});

test("estate exactly at the exclusion: zero taxable estate", () => {
  const r = estateTaxOutcome({ grossEstate: 15_000_000, filingStatus: "single" });
  assert.equal(r.taxableEstate, 0);
  assert.equal(r.estateTax, 0);
});

test("estate above the exclusion: 40% flat rate on the excess only", () => {
  const r = estateTaxOutcome({ grossEstate: 20_000_000, filingStatus: "single" });
  assert.equal(r.taxableEstate, 5_000_000);
  assert.equal(r.estateTax, 5_000_000 * ESTATE_TAX_RATE);
  assert.equal(r.estateTax, 2_000_000);
});

test("married with no DSUE gets only their own $15,000,000, not $30,000,000 automatically", () => {
  const r = estateTaxOutcome({ grossEstate: 20_000_000, filingStatus: "married", dsue: 0 });
  assert.equal(r.totalExclusion, 15_000_000);
  assert.equal(r.taxableEstate, 5_000_000);
});

test("married with full DSUE elected can shield up to $30,000,000 combined", () => {
  const r = estateTaxOutcome({ grossEstate: 28_000_000, filingStatus: "married", dsue: 15_000_000 });
  assert.equal(r.totalExclusion, 30_000_000);
  assert.equal(r.taxableEstate, 0);
  assert.equal(r.estateTax, 0);
});

test("DSUE is ignored for a single filer even if supplied", () => {
  const r = estateTaxOutcome({ grossEstate: 20_000_000, filingStatus: "single", dsue: 15_000_000 });
  assert.equal(r.dsue, 0);
  assert.equal(r.totalExclusion, 15_000_000);
});

test("prior taxable gifts reduce the exclusion available at death", () => {
  const r = estateTaxOutcome({ grossEstate: 10_000_000, priorTaxableGifts: 5_000_000, filingStatus: "single" });
  assert.equal(r.exclusionUsedByGifts, 5_000_000);
  assert.equal(r.remainingExclusion, 10_000_000);
  assert.equal(r.taxableEstate, 0);
});

test("prior taxable gifts that exceed the total exclusion leave nothing to shield the estate", () => {
  const r = estateTaxOutcome({ grossEstate: 5_000_000, priorTaxableGifts: 16_000_000, filingStatus: "single" });
  assert.equal(r.remainingExclusion, 0);
  assert.equal(r.giftsExceedingExclusion, 1_000_000);
  assert.equal(r.taxableEstate, 5_000_000);
  assert.equal(r.estateTax, 2_000_000);
});

test("married filer's prior gifts are measured against the combined exclusion including DSUE", () => {
  const r = estateTaxOutcome({
    grossEstate: 10_000_000,
    priorTaxableGifts: 25_000_000,
    dsue: 15_000_000,
    filingStatus: "married",
  });
  assert.equal(r.totalExclusion, 30_000_000);
  assert.equal(r.remainingExclusion, 5_000_000);
  assert.equal(r.giftsExceedingExclusion, 0);
  assert.equal(r.taxableEstate, 5_000_000);
});

test("zero gross estate produces an info finding and no tax", () => {
  const r = estateTaxOutcome({ grossEstate: 0, filingStatus: "single" });
  assert.equal(r.taxableEstate, 0);
  assert.match(r.findings[0].title, /Enter your gross estate/);
});

test("negative or missing inputs are treated as zero, never negative", () => {
  const r = estateTaxOutcome({ grossEstate: -1000, priorTaxableGifts: -500, dsue: -200, filingStatus: "married" });
  assert.equal(r.grossEstate, 0);
  assert.equal(r.priorTaxableGifts, 0);
  assert.equal(r.dsue, 0);
  assert.equal(r.taxableEstate, 0);
});

test("findings always flag GST non-portability and state tax out of scope", () => {
  const r = estateTaxOutcome({ grossEstate: 5_000_000, filingStatus: "single" });
  const titles = r.findings.map((f) => f.title).join(" | ");
  assert.match(titles, /GST exemption is not portable/);
  assert.match(titles, /State estate and inheritance tax not included/);
});

test("married filer with no DSUE gets a finding suggesting portability if applicable", () => {
  const r = estateTaxOutcome({ grossEstate: 10_000_000, filingStatus: "married", dsue: 0 });
  const titles = r.findings.map((f) => f.title).join(" | ");
  assert.match(titles, /No deceased spousal unused exclusion/);
});

test("single filer does not get the DSUE finding", () => {
  const r = estateTaxOutcome({ grossEstate: 10_000_000, filingStatus: "single" });
  const titles = r.findings.map((f) => f.title).join(" | ");
  assert.doesNotMatch(titles, /No deceased spousal unused exclusion/);
});

test("money() formats negative values with a leading minus and no double sign", () => {
  assert.equal(money(1234), "$1,234");
  assert.equal(money(-1234), "-$1,234");
  assert.equal(money(0), "$0");
});

test("an unrecognized filing status behaves like single (no DSUE applied)", () => {
  const r = estateTaxOutcome({ grossEstate: 10_000_000, filingStatus: "nonsense", dsue: 15_000_000 });
  assert.equal(r.dsue, 0);
  assert.equal(r.totalExclusion, 15_000_000);
});
