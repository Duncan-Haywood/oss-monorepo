// RV / camper rental host profit maths. Pure functions, no DOM, no network.
// Every figure is the owner's own input; nothing here is a market rate or a platform's actual fee.

export const SAMPLE = {
  rate: "195", nights: "70", available: "200", avgTrip: "4", cleanFeeCharged: "80", cleanCost: "60",
  wearPerNight: "18", feePct: "20", insurance: "1800", storageMonth: "100", loanMonth: "450",
  otherFixed: "600", depreciation: "3500", target: "3000",
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
  const rate = num(raw.rate), nights = num(raw.nights), avgTrip = num(raw.avgTrip);
  if (!(rate >= 0)) errors.push("Enter your nightly rental rate in dollars (0 or more).");
  if (!(nights > 0)) errors.push("Enter how many nights you expect to be rented per year (more than 0).");
  if (!(avgTrip >= 1)) errors.push("Enter the average trip length in nights (1 or more).");
  const available = opt(raw.available, 365), feePct = opt(raw.feePct, 0);
  const cleanFeeCharged = opt(raw.cleanFeeCharged, 0), cleanCost = opt(raw.cleanCost, 0), wearPerNight = opt(raw.wearPerNight, 0);
  const insurance = opt(raw.insurance, 0), storageMonth = opt(raw.storageMonth, 0), loanMonth = opt(raw.loanMonth, 0);
  const otherFixed = opt(raw.otherFixed, 0), depreciation = opt(raw.depreciation, 0), target = opt(raw.target, 0);
  for (const [n, v] of [["Cleaning fee charged", cleanFeeCharged], ["Cleaning cost per trip", cleanCost], ["Wear per night", wearPerNight],
    ["Insurance", insurance], ["Storage", storageMonth], ["Loan payment", loanMonth], ["Other yearly costs", otherFixed], ["Depreciation", depreciation]])
    if (!(v >= 0)) errors.push(`${n} must be 0 or more.`);
  if (!(available >= 1 && available <= 365)) errors.push("Nights available to rent must be from 1 to 365.");
  else if (nights > available) errors.push("Rented nights cannot be more than the nights available to rent.");
  if (!(feePct >= 0 && feePct < 60)) errors.push("Platform fee must be from 0 to under 60 percent.");
  if (!Number.isFinite(target)) errors.push("Profit target must be a number.");
  return { errors, rate, nights, available, avgTrip, cleanFeeCharged, cleanCost, wearPerNight, feePct, insurance, storageMonth, loanMonth, otherFixed, depreciation, target };
}

// Per-night contribution after the platform's cut, cleaning, and wear.
function perNight(p, rate) {
  const keep = 1 - p.feePct / 100;
  return rate * keep + (p.cleanFeeCharged * keep - p.cleanCost) / p.avgTrip - p.wearPerNight;
}
const fixedCash = (p) => p.insurance + p.storageMonth * 12 + p.loanMonth * 12 + p.otherFixed;

function profitAt(p, nights, rate) {
  const contribution = perNight(p, rate);
  const cash = contribution * nights - fixedCash(p);
  return { cash, afterDepreciation: cash - p.depreciation, contribution };
}

