// The whole analysis the page and the CLI show, as data. Pure; a generator so the page can repaint between
// the slow steps (each perfect-foresight year takes a few tenths of a second).

import { readMeter } from "./meter.mjs";
import { parseTariffs, hourlyPrices } from "./tariff.mjs";
import { battery, compare, payback } from "./dispatch.mjs";

/** "5/3.8, 10/5, 13.5" -> [{kwh, kw}] (kW defaults to half the kWh, at least 3). */
export function parseSizes(text) {
  const out = [];
  for (const part of String(text ?? "").split(/[,;\n]+/)) {
    const m = part.trim().match(/^([\d.]+)\s*(?:kwh)?\s*(?:[/@x]\s*([\d.]+)\s*(?:kw)?)?$/i);
    if (!m) continue;
    const kwh = +m[1], kw = m[2] ? +m[2] : Math.max(3, kwh / 2);
    if (kwh > 0 && kwh <= 200 && kw > 0 && kw <= 100) out.push({ kwh, kw });
  }
  return out.slice(0, 10);
}

/**
 * opts: { meter (text), tariffs (text), battery {kwh, kw, roundTrip, reserve, gridCharge, gridExport},
 *         sizes (text), costFixed ($), costPerKwh ($ per usable kWh) }
 * Yields { progress: 0..1, label } and returns { ok, errors, meter, plans: [...] }.
 */
export function* analyzeSteps(opts) {
  const errors = [];
  const meter = readMeter(opts.meter);
  if (!meter.ok) return { ok: false, errors: ["The meter data could not be used.", ...meter.notes], meter };
  const parsed = parseTariffs(opts.tariffs);
  if (!parsed.length) return { ok: false, errors: ["Enter at least one rate plan."], meter };
  parsed.forEach((p, i) => { for (const e of p.errors) errors.push(`Plan ${i + 1}${p.plan.name ? ` (${p.plan.name})` : ""}: ${e}`); });
  if (errors.length) return { ok: false, errors, meter };
  const bat = battery(opts.battery || {});
  const sizes = parseSizes(opts.sizes);
  const cost = (b) => (+opts.costFixed || 0) + (+opts.costPerKwh || 0) * b.kwh;
  const hasCost = (+opts.costFixed || 0) + (+opts.costPerKwh || 0) > 0;
  const steps = parsed.length * (1 + sizes.length);
  let done = 0;
  const plans = [];
  for (const [pi, { plan }] of parsed.entries()) {
    const name = plan.name || `Plan ${pi + 1}`;
    yield { progress: done / steps, label: `${name}: your battery` };
    const prices = hourlyPrices(plan, meter.start, meter.net.length);
    const main = compare(meter.net, bat, prices, plan.fixed);
    done++;
    const yearly = (s) => payback(s, meter.net.length, hasCost ? cost(bat) : 0);
    const sweep = [];
    for (const s of sizes) {
      yield { progress: done / steps, label: `${name}: ${s.kwh} kWh` };
      const b = { ...bat, ...s };
      const r = compare(meter.net, b, prices, plan.fixed, { levels: 30 }); // 30 levels: within 0.5% of the finest grid (dispatch.test.mjs)
      const c = hasCost ? cost(b) : 0;
      sweep.push({ kwh: s.kwh, kw: s.kw, self: payback(r.self.saving, meter.net.length, c), peak: payback(r.peak.saving, meter.net.length, c), optimal: payback(r.optimal.saving, meter.net.length, c), cost: c });
      done++;
    }
    plans.push({
      name,
      fixed: plan.fixed,
      uncovered: prices.uncovered,
      none: main.none.bill,
      modes: ["self", "peak", "optimal"].map((k) => ({ mode: k, bill: main[k].bill, saving: main[k].saving, ...yearly(main[k].saving), cycles: main[k].cycles * (8760 / meter.net.length) })),
      sweep,
    });
  }
  yield { progress: 1, label: "done" };
  const scale = 8760 / meter.net.length;
  const best = (f) => plans.reduce((a, p) => (f(p) < f(a) ? p : a), plans[0]);
  return {
    ok: true,
    errors: [],
    meter,
    battery: bat,
    hasCost,
    batteryCost: hasCost ? cost(bat) : 0,
    scale,
    plans,
    cheapestWithout: best((p) => p.none.total).name,
    cheapestWithSelf: best((p) => p.modes[0].bill.total).name,
    cheapestWithOptimal: best((p) => p.modes[2].bill.total).name,
  };
}

/** Runs the generator to the end (CLI, tests). */
export function analyze(opts) {
  const it = analyzeSteps(opts);
  let r = it.next();
  while (!r.done) r = it.next();
  return r.value;
}

export const MODE_NAMES = {
  self: "Self-powered (solar only, covers the house any hour)",
  peak: "Time-based (discharges only in each day's top-price hours)",
  optimal: "Perfect-foresight ceiling (no real controller reaches it)",
};
