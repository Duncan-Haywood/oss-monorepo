// Explain why an AWS bill moved between two periods, from the CSV that AWS
// Cost Explorer already lets you download. Pure functions, no network, no
// dependencies; the browser page and cli.mjs share this file.
//
// Honest limits, repeated on every surface: this ranks and normalises the
// numbers in a file you supply. It cannot see *why* a line moved -- the hints
// are a checklist of common causes for that service, not a diagnosis.

export const HINTS_DATE = "2026-10-03";
const DAY_MS = 86400000;

// ---------- CSV ----------

export function parseCsv(text) {
  const src = String(text ?? "").replace(/^﻿/, "");
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i += 1; } else quoted = false;
      } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i += 1;
      row.push(cell); cell = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

export function parseMoney(raw) {
  let s = String(raw ?? "").trim();
  if (s === "" || s === "-") return 0;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  s = s.replace(/[$,\s]/g, "").replace(/^USD/i, "");
  if (s.startsWith("-")) { neg = !neg; s = s.slice(1); }
  const n = Number(s);
  if (!Number.isFinite(n)) return NaN;
  return neg ? -n : n;
}

const TOTAL_ROW = /^(?:[a-z ]+ )?total(?: costs?)?$/i;
const TOTAL_COL = /^total/i;

const cleanLabel = (h) => String(h).trim().replace(/\s*\((?:\$|usd)\)\s*$/i, "").trim();

// Cost Explorer "Download CSV": first column is the group-by dimension
// (Service, Linked Account, Region, Usage Type...), then one column per period
// headed like `2026-09-01($)`, then `Total costs($)`, with a total row.
export function parseCostExport(text) {
  const grid = parseCsv(text);
  if (grid.length < 2) throw new Error("Not a cost export: it needs a header row and at least one data row.");
  const header = grid[0].map((h) => h.trim());
  if (header.length < 2) throw new Error("Not a cost export: expected a name column followed by cost columns.");
  const cols = [];
  for (let c = 1; c < header.length; c += 1) {
    if (TOTAL_COL.test(cleanLabel(header[c]))) continue;
    cols.push({ index: c, label: cleanLabel(header[c]) });
  }
  if (!cols.length) throw new Error("No period columns found: every column after the first was a total.");
  const lines = [];
  let statedTotal = null;
  const seen = new Set();
  for (let r = 1; r < grid.length; r += 1) {
    const name = String(grid[r][0] ?? "").trim();
    if (name === "") continue;
    const values = cols.map((col) => parseMoney(grid[r][col.index]));
    if (values.some((v) => Number.isNaN(v))) {
      throw new Error(`Row ${r + 1} (${name}) has a cost cell that is not a number.`);
    }
    if (TOTAL_ROW.test(name)) { statedTotal = values; continue; }
    if (seen.has(name)) {
      const prev = lines.find((l) => l.name === name);
      prev.values = prev.values.map((v, i) => v + values[i]);
      continue;
    }
    seen.add(name);
    lines.push({ name, values });
  }
  if (!lines.length) throw new Error("No data rows found.");
  // Cost Explorer prints its own total row. If it disagrees with the sum of the
  // lines, a row was filtered or cropped, and every share below is off.
  const mismatches = [];
  if (statedTotal) {
    cols.forEach((col, i) => {
      const sum = lines.reduce((t, l) => t + l.values[i], 0);
      const gap = Math.abs(sum - statedTotal[i]);
      if (gap > 1 && gap > Math.abs(statedTotal[i]) * 0.01) {
        mismatches.push({ period: col.label, sum: round2(sum), stated: round2(statedTotal[i]) });
      }
    });
  }
  return { dimension: header[0] || "Item", periods: cols.map((c) => c.label), lines, statedTotal, mismatches };
}

// A period label like 2026-09-01, 2026-09, "Sep 2026", "2026-09-01 - 2026-09-30".
export function periodDays(label) {
  const s = String(label).trim();
  const iso = (t) => {
    const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(t.trim());
    if (!m) return null;
    return { y: +m[1], mo: +m[2], d: m[3] ? +m[3] : null };
  };
  const monthLen = (y, mo) => new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const range = /^(.+?)\s+(?:-|to|–)\s+(.+)$/.exec(s);
  if (range) {
    const a = iso(range[1]);
    const b = iso(range[2]);
    if (a && b && a.d && b.d) {
      const n = Math.round((Date.UTC(b.y, b.mo - 1, b.d) - Date.UTC(a.y, a.mo - 1, a.d)) / DAY_MS) + 1;
      if (n > 0 && n < 400) return n;
    }
    return null;
  }
  const one = iso(s);
  if (one && !one.d && one.mo >= 1 && one.mo <= 12) return monthLen(one.y, one.mo);
  if (one && one.d === 1 && one.mo >= 1 && one.mo <= 12) return null; // a month start; its length is unknown from the label alone
  const named = /^([A-Za-z]{3,9})\.?\s+(\d{4})$/.exec(s);
  if (named) {
    const mo = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(named[1].slice(0, 3).toLowerCase()) + 1;
    if (mo) return monthLen(+named[2], mo);
  }
  return null;
}

