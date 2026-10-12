// Turns the text of a bank or card statement (read from a PDF's text layer, or
// pasted) into transactions, and proves the result against the statement's own
// balances before anyone imports it. All money is whole minor units (integers):
// no floating point is ever used for an amount.
//
// The model, in one paragraph: a transaction line starts with a date (or two),
// carries a description, and ends with one to three amounts. Which amount is the
// movement and which is the running balance comes from the column headings when
// they can be read, otherwise from how many amounts a line usually carries. Which
// way the money moved comes, in this order, from the running balance (the sign
// that makes the balance add up), from the column it sits in, and from an
// explicit sign, CR/DR or brackets. Finally opening balance + every transaction
// must equal closing balance; when it does not, the amount it is off by is
// reported with the likeliest causes (a missing row, a duplicate, a flipped sign).

import { extractPdfLines } from './pdf-text.mjs';

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const MON = '(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*';

// --- Money --------------------------------------------------------------

const AMOUNT_RE = new RegExp(
  "^(\\(?)([-+]?)([$€£]?)([-+]?)((?:\\d{1,3}(?:[,.'’]\\d{3})+|\\d+))[.,](\\d{2})(\\)?)([-+]?)(CR|DR|Cr|Dr)?$",
);

/** Parses one word as an amount, or returns null. */
export function parseAmountWord(word) {
  const m = AMOUNT_RE.exec(word);
  if (!m) return null;
  const whole = m[5].replace(/[,.'’]/g, '');
  if (whole.length > 13) return null;
  const abs = Number(whole) * 100 + Number(m[6]);
  const neg = Boolean(m[1] || m[7]) || m[2] === '-' || m[4] === '-' || m[8] === '-';
  const tag = m[9] ? m[9].toUpperCase() : null;
  return { abs, neg, tag, text: word };
}

export function formatCents(cents, decimal = '.') {
  const neg = cents < 0;
  const abs = Math.abs(cents);
  const s = `${Math.floor(abs / 100)}${decimal}${String(abs % 100).padStart(2, '0')}`;
  return neg ? `-${s}` : s;
}

export function money(cents) {
  const neg = cents < 0;
  const abs = Math.abs(cents);
  const whole = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${neg ? '-' : ''}${whole}.${String(abs % 100).padStart(2, '0')}`;
}

// --- Dates --------------------------------------------------------------

const monthNo = (s) => MONTHS[s.slice(0, 3).toLowerCase()] || null;
const fullYear = (y) => (y === undefined || y === null || y === '' ? null : y.length === 2 ? (Number(y) < 70 ? 2000 : 1900) + Number(y) : Number(y));

export function matchDate(str) {
  let m;
  if ((m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(str))) return { kind: 'iso', y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
  if ((m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(str))) return { kind: 'num', a: Number(m[1]), b: Number(m[2]), y: fullYear(m[3]) };
  if ((m = /^(\d{1,2})[/-](\d{1,2})$/.exec(str))) return { kind: 'num', a: Number(m[1]), b: Number(m[2]), y: null };
  if ((m = new RegExp(`^(\\d{1,2})(?:st|nd|rd|th)?[ -]?${MON}\\.?(?:,?[ -]?(\\d{4}|\\d{2}))?$`, 'i').exec(str))) return { kind: 'named', d: Number(m[1]), m: monthNo(m[2]), y: fullYear(m[3]) };
  if ((m = new RegExp(`^${MON}\\.?[ -]?(\\d{1,2})(?:st|nd|rd|th)?(?:,?[ ]?(\\d{4}))?$`, 'i').exec(str))) return { kind: 'named', d: Number(m[2]), m: monthNo(m[1]), y: fullYear(m[3]) };
  return null;
}

function leadingDates(words) {
  const dates = [];
  let i = 0;
  while (dates.length < 2 && i < words.length) {
    let found = null;
    for (let k = Math.min(3, words.length - i); k >= 1; k--) {
      const cand = words.slice(i, i + k).map((w) => w.text).join(' ');
      const d = matchDate(cand);
      if (d && (d.kind !== 'named' || d.m)) { found = { d, k, text: cand }; break; }
    }
    if (!found) break;
    dates.push(found);
    i += found.k;
  }
  return { dates, used: i };
}

const validDmy = (d, m) => m >= 1 && m <= 12 && d >= 1 && d <= 31;

// --- Input: lines of word-items ---------------------------------------------

export function linesFromText(text) {
  return String(text).replace(/\r\n?/g, '\n').split('\n').map((raw, i) => {
    const items = [];
    const re = /\S+(?: \S+)*/g;
    let m;
    while ((m = re.exec(raw.replace(/\t/g, '   ')))) items.push({ text: m[0], x: m.index, xEnd: m.index + m[0].length });
    return { page: 1, lineNo: i + 1, items, key: i, paste: true };
  });
}

function wordsOf(line) {
  const out = [];
  for (const it of line.items) {
    const parts = it.text.split(/\s+/).filter(Boolean);
    if (!parts.length) continue;
    const span = Math.max(it.xEnd - it.x, 1);
    let at = 0;
    for (const p of parts) {
      const idx = it.text.indexOf(p, at);
      const x = it.x + (idx / it.text.length) * span;
      out.push({ text: p, x, xEnd: x + (p.length / it.text.length) * span });
      at = idx + p.length;
    }
  }
  // "$" or "-" standing alone before a number belongs to the number.
  const merged = [];
  for (let i = 0; i < out.length; i++) {
    const w = out[i];
    const next = out[i + 1];
    if (next && /^[$€£(+-]+$/.test(w.text) && /^[\d(]/.test(next.text)) { merged.push({ text: w.text + next.text, x: w.x, xEnd: next.xEnd }); i++; continue; }
    if (merged.length && /^(CR|DR|Cr|Dr)$/.test(w.text) && AMOUNT_RE.test(merged[merged.length - 1].text)) {
      const prev = merged[merged.length - 1];
      merged[merged.length - 1] = { text: prev.text + w.text, x: prev.x, xEnd: w.xEnd };
      continue;
    }
    merged.push(w);
  }
  return merged;
}

// --- Headings -------------------------------------------------------------------

const HEAD = {
  bank: {
    debit: /^(debits?|withdrawals?|withdrawn|checks?|cheques?)$/i,
    credit: /^(credits?|deposits?|additions?)$/i,
  },
  card: {
    debit: /^(charges?|purchases?|debits?)$/i,
    credit: /^(payments?|credits?)$/i,
  },
};

function headingColumns(words, kind) {
  const cols = [];
  const lower = words.map((w) => w.text.toLowerCase().replace(/[^a-z]/g, ''));
  for (let i = 0; i < words.length; i++) {
    const w = lower[i];
    const prev = lower[i - 1];
    const pos = { x: words[i].x, xEnd: words[i].xEnd };
    if (w === 'balance') cols.push({ role: 'balance', ...pos });
    else if (w === 'amount' || w === 'amounts') cols.push({ role: 'amount', ...pos });
    else if ((w === 'out' || w === 'in') && ['paid', 'money', 'cash'].includes(prev)) {
      const start = words[i - 1];
      cols.push({ role: w === 'out' ? 'debit' : 'credit', x: start.x, xEnd: words[i].xEnd });
    } else if (HEAD[kind].debit.test(words[i].text)) cols.push({ role: 'debit', ...pos });
    else if (HEAD[kind].credit.test(words[i].text)) cols.push({ role: 'credit', ...pos });
  }
  return cols;
}

const isHeadingLine = (words) => {
  const lower = words.map((w) => w.text.toLowerCase().replace(/[^a-z]/g, ''));
  const hasDate = lower.includes('date') || lower.includes('posted') || lower.includes('posting');
  const hasDesc = lower.some((w) => ['description', 'details', 'transaction', 'transactions', 'narrative', 'particulars', 'payee', 'memo', 'reference'].includes(w));
  const hasMoney = lower.some((w) => ['balance', 'amount', 'debit', 'debits', 'credit', 'credits', 'withdrawals', 'deposits', 'charges', 'payments', 'out', 'in'].includes(w));
  return (hasDate && (hasDesc || hasMoney)) || (hasDesc && hasMoney && !words.some((w) => /\d/.test(w.text)));
};

function columnFor(cols, word) {
  let best = null, bestD = Infinity;
  for (const c of cols) {
    const d = Math.min(Math.abs(word.xEnd - c.xEnd), Math.abs(word.x - c.x), Math.abs((word.x + word.xEnd) / 2 - (c.x + c.xEnd) / 2));
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}

// --- Balances and totals ------------------------------------------------------

const OPENING_RE = /\b(opening|beginning|previous|prior|starting)\s+balance\b|\bbalance\s+(brought\s+forward|forward|b\/?f)\b|\bbrought\s+forward\b/i;
const CLOSING_RE = /\b(closing|ending|new|final)\s+balance\b|\bbalance\s+(carried\s+forward|c\/?f)\b|\bcarried\s+forward\b/i;
const TOTAL_CREDIT_RE = /\btotal\s+(deposits?|credits?|additions?|money\s+in|paid\s+in)\b|\b(deposits?|credits?)\s+and\s+(other\s+)?(credits?|additions?)\b.*\btotal\b/i;
const TOTAL_DEBIT_RE = /\btotal\s+(withdrawals?|debits?|checks?|cheques?|money\s+out|paid\s+out)\b/i;
const SKIP_RE = /^(page\s+\d+|continued|statement\s+(period|date)|account\s+(number|summary)|\*+|total\b)/i;

function lastAmount(words) {
  for (let i = words.length - 1; i >= 0; i--) {
    const a = parseAmountWord(words[i].text);
    if (a) return a;
  }
  return null;
}

// --- Core ---------------------------------------------------------------------

/**
 * @param {{page:number, lineNo?:number, items:{text:string,x:number,xEnd:number}[], key?:number}[]} lines
 * @param {{kind?: 'bank'|'card', dateOrder?: 'auto'|'dmy'|'mdy', year?: number|null}} [opts]
 */
export function parseStatement(lines, opts = {}) {
  const kind = opts.kind === 'card' ? 'card' : 'bank';
  const findings = [];
  const note = (severity, title, detail, line) => findings.push({ severity, title, detail, line: line || null });

  // 1. Classify every line.
  const rows = [];
  let cols = [];
  let opening = null, closing = null, totalCredit = null, totalDebit = null;
  let periodYears = [];
  let periodLines = 0;
  let prevTxnKey = null, prevTxnPage = null;
  let gaps = [];
  let current = null;
  const txns = [];
  const dropped = [];
  let n = 0;

  const finish = () => { if (current) { txns.push(current); current = null; } };

  for (const line of lines) {
    n++;
    const lineNo = line.lineNo || n;
    const words = wordsOf(line);
    if (!words.length) continue;
    const text = words.map((w) => w.text).join(' ');

    if (isHeadingLine(words)) {
      const c = headingColumns(words, kind);
      if (c.length >= 1) cols = c;
      finish();
      continue;
    }
    // Statement-period years, for lines that carry no year.
    if (/\b(statement|period|through|from|billing|cycle)\b/i.test(text) && !leadingDates(words).dates.length) {
      for (const m of text.matchAll(/\b(19|20)\d{2}\b/g)) periodYears.push({ y: Number(m[0]), text });
      periodLines++;
    }

    const lead = leadingDates(words);
    const rest = words.slice(lead.used);
    const restText = rest.map((w) => w.text).join(' ');

    // Balance and total lines, with or without a date in front.
    if (OPENING_RE.test(restText || text)) { const a = lastAmount(rest.length ? rest : words); if (a && !opening) opening = { ...a, line: lineNo }; finish(); continue; }
    if (CLOSING_RE.test(restText || text)) { const a = lastAmount(rest.length ? rest : words); if (a) closing = { ...a, line: lineNo }; finish(); continue; }
    if (TOTAL_CREDIT_RE.test(text)) { const a = lastAmount(words); if (a) totalCredit = { ...a, line: lineNo }; finish(); continue; }
    if (TOTAL_DEBIT_RE.test(text)) { const a = lastAmount(words); if (a) totalDebit = { ...a, line: lineNo }; finish(); continue; }

    if (lead.dates.length) {
      const amts = [];
      let descEnd = rest.length;
      for (let i = 0; i < rest.length; i++) {
        const a = parseAmountWord(rest[i].text);
        if (a && rest.slice(i).every((w) => parseAmountWord(w.text))) { descEnd = i; break; }
      }
      for (let i = descEnd; i < rest.length; i++) amts.push({ ...parseAmountWord(rest[i].text), word: rest[i] });
      finish();
      current = {
        line: lineNo, page: line.page, dates: lead.dates.map((x) => x.d), dateText: lead.dates[0].text,
        description: rest.slice(0, descEnd).map((w) => w.text).join(' '), amts, key: line.key,
      };
      if (prevTxnKey !== null && line.key !== undefined && line.page === prevTxnPage) gaps.push(Math.abs(line.key - prevTxnKey));
      prevTxnKey = line.key === undefined ? null : line.key;
      prevTxnPage = line.page;
      continue;
    }

    // No date: continuation of the open transaction, or noise.
    if (current && !SKIP_RE.test(text)) {
      const allAmts = rest.length > 0 && rest.every((w) => parseAmountWord(w.text));
      const trailing = [];
      let descEnd = words.length;
      for (let i = 0; i < words.length; i++) {
        if (parseAmountWord(words[i].text) && words.slice(i).every((w) => parseAmountWord(w.text))) { descEnd = i; break; }
      }
      for (let i = descEnd; i < words.length; i++) trailing.push({ ...parseAmountWord(words[i].text), word: words[i] });
      if (!current.amts.length && trailing.length) {
        current.amts = trailing;
        const d = words.slice(0, descEnd).map((w) => w.text).join(' ');
        if (d) current.description = `${current.description} ${d}`.trim();
        continue;
      }
      if (!trailing.length && !allAmts) {
        const sameBlock = line.page === current.page;
        const med = gaps.length ? [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)] : null;
        const lastKey = current.lastKey !== undefined ? current.lastKey : current.key;
        const near = line.paste || med === null || line.key === undefined || lastKey === undefined || Math.abs(line.key - lastKey) <= med * 1.7;
        if (sameBlock && near && current.description.length < 240) {
          current.description = `${current.description} ${text}`.trim();
          current.lastKey = line.key;
        }
      }
    }
  }
  finish();

  // 2. Date order and year.
  const numeric = txns.flatMap((t) => t.dates).filter((d) => d.kind === 'num');
  let order = opts.dateOrder === 'dmy' || opts.dateOrder === 'mdy' ? opts.dateOrder : null;
  if (!order && numeric.length) {
    const firstBig = numeric.some((d) => d.a > 12), secondBig = numeric.some((d) => d.b > 12);
    if (firstBig && !secondBig) order = 'dmy';
    else if (secondBig && !firstBig) order = 'mdy';
    else if (firstBig && secondBig) { order = 'mdy'; note('warning', 'Dates mix day-first and month-first', 'Some dates have a first number over 12 and others a second number over 12. Pick the date order explicitly below.'); }
    else {
      order = kind === 'card' || !txns.some((t) => /\d,\d{2}$/.test(t.amts.map((a) => a.text).join(' '))) ? 'mdy' : 'dmy';
      note('warning', 'Day-month order is ambiguous', `Every numeric date has both numbers 12 or under, so it could be day-month or month-day. It was read as ${order === 'dmy' ? 'day/month' : 'month/day'}; set the date order explicitly if that is wrong.`);
    }
  }

  const years = [...new Set(periodYears.map((p) => p.y))].sort();
  const defaultYear = opts.year || null;
  const resolveDate = (d) => {
    if (!d) return null;
    let y = d.y, m, day;
    if (d.kind === 'iso' || d.kind === 'named') { m = d.m; day = d.d; }
    else if (order === 'dmy') { day = d.a; m = d.b; } else { m = d.a; day = d.b; }
    if (!validDmy(day, m)) return { ok: false, y: y || null, m, d: day };
    if (!y) {
      if (defaultYear) y = defaultYear;
      else if (years.length === 1) y = years[0];
      else if (years.length >= 2) y = m >= 7 ? years[0] : years[years.length - 1];
    }
    return { ok: true, y, m, d: day, inferred: !d.y };
  };

  // 3. Column layout and amounts per transaction.
  const amtCounts = txns.map((t) => t.amts.length).filter((c) => c > 0);
  const modeCount = (() => { const f = {}; amtCounts.forEach((c) => { f[c] = (f[c] || 0) + 1; }); return Number((Object.entries(f).sort((a, b) => b[1] - a[1])[0] || [1])[0]); })();
  const hasBalanceCol = cols.some((c) => c.role === 'balance') || (!cols.length && modeCount >= 2);

  const sgnDebit = kind === 'card' ? 1 : -1; // movement of the balance for the "debit" heading
  const results = [];
  let guessedSign = 0;
  for (const t of txns) {
    if (!t.amts.length) { dropped.push(t); continue; }
    let move = null, balance = null, role = null;
    const amts = t.amts;
    if (cols.length) {
      for (const a of amts) {
        const c = columnFor(cols, a.word);
        if (c && c.role === 'balance') balance = a.neg || a.tag === 'DR' ? -a.abs : a.abs;
        else if (move === null) { move = a; role = c ? c.role : null; }
      }
    } else if (amts.length >= 2 && hasBalanceCol) {
      const b = amts[amts.length - 1];
      balance = b.neg || b.tag === 'DR' ? -b.abs : b.abs;
      move = amts[amts.length - 2];
    } else move = amts[0];
    if (!move && amts.length >= 2) { move = amts[0]; balance = amts[amts.length - 1].neg ? -amts[amts.length - 1].abs : amts[amts.length - 1].abs; }
    if (!move) { dropped.push(t); continue; }
    // Explicit sign semantics: bank: '-'/brackets/DR = money out (-), CR = money in (+).
    // card: '-'/brackets/CR = a credit to the account (-), DR = a charge (+).
    let sign = null, source = null;
    if (kind === 'bank') {
      if (move.neg || move.tag === 'DR') { sign = -1; source = 'sign'; } else if (move.tag === 'CR') { sign = 1; source = 'sign'; }
    } else if (move.neg || move.tag === 'CR') { sign = -1; source = 'sign'; } else if (move.tag === 'DR') { sign = 1; source = 'sign'; }
    if (sign === null && role === 'debit') { sign = sgnDebit; source = 'column'; }
    if (sign === null && role === 'credit') { sign = -sgnDebit; source = 'column'; }
    t.move = move; t.balance = balance; t.role = role; t.sign = sign; t.source = source;
    results.push(t);
  }

  // 4. Running balance: the strongest evidence for direction.
  let prev = opening ? (kind === 'card' || !opening.neg ? (opening.neg ? -opening.abs : opening.abs) : -opening.abs) : null;
  // An unsigned amount is not a guess when the statement signs its other amounts
  // (a bare number is then money in) or is a card statement (a bare number is a charge).
  const conventional = kind === 'card' || results.some((t) => t.source === 'sign');
  const tx = [];
  const balanceBreaks = [];
  let signFixed = 0;
  for (const t of results) {
    let sign = t.sign;
    let source = t.source;
    const abs = t.move.abs;
    if (t.balance !== null && prev !== null) {
      const diff = t.balance - prev;
      if (Math.abs(diff) === abs && abs !== 0) {
        const bs = diff > 0 ? 1 : -1;
        if (sign !== null && sign !== bs) signFixed++;
        sign = bs; source = 'balance';
      }
      if (Math.abs(diff) !== abs) balanceBreaks.push({ t, expected: prev + (sign === null ? 0 : sign * abs), actual: t.balance, diff });
    }
    if (sign === null) {
      sign = 1;
      if (conventional) source = 'convention';
      else { source = 'guess'; guessedSign++; }
    }
    if (t.balance !== null) prev = t.balance;
    else if (prev !== null) prev += sign * abs;
    const dateParts = resolveDate(t.dates[0]);
    const postParts = t.dates[1] ? resolveDate(t.dates[1]) : null;
    tx.push({
      line: t.line, page: t.page, dateText: t.dateText, date: dateParts, postDate: postParts, description: t.description.replace(/\s+/g, ' ').trim(),
      delta: sign * abs, amount: kind === 'card' ? -sign * abs : sign * abs, balance: t.balance, source,
    });
  }

  // 5. Findings.
  const noDates = tx.filter((t) => !t.date || !t.date.ok);
  if (noDates.length) note('error', `${noDates.length} date${noDates.length === 1 ? '' : 's'} could not be read`, `Not a real calendar day-month with the order used (${order || 'n/a'}): lines ${noDates.slice(0, 8).map((t) => t.line).join(', ')}${noDates.length > 8 ? ', …' : ''}. Try the other date order.`, noDates[0].line);
  const noYear = tx.filter((t) => t.date && t.date.ok && !t.date.y);
  const yearFallback = new Date().getFullYear();
  if (noYear.length) {
    for (const t of noYear) t.date.y = yearFallback;
    note('warning', 'The statement year was not found', `${noYear.length} date${noYear.length === 1 ? ' has' : 's have'} no year and no statement period was found to take it from, so ${yearFallback} was used. Enter the year below if that is wrong.`);
  } else if (tx.some((t) => t.date && t.date.inferred)) {
    note('info', 'Year taken from the statement period', `Dates printed without a year were given the year of the statement period (${years.join('–') || String(defaultYear)}).`);
  }
  if (guessedSign) note('warning', `${guessedSign} row${guessedSign === 1 ? '' : 's'} had no way to tell money in from money out`, 'These amounts have no minus sign, no CR/DR, no Debit/Credit column and no running balance to compare against. They are shown as money in. If the statement reconciles below, the guess was right; if not, the amounts in those rows are the first place to look.');
  if (signFixed) note('info', `${signFixed} sign${signFixed === 1 ? '' : 's'} set by the running balance`, 'The running balance showed that the money moved the other way to what the column or the printed sign suggested, and the balance was believed.');
  if (dropped.length) note('info', `${dropped.length} dated line${dropped.length === 1 ? '' : 's'} without an amount left out`, `Lines ${dropped.slice(0, 10).map((t) => t.line).join(', ')}${dropped.length > 10 ? ', …' : ''} start with a date but carry no amount, so they are not transactions.`, dropped[0].line);
  if (balanceBreaks.length) {
    const b = balanceBreaks[0];
    note('error', `The running balance breaks at line ${b.t.line}`, `${balanceBreaks.length} row${balanceBreaks.length === 1 ? '' : 's'} where the balance printed on the statement is not the previous balance plus the amount. The first is line ${b.t.line} ("${b.t.description.slice(0, 50)}"): it prints ${money(b.actual)} but the rows before it reach ${money(b.expected)}, a difference of ${money(Math.abs(b.actual - b.expected))}. A row is probably missing or misread just before it.`, b.t.line);
  }

  // 6. Reconciliation.
  const toSigned = (a) => (a ? (a.neg || a.tag === 'DR' ? -a.abs : a.abs) : null);
  const open = toSigned(opening), close = toSigned(closing);
  const sum = tx.reduce((s, t) => s + t.delta, 0);
  const reconcile = { opening: open, closing: close, sum, expected: null, diff: null, ok: null };
  if (open !== null && close !== null) {
    reconcile.expected = open + sum;
    reconcile.diff = close - reconcile.expected;
    reconcile.ok = reconcile.diff === 0;
    if (reconcile.ok) note('info', 'Balances agree', `Opening ${money(open)} plus ${tx.length} transactions (${money(sum)} net) equals the closing balance ${money(close)}.`);
    else {
      const d = reconcile.diff;
      const hints = [];
      const missing = d < 0 ? 'money-out' : 'money-in';
      hints.push(`a ${missing} row of exactly ${money(Math.abs(d))} may be missing from the text`);
      const twice = tx.filter((t) => Math.abs(t.delta) === Math.abs(d) && Math.sign(t.delta) === (d < 0 ? 1 : -1)).slice(0, 3);
      if (twice.length) hints.push(`line${twice.length > 1 ? 's' : ''} ${twice.map((t) => t.line).join(', ')} (${money(Math.abs(d))}) may be on the wrong side or counted twice`);
      const flip = tx.filter((t) => Math.abs(2 * t.delta) === Math.abs(d) && Math.sign(-2 * t.delta) === Math.sign(d)).slice(0, 3);
      if (flip.length) hints.push(`the sign of line${flip.length > 1 ? 's' : ''} ${flip.map((t) => t.line).join(', ')} (${money(Math.abs(flip[0].delta))}) may be flipped, because flipping it moves the total by exactly ${money(Math.abs(d))}`);
      note('error', `Balances do not agree: off by ${money(Math.abs(d))}`, `Opening ${money(open)} plus the ${tx.length} transactions (${money(sum)} net) gives ${money(reconcile.expected)}, but the statement's closing balance is ${money(close)}. The transactions come out ${money(Math.abs(d))} ${d > 0 ? 'short of' : 'over'} it. Likely causes: ${hints.join('; ')}.`);
    }
  } else {
    note('warning', 'No opening and closing balance found', `${open === null ? 'No opening balance' : 'No closing balance'} was found (labels such as "Beginning balance", "Previous balance", "Ending balance", "New balance"), so the total cannot be proved against the statement. The rows below are what was read, unchecked.`);
  }
  if (totalCredit && kind === 'bank') {
    const got = tx.filter((t) => t.delta > 0).reduce((s, t) => s + t.delta, 0);
    if (got !== totalCredit.abs) note('warning', 'Money-in total differs from the statement', `The statement's total of ${money(totalCredit.abs)} (line ${totalCredit.line}) is not the ${money(got)} read from the rows.`, totalCredit.line);
  }
  if (totalDebit && kind === 'bank') {
    const got = -tx.filter((t) => t.delta < 0).reduce((s, t) => s + t.delta, 0);
    if (got !== totalDebit.abs) note('warning', 'Money-out total differs from the statement', `The statement's total of ${money(totalDebit.abs)} (line ${totalDebit.line}) is not the ${money(got)} read from the rows.`, totalDebit.line);
  }

  const seen = new Map();
  for (const t of tx) { const k = `${t.dateText}|${t.description}|${t.delta}`; seen.set(k, (seen.get(k) || []).concat(t.line)); }
  const dup = [...seen.values()].filter((v) => v.length > 1);
  if (dup.length) note('info', `${dup.length} group${dup.length === 1 ? '' : 's'} of identical rows`, `Same date, description and amount on lines ${dup.slice(0, 4).map((v) => v.join(' and ')).join('; ')}${dup.length > 4 ? '; …' : ''}. Two identical payments on one day are often real; check these against the statement before removing either.`);

  if (!tx.length) note('error', 'No transactions found', 'No line started with a date and ended with an amount. If this was a PDF, it may be a scan (no text layer), or its columns may be laid out in a way this reader cannot follow; paste the text instead.');

  const order_ = { error: 0, warning: 1, info: 2 };
  findings.sort((a, b) => order_[a.severity] - order_[b.severity]);
  return { findings, transactions: tx, reconcile, opening, closing, dateOrder: order, kind, summary: { lines: lines.length, transactions: tx.length, columns: cols.map((c) => c.role) } };
}

