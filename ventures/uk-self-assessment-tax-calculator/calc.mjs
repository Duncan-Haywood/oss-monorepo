// UK Self Assessment tax estimator for the 2025/26 tax year (6 April 2025 to 5 April 2026; return and payment due 31 January 2027), England, Wales and Northern Ireland.
// Pure functions, no I/O. Bad input is rejected with a message, never clamped.
// Modelled: one pot of income made of employment pay (with the PAYE tax already deducted), self-employment profit (trading allowance or actual expenses, whichever is larger),
// UK property profit (property allowance or actual expenses; residential mortgage interest as a 20% credit), savings interest and dividends. Income tax is stacked in HMRC order:
// non-savings income, then savings, then dividends. Personal allowance with the GBP 100,000 taper; personal pension contributions paid net (relief at source) and Gift Aid donations both
// extend the basic and higher bands and reduce adjusted net income; starting rate for savings; Personal Savings Allowance; Dividend Allowance; Class 4 National Insurance on
// self-employed profit; student loan and Postgraduate Loan on total income less what payroll already took; and the payments-on-account schedule that the bill triggers.
// NOT modelled: Scotland, capital gains (see the separate CGT tool), Class 2 (voluntary since April 2024), losses, foreign income, trusts, the marriage allowance, blind person's allowance,
// high income child benefit charge, tax codes, benefits in kind, averaging, and any rate announced for later years. Every result names its source to verify.

export const VERIFY = "GOV.UK 'Income Tax rates and Personal Allowances', 'Self Assessment tax returns: deadlines', 'Understand how HMRC works out Class 4 NIC', 'Tax on dividends', 'Personal Savings Allowance', 'Trading allowance' and 'Payments on account'";
export const YEAR = "2025/26";
export const PERSONAL_ALLOWANCE = 12570;
export const TAPER_START = 100000;
export const BASIC_BAND = 37700;
export const ADDITIONAL_THRESHOLD = 125140;
export const RATES = { basic: 0.2, higher: 0.4, additional: 0.45 };
export const SAVINGS_RATES = RATES;
export const DIVIDEND_RATES = { basic: 0.0875, higher: 0.3375, additional: 0.3935 };
export const DIVIDEND_ALLOWANCE = 500;
export const STARTING_RATE_BAND = 5000;
export const PSA = { basic: 1000, higher: 500, additional: 0 };
export const ALLOWANCE = 1000; // trading allowance and property allowance, each
export const CLASS4 = { lower: 12570, upper: 50270, main: 0.06, above: 0.02 };
export const PLANS = {
  none: { label: "No student loan", threshold: 0, rate: 0 },
  1: { label: "Plan 1", threshold: 26065, rate: 0.09 },
  2: { label: "Plan 2", threshold: 28470, rate: 0.09 },
  4: { label: "Plan 4", threshold: 32745, rate: 0.09 },
  5: { label: "Plan 5", threshold: 25000, rate: 0.09 },
};
export const PGL = { threshold: 21000, rate: 0.06 };
export const POA_MIN_BILL = 1000;
export const POA_PAYE_SHARE = 0.8;

const r2 = (n) => Math.round(n * 100) / 100;
const pos = (n) => (n > 0 ? n : 0);
const money = (n) => (n < 0 ? "-" : "") + "GBP " + Number(Math.round(Math.abs(n) * 100) / 100).toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

const FIELDS = [
  ["employment", "Employment pay (gross, with taxable benefits)"],
  ["paye", "Income tax already deducted by PAYE"],
  ["tradingIncome", "Self-employed income (turnover)"],
  ["tradingExpenses", "Self-employed expenses"],
  ["rent", "Property rental income"],
  ["rentExpenses", "Property expenses (not mortgage interest)"],
  ["mortgageInterest", "Residential mortgage interest"],
  ["interest", "Savings interest"],
  ["dividends", "Dividends"],
  ["pensionNet", "Personal pension contributions you paid (net)"],
  ["giftAidNet", "Gift Aid donations you paid (net)"],
  ["slPaid", "Student loan already deducted by payroll"],
];

