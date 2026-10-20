// Client trust account (IOLTA) three-way reconciliation. Pure functions, money
// in integer cents, dates as calendar days (UTC). Nothing here knows any one
// jurisdiction's rule: it checks the arithmetic every trust-accounting regime
// (ABA Model Rule 1.15 and its state variants) is built on, and names what it
// leaves to the lawyer and the local bar.
//
// The three balances:
//   1. bank  - statement ending balance, adjusted for deposits in transit and
//              outstanding disbursements (the transactions not yet cleared);
//   2. book  - the trust journal total (every transaction, cleared or not);
//   3. ledgers - the sum of the individual client ledger balances.
// They must agree to the cent. Separately, no client's ledger may ever go
// negative: that is another client's money paid out.

const DAY = 86400000;

export const VERIFY = "Verify against your jurisdiction's trust accounting rule and your bar's guidance. This checks the arithmetic, not your compliance.";
export const STALE_DISBURSEMENT_DAYS = 90;
export const DEPOSIT_TRANSIT_DAYS = 10;
export const DORMANT_DAYS = 365;
const FIRM_NAMES = /^(firm|law firm|operating|attorney|attorneys|lawyer|fees?|earned fees?|office)$/i;

export function toDay(text) {
  const s = String(text || "").trim();
  let y, m, d;
  let x = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (x) [y, m, d] = [+x[1], +x[2], +x[3]];
  else if ((x = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s))) [m, d, y] = [+x[1], +x[2], +x[3]];
  else return null;
  const t = Date.UTC(y, m - 1, d);
  const dt = new Date(t);
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return t / DAY;
}
export const fromDay = (n) => new Date(n * DAY).toISOString().slice(0, 10);

// "$1,234.50", "(200.00)", "-200", "1 234,50" is not supported on purpose.
export function parseCents(text) {
  let s = String(text ?? "").trim();
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  s = s.replace(/[$,\s]/g, "");
  if (s.startsWith("-")) { neg = !neg; s = s.slice(1); }
  else if (s.startsWith("+")) s = s.slice(1);
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [w, f = ""] = s.split(".");
  const c = Number(w) * 100 + Number((f + "00").slice(0, 2));
  return neg ? -c : c;
}
export function money(cents) {
  const neg = cents < 0;
  const a = Math.abs(cents);
  const s = "$" + Math.floor(a / 100).toLocaleString("en-US") + "." + String(a % 100).padStart(2, "0");
  return neg ? "-" + s : s;
}

