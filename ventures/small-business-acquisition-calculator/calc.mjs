// Small-business acquisition calculator: asking price, seller's discretionary earnings (SDE) and a financing structure
// in, debt service, DSCR, cash needed at close, owner take-home and the maximum price that still clears a lender's
// DSCR floor out. Pure arithmetic over the user's own numbers; it does not value the business and it does not know
// any lender's underwriting. Level-payment amortisation, monthly compounding.

export const MODEL_REVIEWED = "2026-10-06";

export const FIELDS = [
  { id: "price", label: "Asking price", def: 1200000, min: 1 },
  { id: "sde", label: "Seller's discretionary earnings (SDE), per year", def: 360000, min: 1 },
  { id: "salary", label: "Salary you must pay yourself (or a manager), per year", def: 90000, min: 0 },
  { id: "capex", label: "Capex and equipment reserve, per year", def: 15000, min: 0 },
  { id: "downPct", label: "Your cash down payment, % of price", def: 10, min: 0, max: 100 },
  { id: "sellerPct", label: "Seller note, % of price", def: 10, min: 0, max: 100 },
  { id: "sbaRate", label: "Bank / SBA loan rate, % per year", def: 10.5, min: 0, max: 40 },
  { id: "sbaYears", label: "Bank / SBA loan term, years", def: 10, min: 1, max: 40 },
  { id: "sellerRate", label: "Seller note rate, % per year", def: 6, min: 0, max: 40 },
  { id: "sellerYears", label: "Seller note term, years", def: 5, min: 1, max: 40 },
  { id: "closingPct", label: "Closing costs and loan fees, % of price (paid in cash)", def: 4, min: 0, max: 30 },
  { id: "workingCap", label: "Working capital you must hold back, $", def: 50000, min: 0 },
  { id: "targetDscr", label: "Lender DSCR floor", def: 1.25, min: 1, max: 5 },
];

