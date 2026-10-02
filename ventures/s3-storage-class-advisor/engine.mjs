// Zero-dependency, deterministic S3 storage-class advisor. Given one row per
// bucket or prefix (stored GB, object count, GB read back per month, GET
// requests per month, optional average object life in days) it prices the same
// data in S3 Standard, Standard-IA, Intelligent-Tiering and Glacier Instant
// Retrieval and says which is cheapest per row, with the minimum-billable-size
// and minimum-duration traps that make the "cheaper" classes cost more.
// Pure string in, report out.
//
// What is arithmetic and what is a model: Standard / IA / Glacier IR are
// arithmetic on the numbers you give. Intelligent-Tiering is a model: data you
// did not read this month is assumed cold, and `iaShareOfCold` of it is in the
// Infrequent tier (30-89 days untouched) with the rest in Archive Instant
// (90+ days). Request prices for PUT/lifecycle transitions are not modelled.

// ILLUSTRATIVE and dated; AWS reprices by region. Overridable per run.
export const PRICES_AS_OF = "us-east-1 list prices (no free tier, no volume discount, no transition or PUT charges); verify against the S3 pricing page";
export const DEFAULT_PRICES = {
  standard: { gbMonth: 0.023, per1kGet: 0.0004, retrievalPerGb: 0 },
  "standard-ia": { gbMonth: 0.0125, per1kGet: 0.001, retrievalPerGb: 0.01, minKb: 128, minDays: 30 },
  "glacier-ir": { gbMonth: 0.004, per1kGet: 0.01, retrievalPerGb: 0.03, minKb: 128, minDays: 90 },
  "intelligent-tiering": { frequentGbMonth: 0.023, infrequentGbMonth: 0.0125, archiveInstantGbMonth: 0.004, per1kGet: 0.0004, monitorPer1kObjects: 0.0025, minKb: 128 },
};
export const CLASSES = ["standard", "standard-ia", "intelligent-tiering", "glacier-ir"];
export const DEFAULTS = { iaShareOfCold: 0.3, switchSavings: 0.2, minMonthlySaving: 5, current: "standard", retrievalHeavy: 0.5 };
const KB_PER_GB = 1048576;

const toNum = (s) => {
  const n = Number(String(s).trim().replace(/,/g, ""));
  return String(s).trim() !== "" && Number.isFinite(n) && n >= 0 ? n : NaN;
};

/**
 * Rows of `name, size_gb, objects, read_gb_per_month, gets_per_month[, avg_life_days]`
 * (comma, tab or two+ spaces; one optional header row; `#` comments ignored).
 */
