// Zero-dependency, deterministic Kubernetes requests right-sizer. It reads what
// you paste -- `kubectl top pod --containers` output, `kubectl get pods -o json`,
// or a simple CSV -- and answers one question per container: are the CPU and
// memory REQUESTS far above (or below) what the container actually uses, what
// would a request of "usage p95 + headroom" be, and what is the difference worth
// at list prices you can edit?
// Pure string in, report out -- no filesystem or network here.
//
// Honest limits, stated once: `kubectl top` is ONE sample, not a p95, and a
// request must cover the busiest hour of the busiest week, so a snapshot can
// under-state it. The dollar figures are requests x list prices, not a bill.

// ILLUSTRATIVE and dated; every cloud prices nodes differently. All overridable.
export const PRICES_AS_OF = "illustrative on-demand list-price ballpark (about 2025, general-purpose nodes); not any cloud's bill. Edit the two prices to match your nodes";
export const DEFAULT_PRICES = { cpuPerVcpuHour: 0.031, memPerGibHour: 0.004 };
export const DEFAULTS = {
  cpuHeadroom: 0.2, memHeadroom: 0.25, hoursPerMonth: 730,
  tolerance: 0.15, // a change smaller than this either way is "keep"
  warnBelowUse: 0.5, // usage under half the request is a warning, not a note
  memNearAbove: 0.85, // usage above this share of the request/limit is an out-of-memory risk
  cpuNearAbove: 0.85,
};
const MIB = 1024 * 1024;
const GIB = 1024 * MIB;
const MIN_CPU = 0.01;
const MIN_MEM = 16 * MIB;

const MEM_UNITS = { "": 1, k: 1e3, K: 1e3, M: 1e6, G: 1e9, T: 1e12, P: 1e15, Ki: 1024, Mi: MIB, Gi: GIB, Ti: 1024 * GIB, Pi: 1024 * 1024 * GIB };

/** CPU quantity ("250m", "0.5", "2", "1200000n", "500u") -> cores, or null. */
export function parseCpu(value) {
  if (value === null || value === undefined) return null;
  const m = /^\s*([\d.]+)\s*(n|u|m)?\s*$/.exec(String(value));
  if (!m || !Number.isFinite(Number(m[1]))) return null;
  const n = Number(m[1]);
  return m[2] === "m" ? n / 1e3 : m[2] === "u" ? n / 1e6 : m[2] === "n" ? n / 1e9 : n;
}

/** Memory quantity ("256Mi", "1Gi", "512M", bytes) -> bytes, or null. `bare` is what a unitless number means. */
export function parseMem(value, bare = 1) {
  if (value === null || value === undefined) return null;
  const m = /^\s*([\d.]+)\s*([KMGTP]i?|)\s*$/.exec(String(value));
  if (!m || !Number.isFinite(Number(m[1]))) return null;
  return Number(m[1]) * (m[2] === "" ? bare : MEM_UNITS[m[2]]);
}

export function fmtCpu(cores) {
  const m = Math.round(cores * 1000);
  return m >= 1000 && m % 1000 === 0 ? String(m / 1000) : `${m}m`;
}
export function fmtMem(bytes) {
  const mi = Math.max(1, Math.ceil(bytes / MIB - 1e-9));
  return mi >= 1024 && mi % 1024 === 0 ? `${mi / 1024}Gi` : `${mi}Mi`;
}
const fmtUsd = (n) => `${n < 0 ? "-" : ""}$${Math.abs(n).toFixed(Math.abs(n) >= 100 ? 0 : 2)}`;

/** Pulls every top-level `{...}` JSON document that starts a line out of mixed pasted text. */
function extractJson(text) {
  const docs = [];
  let rest = "";
  let bad = 0;
  let i = 0;
  const re = /^[ \t]*\{/gm;
  let m;
  while ((m = re.exec(text))) {
    const start = m.index + m[0].length - 1;
    if (start < i) continue;
    let depth = 0; let inStr = false; let esc = false; let end = -1;
    for (let k = start; k < text.length; k += 1) {
      const c = text[k];
      if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; }
      if (c === '"') inStr = true;
      else if (c === "{") depth += 1;
      else if (c === "}") { depth -= 1; if (depth === 0) { end = k; break; } }
    }
    if (end < 0) { bad += 1; continue; }
    try {
      docs.push(JSON.parse(text.slice(start, end + 1)));
      rest += text.slice(i, m.index) + "\n";
      i = end + 1;
      re.lastIndex = i;
    } catch { bad += 1; }
  }
  rest += text.slice(i);
  return { docs, rest, bad };
}

