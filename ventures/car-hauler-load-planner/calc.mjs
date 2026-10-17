// Car hauler load planner: given a dispatch-board shortlist of vehicles along one route (each with a pickup mile and a drop
// mile), a two-deck trailer and a legal payload, choose which vehicles to carry and which deck each rides on so the net
// money is highest. A vehicle holds its deck from its pickup mile until its drop mile (half-open: a car dropped at mile m
// frees its space for one picked up at m). At every pickup mile, on each deck, the vehicle lengths plus the gaps between
// them must fit the deck, the total weight must fit the payload, the upper deck must stay under its weight cap, and
// vehicles over the heavy limit ride the lower deck only. Each vehicle keeps its deck for the whole trip (no reshuffling).
// Exact branch and bound with an area-time and a weight-time fractional-knapsack bound; if the node budget runs out the
// answer is reported as best found, not proven.
//
// Also reports, per offer, the lowest pay worth taking (walk-away price) by re-solving with that offer forced in or banned.

export const MAX_OFFERS = 24;
export const MAIN_NODES = 3_000_000;
export const SENS_NODES = 300_000;

export const CLASSES = {
  compact: { len: 172, wt: 2900 },
  sedan: { len: 193, wt: 3600 },
  suv: { len: 197, wt: 4700 },
  pickup: { len: 232, wt: 5500 },
  van: { len: 236, wt: 5600 },
  hdpickup: { len: 262, wt: 7600 },
};
const ALIASES = { car: "sedan", crossover: "suv", truck: "pickup", minivan: "van", hd: "hdpickup", dually: "hdpickup", "hd pickup": "hdpickup", "hd-pickup": "hdpickup" };

export const SHARED_DEFAULTS = { lowerFt: "", upperFt: "", payloadLb: "", upperMaxLb: "", heavyLb: "", spacingIn: "", costPerMile: "", handling: "", offers: "" };
export const EXAMPLE_SHARED = {
  lowerFt: "46", upperFt: "46", payloadLb: "44000", upperMaxLb: "20000", heavyLb: "6500", spacingIn: "6", costPerMile: "2.10", handling: "20",
  offers: [
    "label, type or length (in), weight (lb), pay, pickup mile, drop mile, detour miles",
    "Camry A, sedan, , 650, 0, 480",
    "RAV4 B, suv, , 700, 0, 520",
    "F-150 C, pickup, , 850, 0, 1100",
    "Civic D, compact, , 600, 0, 300",
    "Silverado 2500 E, hdpickup, , 1000, 0, 900, 15",
    "Odyssey F, van, , 740, 40, 700",
    "Model 3 G, sedan, 4050, 780, 60, 1200",
    "Tahoe H, suv, 5600, 900, 120, 1200, 8",
    "Corolla I, sedan, , 420, 200, 480",
    "Mustang J, 188, 3700, 560, 300, 1000",
    "Tacoma K, pickup, , 640, 480, 1200",
    "Accord L, sedan, , 380, 500, 1000",
    "Sprinter M, 280, 6300, 1150, 150, 1200, 25",
    "Bronco N, suv, , 760, 520, 1200",
    "Fit O, compact, , 300, 600, 1200",
    "Ram 3500 P, hdpickup, , 1250, 0, 1200, 40",
    "Altima Q, sedan, , 540, 90, 760",
    "Highlander R, suv, , 610, 330, 1050",
  ].join("\n"),
};

export const money = (n) => (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: n % 1 === 0 ? 0 : 2 });

const num = (t) => (t == null || String(t).trim() === "" ? NaN : Number(String(t).replace(/[$,\s]/g, "")));

function readNumber(text, label, { min, max, def, warnings }) {
  const s = String(text ?? "").trim();
  if (s === "") {
    if (def === undefined) { warnings.push(`${label} is required.`); return null; }
    return def;
  }
  const v = num(s);
  if (!Number.isFinite(v) || v < min || v > max) { warnings.push(`${label}: "${s}" is not a number from ${min} to ${max}.`); return null; }
  return v;
}

