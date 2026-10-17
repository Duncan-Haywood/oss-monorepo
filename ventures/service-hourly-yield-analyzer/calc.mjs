// Service hourly yield analyzer: a booking-export CSV in, revenue per booked
// hour by service, staff member, weekday and hour of day out, with the
// low-yield services, idle-hour value and a price-change what-if. Everything
// here is deterministic arithmetic on the file and typed assumptions.
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
  status: ["status", "appointmentstatus", "bookingstatus", "state", "outcome", "attendance", "result", "eventstatus"],
  service: ["service", "servicename", "services", "appointmenttype", "type", "eventtype", "eventtypename", "treatment", "session", "sessiontype", "product", "class", "lesson", "item", "servicetype"],
  staff: ["staff", "staffname", "stylist", "barber", "provider", "providername", "practitioner", "therapist", "technician", "employee", "employeename", "worker", "artist", "resource", "host", "teacher", "trainer", "instructor", "assignedto", "with"],
  price: ["price", "serviceprice", "amount", "total", "cost", "fee", "rate", "charge", "revenue", "servicecost", "appointmentprice", "value", "paid", "amountpaid", "totalprice", "baseprice"],
  duration: ["duration", "durationminutes", "durationmins", "durationmin", "minutes", "mins", "length", "servicelength", "servicetime", "servicedurationminutes", "appointmentlength", "sessionlength", "durationhours", "hours", "timespent", "lengthminutes", "totalduration", "totalminutes"],
  end: ["end", "endtime", "enddate", "enddatetime", "endsat", "appointmentend", "finish", "finishtime", "eventend", "eventendtime", "eventenddate", "bookingend"],
  start: ["start", "starttime", "startdate", "startdatetime", "date", "datetime", "appointmentdate", "appointmentdatetime", "appointmenttime", "scheduled", "scheduledtime", "scheduleddate", "when", "eventstartdate", "eventstarttime", "eventstart", "bookingdate", "bookingtime", "appointmentstart"],
  time: ["time", "starttime", "appointmenttime", "timeslot", "slot", "eventtime"],
  id: ["id", "appointmentid", "bookingid", "confirmation", "confirmationnumber", "confirmationcode", "reference", "referencenumber", "uuid", "eventid", "reservationid", "ref"],
};
const FIELD_ORDER = ["status", "id", "staff", "service", "price", "duration", "end"];

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
  return { cols, startCands, norm };
}

