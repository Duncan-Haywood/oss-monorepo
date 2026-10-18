// Thrift haul buy picker: pure functions, no I/O, no network.
//
// Everything here is arithmetic on numbers the user types: what each item is
// priced at, what they think it will resell for, how likely they think it is
// to sell, and what their time and money are worth. Nothing is a price guide
// and nothing is a forecast.

export const MAX_ITEMS = 120;
export const EPS = 1e-9;
export const NODE_LIMIT = 3_000_000;

export const MODEL_NOTE =
  "Estimates, not a forecast and not a price guide: every resale value, sell-through chance, fee and time figure is a number you typed. Marketplace fees change; copy them from the marketplace's current fee page.";

export const INPUT_NOTES = [
  { what: "name,ask,resale,sell_chance[,ship,minutes,days,note]", detail: "One item per row. ask is the price you would pay. resale is what you expect it to sell for. sell_chance is your chance (0 to 1, or a percent) that it sells at that price within the days you give. The rest are optional per-item overrides." },
  { what: "ship", detail: "Shipping you pay for this item. Blank uses the default shipping per item." },
  { what: "minutes", detail: "Your hands-on minutes to clean, photograph, list, pack and ship the item. Blank uses the default minutes. Priced at your hourly value of time." },
  { what: "days", detail: "Days you expect the item to tie up your cash before it sells. Blank uses the default days. Priced at your annual cost of capital." },
  { what: "Unsold recovery", detail: "What share of the resale value you get back if the item does not sell at your price and you mark it down or wholesale it. 0 means a total loss of the ask." },
  { what: "Budget, item and hour caps", detail: "When cash, number of items or hands-on hours are capped, the best set to buy is found exactly (branch and bound), not by ranking and cutting off." },
  { what: "Minimum return", detail: "The least profit per dollar paid you will accept. The walk-away price on each row is the most you can pay and still reach it." },
];

