// Earnings and fee analysis from an Upwork-style transaction history CSV (columns
// like Date, Ref ID, Type, Description, Amount, and optionally Team/Client and
// Hours), or any freelancer-platform ledger with dated, typed, signed amounts.
// Pure functions, no DOM, no network. Column names are matched by alias because
// no real export was available when this was written; unread files are reported,
// never guessed at.

export function decodeBuffer(buf) {
  const u8 = new Uint8Array(buf);
  if (u8[0] === 0xff && u8[1] === 0xfe) return new TextDecoder("utf-16le").decode(u8);
  if (u8[0] === 0xfe && u8[1] === 0xff) return new TextDecoder("utf-16be").decode(u8);
  return new TextDecoder("utf-8").decode(u8);
}

export function detectDelimiter(text) {
  const head = String(text ?? "").split(/\r?\n/).filter((l) => l.trim()).slice(0, 8).join("\n");
  const n = (c) => head.split(c).length - 1;
  const best = [["\t", n("\t")], [";", n(";")], [",", n(",")]].sort((a, b) => b[1] - a[1])[0];
  return best[1] > 0 ? best[0] : ",";
}

export function parseCsv(text, delim = ",") {
  const rows = [];
  let row = [], field = "", quoted = false;
  const src = String(text ?? "").replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') { if (src[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === delim) { row.push(field); field = ""; }
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

// "1,234.56", "$12", "(5.00)", "-5" and blanks (0). NaN only for non-numbers.
export function parseNumber(v, decimalComma = false) {
  let s = String(v ?? "").trim();
  if (s === "" || /^[-–—\s]+$/.test(s)) return 0;
  const neg = /^\(.*\)$/.test(s) || /^[-−]/.test(s);
  s = s.replace(/[^0-9.,]/g, "");
  s = decimalComma ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  const n = Number(s);
  if (!s || !Number.isFinite(n)) return NaN;
  return neg ? -n : n;
}

// Durations: "23" (minutes), "1:05:30", "12:40" (mm:ss when it has two parts and
// the caller says so is ambiguous, so two parts are read as h:mm), "25 min",
export function parseWhen(v, dmy = false) {
  const s = String(v ?? "").trim();
  if (!s) return null;
  let y, mo, d, rest = "";
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(.*)$/);
  if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; rest = m[4]; }
  else {
    m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})(.*)$/);
    if (!m) return null;
    const a = +m[1], b = +m[2];
    y = +m[3]; if (y < 100) y += 2000;
    if (dmy) { d = a; mo = b; } else { mo = a; d = b; }
    rest = m[4];
  }
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  let hh = 0, mm = 0, hasTime = false;
  const tm = rest.match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*([ap]\.?m\.?)?/i);
  if (tm) {
    hh = +tm[1]; mm = +tm[2]; hasTime = true;
    const ap = tm[3] ? tm[3][0].toLowerCase() : "";
    if (ap === "p" && hh < 12) hh += 12;
    if (ap === "a" && hh === 12) hh = 0;
    if (hh > 23 || mm > 59) return null;
  }
  const t = Date.UTC(y, mo - 1, d, hh, mm);
  return new Date(t).getUTCDate() === d ? { t, hasTime } : null;
}

// Day-first only when unambiguous: some first part above 12, no second above 12.
export function detectDmy(values) {
  let first = false, second = false;
  for (const v of values) {
    const m = String(v ?? "").trim().match(/^(\d{1,2})[/.-](\d{1,2})[/.-]\d{2,4}/);
    if (!m) continue;
    if (+m[1] > 12) first = true;
    if (+m[2] > 12) second = true;
  }
  return first && !second;
}


const ALIASES = {
  when: ["date", "date/time", "datetime", "transaction date", "paid date", "posted", "timestamp"],
  ref: ["ref id", "reference id", "reference", "ref", "transaction id", "invoice id"],
  type: ["type", "transaction type", "category"],
  desc: ["description", "memo", "details", "note"],
  client: ["team", "client", "client name", "account name", "agency", "company"],
  amount: ["amount", "amount in local currency", "net amount", "total", "amount (usd)"],
  currency: ["currency"],
  hours: ["hours", "hours worked", "duration (hours)"],
};