// Duration text -> minutes, or null. Accepts 45, 45 min, 1h 30m, 1:30, 1.5 hrs.
// A bare number is minutes unless the column is named in hours.
export function parseDuration(text, hoursColumn = false) {
  const s = String(text ?? "").trim().toLowerCase();
  if (!s) return null;
  let m = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (m) return +m[1] * 60 + +m[2];
  m = s.match(/^(?:(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours))?\s*(?:(\d+(?:\.\d+)?)\s*(?:m|min|mins|minute|minutes))?$/);
  if (m && (m[1] !== undefined || m[2] !== undefined)) return Math.round((m[1] ? parseFloat(m[1]) * 60 : 0) + (m[2] ? parseFloat(m[2]) : 0));
  m = s.match(/^\d+(?:\.\d+)?$/);
  if (m) return Math.round(hoursColumn ? parseFloat(s) * 60 : parseFloat(s));
  return null;
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

const MAX_MINUTES = 12 * 60;

// table rows -> { records, skipped, duplicates, columns, error, ... }.
// A record is { line, service, staff, start, hour, dow, status, price, minutes,
// durationSource }. Duplicate rows (same id, or same staff+service+start+status)
// are skipped and counted. A missing status column means every row is treated
// as a completed booking, and `hasStatus` says so.
export function normalizeBookings(parsed, { dateOrder = "auto", decimalComma = false } = {}) {
  const { rows, lines } = parsed;
  const base = { records: [], skipped: [], duplicates: 0, columns: {}, dateOrder: "mdy", ambiguousDates: false, hasStatus: false, hasStaff: false, hasTime: false, error: null };
  if (!rows.length) return { ...base, error: "The file is empty." };
  let h = -1, found = null;
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const f = findColumns(rows[i]);
    if (f.startCands.length && f.cols.price !== undefined && (f.cols.duration !== undefined || f.cols.end !== undefined)) { h = i; found = f; break; }
  }
  if (h === -1) return { ...base, error: "No header row found. Expected a start date column (for example “Start Time” or “Date”), a price column (for example “Price”) and either a duration column (for example “Duration” in minutes) or an end-time column, as in a booking or sales export from Square Appointments, Acuity, Vagaro, Fresha, Booksy, Mindbody or Jobber." };
  const cols = found.cols;
  const dataRows = rows.slice(h + 1);
  const sample = dataRows.slice(0, 60);
  const dateHits = (c) => sample.filter((r) => parseDateTime(r[c], "mdy")).length;
  cols.start = found.startCands.reduce((best, c) => (dateHits(c) > dateHits(best) ? c : best), found.startCands[0]);
  const timeOnly = (c) => sample.filter((r) => !parseDateTime(r[c], "mdy") && parseTimeOnly(r[c])).length;
  const timeCand = found.startCands.filter((c) => c !== cols.start).reduce((best, c) => (best === undefined || timeOnly(c) > timeOnly(best) ? c : best), undefined);
  if (timeCand !== undefined && timeOnly(timeCand) > 0) cols.time = timeCand;

  const get = (r, f) => (cols[f] === undefined ? "" : String(r[cols[f]] ?? "").trim());
  const header = rows[h];
  const columns = {};
  for (const [f, at] of Object.entries(cols)) columns[f] = String(header[at]).trim();
  const hoursColumn = cols.duration !== undefined && /hour|hrs/i.test(header[cols.duration]) && !/min/i.test(header[cols.duration]);

  const detected = detectDateOrder(dataRows.flatMap((r) => [get(r, "start"), get(r, "end")]));
  const order = dateOrder === "dmy" || dateOrder === "mdy" ? dateOrder : detected.order;
  const ambiguousDates = dateOrder === "auto" || !dateOrder ? detected.ambiguous : false;
  const hasStatus = cols.status !== undefined;

  const records = [], skipped = [], seen = new Set();
  let duplicates = 0, hasTime = false;
  for (let i = 0; i < dataRows.length; i++) {
    const r = dataRows[i], line = lines[h + 1 + i];
    const rawStatus = get(r, "status");
    const status = hasStatus ? statusOf(rawStatus) : "completed";
    if (!status) { skipped.push({ line, reason: rawStatus ? `status “${rawStatus}” not recognised` : "no status" }); continue; }
    const startText = get(r, "start");
    let dt = parseDateTime(startText, order);
    if (!dt) { skipped.push({ line, reason: startText ? `start date “${startText}” not readable` : "no start date" }); continue; }
    if (!dt.hasTime && cols.time !== undefined) {
      const tm = parseTimeOnly(String(r[cols.time] ?? ""));
      if (tm) dt = { ms: dt.ms + tm.h * HOUR_MS + tm.mi * 60000, hasTime: true };
    }
    if (dt.hasTime) hasTime = true;
    let minutes = null, durationSource = "missing";
    if (cols.duration !== undefined) {
      const m = parseDuration(get(r, "duration"), hoursColumn);
      if (m !== null && m > 0 && m <= MAX_MINUTES) { minutes = m; durationSource = "duration"; }
    }
    if (minutes === null && cols.end !== undefined) {
      const e = parseDateTime(get(r, "end"), order);
      if (e && e.hasTime && dt.hasTime) {
        const m = Math.round((e.ms - dt.ms) / 60000);
        if (m > 0 && m <= MAX_MINUTES) { minutes = m; durationSource = "end time"; }
      }
    }
    let price = null;
    const p = parseMoney(get(r, "price"), decimalComma);
    if (p.value !== undefined && p.value >= 0) price = p.value;
    const service = get(r, "service") || "(no service named)";
    const staff = get(r, "staff").replace(/\s+/g, " ");
    const d = new Date(dt.ms);
    const rec = {
      line, service, staff, start: dt.ms, hasTime: dt.hasTime, hour: dt.hasTime ? d.getUTCHours() : null,
      dow: (d.getUTCDay() + 6) % 7, status, rawStatus, price, minutes, durationSource,
    };
    const id = get(r, "id");
    const dupKey = id ? `id:${id}` : [staff.toLowerCase(), service.toLowerCase(), dt.ms, status, price].join("|");
    if (seen.has(dupKey)) { duplicates++; skipped.push({ line, reason: "duplicate row" }); continue; }
    seen.add(dupKey);
    records.push(rec);
  }
  if (hasTime && records.every((r) => r.start % DAY_MS === 0)) { hasTime = false; for (const r of records) { r.hasTime = false; r.hour = null; } }
  if (!records.length) return { ...base, skipped, columns, duplicates, error: "No usable booking rows were found. " + (skipped[0] ? `First problem: line ${skipped[0].line}, ${skipped[0].reason}.` : "") };
  return { records, skipped, duplicates, columns, dateOrder: order, ambiguousDates, hasStatus, hasStaff: cols.staff !== undefined, hasTime, error: null };
}

