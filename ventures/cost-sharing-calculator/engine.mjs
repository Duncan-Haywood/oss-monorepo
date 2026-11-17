// Fair cost sharing: who should pay what when a group shares something that
// is cheaper together than apart? Cooperative game theory, from the papers:
// the Shapley value (Shapley 1953), the nucleolus (Schmeidler 1969, computed
// by the sequential linear programmes of Maschler, Peleg & Shapley 1979),
// the core (Gillies 1959) as the test of whether any subgroup would rather
// go it alone, the separable-cost methods of the water-resources literature
// (SCRB and ENSC; Young, Okada & Hashimoto 1982), the airport game's
// closed-form Shapley value (Littlechild & Owen 1973) for anything shared
// along a line (a private road, a runway, a pipe), and the Talmud rule for
// dividing an estate that cannot cover every claim (Aumann & Maschler 1985;
// O'Neill 1982).
//
// Pure functions, no DOM, no network, no randomness. Implemented from the
// papers; no third-party code was ported. The linear programmes are solved
// by a small dense two-phase simplex written here. An independent Python
// reference (scipy's HiGHS for the nucleolus, brute force for Shapley) was
// used only to produce eval/reference.json, which the tests compare against.

export const PAPERS = [
  {
    authors: "Lloyd S. Shapley",
    title: "A Value for n-Person Games",
    venue: "Contributions to the Theory of Games, Volume II (Annals of Mathematics Studies 28), 307-317, Princeton University Press",
    year: 1953,
    url: "https://doi.org/10.1515/9781400881970-018",
    doi: "10.1515/9781400881970-018",
    implemented: "The Shapley value: each member's cost averaged over every order in which the group could have formed, i.e. the weighted sum over subgroups S without i of |S|!(n-|S|-1)!/n! times (c(S with i) - c(S)). Computed exactly by enumerating every subgroup.",
    deviations: "Exact enumeration limits the coalition table to 14 members (16,384 subgroups); the road and claims modes use closed forms or the same enumeration within their own limits.",
  },
  {
    authors: "David Schmeidler",
    title: "The Nucleolus of a Characteristic Function Game",
    venue: "SIAM Journal on Applied Mathematics 17(6), 1163-1170",
    year: 1969,
    url: "https://doi.org/10.1137/0117107",
    doi: "10.1137/0117107",
    implemented: "The nucleolus: the division that makes the most aggrieved subgroup as little aggrieved as possible, then the next, and so on (lexicographic minimisation of the sorted excesses x(S) - c(S) over the imputations x_i <= c({i})).",
    deviations: "Computed for up to 10 members (1,022 subgroups). Undefined, and reported as such, when the group together costs more than all its members apart (no imputation exists).",
  },
  {
    authors: "Michael Maschler, Bezalel Peleg, Lloyd S. Shapley",
    title: "Geometric Properties of the Kernel, Nucleolus, and Related Solution Concepts",
    venue: "Mathematics of Operations Research 4(4), 303-338",
    year: 1979,
    url: "https://doi.org/10.1287/moor.4.4.303",
    doi: "10.1287/moor.4.4.303",
    implemented: "The least core (the smallest epsilon such that some division leaves no subgroup paying more than epsilon above its own cost) and the sequence of linear programmes that reaches the nucleolus: solve for the least epsilon, fix the subgroups whose excess must equal it, repeat until the division is unique.",
    deviations: "Each stage's programme is solved through its dual (n + 1 rows instead of up to 2^n), whose row prices are the division and the least excess. Subgroups to fix at each stage are those with a positive dual weight in the stage's optimal solution (each such subgroup is tight in every optimal division, by complementary slackness); subgroups whose membership vector is already spanned by fixed ones are dropped. Stages stop when the fixed subgroups pin down every share.",
  },
  {
    authors: "H. Peyton Young, Norio Okada, Tsuyoshi Hashimoto",
    title: "Cost allocation in water resources development",
    venue: "Water Resources Research 18(3), 463-475",
    year: 1982,
    url: "https://doi.org/10.1029/WR018i003p00463",
    doi: "10.1029/WR018i003p00463",
    implemented: "Separable costs remaining benefits (SCRB: each member pays its separable cost c(N) - c(N without i), and the non-separable rest in proportion to c({i}) minus its separable cost) and the equal division of non-separable costs (ENSC), compared with the Shapley value and the nucleolus, with the core as the test.",
    deviations: "SCRB is used in its 'alternate cost' form: a member's benefit is taken to be its stand-alone cost c({i}), as the paper does when benefits exceed costs. When no member has a positive remaining stand-alone cost, the non-separable rest is split equally.",
  },
  {
    authors: "S. C. Littlechild, G. Owen",
    title: "A Simple Expression for the Shapley Value in a Special Case",
    venue: "Management Science 20(3), 370-372",
    year: 1973,
    url: "https://doi.org/10.1287/mnsc.20.3.370",
    doi: "10.1287/mnsc.20.3.370",
    implemented: "The airport game c(S) = max over S of each member's need: sort the needs, cut the line into segments between them, and split each segment's cost equally among the members who reach it. Used for the shared-road mode at any size; equal to the enumerated Shapley value (tested).",
    deviations: "None.",
  },
  {
    authors: "Robert J. Aumann, Michael Maschler",
    title: "Game theoretic analysis of a bankruptcy problem from the Talmud",
    venue: "Journal of Economic Theory 36(2), 195-213",
    year: 1985,
    url: "https://doi.org/10.1016/0022-0531(85)90102-4",
    doi: "10.1016/0022-0531(85)90102-4",
    implemented: "The bankruptcy game v(S) = max(0, E - sum of the claims outside S), the Talmud rule (constrained equal awards on half-claims when the estate is at most half the total claims, otherwise each claimant loses by constrained equal losses on half-claims), and its equality with the nucleolus, which the tests check on the Mishnah's three estates.",
    deviations: "None.",
  },
  {
    authors: "Barry O'Neill",
    title: "A problem of rights arbitration from the Talmud",
    venue: "Mathematical Social Sciences 2(4), 345-371",
    year: 1982,
    url: "https://doi.org/10.1016/0165-4896(82)90029-4",
    doi: "10.1016/0165-4896(82)90029-4",
    implemented: "The random-arrival rule for claims (claimants arrive in a random order and each is paid in full while the estate lasts), which equals the Shapley value of the bankruptcy game; computed by enumerating subgroups.",
    deviations: "None.",
  },
];

