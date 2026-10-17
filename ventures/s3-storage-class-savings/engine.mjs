// Zero-dependency, deterministic reader of an S3 Inventory report (CSV). It
// answers one question: if lifecycle rules moved these objects to a cheaper
// storage class, what would the NET saving over 12 months be once the things
// people forget are charged -- the per-object transition request fee, minimum
// billable object size, Glacier's 40 KB per-object overhead, minimum storage
// duration, Intelligent-Tiering's per-object monitoring fee, and retrieval?
// Pure string in, report out -- no filesystem or network here.
//
// Everything is arithmetic on the rows you paste and prices you can override.
// The access pattern is an ASSUMPTION (`retrievalPct`, `earlyDeletePct`): an
// inventory lists what exists, not what is read.

// ILLUSTRATIVE and dated; AWS reprices, tiers by volume and varies by region.
export const PRICES_AS_OF = "us-east-1 list prices as of 2025-10 (first 50 TB tier, no free tier, no discounts); not a bill -- check the current AWS S3 pricing page";
export const DEFAULT_PRICES = {
  // USD per GB-month (GB = 2^30 bytes, as AWS bills).
  storage: {
    STANDARD: 0.023, STANDARD_IA: 0.0125, ONEZONE_IA: 0.01, GLACIER_IR: 0.004, GLACIER: 0.0036, DEEP_ARCHIVE: 0.00099, REDUCED_REDUNDANCY: 0.024,
    IT_FREQUENT: 0.023, IT_INFREQUENT: 0.0125, IT_ARCHIVE_INSTANT: 0.004, IT_ARCHIVE: 0.0036, IT_DEEP_ARCHIVE: 0.00099,
  },
  // USD per 1,000 lifecycle transition requests into the class (one per object).
  transitionPer1000: { STANDARD_IA: 0.01, GLACIER_IR: 0.02, GLACIER: 0.03, DEEP_ARCHIVE: 0.05, INTELLIGENT_TIERING: 0.01 },
  // USD per GB retrieved (data retrieval; Glacier request fees are not modelled).
  retrievalPerGB: { STANDARD_IA: 0.01, GLACIER_IR: 0.03, GLACIER: 0.01, DEEP_ARCHIVE: 0.02 },
  // Intelligent-Tiering monitoring and automation, USD per 1,000 monitored objects per month.
  monitoringPer1000: 0.0025,
};

export const GIB = 1073741824;
export const KIB = 1024;
/** Objects smaller than this are billed as 128 KB in the IA classes and are not monitored or auto-tiered by Intelligent-Tiering. */
export const MIN_BILLABLE_BYTES = 128 * KIB;
/** Lifecycle `ObjectSizeGreaterThan` is strict, so 131071 keeps every object of 128 KiB or more. */
export const SIZE_FILTER_GREATER_THAN = MIN_BILLABLE_BYTES - 1;
/** Glacier Flexible / Deep Archive add 32 KB billed at the archive rate and 8 KB billed at the Standard rate per object. */
const GLACIER_OVERHEAD = { archiveBytes: 32 * KIB, standardBytes: 8 * KIB };
export const DEFAULTS = { retrievalPct: 1, earlyDeletePct: 0, wasteThresholdPerMonth: 100, regionMultiplier: 1 };

export const AGE_BUCKETS = [
  { label: "0-30 days", from: 0, to: 30 },
  { label: "30-90 days", from: 30, to: 90 },
  { label: "90-180 days", from: 90, to: 180 },
  { label: "180-365 days", from: 180, to: 365 },
  { label: "365+ days", from: 365, to: Infinity },
];

