// Receipts matched to bank lines. Paste the text of receipts (typed, copied
// from an email, or read off a photo by any OCR tool) and each one is parsed
// into a merchant, a date, a total and a tax amount, then paired with the bank
// or card line that paid it. What is left over is the useful part:
//   unmatched receipts - paid some other way, or a line not imported yet
//   missing receipts   - spending at or over `minCents` with no receipt on file
//   duplicate receipts - the same merchant, date and total twice
// Integer cents. Receipts are kept in books.receipts and never change the
// journal. A heuristic: text is read with regular expressions, so the output
// says what it read and a person confirms. `attach` pins a pair by hand.
// Not a statement of what any tax authority requires you to keep.

import { parseCents, parseDate } from "./bank.mjs";
import { payeeTokens, suggest, historyRecord } from "./categorize.mjs";
import { accountMap } from "./ledger.mjs";
import { cleanOcr } from "./cleanocr.mjs";
import { modelFor, confirm } from "./engine.mjs";

const day = (d) => Math.floor(Date.parse(`${d}T00:00:00Z`) / 86400000);
const MONEY = /(?:[$£€]\s*)?(\d{1,3}(?:,\d{3})+\.\d{2}|\d+\.\d{2})(?!\d)/g;
// Decimal-comma receipts (12,50 / 1.234,56), common across continental Europe.
const MONEY_C = /(?:[$£€]\s*)?(\d{1,3}(?:\.\d{3})+,\d{2}|\d+,\d{2})(?!\d)/g;
const DOTDATE = /\b\d{1,2}\.\d{1,2}\.(?:\d{4}|\d{2})\b/g;
// A receipt is decimal-comma when it has more amounts written 12,50 than 12.50
// (day.month.year dates are not amounts).
export function commaStyle(text) {
  const t = String(text).replace(DOTDATE, " ");
  return (t.match(MONEY_C) ?? []).length > (t.match(MONEY) ?? []).length;
}
// Whole-unit receipts (Indonesian rupiah, yen, won): 45,500 or 60.000 with no
// decimals, or plain 91000. Grouped amounts use one separator throughout; a
// number glued to letters ("PB1", "xx7730"), a percentage or part of a date,
// time or phone number is not an amount.
const RP = /\bRp\.?\s*/gi;
const CUR_WORD = /\b(?:rm|myr|sgd|usd|aud|gbp|eur|inr)(?![a-z])\.?/gi;
const GROUPED = /(?<![\p{L}\d.,\/-])\d{1,3}([.,])\d{3}(?:\1\d{3})*(?![.,]?\d|[%\/-]\d|:\d)/gu;
const WHOLE = /(?:[¥₩]\s*)?(?<![\p{L}\d.,\/:-])(\d{1,3}(?:([.,])\d{3}(?:\2\d{3})*)?|\d+)(?![.,]?\d|%|[\/:-]\d)/gu;
// Used when grouped whole amounts outnumber amounts with decimals, or when
// there are no decimals at all and some number of three or more digits.
export function wholeStyle(text) {
  const t = String(text).replace(DOTDATE, " ").replace(RP, " ");
  const decimals = (t.match(MONEY) ?? []).length + (t.match(MONEY_C) ?? []).length;
  const grouped = (t.match(GROUPED) ?? []).length;
  return grouped > decimals || (decimals === 0 && /(?<![\p{L}\d.,\/:-])\d{3,}(?![.,]?\d|%|[\/:-]\d)/u.test(t));
}
// style: false (12.50), true (12,50) or "whole" (12,500 / 12.500 / 12500)
const moneyRe = (style) => (style === "whole" ? WHOLE : style ? MONEY_C : MONEY);
const DATE_RES = [
  /\b(\d{4}-\d{1,2}-\d{1,2})\b/,
  /(?<![\d/])(\d{4}\/\d{1,2}\/\d{1,2})(?!\d)/,
  /(?<![\d/])(\d{1,2}\/\d{1,2}\/(?:\d{4}|\d{2}))(?!\d)/,
  /\b(\d{1,2}\.\d{1,2}\.(?:\d{4}|\d{2}))\b/,
  /(?<![\d-])(\d{1,2}-\d{1,2}-(?:\d{4}|\d{2}))(?![\d-])/,
  /\b((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.? \d{1,2},? \d{4})\b/i,
  /\b(\d{1,2} (?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?,? (?:\d{4}|\d{2}))(?!\d)/i,
];
const TOTAL_RE = /\b(grand\s+total|total\s+(?:due|paid|charged|amount)|amount\s+(?:due|paid|charged)|balance\s+due|order\s+total|grandtotal|gesamt(?:betrag)?|summe|totale|totaal|total|netto|jumlah|due|tl)\b/i;
const NOT_TOTAL_RE = /accepted\s+total|total\s+tender|total\s+includ\w*\s+(?:gst|tax|vat)\s*@|total[^a-z]*(?:sales\s*)?\(?[^a-z]*(?:excl|before\s+(?:gst|tax))|total\s+(?:gst|tax|vat)\b|total\s+includ(?:es|ed|ing)\b[^a-z]*\d*\s*%|(?:gst|tax|vat)\b[^a-z]*\d*\s*%?\s*includ(?:es|ed)?\s+in\s+(?:the\s+)?total|sub\s*-?total|zwischensumme|sous-total|total\s+(?:savings|discount|items?|qty|quantity|pcs|tax|points|sv|gv|ev|qu)\b|tax\s+total|before\s+tax|tip\b|change\b|cash\b/i;
const TAX_RE = /\b(sales\s+tax|tax|vat|gst|hst|pst|tva|mwst|iva|btw|ppn|pb\s*1|pajak|p\.\s*rest(?:o|oran)?)\b/i;
// "Tax Total" is the tax, not the total; "Dasar Pengenaan Pajak" (DPP) is the taxable base
const TAX_TOTAL_RE = /tax\s+total|total\s+tax/i;
const NOT_TAX_RE = /dasar\s+pengenaan|\bdpp\b/i;

// Currency printed on a receipt: an unambiguous symbol or a three-letter code
// beside an amount. A bare "$" says nothing (USD, CAD, AUD all use it), so it
// returns null and the receipt is read in the books' currency.
const SYMBOL_CUR = { "€": "EUR", "£": "GBP", "¥": "JPY", "₹": "INR", "₩": "KRW", "₪": "ILS", "R$": "BRL", "CHF": "CHF" };
const CODES = "EUR|GBP|USD|CAD|AUD|NZD|CHF|JPY|SEK|NOK|DKK|PLN|CZK|MXN|BRL|INR|SGD|HKD|ZAR";
export function detectCurrency(lines) {
  const counts = new Map();
  const bump = (c) => counts.set(c, (counts.get(c) ?? 0) + 1);
  for (const l of lines) {
    for (const m of l.matchAll(/(R\$|[€£¥₹₩₪])\s*\d/g)) bump(SYMBOL_CUR[m[1]]);
    for (const m of l.matchAll(new RegExp(`\\b(${CODES})\\b\\s*\\d|\\d[\\d.,]*\\s*\\b(${CODES})\\b`, "g"))) bump(m[1] ?? m[2]);
  }
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}
// books.currency is a code ("USD") or a symbol ("$"); compare as codes
const bookCode = (books) => { const c = String(books.currency ?? "USD").trim(); return SYMBOL_CUR[c] ?? (c === "$" ? "USD" : c.toUpperCase()); };

// On a whole-unit slip OCR often prints a dash before an amount ("CASH -50,000", "AIR
// MINERAL -7,000": CORD photos), which WHOLE does not read through; this drops it.
const undashWhole = (l, style) => (style === "whole" && l ? l.replace(/(^|\s)[-–—~]\s*(?=\d)/g, "$1") : l);
const amountsIn = (line, style = false) => (style === "whole"
  ? [...line.replace(RP, " ").matchAll(WHOLE)].map((m) => Number(m[1].replace(/[.,]/g, "")) * 100).filter((c) => Number.isSafeInteger(c))
  : [...line.matchAll(moneyRe(style))].map((m) => parseCents(m[1], style)).filter((c) => Number.isInteger(c)));

// Receipts are separated by a line of three or more dashes, equals signs or
// underscores, or by a form feed. One receipt with no separator is fine.
export function splitReceipts(text) {
  return String(text ?? "").split(/^\s*(?:[-=_]{3,}|\f)\s*$/m).map((b) => b.trim()).filter(Boolean);
}

// Lines that carry an amount but are not things bought.
// a line naming the cash handed over ("CASH 50,000", "Tunai 100.000", "TENDERED 20.00"), not the change
const CASH_LINE_RE = /^(?!.*\bchange\b).*\b(?:cash|tender(?:ed)?|tunai)\b/i;
const NOT_ITEM_RE = /\b(?:tunai|kembali(?:an)?|kartu|ppn|pb\s*1|pajak)\b|sub\s*-?\s*tota\b|sub\s*-?total|zwischensumme|\bgesamt|\bsumme\b|\btotale?\b|\btotaal\b|\btotal\b|\btax\b|\bvat\b|\bgst\b|\bhst\b|\bpst\b|\btva\b|\bmwst\b|\biva\b|\bbtw\b|\btip\b|gratuity|change|cash|tender|visa|mastercard|mc\s|amex|debit|credit|card|payment|paid|balance|amount|discount|coupon|savings|points|rounding|\bauth\b|\bref\b|\bacct\b|\bthank/i;
const TIP_RE = /\b(tip|gratuity)\b/i;

// Item lines: words, then a price (the last amount on the line; "2 x 3.00  6.00"
// is 6.00). Discount lines are not read, so a receipt with one fails the
// check below and says so rather than splitting on a guess.
export function parseItems(lines, comma = false) { // comma: a style, as moneyRe
  const items = [];
  for (const l of lines) {
    if (NOT_ITEM_RE.test(l) || DATE_RES.some((re) => re.test(l))) continue;
    const a = amountsIn(l, comma);
    if (!a.length) continue;
    const desc = (comma === "whole" ? l.replace(RP, " ") : l).replace(moneyRe(comma), " ").replace(/^\s*\d+\s*(?:x\s*)?(?=[a-z])/i, "").replace(/[\s$£€@x*]+$/gi, "").replace(/\s{2,}/g, " ").trim();
    if (!/[a-z]{2}/i.test(desc)) continue;
    items.push({ desc: desc.slice(0, 60), cents: a[a.length - 1] });
  }
  return items;
}

// Slash and dash dates are month-first unless the page says otherwise: a
// first field above 12 (25/12/2018) proves day-first, a second field above 12
// month-first, and a locale marker (RM, SDN BHD, GBP, PTY LTD, Rs) day-first.
const DAY_FIRST_LOCALE = /\b(?:rm|myr|sdn\.?\s*bhd|bhd|pty\.?\s*ltd|gbp|inr|rs)\b|[£₹]/i;
function dayFirstOf(lines) {
  let dayFirst = 0, monthFirst = 0, tDay = 0, tMonth = 0;
  // "Time: 12-49-00" (OCR turns the colons to dashes) is a clock, not a month-first date
  for (const l of lines) for (const m of l.replace(/\btime\W*\d{1,2}-\d{1,2}-\d{2}(?![\d/-])/gi, " ").matchAll(/(?<![\d-])(\d{1,2})[-/](\d{1,2})[-/](?:\d{4}|\d{2})(?![\d-])/g)) {
    // a stamp followed by a clock time is the receipt's date; "CK 11-22-31 - 10/400" is a code
    const timed = /^\s*\d{1,2}:\d{2}/.test(l.slice(m.index + m[0].length));
    if (+m[1] > 12 && +m[2] <= 12) { dayFirst++; if (timed) tDay++; }
    else if (+m[2] > 12 && +m[1] <= 12) { monthFirst++; if (timed) tMonth++; }
  }
  if (tDay || tMonth) return tDay > tMonth;
  if (dayFirst || monthFirst) return dayFirst > monthFirst;
  return DAY_FIRST_LOCALE.test(lines.join("\n")) || null;
}

// A date OCR broke (69/02/2018, 05/61/2018, 92/02/2018) that no digit order can
// read. Try one look-alike digit at a time (6, 9, 8 and 2 for 0; 4 for 0 or 1)
// and accept only when exactly one reading is a real date, so a field with two
// readings (42 is 12 or 02) stays unread and the receipt asks for the date.
const DATE_LOOK = { 6: ["0"], 9: ["0"], 8: ["0"], 2: ["0"], 4: ["0", "1"] };
function repairDate(lines, dayFirst) {
  for (const l of lines) for (const m of l.matchAll(/(?<![\d/-])(\d{1,2})([-/])(\d{1,2})\2(\d{4}|\d{2})(?![\d/-])/g)) {
    if (parseDate(m[0], true) || parseDate(m[0], false)) continue;
    const found = new Set();
    for (const f of [1, 3]) for (let k = 0; k < m[f].length; k++) for (const r of DATE_LOOK[m[f][k]] ?? []) {
      const alt = m[f].slice(0, k) + r + m[f].slice(k + 1);
      const d = parseDate(`${f === 1 ? alt : m[1]}${m[2]}${f === 3 ? alt : m[3]}${m[2]}${m[4]}`, dayFirst);
      if (d) found.add(d);
    }
    // a year OCR also garbled (2087, 2078) would turn a receipt that asks into a wrong date
    if (found.size === 1 && +[...found][0].slice(0, 4) <= new Date().getUTCFullYear() + 1) return { d: [...found][0], was: m[0] };
  }
  return null;
}

// The total, checked against the receipt's own arithmetic. OCR misreads a digit
// of the total line (9.00 as 9.60, 31.00 as 34.00, 54.50 as 64.50) more often
// than it misreads the same digit everywhere else, and a receipt states its
// total more than once: cash handed over less change, the before-tax subtotal
// plus the GST or SST line (and any rounding), the items added up. When the
// printed total matches none of these, and exactly one of them is the printed
// total with one digit changed, that one is taken; a total any check confirms,
// or one no check comes within a digit of, is left as printed.
export const oneDigitApart = (a, b) => {
  const x = String(a), y = String(b);
  if (x.length !== y.length || x === y) return false;
  let d = 0;
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i] && ++d > 1) return false;
  return true;
};
function totalChecks(lines, comma, at, bare) {
  const amt = (i) => { if (i < 0 || i >= lines.length) return null; const a = amountsIn(lines[i], comma).length ? amountsIn(lines[i], comma) : bare(lines[i + 1]); return a.length ? a[a.length - 1] : null; };
  const checks = []; // [cents, why]
  // cash handed over less change, both read after the total line
  const ti = lines.findIndex((l, i) => i > at && /\b(?:cash|tender(?:ed)?|received|tunai)\b/i.test(l) && !/\bchange\b/i.test(l) && !/cash\s*(?:bill|sale|ier)/i.test(l));
  const ci = ti < 0 ? -1 : lines.findIndex((l, i) => i > ti && /\b(?:change|kembali\w*|baki)\b/i.test(l) && !/exchange/i.test(l));
  const tender = amt(ti), change = amt(ci);
  if (tender !== null && change !== null && tender > change) checks.push([tender - change, "cash less change"]);
  // before-tax subtotal plus each GST/SST/tax line, with any printed rounding
  const subs = [], taxes = [], rounds = [0];
  lines.forEach((l, i) => {
    const v = amt(i);
    if (v === null) return;
    if (/sub\s*-?\s*total|excl(?:uding|usive)?\b|before\s+(?:gst|tax)|\bnett?\s+total/i.test(l) && !/\btotal\s+(?:gst|tax)\b/i.test(l)) subs.push(v);
    else if (/\b(?:gst|sst|tax|service\s+charge)\b/i.test(l) && !/incl|excl|\bid\b|reg|summary|sales/i.test(l) && !(TOTAL_RE.test(l) && !TAX_TOTAL_RE.test(l))) taxes.push(v);
    else if (/\bround(?:ing)?\b/i.test(l) && !TOTAL_RE.test(l)) { const m = l.match(/(-|\()\s*(?:rm\s*)?\d*[.,]\d{2}/i); if (Math.abs(v) <= 10) rounds.push(m ? -v : v); }
  });
  for (const s of subs) for (const t of taxes) if (t > 0 && t < s) for (const r of rounds) checks.push([s + t + r, "subtotal plus tax"]);
  // the items added up, with and without the tax
  const items = parseItems(lines, comma);
  if (items.length >= 2) {
    const sum = items.reduce((a, x) => a + x.cents, 0);
    checks.push([sum, "the items"]);
    for (const t of taxes) checks.push([sum + t, "the items plus tax"]);
  }
  // another total line ("Total : 9.00" above "Rounded Total 9.60")
  lines.forEach((l, i) => { if (i !== at && TOTAL_RE.test(l) && !NOT_TOTAL_RE.test(l)) { const v = amt(i); if (v !== null) checks.push([v, "another total line"]); } });
  return checks;
}
function crossCheckTotal(checks, cents) {
  if (checks.some(([v]) => v === cents)) return null;
  // One check alone is not enough (on the dataset's clean text, 15 receipts whose
  // printed total was right had one check a digit off: a discount the items miss,
  // a misprinted change). Two different kinds of check must agree, and a few cents
  // either way is the 5-sen rounding, not a misread digit.
  const near = new Map();
  for (const [v, why] of checks) if (v > 0 && Math.abs(v - cents) > 5 && oneDigitApart(v, cents)) near.set(v, new Set([...(near.get(v) ?? []), why.replace(" plus tax", "")]));
  const agreed = [...near].filter(([, w]) => w.size >= 2);
  if (agreed.length !== 1) return null;
  const [[v, why]] = agreed;
  return { cents: v, why: [...why].join(" and ") };
}

// A total's first digit read as a letter glued to the rest ("Balance Due A7.90" for
// 47.90, SRD 1177): the money pattern takes "7.90" and drops the letter. cleanOcr
// already maps S, B, O, l, I and Z inside digit tokens; these shapes it leaves
// alone because they are as often a real letter. So the letter read as a digit is
// only a candidate, taken when one of the receipt's own sums (subtotal plus tax,
// the items, cash less change) or another total line ("Total 47.90" above it)
// gives exactly that amount, and none gives the amount as read (parseReceipt).
const GLUED = { A: "4", G: "6", b: "6", T: "7", g: "9", q: "9" };
function gluedLookalike(line, comma) {
  if (comma === "whole") return null;
  const ms = [...line.matchAll(moneyRe(comma))];
  const m = ms[ms.length - 1];
  if (!m || m[0] !== m[1]) return null; // a currency sign before it: nothing glued
  const c = line[m.index - 1], before = line[m.index - 2] ?? " ";
  if (!(c in GLUED) || /\p{L}|\d/u.test(before)) return null;
  const cents = parseCents(GLUED[c] + m[1], comma);
  return Number.isInteger(cents) ? { cents, was: c + m[1] } : null;
}

// A card tender line: what the card was charged. Tip, change, cash-back and
// balance lines carry other amounts.
const CARD_RE = /\b(?:visa|master\s*card|mc|amex|american\s+express|discover|debit|credit(?:\s*car[de])?|card)\b/i;
const NOT_CARD_RE = /\b(?:tip|gratuity|change|cash\s*back|balance|points|rewards?|savings?|limit)\b/i;

// Whole-unit amounts OCR split at the group separator: "25 000", "308. 000",
// "304 ,326" (CORD's phone photos through tesseract.js, eval/cord-receipts.mjs
// --ocr). Joined only on a whole-unit receipt, and only where the second part
// is exactly three digits ending the number, so "1 Sate 25 000" reads 25,000.
const SPLIT_GROUP = /(?<![\d.,])(\d{1,3})(?:\s*([.,])\s+|\s+([.,])\s*|\s+)(\d{3})(?![\d%]|[.,]\d|\s*[.,]?\s*\d{3}(?!\d))/g;
export const joinSplitGroups = (l) => l.replace(SPLIT_GROUP, (m, a, s1, s2, b) => `${a}${s1 ?? s2 ?? ","}${b}`);

// No total line, but the bottom of the slip still reads total, cash, change
// with the words lost ("45,500 / 50,000 / 4,500"): three amount lines in a row
// where the second less the third is the first. The arithmetic must close
// exactly, so a cash line alone never becomes the total. On a whole-unit slip
// amounts under 100 are left out: OCR noise ("5", "2", "3") closes the sum by
// chance (4 of 7 such picks on CORD validation photos before this floor).
function totalCashChange(lines, comma) {
  const floor = comma === "whole" ? 10000 : 1;
  const rows = lines.map((l) => amountsIn(l, comma)).map((a) => (a.length ? a[a.length - 1] : null)).filter((v) => v !== null && v >= floor);
  for (let i = rows.length - 3; i >= 0; i--) {
    const [t, c, ch] = rows.slice(i, i + 3);
    if (c > t && c - ch === t) return t;
  }
  return null;
}

// A total line whose decimal point OCR lost or misread: "TOTAL 184 47)", "esl TOTAL : 92:22",
// "dount Due 9, 70", "mount Due $2 17" (SRD photos, eval/split-decimal-2026-11-15.md). Only on a
// receipt written 12.50, only after the total word, only where no amount reads on the line, and
// only as the line's last number: dollars, then a space, comma or colon, then exactly two digits.
const SPLIT_DEC = /(?:\$\s*)?(?<![\d.,:])(\d{1,4})(?:\s+|\s*[,:]\s*)(\d{2})(?![\d%]|[.,:]\d)[^\d]*$/;
export function splitDecimal(line) {
  const m = line.match(TOTAL_RE);
  if (!m || /€/.test(line)) return null; // a euro amount's comma is its decimal point ("TOTALE € 3,00")
  const s = line.slice(m.index + m[0].length).match(SPLIT_DEC);
  if (!s || /\d{1,2}:\d{2}\s*(?:[ap]\.?m\b)/i.test(s[0])) return null; // a time, "10:45 PM"
  const cents = Number(s[1]) * 100 + Number(s[2]);
  return cents > 0 ? { cents, was: s[0].replace(/[^\d$.,: ]+$/, "").trim() } : null;
}

// The tax on a receipt (README, "Tax on receipt photos"). Every tax line is read, not
// only the last: a rate printed beside it ("Tax 8.75% 1.11") is not the amount, a line
// whose amount is the total or more is the subtotal with tax ("Sbt1 w/Tax: $10.70"), and
// "Taxable", "w/Tax", "incl. tax" and "Tax ID" lines are not the tax. A printed "Total
// Tax" line wins; two or more tax lines (state and city, food and drink) are added when
// the subtotal plus their sum is exactly the total; otherwise the last one stands. On a
// receipt written 12.50, a tax line with no amount is read again for "12,94" or "2:29"
// (the decimal point lost) and for a bare ".75". The subtotals read are returned too, so
// that several OCR readings of one photo can check a tax against them.
// "PB1" (Indonesia's restaurant tax) as OCR prints it on a photo: "PBI", "PBl", "PB]", "PB!";
// "P Resto", "P-Resto" with the dot lost (CORD photos, eval/cord-photos-four-pass-2026-11-16.md)
const TAX_LINE_RE = /\b(?:(?:sales\s+t[ae]x|tax(?:es)?|t[ae]x|vat|gst|hst|pst|tva|mwst|iva|btw|ppn|pb\s*1|pajak|p[.\s-]\s*rest(?:o|oran)?|txtl|get)\b|pb\s*[il\]!|](?![\w]))/i;
const NOT_TAX_LINE_RE = /taxable|w\/\s*tax|with\s+tax|excl|before\s+(?:gst|tax)|(?:tax|gst|vat)\s*(?:id\b|invoice|no\b|reg|#)|sub\s*-?\s*total|\bsbt|summary|dasar\s+pengenaan|\bdpp\b/i;
const PCT_RE = /\(?\d{1,2}(?:[.,]\d{1,4})?\s*%\)?/g;
const SUB_RE = /sub\s*-?\s*total|\bsbtl?\b|\bsubttl\b|\bsub\s*\/\s*tt\s*[l1i\]|]|before\s+(?:gst|tax)|\bnet\b/i;
// "Tax" with its first letter misread by OCR on a receipt photo: "[ax 0.30", "fax 1: 1.36",
// "flax 1: 0.46", "Bax 0.46". Read only between a subtotal and the total (a fax number
// sits in the header), and only when no real tax line is found.
const DAMAGED_TAX_RE = /^\W*(?:[\[(|!lfFbB]|fl)ax\b/;
// Two or three tax lines printed together (state, city, resort, liquor) where OCR kept
// the amounts but lost the word "tax" on some ("IL Sales $1.52", "MPEA Tax $0.15",
// "Restaurant $0.04", total 16.56: SRD photo 1173). The lines touching a tax line, each
// with one amount and none a subtotal, total, tip, discount or payment, are the taxes
// when a subtotal, or the items above them, plus their sum is exactly the total.
const NOT_IN_TAX_BLOCK = /\b(?:tip|gratuity|service|discount|coupon|savings|cash|change|tender|visa|master\s*card|amex|debit|credit|card|paid|payment|balance|due|deposit|rounding|round|pembulatan|food|beverage|bev|drinks?|items?|qty|count|sc|ser|srv|svc|serv|charge|chg|fee|biaya|tambahan|admin|delivery|packing|takeaway|take\s*out|carry\s*out|to\s*go|bag|bottle|crv|surcharge|donation)\b/i;
function taxBlock(lines, comma, cands, cents, subtotals, ends) {
  const one = (l) => {
    if (SUB_RE.test(l) || TOTAL_RE.test(l) || NOT_IN_TAX_BLOCK.test(l) || NOT_TAX_LINE_RE.test(l)) return null;
    const a = amountsIn(l.replace(PCT_RE, " "), comma);
    return a.length === 1 && a[0] > 0 && a[0] < cents ? a[0] : null;
  };
  const at = cands.map((c) => lines.indexOf(c.line)).filter((i) => i >= 0);
  if (!at.length) return null;
  let lo = Math.min(...at), hi = Math.max(...at);
  for (let i = lo; i <= hi; i++) if (!at.includes(i) && one(lines[i]) === null) return null;
  while (lo > 0 && one(lines[lo - 1]) !== null) lo--;
  while (hi + 1 < lines.length && one(lines[hi + 1]) !== null) hi++;
  if (hi - lo + 1 < 2 || hi - lo + 1 > 4) return null;
  const sum = lines.slice(lo, hi + 1).reduce((a, l, k) => a + (at.includes(lo + k) ? cands.find((c) => c.line === l).v : one(l)), 0);
  const items = parseItems(lines.slice(0, lo), comma).reduce((a, i) => a + i.cents, 0);
  const base = [...subtotals, ...(items > 0 ? [items] : [])].find((b) => ends.has(b + sum) && sum <= b * 0.15);
  if (base === undefined || sum <= 0 || cands.every((c) => c.v === sum)) return null;
  return { cents: sum, lines: lines.slice(lo, hi + 1), note: `${hi - lo + 1} lines beside the tax line added as taxes (${lines.slice(lo, hi + 1).map((l) => `"${l}"`).join(", ")}): the ${subtotals.includes(base) ? "subtotal" : "items"} plus their sum is the total, check the tax` };
}

// A tax line whose amount OCR damaged past reading, on a receipt written 12.50, read from
// the receipt's own arithmetic (README, "Tax on receipt photos"). Each is taken only when
// the receipt closes with it, and with something the tax line itself shows:
// - its digits with the decimal point lost ("TAX 211"), when a subtotal plus 2.11 is the
//   total or a "Total" line (SRD 1012: subtotal 22.25, "Total 24.36", then a tip);
// - its printed rate ("TAX 8.00% 44"): the subtotal times the rate makes the total, or,
//   with no subtotal read, the total split at that rate gives a tax whose last digits are
//   the ones the line shows (19.44 at 8% is 18.00 + 1.44, and the line kept "44").
function looseTax(lines, cents, subtotals) {
  const ends = new Set([cents]);
  for (const l of lines) if (TOTAL_RE.test(l) && !NOT_TOTAL_RE.test(l)) for (const t of amountsIn(l)) if (t < cents) ends.add(t);
  for (const l of lines) {
    if (!TAX_LINE_RE.test(l) || NOT_TAX_LINE_RE.test(l) || (TOTAL_RE.test(l) && !TAX_TOTAL_RE.test(l))) continue;
    const rate = l.match(/(\d{1,2}(?:\.\d{1,4})?)\s*%/);
    const digits = l.replace(PCT_RE, " ").replace(/^[^\d]*?(?:tax|vat|gst|hst|pst)\s*[1-3]\s*[:;]/i, " ").match(/\d+/g) ?? [];
    for (const d of digits) {
      if (d.length < 3 || d.length > 4) continue;
      const v = Number(d);
      const base = subtotals.find((sb) => v > 0 && v <= sb * 0.15 && ends.has(sb + v));
      if (base !== undefined) return { cents: v, note: `tax line read as "${l}" with its decimal point lost: took ${(v / 100).toFixed(2)} (the subtotal ${(base / 100).toFixed(2)} plus it is a total on the receipt), check the tax`, line: l };
    }
    if (!rate) continue;
    const r = Number(rate[1]) / 100;
    if (!(r > 0 && r <= 0.15)) continue;
    const viaSub = subtotals.find((sb) => sb + Math.round(sb * r) === cents);
    if (viaSub !== undefined) { const v = cents - viaSub; return { cents: v, note: `tax line read as "${l}": took ${(v / 100).toFixed(2)}, the subtotal at ${rate[1]}% (it makes the total), check the tax`, line: l }; }
    if (subtotals.length) continue;
    const sub = Math.round(cents / (1 + r)), v = cents - sub;
    const tail = digits.join("");
    if (v > 0 && Math.abs(Math.round(sub * r) - v) <= 1 && tail.length >= 2 && String(v).endsWith(tail)) return { cents: v, note: `tax line read as "${l}": took ${(v / 100).toFixed(2)}, the total split at ${rate[1]}% (the line's digits "${tail}" agree), check the tax`, line: l };
  }
  return null;
}

export function readTax(lines, comma, cents) {
  const amt = (l) => { const a = amountsIn(l, comma); return a.length ? a[a.length - 1] : null; };
  const cands = [], subtotals = [];
  let note = null;
  lines.forEach((l) => {
    if (SUB_RE.test(l) && !/w\/\s*tax|with\s+tax/i.test(l) && !TOTAL_RE.test(l.replace(/sub\s*-?\s*total/i, ""))) { const v = amt(l); if (v !== null && v > 0) subtotals.push(v); }
    if (!TAX_LINE_RE.test(l) || NOT_TAX_LINE_RE.test(l)) return;
    if (TOTAL_RE.test(l) && !TAX_TOTAL_RE.test(l) && !/total\s+taxes/i.test(l)) return;
    const bare = l.replace(PCT_RE, " ");
    let v = amt(bare), lost = null;
    if (v === null && comma === false) {
      const m = bare.match(/(?<![\d.,:])(\d{1,3})\s?[,:]\s?(\d{2})(?![\d:])[^\d]*$/) ?? bare.match(/(?<![\d.,])\.(\d{2})(?!\d)[^\d]*$/);
      if (m) { v = m.length === 3 ? Number(m[1]) * 100 + Number(m[2]) : Number(m[1]); lost = m[0].trim(); }
    }
    if (v === null || (cents !== null && v >= cents)) return;
    // on a whole-unit slip a tax under 1% of the total is digits OCR lost ("TAX 5.45" on a
    // 172,000 receipt is 15,455) or noise (a stray "3"); a yen receipt's "Tax ¥22" on ¥300 stays
    if (comma === "whole" && v > 0 && cents !== null && v * 100 < cents) return;
    cands.push({ v, total: TAX_TOTAL_RE.test(l) || /total\s+taxes/i.test(l), lost, line: l });
  });
  // "Tax 1: 6.35" then "Tax 2: 0.00": a zero line is a tax that does not apply, not the tax
  if (cands.some((c) => c.v > 0)) for (let k = cands.length - 1; k >= 0; k--) if (cands[k].v === 0 && !cands[k].total) cands.splice(k, 1);
  // "Tax $21.50" then a bare "$1.37", with the subtotal line's amount gone: OCR moved
  // the column up one line. The tax line's amount is the subtotal when it and the
  // bare amount below make the total.
  if (cents !== null && cands.length === 1 && cands[0].v * 2 >= cents) {
    const i = lines.indexOf(cands[0].line), next = lines[i + 1] ?? "";
    const b = /\p{L}{2}/u.test(next) ? [] : amountsIn(next, comma);
    if (b.length === 1 && b[0] > 0 && cands[0].v + b[0] === cents) {
      subtotals.push(cands[0].v);
      return { cents: b[0], subtotals, note: `tax line read "${cands[0].line}" with the subtotal's amount; took ${(b[0] / 100).toFixed(2)} from the line below (the two make the total): check the tax`, line: next };
    }
  }
  if (!cands.length && cents !== null) {
    // Nothing reads as a tax line. Between the last subtotal and the total, take a line
    // whose label is a misread "Tax", or a line with one amount that the subtotal
    // makes the total ("THY $2.46" under "TAXABLE SALES $25.85", total 28.31).
    const subAt = lines.reduce((a, l, i) => (SUB_RE.test(l) || /taxable\s+sales/i.test(l)) && amt(l) !== null ? i : a, -1);
    const totAt = lines.findIndex((l, i) => i > subAt && TOTAL_RE.test(l) && !NOT_TOTAL_RE.test(l));
    const sub = subAt >= 0 ? amt(lines[subAt]) : null;
    if (sub !== null && /taxable\s+sales/i.test(lines[subAt]) && !subtotals.includes(sub)) subtotals.push(sub);
    for (let i = subAt + 1; subAt >= 0 && i < (totAt >= 0 ? totAt : lines.length); i++) {
      // "fax 1: 3.5": the 1 numbers the tax line, it is not an amount
      const l = lines[i], a = amountsIn(l.replace(PCT_RE, " ").replace(/^(\W*\S{0,3}ax)\s*[1-3]\s*[:;|]/, "$1 "), comma);
      if (a.length !== 1 || a[0] <= 0 || a[0] >= cents || a[0] > sub * 0.15) continue;
      if (DAMAGED_TAX_RE.test(l) && (comma !== false || /\d\.\d{2}(?!\d)/.test(l)) && !/\d{3}[-. ]\d{4}/.test(l)) return { cents: a[0], subtotals, note: `tax line read as "${l}": took ${(a[0] / 100).toFixed(2)}, check the tax`, line: l };
      if (sub + a[0] === cents) return { cents: a[0], subtotals, note: `an unlabelled line "${l}" between the subtotal and the total makes them add up: took ${(a[0] / 100).toFixed(2)} as the tax, check it`, line: l };
    }
  }
  if (!cands.length && cents !== null && comma === false) {
    const loose = looseTax(lines, cents, subtotals);
    if (loose) return { ...loose, subtotals };
  }
  if (!cands.length) return { cents: null, subtotals, note, line: null };
  const printed = cands.filter((c) => c.total);
  // what the subtotal plus the taxes may close to: the total, or a "Total" printed after
  // the tax lines and before a printed tip ("Total: 43.60", 18% tip, "Total 50.80")
  const lastTax = Math.max(...cands.map((c) => lines.indexOf(c.line)));
  const ends = new Set(cents === null ? [] : [cents]);
  let taxLines = null; // the lines a tax block took as taxes, so they are not read as items
  lines.forEach((l, i) => { if (i > lastTax && TOTAL_RE.test(l) && !NOT_TOTAL_RE.test(l)) { const t = amt(l); if (t !== null && cents !== null && t < cents && subtotals.some((s) => t > s)) ends.add(t); } });
  let pick = printed.length ? printed[printed.length - 1] : cands[cands.length - 1];
  let v = pick.v;
  if (!printed.length && cands.length >= 2 && cents !== null) {
    const sum = cands.reduce((a, c) => a + c.v, 0);
    if (sum !== v && subtotals.some((s) => ends.has(s + sum)) && !subtotals.some((s) => ends.has(s + v))) { v = sum; note = `${cands.length} tax lines added (the subtotal plus their sum is the total)`; pick = null; }
  }
  if (!printed.length && cents !== null && pick && !subtotals.some((s) => ends.has(s + v))) {
    const block = taxBlock(lines, comma, cands, cents, subtotals, ends);
    if (block) { v = block.cents; note = block.note; pick = null; taxLines = block.lines; }
  }
  if (pick?.lost) note = `tax line read "${pick.lost}" with its decimal point lost: took ${(v / 100).toFixed(2)}, check the tax`;
  // every tax line added, for another reading's subtotal to check (receipts.mjs voteTax)
  const sum = cands.length >= 2 && !printed.length ? cands.reduce((a, c) => a + c.v, 0) : null;
  return { cents: v, subtotals, note, line: pick?.line ?? null, sum, taxLines };
}

export function parseReceipt(block, { dayFirst = null } = {}) {
  let lines = cleanOcr(String(block)).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const notes = [];
  const comma = wholeStyle(lines.join("\n")) ? "whole" : commaStyle(lines.join("\n"));
  // on a whole-unit slip tesseract reads a leading 5 as "§" ("TOTAL SALES §2,000" for
  // 52,000, "GRAND TOTAL §3,000" for 53,000: CORD validation-84 and -42); only glued to a
  // grouped amount, where no section sign is ever printed
  if (comma === "whole") lines = lines.map((l) => joinSplitGroups(l.replace(/§(?=\d{1,2}([.,])\d{3}(?:\1\d{3})*(?![.,]?\d))/g, "5")));
  const guess = dayFirst ?? dayFirstOf(lines);
  const dmy = !!guess;
  // every dated line; the one labelled "date" wins, then a four-digit year (a
  // serial like "18/06/04" or a time-stamped code reads as a date too), then the first
  const cands = [];
  lines.forEach((l, i) => {
    for (const re of DATE_RES) {
      const m = l.match(re);
      const d = m && parseDate(m[1], dmy || comma === true || (comma === "whole" && !m[1].includes("-")) || m[1].includes("."));
      if (d) { const f = m[1].split(/[-/.]/); cands.push({ d, amb: f.length === 3 && f[0].length <= 2 && +f[0] <= 12 && +f[1] <= 12 && +f[0] !== +f[1], rank: (/\bdate\b/i.test(l) ? 0 : 2) + (/\d{4}/.test(m[1].replace(/^\d{4}(?=[-/])/, "")) || /^\d{4}[-/]/.test(m[1]) ? 0 : 1) - (new RegExp(m[1].replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*\\d{1,2}:\\d{2}").test(l) ? 0.5 : 0), i }); break; }
    }
  });
  cands.sort((a, b) => a.rank - b.rank || a.i - b.i);
  let date = cands[0]?.d ?? null;
  if (date && guess === null && cands[0].amb) notes.push("day and month order guessed (month first); check the date");
  if (!date) {
    const fixed = repairDate(lines, dmy || comma === true);
    if (fixed) { date = fixed.d; notes.push(`date repaired from OCR (${fixed.was}); check the date`); }
  }
  if (!date) notes.push("no date found");

  // merchant: the first line that is words, not an address, phone, date or amount
  const BOILER = /^(receipt|invoice|order|thank|tax invoice|cash\s*(?:sale|bill)|goods sold|ref(?:erence)?\.?\s*no|your order|welcome|tq\b|please|customer|official|duplicate|copy|simplified|for feedback|cashier|company\s*no|[*\s]+thank|redeem|pcl xl|warning|error\b|jln\b|jalan\b|lorong\b|taman\b|lot\s|level\s|no[.:]?\s*\d)/i;
  const ENTITY = /\b(?:sdn\.?\s*b(?:hd|nd|ho|h0)\.?|s\/b|enterprise|trading|holdings?|ltd|llc|inc|corp|gmbh|pte|pty|co\.|company)\b/i;
  // OCR noise lines (mostly symbols), GST registration lines and state names are not a shop name
  const NOTNAME = /^[^a-z]*(?:gst|sst|reg(?:istration)?\b|tax\s*id)|^(?:\W*\w{1,2}\W+)?(?:selangor|johor|kuala lumpur|penang|pulau pinang|perak|kedah|melaka|negeri sembilan|pahang|sabah|sarawak|terengganu|kelantan|wilayah)\b/i;
  const wordy = (l) => { const t = l.replace(/\s/g, ""); return t.length > 0 && (t.match(/[^a-z0-9.&()'\/,:-]/gi) ?? []).length / t.length < 0.15 && (t.match(/[a-z]/gi) ?? []).length / t.length >= 0.5; };
  // a company registration number in brackets, "AEON CO. (M) BHD (126926-H)", is not part of the name
  const REGNO = /\s*\(\s*(?:no\.?\s*)?\d{4,}\s*-?\s*[a-z]?\s*\)\s*$/i;
  // an OCR line of stray two-letter fragments ("eee ee ee Ty Pee ee") is the logo or a rule, not a name
  const FRAGMENTS = (l) => { const w = l.split(/\s+/).filter(Boolean); return w.length >= 3 && w.filter((x) => /^[a-z]{1,2}$/i.test(x)).length * 2 > w.length; };
  const eligible = lines.map((l) => l.replace(REGNO, "")).filter((l) => /[a-z]{3}/i.test(l) && !BOILER.test(l.replace(/^[^A-Za-z0-9]+/, "")) && !FRAGMENTS(l) && !NOTNAME.test(l) && wordy(l)
    && !/\d{3}[-. ]\d{3,4}/.test(l) && !DATE_RES.some((re) => re.test(l)) && !new RegExp(moneyRe(comma).source, "u").test(l) && !/^\d+\s+\w+\s+(st|street|ave|avenue|rd|road|blvd|dr|drive|ln|way)\b/i.test(l));
  // a short line of a person's name above the registered company name: the company is the merchant
  let merchantLine = eligible[0];
  // a stamped or handwritten name above a printed (capitalised) shop name, e.g.
  // "tan woon yann" over "YONGFATT ENTERPRISE": all lower case is not the shop
  if (eligible.length > 1 && /^[a-z]+(?:\s+[a-z]+){0,3}$/.test(eligible[0].trim()) && /[A-Z]{3}/.test(eligible[1])) merchantLine = eligible[1];
  // a printed "(317041-W)" registration number sits right under the registered company name:
  // the nearest name line above it (up to two lines) is the merchant, whatever heads the slip
  let regNamed = false;
  const regAt = lines.findIndex((l) => /^\W*\(?\s*(?:co\.?\s*)?(?:reg(?:istration)?\.?\s*)?(?:no\.?\s*)?[:#]?\s*\d{5,}\s*-\s*[a-z]\s*\)?\W*$/i.test(l));
  if (regAt > 0) {
    for (let k = regAt - 1; k >= Math.max(0, regAt - 3); k--) {
      const l = lines[k].replace(REGNO, "");
      const hit = eligible.find((e) => e === l);
      if (hit && ENTITY.test(hit)) { merchantLine = hit; regNamed = true; break; }
    }
  }
  const [first, second] = eligible;
  if (!regNamed && first && second && !ENTITY.test(first) && ENTITY.test(second) && first.trim().split(/\s+/).length <= 3 && first.trim().split(/\s+/)[0].toLowerCase() !== second.trim().split(/\s+/)[0].toLowerCase()
    && !/(?:restaurant|cafe|mart|market|shop|store|pharmacy|bakery|kitchen)/i.test(first)) merchantLine = /^[A-Z]{1,3}\.\s*\(M\)/.test(second.trim()) && /^[A-Z][A-Z .&']+$/.test(first.trim()) ? `${first.trim()} ${second.trim()}` : second; // "POPULAR BOOK" over "CO. (M) SDN BHD": one name wrapped over two lines
  // a stray mark before the name ("- UAN HING ...") and the engine's SON/SDN BHO for SDN BHD
  const merchant = merchantLine ? merchantLine.replace(/\s{2,}.*$/, "").replace(/^(?:[^A-Za-z0-9(]+|[a-z]{1,2}\s+(?=[A-Z]{3}))/, "").replace(/\bS[OD]N\.?\s+B(?:HD|ND|HO|H0)\b/g, "SDN BHD").slice(0, 60) : null;
  if (!merchant) notes.push("no merchant found");

  // total: the last total-looking line with an amount; else the largest amount on the page
  let cents = null, from = null;
  // a total line with no amount takes the next line when that line is only an amount
  const bare = (l) => l && !/\p{L}{2}/u.test(l.replace(RP, " ").replace(CUR_WORD, " ")) ? amountsIn(l, comma) : [];
  // a tax summary table repeats "TOTAL" (taxable base, tax) after the real one
  const summaryAt = lines.findIndex((l) => /\b(?:gst|tax|vat)\s+(?:summary|analysis)\b/i.test(l));
  let at = -1;
  lines.forEach((l, i) => {
    if (TOTAL_RE.test(l) && !NOT_TOTAL_RE.test(l)) {
      if (cents !== null && summaryAt >= 0 && i >= summaryAt) return;
      let a = amountsIn(l, comma).length ? amountsIn(l, comma) : bare(lines[i + 1]);
      let split = null;
      if (!a.length && comma === false && (split = splitDecimal(l))) a = [split.cents];
      if (a.length && a[a.length - 1] > 0) {
        cents = a[a.length - 1]; from = l; at = i;
        if (split) notes.push(`total line read "${split.was}" with its decimal point lost: took ${(split.cents / 100).toFixed(2)}, check the total`);
        // "Total : 140.00 8.40": a before-tax column and a tax column, the total
        // of the last column cut off or missing. When the last amount is exactly
        // 6% or 8% (Malaysian GST and SST) of the one before it to within a cent,
        // it is the tax and the total is the two added; tax already inside the
        // first amount would be 5.66% or 7.41%, which does not match.
        const n = a.length >= 2 ? a[a.length - 2] : 0;
        if (n > 0 && [0.06, 0.08].some((r) => Math.abs(cents - Math.round(n * r)) <= 1) && cents > 1) { cents = n + cents; notes.push("total line shows an amount and its tax: added"); }
      }
    }
  });
  // A bare "Total : 89.50 5.37" row closing a GST summary, its tax cell garbled or cut
  // off by the OCR ("§.37]", "2.7"): the printed "Total Sales (Inclusive of GST)" or
  // "Total GST" line above it already holds the answer. The row's first amount is the
  // before-tax base; an earlier total line within two cents of base plus 6% or 8%, or a
  // GST line within a cent of 6% or 8% of the base, gives the total.
  if (cents !== null && at > 0 && (from.match(/\d+(?:[.,]\d+)*/g) ?? []).length >= 2 && /^[a-z]?total$/.test(from.replace(/rm/gi, "").replace(/[^a-z]/gi, "").toLowerCase())) {
    const base = amountsIn(from, comma)[0];
    const near = (v, w) => [0.06, 0.08].some((r) => Math.abs(v - Math.round(w * (1 + r))) <= 2);
    if (base > 0) {
      let found = null;
      for (let i = 0; i < at && found === null; i++) {
        const l = lines[i], a = amountsIn(l, comma);
        if (!a.length) continue;
        const v = a[a.length - 1];
        if (TOTAL_RE.test(l) && /incl/i.test(l) && v > base && near(v, base)) found = v;
        else if (/\b(?:total\s+)?(?:gst|sst|tax)\b/i.test(l) && /total/i.test(l) && !/incl|excl|sales|amount|summary/i.test(l) && [0.06, 0.08].some((r) => Math.abs(v - Math.round(base * r)) <= 1) && v > 1) found = base + v;
      }
      if (found !== null && found !== cents) { cents = found; notes.push("total row's tax cell unreadable; used the GST lines above it"); }
    }
  }
  // "TOTAL PAID RM50.00" under "GRAND TOTAL RM21.85" and "CHANGE RM28.15" is the cash
  // handed over, not the total: an earlier total line equal to paid less change wins
  if (cents !== null && at > 0 && /\b(?:total|amount)\s+paid\b/i.test(from)) {
    const ci = lines.findIndex((l, i) => i > at && /\bchange\b/i.test(l));
    const ch = ci < 0 ? [] : (amountsIn(lines[ci], comma).length ? amountsIn(lines[ci], comma) : bare(lines[ci + 1]));
    const chg = ch.length ? ch[ch.length - 1] : null;
    if (chg !== null && chg > 0 && chg < cents) {
      for (let i = at - 1; i >= 0; i--) {
        if (!TOTAL_RE.test(lines[i]) || NOT_TOTAL_RE.test(lines[i])) continue;
        const a = amountsIn(lines[i], comma).length ? amountsIn(lines[i], comma) : bare(lines[i + 1]);
        const v = a.length ? a[a.length - 1] : null;
        if (v !== null && Math.abs(cents - chg - v) <= 5) { cents = v; from = lines[i]; at = i; notes.push("total paid was cash handed over; used the total line"); break; }
      }
    }
  }
  // "ROUNDING ADJ -0.01" after the total: the amount due is the total plus it
  // (a later "TOTAL ROUNDED" line has already replaced the total)
  if (cents !== null && at >= 0 && !/round|adj/i.test(from)) {
    for (let i = at + 1; i < Math.min(lines.length, at + 6); i++) {
      if (!/\bround(?:ing)?\b/i.test(lines[i]) || TOTAL_RE.test(lines[i])) continue;
      const m = [lines[i], lines[i + 1] ?? ""].map((x) => x.replace(CUR_WORD, " ").match(/^[^\d]*?(-|\()?\s*(?:rm\s*)?(\d*[.,]\d{2})\)?\s*$/i)).find(Boolean);
      const r = m ? Math.round(parseFloat(m[2].replace(",", ".")) * 100) * (m[1] ? -1 : 1) : null;
      if (r !== null && r !== 0 && Math.abs(r) <= 10) { cents += r; notes.push("total adjusted by the printed rounding"); }
      break;
    }
  }
  if (cents === null) {
    // no total line: what was paid is the cash handed over less the change
    // on a whole-unit slip OCR often prints a dash before these amounts ("CASH -50,000",
    // "CHANGE -30,000": CORD photos, eval/cord-photos-four-pass-2026-11-16.md), which no
    // amount reads through; the dash is dropped on these two lines (and in the
    // largest-amount fallback below)
    const undash = (l) => undashWhole(l, comma);
    const pick = (re) => { const i = lines.findIndex((l) => re.test(l)); if (i < 0) return null; const a = amountsIn(undash(lines[i]), comma).length ? amountsIn(undash(lines[i]), comma) : bare(undash(lines[i + 1])); return a.length ? a[a.length - 1] : null; };
    const tender = pick(/\b(?:cash|tendered|payment|paid|accepted\s+total)\b/i), change = pick(/\bchange\b/i);
    if (tender !== null && change !== null && tender > change) { cents = tender - change; notes.push("no total line; cash handed over less change"); }
  }
  if (cents === null) {
    const t = totalCashChange(lines, comma);
    if (t !== null) { cents = t; notes.push("no total line; three amounts read as total, cash and change (cash less change is the total)"); }
  }
  if (cents === null && comma !== "whole") {
    // no total line: the card the slip was paid with, "VISA 6.56", "MASTERCARD ##4617 $52.47"
    // (README, "No total line: the card line"); the last such line with an amount. Not on a
    // whole-unit slip: "[1] BCA DEBIT -259,000" reads as 1 there (CORD train-178)
    for (let i = lines.length - 1; i >= 0 && cents === null; i--) {
      if (!CARD_RE.test(lines[i]) || NOT_CARD_RE.test(lines[i])) continue;
      const a = amountsIn(lines[i], comma).length ? amountsIn(lines[i], comma) : bare(lines[i + 1]);
      if (a.length && a[a.length - 1] > 0) { cents = a[a.length - 1]; notes.push("no total line; took the amount on the card line"); }
    }
  }
  if (cents === null) {
    // the dash OCR prints before a whole-unit amount ("AIR MINERAL -7,000": CORD
    // validation-66) is read through here as on the cash and change lines; a refund or
    // discount is never the largest amount on a slip with no total line
    const all = lines.flatMap((l) => amountsIn(undashWhole(l, comma), comma));
    if (all.length) {
      cents = Math.max(...all);
      // the largest amount printed on the cash line is usually the money handed over, not
      // what was paid (CORD validation-30: "CASH 50,000" on a 21,000 slip); said in the
      // note so the vote across readings gives that guess nothing (CASH_GUESS_VOTE)
      const ud = (l) => undashWhole(l, comma);
      const onCash = lines.some((l, i) => CASH_LINE_RE.test(l) && !/cash\s*(?:bill|sale|ier|back)/i.test(l) && (amountsIn(ud(l), comma).includes(cents) || (!amountsIn(ud(l), comma).length && bare(ud(lines[i + 1])).includes(cents))));
      notes.push(onCash ? "no total line; took the largest amount, printed on the cash line (often the cash handed over)" : "no total line; took the largest amount");
    }
  }
  if (cents === null) notes.push("no amount found");
  const checks = totalChecks(lines, comma, at, bare);
  if (cents !== null && at >= 0) {
    const alt = gluedLookalike(amountsIn(lines[at], comma).length ? lines[at] : lines[at + 1] ?? "", comma);
    if (alt !== null && alt.cents !== cents && !checks.some(([v]) => v === cents) && checks.some(([v]) => v === alt.cents)) {
      notes.push(`total line read "${alt.was}" as ${(cents / 100).toFixed(2)}; the receipt's arithmetic gives ${(alt.cents / 100).toFixed(2)}, the letter read as a digit: used that, check the total`);
      cents = alt.cents;
    }
  }
  if (cents !== null) {
    const fix = crossCheckTotal(checks, cents);
    if (fix) { notes.push(`total read as ${(cents / 100).toFixed(2)}; ${fix.why} give ${(fix.cents / 100).toFixed(2)}, one digit apart: used that, check the total`); cents = fix.cents; }
  }

  let taxCents = null;
  const taxRead = readTax(lines, comma, cents);
  taxCents = taxRead.cents;
  if (taxRead.note) notes.push(taxRead.note);
  // line items, kept only if they add up to the printed total (with the tax and
  // any tip, or already including tax); the merchant line is not an item
  let tipCents = null;
  for (const l of lines) if (TIP_RE.test(l) && !TOTAL_RE.test(l)) { const a = amountsIn(l, comma); if (a.length) tipCents = a[a.length - 1]; }
  // lines taken as taxes because they close the sum ("IL Sales $1.52") are not things bought
  const items = parseItems(taxRead.taxLines ? lines.filter((l) => !taxRead.taxLines.includes(l)) : lines, comma);
  let itemsOk = false;
  // "Food: $12.40", "Beverage: $2.45" printed under the total sum the items again by kind:
  // when every line fails the check, the lines above the first subtotal or total line are
  // tried alone, and kept only if they close the total too
  const firstSum = lines.findIndex((l) => SUB_RE.test(l) || (TOTAL_RE.test(l) && amountsIn(l, comma).length));
  // only against a total read from a total line: a guessed largest amount is often the subtotal itself
  const aboveItems = firstSum > 0 && at >= firstSum ? parseItems(lines.slice(0, firstSum).filter((l) => !taxRead.taxLines?.includes(l)), comma) : [];
  const above = aboveItems.length && aboveItems.length < items.length ? { items: aboveItems, sum: aboveItems.reduce((a, i) => a + i.cents, 0) } : null;
  if (items.length && cents !== null) {
    const sum = items.reduce((a, i) => a + i.cents, 0);
    if (sum + (taxCents ?? 0) + (tipCents ?? 0) === cents) itemsOk = true;
    else if (sum + (tipCents ?? 0) === cents && taxCents !== null) itemsOk = "tax included";
    else if (above && above.sum + (taxCents ?? 0) + (tipCents ?? 0) === cents) { itemsOk = true; items.splice(0, items.length, ...above.items); }
    else notes.push(`items add to ${(sum / 100).toFixed(2)} but the total is ${(cents / 100).toFixed(2)}${taxCents !== null ? " with tax" : ""}: not used for a split`);
  }
  const currency = detectCurrency(lines);
  const out = { date, merchant, currency, cents, taxCents, tipCents, items: itemsOk ? items : [], itemsOk: !!itemsOk, taxIncluded: itemsOk === "tax included", ok: !!(date && merchant && cents), notes, totalLine: from, text: lines.join("\n").slice(0, 400) };
  // the arithmetic checks, kept off the enumerable fields so results compare as before
  Object.defineProperty(out, "checks", { value: checks, enumerable: false });
  Object.defineProperty(out, "subtotals", { value: taxRead.subtotals, enumerable: false });
  Object.defineProperty(out, "taxLine", { value: taxRead.line, enumerable: false });
  Object.defineProperty(out, "taxSum", { value: taxRead.sum ?? null, enumerable: false });
  return out;
}

// Three or more readings of one photo (the page reads a phone photo four times:
// two modes, on the photo and on a grey copy at twice the size) vote on the total.
// Each value scores one point per kind of arithmetic check that gives it, one per
// reading that read it, and one more per reading that printed it on a total line;
// a tie goes to the earlier reading. Chosen on the even-numbered half of the 200
// ExpressExpense photos (eval/srd: 59 to 68 of 99 right) and scored once on the
// odd half (60 to 66 of 97). With two readings the rule below is unchanged.
//
// A reading that found no total line and fell back on the largest amount on the
// page counts half (GUESS_VOTE): on a phone photo that guess is usually the cash
// handed over, a card number or noise, and three such readings agreeing on it used
// to outvote the one reading that printed the total on a TOTAL line (SRD 1123:
// 19.75 three times against "Total 21.76"). Chosen on the even-numbered SRD photos
// (72 to 73 of 99; 0.25 and 0.75 tie with 0.5) and scored once on the odd half
// (73 to 77 of 97); README, "A guessed total counts half in the vote".
export const GUESS_VOTE = 0.5;
const guessedLargest = (p) => !p.totalLine && p.notes.some((n) => /took the largest amount/.test(n));
// A guess that is the amount on the cash line ("CASH 50,000" where TOTAL 21,000 was lost to
// OCR) counts nothing: three readings guessing the cash handed over outvoted one that read
// the total (CORD validation-30, eval/receipt-cash-guess-2026-11-16.md). Not when the
// receipt's arithmetic gives the same amount: exact cash ("Tendered $52.06", "Change
// $0.00", subtotal 48.54 plus tax 3.52: SRD 1108) is the total. Alone it still stands,
// as the only candidate, with the note asking for a check.
export const CASH_GUESS_VOTE = 0;
const guessedCash = (p) => guessedLargest(p) && p.notes.some((n) => /printed on the cash line/.test(n));
// Nor when a reading prints that amount on a line that is not the cash line: one item
// "AIR MINERAL 7,000" paid with "CASH 7,000" (CORD validation-66: the rule above took it
// from 7,000 to a stray 1,088) is exact cash, so the guess keeps its half vote. On
// validation-30 the 50,000 appears on cash lines only (eval/cord-cash-guess-2026-11-16.md).
const printedOffCash = (texts, c) => texts.some((t) => {
  const ls = String(t).split(/\r?\n/).map((l) => l.trim()).filter(Boolean), style = wholeStyle(ls.join("\n")) ? "whole" : commaStyle(ls.join("\n"));
  return ls.some((l, i) => !CASH_LINE_RE.test(l) && !/\bchange\b/i.test(l) && !(i > 0 && CASH_LINE_RE.test(ls[i - 1]) && !amountsIn(undashWhole(ls[i - 1], style), style).length) && amountsIn(undashWhole(l, style), style).includes(c));
});
// A total line whose dollars start with a 0 ("TOTAL: 04.78" where another reading has
// "TOTAL: $94.78": SRD 1030) lost its first digit to OCR; no printed total reads that way.
// That reading's total counts as a guess in the vote, with no total-line point (README,
// "Reading the total first"), but only when another reading holds the same digits with a
// digit in front (94.78 for 04.78): a stray 0 before an intact total ("Grand Total 029,30",
// SROIE 169, held out) keeps its full vote.
const leadingZero = (p, ps) => {
  if (!p.totalLine || !(p.cents > 0) || !/(?<![\d.,])0\d{1,3}[.,]\d{2}(?!\d)/.test(p.totalLine)) return false;
  const m = 10 ** String(p.cents).length;
  return ps.some((q) => q.cents > p.cents && (q.cents - p.cents) % m === 0 && q.cents < p.cents + 10 * m);
};
// The amount printed on the page that one reading's own subtotal plus its tax make, when no
// reading took it as the total because OCR damaged the word "TOTAL" ("SOSTOTAL: 146.57",
// SRD 1133: subtotal 134.46, tax 12.11). Returns [cents, reading, readings printing it].
const printedIn = (texts, c) => {
  const s = (c / 100).toFixed(2), re = new RegExp(`(?<![\\d.,])${s.replace(".", "[.,]")}(?![\\d]|[.,]\\d)`);
  return texts.filter((t) => re.test(t)).length;
};
function arithmeticTotals(ps, texts, votes) {
  const out = new Map();
  for (const p of ps) {
    const t = p.taxCents;
    if (!(t > 0)) continue;
    for (const s of p.subtotals ?? []) {
      const c = s + t;
      if (t > s * 0.15 || votes.has(c) || out.has(c)) continue;
      const n = printedIn(texts, c);
      if (n >= 1) out.set(c, { p, n });
    }
  }
  return out;
}
function voteTotal(ps, support, texts = []) {
  const votes = new Map();
  ps.forEach((p, i) => {
    if (p.cents === null) return;
    const v = votes.get(p.cents) ?? { score: support(p.cents), first: i };
    v.score += leadingZero(p, ps) ? GUESS_VOTE : guessedCash(p) && !support(p.cents) && !printedOffCash(texts, p.cents) ? CASH_GUESS_VOTE : (guessedLargest(p) ? GUESS_VOTE : 1) + (p.totalLine ? 1 : 0);
    votes.set(p.cents, v);
  });
  // each reading that prints the subtotal-plus-tax amount counts once (no total-line point:
  // none read it as a total); a tie goes to the readings' own totals
  const derived = arithmeticTotals(ps, texts, votes);
  for (const [c, { n }] of derived) votes.set(c, { score: support(c) + n, first: ps.length });
  let win = null;
  for (const [c, v] of votes) if (!win || v.score > win.score || (v.score === win.score && v.first < win.first)) win = { cents: c, ...v };
  if (!win) return null;
  if (win.first < ps.length) return ps[win.first];
  const { p } = derived.get(win.cents);
  const made = { ...p, cents: win.cents, items: [], itemsOk: false, taxIncluded: false, totalLine: null };
  Object.defineProperty(made, "derived", { value: `the subtotal ${((win.cents - p.taxCents) / 100).toFixed(2)} plus the tax ${(p.taxCents / 100).toFixed(2)}, printed on the page`, enumerable: false });
  return made;
}

// The tax when OCR read one photo several times (README, "Tax on receipt photos"):
// each reading's tax scores one point per reading that read it, and two more when a
// subtotal read in any reading plus that tax is the settled total. A tax over 22% of
// the total is not one, and a tax one digit away from the total less a subtotal is
// taken as that difference. A tie keeps the reading the total came from, then the first.
// On the 200 ExpressExpense photos the readings that found a tax disagreed on 21, and
// the first reading had none on 41 where another did.
// How many readings print an amount on a tax line, read in that reading's own style; breaks
// a tie between taxes: CORD validation-65, "TAX 16.00 4 4,264" in one reading, "4,964" in
// another and in a third that lost its total, so parsed no tax (eval/cord-cash-guess-2026-11-16.md)
// (a reading too damaged to look like a whole-unit slip is also read in the style of the
// reading the total came from: g4's "4,964" there)
const styleOf = (x) => (wholeStyle(String(x)) ? "whole" : commaStyle(String(x)));
const onTaxLines = (texts, t, also) => texts.filter((x) => {
  const ls = String(x).split(/\r?\n/), style = styleOf(x);
  return ls.some((l) => (TAX_RE.test(l) || TAX_LINE_RE.test(l)) && !NOT_TAX_RE.test(l) && (amountsIn(l, style).includes(t) || (also !== undefined && also !== style && amountsIn(l, also).includes(t))));
}).length;
export function voteTax(ps, out, pick, texts = []) {
  const subs = ps.flatMap((p) => p.subtotals ?? []);
  const votes = new Map();
  ps.forEach((p, i) => {
    const t = p.taxCents;
    // over 22% of the settled total is not a tax (Hungary's 27% VAT is 21.3% of a total
    // that includes it); one reading's total can be misread, so this is not applied there
    if (t === null || (out.cents !== null && t > out.cents * 0.22)) return;
    const v = votes.get(t) ?? { score: out.cents !== null && subs.some((s) => s + t === out.cents) ? 2 : 0, first: p === pick ? -1 : i };
    v.score += 1;
    votes.set(t, v);
  });
  let win = null;
  if (texts.length) for (const [t, v] of votes) v.printed = onTaxLines(texts, t, texts[ps.indexOf(pick)] === undefined ? undefined : styleOf(texts[ps.indexOf(pick)]));
  for (const [t, v] of votes) if (!win || v.score > win.score || (v.score === win.score && ((v.printed ?? 0) > (win.printed ?? 0) || ((v.printed ?? 0) === (win.printed ?? 0) && v.first < win.first)))) win = { t, ...v };
  const t = win ? win.t : out.taxCents;
  // two tax lines (sales 2.80, resort 0.80) read in one reading that had no subtotal,
  // the subtotal read in another: their sum is the tax when it closes to the total
  if (t !== null && out.cents !== null && !subs.some((s) => s + t === out.cents)) {
    const sums = [...new Set(ps.map((p) => p.taxSum).filter((x) => x != null && x !== t && subs.some((s) => s + x === out.cents)))];
    if (sums.length === 1) return sums[0];
  }
  // a whole-unit slip rounds its tax to the unit: subtotal 18,181 plus PB1 1,818 prints a
  // total of 20,000 (CORD validation-2, read 1,818 three times). One unit short or over
  // is the rounding, not a misread digit, so the read tax stands
  const rounded = t !== null && out.cents !== null && t >= 10000 && t % 100 === 0 && out.cents % 100 === 0 && subs.some((s) => s % 100 === 0 && Math.abs(out.cents - s - t) === 100);
  // a tax one digit away from the settled total less a subtotal ("Tax: 8.21" where
  // 42.16 less 38.95 is 3.21) was misread: the receipt's own arithmetic wins
  if (t !== null && out.cents !== null && !rounded && !subs.some((s) => s + t === out.cents)) {
    const near = [...new Set(subs.map((s) => out.cents - s))].filter((d) => d > 0 && oneDigitApart(d, t));
    if (near.length === 1) return near[0];
    // two subtotals one digit apart ("$28.48" in three readings, "$28.47" in one): the
    // subtotal most readings agree on, when one has more readings than any other
    if (near.length > 1) {
      const n = near.map((d) => subs.filter((s) => out.cents - s === d).length);
      const top = Math.max(...n);
      if (n.filter((k) => k === top).length === 1) return near[n.indexOf(top)];
    }
  }
  if (t === null && out.cents !== null) {
    const d = [...new Set(subs.map((s) => out.cents - s))].filter((d) => d > 0 && d <= (out.cents - d) * 0.15);
    if (d.length === 1) return d[0];
    const split = splitAtRate(texts, out.cents);
    if (split) { out.taxWhy = split.note; return split.cents; }
  }
  return t;
}

// A whole-unit slip (rupiah) whose tax line no reading could read, with the total settled:
// Indonesia's restaurant tax (PB1) is 10% of the subtotal and its VAT (PPN) 10% or 11%, so
// the total split at that rate is the subtotal and the tax. Taken only when a reading prints
// a tax line, and a subtotal line in some reading shows the split's subtotal, whole or its
// last five digits (OCR often drops the first: "SUBTOTAL 56,364" for 156,364, "15, 000").
// CORD validation-20 and -93 (eval/cord-tax-split-2026-11-16.md).
const SPLIT_RATES = [0.1, 0.11];
function splitAtRate(texts, cents) {
  if (!texts.length || cents % 100 !== 0 || !texts.some((x) => styleOf(x) === "whole")) return null;
  const lines = texts.flatMap((x) => String(x).split(/\r?\n/));
  if (!lines.some((l) => (TAX_LINE_RE.test(l) || TAX_RE.test(l)) && !NOT_TAX_LINE_RE.test(l))) return null;
  const subDigits = lines.filter((l) => SUB_RE.test(l)).map((l) => l.replace(/\D/g, ""));
  const hits = [];
  for (const r of SPLIT_RATES) {
    const units = cents / 100, sub = Math.round(units / (1 + r)), tax = units - sub;
    const s = String(sub), tail = s.slice(-5);
    if (tax <= 0 || s.length < 4 || tax !== Math.round(sub * r)) continue;
    if (/^0+$/.test(tail.slice(1))) { if (!subDigits.some((d) => d.includes(s))) continue; }
    else if (!subDigits.some((d) => d.includes(tail))) continue;
    if (!hits.some((h) => h.cents === tax * 100)) hits.push({ cents: tax * 100, r, sub });
  }
  if (hits.length !== 1) return null;
  const h = hits[0];
  return { cents: h.cents, note: `no reading could read the tax line's amount: took ${h.cents / 100}, the total split at ${Math.round(h.r * 100)}% (a subtotal line shows ${h.sub}), check the tax` };
}

// One receipt read by OCR more than once (two page-segmentation modes, or two
// engines): the first reading is the default; a field the readings disagree on
// takes the reading the receipt's own arithmetic confirms. A total confirmed by
// more kinds of check (cash less change, subtotal plus tax, the items), counted over every reading's text, beats one confirmed by fewer;
// a tie keeps the first reading. Merchant and date follow the first reading;
// a merchant it missed is taken from another.
export function parseReceiptPasses(texts, opts = {}) {
  const ps = texts.filter((t) => String(t ?? "").trim()).map((t) => parseReceipt(t, opts));
  if (!ps.length) return parseReceipt("", opts);
  const best = ps[0];
  if (ps.length === 1) return best;
  const all = ps.flatMap((p) => p.checks);
  // "another total line" is left out here: in a second reading the first reading's
  // own total line, misread differently, shows up as one (on SROIE, counting it
  // picked the wrong reading as often as the right one)
  const support = (c) => new Set(all.filter(([v, w]) => v === c && w !== "another total line").map(([, w]) => w.replace(" plus tax", ""))).size;
  let pick = best;
  if (ps.length >= 3) pick = voteTotal(ps, support, texts.filter((t) => String(t ?? "").trim()).map((t) => cleanOcr(String(t)))) ?? best;
  else for (const p of ps.slice(1)) if (p.cents !== null && p.cents !== pick.cents && (pick.cents === null || support(p.cents) > support(pick.cents))) pick = p;
  const out = { ...best };
  if (pick !== best) {
    Object.assign(out, { cents: pick.cents, taxCents: pick.taxCents, tipCents: pick.tipCents, items: pick.items, itemsOk: pick.itemsOk, taxIncluded: pick.taxIncluded, totalLine: pick.totalLine });
    out.notes = [...best.notes.filter((n) => !/total|items add/i.test(n)), `OCR readings disagree on the total (${ps.map((p) => p.cents === null ? "none" : (p.cents / 100).toFixed(2)).join(" vs ")}); took ${(pick.cents / 100).toFixed(2)}, ${pick.derived ? `${pick.derived}: check the total` : "which the receipt's arithmetic confirms"}`];
  }
  const tax = voteTax(ps, out, pick, ps.length >= 3 ? texts.filter((t) => String(t ?? "").trim()).map((t) => cleanOcr(String(t))) : []);
  if (tax !== out.taxCents) {
    out.notes = [...out.notes, out.taxWhy ?? `OCR readings disagree on the tax (${ps.map((p) => p.taxCents === null ? "none" : (p.taxCents / 100).toFixed(2)).join(" vs ")}); took ${(tax / 100).toFixed(2)}`];
    out.taxCents = tax;
  }
  delete out.taxWhy;
  if (!out.merchant && (out.merchant = ps.find((p) => p.merchant)?.merchant ?? null)) out.notes = out.notes.filter((n) => n !== "no merchant found");
  // a date only the second reading found is not taken: on SROIE that filled 18
  // receipts, 9 right and 9 wrong, so the receipt asks instead
  out.ok = !!(out.date && out.merchant && out.cents);
  return out;
}

const sameReceipt = (a, b) => a.date === b.date && a.cents === b.cents && (a.merchant ?? "").toLowerCase() === (b.merchant ?? "").toLowerCase();

// Parse and keep every readable receipt; returns the new books, the ones kept
// and the blocks that could not be read (each with why).
// `text` may also be an array: one receipt photo read more than once by OCR
// (ocr.mjs receiptPassesFromFile), settled by parseReceiptPasses.
export function addReceipts(books, text) {
  const kept = [...(books.receipts ?? [])];
  let n = kept.reduce((m, r) => Math.max(m, +String(r.id).slice(1) || 0), 0);
  const added = [], skipped = [], duplicates = [];
  const parsed = Array.isArray(text) ? (text.length > 1 ? [parseReceiptPasses(text)] : splitReceipts(text[0] ?? "").map((b) => parseReceipt(b))) : splitReceipts(text).map((b) => parseReceipt(b));
  for (const p of parsed) {
    if (!p.ok) { skipped.push({ text: p.text.split("\n")[0], notes: p.notes }); continue; }
    const dup = kept.find((r) => sameReceipt(r, p));
    if (dup) { duplicates.push({ id: dup.id, merchant: p.merchant, date: p.date, cents: p.cents }); continue; }
    const foreign = p.currency && p.currency !== bookCode(books) ? p.currency : null;
    const r = { id: `r${++n}`, date: p.date, merchant: p.merchant, ...(foreign ? { currency: foreign } : {}), cents: p.cents, taxCents: p.taxCents, ...(p.items.length ? { items: p.items, printedTipCents: p.tipCents ?? undefined, taxIncluded: p.taxIncluded || undefined } : {}), matched: null, note: p.notes.join("; ") || undefined, text: p.text };
    kept.push(r); added.push(r);
  }
  return { books: matchReceipts({ ...books, receipts: kept }), added, skipped, duplicates };
}

const overlap = (a, b) => {
  const A = new Set(payeeTokens(a)), B = payeeTokens(b);
  if (!A.size || !B.length) return 0;
  // either side may be a prefix of the other ("amzn" / "amazon" is not caught; "blue" / "bluebottle" is)
  const hit = B.filter((t) => A.has(t) || [...A].some((x) => x.length >= 4 && t.length >= 4 && (x.startsWith(t) || t.startsWith(x)))).length;
  return hit / Math.min(A.size, B.length);
};

// Pair each unmatched receipt with at most one outflow on a bank account. The
// amount must equal the receipt total, or exceed it by up to `tipPct` (a tip
// added at the table); the bank date must fall `before` days before to `after`
// days after the receipt date. Best pairs go first: payee words in common, then
// an exact amount, then the closer date. Pairs fixed by hand are kept.
//
// A receipt in another currency (r.currency) cannot be compared by amount alone.
// The rate is, in order: `rates[CUR]` (books-currency units per one foreign
// unit, passed in or kept in books.fxRates), else the median rate of receipts
// in that currency already matched. With a rate the bank amount must be within
// `fxTolerance` of it (default 6%: card fees and the spread on top of the
// day's rate); with no rate at all the payee words must agree and the amount
// only has to be a plausible multiple (0.2x to 5x). The rate each pair implies
// is kept as r.fxRate, and later foreign receipts are matched against it.
export function matchReceipts(books, { before = 3, after = 7, tipPct = 0.25, rates = {}, fxTolerance = 0.06 } = {}) {
  const receipts = (books.receipts ?? []).map((r) => ({ ...r }));
  const known = { ...(books.fxRates ?? {}), ...rates };
  const learned = (cur) => {
    const xs = receipts.filter((r) => r.currency === cur && r.matched && r.fxRate).map((r) => r.fxRate).sort((a, b) => a - b);
    return xs.length ? xs[Math.floor(xs.length / 2)] : null;
  };
  const bank = new Set(books.accounts.filter((a) => a.bank).map((a) => a.code));
  const taken = new Set(receipts.filter((r) => r.matched).map((r) => r.matched));
  const pool = books.transactions.filter((t) => bank.has(t.account) && t.cents < 0 && t.status !== "transfer" && !taken.has(t.id));
  const pairs = [];
  for (const r of receipts) {
    if (r.matched) continue;
    for (const t of pool) {
      const gap = day(t.date) - day(r.date);
      if (gap < -before || gap > after) continue;
      const paid = -t.cents;
      const words = overlap(r.merchant, t.desc);
      if (r.currency) {
        const rate = known[r.currency] ?? learned(r.currency);
        const implied = paid / r.cents;
        if (rate ? Math.abs(implied / rate - 1) > fxTolerance : words < 0.5 || implied < 0.2 || implied > 5) continue;
        if (words < 0.5 && gap > 2) continue;
        pairs.push({ r, t, words, exact: 1, gap: Math.abs(gap), extra: 0, fxRate: implied, rated: Boolean(rate) });
        continue;
      }
      const extra = paid - r.cents;
      if (extra < 0 || extra > Math.round(r.cents * tipPct)) continue;
      // an amount that is not exact needs the payee to agree, or it is a coincidence
      if (extra > 0 && words < 0.5) continue;
      // an exact amount with other words on the line is a guess: only a close date makes it worth showing
      if (words < 0.5 && gap > 2) continue;
      pairs.push({ r, t, words, exact: extra === 0 ? 1 : 0, gap: Math.abs(gap), extra });
    }
  }
  pairs.sort((a, b) => b.words - a.words || b.exact - a.exact || a.gap - b.gap || String(a.t.id).localeCompare(String(b.t.id)));
  const usedT = new Set(), usedR = new Set();
  for (const p of pairs) {
    if (usedT.has(p.t.id) || usedR.has(p.r.id)) continue;
    usedT.add(p.t.id); usedR.add(p.r.id);
    p.r.matched = p.t.id;
    p.r.tipCents = p.extra || undefined;
    if (p.r.currency) { p.r.fxRate = Math.round(p.fxRate * 1e6) / 1e6; p.r.rateSource = p.rated ? "given or learned" : "implied by this pair only"; }
    p.r.payeeAgrees = p.words >= 0.5;
  }
  // Second pass: one bank line that is the sum of two to four unmatched receipts
  // (one card charge for several slips, or a vendor billing a day's receipts at
  // once). Only for same-currency receipts, an exact sum, and a payee word shared
  // with every receipt, so a coincidental total of unrelated slips is not offered.
  for (const t of pool) {
    if (usedT.has(t.id)) continue;
    const paid = -t.cents;
    const cands = receipts.filter((r) => !r.matched && !r.currency && r.cents < paid && day(t.date) - day(r.date) >= -before && day(t.date) - day(r.date) <= after && overlap(r.merchant, t.desc) >= 0.5);
    if (cands.length < 2 || cands.length > 12) continue;
    const found = [];
    const walk = (from, chosen, sum) => {
      if (found.length > 1) return;
      if (sum === paid && chosen.length >= 2) { found.push(chosen.slice()); return; }
      if (sum >= paid || chosen.length === 4) return;
      for (let i = from; i < cands.length; i++) walk(i + 1, [...chosen, cands[i]], sum + cands[i].cents);
    };
    walk(0, [], 0);
    if (found.length !== 1) continue; // none, or more than one way to reach the total: ask, don't guess
    usedT.add(t.id);
    for (const r of found[0]) { r.matched = t.id; r.group = found[0].length; r.payeeAgrees = true; }
  }
  return { ...books, receipts };
}

export function attachReceipt(books, receiptId, txnId) {
  const receipts = (books.receipts ?? []).map((r) => ({ ...r }));
  const r = receipts.find((x) => x.id === receiptId);
  if (!r) throw new Error(`no receipt ${receiptId}`);
  if (txnId === null || txnId === "") { r.matched = null; return { ...books, receipts }; }
  const t = books.transactions.find((x) => x.id === txnId);
  if (!t) throw new Error(`no line ${txnId}`);
  const other = receipts.find((x) => x.matched === txnId && x.id !== receiptId && !x.group);
  if (other) other.matched = null;
  r.matched = txnId; delete r.tipCents; delete r.group;
  if (r.currency) r.fxRate = Math.round((-t.cents / r.cents) * 1e6) / 1e6;
  return { ...books, receipts };
}

export function removeReceipt(books, receiptId) {
  if (!(books.receipts ?? []).some((r) => r.id === receiptId)) throw new Error(`no receipt ${receiptId}`);
  return { ...books, receipts: books.receipts.filter((r) => r.id !== receiptId) };
}

// The review: what matched, what did not, and which spending has no receipt.
export function receiptReport(books, { minCents = 7500, from = null, to = null } = {}) {
  const receipts = books.receipts ?? [];
  const byTxn = new Map(books.transactions.map((t) => [t.id, t]));
  const bank = new Set(books.accounts.filter((a) => a.bank).map((a) => a.code));
  const have = new Set(receipts.map((r) => r.matched).filter(Boolean));
  const inRange = (d) => (!from || d >= from) && (!to || d <= to);
  const matched = receipts.filter((r) => r.matched && byTxn.has(r.matched)).map((r) => ({ ...r, line: byTxn.get(r.matched) }));
  const unmatched = receipts.filter((r) => !r.matched || !byTxn.has(r.matched));
  // wages, owner draws, tax remittances and loan payments are not purchases a receipt would cover
  const map = accountMap(books.accounts);
  const needs = (t) => { const a = t.posted ? map.get(t.posted) : null; return !a || ((a.type === "expense" || (a.type === "asset" && !a.bank)) && a.code !== "6150"); };
  const missing = books.transactions
    .filter((t) => bank.has(t.account) && t.cents <= -minCents && t.status !== "transfer" && needs(t) && !have.has(t.id) && inRange(t.date))
    .sort((a, b) => a.cents - b.cents || a.date.localeCompare(b.date));
  const spend = books.transactions.filter((t) => bank.has(t.account) && t.cents < 0 && t.status !== "transfer" && inRange(t.date));
  const covered = spend.filter((t) => have.has(t.id));
  const weak = matched.filter((m) => m.tipCents || m.payeeAgrees === false);
  return {
    receipts: receipts.length, matched, unmatched, missing, weak,
    minCents,
    coveredCents: covered.reduce((s, t) => s - t.cents, 0),
    spendCents: spend.reduce((s, t) => s - t.cents, 0),
    missingCents: missing.reduce((s, t) => s - t.cents, 0),
  };
}

// Tax printed on receipts, by month and by the account the paid line was filed
// to. Only receipts with a tax line count; `noTax` lists the rest so a gap is
// visible rather than read as zero. `rate` is tax over the pre-tax amount, so a
// rate far from the others at one merchant is a misread worth a look. Tip is
// left out of the base. Not a return: a prompt for who to ask.
export function taxOnReceipts(books, { from = null, to = null } = {}) {
  const byTxn = new Map(books.transactions.map((t) => [t.id, t]));
  const names = accountMap(books.accounts);
  const inRange = (d) => (!from || d >= from) && (!to || d <= to);
  const months = new Map(), accounts = new Map(), rows = [], noTax = [];
  for (let r of books.receipts ?? []) {
    if (!inRange(r.date)) continue;
    if (!r.taxCents) { noTax.push({ id: r.id, date: r.date, merchant: r.merchant, cents: r.cents }); continue; }
    if (r.currency && !(r.matched && r.fxRate)) { noTax.push({ id: r.id, date: r.date, merchant: r.merchant, cents: r.cents, note: `${r.currency}, not matched to a bank line, so no rate to convert` }); continue; }
    // a foreign receipt is counted in the books' currency at the rate its bank line implies
    if (r.currency) r = { ...r, cents: Math.round(r.cents * r.fxRate), taxCents: Math.round(r.taxCents * r.fxRate) };
    const base = r.cents - r.taxCents;
    const line = r.matched ? byTxn.get(r.matched) : null;
    const code = line?.posted ?? null;
    rows.push({ id: r.id, date: r.date, merchant: r.merchant, cents: r.cents, taxCents: r.taxCents, rate: base > 0 ? r.taxCents / base : null, account: code });
    const m = r.date.slice(0, 7), a = code ?? "unfiled";
    const add = (map, k) => { const x = map.get(k) ?? { taxCents: 0, baseCents: 0, receipts: 0 }; x.taxCents += r.taxCents; x.baseCents += base; x.receipts++; map.set(k, x); };
    add(months, m); add(accounts, a);
  }
  const out = (map, label) => [...map].sort(([x], [y]) => x.localeCompare(y)).map(([k, v]) => ({ ...label(k), ...v }));
  const taxCents = rows.reduce((s, r) => s + r.taxCents, 0);
  return {
    receipts: rows.length, taxCents,
    byMonth: out(months, (month) => ({ month })),
    byAccount: out(accounts, (code) => ({ code, name: names.get(code)?.name ?? (code === "unfiled" ? "Not matched, or line not filed yet" : code) })),
    rows, noTax,
  };
}

// Split a matched bank line by the receipt's items. Each item goes to the
// account the categorizer picks for its own words (your rules and what you
// filed before win, then the built-in keywords); an item it knows nothing about
// goes to `other`, else to the account the merchant's name suggests. Tax is
// shared out over the accounts in proportion to their items (largest remainder,
// so the cents add up), and a tip printed on the receipt joins the biggest one.
// Any tip added at the table, bank amount over the receipt, goes there too.
// -> { receipt, line, parts: [{account, cents, items}], unfiled, single }.
// `single` is the one account when every item lands in the same place: that is a
// plain filing, not a split. Nothing here changes the books; splitFromReceipt does.
export function planReceiptSplit(books, receiptId, { other = null, fix = {} } = {}) {
  let r = (books.receipts ?? []).find((x) => x.id === receiptId);
  if (!r) throw new Error(`no receipt ${receiptId}`);
  if (!r.items?.length) throw new Error(`receipt ${receiptId} has no line items that add up to its total`);
  const line = r.matched ? books.transactions.find((t) => t.id === r.matched) : null;
  if (!line) throw new Error(`receipt ${receiptId} is not matched to a bank line yet (receipts attach ${receiptId} LINEID)`);
  // One bank line paying several receipts (matchReceipts' second pass): split by
  // every receipt's items, or the others' totals would land on one account as a "tip".
  let group = null;
  if (r.group) {
    const members = books.receipts.filter((x) => x.group && x.matched === line.id);
    const bare = members.find((x) => !x.items?.length);
    if (bare) throw new Error(`receipt ${receiptId} shares bank line ${line.id} with ${members.length - 1} other receipt${members.length === 2 ? "" : "s"}, and ${bare.id} has no line items that add up to its total, so the line cannot be split by items`);
    group = members.map((x) => x.id);
    r = {
      ...r,
      items: members.flatMap((x) => x.items),
      cents: members.reduce((s, x) => s + x.cents, 0),
      // tax printed inside the item prices is already in them; only tax added on top is shared out
      taxCents: members.reduce((s, x) => s + (x.taxIncluded ? 0 : x.taxCents ?? 0), 0),
      taxIncluded: undefined,
      printedTipCents: members.reduce((s, x) => s + (x.printedTipCents ?? 0), 0) || undefined,
    };
  }
  // a foreign receipt is split in the books' currency: items and tax scaled by
  // the rate the bank line implies; any cent of rounding lands on the biggest part
  if (r.currency && r.fxRate) {
    const k = r.fxRate, c = (x) => Math.round(x * k);
    r = { ...r, items: r.items.map((i) => ({ ...i, cents: c(i.cents) })), taxCents: r.taxCents ? c(r.taxCents) : r.taxCents, cents: c(r.cents) };
  }
  const model = modelFor(books);
  const merchant = suggest({ desc: line.desc, cents: line.cents }, model);
  const fallback = other ?? merchant.account;
  const groups = new Map();
  const unfiled = [];
  for (const it of r.items) {
    const s = suggest({ desc: it.desc, cents: -it.cents }, model);
    const fixed = Object.entries(fix).find(([w]) => it.desc.toLowerCase().includes(w.toLowerCase()));
    let account = fixed ? fixed[1] : s.account && s.account !== "transfer" ? s.account : fallback;
    const taught = Boolean(fixed || (other && account === other && !(s.account && s.account !== "transfer")));
    if (!account || account === "transfer") { unfiled.push(it); continue; }
    if (!groups.has(account)) groups.set(account, { account, cents: 0, items: [] });
    const g = groups.get(account);
    g.cents += it.cents; g.items.push(taught ? { ...it, taught } : it);
  }
  const parts = [...groups.values()].sort((a, b) => b.cents - a.cents);
  const itemSum = r.items.reduce((a, i) => a + i.cents, 0);
  if (parts.length && !unfiled.length) {
    // tax in proportion to the items, largest remainder
    const tax = r.taxIncluded ? 0 : r.taxCents ?? 0;
    if (tax) {
      const raw = parts.map((p) => (tax * p.cents) / itemSum);
      const base = raw.map(Math.floor);
      let left = tax - base.reduce((a, b) => a + b, 0);
      raw.map((x, i) => [x - base[i], i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]).forEach(([, i]) => { if (left-- > 0) base[i]++; });
      parts.forEach((p, i) => { p.taxCents = base[i]; p.cents += base[i]; });
    }
    // the rest (printed tip, tip at the table) onto the biggest account
    const rest = -line.cents - parts.reduce((a, p) => a + p.cents, 0);
    if (rest) { parts[0].extraCents = rest; parts[0].cents += rest; }
  }
  const sign = line.cents < 0 ? -1 : 1;
  return { receipt: r, line, ...(group ? { group } : {}), parts: parts.map((p) => ({ ...p, cents: sign * p.cents })), unfiled, single: parts.length === 1 && !unfiled.length ? parts[0].account : null };
}

// Post the split. Needs every item to have an account, so pass `other` when the
// plan lists unfiled items. One account for everything is filed plainly.
export function splitFromReceipt(books, receiptId, opts = {}) {
  const plan = planReceiptSplit(books, receiptId, opts);
  if (plan.unfiled.length) throw new Error(`${plan.unfiled.length} item${plan.unfiled.length === 1 ? "" : "s"} (${plan.unfiled.map((i) => i.desc).join(", ")}) match no account; name one with --other CODE`);
  const choice = plan.single ?? plan.parts.map((p) => ({ account: p.account, cents: p.cents }));
  const out = confirm(books, { [plan.line.id]: choice });
  // Item-level learning: an item you placed (--fix WORD=CODE, or the --other
  // catch-all) is remembered under its own words, so the next receipt with it
  // lands there without being told. Items the categorizer already placed are not
  // re-taught. Skipped when `learn` is false.
  const taught = [];
  if (opts.learn !== false) {
    for (const p of plan.parts) for (const it of p.items) {
      if (!it.taught) continue;
      out.history.push(historyRecord({ desc: it.desc, cents: -it.cents }, p.account));
      taught.push({ desc: it.desc, account: p.account });
    }
  }
  return { books: out, plan, taught };
}
