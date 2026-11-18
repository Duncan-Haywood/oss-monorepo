// Bank-download files (OFX, QFX, QBO, QIF) from a read statement, and several
// statements stitched into one proved run.
//
// A statement read by calc.mjs is already proved against its own balances.
// Two things are added here:
//
// 1. Files that Quicken, QuickBooks Desktop, QuickBooks Online (Web Connect),
//    Xero, Moneydance, GnuCash and most bookkeeping tools open as a bank
//    download. Each transaction gets a FITID built from its date, amount and
//    description (plus a counter for identical rows on one day), so the same
//    row read from two overlapping statements gets the same id and the
//    importer skips it the second time. The ledger balance is written only
//    when the statement proved it.
//
// 2. stitch(): a year of monthly statements into one run, ordered by date,
//    with each statement's closing balance checked against the next one's
//    opening balance. A month that is missing shows up as a break of exactly
//    that month's net movement; the same statement chosen twice, or two
//    downloads that overlap, are found and kept once.
//
// Everything is integer cents; nothing here touches the network.

const fnv = (str) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
};
const pad = (n, w = 2) => String(n).padStart(w, '0');
const ymd = (d) => `${pad(d.y, 4)}${pad(d.m)}${pad(d.d)}`;
const dayKey = (d) => (d && d.ok && d.y ? d.y * 10000 + d.m * 100 + d.d : null);
const cents = (c) => { const neg = c < 0, a = Math.abs(c); return `${neg ? '-' : ''}${Math.floor(a / 100)}.${pad(a % 100)}`; };
const normDesc = (s) => String(s || '').toUpperCase().replace(/\s+/g, ' ').trim();
// OFX 1.02 is SGML in a single-byte charset: escape the three markup
// characters and fold accents to ASCII so "Café" imports as "Cafe", not "Caf?".
const ofxText = (s) => String(s).normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim()
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/[^\x20-\x7e]/g, '?');

/** Opening and closing for one account of a read statement, signed as the
 * statement prints them (a card's balance is what is owed), and whether the
 * statement proved them. */
export function accountsOf(result) {
  const r = result.reconcile || {};
  const kind = result.kind === 'card' ? 'card' : 'bank';
  if (r.method === 'sections' && r.sections) {
    return r.sections.map((s) => ({
      account: s.account, title: s.title || `Account ${s.account + 1}`, kind,
      opening: s.opening, closing: s.closing, proved: s.chained && s.totalsAgree !== false,
      transactions: result.transactions.filter((t) => t.account === s.account),
    }));
  }
  return [{
    account: 0, title: null, kind,
    opening: r.opening ?? null, closing: r.closing ?? null, proved: r.ok === true,
    transactions: result.transactions,
  }];
}

function pickAccount(result, account) {
  const accts = accountsOf(result);
  if (accts.length === 1) return accts[0];
  if (account === null || account === undefined || account === '') throw new Error(`This statement holds ${accts.length} accounts; a bank file holds one. Pick the account first.`);
  const a = accts.find((x) => x.account === Number(account));
  if (!a) throw new Error(`No account ${account} in this statement.`);
  return a;
}

/** The balance a bank file reports, and where it came from: 'printed' (the
 * statement's closing), 'computed' (opening plus the rows) or 'rows' (the
 * rows' net alone, when the statement printed no balance at all). */
export function ledgerBalance(a) {
  if (a.closing !== null && a.closing !== undefined) return { cents: a.closing, from: 'printed' };
  const net = a.transactions.reduce((s, t) => s + (t.delta ?? t.amount), 0);
  if (a.opening !== null && a.opening !== undefined) return { cents: a.opening + net, from: 'computed' };
  return { cents: net, from: 'rows' };
}