export const LIMITS = { coalitionPlayers: 14, nucleolusPlayers: 10, linePlayers: 2000, claimsPlayers: 14 };
export const DEFAULTS = { mode: "coalitions", game: "cost" };
/** A call that works: the Mishnah's estate of 200 zuz over claims of 100, 200 and 300. */
export const SAMPLE_INPUT = { mode: "claims", csv: "wife,claim\nFirst,100\nSecond,200\nThird,300\n", estate: 200 };
const TOL = 1e-9;

// ---------------------------------------------------------------- CSV ----

export function parseCsv(text) {
  const lines = String(text ?? "").replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim() !== "" && !/^\s*#/.test(l));
  if (!lines.length) return [];
  const first = lines[0];
  const delim = [",", "\t", ";"].sort((a, b) => first.split(b).length - first.split(a).length)[0];
  return lines.map((line) => {
    const out = [];
    let cur = "";
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (q) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') q = false;
        else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === delim) { out.push(cur.trim()); cur = ""; }
      else cur += ch;
    }
    out.push(cur.trim());
    return out;
  });
}

/** A money-like cell to a number: "$1,200.50" -> 1200.5; null when not a number. */
export function num(s) {
  if (s === undefined || s === null) return null;
  const t = String(s).trim().replace(/^[$£€¥]/, "").replace(/,(?=\d{3}(\D|$))/g, "").replace(/\s/g, "");
  if (t === "" || !/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(t)) return null;
  return Number(t);
}

const isHeader = (row) => row.length >= 2 && num(row[1]) === null;

// ---------------------------------------------------- the game itself ----

const popcount = (m) => { let c = 0; while (m) { m &= m - 1; c++; } return c; };
export const members = (mask, n) => { const out = []; for (let i = 0; i < n; i++) if (mask & (1 << i)) out.push(i); return out; };
const sumOver = (x, mask) => { let s = 0; for (let i = 0; mask; i++, mask >>= 1) if (mask & 1) s += x[i]; return s; };

/**
 * Parse a coalition table: one row per group, "A+B,120". Members can be joined
 * with +, &, /, " and " or spaces inside the first cell. Returns
 * {players, given: Map(mask -> cost)} or {error}.
 */
export function parseCoalitionTable(csv) {
  const rows = parseCsv(csv);
  if (!rows.length) return { error: "No rows. Give one group per line: the members (A+B), a comma, then its cost." };
  const body = isHeader(rows[0]) ? rows.slice(1) : rows;
  const players = [];
  const index = new Map();
  const given = new Map();
  const problems = [];
  body.forEach((row, k) => {
    const line = k + (body === rows ? 1 : 2);
    if (row.length < 2) { problems.push(`line ${line}: needs a group and a cost`); return; }
    const cost = num(row[row.length - 1]);
    if (cost === null) { problems.push(`line ${line}: "${row[row.length - 1]}" is not a number`); return; }
    const label = row.slice(0, -1).join(",").replace(/^[{(\[]|[})\]]$/g, "");
    const names = label.split(/\s*(?:\+|&|\/|,|\band\b)\s*|\s{1,}/i).map((s) => s.trim()).filter(Boolean);
    if (!names.length) { problems.push(`line ${line}: no members named`); return; }
    let mask = 0;
    for (const nm of names) {
      const key = nm.toLowerCase();
      if (!index.has(key)) {
        if (players.length >= LIMITS.coalitionPlayers) { problems.push(`more than ${LIMITS.coalitionPlayers} members; the exact methods enumerate every subgroup and stop there`); return; }
        index.set(key, players.length);
        players.push(nm);
      }
      mask |= 1 << index.get(key);
    }
    if (given.has(mask) && given.get(mask) !== cost) problems.push(`line ${line}: the group ${names.join("+")} is priced twice (${given.get(mask)} and ${cost}); the later one is used`);
    given.set(mask, cost);
  });
  const fatal = problems.find((p) => !p.includes("priced twice"));
  if (fatal) return { error: fatal, problems };
  if (players.length < 2) return { error: "Name at least two members." };
  return { players, given, problems };
}

/**
 * Complete a cost game: every missing group's cost is the cheapest way to
 * split it into groups that are priced (a group can always split up). Also
 * reports priced groups that cost more than such a split, since they would
 * rather split.
 */
export function completeGame(n, given, { game = "cost" } = {}) {
  const full = (1 << n) - 1;
  const c = new Float64Array(full + 1);
  const missing = [];
  for (let i = 0; i < n; i++) if (!given.has(1 << i)) missing.push(1 << i);
  if (missing.length) return { error: `Every member needs a price on their own; missing: ${missing.length} member(s)`, missingSingles: missing };
  if (!given.has(full)) return { error: "The whole group needs a price (a row naming every member)." };
  const sign = game === "value" ? -1 : 1; // value games are cost games of -v
  const filled = [];
  const dearer = [];
  for (let m = 1; m <= full; m++) {
    let best = Infinity;
    // Splits into two non-empty parts; each part's cost is already final.
    for (let s = (m - 1) & m; s > 0; s = (s - 1) & m) {
      if (s < (m ^ s)) continue; // each unordered split once
      const v = c[s] + c[m ^ s];
      if (v < best) best = v;
    }
    if (given.has(m)) {
      const v = sign * given.get(m);
      c[m] = v;
      if (popcount(m) > 1 && best < v - 1e-9 * Math.max(1, Math.abs(v))) dearer.push({ mask: m, cost: v, split: best });
    } else {
      c[m] = best;
      filled.push(m);
    }
  }
  return { c, filled, dearer };
}

