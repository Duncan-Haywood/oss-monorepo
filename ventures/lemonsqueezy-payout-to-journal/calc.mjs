// Lemon Squeezy earnings export -> accounting journal.
//
// Lemon Squeezy pays sellers a net deposit that hides the sales, discounts, the Lemon Squeezy fee and
// any refunds. Bookkeepers need those split out, and a payout that straddles a month end split in two.
//
// Two inputs are read:
//  1. Lemon Squeezy's own Orders export (Orders page, Export; the CSV is emailed). Its columns, as
//     listed at docs.lemonsqueezy.com/help/orders/exporting-orders and cited by the 2026-11-13 quality
//     audit, include identifier, order_number, product_name, variant_name, subtotal, discount_total,
//     tax, total, tax_name, tax_rate and date_utc, with amounts in USD cents ("2000" = $20). The export
//     has no fee, net or payout column, so the fee is estimated from the published rate (5% + 50c of the
//     order total, plus any surcharge percentage the caller enters: 1.5% for buyers outside the US,
//     1.5% PayPal, 0.5% subscriptions, per docs.lemonsqueezy.com/help/getting-started/fees) and the
//     payout check against the bank deposit shows how far the estimate is off. Lemon Squeezy is the
//     merchant of record and remits the tax itself, so tax is never booked to the seller.
//  2. A CSV with per-order subtotal, fee and net columns in dollars (one you build from a payout
//     statement), read through aliases; tax is booked only when the row's arithmetic shows it was paid out.
//
// Both prove the rows add up to the payout and write balanced journals for Xero, QuickBooks Online,
// QuickBooks Desktop (IIF) and a plain CSV. No real Lemon Squeezy export and no live Xero or QuickBooks
// import was available when this was written; the importer layouts are from their public help pages. Column names are matched by several aliases, a sale whose
// parts do not add to its net is flagged, and a row no rule explains is never dropped: it lands in an
// "uncategorised" line and is reported, so the journal still equals the net.
//
// Everything is integer cents. Nothing here touches the network or the DOM.

export const CATEGORIES = {
  sales: { label: "Lemon Squeezy Product Sales (gross)", account: "Lemon Squeezy Product Sales" },
  shipping: { label: "Shipping charged to buyers", account: "Lemon Squeezy Shipping Income" },
  tax: { label: "Sales tax / VAT paid out to you (liability)", account: "Lemon Squeezy Sales Tax Payable" },
  discounts: { label: "Discounts given (contra-revenue)", account: "Lemon Squeezy Discounts" },
  refunds: { label: "Refunds", account: "Lemon Squeezy Refunds" },
  fees: { label: "Lemon Squeezy fees", account: "Lemon Squeezy Fees" },
  payoutfees: { label: "Lemon Squeezy payout fees", account: "Lemon Squeezy Fees" },
  uncategorised: { label: "Uncategorised Lemon Squeezy items", account: "Lemon Squeezy Uncategorised" },
  clearing: { label: "Lemon Squeezy clearing (matches the payout deposit)", account: "Lemon Squeezy Clearing" },
};
export const CATEGORY_ORDER = Object.keys(CATEGORIES);

export const defaultMapping = () => Object.fromEntries(CATEGORY_ORDER.map((k) => [k, CATEGORIES[k].account]));

// One "key = Account name" per line; blank lines and # comments are ignored.
export function parseMapping(text) {
  const out = defaultMapping(), errors = [];
  String(text || "").split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const m = line.match(/^([a-z]+)\s*[=:]\s*(.+)$/i);
    if (!m) { errors.push(`Line ${i + 1}: expected "category = account", got "${line}"`); return; }
    const key = m[1].toLowerCase();
    if (!CATEGORIES[key]) { errors.push(`Line ${i + 1}: unknown category "${m[1]}" (use ${CATEGORY_ORDER.join(", ")})`); return; }
    out[key] = m[2].trim();
  });
  return { mapping: out, errors };
}
export const mappingText = (mapping = defaultMapping()) => CATEGORY_ORDER.map((k) => `${k} = ${mapping[k]}`).join("\n");

const dollars = (c) => ((t) => (c < 0 && /[1-9∞]/.test(t) ? "-" : "") + t)((Math.abs(c) / 100).toFixed(2));
export const money = (c, cur = "USD") => ((t) => (c < 0 && /[1-9∞]/.test(t) ? "-" : "") + t)(Math.abs(c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " " + cur);

// ---- parsing ----------------------------------------------------------------

function splitLine(line, d) {
  const out = []; let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === d) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

const norm = (h) => h.trim().toLowerCase().replace(/^\uFEFF/, "").replace(/[\s_]+/g, "-").replace(/\(.*\)$/, "").replace(/-+$/, "");

export function parseAmount(s) {
  const t = String(s ?? "").trim().replace(/\s/g, "");
  if (t === "") return null;
  let u = t;
  if (/^-?\d{1,3}(\.\d{3})+,\d{1,2}$/.test(t)) u = t.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d+,\d{1,2}$/.test(t)) u = t.replace(",", ".");
  else if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) u = t.replace(/,/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(u)) return NaN;
  return Math.round(parseFloat(u) * 100);
}

