// UK director's loan account: an overdrawn account in a close company triggers
// s455 tax if it is still owing nine months and a day after the year end. This
// works out the s455 charge and its due and refund dates, the benefit-in-kind
// on a loan over GBP 10,000, and what it costs to clear the loan by dividend or
// by bonus. Browser-only. Not tax advice.

// Rates as understood for 2026/27. Verify on GOV.UK before relying on them.
export const RATES = {
  year: "2026/27",
  s455Old: 33.75,   // loans made before 6 April 2026
  s455New: 35.75,   // loans made on or after 6 April 2026 (matches the dividend upper rate)
  divBasic: 10.75, divHigher: 35.75, divAdditional: 39.35,
  divAllowance: 500,
  employerNic: 15,
  employeeNicMain: 8, employeeNicUpper: 2,
  class1A: 15,
  beneficialLoanLimit: 10000,
};

export const SAMPLE = {
  yearEnd: "2026-03-31", balance: "42000", loanDate: "pre", repaid: "0",
  maxBalance: "42000", avgBalance: "30000", interestPct: "0", officialRate: "3.75",
  taxBand: "40", ctRate: "25", dividendsReceived: "0", redraw: "no", repayDate: "",
};

const round2 = (n) => Math.round(n * 100) / 100;
const money0 = (n) => "£" + Math.round(n).toLocaleString("en-GB");
const DAY = 86400000;

function parseDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || "").trim());
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCMonth() === +m[2] - 1 ? d : null;
}
const daysIn = (y, m) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
const isMonthEnd = (d) => d.getUTCDate() === daysIn(d.getUTCFullYear(), d.getUTCMonth());

// Corresponding date n months on; a month-end rolls to the month-end.
export function addMonths(d, n) {
  const t = d.getUTCFullYear() * 12 + d.getUTCMonth() + n;
  const y = Math.floor(t / 12), m = t % 12;
  const day = isMonthEnd(d) ? daysIn(y, m) : Math.min(d.getUTCDate(), daysIn(y, m));
  return new Date(Date.UTC(y, m, day));
}
// Nine months and one day after the end of the accounting period.
export function dueDate(periodEnd) {
  return new Date(addMonths(periodEnd, 9).getTime() + DAY);
}
export const iso = (d) => d.toISOString().slice(0, 10);
const fmtDate = (d) => d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

// First year end on or after the repayment date, assuming the same year end each year.
function periodEndContaining(yearEnd, repay) {
  let k = 0, e = yearEnd;
  while (e < repay && k < 50) { k++; e = addMonths(yearEnd, 12 * k); }
  return e;
}

