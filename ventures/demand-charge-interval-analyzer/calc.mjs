// Demand-charge analysis of utility interval data. Pure functions, no I/O.
// Timestamps are read as wall-clock times (no timezone shifts), so the
// results match what the utility's own bill period shows.

export const DEFAULTS = {
  unit: "kw",
  intervalMin: "",
  demandRate: "",
  ratchetPct: "",
  batteryCostPerKwh: "",
  batteryCostPerKw: "",
  usablePct: "",
  roundTripPct: "",
  energyRate: "",
};

export const EXAMPLE_SETTINGS = {
  unit: "kw",
  intervalMin: "",
  demandRate: "18",
  ratchetPct: "80",
  batteryCostPerKwh: "600",
  batteryCostPerKw: "250",
  usablePct: "90",
  roundTripPct: "88",
  energyRate: "0.12",
};

const num = (v) => {
  const n = Number(String(v ?? "").replace(/[$,%\s"]/g, ""));
  return Number.isFinite(n) ? n : NaN;
};

export function parseTimestamp(s) {
  const str = String(s ?? "").trim().replace(/^"|"$/g, "");
  let m = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s]+(\d{1,2}):(\d{2}))?/);
  if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0));
  m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:[T\s]+(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?)?/i);
  if (m) {
    let y = +m[3];
    if (y < 100) y += 2000;
    let h = +(m[4] || 0);
    const ap = (m[6] || "").toUpperCase();
    if (ap === "PM" && h < 12) h += 12;
    if (ap === "AM" && h === 12) h = 0;
    return Date.UTC(y, +m[1] - 1, +m[2], h, +(m[5] || 0));
  }
  return NaN;
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

/** Reads pasted CSV into [{t, v}] rows plus notes about what was guessed. */
export function parseIntervals(text) {
  const notes = [];
  const lines = String(text ?? "").split(/\r?\n/).filter((l) => l.trim());
  const cells = lines.map(splitLine);
  // Skip preamble: first row that has a timestamp in some column.
  let first = cells.findIndex((r) => r.some((c) => Number.isFinite(parseTimestamp(c))));
  if (first < 0) return { rows: [], notes: ["No timestamps found. Expected a date and time on each line, such as 2026-03-04 14:15."] };
  const header = first > 0 ? cells[first - 1] : null;
  const body = cells.slice(first);
  const tsCol = body[0].findIndex((c) => Number.isFinite(parseTimestamp(c)));
  const candidates = body[0].map((_, i) => i).filter((i) => i !== tsCol && Number.isFinite(num(body[0][i])) && body[0][i] !== "");
  let valCol = -1;
  if (header) {
    const named = candidates.find((i) => /kw|demand|usage|consum|energy|value|load/i.test(header[i] || ""));
    if (named != null) valCol = named;
  }
  if (valCol < 0) valCol = candidates.length ? candidates[candidates.length > 1 && header && /end|stop/i.test(header[candidates[0]] || "") ? 1 : 0] : -1;
  if (valCol < 0) return { rows: [], notes: ["No numeric column found next to the timestamps."] };
  if (header) notes.push(`Using column "${header[valCol] || valCol + 1}" for the readings.`);
  const rows = [];
  let skipped = 0;
  for (const r of body) {
    const t = parseTimestamp(r[tsCol]);
    const v = num(r[valCol]);
    if (!Number.isFinite(t) || !Number.isFinite(v) || v < 0) { skipped++; continue; }
    rows.push({ t, v });
  }
  rows.sort((a, b) => a.t - b.t);
  const dedup = rows.filter((r, i) => i === 0 || r.t !== rows[i - 1].t);
  if (dedup.length < rows.length) notes.push(`${rows.length - dedup.length} duplicate timestamps ignored.`);
  if (skipped) notes.push(`${skipped} lines skipped (not a timestamp and a non-negative number).`);
  return { rows: dedup, notes };
}

export function inferIntervalMin(rows) {
  if (rows.length < 2) return NaN;
  const d = [];
  for (let i = 1; i < rows.length; i++) d.push((rows[i].t - rows[i - 1].t) / 60000);
  d.sort((a, b) => a - b);
  return d[Math.floor(d.length / 2)];
}

const monthKey = (t) => new Date(t).toISOString().slice(0, 7);
const pad = (n) => String(n).padStart(2, "0");
export const fmtTime = (t) => { const d = new Date(t); return `${d.toISOString().slice(0, 10)} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`; };

