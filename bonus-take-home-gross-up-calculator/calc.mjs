// Bonus take-home and gross-up. Pure functions, no dependencies, nothing leaves the browser.
// Every default is a placeholder: the Social Security wage base and the 22% federal supplemental
// rate are U.S. federal figures that change, and state rules vary. Check each against your
// payroll stub, your state's withholding rules and the current IRS Publication 15.

export const DEFAULTS = {
  bonus: 10000,
  ytdWages: 90000,
  fedWithholdPct: 22,
  fedMarginalPct: 24,
  stateWithholdPct: 5,
  stateMarginalPct: 5,
  k401Pct: 0,
  ssWageBase: 184500,
  ssRatePct: 6.2,
  medicareRatePct: 1.45,
  addlMedicareThreshold: 200000,
  addlMedicareRatePct: 0.9,
  targetNet: 10000,
};

export function num(v) {
  if (typeof v === "number") return v;
  const n = Number(String(v ?? "").replace(/[$,%\s]/g, ""));
  return String(v ?? "").trim() === "" ? NaN : n;
}

const nz = (x) => (Number.isFinite(x) && x > 0 ? x : 0);
const r2 = (x) => Math.round(x * 100) / 100;

export function money(x) {
  const n = Math.round(x);
  return (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("en-US");
}
export function pct(x, d = 1) {
  return (x * 100).toFixed(d) + "%";
}

// Payroll taxes on `gross` of bonus paid on top of `ytdWages`. The employee and the employer
// both pay Social Security and Medicare; only the employee pays the Additional Medicare Tax.
export function payrollTaxes(gross, o) {
  const g = nz(gross);
  const ytd = nz(o.ytdWages);
  const ssBase = Math.max(0, nz(o.ssWageBase) - ytd);
  const ssWages = Math.min(g, ssBase);
  const ss = (ssWages * nz(o.ssRatePct)) / 100;
  const medicare = (g * nz(o.medicareRatePct)) / 100;
  const thr = nz(o.addlMedicareThreshold);
  const addlWages = Math.max(0, ytd + g - Math.max(ytd, thr));
  const addl = (addlWages * nz(o.addlMedicareRatePct)) / 100;
  return { ssWages, ss, medicare, addl };
}

// Full picture for one gross bonus.
export function bonusBreakdown(gross, o) {
  const g = nz(gross);
  const deferred = Math.min(g, (g * Math.min(100, nz(o.k401Pct))) / 100);
  const taxable = g - deferred; // a 401(k) deferral lowers income tax but not FICA
  const p = payrollTaxes(g, o);
  const fedW = (taxable * nz(o.fedWithholdPct)) / 100;
  const stateW = (taxable * nz(o.stateWithholdPct)) / 100;
  const net = g - deferred - p.ss - p.medicare - p.addl - fedW - stateW;
  const fedTrue = (taxable * nz(o.fedMarginalPct)) / 100;
  const stateTrue = (taxable * nz(o.stateMarginalPct)) / 100;
  // Positive: too much was withheld and comes back at filing; negative: you owe more.
  const settlement = fedW + stateW - fedTrue - stateTrue;
  const afterTaxValue = g - p.ss - p.medicare - p.addl - fedTrue - stateTrue; // 401(k) money counted as yours
  const employerFica = (p.ssWages * nz(o.ssRatePct)) / 100 + p.medicare;
  return {
    gross: g, deferred, taxable, ...p, fedW, stateW, net,
    withheldTotal: g - deferred - net,
    withheldRate: g > 0 ? (g - deferred - net) / g : 0,
    keptRate: g > 0 ? net / g : 0,
    fedTrue, stateTrue, settlement, afterTaxValue,
    afterTaxRate: g > 0 ? afterTaxValue / g : 0,
    employerFica, employerCost: g + employerFica,
  };
}

// The gross bonus that leaves `target` in the paycheck. Take-home rises with gross at a
// positive rate everywhere, so bisection is exact to the cent.
export function grossUp(target, o) {
  const t = nz(target);
  if (t === 0) return 0;
  let lo = t;
  let hi = t * 4 + 1;
  for (let i = 0; i < 200 && bonusBreakdown(hi, o).net < t; i++) hi *= 2;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (bonusBreakdown(mid, o).net < t) lo = mid;
    else hi = mid;
  }
  return r2(hi);
}

// Same bonus at different 401(k) deferral shares.
export function deferralTable(o, shares = [0, 25, 50, 100]) {
  return shares.map((s) => {
    const b = bonusBreakdown(o.bonus, { ...o, k401Pct: s });
    return { share: s, deferred: b.deferred, net: b.net, afterTaxValue: b.afterTaxValue };
  });
}

// What the employer pays and the employee keeps at other bonus sizes.
export function sizeTable(o, factors = [0.5, 1, 1.5, 2]) {
  return factors.map((f) => {
    const b = bonusBreakdown(nz(o.bonus) * f, o);
    return { gross: b.gross, net: b.net, keptRate: b.keptRate, employerCost: b.employerCost };
  });
}

export function analyze(o) {
  const b = bonusBreakdown(o.bonus, o);
  const need = nz(o.targetNet) > 0 ? grossUp(o.targetNet, o) : null;
  const gu = need === null ? null : { gross: need, ...bonusBreakdown(need, o) };
  return { b, grossUp: gu, deferrals: deferralTable(o), sizes: sizeTable(o) };
}
