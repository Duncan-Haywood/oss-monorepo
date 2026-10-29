// Bank and card CSV reading: one statement file in, a list of transactions out,
// each with an ISO date, a description, a signed amount in integer cents (money
// INTO the account is positive) and, when the file has one, the running
// balance the bank printed. Column names are matched by alias. Pure functions,
// no DOM, no network.

import { decodeEntities } from "./xmlent.mjs";
import { isMt940, isCamt, readMt940, readCamt } from "./sepa.mjs";
import { isBai2, readBai2 } from "./bai2.mjs";
import { isN43, readN43 } from "./n43.mjs";
import { isCfonb, readCfonb } from "./cfonb.mjs";
import { isPlaid, readPlaid } from "./plaid.mjs";
import { readStatementText } from "./statementtext.mjs";

const ALIASES = {
  date: ["дата операции", "дата", "дата проводки", "תאריך", "תאריך עסקה", "תאריך ערך", "ημερομηνία", "ημερομηνία συναλλαγής", "ngày giao dịch", "ngày", "date", "transaction date", "trans. date", "trans date", "posted date", "post date", "posting date", "booking date", "effective date", "completed date", "started date", "date (utc)", "datetime", "run date", "activity date", "txn date", "tran date", "created utc", "created", "created at",
    // German, French, Spanish, Italian, Dutch headers
    "datum", "date processed", "buchungstag", "buchungsdatum", "belegdatum", "date de l'opération", "date opération", "date operation", "fecha", "fecha operación", "fecha valor", "data", "data operazione", "data contabile", "data valuta", "boekdatum", "boekingsdatum", "transactiedatum",
    // Hungarian (OTP workbook): booking date before transaction date
    "könyvelés dátuma", "tranzakció dátuma", "dátum",
    // Swedish, Danish, Norwegian
    "bokföringsdatum", "transaktionsdatum", "transaktionsdag", "posteringsdato", "bogført", "bokført", "bokforingsdatum", "bokforingsdato", "bokföringsdag", "bokforingsdag", "dato", "dagsetning", "วันที่", "วันที่ทำรายการ",
    // Portuguese and Brazilian, Polish, Finnish, Turkish, Czech
    "data mov.", "data mov", "data movimento", "data lançamento", "data lancamento", "data valor", "data operacji", "data transakcji", "data księgowania", "data ksiegowania", "kirjauspäivä", "kirjauspaiva", "maksupäivä", "tarih", "datum zaúčtování", "datum provedení",
    // Japanese
    "取引日", "日付", "年月日", "お取扱日", "勘定日", "取扱日",
    // Korean, Chinese
    "거래일자", "거래일시", "거래일", "기준일자", "交易日期", "记账日期", "記帳日期", "交易时间", "交易時間",
    // value dates last: German Valuta/Wertstellung are not the booking date
    "order date", "created (utc)", "created", "created date (utc)", "created at", "timestamp", "paid at", "transferred at",
    "wertstellung", "valuta", "date de valeur", "date valeur", "value date",
    // Indonesian
    "tanggal", "tgl", "التاريخ", "تاريخ العملية"],
  desc: ["transaktionsbeschreibung", "title", "zpráva", "název protiúčtu", "item1", "описание", "назначение платежа", "наименование операции", "תיאור", "תיאור פעולה", "פרטים", "περιγραφή", "αιτιολογία", "nội dung", "mô tả", "diễn giải", "description", "transaction description", "transactions", "payee", "merchant", "name", "label", "details", "original description", "memo", "posting details", "narrative", "counter party", "counterparty", "narration", "reference", "partner name", "partnername", "note",
    "beschreibung", "umsatzbeschreibung", "buchungsinformationen", "avisierungstext",  "notification text", "texte de notification", "testo di avviso", "verwendungszweck", "buchungstext", "beguenstigter/zahlungspflichtiger", "begünstigter/zahlungspflichtiger", "libellé", "libelle", "descripción", "descripcion", "concepto", "descrizione", "dettagli", "beneficiario", "bénéficiaire", "beneficiaire", "causale", "omschrijving", "naam / omschrijving", "naam tegenpartij", "naam tegenpartij bevat", "tegenpartij", "mededeling", "mededelingen", "vrije mededeling", "paaiškinimai", "partner neve", "partner név", "közlemény", "remarque", "remarques", "bemerkung", "opmerking",
    "text", "tekst", "rubrik", "referens", "skýring", "skyring", "รายการ", "รายละเอียด", "beskrivelse", "forklaring", "meddelande", "meddelelse",
    "opis transakcji", "dane kontrahenta", "tytuł przelewu", "saaja/maksaja", "descrição", "descricao", "histórico", "historico", "opis", "tytuł", "tytul", "nadawca/odbiorca", "selitys", "saaja/maksaja", "açıklama", "aciklama", "popis", "zpráva pro příjemce", "opis operacji", "keterangan", "uraian", "الوصف", "البيان", "التفاصيل",
    "摘要", "お取引内容", "取引内容", "内容", "備考", "お取り扱い内容", "적요", "거래내용", "내용", "기재내용", "보낸분/받는분", "摘要", "交易摘要", "交易备注", "交易備註", "对方户名", "對方戶名", "附言", "用途"],
  amount: ["item total", "amount(in rs)", "amount (in rs)", "total (inclusive of fees and/or spread)", "buchungsbetrag", "zaúčtovaná částka", "сумма", "insättning/uttag", "insattning/uttag", "upphæð", "uphaed", "จำนวนเงิน", "סכום", "ποσό", "số tiền", "amount", "amount (total)", "transaction amount", "amt", "value", "amount (usd)", "amount ($)", "amount (gbp)", "amount (eur)", "bedrag (eur)", "cad$", "betrag", "betrag (eur)", "betrag (€)", "montant", "importe", "importo", "bedrag", "net", "suma", "összeg", "belopp", "beløb", "belop", "beløp", "valor", "kwota", "määrä", "määrä euroa", "montante", "maara", "tutar", "částka", "castka", "金額", "取引金額", "거래금액", "交易金额", "交易金額", "发生额", "發生額"],
  debit: ["расход", "uttag", "ถอน", "เงินออก", "ถอนเงิน", "списание", "сумма списания", "חובה", "χρέωση", "ghi nợ", "số tiền ghi nợ", "debit",  "débit en chf", "debit in chf", "debit in eur", "lastschrift in chf", "debits", "withdrawal", "withdrawals", "withdrawal amt.", "withdrawal amt", "withdrawal amount", "withdrawal (-)", "withdrawals (-)", "debit (-)", "money out", "paid out", "amount debit", "debit amount", "debit amount (positive)", "outflow", "debet", "soll", "lastschrift", "lastschrift in chf", "lastschrift in eur", "débit", "debit (eur)", "cargo", "dare", "uscite", "addebiti", "addebito", "ut fra konto", "ut fra", "débito", "debito", "borç", "مدين", "出金金額", "出金", "お支払金額", "お引出し", "支払金額", "引出金額", "출금금액", "출금액", "출금", "찾으신금액", "지급금액", "支出", "支出金额", "支出金額", "借方发生额", "借方發生額", "借方金额", "借方金額", "付款金额"],
  credit: ["приход", "insättning", "insattning", "ฝาก", "เงินเข้า", "ฝากเงิน", "зачисление", "сумма зачисления", "זכות", "πίστωση", "ghi có", "số tiền ghi có", "credit",  "crédit en chf", "credits", "deposit", "deposits", "deposit amt.", "deposit amt", "deposit amount", "deposit (+)", "deposits (+)", "credit (+)", "money in", "paid in", "amount credit", "credit amount", "credit amount (positive)", "inflow", "haben", "gutschrift", "gutschrift in chf", "gutschrift in eur", "crédit", "credito", "crédito", "abono", "avere", "entrate", "accrediti", "accredito", "inn på konto", "inn pa konto", "inn på", "alacak", "kredit", "دائن", "入金金額", "入金", "お預入れ", "預入金額", "お預り金額", "입금금액", "입금액", "입금", "맡기신금액", "수입금액", "收入", "收入金额", "收入金額", "贷方发生额", "貸方發生額", "贷方金额", "貸方金額", "存入金额"],
  balance: ["остаток", "คงเหลือ", "ยอดคงเหลือ", "staða", "остаток по счёту", "יתרה", "υπόλοιπο", "số dư", "balance", "solde en chf", "running balance", "runningbalance", "running bal.", "ledger balance", "closing balance", "balance (gbp)", "balance (eur)", "balance (usd)", "saldo", "kontostand", "solde", "saldo (eur)", "saldo in chf", "saldo in eur", "saldo na trn", "saldo po operacji", "saldo po transakcji", "saldo após", "saldo apos", "saldo contabilístico", "saldo contabilistico", "bakiye", "الرصيد", "zůstatek", "残高", "差引残高", "現在残高", "잔액", "거래후잔액", "거래 후 잔액", "余额", "餘額", "账户余额", "賬戶餘額", "当前余额"],
};

const DAY_FIRST_HEADER = /^(дата операции|расход|приход|остаток|תאריך|תאריך עסקה|חובה|זכות|יתרה|ημερομηνία|ημερομηνία συναλλαγής|χρέωση|πίστωση|υπόλοιπο|ngày giao dịch|ghi nợ|ghi có|số dư|narration|วันที่|วันที่ทำรายการ|ถอน|ฝาก|คงเหลือ|dagsetning|withdrawal amt\.?|deposit amt\.?|value dt|chq\.?\/ref\.?no\.?|cargo|abono|concepto|fecha (operaci[oó]n|valor)|tanggal|keterangan|uraian|kredit|data (mov\.?|movimento|lan[cç]amento|valor|operacji|contabile|operazione|valuta|da opera[cç][aã]o)|descri[cç][aã]o|descrizione|hist[oó]rico|d[eé]bito|dare|avere|kwota|opis operacji|data ksi[eę]gowania|kirjausp[aä]iv[aä]|maksup[aä]iv[aä]|tarih|datum zaú[cč]tov[aá]n[ií]|datum proveden[ií]|saldo po operacji|saldo ap[oó]s)$/;

