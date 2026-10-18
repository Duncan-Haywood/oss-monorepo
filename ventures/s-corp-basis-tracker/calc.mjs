// S corporation shareholder basis, in the order Form 7203 and IRC 1366-1368 use.
// Pure arithmetic on numbers the user types; nothing here reads or sends data.

export const FIELDS = [
  "year", "contributions", "loansMade", "loansRepaid", "income", "taxExempt",
  "distributions", "nondeductible", "losses",
];

const cents = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const pos = (n) => (n > 0 ? n : 0);

// "$1,234.50", "(2,000)", "-300", "1.2k" -> number. Blank -> 0. Anything else -> NaN.
export function parseMoney(s) {
  if (typeof s === "number") return Number.isFinite(s) ? s : NaN;
  let t = String(s ?? "").trim().replace(/[$,\s]/g, "");
  if (t === "") return 0;
  let neg = false;
  if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1); }
  let mult = 1;
  if (/[kK]$/.test(t)) { mult = 1000; t = t.slice(0, -1); }
  if (!/^-?\d*\.?\d+$/.test(t) && !/^-?\d+\.?$/.test(t)) return NaN;
  const v = Number(t) * mult;
  return neg ? -v : v;
}

// One tax year. `open` = { stock, debtBasis, debtFace, suspended, ndCarry }.
// Order (Form 7203 / Reg. 1.1367-1(f)): loans in, income and contributions up,
// debt basis restored before stock, distributions, nondeductible expenses,
// then losses (suspended first-day carryover included) against stock and then debt,
// and last, loan repayments.
export function step(open, y) {
  const n = [];
  const o = { stock: open.stock, debtBasis: open.debtBasis, debtFace: open.debtFace, suspended: open.suspended, ndCarry: open.ndCarry || 0 };
  const contrib = pos(y.contributions), loans = pos(y.loansMade), repay = pos(y.loansRepaid);
  const inc = pos(y.income) + pos(y.taxExempt);
  const dist = pos(y.distributions), nd = pos(y.nondeductible) + o.ndCarry;
  const loss = pos(y.losses) + o.suspended;

  // New shareholder loans count at face from the day they are made.
  const deficit = pos(o.debtFace - o.debtBasis);
  o.debtFace += loans;
  let debtBasis = o.debtBasis + loans;

  // Net increase restores previously reduced debt basis first, then stock.
  const netIncrease = pos(inc - dist - nd);
  const restore = Math.min(netIncrease, deficit);
  debtBasis += restore;
  let stock = o.stock + contrib + inc - restore;

  const beforeDist = stock;
  const nonTaxableDist = Math.min(dist, pos(stock));
  const excessDist = dist - nonTaxableDist;
  stock -= nonTaxableDist;
  if (excessDist > 0) n.push("Distributions exceeded stock basis by " + fmt(excessDist) + ": the excess is generally treated as gain (capital gain if the stock was held over a year). If the corporation has earnings from C corporation years, part may be a dividend instead.");

  const ndUsed = Math.min(nd, pos(stock));
  const ndCarry = nd - ndUsed;
  stock -= ndUsed;
  if (ndCarry > 0) n.push("Nondeductible expenses of " + fmt(ndCarry) + " exceeded stock basis and carry to next year, where they reduce basis before losses.");

  const stockLoss = Math.min(loss, pos(stock));
  stock -= stockLoss;
  const afterStock = loss - stockLoss;
  const debtLoss = Math.min(afterStock, pos(debtBasis));
  debtBasis -= debtLoss;
  const suspended = afterStock - debtLoss;
  if (suspended > 0) n.push("Losses of " + fmt(suspended) + " are suspended: carry them forward and they become deductible when basis is added (stock purchase, contribution, direct shareholder loan, or income).");
  if (o.suspended > 0 && suspended === 0) n.push("Prior-year suspended losses of " + fmt(o.suspended) + " were fully used.");

  // Repayment of debt whose basis was reduced gives gain on the reduced part.
  let repayGain = 0;
  let face = o.debtFace;
  if (repay > 0) {
    const r = Math.min(repay, face);
    if (repay > face) n.push("Repayments of " + fmt(repay - face) + " exceed the loan balance you entered and were ignored.");
    const ratio = face > 0 ? pos(face - debtBasis) / face : 0;
    repayGain = r * ratio;
    debtBasis -= r - repayGain;
    face -= r;
    if (repayGain > 0) n.push("Repaying debt whose basis was reduced by losses creates about " + fmt(repayGain) + " of gain (ordinary income if the debt is a note, capital gain if open account). Check how the loan is documented.");
  }
  if (debtBasis < 0) debtBasis = 0;

  const close = { stock: cents(stock), debtBasis: cents(debtBasis), debtFace: cents(face), suspended: cents(suspended), ndCarry: cents(ndCarry) };
  return {
    year: y.year,
    open: { ...o },
    lines: {
      contributions: cents(contrib), loansMade: cents(loans), income: cents(pos(y.income)), taxExempt: cents(pos(y.taxExempt)),
      debtRestored: cents(restore), distributions: cents(dist), nonTaxableDistributions: cents(nonTaxableDist), excessDistributions: cents(excessDist),
      nondeductibleUsed: cents(ndUsed), lossesAvailable: cents(loss), lossAgainstStock: cents(stockLoss), lossAgainstDebt: cents(debtLoss),
      lossesSuspended: cents(suspended), loansRepaid: cents(pos(repay > 0 ? Math.min(repay, o.debtFace) : 0)), repaymentGain: cents(repayGain),
      stockBeforeDistributions: cents(beforeDist),
    },
    close,
    deductedLosses: cents(stockLoss + debtLoss),
    // Basis you would have to add (stock, contribution or direct loan) to deduct what is suspended.
    basisNeededToDeductAll: close.suspended,
    notes: n,
  };
}

