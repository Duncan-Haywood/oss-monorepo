// Weekly route planner: the page-facing layer over weekly.mjs. Reads a
// customer list (visits a week, allowed days, current days), builds the
// travel model shared with the daily tool (calc.mjs), plans the week, and,
// when every customer has its current days, plans the same week with those
// days kept so the saving from moving days is measured on one model.

import { buildMatrices, num } from "./calc.mjs";
import { DAY_NAMES, patternsFor, planWeek, verifyWeek } from "./weekly.mjs";
import { rng } from "./vrptw.mjs";

export const MAX_CUSTOMERS = 300;
const isNum = (s) => s !== undefined && s !== "" && Number.isFinite(Number(s));
const splitLine = (line) => {
  const d = line.includes("\t") ? "\t" : line.includes(";") ? ";" : ",";
  return line.split(d).map((x) => x.trim().replace(/^"|"$/g, ""));
};

// "Mon|Thu", "mon thu", "M/W/F", "Mon-Fri", "any", "" -> calendar days 0..6,
// or null for "any", or NaN when unreadable.
const ALIASES = { m: 0, mo: 0, mon: 0, monday: 0, t: 1, tu: 1, tue: 1, tues: 1, tuesday: 1, w: 2, we: 2, wed: 2, wednesday: 2,
  th: 3, r: 3, thu: 3, thur: 3, thurs: 3, thursday: 3, f: 4, fr: 4, fri: 4, friday: 4, sa: 5, sat: 5, saturday: 5, su: 6, sun: 6, sunday: 6 };
export function parseDays(s) {
  const t = String(s ?? "").trim().toLowerCase();
  if (t === "" || t === "any" || t === "*") return null;
  const out = new Set();
  for (const part of t.split(/[|/ +&]+|,(?=\s*[a-z])/).filter(Boolean)) {
    const range = part.match(/^([a-z]+)-([a-z]+)$/);
    if (range) {
      const a = ALIASES[range[1]], b = ALIASES[range[2]];
      if (a === undefined || b === undefined) return NaN;
      for (let d = a; ; d = (d + 1) % 7) { out.add(d); if (d === b) break; }
    } else if (ALIASES[part] !== undefined) out.add(ALIASES[part]);
    else return NaN;
  }
  return [...out].sort((a, b) => a - b);
}

// Rows: name, lat, lng [, service_min [, visits_per_week [, allowed_days [, current_days]]]]
export function parseCustomers(text) {
  const lines = String(text || "").split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  const customers = [], errors = [];
  lines.forEach((line, i) => {
    const f = splitLine(line);
    let o = 0, name = "";
    if (!(isNum(f[0]) && isNum(f[1]))) {
      if (isNum(f[1]) && isNum(f[2])) { name = f[0]; o = 1; }
      else if (i === 0) return; // header
      else { errors.push(`Line ${i + 1}: could not find a latitude and longitude.`); return; }
    }
    const lat = Number(f[o]), lng = Number(f[o + 1]);
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) { errors.push(`Line ${i + 1}: latitude must be within ±90 and longitude within ±180.`); return; }
    const service = f[o + 2] === undefined || f[o + 2] === "" ? 0 : Number(f[o + 2]);
    if (!Number.isFinite(service) || service < 0) { errors.push(`Line ${i + 1}: service minutes must be 0 or more.`); return; }
    const freq = f[o + 3] === undefined || f[o + 3] === "" ? 1 : Number(f[o + 3]);
    if (!Number.isInteger(freq) || freq < 1 || freq > 7) { errors.push(`Line ${i + 1}: visits a week must be a whole number from 1 to 7.`); return; }
    const allowed = parseDays(f[o + 4]);
    if (Number.isNaN(allowed)) { errors.push(`Line ${i + 1}: could not read the allowed days "${f[o + 4]}" (try Mon|Thu or Mon-Fri).`); return; }
    const current = f[o + 5] === undefined || f[o + 5] === "" ? null : parseDays(f[o + 5]);
    if (Number.isNaN(current)) { errors.push(`Line ${i + 1}: could not read the current days "${f[o + 5]}".`); return; }
    customers.push({ name: name || `Customer ${customers.length + 1}`, lat, lng, service, freq, allowed, current, line: i + 1 });
  });
  if (errors.length) return { error: errors.slice(0, 5).join(" ") + (errors.length > 5 ? ` (${errors.length - 5} more)` : "") };
  if (!customers.length) return { error: "No customers found. Paste one per row: name, latitude, longitude, service minutes, visits a week." };
  if (customers.length > MAX_CUSTOMERS) return { error: `Up to ${MAX_CUSTOMERS} customers at a time in the browser.` };
  return { customers };
}

