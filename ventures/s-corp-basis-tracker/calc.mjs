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
    input: { year: y.year, contributions: contrib, loansMade: loans, loansRepaid: repay, income: pos(y.income), taxExempt: pos(y.taxExempt), distributions: dist, nondeductible: pos(y.nondeductible), losses: pos(y.losses) },
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
      ["Excess distributions (generally gain)", L.excessDistributions], ["Gain on repaying reduced-basis debt", L.repaymentGain], ["Losses suspended to next year", L.lossesSuspended],
    ];
    return `<h2>${r.year}</h2><table>${rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td class="n">${esc(fmt(v))}</td></tr>`).join("")}</table>` +
      (r.notes.length ? `<ul>${r.notes.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : "");
  };
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title><style>body{font:14px system-ui,sans-serif;max-width:760px;margin:24px auto;padding:0 16px}table{width:100%;border-collapse:collapse}td{border-bottom:1px solid #ddd;padding:4px}td.n{text-align:right}h2{margin-top:28px}</style></head><body><h1>${esc(title)}</h1><p>Prepared with the free S-Corp Basis Tracker from numbers the preparer typed. An organising aid in the order Form 7203 uses; not tax advice and not a filed form. Check each amount against the K-1 and the current Form 7203 instructions.</p>${result.rows.map(block).join("")}<p>No warranty. Not tax, legal or financial advice.</p></body></html>`;
}

// ---- Year-end planner ------------------------------------------------------
// Answers the three questions an owner asks before 31 December: how much can I
// still take out tax free, how much would I have to add to deduct what is
// suspended, and is a contribution or a loan the better way to add it.
// Every figure comes from re-running `step` on the last row, so it cannot drift
// from the roll-forward above.

const up = (n) => Math.ceil(n * 100 - 1e-6) / 100;
const down = (n) => Math.floor(n * 100 + 1e-6) / 100;

// Smallest x in [0, hi] (to the cent) with ok(x) true; ok must be monotone. null if ok(hi) is false.
function smallest(ok, hi) {
  if (ok(0)) return 0;
  if (!ok(hi)) return null;
  let lo = 0, h = hi;
  for (let i = 0; i < 60; i++) { const mid = (lo + h) / 2; if (ok(mid)) h = mid; else lo = mid; }
  let x = up(h);
  while (!ok(x)) x = cents(x + 0.01);
  return x;
}
// Largest x in [0, hi] (to the cent) with ok(x) true; ok must be monotone decreasing.
function largest(ok, hi) {
  if (ok(hi)) return hi;
  let lo = 0, h = hi;
  for (let i = 0; i < 60; i++) { const mid = (lo + h) / 2; if (ok(mid)) lo = mid; else h = mid; }
  let x = down(lo);
  while (x > 0 && !ok(x)) x = cents(x - 0.01);
  return x;
}

