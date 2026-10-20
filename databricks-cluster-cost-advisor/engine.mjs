// Zero-dependency, deterministic Databricks cluster cost advisor. One row per
// cluster (kind, DBUs used in a month, autotermination minutes, optional DBU
// burn rate and start count) in; dollars per cluster, the all-purpose-to-Jobs
// compute saving, the always-on and long-autotermination savings, and the
// settings to change out.
//
// What is arithmetic and what is a model: dollars are DBUs times a per-DBU
// price for the cluster's kind, editable. The Jobs-compute saving is the DBU
// rate difference on work that already runs on a schedule. The autotermination
// saving assumes each start is followed by one idle tail of (autotermination -
// target) minutes at the cluster's DBU burn rate, capped at 80% of its DBUs.
// The always-on saving assumes the cluster is only needed for `workHours` a
// month. Cloud VM cost (billed by AWS/Azure/GCP, not Databricks) is NOT modelled.

// ILLUSTRATIVE and dated; contracts and clouds differ. Overridable.
export const PRICES_AS_OF = "illustrative list DBU rates: all-purpose compute about $0.55/DBU, Jobs compute about $0.15/DBU (Premium, AWS, pay-as-you-go; Azure, GCP and committed-use contracts differ); cloud VM cost is billed separately and not modelled; verify against the Databricks pricing page and your contract";
export const DEFAULT_PRICES = { allPurpose: 0.55, jobs: 0.15 };
export const KINDS = ["interactive", "scheduled", "jobs"];
export const DEFAULTS = { terminateTarget: 30, minMonthlySaving: 10, workHours: 220, hoursPerMonth: 730 };

const toNum = (s) => {
  const n = Number(String(s ?? "").trim().replace(/,/g, ""));
  return String(s ?? "").trim() !== "" && Number.isFinite(n) && n >= 0 ? n : NaN;
};

/** Normalises interactive / all-purpose / scheduled / job / jobs-compute to a KINDS value, or null. */
export function normalizeKind(raw) {
  const k = String(raw ?? "").toLowerCase().replace(/[^a-z]/g, "");
  if (["interactive", "allpurpose", "notebook", "adhoc"].includes(k)) return "interactive";
  if (["scheduled", "allpurposescheduled", "allpurposejob"].includes(k)) return "scheduled";
  if (["jobs", "job", "jobscompute", "jobcluster"].includes(k)) return "jobs";
  return null;
}