// Small CSV reader: quotes, escaped quotes, commas or tabs.
export function parseTable(text) {
  const src = String(text || "").replace(/^﻿/, "");
  const first = src.split(/\r?\n/).find((l) => l.trim()) || "";
  const delim = first.includes("\t") ? "\t" : ",";
  const rows = [];
  let row = [], cell = "", q = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (q) {
      if (ch === '"') { if (src[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((c) => c.trim())) rows.push(row.map((c) => c.trim()));
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim())) rows.push(row.map((c) => c.trim()));
  return rows;
}

const HEADERS = {
  date: /^(date|trans(action)? date|posted)$/i,
  client: /^(client|matter|client\/matter|client name|ledger)$/i,
  desc: /^(description|memo|payee|payor|payee\/payor|details|reference|check ?(no|#)?)$/i,
  amount: /^(amount|amt)$/i,
  cleared: /^(cleared|status|reconciled|cleared\?)$/i,
};
const CLEARED_YES = /^(y|yes|true|1|x|c|cleared|reconciled)$/i;

export function parseTransactions(text) {
  const errors = [];
  const rows = parseTable(text);
  if (!rows.length) return { txns: [], errors: ["Paste the trust journal: date, client, description, amount, cleared."], hasCleared: false };
  let map = { date: 0, client: 1, desc: 2, amount: 3, cleared: 4 };
  let start = 0;
  if (toDay(rows[0][0]) === null) {
    start = 1;
    map = {};
    rows[0].forEach((h, i) => { for (const k of Object.keys(HEADERS)) if (map[k] === undefined && HEADERS[k].test(h)) map[k] = i; });
    for (const need of ["date", "client", "amount"]) if (map[need] === undefined) errors.push(`The header row has no "${need}" column.`);
    if (errors.length) return { txns: [], errors, hasCleared: false };
  }
  const hasCleared = map.cleared !== undefined && rows.slice(start).some((r) => r[map.cleared] !== undefined && r[map.cleared] !== "");
  const txns = [];
  rows.slice(start).forEach((r, i) => {
    const line = i + start + 1;
    const day = toDay(r[map.date]);
    const cents = parseCents(r[map.amount]);
    if (day === null) errors.push(`Row ${line}: "${r[map.date] ?? ""}" is not a date (use YYYY-MM-DD or MM/DD/YYYY).`);
    else if (cents === null) errors.push(`Row ${line}: "${r[map.amount] ?? ""}" is not an amount.`);
    else txns.push({ line, day, client: (r[map.client] || "").trim(), desc: map.desc === undefined ? "" : (r[map.desc] || ""), cents, cleared: hasCleared ? CLEARED_YES.test(r[map.cleared] || "") : true });
  });
  if (!txns.length && !errors.length) errors.push("No transactions found.");
  return { txns, errors, hasCleared };
}

export function parseClientBalances(text) {
  const out = new Map();
  const errors = [];
  const rows = parseTable(text);
  rows.forEach((r, i) => {
    if (i === 0 && parseCents(r[1]) === null) return; // header
    const c = parseCents(r[1]);
    if (!r[0] || c === null) errors.push(`Client balance row ${i + 1}: expected "client, balance".`);
    else out.set(r[0].toLowerCase(), { name: r[0], cents: (out.get(r[0].toLowerCase())?.cents || 0) + c });
  });
  return { balances: out, errors };
}

function hint(diff, txns) {
  const out = [];
  const hit = txns.filter((t) => Math.abs(t.cents) === Math.abs(diff));
  if (hit.length) out.push(`A single entry equals the difference: ${hit.slice(0, 3).map((t) => `row ${t.line} (${t.client || "no client"}, ${money(t.cents)})`).join("; ")}. Check it was not entered twice, left off the bank side, or posted with the wrong sign.`);
  const half = txns.filter((t) => Math.abs(t.cents) * 2 === Math.abs(diff));
  if (half.length) out.push(`The difference is exactly twice row ${half[0].line} (${money(half[0].cents)}): a deposit entered as a disbursement (or the reverse) produces this.`);
  if (Math.abs(diff) % 900 === 0 && Math.abs(diff) >= 900) out.push("The difference is divisible by 9, a classic sign of two transposed digits in one amount.");
  return out;
}

export function reconcile(input) {
  const errors = [];
  const { txns, errors: txErrors, hasCleared } = parseTransactions(input.transactions);
  errors.push(...txErrors);
  const bank = parseCents(input.bankBalance);
  if (bank === null) errors.push("Enter the bank statement ending balance, for example 12,450.00.");
  const asOf = toDay(input.statementDate);
  if (asOf === null) errors.push("Enter the statement date as YYYY-MM-DD.");
  let provided = null;
  if (String(input.clientBalances || "").trim()) {
    const p = parseClientBalances(input.clientBalances);
    errors.push(...p.errors);
    provided = p.balances;
  }
  if (errors.length) return { errors };

  const staleDays = Number(input.staleDays) > 0 ? Number(input.staleDays) : STALE_DISBURSEMENT_DAYS;
  const findings = [];
  const add = (severity, title, detail = "") => findings.push({ severity, title, detail });

  // Per-client ledgers, chronological (stable on input order).
  const byClient = new Map();
  // Same day: deposits post before disbursements, so a client is not shown negative for a same-day order of entry.
  const ordered = [...txns].sort((a, b) => a.day - b.day || (b.cents > 0) - (a.cents > 0) || a.line - b.line);
  for (const t of ordered) {
    const key = t.client.toLowerCase();
    if (!byClient.has(key)) byClient.set(key, { name: t.client || "(no client)", book: 0, cleared: 0, min: 0, minDay: null, firstNeg: null, last: t.day, n: 0 });
    const c = byClient.get(key);
    c.book += t.cents; c.n++; c.last = Math.max(c.last, t.day);
    if (t.cleared) c.cleared += t.cents;
    if (c.book < c.min) { c.min = c.book; c.minDay = t.day; }
    if (c.book < 0 && c.firstNeg === null) c.firstNeg = t.day;
  }
  const clients = [...byClient.values()].sort((a, b) => a.name.localeCompare(b.name));

  const book = txns.reduce((s, t) => s + t.cents, 0);
  const clearedSum = txns.filter((t) => t.cleared).reduce((s, t) => s + t.cents, 0);
  const uncleared = txns.filter((t) => !t.cleared);
  const dit = uncleared.filter((t) => t.cents > 0).reduce((s, t) => s + t.cents, 0);
  const outstanding = uncleared.filter((t) => t.cents < 0).reduce((s, t) => s + t.cents, 0);
  const bankAdjusted = bank + dit + outstanding;
  const ledgerTotal = provided ? [...provided.values()].reduce((s, v) => s + v.cents, 0) : clients.reduce((s, c) => s + c.book, 0);
  const diffBank = bankAdjusted - book;
  const diffLedger = ledgerTotal - book;
  const balanced = diffBank === 0 && diffLedger === 0;

  if (diffBank !== 0) {
    add("high", `Bank (adjusted) and trust journal differ by ${money(Math.abs(diffBank))}`, `Adjusted bank ${money(bankAdjusted)} vs journal ${money(book)}. ` + (diffBank > 0 ? "The bank holds more than the journal records: look for a deposit missing from the journal or a disbursement entered twice. " : "The journal records more than the bank holds: look for a disbursement missing from the journal, a deposit entered twice, or bank charges not booked. ") + hint(diffBank, txns).join(" "));
  }
  if (diffLedger !== 0) {
    add("high", `Client ledgers and trust journal differ by ${money(Math.abs(diffLedger))}`, `Client ledgers total ${money(ledgerTotal)} vs journal ${money(book)}. Posted to the journal but not to a client ledger (or the reverse)?`);
  }
  if (provided) {
    const seen = new Set();
    for (const c of clients) {
      seen.add(c.name.toLowerCase());
      const p = provided.get(c.name.toLowerCase());
      if (!p) add("high", `Client "${c.name}" has transactions but no balance on your client ledger list`, `The journal gives ${money(c.book)}.`);
      else if (p.cents !== c.book) add("high", `Client "${c.name}": ledger ${money(p.cents)} but journal transactions give ${money(c.book)}`, `Difference ${money(p.cents - c.book)}.`);
    }
    for (const [k, p] of provided) if (!seen.has(k)) add(p.cents === 0 ? "info" : "high", `Client "${p.name}" is on your ledger list (${money(p.cents)}) with no transactions in this journal`, "");
  }

  for (const c of clients) {
    if (c.name === "(no client)") {
      add("high", `${c.n} transaction(s) have no client or matter`, `Net ${money(c.book)}. Every trust dollar must be traceable to a client.`);
      continue;
    }
    if (c.min < 0) {
      add("high", `Client "${c.name}" went negative on ${fromDay(c.minDay)} (low point ${money(c.min)})${c.book < 0 ? ", and is still negative" : ""}`, "A negative client ledger means another client's money was used. Rules in most jurisdictions require immediate correction and sometimes a report.");
    } else if (c.cleared < 0) {
      add("high", `Client "${c.name}": cleared disbursements exceed cleared deposits by ${money(-c.cleared)}`, "Funds were paid out before the matching deposit cleared the bank, so other clients' money covered it.");
    }
    if (FIRM_NAMES.test(c.name) && c.book > 0) add("high", `${money(c.book)} of firm money is sitting in trust under "${c.name}"`, "Earned fees and firm money left in a trust account are commingling. The usual exception is a small amount to cover bank charges.");
    else if (c.book > 0 && asOf - c.last > DORMANT_DAYS) add("medium", `Client "${c.name}" has had no activity since ${fromDay(c.last)} but still holds ${money(c.book)}`, "Dormant balances usually need to be refunded, or reported as unclaimed property under your state's rules.");
  }

  for (const t of uncleared) {
    const age = asOf - t.day;
    if (t.cents < 0 && age > staleDays) add("medium", `Outstanding disbursement of ${money(-t.cents)} (${t.desc || "no description"}) for "${t.client}" is ${age} days old (row ${t.line})`, "Stale checks tie up client money. Contact the payee and consider reissuing.");
    if (t.cents > 0 && age > DEPOSIT_TRANSIT_DAYS) add("medium", `Deposit in transit of ${money(t.cents)} for "${t.client}" is ${age} days old (row ${t.line})`, "A real deposit normally clears in days. Confirm it was ever banked.");
    if (t.day > asOf) add("info", `Uncleared row ${t.line} is dated after the statement date`, "Fine for reconciliation: it is outside this statement.");
  }
  for (const t of txns) if (t.cleared && t.day > asOf) add("medium", `Row ${t.line} is marked cleared but dated ${fromDay(t.day)}, after the statement date ${fromDay(asOf)}`, "It cannot be on this statement.");
  const seenDup = new Map();
  for (const t of txns) {
    const k = [t.day, t.client.toLowerCase(), t.cents, t.desc.toLowerCase()].join("|");
    if (seenDup.has(k)) add("medium", `Rows ${seenDup.get(k)} and ${t.line} look identical (${fromDay(t.day)}, ${t.client || "no client"}, ${money(t.cents)})`, "A duplicate entry is the commonest cause of a small difference.");
    else seenDup.set(k, t.line);
  }
  if (!hasCleared) add("info", "No cleared column found, so every row was treated as cleared", "Add a cleared column (yes/no) to get deposits in transit, outstanding items and the cleared-funds test.");
  if (balanced && !findings.some((f) => f.severity === "high")) add("info", "The three balances agree and no client ledger went negative", VERIFY);

  const order = { high: 0, medium: 1, info: 2 };
  findings.sort((a, b) => order[a.severity] - order[b.severity]);
  return {
    errors: [], asOf, bank, dit, outstanding, bankAdjusted, book, ledgerTotal, clearedSum,
    diffBank, diffLedger, balanced, clients, findings, uncleared,
    providedLedger: Boolean(provided), counts: { high: findings.filter((f) => f.severity === "high").length, medium: findings.filter((f) => f.severity === "medium").length },
  };
}

export function summaryText(r) {
  const L = [];
  L.push(`THREE-WAY RECONCILIATION as of ${fromDay(r.asOf)}`);
  L.push("");
  L.push(`Bank statement ending balance      ${money(r.bank).padStart(14)}`);
  L.push(`  + deposits in transit            ${money(r.dit).padStart(14)}`);
  L.push(`  - outstanding disbursements      ${money(r.outstanding).padStart(14)}`);
  L.push(`1. Adjusted bank balance           ${money(r.bankAdjusted).padStart(14)}`);
  L.push(`2. Trust journal (book) balance    ${money(r.book).padStart(14)}`);
  L.push(`3. Sum of client ledgers${r.providedLedger ? "           " : " (derived)"}${money(r.ledgerTotal).padStart(r.providedLedger ? 14 : 5)}`);
  L.push("");
  L.push(r.balanced ? "RESULT: the three balances agree." : `RESULT: DOES NOT BALANCE (bank vs journal ${money(r.diffBank)}, ledgers vs journal ${money(r.diffLedger)}).`);
  L.push("");
  L.push("Client ledgers");
  for (const c of r.clients) L.push(`  ${c.name.padEnd(28)} ${money(c.book).padStart(14)}`);
  L.push("");
  L.push("Findings");
  for (const f of r.findings) L.push(`  [${f.severity.toUpperCase()}] ${f.title}${f.detail ? "\n         " + f.detail : ""}`);
  L.push("");
  L.push("Prepared by a free browser tool. Not legal or accounting advice and no warranty. " + VERIFY);
  return L.join("\n");
}

export const SAMPLE = {
  transactions: `date,client,description,amount,cleared
2026-08-03,Alvarez (retainer),Wire from client,5000.00,yes
2026-08-05,Brooks estate,Settlement check #4411,12000.00,yes
2026-08-10,Alvarez (retainer),Check 1001 filing fees,-650.00,yes
2026-08-12,Chen v. Dole,Retainer,2500.00,yes
2026-08-14,Chen v. Dole,Check 1002 expert,-2900.00,yes
2026-08-18,Brooks estate,Check 1003 beneficiary,-4000.00,yes
2026-08-20,Firm,Earned fee left in account,350.00,yes
2026-08-24,Okafor,Retainer,3000.00,no
2026-08-26,Brooks estate,Check 1004 court costs,-1200.00,no
2026-04-02,Patel,Check 0950 appraisal,-480.00,no
2026-04-02,Patel,Retainer,480.00,yes
2025-06-15,Nguyen,Refund pending,220.00,yes`,
  bankBalance: "13,650.00",
  statementDate: "2026-08-31",
  staleDays: "90",
  clientBalances: `client,balance
Alvarez (retainer),4350.00
Brooks estate,6800.00
Chen v. Dole,-400.00
Firm,350.00
Okafor,3000.00
Patel,0
Nguyen,220.00`,
};
