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
// No forecast model: it is the average of what you sold, so a holiday or a rainy week in the file moves it. Read on
// two real POS exports (a Korean bakery's orders, a French bakery's item lines; eval/); other column names are matched by
// synonym, written from memory. Nothing leaves the machine.
import { splitCsvRow } from "./import-staff.mjs";
import { DAYS } from "./calc.mjs";

// camelCase headers split into words first ("InvoiceDate" is "invoice date", "UnitPrice" "unit price"; 2026-11-11, the
// UCI Online Retail export could not be read before).
const norm = (s) => String(s || "").replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const SYN = {
  stamp: ["datetime", "date time", "timestamp", "time", "hour", "date", "sale time", "order time", "created at", "opened", "check opened", "start", "interval", "period", "order date", "sale date", "transaction time", "transaction date", "invoice date", "time stamp", "paid at", "closed", "check closed", "payment time"],
  day: ["day", "weekday", "day of week", "dow"],
  sales: ["sales", "net sales", "gross sales", "amount", "total", "revenue", "net revenue", "net amount", "sales amount", "total sales", "net sale", "gross", "net price", "order total", "check total", "net total", "gross total", "payment amount", "transaction amount", "subtotal", "sub total"],
};
const QTY = ["quantity", "qty", "units", "quantity sold", "units sold", "items sold", "item quantity", "qty sold"];
// A ticket, order or receipt number: with o.count "tickets" (or no sales column at all) each distinct number is one
// customer served, so staffing follows how many people came through, not how much they spent.
const TICKET = ["ticket", "ticket number", "ticket no", "ticket id", "transaction", "transaction id", "transaction number", "transaction no", "order id", "order number", "order no", "receipt", "receipt number", "receipt no", "receipt id", "check number", "check no", "check id", "bill number", "bill no", "invoice", "invoice number", "invoice no", "invoice id", "sale id", "sale number"];
const PRICE = ["unit price", "price", "item price", "price each", "selling price", "sale price", "unit price eur", "unit price euro"];
const isoKey = (k) => String(k).trim().replace(/^(\d{4})-(\d{1,2})-(\d{1,2})$/, (_, y, m, d) => `${y}-${+m}-${+d}`);
const DAYNAMES = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const dayOfName = (s) => DAYNAMES.indexOf(String(s).trim().toLowerCase().slice(0, 3));

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MON = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?";
const CLOCK = "(?:,?\\s+(?:at\\s+)?|[T]\\s*)(\\d{1,2})(?::\\d{2})?(?::\\d{2})?\\s*([ap]m?(?![a-z]))?";
const MONTHNAME = new RegExp(`^${MON}\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})${CLOCK}`, "i");
const MONTHNAME_DMY = new RegExp(`^(\\d{1,2})(?:st|nd|rd|th)?[\\s-]+${MON}[\\s-]+(\\d{4})${CLOCK}`, "i");

// Sales cell -> number or NaN. "(12.50)" is -12.50; "1.234,50" and "12,5" use a decimal comma, "1,234" and "1,234.50" a thousands comma.
export function readAmount(raw) {
  let t = String(raw ?? "").trim();
  if (!t) return NaN;
  // A currency code beside the number ("USD 40.00", "40.00 EUR") is dropped, as a symbol is.
  t = t.replace(/\b(?:usd|cad|aud|nzd|gbp|eur|chf|mxn)\b/gi, "");
  const neg = /^\(.*\)$/.test(t) || /^-|-$/.test(t.replace(/[$£€\s]/g, ""));
  t = t.replace(/[$£€\s()+-]/g, "");
  if (t.includes(",") && t.includes(".")) t = t.lastIndexOf(",") > t.lastIndexOf(".") ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  else if (t.includes(",")) t = /^\d{1,3}(,\d{3})+$/.test(t) ? t.replace(/,/g, "") : t.replace(",", ".");
  if (!/^\d*\.?\d+$|^\d+\.$/.test(t)) return NaN;
  return neg ? -Number(t) : Number(t);
}

