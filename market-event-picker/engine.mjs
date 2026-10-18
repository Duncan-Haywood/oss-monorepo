// Market event picker: which of the markets, festivals and fairs a vendor has
// been offered (or could apply to) should they commit to for the season?
// Every event has expected sales, a booth fee (flat and/or a percentage of
// sales), travel and the crew hours it eats. Two events that overlap in time
// (setup and teardown included) cannot both be worked, and a vendor can only
// do so many a week. The set that maximises
//
//   sum over chosen events of
//     sales x (1 - cost of goods% - percentage fee%) - flat fee - travel
//       - crew rate x (event hours + setup + teardown)
//
// is found exactly by searching each connected cluster of events (events in
// the same week or overlapping in time) with branch-and-bound. That is why
// the event with the biggest sales is not always the right one: it can
// block two smaller ones that together earn more, or eat a weekly slot.
//
// Pure functions, no network, no dependencies. Dates are ISO YYYY-MM-DD,
// times are HH:MM (24h) or decimal hours.

export const MODEL_NOTE =
  "Net per event = sales x (1 - cost of goods - percentage fee) - flat fee - travel - crew cost for the hours worked. " +
  "Sales are your estimate for the event, not a forecast; the plan is the exact best answer for the numbers you supply.";

export const INPUT_NOTES = [
  { what: "Harvest Fair,2026-09-12,09:00,17:00,3200,150,0,40,Sat market", detail: "One event per row: name,date,start,end,expected sales,flat booth fee,percentage fee,travel cost[,note]. Fees and travel in dollars, percentage fee as a number (10 = 10% of sales)." },
  { what: "Dates and times", detail: "Date as ISO YYYY-MM-DD. Times as 24-hour HH:MM or decimal hours (9, 17.5). An end at or before the start means the event runs past midnight." },
  { what: "Overlap", detail: "Two events conflict if their windows overlap once setup hours before and teardown hours after are added, so back-to-back events need a travel gap." },
  { what: "Weekly limit", detail: "Optional: the most events you will work in one Monday-to-Sunday week. Zero means no limit." },
  { what: "Header row and # comments", detail: "A first row starting with name, blank lines and lines starting with # are skipped. Avoid commas inside names." },
];

const DAY = 86400000;
const MAX_CLUSTER = 24;

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

export function parseHour(text) {
  const s = String(text ?? "").trim();
  let m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (m) {
    const h = +m[1] + +m[2] / 60;
    return +m[2] < 60 && +m[1] <= 24 ? h : NaN;
  }
  if (/^\d+(\.\d+)?$/.test(s)) {
    const h = Number(s);
    return h <= 24 ? h : NaN;
  }
  return NaN;
}