const clamp = (x, lo, hi, d) => (Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d);

export function planWeekFor(input, raw = {}) {
  const { depot, customers } = input;
  const o = {
    workdays: Array.isArray(raw.workdays) && raw.workdays.length ? [...new Set(raw.workdays)].sort((a, b) => a - b) : [0, 1, 2, 3, 4],
    vehicles: Math.round(clamp(raw.vehicles, 1, 20, 1)),
    shiftHours: clamp(raw.shiftHours, 1, 24, 8),
    circuity: clamp(raw.circuity, 1, 3, 1.3),
    mph: clamp(raw.mph, 3, 80, 30),
    mpg: clamp(raw.mpg, 0, 200, 20),
    fuelPrice: clamp(raw.fuelPrice, 0, 50, 3.8),
    wage: clamp(raw.wage, 0, 1000, 25),
    weeksPerYear: clamp(raw.weeksPerYear, 0, 53, 50),
    movePenalty: clamp(raw.movePenalty, 0, 10000, 10),
    iterations: raw.iterations,
    seed: raw.seed ?? 1,
  };
  const D = o.workdays.length;
  const dayOf = new Map(o.workdays.map((cal, d) => [cal, d]));
  const nodes = [depot, ...customers];
  const n = customers.length;
  const { miles, mins } = buildMatrices(nodes, o.circuity, o.mph);
  const warnings = [];
  const patterns = [[]];
  const current = [-1];
  let haveCurrent = true;
  for (const c of customers) {
    const allowedCal = c.allowed === null ? o.workdays : c.allowed.filter((d) => dayOf.has(d));
    const allowed = allowedCal.map((d) => dayOf.get(d));
    const p = patternsFor(c.freq, allowed, o.workdays);
    if (!p.length) return { error: `${c.name} (line ${c.line}) needs ${c.freq} visit${c.freq === 1 ? "" : "s"} a week but has ${allowed.length} allowed working day${allowed.length === 1 ? "" : "s"}.` };
    patterns.push(p);
    if (c.current === null) { haveCurrent = false; current.push(-1); continue; }
    const cur = c.current.map((d) => dayOf.get(d));
    const key = cur.slice().sort((a, b) => a - b).join(",");
    let idx = cur.includes(undefined) ? -1 : p.findIndex((q) => q.join(",") === key);
    if (idx < 0 && !cur.includes(undefined) && cur.length === c.freq) { p.push(cur.slice().sort((a, b) => a - b)); idx = p.length - 1; }
    if (idx < 0) { warnings.push(`${c.name}: current days ${c.current.map((d) => DAY_NAMES[d]).join("+")} do not fit its visits a week or the working days, so it has no current schedule to compare.`); haveCurrent = false; }
    current.push(idx);
  }
  const inst = { n, dist: mins, service: nodes.map((x) => x.service), days: D, vehicles: o.vehicles, maxMinutes: o.shiftHours * 60, patterns,
    current: current.some((x) => x >= 0) ? current : null, movePenalty: o.movePenalty };
  const iterations = o.iterations ?? Math.min(20000, 3000 + 120 * n);
  const plan = planWeek(inst, { seed: o.seed, iterations });
  const bad = verifyWeek(inst, plan);
  if (bad) return { error: `Internal check failed: ${bad}` };
  let kept = null;
  if (haveCurrent && n) {
    const fixed = { ...inst, patterns: patterns.map((p, c) => (c === 0 ? p : [p[current[c]]])), current: null };
    kept = planWeek(fixed, { seed: o.seed, iterations });
    kept.pattern = kept.pattern.map((x, c) => (c === 0 ? -1 : current[c]));
  }
  const cost = (p) => {
    let mi = 0;
    for (const day of p.routes) for (const r of day) { let prev = 0; for (const c of r) { mi += miles[prev][c]; prev = c; } if (r.length) mi += miles[prev][0]; }
    const hours = (p.travel + p.service) / 60;
    const money = (o.mpg > 0 ? (mi / o.mpg) * o.fuelPrice : 0) + hours * o.wage;
    return { miles: mi, driveHours: p.travel / 60, hours, overtimeHours: p.overtime / 60, money };
  };
  const best = { ...plan, ...cost(plan) };
  const current0 = kept ? { ...kept, ...cost(kept) } : null;
  const moves = [];
  if (inst.current) for (let c = 1; c <= n; c++) {
    if (current[c] >= 0 && plan.pattern[c] !== current[c]) moves.push({ node: c, from: patterns[c][current[c]].map((d) => o.workdays[d]), to: patterns[c][plan.pattern[c]].map((d) => o.workdays[d]) });
  }
  if (best.overtime > 0.5) warnings.push(`The plan still runs ${num(best.overtimeHours, 1)} hours over the ${num(o.shiftHours, 1)}-hour shift across the week: add a driver or a working day, or shorten service times.`);
  const save = current0 ? {
    miles: current0.miles - best.miles, hours: current0.hours - best.hours, money: current0.money - best.money,
    year: (current0.money - best.money) * o.weeksPerYear,
  } : null;
  return { options: o, nodes, days: o.workdays, best, current: current0, moves, save, warnings, patterns };
}

