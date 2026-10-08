// Short-term-rental "loophole" model. Pure functions, no dependencies, nothing leaves the browser.
//
// The idea (IRC section 469, Treas. Reg. 1.469-1(e)(3)(ii)): a rental whose average guest stay is 7 days or
// fewer is not a "rental activity" for the passive-loss rules. If the owner then materially participates,
// the loss (usually driven by cost-segregation bonus depreciation) is non-passive and can offset W-2 or
// business income instead of being suspended. Two gates are modelled:
//   1. Average stay <= 7 days (or <= 30 days with significant personal services, which this tool cannot
//      judge, so it only flags that case).
//   2. Material participation: more than 500 hours, or more than 100 hours AND more than any other single
//      person (cleaners and property managers count as "other persons").
// A non-passive loss is still capped by the excess-business-loss limit (section 461(l)); the threshold is
// an input because it is inflation-indexed. Anything above it carries forward.
// All tax-year figures are inputs, not constants.

export const DEFAULTS = {
  purchasePrice: 600000,
  landPct: 20,
  costSegPct: 30,
  bonusPct: 100,
  recoveryYears: 39,
  yearOneFraction: 1,
  grossRentalIncome: 70000,
  operatingExpenses: 35000,
  otherIncome: 250000,
  fedRatePct: 35,
  stateRatePct: 5,
  avgStayDays: 5,
  hoursYou: 520,
  hoursOthers: 300,
  holdYears: 5,
  lossLimit: 512000,
};

export const MACRS_7YR_YEAR1 = 0.1429;
export const SPECIAL_ALLOWANCE = 25000;
export const ALLOWANCE_PHASEOUT_START = 100000;
export const ALLOWANCE_PHASEOUT_END = 150000;
export const RECAPTURE_1250_CAP = 0.25;

export const num = (s) => {
  if (typeof s === "number") return s;
  const t = String(s ?? "").replace(/[$,%\s]/g, "");
  return t === "" ? NaN : Number(t);
};
export const money = (x) => `${x < 0 ? "-" : ""}$${Math.abs(Math.round(x)).toLocaleString("en-US")}`;

// Year-one depreciation split into its three pieces.
export function depreciation(o) {
  const basis = Math.max(0, o.purchasePrice * (1 - o.landPct / 100));
  const csPortion = basis * (o.costSegPct / 100);
  const bonus = csPortion * (o.bonusPct / 100);
  const csRegular = (csPortion - bonus) * MACRS_7YR_YEAR1;
  const buildingBasis = basis - csPortion;
  const sl = (buildingBasis / o.recoveryYears) * o.yearOneFraction;
  return { basis, csPortion, bonus, csRegular, buildingBasis, sl, total: bonus + csRegular + sl };
}

// Who clears the material-participation gate, and how many hours would.
export function participation(o) {
  const passes500 = o.hoursYou > 500;
  const passesMost = o.hoursYou > 100 && o.hoursYou > o.hoursOthers;
  const hoursNeeded = Math.min(501, Math.max(101, Math.floor(o.hoursOthers) + 1));
  return { ok: passes500 || passesMost, passes500, passesMost, hoursNeeded };
}

export function classify(o) {
  const stayOk = o.avgStayDays <= 7;
  const grey = !stayOk && o.avgStayDays <= 30;
  const p = participation(o);
  return { stayOk, grey, participates: p.ok, nonPassive: stayOk && p.ok, hoursNeeded: p.hoursNeeded };
}

function passiveAllowance(magi) {
  if (magi <= ALLOWANCE_PHASEOUT_START) return SPECIAL_ALLOWANCE;
  if (magi >= ALLOWANCE_PHASEOUT_END) return 0;
  return SPECIAL_ALLOWANCE * (1 - (magi - ALLOWANCE_PHASEOUT_START) / (ALLOWANCE_PHASEOUT_END - ALLOWANCE_PHASEOUT_START));
}

// Tax result of year one for a given depreciation total and classification.
export function yearOne(o, dep, cls) {
  const beforeDep = o.grossRentalIncome - o.operatingExpenses;
  const result = beforeDep - dep;
  const loss = Math.max(0, -result);
  const rate = (o.fedRatePct + o.stateRatePct) / 100;
  let allowed = 0;
  if (cls.nonPassive) allowed = Math.min(loss, o.lossLimit);
  else if (cls.participates) allowed = Math.min(loss, passiveAllowance(o.otherIncome));
  // A profit is taxed in either case.
  const taxOnProfit = result > 0 ? result * rate : 0;
  const carry = loss - allowed;
  return { beforeDep, result, loss, allowed, carry, savings: allowed * rate, taxOnProfit };
}

