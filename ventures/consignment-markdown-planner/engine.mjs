// Consignment markdown planner: when should a consignment or resale shop mark
// an item down, and is the item worth taking in at all?
//
// Each week an item sits on the floor it can sell with a probability that
// depends on the discount: rate(d) = min(cap, base x (1 + lift x d/10)), where
// base is the weekly sell chance at full price and lift is the extra chance per
// 10% off (both supplied). Selling in a week at discount d earns the shop
// price x (1 - d) x shop share. Every week on the floor costs shelf space.
// Discounts only go down over time (a price never goes back up), from a short
// list of allowed levels, and the exact best schedule is found by dynamic
// programming over (week, current level); the tests check it against trying
// every non-decreasing schedule. Pure functions, no network, no dependencies.

export const MODEL_NOTE =
  "Expected net = sum over weeks of P(still unsold) x (P(sell this week) x price x (1 - discount) x shop share - shelf cost per week) - handling. " +
  "Weekly sell chance = min(cap, base rate x (1 + lift x discount / 10)). Every rate is your estimate, not a forecast; the schedule is the exact best answer for the numbers you supply.";

export const INPUT_NOTES = [
  { what: "Silk blazer,120,8,40,0.60,12,Designer", detail: "One item (or item type) per row: name,price,weekly sell % at full price,shop share %,shelf cost per week[,weeks on floor][,note]. Dollars as plain numbers." },
  { what: "Weekly sell % at full price", detail: "The chance an item like this sells in a given week at tag price, from your own sell-through (e.g. 8 means about one in twelve weeks). Count only weeks it sat on the floor." },
  { what: "Shop share %", detail: "The slice of the sale price the shop keeps under the consignment agreement (e.g. 40 for a 60/40 split in the consignor's favour)." },
  { what: "Shelf cost per week", detail: "What a rack slot or shelf costs you per week: rent and staff time divided by item slots. Leave 0 if you have never worked it out, but the intake check then cannot decline anything." },
  { what: "Lift per 10% off", detail: "How much each 10% of markdown multiplies the weekly sell chance (0.35 means 10% off lifts it by 35% of the base). Use your own before-and-after sell-through; 0 means markdowns never help." },
  { what: "Allowed discounts", detail: "The markdown levels you are willing to use, as percentages, lowest first (default 0,10,25,40,50). Discounts only deepen over time." },
  { what: "Header row and # comments", detail: "A first row starting with name, blank lines and lines starting with # are skipped. Avoid commas inside names." },
];

const MAX_ITEMS = 200;
const MAX_WEEKS = 52;
const MAX_LEVELS = 10;

