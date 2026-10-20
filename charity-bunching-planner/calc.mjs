// Charity bunching planner. Pure functions, no dependencies, nothing leaves the browser. Given a planned
// annual gift, it searches every schedule of donor-advised-fund (DAF) deposit years over a planning horizon
// and returns the one with the largest total federal-plus-state tax saving, next to "give the same amount
// directly every year" and the regular every-k-years cycles. Amounts and rates are typed by the user; this
// file embeds no tax table.
//
// Model (one flat marginal rate, one filing status, amounts grow at one inflation rate):
//   every year the charities receive the same planned amount G; only the timing of the *deduction* moves.
//   itemizing   = other itemized deductions O plus charitable gifts above a floor (0.5% of AGI, typed),
//                 capped at 60% of AGI; it only helps in the part that beats the standard deduction S
//                 itemized benefit = max(0, O + max(0, min(gifts, 60% AGI) - floor) - S)
//   not itemizing = an above-the-line deduction for direct cash gifts up to C (typed; DAF deposits do not
//                 qualify), no floor
//   a year's tax saving = rate x max(itemized benefit, above-the-line deduction)
//
//   schedule      = a set of bunch years. In a bunch year the donor deposits into the DAF enough to cover that
//                 year and every following year until the next bunch year. Covered years give no new DAF
//                 money; the donor sends min(G, C) directly in cash for the above-the-line deduction and the
//                 DAF grants the rest. Years before the first bunch year are given directly.
//   limit         = no deposit may have to cover more than `maxGap` years (charities should not wait for a
//                 decade of giving); schedules breaking it are not searched.
//   optimum       = exhaustive over all 2^N schedules (N <= 15) that respect the limit, so it is exact for
//                 this model.
// The DAF balance earns growth at a typed rate between deposit and grant; the growth is reported as extra for
// charity, not as tax saving.

export const MAX_YEARS = 15;

export const DEFAULTS = {
  years: 10,
  maxGap: 4,
  annualGift: 8000,
  standardDeduction: 32000,
  otherItemized: 22000,
  agi: 180000,
  ratePct: 32,
  stateRatePct: 5,
  nonItemizerCap: 2000,
  inflationPct: 2.5,
  dafGrowthPct: 4,
  stockSharePct: 0,
  stockGainSharePct: 60,
  ltRatePct: 15,
};

