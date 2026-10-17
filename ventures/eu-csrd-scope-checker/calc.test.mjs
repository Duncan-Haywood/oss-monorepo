import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, summaryText, SAMPLE, VERIFY, originalWave, omnibusWave, parse } from "./calc.mjs";

const run = (o) => compute({ ...SAMPLE, ...o });

test("sample: 620 staff, EUR 180M is out under the Omnibus but in under the original CSRD", () => {
  const r = run({});
  assert.equal(r.omnibus, null);
  assert.equal(r.original.fy, 2025);
  assert.match(r.findings[0].title, /Probably out of mandatory scope under the Omnibus/);
});

test("over 1,000 staff and EUR 450M turnover is in scope from FY2027", () => {
  const r = run({ employees: 1500, turnover: 600_000_000, assets: 1 });
  assert.equal(r.omnibus.fy, 2027);
  assert.match(r.findings[0].title, /Likely in scope under the Omnibus/);
});

test("both Omnibus tests must be met, and the boundary is strictly greater", () => {
  assert.equal(run({ employees: 1000, turnover: 600_000_000 }).omnibus, null);
  assert.equal(run({ employees: 1500, turnover: 450_000_000 }).omnibus, null);
  assert.ok(run({ employees: 1001, turnover: 450_000_001 }).omnibus);
});

test("original CSRD needs two of three size tests", () => {
  assert.ok(originalWave(parse({ ...SAMPLE, employees: 300, turnover: 60_000_000, assets: 1 })));
  assert.equal(originalWave(parse({ ...SAMPLE, employees: 300, turnover: 1, assets: 1 })), null);
});

test("previously reporting listed company with >500 staff is wave 1 under the original", () => {
  const o = originalWave(parse({ ...SAMPLE, type: "eu-listed", employees: 800, reportedNfrd: "yes" }));
  assert.equal(o.wave, 1);
  assert.equal(o.fy, 2024);
});

test("non-EU group needs both EU turnover tests", () => {
  const yes = omnibusWave(parse({ type: "non-eu-group", euTurnover: 500_000_000, euSubTurnover: 250_000_000 }));
  assert.equal(yes.fy, 2028);
  assert.equal(omnibusWave(parse({ type: "non-eu-group", euTurnover: 500_000_000, euSubTurnover: 100_000_000 })), null);
});

test("small company gets the trickle-down / VSME finding", () => {
  const r = run({ employees: 20, turnover: 2_000_000, assets: 1_000_000 });
  assert.equal(r.original, null);
  assert.ok(r.findings.some((f) => /VSME/.test(f.title)));
});

test("bad input is rejected, never clamped", () => {
  assert.ok(compute({}).errors.length);
  assert.ok(run({ employees: -5 }).errors.length);
  assert.ok(run({ turnover: "lots" }).errors.length);
});

test("summary shows both readings and the verify source", () => {
  const s = summaryText(run({}));
  assert.match(s, /Omnibus thresholds/);
  assert.match(s, /Original CSRD thresholds/);
  assert.ok(s.includes(VERIFY));
});
