// OFX / QFX / QBO and QIF statement reading: the formats banks offer next to
// CSV ("Download for Quicken / QuickBooks / Money"). Same row shape as
// bank.mjs readStatement: { line, date, desc, cents, balance } with money INTO
// the account positive. Pure functions, no DOM, no network.

const ENTITIES = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'" };
const unesc = (s) => s.replace(/&(amp|lt|gt|quot|apos);/g, (m) => ENTITIES[m]).replace(/\s+/g, " ").trim();

export function isOfx(text) {
  return /<OFX[\s>]/i.test(text) || /^\s*OFXHEADER:/i.test(text);
}
export function isQif(text) {
  return /^\s*!(Type|Account|Option):/i.test(text);
}

// "-1,234.56", "1234,56" (comma as decimal when there is no dot), "(12.00)".
function cents(v) {
  let s = String(v ?? "").trim();
  const neg = /^\(.*\)$/.test(s) || /^[^0-9]*[-−]/.test(s);
  s = s.replace(/[^0-9.,]/g, "");
  if (/^\d+,\d{1,2}$/.test(s)) s = s.replace(",", ".");
  else s = s.replace(/,/g, "");
  const n = Number(s);
  if (!s || !Number.isFinite(n)) return NaN;
  const c = Math.round(n * 100);
  return neg ? -c : c;
}

function isoFromOfx(v) {
  const m = String(v ?? "").match(/^(\d{4})(\d{2})(\d{2})/);
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCMonth() === +m[2] - 1 ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

// Value of a tag in a block: SGML (`<TAG>value` ended by a newline or the next
// tag) and XML (`<TAG>value</TAG>`) both read the same way.
function tag(block, name) {
  const m = block.match(new RegExp(`<${name}>([^<\\r\\n]*)`, "i"));
  return m ? unesc(m[1]) : null;
}

// -> { rows, problems, columns: null, bank: "ofx", inferred: null, statement, account }
// `statement` is the bank's own closing balance { cents, date } when the file
// has one (LEDGERBAL), in the file's sign: what you own positive, what a card
// owes negative, which is how the books keep balances.
export function readOfx(text) {
  const s = String(text).replace(/^﻿/, "");
  const problems = [];
  const stmts = (s.match(/<(CC)?STMTRS>/gi) ?? []).length;
  if (stmts > 1) problems.push(`The file holds ${stmts} accounts; all their lines were read into this one. Download one account at a time to keep them apart.`);
  const out = [];
  const blocks = s.split(/<STMTTRN>/i).slice(1);
  blocks.forEach((b, i) => {
    b = b.split(/<\/STMTTRN>|<\/BANKTRANLIST>|<\/CCSTMTRS>|<\/STMTRS>/i)[0];
    const date = isoFromOfx(tag(b, "DTPOSTED") ?? tag(b, "DTUSER"));
    const amt = tag(b, "TRNAMT");
    if (!date) { problems.push(`Transaction ${i + 1}: unreadable date, skipped.`); return; }
    const c = cents(amt);
    if (!Number.isFinite(c)) { problems.push(`Transaction ${i + 1}: unreadable amount "${amt ?? ""}", skipped.`); return; }
    if (c === 0) return;
    const name = tag(b, "NAME") ?? tag(b, "PAYEE") ?? "";
    const memo = tag(b, "MEMO") ?? "";
    let desc = name;
    if (memo && !name.toLowerCase().includes(memo.toLowerCase())) desc = name ? `${name} ${memo}` : memo;
    const check = tag(b, "CHECKNUM");
    if (check && !/check|chk/i.test(desc)) desc = `${desc} CHECK ${check}`.trim();
    out.push({ line: i + 1, date, desc: desc.trim(), cents: c, balance: null });
  });
  if (blocks.length === 0) problems.push("No transactions were found in the OFX file.");
  const lb = s.match(/<LEDGERBAL>([\s\S]*?)(<\/LEDGERBAL>|<AVAILBAL>|<\/STMTRS>|<\/CCSTMTRS>|$)/i);
  let statement = null;
  if (lb) {
    const bal = cents(tag(lb[1], "BALAMT")), date = isoFromOfx(tag(lb[1], "DTASOF"));
    if (Number.isFinite(bal) && date) statement = { cents: bal, date };
  }
  return { rows: out, problems, columns: null, bank: "ofx", inferred: null, statement, account: tag(s, "ACCTID") };
}

function qifDate(v, dayFirst) {
  // 1/ 5'26, 01/05/2026, 5.1.26 and 2026-01-05
  const t = String(v).replace(/\s+/g, "").replace("'", "/");
  let m = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/), y, a, b;
  if (m) [y, a, b] = [+m[1], +m[2], +m[3]];
  else if ((m = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/))) {
    [a, b] = dayFirst ? [+m[2], +m[1]] : [+m[1], +m[2]];
    y = +m[3] < 100 ? 2000 + +m[3] : +m[3];
  } else return null;
  const d = new Date(Date.UTC(y, a - 1, b));
  if (a > 12 || d.getUTCMonth() !== a - 1) return null;
  return d.toISOString().slice(0, 10);
}

// -> same shape as readOfx without `statement`. Bank, CCard, Cash and Oth A/L
// accounts are read; investment and memorised-payee sections are skipped.
export function readQif(text, { dayFirst = false } = {}) {
  const lines = String(text).replace(/^﻿/, "").split(/\r\n|\r|\n/);
  const problems = [];
  const out = [];
  let section = "bank", rec = {};
  const skipped = new Set();
  const flush = (at) => {
    if (!Object.keys(rec).length) return;
    const r = rec; rec = {};
    if (!/^(bank|ccard|cash|oth a|oth l)/.test(section)) { skipped.add(section); return; }
    const date = qifDate(r.D ?? "", dayFirst);
    if (!date) { problems.push(`Line ${at}: unreadable date "${r.D ?? ""}", skipped.`); return; }
    const c = cents(r.T ?? r.U);
    if (!Number.isFinite(c)) { problems.push(`Line ${at}: unreadable amount, skipped.`); return; }
    if (c === 0) return;
    let desc = unesc(r.P ?? "");
    const memo = unesc(r.M ?? "");
    if (memo && !desc.toLowerCase().includes(memo.toLowerCase())) desc = desc ? `${desc} ${memo}` : memo;
    if (r.N && !/check|chk/i.test(desc)) desc = `${desc} CHECK ${r.N.trim()}`.trim();
    out.push({ line: at, date, desc, cents: c, balance: null });
  };
  lines.forEach((l, i) => {
    if (!l) return;
    if (l[0] === "!") { flush(i + 1); const m = l.match(/^!Type:\s*(.*)$/i); if (m) section = m[1].trim().toLowerCase(); return; }
    if (l[0] === "^") { flush(i + 1); return; }
    if (rec[l[0]] === undefined) rec[l[0]] = l.slice(1);
  });
  flush(lines.length);
  if (skipped.size) problems.push(`Skipped QIF sections this tool does not read: ${[...skipped].join(", ")}.`);
  if (out.length === 0 && !problems.length) problems.push("No transactions were found in the QIF file.");
  return { rows: out, problems, columns: null, bank: "qif", inferred: null };
}
