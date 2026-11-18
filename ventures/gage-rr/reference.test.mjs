// Pins engine.mjs to an independent Python reference (eval/reference.py:
// statsmodels OLS ANOVA, numpy solving the expected mean squares, scipy.stats).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { analyze, chi2Quantile, fQuantile, fSf } from "./engine.mjs";

const ref = JSON.parse(readFileSync(new URL("./eval/reference.json", import.meta.url), "utf8"));
const close = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${what}: ${a} vs ${b}`);
const comp = (r, key) => r.components.find((c) => c.key === key);

test("reference was made with the pinned versions", () => {
  assert.deepEqual(ref.versions, { numpy: "2.5.3", scipy: "1.18.1", statsmodels: "0.15.0", pandas: "3.0.5" });
  assert.equal(ref.cases.length, 8);
});

test("chi-square and F quantiles and the F upper tail match scipy", () => {
  for (const q of ref.quantiles) {
    close(chi2Quantile(q.p, q.d1), q.chi2, 1e-9, `chi2 ${q.p} ${q.d1}`);
    close(fQuantile(q.p, q.d1, q.d2), q.f, 1e-9, `F ${q.p} ${q.d1} ${q.d2}`);
    close(fSf(2.5, q.d1, q.d2), q.fsf, 1e-10, `F sf ${q.d1} ${q.d2}`);
  }
});

for (const [i, c] of ref.cases.entries()) {
  test(`case ${i + 1} (${c.design} ${c.args.join(", ")}): ANOVA, p-values and variance components`, () => {
    const r = analyze({ obs: c.rows, design: c.design, interaction: "keep" });
    const t = Object.fromEntries(r.anova.table.map((x) => [x.source, x]));
    if (c.design === "crossed") {
      const names = { part: "Part", operator: "Operator", interaction: "Part × operator", error: "Repeatability" };
      for (const [k, n] of Object.entries(names)) {
        close(t[n].ss, c.ss[k], 1e-9, `${k} SS`);
        assert.equal(t[n].df, c.df[k]);
        if (c.p[k] != null) close(t[n].p, c.p[k], 1e-9, `${k} p`);
      }
      for (const k of ["part", "operator", "interaction", "repeatability"]) close(comp(r, k).variance, Math.max(0, c.components[k]), 1e-9, k);
      const pr = analyze({ obs: c.rows, design: c.design, interaction: "pool" });
      close(pr.anova.pooledTable[2].ms, c.pooled.msResidual, 1e-9, "pooled MS");
      assert.equal(pr.anova.pooledTable[2].df, c.pooled.dfResidual);
      for (const [k, key] of [["part", "part"], ["operator", "reproducibility"], ["repeatability", "repeatability"]]) close(comp(pr, key).variance, Math.max(0, c.pooled[k]), 1e-9, `pooled ${k}`);
    } else {
      const names = { operator: "Operator", partInOperator: "Part (operator)", error: "Repeatability" };
      for (const [k, n] of Object.entries(names)) {
        close(t[n].ss, c.ss[k], 1e-9, `${k} SS`);
        assert.equal(t[n].df, c.df[k]);
        if (c.p[k] != null) close(t[n].p, c.p[k], 1e-9, `${k} p`);
      }
      close(comp(r, "part").variance, Math.max(0, c.components.part), 1e-9, "part");
      close(comp(r, "reproducibility").variance, Math.max(0, c.components.operator), 1e-9, "operator");
      close(comp(r, "repeatability").variance, c.components.repeatability, 1e-9, "repeatability");
    }
    const rep = comp(r, "repeatability");
    close(rep.sdLower ** 2, c.repeatabilityCI[0], 1e-9, "repeatability lower");
    close(rep.sdUpper ** 2, c.repeatabilityCI[1], 1e-9, "repeatability upper");
  });
}
