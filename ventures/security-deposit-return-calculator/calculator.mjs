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
 * @param {{depositAmount: number, deductions: Array<{description: string, amount: number}>}} input
 * @returns {{totalDeductions: number, refundDue: number, balanceOwed: number, lineItems: Array<{description: string, amount: number}>, findings: Array<{id:string, severity:string, title:string, detail:string}>}}
 */
export function computeDepositSettlement({ depositAmount, deductions }) {
  const deposit = Number.isFinite(depositAmount) && depositAmount > 0 ? depositAmount : 0;
  const list = Array.isArray(deductions) ? deductions : [];

  const lineItems = list
    .map((d) => ({
      description: typeof d?.description === "string" ? d.description.trim() : "",
      amount: Number.isFinite(d?.amount) && d.amount > 0 ? round2(d.amount) : 0,
    }))
    .filter((d) => d.amount > 0);

  const totalDeductions = round2(lineItems.reduce((sum, d) => sum + d.amount, 0));
  const refundDue = round2(Math.max(0, deposit - totalDeductions));
  const balanceOwed = round2(Math.max(0, totalDeductions - deposit));

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

  return { totalDeductions, refundDue, balanceOwed, lineItems, findings };
}