export function recapture(o, dep) {
  const ordinary = dep.csPortion * (o.fedRatePct / 100); // section 1245 property: ordinary-rate recapture
  const slTaken = (dep.buildingBasis / o.recoveryYears) * (Math.max(0, o.holdYears - 1) + o.yearOneFraction);
  const unrecaptured = slTaken * Math.min(RECAPTURE_1250_CAP, o.fedRatePct / 100);
  return { ordinary, unrecaptured, total: ordinary + unrecaptured };
}

export function analyze(raw) {
  const o = { ...DEFAULTS, ...raw };
  const warnings = [];
  if (!(o.purchasePrice > 0)) warnings.push("Purchase price must be above zero.");
  if (o.landPct < 0 || o.landPct > 90) warnings.push("Land share should be between 0 and 90%.");
  if (o.costSegPct < 0 || o.costSegPct > 60) warnings.push("Cost-segregation share should be between 0 and 60% of the building.");
  if (o.bonusPct < 0 || o.bonusPct > 100) warnings.push("Bonus depreciation must be between 0 and 100%.");
  if (![27.5, 39].includes(o.recoveryYears)) warnings.push("Recovery period should be 39 (short stays) or 27.5 (residential).");
  if (!(o.yearOneFraction > 0 && o.yearOneFraction <= 1)) warnings.push("Share of the year in service must be above 0 and at most 1.");
  if (o.fedRatePct < 0 || o.fedRatePct > 50 || o.stateRatePct < 0 || o.stateRatePct > 20) warnings.push("Check the tax rates.");
  if (o.avgStayDays <= 0) warnings.push("Average stay must be above zero days.");
  if (warnings.length) return { opts: o, warnings, result: null };

  const dep = depreciation(o);
  const cls = classify(o);
  const withCs = yearOne(o, dep.total, cls);
  const noCsDep = depreciation({ ...o, costSegPct: 0 });
  const noCs = yearOne(o, noCsDep.total, cls);
  const rec = recapture(o, dep);
  if (cls.grey) warnings.push("Average stay is 8 to 30 days: that is still a rental activity unless you provide significant personal services (daily cleaning, meals, concierge). Whether you do is a facts question for your preparer.");
  if (!cls.stayOk && !cls.grey) warnings.push("Average stay is over 30 days: this is an ordinary rental, so the loss is passive unless you qualify as a real estate professional.");
  if (cls.stayOk && !cls.participates) warnings.push(`You do not yet clear material participation. You would need more than ${cls.hoursNeeded - 1} documented hours (${cls.hoursNeeded}+).`);
  if (withCs.carry > 0 && cls.nonPassive) warnings.push("The loss is above the excess-business-loss limit; the rest carries forward as a net operating loss.");

  // Hours sensitivity.
  const grid = [100, 250, 501, 750].map((h) => {
    const c = classify({ ...o, hoursYou: h });
    const y = yearOne(o, dep.total, c);
    return { hours: h, nonPassive: c.nonPassive, allowed: y.allowed, savings: y.savings };
  });
  return {
    opts: o, warnings, dep, cls, rec, grid,
    result: withCs, withoutCostSeg: noCs, costSegLift: withCs.savings - noCs.savings,
    recaptureExposure: rec.total,
  };
}

export function toCsv(a) {
  const r = a.result;
  const rows = [
    ["item", "usd"],
    ["bonus_depreciation", a.dep.bonus.toFixed(2)],
    ["cost_seg_regular_depreciation", a.dep.csRegular.toFixed(2)],
    ["straight_line_depreciation", a.dep.sl.toFixed(2)],
    ["total_depreciation", a.dep.total.toFixed(2)],
    ["income_before_depreciation", r.beforeDep.toFixed(2)],
    ["taxable_result", r.result.toFixed(2)],
    ["loss_usable_now", r.allowed.toFixed(2)],
    ["loss_carried_forward", r.carry.toFixed(2)],
    ["tax_saved_year_one", r.savings.toFixed(2)],
    ["estimated_recapture_at_sale", a.recaptureExposure.toFixed(2)],
  ];
  return rows.map((x) => x.join(",")).join("\n") + "\n";
}
