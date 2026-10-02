// Zero-dependency, deterministic RDS / Aurora instance right-sizer. It reads what you
// paste -- a CSV of instance + CloudWatch stats and/or `aws rds describe-db-instances`
// JSON -- and answers, per instance: is it over-provisioned (and what smaller class in the
// same family would hold the observed load), would a Graviton (g) class cost less, is
// storage on gp2/io1 where gp3 is cheaper, is Multi-AZ paying for a non-prod database,
// is it idle, and is it at risk of being under-provisioned?
// Pure string in, report out -- no filesystem or network here.
//
// Honest limits, stated once: prices are an embedded, EDITABLE list-price estimate (about
// us-east-1, on-demand, MySQL/PostgreSQL/MariaDB), not your bill -- reserved instances,
// Savings Plans, licence-included engines and other regions all differ. The stats are a
// snapshot: sample a representative period, including your busiest day.

export const PRICES_AS_OF = "editable on-demand list-price estimate (about us-east-1, single-AZ MySQL/PostgreSQL, 2025); not your bill. Edit the price table to match your region, engine and discounts";

// $/hour for the large size of each family (single-AZ, open-source engine); other sizes scale with vCPU.
const FAMILIES = {
  t3: { sizes: ["micro", "small", "medium", "large", "xlarge", "2xlarge"], vcpu: [2, 2, 2, 2, 4, 8], ram: [1, 2, 4, 8, 16, 32], price: [0.017, 0.034, 0.068, 0.136, 0.272, 0.544] },
  t4g: { sizes: ["micro", "small", "medium", "large", "xlarge", "2xlarge"], vcpu: [2, 2, 2, 2, 4, 8], ram: [1, 2, 4, 8, 16, 32], price: [0.016, 0.032, 0.065, 0.129, 0.258, 0.517] },
};
const BIG = ["large", "xlarge", "2xlarge", "4xlarge", "8xlarge", "12xlarge", "16xlarge"];
const BIG_V = [2, 4, 8, 16, 32, 48, 64];
for (const [fam, ramPerVcpu, largePrice] of [
  ["m5", 4, 0.171], ["m6g", 4, 0.152], ["m6i", 4, 0.171], ["m7g", 4, 0.159],
  ["r5", 8, 0.24], ["r6g", 8, 0.216], ["r6i", 8, 0.24], ["r7g", 8, 0.227],
]) {
  FAMILIES[fam] = { sizes: BIG, vcpu: BIG_V, ram: BIG_V.map((v) => v * ramPerVcpu), price: BIG_V.map((v) => Math.round(largePrice * (v / 2) * 1000) / 1000) };
}

/** The editable price table: instance classes ($/hr, single-AZ) and storage ($/GiB-month, $/IOPS-month). */
export function defaultPrices() {
  const classes = {};
  for (const [fam, f] of Object.entries(FAMILIES)) f.sizes.forEach((s, i) => { classes[`db.${fam}.${s}`] = f.price[i]; });
  return {
    classes,
    // Aurora instances list a little above RDS for the same class; ballpark multiplier, editable.
    auroraMultiplier: 1.2,
    storage: { gp2: 0.115, gp3: 0.115, io1: 0.125, io1PerIops: 0.1, gp3PerExtraIops: 0.02 },
  };
}
export const DEFAULT_PRICES = defaultPrices();

export const DEFAULTS = {
  targetCpu: 0.6, // keep p95 CPU at or under this share of the recommended class
  memHeadroom: 0.2, // recommended class must hold peak used memory plus this
  hoursPerMonth: 730,
  idleCpu: 5, idleConnections: 2,
  underCpu: 80, underFreeable: 0.1,
};

const GRAVITON = { t3: "t4g", m5: "m6g", m6i: "m6g", r5: "r6g", r6i: "r6g" };
const NONPROD = /(^|[-_.\s])(dev|develop|development|test|testing|qa|stage|staging|sandbox|nonprod|non-prod|demo|uat|preprod)([-_.\s]|\d|$)/i;