function ownerWorkload(pod) {
  const owner = (pod.metadata?.ownerReferences || [])[0];
  const name = pod.metadata?.name || "";
  if (owner?.kind === "ReplicaSet") return owner.name.replace(/-[a-z0-9]{5,10}$/, "");
  if (owner?.name) return owner.name;
  return guessWorkload(name);
}
/** Deployment pods are `<name>-<rs hash>-<5 chars>`, StatefulSet pods `<name>-<ordinal>`. */
function guessWorkload(pod) {
  return pod.replace(/-[a-z0-9]{6,10}-[a-z0-9]{5}$/, "").replace(/-\d+$/, "");
}

function podsFromJson(docs) {
  const out = [];
  const pods = [];
  for (const d of docs) {
    if (Array.isArray(d?.items)) pods.push(...d.items);
    else if (d?.spec?.containers) pods.push(d);
  }
  for (const p of pods) {
    const phase = p.status?.phase;
    if (phase === "Succeeded" || phase === "Failed") continue;
    for (const c of p.spec?.containers || []) {
      const r = c.resources || {};
      out.push({
        ns: p.metadata?.namespace || "default", pod: p.metadata?.name || "", workload: ownerWorkload(p), container: c.name,
        cpuReq: parseCpu(r.requests?.cpu), memReq: parseMem(r.requests?.memory), cpuLim: parseCpu(r.limits?.cpu), memLim: parseMem(r.limits?.memory),
        cpuUse: null, memUse: null,
      });
    }
  }
  return out;
}

const CPU_TOK = /^\d+(\.\d+)?(m|n|u)?$/;
const MEM_TOK = /^\d+(\.\d+)?([KMGTP]i?)?$/;

function topRows(text) {
  const rows = [];
  let skipped = 0;
  let hasNs = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.includes(",")) continue;
    const t = line.split(/\s+/);
    if (/^(NAMESPACE|POD)$/i.test(t[0]) && /CPU/i.test(line)) { hasNs = /^NAMESPACE$/i.test(t[0]); continue; }
    const ns = t.length === 5 && (hasNs !== false);
    const body = ns ? t.slice(1) : t;
    if ((t.length !== 4 && t.length !== 5) || !CPU_TOK.test(body[2]) || !MEM_TOK.test(body[3])) { if (/^\S+\s+\S+\s+\d/.test(line)) skipped += 1; continue; }
    rows.push({ ns: ns ? t[0] : "", pod: body[0], container: body[1], cpuUse: parseCpu(body[2]), memUse: parseMem(body[3]) });
  }
  return { rows, skipped };
}

const CSV_COLS = ["namespace", "pod", "container", "cpu_request", "mem_request", "cpu_usage_p95", "mem_usage_p95", "replicas", "cpu_limit", "mem_limit"];
const CSV_ALIAS = { memory_request: "mem_request", mem_req: "mem_request", cpu_req: "cpu_request", memory_usage_p95: "mem_usage_p95", cpu_use_p95: "cpu_usage_p95", memory_limit: "mem_limit", workload: "pod" };

function csvRows(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.includes(","));
  const rows = [];
  let skipped = 0;
  let cols = CSV_COLS;
  lines.forEach((line, idx) => {
    const cells = line.split(",").map((c) => c.trim());
    if (idx === 0 && /namespace|container/i.test(cells.join(" ")) && !/\d/.test(cells[0])) {
      cols = cells.map((c) => { const k = c.toLowerCase().replace(/[\s-]+/g, "_"); return CSV_ALIAS[k] || k; });
      return;
    }
    const get = (k) => { const i = cols.indexOf(k); const v = i >= 0 ? cells[i] : ""; return v === undefined || v === "" ? null : v; };
    const container = get("container");
    const cpuUse = parseCpu(get("cpu_usage_p95"));
    const memUse = parseMem(get("mem_usage_p95"), MIB);
    if (!container || cpuUse === null || memUse === null) { skipped += 1; return; }
    const reps = Number(get("replicas") ?? 1);
    rows.push({
      ns: get("namespace") || "default", pod: get("pod") || container, workload: get("pod") || container, container,
      cpuReq: parseCpu(get("cpu_request")), memReq: parseMem(get("mem_request"), MIB), cpuLim: parseCpu(get("cpu_limit")), memLim: parseMem(get("mem_limit"), MIB),
      cpuUse, memUse, replicas: Number.isFinite(reps) && reps >= 1 ? Math.round(reps) : 1, csv: true,
    });
  });
  return { rows, skipped };
}

