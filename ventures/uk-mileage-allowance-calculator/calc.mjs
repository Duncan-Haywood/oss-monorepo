// UK business mileage: HMRC Approved Mileage Allowance Payments (AMAP).
// Rates are written from the published figures (unchanged since 2011);
// GOV.UK decides. Pure functions, no I/O.

export const RATES = {
  car: { label: "Car or van", first: 0.45, after: 0.25, threshold: 10000 },
  motorcycle: { label: "Motorcycle", first: 0.24, after: 0.24, threshold: 10000 },
  bicycle: { label: "Bicycle", first: 0.2, after: 0.2, threshold: 10000 },
};
export const PASSENGER_RATE = 0.05;
export const CLASS4_RATES = { 0: 0, 2: 0.02, 6: 0.06 };

export const SAMPLE = {
  status: "employee",
  vehicle: "car",
  miles: "14000",
  employerPence: "30",
  passengerMiles: "0",
  taxRate: "20",
  runningCosts: "",
  totalMiles: "",
  class4: "6",
};

const num = (v) => {
  const s = String(v ?? "").trim().replace(/[£,\s]/g, "");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
};
const r2 = (n) => Math.round(n * 100) / 100;

export function amap(vehicle, miles) {
  const r = RATES[vehicle];
  const first = Math.min(miles, r.threshold);
  const rest = Math.max(0, miles - r.threshold);
  return { first, rest, amount: r2(first * r.first + rest * r.after), firstRate: r.first, afterRate: r.after };
}

export function compute(input) {
  const errors = [];
  const status = input.status === "self-employed" ? "self-employed" : "employee";
  const vehicle = Object.hasOwn(RATES, input.vehicle) ? input.vehicle : "car";
  const miles = num(input.miles);
  if (miles === null || Number.isNaN(miles) || miles < 0) errors.push("Enter your business miles for the tax year (0 or more).");
  const taxRate = num(input.taxRate);
  if (taxRate === null || Number.isNaN(taxRate) || ![0, 19, 20, 21, 40, 42, 45, 48].includes(taxRate)) errors.push("Choose your marginal income tax rate.");
  const passengerMiles = num(input.passengerMiles) ?? 0;
  if (Number.isNaN(passengerMiles) || passengerMiles < 0) errors.push("Passenger miles must be 0 or more.");
  const employerPence = num(input.employerPence) ?? 0;
  if (Number.isNaN(employerPence) || employerPence < 0) errors.push("Employer rate must be 0 or more pence per mile.");
  const runningCosts = num(input.runningCosts);
  const totalMiles = num(input.totalMiles);
  if (Number.isNaN(runningCosts) || (runningCosts !== null && runningCosts < 0)) errors.push("Running costs must be 0 or more.");
  if (Number.isNaN(totalMiles) || (totalMiles !== null && totalMiles < 0)) errors.push("Total miles must be 0 or more.");
  if (totalMiles !== null && !Number.isNaN(totalMiles) && miles !== null && totalMiles < miles) errors.push("Total miles cannot be less than business miles.");
  if (errors.length) return { errors };

  const a = amap(vehicle, miles);
  const passenger = vehicle === "car" ? r2(passengerMiles * PASSENGER_RATE) : 0;
  const allowance = r2(a.amount + passenger);
  const rate = taxRate / 100;
  const findings = [];
  const out = { errors: [], status, vehicle, miles, a, passenger, allowance, taxRate, findings };

  if (status === "employee") {
    const paid = r2((miles * employerPence) / 100);
    const diff = r2(allowance - paid);
    out.paid = paid;
    out.shortfall = diff > 0 ? diff : 0;
    out.excess = diff < 0 ? -diff : 0;
    out.relief = r2(out.shortfall * rate);
    out.excessTax = r2(out.excess * rate);
    if (out.shortfall > 0) findings.push({ severity: "high", title: `Your employer pays £${paid.toFixed(2)} against an approved £${allowance.toFixed(2)}. You can claim tax relief on the £${out.shortfall.toFixed(2)} difference: about £${out.relief.toFixed(2)} at ${taxRate}%.` });
    else if (out.excess > 0) findings.push({ severity: "medium", title: `Your employer pays £${out.excess.toFixed(2)} more than the approved amount. The excess is taxable and should be reported by your employer (about £${out.excessTax.toFixed(2)} at ${taxRate}%).` });
    else findings.push({ severity: "info", title: "Your employer pays exactly the approved amount, so there is nothing to claim and nothing extra to pay tax on." });
    if (miles > RATES[vehicle].threshold && vehicle === "car") findings.push({ severity: "info", title: `Miles after the first 10,000 are approved at 25p, not 45p: ${a.rest.toLocaleString("en-GB")} of yours.` });
    findings.push({ severity: "info", title: "Claim with form P87 if your total job expenses are under £2,500, or on Self Assessment. You can go back up to 4 tax years." });
  } else {
    const c4 = Object.hasOwn(CLASS4_RATES, input.class4) ? CLASS4_RATES[input.class4] : 0;
    out.saving = r2(allowance * (rate + c4));
    out.simplified = allowance;
    findings.push({ severity: "high", title: `Simplified mileage: deduct £${allowance.toFixed(2)} from profit, saving about £${out.saving.toFixed(2)} in income tax${c4 ? " and Class 4 NI" : ""}.` });
    if (runningCosts !== null && totalMiles !== null && totalMiles > 0) {
      const share = miles / totalMiles;
      out.actual = r2(runningCosts * share);
      out.actualPerMile = r2(runningCosts / totalMiles * 100) / 100;
      out.better = out.actual > allowance ? "actual" : "simplified";
      out.actualSaving = r2(out.actual * (rate + c4));
      findings.push({ severity: "medium", title: out.better === "actual"
        ? `Actual costs look higher: £${out.actual.toFixed(2)} (${(share * 100).toFixed(0)}% business use) against £${allowance.toFixed(2)}. Actual costs also need capital allowances, and you generally cannot switch back for the same vehicle.`
        : `Simplified mileage looks better: £${allowance.toFixed(2)} against £${out.actual.toFixed(2)} of apportioned actual costs, and it needs no receipts for running costs.` });
    }
    findings.push({ severity: "info", title: "Home to a regular workplace is commuting, not business mileage. Keep a log of date, journey, purpose and miles." });
  }
  return out;
}

export function summaryText(r) {
  const L = [];
  L.push("UK business mileage allowance (AMAP)");
  L.push(`${RATES[r.vehicle].label}, ${r.miles.toLocaleString("en-GB")} business miles, ${r.status}`);
  L.push(`Approved amount: £${r.allowance.toFixed(2)}`);
  if (r.status === "employee") {
    L.push(`Paid by employer: £${r.paid.toFixed(2)}`);
    L.push(r.shortfall ? `Shortfall £${r.shortfall.toFixed(2)}; relief at ${r.taxRate}% about £${r.relief.toFixed(2)}` : `Excess taxable £${r.excess.toFixed(2)}`);
  } else {
    L.push(`Tax saving about £${r.saving.toFixed(2)}`);
    if (r.actual != null) L.push(`Apportioned actual costs £${r.actual.toFixed(2)} (${r.better} is higher)`);
  }
  L.push("Verify rates on GOV.UK. Not tax advice.");
  return L.join("\n");
}
