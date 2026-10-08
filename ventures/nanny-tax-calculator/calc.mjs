// Household-employer (nanny) tax model. Pure functions, no dependencies, nothing leaves the browser.
//
// Federal pieces, per IRS Publication 926 / Schedule H:
//   - Social Security 6.2% + Medicare 1.45% from each side, on cash wages, once a household employee is paid
//     at least the yearly coverage threshold. Employee share is withheld from pay, or paid by the employer
//     on top (which costs the employer the same money either way).
//   - FUTA 6.0% of the first $7,000, less a 5.4% credit when state unemployment tax is paid on time, applies
//     when cash wages reach $1,000 in any calendar quarter. We test the average quarter (wages / 4).
//   - State unemployment, workers' compensation: typed, because they vary by state.
// Optional federal income tax withholding is a flat % typed by the employee on a W-4; shown only in take-home.
// Tax-year figures are inputs, not constants, so the page can be corrected without a code change.

export const DEFAULTS = {
  hourlyRate: 25,
  rateIsNet: 0,
  hoursPerWeek: 40,
  weeksPaid: 52,
  annualBonus: 0,
  ficaApplies: 1,
  employerPaysEmployeeShare: 0,
  fedWithholdingPct: 0,
  futaCreditApplies: 1,
  stateUiRatePct: 2.5,
  stateUiWageBase: 14000,
  workersCompYear: 0,
  ssWageBase: 184500,
  householdThreshold: 3000,
  futaWageBase: 7000,
};

export const SS_RATE = 0.062;
export const MEDICARE_RATE = 0.0145;
export const FUTA_GROSS = 0.06;
export const FUTA_CREDIT = 0.054;
export const FUTA_QUARTER_TEST = 1000;

export const num = (s) => {
  if (typeof s === "number") return s;
  const t = String(s ?? "").replace(/[$,%\s]/g, "");
  return t === "" ? NaN : Number(t);
};
export const money = (x) => {
  const sign = x < 0 ? "-" : "";
  return `${sign}$${Math.abs(Math.round(x)).toLocaleString("en-US")}`;
};
export const money2 = (x) => `${x < 0 ? "-" : ""}$${Math.abs(x).toFixed(2)}`;
export const pct = (x, d = 1) => `${(x * 100).toFixed(d)}%`;

// All costs for a given GROSS hourly rate.
export function costAtGross(o, grossHourly) {
  const wages = Math.max(0, grossHourly * o.hoursPerWeek * o.weeksPaid + (o.annualBonus || 0));
  const ficaOn = o.ficaApplies === 1 && wages >= o.householdThreshold;
  const ssWages = Math.min(wages, o.ssWageBase);
  const share = ficaOn ? ssWages * SS_RATE + wages * MEDICARE_RATE : 0; // one side's share
  const futaOn = wages / 4 >= FUTA_QUARTER_TEST;
  const futaRate = FUTA_GROSS - (o.futaCreditApplies === 1 ? FUTA_CREDIT : 0);
  const futa = futaOn ? Math.min(wages, o.futaWageBase) * futaRate : 0;
  const stateUi = wages > 0 ? Math.min(wages, o.stateUiWageBase) * (o.stateUiRatePct / 100) : 0;
  const withheldFica = o.employerPaysEmployeeShare === 1 ? 0 : share;
  const fedWithheld = wages * (o.fedWithholdingPct / 100);
  const takeHome = wages - withheldFica - fedWithheld;
  const employerCost = wages + share + (o.employerPaysEmployeeShare === 1 ? share : 0) + futa + stateUi + (o.workersCompYear || 0);
  const hours = o.hoursPerWeek * o.weeksPaid;
  return {
    grossHourly, wages, ficaOn, futaOn, employeeShare: share, employerShare: share, futa, stateUi,
    workersComp: o.workersCompYear || 0, withheldFica, fedWithheld, takeHome, employerCost, hours,
    loadedHourly: hours > 0 ? employerCost / hours : 0,
    takeHomeHourly: hours > 0 ? takeHome / hours : 0,
  };
}

// Find the gross hourly rate whose take-home hourly equals `target` (bisection; take-home rises with gross).
export function grossForNet(o, target) {
  let lo = target, hi = target * 3 + 1;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (costAtGross(o, mid).takeHomeHourly < target) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

export function analyze(raw) {
  const o = { ...DEFAULTS, ...raw };
  const warnings = [];
  for (const k of ["hourlyRate", "hoursPerWeek", "weeksPaid"]) {
    if (!(o[k] > 0)) warnings.push(`${k} must be above zero.`);
  }
  if (o.weeksPaid > 52) warnings.push("Weeks paid cannot exceed 52.");
  if (o.fedWithholdingPct < 0 || o.fedWithholdingPct > 60) warnings.push("Income tax withholding should be between 0 and 60%.");
  if (warnings.length) return { opts: o, warnings, result: null };
  const gross = o.rateIsNet === 1 ? grossForNet(o, o.hourlyRate) : o.hourlyRate;
  const r = costAtGross(o, gross);
  if (r.wages > 0 && r.wages < o.householdThreshold && o.ficaApplies === 1) {
    warnings.push(`Cash wages are under the ${money(o.householdThreshold)} threshold, so no Social Security or Medicare tax is due on this pay.`);
  }
  if (o.ficaApplies !== 1) warnings.push("Social Security and Medicare are switched off: only right for an employee under 18 who is not a household worker by main occupation, or your spouse, child under 21 or parent (in limited cases).");
  const weekly = o.weeksPaid > 0 ? r.wages / o.weeksPaid : 0;
  const hoursGrid = [20, 30, 40, 50].map((h) => {
    const c = costAtGross({ ...o, hoursPerWeek: h }, gross);
    return { hours: h, wages: c.wages, employerCost: c.employerCost, loadedHourly: c.loadedHourly, takeHome: c.takeHome };
  });
  const overhead = r.employerCost - r.wages;
  return {
    opts: o, warnings, result: r, grossHourly: gross, weeklyGross: weekly,
    overhead, overheadPct: r.wages > 0 ? overhead / r.wages : 0,
    quarterlyEmployerShare: (r.employeeShare + r.employerShare) / 4,
    scheduleHLine: r.employeeShare + r.employerShare + r.futa,
    hoursGrid,
  };
}

export function toCsv(a) {
  const r = a.result;
  const rows = [
    ["item", "annual_usd"],
    ["cash_wages", r.wages.toFixed(2)],
    ["employee_social_security_medicare", r.employeeShare.toFixed(2)],
    ["employer_social_security_medicare", r.employerShare.toFixed(2)],
    ["futa", r.futa.toFixed(2)],
    ["state_unemployment", r.stateUi.toFixed(2)],
    ["workers_comp", r.workersComp.toFixed(2)],
    ["employee_take_home", r.takeHome.toFixed(2)],
    ["total_employer_cost", r.employerCost.toFixed(2)],
  ];
  return rows.map((x) => x.join(",")).join("\n") + "\n";
}
