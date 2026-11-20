// The shipped tariff plan (tariff.mjs tariffBattery) on full-year buildings
// under a real URDB rate, and what the older one-window form of the page would
// have claimed for the same building and battery.
// Usage: node check/tariff_gap.mjs cases.json > out.json
// cases.json: {buildings: [{building, walls[], kw[]}], cases: [{b, rate (URDB object), bat}]}
// Output per case: {real: {...yearly, months: [{month, before, after, method}]}, oneWindow: {...}, approx, series: {price, period} by month (first case of each building x rate only)}.
import { readFileSync } from "node:fs";
import { analyze } from "../calc.mjs";
import { touBattery } from "../tou.mjs";
import { parseUrdb, tariffBattery, expand, flatRate } from "../tariff.mjs";

/**
 * The one-window tariff a person would type from the summer section of the
 * rate sheet (fixed rule): the July weekday hours of the highest-priced demand
 * period form the window (first hour to last hour + 1); its rate is the
 * on-peak demand rate; July's flat demand rate is the facility rate; the
 * energy price at the window's first hour is on-peak, at 03:00 off-peak;
 * weekdays only, applied all year.
 */
export function oneWindow(s) {
  const jul = 6;
  const dw = s.demand ? s.demand.weekday[jul] : null;
  let top = -1, rate = 0;
  if (dw) for (const k of dw) if (s.demand.rates[k] > rate) { rate = s.demand.rates[k]; top = k; }
  const hours = dw ? dw.map((k, h) => (k === top ? h : -1)).filter((h) => h >= 0) : [];
  const onStart = hours.length ? hours[0] : 16, onEnd = hours.length ? hours[hours.length - 1] + 1 : 21;
  const ew = s.energy.weekday[jul];
  return { onStart, onEnd, weekdaysOnly: true, onDemandRate: rate, facilityRate: flatRate(s, jul), onPrice: s.energy.prices[ew[onStart]], offPrice: s.energy.prices[ew[3]] };
}

const { buildings, cases } = JSON.parse(readFileSync(process.argv[2], "utf8"));
const seen = new Set();
const out = cases.map((c) => {
  const bd = buildings[c.b];
  const s = parseUrdb(c.rate).schedule;
  const rows = bd.walls.map((w, i) => ({ t: Date.parse(w + ":00Z"), v: bd.kw[i] }));
  const a = analyze(rows, { unit: "kw", intervalMin: "15", demandRate: String(flatRate(s, 6) || 1), ratchetPct: "", usablePct: "" });
  const t0 = performance.now();
  const r = tariffBattery(a, s, c.bat);
  const ms = performance.now() - t0;
  const approx = oneWindow(s);
  const w = touBattery(a, approx, c.bat, { yearPlan: false });
  const score = (b) => b.facKw * b.rateF + b.touDemand + b.energy;
  const res = {
    real: { before: r.yearlyBefore - r.yearly.before.fixed, after: r.yearlyAfter - r.yearly.after.fixed, saving: r.saving, demandSaving: r.demandSaving, energySaving: r.energySaving, ms,
      months: r.months.filter((m) => m.complete).map((m) => ({ month: m.month, before: score(m.before), after: score(m.after), method: m.method })) },
    oneWindow: { before: w.yearlyBefore, after: w.yearlyAfter, saving: w.saving },
    approx,
  };
  const key = `${c.b}|${s.name}`;
  if (!seen.has(key)) {
    seen.add(key);
    res.series = a.months.filter((m) => m.complete).map((m) => { const e = expand(m.list.map((p) => p.t), s); return { month: m.month, kw: m.list.map((p) => p.kw), price: e.price, period: e.period, rateF: flatRate(s, Number(m.month.slice(5)) - 1) }; });
  }
  return res;
});
process.stdout.write(JSON.stringify(out));
