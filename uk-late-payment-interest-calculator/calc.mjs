// UK Late Payment of Commercial Debts (Interest) Act 1998: statutory interest,
// fixed compensation and a demand letter for one overdue business invoice.
// Browser-only, no network. Not legal advice.

// Bank of England base rate on the reference date. The statutory rate for a
// debt is 8% plus the base rate on 31 Dec (debts falling due Jan-Jun) or on
// 30 Jun (debts falling due Jul-Dec) of the year the debt fell due.
// Source to verify: GOV.UK "Late commercial payments: interest and debt recovery".
export const BASE_RATES = {
  "2023-H1": { base: 3.5, verified: true },
  "2023-H2": { base: 5.0, verified: true },
  "2024-H1": { base: 5.25, verified: true },
  "2024-H2": { base: 5.25, verified: true },
  "2025-H1": { base: 4.75, verified: true },
  "2025-H2": { base: 4.25, verified: true },
  "2026-H1": { base: 3.75, verified: true },
  "2026-H2": { base: 3.75, verified: false },
};
export const MARGIN = 8;

export const SAMPLE = {
  amount: "4800",
  dueMode: "agreed",
  dueDate: "2026-07-31",
  asOf: "2026-10-14",
  baseOverride: "",
  recoveryCosts: "",
  business: "Hartley Design Ltd",
  debtor: "Northgate Fabrication Ltd",
  invoiceRef: "INV-0412",
  clientType: "business",
};

const DAY = 86400000;
const iso = /^\d{4}-\d{2}-\d{2}$/;
function parseDate(s) {
  if (!iso.test(String(s || ""))) return null;
  const t = Date.parse(s + "T00:00:00Z");
  return Number.isNaN(t) ? null : t;
}
const fmtDate = (t) => new Date(t).toISOString().slice(0, 10);
const money = (n) => "£" + (Math.round(n * 100) / 100).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const round2 = (n) => Math.round(n * 100) / 100;

export function compensationFor(amount) {
  if (amount < 1000) return 40;
  if (amount < 10000) return 70;
  return 100;
}

export function referenceKey(dueTime) {
  const d = new Date(dueTime);
  return `${d.getUTCFullYear()}-${d.getUTCMonth() < 6 ? "H1" : "H2"}`;
}

