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

// Month names and the abbreviations banks print, in English, French, Dutch,
// German, Spanish, Italian and Portuguese, keyed without accents or dots.
const MONTH_NAMES = [
  'jan january janv janvier januari januar jan enero ene gennaio gen janeiro',
  'feb february fev fevr fevrier februari februar febrero febbraio fevereiro',
  'mar march mars maart mrt marz maerz mrz marzo marco',
  'apr april avr avril abril abr aprile',
  'may mai mei mayo maggio mag maio',
  'jun june juin juni junio giugno giu junho',
  'jul july juil juillet juli julio luglio lug julho',
  'aug august aout augustus ago agosto',
  'sep sept september septembre septiembre settembre set setembro',
  'oct october octobre oktober okt octubre ottobre ott outubro out',
  'nov november novembre noviembre novembro',
  'dec december decembre dez dezember diciembre dic dicembre dezembro',
];
const MONTHS = Object.fromEntries(MONTH_NAMES.flatMap((names, i) => names.split(' ').map((n) => [n, i + 1])));
const MON = '([A-Za-z\\u00C0-\\u017F]{3,9})';
/** Lower case, accents and dots stripped: "Févr." -> "fevr". */
export const fold = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

// --- Money --------------------------------------------------------------

const AMOUNT_RE = new RegExp(
  "^(\\(?)([-+]?)([$€£]?)([-+]?)((?:\\d{1,3}(?:[,.'’\\u00a0\\u202f]\\d{3})+|\\d+))(?:[.,](\\d{2})|\\.(\\d))(\\)?)([-+]?)(CR|DR|Cr|Dr)?[$€£]?$",
);

// One-decimal amounts ("1935.3") are read only while a statement that prints
// them is being parsed (parseStatement turns this on); elsewhere "1.5" is not money.
let oneDecimal = false;

