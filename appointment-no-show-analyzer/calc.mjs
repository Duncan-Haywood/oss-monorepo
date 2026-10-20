// Appointment no-show analyzer: a booking-export CSV in, no-show and late-cancel
// rates, revenue lost, breakdowns and a deposit/no-show-fee estimate out.
// Everything here is deterministic arithmetic on the file and typed assumptions.
// No network, no storage, no DOM.

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const HOUR_MS = 3600000;
const DAY_MS = 86400000;
const LOW_SAMPLE = 5;

export const money = (n) => {
  const v = Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  const [i, f] = Math.abs(v).toFixed(2).split(".");
  return (v < 0 ? "-" : "") + i.replace(/\B(?=(\d{3})+$)/g, ",") + "." + f;
};
const usd = (n) => (n < 0 ? "-$" : "$") + money(Math.abs(n));
const pct = (n, d) => (d > 0 ? (n / d) * 100 : null);
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

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

// ---------- dates ----------

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };

function validDate(y, m, d) {
  if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31)) return false;
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}
const fullYear = (y) => (y < 100 ? (y <= 69 ? 2000 + y : 1900 + y) : y);

// Which of day/month comes first in slash dates. Any first part above 12 means
// day first; any second part above 12 means month first; all ambiguous means
// month first (US export) and `ambiguous` says so.
export function detectDateOrder(values) {
  let dmy = 0, mdy = 0, seen = 0;
  for (const v of values) {
    const m = String(v).match(/(?:^|[^\d])(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})(?:$|[^\d])/);
    if (!m) continue;
    seen++;
    if (+m[1] > 12) dmy++;
    if (+m[2] > 12) mdy++;
  }
  if (dmy && !mdy) return { order: "dmy", ambiguous: false };
  if (mdy && !dmy) return { order: "mdy", ambiguous: false };
  return { order: "mdy", ambiguous: seen > 0 && !dmy && !mdy };
}

function parseTimeOfDay(str) {
  let m = str.match(/(\d{1,2}):(\d{2})(?::\d{2})?(?:\.\d+)?(?:\s*([ap])\.?\s*m\b\.?)?/i);
  let at, len, h, mi, ap;
  if (m) { at = m.index; len = m[0].length; h = +m[1]; mi = +m[2]; ap = m[3]; }
  else {
    m = str.match(/(?:^|[^\d:])(\d{1,2})\s*([ap])\.?\s*m\b\.?/i);
    if (!m) return null;
    at = m.index + m[0].indexOf(m[1]); len = m[0].length - (at - m.index); h = +m[1]; mi = 0; ap = m[2];
  }
  if (ap) {
    if (h < 1 || h > 12) return { invalid: true };
    h = (h % 12) + (/p/i.test(ap) ? 12 : 0);
  }
  if (h > 23 || mi > 59) return { invalid: true };
  return { h, mi, at, len };
}

// Text -> { ms, hasTime } where ms is a wall-clock instant expressed as UTC
// milliseconds (time zones and offsets are ignored on purpose: an appointment
// at 2 PM is 2 PM). null when unreadable.
export function parseDateTime(text, order = "mdy") {
  let s = String(text ?? "").trim();
  if (!s) return null;
  const t = parseTimeOfDay(s);
  if (t && t.invalid) return null;
  let hasTime = false, h = 0, mi = 0;
  if (t) {
    hasTime = true; h = t.h; mi = t.mi;
    s = s.slice(0, t.at) + " " + s.slice(t.at + t.len);
  }
  s = s.replace(/(\d)T(?=\s|$|[-+Z])/i, "$1 ").replace(/\s(?:Z|UTC|GMT|[+-]\d{2}:?\d{2})\b/gi, " ");
  let y, mo, d, m;
  if ((m = s.match(/(?:^|[^\d])(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?!\d)/))) { y = +m[1]; mo = +m[2]; d = +m[3]; }
  else if ((m = s.match(/(?:^|[^\d])(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})(?!\d)/))) {
    const a = +m[1], b = +m[2];
    y = fullYear(+m[3]);
    if (order === "dmy") { d = a; mo = b; } else { mo = a; d = b; }
  } else if ((m = s.match(/([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/)) && MONTHS[m[1].slice(0, 3).toLowerCase()] !== undefined) {
    mo = MONTHS[m[1].slice(0, 3).toLowerCase()]; d = +m[2]; y = +m[3];
  } else if ((m = s.match(/(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})/)) && MONTHS[m[2].slice(0, 3).toLowerCase()] !== undefined) {
    d = +m[1]; mo = MONTHS[m[2].slice(0, 3).toLowerCase()]; y = +m[3];
  } else return null;
  if (!validDate(y, mo, d)) return null;
  return { ms: Date.UTC(y, mo - 1, d, h, mi), hasTime };
}

