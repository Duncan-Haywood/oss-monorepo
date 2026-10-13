import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, summaryText, SAMPLE, VERIFY, deadlines, qualifying, parse } from "./calc.mjs";

const run = (o) => compute({ ...SAMPLE, ...o });

test("sample: 54,000 of 2024-25 income is caught from 6 April 2026", () => {
  const r = run({});
  assert.equal(r.first.start, "2026-04-06");
  assert.equal(r.schedule.quarters[0].due, "2026-08-07");
  assert.equal(r.schedule.finalDeclaration, "2028-01-31");
});

test("threshold is strictly more than 50,000", () => {
  const r = run({ se2425: 50000, prop2425: 0, se2526: 0, prop2526: 0, se2627: 0, prop2627: 0 });
  assert.equal(r.first, null);
  assert.equal(run({ se2425: 50001, prop2425: 0 }).first.start, "2026-04-06");
});

test("later steps: 31,000 in 2025-26 starts April 2027; 21,000 in 2026-27 starts April 2028", () => {
  const z = { se2425: 0, prop2425: 0, se2526: 0, prop2526: 0, se2627: 0, prop2627: 0 };
  assert.equal(run({ ...z, se2526: 31000 }).first.start, "2027-04-06");
  assert.equal(run({ ...z, prop2627: 21000 }).first.start, "2028-04-06");
  assert.equal(run({ ...z, se2627: 20000 }).first, null);
});

test("earliest applicable step wins", () => {
  assert.equal(run({ se2425: 60000, se2526: 60000 }).first.year, 2026);
});

test("self-employment and property income add together", () => {
  assert.equal(qualifying(parse({ se2425: 30000, prop2425: 25000 })).y2425, 55000);
});

test("standard and calendar quarters share deadlines but not periods", () => {
  const a = deadlines(2026, false), b = deadlines(2026, true);
  assert.deepEqual(a.quarters.map((x) => x.due), b.quarters.map((x) => x.due));
  assert.notEqual(a.quarters[0].period, b.quarters[0].period);
  assert.deepEqual(a.quarters.map((x) => x.due), ["2026-08-07", "2026-11-07", "2027-02-07", "2027-05-07"]);
});

test("near-threshold figures raise a medium finding", () => {
  const r = run({ se2425: 48000, prop2425: 0 });
  assert.ok(r.findings.some((f) => f.severity === "medium" && /within 10%/i.test(f.title)));
});

test("not-mandatory result points at voluntary sign-up", () => {
  const r = run({ se2425: 10000, prop2425: 0, se2526: 10000, prop2526: 0, se2627: 10000, prop2627: 0 });
  assert.ok(r.obligations.some((o) => o.ref === "Voluntary"));
});

test("negative or non-numeric input is rejected, not clamped", () => {
  assert.ok(run({ se2425: -1 }).errors.length);
  assert.ok(run({ se2425: "abc" }).errors.length);
});

test("summary names the source to verify", () => {
  const t = summaryText(run({}));
  assert.ok(t.includes(VERIFY));
  assert.match(t, /Not tax advice/);
});
