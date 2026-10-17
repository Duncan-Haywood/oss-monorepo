// UK PAYE tax code decoder and payslip checker, 2026/27. Rules written from
// memory, no live lookup:
//  - A code number times 10, plus 9, is the tax-free pay for the year
//    (1257L = 12,579, from the 12,570 Personal Allowance). A K code is the
//    reverse: that amount is ADDED to pay before tax.
//  - Letters: L standard; M received 1,260 Marriage Allowance (+126 on the
//    number); N gave 1,260 away (-126); T other items to review. BR, D0, D1
//    tax all pay at one rate with no allowance (20%, 40%, 45%); 0T has no
//    allowance but uses the bands; NT taxes nothing. Prefix S is Scotland,
//    C is Wales. Scottish flat codes SBR 20%, SD0 21%, SD1 42%, SD2 45%,
//    SD3 48%. W1, M1 or X after the code means "week 1 / month 1": each pay
//    period is taxed alone, not cumulatively (emergency basis).
//  - Cumulative tax to date: taxable pay = pay to date minus free pay to date
//    (rounded down to the pound); bands scale with the number of periods.
//    England, Wales, NI: 20% to 37,700 of taxable pay, 40% to 125,140, 45%
//    above. Scotland 2026/27: 19% to 3,967, 20% to 16,956, 21% to 31,092,
//    42% to 62,430, 45% to 125,140, 48% above.
//  - Personal Allowance 12,570, reduced by 1 for every 2 of adjusted income
//    over 100,000 and gone at 125,140.
// Approximates HMRC's exact table rounding; a payslip can differ by a few
// pounds. Not modelled: NI, student loans, pensions, second jobs, other
// taxable income, Gift Aid, blind person's allowance, tax-year-end timing.

export const YEAR = "2026/27";
export const PA = 12570;
export const MARRIAGE = 1260;
export const TAPER_START = 100000;
export const TAPER_END = 125140;
export const RUK_BANDS = [{ rate: 0.2, upTo: 37700 }, { rate: 0.4, upTo: 125140 }, { rate: 0.45, upTo: Infinity }];
export const SCOT_BANDS = [
  { rate: 0.19, upTo: 3967 }, { rate: 0.2, upTo: 16956 }, { rate: 0.21, upTo: 31092 },
  { rate: 0.42, upTo: 62430 }, { rate: 0.45, upTo: 125140 }, { rate: 0.48, upTo: Infinity },
];
export const FLAT = {
  rUK: { BR: 0.2, D0: 0.4, D1: 0.45 },
  Scotland: { BR: 0.2, D0: 0.21, D1: 0.42, D2: 0.45, D3: 0.48 },
};
export const FREQ = { monthly: { per: 12, label: "month" }, weekly: { per: 52, label: "week" }, fourweekly: { per: 13, label: "four-week period" } };
export const VERIFY = "Verify against GOV.UK ('Tax codes', 'Income Tax rates and Personal Allowances') and your HMRC online account, which shows the code HMRC actually issued and why.";

export const SAMPLE = {
  code: "BR",
  frequency: "monthly",
  period: "6",
  gross: "15000",
  taxPaid: "3000",
};
export const SAMPLE_BUILD = {
  region: "rUK",
  income: "45000",
  benefits: "3200",
  otherIncome: "0",
  underpayment: "0",
  underpaymentRate: "20",
  marriage: "none",
};

const r2 = (n) => Math.round(n * 100) / 100;
const floor2 = (n) => Math.floor(n * 100 + 1e-6) / 100;
export const money = (n) => (n < 0 ? "-" : "") + "£" + Math.abs(r2(n)).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = (v) => { const s = String(v ?? "").replace(/[£,\s]/g, ""); return s === "" ? null : Number(s); };