export function compute(raw) {
  const errors = [];
  const num = (k, label, min = 0, max = Infinity, blank = 0) => {
    const s = String(raw[k] ?? "").trim();
    const n = s === "" ? blank : Number(s);
    if (!Number.isFinite(n) || n < min || n > max) { errors.push(`${label} must be a number from ${min} to ${max === Infinity ? "any amount" : max}.`); return 0; }
    return n;
  };
  const yearEnd = parseDate(raw.yearEnd);
  if (!yearEnd) errors.push("Enter the company year end as a date.");
  const balance = num("balance", "Loan owed at the year end");
  const repaid = num("repaid", "Amount repaid before the due date");
  const maxBalance = num("maxBalance", "Highest balance in the year", 0, Infinity, balance);
  const avgBalance = num("avgBalance", "Average balance in the year", 0, Infinity, balance);
  const interestPct = num("interestPct", "Interest you pay the company (%)", 0, 100);
  const officialRate = num("officialRate", "HMRC official rate (%)", 0, 100, 3.75);
  const ctRate = num("ctRate", "Corporation tax rate (%)", 0, 100, 25);
  const dividendsReceived = num("dividendsReceived", "Dividends already received this tax year");
  const band = ["20", "40", "45"].includes(String(raw.taxBand)) ? Number(raw.taxBand) : 40;
  const repayDate = String(raw.repayDate || "").trim() ? parseDate(raw.repayDate) : null;
  if (String(raw.repayDate || "").trim() && !repayDate) errors.push("Repayment date must be a date.");
  if (yearEnd && repayDate && repayDate <= yearEnd) errors.push("Repayment date must be after the year end.");
  if (errors.length) return { errors };

  const post = raw.loanDate === "post";
  const s455Rate = post ? RATES.s455New : RATES.s455Old;
  const due = dueDate(yearEnd);
  const outstanding = Math.max(0, balance - repaid);
  const s455 = round2(outstanding * s455Rate / 100);

  // When would the s455 come back?
  let refund = null, monthsTied = null;
  if (s455 > 0) {
    if (repayDate && repayDate > due) {
      const end = periodEndContaining(yearEnd, repayDate);
      refund = dueDate(end);
      monthsTied = Math.max(0, Math.round((refund - due) / DAY / 30.4375));
    }
  }

  // Beneficial loan.
  const beneficial = maxBalance > RATES.beneficialLoanLimit;
  const bikBase = Math.max(0, officialRate - interestPct);
  const benefit = beneficial ? round2(avgBalance * bikBase / 100) : 0;
  const bikTax = round2(benefit * band / 100);
  const class1A = round2(benefit * RATES.class1A / 100);

  // Cost of clearing what is still owed.
  const X = outstanding;
  const divRate = band === 20 ? RATES.divBasic : band === 40 ? RATES.divHigher : RATES.divAdditional;
  const allowanceLeft = Math.max(0, RATES.divAllowance - dividendsReceived);
  const divTax = round2(Math.max(0, X - allowanceLeft) * divRate / 100);
  const nicEmployee = band === 20 ? RATES.employeeNicMain : RATES.employeeNicUpper;
  const employeeRate = (band + nicEmployee) / 100;
  const gross = X > 0 ? round2(X / (1 - employeeRate)) : 0;
  const employerNic = round2(gross * RATES.employerNic / 100);
  const ctRelief = round2((gross + employerNic) * ctRate / 100);
  const bonusLeakage = round2(gross - X + employerNic - ctRelief);

  const options = [
    { key: "own-funds", label: "Repay from your own money", leakage: 0, note: "No tax cost, but it must be real money from outside the company. Do not borrow it back within 30 days.", needs: "Personal cash" },
    { key: "dividend", label: "Declare a dividend and set it against the loan", leakage: divTax, note: `Dividend of ${money0(X)} taxed at ${divRate}% after your remaining £${Math.round(allowanceLeft)} allowance, paid through Self Assessment.`, needs: "Distributable profits in the company" },
    { key: "bonus", label: "Pay a bonus or salary and set it against the loan", leakage: bonusLeakage, note: `A bonus of about ${money0(gross)} is needed to clear ${money0(X)} after tax and employee NIC. Employer NIC ${money0(employerNic)} is partly offset by ${money0(ctRelief)} of corporation tax relief.`, needs: "Payroll run and cash for PAYE" },
    { key: "leave", label: "Leave it and pay s455", leakage: 0, temporary: s455, note: `${money0(s455)} is paid to HMRC by ${fmtDate(due)} and comes back after the loan is cleared. It is a cash cost, not a permanent tax.`, needs: "Company cash for the s455 payment" },
  ];
  const paid = options.filter((o) => o.key !== "leave" && o.key !== "own-funds");
  const cheapestExtraction = paid.slice().sort((a, b) => a.leakage - b.leakage)[0];

  const findings = [];
  if (X === 0) findings.push({ severity: "info", title: "Nothing is owed after the repayment, so no s455 tax is due." });
  else findings.push({ severity: "high", title: `${money0(s455)} of s455 tax is due by ${fmtDate(due)} (${s455Rate}% of ${money0(X)} still owed).` });
  if (X > 0) findings.push({ severity: "info", title: `Clearing the loan before ${fmtDate(due)} means no s455 is ever due. After that date the tax is paid and comes back nine months and a day after the end of the period in which the loan is repaid.` });
  if (repayDate && s455 > 0 && repayDate <= due) findings.push({ severity: "info", title: `Repaying in full on ${fmtDate(repayDate)} is before ${fmtDate(due)}, so no s455 would be payable at all.` });
  if (refund) findings.push({ severity: "medium", title: `If you repay on ${fmtDate(repayDate)}, the refund is due ${fmtDate(refund)}: the money is with HMRC for about ${monthsTied} months.` });
  if (beneficial && benefit > 0) findings.push({ severity: "medium", title: `A balance over £10,000 at any point is a taxable benefit: about ${money0(benefit)} a year, ${money0(bikTax)} income tax for you and ${money0(class1A)} Class 1A NIC for the company. Charging interest at the official rate ${officialRate}% removes it.` });
  if (beneficial && benefit === 0 && bikBase === 0) findings.push({ severity: "info", title: "You pay interest at or above the official rate, so no beneficial loan benefit arises." });
  if (raw.redraw === "yes") findings.push({ severity: "high", title: "Repaying and then borrowing again soon after is caught: repaying £5,000 or more and re-borrowing within 30 days is matched against the repayment, and any repayment of £15,000 or more with arrangements to re-borrow is ignored. The s455 charge stays." });
  if (X > 0) findings.push({ severity: "info", title: `Cheapest way to extract and clear it is the ${cheapestExtraction.key === "dividend" ? "dividend" : "bonus"} route at about ${money0(cheapestExtraction.leakage)} tax (${X > 0 ? round2(cheapestExtraction.leakage / X * 100) : 0}% of the loan). It needs ${cheapestExtraction.needs.toLowerCase()}.` });
  if (post && outstanding > 0) findings.push({ severity: "info", title: "The 35.75% rate applies to loans made on or after 6 April 2026; older loans stay at 33.75%. Check which applies to each advance." });

  const obligations = [
    { title: "Pay s455 with the corporation tax", why: `Due ${fmtDate(due)} with the CT600 balance, not at the filing deadline. Late payment attracts interest.` },
    { title: "Claim the refund", why: "Relief is claimed on the company tax return or a separate repayment claim, after the loan is repaid, released or written off. Interest is not paid on the refund." },
    { title: "Report the loan", why: "The CT600 has a section for loans to participators (CT600A). A beneficial loan also goes on a P11D by 6 July." },
    { title: "Do not write it off lightly", why: "A loan written off is treated as a distribution to you with no s455 refund. This tool does not model it." },
    { title: "Check the rates", why: `Rates here are ${RATES.year} and were entered from memory. Confirm on GOV.UK before filing.` },
  ];

  return {
    errors: [], dueDate: iso(due), dueDateText: fmtDate(due), refundDate: refund ? iso(refund) : null, monthsTied,
    outstanding: X, s455Rate, s455, beneficial, benefit, bikTax, class1A, options, cheapestExtraction, findings, obligations,
  };
}

export function summaryText(r) {
  return [
    `UK director's loan s455 (${RATES.year})`,
    `Still owed after repayments: ${money0(r.outstanding)}`,
    `s455 at ${r.s455Rate}%: ${money0(r.s455)}  Due: ${r.dueDateText}`,
    r.beneficial ? `Beneficial loan benefit: ${money0(r.benefit)}  Your tax: ${money0(r.bikTax)}  Class 1A: ${money0(r.class1A)}` : "Beneficial loan: not triggered",
    ...r.options.map((o) => `${o.label}: ${o.key === "leave" ? money0(o.temporary) + " paid then refunded" : money0(o.leakage) + " tax cost"}`),
    "Not tax advice. Verify rates on GOV.UK.",
  ].join("\n");
}