function parseTimeOnly(text) {
  const t = parseTimeOfDay(String(text ?? "").trim());
  return t && !t.invalid ? { h: t.h, mi: t.mi } : null;
}

// ---------- statuses ----------

const key = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
const NO_SHOW = new Set(["noshow", "noshows", "noshowed", "nosho", "missed", "missedappointment", "didnotattend", "didntattend", "didnotshow", "didntshow", "didnotshowup", "dna", "failedtoattend", "notattended", "clientnoshow", "customernoshow", "absent"]);
const COMPLETED = new Set(["completed", "complete", "attended", "checkedout", "checkedin", "showed", "showedup", "done", "arrived", "finished", "paid", "kept", "served", "closed", "fulfilled"]);
const CANCELLED = new Set(["cancelled", "canceled", "cancel", "cancelledbyclient", "canceledbyclient", "cancelledbycustomer", "canceledbycustomer", "cancelledbyguest", "clientcancelled", "clientcanceled", "customercancelled", "customercanceled", "latecancel", "latecancelled", "latecanceled", "latecancellation", "cancelledlate", "canceledlate"]);
const PROVIDER_CANCELLED = new Set(["cancelledbybusiness", "canceledbybusiness", "cancelledbystaff", "canceledbystaff", "cancelledbyprovider", "canceledbyprovider", "cancelledbymerchant", "canceledbymerchant", "cancelledbyowner", "canceledbyowner", "cancelledbypractitioner", "canceledbypractitioner", "providercancelled", "providercanceled", "businesscancelled", "businesscanceled", "staffcancelled", "staffcanceled", "declined", "rejected"]);
const OPEN = new Set(["booked", "confirmed", "pending", "scheduled", "upcoming", "accepted", "reserved", "unconfirmed", "requested", "rescheduled", "inprogress", "waiting", "new", "active", "open"]);

// Status text -> "noshow" | "completed" | "cancelled" | "provider" | "open" | null.
export function statusOf(text) {
  const k = key(text);
  if (!k) return null;
  if (NO_SHOW.has(k)) return "noshow";
  if (PROVIDER_CANCELLED.has(k)) return "provider";
  if (CANCELLED.has(k)) return "cancelled";
  if (COMPLETED.has(k)) return "completed";
  if (OPEN.has(k)) return "open";
  if (/noshow|didnotattend|didntattend|didnotshow|didntshow/.test(k)) return "noshow";
  if (/cancel/.test(k)) return /(business|staff|provider|merchant|owner|practitioner|stylist|barber|therapist|doctor|clinic|salon|studio)/.test(k) ? "provider" : "cancelled";
  return null;
}

// ---------- normalising a booking export ----------

const ALIASES = {
  client: ["client", "clientname", "customer", "customername", "name", "patient", "patientname", "student", "studentname", "guest", "guestname", "attendee", "invitee", "inviteename", "fullname", "contact"],
  first: ["firstname", "first", "clientfirstname", "customerfirstname"],
  last: ["lastname", "last", "surname", "clientlastname", "customerlastname"],
  email: ["email", "clientemail", "customeremail", "emailaddress", "inviteeemail", "patientemail"],
  service: ["service", "servicename", "services", "appointmenttype", "type", "eventtype", "eventtypename", "treatment", "session", "sessiontype", "product", "class", "lesson", "item", "servicetype"],
  start: ["start", "starttime", "startdate", "startdatetime", "date", "datetime", "appointmentdate", "appointmentdatetime", "appointmenttime", "scheduled", "scheduledtime", "scheduleddate", "when", "eventstartdate", "eventstarttime", "eventstart", "bookingdate", "bookingtime", "appointmentstart"],
  time: ["time", "starttime", "appointmenttime", "timeslot", "slot", "hour", "eventtime"],
  status: ["status", "appointmentstatus", "bookingstatus", "state", "outcome", "attendance", "result", "eventstatus"],
  price: ["price", "serviceprice", "amount", "total", "cost", "fee", "rate", "charge", "revenue", "servicecost", "appointmentprice", "value", "paid", "amountpaid", "totalprice", "baseprice"],
  created: ["created", "createdat", "createddate", "createdon", "datecreated", "booked", "bookedat", "bookedon", "datebooked", "bookingcreated", "bookingcreatedat", "bookingcreateddate", "scheduledon", "scheduledat", "madeon", "requestedat"],
  cancelledAt: ["cancelledat", "canceledat", "cancelleddate", "canceleddate", "cancelledon", "canceledon", "datecancelled", "datecanceled", "cancellationdate", "cancellationtime", "cancellationdatetime", "cancelledtime", "canceledtime", "cancelleddatetime", "canceleddatetime", "timecancelled", "timecanceled"],
  id: ["id", "appointmentid", "bookingid", "confirmation", "confirmationnumber", "confirmationcode", "reference", "referencenumber", "uuid", "eventid", "reservationid", "ref"],
};
// Longer, more specific aliases win when two fields could claim the same header.
const FIELD_ORDER = ["status", "cancelledAt", "created", "email", "first", "last", "id", "service", "price", "client"];

