// Parcel late-delivery refund finder: a carrier shipment or invoice CSV in,
// the shipments delivered after the day the service promised, the shipping
// charge each one may be refundable for, the last day to file, plus duplicate
// charges and rate drift, and a draft claim request. Deterministic rules on
// the file and the settings only. No network, no storage, no DOM. It lists
// shipments to ask the carrier about; it never says a refund is owed.

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
export const money = (n) => {
  const v = Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  const [i, f] = Math.abs(v).toFixed(2).split(".");
  return (v < 0 ? "-" : "") + i.replace(/\B(?=(\d{3})+$)/g, ",") + "." + f;
};
const usd = (n) => (n < 0 ? "-$" : "$") + money(Math.abs(n));

// ---------- text decoding and CSV ----------

// Bytes -> text. Honours UTF-8 and UTF-16 byte order marks; anything else is UTF-8.
export function decodeBuffer(buf) {
  const u = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (u.length >= 2 && u[0] === 0xff && u[1] === 0xfe) return new TextDecoder("utf-16le").decode(u.subarray(2));
  if (u.length >= 2 && u[0] === 0xfe && u[1] === 0xff) return new TextDecoder("utf-16be").decode(u.subarray(2));
  const t = new TextDecoder("utf-8").decode(u);
  return t.charCodeAt(0) === 0xfeff ? t.slice(1) : t;
}

// Comma, semicolon, tab or pipe: whichever appears most in the first non-empty
// line outside quotes.
export function detectDelimiter(text) {
  const first = String(text).replace(/^﻿/, "").split(/\r\n|\n|\r/).find((l) => l.trim()) || "";
  const counts = { ",": 0, ";": 0, "\t": 0, "|": 0 };
  let inQ = false;
  for (const ch of first) {
    if (ch === '"') inQ = !inQ;
    else if (!inQ && ch in counts) counts[ch]++;
  }
  let best = ",", n = 0;
  for (const [d, c] of Object.entries(counts)) if (c > n) { best = d; n = c; }
  return best;
}

// Quoted-field CSV parser: "" escapes, newlines inside quotes, CRLF, BOM.
// Blank lines are dropped. Returns { rows, lines } where lines[i] is the
// 1-based source line row i started on.
export function parseCsv(text, delimiter = ",") {
  const s = String(text).replace(/^﻿/, "");
  const rows = [], lines = [];
  let row = [], field = "", inQ = false, line = 1, rowLine = 1, touched = false;
  const endField = () => { row.push(field); field = ""; };
  const endRow = () => {
    endField();
    if (row.some((c) => c.trim() !== "")) { rows.push(row); lines.push(rowLine); }
    row = []; touched = false;
  };
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQ) {
      if (ch === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else { if (ch === "\n") line++; field += ch; }
      continue;
    }
    if (ch === '"' && field === "") { inQ = true; touched = true; }
    else if (ch === delimiter) { endField(); touched = true; }
    else if (ch === "\r" || ch === "\n") {
      if (ch === "\r" && s[i + 1] === "\n") i++;
      if (touched || field !== "" || row.length) endRow();
      line++; rowLine = line;
    } else { field += ch; touched = true; }
  }
  if (touched || field !== "" || row.length) endRow();
  return { rows, lines };
}

// ---------- columns ----------

const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const ALIASES = {
  tracking: ["tracking number", "tracking no", "tracking", "tracking id", "tracking #", "package tracking number", "shipment number", "waybill", "pro number"],
  service: ["service", "service level", "service type", "service name", "ship method", "shipping method", "service description", "product", "carrier service"],
  ship: ["ship date", "shipment date", "pickup date", "shipped", "shipped date", "date shipped", "manifest date", "label date", "ship dt"],
  delivered: ["delivery date", "delivered date", "date delivered", "actual delivery date", "delivered", "delivery dt", "delivered on"],
  promised: ["scheduled delivery date", "guaranteed delivery date", "promised delivery date", "commitment date", "commit date", "estimated delivery date", "expected delivery date", "due date"],
  days: ["transit days", "guaranteed days", "commit days", "days in transit", "service days"],
  charge: ["transportation charge", "net charge", "shipping charge", "freight charge", "charge", "charges", "amount", "net amount", "billed amount", "base charge", "postage", "rate", "cost", "price"],
  invoice: ["invoice date", "bill date", "billing date"],
  note: ["status", "delivery status", "exception", "exception reason", "notes", "note", "comments", "delivery exception"],
};

