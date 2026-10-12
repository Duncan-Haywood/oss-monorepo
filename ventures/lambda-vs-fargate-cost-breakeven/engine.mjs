// Shared engine: compare the monthly cost of running one HTTP-style workload on AWS Lambda,
// Google Cloud Run (request-billed), AWS Fargate and EC2, and find the request volume at which
// always-on capacity becomes cheaper than pay-per-request. Pure arithmetic over list prices the
// caller can edit; no network, no cloud account.

export const PRICES_AS_OF = "List prices as of October 2026 (US regions, on-demand, x86); edit them to match your bill";

export const HOURS_PER_MONTH = 730;
export const SECONDS_PER_MONTH = HOURS_PER_MONTH * 3600;

export const DEFAULT_PRICES = {
  lambdaPerMReq: 0.2,
  lambdaPerGibSec: 0.0000166667,
  cloudRunPerMReq: 0.4,
  cloudRunPerVcpuSec: 0.000024,
  cloudRunPerGibSec: 0.0000025,
  fargatePerVcpuHour: 0.04048,
  fargatePerGibHour: 0.004445,
  ec2PerVcpuHour: 0.048, // general-purpose, ~4 GiB per vCPU (m6i.large = $0.096 / 2 vCPU)
};

export const DEFAULTS = {
  requestsPerMonth: 10_000_000,
  durationMs: 120,
  memoryGib: 0.5,
  vcpu: 0.25,
  concurrency: 10, // requests one container/task handles at once (Lambda is always 1)
  peakRatio: 4, // peak concurrent load / average concurrent load
  minTasks: 2, // always-on floor for availability (Fargate / EC2)
  ec2Utilisation: 0.7, // share of an EC2 node's vCPU you can actually pack
};

const GIB_PER_VCPU_EC2 = 4;

function num(v, d) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : d;
}

export function normalise(input = {}, prices = {}) {
  const w = {
    requestsPerMonth: num(input.requestsPerMonth, DEFAULTS.requestsPerMonth),
    durationMs: num(input.durationMs, DEFAULTS.durationMs),
    memoryGib: num(input.memoryGib, DEFAULTS.memoryGib),
    vcpu: num(input.vcpu, DEFAULTS.vcpu),
    concurrency: Math.max(1, num(input.concurrency, DEFAULTS.concurrency)),
    peakRatio: Math.max(1, num(input.peakRatio, DEFAULTS.peakRatio)),
    minTasks: Math.max(0, Math.floor(num(input.minTasks, DEFAULTS.minTasks))),
    ec2Utilisation: Math.min(1, Math.max(0.1, num(input.ec2Utilisation, DEFAULTS.ec2Utilisation))),
  };
  const p = { ...DEFAULT_PRICES };
  for (const k of Object.keys(DEFAULT_PRICES)) if (prices[k] !== undefined) p[k] = num(prices[k], DEFAULT_PRICES[k]);
  return { w, p };
}

export function avgConcurrency(w) {
  return (w.requestsPerMonth * (w.durationMs / 1000)) / SECONDS_PER_MONTH;
}

export function lambdaCost(w, p) {
  const sec = w.durationMs / 1000;
  const requests = (w.requestsPerMonth / 1e6) * p.lambdaPerMReq;
  const compute = w.requestsPerMonth * sec * w.memoryGib * p.lambdaPerGibSec;
  return { requests, compute, total: requests + compute };
}

export function cloudRunCost(w, p) {
  // Request-based billing: instance time is billed while requests are in flight, shared across
  // `concurrency` simultaneous requests.
  const billedSec = (w.requestsPerMonth * (w.durationMs / 1000)) / w.concurrency;
  const requests = (w.requestsPerMonth / 1e6) * p.cloudRunPerMReq;
  const compute = billedSec * (w.vcpu * p.cloudRunPerVcpuSec + w.memoryGib * p.cloudRunPerGibSec);
  return { requests, compute, total: requests + compute };
}

export function tasksNeeded(w) {
  if (w.requestsPerMonth === 0) return w.minTasks;
  const peak = avgConcurrency(w) * w.peakRatio;
  return Math.max(w.minTasks, Math.ceil(peak / w.concurrency));
}