export function parseClass(cls) {
  const m = /^db\.([a-z0-9]+)\.([a-z0-9]+)$/i.exec(String(cls || "").trim());
  if (!m) return null;
  const fam = m[1].toLowerCase();
  const f = FAMILIES[fam];
  const idx = f ? f.sizes.indexOf(m[2].toLowerCase()) : -1;
  return idx < 0 ? null : { family: fam, size: f.sizes[idx], index: idx, vcpu: f.vcpu[idx], ram: f.ram[idx] };
}

export const fmtUsd = (n) => `${n < 0 ? "-" : ""}$${Math.abs(n).toFixed(Math.abs(n) >= 100 ? 0 : 2)}`;

const bool = (v) => /^(true|yes|y|1)$/i.test(String(v ?? "").trim());
const num = (v) => {
  if (v === undefined || v === null || String(v).trim() === "") return null;
  const n = Number(String(v).replace(/[%,]/g, ""));
  return Number.isFinite(n) ? n : null;
};

const ALIASES = {
  id: ["instance_id", "id", "db_instance_identifier", "dbinstanceidentifier", "instance", "identifier", "name"],
  cls: ["class", "db_instance_class", "dbinstanceclass", "instance_class"],
  engine: ["engine"],
  multiAz: ["multi_az", "multiaz"],
  env: ["env", "environment"],
  avgCpu: ["avg_cpu", "cpu_avg", "avg_cpu_pct", "cpu_avg_pct", "cpu_average"],
  p95Cpu: ["p95_cpu", "cpu_p95", "p95_cpu_pct", "cpu_p95_pct"],
  minFreeGib: ["min_freeable_gib", "min_freeable_memory_gib", "freeable_memory_min_gib", "min_freeable_gb"],
  maxConn: ["max_connections", "connections_max", "max_conn", "database_connections_max"],
  storageGib: ["storage_gib", "allocated_storage", "allocated_storage_gib", "storage_gb"],
  storageType: ["storage_type", "storagetype"],
  iops: ["iops", "provisioned_iops"],
};

function mapHeader(cells) {
  const lower = cells.map((c) => c.trim().toLowerCase());
  const map = {};
  for (const [key, names] of Object.entries(ALIASES)) {
    const i = lower.findIndex((c) => names.includes(c));
    if (i >= 0) map[key] = i;
  }
  return map.id !== undefined && (map.cls !== undefined || map.avgCpu !== undefined || map.p95Cpu !== undefined) ? map : null;
}

/** Pulls every balanced top-level `{...}` JSON document out of mixed pasted text. */
function extractJson(text) {
  const docs = [];
  let i = 0;
  while (i < text.length) {
    if (text[i] !== "{") { i += 1; continue; }
    let depth = 0, inStr = false, esc = false, j = i;
    for (; j < text.length; j += 1) {
      const c = text[j];
      if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; }
      if (c === '"') inStr = true;
      else if (c === "{") depth += 1;
      else if (c === "}") { depth -= 1; if (depth === 0) break; }
    }
    if (depth !== 0) break;
    try { docs.push(JSON.parse(text.slice(i, j + 1))); } catch { /* not JSON; skip */ }
    i = j + 1;
  }
  return docs;
}

function fromDescribe(inst) {
  const tags = inst.TagList || inst.Tags || [];
  const envTag = tags.find((t) => /^(env|environment|stage)$/i.test(t.Key || ""));
  return {
    id: inst.DBInstanceIdentifier, cls: inst.DBInstanceClass, engine: inst.Engine,
    multiAz: inst.MultiAZ === undefined ? null : Boolean(inst.MultiAZ),
    storageGib: inst.AllocatedStorage ?? null, storageType: inst.StorageType ?? null, iops: inst.Iops ?? null,
    env: envTag ? envTag.Value : null,
  };
}