export function parseStatementText(text, opts) { return parseStatement(linesFromText(text), opts); }

export async function parseStatementPdf(bytes, inflate, opts = {}) {
  const { pages, flags } = await extractPdfLines(bytes, inflate);
  const early = (title, detail) => ({
    findings: [{ severity: 'error', title, detail, line: null }], transactions: [], reconcile: { ok: null }, opening: null, closing: null,
    dateOrder: null, kind: opts.kind || 'bank', summary: { lines: 0, transactions: 0, columns: [] }, flags,
  });
  if (flags.notPdf) return early('This is not a PDF file', 'The file does not start with %PDF. Choose the statement PDF, or paste its text instead.');
  if (flags.encrypted) return early('The PDF is password-protected', 'Encrypted PDFs cannot be read here. Open it in a PDF viewer, enter the password, print to a new PDF (or copy the text), then try again.');
  const lines = pages.flatMap((p) => p.lines);
  if (!lines.length) {
    return early('No text in this PDF', flags.unreadableFonts
      ? 'The text uses embedded fonts with no mapping back to characters, so it cannot be read here. Copy the table out of a PDF viewer and paste it instead.'
      : 'The PDF has no text layer, which means it is a scan or a photo. This tool does not do OCR. Download the statement as a PDF from your bank\'s website instead of scanning paper, or paste text.');
  }
  lines.forEach((l, i) => { l.lineNo = i + 1; });
  const r = parseStatement(lines, opts);
  r.flags = flags;
  if (flags.unreadableFonts) r.findings.push({ severity: 'warning', title: 'Some text could not be decoded', detail: 'Part of the document uses fonts with no character mapping, and that text was skipped. Check the totals against the statement.', line: null });
  if (flags.pagesWithText < flags.pageCount) r.findings.push({ severity: 'warning', title: `${flags.pageCount - flags.pagesWithText} page${flags.pageCount - flags.pagesWithText === 1 ? '' : 's'} had no text`, detail: 'Those pages are images or blank, so any transactions on them are missing. The balance check below shows whether that matters.', line: null });
  return r;
}

