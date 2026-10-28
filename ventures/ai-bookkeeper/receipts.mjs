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

const amountsIn = (line, style = false) => (style === "whole"
  ? [...line.replace(RP, " ").matchAll(WHOLE)].map((m) => Number(m[1].replace(/[.,]/g, "")) * 100).filter((c) => Number.isSafeInteger(c))
  : [...line.matchAll(moneyRe(style))].map((m) => parseCents(m[1], style)).filter((c) => Number.isInteger(c)));

// Receipts are separated by a line of three or more dashes, equals signs or
// underscores, or by a form feed. One receipt with no separator is fine.
export function splitReceipts(text) {
  return String(text ?? "").split(/^\s*(?:[-=_]{3,}|\f)\s*$/m).map((b) => b.trim()).filter(Boolean);
}

// Lines that carry an amount but are not things bought.
const NOT_ITEM_RE = /\b(?:tunai|kembali(?:an)?|kartu|ppn|pb\s*1|pajak)\b|sub\s*-?total|zwischensumme|\bgesamt|\bsumme\b|\btotale?\b|\btotaal\b|\btotal\b|\btax\b|\bvat\b|\bgst\b|\bhst\b|\bpst\b|\btva\b|\bmwst\b|\biva\b|\bbtw\b|\btip\b|gratuity|change|cash|tender|visa|mastercard|mc\s|amex|debit|credit|card|payment|paid|balance|amount|discount|coupon|savings|points|rounding|\bauth\b|\bref\b|\bacct\b|\bthank/i;
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

export function parseReceipt(block, { dayFirst = null } = {}) {
  const lines = cleanOcr(String(block)).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const notes = [];
  const comma = wholeStyle(lines.join("\n")) ? "whole" : commaStyle(lines.join("\n"));
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
      const a = amountsIn(l, comma).length ? amountsIn(l, comma) : bare(lines[i + 1]);
      if (a.length && a[a.length - 1] > 0) {
        cents = a[a.length - 1]; from = l; at = i;
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
    const pick = (re) => { const i = lines.findIndex((l) => re.test(l)); if (i < 0) return null; const a = amountsIn(lines[i], comma).length ? amountsIn(lines[i], comma) : bare(lines[i + 1]); return a.length ? a[a.length - 1] : null; };
    const tender = pick(/\b(?:cash|tendered|payment|paid|accepted\s+total)\b/i), change = pick(/\bchange\b/i);
    if (tender !== null && change !== null && tender > change) { cents = tender - change; notes.push("no total line; cash handed over less change"); }
  }
  if (cents === null) {
    const all = lines.flatMap((l) => amountsIn(l, comma));
    if (all.length) { cents = Math.max(...all); notes.push("no total line; took the largest amount"); }
  }
  if (cents === null) notes.push("no amount found");

  let taxCents = null;
  for (const l of lines) if (TAX_RE.test(l) && (!TOTAL_RE.test(l) || TAX_TOTAL_RE.test(l)) && !/subtotal/i.test(l) && !NOT_TAX_RE.test(l)) { const a = amountsIn(l, comma); if (a.length) taxCents = a[a.length - 1]; }
  if (taxCents !== null && cents !== null && taxCents >= cents) taxCents = null;
  // line items, kept only if they add up to the printed total (with the tax and
  // any tip, or already including tax); the merchant line is not an item
  let tipCents = null;
  for (const l of lines) if (TIP_RE.test(l) && !TOTAL_RE.test(l)) { const a = amountsIn(l, comma); if (a.length) tipCents = a[a.length - 1]; }
  const items = parseItems(lines, comma);
  let itemsOk = false;
  if (items.length && cents !== null) {
    const sum = items.reduce((a, i) => a + i.cents, 0);
    if (sum + (taxCents ?? 0) + (tipCents ?? 0) === cents) itemsOk = true;
    else if (sum + (tipCents ?? 0) === cents && taxCents !== null) itemsOk = "tax included";
    else notes.push(`items add to ${(sum / 100).toFixed(2)} but the total is ${(cents / 100).toFixed(2)}${taxCents !== null ? " with tax" : ""}: not used for a split`);
  }
  const currency = detectCurrency(lines);
  return { date, merchant, currency, cents, taxCents, tipCents, items: itemsOk ? items : [], itemsOk: !!itemsOk, taxIncluded: itemsOk === "tax included", ok: !!(date && merchant && cents), notes, totalLine: from, text: lines.join("\n").slice(0, 400) };
}

const sameReceipt = (a, b) => a.date === b.date && a.cents === b.cents && (a.merchant ?? "").toLowerCase() === (b.merchant ?? "").toLowerCase();

// Parse and keep every readable receipt; returns the new books, the ones kept
// and the blocks that could not be read (each with why).
export function addReceipts(books, text) {
  const kept = [...(books.receipts ?? [])];
  let n = kept.reduce((m, r) => Math.max(m, +String(r.id).slice(1) || 0), 0);
  const added = [], skipped = [], duplicates = [];
  for (const block of splitReceipts(text)) {
    const p = parseReceipt(block);
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
  return { receipt: r, line, parts: parts.map((p) => ({ ...p, cents: sign * p.cents })), unfiled, single: parts.length === 1 && !unfiled.length ? parts[0].account : null };
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
