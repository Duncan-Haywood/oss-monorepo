// Reads a household's smart-meter interval data into one net kWh figure per wall-clock hour:
// positive when the house drew from the grid, negative when it sent energy back (solar).
// Green Button CSV (Opower layout with separate DATE and START TIME columns, signed values or
// separate delivered and received columns), Smart Meter Texas interval CSV (surplus-generation
// rows), any "timestamp, kWh" CSV, and Green Button XML (ESPI) with delivered and received
// series. Pure functions, no I/O.

import { readEspi, localClock } from "./greenbutton.mjs";

const HOUR = 3600000;
const DAY = 86400000;

export const num = (v) => {
  const s = String(v ?? "").replace(/[$,\s"]/g, "");
  if (s === "" || s === "-") return NaN;
  const neg = /^\(.*\)$/.test(s);
  const n = Number(neg ? s.slice(1, -1) : s);
  return Number.isFinite(n) ? (neg ? -n : n) : NaN;
};

/** Wall-clock ms from a date with an optional time; a zone offset in the text is ignored. */
export function parseTimestamp(s) {
  const str = String(s ?? "").trim().replace(/^"|"$/g, "");
  let m = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?!\d)(?:[T\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?\s*(AM|PM)?)?/i);
  if (m) return mk(+m[1], +m[2], +m[3], m[4], m[5], m[7]);
  m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?!\d)(?:[T\s]+(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?)?/i);
  if (m) return mk(+m[3] < 100 ? +m[3] + 2000 : +m[3], +m[1], +m[2], m[4], m[5], m[6]);
  return NaN;
}

function mk(y, mo, d, h, mi, ap) {
  let hh = +(h || 0);
  const a = String(ap || "").toUpperCase();
  if (a === "PM" && hh < 12) hh += 12;
  if (a === "AM" && hh === 12) hh = 0;
  const mm = +(mi || 0);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || hh > 24 || mm > 59 || (hh === 24 && mm > 0)) return NaN;
  if (new Date(Date.UTC(y, mo - 1, d)).getUTCDate() !== d) return NaN;
  return Date.UTC(y, mo - 1, d, hh, mm);
}

function parseTimeOfDay(s) {
  const m = String(s ?? "").trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
  if (!m) return NaN;
  let h = +m[1];
  const a = String(m[3] || "").toUpperCase();
  if (a === "PM" && h < 12) h += 12;
  if (a === "AM" && h === 12) h = 0;
  if (h > 24 || +m[2] > 59) return NaN;
  return (h * 60 + +m[2]) * 60000;
}

