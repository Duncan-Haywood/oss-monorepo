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
// Integer cents. Hand-written fixtures in the documented layout only; no real
// export has been tried. Not accounting advice.

import { parseCsv, parseCents, parseDate } from "./bank.mjs";
import { confirm } from "./engine.mjs";
import { fmt } from "./ledger.mjs";

const key = (h) => String(h).trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
const ALIASES = {
  payout: ["automatic_payout_id", "payout_id", "payout", "transfer_id"],
  payoutDate: ["automatic_payout_effective_at", "automatic_payout_effective_at_utc", "payout_date", "payout_effective_at", "arrival_date", "transfer_date"],
  category: ["reporting_category", "category", "type", "transaction_type"],
  gross: ["gross", "amount", "gross_amount", "gross_sales", "total_collected"],
  fee: ["fee", "fees", "fee_amount", "processing_fees"],
  net: ["net", "net_amount", "net_total"],
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
  adjustment: "other", reserve: "skip", chargeback_won: "disputes", chargeback_reversal: "disputes",
  card: "sales", square_card: "sales", online_checkout: "sales", processing_fee: "fees",
  payout: "skip", payout_cancel: "skip", payout_failure: "skip", transfer: "skip",
};

// Read the report. -> { rows, payouts: [{ id, date, net, parts, rows }], pending, problems }
export function readPayoutReport(text) {
  const table = parseCsv(text).filter((r) => r.some((c) => String(c).trim() !== ""));
  if (table.length < 2) throw new Error("The report has no rows.");
  const head = table[0].map(key);
  const col = Object.fromEntries(Object.entries(ALIASES).map(([k, names]) => [k, names.map((n) => head.indexOf(n)).find((i) => i !== -1) ?? -1]));
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
    rows.push({ row: n + 2, id: at("id") || `row${n + 2}`, payout: at("payout"), payoutDate: parseDate(at("payoutDate")), created: parseDate(at("created")), category, kind: CATEGORY[category] ?? "other", gross, fee, net, desc: at("desc") });
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
export function planPayouts(books, report, { sales = "4000", refunds = "4000", fees = "6010", disputes = "6010", other = "4100", window = [-2, 7] } = {}) {
  const roles = { sales, refunds, fees, disputes, other };
  const codes = new Set(books.accounts.map((a) => a.code));
  for (const [r, c] of Object.entries(roles)) if (!codes.has(c)) throw new Error(`No account ${c} in the chart of accounts (for ${r}).`);
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