export function run(opening, years) {
  const rows = [];
  let cur = { stock: 0, debtBasis: 0, debtFace: 0, suspended: 0, ndCarry: 0, ...opening };
  const problems = [];
  const sorted = [...years].sort((a, b) => a.year - b.year);
  for (let i = 1; i < sorted.length; i++) if (sorted[i].year === sorted[i - 1].year) problems.push("Year " + sorted[i].year + " appears twice; combine the rows.");
  for (const y of sorted) {
    const r = step(cur, y);
    rows.push(r);
    cur = r.close;
  }
  return { rows, closing: cur, problems };
}

export function fmt(n) {
  const v = cents(n);
  return (v < 0 ? "-$" : "$") + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Parse a pasted table. Header optional; column order is FIELDS.
export function parseYears(text) {
  const out = [], errors = [];
  const lines = String(text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  lines.forEach((line, i) => {
    const cells = line.split(/\t|,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map((c) => c.replace(/^"|"$/g, "").trim());
    if (i === 0 && /[a-z]/i.test(cells[0])) return; // header
    const year = Number(cells[0]);
    if (!Number.isInteger(year) || year < 1958 || year > 2100) { errors.push("Line " + (i + 1) + ": first column must be a tax year."); return; }
    const y = { year };
    for (let k = 1; k < FIELDS.length; k++) {
      const v = parseMoney(cells[k] ?? "");
      if (Number.isNaN(v)) { errors.push("Line " + (i + 1) + ": '" + cells[k] + "' is not an amount."); y[FIELDS[k]] = 0; } else y[FIELDS[k]] = v;
    }
    // Income and loss columns accept the sign the K-1 shows: a negative income is a loss.
    if (y.income < 0) { y.losses += -y.income; y.income = 0; }
    out.push(y);
  });
  return { years: out, errors };
}

export const SAMPLE = {
  opening: { stock: 20000, debtBasis: 0, debtFace: 0, suspended: 0 },
  text: [
    "year,contributions,loansMade,loansRepaid,income,taxExempt,distributions,nondeductible,losses",
    "2022,0,30000,0,0,0,0,1500,70000",
    "2023,0,0,0,40000,0,10000,0,0",
    "2024,0,0,15000,90000,500,60000,2000,0",
  ].join("\n"),
};

export function csv(result) {
  const head = ["year", "opening_stock", "opening_debt_basis", "contributions", "loans_made", "income", "tax_exempt", "debt_basis_restored", "distributions", "taxable_excess_distributions", "nondeductible_used", "losses_available", "loss_against_stock", "loss_against_debt", "losses_suspended", "repayment_gain", "closing_stock", "closing_debt_basis", "closing_loan_balance"];
  const rows = result.rows.map((r) => [r.year, r.open.stock, r.open.debtBasis, r.lines.contributions, r.lines.loansMade, r.lines.income, r.lines.taxExempt, r.lines.debtRestored, r.lines.distributions, r.lines.excessDistributions, r.lines.nondeductibleUsed, r.lines.lossesAvailable, r.lines.lossAgainstStock, r.lines.lossAgainstDebt, r.lines.lossesSuspended, r.lines.repaymentGain, r.close.stock, r.close.debtBasis, r.close.debtFace].join(","));
  return [head.join(","), ...rows].join("\n") + "\n";
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// Self-contained printable worksheet, one block per year.
export function packetHtml(result, title = "S corporation shareholder basis worksheet") {
  const block = (r) => {
    const L = r.lines;
    const rows = [
      ["Stock basis at beginning of year", r.open.stock], ["Capital contributions and stock purchases", L.contributions],
      ["Income items (ordinary, separately stated)", L.income], ["Tax-exempt income", L.taxExempt],
      ["Debt basis restored from net increase", -L.debtRestored], ["Distributions applied to stock basis", -L.nonTaxableDistributions],
      ["Nondeductible expenses applied", -L.nondeductibleUsed], ["Losses and deductions allowed against stock", -L.lossAgainstStock],
      ["Stock basis at end of year", r.close.stock], ["Debt basis at beginning of year", r.open.debtBasis],
      ["Loans made", L.loansMade], ["Debt basis restored", L.debtRestored], ["Losses allowed against debt", -L.lossAgainstDebt],
      ["Debt basis reduced by repayment", -(L.loansRepaid - L.repaymentGain)], ["Debt basis at end of year", r.close.debtBasis],
      ["Excess distributions (generally gain)", L.excessDistributions], ["Losses suspended to next year", L.lossesSuspended],
    ];
    return `<h2>${r.year}</h2><table>${rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td class="n">${esc(fmt(v))}</td></tr>`).join("")}</table>` +
      (r.notes.length ? `<ul>${r.notes.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : "");
  };
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title><style>body{font:14px system-ui,sans-serif;max-width:760px;margin:24px auto;padding:0 16px}table{width:100%;border-collapse:collapse}td{border-bottom:1px solid #ddd;padding:4px}td.n{text-align:right}h2{margin-top:28px}</style></head><body><h1>${esc(title)}</h1><p>Prepared with the free S-Corp Basis Tracker from numbers the preparer typed. An organising aid in the order Form 7203 uses; not tax advice and not a filed form. Check each amount against the K-1 and the current Form 7203 instructions.</p>${result.rows.map(block).join("")}<p>No warranty. Not tax, legal or financial advice.</p></body></html>`;
}