/** Airport game from needs (a road's reach, a runway length): c(S) = max need in S. */
export function airportGame(needs) {
  const n = needs.length;
  const c = new Float64Array(1 << n);
  for (let m = 1; m < 1 << n; m++) {
    const low = m & -m;
    const i = 31 - Math.clz32(low);
    c[m] = Math.max(c[m ^ low], needs[i]);
  }
  return c;
}

/** Bankruptcy game (a value game): v(S) = max(0, E - claims outside S). */
export function bankruptcyGame(claims, estate) {
  const n = claims.length;
  const total = claims.reduce((a, b) => a + b, 0);
  const v = new Float64Array(1 << n);
  for (let m = 1; m < 1 << n; m++) v[m] = Math.max(0, estate - (total - sumOver(claims, m)));
  return v;
}

// ------------------------------------------------------------- Shapley ----

/** Exact Shapley value of a game given as an array over bitmasks (cost or value). */
export function shapley(c, n) {
  const full = (1 << n) - 1;
  const fact = [1];
  for (let k = 1; k <= n; k++) fact[k] = fact[k - 1] * k;
  const w = fact.map((_, s) => (s < n ? (fact[s] * fact[n - s - 1]) / fact[n] : 0));
  const phi = new Array(n).fill(0);
  for (let m = 0; m <= full; m++) {
    const s = popcount(m);
    for (let i = 0; i < n; i++) {
      if (m & (1 << i)) continue;
      phi[i] += w[s] * (c[m | (1 << i)] - c[m]);
    }
  }
  return phi;
}

/** Littlechild & Owen (1973): Shapley value of the airport game c(S) = max need, any size. */
export function airportShapley(needs) {
  const order = needs.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
  const n = needs.length;
  const out = new Array(n).fill(0);
  let prev = 0;
  let acc = 0;
  for (let k = 0; k < n; k++) {
    const [v, i] = order[k];
    acc += (v - prev) / (n - k); // this segment is used by everyone from k on
    prev = v;
    out[i] = acc;
  }
  return out;
}

// --------------------------------------------------------------- simplex ----

/**
 * Minimise obj.z subject to rows (A z <=|=|>= b) and z >= 0, by a dense
 * two-phase simplex (Dantzig's rule, Bland's after degenerate runs). Returns {status, z, value, duals}
 * where duals[i] is the shadow price of row i (d value / d b_i).
 */
export function simplex(obj, A, b, types) {
  const m = A.length;
  const nv = obj.length;
  // Column layout: [vars | one identity column per row (slack or artificial) | surplus for >= rows]
  const geq = [];
  const sign = new Array(m).fill(1);
  const ty = types.slice();
  for (let i = 0; i < m; i++) {
    if (b[i] < 0) { sign[i] = -1; ty[i] = ty[i] === "<=" ? ">=" : ty[i] === ">=" ? "<=" : "="; }
    if (ty[i] === ">=") geq.push(i);
  }
  const idCol = nv; // row i's identity column is idCol + i
  const surCol = nv + m;
  const W = nv + m + geq.length;
  const T = Array.from({ length: m }, (_, i) => {
    const row = new Float64Array(W + 1);
    for (let j = 0; j < nv; j++) row[j] = sign[i] * A[i][j];
    row[idCol + i] = 1;
    row[W] = sign[i] * b[i];
    return row;
  });
  geq.forEach((i, k) => { T[i][surCol + k] = -1; });
  const artificial = new Uint8Array(W);
  for (let i = 0; i < m; i++) if (ty[i] !== "<=") artificial[idCol + i] = 1;
  const basis = Array.from({ length: m }, (_, i) => idCol + i);
  const banned = new Uint8Array(W);

  const run = (cost) => {
    // reduced costs r_j = cost_j - c_B B^-1 A_j, kept as an extra row
    const r = new Float64Array(W + 1);
    for (let j = 0; j <= W; j++) r[j] = j < W ? cost[j] : 0;
    for (let i = 0; i < m; i++) {
      const cb = cost[basis[i]];
      if (cb) for (let j = 0; j <= W; j++) r[j] -= cb * T[i][j];
    }
    // Dantzig's rule (most negative reduced cost) for speed; after a run of
    // degenerate pivots, Bland's rule (lowest index), which cannot cycle.
    let degenerate = 0;
    for (let iter = 0; iter < 50000; iter++) {
      let enter = -1;
      if (degenerate < 50) {
        let most = -1e-10;
        for (let j = 0; j < W; j++) if (!banned[j] && r[j] < most) { most = r[j]; enter = j; }
      } else for (let j = 0; j < W; j++) if (!banned[j] && r[j] < -1e-10) { enter = j; break; }
      if (enter < 0) return { ok: true, r };
      let leave = -1;
      let best = Infinity;
      for (let i = 0; i < m; i++) {
        const a = T[i][enter];
        if (a > 1e-12) {
          const ratio = T[i][W] / a;
          if (ratio < best - 1e-12 || (Math.abs(ratio - best) <= 1e-12 && basis[i] < basis[leave])) { best = ratio; leave = i; }
        }
      }
      if (leave < 0) return { ok: false, unbounded: true };
      degenerate = best <= 1e-12 ? degenerate + 1 : 0;
      const pr = T[leave];
      const pv = pr[enter];
      for (let j = 0; j <= W; j++) pr[j] /= pv;
      for (let i = 0; i < m; i++) {
        if (i === leave) continue;
        const f = T[i][enter];
        if (f) { const row = T[i]; for (let j = 0; j <= W; j++) row[j] -= f * pr[j]; }
      }
      const f = r[enter];
      if (f) for (let j = 0; j <= W; j++) r[j] -= f * pr[j];
      basis[leave] = enter;
    }
    return { ok: false, stalled: true };
  };

  // Phase 1
  const c1 = new Float64Array(W);
  for (let j = 0; j < W; j++) c1[j] = artificial[j];
  const p1 = run(c1);
  if (!p1.ok) return { status: "error" };
  let infeas = 0;
  for (let i = 0; i < m; i++) if (artificial[basis[i]]) infeas += T[i][W];
  if (infeas > 1e-7) return { status: "infeasible" };
  // Drive zero-level artificials out of the basis where possible.
  for (let i = 0; i < m; i++) {
    if (!artificial[basis[i]]) continue;
    let j = 0;
    for (; j < W; j++) if (!artificial[j] && Math.abs(T[i][j]) > 1e-9) break;
    if (j < W) {
      const pr = T[i];
      const pv = pr[j];
      for (let k = 0; k <= W; k++) pr[k] /= pv;
      for (let q = 0; q < m; q++) if (q !== i) { const f = T[q][j]; if (f) for (let k = 0; k <= W; k++) T[q][k] -= f * pr[k]; }
      basis[i] = j;
    }
  }
  for (let j = 0; j < W; j++) if (artificial[j]) banned[j] = 1;
  // Phase 2
  const c2 = new Float64Array(W);
  for (let j = 0; j < nv; j++) c2[j] = obj[j];
  const p2 = run(c2);
  if (!p2.ok) return { status: p2.unbounded ? "unbounded" : "error" };
  const z = new Array(nv).fill(0);
  for (let i = 0; i < m; i++) if (basis[i] < nv) z[basis[i]] = T[i][W];
  let value = 0;
  for (let j = 0; j < nv; j++) value += obj[j] * z[j];
  // y_i = c_B B^-1 e_i = -(reduced cost of row i's identity column), undo the row flip.
  const duals = Array.from({ length: m }, (_, i) => -p2.r[idCol + i] * sign[i]);
  return { status: "optimal", z, value, duals };
}