/** Reads any mix of `kubectl top pod --containers`, `kubectl get pods -o json` and CSV rows. */
export function parseInput(text) {
  const src = String(text ?? "");
  const { docs, rest, bad } = extractJson(src);
  const csv = csvRows(rest);
  const top = topRows(rest);
  const pods = podsFromJson(docs);
  const byFull = new Map(pods.map((p) => [`${p.ns}/${p.pod}/${p.container}`, p]));
  const byName = new Map();
  for (const p of pods) if (!byName.has(`${p.pod}/${p.container}`)) byName.set(`${p.pod}/${p.container}`, p);
  const flat = [...pods];
  let topOnly = 0;
  for (const r of top.rows) {
    const hit = (r.ns ? byFull.get(`${r.ns}/${r.pod}/${r.container}`) : null) || byName.get(`${r.pod}/${r.container}`);
    if (hit) { hit.cpuUse = r.cpuUse; hit.memUse = r.memUse; continue; }
    topOnly += 1;
    flat.push({ ns: r.ns || "default", pod: r.pod, workload: guessWorkload(r.pod), container: r.container, cpuReq: null, memReq: null, cpuLim: null, memLim: null, cpuUse: r.cpuUse, memUse: r.memUse });
  }
  // One record per workload container: replicas are counted, the busiest replica's usage is kept.
  const groups = new Map();
  let noUsage = 0;
  for (const p of flat) {
    if (p.cpuUse === null || p.memUse === null) { noUsage += 1; continue; }
    const k = `${p.ns}/${p.workload}/${p.container}`;
    const g = groups.get(k);
    if (!g) groups.set(k, { ...p, replicas: 1 });
    else {
      g.replicas += 1; g.cpuUse = Math.max(g.cpuUse, p.cpuUse); g.memUse = Math.max(g.memUse, p.memUse);
      for (const f of ["cpuReq", "memReq", "cpuLim", "memLim"]) if (g[f] === null) g[f] = p[f];
    }
  }
  const records = [...groups.values(), ...csv.rows];
  return {
    records, skipped: csv.skipped + top.skipped + bad, noUsage,
    sources: { json: pods.length > 0, top: top.rows.length > 0, csv: csv.rows.length > 0 },
    snapshot: top.rows.length > 0 && records.some((r) => !r.csv),
    topOnly,
  };
}

const ceilTo = (v, step) => Math.ceil(v / step - 1e-9) * step;

function decide(req, use, headroom, step, min, tol, forceGrow = false) {
  const rec = Math.max(min, ceilTo(use * (1 + headroom), step));
  if (req === null) return { rec, want: rec, action: "set" };
  if (rec < req * (1 - tol)) return { rec, want: rec, action: "shrink" };
  if (rec > req * (1 + tol) || (forceGrow && rec > req)) return { rec, want: rec, action: "grow" };
  return { rec: req, want: rec, action: "keep" };
}

const cost = (cpu, mem, prices, hours) => ((cpu || 0) * prices.cpuPerVcpuHour + ((mem || 0) / GIB) * prices.memPerGibHour) * hours;