export function parse(input) {
  const i = input || {};
  const errors = [];
  const v = {};
  for (const [key, label] of FIELDS) {
    const raw = i[key];
    const n = raw === undefined || raw === null || raw === "" ? 0 : Number(raw);
    if (!Number.isFinite(n) || n < 0) errors.push(`${label}: enter an amount of zero or more.`);
    else if (n > 100000000) errors.push(`${label}: that amount looks like a typo.`);
    v[key] = n;
  }
  const plan = String(i.plan || "none");
  if (!PLANS[plan]) errors.push("Pick a student loan plan, or none.");
  const pgl = i.pgl === true || i.pgl === "yes" || i.pgl === "true";
  const total = v.employment + v.tradingIncome + v.rent + v.interest + v.dividends;
  if (!errors.length && total <= 0) errors.push("Enter at least one source of income for the year.");
  if (!errors.length && v.paye > v.employment) errors.push("PAYE tax deducted is more than your employment pay: check the two figures.");
  return { errors, ...v, plan, pgl };
}

// Tax on a slice of taxable income that starts at `start` (counted from the first taxable pound)
// and is `amount` long, using the given three-band rates. Bands are basic [0, basicTop), higher [basicTop, addTop), additional above.
function slice(start, amount, rates, basicTop, addTop) {
  if (amount <= 0) return { tax: 0, basic: 0, higher: 0, additional: 0 };
  const end = start + amount;
  const basic = pos(Math.min(end, basicTop) - Math.min(start, basicTop));
  const higher = pos(Math.min(end, addTop) - Math.max(start, basicTop)) ;
  const additional = pos(end - Math.max(start, addTop));
  const tax = basic * rates.basic + higher * rates.higher + additional * rates.additional;
  return { tax, basic, higher, additional };
}

export function class4(profit) {
  return r2(pos(Math.min(profit, CLASS4.upper) - CLASS4.lower) * CLASS4.main + pos(profit - CLASS4.upper) * CLASS4.above);
}

// The whole liability from a validated parse. `p` is the output of parse().
export function liability(p) {
  const tradingRelief = Math.max(p.tradingExpenses, Math.min(ALLOWANCE, p.tradingIncome));
  const tradingUsedAllowance = p.tradingIncome > 0 && ALLOWANCE >= p.tradingExpenses;
  const tradingRaw = p.tradingIncome - tradingRelief;
  const tradingProfit = pos(tradingRaw);
  const propRelief = Math.max(p.rentExpenses, Math.min(ALLOWANCE, p.rent));
  const propUsedAllowance = p.rent > 0 && ALLOWANCE >= p.rentExpenses;
  const propProfit = pos(p.rent - propRelief);
  const nonSavings = p.employment + tradingProfit + propProfit;
  const totalIncome = nonSavings + p.interest + p.dividends;
  const pensionGross = r2(p.pensionNet / 0.8);
  const giftGross = r2(p.giftAidNet / 0.8);
  const ani = pos(totalIncome - pensionGross - giftGross);
  const allowance = pos(PERSONAL_ALLOWANCE - pos(ani - TAPER_START) / 2);
  const basicTop = BASIC_BAND + pensionGross + giftGross;
  const addTop = ADDITIONAL_THRESHOLD + pensionGross + giftGross;

  // The personal allowance is used against non-savings income first, then savings, then dividends.
  const tNS = pos(nonSavings - allowance);
  let left = pos(allowance - nonSavings);
  const tSav = pos(p.interest - left);
  left = pos(left - p.interest);
  const tDiv = pos(p.dividends - left);
  const taxable = tNS + tSav + tDiv;

  const startingBand = pos(STARTING_RATE_BAND - tNS);
  const startingUsed = Math.min(tSav, startingBand);
  const topOfStack = taxable;
  const psaBand = topOfStack > addTop ? PSA.additional : topOfStack > basicTop ? PSA.higher : PSA.basic;
  const psaUsed = Math.min(tSav - startingUsed, psaBand);
  const savZero = startingUsed + psaUsed;

  const nsTax = slice(0, tNS, RATES, basicTop, addTop);
  const savTax = slice(tNS + savZero, tSav - savZero, SAVINGS_RATES, basicTop, addTop);
  const divAllowUsed = Math.min(tDiv, DIVIDEND_ALLOWANCE);
  const divTax = slice(tNS + tSav + divAllowUsed, tDiv - divAllowUsed, DIVIDEND_RATES, basicTop, addTop);

  const grossTax = nsTax.tax + savTax.tax + divTax.tax;
  let credit = 0;
  if (p.mortgageInterest > 0 && !propUsedAllowance && propProfit > 0) credit = r2(0.2 * Math.min(p.mortgageInterest, propProfit, pos(totalIncome - pensionGross - giftGross - allowance)));
  const incomeTax = r2(pos(grossTax - credit));
  const class4Nic = class4(tradingProfit);

  const slBase = pos(totalIncome);
  const slDue = r2(pos(slBase - PLANS[p.plan].threshold) * PLANS[p.plan].rate + (p.pgl ? pos(slBase - PGL.threshold) * PGL.rate : 0));
  const slBalance = r2(pos(slDue - p.slPaid));

  const taxAndNic = r2(incomeTax + class4Nic);
  const balanceTaxNic = r2(taxAndNic - p.paye);
  const total = r2(balanceTaxNic + slBalance);

  return {
    tradingProfit, tradingUsedAllowance, tradingLoss: pos(-tradingRaw), propProfit, propUsedAllowance, nonSavings, totalIncome, pensionGross, giftGross, ani, allowance,
    taxable, tNS, tSav, tDiv, startingUsed, psaUsed, psaBand, savZero, divAllowUsed, basicTop, addTop, nsTax, savTax, divTax,
    grossTax: r2(grossTax), credit, incomeTax, class4Nic, taxAndNic, slDue, slBalance, balanceTaxNic, total,
  };
}

