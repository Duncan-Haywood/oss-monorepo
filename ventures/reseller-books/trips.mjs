// Business mileage for a reseller's books: sourcing runs, post office and
// pick-up trips, read from a trip log CSV and priced at the IRS standard
// mileage rate in force on each trip's date.
//
// The rates and the per-trip arithmetic are not re-implemented here: they come
// from ./engines/mileage.mjs, a verbatim copy of ventures/mileage-log/calc.mjs
// (business 70c for 2025, Notice 2025-5; 72.5c Jan 1 to Jun 30 2026, Notice
// 2026-10; 76c from Jul 1 2026, Announcement 2026-11; verified against irs.gov
// on 2026-09-29 in ventures/mileage-deduction-method-calculator). This module
// only reads a CSV into trips, removes the rows a second overlapping download
// repeats, and adds the result up for Schedule C line 9 and Part IV.
//
// Pure functions, no DOM, no network. Not tax advice.

import * as ml from "./engines/mileage.mjs";

const r2 = (n) => Math.round(n * 100) / 100;
const r1 = (n) => Math.round(n * 10) / 10;

// First and last trip dates the rate table covers with a published rate. A trip
// before the first has no rate here; one after the last is priced at the last
// known rate and flagged, because the next year's rate may differ.
export const RATES_FROM = ml.RATE_PERIODS[0].from;
export const RATES_KNOWN_THROUGH = "2026-12-31";

/** Lower-cased header tokens of the first non-empty line. */
function header(text) {
  const line = String(text || "").split(/\r?\n/).find((l) => l.trim() !== "") || "";
  return splitLine(line, delimOf(line)).map((h) => h.replace(/^\uFEFF/, "").trim().toLowerCase());
}

function delimOf(line) {
  if (line.includes("\t")) return "\t";
  return line.split(";").length > line.split(",").length ? ";" : ",";
}

function splitLine(line, d) {
  const out = [];
  let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === d) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

// Column aliases. The first list is the mileage-log venture's own CSV export
// (date, category, from, to, purpose, client, odometer_start, odometer_end,
// miles, ...); the others are the plain names a hand-kept spreadsheet uses.
const ALIASES = {
  date: ["date", "trip date", "start date"],
  miles: ["miles", "distance", "distance (mi)", "distance (miles)", "business miles", "mileage"],
  category: ["category", "type", "classification", "trip type"],
  to: ["to", "destination", "end location", "end address", "where"],
  from: ["from", "start location", "start address", "origin"],
  purpose: ["purpose", "notes", "reason", "description", "memo"],
  odoStart: ["odometer_start", "odometer start", "start odometer", "odo start"],
  odoEnd: ["odometer_end", "odometer end", "end odometer", "odo end"],
  tolls: ["tolls", "toll"],
  parking: ["parking"],
  vehicle: ["vehicle", "car"],
};

function columns(h) {
  const col = {};
  for (const [k, names] of Object.entries(ALIASES)) {
    const i = names.map((n) => h.indexOf(n)).find((j) => j >= 0) ?? -1;
    if (i >= 0) col[k] = i;
  }
  return col;
}

/** Is this a trip log? It needs a date column and a miles (or odometer) column. */
export function isTripLog(text) {
  const c = columns(header(text));
  return c.date !== undefined && (c.miles !== undefined || (c.odoStart !== undefined && c.odoEnd !== undefined));
}