function findColumns(header) {
  const cols = {};
  const names = header.map(norm);
  for (const [key, list] of Object.entries(ALIASES)) {
    for (const a of list) {
      const i = names.indexOf(a);
      if (i >= 0 && !Object.values(cols).some((c) => c.index === i)) { cols[key] = { index: i, name: header[i].trim() }; break; }
    }
  }
  return cols;
}

function parseMoney(text) {
  let s = String(text ?? "").trim();
  if (!s || s === "-") return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (/-\s*$/.test(s)) { neg = true; s = s.replace(/-\s*$/, ""); }
  s = s.replace(/[$\s]/g, "");
  if (s.startsWith("-")) { neg = !neg; s = s.slice(1); }
  if (/^\d{1,3}(,\d{3})*(\.\d+)?$|^\d+(\.\d+)?$/.test(s)) {
    const v = parseFloat(s.replace(/,/g, ""));
    return neg ? -v : v;
  }
  return NaN;
}

// ---------- dates ----------
// A date is a whole number of days since 1970-01-01 (UTC), so there is no time
// zone to get wrong. Times in the cell are ignored.

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const DAY_MS = 86400000;
export function toDay(y, m, d) {
  const t = Date.UTC(y, m - 1, d);
  const c = new Date(t);
  return c.getUTCFullYear() === y && c.getUTCMonth() === m - 1 && c.getUTCDate() === d ? t / DAY_MS : null;
}
export const dayIso = (n) => new Date(n * DAY_MS).toISOString().slice(0, 10);
const dow = (n) => new Date(n * DAY_MS).getUTCDay();
const shortDate = (n) => new Date(n * DAY_MS).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric", year: "numeric" });

export function parseDate(text) {
  const s = String(text ?? "").trim();
  if (!s) return null;
  let m;
  if ((m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?!\d)/))) return toDay(+m[1], +m[2], +m[3]);
  if ((m = s.match(/^(\d{4})(\d{2})(\d{2})$/))) return toDay(+m[1], +m[2], +m[3]);
  if ((m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})(?!\d)/))) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return toDay(y, +m[1], +m[2]);
  }
  if ((m = s.match(/^([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})/)) && MONTHS[m[1].toLowerCase()]) return toDay(+m[3], MONTHS[m[1].toLowerCase()], +m[2]);
  if ((m = s.match(/^(\d{1,2})[ -]([A-Za-z]{3})[a-z]*[ -,]+(\d{4})/)) && MONTHS[m[2].toLowerCase()]) return toDay(+m[3], MONTHS[m[2].toLowerCase()], +m[1]);
  return null;
}

// ---------- service promises and the delivery calendar ----------

// Business days a named service promises. Ground services are zone-based and
// have no fixed number, so they return null and need the ground-days setting
// or a per-shipment column. SmartPost, SurePost, Ground Economy and Mail
// Innovations carry no money-back promise and are never judged.
export function promisedDaysFor(service) {
  const s = norm(service);
  if (!s) return null;
  if (/smartpost|surepost|ground economy|mail innovations|economy|freight|parcel select|media mail|first class|priority mail|usps/.test(s)) return null;
  if (/(next day|overnight|express plus|first overnight|1 day|one day)/.test(s)) return 1;
  if (/(2nd day|second day|2 day|2day|two day)/.test(s)) return 2;
  if (/(3 day|3day|three day|express saver)/.test(s)) return 3;
  return null;
}
export const isGround = (service) => /ground|home delivery/.test(norm(service)) && !/economy|smartpost|surepost|freight/.test(norm(service));