// Header row -> { field: columnIndex, startCands: [indexes] }. Start and time
// share aliases ("Start Time" can be a date-time or just a clock time), so they
// are returned as candidates and chosen against the data.
function findColumns(header) {
  const norm = header.map(key);
  const cols = {};
  const used = new Set();
  for (const f of FIELD_ORDER) {
    for (const a of ALIASES[f]) {
      const at = norm.findIndex((h, i) => h === a && !used.has(i));
      if (at !== -1) { cols[f] = at; used.add(at); break; }
    }
  }
  const startCands = [];
  for (const a of [...ALIASES.start, ...ALIASES.time]) {
    norm.forEach((h, i) => { if (h === a && !used.has(i) && !startCands.includes(i)) startCands.push(i); });
  }
  return { cols, startCands };
}

function parseMoney(text, decimalComma) {
  let s = String(text ?? "").trim();
  if (!s) return { blank: true };
  if (/^(free|comp|complimentary|no charge)$/i.test(s)) return { value: 0 };
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  s = s.replace(/[\s$£€¥]|USD|GBP|EUR|CAD|AUD/gi, "");
  if (s.startsWith("-")) { neg = !neg; s = s.slice(1); }
  if (decimalComma) s = s.replace(/\./g, "").replace(",", ".");
  else s = s.replace(/,(?=\d{3}(\D|$))/g, "");
  if (!/^\d+(\.\d+)?$|^\.\d+$/.test(s)) return { bad: true };
  const v = parseFloat(s);
  return { value: neg ? -v : v };
}