export function parseTrailer(shared, warnings = []) {
  const before = warnings.length;
  const t = {
    lowerIn: readNumber(shared.lowerFt, "Lower deck length (ft)", { min: 5, max: 90, warnings }),
    upperIn: readNumber(shared.upperFt, "Upper deck length (ft)", { min: 0, max: 90, def: 0, warnings }),
    payload: readNumber(shared.payloadLb, "Payload (lb)", { min: 1000, max: 120000, warnings }),
    upperMax: readNumber(shared.upperMaxLb, "Upper deck weight cap (lb)", { min: 0, max: 120000, def: null, warnings }),
    heavy: readNumber(shared.heavyLb, "Lower-deck-only weight (lb)", { min: 500, max: 120000, def: Infinity, warnings }),
    gap: readNumber(shared.spacingIn, "Gap between vehicles (in)", { min: 0, max: 60, def: 6, warnings }),
    cpm: readNumber(shared.costPerMile, "Cost per detour mile", { min: 0, max: 50, def: 0, warnings }),
    handling: readNumber(shared.handling, "Handling cost per vehicle", { min: 0, max: 5000, def: 0, warnings }),
  };
  if (warnings.length > before) return null;
  t.lowerIn *= 12;
  t.upperIn *= 12;
  if (t.upperMax === null) t.upperMax = t.payload;
  return t;
}

