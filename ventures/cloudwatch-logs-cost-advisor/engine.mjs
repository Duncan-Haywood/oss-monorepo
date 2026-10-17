// Zero-dependency, deterministic CloudWatch Logs cost advisor. One row per log
// group (stored GB, retention, GB ingested per month, age, class) in; monthly
// ingestion + storage cost, the retention policy to set, and the saving out.
//
// What is arithmetic and what is a model: costs are list prices times the row.
// The saving from a shorter retention assumes ingestion has been roughly even
// over the group's life (stored data scales with retention, or with age for a
// group that never expires). That is a model, stated in every message.

// ILLUSTRATIVE and dated; AWS reprices by region. Overridable.
export const PRICES_AS_OF = "us-east-1 list prices (Standard class ingestion $0.50/GB, Infrequent Access ingestion $0.25/GB, archived storage $0.03/GB-month); no free tier, no Logs Insights queries, no vended-log tiers; verify against the CloudWatch pricing page";
export const DEFAULT_PRICES = { ingestStandard: 0.5, ingestIa: 0.25, storage: 0.03 };
export const VALID_RETENTION = [1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1096, 1827, 2192, 2557, 2922, 3288, 3653];
export const DEFAULTS = { retention: 30, minMonthlySaving: 1, iaMinIngest: 50 };

const toNum = (s) => {
  const n = Number(String(s ?? "").trim().replace(/,/g, ""));
  return String(s ?? "").trim() !== "" && Number.isFinite(n) && n >= 0 ? n : NaN;
};

/** Smallest valid CloudWatch retention value that is >= days. */
export const snapRetention = (days) => VALID_RETENTION.find((d) => d >= days) ?? VALID_RETENTION[VALID_RETENTION.length - 1];