/** Parses CSV and/or describe-db-instances JSON; rows with the same instance id are merged (later non-empty values win). */
export function parseInput(text) {
  const byId = new Map();
  const order = [];
  const merge = (rec) => {
    if (!rec.id) return;
    const key = String(rec.id).trim();
    let cur = byId.get(key);
    if (!cur) { cur = { id: key }; byId.set(key, cur); order.push(key); }
    for (const [k, v] of Object.entries(rec)) if (k !== "id" && v !== null && v !== undefined && v !== "") cur[k] = v;
  };
  let sawJson = false;
  for (const doc of extractJson(text)) {
    const list = Array.isArray(doc.DBInstances) ? doc.DBInstances : doc.DBInstanceIdentifier ? [doc] : [];
    for (const inst of list) { sawJson = true; merge(fromDescribe(inst)); }
  }
  const jsonFree = text.replace(/^\s*\{[\s\S]*?^\}/gm, "");
  let map = null;
  for (const raw of jsonFree.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || !line.includes(",")) continue;
    const cells = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    const header = mapHeader(cells);
    if (header) { map = header; continue; }
    if (!map) continue;
    const g = (k) => (map[k] === undefined ? undefined : cells[map[k]]);
    merge({
      id: g("id"), cls: g("cls") || null, engine: g("engine") || null,
      multiAz: g("multiAz") === undefined || g("multiAz") === "" ? null : bool(g("multiAz")),
      env: g("env") || null, avgCpu: num(g("avgCpu")), p95Cpu: num(g("p95Cpu")), minFreeGib: num(g("minFreeGib")),
      maxConn: num(g("maxConn")), storageGib: num(g("storageGib")), storageType: g("storageType") || null, iops: num(g("iops")),
    });
  }
  return { records: order.map((k) => byId.get(k)), sawJson };
}

function priceOf(prices, family, size) {
  const v = prices.classes[`db.${family}.${size}`];
  return Number.isFinite(v) ? v : null;
}

function storageMonthly(prices, type, gib, iops, az, { asGp3 = false } = {}) {
  const s = prices.storage;
  if (!Number.isFinite(gib) || gib <= 0) return 0;
  if (asGp3 || type === "gp3") {
    const included = gib >= 400 ? 12000 : 3000;
    return (gib * s.gp3 + Math.max(0, (iops || 0) - included) * s.gp3PerExtraIops) * az;
  }
  if (type === "io1" || type === "io2") return (gib * s.io1 + (iops || 0) * s.io1PerIops) * az;
  if (type === "gp2") return gib * s.gp2 * az;
  return 0;
}