export function compute(raw) {
  const errors = [];
  const amount = Number(raw.amount);
  if (!(amount > 0)) errors.push("Enter the unpaid amount of the invoice (more than zero).");
  const given = parseDate(raw.dueDate);
  if (given === null) errors.push(raw.dueMode === "invoice30" ? "Enter the invoice or delivery date as YYYY-MM-DD." : "Enter the payment due date as YYYY-MM-DD.");
  const asOf = parseDate(raw.asOf);
  if (asOf === null) errors.push("Enter today's date (or the date you want the figure for) as YYYY-MM-DD.");
  if (raw.clientType === "consumer") errors.push("The Act covers only contracts between two businesses or public bodies. A debt owed by a private individual (a consumer) is not covered; use the contract's own terms or the county court's interest rules.");
  if (errors.length) return { errors };

  const dueTime = raw.dueMode === "invoice30" ? given + 30 * DAY : given;
  const key = referenceKey(dueTime);
  let base, baseNote;
  const override = raw.baseOverride === "" || raw.baseOverride == null ? null : Number(raw.baseOverride);
  if (override !== null && !(override >= 0 && override <= 30)) return { errors: ["The base rate must be a percentage between 0 and 30."] };
  if (override !== null) { base = override; baseNote = "base rate you entered"; }
  else if (BASE_RATES[key]) {
    base = BASE_RATES[key].base;
    baseNote = BASE_RATES[key].verified ? `Bank of England base rate for the ${key.replace("-", " ")} reference date` : `assumed ${key.replace("-", " ")} base rate, not yet checked: confirm on GOV.UK`;
  } else return { errors: [`No base rate is built in for ${key.replace("-", " ")}. Enter the Bank of England base rate for the reference date in the base rate box (GOV.UK lists them).`] };

  const rate = round2(base + MARGIN);
  const daysLate = Math.max(0, Math.round((asOf - dueTime) / DAY));
  const perDay = (amount * rate) / 100 / 365;
  const interest = round2(perDay * daysLate);
  const compensation = compensationFor(amount);
  const costs = Math.max(0, Number(raw.recoveryCosts) || 0);
  const total = round2(amount + interest + compensation + costs);
  const claimable = round2(interest + compensation + costs);

  const horizon = [30, 60, 90].map((n) => ({ days: n, date: fmtDate(asOf + n * DAY), interest: round2(perDay * (daysLate + n)), total: round2(amount + perDay * (daysLate + n) + compensation + costs) }));

  const findings = [];
  if (daysLate === 0) findings.push({ severity: "info", title: "Not overdue on this date: interest starts the day after the due date, so nothing is owed yet." });
  else findings.push({ severity: "high", title: `${daysLate} days late: ${money(interest)} interest plus ${money(compensation)} fixed compensation can be claimed on top of the ${money(amount)} invoice.` });
  findings.push({ severity: "info", title: `Rate ${rate}% a year (${MARGIN}% + ${base}% ${baseNote}); simple interest, ${money(perDay)} for each further day.` });
  if (raw.dueMode === "invoice30") findings.push({ severity: "medium", title: "No payment date agreed, so the Act's 30 days after the invoice or delivery applies. If you agreed a date or terms, switch to \"Agreed due date\"." });
  if (amount >= 1000 && amount < 10000 && compensation === 70) findings.push({ severity: "info", title: "Fixed compensation is per invoice, so several late invoices each carry their own sum." });
  findings.push({ severity: "info", title: "You may also claim reasonable debt recovery costs beyond the fixed sum (for example court fees or a solicitor's letter) if the fixed sum does not cover them." });

  const obligations = [
    { title: "Check the Act applies", why: "Both sides must be acting in the course of business (or be a public body). Contract terms that set a much lower rate are only valid if they are a substantial remedy." },
    { title: "Send a written demand", why: "State the invoice, the due date, the interest rate and the fixed sum, and give a clear payment date (14 days is usual). A letter is drafted below." },
    { title: "Keep claiming daily", why: `Interest keeps running at ${money(perDay)} a day until paid; update the figure when you chase again.` },
    { title: "If still unpaid", why: "Follow the Pre-Action Protocol for Debt Claims or send a letter before action, then consider a money claim online. Court fees depend on the sum; check GOV.UK." },
  ];

  const names = { business: raw.business || "[your business]", debtor: raw.debtor || "[customer]", ref: raw.invoiceRef || "[invoice reference]" };
  const letter = [
    `Subject: Invoice ${names.ref}: payment overdue, statutory interest and compensation`,
    ``,
    `Dear ${names.debtor},`,
    ``,
    `Invoice ${names.ref} for ${money(amount)} fell due for payment on ${fmtDate(dueTime)} and remains unpaid.`,
    ``,
    `Under the Late Payment of Commercial Debts (Interest) Act 1998 we are entitled to statutory interest at ${rate}% a year (${MARGIN}% over the Bank of England base rate of ${base}%), and fixed compensation of ${money(compensation)} for the invoice. As at ${fmtDate(asOf)} that is:`,
    ``,
    `  Invoice amount            ${money(amount)}`,
    `  Interest (${daysLate} days)      ${money(interest)}`,
    `  Fixed compensation        ${money(compensation)}`,
    ...(costs > 0 ? [`  Recovery costs            ${money(costs)}`] : []),
    `  Total due                 ${money(total)}`,
    ``,
    `Interest continues to accrue at ${money(perDay)} a day until payment. Please pay the total by ${fmtDate(asOf + 14 * DAY)}. If it is not received we will consider recovering the debt, together with further interest and costs, through the courts.`,
    ``,
    `Yours sincerely,`,
    names.business,
  ].join("\n");

  return { errors: [], amount, dueTime, dueDate: fmtDate(dueTime), asOf: fmtDate(asOf), daysLate, base, rate, perDay: round2(perDay), interest, compensation, costs, claimable, total, horizon, findings, obligations, letter, baseNote, key };
}

export function summaryText(r) {
  return [
    "UK late payment interest (Late Payment of Commercial Debts (Interest) Act 1998)",
    `Invoice ${money(r.amount)}, due ${r.dueDate}, figure as at ${r.asOf} (${r.daysLate} days late)`,
    `Rate ${r.rate}% (8% + ${r.base}% base rate); interest ${money(r.interest)}; fixed compensation ${money(r.compensation)}${r.costs ? `; recovery costs ${money(r.costs)}` : ""}`,
    `Total claimable on top of the invoice: ${money(r.claimable)}; total due ${money(r.total)}`,
    "Verify the base rate and the rules on GOV.UK before sending a demand. Not legal advice.",
  ].join("\n");
}