const num = (v) => (typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/[$,%\s,]/g, "")));
export const money = (x) => (x < 0 ? "-$" : "$") + Math.abs(Math.round(x)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
export const pct = (x) => (Math.round(x * 10) / 10).toFixed(1) + "%";

// Monthly level payment for `principal` over `years`, annual rate in percent.
export function annualPayment(principal, ratePct, years) {
  if (principal <= 0) return 0;
  const n = Math.round(years * 12);
  const r = ratePct / 100 / 12;
  const m = r === 0 ? principal / n : (principal * r) / (1 - Math.pow(1 + r, -n));
  return m * 12;
}

// Balance remaining after `months` of payments.
export function balanceAfter(principal, ratePct, years, months) {
  if (principal <= 0) return 0;
  const n = Math.round(years * 12);
  if (months >= n) return 0;
  const r = ratePct / 100 / 12;
  if (r === 0) return principal * (1 - months / n);
  const pmt = (principal * r) / (1 - Math.pow(1 + r, -n));
  return principal * Math.pow(1 + r, months) - pmt * ((Math.pow(1 + r, months) - 1) / r);
}

export function parseInputs(raw) {
  const v = {};
  for (const f of FIELDS) {
    const x = num(raw?.[f.id] ?? f.def);
    if (!Number.isFinite(x)) return { error: `"${f.label}" is not a number.` };
    if (x < f.min) return { error: `"${f.label}" cannot be below ${f.min}.` };
    if (f.max != null && x > f.max) return { error: `"${f.label}" cannot be above ${f.max}.` };
    v[f.id] = x;
  }
  v.standby = Boolean(raw?.standby);
  if (v.downPct + v.sellerPct > 100) return { error: "Down payment plus seller note cannot exceed 100% of the price." };
  return { values: v };
}

// Debt service per $1 of price for the structure in `v`: linear in price, which is what makes the max price solvable.
function structure(v) {
  const bankPct = 100 - v.downPct - v.sellerPct;
  const bankPerDollar = bankPct / 100;
  const sellerPerDollar = v.sellerPct / 100;
  const bank = annualPayment(bankPerDollar, v.sbaRate, v.sbaYears);
  const seller = annualPayment(sellerPerDollar, v.sellerRate, v.sellerYears);
  return { bankPct, bank, seller };
}

export function evaluate(raw) {
  const p = parseInputs(raw);
  if (p.error) return { error: p.error };
  const v = p.values;
  const s = structure(v);
  const bankLoan = (v.price * s.bankPct) / 100;
  const sellerNote = (v.price * v.sellerPct) / 100;
  const bankDS = s.bank * v.price;
  const sellerDS = s.seller * v.price;
  // On full standby the seller note is not paid while the bank is, so a lender leaves it out of the ratio.
  const dscrDebt = bankDS + (v.standby ? 0 : sellerDS);
  const totalDS = bankDS + sellerDS;
  const cfads = v.sde - v.salary - v.capex;
  const dscr = dscrDebt > 0 ? cfads / dscrDebt : Infinity;
  const down = (v.price * v.downPct) / 100;
  const closing = (v.price * v.closingPct) / 100;
  const cashAtClose = down + closing;
  const cashTotal = cashAtClose + v.workingCap;
  const afterDebt = v.sde - v.capex - totalDS; // includes the buyer's own salary
  const surplus = afterDebt - v.salary; // what is left over once the job is paid for
  const maxPrice = (floor) => {
    const perDollar = s.bank + (v.standby ? 0 : s.seller);
    return perDollar > 0 && cfads > 0 ? cfads / (floor * perDollar) : null;
  };
  const breakEvenSde = dscrDebt + v.salary + v.capex; // SDE at which DSCR = 1.00
  const sensitivity = [0, -10, -20, -30].map((chg) => {
    const sde = v.sde * (1 + chg / 100);
    const cf = sde - v.salary - v.capex;
    const ds = dscrDebt;
    return { chg, sde, dscr: ds > 0 ? cf / ds : Infinity, cashAfter: sde - v.capex - totalDS - v.salary };
  });
  const bankBalance5 = balanceAfter(bankLoan, v.sbaRate, v.sbaYears, 60);
  const notes = [];
  if (v.downPct < 10) notes.push("Your down payment is under 10% of the price. Lenders commonly want at least 10% equity in an acquisition, and the rules on what counts change; ask your lender.");
  if (dscr < v.targetDscr) notes.push(`DSCR ${dscr.toFixed(2)} is below your ${v.targetDscr.toFixed(2)} floor. At this structure the price that clears it is about ${maxPrice(v.targetDscr) ? money(maxPrice(v.targetDscr)) : "unavailable (cash flow after salary and capex is not positive)"}.`);
  if (v.price / v.sde > 4) notes.push("The price is more than 4x SDE. Small owner-operated businesses commonly trade for less than that, so check the multiple against comparable sales, not this page.");
  if (cfads <= 0) notes.push("SDE does not cover your salary and capex reserve, so there is no cash to service any debt.");
  if (surplus < 0) notes.push("After debt service the business does not pay you the salary you entered, so you would be funding the gap from savings.");
  if (v.standby) notes.push("Seller note on full standby: its payments are left out of the DSCR but are still counted in cash flow after debt, because you owe them eventually.");
  return {
    values: v, bankLoan, sellerNote, bankDS, sellerDS, totalDS, dscr, multiple: v.price / v.sde, cfads,
    cashAtClose, cashTotal, afterDebt, surplus, cashOnCash: cashTotal > 0 ? surplus / cashTotal : null,
    maxPriceAtFloor: maxPrice(v.targetDscr), maxPriceAtOne: maxPrice(1), breakEvenSde,
    breakEvenDropPct: (1 - breakEvenSde / v.sde) * 100, sensitivity, bankBalance5, notes,
    verdict: dscr >= v.targetDscr ? "clears" : dscr >= 1 ? "thin" : "fails",
  };
}

export function sampleInputs() {
  return Object.fromEntries(FIELDS.map((f) => [f.id, f.def]));
}

export function reportCsv(r) {
  const v = r.values;
  const rows = [["item", "value"], ...FIELDS.map((f) => [f.label, v[f.id]]), ["Seller note on full standby", v.standby ? "yes" : "no"],
    ["Bank loan", Math.round(r.bankLoan)], ["Seller note", Math.round(r.sellerNote)], ["Bank annual debt service", Math.round(r.bankDS)],
    ["Seller note annual debt service", Math.round(r.sellerDS)], ["Price / SDE", r.multiple.toFixed(2)], ["DSCR", Number.isFinite(r.dscr) ? r.dscr.toFixed(2) : "n/a"],
    ["Cash needed at close", Math.round(r.cashAtClose)], ["Cash incl. working capital", Math.round(r.cashTotal)],
    ["Cash flow after debt, before your salary", Math.round(r.afterDebt)], ["Surplus after your salary", Math.round(r.surplus)],
    ["Max price at DSCR floor", r.maxPriceAtFloor ? Math.round(r.maxPriceAtFloor) : "n/a"], ["SDE decline that takes DSCR to 1.00 (%)", r.breakEvenDropPct.toFixed(1)]];
  return rows.map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
}
