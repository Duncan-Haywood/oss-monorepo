// Mileage log arithmetic: IRS standard-rate deduction by trip date (the 2026
// business rate changed on July 1), business / commuting / other split for
// Schedule C Part IV, and an audit-readiness check of the log itself.
// Pure functions, no DOM, no network. Not tax advice.
//
// Rates: business 2025 = 70c (Notice 2025-5); 2026 = 72.5c to Jun 30
// (Notice 2026-10) and 76c from Jul 1 (Announcement 2026-11), as recorded in
// ventures/mileage-deduction-method-calculator/calc.mjs, which verified them
// against irs.gov on 2026-09-29. Charity is a statutory 14c. Medical is
// 21c (2025) and 20.5c (2026) -- the least certain figures here, which is why
// the page lets the user override every rate.

export const CATEGORIES = ["business", "medical", "charity", "commute", "personal"];
export const DEDUCTIBLE = ["business", "medical", "charity"];

export const RATE_PERIODS = [
  { from: "2025-01-01", business: 0.70, medical: 0.21, charity: 0.14 },
  { from: "2026-01-01", business: 0.725, medical: 0.205, charity: 0.14 },
  { from: "2026-07-01", business: 0.76, medical: 0.205, charity: 0.14 },
];

// override: { business?: number, medical?: number, charity?: number } in dollars per mile.
export function rateFor(date, category, override = {}) {
  if (!DEDUCTIBLE.includes(category)) return 0;
  const o = override[category];
  if (typeof o === "number" && o >= 0) return o;
  let hit = RATE_PERIODS[0];
  for (const p of RATE_PERIODS) if (p.from <= date) hit = p;
  return hit[category];
}

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const round1 = (n) => Math.round(n * 10) / 10;
const round2 = (n) => Math.round(n * 100) / 100;

export function tripMiles(t) {
  const s = num(t.odoStart), e = num(t.odoEnd);
  if (t.odoStart !== "" && t.odoStart != null && t.odoEnd !== "" && t.odoEnd != null && e > s) return round1(e - s);
  return Math.max(0, num(t.miles));
}

const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));

// Returns { ok, errors, trip }. A business, medical or charity trip needs a
// destination and a purpose: the details a log is expected to show.
export function validateTrip(t) {
  const errors = [];
  if (!isDate(t.date)) errors.push("Enter the date of the trip.");
  if (!CATEGORIES.includes(t.category)) errors.push("Choose a category.");
  const m = tripMiles(t);
  if (!(m > 0)) errors.push("Enter the miles, or odometer start and end.");
  if (t.odoStart !== "" && t.odoEnd !== "" && t.odoStart != null && t.odoEnd != null && num(t.odoEnd) <= num(t.odoStart)) errors.push("Odometer end must be higher than odometer start.");
  if (DEDUCTIBLE.includes(t.category)) {
    if (!String(t.to || "").trim()) errors.push("Enter where you went (destination).");
    if (!String(t.purpose || "").trim()) errors.push("Enter the purpose of the trip.");
  }
  return { ok: errors.length === 0, errors };
}