/** Parses `cluster,kind,dbu_month,autotermination_minutes[,dbu_per_hour[,starts_month]]`; header names remap columns. autotermination blank/never/0/null = never terminates. */
export function parseClusters(text) {
  const rows = [];
  let skipped = 0;
  const col = { name: 0, kind: 1, dbu: 2, term: 3, rate: 4, starts: 5 };
  let sawHeader = false;
  for (const raw of String(text ?? "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const cells = line.split(/\s*[,\t]\s*/);
    if (!sawHeader && rows.length === 0 && /dbu/i.test(line) && /kind|type|terminat/i.test(line)) {
      sawHeader = true;
      const find = (re) => cells.findIndex((c) => re.test(c));
      const m = { name: find(/cluster|name/i), kind: find(/kind|type/i), dbu: find(/dbu_?(?:month|used|total)|^dbus?$/i), term: find(/terminat|suspend/i), rate: find(/per_?hour|rate|burn/i), starts: find(/start/i) };
      for (const k of Object.keys(m)) if (m[k] >= 0) col[k] = m[k];
      continue;
    }
    const name = String(cells[col.name] ?? "").trim();
    const kind = normalizeKind(cells[col.kind]);
    const dbu = toNum(cells[col.dbu]);
    const termRaw = String(cells[col.term] ?? "").trim().toLowerCase();
    const term = termRaw === "" || termRaw === "never" || termRaw === "null" ? 0 : toNum(termRaw);
    const opt = (i) => (String(cells[i] ?? "").trim() === "" ? null : toNum(cells[i]));
    const rate = opt(col.rate);
    const starts = opt(col.starts);
    if (!name || !kind || Number.isNaN(dbu) || Number.isNaN(term) || Number.isNaN(rate) || Number.isNaN(starts)) { skipped += 1; continue; }
    rows.push({ name, kind, dbu, term, dbuPerHour: rate, starts });
  }
  return { rows, skipped };
}

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
  const priceOf = (kind) => (kind === "jobs" ? prices.jobs : prices.allPurpose);
  const grand = rows.reduce((a, r) => a + r.dbu * priceOf(r.kind), 0);

  const clusters = rows.map((row) => {
    const price = priceOf(row.kind);
    const cost = row.dbu * price;
    const allPurpose = row.kind !== "jobs";
    const toJobs = row.kind === "scheduled" ? row.dbu * (prices.allPurpose - prices.jobs) : 0;
    const neverTerminates = allPurpose && row.term === 0;
    const alwaysOn = neverTerminates && row.dbuPerHour !== null && row.dbu >= 0.9 * row.dbuPerHour * o.hoursPerMonth;
    let alwaysOnSaving = 0;
    if (alwaysOn && row.kind === "interactive") alwaysOnSaving = Math.max(0, row.dbu - row.dbuPerHour * o.workHours) * price;
    let termSaving = 0;
    if (row.kind === "interactive" && row.term > o.terminateTarget && row.starts !== null && row.dbuPerHour !== null) {
      const hours = (row.starts * (row.term - o.terminateTarget)) / 60;
      termSaving = Math.min(hours * row.dbuPerHour, row.dbu * 0.8) * price;
    }
    return { row, cost, toJobs: toJobs >= o.minMonthlySaving ? toJobs : 0, neverTerminates, alwaysOn, alwaysOnSaving: alwaysOnSaving >= o.minMonthlySaving ? alwaysOnSaving : 0, termSaving: termSaving >= o.minMonthlySaving ? termSaving : 0 };
  });

  for (const c of clusters) {
    const { row } = c;
    if (c.toJobs > 0) add("scheduled-on-all-purpose", "warn", row.name, `${row.name}: ${row.dbu.toLocaleString("en-US")} DBUs a month on all-purpose compute for work that runs on a schedule. The same DBUs on Jobs compute list at ${usd(prices.jobs)} instead of ${usd(prices.allPurpose)}, saving about ${usd(c.toJobs)}/month (${usd(c.toJobs * 12)}/year). Change the job's task to use a job cluster (new_cluster in the job definition) instead of an existing all-purpose cluster. VM cost is unchanged.`);
    if (c.alwaysOn) add("always-on-cluster", "warn", row.name, `${row.name}: autotermination is off and ${row.dbu.toLocaleString("en-US")} DBUs is about ${Math.round((row.dbu / (row.dbuPerHour * o.hoursPerMonth)) * 100)}% of running at ${row.dbuPerHour} DBU/hour around the clock (${usd(c.cost)}/month). ${c.alwaysOnSaving > 0 ? `If it is only needed about ${o.workHours} hours a month, setting autotermination_minutes to ${o.terminateTarget} saves roughly ${usd(c.alwaysOnSaving)}/month (model, not a measurement). ` : ""}Set "autotermination_minutes": ${o.terminateTarget} in the cluster configuration unless something depends on it staying up.`);
    else if (c.neverTerminates && row.dbu > 0 && !(c.toJobs > 0)) add("no-autotermination", "warn", row.name, `${row.name}: autotermination is off on an all-purpose cluster, so it keeps billing until someone stops it (${usd(c.cost)} this month). Set "autotermination_minutes": ${o.terminateTarget} in the cluster configuration.`);
    if (c.termSaving > 0) add("autotermination-too-long", "warn", row.name, `${row.name}: autotermination is ${row.term} minutes with about ${row.starts} starts a month. Each start idles ${row.term} minutes before stopping; at ${o.terminateTarget} that tail shrinks, saving about ${usd(c.termSaving)}/month (${usd(c.termSaving * 12)}/year). The cost is a cold restart after a longer gap. Set "autotermination_minutes": ${o.terminateTarget}.`);
    if (row.kind === "jobs" && c.cost / grand >= 0.5 && rows.length > 1) add("one-cluster-dominates", "info", row.name, `${row.name} is ${Math.round((c.cost / grand) * 100)}% of the total (${usd(c.cost)} of ${usd(grand)}). Start there.`);
    else if (row.kind !== "jobs" && c.cost / grand >= 0.5 && rows.length > 1) add("one-cluster-dominates", "info", row.name, `${row.name} is ${Math.round((c.cost / grand) * 100)}% of the total (${usd(c.cost)} of ${usd(grand)}). Start there: its settings move the bill more than the rest combined.`);
  }

  const totals = clusters.reduce((a, c) => ({ current: a.current + c.cost, dbu: a.dbu + c.row.dbu, saving: a.saving + c.toJobs + Math.max(c.alwaysOnSaving, c.termSaving) }), { current: 0, dbu: 0, saving: 0 });
  if (!findings.some((f) => f.severity !== "info")) add("clusters-fine", "info", "", `No scheduled work sits on all-purpose compute, no cluster lacks autotermination, and no autotermination tail is worth more than ${usd(o.minMonthlySaving)}/month at ${o.terminateTarget} minutes.`);
  return { count: rows.length, skipped: parsed.skipped ?? 0, clusters: clusters.map((c) => ({ name: c.row.name, kind: c.row.kind, dbu: c.row.dbu, current: c.cost, saving: c.toJobs + Math.max(c.alwaysOnSaving, c.termSaving) })), totals: { ...totals, after: totals.current - totals.saving, annual: totals.saving * 12 }, prices, options: o, findings };
}