export function parseCode(raw) {
  let s = String(raw ?? "").toUpperCase().replace(/\s+/g, "");
  if (!s) return { error: "Enter your tax code, for example 1257L." };
  let nonCumulative = false;
  const basis = s.match(/^(.+?)(W1|M1|X)$/);
  if (basis && !/^[SC]?(BR|NT)$/.test(s)) { nonCumulative = true; s = basis[1]; }
  let region = "rUK", regionLabel = "England, Northern Ireland (no prefix)";
  const pre = s.match(/^([SC])(.+)$/);
  if (pre) { region = pre[1] === "S" ? "Scotland" : "rUK"; regionLabel = pre[1] === "S" ? "Scotland (S prefix)" : "Wales (C prefix)"; s = pre[2]; }
  const base = { region, regionLabel, nonCumulative, canonical: (pre ? pre[1] : "") + s + (nonCumulative ? " " + basis[2] : "") };
  if (s === "NT") return { ...base, type: "nt", rate: 0, allowance: 0, label: "No tax: NT" };
  if (FLAT[region][s]) return { ...base, type: "flat", rate: FLAT[region][s], allowance: 0, label: `All pay taxed at ${Math.round(FLAT[region][s] * 100)}% with no tax-free allowance: ${s}` };
  const k = s.match(/^K(\d{1,4})$/);
  if (k) return { ...base, type: "k", allowance: -(Number(k[1]) * 10 + 9), number: Number(k[1]), label: `K code: ${money(Number(k[1]) * 10 + 9)} is ADDED to your pay before tax` };
  const m = s.match(/^(\d{1,4})([LMNTPVY])$/);
  if (!m) return { error: `"${raw}" is not a tax code this tool recognises. Examples: 1257L, 1383M, 1131N, BR, D0, 0T, K475, S1257L.` };
  const number = Number(m[1]), letter = m[2];
  const meaning = { L: "standard allowance", M: "includes 1,260 Marriage Allowance received from your partner", N: "1,260 of your allowance given to your partner (Marriage Allowance)", T: "other items HMRC wants to review", P: "an old age-related code no longer issued", V: "an old age-related code no longer issued", Y: "an old age-related code no longer issued" }[letter];
  return { ...base, type: number === 0 ? "zero" : "allowance", number, letter, allowance: number * 10 + 9 - (number === 0 ? 9 : 0), label: number === 0 ? `No allowance: ${m[0]}, bands still apply` : `${money(number * 10 + 9)} tax-free for the year: ${meaning}` };
}

function bandTax(taxable, bands, n, per) {
  let tax = 0, lower = 0;
  for (const b of bands) {
    const upper = b.upTo === Infinity ? Infinity : Math.ceil((b.upTo * n) / per);
    if (taxable > lower) tax += (Math.min(taxable, upper) - lower) * b.rate;
    lower = upper;
    if (taxable <= upper) break;
  }
  return tax;
}

// Tax to date under a parsed code. Cumulative unless the code says week1/month1.
export function taxToDate(code, gross, n, per) {
  if (code.type === "nt") return 0;
  const one = (g, i) => {
    if (code.type === "flat") return floor2(Math.floor(g) * code.rate);
    const taxable = Math.floor(g - (code.allowance * i) / per);
    if (taxable <= 0) return 0;
    return floor2(bandTax(taxable, code.region === "Scotland" ? SCOT_BANDS : RUK_BANDS, i, per));
  };
  if (code.nonCumulative) return r2(n * one(gross / n, 1));
  return one(gross, n);
}