// `result` is the output of run(); the planned year is its last row.
export function plan(result) {
  const base = result.rows[result.rows.length - 1];
  if (!base) return null;
  const y = base.input;
  const o = base.open;
  const cap = pos(o.stock) + pos(o.debtBasis) + y.contributions + y.loansMade + y.income + y.taxExempt + y.distributions + base.close.suspended + 1;

  const withDist = (d) => step(o, { ...y, distributions: d });
  const noDist = withDist(0);
  // Largest distribution that is entirely return of basis.
  const maxTaxFree = largest((d) => withDist(d).lines.excessDistributions <= 0.004, cap);
  // Largest distribution that suspends no more loss than taking none would.
  const maxKeepLoss = Math.min(maxTaxFree, largest((d) => withDist(d).close.suspended <= noDist.close.suspended + 0.004, cap));

  const addCon = (x) => step(o, { ...y, contributions: y.contributions + x });
  const addLoan = (x) => step(o, { ...y, loansMade: y.loansMade + x });
  const hi = base.close.suspended + base.lines.excessDistributions + 1;
  const stillSuspended = base.close.suspended;
  const conNeed = stillSuspended > 0 ? smallest((x) => addCon(x).close.suspended <= 0.004, hi) : 0;
  const loanNeed = stillSuspended > 0 ? smallest((x) => addLoan(x).close.suspended <= 0.004, hi) : 0;
  const conCoverExcess = base.lines.excessDistributions > 0 ? smallest((x) => addCon(x).lines.excessDistributions <= 0.004, hi) : 0;

  const summary = (label, r, added) => ({
    label, added: cents(added), deductedLosses: r.deductedLosses, suspended: r.close.suspended,
    excessDistributions: r.lines.excessDistributions, stock: r.close.stock, debtBasis: r.close.debtBasis,
    // Face value of loans above their basis: repaying that part later is gain.
    loanAboveBasis: cents(pos(r.close.debtFace - r.close.debtBasis)),
  });
  const scenarios = [summary("As entered", base, 0)];
  if (conNeed) scenarios.push(summary("Contribute " + fmt(conNeed), addCon(conNeed), conNeed));
  if (loanNeed) scenarios.push(summary("Lend " + fmt(loanNeed), addLoan(loanNeed), loanNeed));
  if (conCoverExcess) scenarios.push(summary("Contribute " + fmt(conCoverExcess) + " against the excess", addCon(conCoverExcess), conCoverExcess));

  const advice = [];
  if (base.lines.excessDistributions > 0) {
    advice.push("The distributions entered for " + y.year + " are " + fmt(base.lines.excessDistributions) + " over your stock basis. Taking at most " + fmt(maxTaxFree) + " keeps them tax free" +
      (conCoverExcess ? ", or a capital contribution of " + fmt(conCoverExcess) + " before year end covers the rest. A loan does not: distributions reduce stock basis only." : "."));
  } else if (y.distributions < maxTaxFree) {
    advice.push("You can distribute up to " + fmt(maxTaxFree) + " in " + y.year + " before any of it is taxable; you have entered " + fmt(y.distributions) + ".");
  }
  const costOfDist = base.close.suspended - noDist.close.suspended;
  if (costOfDist > 0.004) advice.push("The " + fmt(y.distributions) + " of distributions entered suspends " + fmt(costOfDist) + " more loss than taking none, because distributions reduce stock basis before losses do. Up to " + fmt(maxKeepLoss) + " would not suspend more.");
  if (stillSuspended > 0 && conNeed != null && loanNeed != null) {
    advice.push("To deduct the " + fmt(stillSuspended) + " suspended after " + y.year + ", add " + fmt(conNeed) + " as a capital contribution or " + fmt(loanNeed) + " as a direct loan from you to the company, before the year ends. A contribution is not repaid; a loan is, and repaying a loan whose basis losses have used can be gain.");
  }
  return { year: y.year, maxTaxFreeDistribution: maxTaxFree, maxDistributionKeepingLosses: maxKeepLoss, contributionToDeductAll: conNeed, loanToDeductAll: loanNeed, contributionToCoverExcess: conCoverExcess, scenarios, advice };
}

// ---- Selling the stock -----------------------------------------------------
// Stock basis is adjusted for the year's income, distributions and losses first
// (Reg. 1.1367-1(d)) and the gain or loss on the shares is figured against what
// is left. A loss still suspended when ALL the stock goes is, as far as it is
// attributable to stock, gone for good: that is why a sale year is the year to
// ask whether adding basis first would turn it into a deduction. `result` is
// the output of run(); the sale is read against its last row, so enter the sale
// year's income, distributions and losses (through the sale date) as that row.
export function saleOutlook(result, { proceeds, expenses = 0 } = {}) {
  const base = result.rows[result.rows.length - 1];
  const pr = Number(proceeds), ex = Number(expenses);
  if (!base || !Number.isFinite(pr) || pr < 0 || !Number.isFinite(ex) || ex < 0) return null;
  const c = base.close;
  const net = cents(pr - ex);
  const gain = cents(net - c.stock);
  const lost = c.suspended;
  const need = lost > 0 ? plan(result).contributionToDeductAll : 0;
  const loanAboveBasis = cents(pos(c.debtFace - c.debtBasis));
  const advice = [];
  advice.push(gain >= 0
    ? "Selling for " + fmt(net) + " after expenses against " + fmt(c.stock) + " of stock basis is a gain of " + fmt(gain) + " (capital gain on the shares if held over a year; the corporation's own assets can change the character)."
    : "Selling for " + fmt(net) + " after expenses against " + fmt(c.stock) + " of stock basis is a loss of " + fmt(-gain) + " on the shares (capital loss).");
  if (lost > 0) advice.push(fmt(lost) + " of suspended loss would still be unused at the sale. If you sell all your stock, the part attributable to stock is lost, not carried. Adding " + fmt(need) + " of stock basis (a capital contribution) before the sale lets that loss be deducted against ordinary income instead. The contribution is consumed by the loss, so the gain on the shares does not change, but you have put in cash and the buyer is getting a company that holds it. Check timing and sale terms with a preparer.");
  if (loanAboveBasis > 0) advice.push("Your loan to the company has a face of " + fmt(c.debtFace) + " but a basis of " + fmt(c.debtBasis) + ". Being repaid, or selling the note, makes about " + fmt(loanAboveBasis) + " of gain on top of the share sale.");
  if (c.debtFace > 0 && lost > 0) advice.push("If the loan stays outstanding after the sale, the part of the suspended loss that belongs to debt basis stays with the debt; this tool does not split it.");
  return { year: base.year, proceeds: cents(pr), expenses: cents(ex), netProceeds: net, stockBasis: c.stock, gain, suspendedLost: lost, contributionToUseLosses: need, loanAboveBasis, advice };
}

