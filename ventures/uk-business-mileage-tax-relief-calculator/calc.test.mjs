import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, summaryText, SAMPLE, VERIFY, deadline, approved, parse } from "./calc.mjs";

const run = (o) => compute({ ...SAMPLE, ...o });

test("approved rates: 45p to 10,000 miles then 25p, plus 5p per passenger mile", () => {
  assert.equal(approved("car", 10000), 4500);
  assert.equal(approved("car", 12000), 5000);
  assert.equal(approved("car", 1000, 1000), 500);
  assert.equal(approved("motorcycle", 5000), 1200);
  assert.equal(approved("bicycle", 1000), 200);
  assert.equal(approved("tractor", 1000), 0);
});

test("deadline is 5 April, five years after the tax year starts", () => {
  assert.equal(deadline(2022), "2027-04-05");
});

test("sample: shortfall against 20p a mile at a 20% rate", () => {
  const r = run({});
  assert.equal(r.rows.length, 4);
  const y = r.rows.find((x) => x.year === 2024);
  assert.equal(y.allowance, 5000);
  assert.equal(y.paid, 2400);
  assert.equal(y.shortfall, 2600);
  assert.equal(y.relief, 520);
  assert.ok(r.claimable > 0 && r.lost === 0);
});

test("employer paying above the approved rate leaves nothing to claim and flags the excess", () => {
  const r = run({ paidPence: 60 });
  assert.equal(r.claimable, 0);
  assert.ok(r.excessTax > 0);
  assert.ok(r.findings.some((f) => /taxable/.test(f.title)));
  assert.equal(r.obligations.length, 0);
});

test("employer paying exactly 45p on a car under 10,000 miles is neutral", () => {
  const r = run({ paidPence: 45, miles2024: 0, miles2023: 0, miles2025: 0, miles2022: 8000 });
  assert.equal(r.rows[0].shortfall, 0);
  assert.equal(r.rows[0].excess, 0);
});

test("a year past its deadline is lost, not claimable", () => {
  const r = run({ miles2021: 5000 });
  const y = r.rows.find((x) => x.year === 2021);
  assert.equal(y.status, "expired");
  assert.equal(r.lost, y.relief);
  assert.ok(r.findings.some((f) => /Too late/.test(f.title)));
});

test("a deadline inside 90 days is urgent", () => {
  const r = run({ asOf: "2027-02-01" });
  assert.equal(r.rows.find((x) => x.year === 2022).status, "urgent");
  assert.ok(r.findings.some((f) => /Closing within 90 days/.test(f.title)));
});

test("commuting zeroes the result", () => {
  const r = run({ commute: "yes" });
  assert.equal(r.claimable, 0);
  assert.ok(r.findings[0].severity === "high");
});

test("passenger miles raise the approved amount", () => {
  assert.ok(run({ passengerShare: 50 }).claimable > run({}).claimable);
});

test("bad input is rejected, never clamped", () => {
  assert.ok(parse({ ...SAMPLE, vehicle: "boat" }).errors.length);
  assert.ok(parse({ ...SAMPLE, rate: 33 }).errors.length);
  assert.ok(parse({ ...SAMPLE, miles2022: -5 }).errors.length);
  assert.ok(parse({ ...SAMPLE, asOf: "soon" }).errors.length);
  assert.ok(compute({ ...SAMPLE, miles2022: 0, miles2023: 0, miles2024: 0, miles2025: 0 }).errors.length);
});

test("summary names the verification source and the disclaimer", () => {
  const t = summaryText(run({}));
  assert.ok(t.includes(VERIFY));
  assert.match(t, /Not tax advice/);
});
