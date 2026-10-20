// UK company car tax (benefit in kind) calculator, 2026/27 rates. Pure functions, no I/O. Bad input is rejected with a message, never clamped.
// Rates from HMRC/GOV.UK company car guidance as published for 2026/27, cross-checked against several secondary guides in the building session:
// zero-emission cars 4% (5% 2027/28, 7% 2028/29, 9% 2029/30); plug-in hybrids at 1-50 g/km by official electric range 130+ miles 4%, 70-129 7%, 40-69 10%, 30-39 14%, under 30 16%;
// car fuel benefit multiplier GBP 29,200; maximum appropriate percentage 37% (diesels that do not meet RDE2 add 4 points, still capped); capital contributions reduce the list price by up to GBP 5,000;
// employer Class 1A National Insurance 15%. The percentage for petrol, diesel and hybrids above 50 g/km depends on a CO2 band table whose rows differ between secondary sources, so this tool takes that
// percentage from the user (it is printed on the car quote or P11D) instead of guessing it. Annual figures, one car, no other benefits.
// NOT modelled: vans, pool cars, cars first registered before 6 April 2020 on the old WLTP/NEDC mapping, employee NI (none is due on a car benefit), tax years other than 2026/27 (except the zero-emission schedule),
// optional remuneration / salary sacrifice car schemes, mileage allowances, and anything announced after this was written. Every result names its source to verify.

export const VERIFY = "GOV.UK 'Company car and car fuel benefit rates and allowances' and HMRC Employment Income Manual EIM24705 (appropriate percentages); GOV.UK 'Rates and thresholds for employers' (Class 1A)";
export const FUEL_MULTIPLIER = 29200;
export const MAX_PERCENT = 37;
export const DIESEL_SUPPLEMENT = 4;
export const CAPITAL_CONTRIBUTION_LIMIT = 5000;
export const CLASS_1A = 0.15;
export const ZEV_SCHEDULE = [
  { year: "2026/27", pct: 4 },
  { year: "2027/28", pct: 5 },
  { year: "2028/29", pct: 7 },
  { year: "2029/30", pct: 9 },
];
export const HYBRID_BANDS = [
  { minRange: 130, pct: 4, label: "130 miles or more" },
  { minRange: 70, pct: 7, label: "70 to 129 miles" },
  { minRange: 40, pct: 10, label: "40 to 69 miles" },
  { minRange: 30, pct: 14, label: "30 to 39 miles" },
  { minRange: 0, pct: 16, label: "under 30 miles" },
];
export const TAX_RATES = { "19": 0.19, "20": 0.2, "21": 0.21, "40": 0.4, "42": 0.42, "45": 0.45, "48": 0.48 };
export const CAR_TYPES = { zev: "Fully electric (0 g/km)", hybrid: "Plug-in hybrid (1 to 50 g/km)", other: "Petrol, diesel or other (51 g/km and over)" };

const money = (n) => (n < 0 ? "-" : "") + "GBP " + Number(Math.round(Math.abs(n) * 100) / 100).toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const r2 = (n) => Math.round(n * 100) / 100;
const blank = (v) => v === undefined || v === null || v === "";

export function hybridPercent(range) {
  return HYBRID_BANDS.find((b) => range >= b.minRange);
}

function num(v, def = 0) {
  return blank(v) ? def : Number(v);
}

export function parse(input) {
  const i = input || {};
  const errors = [];
  const listPrice = Number(i.listPrice);
  if (blank(i.listPrice) || !Number.isFinite(listPrice) || listPrice <= 0) errors.push("Enter the car's P11D list price as more than zero.");
  else if (listPrice > 2000000) errors.push("A list price above GBP 2,000,000 looks like a typo.");
  const accessories = num(i.accessories);
  if (!Number.isFinite(accessories) || accessories < 0) errors.push("Enter optional accessories as zero or more.");
  const capContribution = num(i.capContribution);
  if (!Number.isFinite(capContribution) || capContribution < 0) errors.push("Enter your one-off capital contribution as zero or more.");
  const carType = String(i.carType || "zev");
  if (!CAR_TYPES[carType]) errors.push("Pick the type of car.");
  const range = num(i.range);
  if (carType === "hybrid" && (blank(i.range) || !Number.isFinite(range) || range < 0 || range > 1000)) errors.push("Enter the plug-in hybrid's official zero-emission range in miles (0 to 1,000).");
  const otherPct = num(i.otherPct);
  if (carType === "other" && (blank(i.otherPct) || !Number.isFinite(otherPct) || otherPct < 1 || otherPct > MAX_PERCENT)) errors.push(`Enter the car's company car tax percentage (from its quote or P11D), between 1 and ${MAX_PERCENT}.`);
  const diesel = i.diesel === true || i.diesel === "yes" || i.diesel === "true";
  const privateContribution = num(i.privateContribution);
  if (!Number.isFinite(privateContribution) || privateContribution < 0) errors.push("Enter what you pay each year to use the car privately as zero or more.");
  const fuel = String(i.fuel || "no");
  if (fuel !== "no" && fuel !== "yes") errors.push("Say whether your employer pays for private fuel.");
  const days = blank(i.days) ? 365 : Number(i.days);
  if (!Number.isInteger(days) || days < 1 || days > 366) errors.push("Enter the number of days in the year the car was available to you, from 1 to 366.");
  const taxKey = String(i.taxRate || "40");
  if (!TAX_RATES[taxKey]) errors.push("Pick your highest rate of income tax.");
  const bPrice = num(i.bPrice);
  if (!Number.isFinite(bPrice) || bPrice < 0 || bPrice > 2000000) errors.push("Enter the comparison car's list price as zero (to skip) or a sensible amount.");
  const bPct = num(i.bPct);
  if (bPrice > 0 && (!Number.isFinite(bPct) || bPct < 1 || bPct > MAX_PERCENT)) errors.push(`Enter the comparison car's company car tax percentage between 1 and ${MAX_PERCENT}.`);
  return { errors, listPrice, accessories, capContribution, carType, range, otherPct, diesel, privateContribution, fuel: fuel === "yes", days, taxKey, taxRate: TAX_RATES[taxKey], bPrice, bPct };
}

