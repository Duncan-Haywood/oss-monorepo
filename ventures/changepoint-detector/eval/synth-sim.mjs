// Simulation for the synthetic control with in-space placebos (synth-control.mjs; pre-registration
// eval/synth-prereg-2026-11-17.md). Panels from a factor model: unit i at time t is
//   a_i + sum_f lambda_if F_ft + e_it,   F_f AR(1) with rho 0.8 (two factors), lambda U(0.5, 1.5), e as the cell says.
// Unit 0 is treated at k. No-change cells (N*) score the share of panels with p <= 0.05; power cells (P*) add an effect
// to unit 0 from k on. Cell E1 puts the treated unit's loadings outside the donors' range (no convex combination can
// match it), the case the fit warning is for.
//   SC_SEED_BASE=11000 SC_SHARD=0/4 node eval/synth-sim.mjs 100 > part0.json
// SC_POOL=with moves the treated unit into each placebo's pool (the README's post-hoc check; default 'without').
// Each line of output is one JSON row per panel: { cell, rep, p, rank, effect, fitWarning }.
import { pathToFileURL } from 'node:url';
import { synthControlTest } from '../synth-control.mjs';

function rng(seed) {
  let s = seed >>> 0 || 1;
  const u = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return (s + 0.5) / 4294967296; };
  const g = () => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u());
  return { u, g };
}

// cell: units (treated + donors), k (points before), m (points after), idio: { sd, rho, walk }, effect(t - k, m), edge
export const CELLS = {
  N1: { units: 39, k: 19, m: 12, idio: { sd: 0.5, rho: 0 } },
  N2: { units: 39, k: 19, m: 12, idio: { sd: 0.5, rho: 0.7 } },
  N3: { units: 20, k: 19, m: 12, idio: { sd: 0.5, rho: 0 } },
  N4: { units: 39, k: 10, m: 8, idio: { sd: 0.5, rho: 0.4 } },
  N5: { units: 39, k: 19, m: 12, idio: { sd: 0.3, rho: 0, walk: 0.15 } },
  E1: { units: 39, k: 19, m: 12, idio: { sd: 0.5, rho: 0 }, edge: true },
  P1: { units: 39, k: 19, m: 12, idio: { sd: 0.5, rho: 0 }, effect: () => -1.0 },
  P2: { units: 39, k: 19, m: 12, idio: { sd: 0.5, rho: 0.7 }, effect: (h, m) => -1.5 * (h + 1) / m },
  P3: { units: 39, k: 19, m: 12, idio: { sd: 0.3, rho: 0, walk: 0.15 }, effect: () => -1.0 },
  P4: { units: 39, k: 10, m: 8, idio: { sd: 0.5, rho: 0.4 }, effect: () => -1.0 },
};

export function panel(cell, seed) {
  const { g, u } = rng(seed);
  const { units, k, m, idio } = cell, n = k + m;
  const F = [0, 0].map(() => { const f = [g() / 0.6]; for (let t = 1; t < n; t++) f.push(0.8 * f[t - 1] + g()); return f; });
  const rows = [];
  for (let i = 0; i < units; i++) {
    let lam = [0.5 + u(), 0.5 + u()];
    if (cell.edge && i === 0) lam = [2.0, 2.0];
    if (cell.lam0 && i === 0) lam = cell.lam0.slice(); // a treated unit inside the hull but near its corner
    const a = 2 * g();
    const y = []; let e = 0, w = 0;
    for (let t = 0; t < n; t++) {
      e = t === 0 ? idio.sd * g() / Math.sqrt(1 - idio.rho ** 2) : idio.rho * e + idio.sd * g();
      if (idio.walk) w += idio.walk * g();
      y.push(a + lam[0] * F[0][t] + lam[1] * F[1][t] + e + w + (i === 0 && cell.effect && t >= k ? cell.effect(t - k, m) : 0));
    }
    rows.push(y);
  }
  // copies: the last 2c rows become c near-copy pairs (row 2j+1 of the block = row 2j + N(0, copySd) each point), so
  // some donors can be matched almost exactly before the date (README "A floored ratio")
  if (cell.copies) {
    const start = units - 2 * cell.copies;
    for (let j = 0; j < cell.copies; j++) rows[start + 2 * j + 1] = rows[start + 2 * j].map((v) => v + cell.copySd * g());
  }
  return rows;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const reps = Number(process.argv[2] ?? 100);
  const base = Number(process.env.SC_SEED_BASE ?? 11000);
  const [si, sn] = (process.env.SC_SHARD ?? '0/1').split('/').map(Number);
  const only = process.env.SC_CELLS ? process.env.SC_CELLS.split(',') : Object.keys(CELLS);
  only.forEach((name, ci) => {
    const cell = CELLS[name];
    for (let r = 0; r < reps; r++) {
      if (r % sn !== si) continue;
      const rows = panel(cell, base + 1000 * ci + r);
      const donors = Object.fromEntries(rows.slice(1).map((d, j) => [`d${j}`, d]));
      const res = synthControlTest(rows[0], donors, cell.k, { placeboPool: process.env.SC_POOL ?? 'without', statistic: 'ratio' });
      console.log(JSON.stringify({ cell: name, rep: r, p: res.p, rank: res.rank, effect: res.effectAverage, fitWarning: res.fitWarning, pre: res.preRmspe }));
    }
  });
}
