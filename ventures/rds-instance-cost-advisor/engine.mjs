// Zero-dependency, deterministic Amazon RDS instance cost advisor. One row per
// DB instance (class, engine, Multi-AZ, storage type and size, provisioned
// IOPS, average CPU, environment) in; a modelled monthly cost per instance and
// the fixes that are plain arithmetic on list prices -- Multi-AZ on a
// non-production instance, provisioned-IOPS storage that a gp3 volume covers,
// an x86 class that has a cheaper Graviton twin, an instance that is idle --
// plus two bounded notes (right-sizing, Reserved Instances) out, each with the
// aws CLI command to change it.
//
// What is arithmetic and what is a model: dollars are the hourly price of the
// class times hours, doubled for Multi-AZ, plus storage and IOPS at list
// prices you can edit. The Multi-AZ, io1->gp3, Graviton and idle savings are
// differences of those prices and are counted in the totals. Right-sizing and
// Reserved Instance figures depend on a workload and a commitment, so they are
// upper bounds, never counted in the totals.

// ILLUSTRATIVE and dated; regions, engines and contracts differ. Overridable.
export const PRICES_AS_OF = "illustrative US East (N. Virginia) on-demand list prices for MySQL, MariaDB and PostgreSQL, single-AZ; Multi-AZ is twice the instance and storage price; gp2/gp3 $0.115, io1 $0.125 plus $0.10 per provisioned IOPS per GB-month; verify against the AWS RDS pricing page for your region, engine and any Reserved Instance or Savings Plan";
export const HOURLY = {
  "db.t3.micro": 0.017, "db.t3.small": 0.034, "db.t3.medium": 0.068, "db.t3.large": 0.136, "db.t3.xlarge": 0.272, "db.t3.2xlarge": 0.544,
  "db.t4g.micro": 0.016, "db.t4g.small": 0.032, "db.t4g.medium": 0.065, "db.t4g.large": 0.129, "db.t4g.xlarge": 0.258, "db.t4g.2xlarge": 0.517,
  "db.m5.large": 0.171, "db.m5.xlarge": 0.342, "db.m5.2xlarge": 0.684, "db.m5.4xlarge": 1.368, "db.m5.8xlarge": 2.736,
  "db.m6g.large": 0.152, "db.m6g.xlarge": 0.304, "db.m6g.2xlarge": 0.608, "db.m6g.4xlarge": 1.216, "db.m6g.8xlarge": 2.432,
  "db.r5.large": 0.240, "db.r5.xlarge": 0.480, "db.r5.2xlarge": 0.960, "db.r5.4xlarge": 1.920, "db.r5.8xlarge": 3.840,
  "db.r6g.large": 0.216, "db.r6g.xlarge": 0.432, "db.r6g.2xlarge": 0.864, "db.r6g.4xlarge": 1.728, "db.r6g.8xlarge": 3.456,
};
export const DEFAULT_PRICES = { gbMonth: { gp2: 0.115, gp3: 0.115, io1: 0.125, io2: 0.125 }, iopsMonth: 0.10, riDiscount: 0.3 };
export const DEFAULTS = { hoursPerMonth: 730, idleCpu: 5, lowCpu: 20, minMonthlySaving: 10 };
const ENGINES = { postgres: "postgres", postgresql: "postgres", mysql: "mysql", mariadb: "mariadb" };
const GRAVITON_TWIN = { t3: "t4g", m5: "m6g", r5: "r6g" };
const SIZES = ["micro", "small", "medium", "large", "xlarge", "2xlarge", "4xlarge", "8xlarge"];
const NONPROD = /^(dev|development|test|testing|staging|stage|qa|sandbox|uat)$/i;
const STORAGE = new Set(["gp2", "gp3", "io1", "io2"]);

const toNum = (s) => {
  const n = Number(String(s ?? "").trim().replace(/,/g, ""));
  return String(s ?? "").trim() !== "" && Number.isFinite(n) && n >= 0 ? n : NaN;
};
const parts = (cls) => { const m = /^db\.([a-z0-9]+)\.([a-z0-9]+)$/.exec(cls); return m ? { family: m[1], size: m[2] } : null; };

