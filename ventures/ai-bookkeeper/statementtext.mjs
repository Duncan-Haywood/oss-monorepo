// Statement text copied out of a PDF (or a bank's web page): one transaction
// per line, a date first and an amount last, sometimes followed by a running
// balance. Most banks give small businesses a PDF and nothing else, so this is
// the way in for them. Returns the same shape as the CSV path. It reads text,
// not the PDF file: open the PDF, select all, copy, paste.
//
// Direction of an amount, in order of trust: a sign, parentheses or CR/DR on
// the amount itself; the running balance's change from the row before; the
// section heading above it ("Deposits", "Withdrawals", "Purchases", "Payments
// and credits"). If none of those exist the row is read as money out and the
// run says so. Card statements follow the account's own convention (a purchase
// is negative, a payment is positive), like OFX.
import { parseDate, parseCents } from "./bank.mjs";

const MON = "(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\.?";
const DATE_AT_START = new RegExp(
  `^(\\d{4}-\\d{2}-\\d{2}|\\d{1,2}[/.-]\\d{1,2}[/.-]\\d{2,4}|\\d{1,2}/\\d{1,2}|\\d{1,2} ${MON}(?: \\d{4})?|${MON} \\d{1,2}(?:,? \\d{4})?)(?=\\s|$)`, "i");
const AMOUNT = /^[-(−]?\$?\s?\d{1,3}(?:,\d{3})*\.\d{2}\)?-?(?:\s?(?:CR|DR))?$|^[-(−]?\$?\s?\d+\.\d{2}\)?-?(?:\s?(?:CR|DR))?$/i;
const AMOUNT_DC = /^[-(−]?\$?\s?\d{1,3}(?:\.\d{3})*,\d{2}\)?-?(?:\s?(?:CR|DR))?$|^[-(−]?\$?\s?\d+,\d{2}\)?-?(?:\s?(?:CR|DR))?$/i;
const IN_HEAD = /\b(deposits?|credits?|payments? (?:and|&) (?:other )?credits|additions|payments? received|money in|received)\b/i;
const OUT_HEAD = /\b(withdrawals?|debits?|purchases?|checks? paid|checks?|fees?|charges|subtractions|payments? (?:and|&) (?:other )?debits|money out|electronic payments?|other withdrawals)\b/i;
const NOISE = /^(page \d|continued|statement (?:period|date)|account (?:number|summary)|customer service|member fdic|date\s+description|total\b|subtotal)/i;
const CARD_CUE = /\b(credit limit|minimum payment|payment due date|card(?:member| ending| account| number)|credit card|rewards card|new balance)\b/i;
const BALANCE_LINE = /^(beginning|opening|previous|starting|ending|closing|balance)\b.*balance|^balance (?:forward|brought forward|carried forward)/i;

function splitTail(line, dc) {
  const tok = line.trim().split(/\s+/);
  const re = dc ? AMOUNT_DC : AMOUNT;
  const amts = [];
  while (tok.length && amts.length < 2) {
    // "12.00 CR" is two tokens; glue them back.
    let t = tok[tok.length - 1], n = 1;
    if (/^(CR|DR)$/i.test(t) && tok.length > 1) { t = tok[tok.length - 2] + " " + t; n = 2; }
    if (!re.test(t)) break;
    amts.unshift(t); tok.length -= n;
  }
  return { amts, rest: tok.join(" ") };
}

// Years named in the statement's header, so "03/09" and "Dec 28" get one.
function yearWindow(text, year) {
  const dates = [];
  const re = new RegExp(`\\b(?:\\d{4}-\\d{2}-\\d{2}|\\d{1,2}/\\d{1,2}/\\d{4}|${MON} \\d{1,2},? \\d{4}|\\d{1,2} ${MON} \\d{4})`, "gi");
  for (const m of text.slice(0, 6000).matchAll(re)) { const d = parseDate(m[0]); if (d) dates.push(d); }
  dates.sort();
  const lo = dates[0], hi = dates[dates.length - 1];
  let y = year ?? (hi ? +hi.slice(0, 4) : null);
  if (!y) { const ys = [...text.slice(0, 1500).matchAll(/\b(20\d{2})\b/g)].map((m) => +m[1]); if (ys.length) y = Math.max(...ys); }
  return { lo, hi, year: y };
}

function withYear(token, win, dayFirst) {
  if (/\d{4}/.test(token) || /^\d{1,2}[/.-]\d{1,2}[/.-]\d{2}$/.test(token)) return parseDate(token, dayFirst);
  if (!win.year) return null;
  const glue = /^\d{1,2}[/.-]\d{1,2}$/.test(token) ? "/" : /^\d/.test(token) ? " " : ", ";
  let fallback = null;
  for (const y of [win.year, win.year - 1, win.year + 1]) {
    const c = parseDate(token + glue + y, dayFirst);
    if (!c) continue;
    fallback ??= c;
    if (!win.lo || (c >= win.lo && c <= win.hi)) return c;
  }
  return fallback;
}