/** Parses one word as an amount, or returns null. */
export function parseAmountWord(word) {
  const m = AMOUNT_RE.exec(word);
  if (!m) return null;
  if (m[7] !== undefined && !oneDecimal) return null;
  const whole = m[5].replace(/[,.'’\u00a0\u202f]/g, '');
  if (whole.length > 13) return null;
  // Two decimals, or one ("1935.3", as some Indian bank PDFs print it).
  const abs = Number(whole) * 100 + (m[6] !== undefined ? Number(m[6]) : Number(m[7]) * 10);
  const neg = Boolean(m[1] || m[8]) || m[2] === '-' || m[4] === '-' || m[9] === '-';
  const tag = m[10] ? m[10].toUpperCase() : null;
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

const monthNo = (s) => MONTHS[fold(s).replace(/\./g, '')] || null;
const fullYear = (y) => (y === undefined || y === null || y === '' ? null : y.length === 2 ? (Number(y) < 70 ? 2000 : 1900) + Number(y) : Number(y));

export function matchDate(str) {
  let m;
  if ((m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(str))) return { kind: 'iso', y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
  if ((m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(str))) return { kind: 'num', a: Number(m[1]), b: Number(m[2]), y: fullYear(m[3]) };
  if ((m = /^(\d{1,2})[/-](\d{1,2})$/.exec(str))) return { kind: 'num', a: Number(m[1]), b: Number(m[2]), y: null };
  if ((m = new RegExp(`^(\\d{1,2})(?:st|nd|rd|th|er)?\\.?[ -]?${MON}\\.?(?:,?[ -]?(\\d{4}|\\d{2}))?$`, 'i').exec(str)) && monthNo(m[2])) return { kind: 'named', d: Number(m[1]), m: monthNo(m[2]), y: fullYear(m[3]) };
  if ((m = new RegExp(`^${MON}\\.?[ -]?(\\d{1,2})(?:st|nd|rd|th)?(?:,?[ ]?(\\d{4}))?$`, 'i').exec(str)) && monthNo(m[1])) return { kind: 'named', d: Number(m[2]), m: monthNo(m[1]), y: fullYear(m[3]) };
  return null;
}

function leadingDates(words) {
  const dates = [];
  let i = 0;
  while (dates.length < 2 && i < words.length) {
    let found = null;
    for (let k = Math.min(3, words.length - i); k >= 1; k--) {
      const cand = words.slice(i, i + k).map((w) => w.text).join(' ');
      let d = matchDate(cand);
      // A bare "01.05" is a date only as the second of two (a value or interest
      // date), never on its own, where it could be an amount.
      let m2;
      if (!d && dates.length === 1 && k === 1 && (m2 = /^(\d{1,2})\.(\d{1,2})\.?$/.exec(cand))) d = { kind: 'num', a: Number(m2[1]), b: Number(m2[2]), y: null, dotted: true };
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
    // Amounts grouped with spaces ("10 598,70 $", French and much of Europe) are
    // one word when they are a text run of their own, which is how a PDF prints a
    // column. In pasted text the same spaces are ambiguous, so they are left alone.
    let txt = it.text;
    if (!line.paste) {
      txt = txt.replace(/^(\s*[-+=]?\s?[$€£]?\s?)(\d{1,3}(?:[ \u00a0\u202f]\d{3})+[.,]\d{2})(?=\s|$|[$€£])/, (_, pre, num) => pre + num.replace(/[ \u00a0\u202f]/g, ''));
    }
    // A currency sign printed after the amount belongs to it ("151,30 $").
    txt = txt.replace(/(\d[.,]\d{2})\s([$€£])(?=\s|$)/g, '$1$2');
    const parts = txt.split(/\s+/).filter(Boolean);
    if (!parts.length) continue;
    const span = Math.max(it.xEnd - it.x, 1);
    let at = 0;
    for (const p of parts) {
      const idx = txt.indexOf(p, at);
      const x = it.x + (idx / txt.length) * span;
      out.push({ text: p, x, xEnd: x + (p.length / txt.length) * span });
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
    debit: /^(debits?|withdrawals?|withdrawn|checks?|cheques?|retraits?|af|soll|belastungen?|cargos?|debe|uscite|addebiti)$/i,
    credit: /^(credits?|deposits?|additions?|depots?|bij|haben|gutschriften?|abonos?|haber|entrate|accrediti)$/i,
  },
  card: {
    debit: /^(charges?|purchases?|debits?)$/i,
    credit: /^(payments?|credits?)$/i,
  },
};

const BALANCE_WORDS = new Set(['balance', 'solde', 'saldo', 'kontostand', 'saldi']);
const AMOUNT_WORDS = new Set(['amount', 'amounts', 'montant', 'bedrag', 'betrag', 'importe', 'importo', 'valor']);

function headingColumns(words, kind) {
  const cols = [];
  const lower = words.map((w) => fold(w.text).replace(/[^a-z]/g, ''));
  for (let i = 0; i < words.length; i++) {
    const w = lower[i];
    const prev = lower[i - 1];
    const pos = { x: words[i].x, xEnd: words[i].xEnd };
    if (BALANCE_WORDS.has(w)) cols.push({ role: 'balance', ...pos });
    else if (AMOUNT_WORDS.has(w)) cols.push({ role: 'amount', ...pos });
    else if ((w === 'out' || w === 'in') && ['paid', 'money', 'cash'].includes(prev)) {
      const start = words[i - 1];
      cols.push({ role: w === 'out' ? 'debit' : 'credit', x: start.x, xEnd: words[i].xEnd });
    } else if (HEAD[kind].debit.test(w)) cols.push({ role: 'debit', ...pos });
    else if (HEAD[kind].credit.test(w)) cols.push({ role: 'credit', ...pos });
  }
  return cols;
}

const DATE_WORDS = new Set(['date', 'posted', 'posting', 'datum', 'fecha', 'data', 'buchungstag', 'valuta']);
const DESC_WORDS = new Set(['description', 'details', 'transaction', 'transactions', 'narrative', 'particulars', 'payee', 'memo', 'reference',
  'omschrijving', 'libelle', 'operation', 'operations', 'verwendungszweck', 'buchungstext', 'concepto', 'descrizione', 'descricao', 'naam', 'tegenrekening', 'counterparty']);
const MONEY_WORDS = new Set(['balance', 'amount', 'debit', 'debits', 'credit', 'credits', 'withdrawals', 'withdrawal', 'deposits', 'deposit', 'charges', 'payments', 'out', 'in',
  'solde', 'saldo', 'montant', 'bedrag', 'betrag', 'importe', 'importo', 'retraits', 'depots', 'cheques', 'soll', 'haben', 'cargos', 'abonos']);
const isHeadingLine = (words) => {
  const lower = words.map((w) => fold(w.text).replace(/[^a-z]/g, ''));
  const hasDate = lower.some((w) => DATE_WORDS.has(w));
  const hasDesc = lower.some((w) => DESC_WORDS.has(w));
  const hasMoney = lower.some((w) => MONEY_WORDS.has(w));
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

// Tested on accent-folded text (fold()).
const OPENING_RE = /\b(opening|beginning|previous|prior|starting)\s+balance\b|\bbalance\s+(brought\s+forward|forward|b\/?f)\b|\bbrought\s+forward\b|\bsolde\s+(d'?\s?ouverture|precedent|initial|anterieur|de\s+debut|reporte)\b|\bancien\s+solde\b|\b(begin|start|oud|vorig)\s?saldo\b|\bsaldo\s+(anterior|inicial|iniziale|precedente|vorige)\b|\b(alter|vorheriger)\s+kontostand\b|\banfangssaldo\b/i;
const CLOSING_RE = /\b(closing|ending|new|final)\s+balance\b|\bbalance\s+(carried\s+forward|c\/?f)\b|\bcarried\s+forward\b|\bsolde\s+(de\s+fermeture|de\s+cloture|final|de\s+fin)\b|\bnouveau\s+solde\b|\b(eind|nieuw)\s?saldo\b|\bsaldo\s+(final|finale|nuevo|actual)\b|\bneuer\s+kontostand\b|\bendsaldo\b/i;
// "Balance as of 01.05.2025": a dated balance line; the first is the opening
// and the last the closing, when no labelled ones are found.
const DATED_BALANCE_RE = /^(balance|saldo|solde|kontostand)\s+(as\s+(of|at|on)|on|per|op|au|am|al|le)\b/i;
const TOTAL_CREDIT_RE = /\btotal\s+(deposits?|credits?|additions?|money\s+in|paid\s+in|incoming)\b|\b(deposits?|credits?)\s+and\s+(other\s+)?(credits?|additions?)\b.*\btotal\b/i;
const TOTAL_DEBIT_RE = /\btotal\s+(withdrawals?|debits?|checks?|cheques?|money\s+out|paid\s+out|outgoing)\b/i;
// A line naming an account ("HKD Current Account — 817-890692-838"): with a
// restart of the running balance just after it, a new account's table begins.
const ACCOUNT_TITLE_RE = /\b(account|acct|konto|rekening|compte|cuenta|conto)\b/i;
const CONTINUED_RE = /\(?\b(continued|cont'?d|suite|vervolg|fortsetzung|continuacion)\b\)?/gi;
const SKIP_RE = /^(page\s+\d+|continued|statement\s+(period|date)|account\s+(number|summary)|\*+|total\b)/i;

function lastAmount(words) {
  for (let i = words.length - 1; i >= 0; i--) {
    const a = parseAmountWord(words[i].text);
    if (a) return a;
  }
  return null;
}

// Phrases only a card statement prints (tested on accent-folded text).
const CARD_MARKS = /minimum (payment|amount) due|payment due date|credit (limit|line)|available credit|cardmember|card member|annual percentage rate|minimum payment warning|paiement minimum|limite de credit|mindestzahlung/g;

// --- Core ---------------------------------------------------------------------

/**
 * @param {{page:number, lineNo?:number, items:{text:string,x:number,xEnd:number}[], key?:number}[]} lines
 * @param {{kind?: 'bank'|'card', dateOrder?: 'auto'|'dmy'|'mdy', year?: number|null}} [opts]
 */
export function parseStatement(lines, opts = {}) {
  // Some statements print amounts with one decimal when the second is zero.
  const oneDec = lines.filter((l) => l.items.some((i) => /^-?\d[\d,]*\.\d$/.test(i.text.trim()))).length;
  oneDecimal = oneDec >= 2;
  try {
    const r = parseStatementInner(lines, opts);
    if (oneDecimal) r.findings.push({ severity: 'info', title: 'Amounts with one decimal read as money', detail: `${oneDec} lines end in a number with one decimal place (such as 1935.3), so those are read as amounts (1935.30).`, line: null });
    return r;
  } finally { oneDecimal = false; }
}

function parseStatementInner(lines, opts) {
  const findings = [];
  const note = (severity, title, detail, line) => findings.push({ severity, title, detail, line: line || null });
  // Bank or card: as chosen, or from what the statement says about itself.
  let kind = opts.kind === 'card' ? 'card' : opts.kind === 'bank' ? 'bank' : null;
  let detected = false;
  if (!kind) {
    const all = fold(lines.map((l) => l.items.map((i) => i.text).join(' ')).join('\n'));
    const hits = new Set((all.match(CARD_MARKS) || []).map((m) => m.replace(/\s+/g, ' ')));
    kind = hits.size >= 2 ? 'card' : 'bank';
    detected = kind === 'card';
  }
  if (detected) note('info', 'Read as a credit card statement', 'The statement mentions a minimum payment, a payment due date or a credit limit, so a bare amount is read as a charge and a minus sign or CR as a payment. If this is a bank account, choose Bank account as the account type.');

  // A row with no date under the table's columns, after a dated row: many
  // banks print the date once per day. It becomes its own transaction on the
  // date above, if it has a description and an amount that is not zero.
  function carriedRow(words, prev, line) {
    let descEnd = words.length;
    for (let i = 0; i < words.length; i++) if (parseAmountWord(words[i].text) && words.slice(i).every((w) => parseAmountWord(w.text))) { descEnd = i; break; }
    if (descEnd === 0 || descEnd === words.length) return false;
    const amts = words.slice(descEnd).map((w) => ({ ...parseAmountWord(w.text), word: w }));
    if (!amts.some((a) => a.abs > 0)) return false;
    const tol = prev.paste ? 2 : 12;
    if (prev.descX === null || words[0].x < prev.descX - tol || (prev.amtX !== null && words[0].x >= prev.amtX - tol)) return false;
    if (line.page !== prev.page && !prev.cols.length) return false;
    finish();
    current = {
      line: line.lineNo || null, page: line.page, dates: prev.dates, dateText: prev.dateText, carried: true,
      description: words.slice(0, descEnd).map((w) => w.text).join(' '), amts, key: line.key, cols: prev.cols, title: null,
      descX: prev.descX, amtX: amts[0].word.x, paste: Boolean(line.paste),
    };
    return true;
  }

  // 1. Classify every line.
  const rows = [];
  let cols = [];
  let opening = null, closing = null, totalCredit = null, totalDebit = null;
  const datedBalances = [];
  let periodYears = [];
  let periodLines = 0;
  let prevTxnKey = null, prevTxnPage = null;
  let gaps = [];
  let current = null;
  const txns = [];
  const dropped = [];
  let n = 0;

  const finish = () => { if (current) { txns.push(current); current = null; } };
  // Rows above the first table heading are not transactions when the document
  // has one (a statement date over the address, a summary box).
  const firstHeading = lines.findIndex((l) => { const w = wordsOf(l); return w.length && isHeadingLine(w) && headingColumns(w, kind).length; });
  // Same text (digits aside), same place on the page.
  const furnitureKey = (l) => `${Math.round(l.items[0].x / 4)}|${l.key === undefined ? '' : Math.round(l.key / 3)}|${l.items.map((i) => i.text).join(' ').replace(/\d+/g, '#').trim()}`;
  // Page furniture: a line printed once on most pages at the same place (a
  // watermark, "Continued on next page", "Page 2 of 3"). It never joins a row.
  const furniture = new Set();
  {
    const pagesOf = new Map(), perPage = new Map();
    const pageSet = new Set(lines.map((l) => l.page));
    for (const l of lines) {
      if (l.paste || !l.items.length) continue;
      const k = furnitureKey(l);
      if (!pagesOf.has(k)) pagesOf.set(k, new Set());
      pagesOf.get(k).add(l.page);
      perPage.set(`${k}|${l.page}`, (perPage.get(`${k}|${l.page}`) || 0) + 1);
    }
    for (const [k, ps] of pagesOf) {
      if (pageSet.size >= 2 && ps.size >= Math.max(2, Math.ceil(pageSet.size / 2)) && [...ps].every((pg) => perPage.get(`${k}|${pg}`) === 1)) furniture.add(k);
    }
  }
  const isFurniture = (l) => !l.paste && l.items.length && furniture.has(furnitureKey(l));
  let pendingTitle = null;
  const totals = []; // { role: 'credit'|'debit', a, line }

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
    if (/\b(statement|period|through|from|billing|cycle|opening|closing|releve|periode|afschrift|auszug|extracto)\b/i.test(fold(text)) && !leadingDates(words).dates.length) {
      for (const m of text.matchAll(/\b(19|20)\d{2}\b/g)) periodYears.push({ y: Number(m[0]), text });
      periodLines++;
    }

    const lead = leadingDates(words);
    const rest = words.slice(lead.used);
    const restText = rest.map((w) => w.text).join(' ');

    // Balance and total lines, with or without a date in front.
    const ftext = fold(restText || text);
    if (DATED_BALANCE_RE.test(fold(text))) { const a = lastAmount(words); if (a) datedBalances.push({ ...a, line: lineNo }); for (const m of text.matchAll(/\b(19|20)\d{2}\b/g)) periodYears.push({ y: Number(m[0]), text }); finish(); continue; }
    if (OPENING_RE.test(ftext) || CLOSING_RE.test(ftext)) for (const m of text.matchAll(/\b(19|20)\d{2}\b/g)) periodYears.push({ y: Number(m[0]), text });
    if (OPENING_RE.test(ftext)) { const a = lastAmount(rest.length ? rest : words); if (a && !opening) opening = { ...a, line: lineNo }; finish(); continue; }
    if (CLOSING_RE.test(ftext)) { const a = lastAmount(rest.length ? rest : words); if (a) closing = { ...a, line: lineNo }; finish(); continue; }
    if (TOTAL_CREDIT_RE.test(text) || TOTAL_DEBIT_RE.test(text)) {
      // One line can carry both totals ("Total deposits ... Total withdrawals ...").
      const segs = [];
      for (const w of words) { if (/^total/i.test(w.text) || !segs.length) segs.push([]); segs[segs.length - 1].push(w); }
      for (const seg of segs) {
        const st = seg.map((w) => w.text).join(' ');
        const a = lastAmount(seg);
        if (!a) continue;
        if (TOTAL_CREDIT_RE.test(st)) { totals.push({ role: 'credit', a, line: lineNo }); totalCredit = { ...a, line: lineNo }; }
        else if (TOTAL_DEBIT_RE.test(st)) { totals.push({ role: 'debit', a, line: lineNo }); totalDebit = { ...a, line: lineNo }; }
      }
      finish(); continue;
    }

    if (lead.dates.length && firstHeading >= 0 && n - 1 < firstHeading) continue;
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
        description: rest.slice(0, descEnd).map((w) => w.text).join(' '), amts, key: line.key, cols, title: pendingTitle,
        descX: descEnd > 0 ? rest[0].x : null, amtX: amts.length ? amts[0].word.x : null, paste: Boolean(line.paste),
      };
      pendingTitle = null;
      if (prevTxnKey !== null && line.key !== undefined && line.page === prevTxnPage) gaps.push(Math.abs(line.key - prevTxnKey));
      prevTxnKey = line.key === undefined ? null : line.key;
      prevTxnPage = line.page;
      continue;
    }

    // No date: an account's title, a continuation of the open transaction, or noise.
    if (ACCOUNT_TITLE_RE.test(text) && /\d{3,}/.test(text) && !rest.some((w) => parseAmountWord(w.text))) {
      pendingTitle = text.replace(CONTINUED_RE, '').replace(/\s+/g, ' ').trim();
      finish();
      continue;
    }
    const prevTx = current || txns[txns.length - 1] || null;
    if (!current && prevTx && prevTx.cols && prevTx.cols.length && !SKIP_RE.test(text) && !isFurniture(line) && carriedRow(words, prevTx, line)) continue;
    if (current && !SKIP_RE.test(text)) {
      if (current.amts.length && current.cols && current.cols.length && carriedRow(words, current, line)) continue;
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
      // A wrapped description starts under the description, not at the margin
      // (a footer, a page number) or in another column (a totals box).
      const tol = current.paste ? 2 : 12;
      const underDesc = current.descX === null || (words[0].x >= current.descX - tol && (current.amtX === null || words[0].x < current.amtX - tol));
      if (isFurniture(line)) continue;
      if (!underDesc && !trailing.length) { finish(); continue; }
      if (!trailing.length && !allAmts && underDesc) {
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

  if (datedBalances.length >= 2) {
    if (!opening) opening = datedBalances[0];
    if (!closing) closing = datedBalances[datedBalances.length - 1];
  }

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
  // Each row is read with the column headings in force where it sat: a later
  // table (an interest-charges box, a second account) must not relabel it.
  const hasBalanceColFor = (tc) => tc.some((c) => c.role === 'balance') || (!tc.length && modeCount >= 2);

  const sgnDebit = kind === 'card' ? 1 : -1; // movement of the balance for the "debit" heading
  const results = [];
  let guessedSign = 0;
  for (const t of txns) {
    if (!t.amts.length) { dropped.push(t); continue; }
    let move = null, balance = null, role = null;
    const amts = t.amts;
    const tcols = t.cols || [];
    if (tcols.length) {
      for (const a of amts) {
        const c = columnFor(tcols, a.word);
        if (c && c.role === 'balance') balance = a.neg || a.tag === 'DR' ? -a.abs : a.abs;
        else if (move === null) { move = a; role = c ? c.role : null; }
      }
    } else if (amts.length >= 2 && hasBalanceColFor(tcols)) {
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
    t.move = move; t.balance = balance; t.role = role; t.sign = sign; t.source = source; t.titleSeen = t.title;
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
  // Accounts: a new title plus a running balance that does not follow on from
  // the last row starts another account's table.
  const sections = [{ title: null, start: 0 }];
  for (const t of results) {
    let sign = t.sign;
    let source = t.source;
    const abs = t.move.abs;
    const cur = sections[sections.length - 1];
    if (t.title && t.title !== cur.title) {
      if (!tx.length) cur.title = t.title;
      else if (t.balance !== null && (prev === null || Math.abs(t.balance - prev) !== abs)) {
        sections.push({ title: t.title, start: tx.length });
        prev = null;
      }
    }
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
      account: sections.length - 1, line: t.line, page: t.page, dateText: t.dateText, date: dateParts, postDate: postParts, description: t.description.replace(/\s+/g, ' ').trim(),
      delta: sign * abs || 0, amount: (kind === 'card' ? -sign * abs : sign * abs) || 0, balance: t.balance, source,
    });
  }

  // 5. Findings.
  const noDates = tx.filter((t) => !t.date || !t.date.ok);
  if (noDates.length) note('error', `${noDates.length} date${noDates.length === 1 ? '' : 's'} could not be read`, `Not a real calendar day-month with the order used (${order || 'n/a'}): lines ${noDates.slice(0, 8).map((t) => t.line).join(', ')}${noDates.length > 8 ? ', …' : ''}. Try the other date order.`, noDates[0].line);
  const noYear = tx.filter((t) => t.date && t.date.ok && !t.date.y);
  const yearFallback = new Date().getFullYear();
  if (noYear.length) {
    for (const t of noYear) t.date.y = yearFallback;
    for (const t of tx) if (t.postDate && t.postDate.ok && !t.postDate.y) t.postDate.y = yearFallback;
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
  let open = toSigned(opening), close = toSigned(closing);
  const sum = tx.reduce((s, t) => s + t.delta, 0);
  const reconcile = { opening: open, closing: close, sum, expected: null, diff: null, ok: null, sections: null, method: null };
  // Per account: rows, the balance the first row starts from and the last row
  // ends on, and the statement's own totals for that table, when printed.
  sections.forEach((sec, i) => { sec.end = i + 1 < sections.length ? sections[i + 1].start : tx.length; });
  const secOut = sections.filter((sec) => sec.end > sec.start).map((sec, i) => {
    const rows = tx.slice(sec.start, sec.end);
    const first = rows[0], last = rows[rows.length - 1];
    const lastLine = last.line;
    const nextStart = sections.find((x) => x.start >= sec.end && x.end > x.start);
    const nextLine = nextStart ? tx[nextStart.start].line : Infinity;
    const mine = totals.filter((x) => x.line > first.line && x.line < nextLine);
    const tc = mine.filter((x) => x.role === 'credit').pop() || null, td = mine.filter((x) => x.role === 'debit').pop() || null;
    const moneyIn = rows.filter((t) => t.delta > 0).reduce((a, t) => a + t.delta, 0);
    const moneyOut = -rows.filter((t) => t.delta < 0).reduce((a, t) => a + t.delta, 0);
    const breaks = balanceBreaks.filter((b) => b.t.line >= first.line && b.t.line <= lastLine).length;
    const chained = rows.every((t) => t.balance !== null) && !breaks;
    return {
      account: i, title: sec.title, rows: rows.length, firstLine: first.line, lastLine,
      opening: first.balance !== null ? first.balance - first.delta : null, closing: last.balance, moneyIn, moneyOut,
      totalIn: tc ? tc.a.abs : null, totalOut: td ? td.a.abs : null, chained,
      totalsAgree: tc && td ? tc.a.abs === moneyIn && td.a.abs === moneyOut : null,
    };
  });
  if (secOut.length > 1) {
    // Several accounts: a statement-wide opening and closing cannot prove them,
    // so each is proved on its own, by an unbroken running balance and its totals.
    reconcile.sections = secOut;
    reconcile.method = 'sections';
    const proved = secOut.filter((x) => x.chained && x.totalsAgree === true).length;
    reconcile.ok = secOut.every((x) => x.chained && x.totalsAgree !== false) ? (proved === secOut.length ? true : null) : false;
    note(reconcile.ok === false ? 'error' : 'info', `${secOut.length} accounts in this statement`, secOut.map((x) => `${x.title || `Account ${x.account + 1}`}: ${x.rows} rows (lines ${x.firstLine}-${x.lastLine}), balance ${x.opening === null ? '?' : money(x.opening)} to ${x.closing === null ? '?' : money(x.closing)}; running balance ${x.chained ? 'unbroken' : 'broken'}${x.totalsAgree === null ? ', no totals printed to check' : x.totalsAgree ? ', money in and out agree with the printed totals' : `, printed totals ${money(x.totalIn ?? 0)} in and ${money(x.totalOut ?? 0)} out but the rows give ${money(x.moneyIn)} and ${money(x.moneyOut)}`}`).join('. ') + '. Each account is its own CSV: pick it below before downloading for Xero or QuickBooks.');
    open = null; close = null;
  } else if ((open === null || close === null) && secOut.length === 1 && secOut[0].chained && secOut[0].totalsAgree === true) {
    // No opening or closing line, but every row carries a balance that follows
    // on from the one before and the printed totals match the rows.
    reconcile.sections = secOut;
    reconcile.method = 'totals';
    reconcile.ok = true;
    note('info', 'Running balance and totals agree', `There is no opening or closing balance line, but every row's balance follows from the one before (from ${money(secOut[0].opening)} to ${money(secOut[0].closing)}) and the money in and out match the statement's printed totals.`);
  }
  if (reconcile.method) { /* proved above */ } else if (open !== null && close !== null) {
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
  } else if (!reconcile.method) {
    note('warning', 'No opening and closing balance found', `${open === null ? 'No opening balance' : 'No closing balance'} was found (labels such as "Beginning balance", "Previous balance", "Ending balance", "New balance"), so the total cannot be proved against the statement. The rows below are what was read, unchecked.`);
  }
  if (totalCredit && kind === 'bank' && reconcile.method !== 'sections') {
    const got = tx.filter((t) => t.delta > 0).reduce((s, t) => s + t.delta, 0);
    if (got !== totalCredit.abs) note('warning', 'Money-in total differs from the statement', `The statement's total of ${money(totalCredit.abs)} (line ${totalCredit.line}) is not the ${money(got)} read from the rows.`, totalCredit.line);
  }
  if (totalDebit && kind === 'bank' && reconcile.method !== 'sections') {
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
  // A statement holding several accounts: Xero and QuickBooks import one
  // account at a time, so o.account picks one; the generic and split layouts
  // otherwise carry an Account column.
  const secs = result.reconcile && result.reconcile.sections && result.reconcile.method === 'sections' ? result.reconcile.sections : null;
  const pick = secs && o.account !== undefined && o.account !== null && o.account !== '' ? Number(o.account) : null;
  const rows = pick === null ? result.transactions : result.transactions.filter((t) => t.account === pick);
  const date = (t) => formatDate(t.date, style);
  let out;
  if (secs && pick === null && (layout === 'generic' || layout === 'split')) {
    const name = (t) => (secs[t.account] && secs[t.account].title) || `Account ${t.account + 1}`;
    out = layout === 'split'
      ? [csvRow(['Account', 'Date', 'Description', 'Debit', 'Credit', 'Balance'])].concat(rows.map((t) => csvRow([name(t), date(t), t.description, t.amount < 0 ? f(-t.amount) : '', t.amount > 0 ? f(t.amount) : '', t.balance === null ? '' : f(t.balance)])))
      : [csvRow(['Account', 'Date', 'Description', 'Amount', 'Balance'])].concat(rows.map((t) => csvRow([name(t), date(t), t.description, f(t.amount), t.balance === null ? '' : f(t.balance)])));
    return `${out.join('\r\n')}\r\n`;
  }
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