// table rows -> { records, skipped, duplicates, columns, error, ... }.
// A record is { line, client, clientKey, service, start, hour, dow, status,
// rawStatus, price, priceSource, createdMs, cancelledMs }; `start` is wall-clock
// UTC ms. Duplicate rows (same id, or same client+service+start+status+price)
// are skipped and counted.
export function normalizeBookings(parsed, { dateOrder = "auto", decimalComma = false } = {}) {
  const { rows, lines } = parsed;
  const base = { records: [], skipped: [], duplicates: 0, columns: {}, dateOrder: "mdy", ambiguousDates: false, hasTime: false, hasPrice: false, hasCreated: false, hasCancelledAt: false, hasClient: false };
  if (!rows.length) return { ...base, error: "The file is empty." };
  let h = -1, found = null;
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const f = findColumns(rows[i]);
    if (f.cols.status !== undefined && f.startCands.length) { h = i; found = f; break; }
  }
  if (h === -1) return { ...base, error: "No header row found. Expected at least a status column (for example “Status”) and a start date column (for example “Start Time” or “Date”), as in a booking export from Square Appointments, Acuity, Calendly, Vagaro, Fresha or Booksy." };
  const cols = found.cols;
  const dataRows = rows.slice(h + 1);
  const sample = dataRows.slice(0, 60);
  // Start = the candidate column with the most readable dates; a leftover
  // candidate holding only clock times becomes the separate time column.
  const dateHits = (c) => sample.filter((r) => parseDateTime(r[c], "mdy")).length;
  cols.start = found.startCands.reduce((best, c) => (dateHits(c) > dateHits(best) ? c : best), found.startCands[0]);
  const timeOnly = (c) => sample.filter((r) => !parseDateTime(r[c], "mdy") && parseTimeOnly(r[c])).length;
  const timeCand = found.startCands.filter((c) => c !== cols.start).reduce((best, c) => (best === undefined || timeOnly(c) > timeOnly(best) ? c : best), undefined);
  if (timeCand !== undefined && timeOnly(timeCand) > 0) cols.time = timeCand;

  const get = (r, f) => (cols[f] === undefined ? "" : String(r[cols[f]] ?? "").trim());
  const header = rows[h];
  const columns = {};
  for (const [f, at] of Object.entries(cols)) columns[f] = String(header[at]).trim();
  const timeSep = cols.time;

  const detected = detectDateOrder(dataRows.flatMap((r) => [get(r, "start"), get(r, "created"), get(r, "cancelledAt")]));
  const order = dateOrder === "dmy" || dateOrder === "mdy" ? dateOrder : detected.order;
  const ambiguousDates = dateOrder === "auto" || !dateOrder ? detected.ambiguous : false;

  const records = [], skipped = [], seen = new Set();
  let duplicates = 0, hasTime = false, pricesSeen = 0, createdSeen = 0, cancelledSeen = 0;
  for (let i = 0; i < dataRows.length; i++) {
    const r = dataRows[i], line = lines[h + 1 + i];
    const rawStatus = get(r, "status");
    const status = statusOf(rawStatus);
    if (!status) { skipped.push({ line, reason: rawStatus ? `status “${rawStatus}” not recognised` : "no status" }); continue; }
    const startText = get(r, "start");
    let dt = parseDateTime(startText, order);
    if (!dt) { skipped.push({ line, reason: startText ? `start date “${startText}” not readable` : "no start date" }); continue; }
    if (!dt.hasTime && timeSep !== undefined) {
      const tm = parseTimeOnly(String(r[timeSep] ?? ""));
      if (tm) dt = { ms: dt.ms + tm.h * HOUR_MS + tm.mi * 60000, hasTime: true };
    }
    if (dt.hasTime) hasTime = true;
    const c = get(r, "created") ? parseDateTime(get(r, "created"), order) : null;
    const x = get(r, "cancelledAt") ? parseDateTime(get(r, "cancelledAt"), order) : null;
    if (c) createdSeen++;
    if (x && (status === "cancelled" || status === "provider")) cancelledSeen++;
    let price = null;
    if (cols.price !== undefined) {
      const p = parseMoney(get(r, "price"), decimalComma);
      if (p.value !== undefined && p.value >= 0) { price = p.value; pricesSeen++; }
    }
    let name = get(r, "client");
    if (!name && (cols.first !== undefined || cols.last !== undefined)) name = `${get(r, "first")} ${get(r, "last")}`.replace(/\s+/g, " ").trim();
    name = name.replace(/\s+/g, " ");
    const email = get(r, "email").toLowerCase();
    const clientKey = email || (name ? name.toLowerCase().replace(/\s+/g, " ") : "");
    const service = get(r, "service") || "(no service named)";
    const d = new Date(dt.ms);
    const rec = {
      line, client: name || email || "(unknown client)", clientKey, service, start: dt.ms,
      hasTime: dt.hasTime, hour: dt.hasTime ? d.getUTCHours() : null, dow: (d.getUTCDay() + 6) % 7,
      status, rawStatus, price, priceSource: price === null ? "missing" : "file",
      createdMs: c ? c.ms : null, cancelledMs: x ? x.ms : null,
    };
    const id = get(r, "id");
    const dupKey = id ? `id:${id}` : [clientKey, service.toLowerCase(), dt.ms, status, price].join("|");
    if (seen.has(dupKey)) { duplicates++; skipped.push({ line, reason: "duplicate row" }); continue; }
    seen.add(dupKey);
    records.push(rec);
  }
  // A date-only export often carries 00:00 on every row; that is not a time of day.
  if (hasTime && records.every((r) => r.start % DAY_MS === 0)) { hasTime = false; for (const r of records) { r.hasTime = false; r.hour = null; } }
  if (!records.length) return { ...base, skipped, columns, duplicates, error: "No usable booking rows were found. " + (skipped[0] ? `First problem: line ${skipped[0].line}, ${skipped[0].reason}.` : "") };
  return {
    records, skipped, duplicates, columns, dateOrder: order, ambiguousDates, hasTime,
    hasPrice: cols.price !== undefined && pricesSeen > 0, hasCreated: createdSeen > 0, hasCancelledAt: cancelledSeen > 0, hasClient: cols.client !== undefined || cols.email !== undefined || cols.first !== undefined,
  };
}

// ---------- analysis ----------

const num = (v, d) => (v === undefined || v === null || v === "" ? d : Number(v));

