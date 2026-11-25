/**
 * Quote-vs-actual calibration for a job shop: how far the shop's own quoted
 * setup hours and cycle times run from what the jobs actually took.
 *
 * Input is the shop's job history as CSV (an ERP export or a spreadsheet):
 * one row per job, with quoted and actual setup hours and/or quoted and actual
 * cycle minutes per part, and optionally a machine or work centre, the
 * quantity and the quote's outcome (won / lost). Nothing here ships a rate or
 * an industry figure; every number comes from the rows.
 *
 * Method, per group (all jobs, then each machine):
 *   ratio          = actual / quoted, for each job with both values above zero
 *   median, p25, p75 of the ratios (linear interpolation between ranks)
 *   hours ratio    = sum(actual hours) / sum(quoted hours), cycle hours being
 *                    quantity x minutes / 60, so a long run weighs more
 *   hours missed   = sum(actual hours - quoted hours); positive = under-quoted
 *   factor         = the median ratio, offered only with at least MIN_JOBS jobs
 *   outliers       = jobs with a ratio above 2 or below 0.5, listed for a look
 * The median is the suggested factor because one scrapped-and-rerun job should
 * not move every future quote; the hours ratio shows what the misses cost.
 */

export const MIN_JOBS = 5;
export const SOLID_JOBS = 15;

// ---- CSV ----------------------------------------------------------------

export function parseCsv(text) {
  const rows = [];
  let row = [], field = "", inQ = false;
  const s = String(text ?? "").replace(/^﻿/, "");
  const delim = detectDelimiter(s);
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQ) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; } else inQ = false;
      } else field += c;
    } else if (c === '"' && field === "") inQ = true;
    else if (c === delim) { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((f) => f.trim() !== ""));
}

// The header row decides: comma, semicolon (European spreadsheet exports) or tab.
function detectDelimiter(s) {
  const first = s.split(/\r?\n/, 1)[0] || "";
  let best = ",", most = 0;
  for (const d of [",", ";", "\t"]) {
    const n = first.split(d).length - 1;
    if (n > most) { best = d; most = n; }
  }
  return best;
}

// ---- Column mapping ------------------------------------------------------

const norm = (h) => String(h).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const QUOTED = /\b(quot\w*|est\w*|plan\w*|bid|std|standard)\b/;
const ACTUAL = /\b(act\w*|real|clocked|logged)\b/;
const MINUTES = /\b(min|mins|minute|minutes)\b/;
const HOURS = /\b(h|hr|hrs|hour|hours)\b/;

/**
 * Map header cells to fields. Returns { map: {field: index}, units, unknown }.
 * Setup is read as hours unless its header says minutes; cycle time as minutes
 * unless its header says hours. The page shows the mapping before trusting it.
 */
export function mapColumns(header) {
  const map = {}, units = { setup: "hours", cycle: "minutes" }, unknown = [];
  header.forEach((raw, i) => {
    const h = norm(raw);
    const put = (k) => { if (map[k] === undefined) map[k] = i; else unknown.push(raw); };
    if (/\bsetup|set up|setups\b/.test(h)) {
      if (ACTUAL.test(h)) put("actualSetup");
      else if (QUOTED.test(h)) put("quotedSetup");
      else unknown.push(raw);
      if (MINUTES.test(h)) units.setup = "minutes";
    } else if (/\bcycle|run time|per part\b/.test(h)) {
      if (ACTUAL.test(h)) put("actualCycle");
      else if (QUOTED.test(h)) put("quotedCycle");
      else unknown.push(raw);
      if (HOURS.test(h) && !MINUTES.test(h)) units.cycle = "hours";
    } else if (/^(job|job no|job number|job id|wo|work order|order|part|part no|part number|quote|quote no)$/.test(h)) put("job");
    else if (/\b(machine|work cent(er|re)|workcent(er|re)|cell|resource)\b/.test(h)) put("machine");
    else if (/^(qty|quantity|qty shipped|qty made|lot size|quantity made)$/.test(h)) put("quantity");
    else if (/\b(outcome|status|result|won|award\w*)\b/.test(h)) put("outcome");
    else unknown.push(raw);
  });
  return { map, units, unknown };
}

export function readOutcome(v) {
  const s = norm(v ?? "");
  if (/^(won|win|w|yes|y|1|true|awarded|award|po|po received|ordered|accepted)$/.test(s)) return "won";
  if (/^(lost|loss|l|no|n|0|false|declined|rejected|no bid|not awarded)$/.test(s)) return "lost";
  return "";
}