/** "2026-03-04", "3/4/2026", "03/04/26" -> "2026-03-04"; "" when not a date. */
export function isoDate(s) {
  const v = String(s || "").trim();
  let m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?!\d)/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})(?!\d)/);
  if (m) {
    const y = m[3].length === 2 ? "20" + m[3] : m[3];
    return `${y}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  }
  return "";
}

// Commas are read by shape: "1,234.5" is thousands, "12,5" is a decimal comma.
const amount = (s) => {
  let t = String(s ?? "").replace(/[$\s]/g, "");
  if (/^-?\d{1,3}(,\d{3})+(\.\d*)?$/.test(t)) t = t.split(",").join("");
  else if (/^-?\d+,\d{1,2}$/.test(t)) t = t.replace(",", ".");
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
};

// A log with no category column is a business log (that is what a reseller
// keeps one for). With one, words map to the mileage-log categories; anything
// unrecognised (or blank) is treated as personal, so it is never deducted by accident.
function category(raw, hasColumn) {
  if (!hasColumn) return "business";
  const v = String(raw || "").trim().toLowerCase();
  if (/^(business|work|biz|sourcing|post office|shipping)/.test(v)) return "business";
  if (/^commut/.test(v)) return "commute";
  if (/^medical/.test(v)) return "medical";
  if (/^charit/.test(v)) return "charity";
  return "personal";
}

/**
 * Read one trip log CSV. Returns { trips, skipped }: each trip in the
 * mileage-log shape, plus `key`, the fields that identify a repeated row.
 */
export function parseTrips(text) {
  const lines = String(text || "").split(/\r?\n/);
  const first = lines.findIndex((l) => l.trim() !== "");
  if (first < 0) return { trips: [], skipped: 0 };
  const d = delimOf(lines[first]);
  const h = splitLine(lines[first], d).map((x) => x.replace(/^\uFEFF/, "").trim().toLowerCase());
  const c = columns(h);
  const trips = [];
  let skipped = 0;
  for (const line of lines.slice(first + 1)) {
    if (!line.trim()) continue;
    const cells = splitLine(line, d);
    const get = (k) => (c[k] === undefined ? "" : String(cells[c[k]] ?? "").trim());
    const date = isoDate(get("date"));
    const t = ml.normalizeTrip({
      id: "row",
      enteredAt: "",
      date,
      category: category(get("category"), c.category !== undefined),
      from: get("from"),
      to: get("to"),
      purpose: get("purpose"),
      miles: amount(get("miles")),
      odoStart: get("odoStart") === "" ? "" : amount(get("odoStart")),
      odoEnd: get("odoEnd") === "" ? "" : amount(get("odoEnd")),
      tolls: amount(get("tolls")),
      parking: amount(get("parking")),
      vehicle: get("vehicle"),
    });
    const miles = ml.tripMiles(t);
    if (!date || !(miles > 0)) { skipped++; continue; }
    t.key = [date, t.category, miles, t.from.toLowerCase(), t.to.toLowerCase(), t.purpose.toLowerCase(), t.odoStart, t.odoEnd].join("|");
    trips.push(t);
  }
  return { trips, skipped };
}

/**
 * Merge several trip logs. A row that appears in two files (two downloads
 * covering the same weeks) is counted once; two identical trips in one file
 * (two post office runs on the same day) are both kept. So each distinct row
 * counts as many times as the file that has it most often.
 */
export function mergeTrips(files) {
  const most = new Map();
  let skipped = 0, read = 0;
  for (const f of files) {
    const { trips, skipped: s } = parseTrips(f.text);
    skipped += s;
    read += trips.length;
    const here = new Map();
    for (const t of trips) (here.get(t.key) || here.set(t.key, []).get(t.key)).push(t);
    for (const [k, list] of here) if (!most.has(k) || most.get(k).length < list.length) most.set(k, list);
  }
  const trips = [...most.values()].flat().sort((a, b) => a.date.localeCompare(b.date));
  return { trips, skipped, repeatsDropped: read - trips.length };
}

/**
 * Add the business trips up. Only business miles belong on Schedule C; medical
 * and charity miles are Schedule A items and commuting is never deductible, so
 * those are counted for Part IV and the notes, not deducted.
 */
export function summarizeTrips(trips) {
  const months = new Map();
  const s = { trips: trips.length, businessTrips: 0, businessMiles: 0, commuteMiles: 0, otherMiles: 0, deduction: 0, tolls: 0, parking: 0, unpriced: 0, unpricedMiles: 0, afterKnown: 0, missingDetail: 0, from: null, to: null, rates: new Set() };
  for (const t of trips) {
    const m = ml.tripMiles(t);
    if (t.category === "commute") { s.commuteMiles += m; continue; }
    if (t.category !== "business") { s.otherMiles += m; continue; }
    if (t.date < RATES_FROM) { s.unpriced++; s.unpricedMiles += m; continue; }
    if (t.date > RATES_KNOWN_THROUGH) s.afterKnown++;
    const rate = ml.rateFor(t.date, "business");
    s.rates.add(rate);
    const d = m * rate;
    s.businessTrips++;
    s.businessMiles += m;
    s.deduction += d;
    s.tolls += t.tolls;
    s.parking += t.parking;
    if (!t.to || !t.purpose) s.missingDetail++;
    s.from = s.from && s.from < t.date ? s.from : t.date;
    s.to = s.to && s.to > t.date ? s.to : t.date;
    const key = t.date.slice(0, 7);
    const mo = months.get(key) || months.set(key, { month: key, miles: 0, deduction: 0, tollsParking: 0 }).get(key);
    mo.miles += m;
    mo.deduction += d;
    mo.tollsParking += t.tolls + t.parking;
  }
  const out = {
    ...s,
    businessMiles: r1(s.businessMiles),
    commuteMiles: r1(s.commuteMiles),
    otherMiles: r1(s.otherMiles),
    unpricedMiles: r1(s.unpricedMiles),
    deduction: r2(s.deduction),
    tolls: r2(s.tolls),
    parking: r2(s.parking),
    rates: [...s.rates].sort(),
    months: [...months.values()].sort((a, b) => a.month.localeCompare(b.month)).map((m) => ({ month: m.month, miles: r1(m.miles), deduction: r2(m.deduction), carTruck: r2(m.deduction + m.tollsParking) })),
  };
  // Schedule C line 9 with the standard mileage rate: business miles times the
  // rate, plus business parking fees and tolls (Schedule C instructions, line 9).
  out.carTruck = r2(out.deduction + out.tolls + out.parking);
  return out;
}

/** Notes a preparer or the seller should see about the log. */
export function tripNotes(s) {
  const out = [];
  if (s.unpriced) out.push(`${s.unpriced} business trip(s) (${s.unpricedMiles} miles) are dated before ${RATES_FROM}, which this page has no standard rate for, so they are left out of the deduction.`);
  if (s.afterKnown) out.push(`${s.afterKnown} business trip(s) are dated after ${RATES_KNOWN_THROUGH}; they are priced at the last rate this page knows, which the IRS may have changed. Check the current rate.`);
  if (s.missingDetail) out.push(`${s.missingDetail} business trip(s) have no destination or no purpose. A mileage log is expected to show where you went and why for each business trip.`);
  if (s.commuteMiles) out.push(`${s.commuteMiles} commuting miles are counted for Schedule C Part IV but not deducted.`);
  return out;
}

export const sampleTripCsv = () => [
  "date,category,from,to,purpose,miles,tolls,parking",
  "2026-01-10,business,Home,Goodwill Outlet,Sourcing run,18.4,,",
  "2026-01-10,business,Goodwill Outlet,Post office,Drop off eBay and Poshmark parcels,6.2,,",
  "2026-01-24,business,Home,Estate sale (Oak St),Sourcing,23.0,,2.00",
  "2026-02-07,business,Home,Post office,Drop off parcels,5.1,,",
  "2026-02-21,business,Home,Flea market,Sourcing,31.5,4.50,5.00",
  "2026-03-06,business,Home,Thrift store,Sourcing run,12.8,,",
  "2026-03-06,personal,Thrift store,Grocery store,Groceries,3.0,,",
  "2026-03-20,business,Home,Post office,Drop off parcels,5.1,,",
].join("\n");