export function summarize(report) {
  if (!report.count) return { status: "none", errors: 0, warns: 0, text: "No usable rows found. Expected lines like: nightly-etl,scheduled,9000,0,40,30 (cluster, kind interactive|scheduled|jobs, DBUs used this month, autotermination minutes or never, optional DBU per hour, optional starts a month)." };
  const errors = report.findings.filter((f) => f.severity === "error").length;
  const warns = report.findings.filter((f) => f.severity === "warn").length;
  const t = report.totals;
  return { status: errors ? "error" : warns ? "warn" : "ok", errors, warns, text: `${report.count} cluster(s). Modelled $${t.current.toFixed(2)}/month in DBUs (${t.dbu.toLocaleString("en-US")} DBUs)${t.saving > 0.005 ? `; the fixes below save about $${t.saving.toFixed(2)}/month, $${t.annual.toFixed(0)}/year` : ""}.` };
}

export const INPUT_NOTES = [
  { what: "cluster,kind,dbu_month,autotermination_minutes", detail: "One row per cluster. DBUs: SUM(usage_quantity) per cluster over 30 days from system.billing.usage (usage_metadata.cluster_id, sku_name). autotermination_minutes is in the cluster config; blank, never, null or 0 means it never terminates." },
  { what: "kind", detail: "interactive = all-purpose cluster people use from notebooks; scheduled = all-purpose cluster that runs scheduled jobs; jobs = Jobs compute (already the cheaper SKU). The SKU name in system.billing.usage tells you (…ALL_PURPOSE… vs …JOBS…)." },
  { what: "dbu_per_hour (optional 5th)", detail: "The cluster's DBU burn rate while running (shown in the cluster UI, the sum over its nodes). Needed to detect always-on clusters and to size the autotermination tail." },
  { what: "starts_month (optional 6th)", detail: "How many times the cluster started in the 30 days (count of start events in system.compute.clusters or the cluster event log). Needed to estimate the autotermination saving." },
  { what: "header row", detail: "One optional header; names (cluster, kind, dbu, terminat, per_hour, starts) remap the columns in any order." },
  { what: "# comment / blank lines", detail: "Ignored." },
  { what: "other lines", detail: "Counted as skipped, never guessed at." },
];
