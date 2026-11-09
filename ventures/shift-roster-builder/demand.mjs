// Demand-driven shifts: turn an hourly sales export from a till or POS into the shift-requirement lines this tool
// schedules against, so the week is built to the traffic and not to a template. This is the staffing-to-demand step
// that paid schedulers (7shifts, Deputy, Planday) sell as "forecasting"; here it is plain arithmetic you can read:
//
//   1. average the sales in each weekday-hour over the weeks in the file (an hour with no rows on a day the file
//      covers counts as 0, so a quiet hour pulls the average down);
//   2. heads needed = max(minStaff, ceil(average sales / sales-per-labor-hour)) inside the hours the place trades
//      (the hours with any sales on that weekday, or --open/--close);
//   3. cut each day's headcount profile into shifts, layer by layer (the hours with at least 1 person, then at least
//      2, ...), each run kept between minShift and maxShift hours; a run shorter than minShift is stretched to it and the
//      stretch is reported as extra hours.
//
// No forecast model: it is the average of what you sold, so a holiday or a rainy week in the file moves it. Not
// tested on a real POS export; column names are matched by synonym, written from memory. Nothing leaves the machine.
import { splitCsvRow } from "./import-staff.mjs";
import { DAYS } from "./calc.mjs";

const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const SYN = {
  stamp: ["datetime", "date time", "timestamp", "time", "hour", "date", "sale time", "order time", "created at", "opened", "check opened", "start", "interval", "period"],
  day: ["day", "weekday", "day of week", "dow"],
  sales: ["sales", "net sales", "gross sales", "amount", "total", "revenue", "net revenue", "net amount", "sales amount", "total sales", "net sale", "gross"],
};
const isoKey = (k) => String(k).trim().replace(/^(\d{4})-(\d{1,2})-(\d{1,2})$/, (_, y, m, d) => `${y}-${+m}-${+d}`);
const DAYNAMES = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const dayOfName = (s) => DAYNAMES.indexOf(String(s).trim().toLowerCase().slice(0, 3));

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MON = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?";
const CLOCK = "(?:,?\\s+(?:at\\s+)?|[T]\\s*)(\\d{1,2})(?::\\d{2})?(?::\\d{2})?\\s*([ap]m?)?";
const MONTHNAME = new RegExp(`^${MON}\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})${CLOCK}`, "i");
const MONTHNAME_DMY = new RegExp(`^(\\d{1,2})(?:st|nd|rd|th)?\\s+${MON}\\s+(\\d{4})${CLOCK}`, "i");

// Sales cell -> number or NaN. "(12.50)" is -12.50; "1.234,50" and "12,5" use a decimal comma, "1,234" and "1,234.50" a thousands comma.
export function readAmount(raw) {
  let t = String(raw ?? "").trim();
  if (!t) return NaN;
  const neg = /^\(.*\)$/.test(t) || /^-|-$/.test(t.replace(/[$£€\s]/g, ""));
  t = t.replace(/[$£€\s()+-]/g, "");
  if (t.includes(",") && t.includes(".")) t = t.lastIndexOf(",") > t.lastIndexOf(".") ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  else if (t.includes(",")) t = /^\d{1,3}(,\d{3})+$/.test(t) ? t.replace(/,/g, "") : t.replace(",", ".");
  if (!/^\d*\.?\d+$|^\d+\.$/.test(t)) return NaN;
  return neg ? -Number(t) : Number(t);
}