// -> {day 0..6 (Monday = 0), hour 0..23, key (date or "" for no date)} or null.
function readStamp(tok, dayTok, dayFirst = false) {
  let s = String(tok || "").trim();
  // "noon" and "midnight" are hour 12 PM and 12 AM.
  s = s.replace(/\b(?:12\s*)?noon\b/i, "12 PM").replace(/\b(?:12\s*)?midnight\b/i, "12 AM");
  // Compact "20260305 1400", "20260305T1400" and "20260305T140000": year, month, day, then the hour.
  s = s.replace(/^(\d{4})(\d{2})(\d{2})[T\s]+(\d{2}):?(?:\d{2}){0,2}(?=\s|$|Z|[+-]\d)/, "$1-$2-$3 $4:00");
  // "Thursday 2 PM" in one cell (no separate day column): the weekday name leads the hour.
  if (dayTok === undefined) {
    const w = /^([a-z]{3,9})\.?,?\s+(\d{1,2}(?::\d{2})?\s*(?:[ap]m?(?![a-z]))?(?:\s*[-\u2013]\s*\d{1,2}(?::\d{2})?\s*(?:[ap]m?(?![a-z]))?)?)$/i.exec(s);
    if (w && dayOfName(w[1]) >= 0) return readStamp(w[2], w[1], dayFirst);
  }
  // A weekday name ahead of a full date ("Thu, 05 Mar 2026 14:00:00", "Thursday, March 5, 2026 2 PM"): the date says the day.
  s = s.replace(/^(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?,?\s+(?=.*\d{4})/i, "");
  // An Excel serial date-time (46328.5833: days since 1899-12-30, the fraction is the time of day).
  if (/^\d{5}(?:\.\d+)?$/.test(s) && +s >= 25569 && +s < 80000) {
    const ms = Math.round(+s * 1440) * 60000, t0 = new Date(Date.UTC(1899, 11, 30) + ms);
    return { day: (t0.getUTCDay() + 6) % 7, hour: t0.getUTCHours(), key: `${t0.getUTCFullYear()}-${t0.getUTCMonth() + 1}-${t0.getUTCDate()}` };
  }
  let m = /^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})[T\s]+(\d{1,2})(?::\d{2})?(?::\d{2})?(?:\.\d+)?\s*([ap]m?(?![a-z]))?/i.exec(s);
  let y, mo, d, hr;
  if (m) {
    y = +m[1]; mo = +m[2]; d = +m[3]; hr = +m[4];
    // "2026-03-05 2:00 PM": a 12-hour clock must be converted, not read as 2 AM (and 12 AM is hour 0).
    if (m[5]) { if (hr < 1 || hr > 12) return null; hr = (hr % 12) + (m[5][0].toLowerCase() === "p" ? 12 : 0); }
  }
  else if ((m = /^(\d{1,2})([\/.-])(\d{1,2})[\/.-](\d{2}|\d{4})[T\s]+(\d{1,2})(?::\d{2})?(?::\d{2})?\s*([ap]m?(?![a-z]))?/i.exec(s))) {
    y = +m[4] < 100 ? 2000 + +m[4] : +m[4];
    // A dotted date (05.03.2026) is day first, as in continental Europe; slashes and dashes stay month first unless the first number is over 12.
    if (+m[1] > 12 || m[2] === "." || dayFirst) { d = +m[1]; mo = +m[3]; } else { mo = +m[1]; d = +m[3]; }
    hr = +m[5];
    if (m[6]) { if (hr < 1 || hr > 12) return null; hr = (hr % 12) + (m[6][0].toLowerCase() === "p" ? 12 : 0); }
  } else if ((m = MONTHNAME.exec(s) || MONTHNAME_DMY.exec(s))) {
    // "Mar 5, 2026 2 PM" / "5 March 2026 14:00": month names (English), day first or month first.
    const dmy = /^\d/.test(s);
    const mon = MONTHS.indexOf((dmy ? m[2] : m[1]).slice(0, 3).toLowerCase());
    if (mon < 0) return null;
    y = +m[3]; mo = mon + 1; d = +(dmy ? m[1] : m[2]); hr = +m[4];
    if (m[5]) { if (hr < 1 || hr > 12) return null; hr = (hr % 12) + (m[5][0].toLowerCase() === "p" ? 12 : 0); }
  } else if (dayTok !== undefined && (m = /^(\d{1,2})(?::\d{2})?\s*([ap]m?(?![a-z]))?(?:\s*[-\u2013to]+\s*\d{1,2}(?::\d{2})?\s*(?:[ap]m?(?![a-z]))?)?$/i.exec(s))) {
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

// Read the export into dated (or weekday-only) sales entries, before any averaging.
// Returns { entries: [{day, hour, key, amount}], rows, skipped, notes, blank, undated, dayFirst, ambiguous, skippedDays }.
export function readSales(text, o = {}) {
  const skip = new Set((o.skipDates || []).map(isoKey));
  // Excel writes "sep=," as a first line when it saves a CSV for another locale; it is not a header.
  const lines = String(text || "").replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim()).filter((l, i) => !(i === 0 && /^"?sep=.?"?\s*$/i.test(l.trim())));
  const out = { entries: [], rows: 0, skipped: [], notes: [], blank: 0, undated: 0, dayFirst: false, ambiguous: false, skippedDays: new Set(), refunds: { n: 0, amount: 0 } };
  if (lines.length < 2) { out.notes.push("Needs a header row and at least one row of sales."); return out; }
  const sep = lines[0].includes("\t") ? "\t" : lines[0].includes(";") && !lines[0].includes(",") ? ";" : ",";
  // "Net Sales (USD)" and "Sales [GBP]" are the column "Net Sales": a bracketed unit is dropped from a header.
  const head = splitCsvRow(lines[0], sep).map((h) => norm(String(h).replace(/[(\[][^)\]]*[)\]]/g, " ")));
  const find = (k) => head.findIndex((h) => SYN[k].includes(h));
  const ix = { stamp: find("stamp"), day: find("day"), sales: find("sales"), clock: -1 };
  // A separate date column and time column ("Date,Time,Net Sales" is how many POS exports come): join them into one stamp.
  const dateCol = head.findIndex((h) => ["date", "day date", "business date", "sale date", "order date", "invoice date"].includes(h));
  const timeCol = head.findIndex((h, i) => i !== dateCol && ["time", "hour", "sale time", "order time", "start time", "interval", "period"].includes(h));
  if (dateCol >= 0 && timeCol >= 0) { ix.stamp = dateCol; ix.clock = timeCol; }
  // A line-item export (one row per item sold: a French bakery's "date,time,ticket_number,article,Quantity,unit_price",
  // 234,005 lines) has no total column: sales are quantity x unit price.
  if (ix.sales < 0) {
    const q = head.findIndex((h) => QTY.includes(h)), p = head.findIndex((h, i) => i !== q && (PRICE.includes(h) || /^unit price\b/.test(h)));
    if (q >= 0 && p >= 0) { ix.qty = q; ix.price = p; ix.sales = p; out.notes.push("No sales column: each row's sales are its quantity times its unit price (a line-item export)."); }
  }
  const count = o.count === undefined || o.count === "sales" ? null : String(o.count);
  if (count !== null && count !== "tickets" && count !== "rows") throw new Error('count must be "sales", "tickets" or "rows"');
  const tix = head.findIndex((h) => TICKET.includes(h));
  // Counting customers instead of money: "tickets" counts each distinct ticket number once (at its first row's hour),
  // "rows" counts every row. A file with no sales column but a ticket column is counted by ticket, with a note.
  let mode = "sales";
  if (count === "tickets") {
    if (tix < 0) { out.notes.push("No ticket, order or receipt number column found (looked for: " + TICKET.join(", ") + "). --count rows counts each row as one."); return out; }
    mode = "tickets";
  } else if (count === "rows") mode = "rows";
  else if (ix.sales < 0 && tix >= 0) { mode = "tickets"; out.notes.push(`No sales column: counting tickets instead (each distinct "${splitCsvRow(lines[0], sep)[tix].trim()}" is one customer), so the rate is tickets per labor hour.`); }
  out.count = mode;
  if (mode === "tickets" && count === "tickets") out.notes.push(`Counting tickets: each distinct "${splitCsvRow(lines[0], sep)[tix].trim()}" is one customer, so the rate is tickets per labor hour.`);
  if (mode === "rows") out.notes.push("Counting rows: each row is one customer, so the rate is rows per labor hour.");
  if (mode !== "sales") { ix.sales = -1; delete ix.qty; delete ix.price; out.notes = out.notes.filter((n) => !n.startsWith("No sales column: each row's sales")); }
  const seenTickets = new Set();
  if (mode === "sales" && ix.sales < 0) { out.notes.push("No sales column found (looked for: " + SYN.sales.join(", ") + "). --count tickets counts customers by a ticket, order or receipt number column instead; --count rows counts each row."); return out; }
  if (ix.stamp < 0) { out.notes.push("No date-time or hour column found."); return out; }
  // A slash or dash date whose first number is over 12 somewhere in the file (25/03/2026) means the whole file is day first;
  // one whose second number is over 12 means month first. With neither, 05/03/2026 is ambiguous: month first, and a note says so.
  let dayFirst = false, monthFirst = false, ambiguous = false;
  for (const line of lines.slice(1)) {
    const t = String(splitCsvRow(line, sep)[ix.stamp] || "").trim();
    const m = /^(?:[a-z]+[.,]?\s+)?(\d{1,2})([\/-])(\d{1,2})\2(\d{2}|\d{4})(?!\d)/i.exec(t);
    if (!m) continue;
    if (+m[1] > 12) dayFirst = true; else if (+m[3] > 12) monthFirst = true; else if (+m[1] !== +m[3]) ambiguous = true;
  }
  if (monthFirst) dayFirst = false;
  out.dayFirst = dayFirst;
  out.ambiguous = ambiguous && !dayFirst && !monthFirst;
  const stampOf = (c) => ix.clock >= 0 ? `${String(c[ix.stamp] || "").trim()} ${String(c[ix.clock] || "").trim()}` : c[ix.stamp];
  lines.slice(1).forEach((line, i) => {
    const c = splitCsvRow(line, sep);
    // A row of empty cells (",,,,," at the end of a real bakery export, 233 of them) is not a sale and not an error.
    if (c.every((x) => String(x ?? "").trim() === "")) { out.blank++; return; }
    if (mode !== "sales") {
      const st = readStamp(stampOf(c), ix.day >= 0 ? c[ix.day] : undefined, dayFirst);
      if (!st) { out.skipped.push(`row ${i + 2}: could not read the date and hour "${stampOf(c) || ""}"`); return; }
      if (mode === "tickets") {
        const id = String(c[tix] ?? "").trim();
        if (!id) { out.skipped.push(`row ${i + 2}: no ticket number`); return; }
        // Ticket numbers that restart each day are still distinct per date.
        const k = `${st.key}|${id}`;
        if (seenTickets.has(k)) return;
        seenTickets.add(k);
      }
      if (st.key && skip.has(isoKey(st.key))) { out.skippedDays.add(st.key); return; }
      out.entries.push({ ...st, amount: 1 });
      if (!st.key) out.undated++;
      out.rows++;
      return;
    }
    const amount = ix.qty !== undefined ? Math.round(readAmount(c[ix.qty]) * readAmount(c[ix.price]) * 100) / 100 : readAmount(c[ix.sales]);
    const stampText = ix.clock >= 0 ? `${String(c[ix.stamp] || "").trim()} ${String(c[ix.clock] || "").trim()}` : c[ix.stamp];
    const st = readStamp(stampText, ix.day >= 0 ? c[ix.day] : undefined, dayFirst);
    if (!st) { out.skipped.push(`row ${i + 2}: could not read the date and hour "${stampText || ""}"`); return; }
    if (!Number.isFinite(amount) || String(c[ix.sales] || "").trim() === "" || (ix.qty !== undefined && String(c[ix.qty] || "").trim() === "")) { out.skipped.push(`row ${i + 2}: could not read the sales "${ix.qty !== undefined ? `${c[ix.qty] || ""} x ${c[ix.price] || ""}` : c[ix.sales] || ""}"`); return; }
    // A refund or void line is counted, not listed: the French bakery file has 1,294 of them, one "skipped" line each before.
    if (amount < 0) { out.refunds.n++; out.refunds.amount += amount; return; }
    if (st.key && skip.has(isoKey(st.key))) { out.skippedDays.add(st.key); return; }
    out.entries.push({ ...st, amount });
    if (!st.key) out.undated++;
    out.rows++;
  });
  return out;
}

