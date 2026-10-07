// CDL school payback maths. Pure functions, no DOM, no network.
// Every rate is the driver's own input; nothing here is a market pay rate or a
// promise of how many miles any one driver will be given.

export const SAMPLE = {
  tuition: "5000", fees: "600", schoolWeeks: "6", currentWeekly: "800",
  milesPerWeek: "2200", centsPerMile: "0.52", weeksWorked: "48", extraWeekly: "60",
  sponsoredCentsPerMile: "0.46", sponsoredMonths: "12", sponsoredFees: "300", horizon: "36",
};

const num = (v) => {
  const s = String(v ?? "").replace(/[$,%\s]/g, "");
  if (s === "") return NaN;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
};
const opt = (v, d) => (String(v ?? "").trim() === "" ? d : num(v));
export const dollars = (n) => (n < 0 ? "-" : "") + "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const round2 = (n) => Math.round(n * 100) / 100;

export function parse(raw) {
  const errors = [];
  const milesPerWeek = num(raw.milesPerWeek), centsPerMile = num(raw.centsPerMile);
  if (!(milesPerWeek > 0)) errors.push("Enter the miles you expect to be paid for each week (more than 0).");
  if (!(centsPerMile > 0)) errors.push("Enter the pay per mile in dollars, for example 0.52 (more than 0).");
  const tuition = opt(raw.tuition, 0), fees = opt(raw.fees, 0), schoolWeeks = opt(raw.schoolWeeks, 0);
  const currentWeekly = opt(raw.currentWeekly, 0), weeksWorked = opt(raw.weeksWorked, 48), extraWeekly = opt(raw.extraWeekly, 0);
  const sponsoredCentsPerMile = opt(raw.sponsoredCentsPerMile, 0), sponsoredMonths = opt(raw.sponsoredMonths, 0);
  const sponsoredFees = opt(raw.sponsoredFees, 0), horizon = opt(raw.horizon, 36);
  for (const [n, v] of [["Tuition", tuition], ["Permit, medical and license fees", fees], ["Weeks in school", schoolWeeks], ["Weekly pay at your current job", currentWeekly], ["Extra weekly costs of driving", extraWeekly], ["Sponsored pay per mile", sponsoredCentsPerMile], ["Sponsored commitment months", sponsoredMonths], ["Sponsored fees", sponsoredFees]])
    if (!(v >= 0)) errors.push(`${n} must be 0 or more.`);
  if (!(weeksWorked > 0 && weeksWorked <= 52)) errors.push("Weeks driven per year must be more than 0 and no more than 52.");
  if (!(horizon >= 6 && horizon <= 120)) errors.push("Comparison period must be between 6 and 120 months.");
  return { errors, tuition, fees, schoolWeeks, currentWeekly, milesPerWeek, centsPerMile, weeksWorked, extraWeekly, sponsoredCentsPerMile, sponsoredMonths, sponsoredFees, horizon };
}

// Money per month of driving beyond what the current job already paid.
const monthlyGain = (p, cpm) => ((p.milesPerWeek * cpm - p.extraWeekly) * p.weeksWorked - p.currentWeekly * p.weeksWorked) / 12;