// minAgeDays: the lifecycle rule's `Days` and the age an object must already have to be counted.
// minDays: minimum storage duration billed on early delete. Intelligent-Tiering has none.
export const CANDIDATES = [
  { id: "STANDARD_IA", label: "Standard-IA", minAgeDays: 30, minDays: 30, minBillable: true, overhead: false },
  { id: "GLACIER_IR", label: "Glacier Instant Retrieval", minAgeDays: 90, minDays: 90, minBillable: true, overhead: false },
  { id: "GLACIER", label: "Glacier Flexible Retrieval", minAgeDays: 90, minDays: 90, minBillable: false, overhead: true },
  { id: "DEEP_ARCHIVE", label: "Glacier Deep Archive", minAgeDays: 180, minDays: 180, minBillable: false, overhead: true },
  { id: "INTELLIGENT_TIERING", label: "Intelligent-Tiering", minAgeDays: 30, minDays: 0, minBillable: false, overhead: false },
];

// ---------------------------------------------------------------- CSV parsing

/** RFC 4180-style parser: quoted fields, doubled quotes, commas and newlines inside quotes. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  const s = String(text ?? "").replace(/^﻿/, "");
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (quoted) {
      if (c === '"') { if (s[i + 1] === '"') { field += '"'; i += 1; } else quoted = false; } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i += 1;
      row.push(field); field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.length > 1 || row[0] !== "") rows.push(row);
  return rows;
}

const norm = (h) => String(h).toLowerCase().replace(/[^a-z0-9]/g, "");
const DEFAULT_COLUMNS = ["bucket", "key", "size", "lastmodifieddate", "storageclass"];

/**
 * Reads an S3 Inventory CSV. A header row (Size plus Bucket or Key) names the columns in any order;
 * without one the default order Bucket, Key, Size, LastModifiedDate, StorageClass is assumed.
 * Non-current versions (IsLatest false) and delete markers are counted and left out.
 */
export function parseInventory(text) {
  const table = parseCsv(text);
  const out = { rows: [], skipped: 0, ignoredNonCurrent: 0, ignoredDeleteMarkers: 0, undated: 0, headerFound: false };
  if (!table.length) return out;
  let cols = DEFAULT_COLUMNS;
  let start = 0;
  const first = table[0].map(norm);
  if (first.includes("size") && (first.includes("bucket") || first.includes("key"))) { cols = first; start = 1; out.headerFound = true; }
  const at = (name) => cols.indexOf(name);
  const iSize = at("size"); const iDate = at("lastmodifieddate"); const iClass = at("storageclass");
  const iTier = at("intelligenttieringaccesstier"); const iLatest = at("islatest"); const iDel = at("isdeletemarker");
  if (iSize < 0) return out;
  for (const r of table.slice(start)) {
    const get = (i) => (i >= 0 && i < r.length ? r[i].trim() : "");
    if (iLatest >= 0 && /^false$/i.test(get(iLatest))) { out.ignoredNonCurrent += 1; continue; }
    if (iDel >= 0 && /^true$/i.test(get(iDel))) { out.ignoredDeleteMarkers += 1; continue; }
    const size = Number(get(iSize));
    if (get(iSize) === "" || !Number.isFinite(size) || size < 0) { out.skipped += 1; continue; }
    const t = iDate >= 0 ? Date.parse(get(iDate)) : NaN;
    if (!Number.isFinite(t)) out.undated += 1;
    out.rows.push({ size, lastModified: Number.isFinite(t) ? t : null, storageClass: (get(iClass) || "STANDARD").toUpperCase(), tier: get(iTier).toUpperCase() });
  }
  return out;
}

// ------------------------------------------------------------ cost primitives

const gib = (bytes) => bytes / GIB;
const IT_TIER_PRICE = { FREQUENT: "IT_FREQUENT", INFREQUENT: "IT_INFREQUENT", ARCHIVE_INSTANT_ACCESS: "IT_ARCHIVE_INSTANT", ARCHIVE_ACCESS: "IT_ARCHIVE", DEEP_ARCHIVE_ACCESS: "IT_DEEP_ARCHIVE" };