function billedSeries(peaks, ratchetPct) {
  // peaks: [{month, peak}] in time order. Ratchet: billed >= pct of the highest earlier peak in the prior 11 months.
  return peaks.map((p, i) => {
    let prior = 0;
    for (let j = Math.max(0, i - 11); j < i; j++) prior = Math.max(prior, peaks[j].peak);
    const floor = (ratchetPct / 100) * prior;
    return { ...p, billed: Math.max(p.peak, floor), ratcheted: floor > p.peak };
  });
}

/** Everything the page shows, from parsed rows and typed settings. */
export function analyze(rows, s) {
  const warnings = [];
  if (!rows || rows.length < 4) return { ok: false, warnings: ["Not enough readings. Paste at least a few days of interval data, ideally a year."] };
  const inferred = inferIntervalMin(rows);
  const intervalMin = s.intervalMin !== "" && num(s.intervalMin) > 0 ? num(s.intervalMin) : inferred;
  if (!(intervalMin > 0) || intervalMin > 120) return { ok: false, warnings: ["Readings are more than two hours apart, which is too coarse to find demand peaks. Utilities bill on 15- or 30-minute demand; export interval data."] };
  const h = intervalMin / 60;
  const rate = num(s.demandRate);
  if (!(rate > 0)) return { ok: false, warnings: ["Enter the demand charge in $ per kW per month, from your bill."] };
  const ratchet = s.ratchetPct === "" ? 0 : num(s.ratchetPct);
  if (!(ratchet >= 0 && ratchet <= 100)) return { ok: false, warnings: ["Ratchet percentage must be between 0 and 100."] };
  const kwOf = (v) => (s.unit === "kwh" ? v / h : v);
  const pts = rows.map((r) => ({ t: r.t, kw: kwOf(r.v) }));
  if (Math.abs(inferred - intervalMin) > 0.5 && s.intervalMin !== "") warnings.push(`Readings look ${inferred} minutes apart but you set ${intervalMin}.`);

  const byMonth = new Map();
  for (const p of pts) {
    const k = monthKey(p.t);
    if (!byMonth.has(k)) byMonth.set(k, []);
    byMonth.get(k).push(p);
  }
  const expected = (k) => { const [y, m] = k.split("-").map(Number); return (new Date(Date.UTC(y, m, 0)).getUTCDate() * 24 * 60) / intervalMin; };
  const months = [];
  for (const [k, list] of [...byMonth].sort()) {
    let pk = list[0];
    let sum = 0;
    for (const p of list) { if (p.kw > pk.kw) pk = p; sum += p.kw; }
    const near90 = list.filter((p) => p.kw >= 0.9 * pk.kw).length;
    months.push({ month: k, peak: pk.kw, peakAt: pk.t, avg: sum / list.length, kwh: sum * h, loadFactor: sum / list.length / pk.kw, near90Min: near90 * intervalMin, complete: list.length >= 0.95 * expected(k), list });
  }
  const billed = billedSeries(months.map((m) => ({ month: m.month, peak: m.peak })), ratchet);
  months.forEach((m, i) => { m.billed = billed[i].billed; m.ratcheted = billed[i].ratcheted; m.charge = m.billed * rate; });
  const full = months.filter((m) => m.complete);
  if (full.length < months.length) warnings.push(`${months.length - full.length} month(s) are incomplete and were left out of the yearly figures.`);
  if (full.length < 12) warnings.push(`Only ${full.length} complete month(s) of data. Yearly figures scale up the months you gave; demand often peaks in summer or winter, so a full year is more reliable.`);
  if (!full.length) return { ok: false, warnings: [...warnings, "No complete month in the data."] };
  const scale = 12 / full.length;
  const yearly = full.reduce((a, m) => a + m.charge, 0) * scale;

  // Hour-of-day profile of the intervals within 5% of each month's peak.
  const hourHits = Array(24).fill(0);
  for (const m of months) for (const p of m.list) if (p.kw >= 0.95 * m.peak) hourHits[new Date(p.t).getUTCHours()]++;
  const topPeaks = months.map((m) => ({ month: m.month, peak: m.peak, at: m.peakAt })).sort((a, b) => b.peak - a.peak).slice(0, 5);

  // Cap sweep: cap every interval at c kW, what does it save and what would hold it?
  const maxPeak = Math.max(...months.map((m) => m.peak));
  const caps = [];
  for (const pct of [97, 95, 92, 90, 85, 80, 75, 70]) {
    const c = (maxPeak * pct) / 100;
    const capped = billedSeries(months.map((m) => ({ month: m.month, peak: Math.min(m.peak, c) })), ratchet);
    let after = 0, before = 0;
    months.forEach((m, i) => { if (m.complete) { after += capped[i].billed * rate; before += m.charge; } });
    const saving = (before - after) * scale;
    // Longest-energy exceedance event decides battery kWh; deepest decides kW.
    let worstKwh = 0, events = 0, longest = 0;
    for (const m of months) {
      let run = 0, runMin = 0;
      let prevT = null;
      for (const p of m.list) {
        const contiguous = prevT !== null && p.t - prevT <= intervalMin * 60000 * 1.5;
        if (p.kw > c) {
          if (!(run > 0 && contiguous)) { if (run > 0) { worstKwh = Math.max(worstKwh, run); longest = Math.max(longest, runMin); } run = 0; runMin = 0; events++; }
          run += (p.kw - c) * h; runMin += intervalMin;
        } else if (run > 0) { worstKwh = Math.max(worstKwh, run); longest = Math.max(longest, runMin); run = 0; runMin = 0; }
        prevT = p.t;
      }
      if (run > 0) { worstKwh = Math.max(worstKwh, run); longest = Math.max(longest, runMin); }
    }
    const kwShave = maxPeak - c;
    const usable = num(s.usablePct) > 0 ? num(s.usablePct) / 100 : 1;
    const perKwh = num(s.batteryCostPerKwh), perKw = num(s.batteryCostPerKw);
    let cost = null, payback = null;
    if (perKwh > 0 || perKw > 0) {
      cost = (worstKwh / usable) * (perKwh > 0 ? perKwh : 0) + kwShave * (perKw > 0 ? perKw : 0);
      payback = saving > 0 ? cost / saving : null;
    }
    caps.push({ pct, capKw: c, kwShave, saving, events, longestMin: longest, batteryKwh: worstKwh / usable, cost, payback });
  }
  const best = caps.filter((c) => c.payback != null).sort((a, b) => a.payback - b.payback)[0] || null;
  return { ok: true, warnings, intervalMin, months, yearly, monthsUsed: full.length, maxPeak, hourHits, topPeaks, caps, best, ratchet, rate, readings: pts.length };
}

