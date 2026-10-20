// YouTube Studio analytics export (CSV) analysis: revenue per thousand views by
// video, country, traffic source or day, where the money concentrates, which
// videos pay least per view, and which pay best but are under-fed. Pure functions,
// no DOM, no network. Column names are matched by alias because no real export
// was available when this was written; unread files are reported, never guessed.


export function decodeBuffer(buf) {
  const u8 = new Uint8Array(buf);
  if (u8[0] === 0xff && u8[1] === 0xfe) return new TextDecoder("utf-16le").decode(u8);
  if (u8[0] === 0xfe && u8[1] === 0xff) return new TextDecoder("utf-16be").decode(u8);
  return new TextDecoder("utf-8").decode(u8);
}

export function detectDelimiter(text) {
  const head = String(text ?? "").split(/\r?\n/).filter((l) => l.trim()).slice(0, 8).join("\n");
  const n = (c) => head.split(c).length - 1;
  const best = [["\t", n("\t")], [";", n(";")], [",", n(",")]].sort((a, b) => b[1] - a[1])[0];
  return best[1] > 0 ? best[0] : ",";
}

export function parseCsv(text, delim = ",") {
  const rows = [];
  let row = [], field = "", quoted = false;
  const src = String(text ?? "").replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') { if (src[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === delim) { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows;
}

// "1,234.56", "$12", "(5.00)", "-5" and blanks (0). NaN only for non-numbers.
export function parseNumber(v, decimalComma = false) {
  let s = String(v ?? "").trim();
  if (s === "" || /^[-–—\s]+$/.test(s)) return 0;
  const neg = /^\(.*\)$/.test(s) || /^[-−]/.test(s);
  s = s.replace(/[^0-9.,]/g, "");
  s = decimalComma ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  const n = Number(s);
  if (!s || !Number.isFinite(n)) return NaN;
  return neg ? -n : n;
}

// Durations: "23" (minutes), "1:05:30", "12:40" (mm:ss when it has two parts and
// the caller says so is ambiguous, so two parts are read as h:mm), "25 min",
export function parseWhen(v, dmy = false) {
  const s = String(v ?? "").trim();
  if (!s) return null;
  let y, mo, d, rest = "";
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(.*)$/);
  if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; rest = m[4]; }
  else {
    m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})(.*)$/);
    if (!m) return null;
    const a = +m[1], b = +m[2];
    y = +m[3]; if (y < 100) y += 2000;
    if (dmy) { d = a; mo = b; } else { mo = a; d = b; }
    rest = m[4];
  }
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  let hh = 0, mm = 0, hasTime = false;
  const tm = rest.match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*([ap]\.?m\.?)?/i);
  if (tm) {
    hh = +tm[1]; mm = +tm[2]; hasTime = true;
    const ap = tm[3] ? tm[3][0].toLowerCase() : "";
    if (ap === "p" && hh < 12) hh += 12;
    if (ap === "a" && hh === 12) hh = 0;
    if (hh > 23 || mm > 59) return null;
  }
  const t = Date.UTC(y, mo - 1, d, hh, mm);
  return new Date(t).getUTCDate() === d ? { t, hasTime } : null;
}

// Day-first only when unambiguous: some first part above 12, no second above 12.
export function detectDmy(values) {
  let first = false, second = false;
  for (const v of values) {
    const m = String(v ?? "").trim().match(/^(\d{1,2})[/.-](\d{1,2})[/.-]\d{2,4}/);
    if (!m) continue;
    if (+m[1] > 12) first = true;
    if (+m[2] > 12) second = true;
  }
  return first && !second;
}



