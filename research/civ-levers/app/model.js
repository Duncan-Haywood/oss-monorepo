// Browser port of research/civ-levers/src/civ_levers (model.py and levers.py).
// Same update rule, network and levers; a different random stream, so single runs differ from
// Python's while the averages agree. hkRun is deterministic and is checked against Python output
// in tests/model.test.mjs.

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Two equal camps, mean degree k, a share `cross` of ties across camps; camp 0 uniform on
// 0.2 +/- spread, camp 1 on 0.8 +/- spread.
export function polarizedSociety({ n = 1000, k = 10, cross = 0.05, spread = 0.15, seed = 0 } = {}) {
  const r = rng(seed);
  const half = n >> 1;
  const group = Array.from({ length: n }, (_, i) => (i >= half ? 1 : 0));
  const m = (n * k) >> 1, mCross = Math.round(m * cross);
  const seen = new Set(), edges = [];
  const add = (i, j) => {
    if (i === j) return;
    const a = Math.min(i, j), b = Math.max(i, j), key = a * n + b;
    if (!seen.has(key)) { seen.add(key); edges.push([a, b]); }
  };
  while (edges.length < m - mCross) {
    const off = r() < 0.5 ? 0 : half;
    add(off + Math.floor(r() * half), off + Math.floor(r() * half));
  }
  while (edges.length < m) add(Math.floor(r() * half), half + Math.floor(r() * half));
  const x = new Float64Array(n);
  for (let i = 0; i < n; i++) x[i] = (group[i] ? 0.8 : 0.2) + (r() * 2 - 1) * spread;
  return { n, x, group, edges, fixed: new Uint8Array(n), nbr: adjacency(n, edges) };
}

function adjacency(n, edges) {
  const nbr = Array.from({ length: n }, () => []);
  for (const [a, b] of edges) { nbr[a].push(b); nbr[b].push(a); }
  return nbr;
}

export function rewireBridges(soc, share, seed = 0) {
  const r = rng(seed + 1);
  const { n, group } = soc;
  const within = soc.edges.map((e, idx) => idx).filter((idx) => group[soc.edges[idx][0]] === group[soc.edges[idx][1]]);
  const want = Math.round(share * within.length);
  for (let t = within.length - 1; t > 0; t--) { const j = Math.floor(r() * (t + 1)); [within[t], within[j]] = [within[j], within[t]]; }
  const edges = soc.edges.map((e) => e.slice());
  const half = n >> 1;
  for (const idx of within.slice(0, want)) {
    const keep = edges[idx][r() < 0.5 ? 0 : 1];
    const other = (group[keep] ? 0 : half) + Math.floor(r() * half);
    edges[idx] = [Math.min(keep, other), Math.max(keep, other)];
  }
  const seen = new Set(), uniq = [];
  for (const [a, b] of edges) { const key = a * n + b; if (a !== b && !seen.has(key)) { seen.add(key); uniq.push([a, b]); } }
  return { ...soc, x: Float64Array.from(soc.x), fixed: Uint8Array.from(soc.fixed), edges: uniq, nbr: adjacency(n, uniq) };
}

export function ladderPositions(eps, lo = 0.2, hi = 0.8) {
  const k = Math.ceil((hi - lo) / (0.8 * eps));
  return Array.from({ length: k - 1 }, (_, i) => lo + ((i + 1) * (hi - lo)) / k);
}

export const LEVERS = {
  none: "No intervention",
  bridge: "Bridge: rewire ties across camps",
  broadcast: "Broadcast a moderate view (0.5)",
  moderates: "Committed moderates at 0.5",
  ladder: "Ladder of committed voices",
  nudge: "One-off nudge to the centre",
  tolerance: "Raise everyone's tolerance",
};

// A fresh polarized society with the lever applied; returns { soc, kw }.
export function apply(lever, dose, eps, seed = 0, opts = {}) {
  let soc = polarizedSociety({ ...opts, seed });
  const kw = { eps, media: null, mediaP: 0 };
  const r = rng(seed + 10007);
  const pick = (share) => {
    const idx = Array.from({ length: soc.n }, (_, i) => i);
    for (let t = idx.length - 1; t > 0; t--) { const j = Math.floor(r() * (t + 1)); [idx[t], idx[j]] = [idx[j], idx[t]]; }
    return idx.slice(0, Math.round(share * soc.n));
  };
  if (lever === "bridge") soc = rewireBridges(soc, dose, seed);
  else if (lever === "broadcast") { kw.media = 0.5; kw.mediaP = dose; }
  else if (lever === "moderates") for (const i of pick(dose)) { soc.x[i] = 0.5; soc.fixed[i] = 1; }
  else if (lever === "ladder") {
    const pos = ladderPositions(eps);
    pick(dose).forEach((i, t) => { soc.x[i] = pos[t % pos.length]; soc.fixed[i] = 1; });
  } else if (lever === "nudge") for (const i of pick(dose)) soc.x[i] = 0.5;
  else if (lever === "tolerance") kw.eps = eps + dose;
  return { soc, kw };
}

// One sweep: everyone meets one random neighbour (or the broadcast) at once and updates.
export function step(soc, r, { eps, tau = Infinity, mu = 0.3, media = null, mediaP = 0 }) {
  const { n, x, nbr, fixed } = soc;
  const next = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const nb = nbr[i];
    let p = nb.length ? x[nb[Math.floor(r() * nb.length)]] : x[i];
    if (media !== null && mediaP > 0 && r() < mediaP) p = media;
    const d = p - x[i], ad = Math.abs(d);
    const mv = fixed[i] ? 0 : ad < eps ? mu * d : ad > tau ? -mu * d : 0;
    next[i] = Math.min(1, Math.max(0, x[i] + mv));
  }
  soc.x = next;
}

export function measures(soc) {
  let s0 = 0, s1 = 0, c0 = 0, c1 = 0, ext = 0, cen = 0, m = 0;
  for (let i = 0; i < soc.n; i++) {
    if (soc.fixed[i]) continue;
    const v = soc.x[i];
    if (soc.group[i]) { s1 += v; c1++; } else { s0 += v; c0++; }
    if (v < 0.05 || v > 0.95) ext++;
    if (Math.abs(v - 0.5) < 0.1) cen++;
    m++;
  }
  return { gap: Math.abs(s1 / c1 - s0 / c0), extreme: ext / m, centre: cen / m };
}

export function hkRun(x0, eps, steps = 200, tol = 1e-12) {
  let x = Float64Array.from(x0);
  for (let t = 0; t < steps; t++) {
    const y = new Float64Array(x.length);
    let diff = 0;
    for (let i = 0; i < x.length; i++) {
      let s = 0, c = 0;
      for (let j = 0; j < x.length; j++) if (Math.abs(x[i] - x[j]) <= eps) { s += x[j]; c++; }
      y[i] = s / c;
      diff = Math.max(diff, Math.abs(y[i] - x[i]));
    }
    if (diff < tol) return y;
    x = y;
  }
  return x;
}