function findColumns(header) {
  const norm = header.map((h) => h.trim().toLowerCase());
  const cols = {};
  for (const [field, names] of Object.entries(ALIASES)) {
    for (const n of names) {
      const at = norm.indexOf(n);
      if (at !== -1 && !Object.values(cols).includes(at)) { cols[field] = at; break; }
    }
  }
  return cols;
}

// Kinds: income (money earned), refund (money given back), fee-service,
// fee-connects, fee-membership, fee-withdrawal, fee-other, withdrawal (cash-out,
// not earnings, not a cost), other. Order matters: "withdrawal fee" must be
// tested before "withdrawal", and "refund" before the income words.
export function classify(type, desc) {
  const t = `${type} ${desc}`.toLowerCase();
  if (/withdraw\w*\s*fee|fee.*withdraw|instant pay fee|payout fee/.test(t)) return "fee-withdrawal";
  if (/connects?\b/.test(t)) return "fee-connects";
  if (/membership|freelancer plus|subscription/.test(t)) return "fee-membership";
  if (/service fee|marketplace fee|freelancer fee|contract fee/.test(t)) return "fee-service";
  if (/\bfee\b|processing|currency conversion|conversion fee/.test(t)) return "fee-other";
  if (/refund|reversal|chargeback|dispute/.test(t)) return "refund";
  if (/withdraw|payout|transfer|paypal|direct deposit|bank/.test(t)) return "withdrawal";
  if (/hourly|fixed|milestone|bonus|escrow|payment|earning|tip|guarantee|weekly/.test(t)) return "income";
  return "other";
}