export function analyze(parsed, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const prices = { ...DEFAULT_PRICES, ...(opts.prices || {}) };
  const recs = parsed.records || [];
  if (!recs.length) return { count: 0, findings: [], containers: [], patches: [], skipped: parsed.skipped || 0, noUsage: parsed.noUsage || 0 };
  const findings = [];
  const containers = recs.map((r) => {
    const cpu = decide(r.cpuReq, r.cpuUse, o.cpuHeadroom, 0.01, MIN_CPU, o.tolerance);
    // Near the request or limit, any headroom shortfall is a risk, so the tolerance band does not apply.
    const memNear = (r.memReq !== null && r.memUse / r.memReq >= o.memNearAbove) || (r.memLim !== null && r.memLim > 0 && r.memUse / r.memLim >= o.memNearAbove);
    const mem = decide(r.memReq, r.memUse, o.memHeadroom, 8 * MIB, MIN_MEM, o.tolerance, memNear);
    const reps = r.replicas || 1;
    const nowMonthly = r.cpuReq === null && r.memReq === null ? null : reps * cost(r.cpuReq, r.memReq, prices, o.hoursPerMonth);
    const recMonthly = reps * cost(cpu.rec, mem.rec, prices, o.hoursPerMonth);
    // Savings only counts resources that have a request to compare against.
    const delta = reps * ((r.cpuReq === null ? 0 : (r.cpuReq - cpu.rec) * prices.cpuPerVcpuHour) + (r.memReq === null ? 0 : ((r.memReq - mem.rec) / GIB) * prices.memPerGibHour)) * o.hoursPerMonth;
    const c = { ns: r.ns, workload: r.workload, container: r.container, replicas: reps, ...r, cpu, mem, nowMonthly, recMonthly, savings: delta };
    const id = `${r.ns}/${r.workload}/${r.container}`;
    const add = (rule, severity, message) => findings.push({ rule, severity, ns: r.ns, workload: r.workload, container: r.container, message: `${id}: ${message}` });
    const pct = (v) => `${(v * 100).toFixed(0)}%`;
    if (r.cpuReq === null || r.memReq === null) add("no-requests", "warn", `no ${[r.cpuReq === null ? "cpu" : "", r.memReq === null ? "memory" : ""].filter(Boolean).join(" or ")} request is set, so the scheduler counts it as zero and the pod is first in line for eviction under node pressure. A starting request is ${fmtCpu(cpu.rec)} cpu / ${fmtMem(mem.rec)} memory`);
    if (r.memLim !== null && r.memLim > 0 && r.memUse / r.memLim >= o.memNearAbove) add("oom-risk", "error", `memory ${fmtMem(r.memUse)} is ${pct(r.memUse / r.memLim)} of the ${fmtMem(r.memLim)} limit; crossing the limit gets the container OOMKilled. Raise the limit before shrinking anything`);
    else if (r.memLim === null && r.memReq !== null && r.memUse / r.memReq >= o.memNearAbove) add("memory-near-request", "warn", `memory ${fmtMem(r.memUse)} is ${pct(r.memUse / r.memReq)} of the ${fmtMem(r.memReq)} request and there is no limit; it is first to be evicted when a node runs short, and a node can OOM-kill it`);
    if (r.cpuLim !== null && r.cpuLim > 0 && r.cpuUse / r.cpuLim >= o.cpuNearAbove) add("cpu-throttle-risk", "warn", `cpu ${fmtCpu(r.cpuUse)} is ${pct(r.cpuUse / r.cpuLim)} of the ${fmtCpu(r.cpuLim)} limit; the container is throttled at the limit, which shows up as latency`);
    if (cpu.action === "shrink") add("cpu-overprovisioned", r.cpuUse / r.cpuReq < o.warnBelowUse ? "warn" : "info", `cpu request ${fmtCpu(r.cpuReq)} against usage ${fmtCpu(r.cpuUse)} (${pct(r.cpuUse / r.cpuReq)}); ${fmtCpu(cpu.rec)} keeps ${pct(o.cpuHeadroom)} headroom`);
    if (cpu.action === "grow") add("cpu-underprovisioned", "info", `cpu usage ${fmtCpu(r.cpuUse)} is above what a ${fmtCpu(r.cpuReq)} request plus ${pct(o.cpuHeadroom)} headroom covers; ${fmtCpu(cpu.rec)} keeps the pod from relying on spare node CPU`);
    if (mem.action === "shrink") add("memory-overprovisioned", r.memUse / r.memReq < o.warnBelowUse ? "warn" : "info", `memory request ${fmtMem(r.memReq)} against usage ${fmtMem(r.memUse)} (${pct(r.memUse / r.memReq)}); ${fmtMem(mem.rec)} keeps ${pct(o.memHeadroom)} headroom`);
    return c;
  });

  const patches = buildPatches(containers);
  const sum = (f) => containers.reduce((a, c) => a + f(c), 0);
  const totals = {
    nowMonthly: sum((c) => c.nowMonthly || 0),
    savings: sum((c) => (c.savings > 0 ? c.savings : 0)),
    addedCost: sum((c) => (c.savings < 0 ? -c.savings : 0)),
  };
  totals.net = totals.savings - totals.addedCost;
  containers.sort((a, b) => b.savings - a.savings || a.ns.localeCompare(b.ns) || a.workload.localeCompare(b.workload));
  const notes = [];
  if (parsed.snapshot) notes.push("Usage from `kubectl top` is a single sample, not a p95. Sample over a representative period (including your busiest hour) and use the CSV form with p95 values before changing requests.");
  if (parsed.noUsage) notes.push(`${parsed.noUsage} container(s) in the pods JSON had no matching \`kubectl top\` row and were skipped.`);
  if (parsed.topOnly) notes.push(`${parsed.topOnly} container(s) in the \`kubectl top\` output were not in the pods JSON, so their requests are unknown.`);
  return { count: containers.length, skipped: parsed.skipped || 0, noUsage: parsed.noUsage || 0, options: o, prices, containers, totals, findings, patches, notes };
}