// ------------------------------------------------------------ nucleolus ----

function rankAdd(basisRows, vec) {
  // Gaussian elimination against an echelon basis; returns true if vec was independent (and adds it).
  const v = vec.slice();
  for (const { piv, row } of basisRows) {
    const f = v[piv];
    if (Math.abs(f) > 1e-9) for (let j = 0; j < v.length; j++) v[j] -= f * row[j];
  }
  let piv = -1;
  for (let j = 0; j < v.length; j++) if (Math.abs(v[j]) > 1e-9) { piv = j; break; }
  if (piv < 0) return false;
  const p = v[piv];
  for (let j = 0; j < v.length; j++) v[j] /= p;
  for (const br of basisRows) { const f = br.row[piv]; if (Math.abs(f) > 1e-12) for (let j = 0; j < v.length; j++) br.row[j] -= f * v[j]; }
  basisRows.push({ piv, row: v });
  return true;
}

/**
 * Nucleolus of a cost game c over the imputations {x : x_i <= c({i}), sum x = c(N)},
 * by the sequential LPs of Maschler, Peleg & Shapley (1979). Returns
 * {x, leastCore, stages} or {error}.
 */
export function nucleolus(c, n) {
  if (n > LIMITS.nucleolusPlayers) return { error: `the nucleolus is computed for up to ${LIMITS.nucleolusPlayers} members` };
  const full = (1 << n) - 1;
  const single = Array.from({ length: n }, (_, i) => c[1 << i]);
  const slackTotal = single.reduce((a, b) => a + b, 0) - c[full];
  if (slackTotal < -1e-9 * Math.max(1, Math.abs(c[full]))) return { error: "the whole group costs more than its members apart, so no division saves anyone anything (no imputation exists)" };
  let scale = 0;
  for (let m = 1; m <= full; m++) scale = Math.max(scale, Math.abs(c[m]));
  scale = scale || 1;
  const cs = Array.from(c, (v) => v / scale);
  const ss = single.map((v) => v / scale);
  // Each stage's LP (min t: x(S) - t <= c(S) for open S, x(F) = c(F) + t_F for
  // fixed F, x(N) = c(N), x_i <= c_i) has n + 1 variables and up to 2^n rows,
  // so the engine solves its dual, which has n + 1 rows:
  //   min sum_S y_S c(S) + sum_i z_i c_i + sum_F w_F (c(F) + t_F) + w_N c(N)
  //   s.t. sum_S y_S = 1;  for each i: sum_{S∋i} y_S + z_i + sum_{F∋i} w_F + w_N = 0
  //   y, z >= 0, w free (split into two columns).
  // Its optimum is -t*, the shadow prices of its rows are (-t*, x), and the
  // open groups with y_S > 0 are those tight in every optimal division.
  const echelon = [];
  rankAdd(echelon, new Array(n).fill(1));
  const fixed = []; // {mask, t}
  let open = [];
  for (let m = 1; m < full; m++) open.push(m);
  const stages = [];
  let x = null;
  let leastCore = null;
  for (let stage = 0; stage < 4 * n + 4 && echelon.length < n; stage++) {
    const cols = []; // {cost, rows: indices i with a 1, inSum}
    for (const mask of open) cols.push({ cost: cs[mask], mask, sum: 1, sign: 1 });
    for (let i = 0; i < n; i++) cols.push({ cost: ss[i], mask: 1 << i, sum: 0, sign: 1 });
    for (const { mask, t } of fixed) {
      cols.push({ cost: cs[mask] + t, mask, sum: 0, sign: 1 });
      cols.push({ cost: -(cs[mask] + t), mask, sum: 0, sign: -1 });
    }
    cols.push({ cost: cs[full], mask: full, sum: 0, sign: 1 });
    cols.push({ cost: -cs[full], mask: full, sum: 0, sign: -1 });
    const A = Array.from({ length: n + 1 }, () => new Array(cols.length).fill(0));
    cols.forEach((col, j) => {
      A[0][j] = col.sum;
      for (let i = 0; i < n; i++) if (col.mask & (1 << i)) A[i + 1][j] = col.sign;
    });
    const b = [1, ...new Array(n).fill(0)];
    const sol = simplex(cols.map((col) => col.cost), A, b, new Array(n + 1).fill("="));
    if (sol.status !== "optimal") return { error: `linear programme ${sol.status} at stage ${stage + 1}` };
    const t = -sol.value;
    if (leastCore === null) leastCore = t * scale;
    x = sol.duals.slice(1);
    const newly = [];
    open.forEach((mask, k) => { if (sol.z[k] > 1e-10) newly.push(mask); });
    if (!newly.length) break;
    for (const mask of newly) {
      fixed.push({ mask, t });
      const vec = new Array(n).fill(0);
      for (const i of members(mask, n)) vec[i] = 1;
      rankAdd(echelon, vec);
    }
    stages.push({ excess: t * scale, groups: newly });
    // Drop open groups whose excess is now determined (in the span of fixed ones).
    open = open.filter((mask) => {
      if (newly.includes(mask)) return false;
      const probe = echelon.map((e) => ({ piv: e.piv, row: e.row.slice() }));
      const vec = new Array(n).fill(0);
      for (const i of members(mask, n)) vec[i] = 1;
      return rankAdd(probe, vec);
    });
    if (!open.length) break;
  }
  return { x: x.map((v) => v * scale), leastCore, stages };
}

