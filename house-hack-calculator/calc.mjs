// House-hack calculator: buy a 2-4 unit property, live in one unit, rent the rest.
// Pure functions, no DOM. Monthly amortisation, annual roll-up, all USD.

// HUD FHA annual mortgage insurance premium schedule for 30-year loans (ML 2023-05), plus the 1.75% upfront premium.
// The schedule changes; the page tells the reader to confirm the current one with their lender.
export const FHA_UPFRONT_MIP = 0.0175;
export const FHA_BASE_LIMIT = 726200;
export const FHA_MIN_DOWN = 3.5;
export const CONV_MIN_DOWN = 5;
export const EXPENSE_GROWTH = 0.03;
export const MAX_HOLD_YEARS = 30;

const num = (v, d = NaN) => {
  if (v === "" || v === null || v === undefined) return d;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
};

export function usd(n) {
  if (!Number.isFinite(n)) return "n/a";
  const r = Math.round(n);
  return (r < 0 ? "-$" : "$") + Math.abs(r).toLocaleString("en-US");
}

export function monthlyPayment(principal, annualRatePct, years) {
  const n = years * 12;
  const r = annualRatePct / 100 / 12;
  if (principal <= 0) return 0;
  if (r === 0) return principal / n;
  return (principal * r) / (1 - Math.pow(1 + r, -n));
}

// FHA annual MIP rate for a 30-year (or longer than 15) loan. Returns { rate, months } where months is how long it is charged.
export function fhaAnnualMip(baseLoan, ltvPct, years = 30) {
  const high = baseLoan > FHA_BASE_LIMIT;
  if (years <= 15) {
    if (ltvPct > 90) return { rate: high ? 0.0070 : 0.0040, months: years * 12 };
    return { rate: high ? 0.0070 : 0.0015, months: 132 };
  }
  if (ltvPct > 95) return { rate: high ? 0.0075 : 0.0055, months: years * 12 };
  if (ltvPct > 90) return { rate: high ? 0.0070 : 0.0050, months: years * 12 };
  return { rate: high ? 0.0070 : 0.0050, months: 132 };
}

// Rough private-mortgage-insurance rate by loan-to-value at purchase (illustrative midpoints of published ranges).
export function pmiRate(ltvPct) {
  if (ltvPct <= 80) return 0;
  if (ltvPct > 95) return 0.0085;
  if (ltvPct > 90) return 0.0062;
  if (ltvPct > 85) return 0.0045;
  return 0.0030;
}

export function validate(raw) {
  const i = {
    price: num(raw.price), downPct: num(raw.downPct), loanType: raw.loanType === "conv" ? "conv" : "fha",
    rate: num(raw.rate), termYears: num(raw.termYears, 30), units: num(raw.units),
    ownerUnitRent: num(raw.ownerUnitRent), otherRents: num(raw.otherRents), vacancyPct: num(raw.vacancyPct, 5),
    taxPct: num(raw.taxPct, 1.2), insuranceYr: num(raw.insuranceYr, 0), hoaMo: num(raw.hoaMo, 0), utilitiesMo: num(raw.utilitiesMo, 0),
    maintPct: num(raw.maintPct, 1.5), mgmtPct: num(raw.mgmtPct, 0), closingPct: num(raw.closingPct, 3),
    rentIfRenting: num(raw.rentIfRenting), rentGrowthPct: num(raw.rentGrowthPct, 3), appreciationPct: num(raw.appreciationPct, 3),
    liveYears: num(raw.liveYears, 2), holdYears: num(raw.holdYears, 10), sellCostPct: num(raw.sellCostPct, 6),
    pmiOverridePct: num(raw.pmiOverridePct, NaN),
  };
  const need = (k, label) => (!Number.isFinite(i[k]) ? `Enter ${label}.` : null);
  const err = need("price", "the purchase price") || need("downPct", "the down payment %") || need("rate", "the interest rate") ||
    need("units", "the number of units") || need("ownerUnitRent", "the market rent of the unit you would live in") ||
    need("otherRents", "the total rent from the other units") || need("rentIfRenting", "the rent you would pay otherwise");
  if (err) return { error: err };
  if (i.price <= 0) return { error: "Purchase price must be above zero." };
  if (![2, 3, 4].includes(i.units)) return { error: "Units must be 2, 3 or 4." };
  if (i.downPct < 0 || i.downPct >= 100) return { error: "Down payment must be between 0 and 100%." };
  if (i.loanType === "fha" && i.downPct < FHA_MIN_DOWN) return { error: `FHA requires at least ${FHA_MIN_DOWN}% down.` };
  if (i.loanType === "conv" && i.downPct < 3) return { error: "Conventional owner-occupied loans need at least 3% down (5% is more common on multi-unit)." };
  if (i.rate < 0 || i.rate > 25) return { error: "Interest rate should be between 0 and 25%." };
  if (![15, 20, 25, 30].includes(i.termYears)) return { error: "Loan term should be 15, 20, 25 or 30 years." };
  if (i.otherRents < 0 || i.ownerUnitRent < 0 || i.rentIfRenting < 0) return { error: "Rents cannot be negative." };
  if (i.vacancyPct < 0 || i.vacancyPct > 100) return { error: "Vacancy must be between 0 and 100%." };
  if (i.liveYears < 0 || i.liveYears > MAX_HOLD_YEARS) return { error: "Years you live there must be 0 to 30." };
  if (!Number.isInteger(i.holdYears) || i.holdYears < 1 || i.holdYears > MAX_HOLD_YEARS) return { error: "Years you hold it must be a whole number from 1 to 30." };
  if (i.holdYears > i.termYears) return { error: "Hold period cannot be longer than the loan term." };
  for (const k of ["taxPct", "insuranceYr", "hoaMo", "utilitiesMo", "maintPct", "mgmtPct", "closingPct", "sellCostPct"]) if (i[k] < 0) return { error: "Costs cannot be negative." };
  return { input: i };
}