const keyMs = (k) => { const [y, m, d] = k.split("-").map(Number); return Date.UTC(y, m - 1, d); };
const DAY_MS = 86400000;
const WEEKDAY_NAMES = ["Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays", "Sundays"];

// Average the entries per weekday-hour. Returns { avg: [7][24], observed: [7], seen: [7][24] (dates with any sale that
// hour), closed: [{day, open, of}] (weekdays left out as rarely open), notes }.
// o.halfLife: weeks; a day's weight halves for every that many weeks it is older than o.newest (default: the newest date).
// o.keepRare: keep a weekday that traded on fewer than 1 in 4 of its dates in the span (default: treat it as closed).
// o.shortCost with o.splh: also return heads: [7][24], the newsvendor headcount (see fractileHeads), and its tail.
// o.priceCut with o.splh: return the tail only (heads stay the average's).
export function averageSales(entries, o = {}) {
  const halfLife = o.halfLife === undefined ? 0 : Number(o.halfLife);
  if (o.halfLife !== undefined && !(halfLife > 0)) throw new Error("half-life must be a positive number of weeks");
  const dated = entries.filter((e) => e.key);
  // A loop, not Math.max(...rows): spreading 234,005 rows overflowed the call stack on the French bakery file.
  let latest = 0, oldest = Infinity;
  for (const e of dated) { const t = keyMs(e.key); if (t > latest) latest = t; if (t < oldest) oldest = t; }
  const newest = o.newest !== undefined ? o.newest : latest;
  const weightOf = (k) => (halfLife && k ? Math.pow(0.5, (newest - keyMs(k)) / DAY_MS / 7 / halfLife) : 1);
  const sum = DAYS.map(() => new Array(24).fill(0));
  const dates = DAYS.map(() => new Map()); // date -> weight
  const hourDates = DAYS.map(() => Array.from({ length: 24 }, () => new Set()));
  let undatedSeen = DAYS.map(() => new Array(24).fill(0));
  for (const e of entries) {
    const w = weightOf(e.key);
    sum[e.day][e.hour] += e.amount * w;
    if (e.key) { dates[e.day].set(e.key, w); hourDates[e.day][e.hour].add(e.key); } else undatedSeen[e.day][e.hour] = 1;
  }
  const out = { avg: DAYS.map(() => new Array(24).fill(0)), observed: new Array(7).fill(0), seen: DAYS.map(() => new Array(24).fill(0)), closed: [], notes: [] };
  const spanOf = (d) => {
    const first = oldest + (((d - (new Date(oldest).getUTCDay() + 6) % 7) + 7) % 7) * DAY_MS;
    return first > newest ? 0 : Math.floor((newest - first) / DAY_MS / 7) + 1;
  };
  // The rule only applies to a regular export: the busiest weekday traded on at least half its dates in the span.
  const regular = Number.isFinite(oldest) && DAYS.some((_, d) => spanOf(d) >= 4 && dates[d].size * 2 >= spanOf(d));
  for (let d = 0; d < 7; d++) {
    // How many of this weekday's dates fall inside the file's span: a weekday with sales on only 3 of 45 (Christmas Eve on a
    // Tuesday the shop is otherwise shut) would otherwise be averaged over its 3 open dates and staffed like a full day.
    if (!o.keepRare && regular && dates[d].size) {
      const span = spanOf(d);
      if (span >= 4 && dates[d].size * 4 < span) { out.closed.push({ day: d, open: dates[d].size, of: span }); continue; }
    }
    // An undated "Mon,11,300" row is already an average for that weekday-hour, so it counts one observed day.
    const wsum = [...dates[d].values()].reduce((a, b) => a + b, 0);
    out.observed[d] = dates[d].size || (sum[d].some((v) => v > 0) ? 1 : 0);
    const div = dates[d].size ? wsum : out.observed[d];
    for (let h = 0; h < 24; h++) {
      out.avg[d][h] = div ? sum[d][h] / div : 0;
      out.seen[d][h] = hourDates[d][h].size || undatedSeen[d][h];
    }
  }
  for (const c of out.closed) out.notes.push(`${WEEKDAY_NAMES[c.day]}: sales on ${c.open} of ${c.of} in the file, so treated as closed (--keep-rare keeps it).`);
  if (o.shortCost !== undefined && o.splh) Object.assign(out, fractileHeads(entries, dates, out, o.splh, o.shortCost));
  // o.priceCut without o.shortCost: the tail alone, so the cut can price short runs at r = 1 while the heads stay the
  // average's (2026-11-11).
  else if (o.priceCut && o.splh) out.tail = fractileHeads(entries, dates, out, o.splh, 1).tail;
  return out;
}

// The short-vs-over cost weight (2026-11-11). An hour planned from the average is short about half the time: the average
// of 0, 0, 3 and 5 heads is 2, so the two busy dates were short 4 person-hours between them. If a short person-hour (a
// queue, a lost sale, a worn-out team) costs r times a spare one (pay for someone with nothing to do), the headcount that
// minimises r x short + over over the past dates is the smallest k whose share of dates needing k or fewer reaches
// r / (1 + r): the newsvendor critical fractile. r = 1 is the median; r = 3 the 75th percentile; r = 1/3 the 25th.
// Each date of the weekday counts once, with its --half-life weight, needing ceil(that date-hour's sales / splh) heads
// (0 on a date with no sale that hour). Undated weekday-average rows have no spread: those hours keep ceil(average / splh).
export function shortCostShare(r) {
  const v = Number(r);
  if (!(v > 0) || !Number.isFinite(v)) throw new Error("short cost must be a positive number (how many times a spare person-hour a short one costs)");
  return v / (1 + v);
}

