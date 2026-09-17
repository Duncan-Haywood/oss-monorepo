/**
 * Security deposit refund and prorated rent math, as two deterministic
 * functions with no dependencies.
 *
 * Both calculators answer a question that comes up at the same predictable
 * moment (lease start or lease end) for both sides of a residential lease:
 * how much prorated rent is owed for a partial month, and how much of a
 * deposit is refundable once itemized deductions are listed. Neither
 * function asserts what is *legally* deductible or cites a jurisdiction's
 * specific deadline or statute -- see index.html's disclaimer and FAQ for
 * why that line is drawn deliberately.
 */

export const SEVERITY = { HIGH: "high", MEDIUM: "medium", LOW: "low", INFO: "info" };

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * @param {{monthlyRent: number, daysInMonth: number, daysOccupied: number}} input
 * @returns {{dailyRate: number, proratedAmount: number, findings: Array<{id:string, severity:string, title:string, detail:string}>}}
 */
export function computeProratedRent({ monthlyRent, daysInMonth, daysOccupied }) {
  const rent = Number.isFinite(monthlyRent) && monthlyRent > 0 ? monthlyRent : 0;
  const totalDays = Number.isFinite(daysInMonth) && daysInMonth > 0 ? daysInMonth : 30;
  const occupied = Number.isFinite(daysOccupied) && daysOccupied > 0 ? daysOccupied : 0;

  const dailyRate = round2(rent / totalDays);
  const cappedOccupied = Math.min(occupied, totalDays);
  const proratedAmount = round2(dailyRate * cappedOccupied);

  const findings = [];

  if (rent === 0) {
    findings.push({
      id: "missing-rent",
      severity: SEVERITY.INFO,
      title: "Enter the full monthly rent",
      detail: "The prorated amount is calculated as a daily rate (monthly rent ÷ days in the month) times the days actually occupied.",
    });
  }

  if (occupied > totalDays) {
    findings.push({
      id: "days-exceed-month",
      severity: SEVERITY.MEDIUM,
      title: "Days occupied is more than the days in the month entered",
      detail: `Capped at ${totalDays} days for this calculation. Check the days-in-month field if this lease spans more than one calendar month.`,
    });
  }

  return { dailyRate, proratedAmount, findings };
}

/**
 * Interest a deposit accrued while held, for the states and cities that
 * require a landlord to pay it (New York for buildings with six or more
 * units, Massachusetts, New Jersey, Connecticut, Maryland, and others --
 * the rate and whether it applies at all is set by the jurisdiction, not
 * this tool, so the rate is always something the user supplies).
 *
 * @param {{depositAmount: number, annualRatePercent: number, daysHeld: number}} input
 * @returns {{interestAmount: number, findings: Array<{id:string, severity:string, title:string, detail:string}>}}
 */
export function computeDepositInterest({ depositAmount, annualRatePercent, daysHeld }) {
  const deposit = Number.isFinite(depositAmount) && depositAmount > 0 ? depositAmount : 0;
  const rate = Number.isFinite(annualRatePercent) && annualRatePercent > 0 ? annualRatePercent : 0;
  const days = Number.isFinite(daysHeld) && daysHeld > 0 ? daysHeld : 0;

  const interestAmount = round2(deposit * (rate / 100) * (days / 365));

  const findings = [];
  if (rate > 0 && days === 0) {
    findings.push({
      id: "interest-rate-without-days",
      severity: SEVERITY.MEDIUM,
      title: "Interest rate entered without days held",
      detail: "An interest rate was entered but no days held, so no interest was added. Enter how many days the deposit was held to include the accrued interest.",
    });
  }

  return { interestAmount, findings };
}

/**
 * @param {{depositAmount: number, deductions: Array<{description: string, amount: number}>, depositInterest?: number}} input
 * @returns {{totalDeductions: number, refundDue: number, balanceOwed: number, depositInterest: number, lineItems: Array<{description: string, amount: number}>, findings: Array<{id:string, severity:string, title:string, detail:string}>}}
 */
