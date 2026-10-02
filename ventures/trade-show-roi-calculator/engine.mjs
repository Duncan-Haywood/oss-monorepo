// Trade show ROI calculator: does an exhibition booth pay back, and which
// shows should a small B2B exhibitor buy under a yearly budget?
//
// Per show the funnel is user-supplied: expected leads x lead->qualified %
// x qualified->deal % = expected deals; deals x average first-year deal value
// x lifetime-value multiplier x gross margin % = expected gross profit.
// Cost = booth fee + travel and lodging + staff (people x days x day cost)
// + swag and collateral. Net gain = expected gross profit - total cost.
//
// The set of shows that maximises total net gain under a yearly budget (and
// an optional cap on shows per calendar quarter) is found exactly by
// branch-and-bound with a fractional-knapsack bound; the tests check it
// against trying every subset. Pure functions, no network, no dependencies.

export const MODEL_NOTE =
  "Cost = booth fee + travel and lodging + staff days x day cost + swag and collateral. Expected gross profit = leads x qualified % x close % x deal value x lifetime multiplier x gross margin %. " +
  "Every rate and lead count is your estimate, not a forecast; the plan is the exact best answer for the numbers you supply.";

export const INPUT_NOTES = [
  { what: "Regional Manufacturing Expo,2027-02-09,6500,1800,2,3,450,1200,90,Local", detail: "One show per row: name,date,booth fee,travel and lodging,staff count,staff days,cost per staff day,swag and collateral,expected leads[,note]. Dollars as plain numbers." },
  { what: "Expected leads", detail: "Badge scans or conversations you expect to log, from past years or the organiser's attendee figures, not the show's total attendance." },
  { what: "Funnel options", detail: "Lead to qualified %, qualified to deal %, average first-year deal value, gross margin %, optional lifetime-value multiplier (1 = first-year only) and sales cycle in months." },
  { what: "Budget and quarter cap", detail: "Yearly spend ceiling (0 = none) and the most shows per calendar quarter (0 = none). The plan keeps the best combination that fits both." },
  { what: "Header row and # comments", detail: "A first row starting with name, blank lines and lines starting with # are skipped. Avoid commas inside names." },
];

const DAY = 86400000;
const MAX_SHOWS = 40;

export function dayNumber(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso).trim());
  if (!m) return NaN;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  const d = new Date(t);
  if (d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) return NaN;
  return t / DAY;
}

export function isoDay(n) {
  return new Date(n * DAY).toISOString().slice(0, 10);
}

export function quarterOf(day) {
  const d = new Date(day * DAY);
  return `${d.getUTCFullYear()}-Q${Math.floor(d.getUTCMonth() / 3) + 1}`;
}

