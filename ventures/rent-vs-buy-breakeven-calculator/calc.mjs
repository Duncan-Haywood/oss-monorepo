// Rent-vs-buy break-even model. Pure functions, no dependencies, nothing leaves the browser.
//
// Both households start with the same cash and spend the same monthly amount on housing. The buyer puts the
// down payment and closing costs into the house; the renter invests that cash and then invests every month
// whatever the buyer pays above the rent (or draws it down if renting costs more). At each year-end the
// buyer's net worth is the sale proceeds (home value less selling costs less the loan balance) and the
// renter's is the investment account, so the break-even year is the first year buying is ahead.
//
// Per month, buyer:  loan payment (fixed-rate, level), property tax, insurance, maintenance (% of the
//   current home value, per year), HOA, and PMI on the original loan while the loan is above 80% of the
//   purchase price. Tax: mortgage interest + property tax up to the SALT cap + other itemized deductions,
//   minus the standard deduction, times the marginal rate, floored at zero -- so a buyer who would not
//   itemize gets no break, which is most buyers.
// Renter: rent (grows yearly) + renter's insurance. Investment growth is monthly-compounded from an annual
//   after-tax return the user types.

export const DEFAULTS = {
  homePrice: 450000,
  downPct: 20,
  ratePct: 6.5,
  termYears: 30,
  closingBuyPct: 3,
  sellingCostPct: 6,
  propTaxPct: 1.1,
  insurancePct: 0.4,
  maintenancePct: 1,
  hoaMonthly: 0,
  pmiPct: 0.6,
  appreciationPct: 3.5,
  rentMonthly: 2400,
  rentGrowthPct: 3.5,
  rentersInsuranceMonthly: 20,
  investReturnPct: 6,
  marginalTaxPct: 24,
  standardDeduction: 32200,
  saltCap: 40000,
  otherItemized: 0,
  horizonYears: 10,
};

export const num = (s) => {
  if (typeof s === "number") return s;
  const t = String(s ?? "").replace(/[$,%\s]/g, "");
  return t === "" ? NaN : Number(t);
};
export const money = (x) => {
  const sign = x < 0 ? "-" : "";
  return `${sign}$${Math.abs(Math.round(x)).toLocaleString("en-US")}`;
};
export const pct = (x, d = 1) => `${(x * 100).toFixed(d)}%`;

export function payment(loan, annualRate, months) {
  if (loan <= 0) return 0;
  const r = annualRate / 12;
  return r === 0 ? loan / months : (loan * r) / (1 - Math.pow(1 + r, -months));
}

// Simulate year by year. Returns one row per year 1..years.
export function simulate(o, years = 30) {
  const price = o.homePrice;
  const down = price * (o.downPct / 100);
  const loan0 = price - down;
  const n = Math.round(o.termYears * 12);
  const r = o.ratePct / 100 / 12;
  const pay = payment(loan0, o.ratePct / 100, n);
  const g = Math.pow(1 + o.investReturnPct / 100, 1 / 12) - 1;
  let balance = loan0;
  let portfolio = down + price * (o.closingBuyPct / 100);
  const rows = [];
  for (let y = 1; y <= years; y++) {
    const homeStart = price * Math.pow(1 + o.appreciationPct / 100, y - 1);
    const rent = o.rentMonthly * Math.pow(1 + o.rentGrowthPct / 100, y - 1);
    let interestYear = 0;
    const startBal = balance;
    const monthlyLoan = [];
    for (let m = 0; m < 12; m++) {
      const idx = (y - 1) * 12 + m;
      if (idx < n && balance > 0) {
        const interest = balance * r;
        const principal = Math.min(balance, pay - interest);
        interestYear += interest;
        balance -= principal;
        monthlyLoan.push(interest + principal);
      } else monthlyLoan.push(0);
    }
    const propTax = homeStart * (o.propTaxPct / 100);
    const itemized = interestYear + Math.min(propTax, o.saltCap) + o.otherItemized;
    const taxSaving = Math.max(0, itemized - o.standardDeduction) * (o.marginalTaxPct / 100);
    const pmiOn = loan0 > price * 0.8 && startBal > price * 0.8;
    const owner =
      (propTax + homeStart * (o.insurancePct / 100) + homeStart * (o.maintenancePct / 100)) / 12 +
      o.hoaMonthly + (pmiOn ? (loan0 * (o.pmiPct / 100)) / 12 : 0);
    let buyerYearCost = 0;
    let renterYearCost = 0;
    for (let m = 0; m < 12; m++) {
      const buyer = monthlyLoan[m] + owner - taxSaving / 12;
      const renter = rent + o.rentersInsuranceMonthly;
      buyerYearCost += buyer;
      renterYearCost += renter;
      portfolio = portfolio * (1 + g) + (buyer - renter);
    }
    const homeEnd = price * Math.pow(1 + o.appreciationPct / 100, y);
    const sale = homeEnd * (1 - o.sellingCostPct / 100);
    const buyerNet = sale - balance;
    rows.push({
      year: y, homeValue: homeEnd, balance, buyerNet, renterNet: portfolio, advantage: buyerNet - portfolio,
      buyerMonthly: buyerYearCost / 12, renterMonthly: renterYearCost / 12, taxSavingYear: taxSaving, pmi: pmiOn,
    });
  }
  return rows;
}

