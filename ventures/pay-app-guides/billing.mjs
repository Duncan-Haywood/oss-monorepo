// Over- and underbilling on one job: the pay application set beside the job's costs.
//
// The pay application measures progress the way the schedule of values does (what was
// billed against each line). A WIP schedule measures it by cost (cost to date / estimated
// total cost, the cost-to-cost method most small contractors' accountants use). When the
// two disagree, the difference is over- or underbilling:
//
//   percent complete (cost)   = cost to date / estimated total cost, capped at 100%
//   earned revenue            = percent complete x contract sum (approved change orders in)
//   over (+) / under (-)      = billed to date - earned revenue
//
// Billed to date is the gross figure from the pay application (total completed and stored
// to date), before retainage: retainage is billed, just not paid yet. Retainage is only used
// to show cash: certified less retainage, against what the job has cost.
//
// Money is in integer cents (toCents from calc.mjs), so the figures add to the cent.
import { toCents, fmt } from "./calc.mjs";

const pct = (x) => `${(x * 100).toFixed(1)}%`;

export function overUnder({ contract, estCost, costToDate, billed, retainage = "", nextCost = "" } = {}) {
  const v = {
    contract: toCents(contract),
    estCost: toCents(estCost),
    costToDate: toCents(costToDate),
    billed: toCents(billed),
    retainage: toCents(retainage),
    nextCost: toCents(nextCost),
  };
  const names = { contract: "Contract sum", estCost: "Estimated total cost", costToDate: "Cost to date", billed: "Billed to date", retainage: "Retainage held", nextCost: "Cost expected next period" };
  const errors = [];
  for (const [k, n] of Object.entries(names)) {
    if (Number.isNaN(v[k])) errors.push(`${n} is not a number.`);
    else if (v[k] < 0) errors.push(`${n} cannot be negative.`);
  }
  if (!errors.length && v.contract <= 0) errors.push("Contract sum must be more than zero.");
  if (!errors.length && v.estCost <= 0) errors.push("Estimated total cost must be more than zero.");
  if (!errors.length && v.retainage > v.billed) errors.push("Retainage held cannot be more than billed to date.");
  if (errors.length) return { errors, warnings: [] };

  const warnings = [];
  const rawPct = v.costToDate / v.estCost;
  const costPct = Math.min(rawPct, 1);
  if (rawPct > 1) warnings.push(`Cost to date is already more than the estimated total cost. Raise the estimate to what the job will really cost; until then percent complete is held at 100% and earned revenue is overstated.`);
  const earned = Math.round(costPct * v.contract);
  const over = v.billed - earned;
  const billedPct = v.billed / v.contract;
  const gap = billedPct - costPct;
  if (v.billed > v.contract) warnings.push("Billed to date is more than the contract sum. Check for a change order missing from the contract sum.");
  const grossProfit = v.contract - v.estCost;
  const loss = grossProfit < 0;
  if (loss) warnings.push(`Estimated total cost is more than the contract: this job is expected to lose ${fmt(-grossProfit)}. Accounting practice usually books the whole expected loss as soon as it is known, not as the work goes on; the WIP schedule tool works out that provision.`);
  const profitToDate = earned - v.costToDate;
  const netBilled = v.billed - v.retainage;
  const cashOverCost = netBilled - v.costToDate;

  // What to bill next period so over/under lands at zero, if the expected cost is incurred.
  let nextBill = null;
  if (String(nextCost ?? "").trim() !== "") {
    const nextPct = Math.min((v.costToDate + v.nextCost) / v.estCost, 1);
    nextBill = Math.max(Math.round(nextPct * v.contract) - v.billed, 0);
  }

  const status = over > 0 ? "over" : over < 0 ? "under" : "even";
  const entry =
    status === "over"
      ? `Dr Contract revenue ${fmt(over)}\nCr Billings in excess of costs and estimated earnings (a liability) ${fmt(over)}`
      : status === "under"
        ? `Dr Costs and estimated earnings in excess of billings (an asset) ${fmt(-over)}\nCr Contract revenue ${fmt(-over)}`
        : "No adjustment: billings equal earned revenue.";

  const summary = [
    `Percent complete by cost: ${pct(costPct)} (${fmt(v.costToDate)} of ${fmt(v.estCost)})`,
    `Percent billed: ${pct(billedPct)} (${fmt(v.billed)} of ${fmt(v.contract)})`,
    `Earned revenue: ${fmt(earned)}`,
    status === "over" ? `Overbilled by ${fmt(over)}` : status === "under" ? `Underbilled by ${fmt(-over)}` : "Billed exactly to earned revenue",
    `Gross profit to date: ${fmt(profitToDate)}; estimated at completion: ${fmt(grossProfit)}`,
    `Certified less retainage, against cost to date: ${fmt(cashOverCost)}`,
    nextBill === null ? null : `To finish next period even, bill about ${fmt(nextBill)}`,
  ].filter(Boolean).join("\n");

  return { errors, warnings, ...v, costPct, billedPct, gap, earned, over, status, grossProfit, loss, profitToDate, netBilled, cashOverCost, nextBill, entry, summary };
}

// The worked example on the page; billing.test.mjs checks its figures.
export const EXAMPLE = { contract: "480000", estCost: "400000", costToDate: "150000", billed: "210000", retainage: "21000", nextCost: "60000" };
