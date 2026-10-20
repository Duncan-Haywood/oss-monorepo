// Zero-dependency, deterministic DynamoDB capacity-mode advisor. Given the
// ConsumedReadCapacityUnits / ConsumedWriteCapacityUnits CloudWatch metrics
// of one table (Sum per period, e.g. hourly), it prices the same traffic
// three ways -- on-demand, provisioned with autoscaling, provisioned at a
// fixed peak -- and says which is cheapest. Pure string in, report out.
//
// What is arithmetic and what is a model: the on-demand cost is exactly the
// consumed units times a per-million price. The provisioned costs assume the
// capacity you set tracks the traffic you pasted; inside one period the
// traffic is flat in this model, so a burst shorter than the period is
// invisible (DynamoDB's 300 s burst bucket hides some of that, and some of it
// throttles). Autoscaling reaction time is flagged, not simulated.

// ILLUSTRATIVE and dated; AWS reprices by region and table class. Overridable.
export const PRICES_AS_OF = "us-east-1 standard-table list prices (no free tier, no reserved capacity, no Standard-IA); verify against the DynamoDB pricing page";
export const DEFAULT_PRICES = {
  onDemandPerMillionRead: 0.125,
  onDemandPerMillionWrite: 0.625,
  perRcuHour: 0.00013,
  perWcuHour: 0.00065,
};
export const DEFAULTS = { periodSeconds: 3600, targetUtilization: 0.7, staticHeadroom: 1.1, switchSavings: 0.2, minMonthlySaving: 5, spikyPeakToAvg: 6, idleShare: 0.5 };
const HOURS_PER_MONTH = 730;

const toNum = (s) => {
  const n = Number(String(s).trim().replace(/,/g, ""));
  return String(s).trim() !== "" && Number.isFinite(n) && n >= 0 ? n : NaN;
};

/**
 * Parses rows of `timestamp, readUnits, writeUnits` (comma, tab or spaces; one optional header row that
 * may name the columns "read"/"write" in either order). Values are the Sum of the metric over one period.
 */