// ---------- analysis ----------

const num = (v, d) => (v === undefined || v === null || v === "" ? d : Number(v));

export function hourLabel(h) {
  const ap = h < 12 ? "AM" : "PM";
  return `${h % 12 === 0 ? 12 : h % 12} ${ap}`;
}

// A group's yield uses only bookings with both a price and a duration, so the
// hours in the denominator are the hours the dollars in the numerator came from.
function stats(list, label, totals) {
  const done = list.filter((r) => r.status === "completed");
  const usable = done.filter((r) => r.price !== null && r.minutes !== null);
  const hours = usable.reduce((a, r) => a + r.minutes, 0) / 60;
  const revenue = usable.reduce((a, r) => a + r.price, 0);
  const noShows = list.filter((r) => r.status === "noshow" && r.minutes !== null);
  return {
    label, bookings: usable.length, hours: round2(hours), revenue: round2(revenue),
    yield: hours > 0 ? round2(revenue / hours) : null,
    avgMinutes: usable.length ? Math.round(hours * 60 / usable.length) : null,
    avgPrice: usable.length ? round2(revenue / usable.length) : null,
    shareHours: totals && totals.hours > 0 ? (hours / totals.hours) * 100 : null,
    shareRevenue: totals && totals.revenue > 0 ? (revenue / totals.revenue) * 100 : null,
    noShowHours: round2(noShows.reduce((a, r) => a + r.minutes, 0) / 60),
    lowSample: usable.length < LOW_SAMPLE,
  };
}

function groupBy(records, keyFn, totals, order, labelFn) {
  const map = new Map();
  for (const r of records) {
    const k = keyFn(r);
    if (k === null || k === undefined) continue;
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(r);
  }
  const keys = order ? order.filter((k) => map.has(k)) : [...map.keys()];
  const rows = keys.map((k) => ({ key: k, ...stats(map.get(k), labelFn ? labelFn(k) : String(k), totals) }));
  return rows.filter((r) => r.bookings > 0 || r.noShowHours > 0);
}

const byYieldDesc = (a, b) => (b.yield ?? -1) - (a.yield ?? -1);