const toNum = (v) => {
  if (v === undefined || v === null) return null;
  const s = String(v).trim().replace(/[$,\s]/g, "");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
};

/**
 * Rows in, jobs out. Each job: { line, job, machine, quantity, quotedSetup,
 * actualSetup, quotedCycle, actualCycle, outcome } with setup in hours and
 * cycle in minutes; quotes with an outcome but no actuals yet (they still
 * count toward the win rate); and { line, reason } for rows that were skipped.
 */
export function readJobs(text) {
  const rows = parseCsv(text);
  if (!rows.length) return { jobs: [], quotes: [], skipped: [], columns: null, error: "No rows found." };
  const columns = mapColumns(rows[0]);
  const { map, units } = columns;
  const hasSetup = map.quotedSetup !== undefined && map.actualSetup !== undefined;
  const hasCycle = map.quotedCycle !== undefined && map.actualCycle !== undefined;
  if (!hasSetup && !hasCycle) {
    return { jobs: [], quotes: [], skipped: [], columns, error: "Need a quoted and an actual column for setup or for cycle time (for example quoted_setup_hours and actual_setup_hours)." };
  }
  const jobs = [], skipped = [], quotes = [];
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    const line = r + 1;
    const get = (k) => (map[k] === undefined ? undefined : cells[map[k]]);
    const vals = {
      quotedSetup: toNum(get("quotedSetup")), actualSetup: toNum(get("actualSetup")),
      quotedCycle: toNum(get("quotedCycle")), actualCycle: toNum(get("actualCycle")),
      quantity: toNum(get("quantity")),
    };
    const bad = Object.entries(vals).filter(([, v]) => Number.isNaN(v) || (v !== null && v < 0));
    if (bad.length) { skipped.push({ line, reason: `not a number or negative: ${bad.map(([k]) => k).join(", ")}` }); continue; }
    if (units.setup === "minutes") for (const k of ["quotedSetup", "actualSetup"]) if (vals[k] !== null) vals[k] /= 60;
    if (units.cycle === "hours") for (const k of ["quotedCycle", "actualCycle"]) if (vals[k] !== null) vals[k] *= 60;
    const setupPair = vals.quotedSetup > 0 && vals.actualSetup !== null;
    const cyclePair = vals.quotedCycle > 0 && vals.actualCycle !== null;
    const outcome = readOutcome(get("outcome"));
    if (!setupPair && !cyclePair && outcome) { quotes.push({ line, outcome, machine: String(get("machine") ?? "").trim() }); continue; }
    if (!setupPair && !cyclePair) { skipped.push({ line, reason: "no quoted-and-actual pair (a quoted value of 0 or blank cannot be compared)" }); continue; }
    jobs.push({
      line,
      job: String(get("job") ?? "").trim() || `row ${line}`,
      machine: String(get("machine") ?? "").trim(),
      quantity: vals.quantity && vals.quantity > 0 ? vals.quantity : 1,
      quantityGiven: vals.quantity !== null && vals.quantity > 0,
      quotedSetup: setupPair ? vals.quotedSetup : null,
      actualSetup: setupPair ? vals.actualSetup : null,
      quotedCycle: cyclePair ? vals.quotedCycle : null,
      actualCycle: cyclePair ? vals.actualCycle : null,
      outcome,
    });
  }
  return { jobs, quotes, skipped, columns, error: "" };
}

// ---- Statistics ----------------------------------------------------------