// ---- Accumulated adjustments account (AAA) ----------------------------------
// The corporation-level account (IRC 1368(e)) that says how much it can still
// distribute without touching C-corporation earnings. It follows the same
// income, losses and nondeductible expenses as stock basis, with two rules:
// tax-exempt income is not in it, and a year's net NEGATIVE adjustment is taken
// off after distributions, so it never shrinks the amount a distribution can
// come out of. Distributions cannot take it below zero or deepen a negative
// balance. Losses and nondeductible expenses count in the year they reduce
// basis, so this reads them from `run`'s rows. `result` is the output of run().
export function aaa(result, opening = 0) {
  const open0 = Number.isFinite(Number(opening)) ? Number(opening) : 0;
  let cur = open0;
  const rows = [];
  for (const r of result.rows) {
    const income = r.lines.income;
    const reductions = cents(r.deductedLosses + r.lines.nondeductibleUsed);
    const net = cents(income - reductions);
    const available = cents(cur + pos(net));
    const dist = r.lines.distributions;
    const fromAAA = cents(Math.min(dist, pos(available)));
    const beyond = cents(dist - fromAAA);
    const close = cents(cur + net - fromAAA);
    const notes = [];
    if (beyond > 0) notes.push("Distributions of " + fmt(beyond) + " came from more than the account holds. With no earnings from C corporation years they are a return of stock basis (and gain above it); with such earnings, part can be a dividend. The account is not changed by that part.");
    if (close < 0) notes.push("The account is negative at year end: losses have outrun cumulative income. Distributions cannot deepen it.");
    rows.push({ year: r.year, open: cents(cur), income, reductions, net, distributedFromAAA: fromAAA, distributedBeyondAAA: beyond, close, notes });
    cur = close;
  }
  return { opening: cents(open0), rows, closing: cents(cur), taxExemptIncomeExcluded: cents(result.rows.reduce((t, r) => t + r.lines.taxExempt, 0)) };
}

// ---- Several shareholders (preparers) --------------------------------------
// One paste for a whole client list. Columns: shareholder, then the FIELDS of
// parseYears (year first). A row whose year is "opening" (or "start") carries a
// shareholder's starting figures instead, in the next four columns: stock basis,
// debt basis, loan balance owed, suspended losses. Every shareholder is rolled
// forward by the same `run` as the single-shareholder tool.

const OPENING_WORDS = /^(opening|start|open)$/i;

