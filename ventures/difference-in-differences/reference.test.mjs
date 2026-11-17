// The engine against csdid 0.4.5 (a port of R's did, for ATT(g,t), the
// aggregations and the Wald pre-test) and pyfixest 0.70.0 (two-way fixed
// effects with unit-clustered errors). Reference numbers: eval/reference.json,
// written by eval/reference.py.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { analyze } from "./engine.mjs";

const read = (f) => readFileSync(new URL(`./${f}`, import.meta.url), "utf8");
const ref = JSON.parse(read("eval/reference.json"));
const TOL = 1e-9;

const CASES = [
  ["castle", "never_varying", "data/castle.csv", { unit: "state", time: "year", outcome: "l_homicide" }, {}],
  ["castle", "notyet_varying", "data/castle.csv", { unit: "state", time: "year", outcome: "l_homicide" }, {}],
  ["castle", "never_universal", "data/castle.csv", { unit: "state", time: "year", outcome: "l_homicide" }, {}],
  ["castle", "never_varying_min2", "data/castle.csv", { unit: "state", time: "year", outcome: "l_homicide" }, { minCohort: 2 }],
  ["simulated", "never_varying", "eval/simulated.csv", { unit: "unit", time: "period", outcome: "y" }, {}],
  ["simulated", "notyet_varying", "eval/simulated.csv", { unit: "unit", time: "period", outcome: "y" }, {}],
];

for (const [data, key, file, spec, extra] of CASES) {
  test(`${data} ${key}: ATT(g,t), standard errors and aggregations match csdid`, () => {
    const R = ref[data][key];
    const [control, base] = key.split("_");
    const r = analyze({ csv: read(file), ...spec, cohort: "first_treated", control, base, bootstrap: 0, ...extra });
    let compared = 0;
    for (const c of R.attgt) {
      if (c.se === null) { assert.equal(c.att, 0); continue; } // universal base period: the reference cell itself
      const m = r.attgt.find((x) => x.g === c.g && x.t === c.t);
      assert.ok(m, `missing ATT(${c.g},${c.t})`);
      assert.ok(Math.abs(m.att - c.att) < TOL, `ATT(${c.g},${c.t}) ${m.att} vs ${c.att}`);
      assert.ok(Math.abs(m.se - c.se) < TOL, `se(${c.g},${c.t}) ${m.se} vs ${c.se}`);
      compared++;
    }
    assert.equal(compared, r.attgt.length);
    const close = (a, b, what) => assert.ok(Math.abs(a - b) < TOL, `${what}: ${a} vs ${b}`);
    close(r.overall.att, R.simple.att, "simple ATT"); close(r.overall.se, R.simple.se, "simple se");
    close(r.dynamicAverage.att, R.dynamic.att, "event-study average"); close(r.dynamicAverage.se, R.dynamic.se, "event-study average se");
    close(r.groupAverage.att, R.group.att, "cohort average"); close(r.groupAverage.se, R.group.se, "cohort average se");
    for (const row of R.dynamic.rows) {
      const m = r.eventStudy.find((e) => e.e === row.k);
      close(m.att, row.att, `event ${row.k}`);
      if (row.se !== null) close(m.se, row.se, `event ${row.k} se`);
    }
    for (const row of R.group.rows) {
      const m = r.groups.find((g) => g.g === row.k);
      close(m.att, row.att, `cohort ${row.k}`); close(m.se, row.se, `cohort ${row.k} se`);
    }
    if (R.W === null) assert.ok(r.pretest === null || r.pretest.level === "event-time", "csdid finds the group-time pre-test singular; so must we");
    else {
      assert.equal(r.pretest.level, "group-time");
      assert.ok(Math.abs(r.pretest.statistic - R.W) < 1e-7, `W ${r.pretest.statistic} vs ${R.W}`);
      assert.ok(Math.abs(r.pretest.pValue - R.Wpval) < 5e-6, `p ${r.pretest.pValue} vs ${R.Wpval} (csdid rounds to 5 places)`);
    }
  });
}

for (const [data, file, spec] of [["castle", "data/castle.csv", { unit: "state", time: "year", outcome: "l_homicide" }], ["simulated", "eval/simulated.csv", { unit: "unit", time: "period", outcome: "y" }]]) {
  test(`${data}: two-way fixed effects coefficient and clustered SE match pyfixest`, () => {
    const r = analyze({ csv: read(file), ...spec, cohort: "first_treated", bootstrap: 0 });
    assert.ok(Math.abs(r.twfe.beta - ref[data].twfe.beta) < TOL, `${r.twfe.beta} vs ${ref[data].twfe.beta}`);
    assert.ok(Math.abs(r.twfe.se - ref[data].twfe.se) < TOL, `${r.twfe.se} vs ${ref[data].twfe.se}`);
  });
}

test("castle example headline numbers, as the README and post quote them", () => {
  const r = analyze({ csv: read("data/castle.csv"), unit: "state", time: "year", outcome: "l_homicide", cohort: "first_treated" });
  assert.equal(r.units, 50); assert.equal(r.neverTreated, 29);
  assert.deepEqual(r.cohorts.map((c) => [c.g, c.units]), [[2006, 1], [2007, 13], [2008, 4], [2009, 2], [2010, 1]]);
  assert.equal(r.overall.att.toFixed(3), "0.019");
  assert.equal(r.twfe.beta.toFixed(3), "0.069");
  assert.equal(r.pretest, null);
  const fb = r.bacon.byType.find((b) => b.type === "later vs already treated");
  assert.equal(fb.weight.toFixed(3), "0.024");
});