// Loan set-up shared by every scenario.
function loanFor(i) {
  const baseLoan = i.price * (1 - i.downPct / 100);
  const ltv = 100 - i.downPct;
  let loan = baseLoan;
  let upfrontMip = 0;
  let mi = { rate: 0, months: 0, kind: "none" };
  if (i.loanType === "fha") {
    upfrontMip = baseLoan * FHA_UPFRONT_MIP;
    loan = baseLoan + upfrontMip;
    const m = fhaAnnualMip(baseLoan, ltv, i.termYears);
    mi = { rate: m.rate, months: m.months, kind: "FHA MIP" };
  } else {
    const rate = Number.isFinite(i.pmiOverridePct) ? i.pmiOverridePct / 100 : pmiRate(ltv);
    mi = { rate, months: Infinity, kind: "PMI" };
  }
  return { baseLoan, loan, upfrontMip, mi, pi: monthlyPayment(loan, i.rate, i.termYears) };
}

// One month of costs, given the balance and the year index (0-based) and whether the owner still lives in the building.
function monthOf(i, L, balance, month, living) {
  const y = Math.floor(month / 12);
  const g = Math.pow(1 + EXPENSE_GROWTH, y);
  const rg = Math.pow(1 + i.rentGrowthPct / 100, y);
  const value = i.price * Math.pow(1 + i.appreciationPct / 100, y);
  let mi = 0;
  if (i.loanType === "fha") {
    if (month < L.mi.months) mi = (balance * L.mi.rate) / 12;
  } else if (balance > 0.8 * i.price) {
    mi = (L.baseLoan * L.mi.rate) / 12;
  }
  const grossRent = (i.otherRents + (living ? 0 : i.ownerUnitRent)) * rg;
  const effectiveRent = grossRent * (1 - i.vacancyPct / 100);
  const costs = {
    pi: L.pi,
    mi,
    tax: (i.price * g * i.taxPct) / 100 / 12,
    insurance: (i.insuranceYr * g) / 12,
    hoa: i.hoaMo * g,
    utilities: i.utilitiesMo * g,
    maintenance: (value * i.maintPct) / 100 / 12,
    management: (effectiveRent * i.mgmtPct) / 100,
  };
  const total = Object.values(costs).reduce((a, b) => a + b, 0);
  return { grossRent, effectiveRent, costs, total, rg, value };
}

function irr(flows) {
  const npv = (r) => flows.reduce((s, f, t) => s + f / Math.pow(1 + r, t), 0);
  let lo = -0.99, hi = 10;
  if (npv(lo) * npv(hi) > 0) return NaN;
  for (let k = 0; k < 200; k++) {
    const mid = (lo + hi) / 2;
    if (npv(lo) * npv(mid) <= 0) hi = mid; else lo = mid;
  }
  return (lo + hi) / 2;
}