/** Transaction type from the description, as OFX names them. */
export function trnType(amount, desc) {
  const d = normDesc(desc);
  if (/\bATM\b|CASH WITHDRAWAL/.test(d)) return 'ATM';
  if (/^CHECK\b|^CHEQUE\b|\bCHECK (NO\.? ?)?#?\d+/.test(d)) return 'CHECK';
  if (/\bINTEREST\b/.test(d)) return amount > 0 ? 'INT' : 'FEE';
  if (/\bDIVIDEND\b/.test(d)) return 'DIV';
  if (/\b(SERVICE CHARGE|MONTHLY FEE|SERVICE FEE|ANNUAL (MEMBERSHIP )?FEE|LATE FEE|OVERDRAFT)\b|\bFEE\b/.test(d) && amount < 0) return 'SRVCHG';
  if (/\bDIRECT DEP(OSIT)?\b|\bPAYROLL\b/.test(d) && amount > 0) return 'DIRECTDEP';
  if (/\bACH DEBIT\b|\bDIRECT DEBIT\b|\bAUTOPAY\b/.test(d) && amount < 0) return 'DIRECTDEBIT';
  if (/\bTRANSFER\b|\bXFER\b/.test(d)) return 'XFER';
  if (/\b(CARD PURCHASE|POS|DEBIT CARD|PURCHASE)\b/.test(d) && amount < 0) return 'POS';
  return amount < 0 ? 'DEBIT' : 'CREDIT';
}

/** Stable ids: the same row on the same day gets the same id in every file
 * written from any statement that contains it. */
export function fitids(transactions) {
  const seen = new Map();
  return transactions.map((t) => {
    const key = `${ymd(t.date)}|${t.amount}|${normDesc(t.description)}`;
    const n = (seen.get(key) || 0) + 1;
    seen.set(key, n);
    return `${ymd(t.date)}${fnv(key)}${n > 1 ? `-${n}` : ''}`;
  });
}

const checkNumber = (desc) => { const m = /^(?:CHECK|CHEQUE|CHK)\s*(?:NO\.?\s*|#\s*)?(\d{1,9})\b/i.exec(String(desc).trim()); return m ? m[1] : ''; };

/**
 * An OFX 1.02 bank download. format: 'ofx' | 'qfx' | 'qbo' (the same SGML;
 * QFX and QBO add Intuit's INTU.BID when one is given). Options: account (for
 * a statement with several), accountId, routing, accountType
 * ('checking' | 'savings' | 'moneymrkt'), currency, org, fid, intuBid, now.
 * Throws when a date has no year or the statement has no rows.
 */
export function toOfx(result, o = {}) {
  const a = pickAccount(result, o.account);
  const tx = a.transactions;
  if (!tx.length) throw new Error('There are no transactions to write.');
  const bad = tx.find((t) => !dayKey(t.date));
  if (bad) throw new Error(`Line ${bad.line} has no full date ("${bad.dateText}"); enter the statement year and read it again.`);
  const card = a.kind === 'card';
  const ids = fitids(tx);
  const order = tx.map((t, i) => i).sort((i, j) => dayKey(tx[i].date) - dayKey(tx[j].date) || i - j);
  // The range covers both the transaction and the posting dates, so no
  // DTPOSTED falls outside DTSTART..DTEND.
  const posted = (t) => (t.postDate && dayKey(t.postDate) ? t.postDate : t.date);
  const span = tx.flatMap((t) => [t.date, posted(t)]).sort((x, y) => dayKey(x) - dayKey(y));
  const first = span[0], last = span[span.length - 1];
  const now = (o.now || new Date().toISOString()).replace(/[-:T]/g, '').slice(0, 14);
  const acctId = ofxText(o.accountId || '0000').replace(/\s/g, '').slice(0, 22) || '0000';
  const cur = /^[A-Z]{3}$/i.test(o.currency || '') ? o.currency.toUpperCase() : 'USD';
  const type = { checking: 'CHECKING', savings: 'SAVINGS', moneymrkt: 'MONEYMRKT' }[o.accountType] || 'CHECKING';
  const bid = (o.format === 'qfx' || o.format === 'qbo') && /^\d{1,10}$/.test(String(o.intuBid || '').trim()) ? String(o.intuBid).trim() : '';
  const out = [
    'OFXHEADER:100', 'DATA:OFXSGML', 'VERSION:102', 'SECURITY:NONE', 'ENCODING:USASCII', 'CHARSET:1252', 'COMPRESSION:NONE', 'OLDFILEUID:NONE', 'NEWFILEUID:NONE', '',
    '<OFX>',
    '<SIGNONMSGSRSV1>', '<SONRS>', '<STATUS>', '<CODE>0', '<SEVERITY>INFO', '</STATUS>', `<DTSERVER>${now}`, '<LANGUAGE>ENG',
    '<FI>', `<ORG>${ofxText(o.org || 'Statement')}`, `<FID>${ofxText(o.fid || bid || '0000')}`, '</FI>',
    ...(bid ? [`<INTU.BID>${bid}`] : []),
    '</SONRS>', '</SIGNONMSGSRSV1>',
    ...(card
      ? ['<CREDITCARDMSGSRSV1>', '<CCSTMTTRNRS>', '<TRNUID>1', '<STATUS>', '<CODE>0', '<SEVERITY>INFO', '</STATUS>', '<CCSTMTRS>', `<CURDEF>${cur}`, '<CCACCTFROM>', `<ACCTID>${acctId}`, '</CCACCTFROM>']
      : ['<BANKMSGSRSV1>', '<STMTTRNRS>', '<TRNUID>1', '<STATUS>', '<CODE>0', '<SEVERITY>INFO', '</STATUS>', '<STMTRS>', `<CURDEF>${cur}`, '<BANKACCTFROM>', `<BANKID>${/^\d{9}$/.test(o.routing || '') ? o.routing : '000000000'}`, `<ACCTID>${acctId}`, `<ACCTTYPE>${type}`, '</BANKACCTFROM>']),
    '<BANKTRANLIST>', `<DTSTART>${ymd(first)}120000`, `<DTEND>${ymd(last)}120000`,
  ];
  for (const i of order) {
    const t = tx[i];
    const desc = String(t.description || '').replace(/\s+/g, ' ').trim() || (t.amount < 0 ? 'Debit' : 'Credit');
    const chk = checkNumber(desc);
    out.push('<STMTTRN>', `<TRNTYPE>${trnType(t.amount, desc)}`, `<DTPOSTED>${ymd(posted(t))}120000`);
    if (t.postDate && dayKey(t.postDate)) out.push(`<DTUSER>${ymd(t.date)}120000`);
    out.push(`<TRNAMT>${cents(t.amount)}`, `<FITID>${ids[i]}`);
    if (chk) out.push(`<CHECKNUM>${chk}`);
    out.push(`<NAME>${ofxText(desc).slice(0, 32)}`);
    if (desc.length > 32) out.push(`<MEMO>${ofxText(desc).slice(0, 255)}`);
    out.push('</STMTTRN>');
  }
  out.push('</BANKTRANLIST>');
  // OFX requires a ledger balance (strict readers such as ofxtools refuse a
  // statement without one). It is the statement's printed closing balance;
  // with none printed, the opening plus the rows; with neither, the rows' net.
  // A card's balance owed is a negative account balance.
  const ledger = ledgerBalance(a);
  out.push('<LEDGERBAL>', `<BALAMT>${cents(card ? -ledger.cents : ledger.cents)}`, `<DTASOF>${ymd(last)}120000`, '</LEDGERBAL>');
  out.push(...(card ? ['</CCSTMTRS>', '</CCSTMTTRNRS>', '</CREDITCARDMSGSRSV1>'] : ['</STMTRS>', '</STMTTRNRS>', '</BANKMSGSRSV1>']), '</OFX>');
  return `${out.join('\r\n')}\r\n`;
}

/** QIF for tools that still read it (older Quicken, GnuCash, some
 * bookkeeping apps). dateStyle 'mdy' (US Quicken, default) or 'dmy'. */
export function toQif(result, o = {}) {
  const a = pickAccount(result, o.account);
  const tx = a.transactions;
  if (!tx.length) throw new Error('There are no transactions to write.');
  const bad = tx.find((t) => !dayKey(t.date));
  if (bad) throw new Error(`Line ${bad.line} has no full date ("${bad.dateText}"); enter the statement year and read it again.`);
  const order = tx.map((t, i) => i).sort((i, j) => dayKey(tx[i].date) - dayKey(tx[j].date) || i - j);
  const out = [a.kind === 'card' ? '!Type:CCard' : '!Type:Bank'];
  for (const i of order) {
    const t = tx[i], d = t.date;
    const desc = String(t.description || '').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
    out.push(o.dateStyle === 'dmy' ? `D${pad(d.d)}/${pad(d.m)}/${d.y}` : `D${pad(d.m)}/${pad(d.d)}/${d.y}`, `T${cents(t.amount)}`);
    const chk = checkNumber(desc);
    if (chk) out.push(`N${chk}`);
    out.push(`P${desc.slice(0, 64)}`);
    if (desc.length > 64) out.push(`M${desc}`);
    out.push('^');
  }
  return `${out.join('\r\n')}\r\n`;
}

/**
 * Several read statements of one account, stitched in date order.
 * items: [{ name, result }]. Returns a result shaped like calc.mjs's (so
 * toCsv, toOfx and toQif take it) with `statements` (one row per statement,
 * in order) and `breaks` (where a closing balance does not meet the next
 * opening balance). Statements holding several accounts are refused: pick
 * one account in each first.
 */
export function stitch(items) {
  const findings = [];
  const note = (severity, title, detail) => findings.push({ severity, title, detail, line: null });
  const usable = [];
  for (const it of items) {
    const accts = accountsOf(it.result);
    if (accts.length > 1) { note('error', `${it.name}: several accounts`, `${it.name} holds ${accts.length} accounts. Stitching joins statements of one account; convert this one on its own.`); continue; }
    const a = accts[0];
    const days = a.transactions.map((t) => dayKey(t.date)).filter(Boolean);
    if (!a.transactions.length || days.length < a.transactions.length) { note('error', `${it.name}: no rows with full dates`, `${it.name} gave ${a.transactions.length} rows${days.length < a.transactions.length ? ', some without a year' : ''}; it is left out.`); continue; }
    usable.push({ name: it.name, result: it.result, a, from: Math.min(...days), to: Math.max(...days), sig: a.transactions.map((t) => `${dayKey(t.date)}|${t.amount}|${normDesc(t.description)}`) });
  }
  const kinds = new Set(usable.map((u) => u.a.kind));
  if (kinds.size > 1) note('warning', 'Bank and card statements mixed', 'Some statements read as a bank account and some as a credit card. A bank file holds one account: choose the account type and read them again.');
  usable.sort((x, y) => x.from - y.from || x.to - y.to);

  // The same statement chosen twice: identical rows, identical balances.
  const kept = [];
  for (const u of usable) {
    const twin = kept.find((k) => k.sig.length === u.sig.length && k.sig.every((s, i) => s === u.sig[i]) && k.a.opening === u.a.opening && k.a.closing === u.a.closing);
    if (twin) { note('warning', `${u.name} is the same statement as ${twin.name}`, `Every row and both balances match, so it is counted once.`); continue; }
    kept.push(u);
  }

  const tx = [];
  const statements = [];
  const breaks = [];
  let prev = null;
  for (const u of kept) {
    let rows = u.a.transactions;
    let dropped = 0;
    if (prev && u.from <= prev.to) {
      // Overlap: rows of this statement already in the run (same day, amount
      // and description, counted with multiplicity) are dropped.
      const have = new Map();
      for (const t of tx) { const k = `${dayKey(t.date)}|${t.amount}|${normDesc(t.description)}`; if (dayKey(t.date) >= u.from) have.set(k, (have.get(k) || 0) + 1); }
      rows = rows.filter((t) => { const k = `${dayKey(t.date)}|${t.amount}|${normDesc(t.description)}`; const n = have.get(k) || 0; if (n > 0 && dayKey(t.date) <= prev.to) { have.set(k, n - 1); dropped++; return false; } return true; });
      if (dropped) note('info', `${u.name} overlaps ${prev.name}`, `${dropped} row${dropped === 1 ? '' : 's'} dated up to ${fmtDay(prev.to)} ${dropped === 1 ? 'was' : 'were'} already read from ${prev.name} and ${dropped === 1 ? 'is' : 'are'} kept once.`);
    }
    if (prev && prev.a.closing !== null && u.a.opening !== null && !dropped) {
      const gap = u.a.opening - prev.a.closing;
      if (gap !== 0) {
        breaks.push({ after: prev.name, before: u.name, closing: prev.a.closing, opening: u.a.opening, gap, from: prev.to, to: u.from });
        note('error', `Gap between ${prev.name} and ${u.name}: ${cents(Math.abs(gap))}`, `${prev.name} closes at ${cents(prev.a.closing)} but ${u.name} opens at ${cents(u.a.opening)}, a movement of ${cents(gap)} between ${fmtDay(prev.to)} and ${fmtDay(u.from)} that no chosen statement holds. A statement between them is probably missing.`);
      }
    }
    for (const t of rows) tx.push({ ...t, file: u.name, account: 0 });
    statements.push({ name: u.name, from: u.from, to: u.to, rows: rows.length, dropped, opening: u.a.opening, closing: u.a.closing, proved: u.a.proved });
    if (!u.a.proved) note('warning', `${u.name} is not proved`, `${u.name} did not prove its rows against its own balances; open it on its own to see why before relying on the joined file.`);
    prev = u;
  }
  const opening = kept.length ? kept[0].a.opening : null;
  const closing = kept.length ? kept[kept.length - 1].a.closing : null;
  const sum = tx.reduce((s, t) => s + (t.delta ?? t.amount), 0);
  const allProved = kept.length > 0 && kept.every((u) => u.a.proved);
  const expected = opening === null ? null : opening + sum;
  const diff = expected === null || closing === null ? null : closing - expected;
  const ok = allProved && !breaks.length && diff === 0 ? true : breaks.length || (diff !== null && diff !== 0) ? false : null;
  if (ok) note('info', `${kept.length} statements join up`, `Each statement adds up on its own and each one opens where the one before it closed: ${cents(opening)} to ${cents(closing)} over ${tx.length} rows, ${fmtDay(kept[0].from)} to ${fmtDay(kept[kept.length - 1].to)}.`);
  const order_ = { error: 0, warning: 1, info: 2 };
  findings.sort((x, y) => order_[x.severity] - order_[y.severity]);
  return {
    findings, transactions: tx, statements, breaks, kind: kept[0] ? kept[0].a.kind : 'bank',
    reconcile: { opening, closing, sum, expected, diff, ok, sections: null, method: null },
  };
}

function fmtDay(k) { return `${Math.floor(k / 10000)}-${pad(Math.floor(k / 100) % 100)}-${pad(k % 100)}`; }
