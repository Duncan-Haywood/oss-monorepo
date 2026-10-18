// Warehouse slotting optimizer. Pure functions, no DOM, no network.
// A small warehouse, 3PL or e-commerce stockroom walks to every pick. Where each SKU sits decides how far. This takes the
// shelf grid (aisles x bays, distances from the dock), each SKU's picks and size, and optionally a sample of real orders, and
// finds where every SKU should live to cut walking: the whole re-slot, and the few swaps that capture most of the saving.
//
// Walking model. The dock is at one corner. Aisle a is x = dockToAisleFt + (a-1) * aisleSpacingFt from it, bay b in an aisle is
// y = dockToBayFt + (b-1) * bayLengthFt. One pick to a bay is a round trip of 2 * (x + y). An order with several lines is one
// "return" tour: out along the front cross-aisle to the farthest aisle needed and back (2 * xmax), plus into each visited
// aisle as deep as its deepest bay and back (2 * ymax per aisle). A SKU taking several bays is picked from its nearest bay.
//
// Method. With one line per trip and every SKU the same size, putting the most-picked SKU in the nearest bay, the next in the
// next nearest, and so on is provably optimal (rearrangement inequality); the tool says so only in that case. Otherwise it
// starts from that ordering (and from picks-per-bay ordering) and swaps pairs of SKUs while any swap shortens the walk.
// Quick wins start from the layout you have: greedy swaps of equal-size SKUs and moves into empty bays, best first.

export const MAX_SKUS = 40;
export const MAX_ORDERS = 3000;
export const SHARED_DEFAULTS = {
  aisles: 4, baysPerAisle: 10, aisleSpacingFt: 12, bayLengthFt: 8, dockToAisleFt: 20, dockToBayFt: 15,
  walkFtPerMin: 200, laborPerHour: 22, moveMinPerBay: 12, monthlyOrders: 0,
};
export const SKU_DEFAULTS = { name: "", picks: 0, bays: 1, aisle: "", bay: "", locked: "" };

// Placeholder example figures, not any business's items or layout.
export const EXAMPLE_SHARED = { ...SHARED_DEFAULTS, aisles: 3, baysPerAisle: 6, monthlyOrders: 4200 };
export const EXAMPLE_SKUS = [
  { name: "Phone case black", picks: 1850, bays: 1, aisle: 3, bay: 6, locked: "" },
  { name: "Charging cable 1m", picks: 1420, bays: 1, aisle: 3, bay: 5, locked: "" },
  { name: "Screen protector", picks: 1100, bays: 1, aisle: 2, bay: 6, locked: "" },
  { name: "Earbuds", picks: 640, bays: 2, aisle: 2, bay: 4, locked: "" },
  { name: "Phone case clear", picks: 520, bays: 1, aisle: 1, bay: 6, locked: "" },
  { name: "Wall charger", picks: 410, bays: 1, aisle: 1, bay: 5, locked: "" },
  { name: "Car mount", picks: 230, bays: 1, aisle: 2, bay: 3, locked: "" },
  { name: "Tablet stand", picks: 180, bays: 1, aisle: 1, bay: 4, locked: "" },
  { name: "Power bank 20k", picks: 150, bays: 2, aisle: 3, bay: 3, locked: "" },
  { name: "Ring light", picks: 90, bays: 2, aisle: 1, bay: 2, locked: "" },
  { name: "Battery bulk pack", picks: 60, bays: 1, aisle: 2, bay: 1, locked: "yes" },
  { name: "Display stand", picks: 25, bays: 1, aisle: 1, bay: 1, locked: "" },
];
export const EXAMPLE_ORDERS = [
  "Phone case black, Screen protector",
  "Phone case black, Charging cable 1m",
  "Charging cable 1m, Wall charger",
  "Phone case black",
  "Earbuds, Charging cable 1m",
  "Screen protector, Phone case clear",
  "Phone case black, Charging cable 1m, Screen protector",
  "Car mount, Phone case black",
  "Power bank 20k, Charging cable 1m",
  "Tablet stand, Phone case clear",
  "Ring light",
  "Charging cable 1m",
  "Phone case black, Screen protector",
  "Earbuds",
  "Wall charger, Charging cable 1m",
  "Battery bulk pack, Phone case black",
].join("\n");