function buildPatches(containers) {
  const groups = new Map();
  for (const c of containers) {
    const reqs = [];
    if (c.cpu.action !== "keep") reqs.push(`cpu: ${fmtCpu(c.cpu.rec)}`);
    if (c.mem.action !== "keep") reqs.push(`memory: ${fmtMem(c.mem.rec)}`);
    const lims = [];
    if (c.memLim !== null && c.mem.want > c.memLim && c.mem.action !== "shrink") lims.push(`memory: ${fmtMem(c.mem.want)}`);
    if (c.cpuLim !== null && c.cpu.want > c.cpuLim && c.cpu.action !== "shrink") lims.push(`cpu: ${fmtCpu(c.cpu.rec)}`);
    if (!reqs.length && !lims.length) continue;
    const k = `${c.ns}/${c.workload}`;
    if (!groups.has(k)) groups.set(k, { ns: c.ns, workload: c.workload, items: [] });
    // A request above an existing limit is rejected by the API server, so the limit moves with it.
    groups.get(k).items.push({ name: c.container, reqs, lims, from: c });
  }
  return [...groups.values()].map((g) => {
    const lines = [`# ${g.ns}/${g.workload}: edit the owning Deployment / StatefulSet (not the pod); review before applying`, "spec:", "  template:", "    spec:", "      containers:"];
    for (const it of g.items) {
      lines.push(`        - name: ${it.name}`, "          resources:");
      if (it.reqs.length) lines.push("            requests:", ...it.reqs.map((r) => `              ${r}`));
      if (it.lims.length) lines.push("            limits:", ...it.lims.map((r) => `              ${r}`));
    }
    return { ns: g.ns, workload: g.workload, yaml: lines.join("\n") };
  });
}

export function summarize(report) {
  if (!report.count) return { status: "none", errors: 0, warns: 0, infos: 0, text: "No containers with usage recognised. Paste `kubectl top pod --containers -A` output together with `kubectl get pods -A -o json`, or CSV rows: namespace,pod,container,cpu_request,mem_request,cpu_usage_p95,mem_usage_p95,replicas" };
  const n = (s) => report.findings.filter((f) => f.severity === s).length;
  const errors = n("error"); const warns = n("warn"); const infos = n("info");
  const status = errors ? "error" : warns ? "warn" : "ok";
  const t = report.totals;
  const text = `${report.count} container(s). Requests cost about ${fmtUsd(t.nowMonthly)}/month at the prices shown; resizing to usage + headroom would save about ${fmtUsd(t.savings)}/month` +
    (t.addedCost > 0 ? ` and add ${fmtUsd(t.addedCost)}/month where requests are too low (net ${fmtUsd(t.net)})` : "") +
    `. ${errors} error(s), ${warns} warning(s), ${infos} note(s).`;
  return { status, errors, warns, infos, text };
}

export const INPUT_NOTES = [
  { what: "kubectl top pod --containers -A", detail: "per-container CPU(cores) and MEMORY(bytes); one sample, so treat it as a snapshot. Without -A there is no namespace column and rows are matched by pod name" },
  { what: "kubectl get pods -A -o json", detail: "supplies requests and limits per container (init containers ignored; finished pods skipped); replicas are counted from the owning workload" },
  { what: "CSV: namespace,pod,container,cpu_request,mem_request,cpu_usage_p95,mem_usage_p95,replicas", detail: "use this for real p95 values. cpu is 250m or 0.25; memory is 256Mi / 1Gi, and a bare number means MiB. Optional extra columns cpu_limit and mem_limit" },
  { what: "Mix and match", detail: "the box accepts the three forms together; unrecognised lines are ignored" },
];
export { fmtUsd };
