// engine.mjs against PySAL (esda 2.9.0, libpysal 4.14.1): eval/reference.py builds the
// weights with libpysal (queen contiguity, great-circle KNN, DistanceBand, inverse
// distance, libpysal's own KNN) and stores esda's numbers in eval/reference.json.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { analyze } from "./engine.mjs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const ref = JSON.parse(read("./eval/reference.json"));
const US = read("./data/us-state-income.csv"), NB = read("./data/us-state-neighbors.csv");

const close = (a, b, what, tol = 1e-9) => {
  const scale = Math.max(1, Math.abs(b));
  assert.ok(Math.abs(a - b) <= tol * scale, `${what}: engine ${a} vs esda ${b}`);
};

for (const c of ref.cases) {
  test(`matches esda: ${c.case}`, () => {
    const input = { ...c.input, permutations: 999, seed: 1 };
    if (c.uses === "us-state") { input.text = US; if (input.weights === "list") input.neighbors = NB; }
    const r = analyze(input).results[0];
    const m = r.moran, e = c.moran;
    close(r.weights.s0, c.s.s0, "S0"); close(r.weights.s1, c.s.s1, "S1"); close(r.weights.s2, c.s.s2, "S2");
    for (const k of ["I", "EI", "VI_norm", "z_norm", "p_norm", "VI_rand", "z_rand", "p_rand"]) close(m[k], e[k], `Moran ${k}`);
    const g = r.geary, eg = c.geary;
    for (const k of ["C", "VC_norm", "VC_rand", "z_norm", "z_rand"]) close(g[k], eg[k], `Geary ${k}`);
    close(g.p_norm, Math.min(1, eg.p_norm_two), "Geary p_norm (two-sided)");
    close(g.p_rand, Math.min(1, eg.p_rand_two), "Geary p_rand (two-sided)");
    if (c.G) {
      for (const k of ["G", "EG", "VG", "z_norm"]) close(r.generalG[k], c.G[k], `G ${k}`);
      close(r.generalG.p_norm, Math.min(1, c.G.p_norm_two), "G p (two-sided)");
    } else assert.equal(r.generalG.G, null);
    const rows = r.local.rows;
    assert.equal(rows.length, c.local.Is.length);
    // esda's G_Local divides by sum(y) and squares the mean in the variance, so its Gi* z
    // flips sign when the values sum to a negative number; Ord & Getis's (1995) standardised
    // form does not. Only the "negative values" case has a negative sum.
    const sign = rows.reduce((a, x) => a + x.value, 0) < 0 ? -1 : 1;
    if (c.case.includes("negative")) assert.equal(sign, -1, "the negative case should have a negative sum");
    const QN = { "high-high": 1, "low-high": 2, "low-low": 3, "high-low": 4 };
    rows.forEach((x, i) => {
      close(x.Ii, c.local.Is[i], `local I ${x.id}`);
      assert.equal(QN[x.quadrant], c.local.q[i], `quadrant ${x.id}`);
      close(x.gi_z, sign * c.gistar[i], `Gi* z ${x.id}`);
    });
    // permutation p-values come from different random streams: compare loosely
    assert.ok(Math.abs(m.p_sim_one - e.p_sim) <= 0.02, `Moran p_sim_one ${m.p_sim_one} vs ${e.p_sim}`);
    assert.equal(m.p_sim, Math.min(1, 2 * m.p_sim_one));
    let off = 0;
    rows.forEach((x, i) => { if (Math.abs(x.p_sim_one - c.local.p_sim[i]) > 0.05) off++; });
    assert.ok(off <= Math.ceil(rows.length * 0.02), `${off} local p_sim differ by more than 0.05`);
  });
}

test("the analytic conditional moments of local Moran match esda (EIc, VIc)", async () => {
  const { localMoran, buildWeights, transformWeights, parseNeighbors } = await import("./engine.mjs");
  const c = ref.cases[0];
  const lines = US.trim().split("\n"), head = lines[0].split(",");
  const j = head.indexOf("pci2009");
  const ids = lines.slice(1).map((l) => l.split(",")[0]);
  const y = lines.slice(1).map((l) => Number(l.split(",")[j]));
  const W = transformWeights(buildWeights({ kind: "list", ids, neighbors: parseNeighbors(NB) }), "r");
  const lm = localMoran(y, W, { permutations: 0 });
  lm.EIc.forEach((v, i) => close(v, c.local.EIc[i], `EIc ${ids[i]}`));
  lm.VIc.forEach((v, i) => close(v, c.local.VIc[i], `VIc ${ids[i]}`));
});

test("provenance is recorded", () => {
  assert.equal(ref.esda, "2.9.0");
  assert.equal(ref.libpysal, "4.14.1");
  assert.ok(ref.cases.length >= 9);
});