// US holidays, computed for a year. `carrier` is the six days the big
// carriers generally do not run parcel delivery (an unverified default);
// `federal` adds the other federal holidays; `none` counts every weekday.
function nthWeekday(y, m, wd, n) {
  const first = toDay(y, m, 1);
  const off = (wd - dow(first) + 7) % 7;
  return first + off + (n - 1) * 7;
}
function lastWeekday(y, m, wd) {
  const next = m === 12 ? toDay(y + 1, 1, 1) : toDay(y, m + 1, 1);
  const last = next - 1;
  return last - ((dow(last) - wd + 7) % 7);
}
const sundayToMonday = (d) => (dow(d) === 0 ? d + 1 : d);
export function holidaysFor(year, mode = "carrier") {
  if (mode === "none") return [];
  const out = [
    sundayToMonday(toDay(year, 1, 1)),
    lastWeekday(year, 5, 1), // Memorial Day
    sundayToMonday(toDay(year, 7, 4)),
    nthWeekday(year, 9, 1, 1), // Labor Day
    nthWeekday(year, 11, 4, 4), // Thanksgiving
    sundayToMonday(toDay(year, 12, 25)),
  ];
  if (mode === "federal") {
    out.push(nthWeekday(year, 1, 1, 3), nthWeekday(year, 2, 1, 3), sundayToMonday(toDay(year, 6, 19)), nthWeekday(year, 10, 1, 2), sundayToMonday(toDay(year, 11, 11)));
  }
  return out;
}
const CARRIER_ONLY = (year) => new Set(holidaysFor(year, "carrier"));

export function makeCalendar(mode = "carrier", extra = []) {
  const cache = new Map();
  const extras = new Set(extra);
  const setFor = (y) => {
    if (!cache.has(y)) cache.set(y, new Set(holidaysFor(y, mode)));
    return cache.get(y);
  };
  const yearOf = (n) => new Date(n * DAY_MS).getUTCFullYear();
  const isBusiness = (n) => {
    const w = dow(n);
    return w !== 0 && w !== 6 && !extras.has(n) && !setFor(yearOf(n)).has(n);
  };
  const addBusinessDays = (from, k) => {
    let d = from, left = k;
    while (left > 0) { d++; if (isBusiness(d)) left--; }
    return d;
  };
  const businessDaysBetween = (from, to) => {
    let n = 0;
    for (let d = from + 1; d <= to; d++) if (isBusiness(d)) n++;
    return n;
  };
  // Federal-only holidays inside (from, to]: days the default calendar counts as
  // delivery days but a carrier may not have.
  const federalOnlyIn = (from, to) => {
    if (mode === "federal" || mode === "none") return [];
    const out = [];
    for (let d = from + 1; d <= to; d++) {
      const y = yearOf(d);
      if (!CARRIER_ONLY(y).has(d) && holidaysFor(y, "federal").includes(d) && dow(d) !== 0 && dow(d) !== 6) out.push(d);
    }
    return out;
  };
  return { isBusiness, addBusinessDays, businessDaysBetween, federalOnlyIn };
}

// ---------- normalize ----------

export function normalizeShipments(parsed) {
  const { rows, lines } = parsed;
  if (rows.length < 2) return { error: "The file needs a header row and at least one shipment." };
  const cols = findColumns(rows[0]);
  if (!cols.ship) return { error: "No ship date column found. Expected a header like Ship Date, Shipment Date or Pickup Date." };
  if (!cols.delivered) return { error: "No delivery date column found. Expected a header like Delivery Date or Delivered Date. Tracking exports and carrier invoice reports that include the delivery scan date work." };
  if (!cols.tracking && !cols.service) return { error: "No tracking number or service column found." };
  const records = [], skipped = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const get = (k) => (cols[k] ? String(row[cols[k].index] ?? "").trim() : "");
    const shipRaw = get("ship");
    const ship = parseDate(shipRaw);
    if (ship === null) { skipped.push({ line: lines[r], reason: shipRaw ? `ship date "${shipRaw}" not understood` : "no ship date (a total or note row)" }); continue; }
    const deliveredRaw = get("delivered");
    const delivered = deliveredRaw ? parseDate(deliveredRaw) : null;
    const chargeRaw = get("charge");
    const chargeParsed = chargeRaw === "" ? null : parseMoney(chargeRaw);
    if (Number.isNaN(chargeParsed)) { skipped.push({ line: lines[r], reason: `charge "${chargeRaw}" not understood` }); continue; }
    const daysRaw = get("days");
    const days = daysRaw && /^\d{1,2}$/.test(daysRaw) ? +daysRaw : null;
    records.push({
      line: lines[r],
      tracking: get("tracking").replace(/\s+/g, ""),
      service: get("service"),
      ship,
      delivered,
      deliveredRaw,
      promisedDate: parseDate(get("promised")),
      days,
      charge: chargeParsed === null ? null : round2(chargeParsed),
      invoice: parseDate(get("invoice")),
      note: get("note"),
    });
  }
  if (!records.length) return { error: "No shipment rows could be read.", skipped, columns: {} };
  return { records, skipped, columns: Object.fromEntries(Object.entries(cols).map(([k, v]) => [k, v.name])) };
}