export function fargateCost(w, p) {
  const tasks = tasksNeeded(w);
  const total = tasks * HOURS_PER_MONTH * (w.vcpu * p.fargatePerVcpuHour + w.memoryGib * p.fargatePerGibHour);
  return { tasks, total };
}

export function ec2Cost(w, p) {
  const tasks = tasksNeeded(w);
  const vcpuPerTask = Math.max(w.vcpu, w.memoryGib / GIB_PER_VCPU_EC2);
  const nodeVcpu = (tasks * vcpuPerTask) / w.ec2Utilisation;
  const total = nodeVcpu * HOURS_PER_MONTH * p.ec2PerVcpuHour;
  return { tasks, nodeVcpu, total };
}

export const PLATFORMS = ["lambda", "cloud-run", "fargate", "ec2"];

export function compare(input = {}, prices = {}) {
  const { w, p } = normalise(input, prices);
  const results = {
    lambda: lambdaCost(w, p),
    "cloud-run": cloudRunCost(w, p),
    fargate: fargateCost(w, p),
    ec2: ec2Cost(w, p),
  };
  const ranked = PLATFORMS.map((name) => ({ name, total: results[name].total })).sort((a, b) => a.total - b.total);
  const cheapest = ranked[0];
  const second = ranked[1];
  return {
    workload: w,
    prices: p,
    avgConcurrency: avgConcurrency(w),
    peakConcurrency: avgConcurrency(w) * w.peakRatio,
    results,
    ranked,
    cheapest: cheapest.name,
    margin: second.total > 0 ? 1 - cheapest.total / second.total : 0,
  };
}

// Request volume at which `a` stops being cheaper than `b`. Costs are monotone-ish in volume
// (stepwise for task counts), so scan geometrically then bisect on the last crossing.
export function breakEven(input = {}, prices = {}, a = "lambda", b = "fargate") {
  const cost = (r) => compare({ ...input, requestsPerMonth: r }, prices).results[a].total - compare({ ...input, requestsPerMonth: r }, prices).results[b].total;
  const lo0 = 1000;
  const hi0 = 1e11;
  const start = cost(lo0);
  if (start >= 0) return { volume: null, note: `${b} is already cheaper than ${a} at ${lo0.toLocaleString("en-US")} requests/month.` };
  let prev = lo0;
  for (let r = lo0 * 1.25; r <= hi0; r *= 1.25) {
    if (cost(r) >= 0) {
      let lo = prev;
      let hi = r;
      for (let i = 0; i < 60; i += 1) {
        const mid = (lo + hi) / 2;
        if (cost(mid) < 0) lo = mid; else hi = mid;
      }
      return { volume: Math.round((lo + hi) / 2), note: null };
    }
    prev = r;
  }
  return { volume: null, note: `${a} stays cheaper than ${b} up to ${hi0.toLocaleString("en-US")} requests/month.` };
}

export function sensitivity(input = {}, prices = {}, multipliers = [0.1, 0.25, 0.5, 1, 2, 5, 10]) {
  const { w } = normalise(input, prices);
  return multipliers.map((m) => {
    const r = compare({ ...input, requestsPerMonth: Math.round(w.requestsPerMonth * m) }, prices);
    return { multiplier: m, requestsPerMonth: r.workload.requestsPerMonth, cheapest: r.cheapest, totals: Object.fromEntries(r.ranked.map((x) => [x.name, x.total])) };
  });
}

