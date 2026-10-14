import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, summaryText, SAMPLE, VERIFY, deadline, parse } from "./calc.mjs";

const run = (o) => compute({ ...SAMPLE, ...o });

test("deadline is 5 April, five years after the tax year starts", () => {
  assert.equal(deadline(2022), "2027-04-05");
  assert.equal(deadline(2025), "2030-04-05");
});

test("sample: four open years at GBP 6 a week and 20% relief", () => {
  const r = run({});
  assert.equal(r.rows.length, 4);
  assert.equal(r.rows[0].expenses, 276);
  assert.equal(r.rows[0].relief, 55.2);
  assert.equal(r.claimable, r2(0.2 * 6 * (46 + 46 + 48 + 48)));
  assert.equal(r.lost, 0);
});
function r2(n) { return Math.round(n * 100) / 100; }

test("a year past its deadline is lost, not claimable", () => {
  const r = run({ weeks2021: 40 });
  const y = r.rows.find((x) => x.year === 2021);
  assert.equal(y.status, "expired");
  assert.equal(r.lost, 48);
  assert.ok(!r.findings.every((f) => !/Too late/.test(f.title)));
});

test("a deadline inside 90 days is urgent", () => {
  const r = run({ asOf: "2027-02-01" });
  assert.equal(r.rows.find((x) => x.year === 2022).status, "urgent");
  assert.equal(r.rows.find((x) => x.year === 2023).status, "open");
});

test("the deadline day itself is still open; the day after is expired", () => {
  assert.equal(run({ asOf: "2027-04-05" }).rows[0].status, "urgent");
  assert.equal(run({ asOf: "2027-04-06" }).rows[0].status, "expired");
});

test("not required by the employer means no relief", () => {
  const r = run({ required: "no" });
  assert.equal(r.claimable, 0);
  assert.ok(r.findings.some((f) => /required/.test(f.title)));
  assert.equal(r.obligations.length, 0);
});

test("higher rate doubles the relief", () => {
  assert.equal(run({ rate: 40 }).claimable, r2(run({ rate: 20 }).claimable * 2));
});

test("employer payments reduce the claim pro rata and never below zero", () => {
  assert.equal(run({ reimbursed: 312 }).claimable, 0);
  const r = run({ reimbursed: 156, weeks2022: 52, weeks2023: 0, weeks2024: 0, weeks2025: 0 });
  assert.equal(r.rows[0].expenses, 156);
});

test("higher actual costs are used when they beat the flat rate", () => {
  const r = run({ actual: 700, weeks2022: 52, weeks2023: 0, weeks2024: 0, weeks2025: 0 });
  assert.equal(r.rows[0].method, "actual costs");
  assert.equal(r.rows[0].expenses, 700);
});

test("self assessment filers are told to claim on the return", () => {
  assert.equal(run({ sa: "yes" }).obligations[0].ref, "SA");
  assert.equal(run({}).obligations[0].ref, "P87");
});

test("bad input is rejected, not clamped", () => {
  assert.ok(run({ weeks2022: 60 }).errors.length);
  assert.ok(run({ weeks2022: -1 }).errors.length);
  assert.ok(run({ rate: 30 }).errors.length);
  assert.ok(run({ asOf: "yesterday" }).errors.length);
  assert.ok(run({ weeks2022: 0, weeks2023: 0, weeks2024: 0, weeks2025: 0 }).errors.length);
  assert.ok(parse({ ...SAMPLE, reimbursed: "x" }).errors.length);
});

test("summary names the source and says it is not advice", () => {
  const t = summaryText(run({}));
  assert.ok(t.includes(VERIFY));
  assert.match(t, /Not tax advice/);
});