export function num(v, fallback = 0) {
  const n = typeof v === "number" ? v : Number.parseFloat(String(v ?? "").replace(/[$,%\s,]/g, ""));
  return Number.isFinite(n) ? n : fallback;
}
export const money = (n) => (n < 0 ? "-" : "") + "$" + Math.round(Math.abs(n)).toLocaleString("en-US");
export const feet = (n) => Math.round(n).toLocaleString("en-US") + " ft";
export const hours = (n) => (Math.round(n * 10) / 10).toLocaleString("en-US") + " h";

export function cleanShared(raw = {}) {
  const warnings = [];
  const out = {};
  for (const k of Object.keys(SHARED_DEFAULTS)) out[k] = num(raw[k], SHARED_DEFAULTS[k]);
  out.aisles = Math.round(out.aisles);
  out.baysPerAisle = Math.round(out.baysPerAisle);
  if (!(out.aisles >= 1 && out.aisles <= 30)) warnings.push("Aisles must be a whole number from 1 to 30.");
  if (!(out.baysPerAisle >= 1 && out.baysPerAisle <= 60)) warnings.push("Bays per aisle must be a whole number from 1 to 60.");
  for (const k of ["aisleSpacingFt", "bayLengthFt", "walkFtPerMin"]) if (!(out[k] > 0)) warnings.push(`${k} must be above zero.`);
  for (const k of ["dockToAisleFt", "dockToBayFt", "laborPerHour", "moveMinPerBay", "monthlyOrders"]) {
    if (out[k] < 0) warnings.push(`${k} cannot be negative.`);
  }
  return { shared: out, warnings };
}

export function cleanSkus(rows = []) {
  const warnings = [];
  const skus = [];
  const seen = new Set();
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r] || {};
    const name = String(row.name ?? "").trim();
    const picks = num(row.picks, 0);
    if (!name) { if (picks > 0) warnings.push(`Row ${r + 1} has picks but no name.`); continue; }
    const key = name.toLowerCase();
    if (seen.has(key)) { warnings.push(`"${name}" appears twice. Names must be unique so orders can refer to them.`); continue; }
    seen.add(key);
    const bays = Math.max(1, Math.round(num(row.bays, 1)));
    const aisleRaw = String(row.aisle ?? "").trim(), bayRaw = String(row.bay ?? "").trim();
    const hasPos = aisleRaw !== "" || bayRaw !== "";
    const locked = /^(y|yes|true|1|x|lock|locked)$/i.test(String(row.locked ?? "").trim());
    skus.push({ name, picks: Math.max(0, picks), bays, aisle: hasPos ? Math.round(num(aisleRaw, NaN)) : null, bay: hasPos ? Math.round(num(bayRaw, NaN)) : null, locked, row: r + 1 });
  }
  return { skus, warnings };
}

// One order per line, SKU names separated by comma, semicolon, pipe or tab. Unknown names are returned so the page can say so.
export function parseOrders(text, skus) {
  const index = new Map(skus.map((s, i) => [s.name.toLowerCase(), i]));
  const orders = [];
  const unknown = new Map();
  let truncated = false;
  for (const line of String(text ?? "").split(/\r?\n/)) {
    const parts = line.split(/[,;|\t]/).map((p) => p.trim()).filter(Boolean);
    if (!parts.length) continue;
    const set = new Set();
    for (const p of parts) {
      const i = index.get(p.toLowerCase());
      if (i === undefined) unknown.set(p, (unknown.get(p) || 0) + 1); else set.add(i);
    }
    if (!set.size) continue;
    if (orders.length >= MAX_ORDERS) { truncated = true; break; }
    orders.push([...set]);
  }
  return { orders, unknown: [...unknown.keys()], truncated };
}

