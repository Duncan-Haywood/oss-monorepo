// Estate item divider: share out an estate's belongings between heirs.
//
// Two methods, both on values each heir types privately for every item:
//
// 1. "cash" -- sealed bids in dollars. Every item goes to the heir who values
//    it most (that maximises the total value the family gets), and cash
//    payments between heirs (or out of the estate's cash) even it up.
//    - Equal shares: the payments are envy-free -- at the end no heir would
//      rather have another heir's items plus that heir's cash -- and, among
//      envy-free payments, the least-well-off heir's margin over a fair
//      1/n share is as large as possible. Envy-free implies everyone gets at
//      least 1/n of the estate by their own values.
//    - Unequal shares (a will says 50/25/25): Knaster's sealed-bid procedure
//      generalised to entitlements. Each heir gets their entitlement of the
//      estate by their own values, plus their entitlement of the surplus.
//
// 2. "items" -- no cash changes hands. The allocation maximises the
//    (weighted) Nash welfare: the product of each heir's value for what they
//    get, raised to their share. Maximum Nash welfare allocations are
//    Pareto-optimal and envy-free up to one item (weighted EF1 with unequal
//    shares; Caragiannis et al. 2016, Chakraborty et al. 2020). Small estates
//    are solved exactly by branch and bound; large ones by local search from
//    several starts, and the answer is checked for (weighted) EF1 and falls
//    back to a weighted picking sequence, which always satisfies it.
//
// Everything here is plain arithmetic on the user's numbers. No I/O.

export const MAX_HEIRS = 8;
export const MAX_ITEMS = 80;
const EPS = 1e-9;

// ---------------------------------------------------------------- input

export function validateInput(input) {
  const errors = [];
  const heirs = Array.isArray(input?.heirs) ? input.heirs : [];
  const items = Array.isArray(input?.items) ? input.items : [];
  if (heirs.length < 2) errors.push("Add at least two heirs.");
  if (heirs.length > MAX_HEIRS) errors.push(`At most ${MAX_HEIRS} heirs.`);
  if (items.length < 1) errors.push("Add at least one item.");
  if (items.length > MAX_ITEMS) errors.push(`At most ${MAX_ITEMS} items.`);
  const mode = input?.mode === "items" ? "items" : "cash";
  const shares = heirs.map((h) => Number(h?.share));
  if (input?.equalShares === false) {
    if (shares.some((s) => !Number.isFinite(s) || s <= 0)) errors.push("Every heir's share must be a positive percentage.");
    else {
      const total = shares.reduce((a, b) => a + b, 0);
      if (Math.abs(total - 100) > 0.01) errors.push(`Shares must add up to 100% (they add up to ${round2(total)}%).`);
    }
  }
  heirs.forEach((h, i) => {
    const vals = Array.isArray(h?.values) ? h.values : [];
    if (vals.length !== items.length) { errors.push(`${label(h, i)} needs a value for every item.`); return; }
    if (vals.some((v) => !Number.isFinite(Number(v)) || Number(v) < 0)) errors.push(`${label(h, i)} has a value that is not a number of zero or more.`);
    else if (vals.some((v) => Number(v) > 1e9)) errors.push(`${label(h, i)} has a value above $1,000,000,000.`);
    else if (mode === "items" && vals.every((v) => Number(v) === 0)) errors.push(`${label(h, i)} values every item at zero; give at least one item a value.`);
  });
  const cash = Number(input?.estateCash ?? 0);
  if (!Number.isFinite(cash) || cash < 0 || cash > 1e10) errors.push("Estate cash must be a number of zero or more.");
  return errors;
}

function label(h, i) {
  return (h?.name && String(h.name).trim()) || `Heir ${i + 1}`;
}

function weightsOf(input) {
  const n = input.heirs.length;
  if (input.equalShares === false) return input.heirs.map((h) => Number(h.share) / 100);
  return Array(n).fill(1 / n);
}

function round2(x) {
  return Math.round(x * 100) / 100;
}

// ---------------------------------------------------------------- shared helpers

