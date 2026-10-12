// HSA "shoebox" planner. Pure functions, no dependencies, nothing leaves the browser.
// The user lists medical receipts they paid out of pocket since opening an HSA, plus a few assumptions,
// and this compares two ways of handling them over N years:
//   A  "shoebox": pay medical costs from pocket, keep the receipts, leave the HSA invested, reimburse later.
//   B  "as you go": reimburse yourself from the HSA every year and invest that cash in a taxable account.
// Both paths end with the same total of money moved; the difference is tax on the growth of the
// reimbursed dollars, which is tax-free inside the HSA and taxed (capital gains) outside it.
//
// Model (annual steps, deposits and withdrawals at year end, one constant return):
//   HSA_A(t)  = HSA_A(t-1) * (1+r) + contribution
//   pile(t)   = unreimbursed eligible receipts today + new receipts per year * t   (tax-free withdrawal room)
//   B: at t=0 and every year end, withdraw min(HSA balance, receipts due) and put it in a taxable account
//      (cost basis = deposits); HSA_B(t) = (HSA_B(t-1) * (1+r)) + contribution - withdrawal
//   taxable account grows at the same r; tax at the end = capital-gains rate * (value - basis)
//   edge      = HSA_A(n) - HSA_B(n) - (taxable_B(n) - tax)   =  tax on the growth of reimbursed dollars
// Remaining HSA money is assumed spent on future medical costs (tax-free) in both paths. Dividend drag,
// state tax on HSA growth (CA, NJ), and changing rates are not modelled.

export const DEFAULTS = {
  balance: 14000,
  annualReturnPct: 6,
  years: 20,
  annualContribution: 4400,
  annualNewReceipts: 2500,
  cgRatePct: 18.8,
  ordinaryRatePct: 24,
  ageAtWithdrawal: 65,
  hsaOpenDate: "2020-01-01",
  receiptsText: [
    "2020-03-14, 480, Dental crown",
    "2021-06-02, 1250.50, MRI and copay",
    "2022-09-19, 310, Prescription glasses",
    "2023-01-27, 2200, Physical therapy series",
    "2023-11-08, 95, Urgent care copay",
    "2024-05-30, 640, Dermatology",
    "2019-08-12, 700, Before the HSA existed",
    "2022-02-04, 180, Already reimbursed, reimbursed",
  ].join("\n"),
};

export const num = (s) => {
  if (typeof s === "number") return s;
  const t = String(s ?? "").replace(/[$,%\s]/g, "");
  return t === "" ? NaN : Number(t);
};
export const money = (x) => {
  const sign = x < 0 ? "-" : "";
  return `${sign}$${Math.abs(x).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
};
export const money2 = (x) => `${x < 0 ? "-" : ""}$${Math.abs(x).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const pct = (x, d = 1) => `${(x * 100).toFixed(d)}%`;

function parseDate(s) {
  const t = String(s).trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  let y, mo, d;
  if (m) [y, mo, d] = [+m[1], +m[2], +m[3]];
  else if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t))) [mo, d, y] = [+m[1], +m[2], +m[3]];
  else return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return { y, mo, d, iso: `${String(y).padStart(4, "0")}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}` };
}

// One receipt per line: date, amount, optional note. A note ending in the word "reimbursed" marks a
// receipt you already took out of the HSA. Header lines (no digit date) are skipped.
export function parseReceipts(text) {
  const rows = [];
  const errors = [];
  String(text ?? "").split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const parts = line.split(/[,\t;]/).map((p) => p.trim());
    if (i === 0 && !/\d/.test(parts[0])) return;
    const date = parseDate(parts[0]);
    const amount = num(parts[1]);
    if (!date) return void errors.push(`Line ${i + 1}: "${parts[0]}" is not a date (use YYYY-MM-DD or MM/DD/YYYY).`);
    if (!Number.isFinite(amount) || amount <= 0) return void errors.push(`Line ${i + 1}: amount "${parts[1] ?? ""}" is not a positive number.`);
    const note = parts.slice(2).join(", ");
    rows.push({ date: date.iso, amount, note, reimbursed: /reimbursed\s*$/i.test(note) });
  });
  return { rows, errors };
}