function splitLine(line) {
  const sep = line.includes("\t") ? "\t" : line.includes(";") && !line.includes(",") ? ";" : ",";
  const out = [];
  let cur = "", q = false;
  for (const ch of line) {
    if (ch === '"') q = !q;
    else if (ch === sep && !q) { out.push(cur); cur = ""; } else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

const isDateOnly = (c) => /^(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}\/\d{1,2}\/\d{2,4})$/.test(String(c).trim());
const EXPORT_RE = /receiv|export|generat|surplus|return|sent|feed|reverse|outflow/;
const IMPORT_RE = /deliver|import|consum|usage|purchas|forward|inflow|kwh|energy/;

/** Parses CSV text into readings [{t, kwh (signed, + from grid), min}] and notes. */
function parseCsv(text, opts) {
  const notes = [];
  const cells = text.split(/\r?\n/).filter((l) => l.trim()).map(splitLine);
  const first = cells.findIndex((r) => r.some((c) => Number.isFinite(parseTimestamp(c))));
  if (first < 0) return { raw: [], notes: ["No dates found. Expected a date and time on each line (2025-07-04 14:15), or separate date and start-time columns."] };
  const header = first > 0 ? cells[first - 1].map((h) => h.toLowerCase()) : [];
  const body = cells.slice(first);
  const r0 = body[0];
  const dateCol = r0.findIndex((c) => Number.isFinite(parseTimestamp(c)));
  let timeCol = -1, endCol = -1;
  if (isDateOnly(r0[dateCol])) {
    const named = header.findIndex((h, i) => i !== dateCol && /start/.test(h) && Number.isFinite(parseTimeOfDay(r0[i])));
    timeCol = named >= 0 ? named : r0.findIndex((c, i) => i !== dateCol && Number.isFinite(parseTimeOfDay(c)));
    const e = header.findIndex((h, i) => i !== timeCol && /end/.test(h) && Number.isFinite(parseTimeOfDay(r0[i])));
    if (e >= 0) endCol = e;
  } else {
    const e = header.findIndex((h, i) => i !== dateCol && /end/.test(h) && Number.isFinite(parseTimestamp(r0[i])));
    if (e >= 0) endCol = e;
  }
  const used = new Set([dateCol, timeCol, endCol].filter((i) => i >= 0));
  const numeric = r0.map((_, i) => i).filter((i) => !used.has(i) && body.slice(0, 50).some((r) => Number.isFinite(num(r[i]))));
  const nonMoney = numeric.filter((i) => !/cost|\$|price|charge|amount|bill/.test(header[i] || ""));
  let expCol = nonMoney.find((i) => EXPORT_RE.test(header[i] || ""));
  let impCol = nonMoney.find((i) => i !== expCol && IMPORT_RE.test(header[i] || ""));
  if (impCol == null) impCol = nonMoney.find((i) => i !== expCol);
  if (impCol == null) return { raw: [], notes: ["No numeric kWh column found next to the dates."] };
  // Smart Meter Texas: one kWh column and a CONSUMPTION_SURPLUSGENERATION column naming the direction per row.
  const dirCol = header.findIndex((h, i) => /surplus|direction|flow/.test(h) && !numeric.includes(i));
  const head = header[impCol] || "";
  const unit = opts.unit || (/\bwh\b/.test(head) && !/kwh/.test(head) ? "wh" : /\bkw\b(?!h)/.test(head) ? "kw" : "kwh");
  if (header.length) notes.push(`Read "${header[impCol] || "column " + (impCol + 1)}" as ${unit === "kw" ? "average kW" : unit === "wh" ? "Wh" : "kWh"} from the grid${expCol != null ? ` and "${header[expCol]}" as energy sent to the grid` : ""}.`);
  const raw = [];
  let skipped = 0, dirRows = 0;
  for (const r of body) {
    let t, end = NaN;
    if (timeCol >= 0) {
      const d0 = parseTimestamp(r[dateCol]);
      t = d0 + parseTimeOfDay(r[timeCol]);
      if (endCol >= 0) { end = d0 + parseTimeOfDay(r[endCol]); if (end <= t) end += DAY; }
    } else {
      t = parseTimestamp(r[dateCol]);
      if (endCol >= 0) end = parseTimestamp(r[endCol]);
    }
    let v = num(r[impCol]);
    if (!Number.isFinite(t) || !Number.isFinite(v)) { skipped++; continue; }
    if (expCol != null) { const x = num(r[expCol]); if (Number.isFinite(x)) v -= Math.abs(x); }
    if (dirCol >= 0 && dirCol !== impCol && EXPORT_RE.test(String(r[dirCol]).toLowerCase())) { v = -Math.abs(v); dirRows++; }
    let min = Number.isFinite(end) && end > t ? (end - t) / 60000 : NaN;
    if (Number.isFinite(min) && min % 5 >= 4) min = Math.ceil(min / 5) * 5;
    raw.push({ t, v, min });
  }
  if (skipped) notes.push(`${skipped} line(s) skipped (no date or no number).`);
  if (dirRows) notes.push(`${dirRows} row(s) marked as surplus generation were read as energy sent to the grid.`);
  return { raw, unit, notes };
}

/** ESPI: delivered (flow 1 or 0) minus received (flow 19), or a net series (flow 4), on the local clock. */
function parseEspi(xml) {
  const notes = ["Read as Green Button XML (ESPI)."];
  const { series, ltp } = readEspi(xml);
  const elec = series.filter((s) => (s.type.uom === 72 || s.type.uom === 38 || !Number.isFinite(s.type.uom)) && !(s.type.commodity >= 4 && s.type.commodity <= 9));
  if (!elec.length) return { raw: [], notes: [...notes, "No electricity interval readings in the file."] };
  const clock = localClock(ltp);
  if (!ltp) notes.push("The file gives no time zone; times are UTC, which moves the on-peak hours.");
  const pickDur = (s) => { const d = s.readings.map((r) => r.dur).filter((x) => x > 0).sort((a, b) => a - b); return d.length ? d[Math.floor(d.length / 2)] : 3600; };
  const by = (f) => elec.filter((s) => f(s.type.flow)).sort((a, b) => pickDur(a) - pickDur(b) || b.readings.length - a.readings.length)[0];
  const del = by((f) => f === 1 || f === 0), rec = by((f) => f === 19), net = by((f) => f === 4);
  const raw = [];
  const add = (s, sign) => {
    const watts = s.type.uom === 38;
    for (const r of s.readings) {
      const min = r.dur > 0 ? r.dur / 60 : NaN;
      const kwh = watts ? (r.v / 1000) * ((r.dur || 3600) / 3600) : r.v / 1000;
      raw.push({ t: clock(r.s), v: sign * kwh, min });
    }
  };
  if (del) { add(del, 1); if (rec) { add(rec, -1); notes.push("Delivered and received (solar export) series combined into net use."); } else notes.push("Only a delivered series found: if you have solar, exports are missing and battery savings from stored solar will read low."); }
  else if (net) { add(net, 1); notes.push("Read the net series."); }
  else if (rec) return { raw: [], notes: [...notes, "Only a received (export) series found; the house's use is missing."] };
  return { raw, unit: "kwh", notes, summed: true };
}

/**
 * Parses meter data into hourly net kWh. Returns
 * { ok, start (ms, wall clock of the first hour), net: Float64Array, filled (hours filled in), intervalMin, notes }.
 */
export function readMeter(text, opts = {}) {
  const s = String(text ?? "");
  const p = /<(?:[\w.-]+:)?IntervalReading[\s>]/.test(s.slice(0, 2_000_000)) ? parseEspi(s) : parseCsv(s, opts);
  const notes = [...p.notes];
  const raw = p.raw.filter((r) => Number.isFinite(r.t) && Number.isFinite(r.v)).sort((a, b) => a.t - b.t);
  if (raw.length < 48) return { ok: false, net: new Float64Array(0), notes: [...notes, `Only ${raw.length} reading(s); a year of hourly or 15-minute data is needed.`] };
  const gaps = [];
  for (let i = 1; i < raw.length; i++) if (raw[i].t > raw[i - 1].t) gaps.push((raw[i].t - raw[i - 1].t) / 60000);
  gaps.sort((a, b) => a - b);
  const typical = gaps[Math.floor((gaps.length - 1) / 2)] || 60;
  if (typical > 60) return { ok: false, net: new Float64Array(0), notes: [...notes, `Readings are ${typical / 60} hours apart. A battery plan needs hourly or 15-minute data; daily totals cannot show when the house used power.`] };
  // Repeated timestamps: in a CSV they are the fall-back hour (sum both) or delivered and received rows of
  // the same interval (sum: received is already negative). Either way the hour's energy is the sum.
  const start = Math.floor(raw[0].t / HOUR) * HOUR;
  const n = Math.floor((raw[raw.length - 1].t - start) / HOUR) + 1;
  const net = new Float64Array(n), seen = new Float64Array(n);
  for (const r of raw) {
    const min = Number.isFinite(r.min) ? r.min : typical;
    const kwh = p.unit === "kw" ? (r.v * min) / 60 : p.unit === "wh" ? r.v / 1000 : r.v;
    const i = Math.floor((r.t - start) / HOUR);
    net[i] += kwh;
    seen[i] += min;
  }
  // Hours with no reading at all are filled with the same hour's average over the days around it
  // (the spring-forward hour is always one); partly covered hours are scaled up to a full hour.
  let filled = 0, scaled = 0;
  for (let i = 0; i < n; i++) {
    if (seen[i] === 0) continue;
    if (seen[i] < 59 && seen[i] < typical * 0.99) { net[i] *= 60 / seen[i]; scaled++; }
  }
  for (let i = 0; i < n; i++) {
    if (seen[i] > 0) continue;
    let sum = 0, cnt = 0;
    for (let k = 1; k <= 7 && cnt < 6; k++) for (const j of [i - 24 * k, i + 24 * k]) if (j >= 0 && j < n && seen[j] > 0) { sum += net[j]; cnt++; }
    net[i] = cnt ? sum / cnt : 0;
    filled++;
  }
  const days = n / 24;
  if (filled) notes.push(`${filled} hour(s) had no reading and were filled with the same hour's average on nearby days${filled > 2 * days / 365 + 2 ? "; check the file for a gap" : ""}.`);
  if (scaled) notes.push(`${scaled} hour(s) were only partly covered and were scaled up to a full hour.`);
  if (days < 360) notes.push(`The data covers ${Math.round(days)} days. Savings are shown for those days and scaled to a year; a full year is better, since solar and air conditioning change with the season.`);
  const exported = net.reduce((a, v) => a + (v < 0 ? -v : 0), 0);
  notes.push(`${n.toLocaleString("en-US")} hours (${Math.round(days)} days) at ${typical}-minute readings: ${Math.round(net.reduce((a, v) => a + Math.max(0, v), 0)).toLocaleString("en-US")} kWh from the grid, ${Math.round(exported).toLocaleString("en-US")} kWh sent to it.`);
  return { ok: true, start, net, filled, intervalMin: typical, notes };
}
