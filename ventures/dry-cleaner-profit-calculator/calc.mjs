// Dry cleaner monthly profit from the operator's own figures.
// Pure functions, no I/O. Bad input is rejected with a message, never clamped.

function num(raw, name, errors, { required = false, min = 0, max = Infinity, gt = null } = {}) {
  const s = raw === undefined || raw === null ? "" : String(raw).trim().replace(/[$,%\s]/g, "");
  if (s === "") {
    if (required) errors.push(`${name} is required.`);
    return 0;
  }
  const v = Number(s);
  if (!Number.isFinite(v)) { errors.push(`${name} must be a number.`); return 0; }
  if (v < min) { errors.push(`${name} cannot be below ${min}.`); return 0; }
  if (v > max) { errors.push(`${name} cannot be above ${max}.`); return 0; }
  if (gt !== null && !(v > gt)) { errors.push(`${name} must be greater than ${gt}.`); return 0; }
  return v;
}

export function parse(input) {
  const errors = [];
  const g = {
    dcPieces: num(input.dcPieces, "Dry-clean pieces per month", errors, { required: true }),
    dcPrice: num(input.dcPrice, "Average dry-clean price per piece", errors, { required: true }),
    shirtPieces: num(input.shirtPieces, "Laundered shirts and other wet-clean pieces per month", errors),
    shirtPrice: num(input.shirtPrice, "Average price per laundered piece", errors),
    supplies: num(input.supplies, "Solvent, chemicals, poly and hangers per piece", errors, { max: 20 }),
    claimsPct: num(input.claimsPct, "Damage claims and re-cleans, % of revenue", errors, { max: 50 }),
    cardShare: num(input.cardShare, "Sales paid by card %", errors, { max: 100 }),
    feePct: num(input.feePct, "Card fee % of the sale", errors, { max: 20 }),
    hours: num(input.hours, "Paid labor hours per month", errors, { required: true }),
    wage: num(input.wage, "Average hourly wage", errors, { required: true }),
    burdenPct: num(input.burdenPct, "Payroll burden %", errors, { max: 100 }),
    rent: num(input.rent, "Rent per month", errors),
    utilities: num(input.utilities, "Utilities (gas, power, water) per month", errors),
    insurance: num(input.insurance, "Insurance per month", errors),
    equipment: num(input.equipment, "Equipment lease or maintenance per month", errors),
    route: num(input.route, "Pickup and delivery route cost per month", errors),
    otherFixed: num(input.otherFixed, "Other fixed cost per month (permits, waste disposal, software)", errors),
    debt: num(input.debt, "Loan payments per month", errors),
  };
  if (!(g.dcPieces + g.shirtPieces > 0)) errors.push("Enter at least one piece a month.");
  return { errors, g };
}