export function parseBatch(text) {
  const errors = [];
  const order = [];
  const groups = new Map();
  const get = (name) => {
    if (!groups.has(name)) { groups.set(name, { name, opening: { stock: 0, debtBasis: 0, debtFace: 0, suspended: 0, ndCarry: 0 }, lines: [] }); order.push(name); }
    return groups.get(name);
  };
  const lines = String(text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  lines.forEach((line, i) => {
    const cells = line.split(/\t|,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map((c) => c.replace(/^"|"$/g, "").trim());
    if (i === 0 && /^(shareholder|name|owner)/i.test(cells[0])) return; // header
    const name = cells[0];
    if (!name) { errors.push("Line " + (i + 1) + ": the first column must name the shareholder."); return; }
    const g = get(name);
    if (OPENING_WORDS.test(cells[1] || "")) {
      const keys = ["stock", "debtBasis", "debtFace", "suspended"];
      keys.forEach((k, j) => {
        const v = parseMoney(cells[2 + j] ?? "");
        if (Number.isNaN(v) || v < 0) errors.push("Line " + (i + 1) + ": '" + cells[2 + j] + "' is not an amount of zero or more.");
        else g.opening[k] = v;
      });
      return;
    }
    g.lines.push({ n: i + 1, text: cells.slice(1).join("\t") });
  });
  const holders = order.map((name) => {
    const g = groups.get(name);
    const p = parseYears(g.lines.map((l) => l.text).join("\n"));
    p.errors.forEach((e) => errors.push(name + ": " + e));
    return { name, opening: g.opening, years: p.years };
  });
  return { holders, errors };
}

export function runBatch(text) {
  const parsed = parseBatch(text);
  const holders = parsed.holders.map((h) => {
    if (!h.years.length) return { ...h, result: null };
    return { ...h, result: run(h.opening, h.years) };
  });
  const errors = [...parsed.errors];
  for (const h of holders) {
    if (!h.result) errors.push(h.name + ": no year rows.");
    else h.result.problems.forEach((p) => errors.push(h.name + ": " + p));
  }
  return { holders, errors };
}

// Who needs attention first: one row per shareholder, flagged rows sorted to the top.
export function batchSummary(batch) {
  const rows = batch.holders.filter((h) => h.result).map((h) => {
    const r = h.result;
    const excess = cents(r.rows.reduce((a, x) => a + x.lines.excessDistributions, 0));
    const repayGain = cents(r.rows.reduce((a, x) => a + x.lines.repaymentGain, 0));
    const flags = [];
    if (excess > 0) flags.push("excess distributions");
    if (r.closing.suspended > 0) flags.push("suspended losses");
    if (repayGain > 0) flags.push("loan repayment gain");
    const p = plan(r);
    return {
      name: h.name, years: r.rows.length, lastYear: r.rows[r.rows.length - 1].year,
      stock: r.closing.stock, debtBasis: r.closing.debtBasis, suspended: r.closing.suspended,
      excessDistributions: excess, repaymentGain: repayGain, maxTaxFreeDistribution: p.maxTaxFreeDistribution,
      contributionToDeductAll: p.contributionToDeductAll, flags,
    };
  });
  return rows.sort((a, b) => b.flags.length - a.flags.length || b.excessDistributions + b.suspended - (a.excessDistributions + a.suspended));
}

export function batchCsv(batch) {
  const q = (s) => (/[",\n]/.test(String(s)) ? '"' + String(s).replace(/"/g, '""') + '"' : String(s));
  const head = ["shareholder", "year", "opening_stock", "opening_debt_basis", "contributions", "loans_made", "income", "tax_exempt", "debt_basis_restored", "distributions", "taxable_excess_distributions", "nondeductible_used", "losses_available", "loss_against_stock", "loss_against_debt", "losses_suspended", "repayment_gain", "closing_stock", "closing_debt_basis", "closing_loan_balance"];
  const rows = [];
  for (const h of batch.holders) {
    if (!h.result) continue;
    for (const r of h.result.rows) rows.push([q(h.name), r.year, r.open.stock, r.open.debtBasis, r.lines.contributions, r.lines.loansMade, r.lines.income, r.lines.taxExempt, r.lines.debtRestored, r.lines.distributions, r.lines.excessDistributions, r.lines.nondeductibleUsed, r.lines.lossesAvailable, r.lines.lossAgainstStock, r.lines.lossAgainstDebt, r.lines.lossesSuspended, r.lines.repaymentGain, r.close.stock, r.close.debtBasis, r.close.debtFace].join(","));
  }
  return [head.join(","), ...rows].join("\n") + "\n";
}

// One printable file: a summary page, then each shareholder's worksheet.
export function batchPacketHtml(batch, title = "S corporation shareholder basis worksheets") {
  const sum = batchSummary(batch);
  const table = `<table><tr><th>Shareholder</th><th class="n">Stock basis</th><th class="n">Debt basis</th><th class="n">Suspended</th><th class="n">Taxable excess dist.</th><th class="n">Loan repay gain</th><th>Flags</th></tr>` +
    sum.map((s) => `<tr><td>${esc(s.name)}</td><td class="n">${esc(fmt(s.stock))}</td><td class="n">${esc(fmt(s.debtBasis))}</td><td class="n">${esc(fmt(s.suspended))}</td><td class="n">${esc(fmt(s.excessDistributions))}</td><td class="n">${esc(fmt(s.repaymentGain))}</td><td>${esc(s.flags.join(", ") || "none")}</td></tr>`).join("") + "</table>";
  const inner = batch.holders.filter((h) => h.result).map((h) => {
    const body = packetHtml(h.result, h.name).match(/<body>([\s\S]*)<\/body>/)[1];
    return `<section style="page-break-before:always">${body.replace(/<p>Prepared with[\s\S]*?<\/p>/, "").replace(/<p>No warranty\.[\s\S]*?<\/p>/, "")}</section>`;
  }).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title><style>body{font:14px system-ui,sans-serif;max-width:860px;margin:24px auto;padding:0 16px}table{width:100%;border-collapse:collapse}td,th{border-bottom:1px solid #ddd;padding:4px;text-align:left}td.n,th.n{text-align:right}h2{margin-top:28px}</style></head><body><h1>${esc(title)}</h1><p>Prepared with the free S-Corp Basis Tracker from numbers the preparer typed. An organising aid in the order Form 7203 uses; not tax advice and not a filed form. Check each amount against the K-1 and the current Form 7203 instructions.</p>${table}${inner}<p>No warranty. Not tax, legal or financial advice.</p></body></html>`;
}

export const BATCH_SAMPLE = [
  "shareholder,year,contributions,loansMade,loansRepaid,income,taxExempt,distributions,nondeductible,losses",
  "Avery Example,opening,20000,0,0,0",
  "Avery Example,2022,0,30000,0,0,0,0,1500,70000",
  "Avery Example,2023,0,0,0,40000,0,10000,0,0",
  "Avery Example,2024,0,0,15000,90000,500,60000,2000,0",
  "Blake Example,opening,5000,0,0,0",
  "Blake Example,2024,0,0,0,12000,0,30000,0,0",
  "Casey Example,2024,10000,0,0,25000,0,8000,0,0",
].join("\n");

// ---- Schedule K-1 (Form 1120-S) box entry -----------------------------------
// Shareholders hold a K-1, not the nine columns above. One line per year in K-1
// box numbers, e.g. `2024: 1=90000, 4=200, 11=5000, 16A=500, 16C=2000, 16D=60000, 16E=15000`,
// becomes a row for `parseYears`. Boxes 1-10 are income (loss); a positive amount is
// income and a negative one a loss. Boxes 11 (section 179) and 12 (other deductions)
// are deductions and reduce basis with the losses. 16A/16B are tax-exempt income,
// 16C nondeductible expenses, 16D distributions, 16E loan repayments. A K-1 does not
// show contributions or new loans, so `contrib=` and `loan=` take those. Credits
// (13), K-3 (14) and AMT items (15) do not change basis here and are ignored.
const K1_INCOME = ["1", "2", "3", "4", "5A", "6", "7", "8A", "9", "10"];
const K1_BOXES = new Set([...K1_INCOME, "11", "12", "16A", "16B", "16C", "16D", "16E", "CONTRIB", "LOAN"]);

export function fromK1Boxes(text) {
  const rows = [], errors = [];
  String(text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean).forEach((line, i) => {
    const m = line.match(/^(\d{4})\s*[:,]?\s*(.*)$/);
    if (!m || Number(m[1]) < 1958 || Number(m[1]) > 2100) { errors.push("Line " + (i + 1) + ": start with the tax year, then box=amount pairs."); return; }
    const box = {};
    let bad = false;
    for (const part of m[2].split(/[,;]+|\s{2,}/).map((s) => s.trim()).filter(Boolean)) {
      const kv = part.match(/^(?:box\s*)?([0-9]{1,2}[a-e]?|contrib|loan)\s*=\s*(.+)$/i);
      const key = kv && kv[1].toUpperCase();
      if (!kv || !K1_BOXES.has(key)) { errors.push("Line " + (i + 1) + ": '" + part + "' is not a box I read (use 1-10, 11, 12, 16A-16E, contrib, loan)."); bad = true; continue; }
      const v = parseMoney(kv[2]);
      if (Number.isNaN(v)) { errors.push("Line " + (i + 1) + ": '" + kv[2] + "' is not an amount."); bad = true; continue; }
      box[key] = (box[key] || 0) + v;
    }
    if (bad) return;
    let income = 0, losses = 0;
    for (const k of K1_INCOME) { const v = box[k] || 0; if (v >= 0) income += v; else losses -= v; }
    losses += Math.abs(box["11"] || 0) + Math.abs(box["12"] || 0);
    const get = (k) => Math.abs(box[k] || 0);
    rows.push({ year: Number(m[1]), contributions: get("CONTRIB"), loansMade: get("LOAN"), loansRepaid: get("16E"), income: cents(income), taxExempt: get("16A") + get("16B"),
      distributions: get("16D"), nondeductible: get("16C"), losses: cents(losses) });
  });
  const text2 = rows.length ? [FIELDS.join(","), ...rows.map((r) => FIELDS.map((f) => r[f]).join(","))].join("\n") : "";
  return { rows, errors, text: text2 };
}

export const K1_SAMPLE = [
  "2022: 1=-70000, 16C=1500, loan=30000",
  "2023: 1=40000, 16D=10000",
  "2024: 1=88000, 4=2000, 16A=500, 16C=2000, 16D=60000, 16E=15000",
].join("\n");
