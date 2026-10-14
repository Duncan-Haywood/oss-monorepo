// UK Lifetime ISA vs pension: per £1 of take-home cost, which pot is worth more
// at the point you can use it, and where the answer flips (retirement tax rate,
// employer match). Browser-only. Not tax advice.

// Rates as understood for 2025/26 (England, Wales, NI; thresholds frozen).
// Verify on GOV.UK. Scottish rates are not modelled.
export const RATES = {
  pa: 12570,
  taperStart: 100000,
  additionalThreshold: 125140,
  higherThreshold: 50270,
  lisaCap: 4000, // net contribution per tax year that earns the bonus
  lisaBonus: 0.25,
  lisaCharge: 0.25, // withdrawal charge on the whole pot value for an unqualified withdrawal
  taxFreeShare: 0.25, // pension commencement lump sum share (within the lump sum allowance)
  niMain: 0.08,
  niUpper: 0.02,
};

export const SAMPLE = { cost: "4000", income: "60000", years: "20", growth: "5", retireTax: "20", match: "0", salarySacrifice: "no", age: "30" };

const FIELDS = ["cost", "income", "years", "growth", "retireTax", "match", "salarySacrifice", "age"];
const round2 = (n) => Math.round(n * 100) / 100;
const money0 = (n) => "£" + Math.round(n).toLocaleString("en-GB");
const money2 = (n) => "£" + n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Marginal income tax rate on the next £ of pension contribution.
export function reliefRate(income) {
  if (income > RATES.additionalThreshold) return 0.45;
  if (income > RATES.taperStart) return 0.6; // personal allowance taper: valid while contributions stay in the band
  if (income > RATES.higherThreshold) return 0.4;
  if (income > RATES.pa) return 0.2;
  return 0.2; // relief at source still tops up non-taxpayers by 20%
}

export function niRate(income) {
  if (income > RATES.higherThreshold) return RATES.niUpper;
  if (income > RATES.pa) return RATES.niMain;
  return 0;
}

// Gross pension contribution bought by `cost` of take-home pay.
export function pensionGross(cost, income, salarySacrifice = false) {
  const r = reliefRate(income) + (salarySacrifice ? niRate(income) : 0);
  return cost / (1 - r);
}

// Future value of `perYear` paid at the start of each of `years` years.
export function futureValue(perYear, years, growth) {
  let pot = 0;
  for (let i = 0; i < years; i++) pot = (pot + perYear) * (1 + growth);
  return pot;
}

// After-tax value of pension pot in retirement (25% tax-free, rest taxed at t).
export const pensionNet = (pot, t) => pot * (RATES.taxFreeShare + (1 - RATES.taxFreeShare) * (1 - t));

// Retirement tax rate below which the pension beats the LISA, per £ of cost.
export function breakEvenRetirementRate(income, match = 0, salarySacrifice = false) {
  const g = pensionGross(1, income, salarySacrifice) * (1 + match);
  const lisa = 1 + RATES.lisaBonus;
  // g * (0.25 + 0.75(1-t)) = lisa  ->  t = 1 - ((lisa/g) - 0.25) / 0.75
  const t = 1 - (lisa / g - RATES.taxFreeShare) / (1 - RATES.taxFreeShare);
  return Math.min(1, Math.max(-1, t));
}

// Employer match (as a fraction of the employee's gross contribution) needed for the pension to tie.
export function breakEvenMatch(income, retireTax, salarySacrifice = false) {
  const keep = RATES.taxFreeShare + (1 - RATES.taxFreeShare) * (1 - retireTax);
  const need = (1 + RATES.lisaBonus) / (pensionGross(1, income, salarySacrifice) * keep);
  return Math.max(0, need - 1);
}