// One line per offer: label, type-or-length, weight, pay, pickup, drop[, detour]. The type column is a vehicle class name
// (weight may then be blank) or a length in inches (weight then required). A first line with no numbers in the pay column is a header.
export function parseOffers(text, warnings = []) {
  const offers = [];
  const lines = String(text ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let n = 0;
  for (const line of lines) {
    n++;
    const c = line.split(/[,;\t]/).map((x) => x.trim());
    if (n === 1 && !Number.isFinite(num(c[3]))) continue;
    if (c.length < 6) { warnings.push(`Line ${n}: needs label, type or length, weight, pay, pickup mile, drop mile (found ${c.length} columns).`); continue; }
    const label = c[0] || `Vehicle ${offers.length + 1}`;
    const tkey = c[1].toLowerCase().replace(/\s+/g, " ");
    const cls = CLASSES[tkey] ? tkey : CLASSES[ALIASES[tkey]] ? ALIASES[tkey] : null;
    let len, wt;
    if (cls) {
      len = CLASSES[cls].len;
      wt = c[2] === "" || c[2] === "-" ? CLASSES[cls].wt : num(c[2]);
    } else {
      len = num(c[1]);
      wt = num(c[2]);
    }
    const pay = num(c[3]), pu = num(c[4]), dr = num(c[5]);
    const detour = c[6] === undefined || c[6] === "" ? 0 : num(c[6]);
    if (!Number.isFinite(len) || len < 60 || len > 400) { warnings.push(`Line ${n} (${label}): "${c[1]}" is not a vehicle type or a length in inches (60 to 400). Types: ${Object.keys(CLASSES).join(", ")}.`); continue; }
    if (!Number.isFinite(wt) || wt < 300 || wt > 40000) { warnings.push(`Line ${n} (${label}): weight "${c[2]}" is not a weight in pounds (300 to 40000).`); continue; }
    if (![pay, pu, dr, detour].every(Number.isFinite) || pay < 0 || pu < 0 || detour < 0) { warnings.push(`Line ${n} (${label}): pay, pickup mile, drop mile and detour must be numbers, not negative.`); continue; }
    if (dr <= pu) { warnings.push(`Line ${n} (${label}): drop mile ${dr} must be after pickup mile ${pu}.`); continue; }
    offers.push({ label, len, wt, pay, pu, dr, detour });
  }
  if (offers.length > MAX_OFFERS) { warnings.push(`Only the first ${MAX_OFFERS} offers are used.`); offers.length = MAX_OFFERS; }
  return offers;
}

const netOf = (o, t) => o.pay - t.handling - o.detour * t.cpm;

// Can offer `o` ride deck `d` (0 lower, 1 upper) alongside `chosen` = [{o, d}]? Only instants inside o's interval can break.
function fits(t, chosen, o, d) {
  if (d === 1 && (t.upperIn <= 0 || o.wt > t.heavy)) return false;
  const all = [...chosen, { o, d }];
  const points = [o.pu];
  for (const c of chosen) if (c.o.pu > o.pu && c.o.pu < o.dr) points.push(c.o.pu);
  for (const m of points) {
    let len0 = 0, len1 = 0, n0 = 0, n1 = 0, wt = 0, wt1 = 0;
    for (const c of all) {
      if (c.o.pu <= m && m < c.o.dr) {
        wt += c.o.wt;
        if (c.d === 0) { len0 += c.o.len; n0++; } else { len1 += c.o.len; n1++; wt1 += c.o.wt; }
      }
    }
    if (n0 && len0 + (n0 - 1) * t.gap > t.lowerIn + 1e-9) return false;
    if (n1 && len1 + (n1 - 1) * t.gap > t.upperIn + 1e-9) return false;
    if (wt > t.payload + 1e-9 || wt1 > t.upperMax + 1e-9) return false;
  }
  return true;
}

// Exact search. opts.force = index that must be carried (its own money is left out of the value); opts.ban = index that may not be.
export function solve(t, offers, { force = -1, ban = -1, maxNodes = MAIN_NODES } = {}) {
  const n = offers.length;
  const val = offers.map((o) => netOf(o, t));
  const order = [];
  for (let i = 0; i < n; i++) if (i !== force && i !== ban && val[i] > 1e-9) order.push(i);
  order.sort((a, b) => val[b] - val[a] || a - b);
  const span = n ? Math.max(...offers.map((o) => o.dr)) - Math.min(...offers.map((o) => o.pu)) : 1;
  const capArea = (t.lowerIn + t.upperIn + (t.upperIn > 0 ? 2 : 1) * t.gap) * span;
  const capWt = t.payload * span;
  const area = (o) => (o.len + t.gap) * (o.dr - o.pu);
  const wtime = (o) => o.wt * (o.dr - o.pu);
  // suffix lists sorted by value density, for the fractional bounds
  const sufA = [], sufW = [];
  for (let k = 0; k <= order.length; k++) {
    const rest = order.slice(k);
    sufA.push(rest.slice().sort((a, b) => val[b] / area(offers[b]) - val[a] / area(offers[a])));
    sufW.push(rest.slice().sort((a, b) => val[b] / wtime(offers[b]) - val[a] / wtime(offers[a])));
  }
  const frac = (list, cap, size) => {
    let s = 0;
    for (const i of list) {
      const w = size(offers[i]);
      if (w <= cap) { s += val[i]; cap -= w; } else { s += (val[i] * cap) / w; break; }
    }
    return s;
  };
  let best = -Infinity, bestSel = null, nodes = 0, exact = true;
  const chosen = [];
  let usedA = 0, usedW = 0;
  const start = () => {
    if (force < 0) return true;
    for (const d of [0, 1]) if (fits(t, [], offers[force], d)) { chosen.push({ i: force, o: offers[force], d }); usedA += area(offers[force]); usedW += wtime(offers[force]); return true; }
    return false;
  };
  if (!start()) return { value: null, items: [], nodes: 0, exact: true, infeasible: true };
  const dfs = (k, cur) => {
    if (++nodes > maxNodes) { exact = false; return; }
    if (cur > best + 1e-9) { best = cur; bestSel = chosen.map((c) => ({ i: c.i, d: c.d })); }
    if (k >= order.length) return;
    const ub = cur + Math.min(frac(sufA[k], capArea - usedA, area), frac(sufW[k], capWt - usedW, wtime));
    if (ub <= best + 1e-9) return;
    const i = order[k], o = offers[i];
    for (const d of [0, 1]) {
      if (fits(t, chosen, o, d)) {
        chosen.push({ i, o, d }); usedA += area(o); usedW += wtime(o);
        dfs(k + 1, cur + val[i]);
        chosen.pop(); usedA -= area(o); usedW -= wtime(o);
        if (!exact && nodes > maxNodes) return;
      }
    }
    dfs(k + 1, cur);
  };
  dfs(0, 0);
  if (bestSel === null) bestSel = chosen.map((c) => ({ i: c.i, d: c.d }));
  if (best === -Infinity) best = 0;
  return { value: best, items: bestSel.sort((a, b) => a.i - b.i), nodes, exact };
}

// Reference answer by trying every subset and deck assignment. For tests on small inputs.
export function bruteForce(t, offers) {
  const n = offers.length;
  let best = 0;
  const rec = (i, chosen, cur) => {
    if (cur > best) best = cur;
    if (i >= n) return;
    rec(i + 1, chosen, cur);
    for (const d of [0, 1]) if (fits(t, chosen, offers[i], d)) rec(i + 1, [...chosen, { o: offers[i], d }], cur + netOf(offers[i], t));
  };
  rec(0, [], 0);
  return best;
}

// First-fit by money per area-mile: what a driver loading the best-paying cars first would get.
export function greedy(t, offers) {
  const idx = offers.map((o, i) => i).filter((i) => netOf(offers[i], t) > 0)
    .sort((a, b) => netOf(offers[b], t) - netOf(offers[a], t));
  const chosen = [];
  let v = 0;
  for (const i of idx) {
    for (const d of [0, 1]) if (fits(t, chosen.map((c) => ({ o: c.o, d: c.d })), offers[i], d)) { chosen.push({ i, o: offers[i], d }); v += netOf(offers[i], t); break; }
  }
  return { value: v, items: chosen.map((c) => ({ i: c.i, d: c.d })).sort((a, b) => a.i - b.i) };
}

export function timeline(t, offers, items) {
  const sel = items.map((s) => ({ o: offers[s.i], d: s.d }));
  const miles = [...new Set(sel.map((s) => s.o.pu))].sort((a, b) => a - b);
  return miles.map((m) => {
    let lo = 0, up = 0, nl = 0, nu = 0, wt = 0;
    for (const s of sel) if (s.o.pu <= m && m < s.o.dr) { wt += s.o.wt; if (s.d === 0) { lo += s.o.len; nl++; } else { up += s.o.len; nu++; } }
    const ft = (x, c) => (c ? (x + (c - 1) * t.gap) / 12 : 0);
    return { mile: m, onboard: nl + nu, lowerFt: ft(lo, nl), upperFt: ft(up, nu), weight: wt };
  });
}

export function analyze(shared) {
  const warnings = [];
  const t = parseTrailer(shared, warnings);
  const offers = parseOffers(shared.offers, warnings);
  if (!t) return { ok: false, warnings };
  if (offers.length < 2) { warnings.push("Add at least 2 offers (one vehicle per line)."); return { ok: false, warnings }; }
  const lonely = offers.map((o) => !fits(t, [], o, 0) && !fits(t, [], o, 1));
  offers.forEach((o, i) => { if (lonely[i]) warnings.push(`${o.label} cannot be carried at all: it is too long for the decks or heavier than the payload.`); });
  const usable = offers.map((o, i) => i).filter((i) => !lonely[i]);
  // Re-index so that solver indices are positions in `kept`.
  const kept = usable.map((i) => offers[i]);
  if (kept.length === 0) { warnings.push("No offer fits on this trailer."); return { ok: false, warnings }; }
  const main = solve(t, kept);
  const base = greedy(t, kept);
  const selected = new Set(main.items.map((s) => s.i));
  const deckOf = new Map(main.items.map((s) => [s.i, s.d]));
  const rows = kept.map((o, i) => {
    const net = netOf(o, t);
    let walk = null, approx = false;
    if (selected.has(i)) {
      const r = solve(t, kept, { ban: i, maxNodes: SENS_NODES });
      walk = o.pay - (main.value - r.value); // pay at which carrying it no longer beats the best plan without it
      approx = !r.exact;
    } else {
      const r = solve(t, kept, { force: i, maxNodes: SENS_NODES });
      if (r.infeasible) walk = null;
      else walk = o.pay + (main.value - (r.value + net)) ; // pay at which forcing it in ties with the best plan
      approx = !r.exact;
    }
    return { ...o, index: i, net, taken: selected.has(i), deck: deckOf.has(i) ? (deckOf.get(i) === 0 ? "Lower" : "Upper") : "", walkAway: walk, approx };
  });
  const items = main.items;
  const revenue = items.reduce((s, x) => s + kept[x.i].pay, 0);
  const tl = timeline(t, kept, items);
  const peakWt = tl.reduce((m, p) => Math.max(m, p.weight), 0);
  const peakCars = tl.reduce((m, p) => Math.max(m, p.onboard), 0);
  const miles = kept.length ? Math.max(...kept.map((o) => o.dr)) - Math.min(...kept.map((o) => o.pu)) : 0;
  return {
    ok: true, warnings, trailer: t, offers: kept, rows, exact: main.exact && rows.every((r) => !r.approx), nodes: main.nodes,
    best: { value: main.value, revenue, count: items.length, items, peakWt, peakCars, perMile: miles > 0 ? revenue / miles : 0, span: miles },
    greedy: base, timeline: tl, skipped: offers.length - kept.length,
  };
}

const csvCell = (s) => (/[",\n]/.test(String(s)) ? '"' + String(s).replace(/"/g, '""') + '"' : String(s));
export function toCsv(a) {
  const head = ["vehicle", "carried", "deck", "length_in", "weight_lb", "pay", "pickup_mile", "drop_mile", "detour_miles", "net", "lowest_pay_worth_taking"];
  const lines = [head.join(",")];
  for (const r of a.rows) lines.push([r.label, r.taken ? "yes" : "no", r.deck, r.len, r.wt, r.pay, r.pu, r.dr, r.detour, Math.round(r.net * 100) / 100, r.walkAway == null ? "" : Math.round(r.walkAway * 100) / 100].map(csvCell).join(","));
  return lines.join("\n") + "\n";
}