// ---------- analysis ----------

// Delivery notes that usually mean the carrier is excused: the recipient or the
// address, or an event outside the carrier's control. They are listed, never
// counted.
const EXCUSED = /weather|storm|flood|snow|hurricane|natural disaster|force majeure|customer|recipient|consignee|address|refus|not home|no one|business closed|closed|hold|vacation|access|appointment|reschedul|requested/i;
const median = (a) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

export const DEFAULTS = { groundDays: null, claimWindowDays: 15, holidays: "carrier", extraDates: [], asOf: null };

export function analyze(records, options = {}) {
  const o = { ...DEFAULTS, ...options };
  const asOf = o.asOf === null ? null : o.asOf;
  const cal = makeCalendar(o.holidays, o.extraDates);
  const findings = [];
  const late = [];

  // Tracking numbers that already carry a credit (a negative line): not claimed again.
  const credited = new Set(records.filter((r) => r.charge !== null && r.charge < 0 && r.tracking).map((r) => r.tracking));

  let judged = 0, unjudged = 0, noDelivery = 0;
  const seen = new Set();
  for (const r of records) {
    // A credit line is not a shipment, and an exact repeat is the duplicate
    // finding's business: judging it twice would count one parcel twice.
    if (r.charge !== null && r.charge < 0) continue;
    const key = r.tracking ? `${r.tracking}|${r.ship}|${r.charge}` : null;
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    let promisedDate = r.promisedDate, basis = "the promised date column";
    if (promisedDate === null) {
      let days = r.days, why = "the days column";
      if (days === null) { days = promisedDaysFor(r.service); why = `${r.service.trim() || "the service"} = ${days} business day(s)`; }
      if (days === null && isGround(r.service) && o.groundDays) { days = o.groundDays; why = `your ground setting of ${days} business day(s)`; }
      if (days === null) { unjudged++; continue; }
      promisedDate = cal.addBusinessDays(r.ship, days);
      basis = why;
    }
    if (r.delivered === null) { if (!r.deliveredRaw) noDelivery++; else unjudged++; continue; }
    judged++;
    if (r.delivered < r.ship) continue;
    if (r.delivered <= promisedDate) continue;
    const daysLate = cal.businessDaysBetween(promisedDate, r.delivered);
    const excusedBy = (r.note.match(EXCUSED) || [])[0] || null;
    const alreadyCredited = r.tracking && credited.has(r.tracking) && !(r.charge !== null && r.charge < 0);
    const claimBy = r.invoice !== null ? r.invoice + o.claimWindowDays : null;
    let window = "unknown";
    if (claimBy !== null && asOf !== null) window = asOf <= claimBy ? "open" : "expired";
    else if (claimBy !== null) window = "open";
    late.push({
      line: r.line, tracking: r.tracking, service: r.service, ship: r.ship, promised: promisedDate, delivered: r.delivered,
      daysLate: Math.max(daysLate, 1), charge: r.charge, claimBy, window, excusedBy, alreadyCredited, basis,
      holidayDoubt: cal.federalOnlyIn(r.ship, r.delivered),
    });
  }

  const clean = late.filter((l) => !l.excusedBy && !l.alreadyCredited && l.charge !== null && l.charge > 0);
  const sum = (a) => round2(a.reduce((t, l) => t + l.charge, 0));
  const groupBy = (a, f) => { const m = new Map(); for (const x of a) { const k = f(x); (m.get(k) || m.set(k, []).get(k)).push(x); } return m; };
  const svcName = (l) => l.service.trim() || "(no service named)";

  const strong = clean.filter((l) => !l.holidayDoubt.length);
  const doubtful = clean.filter((l) => l.holidayDoubt.length);
  for (const [svc, items] of groupBy(strong, svcName)) {
    const open = items.filter((l) => l.window !== "expired");
    const gone = items.filter((l) => l.window === "expired");
    if (open.length) findings.push({
      severity: "high", kind: "late", dollars: sum(open), lines: open.map((l) => l.line),
      title: `${svc}: ${open.length} shipment${open.length > 1 ? "s" : ""} delivered after the promised day (${usd(sum(open))} in shipping charges)`,
      detail: `Each was delivered at least one business day after ship date plus the promised transit (${open[0].basis}). Worst: ${open.slice().sort((a, b) => b.daysLate - a.daysLate)[0].tracking || "line " + open[0].line} at ${Math.max(...open.map((l) => l.daysLate))} business day(s) late. ${claimByText(open)} Whether each is refundable depends on the carrier's current guarantee terms and any exception on the tracking record.`,
    });
    if (gone.length) findings.push({
      severity: "info", kind: "expired", dollars: 0, lines: gone.map((l) => l.line),
      title: `${svc}: ${gone.length} late shipment${gone.length > 1 ? "s" : ""} past the claim window (${usd(sum(gone))} not counted)`,
      detail: `The invoice date plus ${o.claimWindowDays} days has passed for these. Some carriers still accept a late request or a different route such as your account rep; ask, but do not count on it.`,
    });
  }
  if (doubtful.length) findings.push({
    severity: "medium", kind: "late-holiday", dollars: sum(doubtful), lines: doubtful.map((l) => l.line),
    title: `${doubtful.length} late shipment${doubtful.length > 1 ? "s" : ""} whose transit crosses a federal holiday (${usd(sum(doubtful))})`,
    detail: `The calendar counts these federal holidays as delivery days: ${[...new Set(doubtful.flatMap((l) => l.holidayDoubt.map(dayIso)))].join(", ")}. If the carrier did not deliver on them, some of these are on time. Add the days you know were closures to the extra dates box and run it again.`,
  });
  const excused = late.filter((l) => l.excusedBy && !l.alreadyCredited);
  if (excused.length) findings.push({
    severity: "info", kind: "excused", dollars: 0, lines: excused.map((l) => l.line),
    title: `${excused.length} late shipment${excused.length > 1 ? "s" : ""} with a note that usually excuses the carrier`,
    detail: `Notes matched: ${[...new Set(excused.map((l) => `"${l.excusedBy}"`))].join(", ")}. Weather, recipient or address problems and customer holds are normally outside the guarantee, so these are not counted. Check the tracking history; a note is not always the whole story.`,
  });
  const credit = late.filter((l) => l.alreadyCredited);
  if (credit.length) findings.push({
    severity: "info", kind: "credited", dollars: 0, lines: credit.map((l) => l.line),
    title: credit.length > 1 ? `${credit.length} late shipments already carry a credit line` : "1 late shipment already carries a credit line",
    detail: "A negative line with the same tracking number is in the file, so these are not counted again.",
  });

  // Duplicate charges: same tracking number, same charge, more than once.
  const byKey = groupBy(records.filter((r) => r.tracking && r.charge !== null && r.charge > 0), (r) => `${r.tracking}|${r.charge}`);
  const dupLines = [], dupDollars = [];
  for (const items of byKey.values()) {
    if (items.length < 2) continue;
    dupLines.push(...items.map((r) => r.line));
    dupDollars.push(round2(items[0].charge * (items.length - 1)));
  }
  if (dupLines.length) findings.push({
    severity: "high", kind: "duplicate", dollars: round2(dupDollars.reduce((a, b) => a + b, 0)), lines: dupLines,
    title: `${dupDollars.length} tracking number${dupDollars.length > 1 ? "s" : ""} charged the same amount more than once`,
    detail: "The repeats are the amount in question. Some are legitimate, for example a second label for a reshipment, but a repeat with no matching credit is worth a question.",
  });

  // Rate drift: a charge well above the typical for the same service.
  const driftLines = [];
  let drift = 0;
  for (const [svc, items] of groupBy(records.filter((r) => r.charge !== null && r.charge > 0 && r.service), (r) => norm(r.service))) {
    if (items.length < 6) continue;
    const med = median(items.map((r) => r.charge));
    for (const r of items) if (r.charge > med * 1.75 && r.charge - med >= 5) { driftLines.push(r.line); drift += r.charge - med; }
  }
  if (driftLines.length) findings.push({
    severity: "medium", kind: "drift", dollars: round2(drift), lines: driftLines,
    title: `${driftLines.length} charge${driftLines.length > 1 ? "s" : ""} well above the typical for the same service`,
    detail: `Each is more than 1.75 times the median for its service and at least $5 over. The amount is the excess over the median. Heavier or longer-zone parcels explain many of these; a weight or address correction you did not expect explains others. This file has no weight or zone column, so the tool cannot tell which.`,
  });

  if (noDelivery) findings.push({
    severity: "info", kind: "no-delivery", dollars: 0, lines: [],
    title: `${noDelivery} shipment${noDelivery > 1 ? "s" : ""} with no delivery date`,
    detail: "These could not be judged. A shipment that was never scanned as delivered is worth looking up on the carrier's tracking page: lost parcels have their own claim.",
  });
  if (unjudged) findings.push({
    severity: "info", kind: "unjudged", dollars: 0, lines: [],
    title: `${unjudged} shipment${unjudged > 1 ? "s" : ""} not judged (no fixed transit promise)`,
    detail: "Ground services vary by zone and economy services carry no money-back promise. Enter your typical ground transit days in the settings, or add a promised-date column, to have ground shipments judged.",
  });

  const order = { high: 0, medium: 1, info: 2 };
  findings.sort((a, b) => order[a.severity] - order[b.severity] || b.dollars - a.dollars);

  // Late rate by service.
  const byService = [];
  for (const [svc, items] of groupBy(records.filter((r) => r.service), (r) => r.service.trim())) {
    const total = items.filter((r) => r.delivered !== null).length;
    const l = late.filter((x) => x.service.trim() === svc);
    byService.push({ service: svc, shipments: total, late: l.length, lateRate: total ? l.length / total : null, refundable: sum(clean.filter((x) => x.service.trim() === svc && x.window !== "expired" && !x.holidayDoubt.length)) });
  }
  byService.sort((a, b) => b.refundable - a.refundable || b.late - a.late);

  const openClean = strong.filter((l) => l.window !== "expired");
  return {
    findings, late, byService,
    rulesChecked: ["late against promised days", "excusing notes", "claim window", "duplicate charge", "rate drift"],
    summary: {
      lines: records.length, judged, unjudged, noDelivery, lateCount: late.length,
      refundable: sum(openClean), maybe: sum(doubtful), pastWindow: sum(strong.filter((l) => l.window === "expired")),
      spend: round2(records.reduce((t, r) => t + (r.charge && r.charge > 0 ? r.charge : 0), 0)),
      lateRate: judged ? late.length / judged : null,
      claimWindowDays: o.claimWindowDays,
    },
  };
}