function bucketStats(list) {
  const base = list.length;
  const ns = list.filter((r) => r.status === "noshow");
  const late = list.filter((r) => r.late);
  const lost = ns.reduce((a, r) => a + r.priceUsed, 0);
  const lateLost = late.reduce((a, r) => a + r.priceUsed, 0);
  return {
    bookings: base, noShows: ns.length, lateCancels: late.length,
    noShowRate: pct(ns.length, base), lateCancelRate: pct(late.length, base),
    lostRevenue: round2(lost), lateCancelRevenue: round2(lateLost),
    lowSample: base < LOW_SAMPLE,
  };
}

function group(list, keyFn, order) {
  const map = new Map();
  for (const r of list) {
    const k = keyFn(r);
    if (k === null || k === undefined) continue;
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(r);
  }
  const keys = order ? order.filter((k) => map.has(k)) : [...map.keys()];
  return keys.map((k) => ({ key: k, ...bucketStats(map.get(k)) }));
}

const worstOf = (rows) => {
  const ok = rows.filter((r) => !r.lowSample && r.noShowRate !== null);
  if (ok.length < 2) return null;
  return ok.reduce((a, b) => (b.noShowRate > a.noShowRate ? b : a));
};

export function hourLabel(h) {
  const ap = h < 12 ? "AM" : "PM";
  return `${h % 12 === 0 ? 12 : h % 12} ${ap}`;
}

