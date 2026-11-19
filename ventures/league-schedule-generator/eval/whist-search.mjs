// Search for cyclic whist base rounds (Z-cyclic whist tournaments).
// n = 4k+1: points Z_n, base round of k tables on Z_n \ {0}; developed mod n gives n rounds.
// n = 4k:   points Z_{n-1} + infinity, base round of k tables on all points; n-1 rounds.
// A table [a, b, x, y] is a&b vs x&y. Condition: partner differences cover each nonzero residue
// once, opponent differences twice. Randomised backtracking with restarts.
// Usage: node eval/whist-search.mjs 5 49 [nodeBudget] > eval/whist-search.txt
import { mulberry32 } from "../calc.mjs";

const INF = -1;
// group: moduli of a product of cyclic groups, e.g. [3, 3] for Z3 x Z3 (default [v]).
// An element is the mixed-radix number of its coordinates.
export function groupSub(mods) {
  const v = mods.reduce((a, b) => a * b, 1);
  const co = (x) => mods.map((m) => { const c = x % m; x = Math.floor(x / m); return c; });
  const enc = (c) => c.reduceRight((acc, ci, i) => acc * mods[i] + ci, 0);
  const sub = Array.from({ length: v }, (_, a) => Array.from({ length: v }, (_, b) => { const ca = co(a), cb = co(b); return enc(ca.map((x, i) => ((x - cb[i]) % mods[i] + mods[i]) % mods[i])); }));
  const add = Array.from({ length: v }, (_, a) => Array.from({ length: v }, (_, b) => { const ca = co(a), cb = co(b); return enc(ca.map((x, i) => (x + cb[i]) % mods[i])); }));
  return { v, sub, add };
}

export function searchBase(n, { budget = 2e6, seed = 1, tries = 200, mods = null } = {}) {
  const fourK1 = n % 4 === 1;
  const v = fourK1 ? n : n - 1; // group order
  const G = groupSub(mods ?? [v]);
  const k = Math.floor(n / 4);
  const pts = fourK1 ? [...Array(v - 1).keys()].map((i) => i + 1) : [INF, ...Array(v).keys()];
  const rng = mulberry32(seed);
  for (let t = 0; t < tries; t++) {
    const pc = new Int8Array(v), oc = new Int8Array(v);
    const used = new Set();
    const slots = new Array(4 * k);
    let nodes = 0;
    const order = pts.slice();
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    const d = (a, b) => G.sub[a][b];
    const addP = (a, b, s) => { if (a === INF || b === INF) return true; const x = d(a, b), y = d(b, a); pc[x] += s; pc[y] += s; return pc[x] <= 1 && pc[y] <= 1; };
    const addO = (a, b, s) => { if (a === INF || b === INF) return true; const x = d(a, b), y = d(b, a); oc[x] += s; oc[y] += s; return oc[x] <= 2 && oc[y] <= 2; };
    const place = (pos) => {
      if (pos === 4 * k) return true;
      if (++nodes > budget / tries) return false;
      const ti = Math.floor(pos / 4) * 4, r = pos % 4;
      for (const p of order) {
        if (used.has(p)) continue;
        if (r === 0 && pos > 0) { // first slot of a table: smallest-in-order unused (symmetry)
          const first = order.find((q) => !used.has(q));
          if (p !== first) continue;
        }
        if (r === 1 && order.indexOf(p) < order.indexOf(slots[ti])) continue;
        if (r === 3 && order.indexOf(p) < order.indexOf(slots[ti + 2])) continue;
        const ops = [];
        let ok = true;
        if (r === 1) { ops.push(["P", slots[ti], p]); }
        if (r === 2) { ops.push(["O", slots[ti], p], ["O", slots[ti + 1], p]); }
        if (r === 3) { ops.push(["P", slots[ti + 2], p], ["O", slots[ti], p], ["O", slots[ti + 1], p]); }
        const done = [];
        for (const [kind, a, b] of ops) { const res = kind === "P" ? addP(a, b, 1) : addO(a, b, 1); done.push([kind, a, b]); if (!res) { ok = false; break; } }
        if (ok) { used.add(p); slots[pos] = p; if (place(pos + 1)) return true; used.delete(p); }
        for (const [kind, a, b] of done) kind === "P" ? addP(a, b, -1) : addO(a, b, -1);
      }
      return false;
    };
    if (place(0)) return { n, mods: mods ?? [v], infinity: !fourK1, tables: Array.from({ length: k }, (_, i) => slots.slice(4 * i, 4 * i + 4)) };
  }
  return null;
}

if (process.argv[1] && process.argv[1].endsWith("whist-search.mjs")) {
  const lo = +process.argv[2] || 5, hi = +process.argv[3] || 49, budget = +process.argv[4] || 4e6;
  for (let n = lo; n <= hi; n++) {
    if (n % 4 !== 0 && n % 4 !== 1) continue;
    const t = Date.now();
    const seed = +process.argv[5] || 1;
    let r = searchBase(n, { budget, seed });
    let mods = [n % 4 === 1 ? n : n - 1];
    if (!r && n === 9) { mods = [3, 3]; r = searchBase(n, { budget, seed, mods }); }
    console.log(JSON.stringify({ n, mods, ms: Date.now() - t, tables: r ? r.tables : null }));
  }
}