// records -> { summary, byService, byStaff, byWeekday, byHour, findings, whatIf, capacity }.
// opts: lowYieldPct (flag a service below this % of the overall yield),
// priceUpPct and volumeLossPct (the what-if), openHoursPerWeek (0 = skip).
export function analyze(records, opts = {}) {
  const lowYieldPct = num(opts.lowYieldPct, 75);
  const priceUpPct = num(opts.priceUpPct, 10);
  const volumeLossPct = num(opts.volumeLossPct, 5);
  const openHours = num(opts.openHoursPerWeek, 0);
  for (const [name, v, max] of [["Low-yield threshold", lowYieldPct, 100], ["Price increase", priceUpPct, 500], ["Volume lost", volumeLossPct, 100], ["Open hours per week", openHours, 168]]) {
    if (!Number.isFinite(v) || v < 0 || v > max) return { invalid: `${name} must be a number from 0 to ${max}.` };
  }
  const done = records.filter((r) => r.status === "completed");
  const usable = done.filter((r) => r.price !== null && r.minutes !== null);
  const totals = { hours: usable.reduce((a, r) => a + r.minutes, 0) / 60, revenue: usable.reduce((a, r) => a + r.price, 0) };
  const overall = stats(records, "All services", totals);
  const days = records.map((r) => r.start);
  const first = Math.min(...days), last = Math.max(...days);
  const spanDays = Math.floor((last - first) / DAY_MS) + 1;
  const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
  const noShowLostRevenue = round2(records.filter((r) => r.status === "noshow" && r.price !== null).reduce((a, r) => a + r.price, 0));
  const summary = {
    rows: records.length, completed: done.length, usedInYield: usable.length,
    missingPrice: done.filter((r) => r.price === null).length,
    missingDuration: done.filter((r) => r.minutes === null).length,
    noShows: records.filter((r) => r.status === "noshow").length,
    leftOut: records.filter((r) => r.status === "cancelled" || r.status === "provider" || r.status === "open").length,
    hours: overall.hours, revenue: overall.revenue, yield: overall.yield, avgPrice: overall.avgPrice, avgMinutes: overall.avgMinutes,
    noShowHours: overall.noShowHours, noShowLostRevenue,
    firstDay: iso(first), lastDay: iso(last), spanDays,
  };
  const byService = groupBy(records, (r) => r.service.toLowerCase(), totals, null, null).map((row) => ({ ...row, label: records.find((r) => r.service.toLowerCase() === row.key).service })).sort(byYieldDesc);
  const staffNamed = records.filter((r) => r.staff);
  const byStaff = groupBy(staffNamed, (r) => r.staff.toLowerCase(), totals, null, null).map((row) => ({ ...row, label: staffNamed.find((r) => r.staff.toLowerCase() === row.key).staff })).sort(byYieldDesc);
  const byWeekday = groupBy(records, (r) => r.dow, totals, [0, 1, 2, 3, 4, 5, 6], (k) => DAYS[k]);
  const byHour = groupBy(records.filter((r) => r.hour !== null), (r) => r.hour, totals, [...Array(24).keys()], hourLabel);
  const vs = (row) => (row.yield !== null && summary.yield ? (row.yield / summary.yield) * 100 : null);
  for (const list of [byService, byStaff, byWeekday, byHour]) for (const row of list) row.vsOverallPct = vs(row);

  const ranked = (rows) => rows.filter((r) => !r.lowSample && r.yield !== null);
  const findings = [];
  const svc = ranked(byService);
  if (svc.length >= 2) {
    const best = svc[0], worst = svc[svc.length - 1];
    if (worst.yield < best.yield) {
      findings.push({ severity: worst.vsOverallPct < lowYieldPct ? "high" : "info", title: `${worst.label} earns the least per hour: $${money(worst.yield)}`, detail: `That is ${Math.round(worst.vsOverallPct)}% of your overall $${money(summary.yield)} per hour, and ${worst.label} takes ${worst.shareHours.toFixed(1)}% of your booked hours for ${worst.shareRevenue.toFixed(1)}% of revenue. ${best.label} earns the most at $${money(best.yield)} per hour (${best.avgMinutes} min, $${money(best.avgPrice)} average).` });
    }
  }
  const stf = ranked(byStaff);
  if (stf.length >= 2 && stf[0].yield > stf[stf.length - 1].yield) findings.push({ severity: "info", title: `${stf[0].label} earns $${money(stf[0].yield)} per hour, ${stf[stf.length - 1].label} $${money(stf[stf.length - 1].yield)}`, detail: "Staff differ in service mix, price lists and skill, so this compares what each chair produced, not how well anyone works. Check the service mix before drawing a conclusion." });
  const hrs = ranked(byHour);
  if (hrs.length >= 3) {
    const best = hrs[0] && hrs.reduce((a, b) => (b.yield > a.yield ? b : a)), worst = hrs.reduce((a, b) => (b.yield < a.yield ? b : a));
    if (best.yield > worst.yield) findings.push({ severity: "info", title: `Bookings starting at ${best.label} earn the most per hour, ${worst.label} the least`, detail: `$${money(best.yield)} against $${money(worst.yield)} per booked hour. Start times are as written in the file; the mix of services in each slot drives this, so it does not mean the slot itself is worth less.` });
  }
  if (summary.noShows > 0 && summary.noShowHours > 0) findings.push({ severity: "medium", title: `No-shows left ${summary.noShowHours} hours of chair time empty`, detail: `${summary.noShows} no-show booking(s) with a known length, worth $${money(summary.noShowLostRevenue)} at the prices in the file. The appointment no-show analyzer breaks these down by client, weekday and hour.` });
  if (summary.missingPrice || summary.missingDuration) findings.push({ severity: "medium", title: `${summary.missingPrice + summary.missingDuration} completed booking(s) are left out of the yield`, detail: `${summary.missingPrice} had no readable price and ${summary.missingDuration} had no readable duration or end time. They are not guessed, so the hourly figures describe the ${summary.usedInYield} bookings that had both.` });

  // What-if: raise prices on flagged low-yield services by priceUpPct and lose volumeLossPct of their bookings.
  const flagged = byService.filter((r) => !r.lowSample && r.vsOverallPct !== null && r.vsOverallPct < lowYieldPct);
  const flaggedRevenue = flagged.reduce((a, r) => a + r.revenue, 0);
  const flaggedHours = flagged.reduce((a, r) => a + r.hours, 0);
  const newRevenue = flaggedRevenue * (1 + priceUpPct / 100) * (1 - volumeLossPct / 100);
  const weeks = Math.max(spanDays / 7, 1);
  const whatIf = {
    priceUpPct, volumeLossPct, lowYieldPct, flagged: flagged.map((r) => r.label),
    flaggedRevenue: round2(flaggedRevenue), flaggedHours: round2(flaggedHours),
    gain: round2(newRevenue - flaggedRevenue), freedHours: round2(flaggedHours * volumeLossPct / 100),
    gainPerYear: round2(((newRevenue - flaggedRevenue) / weeks) * 52),
  };
  // Capacity: booked hours (attended and no-show, with a known length) against typed open hours.
  const heldHours = records.filter((r) => (r.status === "completed" || r.status === "noshow") && r.minutes !== null).reduce((a, r) => a + r.minutes, 0) / 60;
  const heldPerWeek = heldHours / weeks;
  let capacity = null;
  if (openHours > 0) {
    const idle = Math.max(openHours - heldPerWeek, 0);
    capacity = {
      openHours, heldPerWeek: round2(heldPerWeek), utilizationPct: Math.min((heldPerWeek / openHours) * 100, 999), idlePerWeek: round2(idle),
      valuePerFilledHourYear: summary.yield ? round2(summary.yield * 52) : null,
      overCapacity: heldPerWeek > openHours,
    };
  }
  return { summary, overall, byService, byStaff, byWeekday, byHour, findings, whatIf, capacity, opts: { lowYieldPct, priceUpPct, volumeLossPct, openHoursPerWeek: openHours }, dateOrder: opts.dateOrder };
}

