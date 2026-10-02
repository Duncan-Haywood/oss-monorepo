// Zero-dependency, deterministic RDS / Aurora instance right-sizer. It reads what
// you paste -- a CSV of CloudWatch numbers per instance and/or the JSON from
// `aws rds describe-db-instances` -- and answers, per instance: is the class
// over- or under-provisioned, what is the next-smaller (or larger) class in the
// same family that still fits CPU, memory and connections with headroom, is there
// a Graviton equivalent of an x86 class, what is the monthly difference (Multi-AZ
// doubles the instance price), and what is the `aws rds modify-db-instance`
// command to apply it.
// Pure string in, report out -- no filesystem or network here.
//
// Honest limits, stated once: the numbers are a recommendation from metrics, not
// a bill. Metrics must be sampled over a representative period (a full business
// cycle, including month-end). The prices below are APPROXIMATE us-east-1
// on-demand list prices for single-AZ MySQL/PostgreSQL-style instances; Aurora,
// MariaDB, Oracle and SQL Server price differently, and your discounts, reserved
// instances and storage/IO charges are not modelled. Every price is editable.

export const PRICES_AS_OF = "approximate us-east-1 on-demand list prices ($/hour, single-AZ, MySQL/PostgreSQL-style), about 2025-2026; not a quote or a bill. Aurora, Oracle, SQL Server, reserved instances and discounts differ. Edit the table to match your account";

export const DEFAULTS = {
  cpuTarget: 0.7, // projected p95 CPU on the new class must stay at or below this share
  memReserve: 0.2, // projected freeable memory at the observed peak must stay at or above this share
  connLimit: 0.8, // connections_p95 must stay at or below this share of the derived max_connections
  cpuHigh: 0.85, // current p95 CPU at or above this is a warning
  cpuSaturated: 0.95, // ... and at or above this an error
  hoursPerMonth: 730,
};

// --- the embedded class table --------------------------------------------

const GP = { large: 2, xlarge: 4, "2xlarge": 8, "4xlarge": 16, "8xlarge": 32, "12xlarge": 48, "16xlarge": 64 };
// family -> price of the `large` size, memory GiB per vCPU. Price scales with vCPU.
const BIG_FAMILIES = {
  m5: { large: 0.171, gibPerVcpu: 4 },
  m6i: { large: 0.171, gibPerVcpu: 4 },
  m6g: { large: 0.152, gibPerVcpu: 4 },
  m7g: { large: 0.168, gibPerVcpu: 4 },
  r5: { large: 0.29, gibPerVcpu: 8 },
  r6i: { large: 0.29, gibPerVcpu: 8 },
  r6g: { large: 0.26, gibPerVcpu: 8 },
  r7g: { large: 0.286, gibPerVcpu: 8 },
};
// Burstable: explicit sizes. baseline = CPU credit baseline as a share of the
// whole instance (AWS publishes it per size); above it the instance spends credits.
const T_SIZES = {
  micro: { vcpu: 2, mem: 1, baseline: 0.1 },
  small: { vcpu: 2, mem: 2, baseline: 0.2 },
  medium: { vcpu: 2, mem: 4, baseline: 0.2 },
  large: { vcpu: 2, mem: 8, baseline: 0.3 },
  xlarge: { vcpu: 4, mem: 16, baseline: 0.4 },
  "2xlarge": { vcpu: 8, mem: 32, baseline: 0.4 },
};
const T_PRICES = {
  t3: { micro: 0.017, small: 0.034, medium: 0.068, large: 0.136, xlarge: 0.272, "2xlarge": 0.544 },
  t4g: { micro: 0.016, small: 0.032, medium: 0.065, large: 0.129, xlarge: 0.258, "2xlarge": 0.517 },
};

/** x86 family -> the Graviton family to suggest at the same size. */
export const GRAVITON_OF = { t3: "t4g", m5: "m6g", m6i: "m6g", r5: "r6g", r6i: "r6g" };
/** Engines that run on Graviton classes. Oracle and SQL Server do not. */
const GRAVITON_ENGINES = /^(mysql|postgres|mariadb|aurora)/;