// -------------------------------------------- the other division rules ----

export function proportional(weights, total) {
  const s = weights.reduce((a, b) => a + b, 0);
  if (!(s > 0)) return weights.map(() => total / weights.length);
  return weights.map((w) => (total * w) / s);
}

/** SCRB and ENSC (Young, Okada & Hashimoto 1982) for a cost game. */
export function separableCosts(c, n) {
  const full = (1 << n) - 1;
  const sc = Array.from({ length: n }, (_, i) => c[full] - c[full ^ (1 << i)]);
  const rest = c[full] - sc.reduce((a, b) => a + b, 0);
  const remaining = sc.map((s, i) => Math.max(0, c[1 << i] - s));
  const R = remaining.reduce((a, b) => a + b, 0);
  const scrb = sc.map((s, i) => s + (R > 0 ? (rest * remaining[i]) / R : rest / n));
  const ensc = sc.map((s) => s + rest / n);
  return { separable: sc, nonSeparable: rest, scrb, ensc };
}

/** Constrained equal awards: min(claim, lambda) with the awards summing to E. */
export function cea(claims, E) {
  let lo = 0;
  let hi = claims.reduce((a, b) => Math.max(a, b), 0);
  for (let k = 0; k < 200; k++) {
    const mid = (lo + hi) / 2;
    const s = claims.reduce((a, d) => a + Math.min(d, mid), 0);
    if (s < E) lo = mid; else hi = mid;
  }
  return claims.map((d) => Math.min(d, (lo + hi) / 2));
}

/** Constrained equal losses: each loses min(claim, mu) with the losses summing to D - E. */
export function cel(claims, E) {
  const D = claims.reduce((a, b) => a + b, 0);
  return cea(claims, D - E).map((loss, i) => claims[i] - loss);
}

/** The Talmud rule (Aumann & Maschler 1985). */
export function talmud(claims, E) {
  const D = claims.reduce((a, b) => a + b, 0);
  const half = claims.map((d) => d / 2);
  if (E <= D / 2) return cea(half, E);
  const loss = cea(half, D - E);
  return claims.map((d, i) => d - loss[i]);
}

// --------------------------------------------------------------- core ----

/**
 * Which groups a division overcharges: x(S) - c(S) > 0 in a cost game (a
 * value game is passed already negated). Returns the worst `top`, largest first.
 */
export function coreCheck(c, n, x, top = 5) {
  const full = (1 << n) - 1;
  let scale = 0;
  for (let m = 1; m <= full; m++) scale = Math.max(scale, Math.abs(c[m]));
  const tol = 1e-7 * Math.max(1, scale);
  const bad = [];
  let count = 0;
  for (let m = 1; m < full; m++) {
    const e = sumOver(x, m) - c[m];
    if (e > tol) {
      count++;
      bad.push({ mask: m, excess: e });
    }
  }
  bad.sort((a, b) => b.excess - a.excess || popcount(a.mask) - popcount(b.mask));
  return { inCore: count === 0, blocking: count, worst: bad.slice(0, top) };
}

// ------------------------------------------------------------ analyse ----

const round = (v, d = 2) => Math.round(v * 10 ** d) / 10 ** d;
export const fmt = (v, d = 2) => {
  if (v === null || v === undefined || !Number.isFinite(v)) return "n/a";
  const r = round(v, d);
  return (Object.is(r, -0) ? 0 : r).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
};

const groupName = (mask, names, n) => members(mask, n).map((i) => names[i]).join(" + ");