export function compute(raw) {
  const p = parse(raw);
  if (p.errors.length) return { errors: p.errors };
  const keep = 1 - p.feePct / 100;
  const trips = p.nights / p.avgTrip;
  const revenue = p.rate * p.nights + p.cleanFeeCharged * trips;
  const fee = revenue * (p.feePct / 100);
  const cleaning = p.cleanCost * trips, wear = p.wearPerNight * p.nights;
  const fixed = fixedCash(p);
  const here = profitAt(p, p.nights, p.rate);
  const occupancy = p.nights / p.available;
  const c = here.contribution;
  const beNightsCash = c > 0 ? fixed / c : null;
  const beNightsAll = c > 0 ? (fixed + p.depreciation) / c : null;
  // Rate that makes profit after depreciation equal the target, at the nights entered.
  const rateFor = (profit) => {
    const need = (fixed + p.depreciation + profit) / p.nights - (p.cleanFeeCharged * keep - p.cleanCost) / p.avgTrip + p.wearPerNight;
    return need / keep;
  };
  const beRate = round2(rateFor(0)), targetRate = round2(rateFor(p.target));
  const perRentedNight = here.afterDepreciation / p.nights;
  const feeCostPer5 = revenue * 0.05;
  const findings = [];
  if (here.cash < 0)
    findings.push({ severity: "high", title: `The loan, insurance and storage cost more than the rental pays: cash result is ${dollars(here.cash)} a year at ${p.nights} nights. You would need about ${beNightsCash ? Math.ceil(beNightsCash) : "more than any"} nights just to cover cash costs.` });
  else if (here.afterDepreciation < 0)
    findings.push({ severity: "medium", title: `Cash is positive (${dollars(here.cash)}) but after ${dollars(p.depreciation)} of depreciation the rig loses ${dollars(-here.afterDepreciation)} a year. You are being paid to use up the asset, not to own it.` });
  if (beNightsAll && beNightsAll > p.available)
    findings.push({ severity: "high", title: `Break-even after depreciation is ${Math.ceil(beNightsAll)} nights, more than the ${p.available} you can rent. At ${dollars(p.rate)} a night this rig cannot pay for itself; the rate has to rise to about ${dollars(beRate)}.` });
  if (occupancy > 0.6)
    findings.push({ severity: "medium", title: `${(occupancy * 100).toFixed(0)}% occupancy of your available nights is above what many owners get. Check the sweep at lower volumes before you rely on it.` });
  if (here.afterDepreciation < p.target)
    findings.push({ severity: "medium", title: `To earn ${dollars(p.target)} after depreciation at ${p.nights} nights you would charge about ${dollars(targetRate)} a night, against ${dollars(p.rate)} now.` });
  findings.push({ severity: "info", title: `Each 5 points of platform fee costs you about ${dollars(feeCostPer5)} a year at these numbers. Compare what each listing site takes before you choose one.` });
  findings.push({ severity: "info", title: `Per rented night: ${dollars(c)} after the platform cut, cleaning and wear, before fixed costs. Fixed cash costs run ${dollars(fixed)} a year, ${dollars(fixed / 365)} a day whether rented or not.` });
  const sweep = [0.5, 0.75, 1, 1.25, 1.5].map((f) => {
    const nights = Math.min(Math.round(p.nights * f), p.available);
    const r = profitAt(p, nights, p.rate);
    return { nights, occupancy: nights / p.available, cash: round2(r.cash), afterDepreciation: round2(r.afterDepreciation) };
  });
  return {
    errors: [], input: p, trips, revenue, fee, cleaning, wear, fixed, occupancy,
    cash: round2(here.cash), afterDepreciation: round2(here.afterDepreciation), contribution: c, perRentedNight,
    breakEvenNightsCash: beNightsCash, breakEvenNights: beNightsAll, breakEvenRate: beRate, targetRate, findings, sweep,
  };
}

export function summaryText(r) {
  const p = r.input;
  return [
    `RV rental: ${p.nights} nights rented of ${p.available} available (${(r.occupancy * 100).toFixed(0)}%), ${r.trips.toFixed(1)} trips at ${dollars(p.rate)} a night`,
    `Revenue ${dollars(r.revenue)}; platform fee ${dollars(r.fee)}; cleaning ${dollars(r.cleaning)}; wear ${dollars(r.wear)}; fixed cash ${dollars(r.fixed)}`,
    `Cash result ${dollars(r.cash)}; after ${dollars(p.depreciation)} depreciation ${dollars(r.afterDepreciation)}`,
    `Break-even: ${r.breakEvenNights ? Math.ceil(r.breakEvenNights) + " nights" : "not reachable at this rate"} after depreciation; ${dollars(r.breakEvenRate)} a night at ${p.nights} nights. Rate for ${dollars(p.target)}: ${dollars(r.targetRate)}`,
    ...r.findings.filter((f) => f.severity !== "info").map((f) => `- ${f.title}`),
  ].join("\n");
}

export function sweepCsv(r) {
  return ["nights_rented,occupancy_pct,cash_result,result_after_depreciation", ...r.sweep.map((x) => `${x.nights},${(x.occupancy * 100).toFixed(0)},${x.cash.toFixed(2)},${x.afterDepreciation.toFixed(2)}`)].join("\n");
}