// One car's annual benefit, tax and employer cost.
export function carCost(o) {
  const { listPrice, accessories = 0, capContribution = 0, pct, days = 365, privateContribution = 0, fuel = false, taxRate, fuelApplies = true } = o;
  const capUsed = Math.min(capContribution, CAPITAL_CONTRIBUTION_LIMIT);
  const bikPrice = Math.max(0, r2(listPrice + accessories - capUsed));
  const fraction = days / 365;
  const gross = r2(bikPrice * (pct / 100) * fraction);
  const benefit = Math.max(0, r2(gross - privateContribution));
  const fuelBenefit = fuel && fuelApplies ? r2(FUEL_MULTIPLIER * (pct / 100) * fraction) : 0;
  const tax = r2(benefit * taxRate);
  const fuelTax = r2(fuelBenefit * taxRate);
  const employerClass1A = r2((benefit + fuelBenefit) * CLASS_1A);
  return { pct, bikPrice, capUsed, gross, benefit, fuelBenefit, tax, fuelTax, totalTax: r2(tax + fuelTax), monthlyTax: r2((tax + fuelTax) / 12), employerClass1A };
}

export function compute(input) {
  const p = parse(input);
  if (p.errors.length) return { errors: p.errors };
  let pct, basis;
  if (p.carType === "zev") { pct = ZEV_SCHEDULE[0].pct; basis = "Zero-emission rate for 2026/27"; }
  else if (p.carType === "hybrid") { const band = hybridPercent(p.range); pct = band.pct; basis = `Plug-in hybrid with an electric range of ${band.label}`; }
  else { pct = p.otherPct; basis = "Percentage you entered"; if (p.diesel) { pct = Math.min(MAX_PERCENT, pct + DIESEL_SUPPLEMENT); basis += `, plus ${DIESEL_SUPPLEMENT} points for a diesel that does not meet RDE2 (capped at ${MAX_PERCENT}%)`; } }
  const common = { listPrice: p.listPrice, accessories: p.accessories, capContribution: p.capContribution, days: p.days, privateContribution: p.privateContribution, fuel: p.fuel, taxRate: p.taxRate };
  const a = carCost({ ...common, pct, fuelApplies: p.carType !== "zev" });
  const b = p.bPrice > 0 ? carCost({ listPrice: p.bPrice, days: p.days, pct: p.bPct, fuel: p.fuel, taxRate: p.taxRate }) : null;
  const schedule = p.carType === "zev" || (p.carType === "hybrid" && p.range >= 130)
    ? ZEV_SCHEDULE.map((s) => ({ year: s.year, pct: s.pct, ...carCost({ ...common, pct: s.pct, fuelApplies: p.carType !== "zev" }) }))
    : null;
  const scheduleTotal = schedule ? r2(schedule.reduce((t, s) => t + s.totalTax, 0)) : 0;
  const diff = b ? r2(b.totalTax - a.totalTax) : 0;
  const findings = [];
  const obligations = [];
  findings.push({ severity: "info", title: `${basis}: ${pct}% of a taxable car price of ${money(a.bikPrice)} gives a taxable benefit of ${money(a.benefit)} for the year${p.days < 365 ? ` (${p.days} days available)` : ""}. At ${Math.round(p.taxRate * 100)}% that is ${money(a.tax)} a year, ${money(r2(a.tax / 12))} a month through your tax code.` });
  if (p.carType === "zev") findings.push({ severity: "info", title: "Charging an electric car you are given: electricity your employer pays for, at work or on a public network, is not a taxable fuel benefit, so no fuel charge is added." });
  if (a.fuelBenefit > 0) findings.push({ severity: "high", title: `Free private fuel adds a fuel benefit of ${money(a.fuelBenefit)} (${money(FUEL_MULTIPLIER)} x ${pct}%), costing ${money(a.fuelTax)} in tax. Unless you drive a very large private mileage, paying for your own private fuel is almost always cheaper.` });
  if (p.capContribution > CAPITAL_CONTRIBUTION_LIMIT) findings.push({ severity: "medium", title: `Only ${money(CAPITAL_CONTRIBUTION_LIMIT)} of a capital contribution reduces the taxable price; the other ${money(p.capContribution - CAPITAL_CONTRIBUTION_LIMIT)} gets no relief.` });
  findings.push({ severity: "info", title: `Your employer pays Class 1A National Insurance of ${money(a.employerClass1A)} a year (15%) on the benefit. You pay no National Insurance on a company car.` });
  if (schedule) findings.push({ severity: "medium", title: `The zero-emission rate is scheduled to rise each year: ${ZEV_SCHEDULE.map((s) => `${s.year} ${s.pct}%`).join(", ")}. If the car and your tax rate stayed the same, the tax over those four years would be ${money(scheduleTotal)}. Rates for later years are set at future Budgets.` });
  if (b) findings.push({ severity: diff >= 0 ? "high" : "medium", title: diff >= 0 ? `The comparison car costs you ${money(b.totalTax)} a year in tax at ${p.bPct}% against ${money(a.totalTax)} for this one: ${money(diff)} a year more, ${money(r2(diff * 4))} over four years at today's rates.` : `The comparison car costs ${money(b.totalTax)} a year in tax against ${money(a.totalTax)} for this one, so this car costs you ${money(-diff)} a year more in tax.` });
  findings.push({ severity: "info", title: "The benefit counts as taxable income. If it lifts your income over GBP 50,270 or GBP 100,000 the tax on the top slice can be higher than the rate you picked. This tool applies one rate to the whole benefit." });
  findings.push({ severity: "info", title: "Not modelled: vans, tax years other than 2026/27 (apart from the zero-emission schedule), salary sacrifice or optional remuneration car schemes, mileage allowances, and anything announced after this was written." });
  obligations.push({ ref: "P11D", title: "Check your employer's P11D figures", why: "The list price, CO2 or range figure and registration date must match your car's documents. A wrong percentage is the commonest error." });
  obligations.push({ ref: "Tax code", title: "Check your tax code reflects the benefit", why: "Your employer or HMRC usually collects the tax by reducing your tax code. If the car changes, tell HMRC so the code is updated." });
  obligations.push({ ref: "Verify", title: "Verify the rates", why: `Confirm the percentage and the fuel multiplier at ${VERIFY}. Rates change at each Budget; this tool does not.` });
  return { errors: [], carType: p.carType, carTypeLabel: CAR_TYPES[p.carType], pct, basis, taxRate: p.taxRate, days: p.days, a, b, diff, schedule, scheduleTotal, findings, obligations };
}