function methodsFor(c, n, names, { nucleolusOk = true } = {}) {
  const full = (1 << n) - 1;
  const total = c[full];
  const standalone = names.map((_, i) => c[1 << i]);
  const out = [];
  out.push({ id: "shapley", name: "Shapley value", x: shapley(c, n), note: "average extra cost each member brings, over every order the group could have formed in" });
  if (nucleolusOk) {
    const nu = nucleolus(c, n);
    if (nu.error) out.push({ id: "nucleolus", name: "Nucleolus", x: null, note: nu.error });
    else out.push({ id: "nucleolus", name: "Nucleolus", x: nu.x, note: "makes the worst-treated subgroup as well off as possible, then the next", leastCore: nu.leastCore, stages: nu.stages.length });
  } else out.push({ id: "nucleolus", name: "Nucleolus", x: null, note: `computed for up to ${LIMITS.nucleolusPlayers} members` });
  const sep = separableCosts(c, n);
  out.push({ id: "scrb", name: "SCRB (separable costs, remaining benefits)", x: sep.scrb, note: "each pays the cost only they cause, and the shared rest in proportion to what going alone would cost them beyond that" });
  out.push({ id: "ensc", name: "ENSC (equal non-separable costs)", x: sep.ensc, note: "each pays the cost only they cause, and the shared rest equally" });
  out.push({ id: "proportional", name: "Proportional to stand-alone cost", x: proportional(standalone, total), note: "the common rule of thumb" });
  out.push({ id: "equal", name: "Equal split", x: names.map(() => total / n), note: "everyone pays the same" });
  return { methods: out, separable: sep };
}

function attachCore(methods, c, n, names) {
  for (const m of methods) {
    if (!m.x) continue;
    const ck = coreCheck(c, n, m.x);
    m.inCore = ck.inCore;
    m.blocking = ck.blocking;
    m.worst = ck.worst.map((w) => ({ group: groupName(w.mask, names, n), size: popcount(w.mask), overpay: w.excess }));
  }
}

function summarise({ names, c, n, methods, unit, game, mode, extra = [] }) {
  const full = (1 << n) - 1;
  const lines = [];
  const sh = methods.find((m) => m.id === "shapley");
  const nu = methods.find((m) => m.id === "nucleolus");
  const sign = game === "value" ? -1 : 1;
  const together = sign * c[full];
  const apart = sign * names.reduce((a, _, i) => a + c[1 << i], 0);
  if (game === "value") {
    lines.push(`Together the ${n} members are worth ${unit}${fmt(together)}; apart they would get ${unit}${fmt(apart)}.`);
  } else {
    const saved = apart - together;
    lines.push(`Together the ${n} members cost ${unit}${fmt(together)}; each going alone would cost ${unit}${fmt(apart)} in total, so sharing ${saved >= 0 ? "saves" : "costs an extra"} ${unit}${fmt(Math.abs(saved))}${apart > 0 ? ` (${fmt((100 * Math.abs(saved)) / apart, 1)}%)` : ""}.`);
  }
  lines.push(...extra);
  if (sh) lines.push(`Shapley value: ${names.map((nm, i) => `${nm} ${unit}${fmt(sign * sh.x[i])}`).join(", ")}.`);
  if (nu?.x) {
    const lc = nu.leastCore;
    lines.push(`Nucleolus: ${names.map((nm, i) => `${nm} ${unit}${fmt(sign * nu.x[i])}`).join(", ")}.`);
    if (lc <= 1e-9 * Math.max(1, Math.abs(c[full]))) lines.push(`The core is not empty: there are divisions no subgroup can beat by going alone, and the nucleolus is one of them${lc < -1e-9 ? ` (every subgroup ${game === "value" ? "gets at least" : "pays at least"} ${unit}${fmt(-lc)} ${game === "value" ? "more than it could get alone" : "less than it would alone"})` : ""}.`);
    else lines.push(`The core is empty: whatever the division, some subgroup ${game === "value" ? "gets" : "pays"} at least ${unit}${fmt(lc)} ${game === "value" ? "less than it could get" : "more than it would"} on its own. The nucleolus keeps that shortfall as small as it can be.`);
  }
  if (sh && sh.inCore === false && sh.worst?.length) {
    const w = sh.worst[0];
    lines.push(`The Shapley value is not in the core: ${w.group} would ${game === "value" ? "get" : "save"} ${unit}${fmt(w.overpay)} by ${w.size > 1 ? "breaking away together" : "going alone"}.`);
  } else if (sh && sh.inCore) lines.push("The Shapley value is in the core: no subgroup would do better on its own.");
  return lines.join(" ");
}

/**
 * Analyse a cost-sharing problem.
 * input: {mode: "coalitions"|"road"|"claims", csv, game?: "cost"|"value", total?, estate?, unit?}
 *   coalitions: rows "A+B,cost" (game "value" for gains instead of costs)
 *   road: rows "name,reach" (how far along the shared road, pipe or runway each member needs it); total = cost of the full length (default: reach units are cost)
 *   claims: rows "name,claim"; estate = what there is to divide
 */
