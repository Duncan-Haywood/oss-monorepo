// Small-business acquisition calculator: asking price, seller's discretionary earnings (SDE) and a financing structure
// in, debt service, DSCR, cash needed at close, owner take-home and the maximum price that still clears a lender's
// DSCR floor out. Pure arithmetic over the user's own numbers; it does not value the business and it does not know
// any lender's underwriting. Level-payment amortisation, monthly compounding.

export const MODEL_REVIEWED = "2026-11-25";

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

// Number(), not parseFloat(): "90k" or "1.2M" must be an error, not 90 or 1.2 (quality audit 2026-11-19).
const num = (v) => {
  if (typeof v === "number") return v;
  const s = String(v ?? "").replace(/[$,%\s,]/g, "");
  return /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s) ? Number(s) : NaN; // plain decimals: not "Infinity" or "0x10" (red team 2026-11-23)
};
export const money = (x) => ((t) => (x < 0 && /[1-9∞]/.test(t) ? "-$" : "$") + t)(Math.abs(Math.round(x)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ","));
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
  // On full standby the seller note gets no principal or interest for the whole bank/SBA term (SBA SOP 50 10 8 and
  // 8.1; quality audit 2026-11-19), so it is out of the ratio AND out of year-one cash. It may accrue interest and is
  // paid off after the bank loan: sellerDSAfterStandby is that later payment, assuming interest accrues at the note
  // rate for the bank term and the accrued balance then amortises over the note term.
  const yearOneDS = bankDS + (v.standby ? 0 : sellerDS);
  const dscrDebt = yearOneDS;
  const totalDS = yearOneDS;
  const sellerDSAfterStandby = v.standby
    ? annualPayment(sellerNote * Math.pow(1 + v.sellerRate / 100 / 12, Math.round(v.sbaYears * 12)), v.sellerRate, v.sellerYears)
    : 0;
  const cfads = v.sde - v.salary - v.capex;
  const dscr = dscrDebt > 0 ? cfads / dscrDebt : Infinity;
  const down = (v.price * v.downPct) / 100;
  const closing = (v.price * v.closingPct) / 100;
  const cashAtClose = down + closing;
  const cashTotal = cashAtClose + v.workingCap;
  const afterDebt = v.sde - v.capex - yearOneDS; // includes the buyer's own salary
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
    return { chg, sde, dscr: ds > 0 ? cf / ds : Infinity, cashAfter: sde - v.capex - yearOneDS - v.salary };
  });
  // SBA change-of-ownership equity: 10% of total project cost (price, plus the closing costs and working capital this
  // page has the buyer pay in cash), of which a full-standby seller note may supply at most half (SOP 50 10 8).
  const projectCost = v.price + closing + v.workingCap;
  const equityRequired = 0.1 * projectCost;
  const standbyEquity = v.standby ? Math.min(sellerNote, equityRequired / 2) : 0;
  const equityCounted = cashTotal + standbyEquity;
  const equityShort = Math.max(0, equityRequired - equityCounted);
  const notes = [];
  if (bankLoan > 0 && equityShort > 0.005) notes.push(`Equity injection is short by about ${money(equityShort)}. For an SBA 7(a) change of ownership the SBA asks for at least 10% of total project cost (${money(equityRequired)} here: price plus closing costs and working capital); your cash counts${v.standby ? " and the standby seller note counts for up to half" : ", and a seller note counts for up to half only if it is on full standby"}. The rules were revised in SOP 50 10 8.1 (from 2026-10-01); confirm with your lender.`);
  if (dscr < v.targetDscr) notes.push(`DSCR ${dscr.toFixed(2)} is below your ${v.targetDscr.toFixed(2)} floor. At this structure the price that clears it is about ${maxPrice(v.targetDscr) ? money(maxPrice(v.targetDscr)) : "unavailable (cash flow after salary and capex is not positive)"}.`);
  if (bankLoan > 0 && v.targetDscr < 1.25) notes.push(`Your DSCR floor is ${v.targetDscr.toFixed(2)}. For an SBA 7(a) loan to buy a business (an initial acquisition or owner buyout), SOP 50 10 8.1 sets 1.25 as the minimum, so a deal between your floor and 1.25 may not qualify for SBA financing.`);
  if (bankLoan > 5000000) notes.push(`The bank loan is ${money(bankLoan)}. The SBA 7(a) program's maximum loan is $5,000,000, so this structure needs a conventional loan or a larger down payment or seller note.`);
  if (v.price / v.sde > 4) notes.push("The price is more than 4x SDE. Small owner-operated businesses commonly trade for less than that, so check the multiple against comparable sales, not this page.");
  if (cfads <= 0) notes.push("SDE does not cover your salary and capex reserve, so there is no cash to service any debt.");
  if (surplus < 0) notes.push("After debt service the business does not pay you the salary you entered, so you would be funding the gap from savings.");
  if (v.standby && sellerNote > 0) notes.push(`Seller note on full standby: no payments while the bank loan runs, so it is left out of the DSCR and out of year-one cash. If it accrues interest at ${v.sellerRate}% for those ${v.sbaYears} years, paying it off afterwards over ${v.sellerYears} years costs about ${money(sellerDSAfterStandby)} a year.`);
  return {
    values: v, bankLoan, sellerNote, bankDS, sellerDS, totalDS, yearOneDS, dscr, multiple: v.price / v.sde, cfads,
    cashAtClose, cashTotal, afterDebt, surplus, cashOnCash: cashTotal > 0 ? surplus / cashTotal : null,
    maxPriceAtFloor: maxPrice(v.targetDscr), maxPriceAtOne: maxPrice(1), breakEvenSde,
    breakEvenDropPct: (1 - breakEvenSde / v.sde) * 100, sensitivity, sellerDSAfterStandby, projectCost, equityRequired,
    equityCounted, equityShort, notes,
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
    ["Seller note annual debt service", Math.round(r.sellerDS)], ["Debt service paid in year one", Math.round(r.yearOneDS)],
    ["Seller note annual payment after standby ends", Math.round(r.sellerDSAfterStandby)], ["SBA equity required (10% of project cost)", Math.round(r.equityRequired)],
    ["Equity counted (cash plus standby note, capped at half)", Math.round(r.equityCounted)], ["Price / SDE", r.multiple.toFixed(2)], ["DSCR", Number.isFinite(r.dscr) ? r.dscr.toFixed(2) : "n/a"],
    ["Cash needed at close", Math.round(r.cashAtClose)], ["Cash incl. working capital", Math.round(r.cashTotal)],
    ["Cash flow after debt, before your salary", Math.round(r.afterDebt)], ["Surplus after your salary", Math.round(r.surplus)],
    ["Max price at DSCR floor", r.maxPriceAtFloor ? Math.round(r.maxPriceAtFloor) : "n/a"], ["SDE decline that takes DSCR to 1.00 (%)", r.breakEvenDropPct.toFixed(1)]];
  return rows.map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
}