export function analyze(input) {
  const o = { ...DEFAULTS, ...input };
  const warnings = [];
  const { rows, errors } = parseReceipts(o.receiptsText);
  warnings.push(...errors);
  const open = parseDate(o.hsaOpenDate);
  if (!open) warnings.push("HSA opening date is not a valid date; every receipt was treated as eligible.");
  const openIso = open ? open.iso : "0000-01-01";

  let eligible = 0, before = 0, done = 0;
  const oldest = [];
  for (const r of rows) {
    if (r.date < openIso) { r.status = "before"; before += r.amount; }
    else if (r.reimbursed) { r.status = "done"; done += r.amount; }
    else { r.status = "eligible"; eligible += r.amount; oldest.push(r); }
  }
  const years = Math.max(0, Math.min(60, Math.round(o.years)));
  const r = o.annualReturnPct / 100;
  const cg = o.cgRatePct / 100;
  const contrib = Math.max(0, o.annualContribution);
  const newRec = Math.max(0, o.annualNewReceipts);

  let hsaA = Math.max(0, o.balance);
  let hsaB = hsaA, tax = 0, basis = 0, taxable = 0, shortfall = 0;
  // B reimburses what it can today.
  let take = Math.min(hsaB, eligible);
  shortfall = eligible - take;
  hsaB -= take; taxable += take; basis += take;
  const table = [{ year: 0, hsaA, hsaB, pile: eligible, taxable, taxableAfterTax: taxable, edge: 0 }];
  for (let t = 1; t <= years; t++) {
    hsaA = hsaA * (1 + r) + contrib;
    hsaB = hsaB * (1 + r) + contrib;
    taxable = taxable * (1 + r);
    take = Math.min(hsaB, newRec + shortfall);
    shortfall = newRec + shortfall - take;
    hsaB -= take; taxable += take; basis += take;
    const after = taxable - Math.max(0, taxable - basis) * cg;
    table.push({ year: t, hsaA, hsaB, pile: eligible + newRec * t, taxable, taxableAfterTax: after, edge: hsaA - hsaB - after });
  }
  const end = table[table.length - 1];
  const taxFreeRoom = Math.min(end.hsaA, end.pile);
  const excess = Math.max(0, end.hsaA - end.pile);
  const ordinary = o.ordinaryRatePct / 100;
  const penalty = o.ageAtWithdrawal < 65 ? 0.2 : 0;
  const excessCost = excess * (ordinary + penalty);

  if (before > 0) warnings.push(`${money2(before)} of receipts are dated before the HSA was opened. Those expenses are not reimbursable and are left out.`);
  if (eligible > o.balance && eligible > 0) warnings.push(`Your unreimbursed receipts (${money2(eligible)}) exceed the current HSA balance (${money2(o.balance)}), so you could not reimburse all of them today.`);
  if (o.annualReturnPct > 12) warnings.push("A return above 12% a year is unusually optimistic for a long projection.");
  if (rows.length === 0) warnings.push("No receipts were found. Paste at least one line like 2024-05-30, 640, Dermatology.");
  if (years === 0) warnings.push("Set the number of years to at least 1 to see growth.");
  return {
    opts: o, rows, years, table, end,
    eligible, before, done, taxFreeRoom, excess, excessCost, penalty,
    edge: end.edge,
    oldest: oldest.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5),
    warnings,
  };
}

export function toCsv(a) {
  const head = "year,hsa_shoebox,hsa_as_you_go,taxable_after_tax,receipts_pile,shoebox_edge";
  const lines = a.table.map((t) => [t.year, t.hsaA, t.hsaB, t.taxableAfterTax, t.pile, t.edge].map((v, i) => (i ? v.toFixed(2) : v)).join(","));
  return [head, ...lines].join("\n");
}
