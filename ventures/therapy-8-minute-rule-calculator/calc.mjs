// Therapy billing units under the Medicare 8-minute rule: total the timed minutes in a visit, convert to units, hand the units to
// the codes, and compare with the per-code "midpoint" count that some payers use. Arithmetic on the minutes and rates the user
// types; the code list and thresholds are the published CMS ones, but every payer decides its own rule.

export const TIMED = {
  97032: "Electrical stimulation, attended", 97033: "Iontophoresis", 97034: "Contrast baths", 97035: "Ultrasound",
  97036: "Hubbard tank", 97110: "Therapeutic exercise", 97112: "Neuromuscular re-education", 97113: "Aquatic therapy",
  97116: "Gait training", 97124: "Massage", 97140: "Manual therapy", 97530: "Therapeutic activities",
  97533: "Sensory integrative techniques", 97535: "Self-care / home management training", 97537: "Community / work reintegration",
  97542: "Wheelchair management", 97750: "Physical performance test", 97755: "Assistive technology assessment",
  97760: "Orthotic management and training", 97761: "Prosthetic training", 97763: "Orthotic / prosthetic checkout",
};
export const UNTIMED = new Set([
  "97010", "97012", "97014", "97016", "97018", "97022", "97024", "97026", "97028", "97039", "97150", "97161", "97162", "97163",
  "97164", "97165", "97166", "97167", "97168", "G0283", "97597", "97598",
]);

export const SHARED_DEFAULTS = { visits: "", rates: "", defaultRate: "" };
export const EXAMPLE_SHARED = {
  visits: [
    "Visit A", "97110 23", "97140 15", "97530 8", "97014 15", "",
    "Visit B", "97110 10", "97112 10", "97140 10", "",
    "Visit C", "97140 7", "97530 7", "",
    "Visit D", "97110 38", "97035 8", "97161 30", "",
    "Visit E", "97110 20", "97140 15",
  ].join("\n"),
  rates: "97110=31.20\n97140=28.40\n97530=34.10\n97112=33.50\n97035=14.80",
  defaultRate: "28",
};