// records -> report. Options (all numbers): noticeHours (late-cancel window,
// default 24), defaultPrice (placeholder price for rows with none), minNoShows
// (repeat-offender threshold, default 2), feePct, preventPct, collectPct
// (the deposit/fee what-if; user assumptions).
export function analyze(records, opts = {}) {
  const noticeHours = num(opts.noticeHours, 24);
  const defaultPrice = num(opts.defaultPrice, 0);
  const minNoShows = num(opts.minNoShows, 2);
  const feePct = num(opts.feePct, 25);
  const preventPct = num(opts.preventPct, 30);
  const collectPct = num(opts.collectPct, 100);
  if (!Number.isFinite(noticeHours) || noticeHours < 0 || noticeHours > 24 * 60) return { invalid: "The late-cancel notice window must be between 0 and 1,440 hours." };
  if (!Number.isFinite(defaultPrice) || defaultPrice < 0) return { invalid: "The default price must be zero or more." };
  if (!Number.isFinite(minNoShows) || minNoShows < 1) return { invalid: "The repeat-offender threshold must be at least 1 no-show." };
  for (const [n, v] of [["fee", feePct], ["prevented no-shows", preventPct], ["fee collected", collectPct]]) {
    if (!Number.isFinite(v) || v < 0 || v > 100) return { invalid: `The ${n} percentage must be between 0 and 100.` };
  }
  if (!records.length) return { invalid: "There are no bookings to analyze." };

  // Service average price from rows that carry one, else the typed placeholder.
  const sums = new Map();
  for (const r of records) if (r.price !== null) { const s = sums.get(r.service) || { t: 0, n: 0 }; s.t += r.price; s.n++; sums.set(r.service, s); }
  const priced = records.map((r) => {
    const s = sums.get(r.service);
    if (r.price !== null) return { ...r, priceUsed: r.price, priceSource: "file" };
    if (s) return { ...r, priceUsed: s.t / s.n, priceSource: "service average" };
    return { ...r, priceUsed: defaultPrice, priceSource: "placeholder" };
  });

  const counts = { completed: 0, noshow: 0, cancelled: 0, provider: 0, open: 0 };
  for (const r of priced) counts[r.status]++;
  // Base: bookings that reached a client-side outcome. Provider-cancelled and
  // still-open bookings are left out of every rate and counted separately.
  const base = priced.filter((r) => r.status === "completed" || r.status === "noshow" || r.status === "cancelled").map((r) => {
    let notice = null, late = false, noticeKnown = true;
    if (r.status === "cancelled") {
      if (r.cancelledMs !== null) {
        notice = (r.start - r.cancelledMs) / HOUR_MS;
        late = notice < noticeHours;
      } else noticeKnown = false;
    }
    const lead = r.createdMs !== null ? (r.start - r.createdMs) / HOUR_MS : null;
    return { ...r, notice, late, noticeKnown, lead };
  });

  const overall = bucketStats(base);
  const cancelledAll = base.filter((r) => r.status === "cancelled");
  const cancelledUnknown = cancelledAll.filter((r) => !r.noticeKnown).length;
  const earlyCancels = cancelledAll.filter((r) => r.noticeKnown && !r.late).length;
  const hasTime = base.some((r) => r.hasTime);
  const hasLead = base.some((r) => r.lead !== null && r.lead >= 0);

  const byWeekday = group(base, (r) => r.dow, [0, 1, 2, 3, 4, 5, 6]).map((g) => ({ ...g, label: DAYS[g.key] }));
  const byHour = hasTime ? group(base.filter((r) => r.hour !== null), (r) => r.hour, [...Array(24).keys()]).map((g) => ({ ...g, label: hourLabel(g.key) })) : [];
  const byService = group(base, (r) => r.service).map((g) => ({ ...g, label: g.key })).sort((a, b) => b.lostRevenue - a.lostRevenue || b.bookings - a.bookings || a.label.localeCompare(b.label));
  const LEADS = [["Under 2 days", (l) => l < 48], ["2 to 14 days", (l) => l >= 48 && l < 14 * 24], ["Over 14 days", (l) => l >= 14 * 24]];
  const byLead = hasLead ? LEADS.map(([label, test]) => ({ label, key: label, ...bucketStats(base.filter((r) => r.lead !== null && r.lead >= 0 && test(r.lead))) })).filter((g) => g.bookings > 0) : [];

  // Repeat offenders.
  const clients = new Map();
  for (const r of base) {
    if (!r.clientKey) continue;
    if (!clients.has(r.clientKey)) clients.set(r.clientKey, { client: r.client, list: [] });
    clients.get(r.clientKey).list.push(r);
  }
  const offenders = [...clients.values()].map((c) => ({ client: c.client, ...bucketStats(c.list) })).filter((c) => c.noShows >= minNoShows)
    .sort((a, b) => b.lostRevenue - a.lostRevenue || b.noShows - a.noShows || a.client.localeCompare(b.client));
  const offenderNoShows = offenders.reduce((t, c) => t + c.noShows, 0);
  const offenderLost = round2(offenders.reduce((t, c) => t + c.lostRevenue, 0));

  // Period covered.
  const starts = base.map((r) => r.start);
  const spanDays = Math.max(1, Math.round((Math.max(...starts) - Math.min(...starts)) / DAY_MS) + 1);
  const firstDay = new Date(Math.min(...starts)).toISOString().slice(0, 10);
  const lastDay = new Date(Math.max(...starts)).toISOString().slice(0, 10);

  // Deposit / no-show-fee what-if. Assumptions, not forecasts:
  //  - a prevented no-show or late cancel becomes an attended visit at the same price;
  //  - each remaining one pays fee% of its price, on collect% of them.
  const p = preventPct / 100, f = feePct / 100, c = collectPct / 100;
  const nsLost = overall.lostRevenue, lateLost = overall.lateCancelRevenue;
  const recoveredVisits = round2((nsLost + lateLost) * p);
  const feesCollected = round2((nsLost + lateLost) * (1 - p) * f * c);
  const total = round2(recoveredVisits + feesCollected);
  const whatIf = {
    feePct, preventPct, collectPct, noShowLost: nsLost, lateCancelLost: lateLost,
    recoveredVisits, feesCollected, total,
    noShowsPrevented: round2(overall.noShows * p), lateCancelsPrevented: round2(overall.lateCancels * p),
    perYear: spanDays >= 28 ? round2((total * 365) / spanDays) : null,
    shareOfLost: nsLost + lateLost > 0 ? (total / (nsLost + lateLost)) * 100 : null,
  };

  const src = { file: 0, "service average": 0, placeholder: 0 };
  for (const r of base) src[r.priceSource]++;
  const priceNoShowPlaceholder = base.filter((r) => r.status === "noshow" && r.priceSource !== "file").length;

  const summary = { ...overall, completed: base.filter((r) => r.status === "completed").length, cancelled: cancelledAll.length, earlyCancels, cancelledUnknown, providerCancelled: counts.provider, open: counts.open, spanDays, firstDay, lastDay, priceSources: src, noticeHours, defaultPrice, hasTime, hasLead, unfilledRate: pct(overall.noShows + overall.lateCancels, overall.bookings) };

  const findings = [];
  const w = worstOf(byWeekday), hr = worstOf(byHour), sv = worstOf(byService), ld = worstOf(byLead);
  const rate = (x) => x.noShowRate.toFixed(1) + "%";
  if (overall.noShows === 0) findings.push({ severity: "info", title: "No no-shows in this file", detail: "Nothing in the file is marked as a no-show. If your system records missed appointments under a different status word, check the “Status values read” line below the tables." });
  if (w && w.noShowRate > overall.noShowRate) findings.push({ severity: "medium", title: `${w.label}s have the highest no-show rate`, detail: `${rate(w)} of ${w.bookings} booking(s), against ${rate(overall)} overall. Buckets under ${LOW_SAMPLE} bookings are ignored for this comparison.` });
  if (hr && hr.noShowRate > overall.noShowRate) findings.push({ severity: "medium", title: `${hr.label} appointments are missed most`, detail: `${rate(hr)} of ${hr.bookings} booking(s) starting in that hour, against ${rate(overall)} overall.` });
  if (sv && sv.noShowRate > overall.noShowRate) findings.push({ severity: "info", title: `${sv.label} has the highest no-show rate by service`, detail: `${rate(sv)} of ${sv.bookings} booking(s), against ${rate(overall)} overall.` });
  if (ld && ld.noShowRate > overall.noShowRate) findings.push({ severity: "medium", title: `Lead time matters: ${ld.label.toLowerCase()} bookings miss most`, detail: `${rate(ld)} of ${ld.bookings} booking(s), against ${rate(overall)} overall.` });
  if (offenders.length) findings.push({ severity: "high", title: `${offenders.length} client(s) with ${minNoShows}+ no-shows account for ${offenderNoShows} of ${overall.noShows} no-shows`, detail: `They cost ${usd(offenderLost)} of the ${usd(nsLost)} lost. Names are listed below and stay on this device.` });
  if (!hasTime) findings.push({ severity: "info", title: "No appointment times in the file", detail: "The hour-of-day table needs a start time. The file only carried dates." });
  if (!hasLead) findings.push({ severity: "info", title: "No booked-on column, so no lead-time table", detail: "Add the column your system calls Created, Booked On or Date Booked to see whether far-out bookings are missed more." });
  if (cancelledAll.length && cancelledUnknown === cancelledAll.length) findings.push({ severity: "medium", title: "Late cancellations cannot be told apart", detail: `${cancelledUnknown} cancellation(s) have no cancelled-at date, so the ${noticeHours}-hour notice window cannot be applied. They are counted as cancellations, not as late cancels, and no revenue is attributed to them.` });
  else if (cancelledUnknown) findings.push({ severity: "info", title: `${cancelledUnknown} cancellation(s) have no cancelled-at date`, detail: "Those are counted as cancellations of unknown notice, not as late cancels." });
  if (src.placeholder + src["service average"] > 0) findings.push({ severity: src.placeholder ? "medium" : "info", title: src.placeholder ? `${src.placeholder} booking(s) use the ${usd(defaultPrice)} placeholder price` : `${src["service average"]} booking(s) with no price use their service's average`, detail: `The default price is a placeholder, not a measurement.${src.placeholder ? " Revenue figures that include these rows are only as good as that number." : ""}${priceNoShowPlaceholder ? ` ${priceNoShowPlaceholder} of the no-shows are priced this way.` : ""}` });
  if (counts.provider || counts.open) findings.push({ severity: "info", title: "Some bookings are left out of every rate", detail: `${counts.provider} cancelled by the business and ${counts.open} still open (booked, confirmed or pending) were not counted.` });

  return { summary, byWeekday, byHour, byService, byLead, offenders, offenderNoShows, offenderLost, whatIf, findings, minNoShows, LOW_SAMPLE };
}

