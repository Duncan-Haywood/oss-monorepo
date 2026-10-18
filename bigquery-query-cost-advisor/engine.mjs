// Zero-dependency, deterministic BigQuery query cost advisor. One row per query
// group (runs per month, GB billed per run, slot-hours per run) in; on-demand
// cost, Editions (slot-hour) cost, which is cheaper, the groups that dominate,
// and a --maximum_bytes_billed guardrail for any single run that is expensive.
//
// What is arithmetic and what is a model: on-demand is bytes billed times the
// per-TiB price (after the monthly free TiB). Editions cost assumes slots are
// billed for exactly the slot-hours used, which ignores autoscaler granularity
// (50-slot steps, one-minute minimum) and idle baseline slots -- so it is a
// floor on Editions cost, and every message says so.

// ILLUSTRATIVE and dated; Google reprices by region and edition. Overridable.
export const PRICES_AS_OF = "US multi-region list prices (on-demand $6.25/TiB with the first 1 TiB per month free; Editions pay-as-you-go $0.04/slot-hour Standard, $0.06 Enterprise); storage, streaming, BI Engine and commitments not modelled; verify against the BigQuery pricing page";
export const DEFAULT_PRICES = { perTib: 6.25, freeTib: 1, slotHour: 0.06 };
export const DEFAULTS = { guardrailUsd: 5, dominatesShare: 0.4, scanGb: 100, scanRuns: 100 };
const GB_PER_TIB = 1024;

const toNum = (s) => {
  const n = Number(String(s ?? "").trim().replace(/,/g, ""));
  return String(s ?? "").trim() !== "" && Number.isFinite(n) && n >= 0 ? n : NaN;
};