// ---------- knowledge: what usually moves each service ----------

// A checklist of common causes, matched on the service or usage-type name.
// Deliberately no prices: a stale number here would be worse than none.
export const HINTS = [
  { match: /ec2 - other|ec2-other/i, area: "EC2 - Other", checks: [
    "NAT gateway hours and data processed (the usual culprit hiding under this name)",
    "EBS volumes and snapshots that outlived their instances",
    "Idle Elastic IPs and cross-AZ or cross-region data transfer"] },
  { match: /elastic compute cloud|\bec2\b/i, area: "EC2 compute", checks: [
    "Instance count or size change (Auto Scaling scale-out that never scaled back)",
    "A Reserved Instance or Savings Plan that expired, so the same fleet is now on-demand",
    "Spot capacity replaced by on-demand"] },
  { match: /relational database|\brds\b|aurora/i, area: "RDS / Aurora", checks: [
    "Instance class change or Multi-AZ switched on",
    "Storage autoscaling, provisioned IOPS, or snapshots kept past the retention you intended",
    "Extended Support charges for an old engine version"] },
  { match: /simple storage service|\bs3\b/i, area: "S3", checks: [
    "Request volume (LIST and PUT requests add up faster than storage)",
    "Storage-class transitions, early-deletion fees, or versioning keeping old object versions",
    "Replication or data transfer out"] },
  { match: /cloudwatch/i, area: "CloudWatch", checks: [
    "Log ingestion volume (a debug log level left on)",
    "Custom metrics or high-cardinality dimensions",
    "Detailed monitoring or new alarms and dashboards"] },
  { match: /virtual private cloud|\bvpc\b/i, area: "VPC", checks: [
    "NAT gateway hours and per-GB processing",
    "Public IPv4 address charges (every public address is billed hourly)",
    "VPC endpoints and Transit Gateway attachments"] },
  { match: /elastic load balancing|load balancer/i, area: "Load balancing", checks: [
    "Load balancers left running with no traffic",
    "Load balancer capacity units rising with traffic or connection count"] },
  { match: /\blambda\b/i, area: "Lambda", checks: [
    "Invocation count (a retry loop or a new trigger)",
    "Duration or memory size increase, or provisioned concurrency"] },
  { match: /dynamodb/i, area: "DynamoDB", checks: [
    "On-demand read and write volume, or a new global secondary index",
    "Point-in-time recovery, backups, or a table class change"] },
  { match: /data transfer|datatransfer/i, area: "Data transfer", checks: [
    "Traffic out to the internet, across regions or across AZs",
    "A new service talking across an AZ boundary"] },
  { match: /elastic kubernetes|\beks\b/i, area: "EKS", checks: [
    "A cluster on an old Kubernetes version moving into extended support",
    "Cluster count, node count, or a node group that stopped scaling down"] },
  { match: /kubernetes|container service|\becs\b|fargate|container registry|\becr\b/i, area: "Containers", checks: [
    "Task or pod count and size, Fargate vCPU and memory",
    "Image storage growing without a lifecycle policy"] },
  { match: /opensearch|elasticsearch/i, area: "OpenSearch", checks: [
    "Data node count or instance type, and storage growth",
    "UltraWarm or replica settings"] },
  { match: /elasticache/i, area: "ElastiCache", checks: [
    "Node type or replica count change", "Reserved nodes that expired"] },
  { match: /key management|\bkms\b/i, area: "KMS", checks: [
    "Request volume from a service now encrypting every call", "New customer-managed keys"] },
  { match: /aws config|\bconfig\b/i, area: "AWS Config", checks: [
    "Configuration items recorded, which scale with resource churn and the number of regions"] },
  { match: /cloudfront/i, area: "CloudFront", checks: [
    "Traffic and request volume", "Origin shield or invalidations"] },
  { match: /bedrock|sagemaker|\bkinesis\b|\bglue\b|athena|redshift|emr/i, area: "Data and ML", checks: [
    "Usage volume: queries scanned, tokens processed, endpoint or cluster hours",
    "Endpoints or clusters left running between jobs"] },
  { match: /route 53/i, area: "Route 53", checks: ["Query volume and hosted zone count"] },
];