export function analyze(input = {}) {
  const mode = input.mode || DEFAULTS.mode;
  const unit = input.unit ?? "";
  const warnings = [];
  if (mode === "coalitions") {
    const game = input.game === "value" ? "value" : "cost";
    const parsed = parseCoalitionTable(input.csv);
    if (parsed.error) return { error: parsed.error };
    warnings.push(...parsed.problems);
    const { players: names, given } = parsed;
    const n = names.length;
    const g = completeGame(n, given, { game });
    if (g.error) return { error: g.missingSingles ? `Every member needs a price on their own; missing: ${g.missingSingles.map((m) => names[31 - Math.clz32(m)]).join(", ")}` : g.error };
    const { c } = g;
    if (g.filled.length) warnings.push(`${g.filled.length} of ${(1 << n) - 1 - n} groups were not priced; each was taken as the cheapest way to split it into priced groups${game === "value" ? " (the best a group can get by splitting up)" : ""}.`);
    for (const d of g.dearer.slice(0, 5)) warnings.push(`${groupName(d.mask, names, n)} is priced at ${unit}${fmt(Math.abs(d.cost))} but splitting it ${game === "value" ? "gets" : "costs"} ${unit}${fmt(Math.abs(d.split))}; the methods use the price as given.`);
    const { methods, separable } = methodsFor(c, n, names, { nucleolusOk: n <= LIMITS.nucleolusPlayers });
    if (game === "value") {
      // SCRB/ENSC/proportional are cost-allocation rules; for gains show equal surplus and equal split.
      const total = -c[(1 << n) - 1];
      const own = names.map((_, i) => -c[1 << i]);
      const surplus = total - own.reduce((a, b) => a + b, 0);
      for (const id of ["scrb", "ensc", "proportional"]) methods.splice(methods.findIndex((m) => m.id === id), 1);
      methods.splice(2, 0, { id: "equal-surplus", name: "Equal split of the gain", x: own.map((v) => -(v + surplus / n)), note: "each keeps what they would get alone, and the gain from working together is split equally" });
    }
    attachCore(methods, c, n, names);
    const sign = game === "value" ? -1 : 1;
    const result = {
      mode, game, players: names, n, unit,
      standalone: names.map((_, i) => sign * c[1 << i]),
      total: sign * c[(1 << n) - 1],
      separable: game === "cost" ? { separable: separable.separable, nonSeparable: separable.nonSeparable } : null,
      methods: methods.map((m) => ({ ...m, x: m.x ? m.x.map((v) => sign * v) : null, leastCore: m.leastCore !== undefined ? sign * m.leastCore : undefined })),
      filled: g.filled.length,
      warnings,
    };
    result.summary = summarise({ names, c, n, methods, unit, game, mode });
    return result;
  }
  if (mode === "road") {
    const rows = parseCsv(input.csv);
    const body = rows.length && isHeader(rows[0]) ? rows.slice(1) : rows;
    const names = [];
    const reach = [];
    for (const [k, row] of body.entries()) {
      const v = num(row[1]);
      if (v === null || v < 0) return { error: `line ${k + 1 + (body === rows ? 0 : 1)}: "${row[1] ?? ""}" is not a distance (give each member's name and how far along they need it)` };
      names.push(row[0] || `member ${k + 1}`);
      reach.push(v);
    }
    const n = names.length;
    if (n < 2) return { error: "Give at least two members, one per line: name, how far along the shared road (or pipe, runway) they need it." };
    if (n > LIMITS.linePlayers) return { error: `up to ${LIMITS.linePlayers} members` };
    const far = reach.reduce((a, b) => Math.max(a, b), 0);
    if (!(far > 0)) return { error: "every reach is 0, so there is nothing to share" };
    const total = input.total !== undefined && input.total !== null && input.total !== "" ? Number(input.total) : far;
    if (!(total >= 0)) return { error: "the total cost must be a number of at least 0" };
    const perUnit = total / far;
    const need = reach.map((r) => r * perUnit);
    const sh = airportShapley(need);
    const order = need.map((v, i) => i).sort((a, b) => reach[a] - reach[b]);
    const segments = [];
    let prev = 0;
    order.forEach((i, k) => {
      if (reach[i] > prev) segments.push({ from: prev, to: reach[i], cost: (reach[i] - prev) * perUnit, users: n - k, each: ((reach[i] - prev) * perUnit) / (n - k) });
      prev = Math.max(prev, reach[i]);
    });
    const methods = [
      { id: "shapley", name: "Shapley value (stretch by stretch)", x: sh, note: "Littlechild & Owen 1973: each stretch of road is split equally among everyone who drives on it" },
      { id: "proportional", name: "Proportional to distance", x: proportional(reach, total), note: "the common rule of thumb in road agreements" },
      { id: "equal", name: "Equal split", x: names.map(() => total / n), note: "everyone pays the same" },
    ];
    let game = null;
    if (n <= LIMITS.nucleolusPlayers) {
      game = airportGame(need);
      const nu = nucleolus(game, n);
      methods.splice(1, 0, nu.error ? { id: "nucleolus", name: "Nucleolus", x: null, note: nu.error } : { id: "nucleolus", name: "Nucleolus", x: nu.x, note: "makes the worst-treated subgroup as well off as possible, then the next", leastCore: nu.leastCore, stages: nu.stages.length });
    } else warnings.push(`The nucleolus and the core check are computed for up to ${LIMITS.nucleolusPlayers} members; with ${n}, the Shapley value comes from its closed form.`);
    // Core check: in an airport game, the binding groups are "everyone up to reach r" (prefixes).
    for (const m of methods) {
      if (!m.x) continue;
      let worst = null;
      let blocking = 0;
      let paid = 0;
      for (let k = 0; k < n; k++) {
        paid += m.x[order[k]];
        const cost = need[order[k]];
        // the group of the k+1 nearest members (ties included only at the end of a tie run)
        if (k + 1 < n && reach[order[k + 1]] === reach[order[k]]) continue;
        if (k === n - 1) break;
        const e = paid - cost;
        if (e > 1e-7 * Math.max(1, total)) {
          blocking++;
          if (!worst || e > worst.overpay) worst = { group: `the ${k + 1} nearest`, size: k + 1, overpay: e };
        }
      }
      for (let k = 0; k < n; k++) {
        const e = m.x[k] - need[k];
        if (e > 1e-7 * Math.max(1, total)) {
          blocking++;
          if (!worst || e > worst.overpay) worst = { group: names[k], size: 1, overpay: e };
        }
      }
      m.inCore = blocking === 0;
      m.blocking = blocking;
      m.worst = worst ? [worst] : [];
    }
    const prop = methods.find((m) => m.id === "proportional");
    const extra = [];
    const nearest = order[0];
    extra.push(`Split stretch by stretch, the first ${fmt(segments[0]?.to ?? 0, 0)} of ${fmt(far, 0)} units are shared by all ${n}; the last stretch is paid by ${segments.at(-1)?.users === 1 ? `${names[order[n - 1]]} alone` : `the ${segments.at(-1)?.users} who go furthest`}.`);
    if (prop && !prop.inCore) extra.push(`Splitting in proportion to distance overcharges the near members: ${prop.worst[0].group} would pay ${unit}${fmt(prop.worst[0].overpay)} more than ${prop.worst[0].size > 1 ? "building their own shorter stretch" : "a road of their own"}.`);
    const summary = [
      `The full length costs ${unit}${fmt(total)}. ${extra.join(" ")}`,
      `Shapley value: ${names.map((nm, i) => `${nm} ${unit}${fmt(sh[i])}`).join(", ")}.`,
      `${names[nearest]}, nearest, pays ${unit}${fmt(sh[nearest])} by that rule against ${unit}${fmt(prop.x[nearest])} in proportion to distance.`,
    ].join(" ");
    return { mode, players: names, n, unit, reach, total, standalone: need, segments, methods, warnings, summary };
  }
  if (mode === "claims") {
    const rows = parseCsv(input.csv);
    const body = rows.length && isHeader(rows[0]) ? rows.slice(1) : rows;
    const names = [];
    const claims = [];
    for (const [k, row] of body.entries()) {
      const v = num(row[1]);
      if (v === null || v < 0) return { error: `line ${k + 1 + (body === rows ? 0 : 1)}: "${row[1] ?? ""}" is not a claim amount` };
      names.push(row[0] || `claimant ${k + 1}`);
      claims.push(v);
    }
    const n = names.length;
    if (n < 2) return { error: "Give at least two claimants, one per line: name, amount claimed." };
    if (n > LIMITS.claimsPlayers) return { error: `up to ${LIMITS.claimsPlayers} claimants (the random-arrival rule enumerates every subgroup)` };
    const D = claims.reduce((a, b) => a + b, 0);
    const E = Number(input.estate);
    if (!(E >= 0)) return { error: "give the estate: the amount there is to divide" };
    if (E >= D) return { error: `the estate (${fmt(E)}) covers every claim (${fmt(D)}), so each claimant can be paid in full` };
    const v = bankruptcyGame(claims, E);
    const negV = Float64Array.from(v, (a) => -a);
    const methods = [
      { id: "talmud", name: "Talmud rule (= nucleolus)", x: talmud(claims, E), note: "Aumann & Maschler 1985: no one gets more than half their claim until everyone has half, and losses are shared the same way" },
      { id: "random-arrival", name: "Random arrival (= Shapley value)", x: shapley(v, n), note: "claimants arrive in a random order and each is paid in full while money lasts; averaged over every order" },
      { id: "proportional", name: "Proportional to claims", x: proportional(claims, E), note: "the usual rule for unsecured creditors of the same class" },
      { id: "cea", name: "Constrained equal awards", x: cea(claims, E), note: "equal shares, but no one gets more than they claimed" },
      { id: "cel", name: "Constrained equal losses", x: cel(claims, E), note: "equal losses, but no one loses more than they claimed" },
    ];
    let nuCheck = null;
    if (n <= LIMITS.nucleolusPlayers) {
      const nu = nucleolus(negV, n);
      if (!nu.error) nuCheck = nu.x.reduce((m, a, i) => Math.max(m, Math.abs(-a - methods[0].x[i])), 0);
    }
    for (const m of methods) {
      const ck = coreCheck(negV, n, m.x.map((a) => -a));
      m.inCore = ck.inCore;
      m.blocking = ck.blocking;
      m.worst = ck.worst.map((w) => ({ group: groupName(w.mask, names, n), size: popcount(w.mask), overpay: w.excess }));
    }
    const tl = methods[0].x;
    const summary = [
      `The estate of ${unit}${fmt(E)} covers ${fmt((100 * E) / D, 1)}% of ${unit}${fmt(D)} in claims.`,
      `Talmud rule (the nucleolus of the claims game): ${names.map((nm, i) => `${nm} ${unit}${fmt(tl[i])}`).join(", ")}.`,
      `In proportion to claims: ${names.map((nm, i) => `${nm} ${unit}${fmt(methods[2].x[i])}`).join(", ")}.`,
      E <= D / 2 ? "The estate is at most half the claims, so the Talmud rule splits it equally, except that no one gets more than half their claim." : "The estate is more than half the claims, so under the Talmud rule each claimant's loss is split equally, except that no one loses more than half their claim.",
    ].join(" ");
    return { mode, players: names, n, unit, claims, estate: E, totalClaims: D, methods, nucleolusMatchesTalmud: nuCheck === null ? null : nuCheck < 1e-6 * Math.max(1, E), warnings, summary };
  }
  return { error: `unknown mode "${mode}" (coalitions, road or claims)` };
}

/** A CSV cell that a spreadsheet will not run as a formula (a name like "=HYPERLINK(...)" gets a leading apostrophe). */
export function csvCell(c) {
  let s = String(c);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?(e[-+]?\d+)?$/i.test(s)) s = `'${s}`;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** One row per member and method, for spreadsheets. */
export function toCsv(r) {
  const ids = r.methods.filter((m) => m.x).map((m) => m.id);
  const head = ["member", "standalone", ...ids];
  const lines = [head.join(",")];
  r.players.forEach((nm, i) => {
    const sa = r.mode === "claims" ? r.claims[i] : r.standalone[i];
    lines.push([nm, round(sa, 6), ...r.methods.filter((m) => m.x).map((m) => round(m.x[i], 6))].map(csvCell).join(","));
  });
  return lines.join("\n") + "\n";
}
