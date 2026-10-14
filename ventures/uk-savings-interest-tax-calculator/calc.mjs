// UK tax on savings interest, 2026/27, rest of the UK (England, Wales, NI).
// Rates were written from memory without network access: verify on GOV.UK.
export const RATES = {
  year: "2026/27",
  personalAllowance: 12570,
  taperStart: 100000,
  basicBand: 37700,
  additionalFrom: 125140,
  startingRateBand: 5000,
  psaBasic: 1000,
  psaHigher: 500,
  rates: { basic: 0.2, higher: 0.4, additional: 0.45 },
};

export const SAMPLE = { otherIncome: "32000", interest: "3200", savingsPot: "70000", aer: "4.5" };

const num = (v) => {
  if (v === "" || v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
};
const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

// Tax on `interest` of gross savings interest sitting on top of `other` non-savings income.
export function savingsTax(other, interest) {
  const R = RATES;
  const total = other + interest;
  const pa = Math.max(0, R.personalAllowance - Math.max(0, (total - R.taperStart) / 2));
  const taxableOther = Math.max(0, other - pa);
  const paLeft = Math.max(0, pa - other);
  const sx = Math.max(0, interest - paLeft);
  const srbRoom = Math.max(0, R.startingRateBand - taxableOther);
  const startingUsed = Math.min(sx, srbRoom);
  const afterSrb = sx - startingUsed;
  const taxableTotal = taxableOther + sx;
  const psa = taxableTotal <= R.basicBand ? R.psaBasic : taxableTotal <= R.additionalFrom ? R.psaHigher : 0;
  const psaUsed = Math.min(psa, afterSrb);
  // Savings occupy taxable positions [taxableOther, taxableTotal]; the first
  // startingUsed + psaUsed of them are taxed at 0%, the rest by band.
  const start = taxableOther + startingUsed + psaUsed;
  const slice = (lo, hi) => Math.max(0, Math.min(taxableTotal, hi) - Math.max(start, lo));
  const inBasic = slice(0, R.basicBand);
  const inHigher = slice(R.basicBand, R.additionalFrom);
  const inAdd = slice(R.additionalFrom, Infinity);
  const tax = inBasic * R.rates.basic + inHigher * R.rates.higher + inAdd * R.rates.additional;
  return {
    tax: r2(tax), personalAllowance: r2(pa), paUsed: r2(Math.min(paLeft, interest)),
    startingUsed: r2(startingUsed), psa, psaUsed: r2(psaUsed),
    inBasic: r2(inBasic), inHigher: r2(inHigher), inAdd: r2(inAdd),
    band: taxableTotal > R.additionalFrom ? "additional" : taxableTotal > R.basicBand ? "higher" : "basic",
  };
}

// Largest gross interest that still produces no tax.
export function taxFreeInterest(other) {
  let lo = 0, hi = 200000;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (savingsTax(other, mid).tax <= 0.005) lo = mid; else hi = mid;
  }
  return r2(lo);
}

export function compute(input) {
  const errors = [];
  const other = num(input.otherIncome), interest = num(input.interest);
  const pot = num(input.savingsPot), aer = num(input.aer);
  if (Number.isNaN(other) || other < 0) errors.push("Other taxable income must be a number of zero or more.");
  if (Number.isNaN(interest) || interest < 0) errors.push("Interest must be a number of zero or more.");
  if (Number.isNaN(pot) || pot < 0) errors.push("Savings pot must be a number of zero or more.");
  if (Number.isNaN(aer) || aer < 0 || aer > 100) errors.push("Interest rate must be between 0 and 100.");
  if (errors.length) return { errors };

  const t = savingsTax(other, interest);
  const free = taxFreeInterest(other);
  const netInterest = r2(interest - t.tax);
  const effective = interest > 0 ? t.tax / interest : 0;
  const rate = aer / 100;
  const potFree = rate > 0 ? r2(free / rate) : null;
  const isaSaving = t.tax;
  const marginal = interest > 0 ? r2(savingsTax(other, interest + 100).tax - t.tax) : 0;
  const findings = [];
  if (t.tax <= 0) findings.push({ severity: "info", title: `No tax on this interest. You could earn about ${fmt(free)} in total before any is due.` });
  else findings.push({ severity: "high", title: `About ${fmt(t.tax)} of tax on ${fmt(interest)} interest (${(effective * 100).toFixed(1)}% of it). The same money in a cash ISA would be tax-free.` });
  if (t.band === "additional") findings.push({ severity: "medium", title: "You are an additional-rate taxpayer: no Personal Savings Allowance, and interest is taxed at 45%." });
  if (t.startingUsed > 0) findings.push({ severity: "info", title: `The 0% starting rate for savings covers ${fmt(t.startingUsed)} because your other income is low.` });
  if (marginal >= 40) findings.push({ severity: "medium", title: `Each extra £100 of interest costs about ${fmt(marginal)} in tax at the margin.` });
  if (potFree != null && pot > potFree) findings.push({ severity: "medium", title: `At ${aer}% your tax-free pot is about ${fmt(potFree)}. About ${fmt(pot - potFree)} of your ${fmt(pot)} is earning taxable interest.` });
  const obligations = [
    { title: "Banks pay interest gross", why: "Tell HMRC through Self Assessment, a P800 or a tax code change if tax is due. Interest over the allowance is not collected by the bank." },
    { title: "Use your ISA allowance", why: "Interest inside a cash ISA is not counted at all, so it does not use up the allowances above." },
    { title: "Check the starting rate", why: "If your other income is under about £17,570, up to £5,000 of interest can be free before the Personal Savings Allowance starts." },
    { title: "Joint accounts", why: "Interest is normally split 50/50 for tax, so each person has their own allowances." },
  ];
  return { errors: [], input: { other, interest, pot, aer }, ...t, free, netInterest, effective, potFree, isaSaving, marginal, findings, obligations, rates: RATES };
}

export function fmt(n) {
  return "£" + Number(n).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function summaryText(r) {
  return [
    `UK savings interest tax, ${RATES.year} (rest of the UK). Estimate only; verify on GOV.UK.`,
    `Other taxable income: ${fmt(r.input.other)}`,
    `Savings interest: ${fmt(r.input.interest)}`,
    `Your band for savings: ${r.band}`,
    `Personal allowance used on interest: ${fmt(r.paUsed)}`,
    `Starting rate for savings (0%): ${fmt(r.startingUsed)}`,
    `Personal Savings Allowance (${fmt(r.psa)}) used: ${fmt(r.psaUsed)}`,
    `Tax due: ${fmt(r.tax)} (${(r.effective * 100).toFixed(1)}% of the interest)`,
    `Interest after tax: ${fmt(r.netInterest)}`,
    `Interest you can earn tax-free: ${fmt(r.free)}`,
    "Not tax advice.",
  ].join("\n");
}
