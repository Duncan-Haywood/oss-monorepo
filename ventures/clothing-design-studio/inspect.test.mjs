import test from "node:test";
import assert from "node:assert/strict";
import { acceptProb, findPlan, verdict, ocCurve, hyperPmf } from "./inspect.mjs";

const close = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) < e, `${a} vs ${b}`);

test("hand case: lot 10, 2 bad, sample 3, accept 0: C(8,3)/C(10,3) = 56/120", () => {
  close(acceptProb(10, 3, 0, 0.2), 56 / 120);
});
test("hand case: accept 1 adds 2*C(8,2)/120 = 56/120", () => {
  close(acceptProb(10, 3, 1, 0.2), 112 / 120);
});
test("pmf sums to 1", () => {
  let s = 0; for (let k = 0; k <= 5; k++) s += hyperPmf(50, 10, 5, k); close(s, 1);
});
test("no defects always passes; all bad fails when c < n", () => {
  assert.equal(acceptProb(500, 50, 2, 0), 1);
  assert.equal(acceptProb(500, 50, 2, 1), 0);
});
test("whole lot sampled: pass exactly when defects <= c", () => {
  assert.equal(acceptProb(20, 20, 1, 0.05), 1);
  assert.equal(acceptProb(20, 20, 1, 0.1), 0); // 2 bad of 20, all seen
  assert.equal(acceptProb(20, 20, 1, 0.15), 0);
});
test("OC curve falls as defects rise", () => {
  const o = ocCurve(1000, 80, 5);
  for (let i = 1; i < o.length; i++) assert.ok(o[i].accept <= o[i - 1].accept);
});
test("the common 1,000-lot plan (80 sample, accept 5) passes a 2.5% lot about 98% of the time", () => {
  const pa = acceptProb(1000, 80, 5, 0.025);
  assert.ok(pa > 0.95 && pa < 0.995, String(pa));
});
test("findPlan meets both risks and is minimal in n", () => {
  const p = findPlan({ lot: 1000, aqlPct: 2.5, rqlPct: 10 });
  assert.ok(p.passGoodLot >= 0.95 && p.passBadLot <= 0.1);
  // one fewer piece must not meet them for any c
  for (let c = 0; c < p.n - 1; c++) {
    const ok = acceptProb(1000, p.n - 1, c, 0.025) >= 0.95 && acceptProb(1000, p.n - 1, c, 0.1) <= 0.1;
    assert.ok(!ok);
  }
});
test("tiny lot with a tight demand needs every piece looked at", () => {
  assert.ok(findPlan({ lot: 12, aqlPct: 1, rqlPct: 5 }).n >= 11);
});
test("verdict: 0 found in 80 of 1000 bounds the lot near 3.6%", () => {
  const v = verdict({ lot: 1000, n: 80, accept: 5, found: 0 });
  assert.ok(v.pass); assert.ok(v.upperPct > 3 && v.upperPct < 4.2, String(v.upperPct));
});
test("verdict fails over the accept number and validates input", () => {
  assert.ok(!verdict({ lot: 1000, n: 80, accept: 5, found: 6 }).pass);
  assert.throws(() => verdict({ lot: 100, n: 200, accept: 1, found: 0 }));
  assert.throws(() => acceptProb(100, 10, 1, 2));
});
