// Birth doula package pricing: what one birth package really pays per hour once labor length, travel, on-call days,
// backup-doula cover, supplies, mileage and yearly overhead are counted. Pure functions, nothing leaves the browser.
//
// Net per birth = fee after card/platform fees, minus supplies, mileage, the backup doula's cut on the births a backup
// attends, and a share of yearly overhead (insurance, certification, continuing education, website). Worked hours are
// prenatal + labor + postpartum + admin + driving. On-call days are a separate, editable cost because nobody agrees on
// what a day of being unable to travel or drink is worth. Fee needed for a target hourly rate is exact (the model is
// linear in the fee). The default figures are placeholders, not market rates.

export const DEFAULTS = {
  fee: 1200,               // package price charged to the client
  prenatalVisits: 2,       // visits before the birth
  prenatalHours: 1.5,      // hours per prenatal visit, including prep
  laborHours: 14,          // average hours attending a birth, door to door
  postpartumVisits: 1,     // visits after the birth
  postpartumHours: 1.5,    // hours per postpartum visit
  adminHours: 3,           // consult, texting, resource lists, notes
  travelMinutesEachWay: 25, // average drive one way
  milesEachWay: 15,        // average miles one way
  mileageRate: 0.725,      // dollars per mile; the IRS standard business rate for 2026, edit if it changes
  onCallDays: 28,          // days on call around the due date
  onCallDayValue: 10,      // what you value one on-call day at, dollars
  supplies: 25,            // per client: handouts, oils, snacks, rebozo laundering
  feePct: 3,               // card or platform fee, percent of the fee
  missedBirthPct: 8,       // share of births a backup doula attends instead of you, percent
  backupPct: 50,           // share of the fee you pay the backup on those births, percent
  overheadYear: 1500,      // insurance, certification, CE, website per year
  birthsPerYear: 24,       // clients you take in a year
  taxPct: 30,              // set-aside for self-employment and income tax, percent
  targetHourly: 40,        // pre-tax dollars per worked hour you want
  annualGoal: 60000,       // pre-tax yearly income you want from births
};

export const num = (s) => {
  if (typeof s === "number") return s;
  const t = String(s ?? "").replace(/[$,%\s]/g, "");
  return t === "" ? NaN : Number(t);
};
export const money = (x) => `${x < 0 ? "-" : ""}$${Math.abs(Math.round(x)).toLocaleString("en-US")}`;
export const money2 = (x) => `${x < 0 ? "-" : ""}$${Math.abs(x).toFixed(2)}`;

export function hours(o) {
  const trips = o.prenatalVisits + o.postpartumVisits + 1; // one round trip per visit plus the birth
  const driving = (trips * 2 * o.travelMinutesEachWay) / 60;
  const visits = o.prenatalVisits * o.prenatalHours + o.postpartumVisits * o.postpartumHours;
  return { trips, driving, visits, labor: o.laborHours, admin: o.adminHours, total: visits + o.laborHours + o.adminHours + driving };
}

export function scenario(o) {
  const h = hours(o);
  const fees = o.fee * (o.feePct / 100);
  const backup = o.fee * (o.missedBirthPct / 100) * (o.backupPct / 100);
  const mileage = h.trips * 2 * o.milesEachWay * o.mileageRate;
  const overhead = o.overheadYear / o.birthsPerYear;
  const onCall = o.onCallDays * o.onCallDayValue;
  const costs = fees + backup + mileage + o.supplies + overhead;
  const net = o.fee - costs;
  const netAfterOnCall = net - onCall;
  const yearly = net * o.birthsPerYear;
  const yearlyHours = h.total * o.birthsPerYear;
  const hourly = net / h.total;
  // fee that reaches the target hourly after on-call value; exact because net is linear in fee
  const keep = 1 - o.feePct / 100 - (o.missedBirthPct / 100) * (o.backupPct / 100);
  const fixed = h.trips * 2 * o.milesEachWay * o.mileageRate + o.supplies + overhead + onCall;
  const feeForTarget = (o.targetHourly * h.total + fixed) / keep;
  return {
    hours: h, fees, backup, mileage, overhead, onCall, costs, net, netAfterOnCall, yearly, yearlyHours,
    afterTaxYearly: yearly * (1 - o.taxPct / 100),
    hourly, hourlyAfterOnCall: netAfterOnCall / h.total,
    feeForTarget, raise: feeForTarget - o.fee,
    birthsForGoal: netAfterOnCall > 0 ? Math.ceil(o.annualGoal / netAfterOnCall) : null,
  };
}

export function sensitivity(o, labor = [8, 14, 20, 30, 40]) {
  return labor.map((l) => {
    const r = scenario({ ...o, laborHours: l });
    return { labor: l, hours: r.hours.total, net: r.net, hourly: r.hourly, hourlyAfterOnCall: r.hourlyAfterOnCall, feeForTarget: r.feeForTarget };
  });
}

export function analyze(raw) {
  const o = { ...DEFAULTS, ...raw };
  const warnings = [];
  for (const k of Object.keys(DEFAULTS)) {
    if (!Number.isFinite(o[k])) warnings.push(`${k} must be a number.`);
    else if (o[k] < 0) warnings.push(`${k} cannot be negative.`);
  }
  for (const k of ["feePct", "missedBirthPct", "backupPct", "taxPct"]) if (Number.isFinite(o[k]) && o[k] > 100) warnings.push(`${k} cannot be above 100 percent.`);
  if (Number.isFinite(o.birthsPerYear) && o.birthsPerYear < 1) warnings.push("Births per year must be at least 1.");
  if (!warnings.length && hours(o).total <= 0) warnings.push("Worked hours must be above zero.");
  if (!warnings.length && 1 - o.feePct / 100 - (o.missedBirthPct / 100) * (o.backupPct / 100) <= 0) warnings.push("Fees and backup pay take the whole fee.");
  if (warnings.length) return { opts: o, warnings, result: null };
  const r = scenario(o);
  return { opts: o, warnings, result: r, rows: sensitivity(o), underTarget: r.hourlyAfterOnCall < o.targetHourly };
}

export function toCsv(a) {
  const r = a.result;
  const rows = [["labor_hours", "worked_hours", "net_per_birth_usd", "hourly_usd", "hourly_after_on_call_usd", "fee_for_target_usd"],
    ...a.rows.map((x) => [x.labor, x.hours, x.net, x.hourly, x.hourlyAfterOnCall, x.feeForTarget])];
  return rows.map((x, i) => (i ? [x[0], ...x.slice(1).map((n) => Number(n).toFixed(2))] : x).join(",")).join("\n") + "\n";
}