// Rent (month 1) at which the two households finish level at the horizon.
export function breakEvenRent(o, horizon) {
  let lo = 0, hi = o.homePrice / 50;
  const adv = (rent) => simulate({ ...o, rentMonthly: rent }, horizon)[horizon - 1].advantage;
  if (adv(hi) < 0) return hi;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (adv(mid) > 0) hi = mid; else lo = mid;
  }
  return (lo + hi) / 2;
}

export function validate(o) {
  const w = [];
  if (!(o.homePrice > 0)) w.push("Enter a home price above zero.");
  if (!(o.rentMonthly > 0)) w.push("Enter the monthly rent for a comparable place.");
  if (o.downPct < 0 || o.downPct > 100) w.push("Down payment must be between 0% and 100%.");
  if (!(o.termYears >= 1 && o.termYears <= 40)) w.push("Mortgage term must be 1 to 40 years.");
  if (!(o.horizonYears >= 1 && o.horizonYears <= 30)) w.push("Years you will stay must be 1 to 30.");
  return w;
}

export function analyze(raw) {
  const o = { ...DEFAULTS, ...raw };
  o.horizonYears = Math.round(o.horizonYears);
  const warnings = validate(o);
  if (warnings.length) return { opts: o, warnings, rows: [] };
  const rows = simulate(o, 30);
  const h = rows[o.horizonYears - 1];
  const crossing = rows.find((r) => r.advantage >= 0);
  const apps = [-3, -1.5, 0, 1.5, 3].map((a) => Math.round((o.appreciationPct + a) * 10) / 10);
  const returns = [-2, -1, 0, 1, 2].map((x) => Math.round((o.investReturnPct + x) * 10) / 10);
  const grid = apps.map((a) => ({
    appreciation: a,
    cells: returns.map((rt) => ({
      invest: rt,
      advantage: simulate({ ...o, appreciationPct: a, investReturnPct: rt }, o.horizonYears)[o.horizonYears - 1].advantage,
    })),
  }));
  const warn = [];
  if (o.downPct < 20) warn.push(`With ${o.downPct}% down the lender will likely charge mortgage insurance until the loan falls to 80% of the price; it is included at ${o.pmiPct}% of the loan a year.`);
  if (h.taxSavingYear === 0) warn.push("At these figures the mortgage deduction does not beat the standard deduction, so owning gets no tax break in the model.");
  if (crossing && crossing.year > o.horizonYears) warn.push(`Buying only pulls ahead in year ${crossing.year}, after the ${o.horizonYears} years you plan to stay.`);
  return {
    opts: o, warnings: warn, rows,
    horizon: h,
    breakEvenYear: crossing ? crossing.year : null,
    breakEvenRent: breakEvenRent(o, o.horizonYears),
    verdict: h.advantage >= 0 ? "buy" : "rent",
    upfront: o.homePrice * (o.downPct / 100 + o.closingBuyPct / 100),
    grid,
  };
}

export function toCsv(a) {
  const head = "year,home_value,loan_balance,buyer_net_worth,renter_net_worth,buying_advantage";
  const lines = a.rows.map((r) => [r.year, ...[r.homeValue, r.balance, r.buyerNet, r.renterNet, r.advantage].map((x) => x.toFixed(0))].join(","));
  return [head, ...lines].join("\n");
}