export function compute(input) {
  const { errors, g } = parse(input);
  if (errors.length) return { errors };
  const pieces = g.dcPieces + g.shirtPieces;
  const revenue = g.dcPieces * g.dcPrice + g.shirtPieces * g.shirtPrice;
  const supplies = pieces * g.supplies;
  const claims = revenue * (g.claimsPct / 100);
  const cardFees = revenue * (g.cardShare / 100) * (g.feePct / 100);
  const revPct = g.claimsPct / 100 + (g.cardShare / 100) * (g.feePct / 100); // costs that ride on revenue
  const contribution = revenue - supplies - claims - cardFees;
  const labor = g.hours * g.wage * (1 + g.burdenPct / 100);
  const fixed = g.rent + g.utilities + g.insurance + g.equipment + g.route + g.otherFixed;
  const opProfit = contribution - labor - fixed;
  const netAfterDebt = opProfit - g.debt;
  const dscr = g.debt > 0 ? opProfit / g.debt : null;
  const avgRevPerPiece = revenue / pieces;
  const contributionPerPiece = contribution / pieces;
  const laborPct = revenue > 0 ? labor / revenue : null;
  const revenuePerLaborHour = g.hours > 0 ? revenue / g.hours : null;
  const beMultiplier = contribution > 0 ? (labor + fixed + g.debt) / contribution : null;
  const bePieces = beMultiplier === null ? null : beMultiplier * pieces;
  // Average price change (all pieces) that makes profit after loan payments zero at current volume.
  const priceFactor = pieces * (1 - revPct);
  const requiredPriceChange = priceFactor > 0 ? -netAfterDebt / priceFactor : null;

  const profitAtPrice = (d) => netAfterDebt + d * pieces * (1 - revPct);
  const profitAtVolume = (p) => netAfterDebt + (p / 100) * contribution; // labor and fixed held fixed
  const priceSweep = [-0.5, -0.25, 0, 0.25, 0.5, 1].map((d) => ({ dollars: d, profit: profitAtPrice(d) }));
  const volumeSweep = [-30, -20, -10, 0, 10, 20].map((p) => ({ pct: p, profit: profitAtVolume(p) }));

  const findings = [];
  if (netAfterDebt < 0) findings.push({ severity: "high", title: `The plant loses ${money(-netAfterDebt)} a month after loan payments${bePieces !== null ? `; break-even is about ${Math.round(bePieces).toLocaleString("en-US")} pieces a month at this mix (you plan ${Math.round(pieces).toLocaleString("en-US")})` : ""}.` });
  if (requiredPriceChange !== null && requiredPriceChange > 0) findings.push({ severity: "medium", title: `Raising the average price by $${requiredPriceChange.toFixed(2)} a piece, across everything you clean, would bring profit after loan payments to zero.` });
  if (dscr !== null && dscr < 1.25) findings.push({ severity: dscr < 1 ? "high" : "medium", title: `Debt coverage is ${dscr.toFixed(2)}x; lenders commonly look for more than 1.25x (check your own lender's terms).` });
  if (laborPct !== null && laborPct > 0.4) findings.push({ severity: "medium", title: `Labor is ${(laborPct * 100).toFixed(0)}% of revenue (${money(labor)} a month); revenue per paid hour is ${money(revenuePerLaborHour)}.` });
  if (g.claimsPct >= 2) findings.push({ severity: "info", title: `Claims and re-cleans take ${money(claims)} a month (${g.claimsPct}% of revenue); that is ${(claims / Math.max(1, contribution) * 100).toFixed(1)}% of what the pieces contribute.` });
  if (contribution <= 0) findings.push({ severity: "high", title: "Revenue does not cover supplies, claims and card fees, so no volume breaks even." });

  return { errors: [], g, pieces, revenue, supplies, claims, cardFees, contribution, contributionPerPiece, avgRevPerPiece, labor, fixed, opProfit, netAfterDebt, dscr, laborPct, revenuePerLaborHour, beMultiplier, bePieces, requiredPriceChange, priceSweep, volumeSweep, findings };
}

export function money(n) {
  if (n === null || n === undefined || !Number.isFinite(n)) return "n/a";
  return (n < 0 ? "-" : "") + "$" + Math.abs(Math.round(n)).toLocaleString("en-US");
}

export const SAMPLE = {
  dcPieces: "3200", dcPrice: "9.50", shirtPieces: "2400", shirtPrice: "2.75", supplies: "0.45", claimsPct: "1.2", cardShare: "70", feePct: "2.6",
  hours: "520", wage: "15", burdenPct: "12", rent: "3200", utilities: "1900", insurance: "350", equipment: "900", route: "600", otherFixed: "450", debt: "1500",
};

export function summaryText(r) {
  const L = [];
  L.push("Dry cleaner profit");
  L.push(`Volume: ${Math.round(r.pieces).toLocaleString("en-US")} pieces a month at $${r.avgRevPerPiece.toFixed(2)} average; revenue ${money(r.revenue)}`);
  L.push(`Supplies ${money(r.supplies)}, claims and re-cleans ${money(r.claims)}, card fees ${money(r.cardFees)}; contribution ${money(r.contribution)} (${r.contributionPerPiece.toFixed(2)} a piece)`);
  L.push(`Labor ${money(r.labor)}; fixed costs ${money(r.fixed)}`);
  L.push(`Operating profit ${money(r.opProfit)}; after loan payments ${money(r.netAfterDebt)}${r.dscr === null ? "" : `; debt coverage ${r.dscr.toFixed(2)}x`}`);
  L.push(r.bePieces === null ? "Break-even: not reachable at this contribution." : `Break-even: about ${Math.round(r.bePieces).toLocaleString("en-US")} pieces a month at this mix; or ${r.requiredPriceChange >= 0 ? "+" : "-"}$${Math.abs(r.requiredPriceChange).toFixed(2)} a piece at current volume.`);
  return L.join("\n");
}

export function sweepCsv(r) {
  const out = ["change in average price per piece ($),profit after loan payments per month"];
  for (const x of r.priceSweep) out.push(`${x.dollars},${x.profit.toFixed(2)}`);
  out.push("", "change in pieces (%),profit after loan payments per month");
  for (const x of r.volumeSweep) out.push(`${x.pct},${x.profit.toFixed(2)}`);
  return out.join("\n") + "\n";
}