// Returns { heads: [7][24], tail: [7][24] } where tail[d][h][c] is the weighted share of the weekday's dates that needed c
// or more heads at hour h (tail[d][h][0] = 1), or null for an undated weekday. cutShifts uses the tail to price the
// shortest-shift stretch against dropping a short run (see shiftCost).
function fractileHeads(entries, dates, a, splh, r) {
  const p = shortCostShare(r);
  const perDateHour = new Map(); // "key|hour" -> sales
  for (const e of entries) if (e.key) { const k = `${e.key}|${e.hour}`; perDateHour.set(k, (perDateHour.get(k) || 0) + e.amount); }
  const tail = DAYS.map(() => new Array(24).fill(null));
  const heads = DAYS.map((_, d) => {
    const row = new Array(24).fill(0);
    if (!a.observed[d]) return row;
    if (!dates[d].size) { for (let h = 0; h < 24; h++) row[h] = Math.ceil(a.avg[d][h] / splh - 1e-9); return row; }
    const ds = [...dates[d]]; // [key, weight]
    const total = ds.reduce((x, [, w]) => x + w, 0);
    for (let h = 0; h < 24; h++) {
      const need = ds.map(([k, w]) => [Math.max(0, Math.ceil((perDateHour.get(`${k}|${h}`) || 0) / splh - 1e-9)), w]).sort((x, y) => x[0] - y[0]);
      let cum = 0;
      for (const [n, w] of need) { cum += w; if (cum >= p * total - 1e-9 * total) { row[h] = n; break; } }
      const top = need.length ? need[need.length - 1][0] : 0, t = new Array(top + 2).fill(0);
      for (const [n, w] of need) t[n] += w / total;
      for (let c = top; c >= 0; c--) t[c] += t[c + 1];
      tail[d][h] = t;
    }
    return row;
  });
  return { heads, tail };
}

// Parse the export. Returns { avg: [7][24] average sales, observed: [7] days seen per weekday, seen, closed, rows, skipped, notes }.
// o.skipDates: ISO dates (YYYY-MM-DD) left out entirely (a holiday, a storm, a private event).
// o.halfLife: weeks; a day's weight halves for every that many weeks it is older than the newest date in the file
// (a trend: recent weeks count more). Both are plain arithmetic on the average, not a forecast model.
export function hourlySales(text, o = {}) {
  if (o.shortCost !== undefined) shortCostShare(o.shortCost);
  if (o.halfLife !== undefined && !(Number(o.halfLife) > 0)) throw new Error("half-life must be a positive number of weeks");
  if (o.window !== undefined && !(Number.isInteger(Number(o.window)) && Number(o.window) >= 1)) throw new Error("the last-weeks window must be a whole number of weeks, 1 or more");
  const r = readSales(text, o);
  const out = { avg: DAYS.map(() => new Array(24).fill(0)), observed: new Array(7).fill(0), seen: DAYS.map(() => new Array(24).fill(0)), closed: [], rows: r.rows, skipped: r.skipped, notes: [...r.notes], entries: r.entries, count: r.count };
  if (!r.rows && r.notes.length) return out;
  // o.window (--last-weeks): plan from the last that many weeks of dated rows only, the days before the week after the
  // newest date, as backtestSales' "last 4 weeks only" method trains (2026-11-11). Undated weekday rows are kept.
  let entries = r.entries;
  if (o.window !== undefined) {
    let latest = -Infinity;
    for (const e of entries) if (e.key) { const t = keyMs(e.key); if (t > latest) latest = t; }
    const from = latest + DAY_MS - Number(o.window) * 7 * DAY_MS;
    entries = entries.filter((e) => !e.key || keyMs(e.key) >= from);
    out.notes.push(`Planned from the last ${o.window} week${+o.window === 1 ? "" : "s"} of dated sales only (${entries.filter((e) => e.key).length} of ${r.entries.filter((e) => e.key).length} dated rows).`);
  }
  const a = averageSales(entries, o);
  Object.assign(out, { avg: a.avg, observed: a.observed, seen: a.seen, closed: a.closed, heads: a.heads, tail: a.tail });
  if (a.heads) out.notes.push(`Short-vs-over weight ${+o.shortCost}: a short person-hour counted as ${+o.shortCost} times a spare one, so each hour is staffed for ${Math.round(shortCostShare(o.shortCost) * 100)}% of its past dates, not for the average.`);
  if (r.refunds.n) out.notes.push(`${r.refunds.n} row${r.refunds.n === 1 ? "" : "s"} with negative sales (refunds or voids, ${Math.round(-r.refunds.amount * 100) / 100} in all) left out: the plan follows what was rung up.`);
  if (r.blank) out.notes.push(`${r.blank} empty row${r.blank === 1 ? "" : "s"} ignored.`);
  if (r.skippedDays.size) out.notes.push(`${r.skippedDays.size} day${r.skippedDays.size === 1 ? "" : "s"} left out (--skip-dates): ${[...r.skippedDays].sort().join(", ")}.`);
  if (o.halfLife) out.notes.push(`Recent weeks weigh more: a day's weight halves every ${o.halfLife} week${+o.halfLife === 1 ? "" : "s"} back from the newest date.`);
  if (r.dayFirst) out.notes.push("Dates read day first (a date such as 25/03/2026 in the file shows the order).");
  if (r.ambiguous) out.notes.push("Dates such as 05/03/2026 could be 5 March or May 3 and no date in the file settles it: read month first (US). If yours are day first, change the export to YYYY-MM-DD.");
  if (r.undated) out.notes.push(`${r.undated} rows had a weekday name instead of a date: each weekday-hour is taken as already one day's figure.`);
  out.notes.push(...a.notes);
  const weeks = Math.max(...out.observed);
  out.notes.push(`${out.rows} rows read, up to ${weeks} day${weeks === 1 ? "" : "s"} per weekday averaged.`);
  return out;
}

