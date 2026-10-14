// UK EMI (Enterprise Management Incentive) option tax: the income tax on any
// discount at exercise, Capital Gains Tax on the sale (Business Asset Disposal
// Relief when the option is held 2+ years from grant), the cash you keep, and
// a comparison with an unapproved option. Browser-only. Not tax advice.

// Rates as understood for 2025/26 and 2026/27 (England, Wales, NI). Verify on GOV.UK.
export const YEARS = {
  "2025": { label: "2025/26", badr: 0.14 },
  "2026": { label: "2026/27", badr: 0.18 },
};
export const RATES = {
  cgtBasic: 0.18,
  cgtHigher: 0.24,
  aea: 3000,
  badrLifetime: 1000000,
  badrMonths: 24,
  pa: 12570,
  taperStart: 100000,
  basicBand: 37700,
  additionalThreshold: 125140,
  itBasic: 0.20,
  itHigher: 0.40,
  itAdditional: 0.45,
};

export const SAMPLE = {
  options: "10000", strike: "0.10", grantValue: "1.00", salePrice: "5.00",
  income: "60000", months: "36", year: "2025", badrUsed: "0", aeaUsed: "0",
};

const FIELDS = ["options", "strike", "grantValue", "salePrice", "income", "months", "badrUsed", "aeaUsed"];
const round2 = (n) => Math.round(n * 100) / 100;
const money0 = (n) => "£" + Math.round(n).toLocaleString("en-GB");

export function personalAllowance(income) {
  if (income <= RATES.taperStart) return RATES.pa;
  return Math.max(0, RATES.pa - (income - RATES.taperStart) / 2);
}

// Income tax on non-savings income (rUK bands, no Scottish rates).
export function incomeTax(income) {
  const taxable = Math.max(0, income - personalAllowance(income));
  const basic = Math.min(taxable, RATES.basicBand);
  const higher = Math.max(0, Math.min(taxable - RATES.basicBand, RATES.additionalThreshold - RATES.basicBand));
  const additional = Math.max(0, taxable - RATES.additionalThreshold);
  return basic * RATES.itBasic + higher * RATES.itHigher + additional * RATES.itAdditional;
}

// CGT on `gain`, with `incomeAfter` as the taxable-income base the gain sits on.
export function capitalGainsTax({ gain, incomeAfter, badrEligible, badrRate, badrUsed = 0, aeaUsed = 0 }) {
  gain = Math.max(0, gain);
  let aea = Math.max(0, RATES.aea - aeaUsed);
  const room = Math.max(0, RATES.badrLifetime - badrUsed);
  const badrGain = badrEligible ? Math.min(gain, room) : 0;
  const otherGain = gain - badrGain;
  const aeaOther = Math.min(aea, otherGain);
  aea -= aeaOther;
  const aeaBadr = Math.min(aea, badrGain);
  const taxableBadr = badrGain - aeaBadr;
  const taxableOther = otherGain - aeaOther;
  const taxableIncome = Math.max(0, incomeAfter - personalAllowance(incomeAfter));
  // BADR gains use up the basic-rate band first.
  const bandLeft = Math.max(0, RATES.basicBand - taxableIncome - taxableBadr);
  const otherBasic = Math.min(taxableOther, bandLeft);
  const otherHigher = taxableOther - otherBasic;
  const badrTax = taxableBadr * badrRate;
  const otherTax = otherBasic * RATES.cgtBasic + otherHigher * RATES.cgtHigher;
  return { tax: badrTax + otherTax, badrGain, taxableBadr, taxableOther, badrTax, otherTax, aeaUsed: aeaOther + aeaBadr };
}

// One full run for one sale price.
function run(v, salePrice, badrAllowed) {
  const badrRate = YEARS[v.year].badr;
  const proceeds = v.options * salePrice;
  const exerciseCost = v.options * v.strike;
  const discountPer = Math.max(0, Math.min(v.grantValue, salePrice) - v.strike);
  const discount = v.options * discountPer;
  const itOnDiscount = incomeTax(v.income + discount) - incomeTax(v.income);
  const base = v.options * (v.strike + discountPer);
  const gain = Math.max(0, proceeds - base);
  const cgt = capitalGainsTax({ gain, incomeAfter: v.income + discount, badrEligible: badrAllowed, badrRate, badrUsed: v.badrUsed, aeaUsed: v.aeaUsed });
  const net = proceeds - exerciseCost - itOnDiscount - cgt.tax;
  return { proceeds, exerciseCost, discount, itOnDiscount, base, gain, cgt, net, totalTax: itOnDiscount + cgt.tax };
}