/** The built-in table as plain data: class -> { family, size, vcpu, memGib, price, baseline }. */
export const CLASS_TABLE = (() => {
  const t = {};
  for (const [fam, f] of Object.entries(BIG_FAMILIES)) {
    for (const [size, vcpu] of Object.entries(GP)) {
      t[`db.${fam}.${size}`] = { family: fam, size, vcpu, memGib: vcpu * f.gibPerVcpu, price: round3((f.large * vcpu) / 2), baseline: null };
    }
  }
  for (const [fam, sizes] of Object.entries(T_PRICES)) {
    for (const [size, price] of Object.entries(sizes)) {
      const s = T_SIZES[size];
      t[`db.${fam}.${size}`] = { family: fam, size, vcpu: s.vcpu, memGib: s.mem, price, baseline: s.baseline };
    }
  }
  return t;
})();
function round3(n) { return Math.round(n * 1000) / 1000; }

export const isGraviton = (family) => /^[a-z]+\d+g$/.test(family);

/** Applies user overrides: { "db.r6g.large": 0.27 } or { "db.x2g.large": { price, vcpu, memGib } }. */
export function buildTable(overrides = {}) {
  const table = new Map(Object.entries(CLASS_TABLE).map(([k, v]) => [k, { ...v }]));
  const issues = [];
  for (const [cls, v] of Object.entries(overrides || {})) {
    const m = /^db\.([a-z0-9]+)\.([a-z0-9]+)$/.exec(cls);
    if (!m) { issues.push(`price override ${cls}: not a db.<family>.<size> class name`); continue; }
    const base = table.get(cls);
    const o = typeof v === "number" ? { price: v } : v && typeof v === "object" ? v : null;
    if (!o) { issues.push(`price override ${cls}: expected a number or { price, vcpu, memGib }`); continue; }
    const merged = { family: m[1], size: m[2], baseline: null, ...base, ...o };
    if (![merged.price, merged.vcpu, merged.memGib].every((n) => Number.isFinite(n) && n > 0)) { issues.push(`price override ${cls}: price, vcpu and memGib must be positive numbers (vcpu and memGib are needed for a class not in the built-in table)`); continue; }
    table.set(cls, merged);
  }
  return { table, issues };
}

// --- parsing -------------------------------------------------------------

const num = (v) => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim().replace(/%$/, "");
  if (s === "" || s === "-" || /^(null|n\/a|na)$/i.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
};
const bool = (v) => (v === undefined || v === null || String(v).trim() === "" ? null : /^(true|yes|y|1|multi-?az)$/i.test(String(v).trim()));

const COLUMNS = ["id", "engine", "cls", "multiAz", "storageGb", "cpuAvg", "cpuP95", "freeMemGb", "connP95", "count"];
const ALIASES = {
  id: ["db_identifier", "dbinstanceidentifier", "identifier", "id", "name", "db"],
  engine: ["engine"],
  cls: ["instance_class", "dbinstanceclass", "class"],
  multiAz: ["multi_az", "multiaz"],
  storageGb: ["storage_gb", "allocatedstorage", "storage"],
  cpuAvg: ["cpu_avg", "cpuutilization_avg", "cpu_average"],
  cpuP95: ["cpu_p95", "cpuutilization_p95"],
  freeMemGb: ["freeable_mem_gb_min", "freeable_memory_gb_min", "freeable_mem_gb", "freeablememory_min_gb"],
  connP95: ["connections_p95", "databaseconnections_p95", "connections"],
  count: ["count", "instances", "replicas"],
};

/** Pulls every top-level `{...}` JSON document that starts a line out of mixed pasted text. */
function extractJson(text) {
  const docs = [];
  let rest = "";
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    if (!/^\s*\{/.test(lines[i])) { rest += `${lines[i]}\n`; continue; }
    let buf = "";
    let depth = 0;
    let inStr = false;
    let esc = false;
    let j = i;
    for (; j < lines.length; j += 1) {
      buf += `${lines[j]}\n`;
      for (const ch of lines[j]) {
        if (inStr) { if (esc) esc = false; else if (ch === "\\") esc = true; else if (ch === '"') inStr = false; }
        else if (ch === '"') inStr = true;
        else if (ch === "{") depth += 1;
        else if (ch === "}") depth -= 1;
      }
      if (depth <= 0) break;
    }
    try { docs.push(JSON.parse(buf)); i = j; } catch { rest += `${lines[i]}\n`; }
  }
  return { docs, rest };
}

/**
 * Text -> { instances, issues, sources }. `instances` are partial records keyed by
 * identifier and merged across sources: the describe-db-instances JSON supplies
 * engine/class/Multi-AZ/storage, CSV rows supply (and may override) everything, so
 * `aws rds describe-db-instances` plus a metrics-only CSV works.
 */