export function clock(h) {
  const total = Math.round((h % 24) * 60);
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

// Monday-based week number of a day count (1970-01-01 was a Thursday).
export function weekOf(day) {
  return Math.floor((day + 3) / 7);
}

export function money(n) {
  const v = Math.round(n * 100) / 100;
  const abs = Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${v < 0 ? "-" : ""}$${abs}`;
}

function num(cell, what, where, errors, { allowEmpty = false } = {}) {
  if ((cell === undefined || cell === "") && allowEmpty) return 0;
  const v = Number(String(cell ?? "").replace(/[$%\s]/g, ""));
  if (cell === undefined || cell === "" || !Number.isFinite(v) || v < 0) {
    errors.push(`${where}: ${what} must be a number, zero or more`);
    return null;
  }
  return v;
}

export function parseEvents(text) {
  const events = [];
  const errors = [];
  String(text || "").split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const cells = line.split(",").map((c) => c.trim());
    if (/^name$/i.test(cells[0])) return;
    const where = `line ${i + 1}`;
    const name = cells[0];
    const day = dayNumber(cells[1]);
    const start = parseHour(cells[2]);
    let end = parseHour(cells[3]);
    if (!name) { errors.push(`${where}: the event needs a name`); return; }
    if (Number.isNaN(day)) { errors.push(`${where}: date must be YYYY-MM-DD (got "${cells[1] ?? ""}")`); return; }
    if (Number.isNaN(start) || Number.isNaN(end)) { errors.push(`${where}: start and end must be HH:MM or decimal hours (got "${cells[2] ?? ""}", "${cells[3] ?? ""}")`); return; }
    if (end <= start) end += 24;
    const before = errors.length;
    const sales = num(cells[4], "expected sales", where, errors);
    const flat = num(cells[5], "flat fee", where, errors, { allowEmpty: true });
    const pct = num(cells[6], "percentage fee", where, errors, { allowEmpty: true });
    const travel = num(cells[7], "travel cost", where, errors, { allowEmpty: true });
    if (errors.length > before) return;
    if (pct >= 100) { errors.push(`${where}: percentage fee must be under 100`); return; }
    events.push({
      id: events.length, name, day, week: weekOf(day), start: day * 24 + start, end: day * 24 + end,
      hours: end - start, sales, flat, pct, travel, note: cells.slice(8).join(", "), line: i + 1,
    });
  });
  return { events, errors };
}

function readOptions(o = {}) {
  const n = (v, d, lo = 0, hi = Infinity) => {
    const x = v === undefined || v === "" || v === null ? d : Number(v);
    return Number.isFinite(x) && x >= lo && x <= hi ? x : d;
  };
  return {
    cogsPct: n(o.cogsPct, 35, 0, 99),
    crewRate: n(o.crewRate, 0),
    setupHours: n(o.setupHours, 1),
    teardownHours: n(o.teardownHours, 0.5),
    maxPerWeek: Math.floor(n(o.maxPerWeek, 0)),
    downside: n(o.downside, 70, 0, 100),
  };
}

export function eventNet(e, o, salesFactor = 1) {
  const hours = e.hours + o.setupHours + o.teardownHours;
  const margin = 1 - o.cogsPct / 100 - e.pct / 100;
  return e.sales * salesFactor * margin - e.flat - e.travel - o.crewRate * hours;
}

// Sales at which the event nets zero (its break-even). Infinity if the margin per dollar of sales is not positive.
export function breakEvenSales(e, o) {
  const margin = 1 - o.cogsPct / 100 - e.pct / 100;
  const fixed = e.flat + e.travel + o.crewRate * (e.hours + o.setupHours + o.teardownHours);
  return margin > 0 ? fixed / margin : Infinity;
}

function window(e, o) {
  return [e.start - o.setupHours, e.end + o.teardownHours];
}

function conflicts(a, b, o) {
  const [s1, e1] = window(a, o);
  const [s2, e2] = window(b, o);
  return s1 < e2 && s2 < e1;
}

function clusters(events, o) {
  const parent = events.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const join = (a, b) => { parent[find(a)] = find(b); };
  for (let i = 0; i < events.length; i += 1) {
    for (let j = i + 1; j < events.length; j += 1) {
      const sameWeek = o.maxPerWeek > 0 && events[i].week === events[j].week;
      if (sameWeek || conflicts(events[i], events[j], o)) join(i, j);
    }
  }
  const groups = new Map();
  events.forEach((_, i) => {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(i);
  });
  return [...groups.values()];
}

// Exact best subset of one cluster: depth-first, include/exclude, pruned by the
// sum of the remaining positive values. `value[i]` indexes into `idx`.
function solveCluster(idx, events, value, o) {
  const k = idx.length;
  const clash = idx.map((a) => idx.map((b) => (a !== b && conflicts(events[a], events[b], o) ? 1 : 0)));
  const order = [...Array(k).keys()].sort((x, y) => value[y] - value[x]);
  const suffix = new Array(k + 1).fill(0);
  for (let p = k - 1; p >= 0; p -= 1) suffix[p] = suffix[p + 1] + Math.max(0, value[order[p]]);
  let best = 0;
  let bestSet = [];
  const picked = [];
  const weekCount = new Map();
  const walk = (p, total) => {
    if (total > best + 1e-9) { best = total; bestSet = [...picked]; }
    if (p === k || total + suffix[p] <= best + 1e-9) return;
    const i = order[p];
    if (value[i] > 0 && picked.every((q) => !clash[i][q])) {
      const w = events[idx[i]].week;
      const c = weekCount.get(w) || 0;
      if (o.maxPerWeek === 0 || c < o.maxPerWeek) {
        picked.push(i);
        weekCount.set(w, c + 1);
        walk(p + 1, total + value[i]);
        weekCount.set(w, c);
        picked.pop();
      }
    }
    walk(p + 1, total);
  };
  walk(0, 0);
  return { total: best, set: bestSet.map((i) => idx[i]) };
}

// Best plan for a given set of per-event values. Returns the chosen event ids and the total.
function solve(events, nets, o, forced = -1) {
  const chosen = [];
  let total = 0;
  for (const idx of clusters(events, o)) {
    if (idx.length > MAX_CLUSTER) {
      throw new Error(`${idx.length} events overlap or share a week; the exact search handles up to ${MAX_CLUSTER} at a time. Split the list by month.`);
    }
    const BIG = 1e9;
    const value = idx.map((id) => nets[id] + (id === forced ? BIG : 0));
    const r = solveCluster(idx, events, value, o);
    total += r.total - (r.set.includes(forced) ? BIG : 0);
    chosen.push(...r.set);
  }
  return { chosen: chosen.sort((a, b) => a - b), total };
}

function valueOf(set, nets) {
  return set.reduce((s, id) => s + nets[id], 0);
}

// Accept events in the order listed, skipping any that clash or exceed the weekly limit.
function greedy(events, order, nets, o) {
  const picked = [];
  const weekCount = new Map();
  for (const id of order) {
    if (nets[id] <= 0) continue;
    const e = events[id];
    if (picked.some((q) => conflicts(e, events[q], o))) continue;
    const c = weekCount.get(e.week) || 0;
    if (o.maxPerWeek > 0 && c >= o.maxPerWeek) continue;
    picked.push(id);
    weekCount.set(e.week, c + 1);
  }
  return picked;
}

export function plan(parsed, options = {}) {
  const o = readOptions(options);
  const events = parsed.events;
  const nets = events.map((e) => eventNet(e, o));
  const downNets = events.map((e) => eventNet(e, o, o.downside / 100));
  const best = solve(events, nets, o);
  const chosenSet = new Set(best.chosen);
  const byId = (id) => events[id];

  const chosen = best.chosen.map(byId).sort((a, b) => a.start - b.start).map((e) => ({
    ...e, net: nets[e.id], downsideNet: downNets[e.id], breakEven: breakEvenSales(e, o),
  }));

  const skipped = events.filter((e) => !chosenSet.has(e.id)).map((e) => {
    const net = nets[e.id];
    const forced = solve(events, nets, o, e.id);
    const shortfall = Math.max(0, best.total - forced.total);
    let reason;
    if (net <= 0) {
      reason = `loses ${money(-net)} even at your expected sales (needs ${Number.isFinite(breakEvenSales(e, o)) ? money(breakEvenSales(e, o)) : "more than any sales"} to break even)`;
    } else {
      const blockers = best.chosen.filter((id) => conflicts(e, events[id], o)).map(byId);
      if (blockers.length) {
        reason = `overlaps ${blockers.map((b) => `${b.name} (${money(nets[b.id])})`).join(" and ")}; swapping would cost ${money(shortfall)}`;
      } else if (o.maxPerWeek > 0) {
        reason = `the week is full at ${o.maxPerWeek} event${o.maxPerWeek === 1 ? "" : "s"} and each chosen one nets more; swapping would cost ${money(shortfall)}`;
      } else {
        reason = `swapping it in would cost ${money(shortfall)}`;
      }
    }
    return { ...e, net, shortfall, reason, breakEven: breakEvenSales(e, o), forcedPlan: forced.total };
  }).sort((a, b) => a.start - b.start);

  // Negotiable: a skipped event that is positive on its own and would win with this much off the fee.
  const negotiable = skipped.filter((s) => s.net > 0 && s.shortfall > 0 && s.shortfall < s.net * 1.5)
    .map((s) => ({ name: s.name, day: s.day, shortfall: s.shortfall, feeAsk: s.shortfall }))
    .sort((a, b) => a.shortfall - b.shortfall).slice(0, 3);

  const order = events.map((e) => e.id);
  const bySales = [...order].sort((a, b) => events[b].sales - events[a].sales);
  const totals = {
    plan: best.total,
    firstListed: valueOf(greedy(events, order, nets, o), nets),
    biggestSalesFirst: valueOf(greedy(events, bySales, nets, o), nets),
    downsidePlan: valueOf(best.chosen, downNets),
  };
  const downBest = solve(events, downNets, o);
  totals.bestAtDownside = downBest.total;
  totals.upliftVsFirstListed = best.total - totals.firstListed;
  totals.upliftVsBiggestSales = best.total - totals.biggestSalesFirst;

  const findings = [];
  const losers = chosen.filter((c) => c.downsideNet < 0);
  if (losers.length) {
    findings.push({ severity: "warn", rule: "downside-loss", message: `At ${o.downside}% of expected sales, ${losers.map((l) => `${l.name} (${money(l.downsideNet)})`).join(", ")} would lose money; break-even sales are ${losers.map((l) => `${money(l.breakEven)} for ${l.name}`).join(", ")}.` });
  }
  const sameAtDown = new Set(best.chosen).size === new Set(downBest.chosen).size && best.chosen.every((id) => downBest.chosen.includes(id));
  if (!sameAtDown && chosen.length) {
    findings.push({ severity: "info", rule: "plan-flips", message: `If sales come in at ${o.downside}% of your estimates, a different set of events is best (${money(downBest.total)} vs ${money(totals.downsidePlan)} for this plan), so the sales figures matter more than the fees.` });
  }
  if (negotiable.length) {
    findings.push({ severity: "info", rule: "negotiable", message: `A fee cut of ${negotiable.map((n) => `${money(n.feeAsk)} would make ${n.name} the better pick`).join("; ")}.` });
  }
  const weeks = new Map();
  for (const c of chosen) weeks.set(c.week, (weeks.get(c.week) || 0) + c.hours + o.setupHours + o.teardownHours);
  const heavy = [...weeks.entries()].filter(([, h]) => h > 60);
  if (heavy.length) {
    findings.push({ severity: "warn", rule: "long-week", message: `${heavy.length} week${heavy.length === 1 ? "" : "s"} in the plan run over 60 booth-and-setup hours (${heavy.map(([w, h]) => `week of ${isoDay(w * 7 - 3)}: ${Math.round(h)} h`).join(", ")}). Set a weekly limit if that is too much.` });
  }

  return { options: o, nets, chosen, skipped, totals, findings, negotiable, downsideChosen: downBest.chosen.map(byId).map((e) => e.name) };
}

export function summarize(p) {
  if (!p.chosen.length) {
    return { status: "none", text: "No event is worth working at these numbers: each one loses money or is outweighed by a better overlapping event." };
  }
  const t = p.totals;
  const more = t.upliftVsFirstListed;
  const text = `Work ${p.chosen.length} of ${p.chosen.length + p.skipped.length} events for ${money(t.plan)} net` +
    (more > 0.005 ? `, ${money(more)} more than taking events in the order listed.` : ".");
  return { status: more > 0.005 ? "gain" : "ok", text };
}