// The delimiter is the one that splits most of the first lines into the same
// number of fields, so a one-line preamble ("Account summary") or a prose line
// with a comma above the header does not decide it. The comma wins ties.
function pickDelimiter(s) {
  const lines = s.split(/\r\n|\r|\n/).filter((l) => l.trim() !== "").slice(0, 20);
  let best = ",", bestScore = -1;
  for (const d of [",", ";", "\t", "|"]) {
    const freq = new Map();
    for (const l of lines) { const n = l.replace(/"[^"]*"/g, "").split(d).length; if (n > 1) freq.set(n, (freq.get(n) ?? 0) + 1); }
    let score = 0;
    for (const [n, f] of freq) score = Math.max(score, f * 1000 + n);
    if (score > bestScore) { best = d; bestScore = score; }
  }
  return best;
}

const FOOTER = /^\W*(?:this is an? (?:computer|system)[- ]generated|(?:computer|system)[- ]generated statement)|^(total|totals|grand total|sub-?total|generated|printed|page \d|end of|number of|count|records?)\b/i;

// RFC 4180 CSV: quoted fields, doubled quotes, CRLF, a BOM, and a ; or tab
// delimiter when the header has more of those than commas.
// A quote that never closes would swallow every later line into one field, so
// it is re-read as a literal character and its line kept in rows.unclosedQuotes.
export function parseCsv(text, literal = new Set()) {
  const s = String(text ?? "").replace(/^﻿/, "");
  const delim = pickDelimiter(s);
  const rows = [];
  let row = [], field = "", quoted = false, openAt = -1;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"' && field === "" && !literal.has(i)) { quoted = true; openAt = i; }
    else if (c === delim) { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  if (quoted) return parseCsv(s, new Set(literal).add(openAt));
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  const lines = [...literal].sort((a, b) => a - b).map((i) => s.slice(0, i).split(/\r\n|\r|\n/).length);
  Object.defineProperty(rows, "unclosedQuotes", { value: lines });
  return rows;
}

// "1,234.56", "(12.00)", "-$5", "12.00-", "12.50 DR" or "DR 12.50" (debit, negative), "1.234,56" (decimalComma) -> cents.
// Arabic-Indic (U+0660), Persian (U+06F0) and fullwidth digits, and the Arabic
// decimal (U+066B) and thousands (U+066C) marks, written as ASCII.
export const asciiDigits = (s) => String(s ?? "")
  .replace(/[\u0660-\u0669\u06F0-\u06F9\uFF10-\uFF19]/g, (c) => { const n = c.charCodeAt(0); return String(n >= 0xFF10 ? n - 0xFF10 : n >= 0x06F0 ? n - 0x06F0 : n - 0x0660); })
  .replace(/\u066B/g, ".").replace(/\u066C/g, ",");
export function parseCents(v, decimalComma = false) {
  let s = asciiDigits(v).trim();
  if (s === "" || /^[-–—−‐‑‒﹣－\s]+$/.test(s)) return 0;
  if (/\d\s*e\s*[-+]?\d/i.test(s)) return NaN; // "1e3" is not 13.00
  // "10 AAPL" is ten shares, not ten dollars: a four- or five-letter ticker after the number (3-letter codes read as currencies).
  { const t = s.match(/\d\s*([A-Z]{4,5})\s*$/); if (t && !/^(?:DEBIT|CREDIT)$/.test(t[1])) return NaN; }
  if (/\d\s*[kmb]\.?\s*$/i.test(s) || /\d[kmb]\d/i.test(s)) return NaN; // "12.5k" is not 12.50, and not guessable either
  // Bahraini, Kuwaiti, Omani, Jordanian and Tunisian amounts have three decimals; cents
  // cannot hold a nonzero third digit, so report the row rather than drop it.
  if (/\b(?:BHD|KWD|OMR|JOD|TND)\b/i.test(s) && /[.,]\d\d[1-9]$/.test((s.match(/\d[\d.,]*/) || [""])[0])) return NaN;
  // Exports and copy-paste bring the minus in as U+2212, an en or em dash, or a Unicode hyphen.
  const neg = /\(\s*[^()]*\d[^()]*\)/.test(s) || /^[^0-9]*[-−–—‐‑‒﹣－]/.test(s) || /[-−–—‐‑‒﹣－]\s*(?:\p{L}{2,3}\.?\s*)?$/u.test(s) || /\d\s*(?:[a-z]{3}\s*)?(?:dr|db|debit)\.?\s*$/i.test(s) || /^\s*(?:dr|db|debit)\.?\s*[^a-z0-9]{0,3}\d/i.test(s);
  // A currency written in letters ahead of the number ("د.ا.‏4.750", "Rs. 1,200") would leave stray dots.
  s = s.replace(/^[^0-9]*\p{L}[^0-9]*/u, "").replace(/[^0-9]+$/, (t) => (/\p{L}/u.test(t) ? "" : t));
  s = s.replace(/[^0-9.,]/g, "");
  // Both separators: the last one is the decimal point, whatever the flag says.
  // One separator with 1-2 digits after it is a decimal point too; only a
  // lone separator before exactly three digits ("1,234") needs the flag.
  const lastDot = s.lastIndexOf("."), lastComma = s.lastIndexOf(",");
  let comma = decimalComma;
  if (lastDot >= 0 && lastComma >= 0) comma = lastComma > lastDot;
  else if (/^\d*[.,]\d{1,2}$/.test(s) && !/[.,].*[.,]/.test(s)) comma = lastComma >= 0;
  s = comma ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  if (!s) return NaN;
  const n = Number(s);
  if (!Number.isFinite(n)) return NaN;
  // Round on the decimal string, not n * 100: 1.005 * 100 is 100.49999999999999.
  const c = Math.round(Number(`${n.toFixed(6)}e2`));
  if (!Number.isSafeInteger(c)) return NaN;
  return neg && c ? -c : c; // never -0
}

// ISO, M/D/Y or D/M/Y (dayFirst), with 2- or 4-digit years, or "12 Mar 2026".
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
// German, French, Spanish, Italian, Dutch and Portuguese month words (accents
// stripped, lower case) by their first three letters; the ones that differ from
// English are listed here. "juin" and "juil" share a prefix, so a word
// starting "juil" is July and "juin" June.
const MONTH_WORDS = { gen: 1, aou: 8, ene: 1, fev: 2, mrz: 3, mrt: 3, abr: 4, avr: 4, mai: 5, mei: 5, mag: 5, giu: 6, lug: 7, ago: 8, set: 9, okt: 10, ott: 10, out: 10, dez: 12, dic: 12 };
const monthOf = (word) => {
  const w = word.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  if (/^juil/.test(w)) return 7;
  if (/^juin/.test(w)) return 6;
  const k = w.slice(0, 3);
  return MONTHS[k] || MONTH_WORDS[k] || undefined;
};
// Two-digit years: 20yy unless that lies more than five years ahead, then 19yy
// ("12/03/95" in a Money 95 export is 1995, not 2095).
const fullYear = (yy) => (yy >= 100 ? yy : 2000 + yy > new Date().getUTCFullYear() + 5 ? 1900 + yy : 2000 + yy);
export function parseDate(v, dayFirst = false) {
  const s = asciiDigits(v).trim().replace(/^(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?,?\s+/i, "").replace(/^(\d{1,2})(?:st|nd|rd|th)\b/i, "$1").replace(/^(\d{1,2})([A-Za-z]{3})(\d{2,4})\b/, "$1 $2 $3").replace(/^(\d{1,2})\.\s*(?=\p{L})/u, "$1 ").replace(/^(\d{1,2}) de (\p{L}+) de (\d)/u, "$1 $2 $3");
  let y, m, d, x;
  if ((x = s.match(/^(\d{4})(\d{2})(\d{2})(?!\d)/))) [y, m, d] = [+x[1], +x[2], +x[3]];
  else if ((x = s.match(/^(\d{4})[-/.:](\d{1,2})[-/.:](\d{1,2})/))) [y, m, d] = [+x[1], +x[2], +x[3]];
  else if ((x = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/))) {
    [m, d] = dayFirst ? [+x[2], +x[1]] : [+x[1], +x[2]];
    y = fullYear(+x[3]);
  } else if ((x = s.match(/^(\d{1,2})[ -](\p{L}{3}\p{L}*)\.?[ ,-]+(\d{2,4})/u))) {
    [d, m, y] = [+x[1], monthOf(x[2]), fullYear(+x[3])];
  } else if ((x = s.match(/^(\p{L}{3}\p{L}*)\.? (\d{1,2}),? (\d{4})/u))) {
    [m, d, y] = [monthOf(x[1]), +x[2], +x[3]];
  }
  // Unix epoch seconds (10 digits) or milliseconds (13), as crypto and API exports write them (rotki's Timestamp).
  if (!y && (x = s.match(/^(\d{10}|\d{13})$/))) {
    const t = x[1].length === 13 ? +x[1] : +x[1] * 1000;
    if (t >= 9.46e11 && t < 4.1e12) return new Date(t).toISOString().slice(0, 10);
  }
  if (!y && (x = s.match(/^(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日?/))) [y, m, d] = [+x[1], +x[2], +x[3]];
  if (!y || !m || !d || m > 12 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null;
  return dt.toISOString().slice(0, 10);
}

const norm = (h) => String(h).trim().toLowerCase().replace(/_/g, " ").replace(/\s+/g, " ").replace(/^"|"$/g, "").replace(/^#/, "");

export function detectColumns(header) {
  const h = header.map(norm);
  const find = (key) => {
    for (const a of ALIASES[key]) { const i = h.indexOf(a); if (i !== -1) return i; }
    return -1;
  };
  const cols = Object.fromEntries(Object.keys(ALIASES).map((k) => [k, find(k)]));
  // A currency code after the column name ("Amount USD", "Betrag EUR",
  // "Balance GBP", "Debit CAD") names the same column as the bare word.
  // Also "Amount in EUR", "Betrag in EUR", "Amount, EUR" and "Amount - EUR".
  const CCY = /^(.+?)[\s,:\-–]*(?:\bin\b\s*)?[(\[]?\s*(?:in\s+)?[a-z]{3}\s*[)\]]?$/;
  for (const k of ["amount", "debit", "credit", "balance"]) {
    if (cols[k] !== -1) continue;
    cols[k] = h.findIndex((x, i) => {
      const m = CCY.exec(x);
      // "Paid In (GBP)", "Money in GBP": the pattern's optional "in" ate the name's own last word
      return m && (ALIASES[k].includes(m[1]) || ALIASES[k].includes(m[1] + " in")) && !Object.values(cols).includes(i);
    });
  }
  // "Value" is the value date in PostFinance (Date, Posting details, Credit,
  // Debit, Value, Balance): beside money-in/out columns it is not the amount.
  // A truncated "Value Dat" (HDFC's fixed-width text export) is read as "Value"
  // plus a three-letter currency code by the pattern above; same rule.
  if (cols.amount !== -1 && /^value( dat)?$/.test(h[cols.amount]) && (cols.debit !== -1 || cols.credit !== -1)) cols.amount = -1;
  // Amazon's order-history report (order id, items, to, date, total, tax,
  // refund, payments): the order total is the amount, the items the memo.
  if (cols.amount === -1 && cols.debit === -1 && cols.credit === -1 && h.includes("order id") && h.includes("total")) {
    cols.amount = h.indexOf("total");
    if (cols.desc === -1 && h.includes("items")) cols.desc = h.indexOf("items");
  }
  // Etsy's payment-account CSV (Date, Type, Title, Info, Currency, Amount,
  // Fees & Taxes, Net): Amount is "--" on a fee row, Net is the cash effect.
  if (h.includes("fees & taxes") && h.includes("net") && cols.amount !== -1 && h[cols.amount] === "amount") {
    cols.amount = h.indexOf("net");
    if (h.includes("title")) cols.desc = h.indexOf("title");
  }
  // Stripe's balance-transactions export (Amount, Fee, Net, Created (UTC)):
  // Net is what moved the Stripe balance; Amount is the gross before the fee.
  if (h.includes("fee") && h.includes("net") && h.includes("created (utc)") && cols.amount !== -1 && h[cols.amount] === "amount") cols.amount = h.indexOf("net");
  // Paytm's wallet statement (Date, Activity, Source/Destination, Wallet Txn ID,
  // Comment, Debit, Credit, ..., Status): the activity is the description.
  if (cols.desc === -1 && h.includes("activity") && h.includes("wallet txn id")) cols.desc = h.indexOf("activity");
  if (cols.desc === -1) {
    // Some banks split payee and memo; take the first text-looking column left.
    // Same-ranked candidates (two "... name" columns) are told apart by their
    // text, not their position, so a file reads the same with its columns shuffled.
    const taken = Object.values(cols), rank = (x) => ["desc", "payee", "name", "memo", "detail"].findIndex((k) => x.includes(k));
    const cands = h.map((x, i) => [x, i]).filter(([x, i]) => !taken.includes(i) && rank(x) !== -1);
    cands.sort((a, b) => rank(a[0]) - rank(b[0]) || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] - b[1]));
    cols.desc = cands.length ? cands[0][1] : -1;
  }
  return cols;
}

// Wells Fargo checking exports have no header row: date, amount, "*", check
// number, description. Recognised by shape, since there is nothing to name.
function headerlessShape(rows) {
  const sample = rows.slice(0, 5);
  return sample.length > 0 && sample.every((r) => r.length === 5 && parseDate(r[0]) && /^[-+]?\$?[\d,]*\.?\d+$/.test(r[1].trim()) && r[2].trim() === "*");
}

const AMT = /^[-+]?\$?\(?[\d,]*\.?\d+\)?-?$/;
// Australian (CBA, ANZ style) and Canadian (TD style) CSVs also come with no
// header row. CBA: date, signed amount, description, balance (balance may be
// missing, as ANZ does). TD: date, description, withdrawal, deposit, balance.
// -> { bank, columns, dayFirst } or null. Layouts are from memory.
function headerlessLayout(rows) {
  const sample = rows.slice(0, 5);
  if (!sample.length) return null;
  const trimmed = sample.map((r) => { let n = r.length; while (n > 0 && !String(r[n - 1] ?? "").trim()) n--; return r.slice(0, n); });
  if (headerlessShape(sample)) return { bank: "wells-fargo", columns: { date: 0, amount: 1, desc: 4, balance: -1, debit: -1, credit: -1 }, dayFirst: false };
  const dated = (r) => /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(r[0].trim()) && parseDate(r[0], true);
  if (trimmed.every((r) => (r.length === 3 || r.length === 4) && dated(r) && AMT.test(r[1].trim()) && r[2].trim() && !AMT.test(r[2].trim()) && (r.length === 3 || AMT.test(r[3].trim()))))
    return { bank: trimmed[0].length === 4 ? "cba" : "anz", columns: { date: 0, amount: 1, desc: 2, balance: trimmed[0].length === 4 ? 3 : -1, debit: -1, credit: -1 }, dayFirst: true };
  if (trimmed.every((r) => r.length === 5 && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(r[0].trim()) && parseDate(r[0]) && r[1].trim() && !AMT.test(r[1].trim()) && ((r[2].trim() === "") !== (r[3].trim() === "")) && AMT.test((r[2].trim() || r[3].trim())) && AMT.test(r[4].trim())))
    return { bank: "td", columns: { date: 0, desc: 1, debit: 2, credit: 3, balance: 4, amount: -1 }, dayFirst: false };
  return inferHeaderless(rows);
}

// Any other file with no header row: find the columns from the cells. The date
// column parses as dates in every row, the amount is a numeric column (or a
// money-out / money-in pair with one cell filled per row), a balance is the
// numeric column that chains with the amounts, a D/C or Af/Bij flag signs an
// unsigned amount, and the description is the longest text column. The first
// row must be data, so a file with a header is never read this way.
// Layouts: the 17 header-less ones in bank2ynab's config (eval/bank2ynab-probe.mjs).
const NUMCELL = /^[-+]?[$€£]?\(?[\d.,' ]*\d\)?-?$/;
const FLAG = /^(d|c|dr|cr|debit|credit|debet|af|bij)$/i;
function inferHeaderless(rows) {
  const body = rows.filter((r) => r.some((c) => String(c ?? "").trim())).slice(0, 30);
  if (body.length < 2 || body[0].length < 3) return null;
  const width = Math.max(...body.map((r) => r.length));
  const cell = (r, i) => String(r[i] ?? "").trim();
  const col = (i) => body.map((r) => cell(r, i));
  const isDate = (v) => { if (/^\d{8}$/.test(v)) { const d = parseDate(v); return !!d && +d.slice(0, 4) > 1990 && +d.slice(0, 4) < 2100; } return /^\d{1,4}[-/. :]\d|^\d{1,2}[ -][A-Za-z]{3}|^[A-Za-z]{3,9}\.? \d{1,2},? \d{4}/.test(v) && (!!parseDate(v, true) || !!parseDate(v, false)); };
  const dateCol = Array.from({ length: width }, (_, i) => i).find((i) => { const c = col(i); return isDate(c[0]) && c.filter(isDate).length >= 0.9 * c.length; });
  if (dateCol === undefined) return null;
  const money = (v) => NUMCELL.test(v) && /[.,]\d{1,2}\)?-?$/.test(v);
  const fill = (c) => c.filter(Boolean).length / c.length;
  const numeric = []; const flags = []; const texts = [];
  for (let i = 0; i < width; i++) {
    if (i === dateCol) continue;
    const c = col(i), ne = c.filter(Boolean);
    if (!ne.length) continue;
    if (ne.every(money)) numeric.push(i);
    else if (fill(c) >= 0.9 && ne.every((v) => FLAG.test(v))) flags.push(i);
    else if (fill(c) >= 0.5 && !ne.every((v) => NUMCELL.test(v))) texts.push(i);
  }
  if (!texts.length) return null;
  const all = numeric.flatMap((i) => col(i));
  const comma = all.some((v) => /,\d{1,2}\)?-?$/.test(v)) && !all.some((v) => /\.\d{1,2}\)?-?$/.test(v));
  const cents = (v) => { const x = parseCents(v, comma); return Number.isFinite(x) ? x : 0; };
  const full = numeric.filter((i) => fill(col(i)) >= 0.9), sparse = numeric.filter((i) => fill(col(i)) < 0.9);
  // Does the balance column move by the amounts, whichever way the file is sorted?
  const chains = (amt, bal) => { if (amt.length < 2) return false; const up = amt.every((a, i) => i === 0 || bal[i] - bal[i - 1] === a), down = amt.every((a, i) => i === 0 || bal[i - 1] - bal[i] === a); return up || down; };
  const columns = { date: dateCol, amount: -1, debit: -1, credit: -1, balance: -1, desc: -1 };
  let note = null;
  const bodyCents = (i) => col(i).map(cents);
  if (sparse.length >= 2 && sparse.length + full.length <= 3) {
    const [a, b] = sparse.slice(0, 2), ca = col(a), cb = col(b);
    if (ca.every((v, k) => Boolean(v) !== Boolean(cb[k]))) {
      const bal = full.length === 1 ? bodyCents(full[0]) : null;
      const aOut = ca.map((v) => (v ? -Math.abs(cents(v)) : 0)), bIn = cb.map((v) => (v ? Math.abs(cents(v)) : 0));
      const aIn = ca.map((v) => (v ? Math.abs(cents(v)) : 0)), bOut = cb.map((v) => (v ? -Math.abs(cents(v)) : 0));
      const firstOut = aOut.map((x, k) => x + bIn[k]), firstIn = aIn.map((x, k) => x + bOut[k]);
      const signed = ca.concat(cb).some((v) => /^\(|^-|-$/.test(v));
      let outFirst = true;
      if (bal && chains(firstOut, bal)) outFirst = true;
      else if (bal && chains(firstIn, bal)) outFirst = false;
      else if (!signed) note = "Money-out and money-in columns are not labelled; the first was read as money out. Check the signs against the statement.";
      if (signed) { columns.debit = b; columns.credit = a; }
      else { columns.debit = outFirst ? a : b; columns.credit = outFirst ? b : a; }
      if (bal) columns.balance = full[0];
    }
  }
  if (columns.debit === -1) {
    if (!full.length) return null;
    if (full.length === 1) columns.amount = full[0];
    else {
      let found = false;
      for (const a of full) for (const b of full) if (!found && a !== b && chains(bodyCents(a), bodyCents(b))) { columns.amount = a; columns.balance = b; found = true; }
      if (!found) columns.amount = full[0];
    }
  }
  const amountCol = columns.amount;
  const drcr = amountCol !== -1 && flags.length === 1 && !col(amountCol).some((v) => /^\(|^-|-$/.test(v)) ? flags[0] : -1;
  columns.desc = texts.reduce((best, i) => (col(i).reduce((n, v) => n + v.length, 0) > col(best).reduce((n, v) => n + v.length, 0) ? i : best), texts[0]);
  // Day or month first, from any date with a part above 12; a dot separator reads as European.
  let dayFirst = false, decided = false;
  for (const v of col(dateCol)) {
    const m = v.match(/^(\d{1,2})[-/.](\d{1,2})[-/.]\d{2,4}/);
    if (!m) { if (/^\d{1,2}[ -][A-Za-z]/.test(v)) { dayFirst = true; decided = true; } continue; }
    if (+m[1] > 12) { dayFirst = true; decided = true; break; }
    if (+m[2] > 12) { dayFirst = false; decided = true; break; }
  }
  if (!decided && col(dateCol).some((v) => /^\d{1,2}\.\d{1,2}\.\d/.test(v))) dayFirst = true;
  return { bank: null, columns, dayFirst, drcr, note };
}

// Which export this is, from its header or shape alone. Informational; the
// column matching does the work. null when it is none of the five shapes.
export function sniffBank(rows) {
  { const h = headerlessLayout(rows); if (h) return h.bank; }
  for (const r of rows.slice(0, 12)) {
    const h = r.map(norm).join("|");
    if (/^details\|posting date\|description\|amount\|type\|balance/.test(h)) return "chase-checking";
    if (/^transaction date\|post date\|description\|category\|type\|amount/.test(h)) return "chase-card";
    if (/^account type\|account number\|transaction date\|cheque number\|description 1\|description 2\|cad\$/.test(h)) return "rbc";
    if (/^bank account\|date\|narrative\|debit amount\|credit amount\|balance/.test(h)) return "westpac";
    if (/^date\|amount\|account number\|\|transaction type\|transaction details\|balance/.test(h)) return "nab";
    if (/^date\|description\|amount\|running bal/.test(h)) return "bank-of-america";
    if (/^type\|product\|started date\|completed date\|description\|amount\|fee\|currency\|state\|balance/.test(h)) return "revolut";
    if (/^transaction id\|date\|time\|type\|name\|emoji\|category\|amount\|currency/.test(h)) return "monzo";
    if (/^date\|counter party\|reference\|type\|amount \((gbp|eur|usd)\)\|balance/.test(h)) return "starling";
    if (/^date \(utc\)\|description\|amount\|status\|source account/.test(h)) return "mercury";
    if (/^(id\|)?timestamp\|transaction type\|asset\|quantity transacted\|/.test(h)) return "coinbase";
    if (/^buchungsdatum\|wertstellung\|status\|zahlungspflichtige\*r\|zahlungsempf(ä|ae)nger\*in\|verwendungszweck\|umsatztyp/.test(h)) return "dkb";
    if (/^belegdatum\|wertstellung\|status\|beschreibung\|umsatztyp\|betrag \(€\)/.test(h)) return "dkb-card";
    if (/^booking date\|value date\|partner name\|partner iban\|type\|payment reference/.test(h)) return "n26";
    // N26's older English export and its German and French ones (column lists from the beancount-n26 importer's tables)
    if (/^(date\|payee\|account number\|transaction type\|payment reference|datum\|empf(ä|ae?)nger\|kontonummer\|transaktionstyp\|verwendungszweck|date\|b(é|e)n(é|e)ficiaire\|num(é|e)ro de compte\|type de transaction\|r(é|e)f(é|e)rence de paiement)/.test(h)) return "n26";
    // Newer exports name the first (once blank) column "Username" and put the account's own name on row 2.
    if (/^(username\|)?id\|datetime\|type\|status\|note\|from\|to\|amount \(total\)/.test(h.replace(/^\|/, ""))) return "venmo";
    if (/^transaction id\|date\|transaction type\|currency\|amount\|fee\|net amount/.test(h)) return "cash-app";
    if (/^date\|description\|original description\|category\|amount\|status/.test(h)) return "usaa";
    if (/^date\|description\|type\|amount\|current balance\|status/.test(h)) return "sofi";
    if (/^transferwise id\|date\|(date time\|)?amount\|currency\|description/.test(h)) return "wise";
    if (/^transaction date\|posted date\|card no\.\|description\|category\|debit\|credit/.test(h)) return "capital-one";
    if (/^trans\. date\|post date\|description\|amount\|category/.test(h)) return "discover";
    if (/^status\|date\|description\|debit\|credit/.test(h)) return "citi";
    if (/^date\|transaction\|name\|memo\|amount/.test(h)) return "us-bank";
    if (/^date\|time\|amount\|type\|description/.test(h)) return "ally";
    if (/^transaction date\|clearing date\|description\|merchant\|category\|type\|amount \(usd\)/.test(h)) return "apple-card";
    if (/^transaction date\|transaction type\|sort code\|account number\|transaction description\|debit amount\|credit amount/.test(h)) return "lloyds";
    if (/^number\|date\|account\|amount\|subcategory\|memo/.test(h)) return "barclays";
    if (/^date\|description\|withdrawals\|deposits\|balance/.test(h)) return "pnc";
    if (/^date\|status\|type\|checknumber\|description\|withdrawal\|deposit\|runningbalance/.test(h)) return "schwab";
    // Schwab's newer checking export: no Status column, and note lines under the header.
    if (/^date\|type\|check #\|description\|withdrawal \(-\)\|deposit \(\+\)\|runningbalance/.test(h)) return "schwab";
    if (/^run date\|account\|account number\|action\|symbol\|description/.test(h)) return "fidelity";
    // Fidelity's cash-management export: the payee is in Action, "Security Description" says "No Description".
    if (/^run date\|action\|symbol\|security description\|security type/.test(h)) return "fidelity";
    // Schwab's brokerage "Transactions" export: a title line above the header, a "Transactions Total" row below.
    if (/^date\|action\|symbol\|description\|quantity\|price\|fees (&|and) comm\|amount/.test(h)) return "schwab-brokerage";
    if (/^date\|time\|/.test(h) && /\|gross\|/.test(h) && /\|status\|/.test(h) && /\|net(\||$)/.test(h)) return "paypal";
    if (/^date\|description\|amount\|balance\|account name/.test(h)) return "relay";
    if (/^transaction date\|posted date\|description\|amount\|status\|memo\|card last four/.test(h)) return "brex";
    if (/^transaction date\|description\|type\|amount\|net amount\|settled date/.test(h)) return "chime";
    if (/^date\|description\|debit\|credit\|balance\|type/.test(h)) return "bluevine";
    if (/^date\|description\|(card member\|account #\|)?amount/.test(h)) return "amex";
    // Swisscard's cashback export (columns from the tariochbctools importer): charges are positive.
    if (/^transaction date\|description\|amount\|currency\|(status\|)?merchant category\|registered category/.test(h)) return "swisscard";
  }
  return null;
}

// Card exports disagree on which sign is a charge (Amex lists charges as
// positive, Chase as negative). The payment rows settle it: a payment lowers
// what is owed, so charges carry the opposite sign.
function chargesArePositive(rows) {
  // "Payment thank you" style rows only appear on card statements. "Autopay"
  // and "online payment" also name a checking account's outgoing bill
  // payments, so they count only when most rows are positive, as a card
  // export with positive charges would be.
  const strong = rows.filter((r) => /payment.*thank you|payment received|directpay|ach deposit internet transfer/i.test(r.desc));
  const weak = rows.filter((r) => /autopay|automatic payment|online payment|^(card |statement )?payment$/i.test(r.desc));
  let pay = strong;
  if (pay.length === 0 && weak.length > 0 && rows.filter((r) => r.cents > 0).length >= rows.length * 0.7) pay = weak;
  if (pay.length === 0) return null;
  const neg = pay.filter((r) => r.cents < 0).length;
  return neg > pay.length / 2;
}

// OFX/QFX (SGML 1.x or XML 2.x) and QIF, which most banks offer next to CSV.
// Both carry signed amounts in the account's own convention (a card charge is
// already negative), so no sign inference is done. Returns the same shape as
// the CSV path. The balance is only known for the last row (LEDGERBAL).
export function sniffFormat(text) {
  text = String(text ?? "");
  if (isCamt(text)) return "camt053";
  if (isMt940(text)) return "mt940";
  if (isBai2(text)) return "bai2";
  if (isN43(text)) return "n43";
  if (isCfonb(text)) return "cfonb";
  if (isPlaid(text)) return "plaid";
  const head = text.slice(0, 2000);
  if (/<OFX>|OFXHEADER:|<STMTTRN>/i.test(head) || /<STMTTRN>/i.test(text)) return "ofx";
  if (/^\s*!(Type|Account|Option)/im.test(head)) return "qif";
  if (/^000\t\d{8}\t/.test(head)) return "esis";
  if (/^07[45]\d{16}/m.test(head) && /^075\d{16}/m.test(head)) return "gpc";
  if (/^\uFEFF?Pohyby na .{1,4}tu/i.test(head) && /^datum za.{1,4}tov.{1,3}n.{1,3}:/im.test(head)) return "cz-text";
  return "csv";
}

function ofxDate(v) {
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(String(v).trim());
  return m ? parseDate(`${m[1]}${m[2]}${m[3]}`) : null; // 20120231 is no day: skip it, don't book it
}

function ofxTag(block, tag) {
  const m = new RegExp(`<${tag}>(?:\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|\\s*([^<\\r\\n]*))`, "i").exec(block);
  return m ? (m[1] !== undefined ? m[1].trim() : unescapeOfx(m[2].trim())) : "";
}

// Some banks escape the text twice ("&amp;lt;DEFTPYMT&amp;gt;", seen in Actual
// Budget's html-vals.qfx), so a payee would read "&lt;DEFTPYMT&gt;". When one
// pass leaves a basic named reference behind, one more pass is the bank's
// intended text; numeric references and unknown names are left alone.
function unescapeOfx(s) {
  const once = decodeEntities(s);
  return /&(?:amp|lt|gt|quot|apos);/.test(once) ? decodeEntities(once) : once;
}

// A file from a bank with several accounts (or a card beside a checking
// account) holds one STMTRS or CCSTMTRS block per account. -> [{ id, type,
// card, text }], each `text` a complete one-account OFX file, so readOfx and
// the importer need no changes. A single-account file comes back as one entry.
export function splitOfx(text) {
  const re = /<(STMTRS|CCSTMTRS)>[\s\S]*?<\/\1>/gi;
  const blocks = text.match(re) ?? [];
  if (blocks.length < 2) {
    const one = blocks[0] ?? text;
    return [{ ...ofxAccount(one), text }];
  }
  const first = text.search(re);
  const head = text.slice(0, first);
  return blocks.map((b) => ({ ...ofxAccount(b), text: head + b + "</OFX>" }));
}

function ofxAccount(block) {
  const id = ofxTag(block, "ACCTID");
  const type = ofxTag(block, "ACCTTYPE");
  return { id, type, card: /<CCSTMTRS>/i.test(block) || /<CCACCTFROM>/i.test(block) };
}

export function readOfx(text) {
  const problems = [];
  const out = [];
  let booked = 0;
  const blocks = text.split(/<STMTTRN>/i).slice(1);
  blocks.forEach((raw, i) => {
    const b = raw.split(/<\/STMTTRN>/i)[0];
    const date = ofxDate(ofxTag(b, "DTPOSTED") || ofxTag(b, "DTUSER") || ofxTag(b, "DTAVAIL"));
    const cents = parseCents(ofxTag(b, "TRNAMT"));
    if (!date) { problems.push(`Transaction ${i + 1}: unreadable date, skipped.`); return; }
    if (!Number.isFinite(cents) || !/\d/.test(ofxTag(b, "TRNAMT"))) { problems.push(`Transaction ${i + 1}: unreadable amount, skipped.`); return; }
    if (cents === 0) return;
    // A memo that starts with the name (many banks repeat it, then add detail) is the fuller text on its own.
    const name = (ofxTag(b, "NAME") || ofxTag(b, "PAYEE")).replace(/\s+/g, " ");
    let memo = ofxTag(b, "MEMO").replace(/\s+/g, " ");
    // Some banks write the memo as "TYPE;NAME" (ofxparse's bank_medium.ofx): the name is already there.
    if (name && memo.toLowerCase().endsWith(";" + name.toLowerCase())) memo = memo.slice(0, -name.length - 1).trim();
    let desc = (memo.toLowerCase().startsWith(name.toLowerCase()) ? memo : [name, memo].filter(Boolean).filter((x, j, a) => a.indexOf(x) === j).join(" "));
    // Some lines carry neither NAME nor MEMO (a check, an ATM withdrawal): say what kind of line it is.
    if (!desc) {
      const kind = ofxTag(b, "TRNTYPE").trim();
      const num = (ofxTag(b, "CHECKNUM") || ofxTag(b, "REFNUM")).trim();
      desc = [kind.length <= 3 ? kind.toUpperCase() : kind[0].toUpperCase() + kind.slice(1).toLowerCase(), num ? `#${num}` : ""].filter(Boolean).join(" ");
    }
    out.push({ line: i + 1, date, desc, cents, balance: null });
  });
  // Brokerage statements: dividends, interest and capital-gain distributions (INCOME) and fees (INVEXPENSE)
  // are cash a business books; buys and sells move value between cash and securities and are not booked.
  const invLines = text.split(/<(INCOME|INVEXPENSE)>/i);
  for (let k = 1; k < invLines.length; k += 2) {
    const kind = invLines[k].toUpperCase();
    const b = invLines[k + 1].split(/<\/(?:INCOME|INVEXPENSE)>/i)[0];
    const date = ofxDate(ofxTag(b, "DTTRADE") || ofxTag(b, "DTSETTLE"));
    const total = parseCents(ofxTag(b, "TOTAL"));
    if (!date || !Number.isFinite(total) || total === 0) { problems.push(`Brokerage ${kind.toLowerCase()} line ${(k + 1) / 2}: unreadable date or total, skipped.`); continue; }
    const memo = ofxTag(b, "MEMO").replace(/\s+/g, " ").trim() || (kind === "INCOME" ? ofxTag(b, "INCOMETYPE").trim() || "Income" : "Brokerage expense");
    out.push({ line: blocks.length + (k + 1) / 2, date, desc: memo, cents: kind === "INCOME" ? Math.abs(total) : -Math.abs(total), balance: null });
    booked++;
  }
  const trades = (text.match(/<(BUYSTOCK|SELLSTOCK|BUYMF|SELLMF|BUYOPT|SELLOPT|BUYDEBT|SELLDEBT|BUYOTHER|SELLOTHER|REINVEST)>/gi) || []).length;
  if (trades && (out.length || booked)) problems.push(`${trades} brokerage buy/sell line${trades === 1 ? " was" : "s were"} not booked: they move value between cash and securities. Dividends, interest and fees were booked; record trades in your investment account separately.`);
  const lb = /<LEDGERBAL>[\s\S]*?<BALAMT>\s*([-+]?[\d.,]+)/i.exec(text);
  if (lb && out.length) {
    // The ledger balance is the figure after the newest day. Within that day it belongs on the row the
    // file lists last, which is the first row in a newest-first file (Nubank's, ofxtools' br_nubank_cc.ofx).
    const newestFirst = out[0].date > out[out.length - 1].date;
    const last = out.reduce((a, r) => (newestFirst ? (r.date > a.date ? r : a) : (r.date >= a.date ? r : a)), out[0]);
    const bal = parseCents(lb[1]);
    if (Number.isFinite(bal)) last.balance = bal;
  }
  if (!blocks.length && !booked) {
    // A failed download saves an error reply as a .ofx file; an investment-only file holds positions, not cash lines.
    const status = /<STATUS>\s*<CODE>\s*(\d+)\s*<SEVERITY>\s*ERROR\s*(?:<MESSAGE>([^<]*))?/i.exec(text);
    if (status && status[1] !== "0") problems.push(`The OFX file is an error reply from the bank (code ${status[1]}${status[2] ? `: ${status[2].trim()}` : ""}), not a statement. Download it again.`);
    else if (/<(INVPOSLIST|INVTRANLIST|INVSTMTRS)>/i.test(text)) problems.push("This OFX file is an investment statement (positions and trades) with no cash transactions; investment lines are not booked.");
    else problems.push("No transactions (STMTTRN) were found in the OFX file.");
  }
  let statement = null;
  if (lb) {
    const d = /<LEDGERBAL>[\s\S]*?<DTASOF>\s*(\d{4})(\d{2})(\d{2})/i.exec(text);
    const bal = parseCents(lb[1]);
    if (d && Number.isFinite(bal)) statement = { cents: bal, date: `${d[1]}-${d[2]}-${d[3]}` };
  }
  return { rows: out, problems, columns: null, bank: "ofx", inferred: null, statement };
}

// Quicken's multi-account export: an `!Account` block (N name, T type) opens
// each account, followed by its `!Type:` section of transactions. -> [{ id,
// type, text }], `id` the account name and each `text` a one-account QIF file,
// or [] when the file names fewer than two accounts.
// Lithuania's LITAS-ESIS statement (.acc, tab-separated, cp1257, no header): a
// "000" line for the account, "010" lines for transactions (date YYYYMMDD in
// column 3, amount in cents in 5, a D/K flag in 7, document no. in 11, purpose in
// 14, counterparty in 18) and "020" opening/closing balance lines. Layout from
// the ofxstatement-lithuanian plugin's parser (read from its sdist).
export function readEsis(text) {
  const problems = [], out = [];
  text.split(/\r?\n/).forEach((l, i) => {
    const f = l.split("\t");
    if (f[0] !== "010") return;
    const date = ofxDate(f[2]);
    const cents = /^\d+$/.test((f[4] ?? "").trim()) ? Number(f[4]) : NaN;
    const flag = (f[6] ?? "").trim().toUpperCase();
    if (!date) return problems.push(`Line ${i + 1}: unreadable date "${f[2] ?? ""}", skipped.`);
    if (!Number.isFinite(cents)) return problems.push(`Line ${i + 1}: unreadable amount, skipped.`);
    if (flag !== "D" && flag !== "K" && flag !== "C") return problems.push(`Line ${i + 1}: no debit/credit flag (D or K), skipped.`);
    if (cents === 0) return;
    const desc = [f[17], f[13]].map((x) => (x ?? "").trim()).filter(Boolean).filter((x, j, a) => a.indexOf(x) === j).join(" ").replace(/\s+/g, " ");
    out.push({ line: i + 1, date, desc, cents: flag === "D" ? -cents : cents, balance: null });
  });
  if (!out.length) problems.push("No transactions (010 lines) were found in the LITAS-ESIS file.");
  return { rows: out, problems, columns: null, bank: "litas-esis", inferred: null };
}

// The Czech GPC statement (Fio, Ceska sporitelna, KB and others offer it): fixed-
// width lines of 128 characters. "074" opens a statement (account, previous and
// new balance in hellers with a +/- sign, statement date DDMMYY); "075" is a
// transaction (counter-account 20-35, document no. 36-48, amount in hellers
// 49-60, code 61: 1 debit, 2 credit, 4 debit storno, 5 credit storno, variable
// symbol 62-71, bank code + constant symbol 72-81, specific symbol 82-91,
// client name 98-117, due date DDMMYY 123-128). Layout as published in the
// ofxstatement-czech plugin's docstring (read from its sdist); code is mine.
// Decode the file as Windows-1250 first.
export function readGpc(text) {
  const problems = [], out = [];
  let statement = null;
  const date6 = (v) => { const m = /^(\d\d)(\d\d)(\d\d)$/.exec(v); return m ? `${Number(m[3]) < 70 ? 20 : 19}${m[3]}-${m[2]}-${m[1]}` : null; };
  text.split(/\r?\n/).forEach((l, i) => {
    const kind = l.slice(0, 3);
    if (kind === "074") {
      const n = l.slice(60, 74), sign = l[74], d = date6(l.slice(108, 114));
      if (/^\d{14}$/.test(n) && (sign === "+" || sign === "-") && d) statement = { cents: (sign === "-" ? -1 : 1) * Number(n), date: d };
      return;
    }
    if (kind !== "075") return;
    const n = l.slice(48, 60), code = l[60], date = date6(l.slice(122, 128));
    if (!/^\d{12}$/.test(n)) return problems.push(`Line ${i + 1}: unreadable amount, skipped.`);
    if (!date) return problems.push(`Line ${i + 1}: unreadable date, skipped.`);
    if (!"1245".includes(code ?? "x")) return problems.push(`Line ${i + 1}: unknown accounting code "${code ?? ""}", skipped.`);
    const cents = Number(n) * (code === "1" || code === "5" ? -1 : 1);
    if (cents === 0) return;
    const strip = (v) => v.replace(/^0+/, "");
    const vs = strip(l.slice(61, 71)), acct = strip(l.slice(19, 35)), bank = /^0+$/.test(l.slice(71, 75)) ? "" : l.slice(71, 75);
    const desc = [l.slice(97, 117).trim(), acct && `acc ${acct}${bank ? "/" + bank : ""}`, vs && `VS ${vs}`].filter(Boolean).join(" ").replace(/\s+/g, " ");
    out.push({ line: i + 1, date, desc, cents, balance: null });
  });
  if (!out.length) problems.push("No transactions (075 lines) were found in the GPC file.");
  return { rows: out, problems, columns: null, bank: "gpc", inferred: null, statement };
}

// The Czech "Pohyby na uctu" text export (Raiffeisenbank's online banking and
// others): one block per movement, "key:   value" lines (booking date D.M.YYYY,
// amount with a dot, currency, balance after the movement, symbols, operation
// type, counter-account name and number, note). Values start at column 20. The
// note is wrapped at a fixed width, so its continuation lines are joined raw
// (the padding keeps words apart, a number split mid-way is rejoined). Newest
// block first. Layout read from the two samples in the ofxstatement-czech sdist
// (GPLv3, layout only, nothing copied); code is mine.
export function readCzBlocks(text) {
  const problems = [], out = [];
  const lines = String(text ?? "").replace(/^\uFEFF/, "").split(/\r?\n/);
  const account = /Pohyby na .{1,4}tu.{0,6}:\s*(\d+)/i.exec(lines[0] ?? "")?.[1] ?? null;
  const keys = [["date", /^datum/i], ["amount", /^.{1,3}stka$/i], ["ccy", /^m.{1,3}na$/i], ["balance", /^z.{1,3}statek$/i], ["vs", /^variabiln/i], ["type", /^ozna.{1,3}en/i], ["name", /^n.{1,3}zev prot/i], ["acct", /^prot.{1,3}.{1,3}et$/i], ["note", /^pozn.{1,3}mka$/i]];
  const money = (v) => {
    const m = /^([-+])?(\d+)(?:[.,](\d{1,2}))?$/.exec(String(v ?? "").replace(/\s/g, ""));
    return m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 100 + Number((m[3] ?? "").padEnd(2, "0") || 0)) : null;
  };
  let cur = null, last = null;
  const flush = () => {
    if (!cur) return;
    const b = cur; cur = null; last = null;
    const dm = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(b.date ?? "");
    const cents = money(b.amount);
    if (!dm || cents === null) return problems.push(`Line ${b.line}: unreadable date or amount, skipped.`);
    const vs = (b.vs ?? "").replace(/^0+(?=\d)/, "");
    const desc = [b.type, b.name, b.acct && `acc ${b.acct}`, vs && `VS ${vs}`, (b.note ?? "").replace(/\s+/g, " ")].map((v) => (v ?? "").trim()).filter(Boolean).join(" ");
    out.push({ line: b.line, date: `${dm[3]}-${dm[2].padStart(2, "0")}-${dm[1].padStart(2, "0")}`, desc, cents, balance: money(b.balance), ccy: b.ccy ?? "" });
  };
  lines.forEach((l, i) => {
    if (!l.trim()) { flush(); return; }
    const m = /^(\S[^:]*?):/.exec(l);
    const k = m && keys.find(([, re]) => re.test(m[1].trim()))?.[0];
    if (k) {
      if (k === "date") { flush(); cur = { line: i + 1 }; }
      if (!cur) return;
      cur[k] = k === "note" ? l.slice(19) : l.slice(m[0].length).trim();
      last = k;
    } else if (cur && last === "note" && /^\s/.test(l)) cur.note += l.slice(19);
  });
  flush();
  const ccys = new Set(out.map((r) => r.ccy).filter(Boolean));
  if (ccys.size > 1) problems.push(`The file mixes currencies (${[...ccys].join(", ")}); amounts are read as one currency. Split it per currency.`);
  if (!out.length) problems.push("No movements (datum/castka blocks) were found in the Czech text statement.");
  for (const r of out) delete r.ccy;
  return { rows: out, problems, columns: null, bank: "cz-text", inferred: null, account };
}

export function splitQif(text) {
  const parts = [];
  let head = "", cur = null, inAcct = false;
  for (const l of String(text ?? "").split(/\r?\n/)) {
    if (/^!account\b/i.test(l.trim())) { cur = { id: "", type: "", body: [] }; parts.push(cur); inAcct = true; continue; }
    if (l[0] === "!") inAcct = false;
    if (inAcct && cur) {
      if (l[0] === "N") cur.id = l.slice(1).trim();
      else if (l[0] === "T") cur.type = l.slice(1).trim();
      continue;
    }
    (cur ? cur.body : head ? [] : []).push(l);
    if (!cur) head += l + "\n";
  }
  const named = parts.filter((p) => p.id);
  if (named.length < 2) return [];
  return named.map((p) => ({ id: p.id, type: p.type, text: head + p.body.join("\n") + "\n" }));
}

// Without dayFirst given, a QIF whose dates have a first number over 12 and none a second is day first.
function qifDayFirst(text) {
  let day = 0, mon = 0;
  for (const l of text.split(/\r?\n/)) {
    if (l[0] !== "D") continue;
    const m = l.slice(1).trim().match(/^(\d{1,2})[-/.](\d{1,2})[-/.']/);
    if (m) { if (+m[1] > 12) day++; if (+m[2] > 12) mon++; }
  }
  return day > 0 && mon === 0;
}

export function readQif(text, { dayFirst } = {}) {
  if (dayFirst === undefined) dayFirst = qifDayFirst(text);
  const problems = [];
  const out = [];
  let cur = {};
  let n = 0;
  let inAccount = false; // an !Account block lists account names (N) and types (T), not transactions; so do the !Type:Cat, Class, Tag and Prices lists
  let accounts = 0, acctBlocks = 0; // KMyMoney writes a !Type:Bank header before its single !Account block, so named blocks outrank type headers
  const flush = (line) => {
    if (inAccount || (cur.D === undefined && cur.T === undefined)) { cur = {}; return; }
    n++;
    // Quicken writes years after 1999 as 3/29' 0 or 1/11'05 (apostrophe, then two digits, maybe space-padded).
    const date = parseDate(String(cur.D ?? "").replace(/'\s*(\d)\s*$/, "'0$1").replace(/'/g, "/").replace(/\s+/g, ""), dayFirst);
    const cents = parseCents(String(cur.T ?? cur.U ?? ""));
    if (!date) problems.push(`Line ${line}: unreadable date "${cur.D ?? ""}", skipped.`);
    else if (!Number.isFinite(cents)) problems.push(`Line ${line}: unreadable amount, skipped.`);
    else if (cents !== 0) out.push({ line, date, desc: [cur.P, cur.M].filter(Boolean).filter((x, j, a) => a.indexOf(x) === j).join(" ").replace(/\s+/g, " ").trim(), cents, balance: null });
    cur = {};
  };
  text.split(/\r?\n/).forEach((l, i) => {
    if (!l) return;
    const c = l[0];
    if (c === "!") {
      const isList = /^!type:\s*(cat|class|tag|prices?|payee|memorized)\b/i.test(l.trim());
      inAccount = /^!account\b/i.test(l.trim()) || isList;
      if (/^!account\b/i.test(l.trim())) acctBlocks++;
      if (/^!type:/i.test(l.trim()) && !isList) accounts++;
      return;
    }
    if (c === "^") return flush(i + 1);
    cur[c] = l.slice(1).trim();
  });
  if (Object.keys(cur).length) flush(text.split(/\r?\n/).length);
  if (!n) problems.push("No transactions were found in the QIF file.");
  if (acctBlocks) accounts = acctBlocks;
  if (accounts > 1 && n) problems.push(`The QIF file has ${accounts} account sections; all rows were read into one account. Split the file per account to keep transfers apart.`);
  return { rows: out, problems, columns: null, bank: "qif", inferred: null };
}

// -> { rows: [{ line, date, desc, cents, balance }], problems: [string], columns, bank, inferred }
// `invert` flips signs for card exports that list charges as positive. Leave it
// undefined and a file with no running balance that has payment rows is
// flipped when its payments are negative (`inferred` says so).
// Without dayFirst or decimalComma the CSV branch infers them from the cells
// (inferLocale); passing either one, true or false, is never overridden.
// A trade list's quantity and amount share a sign (buy: both positive; sell: both negative).
// A brokerage cash-activity file (dividend +31.04, purchase -31.04, blank or unrelated
// quantity) has the same headers but is already signed as cash, so it must not flip.
function tradeSignsAgree(out, rows, hdr) {
  const q = hdr.findIndex((h) => ["qty", "quantity", "shares"].includes(h));
  if (q === -1) return false;
  let agree = 0;
  for (const r of out) {
    const qty = parseCents(rows[r.line - 1]?.[q]);
    if (!Number.isFinite(qty) || qty === 0 || r.cents === 0) continue;
    if (Math.sign(qty) !== Math.sign(r.cents)) return false;
    agree++;
  }
  return agree > 0;
}

export function readStatement(text, { dayFirst, decimalComma, invert, year, onlyAccount } = {}) {
  // Classic-Mac files end lines with a bare CR; the line-based readers split on \n.
  text = String(text ?? "").replace(/\r(?!\n)/g, "\n");
  const dfGiven = dayFirst !== undefined, dcGiven = decimalComma !== undefined;
  dayFirst = !!dayFirst; decimalComma = !!decimalComma;
  const format = sniffFormat(text);
  if (format === "camt053" || format === "mt940") {
    const r = format === "camt053" ? readCamt(text) : readMt940(text);
    if (invert === true) for (const x of r.rows) x.cents = -x.cents;
    return r;
  }
  if (format === "bai2") { const r = readBai2(text); if (invert === true) for (const x of r.rows) x.cents = -x.cents; return r; }
  if (format === "n43") { const r = readN43(text); if (invert === true) for (const x of r.rows) x.cents = -x.cents; return r; }
  if (format === "cfonb") { const r = readCfonb(text); if (invert === true) for (const x of r.rows) x.cents = -x.cents; return r; }
  if (format === "plaid") { const r = readPlaid(text); if (invert === true) for (const x of r.rows) x.cents = -x.cents; return r; }
  if (format === "ofx") return readOfx(text);
  if (format === "esis") return readEsis(text);
  if (format === "gpc") return readGpc(text);
  if (format === "cz-text") return readCzBlocks(text);
  if (format === "qif") return readQif(text, dfGiven ? { dayFirst } : {});
  const rows = parseCsv(text);
  // Footer lines the bank prints after the last row ("Total transactions,,", "Page 1 of 2") would
  // break the all-rows layout tests of a header-less file, so they are cut before any of them run.
  while (rows.length > 2 && FOOTER.test(rows[rows.length - 1].map((c) => String(c).trim()).filter(Boolean).join(" ")) && rows[rows.length - 1].filter((c) => String(c).trim()).length === 1) rows.pop();
  const problems = [];
  for (const line of rows.unclosedQuotes) problems.push(`Line ${line}: a quote mark opens a field and never closes; it was read as a plain character. Check that row.`);
  // A general-ledger journal (Xero's Journal Report) lists both sides of each entry: not a bank statement.
  if (rows[0]?.some((h) => /^journal ?number$/i.test(String(h).trim())) && rows[0].some((h) => /^journal ?date$/i.test(String(h).trim())))
    return { rows: [], problems: ["This is an accounting journal export (it has JournalNumber and JournalDate columns, with both sides of each entry), not a bank statement. Import the bank's own file instead."], columns: null };
  // Coinbase's older account history (Timestamp, Balance, Amount, Currency) counts coins, not dollars: 0.5 BTC would book as 50 cents.
  {
    const h = rows[0]?.map((x) => String(x).trim().toLowerCase()) || [];
    const ci = h.indexOf("currency");
    if (ci !== -1 && h.includes("timestamp") && h.includes("amount") && h.includes("balance") && rows.slice(1, 50).some((r) => /^(BTC|ETH|LTC|BCH|USDC|XRP|DOGE|SOL|ADA|DOT)$/i.test(String(r[ci] || "").trim())))
      return { rows: [], problems: ["This is a crypto account history (Timestamp, Balance, Amount and Currency columns holding coins such as BTC), not a cash statement: the amounts are coin units, not dollars. Export the transaction report with USD totals or the bank's own file instead."], columns: null };
  }
  // A header-less file with a few lines of account summary above the data: drop leading rows until the rest has a layout.
  const hasHeader = (r) => { if (r.length < 2) return false; const c = detectColumns(r); return c.date !== -1 && (c.amount !== -1 || c.debit !== -1 || c.credit !== -1); };
  if (!rows.some(hasHeader) && !headerlessLayout(rows)) {
    for (let k = 1; k <= Math.min(10, rows.length - 2); k++) {
      if (headerlessLayout(rows.slice(k))) { rows.splice(0, k); problems.push(`${k} line${k === 1 ? "" : "s"} above the first transaction ${k === 1 ? "was" : "were"} skipped as a preamble.`); break; }
    }
  }
  if (!rows.some((r) => { if (r.length < 2) return false; const c = detectColumns(r); return c.date !== -1 && (c.amount !== -1 || c.debit !== -1 || c.credit !== -1); }) && !headerlessLayout(rows)) {
    const t = readStatementText(text, { dayFirst, decimalComma, year });
    if (t.rows.length) { if (invert === true) for (const x of t.rows) x.cents = -x.cents; return t; }
    if (t.problems.length) return t;
  }
  if (rows.length < 2 && !(rows.length === 1 && headerlessLayout(rows))) return { rows: [], problems: ["The file has no data rows."], columns: null };
  const bank = sniffBank(rows);
  let headerAt = rows.findIndex((r) => { const c = detectColumns(r); return c.date !== -1 && (c.amount !== -1 || c.debit !== -1 || c.credit !== -1); });
  let columns, first;
  // A header wider than every data row (Danske's Lithuanian export names 12 columns and writes 10):
  // the header's positions are wrong, so drop it and find the columns from the cells.
  let shortHeader = false;
  if (headerAt !== -1) {
    const hc = detectColumns(rows[headerAt]);
    const body = rows.slice(headerAt + 1).filter((r) => String(r[hc.date] ?? "").trim());
    if (body.length >= 2 && body.every((r) => r.length < rows[headerAt].length) && inferHeaderless(rows.slice(headerAt + 1))) { rows.splice(0, headerAt + 1); headerAt = -1; shortHeader = true; }
  }
  const hl = headerAt === -1 ? headerlessLayout(rows) : null;
  if (shortHeader) problems.push("The header names more columns than the rows have, so the columns were found from the cells instead. Check the signs and descriptions.");
  if (hl) { columns = hl.columns; first = 0; if (hl.dayFirst) dayFirst = true; }
  else if (headerAt === -1) return { rows: [], problems: ["No date and amount columns were found. Name them Date and Amount (or Debit and Credit)."], columns: null };
  else { columns = detectColumns(rows[headerAt]); first = headerAt + 1; }
  const out = [];
  let localeNote = null, ambiguousNote = null;
  if (!dfGiven || !dcGiven) {
    const loc = inferLocale(rows.slice(first), columns);
    if (!dfGiven && !hl && loc.dayFirst) { dayFirst = true; localeNote = "Dates read day first"; }
    if (!dfGiven && !hl && !dayFirst && loc.compactDayFirst) { dayFirst = true; localeNote = "Dates read day first (every date is ambiguous; month first would stretch the statement over months)"; }
    if (!dfGiven && !hl && !bank && !dayFirst && loc.allAmbiguous) ambiguousNote = "Every date could be read day first or month first; they were read month first (US). If this is a day-first bank, pass dayFirst, or the transactions land in the wrong months";
    if (!dcGiven && loc.decimalComma) { decimalComma = true; localeNote = (localeNote ? localeNote + " and " : "Amounts read") + (localeNote ? "amounts with decimal commas" : " with decimal commas"); }
  }
  // Italian, Portuguese, Brazilian, Polish, Finnish, Turkish and Czech headers:
  // those countries write day first, so 05/01/2026 with nothing above 12 is
  // 5 January, not 1 May.
  if (!dfGiven && !hl && !dayFirst && headerAt !== -1 && rows[headerAt].some((h) => DAY_FIRST_HEADER.test(norm(h)) || norm(h) === "billingamountsign")) { dayFirst = true; ambiguousNote = null; localeNote = localeNote ?? "Dates read day first"; }
  // A DR/CR (or Debit/Credit) marker column beside one unsigned amount column.
  const hdr0 = headerAt === -1 ? [] : rows[headerAt].map(norm);
  let drcrCol = columns.amount !== -1 ? hdr0.findIndex((x) => /^(d ?\/ ?k|d ?\/ ?c|c ?\/ ?d|af ?\/? ?bij|credit ?\/? ?debet|debet ?\/? ?credit|soll ?\/? ?haben|dr ?\/ ?cr|cr ?\/ ?dr|debit ?\/ ?credit|credit ?\/ ?debit|dr or cr|cr or dr|(?:credit ?\/? ?debit|debit ?\/? ?credit|cr ?\/? ?dr|dr ?\/? ?cr) indicator|(?:credit|debit) or (?:debit|credit) indicator)$/.test(x)) : -1;
  if (hl?.drcr > -1) drcrCol = hl.drcr;
  if (hl?.note) problems.push(hl.note);
  // Or a plain Type column holding DEBIT/CREDIT (Deposit/Withdrawal) words beside an
  // unsigned amount. Only when every value is in that vocabulary and no amount is
  // negative, so a card export's Sale/Return/Payment column is left alone.
  if (drcrCol === -1 && columns.amount !== -1 && headerAt !== -1) {
    const DRCR = /^(debit|credit|withdrawal|deposit|income|expense)(-recurring)?$/i;
    const body = rows.slice(first).filter((r) => String(r[columns.date] ?? "").trim());
    const t = hdr0.findIndex((x) => /^(transaction type|trans type|type|debit or credit|credit or debit|dr or cr)$/.test(x));
    // A signed amount is fine when the sign follows the marker one way throughout (debits
    // negative, or debits positive as in Maybe's export); a mix is left to the amount's own sign.
    const neg = (r) => /^\s*[-(]|-\s*$/.test(String(r[columns.amount] ?? ""));
    const out = (r) => /^(debit|withdrawal|expense)(-recurring)?$/i.test(String(r[t] ?? "").trim());
    const consistent = !body.some(neg) || body.every((r) => out(r) === neg(r)) || body.every((r) => out(r) === !neg(r));
    if (t !== -1 && body.length && consistent && body.every((r) => DRCR.test(String(r[t] ?? "").trim()))) drcrCol = t;
  }
  // Wise writes DD-MM-YYYY. Revolut lists pending, declined and reverted rows
  // beside completed ones and keeps the fee in its own column.
  if (bank === "lloyds" || bank === "barclays" || bank === "wise" || bank === "monzo" || bank === "starling" || bank === "westpac" || bank === "nab") dayFirst = true;
  const hdr = headerAt === -1 ? [] : rows[headerAt].map(norm);
  if (bank === "nab") columns.desc = hdr.indexOf("transaction details");
  const rbc2 = bank === "rbc" ? hdr.indexOf("description 2") : -1;
  // RBC puts a US-dollar movement in its own USD$ column and leaves CAD$ blank.
  const rbcUsd = bank === "rbc" ? hdr.indexOf("usd$") : -1;
  if (bank === "monzo") columns.desc = hdr.indexOf("name");
  // Cash App: the fee sits in its own column, so the net amount is what moved.
  // The payee column beats the free-text note.
  // PayPal activity: the Net column is what moved the balance (Gross less Fee); only Completed rows count.
  if (bank === "paypal") {
    const net = hdr.indexOf("net");
    if (net !== -1) columns.amount = net;
    else if (hdr.indexOf("gross") !== -1) columns.amount = hdr.indexOf("gross");
    if (hdr.indexOf("balance") !== -1) columns.balance = hdr.indexOf("balance");
  }
  // Coinbase: the amount is the Total (spot price would be picked otherwise) and is unsigned; the type says which way it went.
  if (bank === "coinbase") {
    const tot = hdr.findIndex((x) => x.startsWith("total (inclusive"));
    const sub = hdr.indexOf("subtotal");
    if (tot !== -1 || sub !== -1) columns.amount = tot !== -1 ? tot : sub;
    columns.desc = hdr.indexOf("notes");
  }
  if (bank === "cash-app") { columns.amount = hdr.indexOf("net amount"); columns.desc = hdr.indexOf("notes"); }
  // Mercury lists Pending, Failed and Cancelled rows beside Sent ones.
  // Venmo lists Pending and Cancelled payments, and its balance rows have no date.
  const stateCol = bank === "revolut" ? hdr.indexOf("state") : bank === "mercury" || bank === "paypal" || bank === "venmo" || bank === "cash-app" || bank === "sofi" || bank === "usaa" ? hdr.indexOf("status") : -1;
  const okState = bank === "mercury" ? /^(sent|completed)$/i : bank === "cash-app" ? /^complete$/i : bank === "sofi" || bank === "usaa" ? /^posted$/i : bank === "venmo" ? /^(complete|issued)$/i : bank === "paypal" ? /^completed$/i : /^completed$/i;
  // Any other export with a Status or State column (Chime, Brex, Bluevine and the like): skip
  // rows whose status is plainly not a booked transaction. Only that vocabulary is skipped, so
  // an unknown label such as "Settled" or "Cleared" keeps the row.
  const anyState = stateCol === -1 && columns.amount !== -1 ? hdr.findIndex((x) => x === "status" || x === "state" || x === "transaction status") : -1;
  const NOT_BOOKED = /^(pending|declined|failed|cancell?ed|reversed|reverted|voided|rejected|authori[sz]ed|authori[sz]ation|processing|in progress|on hold|returned|vorgemerkt)$/i;
  const feeCol = bank === "revolut" ? hdr.indexOf("fee") : -1;
  // Any file with a currency column (Revolut, Swedbank's Valiuta, Wise and the like) is checked for a mix.
  const curRe = /^(currency|valiuta|valuta|waluta|währung|wahrung|waehrung|devise|moneda|divisa|moeda|pénznem|měna|mena)( code)?$/;
  // "Valuta" can be the value date, so any other currency header wins over it.
  const curCol = hdr.findIndex((x) => curRe.test(x) && x !== "valuta") !== -1 ? hdr.findIndex((x) => curRe.test(x) && x !== "valuta") : hdr.findIndex((x) => x === "valuta");
  const currencies = new Set();
  // Belgian and Dutch exports keep the free-text message apart from the counterparty's name; Intesa Sanpaolo's Descrizione estesa and Operazione sit beside Descrizione and Dettagli.
  const msgCol = hdr.findIndex((x) => /^((vrije )?mededeling(en)?|descrizione estesa|operazione|narration|umsatztext|riferimento di pagamento|r[eé]f[eé]rence de paiement|referencia de pago)$/.test(x));
  // Rabobank splits its description over Omschrijving-1..3.
  const omsCols = hdr.map((x, ix) => (/^omschrijving-[123]$/.test(x) ? ix : -1)).filter((ix) => ix !== -1);
  // UBS and others number their description columns (Description 1..3); join them in header order, not just the last.
  const numDescCols = bank === "rbc" || omsCols.length ? [] : hdr.map((x, ix) => (/^(description|beschreibung|libell[eé]|descrizione|descripci[oó]n|omschrijving)[ _-]?[1-4]$/.test(x) ? ix : -1)).filter((ix) => ix !== -1);
  // German exports keep the other party in its own column, apart from the purpose text.
  const payeeCol = columns.desc === -1 ? -1 : hdr.findIndex((x, ix) => ix !== columns.desc && /^(beguenstigter\/zahlungspflichtiger|begünstigter\/zahlungspflichtiger|auftraggeber ?\/ ?begünstigter|auftraggeber ?\/ ?beguenstigter|auftraggeber ?\/ ?empf(ä|ae)nger|name zahlungsbeteiligter|zahlungsempfänger|zahlungsempfaenger|empfänger|empfaenger)$/.test(x));
  // Deutsche Bank style: one column for each side; the other party is the payee on money out, the payer on money in.
  const payeeOut = hdr.findIndex((x) => /^(beg(ue|ü)nstigter|zahlungsempf(ä|ae)nger\*in)$/.test(x)), payerIn = hdr.findIndex((x) => /^zahlungspflichtige(r|\*r)$/.test(x));
  // Mint, Monarch, Tiller and YNAB write every account into one file and name the account on each row.
  const acctCol = hdr.findIndex((x) => /^(account name|account|account nickname)$/.test(x));
  const accountNames = new Set();
  const memoCols = hdr.map((x, ix) => (/^(memo|notes?|comments?|remarks)$/.test(x) && ix !== columns.desc ? ix : -1)).filter((ix) => ix !== -1);
  const labelCols = ["reporting category", "category", "category name", "transaction type", "type"].map((n) => hdr.indexOf(n)).filter((ix) => ix !== -1 && ix !== columns.desc);
  const catCol = hdr.indexOf("category") !== -1 && hdr.indexOf("category") !== columns.desc ? hdr.indexOf("category") : -1;
  const idCol = hdr.findIndex((x) => /^(balance transaction id|transaction id|txn id|reference id)$/.test(x));
  const dirCol = columns.amount !== -1 && drcrCol === -1 ? hdr.indexOf("to/from") : -1;
  // ICICI credit-card CSV: every amount is unsigned and BillingAmountSign says "CR" on a credit; blank is a charge.
  const billSignCol = columns.amount !== -1 && drcrCol === -1 ? hdr.indexOf("billingamountsign") : -1;
  const actionCol = bank === "schwab-brokerage" || bank === "fidelity" ? hdr.indexOf("action") : -1;
  let tradesSkipped = 0;
  for (let i = first; i < rows.length; i++) {
    const r = rows[i];
    const acctName = acctCol === -1 ? "" : String(r[acctCol] ?? "").trim();
    if (acctName && String(r[columns.date] ?? "").trim()) accountNames.add(acctName);
    if (onlyAccount !== undefined && acctName !== onlyAccount) continue;
    if (bank === "venmo" && !String(r[columns.date] ?? "").trim()) continue;
    if (bank === "schwab-brokerage") {
      if (/^transactions total$/i.test(String(r[columns.date] ?? "").trim())) continue;
      // Buys and sells move value between cash and securities, as in the OFX reader: not spending or income.
      if (/^(buy|sell|reinvest shares|cash in lieu|exchange or exercise)/i.test(String(r[actionCol] ?? "").trim())) { tradesSkipped++; continue; }
    }
    if (bank === "fidelity" && actionCol !== -1) {
      // As for Schwab: a buy, sell or dividend reinvestment moves value between cash and securities.
      if (/^(you (bought|sold)|reinvestment)\b/i.test(String(r[actionCol] ?? "").trim())) { tradesSkipped++; continue; }
    }
    if (stateCol !== -1 && !okState.test(String(r[stateCol] ?? "").trim())) { problems.push(`Line ${i + 1}: state ${String(r[stateCol] ?? "").trim() || "blank"}, not a completed transaction, skipped.`); continue; }
    if (anyState !== -1 && NOT_BOOKED.test(String(r[anyState] ?? "").trim())) { problems.push(`Line ${i + 1}: status ${String(r[anyState]).trim()}, not a booked transaction, skipped.`); continue; }
    // German and Italian "Valuta" is often the value date; only a three-letter code counts as a currency.
    if (curCol !== -1 && /^[a-z]{3}$/i.test(String(r[curCol] ?? "").trim())) currencies.add(r[curCol].trim().toUpperCase());
    if (/^(likutis (pradžiai|pabaigai)|apyvarta|opening balance|closing balance)$/i.test(String(r[columns.desc] ?? "").trim())) { problems.push(`Line ${i + 1}: a balance row, not a transaction, skipped.`); continue; }
    // A one-cell line under the header that is not a date is a note ("Posted Transactions"), not a short row.
    if (headerAt !== -1 && r.length === 1 && !parseDate(r[columns.date], dayFirst)) continue;
    if (headerAt !== -1 && r.length <= Math.max(columns.amount, columns.debit, columns.credit) && String(r[columns.date] ?? "").trim()) { problems.push(`Line ${i + 1}: the row has ${r.length} columns, fewer than the header, so the amount column is missing; skipped. Check the quoting in the file.`); continue; }
    const date = parseDate(r[columns.date], dayFirst);
    // A row with no date and no amount is the second line of the row above (OCBC's
    // transaction history puts the card number and merchant on one): add it to that description.
    if (!date && out.length && !String(r[columns.date] ?? "").trim() && [columns.amount, columns.debit, columns.credit].filter((k) => k !== -1).every((k) => String(r[k] ?? "").trim() === "")) {
      const more = r.map((c) => String(c ?? "").trim()).filter(Boolean).join(" ").replace(/\s+/g, " ");
      // A footer ("Total transactions,,", "Page 1 of 2", "Generated by ...") is not a wrapped description.
      if (more && !FOOTER.test(more)) { out[out.length - 1].desc = `${out[out.length - 1].desc} ${more}`.trim(); continue; }
    }
    if (!date && /^pending$/i.test(String(r[columns.date] ?? "").trim())) { problems.push(`Line ${i + 1}: pending, not a booked transaction, skipped.`); continue; }
    if (!date) { problems.push(`Line ${i + 1}: unreadable date "${r[columns.date] ?? ""}", skipped.`); continue; }
    let cents;
    if (columns.amount !== -1 && String(r[columns.amount] ?? "").trim() !== "") { cents = parseCents(r[columns.amount], decimalComma); if (rbcUsd !== -1) currencies.add("CAD"); }
    else if (rbcUsd !== -1 && String(r[rbcUsd] ?? "").trim() !== "") { cents = parseCents(r[rbcUsd], decimalComma); currencies.add("USD"); }
    else {
      // A blank or placeholder cell is 0, but NaN (an exponent, or too large for exact cents) stays unreadable.
      const side = (k) => { if (k === -1) return 0; const c = parseCents(r[k], decimalComma); return Number.isNaN(c) ? NaN : Math.abs(c || 0); };
      cents = side(columns.credit) - side(columns.debit);
    }
    if (!Number.isFinite(cents)) { problems.push(`Line ${i + 1}: unreadable amount, skipped.`); continue; }
    if (drcrCol !== -1) {
      const m = String(r[drcrCol] ?? "").trim().toLowerCase();
      if (/^(dr|d|debit|debet|af|soll|s|withdrawal|expense(-recurring)?)$/.test(m)) cents = -Math.abs(cents);
      else if (/^(cr|c|k|credit|bij|haben|h|deposit|income(-recurring)?)$/.test(m)) cents = Math.abs(cents);
    }
    if (billSignCol !== -1) cents = /^cr$/i.test(String(r[billSignCol] ?? "").trim()) ? Math.abs(cents) : -Math.abs(cents);
    if (bank === "coinbase") {
      const ty = String(r[hdr.indexOf("transaction type")] ?? "").trim().toLowerCase();
      if (/\b(buy|send|withdrawal|pro withdrawal|payment)\b/.test(ty) && !/sell/.test(ty)) cents = -Math.abs(cents);
      else if (/\b(sell|receive|deposit|reward|earn|income|staking|interest|airdrop)\b/.test(ty)) cents = Math.abs(cents);
      else if (/convert/.test(ty)) { problems.push(`Line ${i + 1}: a Convert between two assets moves no cash, skipped.`); continue; }
      else { problems.push(`Line ${i + 1}: unknown Coinbase transaction type "${ty}", skipped.`); continue; }
    }
    if (feeCol !== -1) { const fee = parseCents(r[feeCol], decimalComma); if (Number.isFinite(fee)) cents -= Math.abs(fee); }
    if (cents === 0) {
      // A zero is harmless, but a row with a description and every amount cell blank may be a lost transaction.
      const blank = [columns.amount, columns.debit, columns.credit, rbcUsd].filter((k) => k !== -1).every((k) => String(r[k] ?? "").trim() === "");
      if (blank && String(r[columns.desc] ?? "").trim() && !/balance|saldo/i.test(String(r[columns.desc])) && !(columns.balance !== -1 && String(r[columns.balance] ?? "").trim())) problems.push(`Line ${i + 1}: no amount, skipped.`);
      continue;
    }
    const balance = columns.balance !== -1 && String(r[columns.balance] ?? "").trim() !== "" ? parseCents(r[columns.balance], decimalComma) : null;
    let desc = String(r[columns.desc] ?? "").trim().replace(/\s+/g, " ");
    if (hdr.includes("wallet txn id") && columns.desc === hdr.indexOf("activity")) desc = [desc, String(r[hdr.indexOf("comment")] ?? "").trim()].filter(Boolean).join(" ").replace(/\s+/g, " ");
    if (bank === "cash-app") {
      const who = String(r[hdr.indexOf("name of sender/receiver")] ?? "").trim();
      desc = [who, desc || String(r[hdr.indexOf("transaction type")] ?? "").trim()].filter(Boolean).join(" - ");
    }
    if (numDescCols.length > 1) desc = numDescCols.map((ix) => String(r[ix] ?? "").trim()).filter((x, j, a) => x && a.indexOf(x) === j).join(" ").replace(/\s+/g, " ");
    if (omsCols.length) desc = [desc, ...omsCols.map((ix) => String(r[ix] ?? "").trim())].filter((x, j, a) => x && a.indexOf(x) === j).join(" ").replace(/\s+/g, " ");
    if (msgCol !== -1 && msgCol !== columns.desc) desc = [desc, String(r[msgCol] ?? "").trim()].filter((x, j, a) => x && a.indexOf(x) === j).join(" ").replace(/\s+/g, " ");
    const sideCol = payeeCol !== -1 ? payeeCol : payeeOut !== -1 && payerIn !== -1 ? (cents < 0 ? payeeOut : payerIn) : -1;
    if (sideCol !== -1) {
      const who = String(r[sideCol] ?? "").trim().replace(/\s+/g, " ");
      if (who && !desc.toLowerCase().includes(who.toLowerCase())) desc = [who, desc].filter(Boolean).join(" - ");
    }
    if (rbc2 !== -1) desc = [desc, String(r[rbc2] ?? "").trim()].filter(Boolean).join(" ").replace(/\s+/g, " ");
    if (bank === "paypal") {
      const nameI = hdr.indexOf("name");
      desc = [nameI !== -1 ? String(r[nameI] ?? "").trim() : "", String(r[hdr.indexOf("type")] ?? "").trim() || desc].filter(Boolean).join(" - ").replace(/\s+/g, " ");
    }
    if (bank === "coinbase") desc = [String(r[hdr.indexOf("transaction type")] ?? "").trim(), String(r[hdr.indexOf("asset")] ?? "").trim(), desc].filter(Boolean).join(" ").replace(/\s+/g, " ");
    if (bank === "fidelity" && actionCol !== -1) {
      // The Action text names what happened and to whom ("DIRECT DEBIT CHASE CREDIT CAUTOPAY (Cash)"); the
      // security description is "No Description" on cash rows and repeats the action on dividends.
      const act = String(r[actionCol] ?? "").replace(/\s*\((cash|margin|shares|core)\)\s*$/i, "").replace(/\s+/g, " ").trim();
      desc = desc.toLowerCase() === "no description" || act.toLowerCase().includes(desc.toLowerCase()) ? act : [act, desc].filter(Boolean).join(" ");
    }
    if (bank === "venmo") {
      // The note is free text; name the other party, and fall back to the type for transfers.
      const who = String(r[hdr.indexOf(cents < 0 ? "to" : "from")] ?? "").trim();
      desc = [who, desc || String(r[hdr.indexOf("type")] ?? "").trim()].filter(Boolean).join(" - ");
    }
    // No description at all (Stripe balance rows, Monefy without a note): say what the
    // row is from its category or type column, else its transaction id, so the payee
    // memory and the categorizer have something to learn from.
    // A blank payee with a memo (YNAB's "Reconciliation balance adjustment" rows): the memo says what it is.
    if (!desc && memoCols.length) desc = memoCols.map((ix) => String(r[ix] ?? "").trim().replace(/\s+/g, " ")).find(Boolean) ?? "";
    if (!desc && labelCols.length) desc = labelCols.map((ix) => String(r[ix] ?? "").trim()).find(Boolean) ?? "";
    if (!desc && idCol !== -1) desc = String(r[idCol] ?? "").trim();
    // "To/From" beside an unsigned amount (Amazon Payments): To is money out.
    if (dirCol !== -1) {
      const m = String(r[dirCol] ?? "").trim().toLowerCase();
      if (m === "to") cents = -Math.abs(cents);
      else if (m === "from") cents = Math.abs(cents);
    }
    // The bank's or app's own category label (Chase, Capital One, Mint, Maybe): kept as a weak hint for the categorizer.
    const bankCat = catCol === -1 ? "" : String(r[catCol] ?? "").trim().slice(0, 60);
    out.push({ line: i + 1, date, desc, cents, balance: Number.isFinite(balance) ? balance : null, ...(bankCat ? { bankCat } : {}) });
  }
  if (tradesSkipped) problems.push(`${tradesSkipped} brokerage buy/sell line${tradesSkipped === 1 ? " was" : "s were"} not booked: they move value between cash and securities. Dividends, interest, fees and transfers in the file are booked.`);
  else if (bank === "schwab-brokerage" && !out.length) problems.push("The file has the Schwab transactions header but no transaction rows (an empty period).");
  if (currencies.size > 1) problems.push(`The file mixes currencies (${[...currencies].join(", ")}). Amounts are booked as written, with no conversion: import each currency on its own account.`);
  // A processor's own export (PayPal activity, Stripe balance, Square): the amount column read is Net, so sales are
  // understated and fees never booked. `payouts` splits them; say so rather than leave a clean-looking import.
  if (out.length && ["gross", "fee", "net"].every((k) => hdr.includes(k)) && ["transaction id", "balance_transaction_id", "id"].some((k) => hdr.includes(k)))
    problems.push("This looks like a payment processor's export (Gross, Fee and Net columns). Imported as a bank statement it books the Net only, so sales are understated and fees are missing. Use `payouts FILE` (the page's payout box) to book sales and fees separately.");
  let inferred = null;
  let flip = !!invert;
  if (invert === undefined && out.every((r) => r.balance === null) && columns.amount !== -1) {
    // Discover's header is distinctive and its export always lists charges as positive, so a
    // file with no recognisable payment row (a month of purchases only) still flips.
    const pos = chargesArePositive(out) ?? (bank === "discover" || bank === "apple-card" || bank === "swisscard" ? true : null);
    if (pos) { flip = true; inferred = "Charges were positive (the payment rows are negative), so signs were flipped."; }
  }
  // A trade list (ticker, qty, price, amount; Maybe's import shape) states the value bought as
  // positive and sold as negative: the cash moved the other way.
  if (invert === undefined && !flip && columns.amount !== -1 && columns.debit === -1 && columns.credit === -1 && ["ticker", "symbol"].some((k) => hdr.includes(k)) && ["qty", "quantity", "shares"].some((k) => hdr.includes(k)) && hdr.includes("price") && tradeSignsAgree(out, rows, hdr)) {
    flip = true;
    inferred = "A trade list states the value bought as positive, so signs were flipped (a buy is cash out).";
  }
  if (flip) for (const r of out) r.cents = -r.cents;
  // One unsigned-looking amount column, nothing says which way: a card export that lists only purchases (PC Financial's) reads as income.
  else if (invert === undefined && bank !== "schwab-brokerage" && columns.amount !== -1 && columns.debit === -1 && columns.credit === -1 && dirCol === -1 && out.length >= 2 && out.every((r) => r.cents > 0))
    problems.push(`Every amount is positive, so all ${out.length} lines were booked as money in. If this is a card or spending export, they are charges: import with the signs flipped (invert).`);
  if (ambiguousNote) inferred = [inferred, ambiguousNote + "."].filter(Boolean).join(" ");
  if (localeNote) inferred = [inferred, localeNote + " (inferred from the file; pass dayFirst / decimalComma to override)."].filter(Boolean).join(" ");
  return { rows: out, problems, columns, bank, inferred, ...(accountNames.size > 1 ? { accountNames: [...accountNames] } : {}) };
}

// Guess day-first dates and decimal commas from the data rows. Day first when a
// date has a first number over 12 (and none a second), or the separator is a dot
// (dd.mm.yyyy); decimal comma when amounts end ",dd" and none ends ".dd".
function inferLocale(dataRows, columns) {
  let dayHi = 0, monHi = 0, dots = 0, comma = 0, point = 0;
  const asDay = [], asMon = [];
  for (const r of dataRows) {
    const d = columns.date === -1 ? null : String(r[columns.date] ?? "").trim().match(/^(\d{1,2})([-/.])(\d{1,2})\2\d{2,4}/);
    if (d) { if (+d[1] > 12) dayHi++; if (+d[3] > 12) monHi++; if (d[2] === ".") dots++;
      if (+d[1] <= 12 && +d[3] <= 12) { const y = d[0].match(/(\d{2,4})$/)[1]; const yy = fullYear(+y); asDay.push(Date.UTC(yy, +d[3] - 1, +d[1]) / 864e5); asMon.push(Date.UTC(yy, +d[1] - 1, +d[3]) / 864e5); } }
    for (const k of ["amount", "debit", "credit", "balance"]) {
      if (columns[k] === -1) continue;
      const a = String(r[columns[k]] ?? "").trim().replace(/[^0-9.,]/g, "");
      if (/\d,\d{1,2}$/.test(a)) comma++;
      else if (/\d\.\d{1,2}$/.test(a)) point++;
    }
  }
  // Every date ambiguous: a statement covers weeks, not months, so the reading
  // that packs the dates into a short span is the likely one (05/03..08/03 is
  // 5-8 March day first, not May to August month first).
  const span = (a) => (a.length > 1 ? Math.max(...a) - Math.min(...a) : 0);
  const decided = dayHi > 0 || monHi > 0;
  const compactDayFirst = !decided && asDay.length >= 4 && span(asDay) <= 45 && span(asMon) >= 90;
  const allAmbiguous = !decided && dots === 0 && asDay.length >= 3 && new Set(asDay).size >= 2 && asDay.some((v, i) => v !== asMon[i]);
  return { dayFirst: (dayHi > 0 && monHi === 0) || (dayHi === 0 && monHi === 0 && dots > 0), compactDayFirst, allAmbiguous, decimalComma: comma > 0 && point === 0 };
}

// A stable id per row so importing the same statement twice adds nothing: the
// account, date, amount and description, plus how many identical rows came
// before it in this file (two real $4.50 coffees on one day stay two rows).
// `loose` folds runs of spaces, case and punctuation in the description, so the
// same line read from a CSV and from an OFX or PDF of the same period (which
// spell it with different spacing) gets one id. Without it, the exact text.
export function rowIds(rows, account, { loose = false } = {}) {
  const seen = new Map();
  return rows.map((r) => {
    const d = loose ? r.desc.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim() : r.desc.toLowerCase();
    const base = `${account}|${r.date}|${r.cents}|${d}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return `${hash(base)}-${n}`;
  });
}

function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

// When the file has a running balance, check each row against the one before:
// a mismatch means a missing, duplicated or mis-signed row. Banks print rows
// newest-first or oldest-first, so both orders are tried.
export function checkRunningBalance(rows) {
  const withBal = rows.filter((r) => r.balance !== null);
  if (withBal.length < 2 || withBal.length !== rows.length) return { checked: false, breaks: [] };
  const tryOrder = (list) => {
    const breaks = [];
    for (let i = 1; i < list.length; i++) if (list[i - 1].balance + list[i].cents !== list[i].balance) breaks.push({ line: list[i].line, expected: list[i - 1].balance + list[i].cents, printed: list[i].balance });
    return breaks;
  };
  const fwd = tryOrder(rows), back = tryOrder([...rows].reverse());
  let breaks = fwd.length <= back.length ? fwd : back;
  let ordered = fwd.length <= back.length ? rows : [...rows].reverse();
  let reordered = false;
  if (breaks.length) {
    const chain = chainByBalance(rows);
    if (chain) { ordered = chain; breaks = []; reordered = true; }
  }
  return { checked: true, breaks, ...(reordered ? { reordered } : {}), opening: ordered[0].balance - ordered[0].cents, closing: ordered[ordered.length - 1].balance, closingDate: ordered[ordered.length - 1].date };
}

// Some exports list the rows in neither order (a date-sorted file whose rows
// within one day run the other way). Each row's opening balance (balance minus
// amount) must be the balance of the row before it, so look for one order that
// uses every row once and chains end to end. Bounded: a file where many rows
// share a balance can chain several ways, and the search gives up rather than
// guess. Returns the rows in chain order, or null.
function chainByBalance(rows) {
  const n = rows.length;
  if (n > 2000) return null;
  const byOpen = new Map();
  rows.forEach((r, i) => { const k = r.balance - r.cents; if (!byOpen.has(k)) byOpen.set(k, []); byOpen.get(k).push(i); });
  const closes = new Set(rows.map((r) => r.balance));
  const used = new Array(n).fill(false), path = [];
  let steps = 0;
  const walk = () => {
    if (path.length === n) return true;
    if (++steps > 50000) return false;
    const last = path.length ? rows[path[path.length - 1]].balance : null;
    const all = rows.map((r, i) => i), starts = all.filter((i) => !closes.has(rows[i].balance - rows[i].cents));
    const next = last === null ? (starts.length ? starts : all) : (byOpen.get(last) || []);
    for (const i of next) {
      if (used[i]) continue;
      used[i] = true; path.push(i);
      if (walk()) return true;
      used[i] = false; path.pop();
    }
    return false;
  };
  if (!walk()) return null;
  return path.map((i) => rows[i]);
}