export function parseInput(text) {
  const issues = [];
  const sources = { json: false, csv: false };
  const byId = new Map();
  const merge = (id, fields) => {
    const key = id.toLowerCase();
    const cur = byId.get(key) || { id, count: null };
    for (const [k, v] of Object.entries(fields)) if (v !== null && v !== undefined && !(typeof v === "number" && Number.isNaN(v))) cur[k] = v;
    byId.set(key, cur);
  };
  const { docs, rest } = extractJson(String(text).replace(/\r/g, ""));
  for (const doc of docs) {
    const list = Array.isArray(doc.DBInstances) ? doc.DBInstances : null;
    if (!list) continue;
    sources.json = true;
    for (const d of list) {
      if (!d || typeof d.DBInstanceIdentifier !== "string") continue;
      merge(d.DBInstanceIdentifier, { engine: d.Engine, cls: d.DBInstanceClass, multiAz: typeof d.MultiAZ === "boolean" ? d.MultiAZ : null, storageGb: Number.isFinite(d.AllocatedStorage) ? d.AllocatedStorage : null });
    }
  }
  let order = COLUMNS;
  for (const raw of rest.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const cells = line.split(/\t|,/).map((c) => c.trim().replace(/^"|"$/g, ""));
    const lower = cells.map((c) => c.toLowerCase());
    if (lower.some((c) => ALIASES.id.includes(c)) && lower.some((c) => Object.values(ALIASES).flat().includes(c) && !ALIASES.id.includes(c))) {
      order = lower.map((c) => COLUMNS.find((k) => ALIASES[k].includes(c)) || null);
      continue;
    }
    const f = {};
    cells.forEach((c, i) => { if (order[i]) f[order[i]] = c; });
    if (!f.id || !/^[A-Za-z][\w.-]*$/.test(f.id) || cells.length < 2) { issues.push(`ignored line: ${line.slice(0, 60)}`); continue; }
    const fields = { engine: f.engine || null, cls: f.cls || null, multiAz: bool(f.multiAz), storageGb: num(f.storageGb), cpuAvg: num(f.cpuAvg), cpuP95: num(f.cpuP95), freeMemGb: num(f.freeMemGb), connP95: num(f.connP95), count: num(f.count) };
    const bad = ["storageGb", "cpuAvg", "cpuP95", "freeMemGb", "connP95", "count"].filter((k) => Number.isNaN(fields[k]) || (fields[k] !== null && fields[k] < 0));
    if (bad.length) { issues.push(`${f.id}: not a non-negative number: ${bad.join(", ")}`); continue; }
    for (const k of ["cpuAvg", "cpuP95"]) if (fields[k] !== null && fields[k] > 100) { issues.push(`${f.id}: ${k} is a percentage between 0 and 100`); fields[k] = null; }
    sources.csv = true;
    merge(f.id, fields);
  }
  return { instances: [...byId.values()], issues, sources };
}

// --- the model -----------------------------------------------------------

/** MySQL/PostgreSQL parameter-group default: max_connections = DBInstanceClassMemory / 9531392, capped at 5000. */
export const maxConnections = (memGib) => Math.min(5000, Math.floor((memGib * 1024 ** 3) / 9531392));

const monthly = (price, azFactor, count, hours) => price * hours * azFactor * count;

