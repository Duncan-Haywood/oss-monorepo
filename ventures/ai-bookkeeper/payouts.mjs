// Payment-processor payouts. A Stripe (or Square, Shopify, Gumroad ...) deposit
// reaches the bank as one lump: 970.00 for 1,000.00 of sales less 30.00 of
// fees. The processor's own report lists every charge, refund and fee behind
// the lump. This reads that report, finds the bank line each payout became,
// and splits the line into sales, refunds and fees, so the books show gross
// sales and the true cost of taking cards, not just what landed.
//
// Shopify Payments "payout transactions" CSVs (Transaction Date, Type, Amount,
// Fee, Net, Payout Date, Payout ID) read through the same aliases, from the
// documented layout only.
// PayPal activity CSVs (Date, Time, Name, Type, Status, Gross, Fee, Net,
// Transaction ID ...) have no payout id. A withdrawal row (type containing
// "withdrawal") is the payout; the completed rows since the previous
// withdrawal are what it paid out. It is split only when those rows net to
// exactly the withdrawal; a balance carried over from before the report is
// listed in `problems`, never guessed at. PayPal shows fees as negatives.
// Report columns (Stripe "payout reconciliation" or balance-transactions CSV,
// matched by name, any order): payout id, payout date, category, gross, fee,
// net, and optionally an id and a created date. A row's net must equal gross
// less fee, or the report is refused as damaged. The payout's own row
// (category "payout") is skipped. Rows with no payout id have not been paid out
// yet and are listed as pending, never matched.
//
// Bank match: a positive, not-yet-split line in the books equal to the
// payout's net, dated from 2 days before to 7 days after the payout date; the
// nearest date wins, and a line is used once. Nothing is posted by `plan`.
// Creator-platform exports (Gumroad, Paddle, Lemon Squeezy style: payout_reference, sale_price, platform_fee, payout_amount; purchase and subscription_payment categories) read through aliases from memory of their help pages; no real export tried.
// Amazon settlement reports (flat file V2) and the date-range CSV are read too; see readAmazon, readAmazonRange.
// Integer cents. Hand-written fixtures in the documented layout only; no real
// export has been tried. Not accounting advice.

import { parseCsv, parseCents, parseDate } from "./bank.mjs";
import { confirm } from "./engine.mjs";
import { fmt } from "./ledger.mjs";

const key = (h) => String(h).trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
const ALIASES = {
  payout: ["automatic_payout_id", "payout_id", "payout", "transfer_id", "transfer", "payout_reference", "payout_reference_id", "deposit_id"],
  payoutDate: ["automatic_payout_effective_at", "automatic_payout_effective_at_utc", "payout_date", "payout_effective_at", "arrival_date", "transfer_date", "transfer_date_utc", "deposit_date"],
  category: ["reporting_category", "event_type", "category", "type", "transaction_type"],
  gross: ["gross", "amount", "gross_amount", "gross_sales", "total_collected", "sale_price", "total", "customer_total"],
  fee: ["fee", "fees", "fee_amount", "processing_fees", "total_fee", "platform_fee", "gumroad_fee", "paddle_fee"],
  net: ["net", "net_amount", "net_total", "payout_amount", "earnings"],
  id: ["balance_transaction_id", "id", "transaction_id", "payment_id"],
  created: ["created", "created_utc", "created_at", "transaction_date", "payment_date", "date"],
  desc: ["description", "memo"],
};

// What each Stripe reporting_category means for the books: [section, account role].
const CATEGORY = {
  charge: "sales", payment: "sales", sale: "sales", order: "sales",
  refund: "refunds", payment_refund: "refunds", refund_failure: "sales",
  fee: "fees", stripe_fee: "fees", network_cost: "fees", tax: "fees",
  dispute: "disputes", dispute_reversal: "disputes", chargeback: "disputes", payment_failure_refund: "refunds",
  adjustment: "other", reserve: "reserve", risk_reserved_funds: "reserve", reserved_funds: "reserve", chargeback_won: "disputes", chargeback_reversal: "disputes",
  card: "sales", square_card: "sales", online_checkout: "sales", processing_fee: "fees",
  stripe_fx_fee: "fees", tax_fee: "fees", contribution: "fees", partial_capture_reversal: "refunds",
  chargeback_fee: "fees", dispute_fee: "fees", chargeback_hold: "disputes", chargeback_hold_reversal: "disputes", dispute_withdrawal: "disputes", dispute_reversal_fee: "fees",
  subscription_payment: "sales", subscription: "sales", purchase: "sales", one_time_payment: "sales", renewal: "sales", tax_remittance: "fees", chargeback_reversed: "disputes",
  payout: "skip", payout_cancel: "skip", payout_failure: "skip", transfer: "skip",
  // Stripe Connect, top-ups and financing (reporting categories in Stripe's balance report docs). A platform's
  // cut is sales, its refunded cut a refund; balance movements that are not income (a top-up from the bank,
  // a payout or transfer reversed, a cash advance and its repayment) go to the clearing account, never other income.
  platform_earning: "sales", application_fee: "sales", platform_earning_refund: "refunds", application_fee_refund: "refunds",
  topup: "reserve", topup_reversal: "reserve", payout_reversal: "reserve", transfer_reversal: "reserve",
  advance: "reserve", advance_funding: "reserve", anticipation_repayment: "reserve", connect_collection_transfer: "reserve", connect_reserved_funds: "reserve",
  // More categories from Stripe's reporting-categories reference (checked 2026-10-25): holds and releases, transfers refunded,
  // and funds moved to or from other Stripe products are balance movements, not income; Climate contributions are a fee.
  charge_failure: "refunds", climate_order_purchase: "fees", climate_reservation_purchase: "fees",
  climate_order_refund: "fees", climate_reservation_refund: "fees", fee_credit_funding: "fees",
  payment_network_reserve_hold: "reserve", payment_network_reserve_release: "reserve",
  payout_minimum_balance_hold: "reserve", payout_minimum_balance_release: "reserve",
  transfer_refund: "reserve", unreconciled_customer_funds: "reserve",
  // A conversion between two currency balances moves money, it is not income (the two legs net to zero).
  currency_conversion: "reserve",
  // Stripe's balance_transaction `type` list (stripe/openapi spec3.json, fetched 2026-10-25; names only). Money moved in from
  // a bank, set aside for Stripe Tax or left unreconciled is a balance movement; a reversed payment is a refund. Issuing,
  // obligation and balance-payment types stay other: the name does not say whether they are cost or clearing.
  inbound_transfer: "reserve", inbound_transfer_reversal: "reserve", tax_fund: "reserve", payment_unreconciled: "reserve", payment_reversal: "refunds",
  issuing_authorization_hold: "reserve", issuing_authorization_release: "reserve", issuing_disbursement: "reserve",
  // Older balance-transaction types some exports still carry in the category column.
  reserve_transaction: "reserve", recipient_transfer: "skip", recipient_transfer_cancel: "reserve", recipient_transfer_failure: "reserve",
  transfer_cancel: "reserve", transfer_failure: "reserve",
  // Shopify Payments balance-transaction types (ShopifyPaymentsTransactionType in the Admin GraphQL reference, checked
  // 2026-10-25; the reference gives names only, so the meaning of each is read from its name). Shipping labels, referral
  // and protection charges, billing and duties are costs; loans, balance and merchant-to-merchant transfers and risk or
  // reserve holds are balance movements, not income. Anomaly, collections, ads-publisher, Markets Pro and Shopify
  // Collective or Source entries stay "other income": nothing in the name says what they are.
  ach_bank_failure_debit_fee: "fees", ach_bank_failure_debit_reversal_fee: "fees", referral_fee: "fees", referral_fee_tax: "fees",
  shipping_label: "fees", shipping_label_adjustment: "fees", shipping_label_adjustment_base: "fees", shipping_label_adjustment_surcharge: "fees",
  shipping_other_carrier_charge_adjustment: "fees", shipping_return_to_origin_adjustment: "fees",
  billing_debit: "fees", billing_debit_reversal: "fees", shop_cash_billing_debit: "fees", shop_cash_billing_debit_reversal: "fees",
  shop_cash_campaign_billing_debit: "fees", shop_cash_campaign_billing_debit_reversal: "fees",
  shop_cash_campaign_billing_credit: "fees", shop_cash_campaign_billing_credit_reversal: "fees",
  chargeback_fee_refund: "fees", chargeback_protection_debit: "fees", chargeback_protection_debit_reversal: "fees",
  marketplace_fee_credit: "fees", marketplace_fee_credit_reversal: "fees", promotion_credit: "fees", promotion_credit_reversal: "fees",
  customs_duty: "fees", customs_duty_adjustment: "fees", import_tax: "fees", import_tax_adjustment: "fees", import_tax_refund: "fees",
  tax_adjustment_credit: "tax", tax_adjustment_credit_reversal: "tax", tax_adjustment_debit: "tax", tax_adjustment_debit_reversal: "tax",
  vat_refund_credit: "tax", vat_refund_credit_reversal: "tax",
  charge_adjustment: "sales", channel_credit: "sales", channel_credit_reversal: "sales", channel_promotion_credit: "sales", channel_promotion_credit_reversal: "sales",
  channel_transfer_credit: "sales", channel_transfer_credit_reversal: "sales", channel_transfer_debit: "sales", channel_transfer_debit_reversal: "sales",
  shop_cash_credit: "sales", shop_cash_credit_reversal: "sales",
  refund_adjustment: "refunds", shop_cash_refund_debit: "refunds", shop_cash_refund_debit_reversal: "refunds",
  chargeback_hold_release: "disputes", chargeback_protection_credit: "disputes", chargeback_protection_credit_reversal: "disputes",
  seller_protection_credit: "disputes", seller_protection_credit_reversal: "disputes",
  balance_transfer_inbound: "reserve", balance_transfer_outbound: "reserve", reserved_funds_reversal: "reserve", reserved_funds_withdrawal: "reserve",
  risk_reversal: "reserve", risk_withdrawal: "reserve",
  lending_capital_refund: "reserve", lending_capital_refund_reversal: "reserve", lending_capital_remittance: "reserve", lending_capital_remittance_reversal: "reserve",
  lending_credit: "reserve", lending_credit_refund: "reserve", lending_credit_refund_reversal: "reserve", lending_credit_remittance: "reserve",
  lending_credit_remittance_reversal: "reserve", lending_credit_reversal: "reserve", lending_debit: "reserve", lending_debit_reversal: "reserve",
  merchant_to_merchant_credit: "reserve", merchant_to_merchant_credit_reversal: "reserve", merchant_to_merchant_debit: "reserve", merchant_to_merchant_debit_reversal: "reserve",
};

