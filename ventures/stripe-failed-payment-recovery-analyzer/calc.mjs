// Failed-payment recovery analysis from a Stripe "Payments" export (or any CSV
// with a date, an amount, a status and a customer or invoice). Pure functions,
// no DOM, no network.

const ALIASES = {
  id: ["id", "payment id", "charge id", "payment_intent id", "payment_intent"],
  date: ["created (utc)", "created date (utc)", "created", "date (utc)", "date", "created_at", "timestamp"],
  amount: ["amount", "amount_usd", "gross", "total"],
  currency: ["currency"],
  status: ["status", "payment status"],
  customer: ["customer id", "customer", "customer_id", "customer email", "email", "card address name"],
  invoice: ["invoice id", "invoice", "invoice_id"],
  reason: ["decline reason", "failure code", "failure_code", "decline_code", "decline code", "outcome reason", "failure message", "reason"],
};

// What a person should do about a decline, which is the only reason to
// group them. Unknown codes are kept and reported as "unknown", never guessed.
export const CATEGORY_LABELS = {
  "update-card": "Card details are wrong or expired: ask for a new card",
  "retry-later": "Temporary decline: a later retry can succeed",
  "do-not-retry": "Issuer says stop: retrying can hurt your standing",
  unknown: "Reason missing or not recognised",
};
const CATEGORY = {
  expired_card: "update-card", incorrect_number: "update-card", invalid_number: "update-card", invalid_expiry_month: "update-card",
  invalid_expiry_year: "update-card", invalid_expiry_date: "update-card", incorrect_cvc: "update-card", invalid_cvc: "update-card",
  incorrect_zip: "update-card", card_not_supported: "update-card", currency_not_supported: "update-card", invalid_account: "update-card",
  insufficient_funds: "retry-later", generic_decline: "retry-later", do_not_honor: "retry-later", call_issuer: "retry-later",
  processing_error: "retry-later", try_again_later: "retry-later", issuer_not_available: "retry-later", card_velocity_exceeded: "retry-later",
  withdrawal_count_limit_exceeded: "retry-later", reenter_transaction: "retry-later", authentication_required: "retry-later",
  stolen_card: "do-not-retry", lost_card: "do-not-retry", pickup_card: "do-not-retry", fraudulent: "do-not-retry",
  restricted_card: "do-not-retry", security_violation: "do-not-retry", stop_payment_order: "do-not-retry",
  revocation_of_authorization: "do-not-retry", revocation_of_all_authorizations: "do-not-retry", merchant_blacklist: "do-not-retry",
  transaction_not_allowed: "do-not-retry", service_not_allowed: "do-not-retry",
};

export function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  const src = String(text ?? "").replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') { if (src[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows;
}

