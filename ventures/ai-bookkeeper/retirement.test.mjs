import { test } from "node:test";
import assert from "node:assert/strict";
import { retirementLimits, LIMITS } from "./retirement.mjs";

test("SEP is 20% of profit after half SE tax (Pub. 560 worksheet shape)", () => {
  // $100,000 profit: SE tax = 92,350 x 15.3% = 14,129.55; half = 7,064.78 (cents rounded per component)
  const r = retirementLimits(D(100000), { year: 2026 });
  assert.equal(r.earned, D(100000) - r.seDeduction);
  assert.equal(r.sep.max, Math.round(r.earned * 0.2));
  assert.ok(r.sep.max > D(18000) && r.sep.max < D(19000));
});

test("solo 401(k): deferral first, employer share on top, 415(c) cap", () => {
  const r = retirementLimits(D(100000), { year: 2026 });
  assert.equal(r.solo401k.employee, LIMITS[2026].deferral);
  assert.equal(r.solo401k.total, r.solo401k.employee + r.solo401k.employer);
  assert.ok(r.solo401k.total <= LIMITS[2026].total415c);
  const big = retirementLimits(D(500000), { year: 2026 });
  assert.equal(big.solo401k.total, LIMITS[2026].total415c);
  assert.equal(big.sep.max, Math.round(LIMITS[2026].compLimit * 0.2));
});

test("small profit: deferral cannot exceed earnings; catch-up at 50 and 60-63", () => {
  const small = retirementLimits(D(10000), { year: 2026 });
  assert.ok(small.solo401k.total <= small.earned);
  const a = retirementLimits(D(200000), { year: 2026, age: 50 });
  assert.equal(a.solo401k.employee, LIMITS[2026].deferral + LIMITS[2026].catchUp50);
  const b = retirementLimits(D(200000), { year: 2026, age: 61 });
  assert.equal(b.solo401k.employee, LIMITS[2026].deferral + LIMITS[2026].catchUp6063);
});

test("no profit, unknown year, override", () => {
  const z = retirementLimits(0, { year: 2026 });
  assert.equal(z.sep.max, 0);
  assert.equal(z.solo401k.total, 0);
  assert.throws(() => retirementLimits(D(1000), { year: 2031 }), /pass limits/);
  const o = retirementLimits(D(100000), { year: 2031, limits: LIMITS[2026] });
  assert.ok(!o.warnings.some((w) => /from memory/.test(w)));
});
function D(n) { return n * 100; }