// Returns YYYY-MM-DD or null. Accepts ISO (with a time), DD.MM.YYYY, and slashed dates read per `order`.
export function parseDate(s, order = "mdy") {
  const t = String(s ?? "").trim();
  if (!t) return null;
  let y, m, d, x;
  if ((x = t.match(/^(\d{4})-(\d{2})-(\d{2})/))) [y, m, d] = [x[1], x[2], x[3]];
  else if ((x = t.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?!\d)/))) [d, m, y] = [x[1], x[2], x[3]];
  else if ((x = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?!\d)/))) { if (order === "dmy") [d, m, y] = [x[1], x[2], x[3]]; else [m, d, y] = [x[1], x[2], x[3]]; }
  else return null;
  const dt = new Date(Date.UTC(+y, +m - 1, +d));
  if (dt.getUTCFullYear() !== +y || dt.getUTCMonth() !== +m - 1 || dt.getUTCDate() !== +d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

const UNPAID = "(no payout ID)";
const ALL = "all rows";
const TRUE = /^(true|yes|y|1|refunded)$/i;

// Rows are grouped by payout id when the export has one; otherwise the whole file is one group and
// the deposit is supplied by the caller (opts.expected, from the bank / PayPal / Lemon Squeezy payouts page).
// An optional `type` column containing "payout" states the deposit.
export function parsePayouts(text, opts = {}) {
  const findings = [];
  const add = (severity, title, detail, line) => findings.push({ severity, title, detail, line: line || 0 });
  const lines = String(text || "").replace(/^\uFEFF/, "").split(/\r?\n/);
  const first = lines.findIndex((l) => l.trim());
  const none = { payouts: [], findings, summary: { rows: 0, payouts: 0 } };
  if (first < 0) { add("error", "The file is empty", "Paste or choose a Lemon Squeezy earnings CSV."); return none; }
  const d = (lines[first].match(/\t/g) || []).length > (lines[first].match(/,/g) || []).length ? "\t" : ",";
  const head = splitLine(lines[first], d).map(norm);
  const col = (...names) => { for (const n of names) { const i = head.indexOf(n); if (i >= 0) return i; } return -1; };
  if (isOrdersExport(head)) return parseOrdersExport(lines, first, d, head, opts, findings, add);
  const I = {
    payout: col("payout-id", "payout", "payout-reference"),
    effective: col("payout-date", "paid-out-on", "payout-created-at"),
    id: col("order-id", "order-number", "identifier", "sale-id", "id"),
    created: col("date-utc", "charge-date", "date", "purchase-date", "sale-date", "created-at", "created"),
    currency: col("currency", "price-currency"),
    price: col("subtotal", "price", "amount", "gross", "sale-price"),
    discount: col("discount-total", "discount", "discounts"),
    shipping: col("shipping", "shipping-price"),
    tax: col("taxes", "tax", "sales-tax", "vat"),
    fee: col("fees", "fee", "lemonsqueezy-fees", "lemonsqueezy-fee", "lemon-squeezy-fee", "lemon-squeezy-fees", "total-fees"),
    platformFee: col("platform-fee", "platform-fees", "lemonsqueezy-platform-fee"),
    processingFee: col("processing-fee", "payment-processing-fee", "processing-fees"),
    net: col("net-total", "net", "net-earnings", "seller-revenue", "you-receive"),
    refunded: col("refunded", "is-refunded", "refunded?", "refund"),
    refundAmt: col("refunded-amount", "amount-refunded"),
    item: col("product-name", "product", "variant-name", "variant", "item-name", "item"),
    type: col("type", "transaction-type"),
  };
  const missing = [];
  if (I.net < 0) missing.push("net total");
  if (I.price < 0) missing.push("subtotal");
  if (missing.length) {
    add("error", "This does not look like a Lemon Squeezy export", `Missing column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}. This tool reads Lemon Squeezy's Orders export (in Lemon Squeezy open Orders and press Export; the CSV arrives by email; it needs the subtotal, total and date_utc columns), or a CSV with one row per order and subtotal, fee and net columns in dollars.`, first + 1);
    return none;
  }
  const get = (cells, k) => (I[k] >= 0 ? (cells[I[k]] ?? "").trim() : "");
  const byId = new Map();
  const bucket = (id) => { if (!byId.has(id)) byId.set(id, { id, effective: null, stated: null, currency: "", rows: [] }); return byId.get(id); };
  let rows = 0;
  for (let i = first + 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cells = splitLine(lines[i], d);
    const rid = get(cells, "id") || `line ${i + 1}`;
    const pid = I.payout >= 0 ? get(cells, "payout") || UNPAID : ALL;
    const s = bucket(pid);
    const eff = parseDate(get(cells, "effective"), opts.dateOrder);
    if (eff && !s.effective) s.effective = eff;
    const netS = get(cells, "net"), net = parseAmount(netS);
    if (/^payout/i.test(get(cells, "type"))) { if (net !== null && !Number.isNaN(net)) s.stated = (s.stated || 0) + Math.abs(net); continue; } // the deposit itself
    if (net === null) { add("warning", "Row has no net total", `${rid} was skipped.`, i + 1); continue; }
    const amts = {};
    let bad = Number.isNaN(net);
    for (const k of ["price", "discount", "shipping", "tax", "fee", "platformFee", "processingFee", "refundAmt"]) { const v = parseAmount(get(cells, k)); if (Number.isNaN(v)) bad = true; amts[k] = v == null ? 0 : v; }
    if (bad) { add("error", `An amount on ${rid} is not a number`, "The row is left out, so its payout will not add up.", i + 1); continue; }
    const cur = get(cells, "currency").toUpperCase();
    if (cur && s.currency && cur !== s.currency) add("warning", `Mixed currencies in ${pid === ALL ? "the export" : `payout ${pid}`}`, `${cur} row among ${s.currency} rows. Journals assume one currency per payout.`, i + 1);
    if (cur && !s.currency) s.currency = cur;
    const refunded = TRUE.test(get(cells, "refunded")) || amts.refundAmt > 0;
    // Lemon Squeezy fee columns are usually positive numbers meaning a cost; a negative one is read as a cost too.
    // Lemon Squeezy reports a platform fee and a processing fee as separate columns; both are summed (a combined fee column wins when present).
    const fee = I.fee >= 0 ? Math.abs(amts.fee) : Math.abs(amts.platformFee) + Math.abs(amts.processingFee);
    const parts = [];
    const push = (k, amt) => { if (amt) parts.push({ k, amt }); };
    const disc = Math.abs(amts.discount), sold = amts.price - disc;
    push("sales", amts.price);
    push("discounts", -disc);
    push("shipping", amts.shipping);
    // Tax is the buyer's, so it only belongs in the payout when the row's own arithmetic says Lemon Squeezy paid it out.
    const taxInNet = amts.tax !== 0 && sold + amts.shipping + amts.tax - fee === net + (refunded ? (amts.refundAmt || sold + amts.shipping + amts.tax) : 0);
    if (taxInNet) push("tax", amts.tax);
    push("fees", -fee);
    if (refunded) push("refunds", -(amts.refundAmt || sold + amts.shipping + (taxInNet ? amts.tax : 0)));
    let residual = net - parts.reduce((a, p) => a + p.amt, 0);
    if (residual !== 0) {
      if (refunded) { push("fees", residual); add("info", `${rid}: refunded sale's fee adjusted by ${money(residual)}`, "The net total on a refunded sale differs from price minus fee minus refund; the difference is booked to fees (Lemon Squeezy returning or keeping its fee).", i + 1); }
      else { push("uncategorised", residual); add("error", `Parts do not add up to the net total on ${rid}`, `Price ${money(amts.price)}${disc ? ` - discount ${money(disc)}` : ""} + shipping ${money(amts.shipping)} - fee ${money(fee)} = ${money(sold + amts.shipping - fee)}, but the row says ${money(net)}. The ${money(residual)} difference is journalled to "uncategorised"; check the file was not edited.`, i + 1); }
    }
    s.rows.push({ line: i + 1, id: rid, item: get(cells, "item"), gross: amts.price, fee, net, refunded, parts, created: parseDate(get(cells, "created"), opts.dateOrder) });
    rows++;
  }
  return finishPayouts([...byId.values()], rows, opts, findings, add);
}

function finishPayouts(groups, rows, opts, findings, add) {
  const payouts = groups.filter((s) => s.rows.length || s.stated !== null);
  if (!payouts.length) add("error", "No sales rows found", "The header was read but there were no data rows.");
  const real = payouts.filter((s) => s.id !== UNPAID);
  if (opts.expected != null && Number.isFinite(opts.expected)) {
    if (real.length === 1 && real[0].stated === null) real[0].stated = opts.expected;
    else if (real.length !== 1) add("info", "Expected deposit ignored", "It can only be applied when the file holds exactly one payout (or no payout column) without a deposit row of its own.");
  }
  // Lemon Squeezy deducts payout fees from the payout itself (1% for bank accounts outside the US; PayPal
  // $0.50 in the US, 3% capped at $30 elsewhere: docs.lemonsqueezy.com/help/getting-started/fees).
  if (opts.payoutFee != null && Number.isFinite(opts.payoutFee) && opts.payoutFee !== 0) {
    if (real.length === 1) real[0].payoutFee = Math.abs(opts.payoutFee);
    else add("info", "Payout fee ignored", "It can only be applied when the file holds exactly one payout (or no payout column).");
  }
  return { payouts, findings, summary: { rows, payouts: payouts.length } };
}

// ---- Lemon Squeezy Orders export ----------------------------------------------

export const LS_FEE = { pct: 5, fixedCents: 50 };
const ORDER_STATUS_SKIP = /^(pending|failed|void|draft)$/i;

export function isOrdersExport(head) {
  const has = (n) => head.includes(n);
  const netLike = ["net-total", "net", "net-earnings", "seller-revenue", "you-receive"].some(has);
  return !netLike && (has("total") || has("total-usd")) && (has("date-utc") || has("order-number") || has("identifier"));
}

// Whole numbers are cents, as the export writes them; a value with a decimal point is read as dollars.
function cents(s, flag) {
  const t = String(s ?? "").trim().replace(/[$\s]/g, "");
  if (t === "") return null;
  if (/^-?\d+$/.test(t)) return parseInt(t, 10);
  const v = parseAmount(t);
  if (!Number.isNaN(v) && v !== null) flag.dollars = true;
  return v;
}

export const estimateFee = (totalCents, extraPct = 0) => (totalCents > 0 ? Math.round((totalCents * (LS_FEE.pct + extraPct)) / 100) + LS_FEE.fixedCents : 0);

function parseOrdersExport(lines, first, d, head, opts, findings, add) {
  const col = (...names) => { for (const n of names) { const i = head.indexOf(n); if (i >= 0) return i; } return -1; };
  const I = {
    id: col("order-number", "identifier", "order-id", "id"),
    item: col("product-name", "variant-name", "product"),
    variant: col("variant-name"),
    created: col("date-utc", "created-at", "date"),
    subtotal: col("subtotal-usd", "subtotal"),
    discount: col("discount-total-usd", "discount-total"),
    tax: col("tax-usd", "tax"),
    total: col("total-usd", "total"),
    fee: col("fee", "fees", "platform-fee", "lemon-squeezy-fee"),
    status: col("status"),
    refunded: col("refunded"),
    refundAmt: col("refunded-amount-usd", "refunded-amount"),
    payout: col("payout-id"),
  };
  const none = { payouts: [], findings, summary: { rows: 0, payouts: 0 } };
  if (I.total < 0 || I.subtotal < 0) {
    add("error", "This looks like a Lemon Squeezy Orders export but a column is missing", `It needs subtotal and total columns (amounts in cents). Found: ${head.join(", ")}.`, first + 1);
    return none;
  }
  const extraPct = Number.isFinite(opts.extraPct) ? opts.extraPct : 0;
  const get = (cells, k) => (I[k] >= 0 ? (cells[I[k]] ?? "").trim() : "");
  const flag = { dollars: false };
  const byId = new Map();
  const bucket = (id) => { if (!byId.has(id)) byId.set(id, { id, effective: null, stated: null, currency: "USD", rows: [] }); return byId.get(id); };
  let rows = 0, estimated = 0, skipped = 0, refundedCount = 0;
  for (let i = first + 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cells = splitLine(lines[i], d);
    const rid = get(cells, "id") ? `#${get(cells, "id").replace(/^#/, "")}` : `line ${i + 1}`;
    const status = get(cells, "status");
    if (ORDER_STATUS_SKIP.test(status)) { skipped++; continue; }
    const v = {};
    let bad = false;
    for (const k of ["subtotal", "discount", "tax", "total", "fee", "refundAmt"]) { const x = cents(get(cells, k), flag); if (Number.isNaN(x)) bad = true; v[k] = x; }
    if (bad || v.total === null) { add("error", `An amount on ${rid} is not a number`, "The row is left out, so the payout will not add up.", i + 1); continue; }
    const subtotal = v.subtotal ?? 0, disc = Math.abs(v.discount ?? 0), tax = v.tax ?? 0, total = v.total;
    const hasFee = I.fee >= 0 && v.fee !== null;
    const fee = hasFee ? Math.abs(v.fee) : estimateFee(total, extraPct);
    if (!hasFee && fee) estimated++;
    const full = /^refunded$/i.test(status) || TRUE.test(get(cells, "refunded"));
    const partial = !full && (/partial/i.test(status) || (v.refundAmt ?? 0) > 0);
    const revenue = total - tax; // what the buyer paid for the product, before Lemon Squeezy's fee
    let refund = 0;
    if (full) refund = revenue;
    else if (partial) {
      if (v.refundAmt) refund = total ? Math.round((Math.abs(v.refundAmt) * revenue) / total) : 0;
      else add("warning", `${rid} is partly refunded but the file has no refunded amount`, "It is booked as a full sale; book the refund by hand.", i + 1);
    }
    if (refund) refundedCount++;
    const parts = [];
    const push = (k, amt) => { if (amt) parts.push({ k, amt }); };
    push("sales", subtotal);
    push("discounts", -disc);
    push("fees", -fee);
    push("refunds", -refund);
    const residual = revenue - (subtotal - disc);
    if (residual) {
      push("uncategorised", residual);
      add("error", `Subtotal, discount and tax do not make the total on ${rid}`, `Subtotal ${money(subtotal)} - discount ${money(disc)} + tax ${money(tax)} = ${money(subtotal - disc + tax)}, but the total is ${money(total)}. The ${money(residual)} difference is journalled to "uncategorised"; check the file was not edited.`, i + 1);
    }
    const net = revenue - fee - refund;
    const pid = I.payout >= 0 ? get(cells, "payout") || UNPAID : ALL;
    const item = [get(cells, "item"), I.variant >= 0 && I.variant !== I.item && !/^default$/i.test(get(cells, "variant")) ? get(cells, "variant") : ""].filter(Boolean).join(" / ");
    bucket(pid).rows.push({ line: i + 1, id: rid, item, gross: subtotal, fee, net, refunded: refund > 0, parts, created: parseDate(get(cells, "created"), opts.dateOrder) });
    rows++;
  }
  add("info", "Read as Lemon Squeezy's Orders export", "Amounts are read as USD cents, as the export writes them. Tax is left out of the journal: Lemon Squeezy is the merchant of record and remits it, so it is never in your payout.", first + 1);
  if (flag.dollars) add("warning", "Some amounts had a decimal point", "The Orders export writes whole cents (2000 = $20.00). Values with a decimal point were read as dollars; check the file was not re-saved by a spreadsheet.", 0);
  if (estimated) add("warning", `Lemon Squeezy's fee is estimated on ${estimated} order${estimated === 1 ? "" : "s"}`, `The Orders export has no fee column, so each fee is ${LS_FEE.pct + extraPct}% + $0.50 of the order total (Lemon Squeezy's published 5% + 50c${extraPct ? `, plus the ${extraPct}% surcharge you entered` : ""}). Lemon Squeezy adds 1.5% for buyers outside the US, 1.5% for PayPal and 0.5% for subscriptions. Enter your bank deposit: if it differs from the journal, adjust the surcharge or book the difference to fees after checking your Lemon Squeezy payout statement.`, 0);
  if (refundedCount) add("info", `${refundedCount} refunded order${refundedCount === 1 ? "" : "s"}`, "Each refund reverses the order's revenue before tax; Lemon Squeezy's fee is assumed kept. If your payout statement shows the fee returned, book that by hand.", 0);
  if (skipped) add("info", `${skipped} pending, failed or void order${skipped === 1 ? "" : "s"} skipped`, "They never reached a payout.", 0);
  return finishPayouts([...byId.values()], rows, opts, findings, add);
}

// ---- journals ----------------------------------------------------------------

const lastDay = (ym) => { const [y, m] = ym.split("-").map(Number); return `${ym}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`; };

// split: "month" (default) writes one journal per calendar month a payout touches.
export function buildJournals(payouts, opts = {}) {
  const mapping = opts.mapping || defaultMapping();
  const split = opts.split || "month";
  const findings = [];
  const journals = [];
  for (const s of payouts) {
    const sum = s.rows.reduce((a, r) => a + r.net, 0) - (s.payoutFee || 0);
    const cur = s.currency || "USD";
    const endDate = s.effective || [...s.rows].map((r) => r.created).filter(Boolean).sort().pop() || null;
    if (s.id === UNPAID) findings.push({ severity: "warning", title: `${s.rows.length} row${s.rows.length === 1 ? "" : "s"} have no payout ID`, detail: "They have no payout ID in the report. They are journalled to Lemon Squeezy clearing as a separate group and will not match a bank deposit yet.", line: 0 });
    else if (s.stated === null) findings.push({ severity: "warning", title: `${s.id === ALL ? "The export" : `Payout ${s.id}`} has no payout row and no expected deposit`, detail: `The rows add up to ${money(sum, cur)}. Enter the deposit from your bank, PayPal or Lemon Squeezy payout in the box above to check it.`, line: 0 });
    else if (s.stated !== sum) findings.push({ severity: "error", title: `Payout ${s.id}: rows add up to ${money(sum, cur)} but the payout is ${money(s.stated, cur)}`, detail: `Off by ${money(s.stated - sum, cur)}. Rows are missing from the paste, or an amount was skipped. Do not post this journal until the figures agree.`, line: 0 });
    const periods = new Map();
    let undated = 0;
    for (const r of s.rows) {
      let ym = r.created ? r.created.slice(0, 7) : (endDate || "").slice(0, 7);
      if (!r.created) undated++;
      if (split === "none") ym = (endDate || ym || "").slice(0, 7);
      if (!ym) ym = "undated";
      if (!periods.has(ym)) periods.set(ym, new Map());
      const m = periods.get(ym);
      const add = (k, amt) => { if (!amt) return; const e = m.get(k) || { net: 0, count: 0 }; e.net += amt; e.count++; m.set(k, e); };
      for (const p of r.parts) add(p.k, p.amt);
    }
    if (undated) findings.push({ severity: "warning", title: `${undated} row${undated === 1 ? "" : "s"} in payout ${s.id} had no created date`, detail: "They were placed in the payout's final month.", line: 0 });
    if (s.payoutFee) {
      const ym = (endDate || "").slice(0, 7) || [...periods.keys()].sort().pop() || "undated";
      if (!periods.has(ym)) periods.set(ym, new Map());
      periods.get(ym).set("payoutfees", { net: -s.payoutFee, count: 1 });
    }
    const keys = [...periods.keys()].sort();
    if (keys.length > 1) findings.push({ severity: "info", title: `Payout ${s.id} spans ${keys.length} months`, detail: `Written as ${keys.length} journals (${keys.join(", ")}), each balanced to Lemon Squeezy clearing, so every month's revenue and fees land in the month they happened. The bank deposit of ${s.stated === null ? "the full amount" : money(s.stated, cur)} then clears both.`, line: 0 });
    keys.forEach((ym, idx) => {
      const m = periods.get(ym), last = idx === keys.length - 1;
      const date = ym === "undated" ? (endDate || "") : last && endDate && endDate.slice(0, 7) === ym ? endDate : lastDay(ym);
      const lines = [];
      for (const k of CATEGORY_ORDER) {
        if (k === "clearing" || !m.has(k)) continue;
        const { net, count } = m.get(k);
        if (net === 0) continue;
        lines.push({ category: k, account: mapping[k], debit: net < 0 ? -net : 0, credit: net > 0 ? net : 0, memo: `${CATEGORIES[k].label} (${count} row${count === 1 ? "" : "s"})` });
      }
      const net = lines.reduce((a, l) => a + l.credit - l.debit, 0);
      if (net !== 0 || !lines.length) lines.push({ category: "clearing", account: mapping.clearing, debit: net > 0 ? net : 0, credit: net < 0 ? -net : 0, memo: `Payout ${s.id}${keys.length > 1 ? ` (${ym})` : ""}` });
      journals.push({ payoutId: s.id, period: ym, date, deposit: s.effective, currency: cur, narration: `Lemon Squeezy payout ${s.id}${keys.length > 1 ? ` ${ym}` : ""}`, lines, clearing: net });
    });
    const unknown = s.rows.filter((r) => r.parts.some((p) => p.k === "uncategorised"));
    if (unknown.length) findings.push({ severity: "warning", title: `Payout ${s.id} has ${unknown.length} item${unknown.length === 1 ? "" : "s"} no rule recognised`, detail: `${[...new Set(unknown.map((r) => r.item || r.id))].slice(0, 5).join(", ")}. They are journalled to "${mapping.uncategorised}" so the journal still equals the net. Review them and reclassify by hand if needed.`, line: unknown[0].line });
  }
  return { journals, findings };
}

export function uncategorisedRows(payouts) {
  return payouts.flatMap((s) => s.rows.filter((r) => r.parts.some((p) => p.k === "uncategorised")).map((r) => ({ payout: s.id, ...r })));
}

export function reconciliation(payouts, journals) {
  return payouts.map((s) => {
    const js = journals.filter((j) => j.payoutId === s.id);
    const sum = js.reduce((a, j) => a + j.clearing, 0);
    return { id: s.id, deposit: s.effective, currency: s.currency || "USD", stated: s.id === UNPAID ? null : s.stated, journalled: sum, periods: js.map((j) => ({ period: j.period, date: j.date, clearing: j.clearing })), agrees: s.id === UNPAID || s.stated === null ? null : s.stated === sum };
  });
}

export function validate(text, opts = {}) {
  const p = parsePayouts(text, opts);
  const b = buildJournals(p.payouts, opts);
  const findings = [...p.findings, ...b.findings];
  const order = { error: 0, warning: 1, info: 2 };
  findings.sort((a, b2) => order[a.severity] - order[b2.severity]);
  return { payouts: p.payouts, journals: b.journals, findings, reconciliation: reconciliation(p.payouts, b.journals), summary: { ...p.summary, journals: b.journals.length } };
}

// ---- exports -----------------------------------------------------------------

const csvCell = (v) => { let s = String(v ?? ""); if (/^[=+\-@\t\r]/.test(s) && !/^-?\d[\d,.]*$/.test(s)) s = "'" + s; return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }; // formula injection guard (CWE-1236)
const csvRow = (a) => a.map(csvCell).join(",");
const fmtDate = (iso, order) => { if (!iso) return ""; const [y, m, d] = iso.split("-"); return order === "dmy" ? `${d}/${m}/${y}` : order === "mdy" ? `${m}/${d}/${y}` : iso; };
const journalsOf = (journals, id) => journals.filter((j) => j.payoutId === id).length;
const docNo = (journals, j) => `${j.payoutId}${j.period && j.period !== "undated" && journalsOf(journals, j.payoutId) > 1 ? "-" + j.period : ""}`;

// Xero manual journal import: debits positive, credits negative.
export function toXeroJournalCsv(journals, o = {}) {
  const tax = o.taxRate || "Tax Exempt";
  const rows = [csvRow(["*Narration", "*Date", "Description", "*AccountCode", "*TaxRate", "*Amount"])];
  for (const j of journals) for (const l of j.lines) rows.push(csvRow([j.narration, fmtDate(j.date, o.dateOrder || "dmy"), l.memo, l.account, tax, dollars(l.debit - l.credit)]));
  return rows.join("\r\n") + "\r\n";
}

// QuickBooks Online journal entry import.
export function toQboJournalCsv(journals, o = {}) {
  const rows = [csvRow(["*JournalNo", "*JournalDate", "*AccountName", "Debits", "Credits", "Description", "Name", "Currency"])];
  for (const j of journals) for (const l of j.lines) rows.push(csvRow([docNo(journals, j), fmtDate(j.date, o.dateOrder || "mdy"), l.account, l.debit ? dollars(l.debit) : "", l.credit ? dollars(l.credit) : "", l.memo, "", j.currency]));
  return rows.join("\r\n") + "\r\n";
}

// QuickBooks Desktop IIF general journal: positive = debit, a transaction's lines sum to zero.
export function toIif(journals) {
  const t = (s) => String(s ?? "").replace(/[\t\r\n]+/g, " ");
  const out = ["!TRNS\tTRNSID\tTRNSTYPE\tDATE\tACCNT\tAMOUNT\tDOCNUM\tMEMO", "!SPL\tSPLID\tTRNSTYPE\tDATE\tACCNT\tAMOUNT\tDOCNUM\tMEMO", "!ENDTRNS"];
  for (const j of journals) {
    const date = fmtDate(j.date, "mdy"), doc = t(docNo(journals, j));
    j.lines.forEach((l, i) => out.push(`${i === 0 ? "TRNS" : "SPL"}\t\tGENERAL JOURNAL\t${date}\t${t(l.account)}\t${((l.debit - l.credit) / 100).toFixed(2)}\t${doc}\t${t(l.memo)}`));
    out.push("ENDTRNS");
  }
  return out.join("\r\n") + "\r\n";
}

export function journalsCsv(journals) {
  const rows = [csvRow(["payout", "period", "date", "category", "account", "debit", "credit", "memo"])];
  for (const j of journals) for (const l of j.lines) rows.push(csvRow([j.payoutId, j.period, j.date, l.category, l.account, l.debit ? dollars(l.debit) : "", l.credit ? dollars(l.credit) : "", l.memo]));
  return rows.join("\r\n") + "\r\n";
}

export function findingsCsv(result) {
  return [csvRow(["severity", "line", "title", "detail"]), ...result.findings.map((f) => csvRow([f.severity, f.line || "", f.title, f.detail]))].join("\r\n") + "\r\n";
}

export function decodeBuffer(buf) {
  const u = new Uint8Array(buf);
  if (u[0] === 0xff && u[1] === 0xfe) return new TextDecoder("utf-16le").decode(u);
  if (u[0] === 0xfe && u[1] === 0xff) return new TextDecoder("utf-16be").decode(u);
  return new TextDecoder("utf-8").decode(u);
}

// ---- samples -----------------------------------------------------------------

const HEAD = ["Type", "Order ID", "Product", "Date", "Subtotal", "Shipping", "Tax", "Platform Fee", "Processing Fee", "Net Total", "Currency", "Refunded", "Payout ID"];

// A CSV with per-order fee and net columns in dollars (the second input form).
// items: [date, item, price, fee, refunded, shipping]. A deposit row is added when `withPayoutRow`.
// The fee is written as one platform-fee column (Lemon Squeezy charges a single fee); the
// processing-fee column stays for files that split it.
export function buildReport({ id = "P-2026-10", currency = "USD", items, withPayoutRow = false, totalOverride }) {
  const csv = (v) => (/[",]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const out = [HEAD.join(",")];
  let net = 0, n = 0;
  for (const [date, item, price, fee, refunded, shipping] of items) {
    n++;
    const bad = typeof price === "string";
    const ship = shipping || 0;
    const nn = bad ? NaN : refunded ? -fee : price + ship - fee;
    if (!Number.isNaN(nn)) net += Math.round(nn * 100);
    out.push(["sale", `${1000 + n}`, item, `${date} 12:00:00`, bad ? price : price.toFixed(2), ship.toFixed(2), "0.00", fee.toFixed(2), "0.00", bad ? price : nn.toFixed(2), currency, refunded ? "true" : "false", id].map(csv).join(","));
  }
  if (withPayoutRow) out.push(["payout", "", "", "", "", "", "", "", "", ((totalOverride ?? net / 100)).toFixed(2), currency, "", id].map(csv).join(","));
  return out.join("\n") + "\n";
}

// Fees at Lemon Squeezy's published 5% + 50c of the order total.
const SAMPLE_ITEMS = [
  ["2026-09-28", "Field guide ebook", 29.00, 1.95, false],
  ["2026-09-29", "Video course", 149.00, 7.95, false],
  ["2026-09-30", "Template pack", 19.00, 1.45, false],
  ["2026-10-01", "Video course", 149.00, 7.95, false],
  ["2026-10-02", "Field guide ebook", 29.00, 1.95, true],
  ["2026-10-03", "Icon set", 35.00, 2.25, false],
];

const deposit = (items) => items.reduce((a, r) => a + Math.round(((r[4] ? 0 : r[2] + (r[5] || 0)) - r[3]) * 100), 0) / 100;
export const sampleReport = () => buildReport({ items: SAMPLE_ITEMS, withPayoutRow: true });
// The same file after a hand edit: a row dropped so the payout no longer agrees, one sale whose
// parts do not add to its net, and one amount that is not a number.
export function sampleBrokenReport() {
  const items = SAMPLE_ITEMS.filter((r) => r[1] !== "Icon set");
  items.push(["2026-10-04", "Mystery item", 10.00, 1.00, false]);
  items.push(["2026-10-04", "Extra pack", "12..5", 1.00, false]);
  return buildReport({ items, totalOverride: deposit(SAMPLE_ITEMS), withPayoutRow: true }).replace("10.00,0.00,0.00,1.00,0.00,9.00,", "10.00,0.00,0.00,1.00,0.00,7.00,");
}

// Lemon Squeezy's Orders export layout (amounts in USD cents). Synthetic orders for a made-up seller.
const ORDERS_HEAD = ["identifier", "order_number", "product_name", "variant_name", "user_name", "user_email", "status", "subtotal", "discount_total", "tax", "total", "tax_name", "tax_rate", "tax_number", "date_utc"];
// [order, product, variant, status, subtotal, discount, tax, taxName, taxRate, date]
const SAMPLE_ORDERS = [
  [2041, "Field guide ebook", "Default", "paid", 2900, 0, 0, "", "", "2026-09-28 14:02:11"],
  [2042, "Video course", "Lifetime", "paid", 14900, 0, 2980, "VAT", "20", "2026-09-29 09:15:40"],
  [2043, "Template pack", "Default", "paid", 1900, 500, 0, "", "", "2026-09-30 22:41:03"],
  [2044, "Video course", "Lifetime", "paid", 14900, 0, 0, "", "", "2026-10-01 11:20:57"],
  [2045, "Field guide ebook", "Default", "refunded", 2900, 0, 0, "", "", "2026-10-02 16:05:12"],
  [2046, "Icon set", "Default", "paid", 3500, 0, 665, "Sales tax", "19", "2026-10-03 08:47:29"],
  [2047, "Icon set", "Default", "pending", 3500, 0, 0, "", "", "2026-10-03 19:12:00"],
];
function ordersCsv(rows) {
  const out = [ORDERS_HEAD.join(",")];
  for (const [n, product, variant, status, sub, disc, tax, taxName, taxRate, date] of rows) {
    const total = typeof sub === "string" ? sub : sub - disc + tax;
    out.push([`9d1c${n}-synthetic`, n, product, variant, "Example Buyer", `buyer${n}@example.com`, status, sub, disc, tax, total, taxName, taxRate, "", date].join(","));
  }
  return out.join("\n") + "\n";
}
// Deposit for the sample at the base 5% + 50c rate, for the page's example deposit box.
export const sampleOrdersDeposit = () => SAMPLE_ORDERS.filter((r) => r[3] === "paid").reduce((a, r) => a + (r[4] - r[5]) - estimateFee(r[4] - r[5] + r[6]), 0) - estimateFee(2900);
export const sampleOrdersExport = () => ordersCsv(SAMPLE_ORDERS);
// The same export after a careless edit: an order dropped, one total that no longer matches its parts,
// and one amount that is not a number.
export function sampleBrokenOrdersExport() {
  const rows = SAMPLE_ORDERS.filter((r) => r[0] !== 2046).map((r) => [...r]);
  rows.push([2048, "Sticker sheet", "Default", "paid", "12..5", 0, 0, "", "", "2026-10-04 10:00:00"]);
  return ordersCsv(rows).replace("2043,Template pack,Default,Example Buyer,buyer2043@example.com,paid,1900,500,0,1400,", "2043,Template pack,Default,Example Buyer,buyer2043@example.com,paid,1900,500,0,1900,");
}