export function compute(raw) {
  const errors = [];
  const num = (k, label, { min = 0, max = Infinity } = {}) => {
    const s = String(raw[k] ?? "").trim();
    const n = s === "" ? 0 : Number(s);
    if (!Number.isFinite(n) || n < min || n > max) { errors.push(`${label} must be a number between ${min} and ${max === Infinity ? "any amount" : max}.`); return 0; }
    return n;
  };
  const v = {
    cost: num("cost", "Yearly take-home you would put in"),
    income: num("income", "Your salary or taxable income"),
    years: num("years", "Years until you need the money", { min: 0, max: 60 }),
    growth: num("growth", "Growth per year (%)", { min: -10, max: 20 }) / 100,
    retireTax: num("retireTax", "Tax rate on pension income in retirement (%)", { min: 0, max: 60 }) / 100,
    match: num("match", "Employer match (% of your gross pension contribution)", { min: 0, max: 400 }) / 100,
    age: num("age", "Your age", { min: 0, max: 100 }),
    salarySacrifice: String(raw.salarySacrifice ?? "no") === "yes",
  };
  if (!errors.length && v.cost === 0) errors.push("Enter the yearly amount you would put in.");
  if (!errors.length && v.income === 0) errors.push("Enter your salary or taxable income.");
  if (!errors.length && v.years === 0) errors.push("Enter how many years until you need the money.");
  if (!errors.length && v.age < 18) errors.push("Enter your age (18 or over).");
  if (errors.length) return { errors };

  const years = Math.round(v.years);
  const gross = pensionGross(v.cost, v.income, v.salarySacrifice);
  const rr = reliefRate(v.income);
  const lisaNet = Math.min(v.cost, RATES.lisaCap);
  const lisaYearly = lisaNet * (1 + RATES.lisaBonus);
  const rest = v.cost - lisaNet;

  // Strategy yearly amounts going into each wrapper.
  const A = { name: "All pension", lisa: 0, pension: gross * (1 + v.match), isa: 0 };
  const B = { name: `LISA first ${money0(lisaNet)}, rest to pension`, lisa: lisaYearly, pension: pensionGross(rest, v.income, v.salarySacrifice) * (1 + v.match), isa: 0 };
  const C = { name: `LISA first ${money0(lisaNet)}, rest to ordinary ISA`, lisa: lisaYearly, pension: 0, isa: rest };

  const eligibleYears = Math.max(0, Math.min(years, 50 - Math.floor(v.age) + 1)); // LISA contributions stop at 50
  const lisaOpenOk = v.age < 40;
  const strat = (lisaOpenOk ? [A, B, C] : [A]).map((s) => {
    const paid = Math.min(years, eligibleYears);
    const lisaPot = futureValue(s.lisa, paid, v.growth) * Math.pow(1 + v.growth, years - paid);
    const pensionPot = futureValue(s.pension, years, v.growth);
    const isaPot = futureValue(s.isa, years, v.growth);
    const cashRetire = lisaPot + pensionNet(pensionPot, v.retireTax) + isaPot;
    const cashHome = lisaPot + isaPot; // pension cannot be used for a first home
    const cashEarly = lisaPot * (1 - RATES.lisaCharge) + isaPot; // unqualified LISA withdrawal; pension locked
    return { name: s.name, lisaPot: round2(lisaPot), pensionPot: round2(pensionPot), isaPot: round2(isaPot), retire: round2(cashRetire), home: round2(cashHome), early: round2(cashEarly), pensionLocked: s.pension > 0 };
  });

  const be = breakEvenRetirementRate(v.income, v.match, v.salarySacrifice);
  const bm = breakEvenMatch(v.income, v.retireTax, v.salarySacrifice);
  const perPoundPension = gross * (1 + v.match) * (RATES.taxFreeShare + (1 - RATES.taxFreeShare) * (1 - v.retireTax)) / v.cost;
  const perPoundLisa = 1 + RATES.lisaBonus;
  const winner = perPoundPension > perPoundLisa + 0.0005 ? "pension" : perPoundLisa > perPoundPension + 0.0005 ? "lisa" : "tie";

  const findings = [];
  if (!lisaOpenOk) findings.push({ severity: "high", title: "You must be 18 to 39 to open a new Lifetime ISA, so the LISA lines are not available to you. The pension comparison still applies." });
  if (v.age >= 36 && v.age < 40) findings.push({ severity: "medium", title: "You can only open a LISA before your 40th birthday; contributions and the bonus stop at 50." });
  if (v.age >= 50) findings.push({ severity: "medium", title: "No new LISA contributions or bonus are paid from age 50." });
  if (v.match > 0) findings.push({ severity: "high", title: `With an employer match of ${(v.match * 100).toFixed(0)}% each £1 of your take-home becomes ${money2(perPoundPension)} after retirement tax in a pension, against ${money2(perPoundLisa)} in a LISA. Take the match first.` });
  if (v.match === 0) findings.push({ severity: "info", title: `Without an employer match, each £1 of take-home is worth ${money2(perPoundPension)} in a pension (after ${(v.retireTax * 100).toFixed(0)}% tax on 75% of it) against ${money2(perPoundLisa)} in a LISA. ${winner === "pension" ? "The pension wins on these inputs." : winner === "lisa" ? "The LISA wins on these inputs." : "They tie."}` });
  findings.push({ severity: "info", title: be <= -1 ? "The pension wins at any retirement tax rate on these inputs." : be >= 1 ? "The LISA wins at any retirement tax rate on these inputs." : `The pension beats the LISA only if your tax rate on pension income in retirement is below ${(be * 100).toFixed(1)}%. Above that the LISA gives more.` });
  if (v.match === 0 && bm > 0) findings.push({ severity: "info", title: `A pension would need an employer match of about ${(bm * 100).toFixed(0)}% of your gross contribution to tie the LISA at your retirement tax rate.` });
  if (rr === 0.6) findings.push({ severity: "high", title: "Income in the £100,000 to £125,140 band loses personal allowance, so pension contributions that bring you back under £100,000 are relieved at an effective 60%. That usually beats a LISA by a wide margin." });
  if (v.cost > RATES.lisaCap) findings.push({ severity: "medium", title: `Only ${money0(RATES.lisaCap)} a year earns the 25% bonus (maximum bonus ${money0(RATES.lisaCap * RATES.lisaBonus)}). The rest goes to a pension or ordinary ISA in the strategies shown. LISA deposits count towards your £20,000 ISA allowance.` });
  findings.push({ severity: "high", title: `A LISA withdrawal that is not for a first home (up to £450,000, after the account is 12 months old), at 60 or later, or terminal illness costs a 25% charge on the whole value: you get back ${money2((1 + RATES.lisaBonus) * (1 - RATES.lisaCharge))} for every £1 you put in (before growth), a loss of ${money2(1 - (1 + RATES.lisaBonus) * (1 - RATES.lisaCharge))}. Pension money is locked until 57.` });

  const obligations = [
    { title: "Take any employer match first", why: "Free employer money beats both a LISA bonus and tax relief on your own contributions. Check your scheme and whether salary sacrifice is offered." },
    { title: "Decide what the money is for", why: "A LISA fits a first home (price cap £450,000) or retirement from 60. A pension is locked until 57 (from April 2028) and cannot fund a deposit." },
    { title: "Claim higher rate pension relief", why: "If your scheme gives relief at source only 20% is added; claim the extra 20% or 25% through Self Assessment or a tax code change. Net pay and salary sacrifice give full relief automatically." },
    { title: "Check the rules and the rates", why: "Rates and limits follow 2025/26 and were entered from memory. Scottish rates, the lump sum allowance, state pension, means-tested benefits and future rule changes are not modelled. Confirm on GOV.UK." },
  ];

  return { errors: [], v, years, gross, rr, lisaNet, strat, be, bm, perPoundPension, perPoundLisa, winner, lisaOpenOk, findings, obligations };
}

export function summaryText(r) {
  return [
    "UK Lifetime ISA vs pension (2025/26)",
    `Per £1 of take-home: pension ${money2(r.perPoundPension)} after retirement tax, LISA ${money2(r.perPoundLisa)}.`,
    `Pension wins only below a retirement tax rate of ${(r.be * 100).toFixed(1)}%.`,
    ...r.strat.map((s) => `${s.name}: at retirement ${money0(s.retire)}, first home ${money0(s.home)}, early withdrawal ${money0(s.early)}${s.pensionLocked ? " (pension locked)" : ""}`),
    "Not tax advice. Verify rates on GOV.UK.",
  ].join("\n");
}
