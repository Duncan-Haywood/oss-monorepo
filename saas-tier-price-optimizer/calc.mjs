// SaaS tier price optimizer: given what each surveyed customer would pay for each plan, find the prices that earn the most.
// Customers buy the plan with the largest surplus (their maximum price minus the price), and nothing if no plan has surplus >= 0.
// Searches a grid of surveyed prices (thinned to at most MAX_CANDIDATES per plan), then slides each price to its exact best value in turn.

export const MAX_TIERS = 3;
export const MAX_ROWS = 2000;
export const MAX_CANDIDATES = 36;

export const SHARED_DEFAULTS = { names: "Starter, Pro, Team", costs: "2, 4, 9", current: "9, 29, 79", survey: "" };
export const EXAMPLE_SHARED = { names: "Starter, Pro, Team", costs: "2, 4, 9", current: "9, 29, 79", survey: exampleSurvey() };

// Deterministic placeholder survey: three kinds of customer with different appetites. Not data from any business.
function exampleSurvey() {
  let s = 12345;
  const rnd = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
  const round = (x) => Math.max(1, Math.round(x));
  const rows = [];
  for (let i = 0; i < 40; i++) { const v = 6 + rnd() * 14; rows.push([v, v * 1.15, v * 1.2]); } // hobbyists: cheap plan is enough
  for (let i = 0; i < 30; i++) { const v = 12 + rnd() * 30; rows.push([v * 0.7, v * 1.4, v * 1.5]); } // professionals: want the middle plan
  for (let i = 0; i < 14; i++) { const v = 40 + rnd() * 80; rows.push([v * 0.4, v * 0.9, v * 1.6]); } // teams: want the top plan
  return ["Starter, Pro, Team", ...rows.map((r) => r.map((x) => round(x)).join(", "))].join("\n");
}

export const money = (n) => (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: n % 1 === 0 ? 0 : 2 });

const nums = (text) => String(text ?? "").split(/[,;\t]+/).map((t) => t.trim()).filter((t) => t !== "");

function parseList(text, label, warnings, fallbackLen) {
  const out = [];
  for (const t of nums(text)) {
    const v = Number(t.replace(/[$\s]/g, ""));
    if (!Number.isFinite(v) || v < 0) { warnings.push(`${label}: "${t}" is not a non-negative number.`); return null; }
    out.push(v);
  }
  if (fallbackLen != null && out.length === 0) return new Array(fallbackLen).fill(0);
  return out;
}

