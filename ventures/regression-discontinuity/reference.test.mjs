// The engine against rdrobust 2.1.1 (eval/reference.json, made by eval/reference.py).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseCsv, rdEstimate, selectBandwidth } from "./engine.mjs";

const here = new URL(".", import.meta.url);
const ref = JSON.parse(readFileSync(new URL("eval/reference.json", here), "utf8"));
const load = (file, cols) => {
  const { records } = parseCsv(readFileSync(new URL(file, here), "utf8"));
  return cols.map((c) => records.map((r) => Number(r[c])));
};
const [lx, ly, lz] = load("data/lee-simulated.csv", ["vote_margin", "next_vote_share", "prior_share"]);
const [fx, fd, fy] = load("eval/fuzzy.csv", ["score", "treated", "outcome"]);
const [tx, ty] = load("eval/ties.csv", ["score", "outcome"]);
const DATA = { lee: { x: lx, y: ly }, "lee-placebo": { x: lx, y: lz }, fuzzy: { x: fx, y: fy, d: fd }, ties: { x: tx, y: ty } };

for (const c of ref.fixed) {
  test(`fixed bandwidth: ${c.data} ${JSON.stringify(c.options)} matches rdrobust`, () => {
    const o = c.options;
    const r = rdEstimate({ ...DATA[c.data], cutoff: c.cutoff, h: o.h, b: o.b, p: o.p ?? 1, kernel: o.kernel ?? "triangular", vce: o.vce ?? "nn" });
    const got = [r.conventional.estimate, r.biasCorrected.estimate, r.robust.estimate];
    const se = [r.conventional.se, r.biasCorrected.se, r.robust.se];
    got.forEach((v, i) => assert.ok(Math.abs(v - c.estimate[i]) < 1e-8, `estimate ${i}: ${v} vs ${c.estimate[i]}`));
    se.forEach((v, i) => assert.ok(Math.abs(v - c.se[i]) < 1e-8, `se ${i}: ${v} vs ${c.se[i]}`));
    assert.deepEqual([r.n.leftInH, r.n.rightInH], c.n_h);
  });
}

test("automatic bandwidth lands within 0.7-1.1 of rdbwselect's mserd on every test design", () => {
  for (const c of ref.bandwidths) {
    const r = selectBandwidth({ ...DATA[c.data], cutoff: c.cutoff, p: c.options.p ?? 1, kernel: c.options.kernel ?? "triangular" });
    const ratio = r.h / c.h;
    assert.ok(ratio > 0.7 && ratio < 1.1, `${c.data} ${JSON.stringify(c.options)}: h ${r.h} vs ${c.h} (ratio ${ratio})`);
  }
});