/** Parses `query_group,runs_per_month,gb_billed_per_run[,slot_hours_per_run]`; header names remap columns. Blank slot hours = unknown. */
export function parseQueries(text) {
  const rows = [];
  let skipped = 0;
  const col = { name: 0, runs: 1, gb: 2, slots: 3 };
  let sawHeader = false;
  for (const raw of String(text ?? "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const cells = line.split(/\s*[,\t]\s*/);
    if (!sawHeader && rows.length === 0 && Number.isNaN(toNum(cells[1])) && /runs|gb|billed/i.test(line)) {
      sawHeader = true;
      const find = (re) => cells.findIndex((c) => re.test(c));
      const m = { name: find(/group|name|query/i), runs: find(/runs|count|executions/i), gb: find(/gb|billed|bytes/i), slots: find(/slot/i) };
      for (const k of Object.keys(m)) if (m[k] >= 0) col[k] = m[k];
      continue;
    }
    const name = String(cells[col.name] ?? "").trim();
    const runs = toNum(cells[col.runs]);
    const gb = toNum(cells[col.gb]);
    const slotRaw = String(cells[col.slots] ?? "").trim();
    const slots = slotRaw === "" ? null : toNum(slotRaw);
    if (!name || Number.isNaN(runs) || Number.isNaN(gb) || Number.isNaN(slots)) { skipped += 1; continue; }
    rows.push({ name, runs, gbPerRun: gb, slotHoursPerRun: slots });
  }
  return { rows, skipped };
}

/** Per-group on-demand cost before the free TiB (which is applied once, to the total). */
export const onDemandGross = (row, prices = DEFAULT_PRICES) => (row.runs * row.gbPerRun / GB_PER_TIB) * prices.perTib;
export const editionsCost = (row, prices = DEFAULT_PRICES) => (row.slotHoursPerRun === null ? null : row.runs * row.slotHoursPerRun * prices.slotHour);

export function analyze(parsed, options = {}) {
  const o = { ...DEFAULTS, ...options };
  const prices = { ...DEFAULT_PRICES, ...(options.prices ?? {}) };
  const rows = parsed.rows;
  if (!rows.length) return { count: 0, findings: [], skipped: parsed.skipped ?? 0 };
  const findings = [];
  const add = (rule, severity, row, message) => findings.push({ rule, severity, row, message });
  const usd = (n) => {
    const format = (n) => `$${n.toFixed(2)}`;
    const text = format(Math.abs(n));
    return n < 0 && /[1-9]/.test(text) ? `-${text}` : text;
  };

  const totalTib = rows.reduce((a, r) => a + (r.runs * r.gbPerRun) / GB_PER_TIB, 0);
  const grossTotal = totalTib * prices.perTib;
  const freeCredit = Math.min(totalTib, prices.freeTib) * prices.perTib;
  const onDemandTotal = grossTotal - freeCredit;
  const allSlots = rows.every((r) => r.slotHoursPerRun !== null);
  const editionsTotal = allSlots ? rows.reduce((a, r) => a + editionsCost(r, prices), 0) : null;

  const groups = rows.map((row) => {
    const gross = onDemandGross(row, prices);
    const perRunUsd = (row.gbPerRun / GB_PER_TIB) * prices.perTib;
    return { row, gross, perRunUsd, editions: editionsCost(row, prices), share: grossTotal > 0 ? gross / grossTotal : 0 };
  });

  if (editionsTotal !== null && editionsTotal < onDemandTotal) add("editions-cheaper", "warn", "", `Slot-hours priced at ${usd(prices.slotHour)} come to ${usd(editionsTotal)}/month against ${usd(onDemandTotal)}/month on-demand: about ${usd(onDemandTotal - editionsTotal)}/month (${usd((onDemandTotal - editionsTotal) * 12)}/year) cheaper on paper. This is a floor: autoscaling bills in 50-slot steps with a one-minute minimum, and a baseline reservation bills while idle. Pilot with a small max-slots cap before moving a project: bq mk --reservation --project_id=<admin-project> --location=US --edition=ENTERPRISE --autoscale_max_slots=100 <name>`);
  else if (editionsTotal !== null) add("on-demand-cheaper", "info", "", `On-demand at ${usd(onDemandTotal)}/month beats ${usd(editionsTotal)}/month of slot-hours: staying on on-demand is right for this workload. Revisit if scanned bytes per slot-hour rises.`);
  else add("slot-hours-missing", "info", "", "Slot hours were not supplied for every group, so Editions is not compared. Get them from INFORMATION_SCHEMA.JOBS: SUM(total_slot_ms)/3600000 per group.");

  for (const g of groups) {
    const { row } = g;
    if (g.perRunUsd >= o.guardrailUsd) {
      const bytes = Math.ceil(row.gbPerRun * 1.25 * 1e9);
      add("expensive-single-run", "warn", row.name, `${row.name}: one run bills about ${row.gbPerRun} GB, ${usd(g.perRunUsd)} each. Cap it so a bad edit cannot cost more than 25% above that: bq query --maximum_bytes_billed=${bytes} ... (a job over the cap fails without charge). For the whole project set a custom quota on query usage per day.`);
    }
    if (rows.length > 1 && g.share >= o.dominatesShare) add("group-dominates", "info", row.name, `${row.name} is ${Math.round(g.share * 100)}% of scanned-bytes cost (${usd(g.gross)} of ${usd(grossTotal)} before the free TiB). Fix this one first.`);
    if (row.runs >= o.scanRuns && row.gbPerRun >= o.scanGb) add("repeated-large-scan", "info", row.name, `${row.name}: ${row.runs} runs a month each billing ${row.gbPerRun} GB. Repeated large scans are what partitioning, clustering and materialized views remove: filter on a partitioned column (and set require_partition_filter), select only the columns you use (BigQuery bills per column read, so SELECT * is the expensive form), or precompute the result once and read the small table.`);
  }

  const totals = { onDemand: onDemandTotal, editions: editionsTotal, free: freeCredit, tib: totalTib, cheaper: editionsTotal !== null && editionsTotal < onDemandTotal ? "editions" : "on-demand" };
  const saving = editionsTotal !== null && editionsTotal < onDemandTotal ? onDemandTotal - editionsTotal : 0;
  if (!findings.some((f) => f.severity === "warn")) add("bigquery-fine", "info", "", `No single run is over ${usd(o.guardrailUsd)} and Editions would not be cheaper.`);
  return { count: rows.length, skipped: parsed.skipped ?? 0, groups: groups.map((g) => ({ name: g.row.name, runs: g.row.runs, gbPerRun: g.row.gbPerRun, perRunUsd: g.perRunUsd, onDemand: g.gross, editions: g.editions, share: g.share })), totals: { ...totals, saving, annual: saving * 12 }, prices, options: o, findings };
}

export function summarize(report) {
  if (!report.count) return { status: "none", errors: 0, warns: 0, text: "No usable rows found. Expected lines like: dashboard-refresh,4300,180,0.9 (query group, runs per month, GB billed per run, slot-hours per run optional)." };
  const errors = report.findings.filter((f) => f.severity === "error").length;
  const warns = report.findings.filter((f) => f.severity === "warn").length;
  const t = report.totals;
  return { status: errors ? "error" : warns ? "warn" : "ok", errors, warns, text: `${report.count} query group(s) scanning ${t.tib.toFixed(2)} TiB/month. On-demand $${t.onDemand.toFixed(2)}/month${t.editions !== null ? `; Editions slot-hours $${t.editions.toFixed(2)}/month` : ""}${t.saving > 0.005 ? `; Editions could save up to about $${t.saving.toFixed(2)}/month, $${t.annual.toFixed(0)}/year (its cost here is a floor)` : ""}.` };
}

export const INPUT_NOTES = [
  { what: "query_group,runs_per_month,gb_billed_per_run", detail: "One row per recurring query or query family. From INFORMATION_SCHEMA.JOBS_BY_PROJECT: COUNT(*) per month, and AVG(total_bytes_billed)/1e9 per run, grouped by a label, user or query hash." },
  { what: "slot_hours_per_run (optional 4th column)", detail: "AVG(total_slot_ms)/3600000 per run for the same group. Needed to compare Editions; blank means unknown." },
  { what: "header row", detail: "One optional header; names (runs, gb billed, slot) remap the columns in any order." },
  { what: "# comment / blank lines", detail: "Ignored." },
  { what: "other lines", detail: "Counted as skipped, never guessed at." },
];