export function analyze(parsed, opts = {}) {
  const cfg = { ...DEFAULTS, ...opts };
  const prices = opts.prices ? { ...DEFAULT_PRICES, ...opts.prices, classes: { ...DEFAULT_PRICES.classes, ...(opts.prices.classes || {}) }, storage: { ...DEFAULT_PRICES.storage, ...(opts.prices.storage || {}) } } : DEFAULT_PRICES;
  const instances = [];
  const findings = [];
  const notes = [];
  const H = cfg.hoursPerMonth;

  for (const r of parsed.records) {
    const out = { id: r.id, cls: r.cls || null, engine: r.engine || "unknown", findings: [] };
    const add = (rule, severity, message) => { const f = { rule, severity, id: r.id, message }; out.findings.push(f); findings.push(f); };
    const pc = parseClass(r.cls);
    const engine = String(r.engine || "").toLowerCase();
    const aurora = engine.startsWith("aurora");
    const licensed = /^(oracle|sqlserver)/.test(engine);
    const az = r.multiAz && !aurora ? 2 : 1;
    const nonProd = r.env ? NONPROD.test(String(r.env)) || /^(dev|test|qa|stage|staging|sandbox|nonprod|demo|uat)$/i.test(String(r.env).trim()) : NONPROD.test(r.id);
    Object.assign(out, { multiAz: Boolean(r.multiAz), env: r.env || null, nonProd, aurora, avgCpu: r.avgCpu ?? null, p95Cpu: r.p95Cpu ?? null, minFreeGib: r.minFreeGib ?? null, maxConn: r.maxConn ?? null, storageGib: r.storageGib ?? null, storageType: r.storageType || null, iops: r.iops ?? null });
    const savings = { rightsize: 0, graviton: 0, storage: 0, multiAz: 0, idle: 0, total: 0 };
    out.savings = savings;
    out.monthlyNow = 0;
    out.command = null;
    instances.push(out);

    const hourly = pc ? priceOf(prices, pc.family, pc.size) : null;
    if (!pc || hourly === null) {
      add("unknown-class", "info", `${r.cls ? `Class ${r.cls}` : "No class"} is not in the price table (db.t3/t4g/m5/m6g/m6i/m7g/r5/r6g/r6i/r7g are built in); add it to the price table to include it.`);
      continue;
    }
    const mult = aurora ? prices.auroraMultiplier : 1;
    const compute = (fam, size) => (priceOf(prices, fam, size) ?? 0) * mult * H;
    const storNow = aurora ? 0 : storageMonthly(prices, r.storageType, r.storageGib, r.iops, az);
    out.monthlyNow = compute(pc.family, pc.size) * az + storNow;
    out.family = pc.family; out.vcpu = pc.vcpu; out.ramGib = pc.ram;
    if (licensed) add("licensed-engine", "info", `${r.engine} instances include licence fees the built-in table does not model; edit the price table before trusting dollar figures.`);

    const haveCpu = r.p95Cpu !== null && r.p95Cpu !== undefined;
    const haveMem = r.minFreeGib !== null && r.minFreeGib !== undefined;
    const haveAvg = r.avgCpu !== null && r.avgCpu !== undefined;
    if (!haveCpu && !haveMem && !haveAvg) add("no-metrics", "info", "No CloudWatch stats for this instance, so only the static checks (Graviton, storage, Multi-AZ on non-prod) ran.");

    // Idle: nothing to right-size, the whole instance is the saving.
    const idle = haveAvg && r.avgCpu < cfg.idleCpu && r.maxConn !== null && r.maxConn !== undefined && r.maxConn <= cfg.idleConnections;
    if (idle) {
      savings.idle = compute(pc.family, pc.size) * az;
      add("idle-instance", "warn", `Average CPU ${r.avgCpu}% and at most ${r.maxConn} connection(s): looks idle. Snapshot it, then stop or delete it to save about ${fmtUsd(savings.idle)}/month of compute (storage keeps billing until deleted).`);
      out.command = [
        `aws rds create-db-snapshot --db-instance-identifier ${r.id} --db-snapshot-identifier ${r.id}-pre-removal`,
        aurora ? `# Aurora: stop the cluster (aws rds stop-db-cluster) or delete the instance after the snapshot completes.` : `aws rds stop-db-instance --db-instance-identifier ${r.id}   # auto-restarts after 7 days; delete instead if truly unused`,
      ].join("\n");
      savings.total = savings.idle;
      continue;
    }

    // Right-size within the family on observed peak memory and p95 CPU.
    const fam = FAMILIES[pc.family];
    const usedGib = haveMem ? Math.max(0, pc.ram - r.minFreeGib) : null;
    const needRam = usedGib === null ? null : usedGib * (1 + cfg.memHeadroom);
    const needCpu = haveCpu ? (r.p95Cpu / 100) * pc.vcpu / cfg.targetCpu : null;
    let recIndex = pc.index;
    if (needRam !== null || needCpu !== null) {
      recIndex = fam.sizes.findIndex((_, i) => (needRam === null || fam.ram[i] >= needRam) && (needCpu === null || fam.vcpu[i] >= needCpu - 1e-9));
      if (recIndex < 0) recIndex = fam.sizes.length - 1;
    }
    const underCpu = haveCpu && r.p95Cpu > cfg.underCpu;
    const underMem = haveMem && r.minFreeGib < pc.ram * cfg.underFreeable;
    let targetIndex = pc.index;
    if (underCpu || underMem) {
      targetIndex = Math.min(fam.sizes.length - 1, Math.max(recIndex, pc.index + 1));
      const why = [underCpu ? `p95 CPU ${r.p95Cpu}% is above ${cfg.underCpu}%` : null, underMem ? `freeable memory fell to ${r.minFreeGib} GiB, under ${Math.round(cfg.underFreeable * 100)}% of the class's ${pc.ram} GiB` : null].filter(Boolean).join(" and ");
      const target = fam.sizes[targetIndex];
      const extra = targetIndex > pc.index ? ` Moving to db.${pc.family}.${target} would add about ${fmtUsd((compute(pc.family, target) - compute(pc.family, pc.size)) * az)}/month.` : " It is already the largest size in the built-in table for this family.";
      add(underCpu ? "under-provisioned-cpu" : "under-provisioned-memory", "error", `Under-provisioned risk: ${why}.${extra}`);
    } else if (recIndex < pc.index) {
      targetIndex = recIndex;
      const rs = fam.sizes[recIndex];
      savings.rightsize = (compute(pc.family, pc.size) - compute(pc.family, rs)) * az;
      add("over-provisioned", "warn", `Observed load fits db.${pc.family}.${rs} (${fam.vcpu[recIndex]} vCPU, ${fam.ram[recIndex]} GiB) at ${Math.round(cfg.targetCpu * 100)}% target p95 CPU and ${Math.round(cfg.memHeadroom * 100)}% memory headroom, not ${r.cls} (${pc.vcpu} vCPU, ${pc.ram} GiB): about ${fmtUsd(savings.rightsize)}/month.`);
    }
    let targetFam = pc.family;
    const targetSize = fam.sizes[targetIndex];

    // Graviton swap, applied to whatever class we end up on.
    const g = GRAVITON[pc.family];
    if (g && !licensed && priceOf(prices, g, targetSize) !== null) {
      savings.graviton = (compute(pc.family, targetSize) - compute(g, targetSize)) * az;
      if (savings.graviton > 0) {
        targetFam = g;
        add("graviton-swap", "info", `db.${g}.${targetSize} is the Graviton equivalent of db.${pc.family}.${targetSize} and lists lower: about ${fmtUsd(savings.graviton)}/month. Check your engine version supports Graviton and test the change.`);
      } else savings.graviton = 0;
    }
    const classChanged = targetFam !== pc.family || targetSize !== pc.size;
    const targetCls = `db.${targetFam}.${targetSize}`;

    // Storage: gp2/io1 -> gp3 (not Aurora: its storage is billed per cluster use).
    let newType = null;
    if (!aurora && Number.isFinite(r.storageGib) && ["gp2", "io1"].includes(String(r.storageType))) {
      const was = storageMonthly(prices, r.storageType, r.storageGib, r.iops, az);
      const will = storageMonthly(prices, r.storageType, r.storageGib, r.iops, az, { asGp3: true });
      const cap = r.storageType === "io1" && (r.iops || 0) > 64000;
      if (!cap) {
        newType = "gp3";
        savings.storage = Math.max(0, was - will);
        const detail = savings.storage > 0 ? `about ${fmtUsd(savings.storage)}/month` : "no list-price saving at these prices, but gp3 gives a 3,000 IOPS baseline (12,000 from 400 GiB) without sizing storage for it";
        add(r.storageType === "io1" ? "io1-to-gp3" : "gp2-to-gp3", r.storageType === "io1" && savings.storage > 0 ? "warn" : "info", `${r.storageType} ${r.storageGib} GiB${r.iops ? ` / ${r.iops} IOPS` : ""} -> gp3: ${detail}. Confirm the IOPS and throughput you need fit gp3 first.`);
        if (savings.storage === 0 && r.storageType === "io1") newType = null;
      }
    }

    // Multi-AZ on non-prod: halves the compute and storage that remain after the steps above.
    let dropAz = false;
    if (r.multiAz && !aurora && nonProd) {
      const remaining = compute(targetFam, targetSize) * 2 + (storNow ? storageMonthly(prices, newType || r.storageType, r.storageGib, r.iops, 2, { asGp3: newType === "gp3" }) : 0);
      savings.multiAz = remaining / 2;
      dropAz = true;
      add("multi-az-nonprod", "warn", `Multi-AZ on what looks like a non-prod instance (${r.env ? `env ${r.env}` : "name"}): single-AZ halves the bill, about ${fmtUsd(savings.multiAz)}/month. You lose automatic failover.`);
    }

    savings.total = savings.rightsize + savings.graviton + savings.storage + savings.multiAz;
    if (classChanged || newType || dropAz) {
      const parts = [`aws rds modify-db-instance --db-instance-identifier ${r.id}`];
      if (classChanged) parts.push(`--db-instance-class ${targetCls}`);
      if (newType && newType !== r.storageType) parts.push("--storage-type gp3");
      if (dropAz) parts.push("--no-multi-az");
      parts.push("# add --apply-immediately only in a maintenance window; a class change restarts the instance (failover if Multi-AZ)");
      out.command = parts.join(" ");
      out.target = { cls: targetCls, storageType: newType, multiAz: dropAz ? false : Boolean(r.multiAz) };
    }
  }

  const totals = {
    instances: instances.length,
    nowMonthly: instances.reduce((s, i) => s + i.monthlyNow, 0),
    savings: instances.reduce((s, i) => s + i.savings.total, 0),
  };
  if (parsed.records.length && instances.every((i) => i.findings.some((f) => f.rule === "no-metrics"))) notes.push("No instance had CloudWatch stats. Add avg_cpu, p95_cpu, min_freeable_gib and max_connections columns for right-sizing and idle detection.");
  return { count: instances.length, instances, findings, notes, totals, commands: instances.filter((i) => i.command).map((i) => ({ id: i.id, command: i.command })) };
}

