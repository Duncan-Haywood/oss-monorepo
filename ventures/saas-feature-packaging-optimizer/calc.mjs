// SaaS feature packaging optimizer: given what each surveyed customer would pay per month for each feature, decide which features
// go in which plan and what each plan costs. A plan's value to a customer is the sum of their values for the features it
// contains (plans are nested: a feature first placed in plan N is in every higher plan too). Customers buy the plan with the
// largest surplus (value minus price) or nothing if none has surplus >= 0. Profit = sum over buyers of price - cost.
// Searches feature placements by local search (single moves and swaps from several starts); each placement is priced by the
// ladder search below, and the winner's prices are then slid to their exact best values.

export const MAX_TIERS = 3;
export const MAX_FEATURES = 8;
export const MAX_ROWS = 500;
const INNER_CANDIDATES = 8;
const FINAL_CANDIDATES = 24;

export const SHARED_DEFAULTS = { tiers: "Starter, Pro, Team", costs: "2, 4, 9", features: "", survey: "", current: "", currentPrices: "" };
export const EXAMPLE_SHARED = { tiers: "Starter, Pro, Team", costs: "2, 4, 9", features: "Core editor*, Templates, Exports, Integrations, Team roles, Audit log, API access", survey: exampleSurvey(), current: "1, 1, 2, 2, 3, 3, 3", currentPrices: "9, 29, 79" };

// Deterministic placeholder survey: three kinds of customer who care about different features. Not data from any business.
function exampleSurvey() {
  let s = 987654;
  const rnd = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
  const r1 = (x) => Math.max(0, Math.round(x));
  const rows = [];
  for (let i = 0; i < 40; i++) rows.push([6 + rnd() * 6, 2 + rnd() * 4, rnd() < 0.5 ? 1 + rnd() * 3 : 0, 0, 0, 0, 0]); // solo makers
  for (let i = 0; i < 30; i++) rows.push([8 + rnd() * 8, 4 + rnd() * 6, 4 + rnd() * 8, 6 + rnd() * 10, rnd() < 0.3 ? 2 + rnd() * 4 : 0, 0, rnd() < 0.3 ? 3 : 0]); // professionals
  for (let i = 0; i < 16; i++) rows.push([10 + rnd() * 10, 3 + rnd() * 5, 5 + rnd() * 10, 8 + rnd() * 12, 15 + rnd() * 25, 10 + rnd() * 25, 8 + rnd() * 20]); // teams
  return ["Core editor, Templates, Exports, Integrations, Team roles, Audit log, API access", ...rows.map((r) => r.map(r1).join(", "))].join("\n");
}

export const money = (n) => (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: n % 1 === 0 ? 0 : 2 });

const nums = (text) => String(text ?? "").split(/[,;\t]+/).map((t) => t.trim()).filter((t) => t !== "");

function parseList(text, label, warnings) {
  const out = [];
  for (const t of nums(text)) {
    const v = Number(t.replace(/[$\s]/g, ""));
    if (!Number.isFinite(v) || v < 0) { warnings.push(`${label}: "${t}" is not a non-negative number.`); return null; }
    out.push(v);
  }
  return out;
}