// Headcount per hour per day from average sales. open/close (hour 0-24) override the hours with sales.
// o.heads ([7][24], from averageSales with shortCost): the heads wanted per hour instead of ceil(average / splh); the
// trading day, breaks, minimum and maximum staff are set the same way.
export function headcount(avg, observed, o = {}) {
  const splh = Number(o.splh), minStaff = o.minStaff === undefined ? 1 : Number(o.minStaff);
  if (!(splh > 0)) throw new Error("sales per labor hour must be a positive number");
  if (!Number.isInteger(minStaff) || minStaff < 0) throw new Error("minimum staff must be a whole number, 0 or more");
  const maxStaff = o.maxStaff === undefined ? 50 : Number(o.maxStaff);
  return avg.map((hours, d) => {
    if (!observed[d]) return new Array(24).fill(0);
    // o.seen (dates with any sale per weekday-hour): an edge hour that traded on fewer than 1 in 20 of the weekday's dates
    // (one 23:00 order in 43 Sundays) does not stretch the trading day; o.keepRare turns this off. Nor, once the weekday
    // has 4 or more dates, does an edge hour that traded on only one of them (2026-11-11): under 21 dates the 1-in-20
    // test can never trim anything, so on the Bread Basket file (21-23 dates a weekday) one stray 22:00 or 23:00 order
    // staffed every Saturday to midnight for the whole backtest. Scored with --score-closed this cut the plain plan's
    // short + over by 12-24 person-hours a week there and 1-3 on the Korean bakery; the French one moved by 0.1.
    const trades = (h) => hours[h] > 0 && (!o.seen || o.keepRare || (o.seen[d][h] * 20 >= observed[d] && (o.seen[d][h] >= 2 || observed[d] < 4)));
    const firstH = [...Array(24).keys()].find(trades), lastH = [...Array(24).keys()].reverse().find(trades);
    let lo = o.open !== undefined ? Number(o.open) : firstH === undefined ? -1 : firstH;
    let hi = o.close !== undefined ? Number(o.close) : lastH === undefined ? 25 : lastH + 1;
    if (lo < 0 || hi > 24 || (o.open === undefined && !hours.some((v) => v > 0))) return new Array(24).fill(0);
    // A break, not a quiet hour: a run of hours inside the trading day that traded on fewer than 1 in 5 of the weekday's
    // dates, between an hour before it and an hour after it that each traded on at least half of them. The French bakery
    // shuts about 13:30-16:00: its 14:00 and 15:00 traded on 7-13% of dates (about 1 euro an hour on average), its 12:00
    // and 16:00 on 70-100%, and minimum staff there would pay people to stand in a locked shop. A shop that is quiet all
    // day has no busy neighbours, so its slow hours stay staffed. Needs 20 or more dates of that weekday; only when the
    // hours come from the file (no --open/--close) and not with --keep-rare.
    const brk = new Array(24).fill(false);
    if (o.seen && !o.keepRare && o.open === undefined && o.close === undefined && observed[d] >= 20) {
      const n = observed[d], seen = o.seen[d], rare = (h) => seen[h] * 5 < n, busy = (h) => seen[h] * 2 >= n;
      for (let h = lo + 1; h < hi - 1; h++) {
        if (!rare(h) || rare(h - 1)) continue;
        let e = h;
        while (e < hi && rare(e)) e++;
        if (e < hi && busy(h - 1) && busy(e)) for (let k = h; k < e; k++) brk[k] = true;
        h = e;
      }
    }
    const want = (v, h) => (o.heads ? o.heads[d][h] : Math.ceil(v / splh - 1e-9));
    return hours.map((v, h) => (h >= lo && h < hi && !brk[h] ? Math.min(maxStaff, Math.max(minStaff, want(v, h))) : 0));
  });
}

// Cut one day's headcount profile into [start, end) hour runs, minShift..maxShift hours each.
// cost (optional, with --short-cost): { tail: [24] (tail[h][c] = share of past dates needing c or more heads at hour h),
// r, minStaff }. Without it a run shorter than minShift is always stretched to minShift. With it, a short run above
// minimum staff is stretched only when that is cheaper in expectation than leaving it unstaffed, and to the cheapest
// window that holds it (see shiftCost); otherwise it is dropped and reported in `dropped`.
export function cutShifts(profile, minShift = 4, maxShift = 8, cost = null) {
  if (!(minShift >= 1) || !(maxShift >= minShift)) throw new Error("shift length: the longest must be at least the shortest, and the shortest at least 1 hour");
  const shifts = [], dropped = [];
  const staffed = new Array(24).fill(0);
  const top = Math.max(0, ...profile);
  for (let k = 1; k <= top; k++) {
    // cost.join (opt-in, --join): choose the whole level at once, so two short runs near each other can share one shift
    // and a short run can be folded into its neighbour (joinLevel). Off by default: on two real bakeries it lowered the
    // expected cost in sample but not on held-out weeks (README "Joining short runs", eval/join-cut.mjs).
    if (cost && cost.join === true) {
      const got = joinLevel(profile, staffed, k, minShift, maxShift, cost);
      if (got) {
        for (const [s, e] of got.blocks) {
          for (let t = s; t < e; t++) staffed[t]++;
          const len = e - s, n = Math.ceil(len / maxShift);
          let at = s;
          for (let j = 0; j < n; j++) { const piece = Math.floor((len - (at - s)) / (n - j)); shifts.push([at, at + piece]); at += piece; }
        }
        dropped.push(...got.dropped);
        continue;
      }
    }
    let h = 0;
    while (h < 24) {
      if (profile[h] < k) { h++; continue; }
      let e = h;
      while (e < 24 && profile[e] >= k) e++;
      const runEnd = e;
      let len = e - h, s = h;
      if (len < minShift && cost && k > (cost.minStaff || 0) && hasTail(cost, h, e)) {
        const c = cheapestStretch(profile, staffed, h, e, minShift, cost);
        if (!c) { dropped.push([h, e, k]); h = e; continue; }
        [s, e] = c; len = e - s;
      } else if (len < minShift) {
        // Stretch into open hours (headcount above 0) first, forward then backward, so a short run before a lunch
        // closure or at closing time is not stretched into hours the shop is shut; then forward, then backward.
        while (e - s < minShift && e < 24 && profile[e] > 0) e++;
        while (e - s < minShift && s > 0 && profile[s - 1] > 0) s--;
        if (e - s < minShift) { e = Math.min(24, s + minShift); s = e - minShift; }
        if (s < 0) { s = 0; e = Math.min(24, minShift); }
        len = e - s;
      }
      for (let t = s; t < e; t++) staffed[t]++;
      const n = Math.ceil(len / maxShift);
      let at = s;
      for (let j = 0; j < n; j++) {
        const piece = Math.floor((len - (at - s)) / (n - j));
        shifts.push([at, at + piece]);
        at += piece;
      }
      h = Math.max(h + 1, Math.max(e, runEnd));
    }
  }
  shifts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (cost) shifts.dropped = dropped;
  return shifts;
}