export function num(v) {
  if (typeof v === "number") return v;
  const s = String(v ?? "").replace(/[$,%\s]/g, "");
  return s === "" ? NaN : Number(s);
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

export const FLOOR_RATE = 0.005;
export const CEILING_RATE = 0.6;

// Tax saving for one year given the new DAF deposit and the direct cash gift made that year.
export function yearSaving({ deposit, direct, other, standard, agi, cap, rate }) {
  const gifts = nz(deposit) + nz(direct);
  const deductible = Math.max(0, Math.min(gifts, CEILING_RATE * agi) - FLOOR_RATE * agi);
  const itemized = Math.max(0, other + deductible - standard);
  const atl = Math.min(nz(direct), nz(cap));
  const useItemized = itemized >= atl;
  return { saving: rate * Math.max(itemized, atl), itemized: useItemized && itemized > 0, deduction: Math.max(itemized, atl) };
}

function context(o) {
  const years = Math.max(1, Math.min(MAX_YEARS, Math.round(nz(o.years) || DEFAULTS.years)));
  const g = 1 + nz(o.inflationPct) / 100;
  return {
    years,
    gift: nz(o.annualGift),
    rate: (nz(o.ratePct) + nz(o.stateRatePct)) / 100,
    cap: nz(o.nonItemizerCap),
    growth: nz(o.dafGrowthPct) / 100,
    at: (t) => ({ standard: nz(o.standardDeduction) * g ** t, other: nz(o.otherItemized) * g ** t, agi: nz(o.agi) * g ** t }),
  };
}

// mask: boolean array, length = years; true = DAF deposit year.
export function evaluate(o, mask) {
  const c = context(o);
  const rows = [];
  let balance = 0;
  let total = 0;
  let deposited = 0;
  for (let t = 0; t < c.years; t++) {
    const { standard, other, agi } = c.at(t);
    const first = mask.indexOf(true);
    const covered = first !== -1 && t >= first;
    let deposit = 0;
    let direct;
    if (mask[t]) {
      let end = t + 1;
      while (end < c.years && !mask[end]) end++;
      deposit = c.gift;
      for (let s = t + 1; s < end; s++) deposit += c.gift - Math.min(c.gift, c.cap);
      direct = 0;
    } else if (covered) {
      direct = Math.min(c.gift, c.cap);
    } else {
      direct = c.gift;
    }
    const y = yearSaving({ deposit, direct, other, standard, agi, cap: c.cap, rate: c.rate });
    balance += deposit;
    const grant = covered ? c.gift - direct : 0;
    balance -= grant;
    balance = Math.max(0, balance);
    const growth = balance * c.growth;
    balance += growth;
    deposited += deposit;
    total += y.saving;
    rows.push({ year: t + 1, deposit, direct, grant, itemizes: y.itemized, deduction: y.deduction, saving: y.saving, balance });
  }
  return { rows, total, deposited, left: balance };
}

export function baselineMask(years) {
  return Array.from({ length: years }, () => false);
}

function maskFromBits(bits, years) {
  return Array.from({ length: years }, (_, i) => Boolean((bits >> i) & 1));
}

export function allowed(mask, maxGap) {
  const idx = mask.map((m, i) => (m ? i : -1)).filter((i) => i >= 0);
  if (!idx.length) return false;
  for (let i = 1; i < idx.length; i++) if (idx[i] - idx[i - 1] > maxGap) return false;
  return mask.length - idx[idx.length - 1] <= maxGap;
}

export function search(o) {
  const c = context(o);
  const maxGap = Math.max(1, Math.round(nz(o.maxGap) || DEFAULTS.maxGap));
  let best = null;
  for (let bits = 1; bits < 1 << c.years; bits++) {
    const m = maskFromBits(bits, c.years);
    if (!allowed(m, maxGap)) continue;
    const r = evaluate(o, m);
    if (!best || r.total > best.total + 1e-9) best = { ...r, mask: m };
  }
  return best;
}

export function cycle(years, k, offset) {
  return Array.from({ length: years }, (_, i) => i >= offset && (i - offset) % k === 0);
}

export function analyze(raw) {
  const o = { ...DEFAULTS };
  for (const k of Object.keys(DEFAULTS)) {
    const v = num(raw[k]);
    if (Number.isFinite(v)) o[k] = v;
  }
  const warnings = [];
  const c = context(o);
  if (!(c.gift > 0)) warnings.push("Enter the amount you plan to give each year.");
  if (!(nz(o.agi) > 0)) warnings.push("Enter your adjusted gross income; the 0.5% floor and 60% ceiling are measured against it.");
  if (!(nz(o.standardDeduction) > 0)) warnings.push("Enter your standard deduction for your filing status.");
  if (warnings.length) return { warnings, o };
  if (nz(o.years) > MAX_YEARS) warnings.push(`The horizon is capped at ${MAX_YEARS} years.`);

  const base = evaluate(o, baselineMask(c.years));
  const searched = search(o);
  // Giving directly is itself a schedule (no DAF at all); when nothing beats it, say so.
  const best = searched && searched.total > base.total + 1e-9 ? searched : { ...base, mask: baselineMask(c.years) };
  const bunching = best !== base && best.mask.some(Boolean);
  const schedules = [];
  const maxGap = Math.max(1, Math.round(nz(o.maxGap) || DEFAULTS.maxGap));
  for (let k = 1; k <= Math.min(c.years, maxGap); k++) {
    let top = null;
    for (let off = 0; off < k; off++) {
      const m = cycle(c.years, k, off);
      if (!allowed(m, maxGap)) continue;
      const r = evaluate(o, m);
      if (!top || r.total > top.total + 1e-9) top = { ...r, offset: off };
    }
    if (!top) continue;
    schedules.push({ label: k === 1 ? "DAF deposit every year" : `Bunch every ${k} years`, k, offset: top.offset, total: top.total, vsDirect: top.total - base.total });
  }
  const peak = Math.max(...best.rows.map((r) => r.deposit));
  const peakAgi = c.at(best.rows.findIndex((r) => r.deposit === peak)).agi;
  if (peak > CEILING_RATE * peakAgi) warnings.push(`The largest deposit (${money(peak)}) is over 60% of that year's AGI; the excess carries forward up to five years and is not valued here.`);
  const stockFrac = Math.min(100, nz(o.stockSharePct)) / 100;
  const stockSaving = best.deposited * stockFrac * (Math.min(100, nz(o.stockGainSharePct)) / 100) * (nz(o.ltRatePct) / 100);
  return {
    warnings,
    o,
    years: c.years,
    base,
    best,
    schedules,
    bunching,
    gain: best.total - base.total,
    bunchYears: best.mask.map((m, i) => (m ? i + 1 : 0)).filter(Boolean),
    stockSaving,
    totalGiven: c.gift * c.years,
  };
}

export function toCsv(a) {
  const head = ["year", "deposit_to_daf", "direct_cash_gift", "grant_from_daf", "itemizes", "deduction", "tax_saving", "daf_balance_end"];
  const lines = [head.join(",")];
  for (const r of a.best.rows) lines.push([r.year, r.deposit.toFixed(2), r.direct.toFixed(2), r.grant.toFixed(2), r.itemizes ? "yes" : "no", r.deduction.toFixed(2), r.saving.toFixed(2), r.balance.toFixed(2)].join(","));
  return lines.join("\n") + "\n";
}