function marginalOn(p, extra) {
  const base = liability(p);
  const more = liability({ ...p, employment: p.employment + extra, paye: p.paye });
  const slDelta = more.slDue - base.slDue;
  return r2(((more.taxAndNic - base.taxAndNic + slDelta) / extra) * 100);
}

export function schedule(p, L) {
  const atSource = p.paye;
  const needed = L.balanceTaxNic >= POA_MIN_BILL && atSource < POA_PAYE_SHARE * L.taxAndNic;
  const poa = needed ? r2(L.balanceTaxNic / 2) : 0;
  return {
    paymentsOnAccountDue: needed,
    poaEach: poa,
    jan: r2(Math.max(L.total, 0) + poa),
    jul: poa,
    refund: L.total < 0 ? r2(-L.total) : 0,
  };
}

export function compute(input) {
  const p = parse(input);
  if (p.errors.length) return { errors: p.errors };
  const L = liability(p);
  const S = schedule(p, L);
  const effective = L.totalIncome > 0 ? r2(((L.taxAndNic + L.slDue) / L.totalIncome) * 100) : 0;
  const marginal = marginalOn(p, 1000);
  const findings = [];
  const obligations = [];

  const headline = L.total >= 0
    ? `Estimated 2025/26 bill: ${money(L.total)} to pay with your return, on total income of ${money(L.totalIncome)}. That is income tax ${money(L.incomeTax)}${L.class4Nic ? `, Class 4 National Insurance ${money(L.class4Nic)}` : ""}${L.slBalance ? `, student loan ${money(L.slBalance)}` : ""}, less ${money(p.paye)} already paid through PAYE.`
    : `Estimated 2025/26 position: a refund of ${money(-L.total)}, on total income of ${money(L.totalIncome)}.`;
  findings.push({ severity: "info", title: headline });
  if (S.paymentsOnAccountDue) findings.push({ severity: "high", title: `Payments on account apply. On 31 January 2027 you pay the ${money(Math.max(L.total, 0))} balance plus a first payment on account of ${money(S.poaEach)} towards 2026/27, so ${money(S.jan)} in one go. The second ${money(S.jul)} is due on 31 July 2027. Set the cash aside now.` });
  else if (L.total > 0) findings.push({ severity: "info", title: `No payments on account are triggered: either the tax and Class 4 NIC left to pay is under ${money(POA_MIN_BILL)}, or at least 80% of your liability was already collected at source. You pay ${money(L.total)} by 31 January 2027.` });
  if (p.tradingIncome > 0) {
    if (L.tradingLoss > 0) findings.push({ severity: "medium", title: `Your self-employed expenses are ${money(L.tradingLoss)} more than your income, a loss. Losses can be set against other income or carried forward, which this tool does not model, so it has treated the profit as zero.` });
    else if (L.tradingUsedAllowance) findings.push({ severity: "info", title: `Your self-employed income is covered by the ${money(ALLOWANCE)} trading allowance (it is at least as good as your actual expenses), so ${money(Math.min(ALLOWANCE, p.tradingIncome))} is relieved instead. Profit: ${money(L.tradingProfit)}.` });
    else findings.push({ severity: "info", title: `Your actual expenses of ${money(p.tradingExpenses)} beat the ${money(ALLOWANCE)} trading allowance. Self-employed profit: ${money(L.tradingProfit)}.` });
  }
  if (p.rent > 0 && L.propUsedAllowance && p.mortgageInterest > 0) findings.push({ severity: "medium", title: "You entered mortgage interest but the property allowance gives you a better result than your expenses, and the allowance cannot be combined with a finance cost credit. Enter your actual expenses to see the other route." });
  if (L.credit > 0) findings.push({ severity: "info", title: `Residential mortgage interest is not deducted from rent. It becomes a 20% tax credit of ${money(L.credit)}, which helps basic-rate taxpayers less than higher-rate ones.` });
  if (L.ani > TAPER_START && L.ani <= ADDITIONAL_THRESHOLD) findings.push({ severity: "high", title: `Your adjusted net income of ${money(L.ani)} is in the band where the personal allowance is withdrawn (now ${money(L.allowance)}). A personal pension contribution or Gift Aid donation lowers it and can restore the allowance; see the saving below.` });
  if (marginal >= 60) findings.push({ severity: "high", title: `Each extra GBP 1,000 you earn from here costs about ${money(marginal * 10)} in tax and National Insurance: a marginal rate of ${marginal}%.` });
  else findings.push({ severity: "info", title: `Each extra GBP 1,000 of pay costs about ${money(marginal * 10)} in tax and National Insurance and loans: a marginal rate of ${marginal}%.` });
  if (p.dividends > 0) findings.push({ severity: "info", title: `Of ${money(p.dividends)} dividends, ${money(L.divAllowUsed)} falls inside the ${money(DIVIDEND_ALLOWANCE)} Dividend Allowance. The rest is taxed at 8.75%, 33.75% or 39.35%, on top of your other income.` });
  if (p.interest > 0) findings.push({ severity: "info", title: `Of ${money(p.interest)} savings interest, ${money(L.startingUsed)} falls in the 0% starting rate band and ${money(L.psaUsed)} in your Personal Savings Allowance of ${money(L.psaBand)}. Any more is taxed at your marginal rate.` });
  if (p.tradingIncome > 0 && L.tradingProfit > CLASS4.lower) findings.push({ severity: "info", title: `Class 4 National Insurance: ${money(L.class4Nic)}, 6% on profit between ${money(CLASS4.lower)} and ${money(CLASS4.upper)} and 2% above. Class 2 is no longer compulsory; profits over the Small Profits Threshold get your National Insurance record credited automatically.` });

  const savings = [];
  for (const [label, kind, amt] of [["a further GBP 1,000 (net, GBP 1,250 gross) personal pension contribution", "pensionNet", 1000], ["a further GBP 1,000 Gift Aid donation (net)", "giftAidNet", 1000]]) {
    const alt = liability({ ...p, [kind]: p[kind] + amt });
    const delta = r2(L.taxAndNic + L.slBalance - (alt.taxAndNic + alt.slBalance));
    if (delta > 0) savings.push({ label, delta, cost: amt });
  }
  for (const s of savings) findings.push({ severity: "info", title: `What if: ${s.label} would cut this bill by about ${money(s.delta)} through higher-rate relief or restoring the personal allowance, on a net outlay of ${money(s.cost)}.` });
  findings.push({ severity: "info", title: `Not modelled: Scottish bands, capital gains (use the UK capital gains tax calculator), losses, foreign income, the marriage allowance, blind person's allowance, the High Income Child Benefit Charge, benefits in kind beyond what you put in employment pay, and anything announced for later years.` });

  obligations.push({ ref: "Register", title: "Register for Self Assessment if you have not", why: "If you needed to file for 2025/26 and are not registered, the deadline to register was 5 October 2026. Register now and file by 31 January 2027 to limit penalties." });
  obligations.push({ ref: "Deadlines", title: "File online and pay by 31 January 2027", why: "The online return and the balance for 2025/26 are due by 31 January 2027. A paper return was due on 31 October 2026. Late filing starts at a GBP 100 penalty." });
  if (S.paymentsOnAccountDue) obligations.push({ ref: "POA", title: "Plan for payments on account", why: `A first payment on account of ${money(S.poaEach)} for 2026/27 is due with the balance on 31 January 2027 and a second on 31 July 2027. If you expect lower income next year you can ask HMRC to reduce them.` });
  if (L.tradingLoss > 0) obligations.push({ ref: "Loss", title: "Claim your loss properly", why: "A trading loss can be set against other income or carried forward. Ask HMRC or an accountant before you choose; the choice affects this and future years." });
  obligations.push({ ref: "Records", title: "Keep records and check your PAYE figure", why: "Your P60 or final payslip shows the pay and PAYE tax to enter. Keep records of income and expenses for at least five years after the 31 January filing deadline." });
  obligations.push({ ref: "Verify", title: "Verify the rates", why: `Thresholds change at each Budget. Confirm the 2025/26 figures at ${VERIFY.split(",")[0].replace("GOV.UK ", "")} on GOV.UK, and have an accountant or HMRC check the return before you file.` });

  return { errors: [], input: p, ...L, ...S, effective, marginal, savings, findings, obligations };
}