export function quantile(sorted, p) {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * p;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function confidence(n) {
  if (n < MIN_JOBS) return "too few";
  if (n < SOLID_JOBS) return "rough";
  return "usable";
}

/** One kind (setup or cycle) over a list of jobs. */
export function summarise(jobs, kind) {
  const q = kind === "setup" ? "quotedSetup" : "quotedCycle";
  const a = kind === "setup" ? "actualSetup" : "actualCycle";
  const hoursOf = (j, k) => (kind === "setup" ? j[k] : (j.quantity * j[k]) / 60);
  const used = jobs.filter((j) => j[q] > 0 && j[a] !== null && j[a] >= 0);
  const ratios = used.map((j) => j[a] / j[q]).sort((x, y) => x - y);
  const quotedHours = used.reduce((s, j) => s + hoursOf(j, q), 0);
  const actualHours = used.reduce((s, j) => s + hoursOf(j, a), 0);
  const n = used.length;
  const median = quantile(ratios, 0.5);
  return {
    kind,
    n,
    median,
    p25: quantile(ratios, 0.25),
    p75: quantile(ratios, 0.75),
    under: n ? used.filter((j) => j[a] / j[q] > 1.05).length / n : null,
    over: n ? used.filter((j) => j[a] / j[q] < 0.95).length / n : null,
    quotedHours,
    actualHours,
    hoursRatio: quotedHours > 0 ? actualHours / quotedHours : null,
    hoursMissed: actualHours - quotedHours,
    factor: n >= MIN_JOBS ? Math.round(median * 100) / 100 : null,
    confidence: confidence(n),
    outliers: used
      .map((j) => ({ job: j.job, line: j.line, machine: j.machine, ratio: j[a] / j[q], quoted: j[q], actual: j[a] }))
      .filter((o) => o.ratio > 2 || o.ratio < 0.5)
      .sort((x, y) => Math.abs(Math.log(y.ratio || 1e-9)) - Math.abs(Math.log(x.ratio || 1e-9))),
  };
}

function winRate(jobs) {
  const won = jobs.filter((j) => j.outcome === "won").length;
  const lost = jobs.filter((j) => j.outcome === "lost").length;
  return { won, lost, rate: won + lost ? won / (won + lost) : null };
}

/**
 * The full report: overall and per machine, for setup and cycle.
 * `rate` (optional, $/h) turns hours missed into dollars.
 */
export function calibrate(text, { rate } = {}) {
  const read = readJobs(text);
  const r = Number(rate);
  const dollars = Number.isFinite(r) && r > 0 ? r : null;
  const group = (name, js, qs) => {
    const setup = summarise(js, "setup"), cycle = summarise(js, "cycle");
    const missed = setup.hoursMissed + cycle.hoursMissed;
    return { name, jobs: js.length, setup, cycle, hoursMissed: missed, dollarsMissed: dollars === null ? null : missed * dollars, wins: winRate([...js, ...qs]) };
  };
  const overall = group("All jobs", read.jobs, read.quotes);
  const names = [...new Set([...read.jobs, ...read.quotes].map((j) => j.machine).filter(Boolean))].sort();
  const machines = names.map((m) => group(m, read.jobs.filter((j) => j.machine === m), read.quotes.filter((j) => j.machine === m)));
  const noQuantity = read.columns?.map.quantity === undefined && read.jobs.some((j) => j.quotedCycle !== null);
  return { ...read, overall, machines, rate: dollars, noQuantity };
}

/** Summary rows for a CSV download, one per group and kind. */
export function reportCsv(report) {
  const esc = (v) => {
    let s = v === null || v === undefined ? "" : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // keep a spreadsheet from running a cell as a formula
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const f = (n, d = 3) => (n === null || n === undefined ? "" : Number(n.toFixed(d)));
  const out = [["group", "kind", "jobs", "median_ratio", "p25", "p75", "share_under_quoted", "hours_ratio", "quoted_hours", "actual_hours", "hours_missed", "suggested_factor", "confidence"]];
  for (const g of [report.overall, ...report.machines]) {
    for (const s of [g.setup, g.cycle]) {
      if (!s.n) continue;
      out.push([g.name, s.kind, s.n, f(s.median), f(s.p25), f(s.p75), f(s.under), f(s.hoursRatio), f(s.quotedHours, 2), f(s.actualHours, 2), f(s.hoursMissed, 2), s.factor ?? "", s.confidence]);
    }
  }
  return out.map((r) => r.map(esc).join(",")).join("\n") + "\n";
}

/** An example history, invented for the demo button and the tests. */
export const EXAMPLE_CSV = `job,machine,qty,quoted_setup_hours,actual_setup_hours,quoted_cycle_min,actual_cycle_min,outcome
J-1001,Haas VF-2,25,1.5,2.0,12,13.5,won
J-1002,Haas VF-2,10,2.0,2.5,18,21,won
J-1003,Haas VF-2,50,1.0,1.25,8,8.5,won
J-1004,Haas VF-2,5,3.0,3.0,25,31,won
J-1005,Haas VF-2,100,1.5,1.75,6,6.5,won
J-1006,Haas VF-2,20,2.0,4.5,15,16,won
J-1007,Okuma LB3000,200,1.0,1.0,3.5,3.4,won
J-1008,Okuma LB3000,75,1.5,1.25,5,4.8,won
J-1009,Okuma LB3000,40,1.0,1.1,7,6.6,won
J-1010,Okuma LB3000,150,0.75,0.75,4,4.1,won
J-1011,Okuma LB3000,60,1.25,1.0,6,5.5,won
Q-2001,Haas VF-2,30,,,10,,lost
Q-2002,Okuma LB3000,500,,,3,,lost
Q-2003,Haas VF-2,12,,,20,,won
`;