export function compute(input) {
  const errors = [];
  const code = parseCode(input.code);
  if (code.error) errors.push(code.error);
  const f = FREQ[input.frequency];
  if (!f) errors.push("Choose how often you are paid.");
  const n = num(input.period);
  if (f && !(Number.isInteger(n) && n >= 1 && n <= f.per)) errors.push(`The ${f.label} number must be a whole number from 1 to ${f.per} (tax year starts 6 April).`);
  const gross = num(input.gross);
  if (gross === null || !(gross >= 0)) errors.push("Enter your taxable pay so far this tax year (gross, before tax, from the payslip year-to-date).");
  const taxPaid = num(input.taxPaid);
  if (taxPaid === null || !(taxPaid >= 0)) errors.push("Enter the tax paid so far this tax year (year-to-date on the payslip).");
  if (errors.length) return { errors };

  const per = f.per;
  const std = parseCode(code.region === "Scotland" ? "S1257L" : "1257L");
  const onCode = taxToDate(code, gross, n, per);
  const onStd = taxToDate(std, gross, n, per);
  const vsCode = r2(taxPaid - onCode);
  const vsStd = r2(taxPaid - onStd);
  const findings = [];
  const gapAllowance = code.type === "allowance" || code.type === "k" || code.type === "zero" ? std.allowance - code.allowance : null;

  findings.push({ severity: "info", title: `Your code ${code.canonical}: ${code.label}. Region: ${code.regionLabel}.` });
  if (code.nonCumulative) findings.push({ severity: "high", title: "Week 1 / Month 1 (emergency) basis: each pay period is taxed on its own, with no catch-up, so tax is often too high until HMRC or payroll switches you to a cumulative code. Giving your employer a P45 or completing a starter checklist, or telling HMRC online, usually fixes it, and the overpayment comes back through payroll once cumulative." });
  if (code.type === "flat") findings.push({ severity: "high", title: `A flat-rate code taxes every pound with no tax-free allowance. It is normal for a second job or pension, not for your main job; on a main job it usually means HMRC does not yet have your details. At the standard code the tax to date would be ${money(onStd)} against ${money(taxPaid)} paid.` });
  if (code.type === "zero") findings.push({ severity: "medium", title: "0T gives no allowance and taxes you on the bands from pound one. Usual for a new job with no P45, or a second job." });
  if (code.type === "nt") findings.push({ severity: "medium", title: "NT means no tax is deducted. It is only right in specific cases; check why HMRC set it." });
  if (code.type === "k") findings.push({ severity: "medium", title: `A K code means HMRC thinks you owe tax on income or benefits above your allowance, equal to ${money(code.number * 10 + 9)} a year of extra taxable income. Check your HMRC account for what it is built from.` });
  if (code.letter === "T") findings.push({ severity: "medium", title: "T means HMRC has items to review, such as a reduced allowance. Ask what is included." });
  if (code.letter === "M" || code.letter === "N") findings.push({ severity: "info", title: code.letter === "M" ? "M: you receive 1,260 of your partner's allowance, worth up to £252 a year in tax. Your partner should have the matching N code." : "N: you gave 1,260 of your allowance to your partner, who should have the matching M code." });
  if (/^[PVY]$/.test(code.letter || "")) findings.push({ severity: "medium", title: "P, V and Y are old age-related codes no longer issued. Ask HMRC to review it." });
  if (gapAllowance && gapAllowance > 0 && code.type !== "nt") {
    const a = gapAllowance * 0.2, b = gapAllowance * 0.4;
    findings.push({ severity: "medium", title: `Your code gives ${money(gapAllowance)} less allowance than the standard ${std.canonical.replace(/\s.*/, "")}. That costs ${money(a)} a year in tax if you are a basic-rate taxpayer, ${money(b)} if higher-rate. Check that is explained by benefits, other income or tax owed.` });
  }
  if (gapAllowance && gapAllowance < 0 && code.type === "allowance") findings.push({ severity: "medium", title: `Your code gives ${money(-gapAllowance)} more allowance than the standard code. That is correct for Marriage Allowance or reliefs HMRC has granted; otherwise tell HMRC, because underpaid tax can be collected later.` });

  if (Math.abs(vsCode) > Math.max(10, onCode * 0.02)) {
    findings.push({ severity: "high", title: `Your payslip tax (${money(taxPaid)}) differs from what code ${code.canonical} should give by this point (${money(onCode)}) by ${money(Math.abs(vsCode))}. Ask payroll to explain: it may be a different code earlier in the year, a second source of pay, or a payroll error.` });
  } else {
    findings.push({ severity: "info", title: `Your payslip tax is close to what code ${code.canonical} gives by this point (${money(onCode)}), so payroll is applying the code as issued.` });
  }
  if (vsStd > Math.max(10, onStd * 0.02)) findings.push({ severity: "high", title: `Compared with the standard code (${std.canonical}), you may have overpaid about ${money(vsStd)} so far. If your code is wrong, correcting it makes payroll refund the difference through your pay; if it is right (benefits, other income), it is not an overpayment. If you are still overtaxed at the end of the year, claim it from HMRC online or by form P800.` });
  else if (vsStd < -Math.max(10, onStd * 0.02)) findings.push({ severity: "medium", title: `Compared with the standard code, you have paid about ${money(-vsStd)} less so far. That is expected with a higher allowance code, but check you are not building a bill.` });
  else findings.push({ severity: "info", title: "Tax paid so far is close to what the standard code would give." });
  findings.push({ severity: "info", title: "Not decided here: second jobs, taxable benefits, pension relief, Gift Aid, tax already paid in a previous job this year, and exact HMRC table rounding. A payslip can differ by a few pounds." });
  return { errors, code, std, n, per, f, gross, taxPaid, onCode, onStd, vsCode, vsStd, gapAllowance, findings };
}

