// Tow truck rate calculator: a defensible price per tow job, from the
// operator's own costs. Pure functions, no DOM, no I/O. Every figure is typed
// by the user; nothing here is a regulated rate, a rule or a market fact.
//
//   Fixed cost per hour = (truck payment + insurance) / billable hours per month
//   Truck hourly cost   = fixed cost per hour + driver hourly cost
//   Per-mile cost       = fuel price / mpg + maintenance per mile
//   Job hours           = (deadhead + loaded miles) / avg mph
//                         + (on-scene + winch minutes) / 60
//   True cost           = job hours x truck hourly cost
//                         + (deadhead + loaded miles) x per-mile cost
//                         + storage days x storage cost per day
//   Revenue             = hook-up + loaded miles beyond included x rate
//                         + after-hours + weather + winch surcharges
//                         + storage days x daily storage fee
//   Break-even price    = true cost
//   Target price        = true cost / (1 - target margin)

export const DEFAULTS = {
  truckPayment: 1500, insurance: 600, driverHourly: 25, billableHours: 150,
  fuelPrice: 4, mpg: 8, maintPerMile: 0.25,
  hookup: 125, includedMiles: 5, ratePerMile: 4,
  loadedMiles: 20, deadheadMiles: 10, avgMph: 30, onSceneMinutes: 30,
  afterHoursFee: 0, weatherFee: 0, winchFee: 0, winchMinutes: 0,
  storageDays: 0, storageFeePerDay: 0, storageCostPerDay: 0,
  targetMarginPct: 30,
};

export const round2 = (v) => Math.round((v + Number.EPSILON) * 100) / 100;

export function money(n) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

export function validate(raw = {}) {
  const o = { ...DEFAULTS };
  for (const k of Object.keys(DEFAULTS)) {
    const v = raw[k];
    if (v === undefined || v === null || v === "") continue;
    if (!isNum(v)) return { invalid: `${k} must be a number.` };
    if (v < 0) return { invalid: "Amounts, miles and minutes cannot be negative." };
    o[k] = v;
  }
  if (!(o.billableHours > 0)) return { invalid: "Billable hours per month must be greater than zero." };
  if (!(o.mpg > 0)) return { invalid: "Miles per gallon must be greater than zero." };
  if (!(o.avgMph > 0)) return { invalid: "Average driving speed must be greater than zero." };
  if (o.targetMarginPct >= 95) return { invalid: "Target margin must be under 95%." };
  return { input: o };
}

export function truckRates(o) {
  const fixedPerHour = (o.truckPayment + o.insurance) / o.billableHours;
  const hourlyCost = fixedPerHour + o.driverHourly;
  const perMileCost = o.fuelPrice / o.mpg + o.maintPerMile;
  return { fixedPerHour, hourlyCost, perMileCost };
}

// Cost and revenue of one job described by `o`, already validated.
function price(o) {
  const r = truckRates(o);
  const driveMiles = o.deadheadMiles + o.loadedMiles;
  const hours = driveMiles / o.avgMph + (o.onSceneMinutes + o.winchMinutes) / 60;
  const timeCost = hours * r.hourlyCost;
  const mileCost = driveMiles * r.perMileCost;
  const storageCost = o.storageDays * o.storageCostPerDay;
  const trueCost = timeCost + mileCost + storageCost;
  const billableMiles = Math.max(0, o.loadedMiles - o.includedMiles);
  const mileageCharge = billableMiles * o.ratePerMile;
  const surcharges = o.afterHoursFee + o.weatherFee + o.winchFee;
  const storageRevenue = o.storageDays * o.storageFeePerDay;
  const revenue = o.hookup + mileageCharge + surcharges + storageRevenue;
  return { r, driveMiles, hours, timeCost, mileCost, storageCost, trueCost, billableMiles, mileageCharge, surcharges, storageRevenue, revenue };
}

export function rateOutcome(raw = {}) {
  const v = validate(raw);
  if (v.invalid) return { invalid: v.invalid };
  const o = v.input;
  const p = price(o);
  const profit = p.revenue - p.trueCost;
  const margin = p.revenue > 0 ? profit / p.revenue : null;
  const target = o.targetMarginPct / 100;
  const targetPrice = p.trueCost / (1 - target);
  const gapToTarget = targetPrice - p.revenue;

  // Per-mile rate that would make the job break even, holding every other
  // charge fixed. Null when there are no billable miles; 0 when the other
  // charges already cover cost.
  const otherRevenue = p.revenue - p.mileageCharge;
  const breakEvenRate = p.billableMiles > 0 ? Math.max(0, (p.trueCost - otherRevenue) / p.billableMiles) : null;

  // Levers: fixed-size steps, so the ranking compares like with like. The
  // step sizes are illustrative, not recommendations.
  const dhCut = o.deadheadMiles * 0.25;
  const sceneCut = Math.min(10, o.onSceneMinutes);
  const levers = [
    { key: "hookup", label: "Raise the hook-up fee by $10", gain: 10 },
    { key: "rate", label: "Raise the loaded per-mile rate by $0.50", gain: 0.5 * p.billableMiles },
    { key: "deadhead", label: "Cut deadhead miles by 25% (dispatch closer jobs)", gain: dhCut * (p.r.perMileCost + p.r.hourlyCost / o.avgMph) },
    { key: "scene", label: "Save 10 minutes on scene", gain: (sceneCut / 60) * p.r.hourlyCost },
    { key: "storage", label: "Raise the daily storage fee by $5", gain: 5 * o.storageDays },
  ].filter((l) => l.gain > 0.005)
    .map((l) => ({ ...l, gain: round2(l.gain) }))
    .sort((a, b) => b.gain - a.gain);

  const findings = [];
  if (profit < 0) {
    findings.push({ severity: "high", title: `This price loses ${money(-profit)} per job`, detail: `Revenue of ${money(p.revenue)} is below your true cost of ${money(p.trueCost)}. Break-even is ${money(p.trueCost)}.` });
  } else if (margin !== null && margin < target) {
    findings.push({ severity: "medium", title: `Margin ${(margin * 100).toFixed(1)}% is under your ${o.targetMarginPct}% target`, detail: `To hit the target on this job you would need about ${money(targetPrice)}, which is ${money(gapToTarget)} more than the current price.` });
  } else {
    findings.push({ severity: "info", title: `Margin ${margin === null ? "n/a" : (margin * 100).toFixed(1) + "%"} meets your ${o.targetMarginPct}% target`, detail: `Profit is ${money(profit)} on ${money(p.revenue)} of revenue.` });
  }
  if (o.deadheadMiles > o.loadedMiles && o.deadheadMiles > 0) {
    findings.push({ severity: "medium", title: "More deadhead than loaded miles", detail: "You drive further empty than loaded. Unless the hook-up fee or a minimum charge covers the empty leg, this job is paid mostly for the shorter half." });
  }
  if (p.billableMiles > 0 && p.mileageCharge === 0) {
    findings.push({ severity: "info", title: "Loaded rate is zero", detail: "Miles beyond the included distance are charged at $0, so only the hook-up and surcharges earn money." });
  }

  return { input: o, rates: p.r, ...p, profit, margin, target, targetPrice, gapToTarget, breakEven: p.trueCost, breakEvenRate, levers, findings };
}
