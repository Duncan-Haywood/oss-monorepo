// Reads utility interval data (Green Button CSV or ESPI XML, or any
// timestamp + usage CSV) and finds the measured maximum demand NEC 220.87
// asks for: the highest average kW held for a 15-minute interval, over a year.
// Pure functions, no I/O. Timestamps are kept as wall-clock times.

const DAY = 86400000;

export const num = (v) => {
  const s = String(v ?? "").replace(/[$,\s"]/g, "");
  if (s === "") return NaN;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
};

/** Wall-clock milliseconds from a date (and optional time); any zone offset is ignored. */
export function parseTimestamp(s) {
  const str = String(s ?? "").trim().replace(/^"|"$/g, "");
  let m = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?/i);
  if (m) return mk(+m[1], +m[2], +m[3], m[4], m[5], m[7]);
  m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:[T\s]+(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?)?/i);
  if (m) {
    let y = +m[3];
    if (y < 100) y += 2000;
    return mk(y, +m[1], +m[2], m[4], m[5], m[6]);
  }
  return NaN;
}

function mk(y, mo, d, h, mi, ap) {
  let hh = +(h || 0);
  const a = String(ap || "").toUpperCase();
  if (a === "PM" && hh < 12) hh += 12;
  if (a === "AM" && hh === 12) hh = 0;
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || hh > 24) return NaN;
  return Date.UTC(y, mo - 1, d, hh, +(mi || 0));
}