// bundleValues[i][k] = what heir i thinks heir k's bundle is worth.
export function bundleValues(values, owner) {
  const n = values.length;
  const A = Array.from({ length: n }, () => Array(n).fill(0));
  owner.forEach((k, j) => {
    if (k < 0) return;
    for (let i = 0; i < n; i++) A[i][k] += values[i][j];
  });
  return A;
}

// ---------------------------------------------------------------- cash method

// Highest bidder per item; ties go to the earlier heir. Items nobody values
// stay unclaimed (owner -1) so the family can sell or donate them.
export function highestBidder(values) {
  const n = values.length, m = values[0].length;
  const owner = Array(m).fill(-1);
  for (let j = 0; j < m; j++) {
    let best = -1, bv = 0;
    for (let i = 0; i < n; i++) if (values[i][j] > bv + EPS) { bv = values[i][j]; best = i; }
    owner[j] = best;
  }
  return owner;
}

// Envy-free, budget-balanced payments for a welfare-maximising allocation
// with equal shares. p[i] > 0 means heir i receives cash; p[i] < 0 pays in.
//
// Envy-freeness is a system of difference constraints
//   A[i][i] + p[i] >= A[i][k] + p[k]   =>   p[i] >= p[k] + c[i][k],
//   c[i][k] = A[i][k] - A[i][i],
// which has no positive cycle because the allocation maximises total value.
// Adding a floor p[i] >= V[i]/n + t - A[i][i] (each heir at least t above a
// fair share), the least solution is p*(t) = p*(0) + t, so the largest t with
// sum p = 0 has the closed form t* = -sum p*(0) / n.
export function envyFreePayments(values, owner) {
  const n = values.length;
  const A = bundleValues(values, owner);
  const V = values.map((row) => row.reduce((s, x) => s + x, 0));
  // Longest paths D[i][k] under weights c (max-plus Floyd-Warshall).
  const D = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, k) => (i === k ? 0 : A[i][k] - A[i][i])));
  for (let via = 0; via < n; via++)
    for (let i = 0; i < n; i++)
      for (let k = 0; k < n; k++) if (D[i][via] + D[via][k] > D[i][k] + EPS) D[i][k] = D[i][via] + D[via][k];
  const L0 = V.map((v, k) => v / n - A[k][k]);
  const p0 = Array.from({ length: n }, (_, i) => Math.max(...L0.map((l, k) => D[i][k] + l)));
  const t = -p0.reduce((s, x) => s + x, 0) / n;
  return { payments: p0.map((x) => x + t), margin: t };
}

// Knaster's sealed bids with entitlements w (sum 1): each heir ends at
// w[i] * (their own valuation of the estate) + w[i] * surplus.
export function knasterPayments(values, owner, w) {
  const n = values.length;
  const A = bundleValues(values, owner);
  const V = values.map((row) => row.reduce((s, x) => s + x, 0));
  const d = A.map((row, i) => row[i] - w[i] * V[i]);
  const S = d.reduce((s, x) => s + x, 0);
  return { payments: d.map((x, i) => -x + w[i] * S), surplus: S };
}