export function summarize(report) {
  if (!report.count) return { status: "none", errors: 0, warns: 0, infos: 0, text: "No RDS instances found. Paste a CSV with a header (instance_id,class,...) and/or aws rds describe-db-instances JSON." };
  const errors = report.findings.filter((f) => f.severity === "error").length;
  const warns = report.findings.filter((f) => f.severity === "warn").length;
  const infos = report.findings.filter((f) => f.severity === "info").length;
  const status = errors ? "error" : warns ? "warn" : "ok";
  const head = `${report.count} instance(s), about ${fmtUsd(report.totals.nowMonthly)}/month at list prices; ${errors} error(s), ${warns} warning(s), ${infos} note(s).`;
  const tail = report.totals.savings > 0 ? ` Estimated saving if every suggestion is applied: about ${fmtUsd(report.totals.savings)}/month (${Math.round((report.totals.savings / Math.max(1, report.totals.nowMonthly)) * 100)}%).` : " No saving found at these prices.";
  return { status, errors, warns, infos, text: head + tail };
}

export const INPUT_NOTES = [
  { what: "CSV with a header", detail: "instance_id,class,engine,multi_az,env,avg_cpu,p95_cpu,min_freeable_gib,max_connections,storage_gib,storage_type,iops. Metrics are CloudWatch CPUUtilization (average, p95), minimum FreeableMemory in GiB and maximum DatabaseConnections over your sample period." },
  { what: "aws rds describe-db-instances JSON", detail: "Supplies class, engine, MultiAZ, AllocatedStorage, StorageType, Iops and an Environment tag. Join CloudWatch stats by adding a CSV with the same instance ids." },
  { what: "Non-prod detection", detail: "An env column or Environment tag, else dev/test/qa/stage/staging/sandbox/uat/demo in the instance name." },
  { what: "Aurora", detail: "Priced with an editable multiplier; storage and Multi-AZ rules are skipped (Aurora storage is per cluster, replicas replace Multi-AZ)." },
  { what: "Oracle / SQL Server", detail: "Licence-included prices are not modelled and Graviton is skipped; edit the price table." },
];