export function money(n) {
  const v = Math.round(n * 100) / 100;
  const abs = Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${v < 0 ? "-" : ""}$${abs}`;
}

export function pct(n, digits = 0) {
  return Number.isFinite(n) ? `${(Math.round(n * 10 ** digits) / 10 ** digits).toFixed(digits)}%` : "n/a";
}

function num(cell, what, where, errors, { allowEmpty = false } = {}) {
  if ((cell === undefined || cell === "") && allowEmpty) return 0;
  const v = Number(String(cell ?? "").replace(/[$,%\s]/g, ""));
  if (cell === undefined || cell === "" || !Number.isFinite(v) || v < 0) {
    errors.push(`${where}: ${what} must be a number, zero or more`);
    return null;
  }
  return v;
}

export function parseShows(text) {
  const shows = [];
  const errors = [];
  String(text || "").split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const cells = line.split(",").map((c) => c.trim());
    if (/^name$/i.test(cells[0])) return;
    const where = `line ${i + 1}`;
    const name = cells[0];
    const day = dayNumber(cells[1]);
    if (!name) { errors.push(`${where}: the show needs a name`); return; }
    if (Number.isNaN(day)) { errors.push(`${where}: date must be YYYY-MM-DD (got "${cells[1] ?? ""}")`); return; }
    const before = errors.length;
    const booth = num(cells[2], "booth fee", where, errors);
    const travel = num(cells[3], "travel and lodging", where, errors, { allowEmpty: true });
    const staffCount = num(cells[4], "staff count", where, errors, { allowEmpty: true });
    const staffDays = num(cells[5], "staff days", where, errors, { allowEmpty: true });
    const staffDayCost = num(cells[6], "staff day cost", where, errors, { allowEmpty: true });
    const swag = num(cells[7], "swag and collateral", where, errors, { allowEmpty: true });
    const leads = num(cells[8], "expected leads", where, errors);
    if (errors.length > before) return;
    shows.push({
      id: shows.length, name, day, quarter: quarterOf(day), booth, travel, staffCount, staffDays, staffDayCost, swag, leads,
      note: cells.slice(9).join(", "), line: i + 1,
    });
  });
  return { shows, errors };
}

function readOptions(o = {}) {
  const n = (v, d, lo = 0, hi = Infinity, minExclusive = false) => {
    const x = v === undefined || v === "" || v === null ? d : Number(v);
    return Number.isFinite(x) && (minExclusive ? x > lo : x >= lo) && x <= hi ? x : d;
  };
  return {
    leadQual: n(o.leadQual, 30, 0, 100),
    close: n(o.close, 20, 0, 100),
    dealValue: n(o.dealValue, 10000, 0),
    margin: n(o.margin, 60, 0, 100),
    cycleMonths: n(o.cycleMonths, 6, 0, 120),
    ltv: n(o.ltv, 1, 0, 100, true),
    budget: n(o.budget, 0),
    maxPerQuarter: Math.floor(n(o.maxPerQuarter, 0)),
    downside: n(o.downside, 70, 0, 100),
  };
}

export function showCost(s) {
  return s.booth + s.travel + s.staffCount * s.staffDays * s.staffDayCost + s.swag;
}

// Funnel economics of one show. `leadFactor` scales the lead count (downside re-check).
export function showEconomics(s, o, leadFactor = 1) {
  const cost = showCost(s);
  const leads = s.leads * leadFactor;
  const qualified = leads * o.leadQual / 100;
  const deals = qualified * o.close / 100;
  const grossProfit = deals * o.dealValue * o.ltv * o.margin / 100;
  const net = grossProfit - cost;
  return {
    cost, leads, qualified, deals, grossProfit, net,
    roi: cost > 0 ? net / cost * 100 : Infinity,
    costPerLead: leads > 0 ? cost / leads : Infinity,
    costPerQualified: qualified > 0 ? cost / qualified : Infinity,
  };
}

// What would have to be true for the show to pay for itself, all else held.
export function breakEven(s, o) {
  const cost = showCost(s);
  const perDeal = o.dealValue * o.ltv * o.margin / 100;
  const perLead = o.leadQual / 100 * o.close / 100 * perDeal;
  const dealsNeeded = perDeal > 0 ? cost / perDeal : Infinity;
  const closeNeeded = s.leads * o.leadQual / 100 * perDeal > 0 ? cost / (s.leads * o.leadQual / 100 * perDeal) * 100 : Infinity;
  return {
    leads: perLead > 0 ? cost / perLead : Infinity,
    closeRate: closeNeeded,
    deals: dealsNeeded,
  };
}

// Exact best subset: branch-and-bound over shows with positive net, ordered by
// net per dollar, bounded by the fractional-knapsack relaxation of the budget
// (the quarter cap only tightens, so the bound stays valid). `forced` is a
// show that must be in the set; returns null if it cannot fit.
function solve(shows, nets, costs, o, forced = -1) {
  const budget = o.budget > 0 ? o.budget : Infinity;
  const picked = [];
  const qCount = new Map();
  let spend = 0;
  let base = 0;
  if (forced >= 0) {
    if (costs[forced] > budget + 1e-9) return null;
    if (o.maxPerQuarter < 0) return null;
    picked.push(forced);
    spend = costs[forced];
    base = nets[forced];
    qCount.set(shows[forced].quarter, 1);
  }
  const cand = shows.map((s) => s.id).filter((id) => id !== forced && nets[id] > 0);
  const ratio = (id) => (costs[id] > 0 ? nets[id] / costs[id] : Infinity);
  cand.sort((a, b) => (ratio(b) === ratio(a) ? nets[b] - nets[a] : ratio(b) - ratio(a)));
  const k = cand.length;
  let best = base;
  let bestSet = [...picked];
  const bound = (p, total, room) => {
    let b = total;
    let r = room;
    for (let q = p; q < k; q += 1) {
      const id = cand[q];
      if (costs[id] <= r) { b += nets[id]; r -= costs[id]; } else { b += costs[id] > 0 ? nets[id] * (r / costs[id]) : 0; break; }
    }
    return b;
  };
  const walk = (p, total) => {
    if (total > best + 1e-9) { best = total; bestSet = [...picked]; }
    if (p === k || bound(p, total, budget - spend) <= best + 1e-9) return;
    const id = cand[p];
    const qn = qCount.get(shows[id].quarter) || 0;
    if (spend + costs[id] <= budget + 1e-9 && (o.maxPerQuarter === 0 || qn < o.maxPerQuarter)) {
      picked.push(id);
      qCount.set(shows[id].quarter, qn + 1);
      spend += costs[id];
      walk(p + 1, total + nets[id]);
      spend -= costs[id];
      qCount.set(shows[id].quarter, qn);
      picked.pop();
    }
    walk(p + 1, total);
  };
  walk(0, base);
  return { total: best, chosen: bestSet.sort((a, b) => a - b) };
}

// Accept shows in the given order while they fit the budget and quarter cap, whether or not they are profitable.
function greedy(shows, order, costs, o) {
  const budget = o.budget > 0 ? o.budget : Infinity;
  const picked = [];
  const qCount = new Map();
  let spend = 0;
  for (const id of order) {
    const qn = qCount.get(shows[id].quarter) || 0;
    if (spend + costs[id] > budget + 1e-9) continue;
    if (o.maxPerQuarter > 0 && qn >= o.maxPerQuarter) continue;
    picked.push(id);
    spend += costs[id];
    qCount.set(shows[id].quarter, qn + 1);
  }
  return picked;
}

const sum = (ids, arr) => ids.reduce((s, id) => s + arr[id], 0);

export function plan(parsed, options = {}) {
  const o = readOptions(options);
  const shows = parsed.shows;
  if (shows.length > MAX_SHOWS) throw new Error(`${shows.length} shows listed; the exact search handles up to ${MAX_SHOWS}. Split the list by half-year.`);
  const eco = shows.map((s) => showEconomics(s, o));
  const down = shows.map((s) => showEconomics(s, o, o.downside / 100));
  const nets = eco.map((e) => e.net);
  const downNets = down.map((e) => e.net);
  const costs = eco.map((e) => e.cost);

  const ranked = shows.map((s) => ({
    ...s, ...eco[s.id], downsideNet: downNets[s.id], breakEven: breakEven(s, o),
    closeBy: isoDay(s.day + Math.round(o.cycleMonths * 30.4375)),
  })).sort((a, b) => (b.roi === a.roi ? b.net - a.net : b.roi - a.roi))
    .map((r, i) => ({ ...r, rank: i + 1 }));

  const best = solve(shows, nets, costs, o);
  const chosenSet = new Set(best.chosen);
  const rankOf = new Map(ranked.map((r) => [r.id, r]));
  const chosen = best.chosen.map((id) => rankOf.get(id)).sort((a, b) => a.day - b.day);

  const skipped = shows.filter((s) => !chosenSet.has(s.id)).map((s) => {
    const r = rankOf.get(s.id);
    const forced = solve(shows, nets, costs, o, s.id);
    const shortfall = forced ? Math.max(0, best.total - forced.total) : null;
    let reason;
    if (r.net <= 0) {
      const need = r.breakEven.leads;
      reason = `loses ${money(-r.net)} at your expected leads; needs ${Number.isFinite(need) ? `${Math.ceil(need)} leads` : "more leads than any show gives"} to break even (you listed ${s.leads})`;
    } else if (!forced) {
      reason = `costs ${money(r.cost)}, more than the whole ${money(o.budget)} budget`;
    } else {
      reason = `profitable alone (${money(r.net)}) but the budget${o.maxPerQuarter > 0 ? " and quarter limit leave" : " leaves"} no room without dropping better shows; swapping it in would cost ${money(shortfall)}`;
    }
    return { ...r, shortfall, reason, forcedPlan: forced ? forced.total : null };
  }).sort((a, b) => a.day - b.day);

  const every = shows.map((s) => s.id);
  const cheapest = [...every].sort((a, b) => costs[a] - costs[b]);
  const spendOf = (ids) => sum(ids, costs);
  const everyNet = sum(every, nets);
  const cheapIds = greedy(shows, cheapest, costs, o);
  const totals = {
    plan: best.total,
    planSpend: spendOf(best.chosen),
    everyShow: everyNet,
    everyShowSpend: spendOf(every),
    everyShowWithinBudget: o.budget === 0 || spendOf(every) <= o.budget + 1e-9,
    cheapestFirst: sum(cheapIds, nets),
    cheapestFirstSpend: spendOf(cheapIds),
    downsidePlan: sum(best.chosen, downNets),
  };
  const downBest = solve(shows, downNets, costs, o);
  totals.bestAtDownside = downBest.total;
  totals.upliftVsEveryShow = best.total - totals.everyShow;
  totals.upliftVsCheapestFirst = best.total - totals.cheapestFirst;
  totals.planRoi = totals.planSpend > 0 ? best.total / totals.planSpend * 100 : null;

  const findings = [];
  for (const r of ranked.filter((x) => x.net < 0)) {
    findings.push({ severity: "warn", rule: "loses-money", message: `${r.name} loses ${money(-r.net)} at ${r.leads} expected leads. It would need ${Number.isFinite(r.breakEven.leads) ? Math.ceil(r.breakEven.leads) : "more than any number of"} leads (or a ${pct(r.breakEven.closeRate, 1)} close rate, or ${r.breakEven.deals.toFixed(1)} deals) to break even.` });
  }
  const losers = chosen.filter((c) => c.downsideNet < 0);
  if (losers.length) {
    findings.push({ severity: "warn", rule: "downside-loss", message: `With leads at ${o.downside}% of your estimate, ${losers.map((l) => `${l.name} (${money(l.downsideNet)})`).join(", ")} would lose money.` });
  }
  const sameAtDown = best.chosen.length === downBest.chosen.length && best.chosen.every((id) => downBest.chosen.includes(id));
  if (!sameAtDown && chosen.length) {
    findings.push({ severity: "info", rule: "plan-flips", message: `If leads come in at ${o.downside}% of your estimates, a different set of shows is best (${money(downBest.total)} vs ${money(totals.downsidePlan)} for this plan), so the lead counts matter more than the fees.` });
  }
  const late = chosen.filter((c) => c.day + Math.round(o.cycleMonths * 30.4375) > chosen.reduce((m, x) => Math.max(m, x.day), 0) + 365);
  if (late.length && o.cycleMonths > 0) {
    findings.push({ severity: "info", rule: "sales-cycle", message: `With a ${o.cycleMonths}-month sales cycle, deals from ${late.map((l) => l.name).join(", ")} close after the year ends; the yearly budget pays for them before the revenue arrives.` });
  }
  if (o.budget > 0 && totals.planSpend < o.budget * 0.5 && chosen.length) {
    findings.push({ severity: "info", rule: "budget-unused", message: `The plan spends ${money(totals.planSpend)} of your ${money(o.budget)} budget; the rest would only buy shows that lose money at these numbers.` });
  }
  return { options: o, ranked, chosen, skipped, totals, findings, downsideChosen: downBest.chosen.map((id) => shows[id].name) };
}

export function summarize(p) {
  if (!p.chosen.length) {
    return { status: "none", text: "No show pays back at these numbers: each one loses money or does not fit the budget." };
  }
  const t = p.totals;
  const everyFair = t.everyShowWithinBudget && t.upliftVsEveryShow > 0.005;
  const text = `Buy ${p.chosen.length} of ${p.ranked.length} shows: spend ${money(t.planSpend)} for ${money(t.plan)} expected net gain` +
    (everyFair ? `, ${money(t.upliftVsEveryShow)} more than going to every show.`
      : t.upliftVsCheapestFirst > 0.005 ? `, ${money(t.upliftVsCheapestFirst)} more than buying the cheapest shows first.` : ".");
  return { status: everyFair || t.upliftVsCheapestFirst > 0.005 ? "gain" : "ok", text };
}