// Read the report. -> { rows, payouts: [{ id, date, net, parts, rows }], pending, problems }
export function readPayoutReport(text) {
  if (/^\s*[\[{]/.test(text)) return readSquareJson(text);
  let table = parseCsv(text).filter((r) => r.some((c) => String(c).trim() !== ""));
  if (table.length < 2) throw new Error("The report has no rows.");
  // PayPal's Balance Reconciliation report: RH header rows, an RD column row, RD detail rows, RF footer.
  const rd = table.findIndex((r) => r[0] === "RD" && r.map(key).includes("record_type") && r.map(key).includes("net_transaction_amount"));
  if (rd !== -1) return { ...readPaypalBalance(table.slice(rd).filter((r) => r[0] === "RD").map((r) => r.slice(1))), source: "paypal" };
  // Seller Central's date-range CSV opens with a few note lines before the header.
  const at0 = table.findIndex((r) => { const h = r.map(key); return h.includes("settlement_id") && h.includes("selling_fees") && h.includes("product_sales"); });
  if (at0 !== -1) return { ...readAmazonRange(table.slice(at0)), source: "amazon" };
  // eBay's Seller Hub transaction report opens with note lines before its header.
  const at1 = table.findIndex((r) => { const h = r.map(key); return h.includes("transaction_creation_date") && h.includes("payout_id") && h.includes("net_amount"); });
  if (at1 !== -1) return { ...readEbay(table.slice(at1)), source: "ebay" };
  // Some dashboards put the currency in the amount headers ("Gross (USD)", "Net (EUR)").
  const head = table[0].map((h) => { const k = key(h); const m = /^(gross|fee|fees|net|amount)_[a-z]{3}$/.exec(k); return m ? m[1] : k; });
  if (head.includes("settlement_id") && head.includes("amount_type") && head.includes("amount_description")) return { ...readAmazon(table, head), source: "amazon" };
  if (head.includes("psp_reference") && head.includes("batch_number") && head.some((h) => h.startsWith("net_credit"))) return { ...readAdyen(table, head), source: "adyen" };
  if (head.includes("fees_taxes") && head.includes("title") && head.includes("type") && head.includes("net")) return { ...readEtsy(table, head), source: "etsy" };
  if (head.includes("confirmation_code") && head.includes("gross_earnings") && head.includes("host_fee") && head.includes("type")) return { ...readAirbnb(table, head), source: "airbnb" };
  const col = Object.fromEntries(Object.entries(ALIASES).map(([k, names]) => [k, names.map((n) => head.indexOf(n)).find((i) => i !== -1) ?? -1]));
  // Square's dashboard export has Gross Sales (before tax and tip) and Total Collected; Fees and Net Total are on the latter.
  if (head.includes("total_collected") && head.includes("net_total")) col.gross = head.indexOf("total_collected");
  const squareSplit = head.includes("total_collected") && head.includes("net_total") && (head.includes("tax") || head.includes("tip"));
  for (const need of ["gross", "net", "category"]) if (col[need] === -1) throw new Error(`No "${need}" column: the report needs payout id, payout date, category, gross, fee and net columns.`);
  if (col.payout === -1 && head.includes("transaction_id") && head.includes("status") && head.includes("type")) return { ...readPaypal(table, head), source: "paypal" };
  if (col.payout === -1) throw new Error('No payout id column (Stripe: "automatic_payout_id"). Export the payout reconciliation report, not the plain payments list.');
  const problems = [];
  const rows = [];
  const offPlatform = [];
  // Amounts are booked as written, with no conversion: say so when the report mixes currencies.
  const ci = head.indexOf("currency");
  if (ci !== -1) {
    const cur = new Set(table.slice(1).map((r) => String(r[ci] ?? "").trim().toUpperCase()).filter(Boolean));
    if (cur.size > 1) problems.push(`The report mixes currencies (${[...cur].sort().join(", ")}); amounts are read as written with no conversion, so export one currency at a time.`);
  }
  // Square writes fees as negatives (net = gross + fee), Stripe as positives.
  const negFees = table.slice(1).some((r) => { const g = parseCents(String(r[col.gross] ?? "")), f = col.fee === -1 ? 0 : parseCents(String(r[col.fee] ?? "")), nt = parseCents(String(r[col.net] ?? "")); return f < 0 && nt === g + f; });
  table.slice(1).forEach((r, n) => {
    const at = (k) => (col[k] === -1 ? "" : String(r[col[k]] ?? "").trim());
    const gross = parseCents(at("gross")), net = parseCents(at("net"));
    let fee = col.fee === -1 ? 0 : parseCents(at("fee"));
    if (negFees && fee) fee = -fee;
    if ([gross, net, fee].some((v) => v === null || Number.isNaN(v))) { problems.push(`Row ${n + 2}: cannot read the amounts.`); return; }
    if (net !== gross - fee) { problems.push(`Row ${n + 2}: net ${fmt(net)} is not gross ${fmt(gross)} less fee ${fmt(fee)}.`); return; }
    const category = key(at("category"));
    // Square's export lists cash, gift-card and other-tender sales beside card ones; only card money passes through a payout.
    const tender = (name) => { const i = head.indexOf(name); return i === -1 ? 0 : parseCents(String(r[i] ?? "")) || 0; };
    if (squareSplit && head.includes("card") && !at("payout") && tender("card") === 0 && (tender("cash") || tender("square_gift_card") || tender("other_tender"))) {
      offPlatform.push({ row: n + 2, id: at("id") || `row${n + 2}`, created: parseDate(at("created")), net });
      return;
    }
    const base = { row: n + 2, id: at("id") || `row${n + 2}`, payout: at("payout"), payoutDate: parseDate(at("payoutDate")), created: parseDate(at("created")), category, kind: CATEGORY[category] ?? "other", gross, fee, net, desc: at("desc") };
    // Square's Total Collected is net sales + tax + tip: tax is owed to the state and a tip to staff, neither is sales.
    const part = (name) => { const i = head.indexOf(name); return squareSplit && i !== -1 ? parseCents(String(r[i] ?? "")) || 0 : 0; };
    const tax = part("tax"), tip = part("tip");
    if ((base.kind === "sales" || base.kind === "refunds") && (tax || tip)) {
      rows.push({ ...base, gross: gross - tax - tip, net: gross - tax - tip - fee });
      if (tax) rows.push({ ...base, id: `${base.id}:tax`, kind: "tax", gross: tax, fee: 0, net: tax });
      if (tip) rows.push({ ...base, id: `${base.id}:tip`, kind: "tips", gross: tip, fee: 0, net: tip });
    } else rows.push(base);
  });
  const by = new Map();
  const pending = [];
  // Stripe's balance report lists the payout itself as a "payout" row: its amount is what the bank received.
  const own = new Map(rows.filter((x) => x.category === "payout" && x.payout && x.net).map((x) => [x.payout, Math.abs(x.net)]));
  for (const x of rows) {
    if (x.kind === "skip") continue;
    if (!x.payout) { pending.push(x); continue; }
    if (!by.has(x.payout)) by.set(x.payout, []);
    by.get(x.payout).push(x);
  }
  for (const [id, rs] of by) {
    const sum = rs.reduce((a, x) => a + x.net, 0);
    if (own.has(id) && own.get(id) !== sum) problems.push(`Payout ${id}: the report's own payout row is ${fmt(own.get(id))} but its other rows net ${fmt(sum)}. Rows are missing from the export (or a hold was left out); the bank will show the payout row's amount.`);
  }
  const payouts = [...by].map(([id, rs]) => {
    const dates = rs.map((x) => x.payoutDate).filter(Boolean).sort();
    const sum = (f) => rs.reduce((a, x) => a + f(x), 0);
    return { id, date: dates.at(-1) ?? rs.map((x) => x.created).filter(Boolean).sort().at(-1) ?? null, net: sum((x) => x.net), gross: sum((x) => x.gross), fees: sum((x) => x.fee), rows: rs };
  }).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return { rows, payouts, pending, problems, offPlatform };
}

// Square's ActivityType list (square-python-sdk, activity_type.py, checked 2026-10-25), where a name alone would
// mislead: a refunded fee is a fee credit, not a customer refund; app fees are a platform's earnings; holds,
// savings, loans and money moved between Square products are balance movements, never income.
const SQUARE_KIND = {
  charge: "sales", refund: "refunds", app_fee_revenue: "sales", app_fee_refund: "refunds",
  processing_fee_refund: "fees", paid_service_fee_refund: "fees", subscription_fee_refund: "fees", subscription_fee_paid_refund: "fees",
  third_party_fee_refund: "fees", gift_card_load_fee_refund: "fees", undo_processing_fee_refund: "fees", undo_gift_card_load_fee_refund: "fees",
  deposit_fee_reversed: "fees", tax_on_fee: "fees", free_processing: "fees", local_offers_cashback: "fees",
  dispute: "disputes", open_dispute: "disputes", release_adjustment: "reserve",
  reserve_hold: "reserve", reserve_release: "reserve", hold_adjustment: "reserve", returned_payout: "reserve",
  automatic_savings: "reserve", automatic_savings_reversed: "reserve", square_capital_payment: "reserve", square_capital_reversed_payment: "reserve",
  credit_card_repayment: "reserve", credit_card_repayment_reversed: "reserve", percentage_processing_repayment: "reserve", percentage_processing_repayment_reversed: "reserve",
  balance_folders_transfer: "reserve", balance_folders_transfer_reversed: "reserve", gift_card_pool_transfer: "reserve", gift_card_pool_transfer_reversed: "reserve",
  money_transfer_reversal: "reserve", square_payroll_transfer: "reserve", square_payroll_transfer_reversed: "reserve",
  initial_balance_change: "reserve", automatic_bitcoin_conversions: "reserve", automatic_bitcoin_conversions_reversed: "reserve",
  // From Square's OpenAPI ActivityType (square/connect-api-specification, fetched 2026-10-25): an escheatment is money
  // remitted to a state as unclaimed property; percentage processing enrollment and deactivation move the repayment balance.
  escheatment: "reserve", percentage_processing_enrollment: "reserve", percentage_processing_deactivation: "reserve",
  payout: "skip", money_transfer: "skip",
};
// Square Payouts API: ListPayoutEntries JSON ({ payout_entries: [...] }), or
// { payouts: [...], payout_entries: [...] } / an array of those entries. Each
// entry has payout_id, type, effective_at and gross/fee/net_amount_money.amount
// in minor units. Fees may come signed either way (net = gross - fee or
// gross + fee); an entry that fits neither is refused. CHARGE is a sale, REFUND
// a refund, types naming a fee a fee, dispute/chargeback types disputes, payout
// and transfer types skipped; any other type is "other income", never guessed.
// Written from Square's published entry shape and a hand-made fixture only.
function readSquareJson(text) {
  let doc;
  try { doc = JSON.parse(text); } catch { throw new Error("The JSON file could not be read."); }
  const entries = Array.isArray(doc) ? doc : doc.payout_entries ?? doc.entries;
  if (!Array.isArray(entries)) throw new Error('No "payout_entries" list: export ListPayoutEntries from the Square Payouts API.');
  const dateOf = new Map((doc.payouts ?? (doc.payout ? [doc.payout] : [])).map((p) => [p.id, parseDate(String(p.arrival_date ?? p.created_at ?? "").slice(0, 10))]));
  const money = (m) => (m && Number.isInteger(m.amount) ? m.amount : m === undefined || m === null ? 0 : NaN);
  const problems = [], rows = [];
  entries.forEach((e, n) => {
    const gross = money(e.gross_amount_money), net = money(e.net_amount_money);
    let fee = money(e.fee_amount_money);
    if ([gross, net, fee].some(Number.isNaN)) { problems.push(`Entry ${n + 1}: cannot read the amounts.`); return; }
    if (net !== gross - fee && net === gross + fee) fee = -fee;
    if (net !== gross - fee) { problems.push(`Entry ${n + 1}: net ${fmt(net)} is not gross ${fmt(gross)} less fee ${fmt(fee)}.`); return; }
    const category = key(e.type ?? "");
    const kind = SQUARE_KIND[category] ?? (/payout|transfer/.test(category) ? "skip" : category === "charge" ? "sales" : /fee/.test(category) ? "fees" : /refund/.test(category) ? "refunds" : /dispute|chargeback/.test(category) ? "disputes" : "other");
    const created = parseDate(String(e.effective_at ?? "").slice(0, 10));
    rows.push({ row: n + 1, id: e.id ?? `entry${n + 1}`, payout: e.payout_id ?? "", payoutDate: dateOf.get(e.payout_id) ?? null, created, category, kind, gross, fee, net, desc: "" });
  });
  const by = new Map(), pending = [];
  for (const x of rows) {
    if (x.kind === "skip") continue;
    if (!x.payout) { pending.push(x); continue; }
    if (!by.has(x.payout)) by.set(x.payout, []);
    by.get(x.payout).push(x);
  }
  const payouts = [...by].map(([id, rs]) => {
    const sum = (f) => rs.reduce((a, x) => a + f(x), 0);
    return { id, date: rs[0].payoutDate ?? rs.map((x) => x.created).filter(Boolean).sort().at(-1) ?? null, net: sum((x) => x.net), gross: sum((x) => x.gross), fees: sum((x) => x.fee), rows: rs };
  }).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return { rows, payouts, pending, problems };
}

// PayPal's activity export. Rows are grouped under the withdrawal that paid them out.
function readPaypal(table, head) {
  const ix = (...names) => names.map((n) => head.indexOf(n)).find((i) => i !== -1) ?? -1;
  const c = { date: ix("date"), time: ix("time"), type: ix("type"), status: ix("status"), gross: ix("gross"), fee: ix("fee"), net: ix("net"), id: ix("transaction_id"), desc: ix("name", "description"), impact: ix("balance_impact"), currency: ix("currency") };
  for (const need of ["date", "gross", "net"]) if (c[need] === -1) throw new Error(`The PayPal report has no "${need}" column.`);
  const problems = [];
  const all = [];
  const currencies = new Set();
  table.slice(1).forEach((r, n) => {
    const at = (k) => (c[k] === -1 ? "" : String(r[c[k]] ?? "").trim());
    if (c.status !== -1 && key(at("status")) !== "completed") return;
    // Newer exports mark rows that do not move the balance (authorizations, orders) "Memo".
    if (key(at("impact")) === "memo") return;
    const cur = at("currency").toUpperCase();
    if (cur) { if (!currencies.size) currencies.add(cur); else if (!currencies.has(cur)) { currencies.add(cur); problems.push(`Row ${n + 2}: currency ${cur} differs from ${[...currencies][0]}. PayPal holds one balance per currency, so split the export by currency; amounts are not converted.`); } }
    const gross = parseCents(at("gross")), net = parseCents(at("net"));
    const fee = c.fee === -1 ? 0 : -(parseCents(at("fee")) ?? NaN);
    if ([gross, net, fee].some((v) => v === null || Number.isNaN(v))) { problems.push(`Row ${n + 2}: cannot read the amounts.`); return; }
    if (net !== gross - fee) { problems.push(`Row ${n + 2}: net ${fmt(net)} is not gross ${fmt(gross)} less fee ${fmt(fee)}.`); return; }
    const category = key(at("type"));
    let kind = category.includes("withdrawal") ? "withdrawal" : /refund/.test(category) ? "refunds" : /reversal|dispute|chargeback|hold|reserve/.test(category) ? "disputes" : /conversion|bank_deposit|transfer|add_funds/.test(category) ? "skip" : /payment|sale|checkout|invoice|subscription/.test(category) ? "sales" : "other";
    // A payment the account holder sent (negative gross) is a purchase, not a sale.
    if (kind === "sales" && gross < 0) { kind = "other"; problems.push(`Row ${n + 2}: "${at("type")}" is a payment sent (${fmt(gross)}), not a sale. It is booked against other income; recategorise it as the expense it is.`); }
    all.push({ row: n + 2, id: at("id") || `row${n + 2}`, created: parseDate(at("date")), t: `${parseDate(at("date"))} ${at("time")}`, category, kind, gross, fee, net, desc: at("desc") });
  });
  all.sort((a, b) => a.t.localeCompare(b.t) || a.row - b.row);
  const payouts = [];
  let group = [];
  for (const x of all) {
    if (x.kind === "skip") continue;
    if (x.kind !== "withdrawal") { group.push(x); continue; }
    const paid = -x.net;
    const sum = group.reduce((a, y) => a + y.net, 0);
    if (paid > 0 && sum === paid) payouts.push({ id: x.id, date: x.created, net: paid, gross: group.reduce((a, y) => a + y.gross, 0), fees: group.reduce((a, y) => a + y.fee, 0), rows: group.map((y) => ({ ...y, payout: x.id, payoutDate: x.created })) });
    else problems.push(`PayPal withdrawal ${x.id} (${x.created}, ${fmt(paid)}): the completed activity since the previous withdrawal nets ${fmt(sum)}, so a balance was carried over from before the report. Not split.`);
    group = [];
  }
  const pending = group.map((y) => ({ ...y, payout: "" }));
  return { rows: all, payouts, pending, problems };
}

// Adyen's settlement details report (Company Account, Merchant Account, Psp
// Reference, Type, Creation Date, Gross Debit/Credit (GC), Net Debit/Credit
// (NC), Commission, Markup, Scheme Fees, Interchange (all NC), Batch Number).
// PayPal's Balance Reconciliation report (developer.paypal.com, "Balance Reconciliation
// report", sample file checked 2026-10-25). Net Transaction Amount is gross less the
// partner commission and the net-billed fees. Records of type Fees are gross-settled
// (invoiced later, never in a deposit), so they are left out of the rows. Transfer ID
// is the id on the merchant's bank statement: rows sharing one are one deposit. The
// report has no deposit row of its own, so a deposit cannot be cross-checked.
function readPaypalBalance(table) {
  const head = table[0].map(key), ix = (n) => head.indexOf(n);
  const c = { id: ix("record_id"), type: ix("record_type"), sub: ix("record_subtype"), date: ix("created_at"), gross: ix("gross_transaction_amount"), net: ix("net_transaction_amount"), transfer: ix("transfer_id"), cur: ix("transaction_currency"), name: ix("customer_name"), inv: ix("invoice_id") };
  const problems = [], rows = [], cur = new Set();
  let grossFees = 0;
  table.slice(1).forEach((r, n) => {
    const at = (i) => (i === -1 ? "" : String(r[i] ?? "").trim());
    const category = key(at(c.type));
    if (category === "fees") { grossFees += parseCents(at(ix("total_gross_fees"))) || 0; return; }
    const gross = parseCents(at(c.gross)), net = parseCents(at(c.net));
    if ([gross, net].some((v) => v === null || Number.isNaN(v))) { problems.push(`Row ${n + 2}: cannot read the amounts.`); return; }
    if (at(c.cur)) cur.add(at(c.cur).toUpperCase());
    const kind = category === "sale" ? "sales" : category === "refund" ? "refunds" : "other";
    rows.push({ row: n + 2, id: at(c.id) || `row${n + 2}`, payout: at(c.transfer), payoutDate: null, created: parseDate(at(c.date)), category, kind, gross, fee: gross - net, net, desc: at(c.name) || at(c.inv) });
  });
  if (cur.size > 1) problems.push(`The report mixes currencies (${[...cur].sort().join(", ")}); amounts are read as written with no conversion.`);
  if (grossFees) problems.push(`Gross-settled fees of ${fmt(Math.abs(grossFees))} are invoiced separately and are not in any deposit; book them from the invoice.`);
  const by = new Map(), pending = [];
  for (const x of rows) {
    if (!x.payout) { pending.push(x); continue; }
    if (!by.has(x.payout)) by.set(x.payout, []);
    by.get(x.payout).push(x);
  }
  const payouts = [...by].map(([id, rs]) => {
    const sm = (f) => rs.reduce((a, x) => a + f(x), 0);
    return { id, date: rs.map((x) => x.created).filter(Boolean).sort().at(-1) ?? null, net: sm((x) => x.net), gross: sm((x) => x.gross), fees: sm((x) => x.fee), rows: rs };
  }).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return { rows, payouts, pending, problems, offPlatform: [] };
}

// A batch is one payout: its Settled/Refunded/Chargeback/Fee rows net to the
// MerchantPayout row of that batch. Gross is taken as net plus the four cost
// columns, so a sale in another currency than the payout still balances. Rows
// that move no money (Received, Authorised, SentForSettle ...) are skipped; a
// type not listed is "other income", never guessed. Written from Adyen's
// published column list and a hand-made fixture; no real export has been tried.
const ADYEN_KIND = {
  settled: "sales", settledbulk: "sales", refunded: "refunds", refundedbulk: "refunds", refundedreversed: "refunds", refundreversed: "refunds",
  chargeback: "disputes", chargebackreversed: "disputes", secondchargeback: "disputes", chargebackbulk: "disputes", chargebackreversedbulk: "disputes",
  fee: "fees", misccosts: "fees", invoicededuction: "fees", paymentcost: "fees", depositcorrection: "other",
  merchantpayout: "payout",
};
function readAdyen(table, head) {
  const ix = (re) => head.findIndex((h) => re.test(h));
  const c = {
    type: head.indexOf("type"), id: head.indexOf("psp_reference"), batch: head.indexOf("batch_number"), date: ix(/^creation_date$/), desc: ix(/^merchant_reference$/),
    ncred: ix(/^net_credit/), ndeb: ix(/^net_debit/), costs: [/^commission/, /^markup/, /^scheme_fees/, /^interchange/].map(ix).filter((i) => i !== -1),
  };
  for (const need of ["type", "date", "ncred", "ndeb"]) if (c[need] === -1) throw new Error(`The Adyen report has no "${need}" column.`);
  const problems = [], rows = [], own = new Map();
  table.slice(1).forEach((r, n) => {
    const at = (i) => (i === -1 ? "" : String(r[i] ?? "").trim());
    const category = at(c.type).toLowerCase().replace(/[^a-z]/g, "");
    const kind = ADYEN_KIND[category] ?? (/^(received|authori[sz]ed|authorisedpending|sentforsettle|sentforrefund|sentforauth|cancel|capture|error|expired|refused|retry|pending)/.test(category) ? "skip" : "other");
    if (kind === "skip") return;
    const amt = (i) => (at(i) === "" ? 0 : parseCents(at(i)));
    const net = amt(c.ncred) - amt(c.ndeb), fee = c.costs.reduce((a, i) => a + amt(i), 0);
    if ([net, fee].some((v) => v === null || Number.isNaN(v))) { problems.push(`Row ${n + 2}: cannot read the amounts.`); return; }
    const batch = at(c.batch);
    if (kind === "payout") { if (batch) own.set(batch, [...(own.get(batch) ?? []), { net: -net, date: parseDate(at(c.date)) }]); return; }
    rows.push({ row: n + 2, id: at(c.id) || `row${n + 2}`, payout: batch, payoutDate: null, created: parseDate(at(c.date)), category, kind, gross: net + fee, fee, net, desc: at(c.desc) });
  });
  const by = new Map(), pending = [];
  for (const x of rows) {
    if (!x.payout) { pending.push(x); continue; }
    if (!by.has(x.payout)) by.set(x.payout, []);
    by.get(x.payout).push(x);
  }
  const payouts = [];
  for (const [id, rs] of by) {
    const sum = rs.reduce((a, x) => a + x.net, 0), o = own.get(id);
    if (o && o.reduce((a, x) => a + x.net, 0) !== sum) problems.push(`Batch ${id}: the MerchantPayout row is ${fmt(o.reduce((a, x) => a + x.net, 0))} but the batch's other rows net ${fmt(sum)}. Rows are missing from the export, or the payout was in another currency; not split.`);
    else if (!o) problems.push(`Batch ${id}: no MerchantPayout row, so no bank line to match yet; listed as pending.`);
    if (!o || o.reduce((a, x) => a + x.net, 0) !== sum) { pending.push(...rs); continue; }
    const date = o.map((x) => x.date).filter(Boolean).sort().at(-1) ?? null;
    const sm = (f) => rs.reduce((a, x) => a + f(x), 0);
    payouts.push({ id, date, net: sum, gross: sm((x) => x.gross), fees: sm((x) => x.fee), rows: rs.map((x) => ({ ...x, payoutDate: date })) });
  }
  payouts.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return { rows, payouts, pending, problems };
}

// Etsy's payment account ledger CSV (Date, Type, Title, Info, Currency, Amount,
// Fees & Taxes, Net, ...). Amount and Fees & Taxes show "--" when empty; a
// Fee, Marketing or Shipping row has no amount, only a negative net. A Deposit
// row (net negative) is the payout: the rows since the previous deposit are what
// it paid out, split only when they net to it exactly, like PayPal. Layout from
// memory of Etsy's help pages; no real export tried.
function readEtsy(table, head) {
  const ix = (n) => head.indexOf(n);
  const c = { date: ix("date"), type: ix("type"), title: ix("title"), amount: ix("amount"), fee: ix("fees_taxes"), net: ix("net"), id: ix("order_id") };
  if (c.date === -1) throw new Error('The Etsy ledger has no "Date" column.');
  const cents = (v) => { const t = String(v ?? "").trim(); return t === "" || t === "--" ? 0 : parseCents(t.replace(/^\$?-\$/, "-")); };
  const problems = [], all = [];
  table.slice(1).forEach((r, n) => {
    const at = (k) => (c[k] === -1 ? "" : String(r[c[k]] ?? "").trim());
    const net = cents(at("net")), amount = cents(at("amount")), taxes = cents(at("fee"));
    if ([net, amount, taxes].some((v) => v === null || Number.isNaN(v))) { problems.push(`Row ${n + 2}: cannot read the amounts.`); return; }
    const category = key(at("type"));
    const isSale = category === "sale" || category === "payment";
    const gross = isSale || category === "refund" ? amount : 0;
    const fee = gross - net;
    const kind = category === "deposit" ? "withdrawal" : category === "refund" ? "refunds" : isSale ? "sales" : /fee|marketing|shipping|listing|offsite|ads|tax|vat/.test(category) ? "fees" : /dispute|chargeback/.test(category) ? "disputes" : "other";
    const date = parseDate(at("date"));
    // Etsy's API reference lists the ledger's entry kinds (a returned disbursement,
    // a recoupment, a bill payment). A returned deposit puts money back that an
    // earlier deposit took out, so as a "fee" it would read as a credit; say so.
    if (/returned.*(disburs|deposit)/.test(category) || category.startsWith("recoup")) problems.push(`Row ${n + 2}: "${at("type")}" (${fmt(net)}) is not a fee. It is kept in the activity that the next deposit pays out, but book it against the bank by hand.`);
    all.push({ row: n + 2, id: at("id") || `row${n + 2}`, created: date, t: date ?? "", category, kind, gross: kind === "fees" || kind === "other" ? 0 : gross, fee: kind === "fees" || kind === "other" ? -net : fee, net, desc: at("title") });
  });
  const payouts = [];
  let group = [];
  // Etsy lists newest first; group oldest first so a deposit follows what it paid.
  const ordered = all.map((x, i) => ({ x, i })).sort((a, b) => a.x.t.localeCompare(b.x.t) || b.i - a.i).map((o) => o.x);
  for (const x of ordered) {
    if (x.kind !== "withdrawal") { group.push(x); continue; }
    const paid = -x.net, sum = group.reduce((a, y) => a + y.net, 0);
    if (paid > 0 && sum === paid) payouts.push({ id: `etsy-${x.created}-${x.row}`, date: x.created, net: paid, gross: group.reduce((a, y) => a + y.gross, 0), fees: group.reduce((a, y) => a + y.fee, 0), rows: group.map((y) => ({ ...y, payout: `etsy-${x.created}-${x.row}`, payoutDate: x.created })) });
    else problems.push(`Etsy deposit ${x.created} (${fmt(paid)}): the activity since the previous deposit nets ${fmt(sum)}, so a balance was carried over from before the report. Not split.`);
    group = [];
  }
  return { rows: all, payouts, pending: group.map((y) => ({ ...y, payout: "" })), problems };
}

// eBay's Seller Hub transaction report (Transaction creation date, Type, Order
// number, Net amount, Payout date, Payout ID, Gross transaction amount, the Final
// Value Fee columns, Item subtotal, Shipping and handling, Seller collected tax
// ...). Every row carries the Payout ID it was paid in, so it groups like
// Stripe's; a row with no Payout ID is still pending. An Order or Refund row's
// fee is its gross less its net; shipping labels, other fees and charges are
// fees with no gross; holds and releases move the reserve; a Payout row is
// skipped but must equal what its rows net to, or the payout is not split.
// Seller-collected sales tax is split from the gross only when subtotal +
// shipping + tax equals it exactly (tax the seller owes is not sales).
// Layout from memory of eBay's help pages and one hand-written fixture; no
// real export tried.
function readEbay(table) {
  const head = table[0].map(key);
  const ix = (n) => head.indexOf(n);
  const c = { date: ix("transaction_creation_date"), type: ix("type"), order: ix("order_number"), net: ix("net_amount"), payoutDate: ix("payout_date"), payout: ix("payout_id"), gross: ix("gross_transaction_amount"), cur: ix("payout_currency"), sub: ix("item_subtotal"), ship: ix("shipping_and_handling"), tax: ix("seller_collected_tax"), title: ix("item_title") };
  if (c.type === -1) throw new Error('The eBay report has no "Type" column.');
  const cents = (v) => { const t = String(v ?? "").trim(); return t === "" || t === "--" ? 0 : parseCents(t.replace(/^\$?-\$/, "-")); };
  const problems = [], rows = [], payoutRows = [];
  const cur = new Set(table.slice(1).map((r) => String(r[c.cur] ?? "").trim().toUpperCase()).filter((v) => v && v !== "--"));
  if (cur.size > 1) problems.push(`The report mixes payout currencies (${[...cur].sort().join(", ")}); amounts are read as written with no conversion, so export one currency at a time.`);
  table.slice(1).forEach((r, n) => {
    const at = (k) => (c[k] === -1 ? "" : String(r[c[k]] ?? "").trim());
    const net = cents(at("net")), gross = cents(at("gross"));
    if ([net, gross].some((v) => v === null || Number.isNaN(v))) { problems.push(`Row ${n + 2}: cannot read the amounts.`); return; }
    const category = key(at("type"));
    const pid = at("payout").replace(/^--$/, "");
    const date = parseDate(at("date"));
    // A multi-item order carries its extra items on following rows that have no
    // Type or amounts of their own (eBay's help page); they are not money.
    if (category === "" && net === 0 && gross === 0) return;
    if (category === "payout") { payoutRows.push({ id: pid, net: Math.abs(net) }); return; }
    const kind = category === "order" ? "sales" : category === "refund" ? "refunds" : /dispute|chargeback|claim/.test(category) ? "disputes" : /hold|release|reserve/.test(category) ? "reserve" : /fee|charge|shipping|label|ad|promot|subscription/.test(category) ? "fees" : category === "transfer" ? "skip" : "other";
    const base = { row: n + 2, id: at("order") || `row${n + 2}`, payout: pid, payoutDate: parseDate(at("payoutDate")), created: date, category, kind, desc: at("title") };
    if (kind === "sales" || kind === "refunds") {
      const tax = cents(at("tax")), sub = cents(at("sub")), ship = cents(at("ship"));
      if (kind === "sales" && tax > 0 && sub + ship + tax === gross) {
        rows.push({ ...base, gross: gross - tax, fee: gross - net, net: net - tax });
        rows.push({ ...base, id: `${base.id}:tax`, kind: "tax", gross: tax, fee: 0, net: tax });
      } else rows.push({ ...base, gross, fee: gross - net, net });
    } else if (kind === "fees") rows.push({ ...base, gross: 0, fee: -net, net });
    else rows.push({ ...base, gross: net, fee: 0, net });
  });
  const by = new Map(), pending = [];
  for (const x of rows) {
    if (x.kind === "skip") continue;
    if (!x.payout) { pending.push(x); continue; }
    if (!by.has(x.payout)) by.set(x.payout, []);
    by.get(x.payout).push(x);
  }
  const payouts = [];
  for (const [id, rs] of by) {
    const sum = rs.reduce((a, x) => a + x.net, 0);
    const own = payoutRows.find((p) => p.id === id);
    if (own && own.net !== sum) { problems.push(`eBay payout ${id}: its rows net ${fmt(sum)} but the Payout row says ${fmt(own.net)}. Not split.`); continue; }
    const dates = rs.map((x) => x.payoutDate).filter(Boolean).sort();
    payouts.push({ id, date: dates.at(-1) ?? rs.map((x) => x.created).filter(Boolean).sort().at(-1) ?? null, net: sum, gross: rs.reduce((a, x) => a + x.gross, 0), fees: rs.reduce((a, x) => a + x.fee, 0), rows: rs });
  }
  payouts.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return { rows, payouts, pending, problems };
}

// Airbnb's host transaction history CSV (Date, Type, Confirmation code, Listing,
// Amount, Paid out, Host fee, Gross earnings, Occupancy taxes ...). A Reservation
// row's gross earnings less the host fee is its Amount; Adjustment and
// Resolution rows are other income or charges; a Payout row (Paid out) is the
// deposit, and the rows since the previous payout are what it paid, split only
// when they net to it exactly. Occupancy taxes collected and remitted by Airbnb
// are never income. Layout from memory of Airbnb's help pages and one
// hand-written fixture; no real export tried.
function readAirbnb(table, head) {
  const ix = (n) => head.indexOf(n);
  const c = { date: ix("date"), type: ix("type"), code: ix("confirmation_code"), listing: ix("listing"), amount: ix("amount"), paid: ix("paid_out"), host: ix("host_fee"), gross: ix("gross_earnings") };
  if (c.date === -1) throw new Error('The Airbnb history has no "Date" column.');
  const cents = (v) => { const t = String(v ?? "").trim(); return t === "" || t === "--" ? 0 : parseCents(t.replace(/^\$?-\$/, "-")); };
  const problems = [], all = [];
  table.slice(1).forEach((r, n) => {
    const at = (k) => (c[k] === -1 ? "" : String(r[c[k]] ?? "").trim());
    const amount = cents(at("amount")), paid = cents(at("paid")), host = cents(at("host")), grossEarn = cents(at("gross"));
    if ([amount, paid, host, grossEarn].some((v) => v === null || Number.isNaN(v))) { problems.push(`Row ${n + 2}: cannot read the amounts.`); return; }
    const category = key(at("type"));
    const date = parseDate(at("date"));
    const id = at("code") || `row${n + 2}`;
    if (category === "payout" || category === "co_host_payout") { all.push({ row: n + 2, id, created: date, t: date ?? "", category, kind: "withdrawal", gross: 0, fee: 0, net: -(paid || Math.abs(amount)), desc: at("listing") }); return; }
    const isRes = category === "reservation";
    const net = isRes && amount === 0 ? grossEarn - Math.abs(host) : amount;
    const gross = isRes ? grossEarn : 0;
    all.push({ row: n + 2, id, created: date, t: date ?? "", category, kind: isRes ? "sales" : "other", gross, fee: gross - net, net, desc: at("listing") });
  });
  const payouts = [];
  let group = [];
  const ordered = all.map((x, i) => ({ x, i })).sort((a, b) => a.x.t.localeCompare(b.x.t) || a.i - b.i).map((o) => o.x);
  for (const x of ordered) {
    if (x.kind !== "withdrawal") { group.push(x); continue; }
    const paid = -x.net, sum = group.reduce((a, y) => a + y.net, 0);
    if (paid > 0 && sum === paid) payouts.push({ id: `airbnb-${x.created}-${x.row}`, date: x.created, net: paid, gross: group.reduce((a, y) => a + y.gross, 0), fees: group.reduce((a, y) => a + y.fee, 0), rows: group.map((y) => ({ ...y, payout: `airbnb-${x.created}-${x.row}`, payoutDate: x.created })) });
    else problems.push(`Airbnb payout ${x.created} (${fmt(paid)}): the activity since the previous payout nets ${fmt(sum)}, so a balance was carried over from before the report. Not split.`);
    group = [];
  }
  return { rows: all, payouts, pending: group.map((y) => ({ ...y, payout: "" })), problems };
}

// Amazon's settlement report (flat file V2, tab-delimited). The first row of a
// settlement is a summary (settlement-id, dates, total-amount = the deposit);
// every other row is one amount: transaction-type (Order, Refund,
// other-transaction), amount-type (ItemPrice, ItemFees, Promotion,
// ItemWithheldTax ...), amount-description (Principal, Commission ...).
// A settlement is split only when its rows add up to the summary's total; a
// reserve line or any other mismatch is listed in `problems`, not guessed.
function readAmazon(table, head) {
  const c = Object.fromEntries(["settlement_id", "deposit_date", "total_amount", "transaction_type", "order_id", "adjustment_id", "amount_type", "amount_description", "amount", "posted_date", "sku"].map((k) => [k, head.indexOf(k)]));
  for (const need of ["amount", "total_amount", "deposit_date"]) if (c[need] === -1) throw new Error(`The Amazon settlement report has no "${need}" column.`);
  const when = (v) => {
    const t = String(v ?? "").trim().split(/[ T]/)[0];
    const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(t);
    return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : parseDate(t);
  };
  const problems = [];
  const settlements = new Map();
  let cur = "";
  table.slice(1).forEach((r, n) => {
    const at = (k) => (c[k] === -1 ? "" : String(r[c[k]] ?? "").trim());
    cur = at("settlement_id") || cur;
    if (!cur) { problems.push(`Row ${n + 2}: no settlement id.`); return; }
    if (!settlements.has(cur)) settlements.set(cur, { id: cur, date: null, total: null, rows: [] });
    const st = settlements.get(cur);
    if (at("total_amount") !== "") { st.total = parseCents(at("total_amount")); st.date = when(at("deposit_date")); if (!at("amount")) return; }
    const cents = parseCents(at("amount"));
    if (cents === null || Number.isNaN(cents)) { problems.push(`Row ${n + 2}: cannot read the amount.`); return; }
    if (!cents) return;
    const type = key(at("transaction_type")), amt = key(at("amount_type")), what = key(at("amount_description"));
    let kind;
    if (/transfer/.test(type)) kind = "skip";
    else if (/reserve/.test(what) || /reserve/.test(amt)) kind = "reserve";
    else if (/^(privatelabelcreditcard|storedvaluecard|collectondelivery)(revenue|refund)$/.test(what)) kind = "other"; // direct payments: money the buyer paid some other way
    else if (/^(postagebilling|postagerefund)$/.test(what)) kind = "fees"; // shipping labels bought through Amazon
    else if (/^tcs_/.test(what)) kind = "tax"; // India: tax collected at source
    else if (what === "paymentmethodfee") kind = "fees";
    else if (/^(goodwill|discount|returnshipping|freereplacementreturnshipping)$/.test(what)) kind = amt === "itemprice" ? "refunds" : "other";
    else if (what === "genericdeduction") kind = "other"; // a bad-debt deduction, not a sale
    else if (amt === "itemprice") kind = /tax/.test(what) ? "tax" : type === "refund" ? "refunds" : "sales";
    else if (/withheld|tax/.test(amt)) kind = "tax";
    else if (/promotion/.test(amt)) kind = /tax/.test(what) ? "tax" : "refunds";
    else if (/reimburs|goodwill|compensat/.test(what)) kind = "other";
    else if (/advertis/.test(what + amt)) kind = "ads";
    else if (/fee|commission|chargeback|subscription|storage|label|disposal|removal|inbound|fba/.test(what + amt)) kind = "fees";
    else kind = "other";
    if (kind !== "skip") st.rows.push({ row: n + 2, id: at("order_id") || at("adjustment_id") || `row${n + 2}`, payout: cur, payoutDate: st.date, created: when(at("posted_date")), category: `${amt}/${what}`, kind, gross: cents, fee: 0, net: cents, desc: [at("transaction_type"), at("amount_description"), at("sku")].filter(Boolean).join(" ") });
  });
  const payouts = [];
  const rows = [];
  for (const st of settlements.values()) {
    const sum = st.rows.reduce((a, x) => a + x.net, 0);
    rows.push(...st.rows);
    if (st.total === null) problems.push(`Amazon settlement ${st.id}: no summary row with a total-amount. Not split.`);
    else if (st.rows.some((x) => x.kind === "reserve")) problems.push(`Amazon settlement ${st.id}: it holds a reserve line, which the books would need an asset account for. Not split; file the deposit by hand.`);
    else if (sum !== st.total) problems.push(`Amazon settlement ${st.id}: its rows add up to ${fmt(sum)} but the summary total is ${fmt(st.total)}. Not split.`);
    else payouts.push({ id: st.id, date: st.date, net: st.total, gross: sum, fees: 0, rows: st.rows });
  }
  payouts.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return { rows, payouts, pending: [], problems };
}

// Seller Central's date-range transaction CSV ("Reports > Date range"): a few
// note lines, then date/time, settlement id, type, order id, sku, description,
// ..., product sales, shipping credits, promotional rebates, selling fees, fba
// fees, other transaction fees, other, total. Dates read "Jan 2, 2026 3:04:05
// AM PST". A "Transfer" row is the deposit (its total is negative: money out of
// the Amazon balance). A settlement is split only when its other rows add up to
// the transfer and each row's columns add up to its own total.
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const rangeDate = (v) => {
  const m = /^([A-Za-z]{3})[a-z]*\.? (\d{1,2}),? (\d{4})/.exec(String(v ?? "").trim());
  return m && MONTHS[m[1].toLowerCase()] ? `${m[3]}-${String(MONTHS[m[1].toLowerCase()]).padStart(2, "0")}-${m[2].padStart(2, "0")}` : parseDate(String(v ?? "").trim());
};
function readAmazonRange(table) {
  const head = table[0].map(key);
  const ix = (n) => head.indexOf(n);
  const money = ["product_sales", "product_sales_tax", "shipping_credits", "shipping_credits_tax", "gift_wrap_credits", "giftwrap_credits_tax", "regulatory_fee", "tax_on_regulatory_fee", "promotional_rebates", "promotional_rebates_tax", "marketplace_withheld_tax", "selling_fees", "fba_fees", "other_transaction_fees", "other"];
  const kindOf = { product_sales: "sales", shipping_credits: "sales", gift_wrap_credits: "sales", product_sales_tax: "tax", shipping_credits_tax: "tax", giftwrap_credits_tax: "tax", tax_on_regulatory_fee: "tax", promotional_rebates_tax: "tax", marketplace_withheld_tax: "tax", promotional_rebates: "refunds", regulatory_fee: "fees", selling_fees: "fees", fba_fees: "fees", other_transaction_fees: "fees" };
  const total = ix("total");
  if (total === -1) throw new Error('The Amazon date-range report has no "total" column.');
  const problems = [];
  const settlements = new Map();
  table.slice(1).forEach((r, n) => {
    const at = (k) => (ix(k) === -1 ? "" : String(r[ix(k)] ?? "").trim());
    const sid = at("settlement_id");
    if (!sid) return; // not yet in a settlement: still pending at Amazon
    const cents = parseCents(String(r[total] ?? ""));
    if (cents === null || Number.isNaN(cents)) { problems.push(`Row ${n + 2}: cannot read the total.`); return; }
    if (!settlements.has(sid)) settlements.set(sid, { id: sid, date: null, deposit: 0, transfers: 0, rows: [] });
    const st = settlements.get(sid);
    const type = key(at("type")), date = rangeDate(at("date_time"));
    if (/transfer/.test(type)) { st.deposit += -cents; st.transfers++; st.date = date; return; }
    const parts = money.map((k) => [k, ix(k) === -1 ? 0 : parseCents(String(r[ix(k)] ?? ""))]);
    if (parts.some(([, v]) => v === null || Number.isNaN(v))) { problems.push(`Row ${n + 2}: cannot read the amounts.`); return; }
    const sum = parts.reduce((a, [, v]) => a + v, 0);
    if (sum !== cents) { problems.push(`Row ${n + 2}: the columns add up to ${fmt(sum)} but the total is ${fmt(cents)}.`); st.broken = true; return; }
    const desc = [at("type"), at("description"), at("sku")].filter(Boolean).join(" ");
    for (const [k, v] of parts) {
      if (!v) continue;
      let kind = kindOf[k];
      if (k === "other") kind = /advertis/.test(type + key(at("description"))) ? "ads" : /service_fee|fee|subscription|storage|inventory/.test(type) ? "fees" : "other";
      else if ((k === "product_sales" || k === "shipping_credits" || k === "gift_wrap_credits") && type === "refund") kind = "refunds";
      st.rows.push({ row: n + 2, id: at("order_id") || `row${n + 2}`, payout: sid, payoutDate: null, created: date, category: `${type}/${k}`, kind, gross: v, fee: 0, net: v, desc });
    }
  });
  const payouts = [];
  const rows = [];
  const pending = [];
  for (const st of settlements.values()) {
    rows.push(...st.rows);
    const sum = st.rows.reduce((a, x) => a + x.net, 0);
    if (!st.transfers) { pending.push(...st.rows.map((x) => ({ ...x, payout: "" }))); continue; }
    if (st.broken) problems.push(`Amazon settlement ${st.id}: a row did not add up. Not split.`);
    else if (st.transfers > 1) problems.push(`Amazon settlement ${st.id}: it has ${st.transfers} transfer rows (more than one deposit). Not split; file each deposit by hand.`);
    else if (sum !== st.deposit) problems.push(`Amazon settlement ${st.id}: its rows add up to ${fmt(sum)} but the transfer is ${fmt(st.deposit)} (a balance carried over from an earlier period, or a reserve). Not split.`);
    else { for (const x of st.rows) x.payoutDate = st.date; payouts.push({ id: st.id, date: st.date, net: st.deposit, gross: sum, fees: 0, rows: st.rows }); }
  }
  payouts.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return { rows, payouts, pending, problems };
}

const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const gap = (a, b) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 864e5;

// The split a payout makes, signed like the bank line: gross by role, fees apart.
function partsOf(payout, roles) {
  const sums = new Map();
  const add = (account, cents) => { if (cents) sums.set(account, (sums.get(account) ?? 0) + cents); };
  for (const x of payout.rows) {
    add(roles[x.kind] ?? roles.other, x.gross);
    add(roles.fees, -x.fee);
  }
  return [...sums].map(([account, cents]) => ({ account, cents })).filter((p) => p.cents !== 0);
}

// Match each payout to a bank line. Roles are account codes; override any.
export function planPayouts(books, report, { sales = "4000", refunds = "4000", fees = "6010", disputes = "6010", other = "4100", tax = "2100", ads = "6000", reserve = "1200", tips = sales, window = [-2, 7] } = {}) {
  const roles = { sales, refunds, fees, disputes, other, tax, ads, reserve, tips };
  const codes = new Set(books.accounts.map((a) => a.code));
  const used = new Set(report.payouts.flatMap((p) => p.rows.map((x) => x.kind)));
  for (const [r, c] of Object.entries(roles)) if (!codes.has(c) && (r !== "tax" && r !== "ads" && r !== "reserve" || used.has(r))) throw new Error(`No account ${c} in the chart of accounts (for ${r}).`);
  const taken = new Set();
  const matched = [], unmatched = [], done = [];
  for (const p of report.payouts) {
    const parts = partsOf(p, roles);
    const row = { id: p.id, date: p.date, net: p.net, gross: p.gross, fees: p.fees, rows: p.rows.length, parts };
    const bank = books.transactions.filter((t) => t.cents === p.net && !taken.has(t.id) && t.status !== "split" && p.date && t.date >= addDays(p.date, window[0]) && t.date <= addDays(p.date, window[1]));
    if (p.net <= 0) { unmatched.push({ ...row, why: "net is not a deposit (a negative payout is a clawback; file it by hand)" }); continue; }
    if (!bank.length) {
      // A payout whose line is already split into the same parts is done, not unmatched.
      const already = books.transactions.find((t) => t.cents === p.net && t.status === "split" && p.date && gap(t.date, p.date) <= 7 && sameParts(t.split, parts));
      (already ? done : unmatched).push(already ? { ...row, line: already.id } : { ...row, why: `no unsplit bank line of ${fmt(p.net)} within the window around ${p.date ?? "an unknown date"}` });
      continue;
    }
    bank.sort((a, b) => gap(a.date, p.date) - gap(b.date, p.date) || a.id.localeCompare(b.id));
    const line = bank[0];
    taken.add(line.id);
    matched.push({ ...row, line: line.id, lineDate: line.date, desc: line.desc, ambiguous: bank.length > 1 && gap(bank[1].date, p.date) === gap(line.date, p.date), single: parts.length < 2 });
  }
  return { matched, unmatched, done, pending: report.pending, offPlatform: report.offPlatform ?? [], problems: report.problems, roles };
}

const sameParts = (a, b) => a?.length === b.length && [...a].sort(cmp).every((p, i) => p.account === [...b].sort(cmp)[i].account && p.cents === [...b].sort(cmp)[i].cents);
const cmp = (x, y) => x.account.localeCompare(y.account) || x.cents - y.cents;

// Post every matched payout as a split. A payout with one part only (no fees)
// is filed plainly to that account. Ambiguous matches are skipped unless `force`.
export function applyPayouts(books, plan, { force = false } = {}) {
  const choices = {};
  const skipped = [];
  for (const m of plan.matched) {
    if (m.ambiguous && !force) { skipped.push(m); continue; }
    choices[m.line] = m.single ? m.parts[0].account : m.parts;
  }
  return { books: Object.keys(choices).length ? confirm(books, choices) : books, posted: Object.keys(choices).length, skipped };
}