function claimByText(items) {
  const dated = items.filter((l) => l.claimBy !== null);
  if (!dated.length) return "The file has no invoice date, so the last day to file is unknown; carriers set a short window, often about 15 days from the invoice.";
  const soonest = Math.min(...dated.map((l) => l.claimBy));
  return `Soonest last day to file, from the window you set: ${shortDate(soonest)}.`;
}

// ---------- outputs ----------

const csvCell = (v) => { const s = String(v ?? ""); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

export function reportCsv(a) {
  const head = ["tracking", "service", "ship_date", "promised_by", "delivered", "business_days_late", "charge", "claim_by", "status", "note"];
  const rows = a.late.map((l) => [l.tracking, l.service, dayIso(l.ship), dayIso(l.promised), dayIso(l.delivered), l.daysLate, l.charge === null ? "" : l.charge.toFixed(2), l.claimBy === null ? "" : dayIso(l.claimBy),
    l.alreadyCredited ? "already credited" : l.excusedBy ? `excused note: ${l.excusedBy}` : l.window === "expired" ? "past claim window" : l.holidayDoubt.length ? "check holiday" : "claim", l.basis]);
  return [head, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export function claimLetter(a, who = {}) {
  const items = a.late.filter((l) => !l.excusedBy && !l.alreadyCredited && l.charge !== null && l.charge > 0 && l.window !== "expired");
  const lines = [];
  lines.push(who.date || "");
  lines.push("");
  lines.push(`To: ${who.carrier || "[Carrier] customer service / account representative"}`);
  lines.push(`From: ${[who.name, who.company].filter(Boolean).join(", ") || "[Your name and company]"}`);
  lines.push(`Account number: ${who.account || "[Account number]"}`);
  lines.push("");
  lines.push("Subject: Service guarantee review request for late deliveries");
  lines.push("");
  if (!items.length) {
    lines.push("No shipments in this file were found delivered after the promised day with an open claim window, so there is nothing to request yet.");
    return lines.join("\n");
  }
  lines.push("Hello,");
  lines.push("");
  lines.push(`I reviewed my shipment records and the ${items.length} shipment${items.length > 1 ? "s" : ""} below appear to have been delivered after the day the service promised. Please review each against the service guarantee that applied when it shipped and, where it qualifies, credit the transportation charge to my account. Where one does not qualify, please tell me the reason, such as a recorded exception.`);
  lines.push("");
  for (const l of items) {
    lines.push(`- ${l.tracking || "(no tracking number)"} | ${l.service || "service not stated"} | shipped ${dayIso(l.ship)} | promised by ${dayIso(l.promised)} | delivered ${dayIso(l.delivered)} | ${l.daysLate} business day(s) late | $${money(l.charge)}`);
  }
  lines.push("");
  lines.push(`Total transportation charges on these shipments: $${money(round2(items.reduce((t, l) => t + l.charge, 0)))}.`);
  lines.push("");
  lines.push("The promised day was worked out from the ship date and the service's stated business-day transit; if your records show a different commitment for any of them, please send it. Thank you.");
  lines.push("");
  lines.push(who.name || "[Your name]");
  return lines.join("\n");
}

// Invented shipments. With no argument the dates are fixed (2026-08-03 week) so
// tests are stable; the page passes today so the sample's claim windows are
// open when it is loaded.
export function sampleCsv(today = null) {
  const shift = today === null ? 0 : (() => { let b = today - 12; b -= (dow(b) + 6) % 7; return b - toDay(2026, 8, 3); })();
  const moved = (line) => line.replace(/\d{4}-\d{2}-\d{2}/g, (x) => dayIso(parseDate(x) + shift));
  return [
    "Tracking Number,Service,Ship Date,Delivery Date,Transportation Charge,Invoice Date,Status",
    "1Z999AA10000000001,UPS Next Day Air,2026-08-03,2026-08-05,48.20,2026-08-10,Delivered",
    "1Z999AA10000000002,UPS Next Day Air,2026-08-03,2026-08-04,48.20,2026-08-10,Delivered",
    "1Z999AA10000000003,UPS 2nd Day Air,2026-08-04,2026-08-07,31.75,2026-08-10,Delivered",
    "1Z999AA10000000004,UPS 2nd Day Air,2026-08-04,2026-08-06,31.75,2026-08-10,Delivered",
    "1Z999AA10000000005,UPS 3 Day Select,2026-08-05,2026-08-11,22.40,2026-08-17,Delivered",
    "1Z999AA10000000006,UPS 3 Day Select,2026-08-05,2026-08-10,22.40,2026-08-17,Delivered",
    "1Z999AA10000000007,UPS Next Day Air,2026-08-06,2026-08-10,52.10,2026-08-17,Delivery delayed: severe weather",
    "1Z999AA10000000008,UPS Next Day Air,2026-08-06,2026-08-10,52.10,2026-08-17,Delivered",
    "1Z999AA10000000008,UPS Next Day Air,2026-08-06,2026-08-10,52.10,2026-08-17,Delivered",
    "1Z999AA10000000009,UPS 2nd Day Air,2026-06-01,2026-06-05,29.90,2026-06-10,Delivered",
    "1Z999AA10000000010,UPS Ground,2026-08-05,2026-08-14,14.10,2026-08-17,Delivered",
    "1Z999AA10000000011,UPS Next Day Air,2026-07-30,2026-08-03,49.00,2026-08-10,Delivered",
    "1Z999AA10000000011,UPS Next Day Air,2026-07-30,2026-08-03,-49.00,2026-08-17,Late delivery credit",
    "1Z999AA10000000012,UPS 2nd Day Air,2026-08-06,,31.75,2026-08-17,",
    ",,,,,,Total",
  ].map((l, i) => (i && shift ? moved(l) : l)).join("\n");
}