// Round to cents so the payments still sum to exactly zero (largest remainder).
export function roundPayments(p) {
  const cents = p.map((x) => x * 100);
  const floors = cents.map(Math.floor);
  let short = Math.round(-floors.reduce((s, x) => s + x, 0));
  const order = cents.map((c, i) => [c - floors[i], i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  const out = floors.slice();
  for (let k = 0; k < order.length && short > 0; k++, short--) out[order[k][1]] += 1;
  return out.map((c) => c / 100);
}

// Pairs (i envies k) where heir i would rather have k's items and cash, by more than tol.
export function envyWithCash(values, owner, payments, tol = 1e-6) {
  const A = bundleValues(values, owner);
  const out = [];
  for (let i = 0; i < A.length; i++)
    for (let k = 0; k < A.length; k++)
      if (i !== k && A[i][k] + payments[k] > A[i][i] + payments[i] + tol) out.push({ heir: i, envies: k, by: A[i][k] + payments[k] - A[i][i] - payments[i] });
  return out;
}

// ---------------------------------------------------------------- items-only method

// Score: first minimise the number of heirs with nothing of value, then
// maximise sum w[i] log u[i] over the rest (the standard MNW tie rule when
// everyone cannot be given positive value).
function scoreOf(u, w) {
  let zeros = 0, s = 0;
  for (let i = 0; i < u.length; i++) {
    if (u[i] <= EPS) zeros++;
    else s += w[i] * Math.log(u[i]);
  }
  return { zeros, s };
}
function better(a, b) {
  if (a.zeros !== b.zeros) return a.zeros < b.zeros;
  return a.s > b.s + 1e-12;
}

function utilities(values, owner) {
  const u = Array(values.length).fill(0);
  owner.forEach((k, j) => { if (k >= 0) u[k] += values[k][j]; });
  return u;
}

// Weighted picking sequence: the heir with the lowest (items taken)/share
// picks their favourite remaining item. Satisfies weighted EF1 for additive
// values (Chakraborty, Igarashi, Suksompong and Zick 2021).
export function pickingSequence(values, w, items = null) {
  const n = values.length, m = values[0].length;
  const left = new Set(items ?? Array.from({ length: m }, (_, j) => j));
  const owner = Array(m).fill(-1);
  const taken = Array(n).fill(0);
  while (left.size) {
    let who = 0;
    for (let i = 1; i < n; i++) if (taken[i] / w[i] < taken[who] / w[who] - 1e-12) who = i;
    let best = -1, bv = -1;
    for (const j of left) if (values[who][j] > bv + EPS || (Math.abs(values[who][j] - bv) <= EPS && j < best)) { bv = values[who][j]; best = j; }
    owner[best] = who;
    left.delete(best);
    taken[who]++;
  }
  return owner;
}

// Weighted EF1 (equal weights: plain EF1). Returns the violating pairs.
//   u_i(X_i) / w_i >= (u_i(X_k) - max_{g in X_k} u_i(g)) / w_k
export function ef1Violations(values, owner, w, tol = 1e-7) {
  const n = values.length;
  const A = bundleValues(values, owner);
  const maxIn = Array.from({ length: n }, () => Array(n).fill(0));
  owner.forEach((k, j) => {
    if (k < 0) return;
    for (let i = 0; i < n; i++) if (values[i][j] > maxIn[i][k]) maxIn[i][k] = values[i][j];
  });
  const out = [];
  for (let i = 0; i < n; i++)
    for (let k = 0; k < n; k++) {
      if (i === k) continue;
      const lhs = A[i][i] / w[i], rhs = (A[i][k] - maxIn[i][k]) / w[k];
      if (rhs > lhs + tol * Math.max(1, Math.abs(lhs))) out.push({ heir: i, envies: k });
    }
  return out;
}

// Plain envy (without removing an item), for the report.
export function envyPairs(values, owner, w, tol = 1e-7) {
  const A = bundleValues(values, owner);
  const out = [];
  for (let i = 0; i < A.length; i++)
    for (let k = 0; k < A.length; k++)
      if (i !== k && A[i][k] / w[k] > A[i][i] / w[i] + tol * Math.max(1, A[i][i])) out.push({ heir: i, envies: k });
  return out;
}

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

// Single-item moves and pairwise swaps until no improvement.
function localSearch(values, w, owner, items) {
  const n = values.length;
  const u = utilities(values, owner);
  let cur = scoreOf(u, w);
  let improved = true, rounds = 0;
  while (improved && rounds++ < 500) {
    improved = false;
    for (const j of items) {
      const a = owner[j];
      for (let b = 0; b < n; b++) {
        if (b === a) continue;
        u[a] -= values[a][j]; u[b] += values[b][j];
        const s = scoreOf(u, w);
        if (better(s, cur)) { owner[j] = b; cur = s; improved = true; break; }
        u[a] += values[a][j]; u[b] -= values[b][j];
      }
    }
    if (improved) continue;
    outer: for (let x = 0; x < items.length; x++) {
      for (let y = x + 1; y < items.length; y++) {
        const j = items[x], k = items[y];
        const a = owner[j], b = owner[k];
        if (a === b) continue;
        u[a] += values[a][k] - values[a][j]; u[b] += values[b][j] - values[b][k];
        const s = scoreOf(u, w);
        if (better(s, cur)) { owner[j] = b; owner[k] = a; cur = s; improved = true; break outer; }
        u[a] -= values[a][k] - values[a][j]; u[b] -= values[b][j] - values[b][k];
      }
    }
  }
  return { owner, score: cur };
}

function greedyStart(values, w, items, order) {
  const n = values.length;
  const owner = Array(values[0].length).fill(-1);
  const u = Array(n).fill(0);
  for (const j of order) {
    let best = 0, bs = null;
    for (let i = 0; i < n; i++) {
      u[i] += values[i][j];
      const s = scoreOf(u, w);
      if (bs === null || better(s, bs)) { bs = s; best = i; }
      u[i] -= values[i][j];
    }
    owner[j] = best;
    u[best] += values[best][j];
  }
  return owner;
}

// Exact maximum (weighted) Nash welfare by depth-first branch and bound over
// items in decreasing order of their best value. Bound: every heir also gets
// every remaining item they value (optimistic, but tight near the leaves).
// Returns null if the node budget runs out before the search is complete.
function exactMnw(values, w, items, incumbent, nodeBudget) {
  const n = values.length;
  const order = items.slice().sort((a, b) => Math.max(...values.map((r) => r[b])) - Math.max(...values.map((r) => r[a])) || a - b);
  const m = order.length;
  // rest[d][i]: value to heir i of items order[d..]
  const rest = Array.from({ length: m + 1 }, () => Array(n).fill(0));
  for (let d = m - 1; d >= 0; d--) for (let i = 0; i < n; i++) rest[d][i] = rest[d + 1][i] + values[i][order[d]];
  const owner = incumbent.owner.slice();
  let best = incumbent.score, bestOwner = incumbent.owner.slice();
  const u = Array(n).fill(0);
  let nodes = 0, aborted = false;
  const bound = (d) => {
    const ub = u.map((x, i) => x + rest[d][i]);
    return scoreOf(ub, w);
  };
  // Second bound, from Lagrangian duality on the fractional relaxation
  // (Fisher-market prices). For any item prices pi >= 0,
  //   max sum_i w_i log(u_i + sum_j v_ij x_ij)  s.t. sum_i x_ij <= 1
  //   <= sum_j pi_j + sum_i max_{x in [0,1]^m} [w_i log(u_i + v_i.x) - pi.x],
  // and each inner problem is solved greedily by value per unit price. The
  // prices come from the incumbent (pi_j = max_i w_i v_ij / U_i), which is
  // what makes the bound tight when the incumbent is near optimal. Only used
  // when the incumbent gives everyone something, so comparing log sums is valid.
  const U = utilities(values, incumbent.owner);
  const useDual = incumbent.score.zeros === 0;
  const price = Array(values[0].length).fill(0);
  const byRatio = [];
  if (useDual) {
    for (const j of order) price[j] = Math.max(...values.map((r, i) => (w[i] * r[j]) / U[i]));
    for (let i = 0; i < n; i++) {
      const list = order.map((j, d) => [d, j]).filter(([, j]) => values[i][j] > 0 && price[j] > 0);
      list.sort((a, b) => values[i][b[1]] / price[b[1]] - values[i][a[1]] / price[a[1]]);
      byRatio.push(list);
    }
  }
  const priceRest = Array(m + 1).fill(0);
  for (let d = m - 1; d >= 0; d--) priceRest[d] = priceRest[d + 1] + price[order[d]];
  const dualBound = (d) => {
    let total = priceRest[d];
    for (let i = 0; i < n; i++) {
      let y = 0, cost = 0;
      for (const [dd, j] of byRatio[i]) {
        if (dd < d) continue;
        const v = values[i][j], room = (w[i] * v) / price[j] - u[i] - y;
        if (room <= 0) break;
        if (v <= room) { y += v; cost += price[j]; } else { y += room; cost += (price[j] * room) / v; break; }
      }
      if (u[i] + y <= EPS) return -Infinity;
      total += w[i] * Math.log(u[i] + y) - cost;
    }
    return total;
  };
  const rec = (d) => {
    if (aborted) return;
    if (++nodes > nodeBudget) { aborted = true; return; }
    if (d === m) {
      const s = scoreOf(u, w);
      if (better(s, best)) { best = s; bestOwner = owner.slice(); }
      return;
    }
    const b = bound(d);
    if (!better(b, best)) return;
    if (useDual && best.zeros === 0 && d > 0 && dualBound(d) <= best.s + 1e-9) return;
    const j = order[d];
    // Try heirs in decreasing value for this item: finds good leaves early.
    const tryOrder = Array.from({ length: n }, (_, i) => i).sort((a, c) => values[c][j] - values[a][j] || a - c);
    for (const i of tryOrder) {
      owner[j] = i; u[i] += values[i][j];
      rec(d + 1);
      u[i] -= values[i][j];
      if (aborted) return;
    }
  };
  rec(0);
  return aborted ? null : { owner: bestOwner, score: best, nodes };
}

// The items-only allocation. Items nobody values are left unclaimed.
export function nashAllocation(values, w, { restarts = 24, nodeBudget = 400000, seed = 1 } = {}) {
  const n = values.length, m = values[0].length;
  const items = [];
  for (let j = 0; j < m; j++) if (values.some((r) => r[j] > EPS)) items.push(j);
  const unclaimed = [];
  for (let j = 0; j < m; j++) if (!items.includes(j)) unclaimed.push(j);
  const r = rng(seed);
  const byBest = items.slice().sort((a, b) => Math.max(...values.map((x) => x[b])) - Math.max(...values.map((x) => x[a])) || a - b);
  let best = null;
  const consider = (owner) => {
    const res = localSearch(values, w, owner, items);
    if (!best || better(res.score, best.score)) best = { owner: res.owner.slice(), score: res.score };
  };
  consider(pickingSequence(values, w, items));
  consider(greedyStart(values, w, items, byBest));
  for (let k = 0; k < restarts; k++) {
    const order = items.slice();
    for (let a = order.length - 1; a > 0; a--) { const b = Math.floor(r() * (a + 1)); [order[a], order[b]] = [order[b], order[a]]; }
    consider(greedyStart(values, w, items, order));
  }
  let proven = false, nodes = 0;
  if (items.length) {
    const ex = exactMnw(values, w, items, best, nodeBudget);
    if (ex) { proven = true; nodes = ex.nodes; if (better(ex.score, best.score)) best = { owner: ex.owner, score: ex.score }; }
  }
  let owner = best.owner;
  let method = proven ? "exact" : "search";
  if (ef1Violations(values, owner, w).length) {
    // Only possible when the search did not reach the optimum; the picking
    // sequence is always (weighted) EF1.
    owner = pickingSequence(values, w, items);
    method = "picking";
    proven = false;
  }
  for (const j of unclaimed) owner[j] = -1;
  return { owner, proven, method, nodes, unclaimed };
}

// ---------------------------------------------------------------- solve

export function solve(input) {
  const errors = validateInput(input);
  if (errors.length) return { ok: false, errors };
  const mode = input.mode === "items" ? "items" : "cash";
  const heirs = input.heirs.map((h, i) => label(h, i));
  const items = input.items.map((it, j) => (typeof it === "string" ? it : it?.name || "").trim() || `Item ${j + 1}`);
  const values = input.heirs.map((h) => h.values.map(Number));
  const w = weightsOf(input);
  const equal = input.equalShares !== false;
  const n = heirs.length;
  const V = values.map((r) => r.reduce((s, x) => s + x, 0));
  const notes = [];

  if (mode === "cash") {
    const owner = highestBidder(values);
    const { payments: exact, margin, surplus } = equal ? envyFreePayments(values, owner) : (() => { const k = knasterPayments(values, owner, w); return { ...k, margin: null }; })();
    const cash = Number(input.estateCash || 0);
    const rounded = roundPayments(exact);
    const shareCash = splitCash(cash, w);
    const net = rounded.map((p, i) => round2(p + shareCash[i]));
    const A = bundleValues(values, owner);
    const rows = heirs.map((name, i) => ({
      heir: name,
      share: w[i],
      items: owner.map((k, j) => (k === i ? j : -1)).filter((j) => j >= 0).map((j) => items[j]),
      itemsValue: round2(A[i][i]),
      payment: rounded[i],
      estateCash: shareCash[i],
      netCash: net[i],
      total: round2(A[i][i] + net[i]),
      ownValuation: round2(V[i] + cash),
      fairShare: round2(w[i] * (V[i] + cash)),
      overFair: round2(A[i][i] + net[i] - w[i] * (V[i] + cash)),
    }));
    const unclaimed = owner.map((k, j) => (k < 0 ? items[j] : null)).filter(Boolean);
    if (unclaimed.length) notes.push(`Nobody put a value on ${unclaimed.length === 1 ? "one item" : unclaimed.length + " items"} (${unclaimed.join(", ")}); sell or donate ${unclaimed.length === 1 ? "it" : "them"} and split the proceeds by share.`);
    const outOfPocket = net.map((x, i) => [x, i]).filter(([x]) => x < 0);
    if (outOfPocket.length) notes.push(`${outOfPocket.map(([x, i]) => heirs[i] + " pays in " + money(-x)).join(", ")} from their own pocket, because the items they take are worth more to them than their share${cash > 0 ? " and their part of the estate's cash does not cover it" : ""}. If that is not possible, sell an item instead, or use the items-only method.`);
    const envy = equal ? envyWithCash(values, owner, rounded, 0.011 * n) : [];
    return {
      ok: true, mode, equal, heirs, items, values, weights: w, owner, exactPayments: exact, rows, notes, unclaimed,
      margin: margin == null ? null : round2(margin), surplus: surplus == null ? null : round2(surplus),
      envyFree: equal ? envy.length === 0 : null,
      totalValue: round2(values.reduce((s, r, i) => s + owner.reduce((t, k, j) => t + (k === i ? r[j] : 0), 0), 0)),
      estateCash: cash,
    };
  }

  const res = nashAllocation(values, w, input.searchOptions || {});
  const owner = res.owner;
  const A = bundleValues(values, owner);
  const rows = heirs.map((name, i) => ({
    heir: name,
    share: w[i],
    items: owner.map((k, j) => (k === i ? j : -1)).filter((j) => j >= 0).map((j) => items[j]),
    itemsValue: round2(A[i][i]),
    ownValuation: round2(V[i]),
    percentOfOwn: V[i] > 0 ? A[i][i] / V[i] : 0,
    fairShare: round2(w[i] * V[i]),
  }));
  const ef1 = ef1Violations(values, owner, w);
  const envy = envyPairs(values, owner, w);
  const unclaimed = res.unclaimed.map((j) => items[j]);
  if (unclaimed.length) notes.push(`Nobody put a value on ${unclaimed.join(", ")}; sell or donate and split the proceeds by share.`);
  if (envy.length) notes.push(`${envy.map((e) => heirs[e.heir] + " would rather have " + heirs[e.envies] + "'s items" + (equal ? "" : " (scaled by share)")).join("; ")}, but removing a single item from the other bundle ends it (envy-free up to one item). With whole items and no cash, that is the most any method can promise; switch to the cash method to remove it.`);
  if (Number(input.estateCash || 0) > 0) notes.push(`The estate's ${money(Number(input.estateCash))} in cash is split by share: ${heirs.map((h, i) => h + " " + money(splitCash(Number(input.estateCash), w)[i])).join(", ")}.`);
  return {
    ok: true, mode, equal, heirs, items, values, weights: w, owner, rows, notes, unclaimed,
    proven: res.proven, method: res.method, ef1: ef1.length === 0, envyFree: envy.length === 0,
    belowFairShare: rows.filter((r) => r.itemsValue < r.fairShare - 0.005).map((r) => r.heir),
  };
}

// Estate cash split by share, rounded to cents and adding up exactly.
export function splitCash(cash, w) {
  if (!cash) return w.map(() => 0);
  const raw = w.map((x) => x * cash);
  const cents = raw.map((x) => Math.floor(x * 100 + 1e-7));
  let left = Math.round(cash * 100) - cents.reduce((s, x) => s + x, 0);
  const order = raw.map((x, i) => [x * 100 - cents[i], i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (let k = 0; left > 0; k = (k + 1) % order.length, left--) cents[order[k][1]] += 1;
  return cents.map((c) => c / 100);
}

// ---------------------------------------------------------------- output

export function money(x) {
  const neg = x < 0 ? "-" : "";
  const v = Math.abs(Math.round(x * 100) / 100);
  return neg + "$" + v.toLocaleString("en-US", { minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 });
}

function pct(x) {
  return (Math.round(x * 1000) / 10).toLocaleString("en-US") + "%";
}

export function resultText(R) {
  const lines = [];
  lines.push(R.mode === "cash" ? "Estate division (sealed bids with cash to even up)" : "Estate division (items only, no cash between heirs)");
  for (const r of R.rows) {
    lines.push("");
    lines.push(`${r.heir} (${pct(r.share)} share)`);
    lines.push(`  Items: ${r.items.length ? r.items.join(", ") : "none"}`);
    lines.push(`  Worth to ${r.heir}: ${money(r.itemsValue)}`);
    if (R.mode === "cash") {
      if (r.payment) lines.push(`  ${r.payment > 0 ? "Receives" : "Pays in"} ${money(Math.abs(r.payment))} to even up`);
      if (r.estateCash) lines.push(`  Share of estate cash: ${money(r.estateCash)}`);
      lines.push(`  Net cash: ${money(r.netCash)}; total ${money(r.total)} against a fair share of ${money(r.fairShare)} by their own values`);
    } else {
      lines.push(`  That is ${pct(r.percentOfOwn)} of the whole estate by ${r.heir}'s own values (fair share ${pct(r.share)})`);
    }
  }
  if (R.unclaimed.length) lines.push("", "Unclaimed: " + R.unclaimed.join(", "));
  lines.push("", "Worked out with the free estate item divider; arithmetic on the values each heir typed, not legal or tax advice. The will, the executor and local law decide.");
  return lines.join("\n");
}

function csvCell(s) {
  const t = String(s ?? "");
  const safe = /^[=+\-@\t\r]/.test(t) ? "'" + t : t;
  return /[",\n]/.test(safe) ? '"' + safe.replace(/"/g, '""') + '"' : safe;
}

export function resultCsv(R) {
  const head = ["item", "goes_to", ...R.heirs.map((h) => "value_to_" + h)];
  const rows = R.items.map((it, j) => [it, R.owner[j] >= 0 ? R.heirs[R.owner[j]] : "unclaimed", ...R.values.map((v) => v[j])]);
  const out = [head, ...rows].map((r) => r.map(csvCell).join(","));
  if (R.mode === "cash") {
    out.push("");
    out.push(["heir", "share", "items_value", "even_up_payment", "estate_cash", "net_cash", "total"].join(","));
    for (const r of R.rows) out.push([r.heir, r.share, r.itemsValue, r.payment, r.estateCash, r.netCash, r.total].map(csvCell).join(","));
  }
  return out.join("\n") + "\n";
}

export function serializeState(input) {
  return JSON.stringify({ kind: "estate-item-divider", version: 1, ...input }, null, 2);
}

export function parseState(text) {
  let s;
  try { s = JSON.parse(text); } catch { return { error: "That file is not a saved division (it is not valid JSON)." }; }
  if (!s || s.kind !== "estate-item-divider" || !Array.isArray(s.heirs) || !Array.isArray(s.items)) return { error: "That file is not a saved estate division." };
  const state = {
    mode: s.mode === "items" ? "items" : "cash",
    equalShares: s.equalShares !== false,
    estateCash: Number(s.estateCash) || 0,
    items: s.items.slice(0, MAX_ITEMS).map((x) => String(typeof x === "string" ? x : x?.name ?? "")),
    heirs: s.heirs.slice(0, MAX_HEIRS).map((h) => ({ name: String(h?.name ?? ""), share: Number(h?.share) || 0, values: (Array.isArray(h?.values) ? h.values : []).slice(0, MAX_ITEMS).map((v) => Number(v) || 0) })),
  };
  return { state };
}

// Invented example used on the page and in the guide.
export function sampleInput() {
  return {
    mode: "cash",
    equalShares: true,
    estateCash: 0,
    items: ["Piano", "Dining table", "Grandfather clock", "Wedding ring", "Painting", "Tools"],
    heirs: [
      { name: "Ana", share: 100 / 3, values: [3000, 800, 1500, 2500, 600, 100] },
      { name: "Ben", share: 100 / 3, values: [1000, 1200, 2500, 2000, 900, 400] },
      { name: "Cleo", share: 100 / 3, values: [500, 1000, 1000, 3000, 1500, 0] },
    ],
  };
}

// ---------------------------------------------------------------- bid sheets

// A blank sheet the executor can send round: one row per item, one column per heir.
export function bidSheetCsv(items, heirs) {
  const head = ["item", ...heirs].map(csvCell).join(",");
  return [head, ...items.map((it) => [it, ...heirs.map(() => "")].map(csvCell).join(","))].join("\n") + "\n";
}

function splitCsvLine(line) {
  const out = [];
  let cur = "", q = false;
  for (let k = 0; k < line.length; k++) {
    const c = line[k];
    if (q) {
      if (c === '"' && line[k + 1] === '"') { cur += '"'; k++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

// Read a filled-in bid sheet (or this tool's own CSV export): first column is
// the item, each other column an heir. "$1,200" and blanks (= 0) are accepted.
export function parseBidSheet(text) {
  const lines = String(text).replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) return { error: "The sheet needs a header row and at least one item." };
  let head = splitCsvLine(lines[0]).map((s) => s.trim());
  let rows = lines.slice(1).map(splitCsvLine);
  // This tool's own export has a "goes_to" column and value_to_ prefixes; and a second table after a blank line.
  const goes = head.indexOf("goes_to");
  if (goes >= 0) {
    head = head.filter((_, k) => k !== goes).map((h) => h.replace(/^value_to_/, ""));
    const stop = rows.findIndex((r) => r[0] === "heir");
    if (stop >= 0) rows = rows.slice(0, stop);
    rows = rows.map((r) => r.filter((_, k) => k !== goes));
  }
  const heirNames = head.slice(1);
  if (heirNames.length < 2) return { error: "The sheet needs at least two heir columns after the item column." };
  if (heirNames.length > MAX_HEIRS) return { error: `At most ${MAX_HEIRS} heirs.` };
  if (rows.length > MAX_ITEMS) return { error: `At most ${MAX_ITEMS} items.` };
  const items = [], heirs = heirNames.map((name) => ({ name: name.replace(/^'/, ""), share: 100 / heirNames.length, values: [] }));
  for (const [r, row] of rows.entries()) {
    items.push((row[0] ?? "").replace(/^'/, "").trim() || `Item ${r + 1}`);
    for (let i = 0; i < heirs.length; i++) {
      const raw = (row[i + 1] ?? "").replace(/[$,\s]/g, "");
      const v = raw === "" ? 0 : Number(raw);
      if (!Number.isFinite(v) || v < 0) return { error: `Row ${r + 2}, ${heirs[i].name}: "${row[i + 1]}" is not an amount.` };
      heirs[i].values.push(v);
    }
  }
  return { items, heirs };
}