/** The same family one size down, or null when it is the smallest priced size. */
export function smallerClass(cls) {
  const p = parts(cls);
  if (!p) return null;
  const i = SIZES.indexOf(p.size);
  const next = i > 0 ? `db.${p.family}.${SIZES[i - 1]}` : null;
  return next && HOURLY[next] !== undefined ? next : null;
}
/** The Graviton class priced for the same size, or null (x86 families only). */
export function gravitonTwin(cls) {
  const p = parts(cls);
  const fam = p && GRAVITON_TWIN[p.family];
  const twin = fam ? `db.${fam}.${p.size}` : null;
  return twin && HOURLY[twin] !== undefined ? twin : null;
}

/** Parses `instance,class,engine,multi_az,storage_type,storage_gb[,provisioned_iops[,avg_cpu_pct[,env]]]`; header names remap columns. */
export function parseInstances(text) {
  const rows = [];
  let skipped = 0;
  const col = { name: 0, cls: 1, engine: 2, multi: 3, type: 4, gb: 5, iops: 6, cpu: 7, env: 8 };
  let sawHeader = false;
  for (const raw of String(text ?? "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const cells = line.split(/\s*[,\t]\s*/);
    if (!sawHeader && rows.length === 0 && /class/i.test(line) && /engine|storage/i.test(line)) {
      sawHeader = true;
      const find = (re) => cells.findIndex((c) => re.test(c));
      const m = { name: find(/instance|identifier|name/i), cls: find(/class/i), engine: find(/engine/i), multi: find(/multi/i), type: find(/storage_?type|^type/i), gb: find(/gb|size|allocated/i), iops: find(/iops/i), cpu: find(/cpu/i), env: find(/env/i) };
      for (const k of Object.keys(m)) if (m[k] >= 0) col[k] = m[k];
      continue;
    }
    const name = String(cells[col.name] ?? "").trim();
    const cls = String(cells[col.cls] ?? "").trim().toLowerCase();
    const engine = ENGINES[String(cells[col.engine] ?? "").trim().toLowerCase()];
    const multiRaw = String(cells[col.multi] ?? "").trim().toLowerCase();
    const type = String(cells[col.type] ?? "").trim().toLowerCase();
    const gb = toNum(cells[col.gb]);
    const opt = (i) => (String(cells[i] ?? "").trim() === "" ? null : toNum(cells[i]));
    const iops = opt(col.iops);
    const cpu = opt(col.cpu);
    const env = String(cells[col.env] ?? "").trim().toLowerCase() || null;
    const multiAz = ["yes", "true", "1", "y", "multi-az"].includes(multiRaw) ? true : ["no", "false", "0", "n", "single-az", ""].includes(multiRaw) ? false : null;
    if (!name || HOURLY[cls] === undefined || !engine || multiAz === null || !STORAGE.has(type) || Number.isNaN(gb) || Number.isNaN(iops) || Number.isNaN(cpu) || (cpu !== null && cpu > 100) || ((type === "io1" || type === "io2") && !iops)) { skipped += 1; continue; }
    rows.push({ name, cls, engine, multiAz, type, gb, iops, cpu, env });
  }
  return { rows, skipped };
}

export function analyze(parsed, options = {}) {
  const o = { ...DEFAULTS, ...options };
  const prices = { ...DEFAULT_PRICES, ...(options.prices ?? {}), gbMonth: { ...DEFAULT_PRICES.gbMonth, ...(options.prices?.gbMonth ?? {}) } };
  const hourly = { ...HOURLY, ...(options.prices?.hourly ?? {}) };
  const rows = parsed.rows;
  if (!rows.length) return { count: 0, findings: [], skipped: parsed.skipped ?? 0 };
  const findings = [];
  const add = (rule, severity, row, message) => findings.push({ rule, severity, row, message });
  const usd = (n) => {
    const format = (n) => `$${n.toFixed(2)}`;
    const text = format(Math.abs(n));
    return n < 0 && /[1-9]/.test(text) ? `-${text}` : text;
  };
  const az = (r) => (r.multiAz ? 2 : 1);
  const instanceCost = (cls, r) => (hourly[cls] ?? HOURLY[cls]) * o.hoursPerMonth * az(r);
  const storageCost = (r, type = r.type, iops = r.iops) => (r.gb * prices.gbMonth[type] + (type === "io1" || type === "io2" ? (iops ?? 0) * prices.iopsMonth : 0)) * az(r);

  const instances = rows.map((r) => {
    const compute = instanceCost(r.cls, r);
    const storage = storageCost(r);
    const cost = compute + storage;
    const idle = r.cpu !== null && r.cpu < o.idleCpu;
    const nonprodMulti = r.multiAz && r.env !== null && NONPROD.test(r.env);
    // gp3 on RDS gives a 3,000 IOPS baseline under 400 GB and 12,000 at 400 GB and above, with no per-IOPS charge.
    const gp3Ceiling = r.gb >= 400 ? 12000 : 3000;
    const ioToGp3 = (r.type === "io1" || r.type === "io2") && r.iops <= gp3Ceiling ? storage - storageCost(r, "gp3") : 0;
    const twin = gravitonTwin(r.cls);
    const graviton = twin ? compute - instanceCost(twin, r) : 0;
    // A saving is only counted once, in this order: idle > Multi-AZ > storage > Graviton.
    const smaller = smallerClass(r.cls);
    const potentialSize = !idle && smaller && r.cpu !== null && r.cpu < o.lowCpu && !/^(micro|small|medium|large)$/.test(parts(r.cls).size) ? compute - instanceCost(smaller, r) : 0;
    const prodAlways = !idle && !(r.env !== null && NONPROD.test(r.env));
    const potentialRi = prodAlways ? compute * prices.riDiscount : 0;
    const multiSaving = !idle && nonprodMulti ? cost / 2 : 0;
    const storageSaving = idle ? 0 : nonprodMulti ? Math.max(0, ioToGp3 / 2) : Math.max(0, ioToGp3);
    const gravitonSaving = idle ? 0 : nonprodMulti ? Math.max(0, graviton / 2) : Math.max(0, graviton);
    const idleSaving = idle ? compute : 0;
    return { row: r, compute, storage, cost, idle, nonprodMulti, twin, smaller, idleSaving, multiSaving, storageSaving, gravitonSaving, potentialSize, potentialRi, ioToGp3 };
  });

  for (const w of instances) {
    const { row } = w;
    if (w.idle) add("idle-instance", "warn", row.name, `${row.name}: average CPU ${row.cpu}% on ${row.cls}${row.multiAz ? " (Multi-AZ)" : ""} costs ${usd(w.compute)}/month in compute. If nothing needs it, take a final snapshot and stop paying: aws rds create-db-snapshot --db-instance-identifier ${row.name} --db-snapshot-identifier ${row.name}-final && aws rds delete-db-instance --db-instance-identifier ${row.name} --skip-final-snapshot (a stopped instance restarts by itself after 7 days, so stopping is not a lasting fix). Storage stays billed until the instance is deleted.`);
    if (w.multiSaving >= o.minMonthlySaving) add("multi-az-nonprod", "warn", row.name, `${row.name}: Multi-AZ on an environment tagged "${row.env}" doubles the instance and storage bill for a standby nobody fails over to. Single-AZ saves about ${usd(w.multiSaving)}/month (${usd(w.multiSaving * 12)}/year): aws rds modify-db-instance --db-instance-identifier ${row.name} --no-multi-az --apply-immediately. You lose automatic failover and the maintenance-window advantage; keep Multi-AZ for production.`);
    if (w.storageSaving >= o.minMonthlySaving) add("io1-to-gp3", "warn", row.name, `${row.name}: ${row.iops.toLocaleString("en-US")} provisioned IOPS on ${row.type} cost ${usd(row.iops * prices.iopsMonth * az(row))}/month on top of storage, but gp3 on a ${row.gb} GB volume includes ${(row.gb >= 400 ? 12000 : 3000).toLocaleString("en-US")} IOPS at no per-IOPS charge. Moving saves about ${usd(w.storageSaving)}/month: aws rds modify-db-instance --db-instance-identifier ${row.name} --storage-type gp3 --apply-immediately. Check peak IOPS and latency in CloudWatch first; the change runs in the background and storage optimisation limits how often you can change it.`);
    if (w.gravitonSaving >= o.minMonthlySaving && ["mysql", "mariadb", "postgres"].includes(row.engine)) add("graviton-twin", "warn", row.name, `${row.name}: ${row.cls} has a Graviton twin ${w.twin} priced lower for the same size and memory. Saving about ${usd(w.gravitonSaving)}/month (${usd(w.gravitonSaving * 12)}/year): aws rds modify-db-instance --db-instance-identifier ${row.name} --db-instance-class ${w.twin} --apply-immediately. It restarts the instance (a brief outage on single-AZ, a failover on Multi-AZ) and needs the engine version to support the Graviton class: test on a copy first.`);
    if (w.potentialSize > o.minMonthlySaving) add("oversized-for-cpu", "info", row.name, `${row.name}: average CPU ${row.cpu}% on ${row.cls}. One size down (${w.smaller}) would cost ${usd(w.potentialSize)}/month less in compute, an upper bound not counted in the saving: average CPU hides peaks and memory-bound databases need RAM, not CPU. Compare peak CPU, FreeableMemory and swap in CloudWatch over a month before changing.`);
    if (w.potentialRi > o.minMonthlySaving) add("reserved-instance-candidate", "info", row.name, `${row.name}: a steady production instance. A one-year no-upfront Reserved Instance commonly takes about ${Math.round(prices.riDiscount * 100)}% off the instance price, roughly ${usd(w.potentialRi)}/month here, an upper bound not counted in the saving: it is a one-year commitment on a class, so right-size and move to Graviton first.`);
  }
  const grand = instances.reduce((a, w) => a + w.cost, 0);
  for (const w of instances) if (instances.length > 1 && w.cost / grand >= 0.5) add("one-instance-dominates", "info", w.row.name, `${w.row.name} is ${Math.round((w.cost / grand) * 100)}% of the total (${usd(w.cost)} of ${usd(grand)}). Start there: its class, Multi-AZ setting and storage move the bill more than the rest combined.`);

  const totals = instances.reduce((a, w) => ({ current: a.current + w.cost, saving: a.saving + w.idleSaving + w.multiSaving + w.storageSaving + w.gravitonSaving, potential: a.potential + w.potentialSize + w.potentialRi }), { current: 0, saving: 0, potential: 0 });
  if (!findings.some((f) => f.severity !== "info")) add("instances-fine", "info", "", `No instance is idle, runs Multi-AZ outside production, pays per-IOPS for what gp3 includes, or has a cheaper Graviton twin worth more than ${usd(o.minMonthlySaving)}/month.`);
  return { count: rows.length, skipped: parsed.skipped ?? 0, instances: instances.map((w) => ({ name: w.row.name, cls: w.row.cls, multiAz: w.row.multiAz, current: w.cost, saving: w.idleSaving + w.multiSaving + w.storageSaving + w.gravitonSaving, potential: w.potentialSize + w.potentialRi })), totals: { ...totals, after: totals.current - totals.saving, annual: totals.saving * 12 }, prices, options: o, findings };
}

export function summarize(report) {
  if (!report.count) return { status: "none", errors: 0, warns: 0, text: "No usable rows found. Expected lines like: orders-prod,db.m5.2xlarge,postgres,yes,io1,1000,10000,38,prod (instance, class, engine, Multi-AZ yes/no, storage type, GB, optional provisioned IOPS, average CPU %, environment)." };
  const errors = report.findings.filter((f) => f.severity === "error").length;
  const warns = report.findings.filter((f) => f.severity === "warn").length;
  const t = report.totals;
  return { status: errors ? "error" : warns ? "warn" : "ok", errors, warns, text: `${report.count} instance(s). Modelled $${t.current.toFixed(2)}/month${t.saving > 0.005 ? `; the fixes below save about $${t.saving.toFixed(2)}/month, $${t.annual.toFixed(0)}/year` : ""}${t.potential > 0.005 ? `; right-sizing and Reserved Instances could take up to $${t.potential.toFixed(2)}/month more` : ""}.` };
}

export const INPUT_NOTES = [
  { what: "instance,class,engine,multi_az,storage_type,storage_gb", detail: "One row per DB instance. aws rds describe-db-instances gives DBInstanceIdentifier, DBInstanceClass, Engine, MultiAZ, StorageType and AllocatedStorage. Engine must be mysql, mariadb or postgres; classes not in the price table are skipped, not guessed." },
  { what: "provisioned_iops (optional 7th)", detail: "The Iops field of describe-db-instances. Required for io1/io2; used for the per-IOPS charge and the gp3 check." },
  { what: "avg_cpu_pct (optional 8th)", detail: "Average CPUUtilization over 30 days from CloudWatch. Under 5% marks the instance idle; under 20% on a large class triggers the right-sizing note." },
  { what: "env (optional 9th)", detail: "dev, test, staging, qa, uat or sandbox marks the instance non-production, which is when Multi-AZ is flagged. Anything else (prod, blank) is treated as production." },
  { what: "multi_az", detail: "yes/true/1 or no/false/0. Multi-AZ doubles the instance and storage price in the model." },
  { what: "header row", detail: "One optional header; names (instance, class, engine, multi, storage_type, gb, iops, cpu, env) remap the columns in any order." },
  { what: "# comment / blank lines", detail: "Ignored." },
  { what: "other lines", detail: "Counted as skipped, never guessed at." },
];