export function buildCode(input) {
  const errors = [];
  const region = ["rUK", "Wales", "Scotland"].includes(input.region) ? input.region : null;
  if (!region) errors.push("Choose where you live for tax.");
  const income = num(input.income);
  if (income === null || !(income >= 0)) errors.push("Enter your estimated taxable income for the year from employment.");
  const benefits = num(input.benefits) ?? 0, other = num(input.otherIncome) ?? 0, under = num(input.underpayment) ?? 0;
  if (!(benefits >= 0)) errors.push("Benefits must be 0 or more.");
  if (!(other >= 0)) errors.push("Other untaxed income must be 0 or more.");
  if (!(under >= 0)) errors.push("Underpayment must be 0 or more.");
  const rate = (num(input.underpaymentRate) ?? 20) / 100;
  if (under > 0 && !(rate > 0 && rate <= 0.48)) errors.push("Underpayment rate must be between 1 and 48 percent.");
  const marriage = ["none", "given", "received"].includes(input.marriage) ? input.marriage : "none";
  if (errors.length) return { errors };

  const ani = income + other;
  const taperCut = Math.min(PA, Math.max(0, (ani - TAPER_START) / 2));
  const pa = PA - taperCut;
  const marriageAdj = pa > 0 ? (marriage === "received" ? MARRIAGE : marriage === "given" ? -MARRIAGE : 0) : 0;
  const underCut = under > 0 ? under / rate : 0;
  const allowance = pa + marriageAdj - benefits - other - underCut;
  let body, letter = "";
  if (allowance < 0) body = "K" + Math.ceil(-allowance / 10);
  else if (pa === 0 && marriageAdj === 0 && allowance === 0) body = "0T";
  else {
    letter = marriageAdj > 0 ? "M" : marriageAdj < 0 ? "N" : "L";
    body = Math.floor(allowance / 10) + letter;
  }
  const prefix = region === "Scotland" ? "S" : region === "Wales" ? "C" : "";
  const codeText = prefix + body;
  const rows = [
    ["Personal Allowance", PA],
    ["Reduction for income over £100,000", -taperCut],
    ["Marriage Allowance " + (marriage === "none" ? "(not used)" : marriage), marriageAdj],
    ["Taxable benefits (company car, medical cover and similar)", -benefits],
    ["Other income not taxed at source", -other],
    ["Underpaid tax collected through the code", -underCut],
    ["Allowance behind the code", allowance],
  ];
  const findings = [];
  findings.push({ severity: "info", title: `Expected code: ${codeText}. Check it against the code on your payslip or in your HMRC account.` });
  if (taperCut > 0) findings.push({ severity: "medium", title: `Income over £100,000 reduces the Personal Allowance by ${money(taperCut)}, an effective 60% marginal rate between £100,000 and £125,140.` });
  if (marriage === "received" && marriageAdj === 0) findings.push({ severity: "medium", title: "Marriage Allowance cannot be received with no Personal Allowance, and the recipient must be a basic-rate taxpayer." });
  if (benefits > 0) findings.push({ severity: "info", title: `Benefits worth ${money(benefits)} cut your allowance, costing about ${money(benefits * 0.2)} a year at basic rate or ${money(benefits * 0.4)} at higher rate.` });
  if (under > 0) findings.push({ severity: "info", title: `Collecting ${money(under)} at ${Math.round(rate * 100)}% removes ${money(underCut)} of allowance for the year.` });
  findings.push({ severity: "info", title: "Not decided here: blind person's allowance, tax relief for expenses, pension relief, Gift Aid, and several jobs. HMRC works the real code; your account shows how." });
  return { errors, codeText, allowance, pa, rows, findings, region };
}

export function summaryText(r) {
  const l = ["UK tax code check", "", `Code: ${r.code.canonical} (${r.code.label})`, `Tax year ${YEAR}, ${r.f.label} ${r.n} of ${r.per}`, ""];
  l.push(`Pay so far: ${money(r.gross)}   Tax paid so far: ${money(r.taxPaid)}`);
  l.push(`Tax expected on your code: ${money(r.onCode)} (difference ${money(r.vsCode)})`);
  l.push(`Tax expected on standard ${r.std.canonical}: ${money(r.onStd)} (difference ${money(r.vsStd)})`, "");
  for (const f of r.findings) l.push(`- [${f.severity}] ${f.title}`);
  l.push("", VERIFY, "Not tax advice. No warranty.");
  return l.join("\n");
}