// -> {day 0..6 (Monday = 0), hour 0..23, key (date or "" for no date)} or null.
function readStamp(tok, dayTok) {
  let s = String(tok || "").trim();
  // "noon" and "midnight" are hour 12 PM and 12 AM.
  s = s.replace(/\b(?:12\s*)?noon\b/i, "12 PM").replace(/\b(?:12\s*)?midnight\b/i, "12 AM");
  // "Thursday 2 PM" in one cell (no separate day column): the weekday name leads the hour.
  if (dayTok === undefined) {
    const w = /^([a-z]{3,9})\.?,?\s+(\d{1,2}(?::\d{2})?\s*(?:[ap]m?)?(?:\s*[-\u2013]\s*\d{1,2}(?::\d{2})?\s*(?:[ap]m?)?)?)$/i.exec(s);
    if (w && dayOfName(w[1]) >= 0) return readStamp(w[2], w[1]);
  }
  let m = /^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})[T\s]+(\d{1,2})(?::\d{2})?(?::\d{2})?(?:\.\d+)?\s*([ap]m?)?/i.exec(s);
  let y, mo, d, hr;
  if (m) {
    y = +m[1]; mo = +m[2]; d = +m[3]; hr = +m[4];
    // "2026-03-05 2:00 PM": a 12-hour clock must be converted, not read as 2 AM (and 12 AM is hour 0).
    if (m[5]) { if (hr < 1 || hr > 12) return null; hr = (hr % 12) + (m[5][0].toLowerCase() === "p" ? 12 : 0); }
  }
  else if ((m = /^(\d{1,2})([\/.-])(\d{1,2})[\/.-](\d{2}|\d{4})[T\s]+(\d{1,2})(?::\d{2})?(?::\d{2})?\s*([ap]m?)?/i.exec(s))) {
    y = +m[4] < 100 ? 2000 + +m[4] : +m[4];
    // A dotted date (05.03.2026) is day first, as in continental Europe; slashes and dashes stay month first unless the first number is over 12.
    if (+m[1] > 12 || m[2] === ".") { d = +m[1]; mo = +m[3]; } else { mo = +m[1]; d = +m[3]; }
    hr = +m[5];
    if (m[6]) { if (hr < 1 || hr > 12) return null; hr = (hr % 12) + (m[6][0].toLowerCase() === "p" ? 12 : 0); }
  } else if ((m = MONTHNAME.exec(s) || MONTHNAME_DMY.exec(s))) {
    // "Mar 5, 2026 2 PM" / "5 March 2026 14:00": month names (English), day first or month first.
    const dmy = /^\d/.test(s);
    const mon = MONTHS.indexOf((dmy ? m[2] : m[1]).slice(0, 3).toLowerCase());
    if (mon < 0) return null;
    y = +m[3]; mo = mon + 1; d = +(dmy ? m[1] : m[2]); hr = +m[4];
    if (m[5]) { if (hr < 1 || hr > 12) return null; hr = (hr % 12) + (m[5][0].toLowerCase() === "p" ? 12 : 0); }
  } else if (dayTok !== undefined && (m = /^(\d{1,2})(?::\d{2})?\s*([ap]m?)?(?:\s*[-\u2013to]+\s*\d{1,2}(?::\d{2})?\s*(?:[ap]m?)?)?$/i.exec(s))) {
    // An interval such as "14:00-15:00" or "2 PM - 3 PM" is read by its start.
    const di = dayOfName(dayTok);
    if (di < 0) return null;
    hr = +m[1];
    if (m[2]) { if (hr < 1 || hr > 12) return null; hr = (hr % 12) + (m[2][0].toLowerCase() === "p" ? 12 : 0); }
    return hr > 23 ? null : { day: di, hour: hr, key: "" };
  } else return null;
  if (hr > 23) return null;
  const t = new Date(Date.UTC(y, mo - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d) return null;
  return { day: (t.getUTCDay() + 6) % 7, hour: hr, key: `${y}-${mo}-${d}` };
}