// --- Output -----------------------------------------------------------------------

const csvCell = (v) => {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s) && !/^[-+]?\d+([.,]\d+)?$/.test(s)) s = `'${s}`; // spreadsheet formula guard
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csvRow = (cells) => cells.map(csvCell).join(',');

export function formatDate(d, style = 'iso') {
  if (!d || !d.ok) return '';
  const y = String(d.y || '').padStart(4, '0'), m = String(d.m).padStart(2, '0'), day = String(d.d).padStart(2, '0');
  return style === 'dmy' ? `${day}/${m}/${y}` : style === 'mdy' ? `${m}/${day}/${y}` : `${y}-${m}-${day}`;
}

export const LAYOUTS = {
  generic: 'Date, Description, Amount, Balance',
  split: 'Date, Description, Debit, Credit, Balance',
  xero: 'Xero statement: *Date, *Amount, Payee, Description, Reference',
  qbo3: 'QuickBooks Online 3 columns: Date, Description, Amount',
  qbo4: 'QuickBooks Online 4 columns: Date, Description, Credit, Debit',
};

export function toCsv(result, o = {}) {
  const layout = o.layout || 'generic';
  const style = o.dateFormat || (layout === 'qbo3' || layout === 'qbo4' ? 'mdy' : 'iso');
  const dec = o.decimal === ',' ? ',' : '.';
  const f = (c) => formatCents(c, dec);
  const rows = result.transactions;
  const date = (t) => formatDate(t.date, style);
  let out;
  if (layout === 'split') out = [csvRow(['Date', 'Description', 'Debit', 'Credit', 'Balance'])].concat(rows.map((t) => csvRow([date(t), t.description, t.amount < 0 ? f(-t.amount) : '', t.amount > 0 ? f(t.amount) : '', t.balance === null ? '' : f(t.balance)])));
  else if (layout === 'xero') out = [csvRow(['*Date', '*Amount', 'Payee', 'Description', 'Reference'])].concat(rows.map((t) => csvRow([date(t), f(t.amount), '', t.description, ''])));
  else if (layout === 'qbo3') out = [csvRow(['Date', 'Description', 'Amount'])].concat(rows.map((t) => csvRow([date(t), t.description, f(t.amount)])));
  else if (layout === 'qbo4') out = [csvRow(['Date', 'Description', 'Credit', 'Debit'])].concat(rows.map((t) => csvRow([date(t), t.description, t.amount > 0 ? f(t.amount) : '', t.amount < 0 ? f(-t.amount) : ''])));
  else out = [csvRow(['Date', 'Description', 'Amount', 'Balance'])].concat(rows.map((t) => csvRow([date(t), t.description, f(t.amount), t.balance === null ? '' : f(t.balance)])));
  return `${out.join('\r\n')}\r\n`;
}