// One level k of the priced cut, chosen whole (2026-11-11, "Joining short runs"). The runs are the maximal stretches with
// profile >= k. Each is either staffed inside a block or, when it is shorter than minShift, above minimum staff and has
// a tail, left unstaffed. A block covers one or more consecutive runs and the gaps between them: their exact span when
// that is at least minShift long (a short run folded into a neighbouring shift, or two short runs joined), otherwise a
// minShift window holding them that does not reach into another run or the previous block. A block longer than maxShift
// is split into near-equal pieces, and must give pieces of at least minShift unless it is a single run (as before).
// Each hour a block covers costs shiftCost at one more person than is already there; leaving a run costs 0. The least
// total wins (ties: fewer runs left, fewer shut hours, fewer hours, stretches nearer the old forward one). Returns
// { blocks: [[s, e)], dropped: [[h, e, k]] }, or null when no choice is valid (the caller falls back to the old cut).
function joinLevel(profile, staffed, k, minShift, maxShift, cost) {
  const runs = [];
  for (let h = 0; h < 24;) {
    if (profile[h] < k) { h++; continue; }
    let e = h; while (e < 24 && profile[e] >= k) e++;
    runs.push([h, e]); h = e;
  }
  const R = runs.length;
  const pc = [0], ps = [0];
  for (let t = 0; t < 24; t++) { pc.push(pc[t] + shiftCost(cost, profile, t, staffed[t] + 1)); ps.push(ps[t] + (profile[t] === 0 ? 1 : 0)); }
  const droppable = runs.map(([a, b]) => b - a < minShift && k > (cost.minStaff || 0) && hasTail(cost, a, b));
  const better = (x, y) => {
    if (!y) return true;
    if (Math.abs(x.v - y.v) > 1e-12) return x.v < y.v;
    for (const f of ["nd", "shut", "hrs", "back"]) if (x[f] !== y[f]) return x[f] < y[f];
    return false;
  };
  // states[i]: Map lastEnd -> best partial plan having decided runs 0..i-1.
  const states = Array.from({ length: R + 1 }, () => new Map());
  states[0].set(0, { v: 0, nd: 0, shut: 0, hrs: 0, back: 0, blocks: [], dropped: [] });
  const put = (i, end, x) => { if (better(x, states[i].get(end))) states[i].set(end, x); };
  for (let i = 0; i < R; i++) {
    for (const [lastEnd, st] of states[i]) {
      if (droppable[i]) put(i + 1, lastEnd, { ...st, nd: st.nd + 1, dropped: [...st.dropped, [runs[i][0], runs[i][1], k]] });
      const lo = Math.max(lastEnd, i ? runs[i - 1][1] : 0);
      for (let j = i; j < R; j++) {
        const a = runs[i][0], b = runs[j][1], hi = j + 1 < R ? runs[j + 1][0] : 24;
        const span = b - a;
        // A block over several runs never covers a shut hour (a lunch closure stays unstaffed, as headcount set it).
        if (j > i && ps[b] - ps[a] > 0) break;
        const wins = span >= minShift ? [[a, b]] : [];
        if (span < minShift && i === j && !droppable[i]) {
          // A short run that must be staffed (minimum staff, or no tail) and is not joined keeps the old stretch.
          let s = a, e = b;
          while (e - s < minShift && e < 24 && profile[e] > 0) e++;
          while (e - s < minShift && s > 0 && profile[s - 1] > 0) s--;
          if (e - s < minShift) { e = Math.min(24, s + minShift); s = e - minShift; }
          if (s < 0) { s = 0; e = Math.min(24, minShift); }
          if (s >= lo && e <= hi) wins.push([s, e]);
        } else if (span < minShift) for (let s = Math.max(lo, b - minShift); s <= Math.min(a, hi - minShift); s++) if (j === i || ps[s + minShift] - ps[s] === 0) wins.push([s, s + minShift]);
        for (const [s, e] of wins) {
          const len = e - s;
          if (len > maxShift && !(i === j && s === a && e === b) && Math.floor(len / Math.ceil(len / maxShift)) < minShift) continue;
          put(j + 1, e, { v: st.v + pc[e] - pc[s], nd: st.nd, shut: st.shut + ps[e] - ps[s], hrs: st.hrs + len, back: st.back + (a - s), blocks: [...st.blocks, [s, e]], dropped: st.dropped });
        }
      }
    }
  }
  let best = null;
  for (const x of states[R].values()) if (better(x, best)) best = x;
  return best;
}

const hasTail = (cost, a, b) => { for (let t = a; t < b; t++) if (!cost.tail[t]) return false; return true; };

// Expected change in r x short + over from adding one person at hour t when c - 1 are already there: on the share q of
// past dates that needed c or more, a short hour is saved (-r); on the rest the hour is spare (+1). Hours the profile
// leaves shut (headcount 0) are priced the same way from their own sales, so a stretch into a closure pays for the
// quiet hours it covers; minimum staff counts as needed only in open hours, as in the backtest.
export function shiftCost(cost, profile, t, c) {
  const tl = cost.tail[t];
  const q = profile[t] > 0 && c <= (cost.minStaff || 0) ? 1 : tl && c < tl.length ? tl[c] : 0;
  return (1 - q) - cost.r * q;
}

// The minShift window holding [h, e) with the least expected cost, or null when leaving the run unstaffed is cheaper.
// Windows that stay inside open hours win ties over ones that reach into shut hours.
function cheapestStretch(profile, staffed, h, e, minShift, cost) {
  let keep = 0;
  for (let t = h; t < e; t++) keep += shiftCost(cost, profile, t, staffed[t] + 1);
  let best = null;
  for (let s = Math.max(0, e - minShift); s <= Math.min(h, 24 - minShift); s++) {
    let add = 0, shut = 0;
    for (let t = s; t < s + minShift; t++) if (t < h || t >= e) { add += shiftCost(cost, profile, t, staffed[t] + 1); if (profile[t] === 0) shut++; }
    const v = keep + add;
    if (!best || v < best.v - 1e-12 || (Math.abs(v - best.v) <= 1e-12 && shut < best.shut)) best = { s, v, shut };
  }
  // Staffing the window costs best.v against 0 for leaving the run (and the stretch hours) as they are; a tie keeps the
  // run staffed (2026-11-11: with the cut priced by default, a run whose stretch exactly pays for itself is not dropped).
  return best && best.v <= 1e-12 ? [best.s, best.s + minShift] : null;
}

const clock = (h) => `${h === 24 ? "0" : h}:00`.replace(/^(\d):/, "$1:");

// Everything at once. Returns { shiftsText, days: [{day, needed, scheduled, shifts}], needed, scheduled, extra, sales, notes, skipped }.
// --half-life auto: pick the weighting from the shop's own past weeks. Runs the backtest (shifts cut and scored as the
// CLI scores them, at the same short cost) for every earlier week equal and half-lives 8, 4 and 2, and keeps the one
// with the least (r x) short + over a week; a tie keeps the plain average. Needs AUTO_MIN_WEEKS tested weeks, else
// plain. Measured 2026-11-11 (eval/halflife-default.mjs, README "Picking the half-life from your own weeks"): chosen
// this way week by week on two real bakeries it was never clearly worse than the plain average in 12 settings and
// 7.4% better on average, where a fixed half-life 2 was clearly worse in 2 and half-lives 4 and 8 helped less.
export const AUTO_MIN_WEEKS = 4;
// Scored with a staffed closure as over (the default since 2026-11-12; o.scoreClosed false is the old score), "the last
// 4 weeks only" is a candidate too. Measured 2026-11-11
// (eval/window-auto.mjs, README "A 4-week window in half-life auto"), out of sample on three real bakeries: under the
// default score adding it changed nothing clearly in 18 of 18 settings (mean +0.2%, so it is not offered there); under
// --score-closed it was clearly better than the four-weighting choice in 6 of 18 and clearly worse in none (mean -16.3%,
// Bread Basket -47%).
export function pickHalfLife(text, o = {}) {
  const rc = o.shortCost === undefined ? null : Number(o.shortCost);
  const sc = o.scoreClosed !== false;
  const ids = sc ? ["hl8", "hl4", "hl2", "last4"] : ["hl8", "hl4", "hl2"];
  const pre = rc === null ? "" : "q-";
  let b;
  try { b = backtestSales(text, { ...o, halfLife: undefined, window: undefined, shifts: true, methods: rc === null ? ids : ["all", ...ids].map((x) => pre + x) }); }
  catch { return { halfLife: undefined, note: "Half-life auto: the file could not be backtested, so every earlier week weighs the same." }; }
  if (b.weeks < AUTO_MIN_WEEKS) return { halfLife: undefined, weeks: b.weeks, note: `Half-life auto: ${b.weeks} full week${b.weeks === 1 ? "" : "s"} to test on, fewer than ${AUTO_MIN_WEEKS}, so every earlier week weighs the same.` };
  const cands = b.methods.filter((m) => m.id === pre + "all" || ids.some((x) => m.id === pre + x));
  const base = cands.find((m) => m.id === pre + "all");
  const best = cands.reduce((a, m) => (m.miss < a.miss - 1e-9 ? m : a), base);
  const hl = best.halfLife, win = best.window;
  const what = hl ? `half-life ${hl} weeks` : win ? `the last ${win} weeks only` : "every earlier week weighed the same";
  const gain = base.miss - best.miss;
  const scored = sc ? " (a staffed closure scored as over)" : "";
  return { halfLife: hl, window: win, weeks: b.weeks, note: `Half-life auto: ${what}, the weighting with the least short + over on your last ${b.weeks} weeks${scored}${best !== base ? ` (${gain.toFixed(1)} person-hours a week fewer than equal weights)` : ""}. --half-life none turns it off; a number fixes it.` };
}

