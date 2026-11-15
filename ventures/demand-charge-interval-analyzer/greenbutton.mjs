// Green Button XML (NAESB REQ.21 ESPI) reader. Pure functions, no I/O, no DOM,
// so the same code runs in the page and under `node --test`.
//
// An ESPI file is an Atom feed. The parts that matter here:
//   ReadingType          unit (uom), powerOfTenMultiplier, flowDirection, commodity, intervalLength
//   MeterReading         links (rel="related") to its ReadingType
//   IntervalBlock        IntervalReading { timePeriod { start (UTC epoch s), duration (s) }, value }
//   LocalTimeParameters  tzOffset (s), dstOffset (s), dstStartRule, dstEndRule
// Readings are turned into wall-clock local times, daylight saving included,
// because tariffs (on-peak windows, billing months) run on the local clock.
//
// The same file is copied into ventures/service-load-check/ (each venture is
// served on its own); its tests fail if the two copies drift apart.

const UOM = { 72: "Wh", 38: "W" };
const FLOW = { 0: "unspecified", 1: "delivered to you (forward)", 4: "net", 19: "received from you (reverse)" };

function tagText(src, name) {
  const m = src.match(new RegExp(`<(?:[\\w.-]+:)?${name}(?:\\s[^>]*)?>\\s*([^<]*?)\\s*</(?:[\\w.-]+:)?${name}>`));
  return m ? m[1] : null;
}
function tagNum(src, name, dflt = NaN) {
  const s = tagText(src, name);
  if (s == null || s === "") return dflt;
  const n = Number(s);
  return Number.isFinite(n) ? n : dflt;
}
function blocks(src, name) {
  const re = new RegExp(`<(?:[\\w.-]+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w.-]+:)?${name}>`, "g");
  const out = [];
  let m;
  while ((m = re.exec(src))) out.push(m[1]);
  return out;
}
function links(entry) {
  const out = [];
  const re = /<(?:[\w.-]+:)?link\b([^>]*)\/?>/g;
  let m;
  while ((m = re.exec(entry))) {
    const rel = (m[1].match(/\brel\s*=\s*"([^"]*)"/) || [])[1] || "";
    const href = (m[1].match(/\bhref\s*=\s*"([^"]*)"/) || [])[1] || "";
    if (href) out.push({ rel, href: normHref(href) });
  }
  return out;
}
// Hosts and prefixes differ between files; the resource path from UsagePoint on is what identifies a thing.
function normHref(h) {
  const s = h.replace(/[?#].*$/, "").replace(/\/+$/, "");
  const i = s.search(/\/(UsagePoint|ReadingType|LocalTimeParameters)\b/);
  return i >= 0 ? s.slice(i) : s;
}

export const isEspi = (text) => /<(?:[\w.-]+:)?IntervalReading[\s>]/.test(String(text ?? "").slice(0, 2_000_000));

/**
 * Decodes an ESPI DstRuleType (8 hex digits). Bits 0-11 seconds, 12-16 hour,
 * 17-19 day of week (1 = Monday ... 7 = Sunday), 20-24 day of month, 25-27
 * operator, 28-31 month. Returns null when DST correction is off (FFFFFFFF or 0).
 */
export function decodeDstRule(hex) {
  const s = String(hex ?? "").trim().replace(/^0x/i, "");
  if (!/^[0-9a-f]{1,8}$/i.test(s)) return null;
  const v = parseInt(s, 16) >>> 0;
  if (v === 0xffffffff || v === 0) return null;
  const rule = {
    seconds: v & 0xfff,
    hour: (v >>> 12) & 0x1f,
    dow: (v >>> 17) & 0x7,
    dom: (v >>> 20) & 0x1f,
    op: (v >>> 25) & 0x7,
    month: (v >>> 28) & 0xf,
  };
  if (rule.month < 1 || rule.month > 12) return null;
  return rule;
}

const isoDow = (y, mo, d) => ((new Date(Date.UTC(y, mo - 1, d)).getUTCDay() + 6) % 7) + 1; // Monday 1 ... Sunday 7
const daysIn = (y, mo) => new Date(Date.UTC(y, mo, 0)).getUTCDate();

/** Day of the month a rule falls on in a given year (operators 0-7 of the ESPI schema). */
export function ruleDay(year, r) {
  const n = daysIn(year, r.month);
  if (r.op === 0 || !r.dow) return Math.min(Math.max(r.dom, 1), n);
  if (r.op === 1) {
    // The day of the week on or after the day of the month.
    let d = Math.max(r.dom, 1);
    while (isoDow(year, r.month, d) !== r.dow) d++;
    return d;
  }
  if (r.op === 7) {
    let d = n;
    while (isoDow(year, r.month, d) !== r.dow) d--;
    return d;
  }
  // 2..6: first..fifth occurrence (a fifth that does not exist falls back to the last).
  let d = 1;
  while (isoDow(year, r.month, d) !== r.dow) d++;
  d += 7 * (r.op - 2);
  while (d > n) d -= 7;
  return d;
}

/**
 * The moment of a rule in a year, in local standard time (ms, UTC frame).
 * Rule times are read as the wall clock at the moment of change, as US and EU
 * law state them (2:00 a.m. in March is standard time; 2:00 a.m. in November is
 * daylight time, so one dstOffset earlier in standard time). Files differ on
 * this; it moves at most the one hour around each change.
 */
function ruleStd(year, r, isEnd, dstOffsetS) {
  const t = Date.UTC(year, r.month - 1, ruleDay(year, r)) + (r.hour * 3600 + r.seconds) * 1000;
  return isEnd ? t - dstOffsetS * 1000 : t;
}

/** A function from UTC epoch seconds to wall-clock ms (UTC frame) for these LocalTimeParameters. */
export function localClock(ltp) {
  const tz = ltp?.tzOffset ?? 0;
  const off = ltp?.dstOffset ?? 0;
  const start = ltp?.dstStart, end = ltp?.dstEnd;
  if (!start || !end || !off) return (s) => (s + tz) * 1000;
  const cache = new Map();
  const bounds = (y) => {
    if (!cache.has(y)) cache.set(y, [ruleStd(y, start, false, off), ruleStd(y, end, true, off)]);
    return cache.get(y);
  };
  return (s) => {
    const std = (s + tz) * 1000;
    const [a, b] = bounds(new Date(std).getUTCFullYear());
    const dst = a < b ? std >= a && std < b : std >= a || std < b; // southern hemisphere wraps the year end
    return dst ? std + off * 1000 : std;
  };
}

function readLtp(src) {
  const blk = blocks(src, "LocalTimeParameters")[0];
  if (blk == null) return null;
  return {
    tzOffset: tagNum(blk, "tzOffset", 0),
    dstOffset: tagNum(blk, "dstOffset", 0),
    dstStart: decodeDstRule(tagText(blk, "dstStartRule")),
    dstEnd: decodeDstRule(tagText(blk, "dstEndRule")),
  };
}

function readType(blk) {
  return {
    uom: tagNum(blk, "uom", NaN),
    p10: tagNum(blk, "powerOfTenMultiplier", 0),
    flow: tagNum(blk, "flowDirection", 0),
    commodity: tagNum(blk, "commodity", NaN),
    intervalLength: tagNum(blk, "intervalLength", NaN),
  };
}

const parentReading = (href) => {
  const i = href.search(/\/IntervalBlock\b/);
  return i >= 0 ? href.slice(0, i) : null;
};

/**
 * Reads an ESPI file into series, one per ReadingType that has interval data.
 * Each series: { key, type, readings: [{s (UTC epoch s), dur (s), v (in uom, multiplier applied)}] }.
 */
export function readEspi(xml) {
  const src = String(xml ?? "");
  const entries = blocks(src, "entry");
  const types = new Map(); // normalised href -> type
  const readingToType = new Map(); // MeterReading href -> ReadingType href
  const ivBlocks = []; // {parent, readings}
  let ltp = null;
  const looseTypes = [];
  const bodies = entries.length ? entries : [src];
  for (const e of bodies) {
    const ls = links(e);
    const self = (ls.find((l) => l.rel === "self") || {}).href || "";
    const up = (ls.find((l) => l.rel === "up") || {}).href || "";
    if (/<(?:[\w.-]+:)?LocalTimeParameters[\s/>]/.test(e) && !ltp) ltp = readLtp(e);
    const rt = blocks(e, "ReadingType")[0];
    if (rt != null) {
      const t = readType(rt);
      if (self) types.set(self, t);
      looseTypes.push(t);
    }
    if (/<(?:[\w.-]+:)?MeterReading[\s/>]/.test(e) && self) {
      const rel = ls.find((l) => l.rel === "related" && /ReadingType/.test(l.href));
      if (rel) readingToType.set(self, rel.href);
    }
    for (const ib of blocks(e, "IntervalBlock")) {
      const readings = [];
      for (const r of blocks(ib, "IntervalReading")) {
        const tp = blocks(r, "timePeriod")[0] ?? r;
        const s = tagNum(tp, "start");
        const dur = tagNum(tp, "duration");
        const v = tagNum(r.replace(/<(?:[\w.-]+:)?timePeriod[\s\S]*?<\/(?:[\w.-]+:)?timePeriod>/, ""), "value");
        if (Number.isFinite(s) && Number.isFinite(v)) readings.push({ s, dur, v });
      }
      ivBlocks.push({ parent: parentReading(self) || parentReading(up) || "", readings });
    }
  }
  if (!ltp) ltp = readLtp(src);

  const series = new Map();
  for (const b of ivBlocks) {
    const typeHref = readingToType.get(b.parent);
    let type = typeHref ? types.get(typeHref) : null;
    let key = typeHref || b.parent || "only";
    if (!type) {
      // No link to follow: fine when the file has one ReadingType (most single-meter downloads).
      type = looseTypes.length === 1 ? looseTypes[0] : looseTypes.length ? null : { uom: 72, p10: 0, flow: 0, commodity: NaN, intervalLength: NaN };
      if (!type) { type = looseTypes[0]; key = "ambiguous"; }
    }
    if (!series.has(key)) series.set(key, { key, type, readings: [] });
    const scale = 10 ** (type.p10 || 0);
    for (const r of b.readings) series.get(key).readings.push({ s: r.s, dur: r.dur, v: r.v * scale });
  }
  return { series: [...series.values()].filter((x) => x.readings.length), ltp, ambiguous: series.has("ambiguous") };
}

const pad = (n) => String(n).padStart(2, "0");
const fmt = (t) => { const d = new Date(t); return `${d.toISOString().slice(0, 10)} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`; };

/**
 * Picks the series a demand-charge bill is set by (electricity delivered to
 * the customer, in Wh or W, the shortest interval, then the most readings) and
 * returns its readings at local wall-clock time: { rows: [{t, v, min}], unit, notes },
 * v in kWh per interval (unit "kwh") or average kW (unit "kw").
 */
export function espiRows(xml) {
  const { series, ltp, ambiguous } = readEspi(xml);
  const notes = ["Read as Green Button XML (ESPI)."];
  if (!series.length) return { rows: [], unit: null, notes: [...notes, "No interval readings found in the file."] };
  const usable = series.filter((s) => (s.type.uom === 72 || s.type.uom === 38 || !Number.isFinite(s.type.uom)) && !(s.type.commodity >= 4 && s.type.commodity <= 9));
  const median = (s) => { const d = s.readings.map((r) => r.dur).filter((x) => x > 0).sort((a, b) => a - b); return d.length ? d[Math.floor(d.length / 2)] : s.type.intervalLength || Infinity; };
  const rank = (s) => (s.type.flow === 1 || s.type.flow === 0 ? 0 : s.type.flow === 4 ? 1 : 2);
  usable.sort((a, b) => rank(a) - rank(b) || median(a) - median(b) || b.readings.length - a.readings.length);
  const pick = usable[0];
  if (!pick) {
    const units = [...new Set(series.map((s) => s.type.uom))].join(", ");
    return { rows: [], unit: null, notes: [...notes, `The file has interval data, but not electricity in watt-hours or watts (unit codes found: ${units}). Gas and water files cannot set a demand charge.`] };
  }
  for (const s of series) {
    if (s === pick) continue;
    const why = FLOW[s.type.flow] || `flow direction ${s.type.flow}`;
    notes.push(`Also found a ${UOM[s.type.uom] || "unit " + s.type.uom} series ${why}, ${s.readings.length.toLocaleString("en-US")} readings; not used.`);
  }
  if (ambiguous) notes.push("Some interval blocks are not linked to a reading type and the file has several; they were read with the first reading type. Check the units.");
  if (pick.type.flow === 4) notes.push("The series used is net of on-site generation; intervals where you exported are skipped, and demand while the sun is up is understated.");
  if (pick.type.flow === 19) notes.push("Only a received (export) series was found; it is not the load a demand charge bills.");
  const clock = localClock(ltp);
  if (!ltp) notes.push("No time zone in the file (LocalTimeParameters); times are UTC, which shifts on-peak windows and month edges.");
  else if (ltp.dstStart && ltp.dstEnd && ltp.dstOffset) notes.push(`Times converted to local clock time (UTC${ltp.tzOffset >= 0 ? "+" : "-"}${Math.abs(ltp.tzOffset / 3600)}, daylight saving applied from the file's rules).`);
  else notes.push(`Times converted to local standard time (UTC${ltp.tzOffset >= 0 ? "+" : "-"}${Math.abs(ltp.tzOffset / 3600)}); the file gives no daylight-saving rule.`);

  const watts = pick.type.uom === 38;
  const rows = pick.readings
    .map((r) => ({ t: clock(r.s), v: r.v / 1000, min: r.dur > 0 ? r.dur / 60 : NaN }))
    .sort((a, b) => a.t - b.t);
  const dur = median(pick);
  if (Number.isFinite(dur) && dur > 7200) notes.push(`Readings are ${dur / 3600} hours long. Demand charges are set on 15- or 30-minute intervals; ask your utility for interval (not daily) data.`);
  return { rows, unit: watts ? "kw" : "kwh", notes };
}

/** The picked series as CSV text the analyzer reads (shown on the page so what is analyzed can be checked). */
export function espiToCsv(xml) {
  const r = espiRows(xml);
  if (!r.rows.length) return { csv: "", unit: null, notes: r.notes };
  const lines = [r.unit === "kw" ? "Interval start (local),Demand (kW)" : "Interval start (local),Usage (kWh)"];
  // Cells are a formatted date and a parsed number, but the file could be opened in a spreadsheet:
  // keep the formula-injection guard anyway, with the number exemption anchored at both ends.
  const cell = (v) => { const c = String(v); return /^[=+\-@\t\r]/.test(c) && !/^-?\d+(\.\d+)?$/.test(c) ? "'" + c : c; };
  for (const x of r.rows) lines.push(`${cell(fmt(x.t))},${cell(+x.v.toFixed(6))}`);
  return { csv: lines.join("\n"), unit: r.unit, notes: r.notes };
}
