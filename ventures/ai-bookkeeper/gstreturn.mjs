// GST return worksheets for Canada (GST/HST return, GST34) and Australia (BAS,
// GST labels). Both reuse vatReturn(): tax charged sits in an output account
// (default 2100) and tax on purchases in an input account (default 1300).
// Worksheets to check a return against, not filings: rates, quick methods,
// zero-rated and exempt supplies, capital purchases and due dates are yours to decide.
import { vatReturn } from "./engine.mjs";

const REGIONS = new Set(["ca", "au"]);

export function gstReturn(books, { region = "ca", output, input, from = null, to = null } = {}) {
  if (!REGIONS.has(region)) throw new Error(`region must be one of ${[...REGIONS].join(", ")}`);
  const v = vatReturn(books, { output, input, from, to });
  const warnings = [...v.warnings];
  const due = v.boxes[1], reclaim = v.boxes[4];
  const net = due - reclaim;
  const salesNet = v.cents.sales, purchasesNet = v.cents.purchases;
  let lines;
  if (region === "ca") {
    lines = {
      101: salesNet, 103: due, 105: due, 106: reclaim, 108: reclaim, 109: net,
    };
    warnings.push("Line 101 is sales before GST/HST. Zero-rated sales belong in it; exempt sales do not, and neither is separated here.");
  } else {
    // BAS reports in whole dollars, and G1 and G11 include the GST.
    lines = {
      G1: whole(salesNet + due), "1A": whole(due), G11: whole(purchasesNet + reclaim), "1B": whole(reclaim),
      net: whole(net),
    };
    warnings.push("G11 here counts every purchase as non-capital (G10 capital purchases are not split out). GST-free sales (G3) are not split out of G1.");
  }
  return { region, from, to, warnings, lines, payable: net >= 0 ? "pay" : "refund", paid: v.paid };
}

function whole(c) { return Math.round(c / 100); }
