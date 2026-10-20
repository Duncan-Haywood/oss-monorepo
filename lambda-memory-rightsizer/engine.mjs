// Zero-dependency, deterministic reader of AWS Lambda CloudWatch `REPORT` log
// lines. It answers one question: given what these invocations actually used,
// what would they cost at other memory sizes, and which size is cheapest?
// Pure string in, report out -- no filesystem or network here.
//
// The memory/cost half is arithmetic on the lines you paste and prices you can
// override. The duration-at-another-size half is a MODEL, not a measurement:
// Lambda allocates CPU in proportion to memory (about one vCPU at 1,769 MB), so
// a CPU-bound function speeds up as memory rises and an I/O-bound one does not.
// `cpuBound` (0..1) is the share of the duration that scales; the report shows
// the answer at 0, your value and 1 so you can see how much the guess matters.
// Confirm any change with a real test (e.g. AWS Lambda Power Tuning).

// ILLUSTRATIVE and dated; AWS reprices and tiers by volume. All overridable.
export const PRICES_AS_OF = "2025 us-east-1 list prices (no free tier, no tiering); verify against the AWS Lambda pricing page";
export const DEFAULT_PRICES = {
  x86: { label: "x86_64", perGbSecond: 0.0000166667 },
  arm: { label: "arm64 (Graviton)", perGbSecond: 0.0000133334 },
  perMillionRequests: 0.2,
};
export const MEMORY_SIZES = [128, 256, 384, 512, 640, 768, 1024, 1280, 1536, 1769, 2048, 3008, 4096, 6144, 8192, 10240];
const FULL_VCPU_MB = 1769;
export const DEFAULTS = { cpuBound: 0.5, maxSlowdown: 1.25, headroom: 1.2, overprovisionedBelow: 0.5, nearLimitAbove: 0.9, errorAbove: 0.97 };

const num = (s) => (s === undefined ? null : Number(s.replace(/,/g, "")));

/** Extracts REPORT records from any text (raw CloudWatch export, `aws logs tail`, tab or space separated). */
export function parseReports(text) {
  const records = [];
  let skipped = 0;
  for (const line of String(text ?? "").split(/\r?\n/)) {
    if (!/REPORT\s+RequestId/.test(line)) continue;
    const g = (re) => { const m = re.exec(line); return m ? num(m[1]) : null; };
    const duration = g(/(?<!Billed )(?<!Init )(?<!Restore )Duration:\s*([\d.,]+)\s*ms/);
    const billed = g(/Billed Duration:\s*([\d.,]+)\s*ms/);
    const size = g(/Memory Size:\s*([\d,]+)\s*MB/);
    const used = g(/Max Memory Used:\s*([\d,]+)\s*MB/);
    if (duration === null || size === null || used === null) { skipped += 1; continue; }
    records.push({ duration, billed: billed ?? Math.ceil(duration), size, used, init: g(/Init Duration:\s*([\d.,]+)\s*ms/), restore: g(/Restore Duration:\s*([\d.,]+)\s*ms/) });
  }
  return { records, skipped };
}

const quantile = (sorted, q) => {
  if (!sorted.length) return 0;
  const i = (sorted.length - 1) * q; const lo = Math.floor(i); const hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
};

/** Effective CPU share at a memory size, capped at one full vCPU for a single-threaded function. */
const cpuShare = (mb) => Math.min(mb, FULL_VCPU_MB) / FULL_VCPU_MB;

/** Predicted billed duration (ms) at `mb`, given observed duration at `fromMb`. */
export function predictDuration(ms, fromMb, mb, cpuBound) {
  const f = Math.min(1, Math.max(0, cpuBound));
  return ms * ((1 - f) + f * (cpuShare(fromMb) / cpuShare(mb)));
}

const costPerInvocation = (billedMs, mb, perGbSecond) => (mb / 1024) * (billedMs / 1000) * perGbSecond;

function candidates(stats, { cpuBound, headroom }, price, perRequest) {
  const floorMb = stats.maxUsed * headroom;
  const sizes = [...new Set([...MEMORY_SIZES, stats.size])].sort((a, b) => a - b).filter((m) => m >= floorMb || m === stats.size);
  return sizes.map((mb) => {
    const p50 = Math.ceil(predictDuration(stats.p50Billed, stats.size, mb, cpuBound));
    const mean = Math.ceil(predictDuration(stats.meanBilled, stats.size, mb, cpuBound));
    const compute = costPerInvocation(mean, mb, price);
    return { mb, p50Ms: p50, meanMs: mean, costPerMillion: (compute + perRequest) * 1e6, computePerMillion: compute * 1e6 };
  });
}