export const money = (n) => "$" + Math.round(n).toLocaleString("en-US");
export const kw = (n) => n.toLocaleString("en-US", { maximumFractionDigits: 1 }) + " kW";

export function toCsv(a) {
  const rows = [["month", "peak_kw", "peak_at", "billed_kw", "demand_charge", "avg_kw", "load_factor", "minutes_within_10pct_of_peak"]];
  for (const m of a.months) rows.push([m.month, m.peak.toFixed(1), fmtTime(m.peakAt), m.billed.toFixed(1), m.charge.toFixed(2), m.avg.toFixed(1), m.loadFactor.toFixed(3), m.near90Min]);
  rows.push([]);
  rows.push(["cap_kw", "kw_shaved", "yearly_saving", "battery_kwh_usable_adj", "est_cost", "payback_years"]);
  for (const c of a.caps) rows.push([c.capKw.toFixed(1), c.kwShave.toFixed(1), c.saving.toFixed(0), c.batteryKwh.toFixed(1), c.cost == null ? "" : c.cost.toFixed(0), c.payback == null ? "" : c.payback.toFixed(1)]);
  return rows.map((r) => r.join(",")).join("\n");
}

/** Deterministic synthetic example: a small shop, 4 months of 15-minute kW. Placeholder data, not a real site. */
export function exampleCsv() {
  const out = ["timestamp,kW"];
  let seed = 7;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  for (const [y, mo] of [[2026, 5], [2026, 6], [2026, 7], [2026, 8]]) {
    const days = new Date(Date.UTC(y, mo, 0)).getUTCDate();
    for (let d = 1; d <= days; d++) {
      const dow = new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
      for (let q = 0; q < 96; q++) {
        const hr = q / 4;
        let base = 12 + (hr >= 6 && hr < 20 ? 18 : 0) + (dow === 0 ? -8 : 0);
        if (hr >= 13 && hr < 17) base += 14 * (mo >= 7 ? 1.2 : 0.8); // afternoon cooling
        let v = base + rnd() * 4;
        if (dow === 2 && q === 4 * 15 + 1 && d % 7 < 7) v += 28 + rnd() * 10; // oven + compressor start overlap
        out.push(`${y}-${pad(mo)}-${pad(d)} ${pad(Math.floor(hr))}:${pad((q % 4) * 15)},${v.toFixed(1)}`);
      }
    }
  }
  return out.join("\n");
}