// One row per respondent: the most they would pay per month for each feature on its own (blank, "-" or 0 = no value),
// optionally followed by a weight. A first line with words in it is a header.
export function parseSurvey(text, f, warnings = []) {
  const rows = [];
  const lines = String(text ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let lineNo = 0;
  for (const line of lines) {
    lineNo++;
    const cells = line.split(/[,;\t]/).map((c) => c.trim());
    const numeric = cells.filter((c) => c !== "" && c !== "-");
    if (lineNo === 1 && numeric.some((c) => !Number.isFinite(Number(c.replace(/[$]/g, ""))))) continue; // header
    if (cells.length < f) { warnings.push(`Line ${lineNo}: needs ${f} values (one per feature), found ${cells.length}.`); continue; }
    const v = [];
    let bad = false;
    for (let i = 0; i < f; i++) {
      const c = cells[i];
      if (c === "" || c === "-") { v.push(0); continue; }
      const x = Number(c.replace(/[$]/g, ""));
      if (!Number.isFinite(x) || x < 0) { warnings.push(`Line ${lineNo}: "${c}" is not a price.`); bad = true; break; }
      v.push(x);
    }
    if (bad) continue;
    let w = 1;
    if (cells.length > f && cells[f] !== "") {
      w = Number(cells[f]);
      if (!Number.isFinite(w) || w <= 0) { warnings.push(`Line ${lineNo}: weight "${cells[f]}" must be a positive number.`); continue; }
    }
    rows.push({ v, w });
  }
  if (rows.length > MAX_ROWS) { warnings.push(`Only the first ${MAX_ROWS} respondents are used.`); rows.length = MAX_ROWS; }
  return rows;
}

// level[f]: 0 = not offered, 1..k = the cheapest plan that includes the feature. Returns rows whose v[t] is the value of plan t+1.
export function planValues(rows, level, k) {
  return rows.map(({ v, w }) => {
    const pv = new Array(k).fill(0);
    for (let f = 0; f < level.length; f++) {
      if (level[f] < 1) continue;
      for (let t = level[f] - 1; t < k; t++) pv[t] += v[f];
    }
    return { v: pv, w };
  });
}

// Largest surplus wins; a tie goes to the higher-priced plan; nobody buys at negative surplus. -1 = buys nothing.
export function choose(rows, prices) {
  return rows.map(({ v }) => {
    let best = -1, bestS = -1e-9; // a person with exactly zero surplus still buys
    for (let t = 0; t < prices.length; t++) {
      if (v[t] <= 0) continue;
      const s = v[t] - prices[t];
      if (s > bestS + 1e-12 || (Math.abs(s - bestS) <= 1e-12 && best >= 0 && prices[t] > prices[best])) { best = t; bestS = s; }
    }
    return best;
  });
}

export function evaluate(rows, prices, costs) {
  const ch = choose(rows, prices);
  const buyers = new Array(prices.length).fill(0);
  let total = 0;
  rows.forEach((r, i) => { total += r.w; if (ch[i] >= 0) buyers[ch[i]] += r.w; });
  let revenue = 0, profit = 0;
  buyers.forEach((b, t) => { revenue += b * prices[t]; profit += b * (prices[t] - costs[t]); });
  const paying = buyers.reduce((a, b) => a + b, 0);
  return { prices: prices.slice(), buyers, revenue, profit, paying, total, none: total - paying };
}

function candidates(rows, t, cost, cap) {
  const set = new Set();
  for (const r of rows) if (r.v[t] > 0 && r.v[t] >= cost) set.add(Math.round(r.v[t] * 100) / 100);
  let list = [...set].sort((a, b) => a - b);
  if (list.length > cap) {
    const thin = [];
    for (let i = 0; i < cap; i++) thin.push(list[Math.round((i * (list.length - 1)) / (cap - 1))]);
    list = [...new Set(thin)];
  }
  return list;
}

// Ladder search: ordered prices (each plan costs at least the one below) over a grid of surveyed values.
function ladder(rows, costs, cap) {
  const k = costs.length;
  const cands = [];
  for (let t = 0; t < k; t++) cands.push(candidates(rows, t, costs[t], cap));
  if (cands.some((c) => c.length === 0)) return null;
  let best = null;
  const cur = new Array(k);
  (function go(t) {
    if (t === k) {
      const e = evaluate(rows, cur, costs);
      if (!best || e.profit > best.profit + 1e-9) best = e;
      return;
    }
    for (const p of cands[t]) {
      if (t > 0 && p < cur[t - 1]) continue;
      cur[t] = p;
      go(t + 1);
    }
  })(0);
  return best;
}

// Exact one-price-at-a-time search: with the other prices fixed, profit only changes where some respondent switches plan,
// which happens at their own value or where this plan's surplus equals their best alternative, so only those prices are tested.
function refine(rows, costs, start) {
  const k = costs.length;
  let best = start;
  for (let guard = 0, improved = true; improved && guard < 60; guard++) {
    improved = false;
    for (let t = 0; t < k; t++) {
      const lo = t > 0 ? best.prices[t - 1] : costs[t];
      const hi = t < k - 1 ? best.prices[t + 1] : Infinity;
      const pts = new Set();
      for (const r of rows) {
        if (r.v[t] <= 0) continue;
        let other = 0;
        for (let u = 0; u < k; u++) if (u !== t && r.v[u] > 0) other = Math.max(other, r.v[u] - best.prices[u]);
        pts.add(r.v[t]);
        pts.add(r.v[t] - other);
      }
      if (Number.isFinite(hi)) pts.add(hi);
      pts.add(lo);
      for (const p of [...pts]) pts.add(Math.round((p - 0.01) * 100) / 100);
      for (const p0 of [...pts]) pts.add(Math.round(p0 * 100) / 100);
      for (const p of pts) {
        if (p < costs[t] || p < lo - 1e-9 || p > hi + 1e-9 || p === best.prices[t]) continue;
        const trial = best.prices.slice(); trial[t] = p;
        const e = evaluate(rows, trial, costs);
        if (e.profit > best.profit + 1e-9) { best = e; improved = true; }
      }
    }
  }
  return best;
}

// Best prices for one placement of features. `exact` slides the prices to their exact best values afterwards.
export function priceLadder(rows, level, costs, { exact = false } = {}) {
  const pr = planValues(rows, level, costs.length);
  const base = ladder(pr, costs, exact ? FINAL_CANDIDATES : INNER_CANDIDATES);
  if (!base) return null;
  const res = exact ? refine(pr, costs, base) : base;
  return { ...res, level: level.slice() };
}

// Which placements to try first: everything in the cheapest plan, then features ranked by how many people value them
// and how much, spread across the plans.
function starts(rows, f, k, locked) {
  const score = new Array(f).fill(0), reach = new Array(f).fill(0);
  let tw = 0;
  for (const { v, w } of rows) { tw += w; for (let i = 0; i < f; i++) if (v[i] > 0) { score[i] += v[i] * w; reach[i] += w; } }
  const out = [];
  out.push(new Array(f).fill(1));
  // broad-appeal features low, niche high-value features high
  const byReach = [...Array(f).keys()].sort((a, b) => reach[b] - reach[a] || a - b);
  const spread = new Array(f).fill(1);
  byReach.forEach((i, rank) => { spread[i] = Math.min(k, 1 + Math.floor((rank * k) / f)); });
  out.push(spread);
  const byAvg = [...Array(f).keys()].sort((a, b) => (score[a] / Math.max(reach[a], 1)) - (score[b] / Math.max(reach[b], 1)) || a - b);
  const spread2 = new Array(f).fill(1);
  byAvg.forEach((i, rank) => { spread2[i] = Math.min(k, 1 + Math.floor((rank * k) / f)); });
  out.push(spread2);
  const half = new Array(f).fill(1);
  byReach.forEach((i, rank) => { half[i] = rank < Math.ceil(f / 2) ? 1 : Math.min(2, k); });
  out.push(half);
  return out.map((l) => l.map((x, i) => (locked[i] ? 1 : x)));
}

// Hill-climb over placements: move one feature to another plan (or off the menu), or swap two features' plans.
function climb(start, k, lock, score) {
  const f = start.length;
  let cur = start, curE = score(cur);
  for (let guard = 0, moved = true; moved && guard < 20; guard++) {
    moved = false;
    let cand = null;
    const tryLevel = (lv) => {
      const e = score(lv);
      if (e && (!cand || e.profit > cand.e.profit + 1e-9)) cand = { lv, e };
    };
    for (let i = 0; i < f; i++) {
      if (lock[i]) continue;
      for (let L = 0; L <= k; L++) {
        if (L === cur[i]) continue;
        const lv = cur.slice(); lv[i] = L;
        tryLevel(lv);
      }
      for (let j = i + 1; j < f; j++) {
        if (lock[j] || cur[i] === cur[j]) continue;
        const lv = cur.slice(); lv[i] = cur[j]; lv[j] = cur[i];
        tryLevel(lv);
      }
    }
    if (cand && (!curE || cand.e.profit > curE.profit + 1e-9)) { cur = cand.lv; curE = cand.e; moved = true; }
  }
  return curE;
}

// Several starting placements are climbed with the quick price search; each local optimum is then climbed again with exact prices.
export function optimizePackaging(rows, costs, f, { locked = [] } = {}) {
  const k = costs.length;
  const lock = Array.from({ length: f }, (_, i) => Boolean(locked[i]));
  const memo = new Map(), exactMemo = new Map();
  const quick = (level) => {
    const key = level.join("");
    if (!memo.has(key)) memo.set(key, priceLadder(rows, level, costs));
    return memo.get(key);
  };
  const exact = (level) => {
    const key = level.join("");
    if (!exactMemo.has(key)) exactMemo.set(key, priceLadder(rows, level, costs, { exact: true }));
    return exactMemo.get(key);
  };
  const optima = new Map();
  for (const st of starts(rows, f, k, lock)) {
    const e = climb(st, k, lock, quick);
    if (e) optima.set(e.level.join(""), e);
  }
  let best = null;
  // The exact climb is the slow part, so it polishes only the two best quick optima.
  const top = [...optima.values()].sort((a, b) => b.profit - a.profit).slice(0, 2).map((e) => e.level);
  for (const lv of top) {
    const e = climb(lv, k, lock, exact);
    if (e && (!best || e.profit > best.profit + 1e-9)) best = e;
  }
  return best;
}

export function parseFeatures(text) {
  const names = [], locked = [];
  for (const raw of nums(text)) {
    const star = raw.endsWith("*");
    names.push(star ? raw.slice(0, -1).trim() : raw);
    locked.push(star);
  }
  return { names, locked };
}

export function analyze(shared) {
  const warnings = [];
  const tiers = nums(shared.tiers);
  const k = tiers.length;
  if (k < 2 || k > MAX_TIERS) { warnings.push(`List two to ${MAX_TIERS} plan names, cheapest first, separated by commas.`); return { ok: false, warnings }; }
  const { names: feats, locked } = parseFeatures(shared.features);
  const f = feats.length;
  if (f < 2 || f > MAX_FEATURES) { warnings.push(`List two to ${MAX_FEATURES} features, separated by commas. Add * after a feature that must stay in the cheapest plan.`); return { ok: false, warnings }; }
  let costs = parseList(shared.costs, "Cost per customer", warnings);
  if (!costs) return { ok: false, warnings };
  if (costs.length === 0) costs = new Array(k).fill(0);
  while (costs.length < k) costs.push(costs[costs.length - 1]);
  if (costs.length > k) { warnings.push("More costs than plans; extras are ignored."); costs.length = k; }
  const rows = parseSurvey(shared.survey, f, warnings);
  if (rows.length < 5) { warnings.push("Paste at least 5 survey lines: each respondent's value for each feature."); return { ok: false, warnings }; }
  if (!rows.some((r) => r.v.some((x) => x > 0))) { warnings.push("Every survey value is zero or blank."); return { ok: false, warnings }; }

  let curLevel = null, curPrices = null;
  if (nums(shared.current).length) {
    const lv = parseList(shared.current, "Current placement", warnings);
    if (!lv) return { ok: false, warnings };
    if (lv.length !== f || lv.some((x) => !Number.isInteger(x) || x > k)) { warnings.push(`Current placement: give ${f} whole numbers (one per feature), each 0 (not offered) to ${k} (the cheapest plan that includes it), or leave blank.`); return { ok: false, warnings }; }
    curLevel = lv;
    if (nums(shared.currentPrices).length) {
      curPrices = parseList(shared.currentPrices, "Current price", warnings);
      if (!curPrices) return { ok: false, warnings };
      if (curPrices.length !== k) { warnings.push(`Current prices: give ${k} (one per plan) or leave blank.`); return { ok: false, warnings }; }
    }
  }

  const best = optimizePackaging(rows, costs, f, { locked });
  if (!best) { warnings.push("No plan can be priced above its cost with this survey."); return { ok: false, warnings }; }

  // Current packaging, at the prices given or at its own best prices.
  let now = null;
  if (curLevel) {
    const pr = planValues(rows, curLevel, k);
    now = curPrices ? { ...evaluate(pr, curPrices, costs), level: curLevel, given: true } : (() => { const p = priceLadder(rows, curLevel, costs, { exact: true }); return p ? { ...p, given: false } : null; })();
  }

  // Baseline: no packaging, every feature in every plan, so only the price differs -- i.e. the best single plan.
  const all = new Array(f).fill(1);
  const one = (() => {
    const pr = planValues(rows, all, 1);
    const l = ladder(pr, [Math.min(...costs)], FINAL_CANDIDATES);
    return l ? refine(pr, [Math.min(...costs)], l) : null;
  })();

  // Feature placements: profit if each feature alone moved to each other level (others fixed, prices re-optimized).
  const impact = feats.map((name, i) => {
    const byLevel = [];
    for (let L = 0; L <= k; L++) {
      const lv = best.level.slice(); lv[i] = L;
      const e = L === best.level[i] ? best : priceLadder(rows, lv, costs, { exact: true });
      byLevel.push(e ? e.profit : null);
    }
    let reach = 0, tw = 0, sum = 0;
    for (const { v, w } of rows) { tw += w; if (v[i] > 0) { reach += w; sum += v[i] * w; } }
    return { name, locked: locked[i], level: best.level[i], reach: reach / tw, avg: reach ? sum / reach : 0, byLevel };
  });

  // Sensitivity: profit if each price is 10% off, others held.
  const pr = planValues(rows, best.level, k);
  const sens = tiers.map((name, t) => {
    const at = (x) => { const p = best.prices.slice(); p[t] = p[t] * x; return evaluate(pr, p, costs).profit; };
    return { name, down: at(0.9) - best.profit, up: at(1.1) - best.profit };
  });
  return { ok: true, warnings, tiers, features: feats, costs, rows: rows.length, best, now, single: one, impact, sens };
}

export function toCsv(a) {
  const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
  const lines = [["feature", "first_included_in", "share_of_respondents_who_value_it", "average_value_where_valued"].map(q).join(",")];
  a.impact.forEach((m) => lines.push([q(m.name), q(m.level === 0 ? "not offered" : a.tiers[m.level - 1]), m.reach.toFixed(4), m.avg.toFixed(2)].join(",")));
  lines.push("");
  lines.push(["plan", "suggested_price", "customers", "share_of_respondents", "revenue", "profit"].map(q).join(","));
  a.tiers.forEach((n, t) => {
    const b = a.best.buyers[t], p = a.best.prices[t];
    lines.push([q(n), p, b, (b / a.best.total).toFixed(4), b * p, b * (p - a.costs[t])].join(","));
  });
  return lines.join("\n") + "\n";
}