// Lines that move because of other lines or a contract, not usage.
export const ACCOUNTING = [
  { match: /\btax\b|vat|gst/i, kind: "tax", note: "Tax follows the rest of the bill. It moves when the taxable lines move or when your tax settings change." },
  { match: /\bsupport\b/i, kind: "support", note: "Support is usually a percentage of the rest of your usage, so it rises and falls with the other lines." },
  { match: /savings plan|reserved|reservation|\bri\b|upfront/i, kind: "commitment", note: "A commitment line. Check for a purchase, a renewal, or an expiry; an expired commitment shows up as a rise elsewhere." },
  { match: /credit|refund|discount|promotion/i, kind: "credit", note: "Credits and refunds are negative. A credit that ended makes the net bill rise even if usage did not change." },
];

export function hintsFor(name) {
  const acct = ACCOUNTING.find((a) => a.match.test(name));
  if (acct) return { kind: acct.kind, area: name, note: acct.note, checks: [] };
  const h = HINTS.find((x) => x.match.test(name));
  return h ? { kind: "usage", area: h.area, note: null, checks: h.checks } : null;
}

// ---------- compare ----------

export const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

export function formatUsd(n) {
  const v = round2(Math.abs(n));
  const s = v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${n < 0 ? "-" : ""}$${s}`;
}
export function formatDelta(n) {
  if (round2(n) === 0) return "$0.00";
  return `${n > 0 ? "+" : "-"}$${round2(Math.abs(n)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
export const formatPct = (p) => (p === null ? "new" : `${p > 0 ? "+" : ""}${(Math.round(p * 10) / 10).toFixed(1)}%`);

// before / after: arrays of { name, value }. Options:
//   beforeDays / afterDays  compare per-day rates, scaled to afterDays
//   minDelta                lines moving less than this (USD) count as flat
export function compareBills(before, after, opts = {}) {
  const toMap = (arr) => {
    const m = new Map();
    for (const { name, value } of arr) m.set(name, (m.get(name) || 0) + value);
    return m;
  };
  const bMap = toMap(before);
  const aMap = toMap(after);
  const bd = Number(opts.beforeDays);
  const ad = Number(opts.afterDays);
  const normalised = Number.isFinite(bd) && Number.isFinite(ad) && bd > 0 && ad > 0 && bd !== ad;
  const scale = normalised ? ad / bd : 1;
  const minDelta = Number.isFinite(Number(opts.minDelta)) ? Number(opts.minDelta) : 0.5;

  const names = [...new Set([...bMap.keys(), ...aMap.keys()])];
  const lines = names.map((name) => {
    const rawBefore = bMap.get(name) || 0;
    const b = rawBefore * scale;
    const a = aMap.get(name) || 0;
    const delta = a - b;
    const pct = b !== 0 ? (delta / Math.abs(b)) * 100 : a !== 0 ? null : 0;
    let status = "flat";
    if (Math.abs(delta) >= minDelta) {
      if (rawBefore === 0 && a > 0) status = "new";
      else if (a === 0 && rawBefore > 0) status = "gone";
      else status = delta > 0 ? "up" : "down";
    }
    return { name, before: b, rawBefore, after: a, delta, pct, status, hint: hintsFor(name) };
  });
  lines.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta) || x.name.localeCompare(y.name));

  const sum = (arr, f) => arr.reduce((t, l) => t + f(l), 0);
  const totalBefore = sum(lines, (l) => l.before);
  const totalAfter = sum(lines, (l) => l.after);
  const delta = totalAfter - totalBefore;
  const grossUp = sum(lines.filter((l) => l.delta > 0), (l) => l.delta);
  const grossDown = sum(lines.filter((l) => l.delta < 0), (l) => l.delta);
  for (const l of lines) l.shareOfRise = l.delta > 0 && grossUp > 0 ? (l.delta / grossUp) * 100 : null;

  const rising = lines.filter((l) => l.delta > 0 && l.status !== "flat");
  const top = rising.slice(0, 3);
  const topShare = grossUp > 0 ? (sum(top, (l) => l.delta) / grossUp) * 100 : 0;
  const accountingOnly = rising.length > 0 && rising.every((l) => l.hint && l.hint.kind !== "usage");

  return {
    totals: {
      before: totalBefore, after: totalAfter, delta,
      pct: totalBefore > 0 ? (delta / totalBefore) * 100 : null,
      grossUp, grossDown,
    },
    normalised: normalised ? { beforeDays: bd, afterDays: ad } : null,
    lines,
    drivers: rising.slice(0, 5),
    newLines: lines.filter((l) => l.status === "new"),
    goneLines: lines.filter((l) => l.status === "gone"),
    topShare,
    accountingOnly,
    minDelta,
  };
}

export function checkGate(report, { maxIncreaseUsd = null, maxIncreasePct = null } = {}) {
  const reasons = [];
  const d = report.totals.delta;
  const usd = maxIncreaseUsd === null || maxIncreaseUsd === "" ? null : Number(maxIncreaseUsd);
  const pct = maxIncreasePct === null || maxIncreasePct === "" ? null : Number(maxIncreasePct);
  if (usd !== null && !Number.isFinite(usd)) throw new Error("--max-increase-usd needs a number");
  if (pct !== null && !Number.isFinite(pct)) throw new Error("--max-increase-pct needs a number");
  if (usd !== null && d > usd) reasons.push(`net change ${formatDelta(d)} is above ${formatUsd(usd)}`);
  if (pct !== null && report.totals.pct !== null && report.totals.pct > pct) {
    reasons.push(`net change ${formatPct(report.totals.pct)} is above +${pct}%`);
  }
  return { exceeded: reasons.length > 0, reasons };
}

// Build the two sides from parsed exports: one export with several periods
// (pick two by label or take the last two), or two exports with one period each.
export function pickSides(exportA, exportB, opts = {}) {
  const column = (exp, idx) => exp.lines.map((l) => ({ name: l.name, value: l.values[idx] }));
  if (exportB) {
    const ai = exportA.periods.length - 1;
    const bi = exportB.periods.length - 1;
    return {
      before: column(exportA, ai), after: column(exportB, bi),
      beforeLabel: exportA.periods[ai], afterLabel: exportB.periods[bi],
    };
  }
  if (exportA.periods.length < 2) {
    throw new Error("One export with one period cannot be compared. Give two periods in the same export, or a second file.");
  }
  const find = (label, fallback) => {
    if (label === undefined || label === null || label === "") return fallback;
    const i = exportA.periods.findIndex((p) => p === String(label).trim());
    if (i < 0) throw new Error(`Period "${label}" is not in the export. Periods: ${exportA.periods.join(", ")}`);
    return i;
  };
  const n = exportA.periods.length;
  const bi = find(opts.before, n - 2);
  const ai = find(opts.after, n - 1);
  if (bi === ai) throw new Error("Before and after are the same period.");
  return { before: column(exportA, bi), after: column(exportA, ai), beforeLabel: exportA.periods[bi], afterLabel: exportA.periods[ai] };
}

export function summarize(report, sides = {}) {
  const t = report.totals;
  const span = sides.beforeLabel && sides.afterLabel ? ` from ${sides.beforeLabel} to ${sides.afterLabel}` : "";
  const scaledNote = report.normalised
    ? ` The earlier period had ${report.normalised.beforeDays} days and the later ${report.normalised.afterDays}, so the earlier is scaled to ${report.normalised.afterDays} days before comparing.`
    : "";
  if (round2(t.delta) === 0 && !report.drivers.length) return `The bill did not change${span}.${scaledNote}`;
  const dir = t.delta >= 0 ? "rose" : "fell";
  const pct = t.pct === null ? "" : ` (${formatPct(t.pct)})`;
  let s = `The bill ${dir} ${formatUsd(Math.abs(t.delta))}${pct}${span}: ${formatUsd(t.before)} to ${formatUsd(t.after)}.`;
  s += scaledNote;
  if (report.drivers.length) {
    const names = report.drivers.slice(0, 3).map((d) => d.name).join(", ");
    s += ` The biggest rises: ${names}, which together are ${Math.round(report.topShare)}% of the ${formatUsd(t.grossUp)} of increases.`;
  }
  if (t.grossDown < 0) s += ` ${formatUsd(Math.abs(t.grossDown))} of decreases offset part of it.`;
  if (report.accountingOnly) s += " Every rising line is tax, support, a commitment or a credit, so look at contracts and credits before usage.";
  return s;
}