export function buildGrid(shared) {
  const bays = [];
  for (let a = 1; a <= shared.aisles; a++) {
    for (let b = 1; b <= shared.baysPerAisle; b++) {
      const x = shared.dockToAisleFt + (a - 1) * shared.aisleSpacingFt;
      const y = shared.dockToBayFt + (b - 1) * shared.bayLengthFt;
      bays.push({ id: (a - 1) * shared.baysPerAisle + (b - 1), aisle: a, bay: b, x, y, dist: 2 * (x + y) });
    }
  }
  return bays;
}

const label = (g) => `${g.aisle}-${g.bay}`;

// Resolve where every SKU sits now. Returns bay-id arrays per SKU, or an error string.
export function currentLayout(skus, grid, shared) {
  const B = shared.baysPerAisle;
  const taken = new Array(grid.length).fill(-1);
  const at = skus.map(() => null);
  for (let i = 0; i < skus.length; i++) {
    const s = skus[i];
    if (s.aisle === null) continue;
    if (!Number.isInteger(s.aisle) || !Number.isInteger(s.bay) || s.aisle < 1 || s.aisle > shared.aisles || s.bay < 1 || s.bay + s.bays - 1 > B) {
      return { error: `"${s.name}" is at aisle ${s.aisle ?? "?"}, bay ${s.bay ?? "?"} with ${s.bays} bay(s), which does not fit the ${shared.aisles} x ${B} grid. A SKU taking several bays runs on from its bay along the aisle.` };
    }
    const ids = [];
    for (let k = 0; k < s.bays; k++) {
      const id = (s.aisle - 1) * B + (s.bay - 1) + k;
      if (taken[id] !== -1) return { error: `"${s.name}" and "${skus[taken[id]].name}" both use aisle ${s.aisle}, bay ${s.bay + k}.` };
      taken[id] = i;
      ids.push(id);
    }
    at[i] = ids;
  }
  // SKUs with no position fill the first free run that fits, aisle by aisle.
  for (let i = 0; i < skus.length; i++) {
    if (at[i]) continue;
    if (skus[i].locked) return { error: `"${skus[i].name}" is marked locked but has no aisle and bay.` };
    const need = skus[i].bays;
    let found = null;
    for (let a = 0; a < shared.aisles && !found; a++) {
      for (let b = 0; b + need <= B; b++) {
        let ok = true;
        for (let k = 0; k < need; k++) if (taken[a * B + b + k] !== -1) { ok = false; break; }
        if (ok) { found = a * B + b; break; }
      }
    }
    if (found === null) return { error: `There is no room left for "${skus[i].name}": the SKUs need more bays (or longer free runs) than the ${shared.aisles} x ${B} grid has.` };
    const ids = [];
    for (let k = 0; k < need; k++) { taken[found + k] = i; ids.push(found + k); }
    at[i] = ids;
  }
  return { at, taken };
}

function makeCost(grid, skus, orders, shared) {
  const A = shared.aisles;
  const ordersMode = orders.length > 0;
  const scale = ordersMode ? (shared.monthlyOrders > 0 ? shared.monthlyOrders : orders.length) / orders.length : 1;
  const deep = new Float64Array(A + 1);
  // pick[i] = bay id the SKU is picked from. Returns feet per month.
  return {
    ordersMode,
    scale,
    ft(pick) {
      if (!ordersMode) {
        let t = 0;
        for (let i = 0; i < skus.length; i++) t += skus[i].picks * grid[pick[i]].dist;
        return t;
      }
      let total = 0;
      for (const order of orders) {
        let xmax = 0;
        for (const i of order) { const g = grid[pick[i]]; deep[g.aisle] = 0; if (g.x > xmax) xmax = g.x; }
        let tour = 2 * xmax;
        for (const i of order) {
          const g = grid[pick[i]];
          if (g.y > deep[g.aisle]) { tour += 2 * (g.y - deep[g.aisle]); deep[g.aisle] = g.y; }
        }
        total += tour;
      }
      return total * scale;
    },
  };
}

const nearest = (ids, grid) => ids.reduce((best, id) => (grid[id].dist < grid[best].dist ? id : best), ids[0]);