export function findings(report) {
  const out = [];
  const w = report.workload;
  const lam = report.results.lambda.total;
  const fg = report.results.fargate.total;
  if (w.requestsPerMonth === 0) {
    out.push({ rule: "no-traffic", severity: "info", message: "Zero requests per month: pay-per-request platforms cost nothing; always-on capacity still bills for the floor." });
    return out;
  }
  if (report.cheapest === "lambda" || report.cheapest === "cloud-run") {
    out.push({ rule: "pay-per-request-wins", severity: "info", message: `${report.cheapest} is cheapest at this volume (${Math.round(report.margin * 100)}% below the next option). Always-on capacity bills for idle time you do not have enough traffic to fill.` });
  } else {
    out.push({ rule: "always-on-wins", severity: "warn", message: `${report.cheapest} is cheapest at this volume (${Math.round(report.margin * 100)}% below the next option). Pay-per-request pricing now costs more than capacity you keep warm.` });
  }
  if (lam > 2 * fg && fg > 0) {
    out.push({ rule: "lambda-over-2x-fargate", severity: "warn", message: `Lambda is ${(lam / fg).toFixed(1)}x the Fargate estimate. Check cold-start and latency needs before moving; the saving is real only if one task pool can absorb your peak.` });
  }
  if (w.concurrency === 1) {
    out.push({ rule: "concurrency-one", severity: "info", message: "Concurrency 1 means every request needs its own slot. Most web frameworks handle 10-80 at once, which is what makes Cloud Run and container platforms cheap." });
  }
  if (w.peakRatio >= 8) {
    out.push({ rule: "spiky-traffic", severity: "info", message: `Peak is ${w.peakRatio}x average: always-on platforms must be sized for the peak, which favours pay-per-request.` });
  }
  return out;
}

export function summarize(report) {
  const f = report.ranked.map((r) => `${r.name} ${fmtUsd(r.total)}`).join(", ");
  return { status: report.workload.requestsPerMonth === 0 ? "none" : "ok", text: `Cheapest: ${report.cheapest} (${f} per month).` };
}

export function parseInput(text) {
  const out = {};
  const keys = {
    requests: "requestsPerMonth", "requests-per-month": "requestsPerMonth", requestspermonth: "requestsPerMonth",
    duration: "durationMs", "duration-ms": "durationMs", durationms: "durationMs",
    memory: "memoryGib", "memory-gib": "memoryGib", memorygib: "memoryGib",
    vcpu: "vcpu", concurrency: "concurrency", "peak-ratio": "peakRatio", peakratio: "peakRatio",
    "min-tasks": "minTasks", mintasks: "minTasks",
  };
  const trimmed = String(text || "").trim();
  if (trimmed.startsWith("{")) {
    try {
      const j = JSON.parse(trimmed);
      for (const [k, v] of Object.entries(j)) { const key = keys[k.toLowerCase()] || (k in DEFAULTS ? k : null); if (key) out[key] = Number(v); }
      return out;
    } catch { /* fall through to key: value lines */ }
  }
  for (const line of trimmed.split(/\r?\n/)) {
    const m = /^\s*([A-Za-z-]+)\s*[:=]\s*([0-9.,_]+)\s*(k|m|b)?\s*$/i.exec(line);
    if (!m) continue;
    const key = keys[m[1].toLowerCase()];
    if (!key) continue;
    let n = Number(m[2].replace(/[,_]/g, ""));
    const mult = { k: 1e3, m: 1e6, b: 1e9 }[(m[3] || "").toLowerCase()] || 1;
    out[key] = n * mult;
  }
  return out;
}

export const INPUT_NOTES = [
  { what: "requests: 20M", detail: "Monthly request volume. Suffixes k, M and B are understood." },
  { what: "duration-ms: 120", detail: "Average billed time per request, in milliseconds." },
  { what: "memory-gib / vcpu", detail: "Memory and vCPU of one Lambda environment or one container task." },
  { what: "concurrency: 10", detail: "Requests one container handles at once. Lambda always uses 1." },
  { what: "peak-ratio: 4", detail: "Peak concurrent load divided by average; always-on capacity is sized for the peak." },
  { what: "min-tasks: 2", detail: "Always-on floor for availability on Fargate and EC2." },
  { what: "JSON object", detail: "The same keys as a JSON object (camelCase also accepted)." },
];

export function fmtUsd(n) {
  if (!Number.isFinite(n)) return "n/a";
  if (n >= 100) return "$" + Math.round(n).toLocaleString("en-US");
  return "$" + n.toFixed(2);
}

export function fmtVolume(n) {
  if (!Number.isFinite(n)) return "n/a";
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(0) + "k";
  return String(Math.round(n));
}
