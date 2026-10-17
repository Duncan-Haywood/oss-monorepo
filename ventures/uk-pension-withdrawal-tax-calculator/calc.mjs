// UK pension withdrawal tax: how much of a flexible withdrawal (UFPLS or
// taxable drawdown) is tax-free, what the tax really is, what an emergency
// "Month 1" code takes at source, and what spreading it over tax years saves.
// England, Wales and Northern Ireland rates. Browser-only. Not tax advice.

// 2026/27 figures. Verify on GOV.UK before relying on them.
export const TAX = {
  year: "2026/27",
  personalAllowance: 12570,
  taperStart: 100000,
  basicBand: 37700,
  additionalFrom: 125140,
  basicRate: 0.2,
  higherRate: 0.4,
  additionalRate: 0.45,
  lumpSumAllowance: 268275,
  mpaa: 10000,
};

export const SAMPLE = { amount: "40000", method: "ufpls", otherIncome: "18000", taxFreeUsed: "0", age: "58", region: "england" };

const round2 = (n) => Math.round(n * 100) / 100;
const money = (n) => "£" + round2(n).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money0 = (n) => "£" + Math.round(n).toLocaleString("en-GB");

export function allowanceFor(income) {
  if (income <= TAX.taperStart) return TAX.personalAllowance;
  return Math.max(0, TAX.personalAllowance - Math.floor((income - TAX.taperStart) / 2));
}

// Income tax on non-savings, non-dividend income for a full year.
export function incomeTax(income) {
  const taxable = Math.max(0, income - allowanceFor(income));
  const basic = Math.min(taxable, TAX.basicBand);
  const higher = Math.max(0, Math.min(taxable, TAX.additionalFrom) - TAX.basicBand);
  const additional = Math.max(0, taxable - TAX.additionalFrom);
  return basic * TAX.basicRate + higher * TAX.higherRate + additional * TAX.additionalRate;
}

// Emergency "1257 M1" treatment: one twelfth of the allowance and bands
// applied to the payment on its own, as if it recurs every month.
export function emergencyTax(payment) {
  const pa = TAX.personalAllowance / 12;
  const taxable = Math.max(0, payment - pa);
  const basicTop = TAX.basicBand / 12;
  const higherTop = TAX.additionalFrom / 12;
  const basic = Math.min(taxable, basicTop);
  const higher = Math.max(0, Math.min(taxable, higherTop) - basicTop);
  const additional = Math.max(0, taxable - higherTop);
  return basic * TAX.basicRate + higher * TAX.higherRate + additional * TAX.additionalRate;
}

function split(amount, method, lsaLeft) {
  const taxFree = method === "ufpls" ? Math.min(amount * 0.25, lsaLeft) : 0;
  return { taxFree, taxable: amount - taxFree };
}

