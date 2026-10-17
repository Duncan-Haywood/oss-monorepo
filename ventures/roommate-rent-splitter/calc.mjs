// Envy-free rent division. Each roommate says what every room is worth to them;
// the engine picks the room assignment with the most total value, then finds
// prices (summing to the rent) at which nobody would swap anyone's room, with
// the least-happy person made as happy as possible (maximin).
//
// Why this is sound: for an assignment that maximises total stated value the
// "envy graph" has no negative cycle, so the price constraints
//   p[a] - p[j] <= v[i][a] - v[i][j]      (person i holds room a, could want j)
// are satisfiable (Su 1999; Gal et al. 2017). Adding p[a] <= v[i][a] - t asks
// everyone for at least t of surplus; the componentwise-largest feasible prices
// come from shortest paths, and their sum falls as t rises, so bisection on t
// finds the largest t whose prices still sum to the rent.

export const MAX_PEOPLE = 8;
const EPS = 1e-9;

export function normaliseBids(bids, totalRent) {
  const sum = bids.reduce((s, b) => s + b, 0);
  if (!(sum > 0)) return bids.map(() => totalRent / bids.length);
  return bids.map((b) => (b / sum) * totalRent);
}

export function validateInput({ totalRent, people, rooms }) {
  const errors = [];
  if (!Number.isFinite(totalRent) || totalRent <= 0) errors.push("Enter the total monthly rent as a number above zero.");
  const n = people?.length ?? 0;
  if (n < 2) errors.push("Add at least two people.");
  if (n > MAX_PEOPLE) errors.push(`This tool handles up to ${MAX_PEOPLE} people.`);
  if (!rooms || rooms.length !== n) errors.push("There must be exactly as many rooms as people.");
  if (errors.length) return errors;
  people.forEach((p, i) => {
    if (!Array.isArray(p.bids) || p.bids.length !== n) errors.push(`${p.name || "Person " + (i + 1)}: give a value for every room.`);
    else if (p.bids.some((b) => !Number.isFinite(b) || b < 0)) errors.push(`${p.name || "Person " + (i + 1)}: values must be zero or more.`);
    else if (!(p.bids.reduce((s, b) => s + b, 0) > 0)) errors.push(`${p.name || "Person " + (i + 1)}: put some value on at least one room.`);
  });
  return errors;
}

// Highest total value over all one-to-one assignments (bitmask DP, n <= 8).
export function bestAssignment(v) {
  const n = v.length;
  const full = (1 << n) - 1;
  const best = new Array(1 << n).fill(-Infinity);
  const pick = new Array(1 << n).fill(-1);
  best[0] = 0;
  for (let mask = 0; mask < full; mask++) {
    if (best[mask] === -Infinity) continue;
    const i = popcount(mask); // next person
    for (let j = 0; j < n; j++) {
      if (mask & (1 << j)) continue;
      const nm = mask | (1 << j);
      const val = best[mask] + v[i][j];
      if (val > best[nm] + EPS) { best[nm] = val; pick[nm] = j; }
    }
  }
  const sigma = new Array(n);
  let mask = full;
  for (let i = n - 1; i >= 0; i--) {
    const j = pick[mask];
    sigma[i] = j;
    mask &= ~(1 << j);
  }
  return { sigma, total: best[full] };
}

function popcount(x) { let c = 0; while (x) { c += x & 1; x >>= 1; } return c; }

// Largest prices satisfying every envy constraint and "everyone gets at least t".
function maxPrices(v, sigma, t) {
  const n = v.length;
  const p = new Array(n).fill(Infinity);
  for (let i = 0; i < n; i++) p[sigma[i]] = v[i][sigma[i]] - t;
  for (let pass = 0; pass <= n; pass++) {
    let changed = false;
    for (let i = 0; i < n; i++) {
      const a = sigma[i];
      for (let j = 0; j < n; j++) {
        if (j === a) continue;
        const cand = p[j] + v[i][a] - v[i][j];
        if (cand < p[a] - 1e-12) { p[a] = cand; changed = true; }
      }
    }
    if (!changed) return p;
  }
  return null; // a negative cycle: the assignment was not value-maximal
}

export function envyFreePrices(v, sigma, totalRent) {
  const n = v.length;
  let lo = -totalRent * 2, hi = totalRent * 2;
  for (let k = 0; k < 200; k++) {
    const mid = (lo + hi) / 2;
    const p = maxPrices(v, sigma, mid);
    const sum = p ? p.reduce((s, x) => s + x, 0) : -Infinity;
    if (sum >= totalRent) lo = mid; else hi = mid;
  }
  const p = maxPrices(v, sigma, lo);
  const shift = (p.reduce((s, x) => s + x, 0) - totalRent) / n;
  return p.map((x) => x - shift);
}