/** A shell-safe rendering of an identifier or class, because pasted text ends up in a command. */
export function shQuote(s) {
  return /^[A-Za-z0-9._-]+$/.test(s) ? s : `'${String(s).replace(/'/g, `'\\''`)}'`;
}

export function modifyCommand(id, cls, applyImmediately = false) {
  return `aws rds modify-db-instance --db-instance-identifier ${shQuote(id)} --db-instance-class ${shQuote(cls)}${applyImmediately ? " --apply-immediately" : ""}`;
}

const DOWNTIME = "Changing the class restarts the instance: a single-AZ instance is unavailable for several minutes, a Multi-AZ instance fails over (typically 1-2 minutes of connection errors). Without --apply-immediately it waits for the next maintenance window.";

function ladder(table, family) {
  return [...table.entries()].filter(([, v]) => v.family === family).map(([name, v]) => ({ name, ...v })).sort((a, b) => a.memGib - b.memGib || a.vcpu - b.vcpu || a.price - b.price);
}

/** Does `cand` hold this instance's observed peaks with headroom? Returns reasons it does not. */
function misfits(inst, cur, cand, o) {
  const why = [];
  const scale = cur.vcpu / cand.vcpu;
  if (inst.cpuP95 !== null && inst.cpuP95 * scale > o.cpuTarget * 100) why.push("cpu");
  if (cand.baseline !== null) {
    const avg = inst.cpuAvg ?? inst.cpuP95;
    if (avg !== null && avg * scale > cand.baseline * 100) why.push("burst-credits");
  }
  if (inst.freeMemGb !== null) {
    const usedPeak = cur.memGib - inst.freeMemGb;
    if (usedPeak > cand.memGib * (1 - o.memReserve)) why.push("memory");
  }
  if (inst.connP95 !== null && inst.connP95 > o.connLimit * maxConnections(cand.memGib)) why.push("connections");
  return why;
}

const pct = (n) => `${Math.round(n * 10) / 10}%`;

function analyzeOne(raw, o, table) {
  const inst = { cpuAvg: null, cpuP95: null, freeMemGb: null, connP95: null, storageGb: null, ...raw };
  const findings = [];
  const add = (rule, severity, message) => findings.push({ id: inst.id, rule, severity, message });
  const count = inst.count && inst.count > 0 ? inst.count : 1;
  const base = { id: inst.id, engine: inst.engine || "unknown", cls: inst.cls || null, multiAz: inst.multiAz === true, storageGb: inst.storageGb ?? null, count, cpuAvg: inst.cpuAvg ?? null, cpuP95: inst.cpuP95 ?? null, freeMemGb: inst.freeMemGb ?? null, connP95: inst.connP95 ?? null, findings };
  const skip = (verdict, rule, severity, message) => { add(rule, severity, message); return { ...base, verdict, target: null, finalCls: null, graviton: null, monthlyNow: 0, monthlyAfter: 0, savings: 0, command: null }; };

  const cur = inst.cls ? table.get(inst.cls) : null;
  if (!cur) return skip("unknown-class", "unknown-class", "info", `${inst.id}: ${inst.cls ? `class ${inst.cls} is not in the price table` : "no instance class given"}, so it was not analysed. Add it with --prices (or the price table box) as { "price": $/hr, "vcpu": n, "memGib": n }.`);
  if (inst.cpuP95 === null) return skip("no-data", "no-metrics", "info", `${inst.id}: no cpu_p95 supplied (only describe-db-instances data), so it was not analysed. Add its CloudWatch numbers as a CSV row.`);

  const aurora = /^aurora/.test(base.engine);
  const azFactor = !aurora && base.multiAz ? 2 : 1;
  const hours = o.hoursPerMonth;
  const now = monthly(cur.price, azFactor, count, hours);
  const freeFrac = inst.freeMemGb !== null ? inst.freeMemGb / cur.memGib : null;
  const maxConn = maxConnections(cur.memGib);

  if (/^(oracle|sqlserver)/.test(base.engine)) add("pricing-approx", "info", `${inst.id}: ${base.engine} is licence-included and priced far above this table; read the savings as a rough proportion and edit the prices.`);
  if (freeFrac === null) add("no-memory-data", "info", `${inst.id}: no freeable_mem_gb_min, so memory headroom was not checked and no smaller class is recommended.`);
  else if (inst.freeMemGb > cur.memGib) add("memory-data-odd", "info", `${inst.id}: freeable memory ${inst.freeMemGb} GiB is above the class's ${cur.memGib} GiB; check the unit (GiB, not bytes) and that the class is right.`);

  // pressure on the CURRENT class
  const pressure = [];
  if (inst.cpuP95 >= o.cpuSaturated * 100) { pressure.push("cpu"); add("cpu-saturated", "error", `${inst.id}: p95 CPU ${pct(inst.cpuP95)} on ${cur.vcpu} vCPU; the instance is saturated.`); }
  else if (inst.cpuP95 >= o.cpuHigh * 100) { pressure.push("cpu"); add("cpu-high", "warn", `${inst.id}: p95 CPU ${pct(inst.cpuP95)} on ${cur.vcpu} vCPU leaves little room for a spike.`); }
  if (freeFrac !== null) {
    if (freeFrac < o.memReserve / 2) { pressure.push("memory"); add("memory-pressure", "error", `${inst.id}: freeable memory fell to ${inst.freeMemGb} GiB of ${cur.memGib} GiB (${pct(freeFrac * 100)}); swapping or an out-of-memory restart is likely.`); }
    else if (freeFrac < o.memReserve) { pressure.push("memory"); add("memory-low", "warn", `${inst.id}: freeable memory fell to ${inst.freeMemGb} GiB of ${cur.memGib} GiB (${pct(freeFrac * 100)}), under the ${pct(o.memReserve * 100)} reserve. (Engines use free memory as cache, so confirm with swap usage.)`); }
  }
  if (inst.connP95 !== null && inst.connP95 > o.connLimit * maxConn) { pressure.push("connections"); add("connections-near-max", "warn", `${inst.id}: p95 ${inst.connP95} connections against a default max_connections of about ${maxConn} on ${cur.memGib} GiB (${pct((inst.connP95 / maxConn) * 100)}). Consider a pooler such as RDS Proxy.`); }
  if (cur.baseline !== null && (inst.cpuAvg ?? inst.cpuP95) > cur.baseline * 100) { pressure.push("burst-credits"); add("burstable-credit-risk", "warn", `${inst.id}: average CPU ${pct(inst.cpuAvg ?? inst.cpuP95)} is above the ${pct(cur.baseline * 100)} credit baseline of ${inst.cls}, so it spends CPU credits and throttles when they run out. Use a non-burstable class or a larger size.`); }

  const lad = ladder(table, cur.family);
  const at = lad.findIndex((c) => c.name === inst.cls);
  let sized = null; // the same-family class we recommend, if different
  let verdict = "right-sized";
  if (pressure.length) {
    verdict = "under-provisioned";
    const bigger = lad.slice(at + 1).filter((c) => c.price > cur.price);
    sized = bigger.find((c) => misfits(inst, cur, c, o).length === 0) || null;
    if (!sized) {
      sized = bigger[bigger.length - 1] || null;
      add("no-larger-fit", "warn", `${inst.id}: no larger ${cur.family} class clears the headroom targets${sized ? `; ${sized.name} is the largest in the table` : ""}. Move to a larger family or add read replicas.`);
    }
  } else if (freeFrac !== null) {
    const smaller = lad.slice(0, at).filter((c) => c.price < cur.price);
    sized = smaller.find((c) => misfits(inst, cur, c, o).length === 0) || null;
    if (sized) {
      verdict = "over-provisioned";
      add("over-provisioned", "warn", `${inst.id}: p95 CPU ${pct(inst.cpuP95)} and peak memory use ${Math.round((cur.memGib - inst.freeMemGb) * 10) / 10} GiB of ${cur.memGib} GiB fit on ${sized.name} (${sized.vcpu} vCPU, ${sized.memGib} GiB) at about ${pct(inst.cpuP95 * (cur.vcpu / sized.vcpu))} p95 CPU.`);
    } else if (at > 0) {
      const next = smaller[smaller.length - 1];
      if (next && !misfits(inst, cur, next, o).includes("cpu") && misfits(inst, cur, next, o).length) add("memory-bound", "info", `${inst.id}: CPU would fit ${next.name} but ${misfits(inst, cur, next, o).join(" and ")} would not, so it stays on ${inst.cls}. A memory-optimised (r) family may be cheaper if CPU is the surplus.`);
    }
  }

  // Graviton at the recommended size
  const sizeCls = sized ? sized.name : inst.cls;
  const sizeRow = sized || { ...cur, name: inst.cls };
  let graviton = null;
  const gFam = GRAVITON_OF[cur.family];
  if (gFam && GRAVITON_ENGINES.test(base.engine)) {
    const g = table.get(`db.${gFam}.${sizeRow.size}`);
    if (g && g.vcpu === sizeRow.vcpu && g.memGib === sizeRow.memGib) {
      graviton = g;
      const gMonthly = monthly(g.price, azFactor, count, hours);
      const was = monthly(sizeRow.price, azFactor, count, hours);
      add("graviton-available", "info", `${inst.id}: ${sizeCls} has a Graviton equivalent, db.${gFam}.${sizeRow.size}, listed ${fmtUsd(was - gMonthly)}/month cheaper at the same size. Check the engine version supports Graviton and test, since it is a different CPU architecture.`);
    }
  }
  const finalRow = graviton ? { ...graviton, name: `db.${gFam}.${sizeRow.size}` } : sizeRow;
  const finalCls = finalRow.name;
  const after = monthly(finalRow.price, azFactor, count, hours);
  const changes = finalCls !== inst.cls;
  if (azFactor === 2) add("multi-az-priced", "info", `${inst.id}: Multi-AZ keeps a standby, so the instance is billed twice; the figures above include both.`);
  return {
    ...base, verdict, target: sized ? sized.name : null, finalCls: changes ? finalCls : null, graviton: graviton ? `db.${gFam}.${sizeRow.size}` : null,
    vcpu: cur.vcpu, memGib: cur.memGib, price: cur.price, maxConnections: maxConn,
    monthlyNow: now, monthlyAfter: changes ? after : now, savings: changes ? now - after : 0,
    command: changes ? modifyCommand(inst.id, finalCls, o.applyImmediately) : null,
  };
}