/** A bare time of day such as 14:15 or 2:15 PM, in ms after midnight. */
function parseTimeOfDay(s) {
  const m = String(s ?? "").trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
  if (!m) return NaN;
  let h = +m[1];
  const a = String(m[3] || "").toUpperCase();
  if (a === "PM" && h < 12) h += 12;
  if (a === "AM" && h === 12) h = 0;
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

/**
 * Parses pasted text into { rows: [{t, kwh, min}], unit, notes }.
 * Each row is one interval: its wall-clock start, its energy in kWh and its
 * length in minutes (from an end column or a duration when the file has one,
 * else filled in from the spacing of the readings).
 */
export function parseUsage(text, opts = {}) {
  const s = String(text ?? "");
  if (/<(\w+:)?IntervalReading[\s>]/.test(s)) return parseEspi(s);
  return parseCsv(s, opts);
}

function parseCsv(text, opts) {
  const notes = [];
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const cells = lines.map(splitLine);
  const first = cells.findIndex((r) => r.some((c) => Number.isFinite(parseTimestamp(c))));
  if (first < 0) return { rows: [], notes: ["No dates found. Expected a date and time on each line, such as 2026-03-04 14:15, or separate date and start-time columns."] };
  const header = first > 0 ? cells[first - 1].map((h) => h.toLowerCase()) : [];
  const body = cells.slice(first);
  const r0 = body[0];

  // "2025-01-01 00:00 to 2025-01-01 00:15" in one cell (some utilities).
  const rangeCol = r0.findIndex((c) => /\d.*\s(to|-)\s.*\d{1,2}:\d{2}/i.test(c) && Number.isFinite(parseTimestamp(c)));
  let dateCol = r0.findIndex((c) => Number.isFinite(parseTimestamp(c)));
  let timeCol = -1, endCol = -1;
  if (rangeCol < 0 && isDateOnly(r0[dateCol])) {
    // Separate DATE and START TIME columns (PG&E-style Green Button CSV).
    const named = header.findIndex((h, i) => i !== dateCol && /start/.test(h) && Number.isFinite(parseTimeOfDay(r0[i])));
    timeCol = named >= 0 ? named : r0.findIndex((c, i) => i !== dateCol && Number.isFinite(parseTimeOfDay(c)));
    const endNamed = header.findIndex((h, i) => i !== timeCol && /end/.test(h) && Number.isFinite(parseTimeOfDay(r0[i])));
    if (endNamed >= 0) endCol = endNamed;
  } else if (rangeCol < 0) {
    const e = header.findIndex((h, i) => i !== dateCol && /end/.test(h) && Number.isFinite(parseTimestamp(r0[i])));
    if (e >= 0) endCol = e;
    else {
      const second = r0.findIndex((c, i) => i !== dateCol && Number.isFinite(parseTimestamp(c)));
      if (second >= 0) endCol = second;
    }
  } else dateCol = rangeCol;

  const used = new Set([dateCol, timeCol, endCol].filter((i) => i >= 0));
  const numeric = r0.map((_, i) => i).filter((i) => !used.has(i) && Number.isFinite(num(r0[i])));
  let valCol = -1;
  const pick = (re) => numeric.find((i) => re.test(header[i] || ""));
  for (const re of [/kwh/, /usage|consum|energy|import|delivered/, /\bkw\b|demand|load/, /value|reading/]) {
    const i = pick(re);
    if (i != null) { valCol = i; break; }
  }
  if (valCol < 0) valCol = numeric.length ? numeric[0] : -1;
  if (valCol < 0) return { rows: [], notes: ["No numeric usage column found next to the dates."] };
  const head = header[valCol] || "";
  let unit = opts.unit || (/\bkw\b(?!h)|demand/.test(head) && !/kwh/.test(head) ? "kw" : /\bwh\b/.test(head) && !/kwh/.test(head) ? "wh" : "kwh");
  if (header.length) notes.push(`Using column "${header[valCol] || valCol + 1}" as ${unit === "kw" ? "average kW" : unit === "wh" ? "Wh" : "kWh"} per interval.`);

  const raw = [];
  let skipped = 0;
  for (const r of body) {
    let t, end = NaN;
    if (rangeCol >= 0) {
      const [a, b] = r[rangeCol].split(/\s+(?:to|-)\s+/i);
      t = parseTimestamp(a);
      end = parseTimestamp(b);
    } else if (timeCol >= 0) {
      t = parseTimestamp(r[dateCol]) + parseTimeOfDay(r[timeCol]);
      if (endCol >= 0) {
        end = parseTimestamp(r[dateCol]) + parseTimeOfDay(r[endCol]);
        if (end <= t) end += DAY;
      }
    } else {
      t = parseTimestamp(r[dateCol]);
      if (endCol >= 0) end = parseTimestamp(r[endCol]);
    }
    const v = num(r[valCol]);
    if (!Number.isFinite(t) || !Number.isFinite(v)) { skipped++; continue; }
    let min = Number.isFinite(end) && end > t ? (end - t) / 60000 : NaN;
    // End times such as 00:14 or 00:14:59 mean a 15-minute interval.
    if (Number.isFinite(min) && min % 5 >= 4) min = Math.ceil(min / 5) * 5;
    raw.push({ t, v, min });
  }
  if (skipped) notes.push(`${skipped} line(s) skipped (no date or no number).`);
  return finish(raw, unit, notes);
}

function parseEspi(xml) {
  const notes = ["Read as Green Button XML (ESPI)."];
  const tag = (name, src) => {
    const m = src.match(new RegExp(`<(?:\\w+:)?${name}>\\s*([^<]*?)\\s*</(?:\\w+:)?${name}>`));
    return m ? m[1] : null;
  };
  const p10 = Number(tag("powerOfTenMultiplier", xml) ?? 0) || 0;
  const uom = Number(tag("uom", xml) ?? 72);
  const tz = Number(tag("tzOffset", xml) ?? 0) || 0;
  if (tag("tzOffset", xml) == null) notes.push("No time zone in the file; times are shown in UTC.");
  const raw = [];
  const re = /<(?:\w+:)?IntervalReading>([\s\S]*?)<\/(?:\w+:)?IntervalReading>/g;
  let m;
  while ((m = re.exec(xml))) {
    const r = m[1];
    const start = Number(tag("start", r));
    const dur = Number(tag("duration", r));
    const value = Number(tag("value", r));
    if (!Number.isFinite(start) || !Number.isFinite(value)) continue;
    raw.push({ t: (start + tz) * 1000, v: value * 10 ** p10, min: dur > 0 ? dur / 60 : NaN });
  }
  let unit = "wh";
  if (uom === 38) unit = "w";
  else if (uom !== 72) notes.push(`Unit code ${uom} is not watt-hours (72) or watts (38); read as watt-hours. Check the result.`);
  return finish(raw, unit, notes);
}

/** Sorts, merges duplicates, fills interval lengths and converts to kWh. */
function finish(raw, unit, notes) {
  raw.sort((a, b) => a.t - b.t);
  const gaps = [];
  for (let i = 1; i < raw.length; i++) if (raw[i].t > raw[i - 1].t) gaps.push((raw[i].t - raw[i - 1].t) / 60000);
  gaps.sort((a, b) => a - b);
  const typical = gaps.length ? gaps[Math.floor(gaps.length / 2)] : NaN;
  const rows = [];
  let dups = 0, negative = 0;
  for (const r of raw) {
    const min = Number.isFinite(r.min) ? r.min : typical;
    if (!(min > 0)) continue;
    let kwh;
    if (unit === "kw") kwh = (r.v * min) / 60;
    else if (unit === "w") kwh = (r.v / 1000) * (min / 60);
    else if (unit === "wh") kwh = r.v / 1000;
    else kwh = r.v;
    if (kwh < 0) negative++;
    const prev = rows[rows.length - 1];
    if (prev && prev.t === r.t) {
      // The repeated hour when clocks fall back, or delivered and received rows:
      // keep the larger reading (the question is the peak).
      dups++;
      if (kwh > prev.kwh) prev.kwh = kwh;
      continue;
    }
    rows.push({ t: r.t, kwh, min });
  }
  if (dups) notes.push(`${dups} repeated timestamp(s) (daylight-saving fall-back, or separate delivered and received rows): kept the larger reading of each.`);
  return { rows, unit, notes, negative };
}

/**
 * 15-minute average demand series. Readings shorter than 15 minutes that
 * divide it (1, 3, 5, 15) are summed into clock-aligned 15-minute blocks;
 * longer readings cannot be split and are returned as they are, flagged.
 */
export function demandSeries(rows) {
  if (!rows.length) return { series: [], intervalMin: NaN, fifteen: false };
  const lens = rows.map((r) => r.min).sort((a, b) => a - b);
  const intervalMin = lens[Math.floor(lens.length / 2)];
  if (intervalMin > 15) {
    return { series: rows.map((r) => ({ t: r.t, kw: (r.kwh * 60) / r.min, min: r.min })), intervalMin, fifteen: false };
  }
  if (15 % intervalMin !== 0) {
    return { series: rows.map((r) => ({ t: r.t, kw: (r.kwh * 60) / r.min, min: r.min })), intervalMin, fifteen: false, odd: true };
  }
  const blocks = new Map();
  for (const r of rows) {
    const b = Math.floor(r.t / 900000) * 900000;
    const cur = blocks.get(b) || { kwh: 0, min: 0 };
    cur.kwh += r.kwh;
    cur.min += r.min;
    blocks.set(b, cur);
  }
  const series = [];
  for (const [t, b] of [...blocks.entries()].sort((a, c) => a[0] - c[0])) {
    if (b.min < 15) continue; // an incomplete block cannot give a 15-minute average
    series.push({ t, kw: b.kwh * 4, min: 15 });
  }
  return { series, intervalMin, fifteen: true };
}

const pad = (n) => String(n).padStart(2, "0");
export const fmtTime = (t) => { const d = new Date(t); return `${d.toISOString().slice(0, 10)} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`; };
const monthKey = (t) => new Date(t).toISOString().slice(0, 7);

/**
 * What the data says for NEC 220.87: the peak, when, how much of a year the
 * data covers, and whether it can stand as the measured existing load.
 */
export function measuredDemand(parsed, opts = {}) {
  const rows = parsed.rows || [];
  const warnings = [];
  if (!rows.length) return { ok: false, warnings: ["Not enough readings. Paste a year of interval data from your utility account."] };
  const ds = demandSeries(rows);
  const s = ds.series;
  if (!s.length) return { ok: false, warnings: ["No complete 15-minute blocks in the data."] };
  let peak = s[0];
  for (const x of s) if (x.kw > peak.kw) peak = x;
  const first = rows[0].t, last = rows[rows.length - 1].t + rows[rows.length - 1].min * 60000;
  const spanDays = (last - first) / DAY;
  const coveredMin = rows.reduce((a, r) => a + r.min, 0);
  const coverage = coveredMin / ((last - first) / 60000);

  const months = new Map();
  for (const x of s) {
    const k = monthKey(x.t);
    const m = months.get(k) || { month: k, peak: 0, at: 0, kwh: 0, n: 0 };
    if (x.kw > m.peak) { m.peak = x.kw; m.at = x.t; }
    m.kwh += (x.kw * x.min) / 60;
    m.n++;
    months.set(k, m);
  }
  const monthly = [...months.values()];
  const top = [...s].sort((a, b) => b.kw - a.kw).slice(0, 5);

  let basis;
  if (!ds.fifteen) {
    basis = "estimate";
    warnings.push(ds.odd
      ? `Readings are every ${ds.intervalMin} minutes, which does not divide into 15-minute blocks. 220.87 needs the highest 15-minute average; ask the utility for 15-minute data.`
      : `Readings are ${ds.intervalMin}-minute averages. 220.87 uses the highest 15-minute average, which is higher than the highest ${ds.intervalMin}-minute one, so the peak below understates the measured demand. Most utilities with smart meters will give 15-minute data on request; hourly data is a screen, not a 220.87 load.`);
  } else if (spanDays >= 365 - 1) basis = "year";
  else if (spanDays >= 30) {
    basis = "30-day";
    warnings.push(`The data covers ${spanDays.toFixed(0)} days, not a year. 220.87 allows a recording of at least 30 days only from a recording meter on the highest-loaded leg, taken while the home is occupied, and with the larger of the heating or cooling load added by measurement or calculation if that season is not in the recording.`);
  } else {
    basis = "short";
    warnings.push(`The data covers ${spanDays.toFixed(1)} days. 220.87 needs a year of demand data, or at least 30 days of recording; this is only a screen.`);
  }
  if (coverage < 0.97) warnings.push(`About ${((1 - coverage) * 100).toFixed(1)}% of the period has no readings. A missing day could hide the real peak.`);
  if (parsed.negative > 0 || opts.solar) {
    warnings.push("The data has negative readings or the home has solar. A meter behind solar records net load, which hides demand while the sun is up; 220.87 needs the load itself, so use a load-side (consumption) export, or the 220.83 calculation. The 2023 NEC does not let the 30-day option be used where solar or peak shaving is present.");
  }
  if (spanDays >= 365 - 1 && ds.fifteen) {
    const seasons = new Set(monthly.map((m) => m.month.slice(5, 7)));
    if (seasons.size < 12) warnings.push(`Only ${seasons.size} calendar months have readings; check the year is complete.`);
  }
  return {
    ok: true,
    peakKw: peak.kw,
    peakAt: peak.t,
    top,
    basis,
    intervalMin: ds.intervalMin,
    fifteen: ds.fifteen,
    spanDays,
    coverage,
    readings: rows.length,
    monthly,
    from: first,
    to: last,
    warnings,
  };
}

/**
 * A synthetic placeholder year for the example button: 15-minute kWh for a
 * house with central air and an electric range. Invented numbers, not a real
 * home. Deterministic so the example and its test agree.
 */
export function exampleCsv() {
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const out = ["Interval Start,Interval End,Usage (kWh)"];
  const start = Date.UTC(2025, 0, 1);
  for (let i = 0; i < 365 * 96; i++) {
    const t = start + i * 900000;
    const d = new Date(t);
    const h = d.getUTCHours() + d.getUTCMinutes() / 60;
    const doy = Math.floor(i / 96);
    const summer = Math.max(0, Math.cos(((doy - 200) / 365) * 2 * Math.PI)); // peaks in July
    let kw = 0.5 + 0.4 * rnd(); // fridge, standby, lights
    if (h >= 6.5 && h < 8.5) kw += 1.2 * rnd();
    if (h >= 17 && h < 21) kw += 1.5 + 1.5 * rnd();
    if (h >= 17.5 && h < 18.5 && rnd() < 0.4) kw += 2.5 * rnd(); // range and oven
    if (h >= 13 && h < 21 && rnd() < summer * 0.95) kw += 3.5 * summer; // air conditioner cycling
    if (d.getUTCDay() === 6 && h >= 10 && h < 12 && rnd() < 0.6) kw += 4.5; // dryer
    if (rnd() < 0.04) kw += 3 * rnd(); // water heater, part of the 15 minutes
    const e = new Date(t + 900000);
    const f = (x) => `${x.toISOString().slice(0, 10)} ${pad(x.getUTCHours())}:${pad(x.getUTCMinutes())}`;
    out.push(`${f(d)},${f(e)},${(kw / 4).toFixed(3)}`);
  }
  return out.join("\n");
}