export function analyze(parsed, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const prices = o.prices || DEFAULT_PRICES;
  const arch = o.arch === "arm" ? "arm" : "x86";
  const recs = parsed.records;
  if (!recs.length) return { count: 0, findings: [], skipped: parsed.skipped };
  // Dominant configured memory size; a mix means the function was reconfigured mid-sample.
  const bySize = new Map();
  for (const r of recs) bySize.set(r.size, (bySize.get(r.size) || 0) + 1);
  const size = [...bySize.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
  const used = recs.filter((r) => r.size === size);
  const billed = used.map((r) => r.billed).sort((a, b) => a - b);
  const durations = used.map((r) => r.duration).sort((a, b) => a - b);
  const cold = used.filter((r) => r.init !== null);
  const stats = {
    size, count: used.length, mixedSizes: bySize.size > 1,
    maxUsed: Math.max(...used.map((r) => r.used)), p50Used: quantile(used.map((r) => r.used).sort((a, b) => a - b), 0.5),
    p50Ms: quantile(durations, 0.5), p95Ms: quantile(durations, 0.95), p99Ms: quantile(durations, 0.99),
    p50Billed: quantile(billed, 0.5), meanBilled: billed.reduce((a, b) => a + b, 0) / billed.length,
    coldStarts: cold.length, coldShare: cold.length / used.length,
    meanInit: cold.length ? cold.reduce((a, r) => a + r.init, 0) / cold.length : 0,
  };
  const perRequest = (prices.perMillionRequests ?? 0.2) / 1e6;
  const price = (prices[arch] || prices.x86).perGbSecond;
  const invocations = o.invocations ?? 1e6;
  const scenarios = {};
  for (const [name, f] of [["ioBound", 0], ["yours", o.cpuBound], ["cpuBound", 1]]) {
    const rows = candidates(stats, { cpuBound: f, headroom: o.headroom }, price, perRequest);
    // Cheapest size whose predicted p50 stays within maxSlowdown x the current p50: a size that is
    // cheaper only because it is several times slower is not a recommendation.
    const now = rows.find((r) => r.mb === size);
    const allowed = rows.filter((r) => r.mb === size || r.p50Ms <= (now ? now.p50Ms : Infinity) * o.maxSlowdown);
    const best = allowed.reduce((a, b) => (b.costPerMillion < a.costPerMillion - 1e-9 ? b : a));
    scenarios[name] = { cpuBound: f, rows, best, allowed: allowed.map((r) => r.mb) };
  }
  const current = scenarios.yours.rows.find((r) => r.mb === size) || candidates({ ...stats, maxUsed: 0 }, { cpuBound: o.cpuBound, headroom: 0 }, price, perRequest).find((r) => r.mb === size);
  const best = scenarios.yours.best;
  const monthlyNow = (current.costPerMillion * invocations) / 1e6;
  const monthlyBest = (best.costPerMillion * invocations) / 1e6;
  const armPrice = prices.arm.perGbSecond;
  const armSaving = arch === "x86" ? (current.computePerMillion * (1 - armPrice / prices.x86.perGbSecond) * invocations) / 1e6 : 0;

  const findings = [];
  const ratio = stats.maxUsed / size;
  if (ratio >= o.errorAbove) findings.push({ rule: "out-of-memory-risk", severity: "error", message: `peak memory ${stats.maxUsed} MB is ${(ratio * 100).toFixed(0)}% of the ${size} MB configured; one slightly bigger payload ends in an out-of-memory failure. Raise memory before anything else` });
  else if (ratio >= o.nearLimitAbove) findings.push({ rule: "memory-near-limit", severity: "warn", message: `peak memory ${stats.maxUsed} MB is ${(ratio * 100).toFixed(0)}% of the ${size} MB configured; little headroom for a larger payload` });
  else if (ratio < o.overprovisionedBelow && best.mb < size) findings.push({ rule: "memory-overprovisioned", severity: "warn", message: `peak memory ${stats.maxUsed} MB is only ${(ratio * 100).toFixed(0)}% of the ${size} MB configured. At ${(o.cpuBound * 100).toFixed(0)}% CPU-bound the model's cheapest size within a ${o.maxSlowdown}x p50 slowdown is ${best.mb} MB (p50 about ${best.p50Ms} ms), about ${monthlyNow > 0 ? ((1 - monthlyBest / monthlyNow) * 100).toFixed(0) : 0}% cheaper (${fmt(monthlyNow)} to ${fmt(monthlyBest)} per month at ${invocations.toLocaleString("en-US")} invocations); test it before changing` });
  if (best.mb > size && monthlyBest < monthlyNow * 0.95) findings.push({ rule: "faster-is-cheaper", severity: "info", message: `if CPU-bound, ${best.mb} MB runs about ${Math.round((1 - best.p50Ms / Math.max(1, scenarios.yours.rows.find((r) => r.mb === size)?.p50Ms ?? best.p50Ms)) * 100)}% faster and costs ${((1 - monthlyBest / monthlyNow) * 100).toFixed(0)}% less per month: duration falls faster than the per-ms price rises. Confirm with a real run` });
  if (stats.coldShare >= 0.1) findings.push({ rule: "cold-start-heavy", severity: "info", message: `${(stats.coldShare * 100).toFixed(0)}% of these invocations were cold starts (mean init ${stats.meanInit.toFixed(0)} ms). More memory also shortens init, and provisioned concurrency or SnapStart removes it; init time is billed separately from the duration above` });
  if (arch === "x86" && armSaving > 0) findings.push({ rule: "try-arm64", severity: "info", message: `arm64 (Graviton) lists about 20% cheaper per GB-second: roughly ${fmt(armSaving)} per month on this volume if the code and dependencies run on arm64 and durations match` });
  if (stats.mixedSizes) findings.push({ rule: "mixed-memory-sizes", severity: "info", message: `the sample mixes ${[...bySize.keys()].sort((a, b) => a - b).join(", ")} MB configurations; only the most common (${size} MB) was analysed` });
  if (stats.count < 30) findings.push({ rule: "small-sample", severity: "info", message: `only ${stats.count} invocation(s) at ${size} MB; peak memory and duration percentiles from a sample this small can miss the heavy requests` });

  return { count: stats.count, skipped: parsed.skipped, arch, invocations, stats, scenarios, current, best, monthlyNow, monthlyBest, armSaving, findings };
}

function fmt(n) { return `$${n.toFixed(n >= 100 ? 0 : 2)}`; }

export function summarize(report) {
  if (!report.count) return { status: "none", errors: 0, warns: 0, infos: 0, text: "No Lambda REPORT lines recognised. Paste lines like: REPORT RequestId: ... Duration: 102.25 ms Billed Duration: 103 ms Memory Size: 512 MB Max Memory Used: 82 MB" };
  const errors = report.findings.filter((f) => f.severity === "error").length;
  const warns = report.findings.filter((f) => f.severity === "warn").length;
  const infos = report.findings.filter((f) => f.severity === "info").length;
  const status = errors ? "error" : warns ? "warn" : "ok";
  const same = report.best.mb === report.current.mb;
  const text = `${report.count} invocation(s) at ${report.stats.size} MB, peak ${report.stats.maxUsed} MB used, p50 ${report.stats.p50Ms.toFixed(0)} ms. ` +
    (same ? `${report.stats.size} MB is already the cheapest size in the model.` : `Model's cheapest size within the latency cap: ${report.best.mb} MB (${fmt(report.monthlyNow)} to ${fmt(report.monthlyBest)} per month at ${report.invocations.toLocaleString("en-US")} invocations).`) +
    ` ${errors} error(s), ${warns} warning(s), ${infos} note(s).`;
  return { status, errors, warns, infos, text };
}

export const INPUT_NOTES = [
  { what: "REPORT RequestId: ... Duration: ... Memory Size: ... Max Memory Used: ...", detail: "the line Lambda writes to CloudWatch Logs after every invocation; tab- or space-separated, from the console, aws logs tail, or an export" },
  { what: "Init Duration / Restore Duration", detail: "present on cold starts; used for the cold-start share only" },
  { what: "Other log lines", detail: "ignored, so you can paste a whole log stream" },
];