export function parseRows(text) {
  const records = [];
  let skipped = 0;
  for (const raw of String(text ?? "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const cells = line.split(/\s*[,\t]\s*|\s{2,}/);
    if (cells.length < 5) { skipped += 1; continue; }
    const n = cells.slice(1, 6).map((c, i) => (i === 4 && (c === undefined || c === "") ? null : toNum(c)));
    const [size, objects, read, gets, life] = n;
    if ([size, objects, read, gets].some((v) => v === null || Number.isNaN(v)) || (cells[5] !== undefined && cells[5] !== "" && Number.isNaN(life))) {
      if (records.length === 0 && !records.header && /size|object|read|get/i.test(cells.join(" "))) continue; // header
      skipped += 1;
      continue;
    }
    records.push({ name: cells[0], sizeGb: size, objects, readGb: Math.min(read, size), gets, lifeDays: cells[5] === undefined || cells[5] === "" ? null : life });
  }
  return { records, skipped };
}

const avgKb = (r) => (r.objects > 0 ? (r.sizeGb * KB_PER_GB) / r.objects : Infinity);

/** Monthly cost of one row in one class. Returns { cost, notes[] }. */
export function priceRow(r, cls, prices = DEFAULT_PRICES, o = DEFAULTS) {
  const p = prices[cls];
  const kb = avgKb(r);
  const notes = [];
  const getCost = (per1k) => (r.gets / 1000) * per1k;
  if (cls === "standard") return { cost: r.sizeGb * p.gbMonth + getCost(p.per1kGet), notes };
  if (cls === "standard-ia" || cls === "glacier-ir") {
    let billable = r.sizeGb;
    if (kb < p.minKb) { billable = r.objects * (p.minKb / KB_PER_GB); notes.push(`objects average ${kb.toFixed(0)} KB; billed as ${p.minKb} KB each (${(billable / r.sizeGb).toFixed(1)}x the stored size)`); }
    let factor = 1;
    if (r.lifeDays !== null && r.lifeDays > 0 && r.lifeDays < p.minDays) { factor = p.minDays / r.lifeDays; notes.push(`objects live ${r.lifeDays} days but ${cls} bills ${p.minDays}; storage cost x${factor.toFixed(1)}`); }
    return { cost: billable * p.gbMonth * factor + r.readGb * p.retrievalPerGb + getCost(p.per1kGet), notes };
  }
  // intelligent-tiering
  if (kb < p.minKb) {
    notes.push(`objects average ${kb.toFixed(0)} KB, under ${p.minKb} KB: never auto-tiered or monitored, so they cost the same as Standard`);
    return { cost: r.sizeGb * p.frequentGbMonth + getCost(p.per1kGet), notes };
  }
  const cold = r.sizeGb - r.readGb;
  const storage = r.readGb * p.frequentGbMonth + cold * o.iaShareOfCold * p.infrequentGbMonth + cold * (1 - o.iaShareOfCold) * p.archiveInstantGbMonth;
  return { cost: storage + (r.objects / 1000) * p.monitorPer1kObjects + getCost(p.per1kGet), notes };
}

export function analyze(parsed, options = {}) {
  const o = { ...DEFAULTS, ...options };
  const prices = { ...DEFAULT_PRICES, ...(options.prices ?? {}) };
  const records = parsed.records;
  if (!records.length) return { count: 0, rows: [], findings: [], skipped: parsed.skipped ?? 0 };
  const usd = (n) => {
    const format = (n) => `$${n.toFixed(2)}`;
    const text = format(Math.abs(n));
    return n < 0 && /[1-9]/.test(text) ? `-${text}` : text;
  };
  const findings = [];
  const add = (rule, severity, name, message) => findings.push({ rule, severity, row: name, message });
  const rows = records.map((r) => {
    const costs = {}; const notes = {};
    for (const c of CLASSES) { const x = priceRow(r, c, prices, o); costs[c] = x.cost; notes[c] = x.notes; }
    const current = costs[o.current] ?? costs.standard;
    const best = CLASSES.reduce((a, b) => (costs[b] < costs[a] ? b : a), o.current in costs ? o.current : "standard");
    const saving = current - costs[best];
    const retrievalShare = r.sizeGb > 0 ? r.readGb / r.sizeGb : 0;
    if (best !== o.current && saving >= o.minMonthlySaving && saving / current >= o.switchSavings) {
      add(`move-to-${best}`, "warn", r.name, `${r.name}: ${best} models at ${usd(costs[best])}/month against ${usd(current)} on ${o.current}, about ${usd(saving)} (${Math.round((saving / current) * 100)}%) a month.`);
    } else {
      add("class-fine", "info", r.name, `${r.name}: ${o.current} (${usd(current)}/month) is within ${Math.round(o.switchSavings * 100)}% or ${usd(o.minMonthlySaving)} of the cheapest class (${best}, ${usd(costs[best])}); not worth a lifecycle rule.`);
    }
    for (const c of ["standard-ia", "glacier-ir"]) {
      if (notes[c].length && costs[c] < current) add("cheap-class-trap", "info", r.name, `${r.name} in ${c}: ${notes[c][0]}. The price table understates this unless you check it.`);
    }
    if (retrievalShare >= o.retrievalHeavy && best === "standard") add("retrieval-heavy", "info", r.name, `${r.name}: ${Math.round(retrievalShare * 100)}% of the stored data is read back each month; per-GB retrieval fees make the colder classes lose.`);
    return { name: r.name, sizeGb: r.sizeGb, objects: r.objects, avgKb: avgKb(r), costs, current, best, saving };
  });
  const totals = { current: rows.reduce((a, x) => a + x.current, 0), best: rows.reduce((a, x) => a + x.costs[x.best], 0) };
  totals.saving = totals.current - totals.best;
  return { count: rows.length, skipped: parsed.skipped ?? 0, options: o, prices, rows, totals, findings };
}

export function summarize(report) {
  if (!report.count) return { status: "none", errors: 0, warns: 0, text: "No usable rows found. Expected lines like: logs-archive,48000,90000000,300,120000,400 (name, GB stored, objects, GB read per month, GETs per month, optional average life in days)." };
  const warns = report.findings.filter((f) => f.severity === "warn").length;
  const head = `${report.count} bucket/prefix row(s). Modelled at $${report.totals.current.toFixed(2)}/month on ${report.options.current}; cheapest per row $${report.totals.best.toFixed(2)}/month, a gap of $${report.totals.saving.toFixed(2)}.`;
  return { status: warns ? "warn" : "ok", errors: 0, warns, text: head };
}

export const INPUT_NOTES = [
  { what: "name,size_gb,objects,read_gb,gets", detail: "One row per bucket or prefix: GB stored, number of objects, GB read back per month, GET requests per month. Comma, tab or two-space separated." },
  { what: "optional 6th column", detail: "Average object life in days. Rows shorter than 30 days (Standard-IA) or 90 days (Glacier IR) pay the minimum-duration charge." },
  { what: "header row", detail: "One optional header row at the top is skipped." },
  { what: "# comment / blank lines", detail: "Ignored." },
  { what: "other lines", detail: "Counted as skipped, never guessed at." },
];