export const money = (v) => {
  if (v === null || v === undefined || Number.isNaN(v)) return "n/a";
  const r = Math.round(Math.abs(v) * 100) / 100;
  return `${v < -0.004 ? "-" : ""}$${r.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
export const pct = (p, digits = 1) => (p === null || p === undefined ? "n/a" : `${(p * 100).toFixed(digits).replace(/\.0+$/, "")}%`);

const toNumber = (s) => {
  const t = String(s ?? "").trim().replace(/^\$/, "").replace(/,/g, "");
  if (t === "" || !/^[-+]?(\d+\.?\d*|\.\d+)$/.test(t)) return null;
  return Number(t);
};

export function parseProb(s) {
  const t = String(s ?? "").trim();
  if (t === "") return null;
  if (t.endsWith("%")) {
    const n = toNumber(t.slice(0, -1));
    return n === null || n < 0 || n > 100 ? NaN : n / 100;
  }
  const n = toNumber(t);
  if (n === null || n < 0 || n > 100) return NaN;
  return n > 1 ? n / 100 : n;
}

/** Parse item rows. Never throws; errors carry line numbers. */
export function parseItems(text) {
  const items = [];
  const errors = [];
  let seenHeader = false;
  String(text ?? "").split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const f = line.split(",").map((s) => s.trim());
    if (!seenHeader && /^(name|item)$/i.test(f[0])) { seenHeader = true; return; }
    seenHeader = true;
    const at = `line ${i + 1}`;
    if (f.length < 4) { errors.push(`${at}: expected name,ask,resale,sell_chance[,ship,minutes,days,note] but found ${f.length} field(s)`); return; }
    if (!f[0]) { errors.push(`${at}: name is empty`); return; }
    const ask = toNumber(f[1]);
    if (ask === null || ask < 0) { errors.push(`${at}: ask must be a number of dollars, zero or more`); return; }
    const resale = toNumber(f[2]);
    if (resale === null || resale < 0) { errors.push(`${at}: resale must be a number of dollars, zero or more`); return; }
    const p = parseProb(f[3]);
    if (p === null || Number.isNaN(p)) { errors.push(`${at}: sell_chance must be a chance from 0 to 1 (or a percent)`); return; }
    const opt = (k, label) => {
      if (f[k] === undefined || f[k] === "") return null;
      const n = toNumber(f[k]);
      return n === null || n < 0 ? NaN : n;
    };
    const ship = opt(4); const minutes = opt(5); const days = opt(6);
    for (const [v, label] of [[ship, "ship"], [minutes, "minutes"], [days, "days"]]) {
      if (Number.isNaN(v)) { errors.push(`${at}: ${label} must be a number, zero or more (or blank)`); return; }
    }
    items.push({ name: f[0], ask, resale, p, ship, minutes, days, note: f.slice(7).join(","), line: i + 1 });
  });
  if (items.length > MAX_ITEMS) errors.push(`at most ${MAX_ITEMS} items at a time; found ${items.length}`);
  return { items, errors };
}

const num = (v, def, label, { min = 0, max = Infinity } = {}) => {
  if (v === undefined || v === null || v === "") return def;
  const n = toNumber(v);
  if (n === null || n < min || n > max) throw new Error(`${label} must be a number from ${min} to ${max === Infinity ? "any size" : max}`);
  return n;
};
const cap = (v, label) => {
  if (v === undefined || v === null || v === "") return null;
  const n = toNumber(v);
  if (n === null || n < 0) throw new Error(`${label} must be a number, zero or more (or blank for no cap)`);
  return n;
};

export function normalizeOptions(o = {}) {
  return {
    feePct: num(o.feePct, 13, "marketplace fee percent", { max: 99 }),
    fixedFee: num(o.fixedFee, 0.3, "fixed fee per sale"),
    shipDefault: num(o.shipDefault, 6, "default shipping"),
    suppliesPerItem: num(o.suppliesPerItem, 0.5, "supplies per item"),
    minutesDefault: num(o.minutesDefault, 20, "default minutes per item"),
    hourlyValue: num(o.hourlyValue, 15, "hourly value of your time"),
    daysDefault: num(o.daysDefault, 30, "default days to sell"),
    annualRate: num(o.annualRate, 20, "annual cost of capital percent"),
    unsoldRecoveryPct: num(o.unsoldRecoveryPct, 30, "unsold recovery percent", { max: 100 }),
    minReturnPct: num(o.minReturnPct, 0, "minimum return percent"),
    budget: cap(o.budget, "budget"),
    maxItems: cap(o.maxItems, "max items"),
    maxHours: cap(o.maxHours, "max hands-on hours"),
  };
}

/** Per-item economics. Profit is linear in the sell chance, which gives closed forms. */
export function evaluate(item, o) {
  const ship = item.ship ?? o.shipDefault;
  const minutes = item.minutes ?? o.minutesDefault;
  const days = item.days ?? o.daysDefault;
  const keep = 1 - o.feePct / 100;
  const netIfSold = item.resale * keep - o.fixedFee - ship - o.suppliesPerItem;
  const netIfUnsold = Math.max((item.resale * o.unsoldRecoveryPct / 100) * keep - o.fixedFee, 0);
  const labor = (minutes / 60) * o.hourlyValue;
  const capFactor = (o.annualRate / 100) * (days / 365);
  const capital = item.ask * capFactor;
  const fixedCost = item.ask + capital + labor;
  const expRevenue = item.p * netIfSold + (1 - item.p) * netIfUnsold;
  const profit = expRevenue - fixedCost;
  const profitIfSold = netIfSold - fixedCost;
  const profitIfUnsold = netIfUnsold - fixedCost;
  // Break-even sell chance: p*S + (1-p)*U = fixedCost.
  let breakEven;
  const slope = netIfSold - netIfUnsold;
  if (Math.abs(slope) < EPS) breakEven = { status: netIfSold >= fixedCost ? "always" : "never", p: null };
  else {
    const pStar = (fixedCost - netIfUnsold) / slope;
    if (slope > 0) breakEven = pStar <= 0 ? { status: "always", p: null } : pStar > 1 ? { status: "never", p: null } : { status: "chance", p: pStar };
    else breakEven = { status: "never", p: null };
  }
  // Walk-away price at the minimum return: ask*(1+capFactor+minReturn) = expRevenue - labor.
  const minRet = o.minReturnPct / 100;
  const maxAsk = Math.max(0, (expRevenue - labor) / (1 + capFactor + minRet));
  const need = item.ask * minRet;
  return {
    name: item.name, ask: item.ask, resale: item.resale, p: item.p, note: item.note, line: item.line,
    ship, minutes, days, netIfSold, netIfUnsold, labor, capital,
    expRevenue, profit, ret: item.ask > 0 ? profit / item.ask : profit > 0 ? Infinity : 0,
    meets: profit >= need - EPS && profit > EPS,
    profitIfSold, profitIfUnsold, pLoss: profitIfSold >= 0 && profitIfUnsold >= 0 ? 0 : profitIfSold < 0 && profitIfUnsold < 0 ? 1 : profitIfUnsold < 0 ? 1 - item.p : item.p,
    worst: Math.min(profitIfSold, profitIfUnsold), breakEven, maxAsk,
  };
}

/** Exact best subset under up to three caps. Branch and bound; flags itself when the node limit stops it. */
export function bestSubset(cands, caps) {
  const n = cands.length;
  const order = cands.map((_, i) => i).sort((a, b) => cands[b].profit / (cands[b].ask + 1) - cands[a].profit / (cands[a].ask + 1));
  const dims = [];
  if (caps.budget !== null) dims.push((c) => c.ask);
  if (caps.maxHours !== null) dims.push((c) => c.minutes / 60);
  if (caps.maxItems !== null) dims.push(() => 1);
  const limits = [];
  if (caps.budget !== null) limits.push(caps.budget);
  if (caps.maxHours !== null) limits.push(caps.maxHours);
  if (caps.maxItems !== null) limits.push(caps.maxItems);
  if (!dims.length) return { picked: cands.map((_, i) => i), exact: true, value: cands.reduce((s, c) => s + c.profit, 0) };
  const sorted = order.map((i) => cands[i]);
  // Fractional bound per dimension: best possible profit using remaining items and remaining capacity.
  const bound = (from, used) => {
    let best = Infinity;
    for (let d = 0; d < dims.length; d += 1) {
      const room = limits[d] - used[d];
      const rest = [];
      for (let k = from; k < n; k += 1) rest.push([sorted[k].profit, dims[d](sorted[k])]);
      rest.sort((a, b) => (b[0] / (b[1] + 1e-12)) - (a[0] / (a[1] + 1e-12)));
      let left = room; let v = 0;
      for (const [pr, w] of rest) {
        if (w <= left + EPS) { v += pr; left -= w; } else { v += pr * Math.max(left, 0) / (w + 1e-12); break; }
      }
      best = Math.min(best, v);
    }
    return best;
  };
  let bestVal = 0; let bestSet = []; let nodes = 0; let exact = true;
  const cur = [];
  const dfs = (k, used, val) => {
    if (nodes > NODE_LIMIT) { exact = false; return; }
    nodes += 1;
    if (val > bestVal + EPS) { bestVal = val; bestSet = cur.slice(); }
    if (k >= n) return;
    if (val + bound(k, used) <= bestVal + EPS) return;
    const c = sorted[k];
    const nu = used.map((u, d) => u + dims[d](c));
    if (nu.every((u, d) => u <= limits[d] + EPS)) { cur.push(order[k]); dfs(k + 1, nu, val + c.profit); cur.pop(); }
    dfs(k + 1, used, val);
  };
  dfs(0, dims.map(() => 0), 0);
  return { picked: bestSet, exact, value: bestVal };
}

function greedy(cands, caps) {
  const idx = cands.map((_, i) => i).sort((a, b) => cands[b].profit / (cands[b].ask + 1) - cands[a].profit / (cands[a].ask + 1));
  let spend = 0; let hours = 0; let count = 0; let value = 0; const picked = [];
  for (const i of idx) {
    const c = cands[i];
    if (caps.budget !== null && spend + c.ask > caps.budget + EPS) continue;
    if (caps.maxHours !== null && hours + c.minutes / 60 > caps.maxHours + EPS) continue;
    if (caps.maxItems !== null && count + 1 > caps.maxItems) continue;
    spend += c.ask; hours += c.minutes / 60; count += 1; value += c.profit; picked.push(i);
  }
  return { picked, value, spend, hours };
}

export function plan(parsed, options = {}) {
  const o = normalizeOptions(options);
  const all = parsed.items.map((it) => evaluate(it, o));
  const candIdx = all.map((e, i) => (e.meets ? i : -1)).filter((i) => i >= 0);
  const cands = candIdx.map((i) => all[i]);
  const caps = { budget: o.budget, maxHours: o.maxHours, maxItems: o.maxItems };
  const sub = bestSubset(cands, caps);
  const chosen = new Set(sub.picked.map((k) => candIdx[k]));
  const buy = all.filter((_, i) => chosen.has(i)).sort((a, b) => b.profit - a.profit);
  const pass = all.filter((_, i) => !chosen.has(i)).map((e) => {
    let reason;
    if (e.meets) reason = "positive, but the best set under your caps leaves it out";
    else if (e.profit > EPS) reason = `profit ${money(e.profit)} is below your ${o.minReturnPct}% minimum return`;
    else reason = `expected ${money(e.profit)}; you would lose money on your own numbers`;
    return { ...e, reason };
  }).sort((a, b) => b.profit - a.profit);
  const spend = buy.reduce((s, e) => s + e.ask, 0);
  const hours = buy.reduce((s, e) => s + e.minutes / 60, 0);
  const profit = buy.reduce((s, e) => s + e.profit, 0);
  const g = greedy(cands, caps);
  const baselines = [
    { label: "Rank by return on cash, take until a cap is hit", items: g.picked.length, spend: g.spend, hours: g.hours, profit: g.value },
    { label: "Buy every positive-profit item (ignores your caps)", items: cands.length, spend: cands.reduce((s, e) => s + e.ask, 0), hours: cands.reduce((s, e) => s + e.minutes / 60, 0), profit: cands.reduce((s, e) => s + e.profit, 0) },
  ];
  const findings = [];
  if (!sub.exact) findings.push({ severity: "warn", rule: "search-limit", message: "The exact search hit its size limit, so this set is a very good one but is not proven best. Trim the list or loosen a cap." });
  for (const e of pass) {
    if (e.profit <= EPS && e.maxAsk > 0 && e.maxAsk < e.ask) findings.push({ severity: "info", rule: "negotiate", message: `${e.name}: on your numbers it only works at ${money(e.maxAsk)} or less (asking ${money(e.ask)}).` });
  }
  if (g.value < sub.value - 0.005) findings.push({ severity: "info", rule: "beats-ranking", message: `The exact best set earns ${money(sub.value - g.value)} more than ranking by return on cash and stopping at the first cap.` });
  const riskyBuys = buy.filter((e) => e.pLoss >= 0.4);
  if (riskyBuys.length) findings.push({ severity: "warn", rule: "loss-chance", message: `${riskyBuys.map((e) => e.name).join(", ")} ${riskyBuys.length === 1 ? "has" : "have"} a ${riskyBuys.length === 1 ? "" : "40%+ "}chance of ending below zero on your own odds.` });
  return {
    options: o, items: all, buy, pass, spend, hours, profit,
    perHour: hours > 0 ? profit / hours : null, exact: sub.exact,
    upliftVsBest: sub.value - g.value, baselines, findings,
  };
}

export function summarize(p) {
  if (!p.buy.length) return { status: "none", text: `Buy nothing from this list: no item clears your minimum return on your own numbers.` };
  const hr = p.perHour === null ? "" : `, about ${money(p.perHour)} an hour of your time`;
  return { status: "gain", text: `Buy ${p.buy.length} of ${p.items.length} items for ${money(p.spend)}: expected profit ${money(p.profit)} after fees, shipping, your time and cost of cash${hr}. ${MODEL_NOTE}` };
}
