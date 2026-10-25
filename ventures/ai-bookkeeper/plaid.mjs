// Plaid transactions JSON: the response of /transactions/get, or the `added`
// (and `modified`) lists of /transactions/sync, as a developer saves it. Same row
// shape as bank.mjs readStatement, money INTO the account positive. Plaid's own
// sign is the reverse (a positive `amount` is money leaving the account), per
// its API reference (plaid/plaid-openapi, `Transaction.amount`). Pending rows
// are skipped: Plaid replaces them with a posted row under a new id, so
// reading both would count the purchase twice. Pure function.

const DATE = /^\d{4}-\d\d-\d\d$/;
export function isPlaid(text) {
  const s = String(text).replace(/^﻿/, "").trimStart();
  if (s[0] !== "{" && s[0] !== "[") return false;
  try {
    const rows = plaidList(JSON.parse(s));
    return !!rows && rows.some((t) => t && typeof t === "object" && typeof t.amount === "number" && DATE.test(t.date ?? "") && ("transaction_id" in t || "account_id" in t));
  } catch { return false; }
}
function plaidList(j) {
  if (Array.isArray(j)) return j;
  if (j && Array.isArray(j.transactions)) return j.transactions;
  if (j && Array.isArray(j.added)) return [...j.added, ...(Array.isArray(j.modified) ? j.modified : [])];
  return null;
}

// Plaid's personal_finance_category.detailed codes, from memory of its published taxonomy (not
// checked against a live account), mapped to labels the categorizer's weak bank-category layer
// already reads. Only codes that name one account; broad ones (general merchandise, shops) are left out.
const PFC = {
  FOOD_AND_DRINK_RESTAURANT: "Restaurants", FOOD_AND_DRINK_FAST_FOOD: "Fast Food", FOOD_AND_DRINK_COFFEE: "Coffee Shops",
  TRAVEL_FLIGHTS: "Airfare", TRAVEL_LODGING: "Lodging", TRAVEL_RENTAL_CARS: "Rental Car",
  TRANSPORTATION_GAS: "Gas", TRANSPORTATION_PARKING: "Parking", TRANSPORTATION_PUBLIC_TRANSIT: "Public Transportation", TRANSPORTATION_TAXIS_AND_RIDE_SHARES: "Taxi",
  RENT_AND_UTILITIES_GAS_AND_ELECTRICITY: "Utilities", RENT_AND_UTILITIES_WATER: "Utilities", RENT_AND_UTILITIES_SEWAGE_AND_WASTE_MANAGEMENT: "Utilities",
  RENT_AND_UTILITIES_INTERNET_AND_CABLE: "Internet", RENT_AND_UTILITIES_TELEPHONE: "Phone",
  BANK_FEES_ATM_FEES: "ATM Fees", BANK_FEES_OVERDRAFT_FEES: "Bank Fees", BANK_FEES_FOREIGN_TRANSACTION_FEES: "Bank Fees", BANK_FEES_INSUFFICIENT_FUNDS: "Bank Fees", BANK_FEES_OTHER_BANK_FEES: "Bank Fees", BANK_FEES_LATE_PAYMENT: "Late Fees",
  BANK_FEES_INTEREST_CHARGE: "Interest Charge",
  INCOME_INTEREST_EARNED: "Interest Income", INCOME_DIVIDENDS: "Dividends",
  GENERAL_SERVICES_INSURANCE: "Insurance", GENERAL_SERVICES_ACCOUNTING_AND_FINANCIAL_PLANNING: "Accounting", GENERAL_SERVICES_CONSULTING_AND_LEGAL: "Legal",
  GENERAL_SERVICES_EDUCATION: "Education", GENERAL_SERVICES_POSTAGE_AND_SHIPPING: "Shipping",
  GENERAL_MERCHANDISE_OFFICE_SUPPLIES: "Office Supplies",
  HOME_IMPROVEMENT_HARDWARE: "Hardware", HOME_IMPROVEMENT_REPAIR_AND_MAINTENANCE: "Repairs",
  GOVERNMENT_AND_NON_PROFIT_TAX_PAYMENT: "Taxes",
};
function plaidCat(t) {
  const d = t.personal_finance_category?.detailed;
  return typeof d === "string" ? (PFC[d] ?? "") : "";
}

export function readPlaid(text) {
  const problems = [], rows = [];
  let j;
  try { j = JSON.parse(String(text).replace(/^﻿/, "")); } catch { return { rows, problems: ["The file is not valid JSON."], columns: null, bank: "plaid", inferred: null, statement: null }; }
  const list = plaidList(j) ?? [];
  const seen = new Set(), accounts = new Set(), currencies = new Set();
  let pending = 0;
  list.forEach((t, i) => {
    const n = i + 1;
    if (!t || typeof t.amount !== "number" || !Number.isFinite(t.amount) || !DATE.test(t.date ?? "")) { problems.push(`Transaction ${n}: no numeric amount or YYYY-MM-DD date, skipped.`); return; }
    if (t.pending) { pending++; return; }
    if (t.transaction_id) { if (seen.has(t.transaction_id)) return; seen.add(t.transaction_id); }
    const cents = -Math.round(t.amount * 100);
    if (cents === 0) return;
    if (t.account_id) accounts.add(t.account_id);
    const cur = t.iso_currency_code ?? t.unofficial_currency_code; if (cur) currencies.add(cur);
    const name = String(t.merchant_name || t.name || t.original_description || "").replace(/\s+/g, " ").trim();
    rows.push({ line: n, date: t.date, desc: name || "Plaid transaction", cents, balance: null, ...(plaidCat(t) ? { bankCat: plaidCat(t) } : {}) });
  });
  if (pending) problems.push(`${pending} pending transaction${pending === 1 ? " was" : "s were"} skipped; they post later under a new id.`);
  if (currencies.size > 1) problems.push(`The file mixes currencies (${[...currencies].sort().join(", ")}); amounts are read as they are.`);
  if (accounts.size > 1) problems.push(`The file holds ${accounts.size} accounts; all their lines were read into this one. Filter by account_id to keep them apart.`);
  if (!rows.length && !pending) problems.push("No transactions were found in the Plaid file.");
  return { rows, problems, columns: null, bank: "plaid", inferred: null, statement: null };
}