export function demandShifts(text, o = {}) {
  if (o.halfLife === "auto") {
    const p = pickHalfLife(text, o);
    const r = demandShifts(text, { ...o, halfLife: p.halfLife, window: p.window });
    r.notes.push(p.note); r.halfLife = p.halfLife; r.window = p.window;
    return r;
  }
  if (o.halfLife === "none" || o.halfLife === 0) o = { ...o, halfLife: undefined };
  const s = hourlySales(text, { ...o, priceCut: o.costCut !== false });
  if (!s.rows) return { shiftsText: "", rows: 0, needed: 0, scheduled: 0, extra: 0, sales: 0, days: [], notes: s.notes, skipped: s.skipped };
  const prof = headcount(s.avg, s.observed, { ...o, seen: s.seen, heads: s.heads });
  if (o.open === undefined && o.close === undefined && !o.keepRare) {
    const trimmed = [];
    s.avg.forEach((hours, d) => hours.forEach((v, h) => { if (v > 0 && prof[d][h] === 0 && s.observed[d]) trimmed.push(`${DAYS[d]} ${h}:00 (${s.seen[d][h]} of ${s.observed[d]} days)`); }));
    if (trimmed.length) s.notes.push(`Hours left out of the trading day: rare edge hours (sales on under 1 in 20 days) and breaks (hours inside the day with sales on under 1 in 5 days between busier hours, such as a lunch closure): ${trimmed.join(", ")}. --open/--close or --keep-rare sets the hours yourself.`);
  }
  const minShift = o.minShift === undefined ? 4 : Number(o.minShift), maxShift = o.maxShift === undefined ? 8 : Number(o.maxShift);
  const minStaff = o.minStaff === undefined ? 1 : Number(o.minStaff);
  // The cut is priced with dated rows whether or not --short-cost is given; without it a short and a spare hour weigh
  // the same (r = 1), the weight the plain backtest scores at.
  const rCut = o.shortCost === undefined ? 1 : Number(o.shortCost);
  const cutCost = (d) => (s.tail && o.costCut !== false ? { tail: s.tail[d], r: rCut, minStaff, join: o.join === true } : null);
  const dropped = [];
  const days = prof.map((p, d) => {
    const shifts = cutShifts(p, minShift, maxShift, cutCost(d));
    for (const [a, b, k] of shifts.dropped || []) dropped.push(`${DAYS[d]} ${clock(a)}-${clock(b)} (person ${k})`);
    const needed = p.reduce((a, b) => a + b, 0);
    return { day: DAYS[d], needed, scheduled: shifts.reduce((a, [x, y]) => a + (y - x), 0), shifts: [...shifts], sales: s.avg[d].reduce((a, b) => a + b, 0) };
  });
  if (dropped.length) s.notes.push(`Left unstaffed: ${dropped.length} run${dropped.length === 1 ? "" : "s"} shorter than the shortest shift, where a ${minShift}-hour shift would cost more in spare hours than the short hours it saves at short cost ${rCut}${o.shortCost === undefined ? " (short and spare hours weighed the same)" : ""}: ${dropped.join(", ")}.`);
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
  return { shiftsText, rows: s.rows, needed, scheduled, extra: scheduled - needed, sales: days.reduce((a, d) => a + d.sales, 0), count: s.count, days, notes: s.notes, skipped: s.skipped };
}

// Backtest the staffing forecast on the file's own history: for every full week after the first `warmup` weeks, build
// the headcount from the weeks before it only (as you would have that Sunday night) and compare it hour by hour with
// the heads that week's real sales called for (ceil(sales / splh), and at least minStaff in an hour the plan staffed).
// Short = person-hours the real sales needed and the plan did not have; over = scheduled person-hours beyond that.
// Methods: the plain average of every earlier week (what --from-sales does), --half-life 2/4/8, the last 4 weeks and
// last week alone. By default the headcount profiles are scored; o.shifts scores the shifts cut from them instead
// (cutShifts, --min-shift/--max-shift), so the shortest-shift stretch counts as over (the CLI and page do this).
export const BACKTEST_METHODS = [
  { id: "all", label: "every earlier week, equal (default)" },
  { id: "hl8", label: "--half-life 8", halfLife: 8 },
  { id: "hl4", label: "--half-life 4", halfLife: 4 },
  { id: "hl2", label: "--half-life 2", halfLife: 2 },
  { id: "last4", label: "last 4 weeks only", window: 4 },
  { id: "last1", label: "last week only", window: 1 },
];