// Parse the export. Returns { avg: [7][24] average sales, observed: [7] days seen per weekday, rows, skipped, notes }.
// o.skipDates: ISO dates (YYYY-MM-DD) left out entirely (a holiday, a storm, a private event).
// o.halfLife: weeks; a day's weight halves for every that many weeks it is older than the newest date in the file
// (a trend: recent weeks count more). Both are plain arithmetic on the average, not a forecast model.
export function hourlySales(text, o = {}) {
  const skip = new Set((o.skipDates || []).map(isoKey));
  const halfLife = o.halfLife === undefined ? 0 : Number(o.halfLife);
  if (o.halfLife !== undefined && !(halfLife > 0)) throw new Error("half-life must be a positive number of weeks");
  // Excel writes "sep=," as a first line when it saves a CSV for another locale; it is not a header.
  const lines = String(text || "").replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim()).filter((l, i) => !(i === 0 && /^"?sep=.?"?\s*$/i.test(l.trim())));
  const out = { avg: DAYS.map(() => new Array(24).fill(0)), observed: new Array(7).fill(0), rows: 0, skipped: [], notes: [] };
  if (lines.length < 2) { out.notes.push("Needs a header row and at least one row of sales."); return out; }
  const sep = lines[0].includes("\t") ? "\t" : lines[0].includes(";") && !lines[0].includes(",") ? ";" : ",";
  // "Net Sales (USD)" and "Sales [GBP]" are the column "Net Sales": a bracketed unit is dropped from a header.
  const head = splitCsvRow(lines[0], sep).map((h) => norm(String(h).replace(/[(\[][^)\]]*[)\]]/g, " ")));
  const find = (k) => head.findIndex((h) => SYN[k].includes(h));
  const ix = { stamp: find("stamp"), day: find("day"), sales: find("sales"), clock: -1 };
  // A separate date column and time column ("Date,Time,Net Sales" is how many POS exports come): join them into one stamp.
  const dateCol = head.findIndex((h) => ["date", "day date", "business date", "sale date", "order date"].includes(h));
  const timeCol = head.findIndex((h, i) => i !== dateCol && ["time", "hour", "sale time", "order time", "start time", "interval", "period"].includes(h));
  if (dateCol >= 0 && timeCol >= 0) { ix.stamp = dateCol; ix.clock = timeCol; }
  if (ix.sales < 0) { out.notes.push("No sales column found (looked for: " + SYN.sales.join(", ") + ")."); return out; }
  if (ix.stamp < 0) { out.notes.push("No date-time or hour column found."); return out; }
  const entries = []; // {day, hour, key, amount}
  let undated = 0, skippedDays = new Set();
  lines.slice(1).forEach((line, i) => {
    const c = splitCsvRow(line, sep);
    const amount = readAmount(c[ix.sales]);
    const stampText = ix.clock >= 0 ? `${String(c[ix.stamp] || "").trim()} ${String(c[ix.clock] || "").trim()}` : c[ix.stamp];
    const st = readStamp(stampText, ix.day >= 0 ? c[ix.day] : undefined);
    if (!st) { out.skipped.push(`row ${i + 2}: could not read the date and hour "${stampText || ""}"`); return; }
    if (!Number.isFinite(amount) || String(c[ix.sales] || "").trim() === "") { out.skipped.push(`row ${i + 2}: could not read the sales "${c[ix.sales] || ""}"`); return; }
    if (amount < 0) { out.skipped.push(`row ${i + 2}: negative sales (a refund?) skipped`); return; }
    if (st.key && skip.has(isoKey(st.key))) { skippedDays.add(st.key); return; }
    entries.push({ ...st, amount });
    if (!st.key) undated++;
    out.rows++;
  });
  const keyMs = (k) => { const [y, m, d] = k.split("-").map(Number); return Date.UTC(y, m - 1, d); };
  const newest = Math.max(0, ...entries.filter((e) => e.key).map((e) => keyMs(e.key)));
  const weightOf = (k) => (halfLife && k ? Math.pow(0.5, (newest - keyMs(k)) / 86400000 / 7 / halfLife) : 1);
  const sum = DAYS.map(() => new Array(24).fill(0));
  const dates = DAYS.map(() => new Map()); // date -> weight
  for (const e of entries) {
    const w = weightOf(e.key);
    sum[e.day][e.hour] += e.amount * w;
    if (e.key) dates[e.day].set(e.key, w);
  }
  for (let d = 0; d < 7; d++) {
    // An undated "Mon,11,300" row is already an average for that weekday-hour, so it counts one observed day.
    const wsum = [...dates[d].values()].reduce((a, b) => a + b, 0);
    out.observed[d] = dates[d].size || (sum[d].some((v) => v > 0) ? 1 : 0);
    const div = dates[d].size ? wsum : out.observed[d];
    for (let h = 0; h < 24; h++) out.avg[d][h] = div ? sum[d][h] / div : 0;
  }
  if (skippedDays.size) out.notes.push(`${skippedDays.size} day${skippedDays.size === 1 ? "" : "s"} left out (--skip-dates): ${[...skippedDays].sort().join(", ")}.`);
  if (halfLife) out.notes.push(`Recent weeks weigh more: a day's weight halves every ${halfLife} week${halfLife === 1 ? "" : "s"} back from the newest date.`);
  if (undated) out.notes.push(`${undated} rows had a weekday name instead of a date: each weekday-hour is taken as already one day's figure.`);
  const weeks = Math.max(...out.observed);
  out.notes.push(`${out.rows} rows read, up to ${weeks} day${weeks === 1 ? "" : "s"} per weekday averaged.`);
  return out;
}

