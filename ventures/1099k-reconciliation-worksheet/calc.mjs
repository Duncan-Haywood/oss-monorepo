/**
 * 1099-K reconciliation worksheet, as a deterministic module.
 *
 * A gig or marketplace seller who sells across more than one platform (Etsy,
 * eBay, Poshmark, Mercari, Depop, Whatnot, StockX, Reverb...) can end up with
 * several Form 1099-K forms in January, each reporting a "gross amount" in
 * Box 1a that is *not* the seller's taxable income and is usually larger
 * than it -- sometimes much larger. That gap is not a bug in the form. The
 * IRS's own General Instructions for Forms 1099-K say Box 1a is the gross
 * amount of reportable transactions "without regard to any adjustments for
 * credits, cash equivalents, discounts, fees, refunds, or other amounts,"
 * and (per each processor's own reporting guidance) it also typically
 * includes any sales tax the *marketplace itself* collected and remitted to
 * the state as a "marketplace facilitator" -- money that passed through the
 * seller's payout but was never the seller's to keep or report as income.
 *
 * This module does exactly one thing: it takes the numbers a seller already
 * has -- each platform's Box 1a, the refunds they issued, the marketplace-
 * remitted sales tax included in that payout, and their own costs (fees,
 * cost of goods sold, shipping they paid) -- and reconciles Box 1a down to
 * an estimated net taxable profit, per platform and in total. It never
 * invents a number, never files anything, and every finding it raises is
 * arithmetic on what was typed in, not a determination of the filer's actual
 * tax liability. See the `NOT_A_FILING` finding, which fires unconditionally
 * for exactly that reason.
 */