export function findingsCsv(result) {
  return `${[csvRow(['Severity', 'Line', 'Finding', 'Detail'])].concat(result.findings.map((x) => csvRow([x.severity, x.line || '', x.title, x.detail]))).join('\r\n')}\r\n`;
}

// --- Examples ----------------------------------------------------------------------

export function sampleStatement() {
  return [
    'FIRST EXAMPLE BANK            Statement period: January 1, 2026 - January 31, 2026',
    'Account summary  (a made-up business checking account)',
    'Beginning balance                                           $4,210.55',
    'Total deposits and credits                                  $3,650.00',
    'Total withdrawals                                           $2,187.43',
    'Ending balance                                              $5,673.12',
    '',
    'Date      Description                                       Withdrawals     Deposits       Balance',
    '01/02     ACH CREDIT STRIPE PAYOUT                                          1,420.00       5,630.55',
    '01/05     CARD PURCHASE OFFICE SUPPLY CO 4412                    86.19                     5,544.36',
    '01/06     CHECK 1042                                            600.00                     4,944.36',
    '01/09     DEPOSIT MOBILE                                                      980.00       5,924.36',
    '01/12     ACH DEBIT ADOBE SYSTEMS                                54.99                     5,869.37',
    '01/15     ACH CREDIT STRIPE PAYOUT                                          1,250.00       7,119.37',
    '01/19     ONLINE TRANSFER TO SAVINGS                          1,000.00                     6,119.37',
    '01/22     CARD PURCHASE HARDWARE WHOLESALE                      283.14                     5,836.23',
    '           SPRINGFIELD ST',
    '01/28     MONTHLY SERVICE FEE                                    163.11                     5,673.12',
  ].join('\n');
}

export function sampleBroken() {
  // The same statement after a row was lost in a copy-paste: the check names the gap.
  return sampleStatement().split('\n').filter((l) => !l.includes('01/06')).join('\n');
}

export function sampleCard() {
  return [
    'EXAMPLE CARD SERVICES        Billing cycle: 12/03/2025 - 01/02/2026',
    'Previous balance                                    $812.40',
    'New balance                                         $1,013.77',
    '',
    'Trans date  Post date  Description                                     Amount',
    '12/05       12/06      AMAZON MKTPLACE PMTS                           129.99',
    '12/11       12/12      PAYMENT - THANK YOU                           -500.00',
    '12/18       12/19      SHELL OIL 57444                                 61.38',
    '12/24       12/26      RESTAURANT GROUP 0042                          212.00',
    '12/30       12/31      ANNUAL MEMBERSHIP FEE                          395.00',
    '01/01       01/02      INTEREST CHARGED                                 2.60',
    '12/22       12/23      RETURN - HARDWARE WHOLESALE                    -99.60',
  ].join('\n');
}
