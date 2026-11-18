// Pins engine.mjs to an independent Python reference (eval/reference.py:
// statsmodels ConditionalLogit with its own dummy coding, a numpy sandwich).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { analyze } from "./engine.mjs";

const ref = JSON.parse(readFileSync(new URL("./eval/reference.json", import.meta.url), "utf8"));
const close = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${what}: ${a} vs ${b}`);

test("reference was made with the pinned versions", () => {
  assert.deepEqual(ref.versions, { numpy: "2.5.3", scipy: "1.18.1", statsmodels: "0.15.0", pandas: "3.0.5" });
  assert.equal(ref.cases.length, 4);
});

for (const c of ref.cases) {
  test(`${c.name}: coefficients, SEs, log-likelihood, importance and WTP match statsmodels`, () => {
    const text = readFileSync(new URL(`./${c.file}`, import.meta.url), "utf8");
    const r = analyze({ text, levels: c.levels, numeric: c.numeric, price: c.price, bootstrap: 0 });
    assert.deepEqual(r.coefficients.map((x) => x.label), c.names);
    r.coefficients.forEach((x, i) => {
      close(x.estimate, c.beta[i], 1e-7, `${x.label} beta`);
      close(x.se, c.se[i], 1e-6, `${x.label} se`);
      close(x.seRobust, c.se_robust[i], 1e-6, `${x.label} robust se`);
    });
    close(r.fit.logLik, c.llf, 1e-9, "log-likelihood");
    for (const im of r.importance) close(im.importance, c.importance[im.attr], 1e-6, `${im.attr} importance`);
    for (const w of r.wtp) {
      const key = w.level === "per unit" ? `${w.attr} (per unit)` : w.attr === "None" ? "None (no-choice constant)" : `${w.attr}: ${w.level}`;
      close(w.value, c.wtp[key], 1e-6, `${key} wtp`);
    }
  });
}