function nonNegNumber(value) {
  if (value === "" || value == null) return 0;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Round to the nearest cent, avoiding float noise like 12000 * 1.1 === 13200.000000000002. */
function round2(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** A row's non-income adjustments exceeding this share of Box 1a is worth a second look. */
export const LARGE_NON_INCOME_SHARE = 0.15;

/**
 * Reconcile one platform's 1099-K. `row` fields are all optional except
 * `platform`; missing/blank numeric fields are treated as 0, matching the
 * playbook's "never invent a number" rule -- an unentered cost is not
 * assumed to be zero cost, it is left for the filer to fill in.
 */
export function reconcileRow(row = {}) {
  const platform = String(row.platform ?? "").trim() || "Untitled platform";
  const box1a = nonNegNumber(row.box1a);
  const refunds = nonNegNumber(row.refunds);
  const salesTax = nonNegNumber(row.salesTax);
  const fees = nonNegNumber(row.fees);
  const cogs = nonNegNumber(row.cogs);
  const shipping = nonNegNumber(row.shipping);

  const nonIncomeAdjustments = round2(refunds + salesTax);
  const rawAdjustedGrossReceipts = round2(box1a - nonIncomeAdjustments);
  const adjustedGrossReceipts = Math.max(0, rawAdjustedGrossReceipts);
  const totalExpenses = round2(fees + cogs + shipping);
  const estimatedNetProfit = round2(adjustedGrossReceipts - totalExpenses);

  const findings = [];
  if (rawAdjustedGrossReceipts < 0) {
    findings.push({
      id: "adjustments-exceed-box1a",
      severity: "high",
      title: `${platform}: refunds + marketplace-remitted sales tax exceed Box 1a`,
      detail: `You entered $${nonIncomeAdjustments.toFixed(2)} of refunds and marketplace-remitted sales tax against a Box 1a of $${box1a.toFixed(2)} — that leaves a negative amount, which isn't possible. Re-check these two numbers against the platform's own 1099-K and payout statement before trusting this row.`,
    });
  } else if (box1a > 0 && nonIncomeAdjustments / box1a > LARGE_NON_INCOME_SHARE) {
    findings.push({
      id: "large-non-income-share",
      severity: "medium",
      title: `${platform}: refunds and marketplace-remitted sales tax are ${Math.round((nonIncomeAdjustments / box1a) * 100)}% of Box 1a`,
      detail: `$${nonIncomeAdjustments.toFixed(2)} of the $${box1a.toFixed(2)} reported is refunds or sales tax the platform collected and remitted on your behalf, not your income. That's a large share — worth confirming against the platform's own statement rather than an estimate, since it's the single biggest lever on this row's result.`,
    });
  }
  if (box1a > 0 && estimatedNetProfit < 0) {
    findings.push({
      id: "platform-loss",
      severity: "info",
      title: `${platform}: shows an estimated loss after costs`,
      detail: `After marketplace-remitted tax, refunds, fees, cost of goods, and shipping, this platform's estimated net result is a loss of $${Math.abs(estimatedNetProfit).toFixed(2)}. A loss is common when building inventory or clearing stock below cost — keep the receipts that support it.`,
    });
  }

  return {
    platform, box1a, refunds, salesTax, fees, cogs, shipping,
    nonIncomeAdjustments, rawAdjustedGrossReceipts, adjustedGrossReceipts,
    totalExpenses, estimatedNetProfit, findings,
  };
}

/**
 * Reconcile every platform row and total the result. Row-level findings are
 * flattened into the return value's `findings` alongside two worksheet-level
 * findings that always appear (or a "no rows" placeholder when the
 * worksheet is empty) -- see their own comments for why each fires
 * unconditionally rather than only on a bad number.
 */
export function reconcileAll(rows = []) {
  const reconciled = (Array.isArray(rows) ? rows : []).map(reconcileRow);

  const totals = reconciled.reduce(
    (sum, r) => ({
      box1a: round2(sum.box1a + r.box1a),
      nonIncomeAdjustments: round2(sum.nonIncomeAdjustments + r.nonIncomeAdjustments),
      adjustedGrossReceipts: round2(sum.adjustedGrossReceipts + r.adjustedGrossReceipts),
      totalExpenses: round2(sum.totalExpenses + r.totalExpenses),
      estimatedNetProfit: round2(sum.estimatedNetProfit + r.estimatedNetProfit),
    }),
    { box1a: 0, nonIncomeAdjustments: 0, adjustedGrossReceipts: 0, totalExpenses: 0, estimatedNetProfit: 0 },
  );

  const findings = reconciled.flatMap((r) => r.findings);

  if (reconciled.length === 0) {
    findings.push({
      id: "no-rows",
      severity: "info",
      title: "Add at least one platform's 1099-K to reconcile",
      detail: "Enter the Box 1a amount from each 1099-K you received (Etsy, eBay, Poshmark, Mercari, Depop, Whatnot, StockX, or any other payment app or marketplace), plus what to back out of it, to see a reconciled total.",
    });
  } else {
    if (reconciled.length > 1) {
      findings.push({
        id: "multi-platform-summary",
        severity: "info",
        title: `${reconciled.length} platforms reconciled`,
        detail: `Combined, these ${reconciled.length} 1099-K forms report $${totals.box1a.toFixed(2)} in Box 1a. After backing out $${totals.nonIncomeAdjustments.toFixed(2)} of refunds and marketplace-remitted sales tax and $${totals.totalExpenses.toFixed(2)} of your own costs, this worksheet's estimate of your combined net profit is $${totals.estimatedNetProfit.toFixed(2)}.`,
      });
    }
    // Fires on every non-empty worksheet, unconditionally -- the same
    // pattern as the quarterly-estimated-tax-calendar's always-on
    // annualized-income-note. A worksheet that only warned about a bad
    // number could be mistaken for having confirmed a good one; this
    // finding is what keeps that from happening.
    findings.push({
      id: "not-a-filing",
      severity: "info",
      title: "This is a reconciliation worksheet, not a tax return or a filing",
      detail: "It reconciles the numbers you enter — it does not know about your 1099-NEC, W-2, or other income, does not determine your actual taxable income or what you owe, and does not file anything with the IRS or any platform. Verify every figure against the platform's own 1099-K and payout statements, and give this worksheet — not a conclusion — to whoever prepares your return.",
    });
  }

  return { rows: reconciled, totals, findings };
}

const CSV_HEADERS = [
  "Platform", "Box 1a (reported)", "Refunds/returns", "Marketplace-remitted sales tax",
  "Non-income adjustments", "Adjusted gross receipts", "Platform fees", "Cost of goods sold",
  "Shipping you paid", "Total costs", "Estimated net profit",
];

function csvField(value) {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** The reconciled worksheet as a CSV a filer can hand to their preparer or keep as their own record. */
export function toCsv(result) {
  const lines = [CSV_HEADERS.join(",")];
  for (const r of result.rows) {
    lines.push([
      r.platform, r.box1a, r.refunds, r.salesTax, r.nonIncomeAdjustments, r.adjustedGrossReceipts,
      r.fees, r.cogs, r.shipping, r.totalExpenses, r.estimatedNetProfit,
    ].map(csvField).join(","));
  }
  if (result.rows.length > 1) {
    const t = result.totals;
    lines.push([
      "TOTAL", t.box1a, "", "", t.nonIncomeAdjustments, t.adjustedGrossReceipts, "", "", "", t.totalExpenses, t.estimatedNetProfit,
    ].map(csvField).join(","));
  }
  return lines.join("\n") + "\n";
}

/** Two worked example rows: one straightforward, one showing the sales-tax/refund gap. */
export function sampleRows() {
  return [
    { platform: "Etsy", box1a: "9200", refunds: "180", salesTax: "410", fees: "540", cogs: "3100", shipping: "620" },
    { platform: "Poshmark", box1a: "5400", refunds: "0", salesTax: "0", fees: "1080", cogs: "2200", shipping: "0" },
  ];
}