/** Monthly cost of one group (count n, total bytes B) already sitting in `cls`. */
function currentGroupCost(prices, cls, tier, n, B, small) {
  const st = prices.storage;
  if (cls === "INTELLIGENT_TIERING") {
    const rate = st[IT_TIER_PRICE[tier] || "IT_FREQUENT"];
    // Objects under 128 KB are never monitored or auto-tiered: always the frequent rate, no fee.
    return small ? gib(B) * st.IT_FREQUENT : gib(B) * rate + (n / 1000) * prices.monitoringPer1000;
  }
  if (cls === "GLACIER" || cls === "DEEP_ARCHIVE") return gib(B + n * GLACIER_OVERHEAD.archiveBytes) * st[cls] + gib(n * GLACIER_OVERHEAD.standardBytes) * st.STANDARD;
  if (cls === "STANDARD_IA" || cls === "ONEZONE_IA" || cls === "GLACIER_IR") return gib(small ? n * MIN_BILLABLE_BYTES : B) * st[cls];
  return gib(B) * (st[cls] ?? st.STANDARD);
}

/** 12-month net saving of moving one group of Standard objects into `cand`, plus its parts. */
function groupOutcome(prices, cand, n, B, small, o) {
  const st = prices.storage;
  const GB = gib(B);
  const base12 = 12 * GB * st.STANDARD;
  const trans = (n / 1000) * prices.transitionPer1000[cand.id];
  const r = o.retrievalPct / 100;
  const e = o.earlyDeletePct / 100;
  let after12; let retrieval12; let minDurationExposure; let monitoring12 = 0;
  if (cand.id === "INTELLIGENT_TIERING") {
    if (small) {
      // Stays at the Standard rate, unmonitored; only the request fee is wasted.
      after12 = base12; retrieval12 = 0; minDurationExposure = 0;
    } else {
      // Not accessed: frequent for month 1, infrequent months 2-3, archive instant months 4-12.
      // A share `r` of bytes is read each month and returns to the frequent tier for that month.
      const eff = (rate) => GB * ((1 - r) * rate + r * st.IT_FREQUENT);
      after12 = eff(st.IT_FREQUENT) + 2 * eff(st.IT_INFREQUENT) + 9 * eff(st.IT_ARCHIVE_INSTANT);
      monitoring12 = 12 * (n / 1000) * prices.monitoringPer1000;
      after12 += monitoring12;
      retrieval12 = 0; minDurationExposure = 0;
    }
  } else {
    const rate = st[cand.id];
    const billable = cand.overhead ? B + n * GLACIER_OVERHEAD.archiveBytes : cand.minBillable && small ? n * MIN_BILLABLE_BYTES : B;
    const stdExtra = cand.overhead ? gib(n * GLACIER_OVERHEAD.standardBytes) * st.STANDARD : 0;
    const monthly = gib(billable) * rate + stdExtra;
    after12 = 12 * monthly;
    retrieval12 = 12 * r * GB * prices.retrievalPerGB[cand.id];
    minDurationExposure = (cand.minDays / 30) * monthly;
  }
  const net12 = base12 - after12 - trans - retrieval12;
  // Early-deleted share: no 12-month standard cost avoided, but the request fee and the minimum duration are owed.
  const net = (1 - e) * net12 - e * (trans + minDurationExposure);
  return { count: n, bytes: B, base12, after12, trans, retrieval12, monitoring12, minDurationExposure, net12, net };
}

const sumOutcomes = (parts) => parts.reduce((a, p) => {
  for (const k of Object.keys(p)) a[k] = (a[k] || 0) + p[k];
  return a;
}, {});

// ------------------------------------------------------------------- analysis