// ---------- outputs ----------

const csvCell = (v) => {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function reportCsv(a) {
  const head = ["Group", "Bucket", "Bookings", "No-shows", "No-show rate %", "Late cancels", "Late cancel rate %", "Revenue lost to no-shows", "Late-cancel revenue at risk"];
  const out = [head];
  const push = (g, label, x) => out.push([g, label, x.bookings, x.noShows, x.noShowRate === null ? "" : x.noShowRate.toFixed(1), x.lateCancels, x.lateCancelRate === null ? "" : x.lateCancelRate.toFixed(1), x.lostRevenue.toFixed(2), x.lateCancelRevenue.toFixed(2)]);
  push("Overall", "All bookings", a.summary);
  for (const r of a.byWeekday) push("Weekday", r.label, r);
  for (const r of a.byHour) push("Hour", r.label, r);
  for (const r of a.byService) push("Service", r.label, r);
  for (const r of a.byLead) push("Lead time", r.label, r);
  for (const r of a.offenders) push("Repeat offender", r.client, r);
  return out.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export function summaryText(a) {
  const s = a.summary, w = a.whatIf;
  const r = (x) => (x === null ? "n/a" : x.toFixed(1) + "%");
  const L = [];
  L.push(`Appointment no-show report, ${s.firstDay} to ${s.lastDay} (${s.spanDays} days)`);
  L.push(`${s.bookings} bookings counted: ${s.completed} attended, ${s.noShows} no-shows (${r(s.noShowRate)}), ${s.cancelled} cancelled of which ${s.lateCancels} late (${r(s.lateCancelRate)}, under ${s.noticeHours} h notice).`);
  L.push(`Revenue lost to no-shows: ${usd(s.lostRevenue)}. Late-cancel revenue at risk: ${usd(s.lateCancelRevenue)} (some of it may have been rebooked).`);
  const worst = (rows) => rows.filter((x) => !x.lowSample && x.noShowRate !== null).sort((x, y) => y.noShowRate - x.noShowRate)[0];
  const ww = worst(a.byWeekday), hh = worst(a.byHour), ss = worst(a.byService);
  if (ww) L.push(`Highest no-show weekday: ${ww.label} (${r(ww.noShowRate)}).`);
  if (hh) L.push(`Highest no-show hour: ${hh.label} (${r(hh.noShowRate)}).`);
  if (ss) L.push(`Highest no-show service: ${ss.label} (${r(ss.noShowRate)}).`);
  L.push(`Repeat offenders (${a.minNoShows}+ no-shows): ${a.offenders.length}, ${usd(a.offenderLost)} lost.`);
  L.push(`What-if (your assumptions, not a forecast): a ${w.feePct}% deposit or no-show fee that prevents ${w.preventPct}% of no-shows and late cancels and is collected on ${w.collectPct}% of the rest would recover about ${usd(w.total)} over this period` + (w.perYear !== null ? `, roughly ${usd(w.perYear)} a year.` : "."));
  if (s.priceSources.placeholder) L.push(`Note: ${s.priceSources.placeholder} booking(s) used a placeholder price of ${usd(s.defaultPrice)}.`);
  return L.join("\n");
}

// A small invented salon: fixed, deterministic rows for the "Load sample data" button.
export function sampleCsv() {
  const clients = ["Ava Martin", "Ben Ortiz", "Chloe Park", "Dev Patel", "Erin Walsh", "Felix Huang", "Grace Kim", "Hugo Diaz", "Isla Reed", "Jon Bell", "Kara Stone", "Liam Cole"];
  const services = [["Haircut", 45], ["Colour", 120], ["Beard trim", 25], ["Blow dry", 55]];
  const hours = ["9:00 AM", "10:30 AM", "12:00 PM", "2:00 PM", "3:30 PM", "5:00 PM", "6:30 PM"];
  const startHour = { "9:00 AM": 9, "10:30 AM": 10.5, "12:00 PM": 12, "2:00 PM": 14, "3:30 PM": 15.5, "5:00 PM": 17, "6:30 PM": 18.5 };
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const lines = ["Client,Email,Service,Start Time,Status,Price,Created,Cancelled At"];
  for (let i = 0; i < 230; i++) {
    const day = new Date(Date.UTC(2026, 5, 1) + Math.floor(i * 0.4) * DAY_MS);
    if (day.getUTCDay() === 0) continue;
    const c = i % 11 === 3 ? clients[1] : i % 13 === 5 ? clients[6] : clients[Math.floor(rnd() * clients.length)];
    const [svc, price] = services[Math.floor(rnd() * services.length)];
    const time = hours[Math.floor(rnd() * hours.length)];
    const [m, dd, y] = [day.getUTCMonth() + 1, day.getUTCDate(), day.getUTCFullYear()];
    const created = new Date(day.getTime() - Math.floor(rnd() * 20 + 1) * DAY_MS);
    const roll = rnd() + (i % 11 === 3 || i % 13 === 5 ? 0.25 : 0) + (time === "6:30 PM" ? 0.08 : 0);
    let status = "Completed", cancelled = "";
    if (roll > 0.9) status = "No Show";
    else if (roll > 0.8) { status = "Cancelled"; cancelled = new Date(day.getTime() + startHour[time] * HOUR_MS - Math.floor(rnd() * 40 + 1) * HOUR_MS).toISOString().slice(0, 16).replace("T", " "); }
    const email = c.toLowerCase().replace(" ", ".") + "@example.com";
    lines.push([c, email, svc, `${m}/${dd}/${y} ${time}`, status, i % 17 === 0 ? "" : price.toFixed(2), created.toISOString().slice(0, 10), cancelled].join(","));
  }
  return lines.join("\n");
}