export function fmtUsd(n) {
  const r = Math.round(n);
  return `${r < 0 ? "-" : ""}$${Math.abs(r).toLocaleString("en-US")}`;
}

export function analyze(parsed, opts = {}) {
  const o = { ...DEFAULTS, applyImmediately: false, ...opts };
  const { table, issues: priceIssues } = buildTable(opts.prices);
  const notes = [...priceIssues, ...(parsed.issues || [])];
  const instances = (parsed.instances || []).map((i) => analyzeOne(i, o, table));
  const findings = instances.flatMap((i) => i.findings);
  const analysed = instances.filter((i) => i.monthlyNow > 0);
  const totals = {
    nowMonthly: analysed.reduce((s, i) => s + i.monthlyNow, 0),
    afterMonthly: analysed.reduce((s, i) => s + i.monthlyAfter, 0),
    savings: analysed.reduce((s, i) => s + Math.max(0, i.savings), 0),
    added: analysed.reduce((s, i) => s + Math.max(0, -i.savings), 0),
  };
  if (analysed.some((i) => /^aurora/.test(i.engine))) notes.push("Aurora: list one row per instance (writer and each reader); the Multi-AZ column is ignored because Aurora readers are separate instances, and Aurora prices differ slightly from the table.");
  notes.push("Metrics must be sampled over a representative period (a full business cycle, including peaks and batch jobs). Freeable memory is a minimum over that period; engines use free memory as cache, so a low value is a prompt to check swap, not proof of trouble.");
  return { count: instances.length, analysed: analysed.length, instances, findings, notes, totals, options: o };
}