// One row per respondent: one maximum monthly price per plan (blank, "-" or 0 means they would not buy that plan),
// optionally followed by a weight (how many customers like this one). A first line with words in it is a header.
export function parseSurvey(text, k, warnings = []) {
  const rows = [];
  const lines = String(text ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let lineNo = 0;
  for (const line of lines) {
    lineNo++;
    const cells = line.split(/[,;\t]/).map((c) => c.trim());
    const numeric = cells.filter((c) => c !== "" && c !== "-");
    if (lineNo === 1 && numeric.some((c) => !Number.isFinite(Number(c.replace(/[$]/g, ""))))) continue; // header
    if (cells.length < k) { warnings.push(`Line ${lineNo}: needs ${k} prices (one per plan), found ${cells.length}.`); continue; }
    const v = [];
    let bad = false;
    for (let t = 0; t < k; t++) {
      const c = cells[t];
      if (c === "" || c === "-") { v.push(0); continue; }
      const x = Number(c.replace(/[$]/g, ""));
      if (!Number.isFinite(x) || x < 0) { warnings.push(`Line ${lineNo}: "${c}" is not a price.`); bad = true; break; }
      v.push(x);
    }
    if (bad) continue;
    let w = 1;
    if (cells.length > k && cells[k] !== "") {
      w = Number(cells[k]);
      if (!Number.isFinite(w) || w <= 0) { warnings.push(`Line ${lineNo}: weight "${cells[k]}" must be a positive number.`); continue; }
    }
    rows.push({ v, w });
  }
  if (rows.length > MAX_ROWS) { warnings.push(`Only the first ${MAX_ROWS} respondents are used.`); rows.length = MAX_ROWS; }
  return rows;
}

// What each respondent buys at these prices. Largest surplus wins; a tie goes to the higher-priced plan (the seller's side);
// nobody buys at negative surplus. Returns the chosen plan index per respondent, -1 for none.
export function choose(rows, prices) {
  return rows.map(({ v }) => {
    let best = -1, bestS = -1e-12;
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

function candidates(rows, t, current, cost) {
  const set = new Set();
  for (const r of rows) if (r.v[t] > 0 && r.v[t] >= cost) set.add(r.v[t]);
  let list = [...set].sort((a, b) => a - b);
  if (list.length > MAX_CANDIDATES) {
    const thin = [];
    for (let i = 0; i < MAX_CANDIDATES; i++) thin.push(list[Math.round((i * (list.length - 1)) / (MAX_CANDIDATES - 1))]);
    list = [...new Set(thin)];
  }
  if (current != null && current > 0 && !list.includes(current)) list.push(current);
  return list.sort((a, b) => a - b);
}

// ordered: each plan must cost at least as much as the one below it, which is what a price ladder means.
export function optimize(rows, costs, current = null, { ordered = true } = {}) {
  const k = costs.length;
  const cands = [];
  for (let t = 0; t < k; t++) cands.push(candidates(rows, t, current ? current[t] : null, costs[t]));
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
      if (ordered && t > 0 && p < cur[t - 1]) continue;
      cur[t] = p;
      go(t + 1);
    }
  })(0);
  if (!best) return null;
  const starts = [best];
  if (current && current.every((p) => p > 0) && (!ordered || current.every((p, t) => t === 0 || p >= current[t - 1]))) starts.push(evaluate(rows, current, costs));
  let top = null;
  for (const st of starts) {
    const r = refine(rows, costs, st, ordered);
    if (!top || r.profit > top.profit + 1e-9) top = r;
  }
  return top;
}

// Exact one-price-at-a-time search. With the other prices fixed, profit only changes where some respondent switches plan,
// which happens at their own maximum price or where this plan's surplus equals their best alternative, so those are the only
// prices worth testing. Repeats until no single move helps.
function refine(rows, costs, start, ordered) {
  const k = costs.length;
  let best = start;
  for (let guard = 0, improved = true; improved && guard < 60; guard++) {
    improved = false;
    for (let t = 0; t < k; t++) {
      const lo = ordered && t > 0 ? best.prices[t - 1] : costs[t];
      const hi = ordered && t < k - 1 ? best.prices[t + 1] : Infinity;
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
      // Where a tie goes to the other plan the breakpoint itself is not reachable, so also try one cent below it.
      for (const p of [...pts]) pts.add(Math.round((p - 0.01) * 100) / 100);
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

export function analyze(shared) {
  const warnings = [];
  const names = nums(shared.names);
  const k = names.length;
  if (k < 1 || k > MAX_TIERS) { warnings.push(`List one to ${MAX_TIERS} plan names, separated by commas.`); return { ok: false, warnings }; }
  const costs = parseList(shared.costs, "Cost per customer", warnings, k);
  if (!costs) return { ok: false, warnings };
  while (costs.length < k) costs.push(costs.length ? costs[costs.length - 1] : 0);
  if (costs.length > k) { warnings.push("More costs than plans; extras are ignored."); costs.length = k; }
  let current = null;
  if (nums(shared.current).length) {
    current = parseList(shared.current, "Current price", warnings);
    if (!current) return { ok: false, warnings };
    if (current.length !== k) { warnings.push(`Current prices: give ${k} (one per plan) or leave blank.`); return { ok: false, warnings }; }
  }
  const rows = parseSurvey(shared.survey, k, warnings);
  if (rows.length < 5) { warnings.push("Paste at least 5 survey rows: each respondent's maximum monthly price per plan."); return { ok: false, warnings }; }
  const ordered = true;
  const best = optimize(rows, costs, current, { ordered });
  if (!best) { warnings.push("No plan can be priced above its cost with this survey."); return { ok: false, warnings }; }
  const now = current ? evaluate(rows, current, costs) : null;
  // Best single plan (everyone offered only one plan) as the "why bother with tiers" baseline.
  let single = null;
  for (let t = 0; t < k; t++) {
    const only = rows.map((r) => ({ v: r.v.map((x, i) => (i === t ? x : 0)), w: r.w }));
    const o = optimize(only.map((r) => ({ v: [r.v[t]], w: r.w })), [costs[t]], null, { ordered: false });
    if (o && (!single || o.profit > single.profit)) single = { plan: names[t], price: o.prices[0], profit: o.profit, buyers: o.buyers[0] };
  }
  // Sensitivity: profit if each price is off by 10% either way, others held.
  const sens = names.map((name, t) => {
    const at = (f) => { const p = best.prices.slice(); p[t] = p[t] * f; return evaluate(rows, p, costs).profit; };
    return { name, down: at(0.9) - best.profit, up: at(1.1) - best.profit };
  });
  return { ok: true, warnings, names, costs, rows: rows.length, best, now, single, sens };
}

export function toCsv(a) {
  const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
  const lines = [["plan", "suggested_price", "customers", "share_of_respondents", "revenue", "profit", ...(a.now ? ["current_price"] : [])].map(q).join(",")];
  a.names.forEach((n, t) => {
    const b = a.best.buyers[t], p = a.best.prices[t];
    lines.push([q(n), p, b, (b / a.best.total).toFixed(4), b * p, b * (p - a.costs[t]), ...(a.now ? [a.now.prices[t]] : [])].join(","));
  });
  return lines.join("\n") + "\n";
}