export function compute(raw) {
  const p = parse(raw);
  if (p.errors.length) return { errors: p.errors };
  const lostIncome = p.schoolWeeks * p.currentWeekly;
  const entryCost = p.tuition + p.fees + lostIncome;
  const weeklyGross = p.milesPerWeek * p.centsPerMile;
  const annualGross = weeklyGross * p.weeksWorked;
  const gain = monthlyGain(p, p.centsPerMile);
  const paybackMonths = gain > 0 ? entryCost / gain : null;
  const steps = [...new Set([1500, 1800, 2000, 2200, 2500, 2800, 3000, p.milesPerWeek])].sort((a, b) => a - b);
  const scenarios = steps.map((m) => {
    const g = monthlyGain({ ...p, milesPerWeek: m }, p.centsPerMile);
    return { milesPerWeek: m, annualGross: round2(m * p.centsPerMile * p.weeksWorked), monthlyGain: round2(g), paybackMonths: g > 0 ? round2(entryCost / g) : null };
  });
  // Company-paid school against paying yourself: the company pays at a lower rate for the commitment, then you move to your own rate.
  let sponsored = null;
  if (p.sponsoredCentsPerMile > 0 && p.sponsoredMonths > 0) {
    const sponsoredEntry = p.sponsoredFees + lostIncome;
    const during = Math.min(p.sponsoredMonths, p.horizon);
    const sponsoredNet = during * monthlyGain(p, p.sponsoredCentsPerMile) + (p.horizon - during) * gain - sponsoredEntry;
    const privateNet = p.horizon * gain - entryCost;
    sponsored = { sponsoredNet: round2(sponsoredNet), privateNet: round2(privateNet), difference: round2(privateNet - sponsoredNet), sponsoredMonthly: round2(monthlyGain(p, p.sponsoredCentsPerMile)), sponsoredEntry: round2(sponsoredEntry) };
  }
  const findings = [];
  if (gain <= 0) findings.push({ severity: "high", title: `At ${p.milesPerWeek} miles a week and ${dollars(p.centsPerMile)} a mile, driving pays ${dollars(Math.abs(gain))} a month less than your current job after the extra weekly costs. School never pays back on these figures.` });
  else if (paybackMonths > 24) findings.push({ severity: "medium", title: `Payback takes ${paybackMonths.toFixed(1)} months of driving. Check the miles a carrier will actually guarantee, not the miles in the recruiter's best example.` });
  findings.push({ severity: "info", title: `Getting in costs ${dollars(entryCost)}: tuition ${dollars(p.tuition)}, fees ${dollars(p.fees)} and ${dollars(lostIncome)} of pay you give up in ${p.schoolWeeks} school weeks.` });
  if (gain > 0) findings.push({ severity: "info", title: `Each 100 miles a week is worth ${dollars(100 * p.centsPerMile * p.weeksWorked / 12)} a month at ${dollars(p.centsPerMile)} a mile.` });
  if (sponsored && sponsored.difference > 0) findings.push({ severity: "info", title: `Over ${p.horizon} months, paying for school yourself comes out ${dollars(sponsored.difference)} ahead of the company-paid route on these figures.` });
  else if (sponsored) findings.push({ severity: "info", title: `Over ${p.horizon} months, the company-paid route comes out ${dollars(-sponsored.difference)} ahead of paying for school yourself on these figures. Read what you owe if you leave before ${p.sponsoredMonths} months.` });
  return { errors: [], input: p, entryCost: round2(entryCost), lostIncome: round2(lostIncome), weeklyGross: round2(weeklyGross), annualGross: round2(annualGross), monthlyGain: round2(gain), paybackMonths: paybackMonths === null ? null : round2(paybackMonths), scenarios, sponsored, findings };
}

export function summaryText(r) {
  const p = r.input;
  return [
    `CDL school: ${dollars(r.entryCost)} to get in (tuition ${dollars(p.tuition)}, fees ${dollars(p.fees)}, ${p.schoolWeeks} weeks of lost pay ${dollars(r.lostIncome)})`,
    `Driving: ${p.milesPerWeek} miles a week at ${dollars(p.centsPerMile)} a mile = ${dollars(r.weeklyGross)} a week, ${dollars(r.annualGross)} over ${p.weeksWorked} weeks`,
    `Gain over your current job after extra costs: ${dollars(r.monthlyGain)} a month`,
    r.paybackMonths === null ? "Payback: never on these figures" : `Payback: ${r.paybackMonths.toFixed(1)} months of driving`,
    ...r.findings.filter((f) => f.severity !== "info").map((f) => `- ${f.title}`),
  ].join("\n");
}

export function scenariosCsv(r) {
  return ["miles_per_week,annual_gross,monthly_gain,payback_months", ...r.scenarios.map((x) => `${x.milesPerWeek},${x.annualGross.toFixed(2)},${x.monthlyGain.toFixed(2)},${x.paybackMonths === null ? "" : x.paybackMonths.toFixed(2)}`)].join("\n");
}