export const money = (n) => (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
export const money2 = (n) => (n < 0 ? "-$" : "$") + Math.abs(n).toFixed(2);

const num = (t) => {
  const s = String(t ?? "").replace(/[$\s,]/g, "");
  if (s === "") return null;
  const v = Number(s);
  return Number.isFinite(v) ? v : NaN;
};

// CMS: 8-22 min = 1 unit, 23-37 = 2, 38-52 = 3, ... fewer than 8 total timed minutes = none.
export const unitsFromTotal = (min) => (min < 8 ? 0 : Math.floor((min + 7) / 15));
// Per-code count: a full unit for each 15 minutes and one more when the remainder reaches 8.
export const unitsPerCode = (min) => Math.floor(min / 15) + (min % 15 >= 8 ? 1 : 0);

// Whole 15-minute blocks go to the code that earned them; the units left go to the codes with the most minutes left over.
export function allocate(entries) {
  const total = entries.reduce((s, e) => s + e.minutes, 0);
  const n = unitsFromTotal(total);
  const out = entries.map((e) => ({ ...e, units: Math.floor(e.minutes / 15), rem: e.minutes % 15 }));
  let left = n - out.reduce((s, e) => s + e.units, 0);
  const order = out.map((e, i) => i).sort((a, b) => out[b].rem - out[a].rem || a - b);
  for (const i of order) {
    if (left <= 0) break;
    if (out[i].rem > 0) { out[i].units += 1; left -= 1; }
  }
  return { total, units: n, lines: out };
}

export function parseVisits(text) {
  const visits = [];
  const warnings = [];
  let cur = null;
  const flush = () => { if (cur && (cur.entries.length || cur.untimed.length)) visits.push(cur); cur = null; };
  String(text ?? "").split(/\r?\n/).forEach((raw, ln) => {
    const line = raw.trim();
    if (line === "" || /^-{3,}$/.test(line)) { flush(); return; }
    const m = line.match(/^([A-Za-z]?\d{4,5}[A-Za-z]?)(?:[ \t:,=x-]+)(\d+(?:\.\d+)?)\s*(?:min(?:ute)?s?)?$/i);
    if (!cur) cur = { name: "", entries: [], untimed: [] };
    if (!m) {
      if (cur.entries.length === 0 && cur.untimed.length === 0 && !cur.name) cur.name = line;
      else warnings.push(`Line ${ln + 1} ("${line}") is not "code minutes", so it was skipped.`);
      return;
    }
    const code = m[1].toUpperCase();
    const minutes = Number(m[2]);
    if (UNTIMED.has(code)) { cur.untimed.push({ code, minutes }); return; }
    if (!(code in TIMED)) { warnings.push(`${code} is not on the timed-code list, so its ${minutes} minutes were left out. Add it only if your payer treats it as timed.`); return; }
    const prior = cur.entries.find((e) => e.code === code);
    if (prior) prior.minutes += minutes; else cur.entries.push({ code, minutes });
  });
  flush();
  visits.forEach((v, i) => { if (!v.name) v.name = `Visit ${i + 1}`; });
  return { visits, warnings };
}

export function parseRates(text, warnings) {
  const rates = {};
  for (const raw of String(text ?? "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^([A-Za-z]?\d{4,5}[A-Za-z]?)\s*[=:\s]\s*\$?(\d+(?:\.\d+)?)$/);
    if (!m) { warnings.push(`Rate line "${line}" is not "code=amount", so it was skipped.`); continue; }
    rates[m[1].toUpperCase()] = Number(m[2]);
  }
  return rates;
}

export function analyze(inputs) {
  const { visits, warnings } = parseVisits(inputs.visits);
  const rates = parseRates(inputs.rates, warnings);
  const def = num(inputs.defaultRate);
  if (Number.isNaN(def) || (def != null && def < 0)) warnings.push("Default allowed amount per unit must be a non-negative number.");
  const fallback = def != null && !Number.isNaN(def) && def >= 0 ? def : 0;
  if (visits.length === 0) return { ok: false, warnings: [...warnings, "Enter at least one visit with timed codes, for example 97110 23."] };
  const rateFor = (code) => (code in rates ? rates[code] : fallback);
  const rows = visits.map((v) => {
    const a = allocate(v.entries);
    const perCodeUnits = v.entries.reduce((s, e) => s + unitsPerCode(e.minutes), 0);
    const lines = a.lines.map((l) => ({ code: l.code, minutes: l.minutes, units: l.units, perCode: unitsPerCode(l.minutes), rate: rateFor(l.code), name: TIMED[l.code] }));
    const revenue = lines.reduce((s, l) => s + l.units * l.rate, 0);
    const revenuePerCode = lines.reduce((s, l) => s + l.perCode * l.rate, 0);
    const toNext = a.total < 8 ? 8 - a.total : 15 * a.units + 8 - a.total;
    return {
      name: v.name, total: a.total, units: a.units, perCodeUnits, over: Math.max(0, perCodeUnits - a.units), lines,
      untimedMinutes: v.untimed.reduce((s, u) => s + u.minutes, 0), revenue, revenuePerCode, minutesToNextUnit: toNext,
      // A visit sitting 1-3 minutes under a unit boundary is the cheapest place to find revenue.
      nearMiss: a.total > 0 && toNext <= 3,
    };
  });
  const sum = (f) => rows.reduce((s, r) => s + f(r), 0);
  return {
    ok: true, warnings, rows,
    totals: { visits: rows.length, units: sum((r) => r.units), perCodeUnits: sum((r) => r.perCodeUnits), revenue: sum((r) => r.revenue), revenuePerCode: sum((r) => r.revenuePerCode), over: sum((r) => r.over), nearMisses: rows.filter((r) => r.nearMiss).length },
  };
}

export function toCsv(a) {
  const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
  const lines = [["visit", "code", "minutes", "cms_units", "per_code_units", "rate", "cms_amount"].join(",")];
  for (const r of a.rows) for (const l of r.lines) lines.push([q(r.name), l.code, l.minutes, l.units, l.perCode, l.rate, (l.units * l.rate).toFixed(2)].join(","));
  return lines.join("\n") + "\n";
}