export function compute(raw) {
  const errors = [];
  const num = (k, label) => {
    const s = String(raw[k] ?? "").trim();
    const n = s === "" ? 0 : Number(s);
    if (!Number.isFinite(n) || n < 0) { errors.push(`${label} must be a number of 0 or more.`); return 0; }
    return n;
  };
  const labels = { options: "Number of options", strike: "Exercise price", grantValue: "Market value at grant", salePrice: "Sale price per share", income: "Other taxable income", months: "Months from grant to sale", badrUsed: "Business Asset Disposal Relief already used", aeaUsed: "Annual exempt amount already used" };
  const v = {};
  for (const k of FIELDS) v[k] = num(k, labels[k]);
  v.year = String(raw.year ?? "2025");
  if (!YEARS[v.year]) errors.push("Choose a tax year.");
  if (v.options === 0 && !errors.length) errors.push("Enter how many options you are exercising.");
  if (errors.length) return { errors };

  const badrOk = v.months >= RATES.badrMonths;
  const emi = run(v, v.salePrice, badrOk);
  const noBadr = run(v, v.salePrice, false);
  const spread = v.options * (v.salePrice - v.strike);
  const unapprovedTax = Math.max(0, incomeTax(v.income + Math.max(0, spread)) - incomeTax(v.income));
  const unapprovedNet = emi.proceeds - emi.exerciseCost - unapprovedTax;
  const badrSaving = noBadr.totalTax - emi.totalTax;
  const emiSaving = unapprovedTax - emi.totalTax;
  const effective = spread > 0 ? emi.totalTax / spread : 0;

  const scenarios = [0.5, 1, 2, 5, 10].map((m) => {
    const price = round2(v.salePrice * m);
    const r = run(v, price, badrOk);
    return { multiple: m, price, net: round2(r.net), tax: round2(r.totalTax) };
  });

  const findings = [];
  if (spread <= 0) findings.push({ severity: "medium", title: "The sale price is not above the exercise price, so there is no gain to tax." });
  if (emi.discount > 0) findings.push({ severity: "high", title: `Your exercise price (${v.strike}) is below the market value at grant (${v.grantValue}). The ${money0(emi.discount)} difference is taxed as income at exercise, costing ${money0(emi.itOnDiscount)}. Grant options at full market value (HMRC valuation agreement) to avoid it.` });
  if (!badrOk) findings.push({ severity: "high", title: `You have held the option ${v.months} months from grant. Business Asset Disposal Relief needs ${RATES.badrMonths} months, so the gain is taxed at ${Math.round(RATES.cgtBasic * 100)}% and ${Math.round(RATES.cgtHigher * 100)}%. Waiting until month ${RATES.badrMonths} would save about ${money0(emi.totalTax - run(v, v.salePrice, true).totalTax)}.` });
  if (badrOk && badrSaving > 0) findings.push({ severity: "info", title: `Business Asset Disposal Relief saves you ${money0(badrSaving)} against ordinary Capital Gains Tax rates.` });
  if (badrOk && emi.cgt.badrGain < emi.gain) findings.push({ severity: "medium", title: "Part of your gain exceeds the £1m lifetime Business Asset Disposal Relief limit and is taxed at the ordinary rates." });
  if (emiSaving > 0) findings.push({ severity: "info", title: `Compared with an unapproved option, the EMI route saves about ${money0(emiSaving)} in tax (income tax only; National Insurance would widen the gap if it applied).` });
  findings.push({ severity: "info", title: "EMI rules also require the company to be a qualifying independent trading company with gross assets of £30m or less, and you to work for it at least 25 hours a week (or 75% of working time). Exercise within 90 days of a disqualifying event or the tax advantage is lost." });

  const obligations = [
    { title: "Check the option is a real EMI option", why: "The company must have notified HMRC of the grant within 92 days via the Employment Related Securities service. Without that notice the options are unapproved." },
    { title: "Check the sale timing", why: "Business Asset Disposal Relief needs the option to have been granted at least 24 months before the disposal, and you to be an employee or officer throughout." },
    { title: "Report the gain", why: "If your gains exceed the annual exempt amount, or proceeds exceed £50,000, report on your Self Assessment return or the CGT service on GOV.UK within the deadline." },
    { title: "Check the rates", why: "Rates here follow the 2025/26 and 2026/27 CGT rates (Business Asset Disposal Relief 14% then 18%) and were entered from memory. Confirm on GOV.UK before you act." },
  ];

  return { errors: [], v, badrOk, emi, noBadr, spread, unapprovedTax, unapprovedNet, badrSaving, emiSaving, effective, scenarios, findings, obligations };
}

export function summaryText(r) {
  return [
    `UK EMI option tax (${YEARS[r.v.year].label})`,
    `Options: ${r.v.options}  Exercise price: ${r.v.strike}  Sale price: ${r.v.salePrice}`,
    `Proceeds: ${money0(r.emi.proceeds)}  Cost to exercise: ${money0(r.emi.exerciseCost)}`,
    `Income tax on discount: ${money0(r.emi.itOnDiscount)}`,
    `Capital Gains Tax: ${money0(r.emi.cgt.tax)} (${r.badrOk ? "Business Asset Disposal Relief applies" : "no Business Asset Disposal Relief"})`,
    `You keep: ${money0(r.emi.net)}  Effective tax on the gain: ${(r.effective * 100).toFixed(1)}%`,
    `Same options unapproved: you keep ${money0(r.unapprovedNet)}`,
    "Not tax advice. Verify rates on GOV.UK.",
  ].join("\n");
}