// Headcount per hour per day from average sales. open/close (hour 0-24) override the hours with sales.
export function headcount(avg, observed, o = {}) {
  const splh = Number(o.splh), minStaff = o.minStaff === undefined ? 1 : Number(o.minStaff);
  if (!(splh > 0)) throw new Error("sales per labor hour must be a positive number");
  if (!Number.isInteger(minStaff) || minStaff < 0) throw new Error("minimum staff must be a whole number, 0 or more");
  const maxStaff = o.maxStaff === undefined ? 50 : Number(o.maxStaff);
  return avg.map((hours, d) => {
    if (!observed[d]) return new Array(24).fill(0);
    let lo = o.open !== undefined ? Number(o.open) : hours.findIndex((v) => v > 0);
    let hi = o.close !== undefined ? Number(o.close) : 24 - [...hours].reverse().findIndex((v) => v > 0);
    if (lo < 0 || hi > 24 || (o.open === undefined && !hours.some((v) => v > 0))) return new Array(24).fill(0);
    return hours.map((v, h) => (h >= lo && h < hi ? Math.min(maxStaff, Math.max(minStaff, Math.ceil(v / splh - 1e-9))) : 0));
  });
}

// Cut one day's headcount profile into [start, end) hour runs, minShift..maxShift hours each.
export function cutShifts(profile, minShift = 4, maxShift = 8) {
  if (!(minShift >= 1) || !(maxShift >= minShift)) throw new Error("shift length: the longest must be at least the shortest, and the shortest at least 1 hour");
  const shifts = [];
  const top = Math.max(0, ...profile);
  for (let k = 1; k <= top; k++) {
    let h = 0;
    while (h < 24) {
      if (profile[h] < k) { h++; continue; }
      let e = h;
      while (e < 24 && profile[e] >= k) e++;
      let len = e - h, s = h;
      if (len < minShift) {
        // stretch forward, then backward when the day ends first
        e = Math.min(24, s + minShift); s = e - minShift;
        if (s < 0) { s = 0; e = Math.min(24, minShift); }
        len = e - s;
      }
      const n = Math.ceil(len / maxShift);
      let at = s;
      for (let j = 0; j < n; j++) {
        const piece = Math.floor((len - (at - s)) / (n - j));
        shifts.push([at, at + piece]);
        at += piece;
      }
      h = Math.max(h + 1, e);
    }
  }
  return shifts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}

const clock = (h) => `${h === 24 ? "0" : h}:00`.replace(/^(\d):/, "$1:");

// Everything at once. Returns { shiftsText, days: [{day, needed, scheduled, shifts}], needed, scheduled, extra, sales, notes, skipped }.
export function demandShifts(text, o = {}) {
  const s = hourlySales(text, o);
  if (!s.rows) return { shiftsText: "", rows: 0, needed: 0, scheduled: 0, extra: 0, sales: 0, days: [], notes: s.notes, skipped: s.skipped };
  const prof = headcount(s.avg, s.observed, o);
  const minShift = o.minShift === undefined ? 4 : Number(o.minShift), maxShift = o.maxShift === undefined ? 8 : Number(o.maxShift);
  const days = prof.map((p, d) => {
    const shifts = cutShifts(p, minShift, maxShift);
    const needed = p.reduce((a, b) => a + b, 0);
    return { day: DAYS[d], needed, scheduled: shifts.reduce((a, [x, y]) => a + (y - x), 0), shifts, sales: s.avg[d].reduce((a, b) => a + b, 0) };
  });
  // Group identical shift lists across days: "Mon/Tue/Wed, 11:00, 15:00, 2".
  const lines = new Map();
  days.forEach((dd, d) => {
    const counts = new Map();
    for (const [a, b] of dd.shifts) counts.set(`${a}-${b}`, (counts.get(`${a}-${b}`) || 0) + 1);
    for (const [k, n] of counts) { const arr = lines.get(`${k}|${n}`) || []; arr.push(d); lines.set(`${k}|${n}`, arr); }
  });
  const rows = [...lines].map(([k, ds]) => {
    const [range, n] = k.split("|"); const [a, b] = range.split("-").map(Number);
    return { ds, a, b, n: Number(n) };
  }).sort((x, y) => x.ds[0] - y.ds[0] || x.a - y.a || x.b - y.b);
  const shiftsText = rows.map((r) => `${r.ds.map((d) => DAYS[d]).join("/")}, ${clock(r.a)}, ${clock(r.b)}, ${r.n}`).join("\n");
  const needed = days.reduce((a, d) => a + d.needed, 0), scheduled = days.reduce((a, d) => a + d.scheduled, 0);
  return { shiftsText, rows: s.rows, needed, scheduled, extra: scheduled - needed, sales: days.reduce((a, d) => a + d.sales, 0), days, notes: s.notes, skipped: s.skipped };
}