export function compute(raw) {
  const errors = [];
  const amount = Number(raw.amount);
  const other = raw.otherIncome === "" || raw.otherIncome == null ? 0 : Number(raw.otherIncome);
  const used = raw.taxFreeUsed === "" || raw.taxFreeUsed == null ? 0 : Number(raw.taxFreeUsed);
  const age = raw.age === "" || raw.age == null ? null : Number(raw.age);
  if (!(amount > 0)) errors.push("Enter the gross amount you want to withdraw (more than zero).");
  if (!(other >= 0)) errors.push("Other taxable income for the year cannot be negative (use 0 if none).");
  if (!(used >= 0)) errors.push("Tax-free cash already taken cannot be negative.");
  if (age !== null && !(age > 0 && age < 120)) errors.push("Enter your age as a number, or leave it blank.");
  if (!["ufpls", "taxable"].includes(raw.method)) errors.push("Choose how the money is paid.");
  if (raw.region === "scotland") errors.push("Scotland has different income tax bands, which this tool does not apply. Use the Scottish income tax calculator in this set.");
  if (errors.length) return { errors };

  const lsaLeft = Math.max(0, TAX.lumpSumAllowance - used);
  const { taxFree, taxable } = split(amount, raw.method, lsaLeft);
  const totalIncome = other + taxable;
  const taxBase = incomeTax(other);
  const taxWith = incomeTax(totalIncome);
  const tax = round2(taxWith - taxBase);
  const net = round2(amount - tax);
  const emergency = round2(emergencyTax(taxable));
  const overpaid = round2(Math.max(0, emergency - tax));
  const effective = amount > 0 ? round2((tax / amount) * 100) : 0;

  // Spreading the same withdrawal evenly over n tax years with the same other income each year.
  const spread = [1, 2, 3, 5].map((n) => {
    const per = amount / n;
    const s = split(per, raw.method, lsaLeft / n);
    const t = (incomeTax(other + s.taxable) - taxBase) * n;
    return { years: n, tax: round2(t), net: round2(amount - t), saving: round2(tax - t) };
  });

  const topEdge = TAX.personalAllowance + TAX.basicBand;
  const headroomTaxable = Math.max(0, topEdge - other);
  const headroomGross = raw.method === "ufpls" ? headroomTaxable / 0.75 : headroomTaxable;
  const crossesHigher = totalIncome > topEdge && other <= topEdge;
  const inTaper = totalIncome > TAX.taperStart;

  const findings = [];
  findings.push({ severity: "high", title: `On ${money0(amount)} withdrawn, about ${money0(taxFree)} is tax-free and ${money0(taxable)} is taxed: ${money0(tax)} tax, ${money0(net)} in your pocket after the year is settled (${effective}% of the withdrawal).` });
  if (taxable > 0) findings.push({ severity: overpaid > 0 ? "high" : "info", title: overpaid > 0 ? `If the first payment is taxed on an emergency code, about ${money0(emergency)} is held back at source, roughly ${money0(overpaid)} more than you owe. It is refundable, but you have to claim it or wait for the year-end check.` : "An emergency code is unlikely to over-tax this payment." });
  if (crossesHigher) findings.push({ severity: "medium", title: `This pushes you into the 40% band. Withdrawing up to about ${money0(headroomGross)} this tax year keeps all of it at 20% or less; the rest can wait for next April.` });
  if (inTaper) findings.push({ severity: "high", title: "Total income passes £100,000, so the personal allowance is being withdrawn: an effective 60% rate on the slice above £100,000. Spreading the withdrawal avoids it." });
  if (used + (raw.method === "ufpls" ? amount * 0.25 : 0) > TAX.lumpSumAllowance) findings.push({ severity: "medium", title: `Tax-free cash is capped by the lump sum allowance (${money0(TAX.lumpSumAllowance)} in total across your pensions), so less than 25% is tax-free here.` });
  if (taxable > 0) findings.push({ severity: "medium", title: `Taking taxable money flexibly triggers the money purchase annual allowance: future defined-contribution pension saving is limited to ${money0(TAX.mpaa)} a year (including employer contributions). Tax-free cash alone does not trigger it.` });
  if (age !== null && age < 55) findings.push({ severity: "high", title: "Most people cannot take pension money before 55 (rising to 57 from 6 April 2028). Withdrawals earlier are usually taxed heavily as an unauthorised payment. Check with the provider and Pension Wise." });
  const best = spread.reduce((a, b) => (b.saving > a.saving ? b : a));
  if (best.saving > 0) findings.push({ severity: "info", title: `Taking it evenly over ${best.years} tax years would cut the tax by about ${money0(best.saving)}, assuming the same other income each year.` });

  const obligations = [
    { title: "Ask for tax-free cash separately if you can", why: "Tax-free cash is not taxed at all, so it does not trigger emergency tax and does not trigger the money purchase annual allowance. Taking it first and the taxable part later lets you choose the tax year." },
    { title: "Reclaim over-taxed money", why: "Taken some of your pot and expect to take more this year: HMRC form P55. Cashed in the whole pot and still working: P53Z. Cashed it in and stopped working: P50Z. Otherwise HMRC refunds at the end of the year or after you file Self Assessment." },
    { title: "Tell the provider your tax code", why: "From the second payment your normal code is used. If you also have a job or state pension, check the totals add up so the right band is applied." },
    { title: "Get free guidance before you decide", why: "Pension Wise (government service, free, over 50) and MoneyHelper explain the options, scams and what an adviser can do. This is an estimate, not advice." },
  ];

  return { errors: [], amount, method: raw.method, taxFree: round2(taxFree), taxable: round2(taxable), other, totalIncome, tax, net, emergency, overpaid, effective, spread, headroomGross: Math.round(headroomGross), findings, obligations, lsaLeft };
}

export function summaryText(r) {
  return [
    `UK pension withdrawal tax estimate (${TAX.year}, England/Wales/Northern Ireland)`,
    `Withdrawal ${money(r.amount)}: tax-free ${money(r.taxFree)}, taxable ${money(r.taxable)}; other income ${money(r.other)}`,
    `Tax for the year on the withdrawal ${money(r.tax)}; you keep ${money(r.net)} (${r.effective}%)`,
    `Emergency tax held at source if used ${money(r.emergency)}; likely over-payment ${money(r.overpaid)}`,
    "Verify rates and rules on GOV.UK. Not tax advice.",
  ].join("\n");
}