export function summarize(report) {
  const errors = report.findings.filter((f) => f.severity === "error").length;
  const warns = report.findings.filter((f) => f.severity === "warn").length;
  const infos = report.findings.filter((f) => f.severity === "info").length;
  if (!report.count || !report.analysed) return { status: "none", errors, warns, infos, text: report.count ? "Nothing could be analysed: each instance needs a class in the price table and CloudWatch numbers (cpu_p95 at least)." : "No instances found. Paste CSV rows (db_identifier,engine,instance_class,multi_az,storage_gb,cpu_avg,cpu_p95,freeable_mem_gb_min,connections_p95) and/or describe-db-instances JSON." };
  const over = report.instances.filter((i) => i.verdict === "over-provisioned").length;
  const under = report.instances.filter((i) => i.verdict === "under-provisioned").length;
  const status = errors ? "error" : warns ? "warn" : "ok";
  const parts = [`${report.analysed} instance${report.analysed === 1 ? "" : "s"} analysed: ${over} over-provisioned, ${under} under-provisioned, ${report.analysed - over - under} right-sized.`];
  if (report.totals.savings > 0) parts.push(`Estimated saving ${fmtUsd(report.totals.savings)}/month of ${fmtUsd(report.totals.nowMonthly)} (list prices, approximate).`);
  if (report.totals.added > 0) parts.push(`Fixing under-provisioned instances adds about ${fmtUsd(report.totals.added)}/month.`);
  return { status, errors, warns, infos, text: parts.join(" ") };
}

export const INPUT_NOTES = [
  { what: "CSV rows", detail: "db_identifier,engine,instance_class,multi_az,storage_gb,cpu_avg,cpu_p95,freeable_mem_gb_min,connections_p95[,count]. CPU in percent, memory in GiB. A header row is optional and may name a subset of columns." },
  { what: "aws rds describe-db-instances --output json", detail: "Supplies engine, class, Multi-AZ and storage per instance. Add a CSV with the same db_identifier and the metrics columns to give it CloudWatch numbers." },
  { what: "cpu_p95 / cpu_avg", detail: "CPUUtilization percent over a representative period. The p95 sizes the instance; for t-class (burstable) the average must stay under the credit baseline." },
  { what: "freeable_mem_gb_min", detail: "Minimum FreeableMemory over the period, in GiB. Peak use is class memory minus this; a smaller class must keep a 20% reserve." },
  { what: "connections_p95", detail: "DatabaseConnections p95, checked against the default max_connections of the candidate class (memory / 9531392)." },
  { what: "count", detail: "Optional: identical instances on one row (default 1). Aurora readers are separate rows or a count." },
];