export function backtestSales(text, o = {}) {
  const splh = Number(o.splh);
  if (!(splh > 0)) throw new Error("sales per labor hour must be a positive number");
  const minStaff = o.minStaff === undefined ? 1 : Number(o.minStaff);
  const warmup = o.warmup === undefined ? 4 : Number(o.warmup);
  const minShift = o.minShift === undefined ? 4 : Number(o.minShift), maxShift = o.maxShift === undefined ? 8 : Number(o.maxShift);
  if (!Number.isInteger(warmup) || warmup < 1) throw new Error("warm-up must be a whole number of weeks, 1 or more");
  const r = readSales(text, o);
  const notes = [...r.notes];
  // One entry per date and hour (sales summed) gives the same averages as one per row: averageSales weighs by date and
  // counts dates, not rows. The French bakery's 232,711 item lines become 5,566, and its backtest drops from 67 s a
  // setting to about 3 s (the page runs it on the main thread).
  const agg = new Map();
  for (const e of r.entries) {
    if (!e.key) continue;
    const k = `${e.key}|${e.hour}`, x = agg.get(k);
    if (x) x.amount += e.amount; else agg.set(k, { ...e });
  }
  const dated = [...agg.values()];
  if (!dated.length) return { weeks: 0, methods: [], notes: notes.concat("A backtest needs dated rows (a date and hour per sale), not weekday averages.") };
  const ms = dated.map((e) => keyMs(e.key));
  let lo = Infinity, hi = -Infinity;
  for (const t of ms) { if (t < lo) lo = t; if (t > hi) hi = t; }
  const monday0 = lo - ((new Date(lo).getUTCDay() + 6) % 7) * DAY_MS;
  const nWeeks = Math.floor((hi - monday0) / DAY_MS / 7) + 1;
  // Only full weeks are tested: the last one counts when the file reaches its Sunday.
  const fullWeeks = (hi - monday0) / DAY_MS % 7 === 6 ? nWeeks : nWeeks - 1;
  const byWeek = Array.from({ length: nWeeks }, () => []);
  for (const e of dated) byWeek[Math.floor((keyMs(e.key) - monday0) / DAY_MS / 7)].push(e);
  const tested = [];
  for (let w = warmup; w < fullWeeks; w++) if (byWeek.slice(0, w).some((x) => x.length)) tested.push(w);
  if (!tested.length) return { weeks: 0, methods: [], notes: notes.concat(`Needs more than ${warmup} full weeks of dated sales to test on (has ${fullWeeks}).`) };
  const hOpts = { splh, minStaff, maxStaff: o.maxStaff, open: o.open, close: o.close, keepRare: o.keepRare };
  // The scorer's view of which weekday-hours are normally shut, from the whole file (hindsight is fine in the score; the
  // plans still learn only from earlier weeks). Fixed whatever rules the plan uses, so --keep-rare and the break rule
  // are scored against the same reference (2026-11-11).
  // The default since 2026-11-12 (o.scoreClosed !== false; --score-open-hours turns it off). o.closedFrom "past" builds
  // the reference for each tested week from the dates before it only, a hindsight-free check (eval/hindsight-closure.mjs).
  const scoreClosed = o.scoreClosed !== false;
  const closedOf = (rows) => { const ref = averageSales(rows, { keepRare: true }); return ref.seen.map((row, d) => row.map((n) => ref.observed[d] > 0 && n * 5 < ref.observed[d])); };
  const closedAll = scoreClosed && o.closedFrom !== "past" ? closedOf(dated) : null;
  // With a short-vs-over weight r, every weighting is also tried with the fractile rule, and a week scores r x short +
  // over; the plain average stays first as the baseline everything is compared with.
  const rc = o.shortCost === undefined ? null : Number(o.shortCost);
  if (rc !== null) shortCostShare(rc);
  const methodsAll = rc === null ? BACKTEST_METHODS : [BACKTEST_METHODS[0], ...BACKTEST_METHODS.map((m) => ({ ...m, id: "q-" + m.id, label: `${m.id === "all" ? "every earlier week" : m.label}, short cost ${rc}`, shortCost: rc }))];
  // o.methods: ids to run (the baseline "all" always runs first), so pickHalfLife skips the windows it never picks.
  const methods0 = o.methods ? methodsAll.filter((m, i) => i === 0 || o.methods.includes(m.id)) : methodsAll;
  const results = methods0.map((m) => ({ ...m, short: [], over: [], scheduled: [], shortHours: [] }));
  for (const w of tested) {
    const start = monday0 + w * 7 * DAY_MS;
    // The real need, per weekday-hour, from that week's sales.
    const actual = DAYS.map(() => new Array(24).fill(0));
    const soldOn = DAYS.map(() => new Array(24).fill(false));
    for (const e of byWeek[w]) { actual[e.day][e.hour] += e.amount; if (e.amount > 0) soldOn[e.day][e.hour] = true; }
    const closedRef = !scoreClosed ? null : closedAll || closedOf(dated.filter((e) => keyMs(e.key) < start));
    for (const res of results) {
      const from = res.window ? start - res.window * 7 * DAY_MS : -Infinity;
      const train = dated.filter((e) => { const t = keyMs(e.key); return t < start && t >= from; });
      const a = averageSales(train, { halfLife: res.halfLife, newest: start - DAY_MS, keepRare: o.keepRare, splh, shortCost: res.shortCost, priceCut: !!o.shifts });
      const prof = headcount(a.avg, a.observed, { ...hOpts, seen: a.seen, heads: a.heads });
      // o.shifts: score what the cut shifts staff, not the headcount profile, so the shortest-shift stretch (and, with
      // a short-cost weight, the runs the cost-aware cut leaves unstaffed) show up in short and over.
      const plan = !o.shifts ? prof : prof.map((p, d) => {
        // Every row's cut is priced at the weight the week is scored at (rc, or 1), average rows included (2026-11-11).
        const cost = a.tail && o.costCut !== false ? { tail: a.tail[d], r: rc === null ? 1 : rc, minStaff, join: o.join === true } : null;
        const row = new Array(24).fill(0);
        for (const [x, y] of cutShifts(p, minShift, maxShift, cost)) for (let t = x; t < y; t++) row[t]++;
        return row;
      });
      const open = prof;
      let short = 0, over = 0, sched = 0, shortH = 0;
      for (let d = 0; d < 7; d++) for (let h = 0; h < 24; h++) {
        const raw = Math.ceil(actual[d][h] / splh - 1e-9);
        // o.scoreClosed: minimum staff is not needed in an hour the shop is normally shut (it traded on under 1 in 5 of
        // the weekday's dates across the whole file) on a date it sold nothing in that hour, so staffing a closure
        // shows as over. Without it, minimum staff counts as needed in every hour the plan staffs.
        const shut = closedRef && closedRef[d][h] && !soldOn[d][h];
        const need = open[d][h] > 0 && !shut ? Math.max(minStaff, raw) : raw;
        sched += plan[d][h];
        if (need > plan[d][h]) { short += need - plan[d][h]; shortH++; } else over += plan[d][h] - need;
      }
      res.short.push(short); res.over.push(over); res.scheduled.push(sched); res.shortHours.push(shortH);
    }
  }
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const base = results[0];
  const methods = results.map((res) => {
    const w = rc === null ? 1 : rc;
    const miss = res.short.map((x, i) => w * x + res.over[i]);
    const diff = miss.map((x, i) => x - (w * base.short[i] + base.over[i]));
    const md = mean(diff), sd = Math.sqrt(diff.reduce((a, x) => a + (x - md) ** 2, 0) / Math.max(1, diff.length - 1));
    const half = diff.length > 1 ? 1.96 * sd / Math.sqrt(diff.length) : 0;
    return { id: res.id, label: res.label, halfLife: res.halfLife, window: res.window, shortCost: res.shortCost, short: mean(res.short), over: mean(res.over), scheduled: mean(res.scheduled), shortHours: mean(res.shortHours), miss: mean(miss), vsDefault: md, ci: [md - half, md + half] };
  });
  const perWeek = Object.fromEntries(results.map((res) => [res.id, res.short.map((x, i) => (rc === null ? 1 : rc) * x + res.over[i])]));
  const best = methods.reduce((a, b) => (b.miss < a.miss - 1e-9 ? b : a));
  const clear = best.id !== "all" && best.ci[1] < 0;
  notes.push(`Tested on ${tested.length} full week${tested.length === 1 ? "" : "s"} (first ${warmup} used only to learn from), at ${splh} ${r.count && r.count !== "sales" ? r.count : "sales"} per labor hour and ${minStaff} minimum staff${rc === null ? "" : `, a short person-hour costing ${rc} spare ones`}.`);
  return { weeks: tested.length, methods, best: best.id, clear, shortCost: rc, shifts: !!o.shifts, scoreClosed, closedFrom: scoreClosed ? (o.closedFrom === "past" ? "past" : "file") : null, minShift, maxShift, perWeek, notes };
}
