// UK Gift Aid and higher-rate relief, 2026/27, rest of the UK (England, Wales, NI).
// Rates were written from memory without network access: verify on GOV.UK.
export const RATES = {
  year: "2026/27",
  personalAllowance: 12570,
  taperStart: 100000,
  basicBand: 37700,
  additionalFrom: 125140,
  rates: { basic: 0.2, higher: 0.4, additional: 0.45 },
};

export const SAMPLE = { income: "60000", donation: "800" };

const num = (v) => {
  if (v === "" || v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
};
const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// Income tax on `income` of non-savings income. A Gift Aid gift of `gross`
// widens the basic-rate band and the higher-rate limit by `gross` and lowers
// the income that decides the personal allowance taper (adjusted net income).
export function incomeTax(income, gross = 0) {
  const R = RATES;
  const ani = Math.max(0, income - gross);
  const pa = Math.max(0, R.personalAllowance - Math.max(0, (ani - R.taperStart) / 2));
  const taxable = Math.max(0, income - pa);
  const basicTop = R.basicBand + gross;
  const higherTop = R.additionalFrom + gross;
  const inBasic = Math.min(taxable, basicTop);
  const inHigher = Math.max(0, Math.min(taxable, higherTop) - basicTop);
  const inAdd = Math.max(0, taxable - higherTop);
  const tax = inBasic * R.rates.basic + inHigher * R.rates.higher + inAdd * R.rates.additional;
  return { tax: r2(tax), personalAllowance: r2(pa), ani: r2(ani), taxable: r2(taxable), inBasic: r2(inBasic), inHigher: r2(inHigher), inAdd: r2(inAdd) };
}

export function compute(input) {
  const errors = [];
  const income = num(input.income), donation = num(input.donation);
  if (Number.isNaN(income) || income < 0) errors.push("Taxable income must be a number of zero or more.");
  if (Number.isNaN(donation) || donation < 0) errors.push("Donation must be a number of zero or more.");
  if (errors.length) return { errors };

  const gross = r2(donation / 0.8);
  const charityReclaim = r2(gross - donation);
  const before = incomeTax(income);
  const after = incomeTax(income, gross);
  const relief = r2(Math.max(0, before.tax - after.tax));
  const netCost = r2(donation - relief);
  const costPerPound = gross > 0 ? netCost / gross : 0;
  const aniBefore = before.ani;
  const toReach100k = income > RATES.taperStart ? r2(Math.min(income - RATES.taperStart, 1e12) * 0.8) : 0;
  const taxEnough = before.tax + 1e-9 >= charityReclaim;
  const findings = [];
  if (gross === 0) findings.push({ severity: "info", title: "Enter a donation to see what the charity receives and what you get back." });
  else findings.push({ severity: relief > 0 ? "high" : "info", title: `Your ${fmt(donation)} gift is worth ${fmt(gross)} to the charity. ${relief > 0 ? `You can claim ${fmt(relief)} back, so it costs you ${fmt(netCost)}.` : "As a basic-rate taxpayer you get no extra relief; the charity claims the 20%."}` });
  if (gross > 0 && !taxEnough) findings.push({ severity: "high", title: `You need to have paid at least ${fmt(charityReclaim)} of income tax or CGT in the year for Gift Aid to be valid; your income tax here is only ${fmt(before.tax)}. Gift Aid donations on too little tax can leave you owing the difference.` });
  if (income > RATES.taperStart && income <= RATES.additionalFrom && gross > 0) findings.push({ severity: "medium", title: `Your income is in the £100,000 taper band, where the gift also restores personal allowance. Effective relief on the gift is ${(relief / gross * 100).toFixed(0)}% on top of the 20% the charity claims.` });
  if (toReach100k > 0 && income <= RATES.additionalFrom) findings.push({ severity: "medium", title: `A gift of about ${fmt(toReach100k)} (${fmt(toReach100k / 0.8)} gross) would bring adjusted net income down to £100,000 and remove the 60% marginal rate.` });
  if (income > RATES.additionalFrom && gross > 0) findings.push({ severity: "info", title: "Additional-rate taxpayers get relief at 25% of the gross gift (45% less the 20% the charity claims)." });
  const obligations = [
    { title: "Tick the Gift Aid box", why: "The charity can only claim its 25% if you make a Gift Aid declaration. Keep a record of the gifts." },
    { title: "Claim the higher-rate relief", why: "Put the gross gift in the Gift Aid section of your Self Assessment return, or ask HMRC to change your tax code. The charity does not give you this part." },
    { title: "Carry back to last year", why: "You can elect on your return to treat a gift as made in the previous tax year, useful if last year's income was higher." },
    { title: "Check you pay enough tax", why: "Income tax plus CGT paid in the year must cover the tax the charity reclaims on all your Gift Aid gifts, or you are asked to pay the shortfall." },
  ];
  return { errors: [], input: { income, donation }, gross, charityReclaim, before, after, relief, netCost, costPerPound, aniBefore, toReach100k, taxEnough, findings, obligations, rates: RATES };
}

export function fmt(n) {
  return "£" + Number(n).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function summaryText(r) {
  return [
    `UK Gift Aid and higher-rate relief, ${RATES.year} (rest of the UK). Estimate only; verify on GOV.UK.`,
    `Taxable income before the gift: ${fmt(r.input.income)}`,
    `You give: ${fmt(r.input.donation)}`,
    `Charity receives with Gift Aid: ${fmt(r.gross)}`,
    `Income tax before the gift: ${fmt(r.before.tax)}`,
    `Income tax after the gift: ${fmt(r.after.tax)}`,
    `Relief you can claim: ${fmt(r.relief)}`,
    `Net cost to you: ${fmt(r.netCost)}`,
    "Not tax advice.",
  ].join("\n");
}