export function readStatementText(text, { dayFirst = false, decimalComma = false, year, ocr = false } = {}) {
  const win = yearWindow(text, year);
  const rows = [], problems = [];
  let section = 0, last = null, undirected = 0, opening = null, closing = null, pending = null;
  const guessed = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].replace(/[\u200b-\u200d\u2060\ufeff]/g, "").replace(/\s+/g, " ").trim();
    if (!line) { last = null; pending = null; continue; }
    let dm = DATE_AT_START.exec(line);
    if (!dm && pending) {
      // the description wrapped and the amount is on a later line
      const { amts, rest: cont } = splitTail(line, decimalComma);
      // a balance line under a header or print-date line is not that line's amount
      if (amts.length && /^(beginning|opening|previous|starting|ending|closing)\b.*balance/i.test(cont)) pending = null;
      else if (amts.length) { line = `${pending.head} ${line}`; dm = DATE_AT_START.exec(line); pending = null; }
      else if (pending.n < 2 && line.length <= 70 && !NOISE.test(line)) { pending.head += " " + line; pending.n++; continue; }
      else pending = null;
    }
    if (!dm) {
      const { amts, rest } = splitTail(line, decimalComma);
      // a summary line holding both: "Beginning balance 8,379.39 Ending balance 14,354.60"
      const both = new RegExp(`^(?:beginning|opening|previous|starting) balance:?\\s+(\\S+)\\s+(?:ending|closing|new) balance:?\\s+(\\S+)$`, "i").exec(line);
      if (both && splitTail(both[1], decimalComma).amts.length && amts.length) {
        if (opening === null && !rows.length) opening = parseCents(both[1].replace(/\s?(CR|DR)$/i, ""), decimalComma);
        closing = parseCents(both[2].replace(/\s?(CR|DR)$/i, ""), decimalComma); last = null; continue;
      }
      if (amts.length && /^(ending|closing|new)\b.*balance/i.test(rest)) { closing = parseCents(amts[amts.length - 1].replace(/\s?(CR|DR)$/i, ""), decimalComma); last = null; continue; }
      if (amts.length && /^(beginning|opening|previous|starting|balance (?:forward|brought forward))/i.test(rest) && BALANCE_LINE.test(rest)) {
        if (opening === null && !rows.length) opening = parseCents(amts[amts.length - 1].replace(/\s?(CR|DR)$/i, ""), decimalComma);
        last = null; continue;
      }
      if (!amts.length) {
        if (line.length < 60 && !NOISE.test(line) && /^[A-Za-z]/.test(line) && (IN_HEAD.test(line) || OUT_HEAD.test(line)) && line.split(" ").length <= 6) { section = IN_HEAD.test(line) && !/^(checks?|fees?)/i.test(line) ? 1 : -1; if (/payments? (?:and|&) (?:other )?credits/i.test(line)) section = 1; last = null; }
        else if (last && line.length <= 70 && !NOISE.test(line) && !/^\d+$/.test(line)) last.desc = `${last.desc} ${line}`.trim();
        else last = null;
      } else last = null;
      continue;
    }
    let after = line.slice(dm[0].length).trim();
    const second = DATE_AT_START.exec(after);          // a posting date after the transaction date
    if (second) after = after.slice(second[0].length).trim();
    const { amts, rest } = splitTail(after, decimalComma);
    if (!amts.length) { pending = { head: line, n: 0 }; last = null; continue; }
    pending = null;
    const iso = withYear(dm[1], win, dayFirst);
    if (!iso) { problems.push(`Line ${i + 1}: no year for "${dm[1]}"; put the statement period above the rows (like "March 2026") or pass a year (CLI: --year 2026).`); continue; }
    const amtTok = amts[0], balTok = amts.length === 2 ? amts[1] : null;
    if (BALANCE_LINE.test(rest) || /^(beginning|opening|previous|ending|closing) balance/i.test(rest)) {
      if (/^(beginning|opening|previous|starting)|^balance (?:brought )?forward/i.test(rest) && opening === null && !rows.length) opening = parseCents(amts[amts.length - 1].replace(/\s?(CR|DR)$/i, ""), decimalComma);
      last = null; continue;
    }
    let cents = parseCents(amtTok.replace(/\s?(CR|DR)$/i, ""), decimalComma);
    if (!Number.isFinite(cents)) { problems.push(`Line ${i + 1}: unreadable amount, skipped.`); continue; }
    const explicit = cents < 0;
    const mag = Math.abs(cents);
    const cd = /\s?(CR|DR)$/i.exec(amtTok);
    let sign;
    if (explicit) sign = -1;
    else if (cd) sign = /cr/i.test(cd[1]) ? 1 : -1;
    else sign = 0;
    const balance = balTok ? parseCents(balTok.replace(/\s?(CR|DR)$/i, ""), decimalComma) : null;
    const prevBal = rows.length ? rows[rows.length - 1].balance : opening;
    if (!sign && Number.isFinite(balance) && prevBal !== null && prevBal !== undefined) {
      if (prevBal + mag === balance) sign = 1; else if (prevBal - mag === balance) sign = -1;
    }
    if (!sign && section) sign = section;
    let unsure = false;
    if (!sign) { sign = -1; undirected++; guessed.push(rows.length); unsure = true; }
    const row = { line: i + 1, date: iso, desc: rest, cents: sign * mag, balance: Number.isFinite(balance) ? balance : null, ...(explicit && !cd && !section ? { minus: true } : {}), ...(unsure ? { guessed: true } : {}) };
    if (row.cents === 0) { last = null; continue; }
    rows.push(row); last = row;
  }
  if (!rows.length && problems.length) return { rows: [], problems: [...new Set(problems.map((x) => x.replace(/^Line \d+: /, "").replace(/"[^"]*"/, "the dates")))].slice(0, 3).concat(problems.length > 1 ? [`${problems.length} lines were skipped for the same reason.`] : []), columns: null };
  if (!rows.length) return { rows: [], problems: ["No transaction lines were found. A line should start with a date and end with an amount, like \"03/09 CAFE LUNA 12.50\"."], columns: null };
  for (const r of rows) r.desc = r.desc.replace(/\s+/g, " ").trim().replace(/\s[$€£]$/, "");
  const repaired = ocr ? repairByBalance(rows, opening, closing) : [];
  for (const x of repaired) problems.push(`Line ${x.line}: ${x.what}`);
  if (ocr) for (let k = guessed.length - 1; k >= 0; k--) if (!rows[guessed[k]].guessed) { guessed.splice(k, 1); undirected--; }
  // A card statement with no section headings prints purchases bare and payments
  // and credits with a minus ("07/06 PAYMENT THANK YOU -1,238.92"): the minus is the
  // card issuer's credit, not money out. Read that way only when the header says
  // card, no row has a running balance, and the minus rows are the minority.
  let cardFlip = 0;
  const minus = rows.filter((r) => r.minus);
  if (minus.length && minus.length < rows.length / 2 && guessed.length && rows.every((r) => r.balance === null) && CARD_CUE.test(text.slice(0, 4000))) {
    for (const r of minus) r.cents = Math.abs(r.cents);
    cardFlip = minus.length; undirected -= guessed.length; guessed.length = 0;
  }
  for (const r of rows) { delete r.minus; delete r.guessed; }
  // Unsigned rows with no running balance: the opening and closing balance fix the
  // total, so if exactly one in/out assignment of them reaches it, that is the answer.
  let byBalance = 0;
  if (guessed.length && guessed.length <= 20 && opening !== null && closing !== null) {
    const fixed = rows.reduce((a, r, k) => a + (guessed.includes(k) ? 0 : r.cents), 0);
    const want = closing - opening - fixed;
    let ways = new Map([[0, { n: 1, signs: [] }]]);
    for (const k of guessed) {
      const m = Math.abs(rows[k].cents), next = new Map();
      for (const [sum, w] of ways) for (const sg of [1, -1]) {
        const t = sum + sg * m, e = next.get(t);
        if (e) e.n += w.n; else next.set(t, { n: w.n, signs: [...w.signs, sg] });
      }
      ways = next;
    }
    const hit = ways.get(want);
    if (hit && hit.n === 1) { guessed.forEach((k, j) => { rows[k].cents = hit.signs[j] * Math.abs(rows[k].cents); }); byBalance = guessed.length; undirected -= guessed.length; }
  }
  const inferred = cardFlip ? `A card statement: ${cardFlip} rows printed with a minus were read as payments and credits (money in) and the rest as purchases.` : byBalance ? `${byBalance} unsigned rows were read as money in or out from the statement's opening and closing balance (only one split adds up).` : undirected ? `${undirected} of ${rows.length} rows had no sign, no running balance and no section heading, so they were read as money out. Check them.` : null;
  // The statement's own totals: opening plus every row should reach the closing
  // balance. A scan read by OCR can misread a digit; this is how it shows.
  const check = opening !== null && closing !== null ? { opening, closing, rowsTotal: rows.reduce((a, r) => a + r.cents, 0) } : null;
  // A card statement prints what is owed as positive (new = previous + purchases -
  // payments), so its rows, purchases negative, run the other way.
  if (check) {
    const owed = cardFlip > 0 || (CARD_CUE.test(text.slice(0, 4000)) && rows.every((r) => r.balance === null));
    check.ok = (owed ? opening - check.rowsTotal : opening + check.rowsTotal) === closing;
    if (owed) check.owed = true;
    if (!check.ok) check.off = owed ? closing - (opening - check.rowsTotal) : closing - opening - check.rowsTotal; // printed closing less what the rows reach
  }
  return { rows, problems, columns: null, bank: "text", inferred, ...(check ? { check } : {}), ...(repaired.length ? { repaired } : {}) };
}

// OCR misreads digits; a statement with a running balance carries its own
// checksum. Walking the rows from the opening balance, a row whose amount does not
// take the previous balance to its printed one is repaired only when the evidence
// is two-sided: the printed balance is confirmed by the next row (or by the closing
// balance), so the amount is the one misread and is the balance's change; or the
// next row only chains from the previous balance plus this amount, so the printed
// balance is the one misread. A row that lost its amount (a token OCR mangled, so
// the balance was taken as the amount) is put back when that number is confirmed
// as a balance the same way. Rows with no sign get theirs from the balance. Each
// repair is returned with what changed, for the caller to show; nothing is
// repaired on a reading with no running balance, or on text not read by OCR.
const fmtC = (c) => `${c < 0 ? "-" : ""}${(Math.abs(c) / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
export function repairByBalance(rows, opening, closing) {
  const out = [];
  if (rows.length < 2 || rows.filter((r) => r.balance !== null).length < rows.length / 2) return out;
  let prev = opening ?? null;
  const chains = (from, r) => r && r.balance !== null && (from + Math.abs(r.cents) === r.balance || from - Math.abs(r.cents) === r.balance);
  const confirmed = (bal, i) => (i + 1 < rows.length ? chains(bal, rows[i + 1]) : closing !== null && closing !== undefined && bal === closing);
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i], mag = Math.abs(r.cents);
    if (prev === null) { prev = r.balance; continue; } // no opening: the first row starts the chain
    if (r.balance !== null) {
      if (prev + r.cents === r.balance) { prev = r.balance; continue; }
      if (prev - r.cents === r.balance && r.guessed) { r.cents = -r.cents; r.guessed = false; prev = r.balance; continue; }
      if (prev + mag === r.balance || prev - mag === r.balance) { if (r.guessed) { r.cents = r.balance - prev; r.guessed = false; } prev = r.balance; continue; } // a printed sign that disagrees is left for the break check
      // the first row against the opening alone: the opening may be the misread
      // (or misplaced) figure, so a break there is left for the break check
      if (i === 0) { prev = r.balance; continue; }
      if (confirmed(r.balance, i)) {
        const was = r.cents; r.cents = r.balance - prev; r.guessed = false;
        out.push({ line: r.line, field: "amount", from: was, to: r.cents, what: `the amount read as ${fmtC(Math.abs(was))} does not take the balance from ${fmtC(prev)} to ${fmtC(r.balance)}; the next line confirms that balance, so the amount is read as ${fmtC(r.cents)} (check it on the page).` });
        prev = r.balance; continue;
      }
      const nb = [prev + mag, prev - mag].filter((b) => confirmed(b, i));
      if (nb.length === 1) {
        const was = r.balance; r.balance = nb[0]; r.cents = nb[0] - prev; r.guessed = false;
        out.push({ line: r.line, field: "balance", from: was, to: r.balance, what: `the balance read as ${fmtC(was)} breaks the chain; ${fmtC(r.balance)} (the previous balance and this amount) is confirmed by the next line, so that is used (check it on the page).` });
        prev = r.balance; continue;
      }
      prev = r.balance; continue; // can't tell: leave it for the break check
    }
    // no balance on this row: is its one number really the balance?
    if (i > 0 && confirmed(mag, i) && mag !== prev) {
      const was = r.cents; r.balance = mag; r.cents = mag - prev; r.guessed = false;
      out.push({ line: r.line, field: "amount", from: was, to: r.cents, what: `only one number was read (${fmtC(Math.abs(was))}) and the next line confirms it as the balance, so the amount is the change from ${fmtC(prev)}: ${fmtC(r.cents)} (check it on the page).` });
      prev = mag; continue;
    }
    const nb = [prev + mag, prev - mag].filter((b) => confirmed(b, i));
    if (nb.length === 1) { r.balance = nb[0]; r.cents = nb[0] - prev; r.guessed = false; prev = nb[0]; continue; }
    prev = null; // the chain is lost; it restarts at the next printed balance
  }
  return out;
}