export function parseDate(value) {
  const s = String(value ?? "").trim();
  if (!s) return null;
  let iso = s;
  if (/^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2})?)?$/.test(s)) iso = s.replace(" ", "T") + (s.length > 10 ? "" : "T00:00:00") + "Z";
  else if (/^\d{9,10}$/.test(s)) return new Date(Number(s) * 1000);
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function normalizeReason(raw) {
  return String(raw ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}
export function categoryOf(reason) { return CATEGORY[reason] ?? "unknown"; }

function findColumns(header) {
  const norm = header.map((h) => h.trim().toLowerCase());
  const cols = {};
  for (const [field, names] of Object.entries(ALIASES)) {
    for (const n of names) {
      const at = norm.indexOf(n);
      if (at !== -1) { cols[field] = at; break; }
    }
  }
  return cols;
}

const OK = new Set(["succeeded", "paid", "success", "captured"]);
const FAIL = new Set(["failed", "declined", "past_due", "uncollectible"]);

// Returns { events, skipped, ignored, currency, otherCurrency, columns, error }
// where each event is { line, at: Date, amount, ok: boolean, key, customer, reason }.
export function normalizeRows(table) {
  if (!table.length) return { events: [], skipped: [], ignored: 0, columns: {}, error: "The file is empty." };
  const cols = findColumns(table[0]);
  if (cols.date === undefined) return { events: [], skipped: [], ignored: 0, columns: cols, error: "No date column found. Expected a header like “Created (UTC)”." };
  if (cols.amount === undefined) return { events: [], skipped: [], ignored: 0, columns: cols, error: "No amount column found. Expected a header like “Amount”." };
  if (cols.status === undefined) return { events: [], skipped: [], ignored: 0, columns: cols, error: "No status column found. Expected a header like “Status” with Succeeded/Failed values." };
  if (cols.customer === undefined && cols.invoice === undefined) return { events: [], skipped: [], ignored: 0, columns: cols, error: "No customer or invoice column found. One of them is needed to tie a retry to the payment that failed." };
  const skipped = [];
  let ignored = 0;
  const raw = [];
  for (let r = 1; r < table.length; r++) {
    const line = table[r];
    const get = (f) => (cols[f] === undefined ? "" : (line[cols[f]] ?? "").trim());
    const at = parseDate(get("date"));
    if (!at) { skipped.push({ line: r + 1, reason: "unreadable date" }); continue; }
    const amount = Number(get("amount").replace(/[$,€£\s]/g, ""));
    if (!Number.isFinite(amount) || get("amount") === "") { skipped.push({ line: r + 1, reason: "unreadable amount" }); continue; }
    const status = get("status").toLowerCase().replace(/\s+/g, "_");
    const ok = OK.has(status), fail = FAIL.has(status);
    if (!ok && !fail) { ignored++; continue; } // refunded, canceled, pending: not a charge outcome
    const customer = get("customer");
    const invoice = get("invoice");
    const key = invoice || customer;
    if (!key) { skipped.push({ line: r + 1, reason: "no customer or invoice on the row" }); continue; }
    raw.push({ line: r + 1, at, amount, ok, key, byInvoice: Boolean(invoice), customer: customer || invoice, reason: normalizeReason(get("reason")), currency: get("currency").toUpperCase() });
  }
  const tally = {};
  for (const e of raw) tally[e.currency || ""] = (tally[e.currency || ""] || 0) + 1;
  const currency = Object.entries(tally).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
  const events = raw.filter((e) => e.currency === currency);
  const otherCurrency = raw.length - events.length;
  return { events, skipped, ignored, currency, otherCurrency, columns: cols, error: events.length ? null : "No usable payment rows were found." };
}

const DAY = 86400000;

// A "case" starts at a failed charge and ends at the next successful charge
// for the same invoice (or customer when there is no invoice column). It is
// recovered if that success is inside the window, lost if the window closes
// first, and open if the file ends before the window does; open cases are
// left out of every rate rather than counted as lost.
export function buildCases(events, windowDays = 14) {
  const byKey = new Map();
  for (const e of events) {
    if (!byKey.has(e.key)) byKey.set(e.key, []);
    byKey.get(e.key).push(e);
  }
  const lastAt = Math.max(...events.map((e) => e.at.getTime()));
  const cases = [];
  for (const list of byKey.values()) {
    list.sort((a, b) => a.at - b.at);
    let open = null;
    const close = (status, at, rec) => {
      open.status = status;
      open.days = rec ? (rec.at - open.first) / DAY : null;
      if (rec) open.recoveredAmount = rec.amount;
      cases.push(open);
      open = null;
    };
    for (const e of list) {
      if (open && e.at.getTime() - open.first.getTime() > windowDays * DAY) close("lost", null, null);
      if (!e.ok) {
        if (!open) open = { customer: e.customer, first: e.at, amount: e.amount, reason: e.reason, attempts: 0, lastReason: e.reason };
        open.attempts++;
        open.lastReason = e.reason || open.lastReason;
        if (!open.reason) open.reason = e.reason;
      } else if (open) close("recovered", e.at, e);
    }
    if (open) close(lastAt - open.first.getTime() > windowDays * DAY ? "lost" : "open", null, null);
  }
  for (const c of cases) c.category = categoryOf(c.reason);
  return cases.sort((a, b) => a.first - b.first);
}

function bucket(cases) {
  const settled = cases.filter((c) => c.status !== "open");
  const rec = settled.filter((c) => c.status === "recovered");
  const lost = settled.filter((c) => c.status === "lost");
  const sum = (l) => l.reduce((t, c) => t + c.amount, 0);
  return { cases: settled.length, recovered: rec.length, lost: lost.length, atRisk: sum(settled), recoveredAmount: sum(rec), lostAmount: sum(lost), rate: settled.length ? rec.length / settled.length : null, amountRate: settled.length ? sum(rec) / sum(settled) : null };
}

export function analyze(events, { windowDays = 14, uplift = 0.1 } = {}) {
  if (!events.length) return { invalid: "No payments to analyze." };
  const cases = buildCases(events, windowDays);
  if (!cases.length) return { invalid: "No failed payments were found in this file, so there is nothing to recover. (Check that failed charges are included in the export.)" };
  const settled = cases.filter((c) => c.status !== "open");
  const openCount = cases.length - settled.length;
  const total = bucket(cases);
  const times = events.map((e) => e.at.getTime());
  const spanDays = Math.max(1, (Math.max(...times) - Math.min(...times)) / DAY);
  const perYear = 365 / spanDays;
  const groups = (fn) => {
    const m = new Map();
    for (const c of settled) { const k = fn(c); if (!m.has(k)) m.set(k, []); m.get(k).push(c); }
    return [...m.entries()].map(([key, list]) => ({ key, ...bucket(list) })).sort((a, b) => b.lostAmount - a.lostAmount || b.cases - a.cases);
  };
  const byReason = groups((c) => c.reason || "(none)");
  const byCategory = groups((c) => c.category);
  const recs = settled.filter((c) => c.status === "recovered");
  const within = (d) => (recs.length ? recs.filter((c) => c.days <= d).length / recs.length : null);
  const timing = { d1: within(1), d3: within(3), d7: within(7), median: recs.length ? [...recs].map((c) => c.days).sort((a, b) => a - b)[Math.floor(recs.length / 2)] : null };
  const byAttempts = groups((c) => (c.attempts >= 3 ? "3+" : String(c.attempts))).sort((a, b) => a.key.localeCompare(b.key));

  const months = new Map();
  for (const c of settled) {
    const k = `${c.first.getUTCFullYear()}-${String(c.first.getUTCMonth() + 1).padStart(2, "0")}`;
    if (!months.has(k)) months.set(k, []);
    months.get(k).push(c);
  }
  const byMonth = [...months.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([key, list]) => ({ key, ...bucket(list) }));

  const lostSorted = settled.filter((c) => c.status === "lost").sort((a, b) => b.amount - a.amount);
  const whatIf = { uplift, extraPerYear: total.atRisk * uplift * perYear, lostPerYear: total.lostAmount * perYear };
  const summary = { ...total, open: openCount, windowDays, spanDays, perYear, attempts: events.filter((e) => !e.ok).length, successes: events.filter((e) => e.ok).length, failRate: events.filter((e) => !e.ok).length / events.length, timing };

  const findings = [];
  const share = (cat) => { const b = byCategory.find((x) => x.key === cat); return b && total.lostAmount ? b.lostAmount / total.lostAmount : 0; };
  if (total.lost) findings.push({ severity: total.lostAmount / Math.max(1, total.atRisk) > 0.4 ? "high" : "medium", title: `${Math.round((1 - total.rate) * 100)}% of failed payments were never recovered`, detail: `${total.lost} of ${total.cases} settled failures produced no successful charge within ${windowDays} days, ${total.lostAmount.toFixed(2)} in total (about ${(total.lostAmount * perYear).toFixed(0)} a year at this pace). That is revenue from customers who were willing to pay, not customers who chose to leave.` });
  if (share("update-card") >= 0.15) findings.push({ severity: "high", title: `${Math.round(share("update-card") * 100)}% of lost revenue is a card that needs updating`, detail: "Expired, mistyped or unsupported cards do not fix themselves on retry. Turn on automatic card updates if your processor offers them, email the customer a link to update the card on the first failure rather than the last, and check the email arrives from a recognisable sender." });
  if (share("retry-later") >= 0.25) findings.push({ severity: "medium", title: `${Math.round(share("retry-later") * 100)}% of lost revenue was a temporary decline`, detail: "Insufficient funds and generic declines often clear within days. If your retry schedule stops early or retries at the same hour each time, spreading attempts across different days of the month (including just after typical paydays) is the cheapest experiment available." });
  if (share("do-not-retry") >= 0.05) findings.push({ severity: "info", title: `${Math.round(share("do-not-retry") * 100)}% of lost revenue carries a do-not-retry code`, detail: "Codes like stolen, lost or restricted card mean the issuer has closed the door. Repeated retries on these can raise your decline rate with the card networks. Ask for a different payment method instead." });
  if (timing.d1 !== null && recs.length >= 5 && timing.d3 < 0.6) findings.push({ severity: "medium", title: "Most recoveries take more than three days", detail: `Only ${Math.round(timing.d3 * 100)}% of recovered payments came back within 3 days (median ${timing.median.toFixed(1)}). A schedule that gives up before day 7 leaves money on the table.` });
  if (lostSorted.length >= 3 && total.lostAmount > 0) {
    const top3 = lostSorted.slice(0, 3).reduce((t, c) => t + c.amount, 0) / total.lostAmount;
    if (top3 >= 0.4) findings.push({ severity: "info", title: `Three customers are ${Math.round(top3 * 100)}% of the lost revenue`, detail: "A personal email to the largest failed payments is cheaper than tuning an automated schedule for them." });
  }
  const worstReason = byReason.find((r) => r.cases >= 5 && r.rate !== null && r.rate < total.rate - 0.25 && r.key !== "(none)");
  if (worstReason) findings.push({ severity: "info", title: `“${worstReason.key}” recovers far worse than average`, detail: `${Math.round(worstReason.rate * 100)}% recovered across ${worstReason.cases} cases, against ${Math.round(total.rate * 100)}% overall.` });
  if (byReason.length === 1 && byReason[0].key === "(none)") findings.push({ severity: "info", title: "The file has no decline reasons", detail: "Add the “Decline Reason” or “Failure Code” column to the export to see which failures are fixable and which are not." });
  if (openCount) findings.push({ severity: "info", title: `${openCount} recent failure(s) are still inside the ${windowDays}-day window`, detail: "They are left out of the recovery rate so a young failure is not counted as lost." });
  return { summary, cases, byReason, byCategory, byAttempts, byMonth, whatIf, findings, topLost: lostSorted.slice(0, 5) };
}

export function money(v) { return (v < 0 ? "-" : "") + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
export function pct(v) { return v === null || v === undefined ? "–" : `${(v * 100).toFixed(1)}%`; }

// Deterministic synthetic data so the example, the tests and the docs agree.
export function sampleCsv() {
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const lines = ["id,Created (UTC),Amount,Currency,Status,Customer ID,Invoice ID,Decline Reason"];
  const reasons = [["insufficient_funds", 0.42, 0.62], ["generic_decline", 0.2, 0.5], ["expired_card", 0.2, 0.12], ["do_not_honor", 0.1, 0.4], ["stolen_card", 0.08, 0.02]];
  const plans = [29, 29, 49, 49, 99, 249];
  const pad = (n) => String(n).padStart(2, "0");
  const at = (day, h) => { const d = new Date(Date.UTC(2026, 0, 1 + day, h)); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:00:00`; };
  let n = 0;
  for (let c = 1; c <= 260; c++) {
    const amount = plans[c % plans.length];
    const billDay = c % 28;
    for (let m = 0; m < 6; m++) {
      const day = m * 30 + billDay;
      const inv = `in_${c}_${m}`;
      const failed = rnd() < 0.09;
      if (!failed) { lines.push(`ch_${++n},${at(day, 9)},${amount}.00,USD,Succeeded,cus_${c},${inv},`); continue; }
      let pick = rnd(), reason = reasons[0];
      for (const r of reasons) { if (pick < r[1]) { reason = r; break; } pick -= r[1]; }
      lines.push(`ch_${++n},${at(day, 9)},${amount}.00,USD,Failed,cus_${c},${inv},${reason[0]}`);
      if (rnd() < reason[2]) {
        const wait = 1 + Math.floor(rnd() * 9);
        lines.push(`ch_${++n},${at(day + wait, 9)},${amount}.00,USD,Succeeded,cus_${c},${inv},`);
      } else if (rnd() < 0.5) lines.push(`ch_${++n},${at(day + 3, 9)},${amount}.00,USD,Failed,cus_${c},${inv},${reason[0]}`);
    }
  }
  return lines.join("\n");
}
