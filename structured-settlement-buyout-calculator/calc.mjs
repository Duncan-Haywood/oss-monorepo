// Structured settlement buyout evaluator. Pure functions, no dependencies, nothing leaves the browser.
// A factoring company offers a lump sum today for payments a settlement or annuity will pay later. The
// number that matters is the yearly rate the buyer earns on that trade (the discount rate in the offer),
// which is arithmetic on figures printed in the offer: the payments sold, their dates, and the cash.
//
// Model: the monthly stream pays on months 1..n (n = payments left), growing by `growthPct` at each
// 12-payment step, plus up to two one-off lump sums at typed month offsets. Times are in years from
// today and rates are effective annual rates. Present value discounts each payment at (1 + r)^t.

export const DEFAULTS = {
  monthlyPayment: 1500,
  monthsLeft: 180,
  growthPct: 0,
  lump1Amount: 25000,
  lump1Months: 60,
  lump2Amount: 0,
  lump2Months: 120,
  offer: 120000,
  fees: 3500,
  benchmarkRate: 6,
};

export function num(v) {
  if (typeof v === "number") return v;
  const n = Number(String(v ?? "").replace(/[$,%\s]/g, ""));
  return String(v ?? "").trim() === "" ? NaN : n;
}
const nz = (x) => (Number.isFinite(x) && x > 0 ? x : 0);

export function money(x) {
  if (!Number.isFinite(x)) return "n/a";
  const n = Math.round(x);
  return (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("en-US");
}
export function pct(x, d = 1) {
  return Number.isFinite(x) ? (x * 100).toFixed(d) + "%" : "n/a";
}

// Every payment being sold: { t (years from today), amount }.
export function flows(raw) {
  const o = { ...DEFAULTS, ...raw };
  const out = [];
  const n = Math.min(Math.round(nz(o.monthsLeft)), 1200);
  const g = nz(o.growthPct) / 100;
  for (let m = 1; m <= n; m++) {
    out.push({ t: m / 12, amount: nz(o.monthlyPayment) * Math.pow(1 + g, Math.floor((m - 1) / 12)) });
  }
  if (nz(o.lump1Amount)) out.push({ t: Math.max(Math.round(nz(o.lump1Months)), 1) / 12, amount: nz(o.lump1Amount) });
  if (nz(o.lump2Amount)) out.push({ t: Math.max(Math.round(nz(o.lump2Months)), 1) / 12, amount: nz(o.lump2Amount) });
  return out.filter((x) => x.amount > 0).sort((a, b) => a.t - b.t);
}

export function presentValue(fl, ratePct) {
  const r = ratePct / 100;
  return fl.reduce((s, x) => s + x.amount / Math.pow(1 + r, x.t), 0);
}

// Yearly rate at which the payments are worth exactly `cash`; bisection, NaN when no rate in range does it.
export function impliedRate(cash, fl) {
  if (!(cash > 0) || !fl.length) return NaN;
  const f = (r) => presentValue(fl, r * 100) - cash;
  let lo = -0.5, hi = 20;
  if (f(lo) < 0 || f(hi) > 0) return NaN;
  for (let k = 0; k < 200; k++) {
    const mid = (lo + hi) / 2;
    if (f(mid) > 0) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

export function analyze(raw) {
  const o = { ...DEFAULTS, ...raw };
  const warnings = [];
  if (!nz(o.offer)) warnings.push("Enter the lump sum you were offered.");
  if (!nz(o.monthlyPayment) && !nz(o.lump1Amount) && !nz(o.lump2Amount)) warnings.push("Enter the payments being sold.");
  const fl = flows(o);
  const total = fl.reduce((s, x) => s + x.amount, 0);
  const gross = nz(o.offer);
  const net = Math.max(gross - nz(o.fees), 0);
  if (gross && net <= 0) warnings.push("The fees are at least as large as the offer, so you would receive nothing.");
  if (total && gross > total) warnings.push("The offer is larger than the payments you would sell; check the figures.");
  const bench = nz(o.benchmarkRate);
  const pvBench = presentValue(fl, bench);
  const rate = impliedRate(net, fl);
  const rateGross = impliedRate(gross, fl);
  const avgYears = total ? fl.reduce((s, x) => s + x.t * x.amount, 0) / total : NaN;
  const lastYears = fl.length ? fl[fl.length - 1].t : NaN;
  const rates = [3, 5, 8, 12, 18, 24];
  const grid = rates.map((r) => {
    const value = presentValue(fl, r);
    return { rate: r, value, giveUp: value - net, ofPayments: total ? value / total : NaN };
  });
  return {
    fl, total, gross, net, fees: nz(o.fees), cents: total ? net / total : NaN, benchmark: bench,
    pvBench, gap: pvBench - net, rate, rateGross, avgYears, lastYears, grid,
    giveUpTotal: total - net, warnings,
  };
}