export function weekMapsLink(result, d, k) {
  const r = result.best.routes[d][k];
  const pt = (i) => `${result.nodes[i].lat},${result.nodes[i].lng}`;
  const seq = [0, ...r, 0];
  const links = [];
  for (let i = 0; i < seq.length - 1; i += 9) {
    const part = seq.slice(i, Math.min(seq.length, i + 10));
    if (part.length < 2) break;
    const via = part.slice(1, -1).map(pt).join("|");
    links.push(`https://www.google.com/maps/dir/?api=1&origin=${pt(part[0])}&destination=${pt(part[part.length - 1])}${via ? `&waypoints=${via}` : ""}&travelmode=driving`);
    if (part.length < 10) break;
  }
  return links;
}

export function weekCsv(result) {
  const q = (s) => { let v = String(s); if (/^[=+\-@\t\r]/.test(v) && !/^-?\d[\d,.]*$/.test(v)) v = "'" + v; return `"${v.replace(/"/g, '""')}"`; }; // formula injection guard (CWE-1236)
  const rows = [["day", "driver", "order", "customer", "latitude", "longitude", "service_min", "visits_per_week", "days", "was"]];
  result.best.routes.forEach((day, d) => day.forEach((r, k) => r.forEach((c, i) => {
    const s = result.nodes[c];
    const days = result.patterns[c][result.best.pattern[c]].map((x) => DAY_NAMES[result.days[x]]).join("|");
    const was = s.current ? s.current.map((x) => DAY_NAMES[x]).join("|") : "";
    rows.push([DAY_NAMES[result.days[d]], k + 1, i + 1, q(s.name), s.lat, s.lng, s.service, s.freq, days, was]);
  })));
  return rows.map((r) => r.join(",")).join("\n") + "\n";
}

// Invented pool-service book around Denver: 48 customers, a quarter twice a
// week, current days dealt out the way books grow (whatever day had room
// when the customer signed up), so the sample shows what re-zoning saves.
export function weekSampleText() {
  const r = rng(2026);
  const rows = ["name,lat,lng,service_min,visits_per_week,allowed_days,current_days"];
  const streets = ["Aspen", "Birch", "Cedar", "Dahlia", "Elm", "Fir", "Glen", "Holly", "Iris", "Juniper", "Kale", "Larch"];
  for (let i = 0; i < 48; i++) {
    const lat = (39.62 + r() * 0.22).toFixed(4), lng = (-105.1 + r() * 0.3).toFixed(4);
    const twice = i % 4 === 0;
    const allowed = i % 11 === 3 ? "Mon|Tue|Wed" : i % 13 === 5 ? "Thu|Fri" : "";
    let cur;
    if (twice) cur = ["Mon|Thu", "Tue|Fri"][Math.floor(r() * 2)];
    else if (allowed === "Mon|Tue|Wed") cur = ["Mon", "Tue", "Wed"][Math.floor(r() * 3)];
    else if (allowed === "Thu|Fri") cur = ["Thu", "Fri"][Math.floor(r() * 2)];
    else cur = ["Mon", "Tue", "Wed", "Thu", "Fri"][Math.floor(r() * 5)];
    rows.push(`${streets[i % 12]} ${100 + i * 7} pool,${lat},${lng},${20 + Math.floor(r() * 4) * 5},${twice ? 2 : 1},${allowed},${cur}`);
  }
  return rows.join("\n");
}
export const weekSampleDepot = "39.7420,-104.9850";