function simulate(i) {
  const L = loanFor(i);
  const r = i.rate / 100 / 12;
  let balance = L.loan;
  const years = [];
  let first = null;
  for (let y = 0; y < i.holdYears; y++) {
    const living = y < i.liveYears;
    let rentIn = 0, out = 0, principal = 0, interest = 0, mis = 0;
    for (let m = 0; m < 12; m++) {
      const month = y * 12 + m;
      const mo = monthOf(i, L, balance, month, living);
      const intr = balance * r;
      const prin = L.pi - intr;
      if (y === 0 && m === 0) first = mo;
      rentIn += mo.effectiveRent;
      out += mo.total;
      mis += mo.costs.mi;
      interest += intr;
      principal += prin;
      balance -= prin;
    }
    const rentElsewhere = i.rentIfRenting * Math.pow(1 + i.rentGrowthPct / 100, y) * 12;
    const propertyNet = rentIn - out;
    // Advantage over renting every year: if you live there you stop paying rent; if you moved out you still pay your own rent
    // elsewhere, but that is the same rent the baseline pays, so the property's own cash flow is the whole difference.
    const advantage = propertyNet + (living ? rentElsewhere : 0);
    const value = i.price * Math.pow(1 + i.appreciationPct / 100, y + 1);
    years.push({
      year: y + 1, living, rentIn, costs: out, propertyNet, advantage, principal, interest, mi: mis,
      balance: Math.max(0, balance), value, equity: value - Math.max(0, balance),
    });
  }
  return { L, years, first };
}

function year1MonthlyNet(i) {
  const L = loanFor(i);
  const mo = monthOf(i, L, L.loan, 0, true);
  return { net: mo.total - mo.effectiveRent, mo, L };
}

// Annualised return versus renting for a given set of inputs, used for the flat-prices stress case.
function returnVersusRenting(i) {
  const { years } = simulate(i);
  const last = years[years.length - 1];
  const proceeds = last.value * (1 - i.sellCostPct / 100) - last.balance;
  const flows = [-(i.price * (i.downPct + i.closingPct) / 100), ...years.map((y) => y.advantage)];
  flows[flows.length - 1] += proceeds;
  return { irr: irr(flows), gain: flows.reduce((a, b) => a + b, 0) };
}

