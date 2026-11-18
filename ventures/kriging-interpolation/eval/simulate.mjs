#!/usr/bin/env node
// Simulation check with a known truth. Draw Gaussian random fields with a
// known exponential or spherical covariance (Cholesky of the covariance at
// the sampled sites plus held-out sites, seeded), give the engine only the
// sampled readings, and score what it says at the held-out sites: error
// against the true value for kriging, inverse distance and the nearest
// reading, and how often the 95% band covers the truth. Writes
// eval/simulation.json.
//   node eval/simulate.mjs [--fields 40] [--n 150] [--holdout 100]
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { analyze, gammaModel, rng } from "../engine.mjs";

export function gaussianField(sites, cov, rand) {
  const n = sites.length;
  const L = Array.from({ length: n }, () => new Float64Array(n));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = cov(Math.hypot(sites[i].x - sites[j].x, sites[i].y - sites[j].y), i === j);
      for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
      L[i][j] = i === j ? Math.sqrt(Math.max(s, 1e-12)) : s / L[j][j];
    }
  }
  const z = Array.from({ length: n }, () => {
    const u = Math.max(rand(), 1e-300), v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  });
  return sites.map((_, i) => { let s = 0; for (let k = 0; k <= i; k++) s += L[i][k] * z[k]; return s; });
}

export function simulate({ fields = 40, n = 150, holdout = 100, seed = 7 } = {}) {
  const rand = rng(seed);
  const runs = [];
  for (let f = 0; f < fields; f++) {
    const truth = { model: f % 2 ? "spherical" : "exponential", nugget: 0.1, psill: 1, range: 20 + 40 * rand() };
    const sites = Array.from({ length: n + holdout }, () => ({ x: 100 * rand(), y: 100 * rand() }));
    // covariance: sill - gamma(h); the nugget is micro-scale variation (on the diagonal only)
    const sill = truth.nugget + truth.psill;
    const cov = (h, diag) => (diag ? sill : sill - gammaModel(truth, h));
    const z = gaussianField(sites, cov, rand).map((v) => 10 + v);
    const train = sites.slice(0, n).map((s, i) => ({ x: s.x, y: s.y, v: z[i] }));
    const test = sites.slice(n).map((s, i) => ({ x: s.x, y: s.y, v: z[n + i] }));
    const r = analyze({ points: train, model: truth.model, predictAt: test.map((t) => [t.x, t.y]), grid: false });
    let sk = 0, si = 0, sn = 0, cover = 0;
    r.predictions.forEach((p, i) => {
      const t = test[i].v;
      sk += (p.estimate - t) ** 2;
      si += (p.idw - t) ** 2;
      let best = Infinity, nv = 0;
      for (const q of train) { const h = Math.hypot(q.x - p.x, q.y - p.y); if (h < best) { best = h; nv = q.v; } }
      sn += (nv - t) ** 2;
      if (t >= p.low95 && t <= p.high95) cover++;
    });
    runs.push({
      truth,
      fitted: { nugget: r.model.nugget, psill: r.model.psill, range: r.model.range },
      holdoutRmse: { kriging: Math.sqrt(sk / holdout), idw: Math.sqrt(si / holdout), nearest: Math.sqrt(sn / holdout) },
      coverage95: cover / holdout,
      looMsdr: r.crossValidation.kriging.msdr,
    });
  }
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  return {
    settings: { fields, n, holdout, seed, domain: "100 x 100 square", truth: "exponential or spherical, nugget 0.1, partial sill 1, range uniform 20-60, alternating" },
    summary: {
      krigingBeatsIdw: runs.filter((r) => r.holdoutRmse.kriging < r.holdoutRmse.idw).length,
      krigingBeatsNearest: runs.filter((r) => r.holdoutRmse.kriging < r.holdoutRmse.nearest).length,
      meanRmse: { kriging: mean(runs.map((r) => r.holdoutRmse.kriging)), idw: mean(runs.map((r) => r.holdoutRmse.idw)), nearest: mean(runs.map((r) => r.holdoutRmse.nearest)) },
      meanCoverage95: mean(runs.map((r) => r.coverage95)),
      meanLooMsdr: mean(runs.map((r) => r.looMsdr)),
      medianRangeRatio: [...runs.map((r) => r.fitted.range / r.truth.range)].sort((a, b) => a - b)[runs.length >> 1],
    },
    runs,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? Number(process.argv[i + 1]) : d; };
  const out = simulate({ fields: arg("--fields", 40), n: arg("--n", 150), holdout: arg("--holdout", 100) });
  writeFileSync(new URL("./simulation.json", import.meta.url), JSON.stringify(out, null, 1) + "\n");
  console.log(JSON.stringify(out.summary, null, 2));
}