export const SAMPLE = { employment: 38000, paye: 4700, tradingIncome: 22000, tradingExpenses: 4000, rent: 0, rentExpenses: 0, mortgageInterest: 0, interest: 900, dividends: 1500, pensionNet: 0, giftAidNet: 0, slPaid: 0, plan: "none", pgl: "no" };

export function summaryText(r) {
  const L = [`UK Self Assessment estimate, tax year ${YEAR} (England, Wales and Northern Ireland)`, "",
    `Total income: ${money(r.totalIncome)}  (employment ${money(r.input.employment)}, self-employed profit ${money(r.tradingProfit)}, property profit ${money(r.propProfit)}, interest ${money(r.input.interest)}, dividends ${money(r.input.dividends)})`,
    `Personal allowance: ${money(r.allowance)}   Taxable income: ${money(r.taxable)}`, "",
    `Income tax before credits: ${money(r.grossTax)}`, ...(r.credit ? [`Finance cost credit: -${money(r.credit)}`] : []), `Income tax: ${money(r.incomeTax)}`,
    ...(r.class4Nic ? [`Class 4 National Insurance: ${money(r.class4Nic)}`] : []), `PAYE already paid: -${money(r.input.paye)}`,
    ...(r.slDue ? [`Student loan due: ${money(r.slDue)} (payroll paid ${money(r.input.slPaid)}, balance ${money(r.slBalance)})`] : []), "",
    r.total >= 0 ? `Balance to pay by 31 January 2027: ${money(r.total)}` : `Refund due: ${money(-r.total)}`];
  if (r.paymentsOnAccountDue) L.push(`First payment on account (also 31 January 2027): ${money(r.poaEach)}`, `Total due 31 January 2027: ${money(r.jan)}`, `Second payment on account, 31 July 2027: ${money(r.jul)}`);
  L.push(`Effective rate: ${r.effective}%   Marginal rate on the next GBP 1,000: ${r.marginal}%`, "", ...r.findings.map((f) => `- ${f.title}`), "", ...r.obligations.map((o) => `- ${o.title}: ${o.why}`), "", `Verify against: ${VERIFY}`, "Not tax advice. No warranty.");
  return L.join("\n");
}