export function newId() {
  return "t" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function normalizeTrip(t) {
  return {
    id: t.id || newId(),
    date: String(t.date || ""),
    category: t.category || "business",
    from: String(t.from || "").trim(),
    to: String(t.to || "").trim(),
    purpose: String(t.purpose || "").trim(),
    client: String(t.client || "").trim(),
    odoStart: t.odoStart === "" || t.odoStart == null ? "" : num(t.odoStart),
    odoEnd: t.odoEnd === "" || t.odoEnd == null ? "" : num(t.odoEnd),
    miles: num(t.miles),
    tolls: Math.max(0, num(t.tolls)),
    parking: Math.max(0, num(t.parking)),
    enteredAt: t.enteredAt || new Date().toISOString(),
    gps: Boolean(t.gps),
    vehicle: String(t.vehicle || "").trim(),
  };
}

export function summarize(trips, { year, override = {}, yearStartOdo = null, yearEndOdo = null } = {}) {
  const y = String(year);
  const list = trips.filter((t) => isDate(t.date) && t.date.startsWith(y)).sort((a, b) => a.date.localeCompare(b.date) || num(a.odoStart) - num(b.odoStart));
  const by = Object.fromEntries(CATEGORIES.map((c) => [c, { miles: 0, trips: 0, deduction: 0 }]));
  const months = new Map();
  let tolls = 0, parking = 0;
  for (const t of list) {
    const m = tripMiles(t);
    const c = by[t.category] || by.personal;
    c.miles += m; c.trips++;
    const d = m * rateFor(t.date, t.category, override);
    c.deduction += d;
    if (t.category === "business") { tolls += num(t.tolls); parking += num(t.parking); }
    const key = t.date.slice(0, 7);
    if (!months.has(key)) months.set(key, { key, business: 0, other: 0, deduction: 0 });
    const mo = months.get(key);
    if (t.category === "business") mo.business += m; else mo.other += m;
    mo.deduction += d;
  }
  const logged = CATEGORIES.reduce((a, c) => a + by[c].miles, 0);
  const mileageDeduction = DEDUCTIBLE.reduce((a, c) => a + by[c].deduction, 0);
  const haveOdo = yearStartOdo != null && yearEndOdo != null && yearEndOdo > yearStartOdo;
  const yearMiles = haveOdo ? yearEndOdo - yearStartOdo : null;
  const unlogged = haveOdo ? Math.max(0, yearMiles - logged) : null;
  // Schedule C Part IV asks for business, commuting and other miles. Other = everything not business or commuting.
  const otherMiles = haveOdo ? Math.max(0, yearMiles - by.business.miles - by.commute.miles) : by.personal.miles + by.medical.miles + by.charity.miles;
  const summary = {
    year: y, trips: list.length, by, logged, tolls, parking,
    mileageDeduction, businessDeduction: by.business.deduction,
    businessPlusExtras: by.business.deduction + tolls + parking,
    yearMiles, unlogged, haveOdo, otherMiles,
    businessUse: yearMiles ? by.business.miles / yearMiles : (logged ? by.business.miles / logged : 0),
    businessUseBasis: haveOdo ? "year odometer" : "logged miles only",
    months: [...months.values()].sort((a, b) => a.key.localeCompare(b.key)),
  };
  return { summary, trips: list, findings: audit(list, summary) };
}

const $ = (n) => (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const P = (x, d = 0) => (x * 100).toFixed(d) + "%";

const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

export function audit(list, s) {
  const out = [];
  const add = (severity, title, detail) => out.push({ severity, title, detail });
  const ded = list.filter((t) => DEDUCTIBLE.includes(t.category));

  const noPurpose = ded.filter((t) => !t.purpose.trim());
  const noDest = ded.filter((t) => !t.to.trim());
  if (noPurpose.length || noDest.length) {
    const n = new Set([...noPurpose, ...noDest]).size;
    add("high", `${n} deductible trip${n > 1 ? "s" : ""} missing a purpose or destination`,
      `A mileage log is expected to show, for each trip, the date, the miles, where you went and why. Without a purpose and destination these ${n} trips are the first ones an examiner would disallow. Edit them and add what you remember while you still can.`);
  }

  const bad = list.filter((t) => t.odoStart !== "" && t.odoEnd !== "" && num(t.odoEnd) <= num(t.odoStart));
  if (bad.length) add("high", `${bad.length} trip${bad.length > 1 ? "s have" : " has"} an odometer end at or below the start`, "Miles for these use the typed miles field instead. Fix the odometer readings so the log agrees with itself.");

  const seen = new Map();
  let dups = 0;
  for (const t of list) {
    const k = [t.date, t.category, t.from.toLowerCase(), t.to.toLowerCase(), tripMiles(t)].join("|");
    if (seen.has(k)) dups++; else seen.set(k, 1);
  }
  if (dups) add("medium", `${dups} possible duplicate trip${dups > 1 ? "s" : ""}`, "Same date, category, places and miles as another entry. If both are real, add a note that tells them apart; if not, delete one.");

  if (ded.length >= 10) {
    const whole = ded.filter((t) => Number.isInteger(tripMiles(t)) && tripMiles(t) % 5 === 0).length;
    if (whole / ded.length > 0.5) add("medium", `${P(whole / ded.length)} of deductible trips are round numbers`,
      "Logs where most trips are 5, 10, 20 miles exactly look estimated rather than written down at the time. Odometer start and end readings, or the GPS tracker, produce the kind of figures a real log shows.");
  }

  const late = list.filter((t) => t.enteredAt && daysBetween(t.date, t.enteredAt.slice(0, 10)) > 30);
  if (late.length >= 3 && list.length) add("medium", `${late.length} of ${list.length} trips were entered more than 30 days after the drive`,
    "A record made at or near the time of the trip carries more weight than one rebuilt later. Enter trips within days, or the same day, going forward.");

  if (s.haveOdo && s.unlogged > 0) {
    add("info", `${Math.round(s.unlogged).toLocaleString("en-US")} miles this year are not in the log`,
      `The odometer says ${Math.round(s.yearMiles).toLocaleString("en-US")} miles were driven and ${Math.round(s.logged).toLocaleString("en-US")} are logged. Unlogged miles count as other personal driving, which is what Schedule C Part IV wants them to be, but a large gap on a busy driver is worth reviewing for missed business trips.`);
  }
  if (!s.haveOdo && list.length) add("info", "Add your odometer reading on January 1 and December 31",
    "Schedule C Part IV asks for total business, commuting and other miles for the year, and the business-use percentage needs the year's total. Enter both readings above to fill them in.");

  if (s.haveOdo && s.by.business.miles > s.yearMiles) add("high", "Business miles are higher than all miles driven", "The year's odometer readings show fewer miles than the log claims for business. One of them is wrong.");

  if (s.by.commute.miles === 0 && s.by.business.miles > 0 && s.haveOdo) add("info", "No commuting miles logged", "Regular travel between home and a regular workplace is commuting, and is not deductible. If you have one, log it as commuting so the split on Schedule C adds up.");

  const order = { high: 0, medium: 1, info: 2 };
  return out.sort((a, b) => order[a.severity] - order[b.severity]);
}

// Great-circle distance in miles between two GPS fixes.
export function haversineMiles(a, b) {
  const R = 3958.7613, rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Accumulates a route. Ignores fixes with poor accuracy and jitter under ~30 m.
export function addFix(track, fix, { maxAccuracy = 50, minStep = 0.02 } = {}) {
  if (fix.accuracy != null && fix.accuracy > maxAccuracy) return track;
  if (!track.last) return { last: fix, miles: track.miles || 0, points: 1 };
  const d = haversineMiles(track.last, fix);
  if (d < minStep) return track;
  return { last: fix, miles: (track.miles || 0) + d, points: (track.points || 0) + 1 };
}

const q = (v) => '"' + String(v ?? "").replace(/"/g, '""') + '"';
export function toCsv(trips, { override = {} } = {}) {
  const head = ["date", "category", "from", "to", "purpose", "client", "odometer_start", "odometer_end", "miles", "rate_per_mile", "deduction", "tolls", "parking", "entered_at", "vehicle"];
  const body = [...trips].sort((a, b) => a.date.localeCompare(b.date)).map((t) => {
    const m = tripMiles(t), r = rateFor(t.date, t.category, override);
    return [t.date, t.category, q(t.from), q(t.to), q(t.purpose), q(t.client), t.odoStart, t.odoEnd, m, r, round2(m * r), t.tolls || "", t.parking || "", t.enteredAt, q(t.vehicle)].join(",");
  });
  return [head.join(",")].concat(body).join("\n");
}

export function exportJson(trips, settings = {}) {
  return JSON.stringify({ app: "mileage-log", version: 1, exportedAt: new Date().toISOString(), settings, trips }, null, 2);
}

// Merges by id; never drops what is already on the device.
export function importJson(text, existing = []) {
  let data;
  try { data = JSON.parse(text); } catch { return { error: "That file is not valid JSON.", trips: existing, added: 0 }; }
  const incoming = Array.isArray(data) ? data : data && Array.isArray(data.trips) ? data.trips : null;
  if (!incoming) return { error: "No trips found in that file.", trips: existing, added: 0 };
  const have = new Map(existing.map((t) => [t.id, t]));
  let added = 0;
  for (const raw of incoming) {
    if (!raw || !isDate(raw.date)) continue;
    const t = normalizeTrip(raw);
    if (!have.has(t.id)) { have.set(t.id, t); added++; }
  }
  return { error: null, trips: [...have.values()], added, settings: data.settings || {} };
}

// Deterministic example: a year of a self-employed home-visit contractor.
export function sampleTrips(year = 2026) {
  const places = [
    ["Home office", "Miller residence, Oak St", "Estimate visit", "Miller", 14.2],
    ["Miller residence, Oak St", "Ace Supply", "Pick up materials", "", 6.8],
    ["Home office", "Chen job site, Elm Ave", "Install", "Chen", 22.6],
    ["Home office", "Bank on Main", "Deposit checks", "", 3.4],
    ["Chen job site, Elm Ave", "Home office", "Return from job", "Chen", 22.1],
    ["Home office", "Patel building, 5th", "Bid walkthrough", "Patel", 31.7],
    ["Home office", "Supplier warehouse", "Buy stock", "", 18.3],
  ];
  const trips = [];
  let odo = 41200;
  const rows = 44;
  for (let i = 0; i < rows; i++) {
    const p = places[i % places.length];
    const dayOfYear = 8 + Math.floor((i * 340) / rows);
    const d = new Date(Date.UTC(year, 0, 1) + (dayOfYear - 1) * 86400000).toISOString().slice(0, 10);
    const gap = 25 + ((i * 37) % 60);
    const start = odo + gap; const miles = Math.round((p[4] + ((i * 13) % 7) / 10) * 10) / 10;
    odo = start + miles;
    trips.push(normalizeTrip({ id: "ex" + i, date: d, category: "business", from: p[0], to: p[1], purpose: i % 9 === 4 ? "" : p[2], client: p[3], odoStart: Math.round(start), odoEnd: Math.round(start + miles), miles, tolls: i % 8 === 0 ? 4.5 : 0, parking: i % 6 === 0 ? 8 : 0, enteredAt: d + "T18:00:00.000Z" }));
  }
  trips.push(normalizeTrip({ id: "exm", date: `${year}-03-14`, category: "medical", to: "Dr. Alvarez", purpose: "Physical therapy", miles: 12.4, enteredAt: `${year}-03-14T20:00:00.000Z` }));
  trips.push(normalizeTrip({ id: "exc", date: `${year}-05-02`, category: "charity", to: "Food bank", purpose: "Deliver donations", miles: 9.5, enteredAt: `${year}-05-02T20:00:00.000Z` }));
  return { trips, yearStartOdo: 41200, yearEndOdo: Math.round(odo) + 260 };
}

export const money = (n) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const money0 = $;
export const pct = P;


// ---- Multi-vehicle -------------------------------------------------------
// The standard rate is claimed per vehicle, and Schedule C Part IV (and Form
// 4562 Part V) ask for miles per vehicle, so a second car must not be folded
// into the first one's totals.

export const NO_VEHICLE = "(no vehicle named)";

// Per-vehicle miles, deduction and the year's first/last odometer reading seen
// in the log. vehicleOdo: { [name]: { start, end } } overrides the inferred ones.
export function summarizeByVehicle(trips, { year, override = {}, vehicleOdo = {} } = {}) {
  const y = String(year);
  const map = new Map();
  for (const t of trips) {
    if (!isDate(t.date) || !t.date.startsWith(y)) continue;
    const name = (t.vehicle || "").trim() || NO_VEHICLE;
    if (!map.has(name)) map.set(name, { vehicle: name, trips: 0, business: 0, commute: 0, other: 0, deduction: 0, seenLow: null, seenHigh: null });
    const v = map.get(name), m = tripMiles(t);
    v.trips++;
    if (t.category === "business") v.business += m;
    else if (t.category === "commute") v.commute += m;
    else v.other += m;
    v.deduction += m * rateFor(t.date, t.category, override);
    for (const o of [t.odoStart, t.odoEnd]) {
      if (o === "" || o == null) continue;
      const n = num(o);
      v.seenLow = v.seenLow === null ? n : Math.min(v.seenLow, n);
      v.seenHigh = v.seenHigh === null ? n : Math.max(v.seenHigh, n);
    }
  }
  const out = [...map.values()].map((v) => {
    const o = vehicleOdo[v.vehicle] || {};
    const start = o.start ?? null, end = o.end ?? null;
    const haveOdo = start != null && end != null && end > start;
    const total = haveOdo ? end - start : null;
    return { ...v, business: round1(v.business), commute: round1(v.commute), other: round1(v.other), deduction: round2(v.deduction),
      yearMiles: total, businessUse: total ? v.business / total : null,
      unlogged: haveOdo ? Math.max(0, round1(total - v.business - v.commute - v.other)) : null };
  });
  return out.sort((a, b) => b.business - a.business || a.vehicle.localeCompare(b.vehicle));
}

export function vehicleNames(trips) {
  return [...new Set(trips.map((t) => (t.vehicle || "").trim()).filter(Boolean))].sort();
}

// ---- Repeat trips --------------------------------------------------------
// Most self-employed driving repeats (home -> supplier, home -> client). The
// fastest way to a contemporaneous log is one tap on a trip you have already
// written down once, so rank the routes by how often they recur.

export function frequentRoutes(trips, { limit = 6, minCount = 2 } = {}) {
  const map = new Map();
  for (const t of trips) {
    if (!DEDUCTIBLE.includes(t.category) || !t.to.trim()) continue;
    const key = [t.from.trim().toLowerCase(), t.to.trim().toLowerCase(), t.category].join("|");
    if (!map.has(key)) map.set(key, { count: 0, miles: [], last: t });
    const r = map.get(key);
    r.count++;
    const m = tripMiles(t);
    if (m > 0) r.miles.push(m);
    if (t.date >= r.last.date) r.last = t;
  }
  const med = (a) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y), k = s.length >> 1; return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2; };
  return [...map.values()].filter((r) => r.count >= minCount)
    .sort((a, b) => b.count - a.count || b.last.date.localeCompare(a.last.date))
    .slice(0, limit)
    .map((r) => ({ count: r.count, category: r.last.category, from: r.last.from, to: r.last.to, purpose: r.last.purpose, client: r.last.client, vehicle: r.last.vehicle || "", miles: round1(med(r.miles)) }));
}

// A repeat becomes a draft dated today. Odometer readings are deliberately not
// copied: they belong to the trip being logged, not to the one it copies.
export function tripFromRoute(route, date) {
  return { date, category: route.category, from: route.from, to: route.to, purpose: route.purpose, client: route.client, vehicle: route.vehicle, miles: route.miles, odoStart: "", odoEnd: "" };
}

// ---- Year-end report for a tax preparer ----------------------------------
const h = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// A standalone, print-ready HTML document: nothing external, no script.
export function preparerReportHtml(trips, { year, override = {}, yearStartOdo = null, yearEndOdo = null, vehicleOdo = {}, generated = new Date().toISOString().slice(0, 10) } = {}) {
  const r = summarize(trips, { year, override, yearStartOdo, yearEndOdo });
  const s = r.summary;
  const vs = summarizeByVehicle(trips, { year, override, vehicleOdo });
  const n0 = (n) => Math.round(n).toLocaleString("en-US");
  const rows = r.trips.map((t) => {
    const m = tripMiles(t), rate = rateFor(t.date, t.category, override);
    return `<tr><td>${h(t.date)}</td><td>${h(t.category)}</td><td>${h(t.vehicle)}</td><td>${h(t.from)}${t.from && t.to ? " &rarr; " : ""}${h(t.to)}</td><td>${h(t.purpose)}${t.client ? " (" + h(t.client) + ")" : ""}</td><td class="n">${t.odoStart === "" ? "" : h(t.odoStart)}</td><td class="n">${t.odoEnd === "" ? "" : h(t.odoEnd)}</td><td class="n">${m}</td><td class="n">${rate ? money(m * rate) : ""}</td></tr>`;
  }).join("");
  const vrows = vs.map((v) => `<tr><td>${h(v.vehicle)}</td><td class="n">${n0(v.business)}</td><td class="n">${n0(v.commute)}</td><td class="n">${n0(v.other)}</td><td class="n">${v.yearMiles == null ? "not entered" : n0(v.yearMiles)}</td><td class="n">${v.businessUse == null ? "" : pct(v.businessUse, 1)}</td><td class="n">${money(v.deduction)}</td></tr>`).join("");
  const frows = r.findings.filter((f) => f.severity !== "info").map((f) => `<li><strong>${h(f.title)}.</strong> ${h(f.detail)}</li>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Mileage log ${h(year)}</title>
<style>body{font:13px/1.45 system-ui,sans-serif;margin:28px;color:#111}h1{font-size:20px;margin:0 0 4px}h2{font-size:15px;margin:22px 0 6px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #bbb;padding:4px 6px;text-align:left;vertical-align:top}th{background:#eee}td.n,th.n{text-align:right}.note{color:#444;font-size:12px}@media print{body{margin:10mm}tr{break-inside:avoid}}</style></head><body>
<h1>Mileage log summary, tax year ${h(year)}</h1>
<p class="note">Prepared ${h(generated)} from a log kept in Mileage Log. This is a record of what the taxpayer entered, not tax advice and not a determination that any mile is deductible.</p>
<h2>Totals</h2>
<table><tbody>
<tr><th>Business miles</th><td class="n">${n0(s.by.business.miles)}</td><th>Commuting miles</th><td class="n">${n0(s.by.commute.miles)}</td></tr>
<tr><th>Other miles (all driving not business or commuting)</th><td class="n">${s.haveOdo ? n0(s.otherMiles) : "needs odometer readings"}</td><th>Total miles driven</th><td class="n">${s.haveOdo ? n0(s.yearMiles) : "needs odometer readings"}</td></tr>
<tr><th>Standard-rate deduction (business, medical, charity)</th><td class="n">${money(s.mileageDeduction)}</td><th>Business tolls + parking (claimed separately)</th><td class="n">${money(s.tolls + s.parking)}</td></tr>
</tbody></table>
<h2>By vehicle</h2>
<table><thead><tr><th>Vehicle</th><th class="n">Business</th><th class="n">Commuting</th><th class="n">Other logged</th><th class="n">Year miles</th><th class="n">Business use</th><th class="n">Deduction</th></tr></thead><tbody>${vrows}</tbody></table>
${frows ? `<h2>Gaps in this log</h2><ul>${frows}</ul>` : ""}
<h2>Trips (${r.trips.length})</h2>
<table><thead><tr><th>Date</th><th>Type</th><th>Vehicle</th><th>Route</th><th>Purpose</th><th class="n">Odo start</th><th class="n">Odo end</th><th class="n">Miles</th><th class="n">Deduction</th></tr></thead><tbody>${rows}</tbody></table>
<p class="note">Rates applied: the IRS standard mileage rate in effect on each trip's date unless overridden by the taxpayer. Verify against irs.gov before filing.</p>
</body></html>`;
}