const csvCell = (v) => {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function reportCsv(a) {
  const out = [["Table", "Group", "Bookings", "Hours", "Revenue", "Revenue per hour", "Average minutes", "Average price", "Share of hours %", "Share of revenue %", "vs overall yield %", "No-show hours"]];
  const add = (table, rows) => { for (const r of rows) out.push([table, r.label, r.bookings, r.hours, r.revenue, r.yield, r.avgMinutes, r.avgPrice, r.shareHours === null ? "" : r.shareHours.toFixed(1), r.shareRevenue === null ? "" : r.shareRevenue.toFixed(1), r.vsOverallPct === null || r.vsOverallPct === undefined ? "" : r.vsOverallPct.toFixed(0), r.noShowHours]); };
  add("Service", a.byService); add("Staff", a.byStaff); add("Weekday", a.byWeekday); add("Hour", a.byHour);
  return out.map((r) => r.map(csvCell).join(",")).join("\n");
}

export function summaryText(a) {
  const s = a.summary, w = a.whatIf;
  const L = [`Service hourly yield, ${s.firstDay} to ${s.lastDay} (${s.spanDays} days)`];
  L.push(`${s.usedInYield} completed bookings with a price and a length: $${money(s.revenue)} over ${s.hours} hours = $${money(s.yield ?? 0)} per booked hour (average ${s.avgMinutes} min, $${money(s.avgPrice ?? 0)}).`);
  const rank = a.byService.filter((r) => r.yield !== null);
  if (rank.length) L.push("By service: " + rank.slice(0, 8).map((r) => `${r.label} $${money(r.yield)}/h${r.lowSample ? " (few bookings)" : ""}`).join("; ") + ".");
  if (a.byStaff.length) L.push("By staff: " + a.byStaff.filter((r) => r.yield !== null).slice(0, 8).map((r) => `${r.label} $${money(r.yield)}/h`).join("; ") + ".");
  if (w.flagged.length) L.push(`What-if (my assumptions): +${w.priceUpPct}% price on ${w.flagged.join(", ")} with ${w.volumeLossPct}% fewer bookings = ${w.gain >= 0 ? "+" : "-"}$${money(Math.abs(w.gain))} over this file's period, about $${money(w.gainPerYear)} a year.`);
  if (a.capacity) L.push(`Capacity: ${a.capacity.heldPerWeek} booked hours a week of ${a.capacity.openHours} open (${a.capacity.utilizationPct.toFixed(0)}%).`);
  L.push("Estimates from the exported file and typed assumptions; not advice.");
  return L.join("\n");
}

// An invented salon: 3 stylists, 5 services with deliberately different yields.
export function sampleCsv() {
  const services = [["Haircut", 45, 30], ["Colour", 150, 150], ["Highlights", 220, 180], ["Blow dry", 55, 45], ["Kids cut", 25, 30]];
  const staff = ["Maya", "Jordan", "Sam"];
  const times = ["9:00 AM", "10:30 AM", "12:00 PM", "2:00 PM", "3:30 PM", "5:00 PM"];
  let seed = 11;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const lines = ["Stylist,Service,Start Time,Duration (min),Status,Price"];
  for (let i = 0; i < 180; i++) {
    const day = new Date(Date.UTC(2026, 5, 1) + Math.floor(i * 0.5) * DAY_MS);
    if (day.getUTCDay() === 0) continue;
    const [svc, price, mins] = services[Math.floor(rnd() * services.length)];
    const st = staff[i % 3];
    const bump = st === "Maya" ? 1.1 : st === "Sam" ? 0.92 : 1;
    const time = times[Math.floor(rnd() * times.length)];
    const status = rnd() > 0.93 ? "No Show" : "Completed";
    lines.push([st, svc, `${day.getUTCMonth() + 1}/${day.getUTCDate()}/${day.getUTCFullYear()} ${time}`, mins, status, (price * bump).toFixed(2)].join(","));
  }
  return lines.join("\n");
}