// Duration: seconds ("754"), "12:34" (mm:ss), "1:02:03" (h:mm:ss), "12 min".
export function parseDuration(v) {
  const s = String(v ?? "").trim();
  if (!s) return null;
  let m = s.match(/^(\d+):(\d{2}):(\d{2})$/);
  if (m) return +m[1] * 3600 + +m[2] * 60 + +m[3];
  m = s.match(/^(\d+):(\d{2})$/);
  if (m) return +m[1] * 60 + +m[2];
  m = s.match(/^(\d+(?:\.\d+)?)\s*min/i);
  if (m) return Math.round(+m[1] * 60);
  const n = parseNumber(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const ALIASES = {
  label: ["video title", "video", "content", "title", "country", "geography", "traffic source", "date", "day", "video id", "channel", "playlist", "device type"],
  revenue: ["estimated revenue (usd)", "your estimated revenue (usd)", "estimated partner revenue (usd)", "estimated revenue", "your estimated revenue", "revenue (usd)", "revenue", "estimated ad revenue (usd)"],
  views: ["views", "video views"],
  hours: ["watch time (hours)", "watch time hours", "watch hours"],
  impressions: ["impressions", "video thumbnail impressions"],
  ctr: ["impressions click-through rate (%)", "impressions click through rate (%)", "click-through rate (%)", "ctr (%)", "ctr", "impressions click-through rate"],
  subs: ["subscribers", "subscribers gained", "net subscribers"],
  rpm: ["rpm (usd)", "rpm"],
  cpm: ["cpm (usd)", "playback-based cpm (usd)", "cpm"],
  duration: ["duration", "video duration", "length"],
  published: ["video publish time", "publish time", "published", "video published"],
};

function findColumns(header) {
  const norm = header.map((h) => h.trim().toLowerCase().replace(/\s+/g, " ").replace(/\([a-z]{3}\)/, "(usd)"));
  const cols = {};
  for (const [field, names] of Object.entries(ALIASES)) {
    for (const n of names) {
      const at = norm.indexOf(n);
      if (at !== -1 && !Object.values(cols).includes(at)) { cols[field] = at; break; }
    }
  }
  return cols;
}

// What each row stands for, from the label column's own header.
export function dimensionOf(header) {
  const h = String(header ?? "").toLowerCase();
  if (/^(date|day)$/.test(h)) return "date";
  if (/country|geography/.test(h)) return "country";
  if (/traffic/.test(h)) return "traffic source";
  if (/device/.test(h)) return "device";
  return "video";
}

// Returns { rows, skipped, dimension, total, columns, error }. A row is
// { line, label, views, revenue, hours, impressions, ctr, subs, duration, t, rpmGiven }.
export function normalizeRows(table, { decimalComma = false } = {}) {
  let h = -1;
  for (let i = 0; i < Math.min(table.length, 15); i++) {
    const c = findColumns(table[i]);
    if (c.revenue !== undefined && c.views !== undefined) { h = i; break; }
  }
  if (h === -1) return { error: "Could not find a header row with a Views column and an Estimated revenue column. In YouTube Studio open Analytics, Revenue (or Advanced mode), choose the table you want, and use Export current view, Comma-separated values. Or add a header such as: Video title,Views,Estimated revenue (USD)." };
  const cols = findColumns(table[h]);
  const head = table[h];
  const labelAt = cols.label !== undefined ? cols.label : head.findIndex((_, i) => !Object.values(cols).includes(i));
  const dimension = dimensionOf(labelAt >= 0 ? head[labelAt].trim() : "video");
  const rows = [], skipped = [];
  let total = null;
  const body = table.slice(h + 1);
  const dmy = dimension === "date" ? detectDmy(body.map((r) => r[labelAt])) : false;
  body.forEach((r, k) => {
    const line = h + k + 2;
    const cell = (f) => (cols[f] === undefined ? "" : String(r[cols[f]] ?? "").trim());
    const label = String(r[labelAt] ?? "").trim();
    const views = parseNumber(cell("views"), decimalComma);
    const revenue = parseNumber(cell("revenue"), decimalComma);
    if (/^total$/i.test(label) || /^total$/i.test(String(r[0] ?? "").trim())) { if (Number.isFinite(revenue)) total = { views, revenue }; return; }
    if (!label) { skipped.push({ line, reason: "no title, country or date" }); return; }
    if (!Number.isFinite(views) || views < 0) { skipped.push({ line, reason: "unreadable views" }); return; }
    if (!Number.isFinite(revenue)) { skipped.push({ line, reason: "unreadable revenue" }); return; }
    let t = null;
    if (dimension === "date") { const w = parseWhen(label, dmy); if (!w) { skipped.push({ line, reason: "unreadable date" }); return; } t = w.t; }
    const num = (f) => { const v = parseNumber(cell(f), decimalComma); return Number.isFinite(v) ? v : null; };
    rows.push({
      line, label, views, revenue, t,
      hours: num("hours"), impressions: num("impressions"), ctr: num("ctr"), subs: num("subs"),
      duration: parseDuration(cell("duration")), rpmGiven: num("rpm"),
    });
  });
  if (!rows.length) return { error: "No rows could be read.", skipped };
  return { rows, skipped, dimension, total, columns: cols, dmy };
}

const r2 = (n) => Math.round(n * 100) / 100;
const median = (a) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const rpmOf = (revenue, views) => (views > 0 ? (revenue / views) * 1000 : null);
export const money = (n) => (Number.isFinite(n) ? (n < 0 ? "-" : "") + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "–");
export const pct = (n) => (Number.isFinite(n) ? (n * 100).toFixed(1) + "%" : "–");
export const dateStr = (t) => new Date(t).toISOString().slice(0, 10);
const fmt = (n) => "$" + money(n);
const int = (n) => Math.round(n).toLocaleString("en-US");
const monthKey = (t) => new Date(t).toISOString().slice(0, 7);

const DURATION_BUCKETS = [
  { key: "up to 1 min", max: 60 }, { key: "1 to 8 min", max: 480 }, { key: "8 to 20 min", max: 1200 }, { key: "over 20 min", max: Infinity },
];

// opts: { minViews (default 100) }. Currency is whatever the file's revenue
// column is; the report never converts.
export function analyze(rows, opts = {}, ctx = {}) {
  const minViews = Number(opts.minViews) >= 0 ? Number(opts.minViews) : 100;
  const dimension = ctx.dimension || "video";
  const items = rows.map((r) => ({ ...r, rpm: rpmOf(r.revenue, r.views), perHour: r.hours > 0 ? r.revenue / r.hours : null }));
  const revenue = items.reduce((a, r) => a + r.revenue, 0);
  const views = items.reduce((a, r) => a + r.views, 0);
  const hours = items.reduce((a, r) => a + (r.hours || 0), 0);
  const withImpr = items.filter((r) => r.impressions > 0 && r.ctr !== null);
  const impr = withImpr.reduce((a, r) => a + r.impressions, 0);
  const clicks = withImpr.reduce((a, r) => a + r.impressions * (r.ctr / 100), 0);
  const subs = items.reduce((a, r) => a + (r.subs || 0), 0);
  const summary = {
    rows: items.length, revenue: r2(revenue), views, rpm: rpmOf(revenue, views),
    hours: r2(hours), revenuePerHour: hours > 0 ? revenue / hours : null,
    impressions: impr || null, ctr: impr > 0 ? clicks / impr : null,
    subs: subs || null, subsPer1000Views: subs > 0 && views > 0 ? (subs / views) * 1000 : null,
    from: dimension === "date" ? Math.min(...items.map((r) => r.t)) : null,
    to: dimension === "date" ? Math.max(...items.map((r) => r.t)) : null,
  };

  const findings = [];
  const share = (x, whole) => (whole > 0 ? x / whole : 0);

  // Reconciliation against the export's own Total row, when it has one.
  if (ctx.total && Number.isFinite(ctx.total.revenue) && ctx.total.revenue > 0) {
    const gap = ctx.total.revenue - revenue;
    if (gap / ctx.total.revenue > 0.01) {
      findings.push({ severity: "medium", title: `The rows cover ${pct(revenue / ctx.total.revenue)} of the file's own Total`, detail: `The Total row says ${fmt(ctx.total.revenue)} and the ${items.length} rows add to ${fmt(revenue)}. Studio exports a limited number of rows for a view, so the rest is not analysed here. Filter to a shorter date range or export again to bring the two closer.` });
    }
  }

  // Concentration.
  const byRev = [...items].sort((a, b) => b.revenue - a.revenue);
  let concentration = null;
  if (revenue > 0 && items.length >= 3) {
    let run = 0, n80 = 0;
    for (const r of byRev) { run += r.revenue; n80++; if (run >= 0.8 * revenue) break; }
    const topN = Math.max(1, Math.ceil(items.length * 0.1));
    const topShare = share(byRev.slice(0, topN).reduce((a, r) => a + r.revenue, 0), revenue);
    concentration = { top: byRev[0].label, topShare: share(byRev[0].revenue, revenue), topN, topNShare: topShare, rowsFor80: n80 };
    if (dimension !== "date" && (concentration.topShare >= 0.3 || topShare >= 0.6)) {
      findings.push({ severity: "medium", title: `${n80} of ${items.length} ${dimension} rows earn 80% of the revenue`, detail: `"${byRev[0].label}" alone is ${pct(concentration.topShare)} (${fmt(byRev[0].revenue)}). The top ${topN} are ${pct(topShare)} together. Income this concentrated moves with a handful of ${dimension === "video" ? "videos" : "rows"}: check whether their traffic is still growing or already fading.` });
    }
  }

  // Per-row RPM findings only make sense where each row is a comparable unit.
  const ranked = items.filter((r) => r.views >= minViews && r.rpm !== null);
  const med = ranked.length >= 4 ? median(ranked.map((r) => r.rpm)) : null;
  let rpmGap = null;
  if (med !== null && med > 0 && dimension !== "date") {
    const low = ranked.filter((r) => r.rpm < 0.5 * med && r.revenue > 0).sort((a, b) => b.views - a.views);
    if (low.length) {
      const gapRevenue = low.reduce((a, r) => a + (r.views * (med - r.rpm)) / 1000, 0);
      rpmGap = { rows: low.length, median: med, revenue: r2(gapRevenue) };
      const top = low.slice(0, 3).map((r) => `"${r.label}" (${int(r.views)} views at ${fmt(r.rpm)} RPM)`).join("; ");
      findings.push({ severity: gapRevenue > 0.1 * revenue ? "high" : "medium", title: `${low.length} ${dimension} row(s) earn under half the median RPM of ${fmt(med)}`, detail: `${top}${low.length > 3 ? "; …" : ""}. If those views paid the median, the period would have earned about ${fmt(gapRevenue)} more. That is a ceiling, not a forecast: low RPM often comes from the audience's country, a topic advertisers avoid, ads turned off, or a short format, and not all of it can be changed.` });
    }
    const zero = ranked.filter((r) => r.revenue === 0 && r.views >= Math.max(1000, minViews));
    if (zero.length) {
      const zv = zero.reduce((a, r) => a + r.views, 0);
      findings.push({ severity: "high", title: `${zero.length} ${dimension} row(s) with ${int(zv)} views earned nothing`, detail: `${zero.slice(0, 3).map((r) => `"${r.label}"`).join(", ")}${zero.length > 3 ? ", …" : ""}. Zero revenue on real views can mean monetization is off for those items, a claim or limited-ads status, or a revenue type this export leaves out. Check the monetization column in Studio for each.` });
    }
    const medViews = median(ranked.map((r) => r.views));
    const fed = ranked.filter((r) => r.rpm >= 1.5 * med && r.views < medViews).sort((a, b) => b.rpm - a.rpm);
    if (fed.length) {
      findings.push({ severity: "info", title: `${fed.length} ${dimension} row(s) pay well per view but get little traffic`, detail: `${fed.slice(0, 3).map((r) => `"${r.label}" (${fmt(r.rpm)} RPM on ${int(r.views)} views)`).join("; ")}. Topics and formats that earn 1.5 times the median per view are the ones worth making more of, or promoting from your other videos, if the RPM holds as views grow. It may not: a small sample can flatter a rate.` });
    }
  }

  // Impressions and click-through.
  if (summary.ctr !== null && dimension !== "date") {
    const weak = withImpr.filter((r) => r.impressions >= 1000 && r.ctr < 0.6 * summary.ctr * 100).sort((a, b) => b.impressions - a.impressions);
    if (weak.length) {
      findings.push({ severity: "medium", title: `${weak.length} ${dimension} row(s) are shown a lot but clicked well under your ${(summary.ctr * 100).toFixed(1)}% average`, detail: `${weak.slice(0, 3).map((r) => `"${r.label}" (${int(r.impressions)} impressions, ${r.ctr.toFixed(1)}%)`).join("; ")}. A different thumbnail or title is the usual lever. Click-through rate falls with broader audiences, so compare like with like before judging.` });
    }
  }

  // Duration buckets.
  let byDuration = null;
  const withDur = items.filter((r) => r.duration !== null);
  if (withDur.length >= 4 && dimension === "video") {
    byDuration = DURATION_BUCKETS.map((b, i) => {
      const lo = i === 0 ? 0 : DURATION_BUCKETS[i - 1].max;
      const set = withDur.filter((r) => r.duration > lo && r.duration <= b.max || (i === 0 && r.duration <= 0));
      const v = set.reduce((a, r) => a + r.views, 0), rev = set.reduce((a, r) => a + r.revenue, 0);
      return { bucket: b.key, videos: set.length, views: v, revenue: r2(rev), rpm: rpmOf(rev, v) };
    }).filter((b) => b.videos > 0);
    const big = byDuration.filter((b) => b.rpm !== null && b.views >= 0.1 * views);
    if (big.length >= 2) {
      const hi = [...big].sort((a, b) => b.rpm - a.rpm)[0], lo = [...big].sort((a, b) => a.rpm - b.rpm)[0];
      if (hi.rpm >= 2 * lo.rpm && lo.rpm >= 0) findings.push({ severity: "info", title: `${hi.bucket} videos earn ${(hi.rpm / Math.max(lo.rpm, 0.0001)).toFixed(1)} times the RPM of ${lo.bucket} videos`, detail: `${fmt(hi.rpm)} against ${fmt(lo.rpm)} per thousand views, each on at least a tenth of your views. Length changes how many ads a view can carry and which ad formats are eligible, so it is a lever to test rather than a rule.` });
    }
  }

  // Country mix: share of views versus share of revenue.
  if (dimension === "country" && revenue > 0 && views > 0) {
    const worst = items.filter((r) => share(r.views, views) >= 0.05 && r.rpm !== null && med !== null && r.rpm < 0.5 * med)
      .sort((a, b) => b.views - a.views);
    for (const r of worst.slice(0, 3)) findings.push({ severity: "info", title: `${r.label} is ${pct(share(r.views, views))} of views but ${pct(share(r.revenue, revenue))} of revenue`, detail: `RPM there is ${fmt(r.rpm)} against a median of ${fmt(med)} across countries. Advertiser demand differs by country, so growth in low-RPM countries adds views faster than it adds revenue.` });
  }

  // Monthly trend for a by-day export.
  let byMonth = null;
  if (dimension === "date") {
    const m = new Map();
    for (const r of items) { const k = monthKey(r.t); const o = m.get(k) || { month: k, revenue: 0, views: 0, days: 0 }; o.revenue += r.revenue; o.views += r.views; o.days += 1; m.set(k, o); }
    byMonth = [...m.values()].sort((a, b) => a.month.localeCompare(b.month)).map((o) => ({ ...o, revenue: r2(o.revenue), rpm: rpmOf(o.revenue, o.views) }));
    const full = byMonth.filter((o) => o.days >= 25);
    if (full.length >= 2) {
      const a = full[full.length - 2], b = full[full.length - 1];
      if (a.revenue > 0) {
        const chg = b.revenue / a.revenue - 1;
        const viewChg = a.views > 0 ? b.views / a.views - 1 : 0;
        if (Math.abs(chg) >= 0.15) findings.push({ severity: chg < 0 ? "medium" : "info", title: `${b.month} revenue is ${chg < 0 ? "down" : "up"} ${pct(Math.abs(chg))} on ${a.month}`, detail: `Views ${viewChg < 0 ? "fell" : "rose"} ${pct(Math.abs(viewChg))} and RPM went from ${fmt(a.rpm)} to ${fmt(b.rpm)}. Whichever moved more is the place to look: traffic, or what each view pays.` });
      }
    }
  }

  if (summary.revenuePerHour !== null && dimension !== "date") {
    findings.push({ severity: "info", title: `You earn about ${fmt(summary.revenuePerHour)} per watch hour`, detail: `${fmt(revenue)} over ${int(hours)} watch hours. It is a way to compare formats that differ in length: a long video earns more per view partly because it holds more hours.` });
  }
  if (revenue === 0) findings.unshift({ severity: "info", title: "No revenue in this file", detail: "Every row has zero revenue. If the channel earns, export from the Revenue tab of Studio Analytics rather than the Content tab, and check the date range." });
  if (summary.subsPer1000Views !== null && dimension === "video") {
    findings.push({ severity: "info", title: `About ${summary.subsPer1000Views.toFixed(1)} subscribers gained per 1,000 views`, detail: "A channel-wide average across the rows in the file; the Subscribers column can be negative for a video that lost more than it gained." });
  }

  return { summary, items, byRev, concentration, rpmGap, medianRpm: med, byDuration, byMonth, findings, dimension };
}

export function sampleCsv() {
  return [
    "Content,Video title,Video publish time,Duration,Views,Watch time (hours),Subscribers,Estimated revenue (USD),Impressions,Impressions click-through rate (%)",
    "Total,,,,168060,8103.6,1247,754.95,1332000,3.8",
    "a1B2c3,How I price a kitchen remodel bid,2026-05-02,1234,48210,3120.5,410,318.40,410000,4.1",
    "d4E5f6,Truck tour: tools I actually use,2026-05-20,905,31900,1840.2,265,142.10,380000,3.6",
    "g7H8i9,5 mistakes new contractors make,2026-06-04,612,22050,1105.4,190,108.75,150000,5.2",
    "j1K2l3,Job site vlog #12,2026-06-18,1510,9800,640.0,55,31.60,120000,2.1",
    "m4N5o6,Quick tip: chalk line trick,2026-06-25,45,41000,95.3,120,12.30,90000,4.8",
    "p7Q8r9,How to quote a bathroom remodel,2026-07-08,1180,6200,480.7,88,74.40,60000,3.9",
    "s1T2u3,Q&A: licensing and insurance,2026-07-15,2405,3100,410.0,40,0.00,45000,1.9",
    "v4W5x6,Shop tour 2026,2026-07-22,730,2400,150.2,22,9.10,52000,1.4",
    "y7Z8a9,Estimating tile work,2026-08-03,905,1900,140.9,31,31.50,14000,4.4",
    "b1C2d3,How I keep a client from ghosting,2026-08-10,660,1500,120.4,26,26.80,11000,5.1",
  ].join("\n");
}