export function parseMetrics(text) {
  const records = [];
  let skipped = 0;
  let readCol = 1;
  let writeCol = 2;
  let sawHeader = false;
  for (const raw of String(text ?? "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const cells = line.split(/\s*[,\t]\s*|\s{2,}/);
    if (cells.length < 3) { skipped += 1; continue; }
    const r = toNum(cells[readCol]);
    const w = toNum(cells[writeCol]);
    if (Number.isNaN(r) || Number.isNaN(w)) {
      if (!sawHeader && records.length === 0 && cells.some((c) => /read|write/i.test(c))) {
        sawHeader = true;
        const ri = cells.findIndex((c) => /read/i.test(c));
        const wi = cells.findIndex((c) => /write/i.test(c));
        if (ri >= 0 && wi >= 0 && ri !== wi) { readCol = ri; writeCol = wi; }
      } else skipped += 1;
      continue;
    }
    records.push({ t: cells[0], read: r, write: w });
  }
  return { records, skipped };
}

const quantile = (sorted, q) => {
  if (!sorted.length) return 0;
  const i = (sorted.length - 1) * q; const lo = Math.floor(i); const hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
};

function stats(values, periodSeconds) {
  const rates = values.map((v) => v / periodSeconds);
  const sorted = [...rates].sort((a, b) => a - b);
  const total = values.reduce((a, b) => a + b, 0);
  const avg = rates.length ? total / (rates.length * periodSeconds) : 0;
  const peak = sorted.length ? sorted[sorted.length - 1] : 0;
  return { total, avg, peak, p95: quantile(sorted, 0.95), p99: quantile(sorted, 0.99), peakToAvg: avg > 0 ? peak / avg : 0, idleShare: rates.length ? rates.filter((r) => r === 0).length / rates.length : 0, rates };
}

/** Provisioned units that follow the traffic with autoscaling: previous-or-current period rate over target utilisation, min 1. */
function autoscaled(rates, target) {
  let rampRisk = 0;
  const units = rates.map((r, i) => {
    const prev = i === 0 ? r : rates[i - 1];
    if (i > 0 && r > (Math.ceil(prev / target) || 1)) rampRisk += 1;
    return Math.max(1, Math.ceil(Math.max(r, prev) / target));
  });
  return { units, rampRisk };
}

/** Prices one side (read or write): returns monthly cost of each mode. */
function priceSide(s, hours, perHour, perMillion, o, current) {
  const scale = HOURS_PER_MONTH / hours;
  const periodHours = o.periodSeconds / 3600;
  const onDemand = (s.total / 1e6) * perMillion * scale;
  const auto = autoscaled(s.rates, o.targetUtilization);
  const autoCost = auto.units.reduce((a, u) => a + u * perHour * periodHours, 0) * scale;
  const staticUnits = Math.max(1, Math.ceil(s.peak * o.staticHeadroom));
  const staticCost = staticUnits * perHour * HOURS_PER_MONTH;
  const out = { onDemand, autoscaled: autoCost, staticPeak: staticCost, staticPeakUnits: staticUnits, rampRisk: auto.rampRisk, autoscaledAvgUnits: auto.units.reduce((a, b) => a + b, 0) / (auto.units.length || 1) };
  if (current !== null && current !== undefined) {
    out.current = { units: current, cost: current * perHour * HOURS_PER_MONTH, throttledPeriods: s.rates.filter((r) => r > current).length };
  }
  return out;
}

/** Break-even average utilisation of provisioned capacity, above which provisioned beats on-demand. */
export const breakEvenUtilization = (perMillion, perHour) => perHour / ((3600 * perMillion) / 1e6);

export function analyze(parsed, options = {}) {
  const o = { ...DEFAULTS, ...options };
  const prices = { ...DEFAULT_PRICES, ...(options.prices ?? {}) };
  const records = parsed.records;
  const count = records.length;
  if (!count) return { count: 0, findings: [], skipped: parsed.skipped ?? 0 };
  const hours = (count * o.periodSeconds) / 3600;
  const read = stats(records.map((r) => r.read), o.periodSeconds);
  const write = stats(records.map((r) => r.write), o.periodSeconds);
  const cur = o.currentProvisioned ?? {};
  const rs = priceSide(read, hours, prices.perRcuHour, prices.onDemandPerMillionRead, o, cur.read);
  const ws = priceSide(write, hours, prices.perWcuHour, prices.onDemandPerMillionWrite, o, cur.write);
  const totals = { onDemand: rs.onDemand + ws.onDemand, autoscaled: rs.autoscaled + ws.autoscaled, staticPeak: rs.staticPeak + ws.staticPeak };
  const hasCurrent = cur.read !== undefined && cur.write !== undefined;
  if (hasCurrent) totals.current = rs.current.cost + ws.current.cost;
  const modes = [["on-demand", totals.onDemand], ["provisioned with autoscaling", totals.autoscaled], ["provisioned at a fixed peak", totals.staticPeak]];
  const best = modes.reduce((a, b) => (b[1] < a[1] ? b : a));
  const currentCost = hasCurrent ? totals.current : totals.onDemand;
  const currentLabel = hasCurrent ? "your current provisioned capacity" : "on-demand";
  const saving = currentCost - best[1];
  const findings = [];
  const add = (rule, severity, message) => findings.push({ rule, severity, message });
  const usd = (n) => {
    const format = (n) => `$${n.toFixed(2)}`;
    const text = format(Math.abs(n));
    return n < 0 && /[1-9]/.test(text) ? `-${text}` : text;
  };
  const be = { read: breakEvenUtilization(prices.onDemandPerMillionRead, prices.perRcuHour), write: breakEvenUtilization(prices.onDemandPerMillionWrite, prices.perWcuHour) };

  if (best[0] !== (hasCurrent ? "" : "on-demand") && saving >= o.minMonthlySaving && saving / currentCost >= o.switchSavings) {
    add("switch-capacity-mode", "warn", `${best[0]} models at ${usd(best[1])}/month against ${usd(currentCost)} for ${currentLabel}: about ${usd(saving)} (${Math.round((saving / currentCost) * 100)}%) a month at the pasted traffic.`);
  } else if (count > 0) {
    add("capacity-mode-fine", "info", `${currentLabel} (${usd(currentCost)}/month) is within ${Math.round(o.switchSavings * 100)}% or ${usd(o.minMonthlySaving)} of the cheapest modelled mode (${best[0]}, ${usd(best[1])}); a switch is not worth the risk.`);
  }
  if (hasCurrent) {
    const thr = rs.current.throttledPeriods + ws.current.throttledPeriods;
    if (thr > 0) add("current-capacity-throttles", "error", `Your current provisioned capacity (${cur.read} RCU / ${cur.write} WCU) is below the average rate in ${rs.current.throttledPeriods} read and ${ws.current.throttledPeriods} write period(s); those periods throttle, retry and add latency (hourly averages hide shorter bursts, so the true number is higher).`);
  }
  const util = { read: rs.autoscaledAvgUnits ? read.avg / rs.autoscaledAvgUnits : 0, write: ws.autoscaledAvgUnits ? write.avg / ws.autoscaledAvgUnits : 0 };
  if (read.avg > 0 && read.peakToAvg >= o.spikyPeakToAvg) add("spiky-reads", "info", `Peak read rate is ${read.peakToAvg.toFixed(1)}x the average; a fixed peak wastes capacity off-peak and autoscaling may lag a sudden spike. On-demand absorbs it.`);
  if (write.avg > 0 && write.peakToAvg >= o.spikyPeakToAvg) add("spiky-writes", "info", `Peak write rate is ${write.peakToAvg.toFixed(1)}x the average; same trade-off as reads, and writes cost five times as much per unit.`);
  if (rs.rampRisk + ws.rampRisk > 0) add("autoscaling-ramp-risk", "warn", `In ${rs.rampRisk} read and ${ws.rampRisk} write period(s) traffic rose faster than the previous capacity allowed for; autoscaling takes minutes to react, so expect throttling there unless you pre-scale or stay on-demand.`);
  if (read.idleShare >= o.idleShare && write.idleShare >= o.idleShare) add("mostly-idle", "info", `Reads and writes are zero in at least ${Math.round(o.idleShare * 100)}% of periods. Provisioned capacity cannot go below 1 unit per direction; on-demand costs nothing while idle.`);
  if (count < 24 * 3600 / o.periodSeconds) add("small-sample", "info", `Only ${(hours).toFixed(0)} hour(s) of data. Paste at least a week covering a busy period before changing a production table; the monthly figures extrapolate this window to 730 hours.`);
  return { count, skipped: parsed.skipped ?? 0, hours, options: { ...o, prices }, read: { ...read, rates: undefined }, write: { ...write, rates: undefined }, readCost: rs, writeCost: ws, totals, best: { mode: best[0], cost: best[1] }, currentCost, currentLabel, saving, breakEven: be, autoscaledUtilization: util, prices, findings };
}

export function summarize(report) {
  if (!report.count) return { status: "none", errors: 0, warns: 0, text: "No usable rows found. Expected lines like: 2026-09-30T12:00:00Z,720000,90000 (timestamp, read units, write units, Sum per period)." };
  const errors = report.findings.filter((f) => f.severity === "error").length;
  const warns = report.findings.filter((f) => f.severity === "warn").length;
  const status = errors ? "error" : warns ? "warn" : "ok";
  const head = `${report.count} period(s), ${report.hours.toFixed(0)} h. Cheapest modelled mode: ${report.best.mode} at $${report.best.cost.toFixed(2)}/month (${report.currentLabel}: $${report.currentCost.toFixed(2)}).`;
  return { status, errors, warns, text: head };
}

export const INPUT_NOTES = [
  { what: "timestamp,read,write", detail: "Sum of ConsumedReadCapacityUnits and ConsumedWriteCapacityUnits per period. Comma, tab or two-space separated." },
  { what: "header row", detail: "One optional header; if it names the columns read and write in either order the columns are mapped for you." },
  { what: "# comment / blank lines", detail: "Ignored." },
  { what: "other lines", detail: "Counted as skipped, never guessed at." },
];
