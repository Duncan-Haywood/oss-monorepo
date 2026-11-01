// Battery peak-shaving dispatch for a demand-charge meter. Pure functions.
//
// For a fixed cap on grid draw, the best dispatch is greedy: discharge
// whenever load exceeds the cap, recharge as fast as the cap (and the
// inverter) allow whenever it does not. If any strategy can hold the cap,
// this one can (it keeps the battery as full as possible at every step), so
// "is cap c feasible?" is exact, and feasibility is monotone in c. Bisecting
// c gives each month's lowest achievable peak. Lower earlier peaks only lower
// a later ratchet floor, so minimising every month on its own is optimal.
//
// Assumptions (stated in the README): each month starts with a full battery;
// one-way efficiency is sqrt(round trip); no degradation, no self-discharge,
// perfect foresight of the month's load (an upper bound on what a real
// controller with a forecast achieves).

/** Can the battery hold grid draw to `cap`? Returns {ok, gridKwh, chargedKwh, dischargedKwh} */
export function holdCap(kwSeries, h, cap, bat) {
  const eta = Math.sqrt(bat.roundTrip);
  let soc = bat.kwh; // stored kWh, 0..kwh
  let charged = 0, discharged = 0;
  for (const load of kwSeries) {
    if (load > cap) {
      const need = load - cap;
      if (need > bat.kw + 1e-9) return { ok: false };
      const fromBat = (need * h) / eta; // stored kWh removed
      if (fromBat > soc + 1e-9) return { ok: false };
      soc -= fromBat; discharged += need * h;
    } else if (soc < bat.kwh - 1e-9) {
      const p = Math.min(bat.kw, cap - load, ((bat.kwh - soc) / h) / eta);
      if (p > 0) { soc += p * h * eta; charged += p * h; }
    }
  }
  return { ok: true, chargedKwh: charged, dischargedKwh: discharged };
}

/** Lowest cap the battery can hold in one month (bisection, exact to ~0.01 kW). */
export function lowestCap(kwSeries, h, bat) {
  const peak = Math.max(...kwSeries);
  let lo = Math.max(0, peak - bat.kw), hi = peak;
  if (holdCap(kwSeries, h, lo, bat).ok) return lo;
  for (let i = 0; i < 40 && hi - lo > 0.005; i++) {
    const mid = (lo + hi) / 2;
    if (holdCap(kwSeries, h, mid, bat).ok) hi = mid; else lo = mid;
  }
  return hi;
}

/**
 * Yearly effect of one battery on the analysed meter.
 * a: result of analyze(); bat: {kw, kwh (usable), roundTrip 0..1}; energyRate: $/kWh lost to efficiency (0 if unknown).
 */
export function dispatchSavings(a, bat, energyRate = 0) {
  const h = a.intervalMin / 60;
  const peaks = [];
  let lossKwh = 0;
  const per = a.months.map((m) => {
    const series = m.list.map((p) => p.kw);
    const cap = lowestCap(series, h, bat);
    const res = holdCap(series, h, cap, bat);
    peaks.push({ month: m.month, peak: Math.min(m.peak, cap) });
    const loss = res.ok ? res.chargedKwh - res.dischargedKwh : 0;
    if (m.complete) lossKwh += loss;
    return { month: m.month, capKw: Math.min(m.peak, cap), loss };
  });
  const ratchet = a.ratchet;
  const billed = peaks.map((p, i) => {
    let prior = 0;
    for (let j = Math.max(0, i - 11); j < i; j++) prior = Math.max(prior, peaks[j].peak);
    return Math.max(p.peak, (ratchet / 100) * prior);
  });
  let before = 0, after = 0;
  a.months.forEach((m, i) => { per[i].billedBefore = m.billed; per[i].billedAfter = billed[i]; if (m.complete) { before += m.billed * a.rate; after += billed[i] * a.rate; } });
  const scale = 12 / a.monthsUsed;
  const demandSaving = (before - after) * scale;
  const lossCost = lossKwh * scale * (energyRate || 0);
  return { demandSaving, lossCost, saving: demandSaving - lossCost, months: per };
}

/** Grid of battery sizes with cost and payback. costs: {perKwh, perKw}; sizes from kW fractions of the highest peak x durations in hours. */
export function sizeSweep(a, { roundTrip = 0.88, usablePct = 90, perKwh = 0, perKw = 0, energyRate = 0, kwFractions = [0.05, 0.1, 0.15, 0.2, 0.3], hours = [0.5, 1, 2, 4] } = {}) {
  const rows = [];
  for (const f of kwFractions) for (const dur of hours) {
    const kwSize = Math.max(1, a.maxPeak * f);
    const nameplate = kwSize * dur;
    const bat = { kw: kwSize, kwh: nameplate * (usablePct / 100), roundTrip };
    const r = dispatchSavings(a, bat, energyRate);
    const cost = nameplate * perKwh + kwSize * perKw;
    rows.push({ kw: kwSize, hours: dur, nameplateKwh: nameplate, saving: r.saving, cost: cost > 0 ? cost : null, payback: cost > 0 && r.saving > 0 ? cost / r.saving : null });
  }
  const priced = rows.filter((r) => r.payback != null);
  const best = priced.length ? priced.reduce((x, y) => (y.payback < x.payback ? y : x)) : null;
  return { rows, best };
}