export const SAMPLE = { listPrice: 45000, accessories: 0, capContribution: 0, carType: "zev", range: "", otherPct: "", diesel: "no", privateContribution: 0, fuel: "no", days: 365, taxRate: "40", bPrice: 32000, bPct: 28 };

export function summaryText(r) {
  const L = ["UK company car tax (2026/27 rates)", "", `Car: ${r.carTypeLabel}`, `Rate: ${r.pct}% (${r.basis})`, `Tax rate used: ${Math.round(r.taxRate * 100)}%; days available: ${r.days}`, "",
    `Taxable car price: ${money(r.a.bikPrice)}`, `Taxable benefit: ${money(r.a.benefit)}`, r.a.fuelBenefit > 0 ? `Fuel benefit: ${money(r.a.fuelBenefit)}` : "No fuel benefit",
    `Income tax on the car: ${money(r.a.totalTax)} a year (${money(r.a.monthlyTax)} a month)`, `Employer Class 1A: ${money(r.a.employerClass1A)} a year`];
  if (r.b) L.push("", `Comparison car at ${r.b.pct}%: tax ${money(r.b.totalTax)} a year, difference ${money(r.diff)} a year`);
  if (r.schedule) L.push("", "Zero-emission schedule:", ...r.schedule.map((s) => `  ${s.year}: ${s.pct}% -> ${money(s.totalTax)}`));
  L.push("", ...r.findings.map((f) => `- ${f.title}`), "", ...r.obligations.map((o) => `- ${o.title}: ${o.why}`), "", `Verify against: ${VERIFY}`, "Not tax advice. No warranty.");
  return L.join("\n");
}