export function money(n) {
  const v = Math.round(n * 100) / 100;
  const abs = Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${v < 0 ? "-" : ""}$${abs}`;
}

export function pct(n, digits = 0) {
  return Number.isFinite(n) ? `${(Math.round(n * 10 ** digits) / 10 ** digits).toFixed(digits)}%` : "n/a";
}

function num(cell, what, where, errors, { allowEmpty = false } = {}) {
  if ((cell === undefined || String(cell).trim() === "") && allowEmpty) return null;
  const v = Number(String(cell ?? "").replace(/[$,%\s]/g, ""));
  if (cell === undefined || String(cell).trim() === "" || !Number.isFinite(v) || v < 0) {
    errors.push(`${where}: ${what} must be a number, zero or more`);
    return null;
  }
  return v;
}

export function parseItems(text) {
  const items = [];
  const errors = [];
  const lines = String(text ?? "").split(/\r?\n/);
  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const cells = line.split(",").map((c) => c.trim());
    if (/^name$/i.test(cells[0])) return;
    const where = `line ${i + 1}`;
    if (cells.length < 5) {
      errors.push(`${where}: expected name,price,weekly sell %,shop share %,shelf cost per week`);
      return;
    }
    const before = errors.length;
    const price = num(cells[1], "price", where, errors);
    const rate = num(cells[2], "weekly sell %", where, errors);
    const share = num(cells[3], "shop share %", where, errors);
    const shelf = num(cells[4], "shelf cost per week", where, errors);
    const weeks = num(cells[5], "weeks on floor", where, errors, { allowEmpty: true });
    if (errors.length > before) return;
    if (!cells[0]) return errors.push(`${where}: name is empty`);
    if (rate > 100 || share > 100) return errors.push(`${where}: percentages cannot exceed 100`);
    if (weeks !== null && (!Number.isInteger(weeks) || weeks < 1 || weeks > MAX_WEEKS)) return errors.push(`${where}: weeks on floor must be a whole number from 1 to ${MAX_WEEKS}`);
    if (price <= 0) return errors.push(`${where}: price must be above zero`);
    items.push({ name: cells[0], price, rate: rate / 100, share: share / 100, shelf, weeks, note: cells.slice(6).join(",") });
  });
  if (items.length > MAX_ITEMS) errors.push(`too many rows: ${items.length} (the limit is ${MAX_ITEMS})`);
  return { items, errors };
}

export function parseLevels(value) {
  if (Array.isArray(value)) value = value.join(",");
  const parts = String(value ?? "0,10,25,40,50").split(/[,\s]+/).filter(Boolean).map(Number);
  if (!parts.length || parts.some((n) => !Number.isFinite(n) || n < 0 || n >= 100)) throw new Error("allowed discounts must be percentages from 0 to 99");
  const levels = [...new Set(parts)].sort((a, b) => a - b);
  if (levels.length > MAX_LEVELS) throw new Error(`at most ${MAX_LEVELS} discount levels`);
  return levels;
}

function readOptions(opts = {}) {
  const n = (v, d, lo, hi, what) => {
    const x = v === undefined || v === "" ? d : Number(v);
    if (!Number.isFinite(x) || x < lo || x > hi) throw new Error(`${what} must be a number from ${lo} to ${hi}`);
    return x;
  };
  return {
    weeks: n(opts.weeks, 12, 1, MAX_WEEKS, "weeks on floor"),
    lift: n(opts.lift, 0.35, 0, 5, "lift per 10% off"),
    cap: n(opts.cap, 95, 1, 100, "weekly sell cap %") / 100,
    handling: n(opts.handling, 2, 0, 1000, "handling cost per item"),
    slow: n(opts.slow, 60, 0, 100, "slow-season sell rate %"),
    levels: parseLevels(opts.levels),
  };
}

export function sellChance(item, discountPct, o, scale = 1) {
  return Math.min(o.cap, item.rate * scale * (1 + (o.lift * discountPct) / 10));
}

// Expected shop economics of one item under an explicit weekly discount list.
export function evaluate(item, discounts, o, scale = 1) {
  let alive = 1;
  let net = -o.handling;
  let revenue = 0;
  let shelf = 0;
  let weeksOnFloor = 0;
  for (const d of discounts) {
    const q = sellChance(item, d, o, scale);
    const sale = item.price * (1 - d / 100);
    revenue += alive * q * sale * item.share;
    shelf += alive * item.shelf;
    weeksOnFloor += alive;
    net += alive * (q * sale * item.share - item.shelf);
    alive *= 1 - q;
  }
  const sold = 1 - alive;
  return { net, shopRevenue: revenue, shelfCost: shelf, sold, unsold: alive, expectedWeeks: weeksOnFloor, consignorPayout: (revenue / (item.share || 1)) * (1 - item.share) };
}

// Exact best non-decreasing schedule by dynamic programming over (week, level).
export function bestSchedule(item, o, scale = 1) {
  const W = item.weeks ?? o.weeks;
  const L = o.levels.length;
  const value = Array.from({ length: W + 1 }, () => new Array(L + 1).fill(0));
  const choice = Array.from({ length: W }, () => new Array(L).fill(0));
  for (let t = W - 1; t >= 0; t -= 1) {
    for (let l = 0; l < L; l += 1) {
      let best = -Infinity;
      let arg = l;
      for (let k = l; k < L; k += 1) {
        const d = o.levels[k];
        const q = sellChance(item, d, o, scale);
        const v = q * item.price * (1 - d / 100) * item.share - item.shelf + (1 - q) * value[t + 1][k];
        if (v > best + 1e-12) { best = v; arg = k; }
      }
      value[t][l] = best;
      choice[t][l] = arg;
    }
  }
  const discounts = [];
  let l = 0;
  for (let t = 0; t < W; t += 1) {
    l = choice[t][l];
    discounts.push(o.levels[l]);
  }
  return { discounts, net: value[0][0] - o.handling };
}

// "Week 1-4 full price, week 5-8 25% off" from a discount list.
export function describeSchedule(discounts) {
  const runs = [];
  discounts.forEach((d, i) => {
    const last = runs[runs.length - 1];
    if (last && last.d === d) last.to = i + 1;
    else runs.push({ d, from: i + 1, to: i + 1 });
  });
  return runs.map((r) => `${r.from === r.to ? `week ${r.from}` : `weeks ${r.from}-${r.to}`}: ${r.d === 0 ? "full price" : `${r.d}% off`}`).join(", ");
}

export function standardSchedule(weeks) {
  return Array.from({ length: weeks }, (_, i) => (i < 4 ? 0 : i < 8 ? 25 : 50));
}

function bisect(f, lo, hi) {
  if (f(hi) < 0) return Infinity;
  for (let i = 0; i < 60; i += 1) {
    const mid = (lo + hi) / 2;
    if (f(mid) >= 0) hi = mid; else lo = mid;
  }
  return hi;
}

export function analyzeItem(item, o) {
  const W = item.weeks ?? o.weeks;
  const best = bestSchedule(item, o);
  const noMarkdown = evaluate(item, new Array(W).fill(0), o);
  const standard = evaluate(item, standardSchedule(W), o);
  const plan = evaluate(item, best.discounts, o);
  const slow = evaluate(item, best.discounts, o, o.slow / 100);
  const accept = best.net >= 0;
  const withPrice = (price) => bestSchedule({ ...item, price }, o).net;
  const withShare = (share) => bestSchedule({ ...item, share }, o).net;
  const minPrice = item.shelf > 0 || o.handling > 0 ? bisect(withPrice, 0, Math.max(item.price * 20, 1000)) : 0;
  const minShare = item.shelf > 0 || o.handling > 0 ? bisect(withShare, 0, 1) : 0;
  return {
    name: item.name, price: item.price, weeks: W, shopShare: item.share, note: item.note,
    discounts: best.discounts, schedule: describeSchedule(best.discounts),
    firstMarkdownWeek: best.discounts.findIndex((d) => d > 0) + 1 || null,
    net: best.net, plan, noMarkdown, standard, slow, accept,
    minPriceToAccept: minPrice, minShareToAccept: minShare,
    gainVsNoMarkdown: best.net - noMarkdown.net,
    gainVsStandard: best.net - standard.net,
  };
}

export function plan(parsed, opts = {}) {
  const o = readOptions(opts);
  const items = (parsed.items ?? parsed).map((it) => analyzeItem(it, o));
  const sum = (f) => items.reduce((a, x) => a + f(x), 0);
  const kept = items.filter((x) => x.accept);
  const declined = items.filter((x) => !x.accept);
  const totals = {
    plan: sum((x) => x.net), planAcceptedOnly: kept.reduce((a, x) => a + x.net, 0),
    noMarkdown: sum((x) => x.noMarkdown.net), standard: sum((x) => x.standard.net),
    slowSeason: sum((x) => x.slow.net),
    shelfWeeks: sum((x) => x.plan.expectedWeeks), consignorPayout: sum((x) => x.plan.consignorPayout),
    unsold: sum((x) => x.plan.unsold),
  };
  totals.upliftVsStandard = totals.planAcceptedOnly - kept.reduce((a, x) => a + x.standard.net, 0);
  totals.upliftVsNoMarkdown = totals.planAcceptedOnly - kept.reduce((a, x) => a + x.noMarkdown.net, 0);
  const findings = [];
  for (const d of declined) {
    findings.push({ severity: "warn", rule: "decline", message: `${d.name}: declining it is worth ${money(-d.net)} more than taking it. Shelf cost and handling outrun the shop's cut at ${pct(d.shopShare * 100)} share; it only pays at a price of ${Number.isFinite(d.minPriceToAccept) ? money(d.minPriceToAccept) : "any price tried"} or a shop share of ${Number.isFinite(d.minShareToAccept) ? pct(d.minShareToAccept * 100, 1) : "above 100%"}.` });
  }
  for (const x of kept) {
    if (x.firstMarkdownWeek === null) findings.push({ severity: "info", rule: "hold-price", message: `${x.name}: hold full price all ${x.weeks} weeks; with these numbers a markdown costs more than the extra sales are worth.` });
    else if (x.firstMarkdownWeek === 1) findings.push({ severity: "info", rule: "price-low-now", message: `${x.name}: mark it down from week 1; the extra sales the discount brings beat the lower price from the first week.` });
    if (x.slow.net < 0) findings.push({ severity: "warn", rule: "slow-season", message: `${x.name}: loses ${money(-x.slow.net)} if sell rates fall to ${pct(o.slow)} of your estimate.` });
  }
  if (o.lift === 0) findings.push({ severity: "info", rule: "no-lift", message: "Lift is 0, so markdowns never sell more; the plan only holds price or declines items." });
  return { options: { ...o, levels: o.levels }, items, totals, kept: kept.map((x) => x.name), declined: declined.map((x) => x.name), findings };
}

export function summarize(p) {
  const t = p.totals;
  if (!p.items.length) return { status: "none", text: "No items to plan." };
  if (!p.kept.length) return { status: "none", text: `None of the ${p.items.length} items is worth taking in at these numbers: expected net ${money(t.plan)} if you did.` };
  const text = `Take ${p.kept.length} of ${p.items.length} items: the best markdown schedules earn the shop ${money(t.planAcceptedOnly)} expected net, ${money(t.upliftVsStandard)} more than a fixed 30/60-day 25%/50% rule and ${money(t.upliftVsNoMarkdown)} more than never marking down${p.declined.length ? `; decline ${p.declined.length}` : ""}.`;
  return { status: t.upliftVsStandard > 0 ? "gain" : "ok", text };
}