export function plan(raw) {
  const v = validate(raw);
  if (v.error) return { error: v.error };
  const i = v.input;
  const { L, years, first } = simulate(i);
  const cashDown = i.price * (i.downPct / 100);
  const closing = i.price * (i.closingPct / 100);
  const cashToClose = cashDown + closing;
  const last = years[years.length - 1];
  const sellCost = last.value * (i.sellCostPct / 100);
  const saleProceeds = last.value - sellCost - last.balance;
  const flows = [-cashToClose, ...years.map((y) => y.advantage)];
  flows[flows.length - 1] += saleProceeds;
  const totalAdvantage = years.reduce((s, y) => s + y.advantage, 0);
  const totalGain = totalAdvantage + saleProceeds - cashToClose;
  const irrVal = irr(flows);

  const livingMonth1 = first.total - first.effectiveRent;
  const pitiMi = first.costs.pi + first.costs.mi + first.costs.tax + first.costs.insurance;
  const rentCoversPct = first.total > 0 ? (first.effectiveRent / first.total) * 100 : 0;

  // Rent needed from the other units so the first-year net housing cost is zero.
  const fixedCosts = first.total - first.costs.management;
  const neededEffective = fixedCosts / (1 - i.mgmtPct / 100);
  const neededGross = i.vacancyPct >= 100 ? Infinity : neededEffective / (1 - i.vacancyPct / 100);

  // Highest price at which the first-year net cost is zero, with the same down %, rate and rents (bisection on price).
  let lo = 0, hi = i.price * 4;
  for (let k = 0; k < 60; k++) {
    const mid = (lo + hi) / 2;
    if (year1MonthlyNet({ ...i, price: mid, insuranceYr: i.insuranceYr }).net > 0) hi = mid; else lo = mid;
  }
  const liveFreePrice = lo;

  // FHA self-sufficiency test (3-4 units): 75% of the rent from ALL units, owner's included, must cover the payment.
  let selfSufficiency = null;
  if (i.loanType === "fha" && i.units >= 3) {
    const credited = 0.75 * (i.ownerUnitRent + i.otherRents);
    const payment = first.costs.pi + first.costs.mi + first.costs.tax + first.costs.insurance + first.costs.hoa;
    selfSufficiency = { credited, payment, passes: credited >= payment, margin: credited - payment };
  }

  const flat = returnVersusRenting({ ...i, appreciationPct: 0 });
  const qualifyingRentCredit = 0.75 * i.otherRents;

  const sens = [];
  for (const d of [-1, 0, 1, 2]) {
    const s = year1MonthlyNet({ ...i, rate: Math.max(0, i.rate + d) });
    sens.push({ label: `Rate ${(Math.max(0, i.rate + d)).toFixed(2)}%`, group: "rate", net: s.net });
  }
  for (const cut of [0, 10, 20, 30]) {
    const s = year1MonthlyNet({ ...i, otherRents: i.otherRents * (1 - cut / 100) });
    sens.push({ label: cut === 0 ? "Rents as entered" : `Rents ${cut}% lower`, group: "rent", net: s.net });
  }
  for (const vac of [0, 5, 10, 20]) {
    const s = year1MonthlyNet({ ...i, vacancyPct: vac });
    sens.push({ label: `Vacancy ${vac}%`, group: "vacancy", net: s.net });
  }

  const advice = [];
  if (livingMonth1 <= 0) advice.push(`Rent from the other units covers the whole payment and costs: you would live free and pocket about ${usd(-livingMonth1)} a month.`);
  else advice.push(`After rent from the other units, living there costs you about ${usd(livingMonth1)} a month, ${usd(i.rentIfRenting - livingMonth1)} ${i.rentIfRenting - livingMonth1 >= 0 ? "less" : "more"} than the ${usd(i.rentIfRenting)} you would pay renting.`);
  advice.push(`Rent covers ${rentCoversPct.toFixed(0)}% of the building's monthly costs. To live free you need about ${usd(neededGross)} a month in rent from the other units (you entered ${usd(i.otherRents)}).`);
  if (selfSufficiency) advice.push(selfSufficiency.passes
    ? `FHA self-sufficiency test (3-4 units): passes. 75% of all unit rent (${usd(selfSufficiency.credited)}) covers the ${usd(selfSufficiency.payment)} payment with ${usd(selfSufficiency.margin)} to spare.`
    : `FHA self-sufficiency test (3-4 units): fails by ${usd(-selfSufficiency.margin)}. 75% of all unit rent is ${usd(selfSufficiency.credited)}, the payment is ${usd(selfSufficiency.payment)}. A lender would likely not approve this as entered; try a lower price, bigger down payment or a higher rent.`);
  if (i.units === 2) advice.push(`Many lenders count about 75% of the other unit's rent (${usd(qualifyingRentCredit)} a month here) toward qualifying income on a 2-unit purchase. Ask your lender how they treat it.`);
  if (i.loanType === "fha" && L.mi.months > 0 && Number.isFinite(L.mi.months) && L.mi.months < i.termYears * 12) advice.push(`FHA mortgage insurance drops off after ${Math.round(L.mi.months / 12)} years at this down payment.`);
  if (i.loanType === "fha" && L.mi.months >= i.termYears * 12) advice.push("At this down payment FHA mortgage insurance lasts for the whole loan; refinancing out of it later is the usual route.");
  if (i.liveYears < 1 && i.liveYears > 0) advice.push("Owner-occupied loans normally require you to move in and live there for at least a year.");
  if (i.liveYears === 0) advice.push("You entered 0 years living there. Owner-occupied (FHA or low-down conventional) loans require you to occupy the property; for an investment property use a different loan and calculator.");
  advice.push(`Over ${i.holdYears} years the house hack beats renting by about ${usd(totalGain)} (an annual return of ${Number.isFinite(irrVal) ? (irrVal * 100).toFixed(1) + "%" : "n/a"} on the ${usd(cashToClose)} you put in), counting cash flow and sale proceeds after ${i.sellCostPct}% selling costs.`);

  advice.push(`Stress test: if prices stay flat for ${i.holdYears} years the gain over renting is ${usd(flat.gain)} (${Number.isFinite(flat.irr) ? (flat.irr * 100).toFixed(1) + "% a year" : "no meaningful return"}). Most of the upside comes from a small down payment and the rent, so check how much of it depends on appreciation.`);

  return {
    input: i, loan: L, cashDown, closing, cashToClose, upfrontMip: L.upfrontMip,
    month1: first, pitiMi, livingMonth1, rentCoversPct, neededGross, liveFreePrice,
    selfSufficiency, qualifyingRentCredit, years, saleProceeds, sellCost, totalAdvantage, totalGain,
    irr: irrVal, flatIrr: flat.irr, flatGain: flat.gain, sens, advice, livesFree: livingMonth1 <= 0,
  };
}

export function sampleInput() {
  return {
    price: 400000, downPct: 3.5, loanType: "fha", rate: 6.5, termYears: 30, units: 3,
    ownerUnitRent: 1500, otherRents: 3100, vacancyPct: 5, taxPct: 1.2, insuranceYr: 2100, hoaMo: 0, utilitiesMo: 150,
    maintPct: 1.5, mgmtPct: 0, closingPct: 3, rentIfRenting: 1800, rentGrowthPct: 3, appreciationPct: 3,
    liveYears: 2, holdYears: 10, sellCostPct: 6,
  };
}

export function toCsv(r) {
  const rows = [["year", "living_there", "rent_collected", "costs", "property_cash_flow", "advantage_vs_renting", "loan_balance", "property_value", "equity"]];
  for (const y of r.years) rows.push([y.year, y.living ? "yes" : "no", y.rentIn, y.costs, y.propertyNet, y.advantage, y.balance, y.value, y.equity].map((x) => (typeof x === "number" ? Math.round(x) : x)));
  return rows.map((row) => row.join(",")).join("\n") + "\n";
}
