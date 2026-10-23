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
  payout: ["automatic_payout_id", "payout_id", "payout", "transfer_id", "payout_reference", "payout_reference_id", "deposit_id"],
  payoutDate: ["automatic_payout_effective_at", "automatic_payout_effective_at_utc", "payout_date", "payout_effective_at", "arrival_date", "transfer_date", "deposit_date"],
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
};

// Read the report. -> { rows, payouts: [{ id, date, net, parts, rows }], pending, problems }
export function readPayoutReport(text) {
  if (/^\s*[\[{]/.test(text)) return readSquareJson(text);
  let table = parseCsv(text).filter((r) => r.some((c) => String(c).trim() !== ""));
  if (table.length < 2) throw new Error("The report has no rows.");
  // Seller Central's date-range CSV opens with a few note lines before the header.
  const at0 = table.findIndex((r) => { const h = r.map(key); return h.includes("settlement_id") && h.includes("selling_fees") && h.includes("product_sales"); });
  if (at0 !== -1) return readAmazonRange(table.slice(at0));
  const head = table[0].map(key);
  if (head.includes("settlement_id") && head.includes("amount_type") && head.includes("amount_description")) return readAmazon(table, head);
  if (head.includes("fees_taxes") && head.includes("title") && head.includes("type") && head.includes("net")) return readEtsy(table, head);
  if (head.includes("confirmation_code") && head.includes("gross_earnings") && head.includes("host_fee") && head.includes("type")) return readAirbnb(table, head);
  const col = Object.fromEntries(Object.entries(ALIASES).map(([k, names]) => [k, names.map((n) => head.indexOf(n)).find((i) => i !== -1) ?? -1]));
  // Square's dashboard export has Gross Sales (before tax and tip) and Total Collected; Fees and Net Total are on the latter.
  if (head.includes("total_collected") && head.includes("net_total")) col.gross = head.indexOf("total_collected");
  const squareSplit = head.includes("total_collected") && head.includes("net_total") && (head.includes("tax") || head.includes("tip"));
  for (const need of ["gross", "net", "category"]) if (col[need] === -1) throw new Error(`No "${need}" column: the report needs payout id, payout date, category, gross, fee and net columns.`);
  if (col.payout === -1 && head.includes("transaction_id") && head.includes("status") && head.includes("type")) return readPaypal(table, head);
  if (col.payout === -1) throw new Error('No payout id column (Stripe: "automatic_payout_id"). Export the payout reconciliation report, not the plain payments list.');
  const problems = [];
  const rows = [];
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
  for (const x of rows) {
    if (x.kind === "skip") continue;
    if (!x.payout) { pending.push(x); continue; }
    if (!by.has(x.payout)) by.set(x.payout, []);
    by.get(x.payout).push(x);
  }
  const payouts = [...by].map(([id, rs]) => {
    const dates = rs.map((x) => x.payoutDate).filter(Boolean).sort();
    const sum = (f) => rs.reduce((a, x) => a + f(x), 0);
    return { id, date: dates.at(-1) ?? rs.map((x) => x.created).filter(Boolean).sort().at(-1) ?? null, net: sum((x) => x.net), gross: sum((x) => x.gross), fees: sum((x) => x.fee), rows: rs };
  }).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return { rows, payouts, pending, problems };
}

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
    const kind = /payout|transfer/.test(category) ? "skip" : category === "charge" ? "sales" : /refund/.test(category) ? "refunds" : /dispute|chargeback/.test(category) ? "disputes" : /fee/.test(category) ? "fees" : "other";
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
  const c = { date: ix("date"), time: ix("time"), type: ix("type"), status: ix("status"), gross: ix("gross"), fee: ix("fee"), net: ix("net"), id: ix("transaction_id"), desc: ix("name", "description") };
  for (const need of ["date", "gross", "net"]) if (c[need] === -1) throw new Error(`The PayPal report has no "${need}" column.`);
  const problems = [];
  const all = [];
  table.slice(1).forEach((r, n) => {
    const at = (k) => (c[k] === -1 ? "" : String(r[c[k]] ?? "").trim());
    if (c.status !== -1 && key(at("status")) !== "completed") return;
    const gross = parseCents(at("gross")), net = parseCents(at("net"));
    const fee = c.fee === -1 ? 0 : -(parseCents(at("fee")) ?? NaN);
    if ([gross, net, fee].some((v) => v === null || Number.isNaN(v))) { problems.push(`Row ${n + 2}: cannot read the amounts.`); return; }
    if (net !== gross - fee) { problems.push(`Row ${n + 2}: net ${fmt(net)} is not gross ${fmt(gross)} less fee ${fmt(fee)}.`); return; }
    const category = key(at("type"));
    const kind = category.includes("withdrawal") ? "withdrawal" : /refund/.test(category) ? "refunds" : /reversal|dispute|chargeback|hold|reserve/.test(category) ? "disputes" : /conversion|bank_deposit|transfer|add_funds/.test(category) ? "skip" : /payment|sale|checkout|invoice|subscription/.test(category) ? "sales" : "other";
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
    else if (amt === "itemprice") kind = /tax/.test(what) ? "tax" : type === "refund" ? "refunds" : "sales";
    else if (/withheld|tax/.test(amt)) kind = "tax";
    else if (/promotion/.test(amt)) kind = "refunds";
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
  return { matched, unmatched, done, pending: report.pending, problems: report.problems, roles };
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