export function analyze(parsed, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const mult = o.regionMultiplier;
  const base = opts.prices || DEFAULT_PRICES;
  const scale = (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, v * mult]));
  const prices = {
    storage: scale({ ...DEFAULT_PRICES.storage, ...(base.storage || {}) }),
    transitionPer1000: scale({ ...DEFAULT_PRICES.transitionPer1000, ...(base.transitionPer1000 || {}) }),
    retrievalPerGB: scale({ ...DEFAULT_PRICES.retrievalPerGB, ...(base.retrievalPerGB || {}) }),
    monitoringPer1000: (base.monitoringPer1000 ?? DEFAULT_PRICES.monitoringPer1000) * mult,
  };
  const rows = parsed.rows;
  const now = o.asOf ?? Date.now();
  const empty = { count: 0, findings: [], skipped: parsed.skipped, ignoredNonCurrent: parsed.ignoredNonCurrent || 0, ignoredDeleteMarkers: parsed.ignoredDeleteMarkers || 0 };
  if (!rows.length) return empty;

  const group = () => ({ n: 0, B: 0 });
  // By class (and IT tier), small/large: current cost.
  const byClass = new Map();
  // Standard objects by age bucket, small/large.
  const std = AGE_BUCKETS.map(() => ({ small: group(), large: group() }));
  let totalBytes = 0; let unknownClass = 0;
  for (const r of rows) {
    const small = r.size < MIN_BILLABLE_BYTES;
    const known = prices.storage[r.storageClass] !== undefined || r.storageClass === "INTELLIGENT_TIERING";
    if (!known) unknownClass += 1;
    const key = `${r.storageClass}|${r.storageClass === "INTELLIGENT_TIERING" ? r.tier : ""}`;
    if (!byClass.has(key)) byClass.set(key, { cls: r.storageClass, tier: r.tier, small: group(), large: group() });
    const g = byClass.get(key)[small ? "small" : "large"];
    g.n += 1; g.B += r.size; totalBytes += r.size;
    if (r.storageClass === "STANDARD" && r.lastModified !== null) {
      const age = Math.max(0, Math.floor((now - r.lastModified) / 86400000));
      const b = AGE_BUCKETS.findIndex((x) => age >= x.from && age < x.to);
      const sg = std[b][small ? "small" : "large"]; sg.n += 1; sg.B += r.size;
    }
  }
  const classes = new Map();
  for (const v of byClass.values()) {
    const cost = currentGroupCost(prices, v.cls, v.tier, v.small.n, v.small.B, true) + currentGroupCost(prices, v.cls, v.tier, v.large.n, v.large.B, false);
    const c = classes.get(v.cls) || { cls: v.cls, count: 0, bytes: 0, monthlyCost: 0 };
    c.count += v.small.n + v.large.n; c.bytes += v.small.B + v.large.B; c.monthlyCost += cost;
    classes.set(v.cls, c);
  }
  const byClassList = [...classes.values()].sort((a, b) => b.monthlyCost - a.monthlyCost);
  const monthlyNow = byClassList.reduce((a, c) => a + c.monthlyCost, 0);

  const ageBuckets = AGE_BUCKETS.map((b, i) => ({ label: b.label, standardCount: std[i].small.n + std[i].large.n, standardBytes: std[i].small.B + std[i].large.B, smallCount: std[i].small.n }));

  const candidates = CANDIDATES.map((cand) => {
    const idx = AGE_BUCKETS.map((b, i) => i).filter((i) => AGE_BUCKETS[i].from >= cand.minAgeDays);
    const pick = (kind) => idx.reduce((a, i) => ({ n: a.n + std[i][kind].n, B: a.B + std[i][kind].B }), { n: 0, B: 0 });
    const small = pick("small"); const large = pick("large");
    const sOut = groupOutcome(prices, cand, small.n, small.B, true, o);
    const lOut = groupOutcome(prices, cand, large.n, large.B, false, o);
    const all = sumOutcomes([sOut, lOut]);
    return { ...cand, rate: prices.storage[cand.id] ?? null, unfiltered: all, filtered: lOut, smallObjects: sOut };
  });

  let best = null;
  for (const c of candidates) {
    for (const filtered of [false, true]) {
      const net = (filtered ? c.filtered : c.unfiltered).net;
      if (!best || net > best.net + 1e-9) best = { id: c.id, label: c.label, filtered, net, candidate: c };
    }
  }
  const hasBest = best && best.net > 0 && (best.candidate.filtered.count > 0 || best.candidate.unfiltered.count > 0);
  const stdTotal = ageBuckets.reduce((a, b) => ({ n: a.n + b.standardCount, B: a.B + b.standardBytes }), { n: 0, B: 0 });
  const smallStd = std.reduce((a, s) => ({ n: a.n + s.small.n, B: a.B + s.small.B }), { n: 0, B: 0 });
  const ia = candidates[0];
  const smallObjects = { count: smallStd.n, bytes: smallStd.B, ofStandardObjects: stdTotal.n ? smallStd.n / stdTotal.n : 0, ofStandardBytes: stdTotal.B ? smallStd.B / stdTotal.B : 0,
    // What moving the small, 30+ day old Standard objects to Standard-IA costs net over 12 months (negative = loses money).
    iaNet12: ia.smallObjects.net, bestNet12: best ? best.candidate.smallObjects.net : 0 };

  const bestMonthly = hasBest ? best.net / 12 : 0;
  const lifecycle = hasBest ? lifecycleConfig(best.candidate, best.filtered) : null;

  const findings = [];
  if (hasBest && bestMonthly > o.wasteThresholdPerMonth) findings.push({ rule: "avoidable-waste", severity: "warn", message: `about ${money(bestMonthly)} per month (${money(best.net)} over 12 months, net of fees) is avoidable by moving ${best.filtered ? "objects of 128 KiB or more" : "eligible objects"} to ${best.label}; above the ${money(o.wasteThresholdPerMonth)} per month threshold` });
  else if (hasBest) findings.push({ rule: "savings-available", severity: "info", message: `estimated net saving ${money(bestMonthly)} per month (${money(best.net)} over 12 months) with ${best.label}${best.filtered ? " on objects of 128 KiB or more" : ""}; below the ${money(o.wasteThresholdPerMonth)} per month threshold` });
  else findings.push({ rule: "no-net-saving", severity: "info", message: "no lifecycle transition shows a positive 12-month net saving after request fees, minimum sizes and retrieval for the Standard objects in this report" });
  if (smallStd.n > 0 && smallObjects.iaNet12 < 0) findings.push({ rule: "small-objects-lose-money", severity: "info", message: `${smallStd.n.toLocaleString("en-US")} Standard objects (${fmtBytes(smallStd.B)}) are under 128 KiB. Moving the ones 30+ days old to Standard-IA loses about ${money(-smallObjects.iaNet12)} over 12 months (about ${money((-smallObjects.iaNet12 / smallStd.n) * 1e6)} per million such objects): each is billed as 128 KiB there and pays a transition request fee. Add "ObjectSizeGreaterThan": ${SIZE_FILTER_GREATER_THAN} to the lifecycle rule` });
  if (hasBest && best.candidate.minDays > 0) findings.push({ rule: "minimum-duration", severity: "info", message: `${best.label} bills a ${best.candidate.minDays}-day minimum: objects deleted or overwritten sooner are charged the remainder (up to ${money(best.candidate.filtered.minDurationExposure)} on the eligible data). The estimate assumes ${o.earlyDeletePct}% are deleted early` });
  if (parsed.ignoredNonCurrent) findings.push({ rule: "noncurrent-ignored", severity: "info", message: `${parsed.ignoredNonCurrent} non-current version row(s) (IsLatest false) were left out; they still cost storage and need a NoncurrentVersionTransition rule` });
  if (parsed.undated) findings.push({ rule: "undated-rows", severity: "info", message: `${parsed.undated} row(s) had no readable LastModifiedDate and are excluded from age buckets and candidates` });
  if (unknownClass) findings.push({ rule: "unpriced-class", severity: "info", message: `${unknownClass} row(s) use a storage class with no price in the table and were priced as Standard` });
  if (!stdTotal.n) findings.push({ rule: "no-standard-objects", severity: "info", message: "no dated STANDARD objects in this report, so there is nothing for a lifecycle transition to act on" });

  return { count: rows.length, skipped: parsed.skipped, ignoredNonCurrent: parsed.ignoredNonCurrent || 0, ignoredDeleteMarkers: parsed.ignoredDeleteMarkers || 0, undated: parsed.undated || 0,
    totalBytes, monthlyNow, byClass: byClassList, ageBuckets, standard: { count: stdTotal.n, bytes: stdTotal.B }, smallObjects, candidates,
    best: hasBest ? { id: best.id, label: best.label, filtered: best.filtered, net12: best.net, netMonthly: bestMonthly } : null,
    lifecycle, findings, assumptions: { retrievalPct: o.retrievalPct, earlyDeletePct: o.earlyDeletePct, regionMultiplier: mult, wasteThresholdPerMonth: o.wasteThresholdPerMonth, prices } };
}