// Permutation of unlocked SKUs -> bay-id arrays (nearest free bays first).
function placePerm(perm, freeSorted, skus, lockedAt) {
  const at = lockedAt.map((x) => x);
  let p = 0;
  for (const i of perm) {
    const ids = freeSorted.slice(p, p + skus[i].bays).map((g) => g.id);
    p += skus[i].bays;
    at[i] = ids;
  }
  return at;
}

export function analyze(rawSkus, rawShared, ordersText = "") {
  const sh = cleanShared(rawShared);
  const sk = cleanSkus(rawSkus);
  const warnings = [...sh.warnings, ...sk.warnings];
  const shared = sh.shared;
  const fail = (msg) => ({ ok: false, warnings: msg ? [...warnings, msg] : warnings });
  if (sh.warnings.length) return fail();
  const skus = sk.skus;
  if (skus.length < 2) return fail("Add at least two SKUs with names.");
  if (skus.length > MAX_SKUS) return fail(`Up to ${MAX_SKUS} SKUs at a time.`);
  const grid = buildGrid(shared);
  const cur = currentLayout(skus, grid, shared);
  if (cur.error) return fail(cur.error);

  const parsed = parseOrders(ordersText, skus);
  if (parsed.unknown.length) warnings.push(`Not in your SKU list, ignored: ${parsed.unknown.slice(0, 6).join(", ")}${parsed.unknown.length > 6 ? ", and more" : ""}.`);
  if (parsed.truncated) warnings.push(`Only the first ${MAX_ORDERS} orders were used.`);
  const orders = parsed.orders;
  const ordersMode = orders.length > 0;
  // In orders mode a SKU's weight for ordering is its appearances in the sample, scaled to a month.
  const weights = skus.map((s) => s.picks);
  const scale = ordersMode ? (shared.monthlyOrders > 0 ? shared.monthlyOrders : orders.length) / orders.length : 1;
  if (ordersMode) {
    const counts = skus.map(() => 0);
    for (const o of orders) for (const i of o) counts[i]++;
    for (let i = 0; i < skus.length; i++) weights[i] = counts[i] * scale;
  } else if (!skus.some((s) => s.picks > 0)) {
    return fail("Give at least one SKU a picks-per-month figure, or paste some orders.");
  }
  const w = skus.map((s, i) => ({ ...s, picks: weights[i] }));
  const cost = makeCost(grid, w, orders, shared);

  const pickOf = (at) => at.map((ids) => nearest(ids, grid));
  const curAt = cur.at;
  const curFt = cost.ft(pickOf(curAt));

  const locked = skus.map((s) => s.locked);
  const lockedAt = skus.map((_, i) => (locked[i] ? curAt[i] : null));
  const lockedSet = new Set(lockedAt.flat().filter((x) => x !== null));
  const freeSorted = grid.filter((g) => !lockedSet.has(g.id)).sort((a, b) => a.dist - b.dist || a.aisle - b.aisle || a.bay - b.bay);
  const movable = skus.map((_, i) => i).filter((i) => !locked[i]);
  const need = movable.reduce((t, i) => t + skus[i].bays, 0);
  if (need > freeSorted.length) return fail("The unlocked SKUs need more bays than the locked ones leave free.");

  // Seeds, then pairwise-swap descent.
  const evalPerm = (perm) => cost.ft(pickOf(placePerm(perm, freeSorted, skus, lockedAt).map((ids, i) => ids || curAt[i])));
  const seedA = [...movable].sort((a, b) => weights[b] - weights[a] || a - b);
  const seedB = [...movable].sort((a, b) => weights[b] / skus[b].bays - weights[a] / skus[a].bays || a - b);
  const sizes = new Set(movable.map((i) => skus[i].bays));
  const optimalProven = !ordersMode && sizes.size <= 1;
  let best = null;
  let budget = 40_000_000;
  for (const seed of optimalProven ? [seedA] : [seedA, seedB]) {
    let perm = seed.slice();
    let f = evalPerm(perm);
    if (!optimalProven) {
      let improved = true;
      while (improved && budget > 0) {
        improved = false;
        for (let a = 0; a < perm.length - 1; a++) {
          for (let b = a + 1; b < perm.length; b++) {
            [perm[a], perm[b]] = [perm[b], perm[a]];
            const g = evalPerm(perm);
            budget -= ordersMode ? orders.length * 3 : skus.length;
            if (g < f - 1e-9) { f = g; improved = true; } else [perm[a], perm[b]] = [perm[b], perm[a]];
          }
        }
      }
    }
    if (!best || f < best.f) best = { perm, f };
  }
  const propAt = placePerm(best.perm, freeSorted, skus, lockedAt).map((ids, i) => ids || curAt[i]);
  const propPick = pickOf(propAt);
  // Never report a plan worse than what you have.
  let proposedFt = best.f, proposedAt = propAt;
  if (proposedFt > curFt) { proposedFt = curFt; proposedAt = curAt; }

  const ftToHours = (ft) => ft / shared.walkFtPerMin / 60;
  const perYear = (ft) => ftToHours(ft) * shared.laborPerHour * 12;
  const saved = curFt - proposedFt;

  const sameAt = (a, b) => a.length === b.length && a.every((v, k) => v === b[k]);
  const dist1 = (at) => grid[nearest(at, grid)].dist;
  const moves = [];
  for (let i = 0; i < skus.length; i++) {
    if (sameAt(curAt[i], proposedAt[i])) continue;
    moves.push({
      name: skus[i].name, bays: skus[i].bays,
      from: curAt[i].map((id) => label(grid[id])).join(" "), to: proposedAt[i].map((id) => label(grid[id])).join(" "),
      picks: weights[i], saved: ordersMode ? null : weights[i] * (dist1(curAt[i]) - dist1(proposedAt[i])),
    });
  }
  moves.sort((a, b) => (b.saved ?? b.picks) - (a.saved ?? a.picks));
  const baysMoved = moves.reduce((t, m) => t + m.bays, 0);
  const moveHours = (baysMoved * shared.moveMinPerBay) / 60;
  const moveCost = moveHours * shared.laborPerHour;
  const savedPerMonth = saved > 0 ? (ftToHours(saved)) * shared.laborPerHour : 0;
  const fullPlan = {
    moved: moves.length, baysMoved, moveHours, moveCost,
    paybackWeeks: savedPerMonth > 0 ? (moveCost / savedPerMonth) * 4.345 : null,
  };

  // Quick wins from the current layout.
  const quick = [];
  {
    const at = curAt.map((ids) => ids.slice());
    const taken = new Array(grid.length).fill(-1);
    at.forEach((ids, i) => ids.forEach((id) => { taken[id] = i; }));
    let ft = curFt, cumCost = 0;
    const B = shared.baysPerAisle;
    for (let step = 1; step <= 12; step++) {
      let bestMove = null;
      // swaps of two unlocked SKUs of the same size
      for (const a of movable) {
        for (const b of movable) {
          if (b <= a || skus[a].bays !== skus[b].bays) continue;
          const sa = at[a], sb = at[b];
          at[a] = sb; at[b] = sa;
          const g = cost.ft(pickOf(at));
          at[a] = sa; at[b] = sb;
          if (g < ft - 1e-9 && (!bestMove || g < bestMove.g)) bestMove = { g, kind: "swap", a, b };
        }
      }
      // moves into a free run of the same size, nearest runs first
      const runs = [];
      for (let a = 0; a < shared.aisles; a++) {
        for (let b = 0; b < B; b++) {
          if (taken[a * B + b] === -1) runs.push(a * B + b);
        }
      }
      runs.sort((x, y) => grid[x].dist - grid[y].dist);
      for (const i of movable) {
        let tried = 0;
        for (const start of runs) {
          if (tried >= 40) break;
          const k = skus[i].bays;
          if (grid[start].bay + k - 1 > B) continue;
          let free = true;
          for (let q = 0; q < k; q++) if (taken[start + q] !== -1) { free = false; break; }
          if (!free) continue;
          tried++;
          const old = at[i];
          at[i] = Array.from({ length: k }, (_, q) => start + q);
          const g = cost.ft(pickOf(at));
          at[i] = old;
          if (g < ft - 1e-9 && (!bestMove || g < bestMove.g)) bestMove = { g, kind: "move", a: i, start };
        }
      }
      if (!bestMove) break;
      const gain = ft - bestMove.g;
      let text, movedBays;
      if (bestMove.kind === "swap") {
        const { a, b } = bestMove;
        text = `Swap "${skus[a].name}" (${at[a].map((id) => label(grid[id])).join(" ")}) with "${skus[b].name}" (${at[b].map((id) => label(grid[id])).join(" ")})`;
        const t = at[a]; at[a] = at[b]; at[b] = t;
        movedBays = skus[a].bays + skus[b].bays;
      } else {
        const { a, start } = bestMove;
        const to = Array.from({ length: skus[a].bays }, (_, q) => start + q);
        text = `Move "${skus[a].name}" from ${at[a].map((id) => label(grid[id])).join(" ")} to the empty ${to.map((id) => label(grid[id])).join(" ")}`;
        at[a].forEach((id) => { taken[id] = -1; });
        at[a] = to;
        to.forEach((id) => { taken[id] = a; });
        movedBays = skus[a].bays;
      }
      if (bestMove.kind === "swap") {
        at[bestMove.a].forEach((id) => { taken[id] = bestMove.a; });
        at[bestMove.b].forEach((id) => { taken[id] = bestMove.b; });
      }
      ft = bestMove.g;
      cumCost += ((movedBays * shared.moveMinPerBay) / 60) * shared.laborPerHour;
      const cumSaved = curFt - ft;
      const monthly = ftToHours(cumSaved) * shared.laborPerHour;
      quick.push({
        step, text, savedFt: gain, cumSavedFt: cumSaved, cumPct: curFt > 0 ? cumSaved / curFt : 0,
        cumPerYear: monthly * 12, cumMoveCost: cumCost, paybackWeeks: monthly > 0 ? (cumCost / monthly) * 4.345 : null,
      });
    }
  }

  // ABC classes by picks.
  const totalW = weights.reduce((t, v) => t + v, 0);
  const ranked = skus.map((s, i) => ({ name: s.name, picks: weights[i] })).sort((a, b) => b.picks - a.picks);
  let run = 0;
  const abc = ranked.map((r) => {
    const before = totalW > 0 ? run / totalW : 0;
    run += r.picks;
    return { ...r, share: totalW > 0 ? r.picks / totalW : 0, cum: totalW > 0 ? run / totalW : 0, cls: before < 0.8 ? "A" : before < 0.95 ? "B" : "C" };
  });

  const cells = (at) => {
    const rows = [];
    for (let b = 0; b < shared.baysPerAisle; b++) {
      const row = [];
      for (let a = 0; a < shared.aisles; a++) {
        const id = a * shared.baysPerAisle + b;
        const i = at.findIndex((ids) => ids.includes(id));
        row.push(i < 0 ? null : { name: skus[i].name, picks: weights[i], locked: locked[i] });
      }
      rows.push(row);
    }
    return rows;
  };

  return {
    ok: true, warnings, shared, grid, skus, mode: ordersMode ? "orders" : "single", ordersUsed: orders.length, optimalProven,
    current: { ft: curFt, hours: ftToHours(curFt), perYear: perYear(curFt) },
    proposed: { ft: proposedFt, hours: ftToHours(proposedFt), perYear: perYear(proposedFt) },
    savedFt: saved, savedPct: curFt > 0 ? saved / curFt : 0, savedHoursMonth: ftToHours(saved), savedPerYear: perYear(saved),
    moves, fullPlan, quick, abc, curCells: cells(curAt), propCells: cells(proposedAt),
    assumedPositions: skus.some((s) => s.aisle === null && !s.locked),
    propPick,
  };
}

export function toCsv(a) {
  const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
  const lines = [["SKU", "Bays", "Picks per month", "From (aisle-bay)", "To (aisle-bay)"].map(q).join(",")];
  for (const m of a.moves) lines.push([q(m.name), m.bays, Math.round(m.picks), q(m.from), q(m.to)].join(","));
  return lines.join("\n") + "\n";
}