// Whole-dollar (or cent) prices that still add up to the rent exactly.
export function roundPrices(prices, totalRent, step = 1) {
  const units = Math.round(totalRent / step);
  const raw = prices.map((p) => p / step);
  const floors = raw.map(Math.floor);
  let left = units - floors.reduce((s, x) => s + x, 0);
  const order = raw.map((x, i) => [x - Math.floor(x), i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  const out = floors.slice();
  for (let k = 0; left > 0 && k < order.length * 2; k++, left--) out[order[k % order.length][1]] += 1;
  for (let k = 0; left < 0 && k < order.length * 2; k++, left++) out[order[order.length - 1 - (k % order.length)][1]] -= 1;
  return out.map((x) => x * step);
}

// Who would trade for somebody else's room at these prices (given who holds what)?
export function envyReport(v, sigma, prices, tol = 0.005) {
  const n = v.length;
  const items = [];
  for (let i = 0; i < n; i++) {
    const own = v[i][sigma[i]] - prices[sigma[i]];
    let worst = null;
    for (let j = 0; j < n; j++) {
      if (j === sigma[i]) continue;
      const gap = v[i][j] - prices[j] - own;
      if (gap > tol && (!worst || gap > worst.gap)) worst = { room: j, gap };
    }
    if (worst) items.push({ person: i, ...worst });
  }
  return items;
}

export function solve(input) {
  const errors = validateInput(input);
  if (errors.length) return { ok: false, errors };
  const { totalRent, people, rooms } = input;
  const shared = Number.isFinite(input.sharedCosts) && input.sharedCosts > 0 ? input.sharedCosts : 0;
  const n = people.length;
  const v = people.map((p) => normaliseBids(p.bids, totalRent));
  const { sigma } = bestAssignment(v);
  const exact = envyFreePrices(v, sigma, totalRent);
  const step = input.cents ? 0.01 : 1;
  const prices = roundPrices(exact, totalRent, step);
  const sharedEach = shared / n;
  const rows = people.map((p, i) => {
    const room = sigma[i];
    const rent = prices[room];
    return {
      person: p.name || `Person ${i + 1}`,
      room,
      roomName: rooms[room],
      rent,
      sharedShare: sharedEach,
      total: rent + sharedEach,
      value: v[i][room],
      surplus: v[i][room] - rent,
      vsEqual: rent - totalRent / n,
    };
  });
  const envy = envyReport(v, sigma, prices, step * 1.01);
  const equal = totalRent / n;
  const equalEnvy = envyReport(v, sigma, new Array(n).fill(equal), 0.005);
  const equalWorst = Math.min(...people.map((_, i) => v[i][sigma[i]] - equal));
  return {
    ok: true, rows, values: v, assignment: sigma, exact, prices, envy,
    envyFree: envy.length === 0,
    minSurplus: Math.min(...rows.map((r) => r.surplus)),
    equalSplit: { each: equal, envious: equalEnvy.length, worstSurplus: equalWorst },
    totalRent, shared,
    notes: roundingNote(exact, prices, step),
  };
}

function roundingNote(exact, prices, step) {
  const drift = Math.max(...exact.map((x, i) => Math.abs(x - prices[i])));
  return drift > 0.005 ? [`Prices were rounded to the nearest ${step === 1 ? "dollar" : "cent"}; the exact envy-free figures differ by up to $${drift.toFixed(2)}.`] : [];
}

export function money(x) {
  const s = Math.abs(x).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (x < 0 ? "-$" : "$") + s;
}

export function resultText(res, input) {
  const lines = [`Rent split for $${input.totalRent.toFixed(2)} a month`, ""];
  for (const r of res.rows) lines.push(`${r.person}: ${r.roomName} - ${money(r.rent)}${res.shared ? ` + ${money(r.sharedShare)} shared costs = ${money(r.total)}` : ""}`);
  lines.push("", res.envyFree ? "Nobody would trade rooms at these prices." : "Close to envy-free (rounding).", "Method: each person's own values, highest total value room assignment, prices where no one prefers another room.");
  return lines.join("\n");
}

export function resultCsv(res) {
  const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
  const rows = [["person", "room", "rent", "shared_costs", "total", "surplus_vs_own_value"]];
  for (const r of res.rows) rows.push([q(r.person), q(r.roomName), r.rent.toFixed(2), r.sharedShare.toFixed(2), r.total.toFixed(2), r.surplus.toFixed(2)]);
  return rows.map((r) => r.join(",")).join("\n") + "\n";
}

export function serializeState(s) { return JSON.stringify({ kind: "roommate-rent-splitter", version: 1, ...s }, null, 2); }

export function parseState(text) {
  let o;
  try { o = JSON.parse(text); } catch { return { error: "That file is not valid JSON." }; }
  if (!o || o.kind !== "roommate-rent-splitter") return { error: "That is not a saved rent split." };
  if (!Number.isFinite(o.totalRent) || !Array.isArray(o.people) || !Array.isArray(o.rooms)) return { error: "The saved file is missing fields." };
  return { state: { totalRent: o.totalRent, sharedCosts: Number(o.sharedCosts) || 0, rooms: o.rooms.map(String), people: o.people.map((p) => ({ name: String(p.name ?? ""), bids: (p.bids ?? []).map(Number) })) } };
}

export function sampleInput() {
  return {
    totalRent: 3000, sharedCosts: 240, cents: false,
    rooms: ["Master with bath", "Big bedroom", "Small bedroom"],
    people: [
      { name: "Ana", bids: [1400, 900, 700] },
      { name: "Ben", bids: [900, 1200, 900] },
      { name: "Cleo", bids: [1000, 1000, 1000] },
    ],
  };
}