export function computeDepositSettlement({ depositAmount, deductions, depositInterest = 0 }) {
  const deposit = Number.isFinite(depositAmount) && depositAmount > 0 ? depositAmount : 0;
  const list = Array.isArray(deductions) ? deductions : [];
  const interest = Number.isFinite(depositInterest) && depositInterest > 0 ? round2(depositInterest) : 0;

  const lineItems = list
    .map((d) => ({
      description: typeof d?.description === "string" ? d.description.trim() : "",
      amount: Number.isFinite(d?.amount) && d.amount > 0 ? round2(d.amount) : 0,
    }))
    .filter((d) => d.amount > 0);

  const totalDeductions = round2(lineItems.reduce((sum, d) => sum + d.amount, 0));
  const refundDue = round2(Math.max(0, deposit + interest - totalDeductions));
  const balanceOwed = round2(Math.max(0, totalDeductions - deposit - interest));

  const findings = [];

  const unlabeled = lineItems.filter((d) => d.description === "");
  if (unlabeled.length > 0) {
    findings.push({
      id: "unitemized-deduction",
      severity: SEVERITY.MEDIUM,
      title: `${unlabeled.length} deduction${unlabeled.length > 1 ? "s" : ""} has no description`,
      detail: "An itemized statement names each deduction specifically (e.g. \"carpet cleaning, living room\"), not just a lump amount. Add a short description to each line before sending it.",
    });
  }

  if (lineItems.length === 0 && deposit > 0) {
    findings.push({
      id: "no-deductions",
      severity: SEVERITY.INFO,
      title: "No deductions entered — full deposit is refundable",
      detail: "Add a line item for each deduction (unpaid rent, cleaning, repairs, or other) to see the itemized refund or balance.",
    });
  }

  if (balanceOwed > 0) {
    findings.push({
      id: "balance-owed",
      severity: SEVERITY.MEDIUM,
      title: "Itemized deductions exceed the deposit",
      detail: "The deposit does not cover the listed deductions, which leaves a balance owed rather than a refund. Most jurisdictions require a separate written demand to collect a balance beyond the deposit — this calculator only totals the numbers entered.",
    });
  }

  findings.push({
    id: "jurisdiction-note",
    severity: SEVERITY.INFO,
    title: "Itemization deadlines and what can be deducted vary by state and lease",
    detail: "This calculator totals the deposit and the deductions you enter — it does not know your state's itemized-statement deadline, deposit limit, or interest rules, and it does not determine what counts as normal wear and tear versus damage. Check your lease and local landlord-tenant law before finalizing.",
  });

  return { totalDeductions, refundDue, balanceOwed, depositInterest: interest, lineItems, findings };
}

/**
 * The disclaimer that travels with a copied statement.
 *
 * This is deliberately part of the text rather than page furniture. The
 * statement's whole purpose is to leave the tool -- it gets pasted into an
 * email to the other party to a lease, who never sees this page and so never
 * sees the footer's "not legal advice" line. A settlement figure arriving in
 * an inbox with no such line reads like a determination of what may be
 * deducted, which is the one thing this calculator does not do. So the line
 * goes in the artifact, not just beside the button that produces it.
 */
export const STATEMENT_DISCLAIMER =
  "Arithmetic only: this statement totals the figures entered and is not a " +
  "legal determination of what may be deducted. It does not apply any " +
  "state's itemization deadline, deposit limit, interest rule, or the line " +
  "between normal wear and tear and damage -- check the lease and local " +
  "landlord-tenant law before relying on it.";

function money(n) {
  const format = (n) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const text = format(Math.abs(n));
  return n < 0 && /[1-9]/.test(text) ? `-${text}` : text;
}

/**
 * Render a settlement as the plain-text itemized statement a landlord has to
 * send and a tenant has to check.
 *
 * Computing the refund is only half the job either side actually has. The
 * landlord's obligation at move-out is to produce an *itemized* statement --
 * each charge named and priced, not a lump sum -- and before this the only
 * way to get one out of the tool was to retype the table into an email. The
 * tenant disputing a deduction has the mirror-image problem: showing their
 * own arithmetic, line by line, so the disagreement is about one charge
 * rather than about the total. One function serves both, because it is the
 * same document read from either end.
 *
 * Plain text with no column alignment on purpose. The destination is an email
 * body or a message box, which is proportional-width nearly everywhere, so
 * space-padded columns that line up in this file arrive ragged. A leading
 * "1." and an em dash survive that.
 *
 * @param {ReturnType<typeof computeDepositSettlement>} settlement
 * @param {{depositAmount: number}} input
 * @returns {string}
 */
export function formatItemizedStatement(settlement, { depositAmount } = {}) {
  const deposit = Number.isFinite(depositAmount) && depositAmount > 0 ? round2(depositAmount) : 0;
  const { lineItems = [], totalDeductions = 0, refundDue = 0, balanceOwed = 0, depositInterest = 0 } = settlement ?? {};

  const lines = ["SECURITY DEPOSIT - ITEMIZED STATEMENT", ""];
  lines.push(`Security deposit held: ${money(deposit)}`, "");

  if (lineItems.length === 0) {
    lines.push("Itemized deductions: none.");
  } else {
    lines.push("Itemized deductions:");
    lineItems.forEach((item, i) => {
      // An unlabelled line is called out here rather than silently printed as
      // blank: computeDepositSettlement already flags it on the page, and the
      // statement is the last point at which it can be caught before it
      // reaches the other party as an unexplained charge.
      const description = item.description || "(description needed)";
      lines.push(`  ${i + 1}. ${description} - ${money(item.amount)}`);
    });
  }

  // Only shown when the user entered an interest rate -- most deposits owe
  // none, and a zero line on every statement would read as a determination
  // that no interest applies, which is not something this tool knows.
  if (depositInterest > 0) {
    lines.push("", `Interest credited: ${money(depositInterest)}`);
  }

  lines.push("", `Total deductions: ${money(totalDeductions)}`);
  lines.push(
    balanceOwed > 0
      ? `Balance owed beyond the deposit: ${money(balanceOwed)}`
      : `Refund due: ${money(refundDue)}`,
  );
  lines.push("", "--", STATEMENT_DISCLAIMER);

  return lines.join("\n");
}
