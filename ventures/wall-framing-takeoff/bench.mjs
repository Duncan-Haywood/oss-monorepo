// @ts-check
// Seeded benchmark for the lumber optimiser: how often each method finds the
// cheapest order, measured against the exact solver on instances small
// enough for it, and the gap to the LP bound on whole houses.
//
//   node bench.mjs            # prints the tables quoted in README "Verification"
import { optimizeStock, exactStock, samplePlan, takeoff } from "./engine.mjs";

function rng(seed) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** Piece lengths a wall throws off: jacks, cripples, sills, headers, plate pieces. */
function randomInstance(rand, priced) {
  const kinds = 2 + Math.floor(rand() * 4);
  const pieces = [];
  for (let k = 0; k < kinds; k++) {
    const length = Math.round((12 + rand() * 170) * 8) / 8;
    pieces.push({ length, qty: 1 + Math.floor(rand() * 4) });
  }
  const stock = [8, 10, 12, 14, 16].map((f) => ({ length: f * 12, price: priced ? Math.round(f * (0.8 + 0.08 * f + rand() * 0.3) * 100) / 100 : f }));
  return { pieces, stock };
}

export function smallInstances(count = 300, seed = 1) {
  const rand = rng(seed);
  const rows = { flat: { n: 0, cg: 0, ffd: 0, final: 0, cgExcess: 0, ffdExcess: 0 }, priced: { n: 0, cg: 0, ffd: 0, final: 0, cgExcess: 0, ffdExcess: 0 } };
  for (let i = 0; i < count; i++) {
    const priced = i % 2 === 1;
    const { pieces, stock } = randomInstance(rand, priced);
    const kerf = 0.125;
    const k16 = 2;
    const items = pieces.map((p) => ({ w: Math.ceil(p.length * 16 - 1e-6) + k16, d: p.qty })).sort((a, b) => b.w - a.w);
    const boards = stock.map((s) => ({ ...s, cap: Math.floor(s.length * 16 + 1e-6) + k16 }));
    const exact = exactStock(items, boards, 1e8);
    if (!exact) continue;
    const res = optimizeStock(pieces, stock, kerf);
    const r = rows[priced ? "priced" : "flat"];
    r.n++;
    const same = (a) => Math.abs(a - exact.cost) < 1e-6;
    if (same(res.lpCost)) r.cg++;
    if (same(res.ffdCost)) r.ffd++;
    if (same(res.cost)) r.final++;
    r.cgExcess += (res.lpCost - exact.cost) / exact.cost;
    r.ffdExcess += (res.ffdCost - exact.cost) / exact.cost;
  }
  return rows;
}

/** The sample house repeated: n copies of every wall, to see how the bound gap scales. */
export function houses(scales = [1, 2, 4]) {
  return scales.map((k) => {
    const plan = samplePlan();
    const walls = [];
    for (let c = 0; c < k; c++) for (const w of plan.walls) walls.push({ ...w, id: `${w.id} ${c + 1}` });
    plan.walls = walls;
    const t0 = Date.now();
    const r = takeoff(plan);
    if (!r.ok) throw new Error(r.errors.join("; "));
    return { copies: k, pieces: r.summary.pieces, boards: r.summary.boards, cost: r.summary.cost, bound: r.summary.bound, ffd: r.orders.reduce((s, o) => s + o.ffdCost, 0), naive: r.summary.naiveCost, ms: Date.now() - t0 };
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const rows = smallInstances();
  console.log("Small instances (exact solver finishes): share where each method equals the exact cheapest order");
  console.log("prices        n   LP rounding   first fit decr.   shipped (exact used)    mean excess LP / FFD");
  for (const [k, r] of Object.entries(rows)) {
    const pct = (v) => `${((100 * v) / r.n).toFixed(1)}%`.padStart(6);
    console.log(`${k.padEnd(10)} ${String(r.n).padStart(4)}   ${pct(r.cg)}        ${pct(r.ffd)}            ${pct(r.final)}               ${((100 * r.cgExcess) / r.n).toFixed(2)}% / ${((100 * r.ffdExcess) / r.n).toFixed(2)}%`);
  }
  console.log("\nSample house, n copies: cost against the LP lower bound (price 1 per linear foot)");
  console.log("copies  pieces  boards     cost    bound    gap    FFD cost   each piece alone   ms");
  for (const h of houses()) {
    console.log(`${String(h.copies).padStart(6)}  ${String(h.pieces).padStart(6)}  ${String(h.boards).padStart(6)}  ${h.cost.toFixed(2).padStart(7)}  ${h.bound.toFixed(2).padStart(7)}  ${((100 * (h.cost - h.bound)) / h.bound).toFixed(3)}%  ${h.ffd.toFixed(2).padStart(9)}  ${h.naive.toFixed(2).padStart(17)}  ${String(h.ms).padStart(4)}`);
  }
}