const HOURS_RE = /(\d+(?:\.\d+)?)\s*(?:hrs?|hours?)\b/i;
const REF_RE = /ref(?:erence)?\s*(?:id)?\s*[:#]?\s*(\d{5,})/i;

// Contract label: the Team/Client column if the file has one, else the
// description with the type words, hours, amounts, dates and ref ids removed.
export function contractLabel(desc, client) {
  if (client && client.trim()) return client.trim();
  let s = String(desc ?? "");
  s = s.replace(REF_RE, "").replace(/\d+(?:\.\d+)?\s*(?:hrs?|hours?)\b/gi, "").replace(/@\s*\$?[\d.,]+\s*\/?\s*(?:hr|hour)?/gi, "");
  s = s.replace(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b|\b\d{4}-\d{2}-\d{2}\b/g, "");
  s = s.replace(/^\s*(?:hourly|fixed[- ]price|fixed|milestone|bonus|service fee|payment|escrow release|weekly)\b[\s:\-–—]*/i, "");
  s = s.replace(/^\s*(?:for|-|–|—|:)\s*/i, "").replace(/[\s:\-–—(),]+$/g, "").replace(/\s+/g, " ").trim();
  return s.slice(0, 80) || "(no contract name)";
}

// Returns { rows, skipped, currency, dmy, columns, error }. A row is
// { line, t, ref, kind, amount (signed as in the file), desc, contract, hours }.
export function normalizeRows(table, { decimalComma = false } = {}) {
  let h = -1;
  for (let i = 0; i < Math.min(table.length, 15); i++) {
    const c = findColumns(table[i]);
    if (c.when !== undefined && c.amount !== undefined) { h = i; break; }
  }
  if (h === -1) return { error: "Could not find a header row with a Date column and an Amount column. Export the transaction history, or add a header such as: Date,Type,Description,Amount." };
  const cols = findColumns(table[h]);
  const body = table.slice(h + 1);
  const dmy = detectDmy(body.map((r) => r[cols.when]));
  const rows = [], skipped = [];
  const currencies = new Set();
  body.forEach((r, k) => {
    const line = h + k + 2;
    const cell = (f) => (cols[f] === undefined ? "" : String(r[cols[f]] ?? "").trim());
    if (/^(total|balance|subtotal)/i.test(cell("when")) || /^(total|subtotal)\b/i.test(cell("desc"))) return;
    const when = parseWhen(cell("when"), dmy);
    if (!when) { skipped.push({ line, reason: "unreadable date" }); return; }
    const amount = parseNumber(cell("amount"), decimalComma);
    if (!Number.isFinite(amount)) { skipped.push({ line, reason: "unreadable amount" }); return; }
    const desc = cell("desc"), type = cell("type");
    const kind = classify(type, desc);
    const hoursCell = cell("hours");
    let hours = hoursCell ? parseNumber(hoursCell) : NaN;
    if (!Number.isFinite(hours) || hours <= 0) { const m = desc.match(HOURS_RE); hours = m ? Number(m[1]) : NaN; }
    const refCell = cell("ref");
    const ref = refCell || (desc.match(REF_RE) || [])[1] || "";
    if (cell("currency")) currencies.add(cell("currency").toUpperCase());
    rows.push({ line, t: when.t, ref, kind, amount, desc, type, contract: contractLabel(desc, cell("client")), hours: Number.isFinite(hours) && hours > 0 ? hours : null });
  });
  if (!rows.length) return { error: "No transaction rows could be read.", skipped };
  return { rows, skipped, dmy, columns: cols, currency: currencies.size === 1 ? [...currencies][0] : null, mixedCurrency: currencies.size > 1 };
}

const r2 = (n) => Math.round(n * 100) / 100;
const monthKey = (t) => new Date(t).toISOString().slice(0, 7);

// Fees name the income row they were charged on through a shared ref id. When
// the file has no usable refs, a service fee is attributed to the income row
// with the same date and contract; failing that it stays unattributed, and the
// report says how much did.
export function analyze(rows, opts = {}) {
  const targetHourly = Number(opts.targetHourly) > 0 ? Number(opts.targetHourly) : null;
  const from = opts.from ?? null, to = opts.to ?? null;
  const used = rows.filter((r) => (from === null || r.t >= from) && (to === null || r.t < to + 86400000));
  if (!used.length) return { invalid: "No rows fall inside that date range." };
  const sum = (kinds, f = (r) => r) => used.filter((r) => kinds.includes(r.kind)).reduce((a, r) => a + Math.abs(f(r).amount), 0);
  const income = used.filter((r) => r.kind === "income" && r.amount > 0);
  const refunds = used.filter((r) => r.kind === "refund");
  const gross = income.reduce((a, r) => a + r.amount, 0);
  const refundTotal = refunds.reduce((a, r) => a + Math.abs(r.amount), 0);
  const fees = {
    service: sum(["fee-service"]), connects: sum(["fee-connects"]), membership: sum(["fee-membership"]),
    withdrawal: sum(["fee-withdrawal"]), other: sum(["fee-other"]),
  };
  const feeTotal = Object.values(fees).reduce((a, b) => a + b, 0);
  const net = gross - refundTotal - feeTotal;
  const withdrawals = used.filter((r) => r.kind === "withdrawal");
  const withdrawnTotal = withdrawals.reduce((a, r) => a + Math.abs(r.amount), 0);

  // Per contract.
  const byRef = new Map();
  for (const r of income) if (r.ref) byRef.set(r.ref, r);
  const contracts = new Map();
  const get = (label) => { if (!contracts.has(label)) contracts.set(label, { label, gross: 0, serviceFee: 0, refunds: 0, hours: 0, hourlyGross: 0, payments: 0 }); return contracts.get(label); };
  for (const r of income) {
    const c = get(r.contract);
    c.gross += r.amount; c.payments += 1;
    if (r.hours) { c.hours += r.hours; c.hourlyGross += r.amount; }
  }
  let unattributed = 0;
  for (const r of used.filter((x) => x.kind === "fee-service")) {
    const parent = (r.ref && byRef.get(r.ref)) || income.find((i) => i.t === r.t && i.contract === r.contract);
    if (parent) get(parent.contract).serviceFee += Math.abs(r.amount);
    else unattributed += Math.abs(r.amount);
  }
  for (const r of refunds) { const c = contracts.get(r.contract); if (c) c.refunds += Math.abs(r.amount); }
  const byContract = [...contracts.values()].map((c) => {
    const netC = c.gross - c.serviceFee - c.refunds;
    const hourNet = c.hours > 0 ? (c.hourlyGross - c.serviceFee * (c.hourlyGross / c.gross)) / c.hours : null;
    return { ...c, net: netC, feeRate: c.gross > 0 ? c.serviceFee / c.gross : null, netPerHour: hourNet, grossPerHour: c.hours > 0 ? c.hourlyGross / c.hours : null };
  }).sort((a, b) => b.gross - a.gross);

  // Per month.
  const months = new Map();
  const mo = (t) => { const k = monthKey(t); if (!months.has(k)) months.set(k, { month: k, gross: 0, fees: 0, refunds: 0 }); return months.get(k); };
  for (const r of income) mo(r.t).gross += r.amount;
  for (const r of used) { if (r.kind.startsWith("fee-")) mo(r.t).fees += Math.abs(r.amount); else if (r.kind === "refund") mo(r.t).refunds += Math.abs(r.amount); }
  const byMonth = [...months.values()].sort((a, b) => a.month.localeCompare(b.month)).map((m) => ({ ...m, net: m.gross - m.fees - m.refunds }));

  const hourlyHours = byContract.reduce((a, c) => a + c.hours, 0);
  const hourlyGross = byContract.reduce((a, c) => a + c.hourlyGross, 0);
  const hourlyFees = byContract.reduce((a, c) => a + (c.gross > 0 ? c.serviceFee * (c.hourlyGross / c.gross) : 0), 0);
  const summary = {
    rows: used.length, from: Math.min(...used.map((r) => r.t)), to: Math.max(...used.map((r) => r.t)),
    gross: r2(gross), refunds: r2(refundTotal), fees: Object.fromEntries(Object.entries(fees).map(([k, v]) => [k, r2(v)])),
    feeTotal: r2(feeTotal), net: r2(net), keepRate: gross > 0 ? net / gross : null,
    serviceFeeRate: gross > 0 ? fees.service / gross : null,
    overheadRate: gross > 0 ? (fees.connects + fees.membership + fees.withdrawal + fees.other) / gross : null,
    withdrawals: withdrawals.length, withdrawn: r2(withdrawnTotal), unattributedServiceFee: r2(unattributed),
    hours: r2(hourlyHours), grossPerHour: hourlyHours > 0 ? hourlyGross / hourlyHours : null,
    netPerHour: hourlyHours > 0 ? (hourlyGross - hourlyFees) / hourlyHours : null,
  };

  // Findings, each with a plain claim and the numbers behind it.
  const findings = [];
  const pc = (x) => (x * 100).toFixed(1) + "%";
  if (summary.serviceFeeRate !== null && fees.service > 0) {
    findings.push({ severity: "info", title: `Your observed platform fee is ${pc(summary.serviceFeeRate)} of earnings`, detail: `${fmt(fees.service)} in service fees on ${fmt(gross)} earned. Compare the per-contract rates below: contracts started under older fee schedules can carry a different rate than new ones, and this figure is what your file shows, not what any schedule promises.` });
  }
  if (summary.overheadRate !== null && summary.overheadRate >= 0.03) {
    findings.push({ severity: summary.overheadRate >= 0.08 ? "high" : "medium", title: `Costs outside the service fee take ${pc(summary.overheadRate)} of earnings`, detail: `Connects ${fmt(fees.connects)}, membership ${fmt(fees.membership)}, withdrawal fees ${fmt(fees.withdrawal)}, other fees ${fmt(fees.other)}. Connects and membership are the price of finding work, so weigh them against the ${fmt(gross)} the period earned.` });
  }
  if (fees.connects > 0 && gross > 0) {
    const wonContracts = byContract.filter((c) => c.gross > 0).length;
    if (wonContracts > 0) findings.push({ severity: "info", title: `Connects cost about ${fmt(fees.connects / wonContracts)} per paying contract`, detail: `${fmt(fees.connects)} spent across ${wonContracts} contract(s) that paid in this file. This is an average, not a per-proposal conversion rate: the file does not show proposals that got no reply.` });
  }
  if (withdrawals.length >= 3 && fees.withdrawal > 0 && withdrawnTotal > 0 && fees.withdrawal / withdrawnTotal > 0.01) {
    findings.push({ severity: "medium", title: `Withdrawal fees are ${pc(fees.withdrawal / withdrawnTotal)} of what you cashed out`, detail: `${withdrawals.length} withdrawals moved ${fmt(withdrawnTotal)} and cost ${fmt(fees.withdrawal)} in fees. Fewer, larger withdrawals usually cost less if the method charges a flat amount per transfer.` });
  }
  const top = byContract[0];
  if (top && gross > 0 && byContract.length > 1 && top.gross / gross >= 0.5) {
    findings.push({ severity: "medium", title: `One contract is ${pc(top.gross / gross)} of your earnings`, detail: `"${top.label}" paid ${fmt(top.gross)} of ${fmt(gross)}. If it ends, most of this income goes with it.` });
  }
  if (targetHourly) {
    const low = byContract.filter((c) => c.netPerHour !== null && c.hours >= 5 && c.netPerHour < targetHourly);
    for (const c of low.slice(0, 5)) findings.push({ severity: "high", title: `"${c.label}" nets ${fmt(c.netPerHour)} per hour, under your ${fmt(targetHourly)} target`, detail: `${c.hours.toFixed(1)} hours billed at ${fmt(c.grossPerHour)} gross per hour before the service fee. Hours the platform did not record, such as unbilled prep or messaging, would lower it further.` });
  }
  if (refundTotal > 0) findings.push({ severity: refundTotal / Math.max(gross, 1) >= 0.05 ? "high" : "info", title: `${fmt(refundTotal)} was refunded or reversed`, detail: `${refunds.length} refund or reversal row(s), ${pc(refundTotal / Math.max(gross, 1))} of earnings. The service fee on a refunded payment may or may not be returned; the file shows only what it shows.` });
  if (unattributed > 0) findings.push({ severity: "info", title: `${fmt(unattributed)} of service fees could not be matched to a payment`, detail: "These fees are in the totals but not in any contract row, because no shared reference id or same-day payment was found." });
  if (hourlyHours === 0) findings.push({ severity: "info", title: "No hours were found, so per-hour rates are not shown", detail: "Add an Hours column, or export the report that lists hours in the description (for example \"Hourly: 12.5 hrs\")." });

  return { summary, byContract, byMonth, findings };
}

export const money = (n) => (Number.isFinite(n) ? (n < 0 ? "-" : "") + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "–");
export const pct = (n) => (Number.isFinite(n) ? (n * 100).toFixed(1) + "%" : "–");
export const dateStr = (t) => new Date(t).toISOString().slice(0, 10);
const fmt = (n) => "$" + money(n);

export function sampleCsv() {
  return [
    "Date,Ref ID,Type,Description,Team,Amount,Currency",
    "2026-06-05,1000001,Hourly,Hourly: 20.0 hrs @ $45.00,Acme Analytics,900.00,USD",
    "2026-06-05,1000001,Service Fee,Service Fee - Ref ID 1000001,Acme Analytics,-90.00,USD",
    "2026-06-12,1000002,Hourly,Hourly: 18.5 hrs @ $45.00,Acme Analytics,832.50,USD",
    "2026-06-12,1000002,Service Fee,Service Fee - Ref ID 1000002,Acme Analytics,-83.25,USD",
    "2026-06-14,1000003,Connects,Connects purchase (80),,-12.00,USD",
    "2026-06-20,1000004,Fixed Price,Milestone: landing page copy,Brightside Studio,400.00,USD",
    "2026-06-20,1000004,Service Fee,Service Fee - Ref ID 1000004,Brightside Studio,-40.00,USD",
    "2026-06-25,1000005,Withdrawal,Withdrawal to bank,,-1500.00,USD",
    "2026-06-25,1000006,Withdrawal Fee,Withdrawal fee,,-2.00,USD",
    "2026-07-03,1000007,Hourly,Hourly: 30.0 hrs @ $22.00,Northwind Support,660.00,USD",
    "2026-07-03,1000007,Service Fee,Service Fee - Ref ID 1000007,Northwind Support,-66.00,USD",
    "2026-07-08,1000008,Membership,Freelancer Plus membership,,-14.99,USD",
    "2026-07-10,1000009,Connects,Connects purchase (80),,-12.00,USD",
    "2026-07-17,1000010,Hourly,Hourly: 25.0 hrs @ $22.00,Northwind Support,550.00,USD",
    "2026-07-17,1000010,Service Fee,Service Fee - Ref ID 1000010,Northwind Support,-55.00,USD",
    "2026-07-18,1000011,Refund,Refund - milestone dispute,Brightside Studio,-100.00,USD",
    "2026-07-28,1000012,Withdrawal,Withdrawal to bank,,-1200.00,USD",
    "2026-07-28,1000013,Withdrawal Fee,Withdrawal fee,,-2.00,USD",
  ].join("\n");
}