/** Parses `log_group,stored_gb,retention_days,ingested_gb_month[,age_days[,class]]`; header names remap columns. Retention blank/never/0 = never expires. */
export function parseGroups(text) {
  const rows = [];
  let skipped = 0;
  let col = { name: 0, stored: 1, retention: 2, ingest: 3, age: 4, cls: 5 };
  let sawHeader = false;
  for (const raw of String(text ?? "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const cells = line.split(/\s*[,\t]\s*/);
    if (!sawHeader && rows.length === 0 && /retention/i.test(line) && /stored|ingest/i.test(line)) {
      sawHeader = true;
      const find = (re) => cells.findIndex((c) => re.test(c));
      const m = { name: find(/group|name/i), stored: find(/stored|storage/i), retention: find(/retention/i), ingest: find(/ingest/i), age: find(/age|created/i), cls: find(/class/i) };
      for (const k of Object.keys(m)) if (m[k] >= 0) col[k] = m[k];
      continue;
    }
    const name = String(cells[col.name] ?? "").trim();
    const stored = toNum(cells[col.stored]);
    const ingest = toNum(cells[col.ingest]);
    const retRaw = String(cells[col.retention] ?? "").trim().toLowerCase();
    const retention = retRaw === "" || retRaw === "never" || retRaw === "null" || retRaw === "0" ? 0 : toNum(retRaw);
    const ageRaw = String(cells[col.age] ?? "").trim();
    const age = ageRaw === "" ? null : toNum(ageRaw);
    if (!name || Number.isNaN(stored) || Number.isNaN(ingest) || Number.isNaN(retention) || Number.isNaN(age)) { skipped += 1; continue; }
    const cls = /infrequent|^ia$/i.test(String(cells[col.cls] ?? "")) ? "ia" : "standard";
    rows.push({ name, storedGb: stored, retention, ingestGb: ingest, ageDays: age, cls });
  }
  return { rows, skipped };
}

export function groupCost(row, prices = DEFAULT_PRICES) {
  const ingest = row.ingestGb * (row.cls === "ia" ? prices.ingestIa : prices.ingestStandard);
  const storage = row.storedGb * prices.storage;
  return { ingest, storage, total: ingest + storage };
}

/** Estimated storage GB removed (steady state) by moving to `target` days, or null when it cannot be estimated. */
export function storageRemoved(row, target) {
  if (row.retention > 0) return row.retention > target ? row.storedGb * (1 - target / row.retention) : 0;
  if (row.ageDays === null) return null;
  return row.ageDays > target ? row.storedGb * (1 - target / row.ageDays) : 0;
}

export function analyze(parsed, options = {}) {
  const o = { ...DEFAULTS, ...options };
  const prices = { ...DEFAULT_PRICES, ...(options.prices ?? {}) };
  const rows = parsed.rows;
  if (!rows.length) return { count: 0, findings: [], skipped: parsed.skipped ?? 0 };
  const target = snapRetention(o.retention);
  const findings = [];
  const add = (rule, severity, row, message) => findings.push({ rule, severity, row, message });
  const usd = (n) => {
    const format = (n) => `$${n.toFixed(2)}`;
    const text = format(Math.abs(n));
    return n < 0 && /[1-9]/.test(text) ? `-${text}` : text;
  };
  const grand = rows.reduce((a, r) => a + groupCost(r, prices).total, 0);

  const groups = rows.map((row) => {
    const c = groupCost(row, prices);
    const removed = storageRemoved(row, target);
    const saving = removed === null ? 0 : removed * prices.storage;
    const worthIt = saving >= o.minMonthlySaving;
    const command = `aws logs put-retention-policy --log-group-name ${row.name} --retention-in-days ${target}`;
    return { row, ...c, removed, saving: worthIt ? saving : 0, worthIt, command: worthIt ? command : null, target };
  });

  for (const g of groups) {
    const { row } = g;
    const never = row.retention === 0;
    if (never && row.ageDays === null && g.total > 0) add("retention-never-expires", "warn", row.name, `${row.name}: retention is "never expire", so ${row.storedGb} GB stored (${usd(g.storage)}/month) only grows. Age was not supplied, so no saving is estimated. Set a policy: aws logs put-retention-policy --log-group-name ${row.name} --retention-in-days ${target}`);
    else if (g.worthIt) add(never ? "retention-never-expires" : "retention-too-long", "warn", row.name, `${row.name}: ${never ? `never expires and is ${row.ageDays} days old` : `retention is ${row.retention} days`}, ${row.storedGb} GB stored. Moving to ${target} days would remove about ${g.removed.toFixed(1)} GB, roughly ${usd(g.saving)}/month (${usd(g.saving * 12)}/year), assuming ingestion has been even over the group's life. Deletion is not reversible and takes effect within about a day: ${g.command}`);
    if (row.ingestGb === 0 && row.storedGb > 0) add("dead-group", "warn", row.name, `${row.name}: nothing ingested this month but ${row.storedGb} GB still stored (${usd(g.storage)}/month). Export to S3 if you need it, then delete the group.`);
    if (row.cls === "standard" && g.ingest >= o.iaMinIngest) add("ia-class-candidate", "info", row.name, `${row.name}: ingestion is ${usd(g.ingest)}/month (${Math.round((g.ingest / grand) * 100)}% of this list). The Infrequent Access class halves ingestion to ${usd(g.ingest / 2)}/month, but it lacks metric filters, subscription filters, alarms on the logs, Live Tail and export. The class cannot be changed in place: create a new group with --log-group-class INFREQUENT_ACCESS and point the producer at it. First ask whether the volume itself can drop (debug level, health-check lines, request bodies).`);
    if (g.ingest > 0 && g.ingest / grand >= 0.4 && rows.length > 1) add("ingestion-dominates", "info", row.name, `${row.name} is ${Math.round((g.total / grand) * 100)}% of the total (${usd(g.total)} of ${usd(grand)}). Ingestion, not storage, is the line to attack: it is billed once per GB the moment it arrives, whatever the retention.`);
  }

  const totals = groups.reduce((a, g) => ({ current: a.current + g.total, saving: a.saving + g.saving, ingest: a.ingest + g.ingest, storage: a.storage + g.storage }), { current: 0, saving: 0, ingest: 0, storage: 0 });
  if (!findings.some((f) => f.severity !== "info")) add("logs-fine", "info", "", `No group has a retention policy worth more than ${usd(o.minMonthlySaving)}/month to shorten at ${target} days, and none is dead.`);
  return { count: rows.length, skipped: parsed.skipped ?? 0, groups: groups.map((g) => ({ name: g.row.name, cls: g.row.cls, storedGb: g.row.storedGb, ingestGb: g.row.ingestGb, retention: g.row.retention, ingest: g.ingest, storage: g.storage, current: g.total, saving: g.saving, command: g.command })), totals: { ...totals, after: totals.current - totals.saving, annual: totals.saving * 12 }, targetRetention: target, prices, options: o, findings };
}

export function summarize(report) {
  if (!report.count) return { status: "none", errors: 0, warns: 0, text: "No usable rows found. Expected lines like: /aws/lambda/api,120,never,300,400 (log group, stored GB, retention days or never, GB ingested per month, age in days, optional class)." };
  const errors = report.findings.filter((f) => f.severity === "error").length;
  const warns = report.findings.filter((f) => f.severity === "warn").length;
  const t = report.totals;
  return { status: errors ? "error" : warns ? "warn" : "ok", errors, warns, text: `${report.count} log group(s). Modelled $${t.current.toFixed(2)}/month ($${t.ingest.toFixed(2)} ingestion, $${t.storage.toFixed(2)} storage)${t.saving > 0.005 ? `; a ${report.targetRetention}-day retention saves about $${t.saving.toFixed(2)}/month, $${t.annual.toFixed(0)}/year` : ""}.` };
}

export const INPUT_NOTES = [
  { what: "log_group,stored_gb,retention_days,ingested_gb_month", detail: "One row per log group. Stored GB = storedBytes / 1e9 from aws logs describe-log-groups. Ingested GB = sum of the IncomingBytes metric over the last 30 days / 1e9." },
  { what: "retention_days", detail: "A number of days, or never / blank / 0 for a group that never expires (describe-log-groups omits retentionInDays for those)." },
  { what: "age_days (optional 5th column)", detail: "Days since the group's creationTime. Needed to estimate the saving on a never-expire group." },
  { what: "class (optional 6th column)", detail: "standard (default) or ia for the Infrequent Access class." },
  { what: "header row", detail: "One optional header; names (stored, retention, ingested, age, class) remap the columns in any order." },
  { what: "# comment / blank lines", detail: "Ignored." },
  { what: "other lines", detail: "Counted as skipped, never guessed at." },
];