/** Ready-to-paste `aws s3api put-bucket-lifecycle-configuration` body for the winning candidate. */
export function lifecycleConfig(cand, filtered) {
  const rule = { ID: `s3-storage-class-savings-${cand.id.toLowerCase().replace(/_/g, "-")}${filtered ? "-min-128kib" : ""}`, Status: "Enabled",
    Filter: filtered ? { ObjectSizeGreaterThan: SIZE_FILTER_GREATER_THAN } : { Prefix: "" },
    Transitions: [{ Days: cand.minAgeDays, StorageClass: cand.id }] };
  return { Rules: [rule] };
}

export function money(n) {
  const a = Math.abs(n);
  const d = a > 0 && a < 0.01 ? 4 : 2;
  return `${n < 0 ? "-" : ""}$${a.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d })}`;
}
export function fmtBytes(b) {
  if (b >= GIB * 1024) return `${(b / (GIB * 1024)).toFixed(2)} TiB`;
  if (b >= GIB) return `${(b / GIB).toFixed(2)} GiB`;
  if (b >= 1048576) return `${(b / 1048576).toFixed(2)} MiB`;
  return `${(b / 1024).toFixed(1)} KiB`;
}

export function summarize(report) {
  if (!report.count) return { status: "none", errors: 0, warns: 0, infos: 0, text: "No S3 Inventory rows recognised. Paste CSV with a header like: Bucket,Key,Size,LastModifiedDate,StorageClass" };
  const errors = report.findings.filter((f) => f.severity === "error").length;
  const warns = report.findings.filter((f) => f.severity === "warn").length;
  const infos = report.findings.filter((f) => f.severity === "info").length;
  const status = errors ? "error" : warns ? "warn" : "ok";
  const text = `${report.count.toLocaleString("en-US")} object(s), ${fmtBytes(report.totalBytes)}, about ${money(report.monthlyNow)} per month at list prices. ` +
    (report.best ? `Best net 12-month saving: ${report.best.label}${report.best.filtered ? " on objects of 128 KiB or more" : ""}, ${money(report.best.net12)} (${money(report.best.netMonthly)} per month).` : "No transition shows a net saving.") +
    ` ${errors} error(s), ${warns} warning(s), ${infos} note(s).`;
  return { status, errors, warns, infos, text };
}

export const INPUT_NOTES = [
  { what: "Bucket, Key, Size, LastModifiedDate, StorageClass", detail: "the S3 Inventory CSV columns; a header row lets them come in any order, without one this order is assumed. Quoted fields are fine" },
  { what: "IntelligentTieringAccessTier", detail: "optional; prices objects already in Intelligent-Tiering at their access-tier rate" },
  { what: "IsLatest = false, IsDeleteMarker = true", detail: "optional; non-current versions and delete markers are counted and left out" },
  { what: "Size", detail: "bytes; GB are 2^30 bytes, as AWS bills" },
];
