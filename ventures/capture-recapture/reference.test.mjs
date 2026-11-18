// Pins engine.mjs to an independent Python reference (eval/reference.py:
// the full multinomial over all 2^k histories, maximised numerically by
// scipy.optimize, checked against scipy.stats.multinomial.logpmf).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { analyze, chi2Quantile, zCrit } from "./engine.mjs";

const ref = JSON.parse(readFileSync(new URL("./eval/reference.json", import.meta.url), "utf8"));
const close = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${what}: ${a} vs ${b}`);

test("reference was made with the pinned versions, and its likelihood is scipy's", () => {
  assert.deepEqual(ref.versions, { numpy: "2.5.3", scipy: "1.18.1" });
  assert.equal(ref.cases.length, 6);
  for (const c of ref.cases) for (const m of Object.values(c.models)) if (m) close(m.ownAtN, m.scipyLogpmf, 1e-9, `${c.name} logpmf`);
});

test("chi-square and normal critical values match scipy", () => {
  for (const q of ref.chi2) {
    close(chi2Quantile(q.p, 1), q.q, 1e-10, `chi2 ${q.p}`);
    close(zCrit(q.p), q.z, 1e-10, `z ${q.p}`);
  }
});

for (const c of ref.cases) {
  test(`${c.name}: whole-number MLE, log-likelihood and profile limits for M0, Mt, Mb`, () => {
    const r = analyze({ histories: c.histories, counts: c.counts });
    const g = r.groups[0];
    for (const [name, m] of Object.entries(c.models)) {
      const e = g.models[name];
      if (m == null) {
        assert.equal(e.finite, false, `${name} should have no finite estimate`);
        continue;
      }
      assert.equal(e.N, m.N, `${name} N`);
      close(e.logLik, m.logLikAtN, 1e-7, `${name} logLik`);
      close(e.lower, m.lower, 1e-6, `${name} lower`);
      if (m.upper == null) assert.equal(e.upper, null, `${name} upper`);
      else close(e.upper, m.upper, 1e-6, `${name} upper`);
    }
  });
}
