// EU VAT One-Stop-Shop (OSS) calculator. Pure functions, no DOM, no network, no imports.
//
// All money is exact: amounts are read into BigInt "micro-units" (1e-6), converted to EUR
// with a BigInt division, and rounded to cents only once per country per VAT rate, never per
// line. Nothing here uses floating point for money.
//
// Reference data (rates, thresholds, territories) is from memory of public sources, with no
// network available when it was written. RATES carries an `asOf` date and a `check` list per
// country naming the figures the author is least sure of. Rates change: verify against the
// European Commission's VAT rates page and the tax authority before filing.

export const RATES_AS_OF = "2025-10-01";
export const THRESHOLD_CENTS = 1000000n; // EUR 10,000.00, net of VAT, EU-wide, per calendar year
export const THRESHOLD_EUR = 10000;

// code, name, standard %, reduced % (highest first), e-book / digital publication % (null = not
// known to the author, falls back to standard with a warning), and `check`: the fields the author
// is not certain of. Every `reduced` list and every `ebook` figure is from memory; `std` is listed
// in `check` only where the rate changed recently enough to be at risk.
export const RATES = [
  { code: "AT", name: "Austria", std: 20, reduced: [13, 10], ebook: 10, check: ["reduced", "ebook"] },
  { code: "BE", name: "Belgium", std: 21, reduced: [12, 6], ebook: 6, check: ["reduced", "ebook"] },
  { code: "BG", name: "Bulgaria", std: 20, reduced: [9], ebook: null, check: ["reduced", "ebook"] },
  { code: "HR", name: "Croatia", std: 25, reduced: [13, 5], ebook: null, check: ["reduced", "ebook"] },
  { code: "CY", name: "Cyprus", std: 19, reduced: [9, 5, 3], ebook: 3, check: ["reduced", "ebook"] },
  { code: "CZ", name: "Czechia", std: 21, reduced: [12], ebook: 12, check: ["reduced", "ebook"] },
  { code: "DK", name: "Denmark", std: 25, reduced: [], ebook: 25, check: ["ebook"] },
  { code: "EE", name: "Estonia", std: 24, reduced: [13, 9], ebook: 9, check: ["std", "reduced", "ebook"] },
  { code: "FI", name: "Finland", std: 25.5, reduced: [14, 10], ebook: 10, check: ["std", "reduced", "ebook"] },
  { code: "FR", name: "France", std: 20, reduced: [10, 5.5, 2.1], ebook: 5.5, check: ["reduced", "ebook"] },
  { code: "DE", name: "Germany", std: 19, reduced: [7], ebook: 7, check: ["reduced", "ebook"] },
  { code: "EL", name: "Greece", std: 24, reduced: [13, 6], ebook: 6, check: ["reduced", "ebook"] },
  { code: "HU", name: "Hungary", std: 27, reduced: [18, 5], ebook: 5, check: ["reduced", "ebook"] },
  { code: "IE", name: "Ireland", std: 23, reduced: [13.5, 9], ebook: 9, check: ["reduced", "ebook"] },
  { code: "IT", name: "Italy", std: 22, reduced: [10, 5, 4], ebook: 4, check: ["reduced", "ebook"] },
  { code: "LV", name: "Latvia", std: 21, reduced: [12, 5], ebook: 12, check: ["reduced", "ebook"] },
  { code: "LT", name: "Lithuania", std: 21, reduced: [9, 5], ebook: 9, check: ["reduced", "ebook"] },
  { code: "LU", name: "Luxembourg", std: 17, reduced: [14, 8, 3], ebook: 3, check: ["reduced", "ebook"] },
  { code: "MT", name: "Malta", std: 18, reduced: [7, 5], ebook: 5, check: ["reduced", "ebook"] },
  { code: "NL", name: "Netherlands", std: 21, reduced: [9], ebook: 9, check: ["reduced", "ebook"] },
  { code: "PL", name: "Poland", std: 23, reduced: [8, 5], ebook: 5, check: ["reduced", "ebook"] },
  { code: "PT", name: "Portugal", std: 23, reduced: [13, 6], ebook: 6, check: ["reduced", "ebook"] },
  { code: "RO", name: "Romania", std: 21, reduced: [11], ebook: 11, check: ["std", "reduced", "ebook"] },
  { code: "SK", name: "Slovakia", std: 23, reduced: [19, 5], ebook: null, check: ["std", "reduced", "ebook"] },
  { code: "SI", name: "Slovenia", std: 22, reduced: [9.5, 5], ebook: 5, check: ["reduced", "ebook"] },
  { code: "ES", name: "Spain", std: 21, reduced: [10, 4], ebook: 4, check: ["reduced", "ebook"] },
  { code: "SE", name: "Sweden", std: 25, reduced: [12, 6], ebook: 6, check: ["reduced", "ebook"] },
];

export const EU_CODES = RATES.map((r) => r.code);
const BY_CODE = new Map(RATES.map((r) => [r.code, r]));

// Not in the EU VAT area or not usable as an OSS destination here. Each gets its own note
// because a plain "non-EU country" warning would hide the cases people actually ask about.
const SPECIAL = {
  GB: "Great Britain is outside the EU VAT area; UK sales are not on an EU OSS return.",
  XI: "Northern Ireland (XI) follows EU VAT rules for goods only; it is not treated as an OSS destination here. Check HMRC and your authority.",
  MC: "Monaco is treated as France for VAT by the EU; this tool does not map it. Re-enter as FR if your authority confirms that.",
  IM: "The Isle of Man is treated as the UK for VAT; not an EU OSS destination.",
  AX: "Aland is outside the EU VAT area; not an OSS destination.",
  IC: "The Canary Islands are outside the EU VAT area; not an OSS destination.",
  GP: "Guadeloupe is outside the EU VAT area; not an OSS destination.",
  MQ: "Martinique is outside the EU VAT area; not an OSS destination.",
  RE: "Reunion is outside the EU VAT area; not an OSS destination.",
  GF: "French Guiana is outside the EU VAT area; not an OSS destination.",
  YT: "Mayotte is outside the EU VAT area; not an OSS destination.",
};

const NAME_ALIASES = {
  gr: "EL", greece: "EL", hellas: "EL", uk: "GB", "united kingdom": "GB", "great britain": "GB", england: "GB",
  scotland: "GB", wales: "GB", "northern ireland": "XI", "czech republic": "CZ", "the netherlands": "NL",
  holland: "NL", deutschland: "DE", espana: "ES", france: "FR", osterreich: "AT",
};
const NAME_TO_CODE = new Map(RATES.map((r) => [r.name.toLowerCase(), r.code]));

export function rateOf(code) {
  return BY_CODE.get(code) || null;
}

export const RECORDS_NOTE = [
  "Keep OSS records for 10 years from the end of the year of the transaction, and be able to give them to the tax authority on request.",
  "Records normally cover: the member state of consumption, the type, quantity and value of what was supplied, the date, the taxable amount and any later increase or decrease, the VAT rate applied and the VAT due, the date and amount of payments received, any advance payments, the invoice if one was issued, and the customer's location with the information used to determine it.",
  "Keep two pieces of non-conflicting evidence of the customer's location, for example the billing address, the IP address, the bank or card country, the SIM or mobile country code, or the delivery address. The rules are simplified for sellers of small amounts, but check the current wording of the rules with your authority.",
  "Keep the exchange rate you used (the ECB reference rate for the last day of the return period is the normal source), the date of that rate, and a copy of the file you ran through this page.",
  "This note is general information, not advice. Your authority's guidance decides what you must keep.",
];

export const LIMITS = [
  "The EUR 10,000 threshold covers B2C distance sales of goods and B2C telecom, broadcasting and electronic services from one member state to others, net of VAT, per calendar year. It does not apply to sellers established outside the EU.",
  "Not modelled: IOSS (import OSS for goods up to EUR 150), special schemes, mixed supplies, place-of-supply rules beyond the destination country, penalties and interest, correction returns for earlier periods, and national rules on invoice rounding.",
  "Refunds are placed in the quarter of the refund row. A refund of a sale from an earlier quarter may have to be reported as a correction to that earlier return; check your authority's guidance.",
  "Rates are from memory of public sources and shown with an as-of date. Verify every rate before you file.",
];

// ---------------------------------------------------------------------------------------------
// Exact decimal helpers

const MICRO = 1000000n;

function divRound(a, b) {
  // Integer division rounding half away from zero.
  if (b === 0n) throw new RangeError("division by zero");
  const neg = (a < 0n) !== (b < 0n);
  const aa = a < 0n ? -a : a;
  const bb = b < 0n ? -b : b;
  const q = (aa * 2n + bb) / (bb * 2n);
  return neg ? -q : q;
}

export function formatCents(cents, { group = false } = {}) {
  const neg = cents < 0n;
  const abs = neg ? -cents : cents;
  let whole = (abs / 100n).toString();
  if (group) whole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${neg ? "-" : ""}${whole}.${(abs % 100n).toString().padStart(2, "0")}`;
}

export function microToCents(micro) {
  return divRound(micro, 10000n);
}

/** Parse a plain decimal string ("12.5", "-3") into BigInt micro-units. Returns null if not a plain decimal. */
export function parsePlainDecimal(s) {
  const m = /^([+-])?(\d*)(?:\.(\d*))?$/.exec(String(s).trim());
  if (!m || (!m[2] && !m[3])) return null;
  const frac = (m[3] || "").padEnd(7, "0");
  let v = BigInt(m[2] || "0") * MICRO + BigInt(frac.slice(0, 6));
  if (frac[6] >= "5") v += 1n;
  return m[1] === "-" ? -v : v;
}

/**
 * Parse a money cell. Handles currency symbols and codes, thousands separators in either
 * convention, a trailing minus and (12.50) accounting negatives. `decimal` is "auto", "dot" or
 * "comma". Returns { micro, ambiguous } or null.
 */
export function parseAmount(raw, decimal = "auto") {
  let s = String(raw ?? "").trim();
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  s = s.replace(/[\s  ']/g, "").replace(/[A-Za-z€$£¥]/g, "");
  if (s.endsWith("-")) { neg = !neg; s = s.slice(0, -1); }
  if (s.startsWith("-")) { neg = !neg; s = s.slice(1); }
  else if (s.startsWith("+")) s = s.slice(1);
  if (!s || /[^0-9.,]/.test(s)) return null;
  let ambiguous = false;
  const lastDot = s.lastIndexOf("."), lastComma = s.lastIndexOf(",");
  let dec = null;
  if (decimal === "dot") dec = ".";
  else if (decimal === "comma") dec = ",";
  else if (lastDot >= 0 && lastComma >= 0) dec = lastDot > lastComma ? "." : ",";
  else if (lastComma >= 0 || lastDot >= 0) {
    const sep = lastComma >= 0 ? "," : ".";
    const count = s.split(sep).length - 1;
    const tail = s.length - s.lastIndexOf(sep) - 1;
    if (count > 1) dec = null; // 1,234,567 : all thousands separators
    else if (tail === 3) { dec = null; ambiguous = true; } // 1,234 or 1.234: read as thousands
    else dec = sep;
  }
  let intPart = s, fracPart = "";
  if (dec) {
    const i = s.lastIndexOf(dec);
    intPart = s.slice(0, i);
    fracPart = s.slice(i + 1);
    const other = dec === "." ? "," : ".";
    if (fracPart.includes(other)) return null;
    intPart = intPart.split(other).join("");
  } else {
    intPart = s.replace(/[.,]/g, "");
  }
  if (!/^\d*$/.test(intPart) || !/^\d*$/.test(fracPart)) return null;
  if (!intPart && !fracPart) return null;
  const v = parsePlainDecimal(`${intPart || "0"}.${fracPart}`);
  if (v === null) return null;
  return { micro: neg ? -v : v, ambiguous };
}

// ---------------------------------------------------------------------------------------------
// CSV

export function parseCsv(text) {
  let s = String(text ?? "");
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  const firstLine = s.split(/\r?\n/).find((l) => l.trim() !== "") || "";
  let delim = ",";
  let best = -1;
  for (const d of [",", ";", "\t"]) {
    let inQ = false, n = 0;
    for (const ch of firstLine) { if (ch === '"') inQ = !inQ; else if (ch === d && !inQ) n++; }
    if (n > best) { best = n; delim = d; }
  }
  const records = [];
  let row = [], cell = "", inQ = false, line = 1, startLine = 1, any = false;
  const endCell = () => { row.push(cell); cell = ""; };
  const endRow = () => {
    endCell();
    if (any || row.some((c) => c.trim() !== "")) records.push({ line: startLine, cells: row });
    row = []; any = false;
  };
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQ) {
      if (ch === '"') {
        if (s[i + 1] === '"') { cell += '"'; i++; } else inQ = false;
      } else { if (ch === "\n") line++; cell += ch; }
    } else if (ch === '"' && cell === "") { inQ = true; any = true; }
    else if (ch === delim) { endCell(); any = true; }
    else if (ch === "\r") { /* swallowed; \n ends the row */ if (s[i + 1] !== "\n") { endRow(); line++; startLine = line; } }
    else if (ch === "\n") { endRow(); line++; startLine = line; }
    else cell += ch;
  }
  if (cell !== "" || row.length) endRow();
  return { delimiter: delim, records };
}

// ---------------------------------------------------------------------------------------------
// Column detection

const norm = (h) => String(h ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9%]+/g, " ").trim();

const SYNONYMS = {
  date: ["date", "order date", "created at", "created", "sale date", "transaction date", "invoice date", "paid at", "payment date", "date of sale", "datum", "date de commande", "order created", "sale day", "day"],
  country: ["country", "destination country", "destination", "shipping country code", "shipping country", "ship country", "ship to country", "ship country code", "shipping address country", "shipping address country code", "customer country", "billing country code", "billing country", "country code", "buyer country", "country of consumption", "consumption country", "ship to country code", "member state", "land", "lieferland", "pays", "pais"],
  amount: ["net amount", "net", "net sales", "net total", "amount excl vat", "amount ex vat", "net price", "subtotal", "sales net", "amount net", "gross amount", "gross", "gross sales", "amount incl vat", "order total", "total", "amount", "price", "revenue", "sales", "value", "total price", "item total", "order amount", "betrag", "nettobetrag", "bruttobetrag", "montant", "importe"],
  currency: ["currency", "currency code", "presentment currency", "ccy", "order currency", "waehrung", "wahrung", "devise", "moneda"],
  rate: ["rate type", "vat rate type", "vat rate", "tax rate", "tax 1 rate", "rate", "vat percent", "vat %", "tax type", "vat type", "rate category", "tax category", "vat category", "product type"],
  b2b: ["b2b", "vat id", "vat number", "vat no", "vat reg", "customer vat id", "customer vat number", "buyer vat id", "buyer vat number", "tax id", "business customer", "is business", "company vat", "vatin", "vat registration number", "vat id number", "ust idnr", "ustidnr", "ust id", "numero tva"],
  type: ["type", "transaction type", "kind", "document type", "entry type", "doc type", "line type"],
  orderId: ["order id", "order number", "order", "order name", "name", "invoice number", "invoice", "transaction id", "reference", "id"],
};
const CONTAINS = {
  date: ["date"], country: ["country"], currency: ["currency"], b2b: ["vat id", "vat number", "b2b"],
  rate: ["vat rate", "rate type", "tax rate"], amount: ["net amount", "gross amount", "amount"],
};
export const FIELDS = ["date", "country", "amount", "currency", "rate", "b2b", "type", "orderId"];
export const REQUIRED = ["date", "country", "amount"];

/** Map each field to a header index, or -1. Exact synonym matches win, then "contains" matches. */
export function detectColumns(headers) {
  const hs = headers.map(norm);
  const used = new Set();
  const mapping = {};
  for (const f of FIELDS) mapping[f] = -1;
  for (const f of FIELDS) {
    for (const syn of SYNONYMS[f]) {
      const i = hs.findIndex((h, idx) => h === syn && !used.has(idx));
      if (i >= 0) { mapping[f] = i; used.add(i); break; }
    }
  }
  for (const f of FIELDS) {
    if (mapping[f] >= 0 || !CONTAINS[f]) continue;
    for (const part of CONTAINS[f]) {
      const i = hs.findIndex((h, idx) => !used.has(idx) && h.includes(part));
      if (i >= 0) { mapping[f] = i; used.add(i); break; }
    }
  }
  const amountHeader = mapping.amount >= 0 ? hs[mapping.amount] : "";
  let basisHint = null;
  if (/\b(net|excl|ex vat|subtotal)\b/.test(amountHeader)) basisHint = "net";
  else if (/\b(gross|incl)\b/.test(amountHeader)) basisHint = "gross";
  return { mapping, basisHint };
}

// ---------------------------------------------------------------------------------------------
// Cell parsers

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const daysIn = (y, m) => [31, (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
const validYmd = (y, m, d) => y >= 1990 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= daysIn(y, m);

/** Returns { y, m, d } or null. `order` is "dmy" or "mdy" for numeric dates with the year last. */
export function parseDate(raw, order = "dmy") {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/.exec(s);
  if (m) { const r = { y: +m[1], m: +m[2], d: +m[3] }; return validYmd(r.y, r.m, r.d) ? r : null; }
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?:[T\s].*)?$/.exec(s);
  if (m) {
    const a = +m[1], b = +m[2], y = +m[3];
    const [d, mo] = order === "mdy" ? [b, a] : [a, b];
    return validYmd(y, mo, d) ? { y, m: mo, d } : null;
  }
  m = /^(\d{1,2})[\s-]+([A-Za-z]{3,9})\.?,?[\s-]+(\d{4})/.exec(s);
  if (m) { const mo = MONTHS[m[2].slice(0, 4).toLowerCase()] || MONTHS[m[2].slice(0, 3).toLowerCase()]; return mo && validYmd(+m[3], mo, +m[1]) ? { y: +m[3], m: mo, d: +m[1] } : null; }
  m = /^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})/.exec(s);
  if (m) { const mo = MONTHS[m[1].slice(0, 4).toLowerCase()] || MONTHS[m[1].slice(0, 3).toLowerCase()]; return mo && validYmd(+m[3], mo, +m[2]) ? { y: +m[3], m: mo, d: +m[2] } : null; }
  return null;
}

const iso = (d) => `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
const quarterOf = (m) => Math.floor((m - 1) / 3) + 1;
export const periodOf = (d) => `${d.y}-Q${quarterOf(d.m)}`;

/** Filing and payment deadline: end of the month after the quarter ends (usual rule; verify). */
export function periodDueDate(period) {
  const m = /^(\d{4})-Q([1-4])$/.exec(period || "");
  if (!m) return null;
  const y = +m[1], q = +m[2];
  const [yy, mm, dd] = q === 1 ? [y, 4, 30] : q === 2 ? [y, 7, 31] : q === 3 ? [y, 10, 31] : [y + 1, 1, 31];
  return `${yy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

/** Returns { code, kind: "eu"|"other"|"unknown", note }. */
export function parseCountry(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return { code: null, kind: "unknown", note: "empty" };
  const lower = s.toLowerCase().replace(/\./g, "").normalize("NFD").replace(/[̀-ͯ]/g, "");
  let code = null;
  if (/^[a-z]{2}$/.test(lower)) code = lower.toUpperCase();
  else if (NAME_ALIASES[lower]) code = NAME_ALIASES[lower];
  else if (NAME_TO_CODE.has(lower)) code = NAME_TO_CODE.get(lower);
  else if (/^[a-z]{2}\b/.test(lower) && /^[a-z]{2}\s*[-:]/.test(lower)) code = lower.slice(0, 2).toUpperCase();
  if (!code) return { code: null, kind: "unknown", note: `unrecognised country "${s}"` };
  if (code === "GR") return { code: "EL", kind: "eu", note: "GR read as EL (Greece uses EL in VAT)" };
  if (code === "UK") code = "GB";
  if (BY_CODE.has(code)) return { code, kind: "eu", note: code === "EL" && lower === "gr" ? "GR read as EL" : "" };
  return { code, kind: "other", note: SPECIAL[code] || `${code} is not an EU member state` };
}

/** Rate cell. Empty means standard. Returns { kind, bp?, text } or null if unreadable. */
export function parseRateCell(raw) {
  const s = String(raw ?? "").trim().toLowerCase();
  if (!s) return { kind: "standard", text: "" };
  if (/^(standard|std|normal|full|regular|s)$/.test(s)) return { kind: "standard", text: s };
  if (/^(reduced|red|reduziert|r|lower|super reduced|super-reduced)$/.test(s)) return { kind: "reduced", text: s };
  if (/^(zero|zero rated|zero-rated|0|0%|z|exempt|none|no vat)$/.test(s)) return { kind: "zero", text: s, exempt: /exempt|none|no vat/.test(s) };
  if (/(e-?book|ebook|digital (book|publication)|publication|book)/.test(s)) return { kind: "ebook", text: s };
  const m = /^(\d+(?:[.,]\d+)?)\s*%?$/.exec(s);
  if (m) {
    const n = Number(m[1].replace(",", "."));
    const pct = n > 0 && n < 1 && !s.includes("%") ? n * 100 : n;
    const bp = Math.round(pct * 100);
    if (bp < 0 || bp > 10000) return null;
    return bp === 0 ? { kind: "zero", text: s } : { kind: "percent", bp, text: s };
  }
  return null;
}

/** Resolve a destination rate in basis points (2100 = 21%). */
export function destinationRate(code, spec) {
  const c = BY_CODE.get(code);
  const notes = [];
  let bp;
  switch (spec.kind) {
    case "standard": bp = Math.round(c.std * 100); break;
    case "zero": bp = 0; if (spec.exempt) notes.push({ sev: "info", code: "exempt-as-zero", msg: "Exempt/none read as 0% rate; check whether this supply belongs on the OSS return at all." }); break;
    case "reduced":
      if (!c.reduced.length) { bp = Math.round(c.std * 100); notes.push({ sev: "warning", code: "no-reduced", msg: `${c.name} has no reduced rate in the table; the standard rate was used.` }); }
      else {
        bp = Math.round(c.reduced[0] * 100);
        if (c.reduced.length > 1) notes.push({ sev: "warning", code: "reduced-ambiguous", msg: `${c.name} has several reduced rates (${c.reduced.join("%, ")}%); "reduced" was read as ${c.reduced[0]}%. Put the exact percentage in the rate column to choose another.` });
      }
      break;
    case "ebook":
      if (c.ebook === null || c.ebook === undefined) { bp = Math.round(c.std * 100); notes.push({ sev: "warning", code: "no-ebook", msg: `No digital-publication rate for ${c.name} in the table; the standard rate was used. Check the national rate.` }); }
      else bp = Math.round(c.ebook * 100);
      break;
    default: {
      bp = spec.bp;
      const known = new Set([c.std, ...c.reduced, ...(c.ebook == null ? [] : [c.ebook]), 0].map((x) => Math.round(x * 100)));
      if (!known.has(bp)) notes.push({ sev: "warning", code: "rate-not-in-table", msg: `${bp / 100}% is not a rate in the table for ${c.name} (standard ${c.std}%). It was used as given; check it.` });
    }
  }
  return { bp, notes };
}

function parseB2b(raw, destCode) {
  const s = String(raw ?? "").trim();
  if (!s) return { b2b: false };
  const low = s.toLowerCase();
  if (/^(no|n|false|0|-|none|b2c|consumer|private|nein|non)$/.test(low)) return { b2b: false };
  if (/^(yes|y|true|1|b2b|business|ja|oui|x)$/.test(low)) return { b2b: true, vatId: null };
  const id = s.replace(/[\s.\-]/g, "").toUpperCase();
  if (/^[A-Z]{2}[A-Z0-9]{2,12}$/.test(id) && /\d/.test(id)) {
    const prefix = id.slice(0, 2);
    const dest = destCode === "EL" ? ["EL", "GR"] : [destCode];
    return { b2b: true, vatId: id, mismatch: !dest.includes(prefix), prefix };
  }
  return { b2b: true, vatId: null, unrecognised: s };
}

const isRefundText = (s) => /(refund|credit|return|reversal|chargeback|storno|gutschrift|cancel)/i.test(String(s ?? ""));

// ---------------------------------------------------------------------------------------------
// Analysis

function normaliseOptions(opts) {
  const o = {
    sellerCountry: String(opts.sellerCountry || "").toUpperCase(),
    amountBasis: opts.amountBasis === "gross" ? "gross" : "net",
    ossMode: opts.ossMode === "optin" ? "optin" : "threshold",
    period: opts.period || "",
    fx: opts.fx || {},
    defaultCurrency: String(opts.defaultCurrency || "EUR").toUpperCase(),
    priorYearNet: opts.priorYearNet === undefined || opts.priorYearNet === null ? "" : String(opts.priorYearNet).trim(),
    originRate: opts.originRate === undefined || opts.originRate === null ? "" : String(opts.originRate).trim(),
    dateOrder: opts.dateOrder === "mdy" ? "mdy" : "dmy",
    decimal: ["dot", "comma"].includes(opts.decimal) ? opts.decimal : "auto",
    supply: opts.supply === "goods" ? "goods" : "services",
    mapping: opts.mapping || null,
  };
  if (o.sellerCountry === "GR") o.sellerCountry = "EL";
  return o;
}

export function analyze(text, opts = {}) {
  const o = normaliseOptions(opts);
  const findings = [];
  const seen = new Set();
  const add = (severity, row, code, title, detail = "", dedupe = null) => {
    if (dedupe) { if (seen.has(dedupe)) return; seen.add(dedupe); }
    findings.push({ severity, row: row ?? null, code, title, detail });
  };
  const result = {
    options: o, asOf: RATES_AS_OF, findings, rows: [], headers: [], mapping: null, basisHint: null,
    currencies: [], periods: [], period: o.period, dueDate: periodDueDate(o.period),
    thresholdYears: [], lines: [], totals: { baseCents: 0n, vatCents: 0n, grossCents: 0n, count: 0 },
    buckets: {}, ok: false, sellerLabel: "",
  };

  const sellerIsEu = BY_CODE.has(o.sellerCountry);
  const sellerNonEu = o.sellerCountry === "NONEU";
  if (!sellerIsEu && !sellerNonEu) {
    add("error", null, "seller-country", "Choose where your business is established", "The threshold and the domestic-sales split depend on it. Pick an EU country, or 'Outside the EU' to use the non-Union OSS.");
    return result;
  }
  result.sellerLabel = sellerNonEu ? "Outside the EU (non-Union OSS)" : BY_CODE.get(o.sellerCountry).name;

  // FX table: units of currency per 1 EUR (the ECB reference-rate convention).
  const fx = new Map();
  for (const [cur, val] of Object.entries(o.fx)) {
    const c = cur.toUpperCase();
    if (String(val ?? "").trim() === "") continue;
    const v = parsePlainDecimal(String(val).replace(",", "."));
    if (v === null || v <= 0n) add("error", null, "fx-invalid", `Exchange rate for ${c} is not a positive number`, `"${val}" was ignored.`);
    else fx.set(c, v);
  }

  const { records } = parseCsv(text);
  if (records.length < 2) {
    add("error", null, "no-data", "No data rows found", "Paste a CSV with a header row and at least one sale.");
    return result;
  }
  const headers = records[0].cells.map((c) => c.trim());
  result.headers = headers;
  const det = detectColumns(headers);
  const mapping = { ...det.mapping };
  if (o.mapping) for (const f of FIELDS) if (Number.isInteger(o.mapping[f])) mapping[f] = o.mapping[f];
  result.mapping = mapping;
  result.basisHint = det.basisHint;
  const missing = REQUIRED.filter((f) => mapping[f] < 0 || mapping[f] >= headers.length);
  if (missing.length) {
    add("error", 1, "columns-missing", `Could not find the ${missing.join(", ")} column${missing.length > 1 ? "s" : ""}`, `Headers seen: ${headers.join(" | ")}. Choose the columns by hand below.`);
    return result;
  }
  if (det.basisHint && det.basisHint !== o.amountBasis && !(o.mapping && Number.isInteger(o.mapping.amount))) {
    add("warning", 1, "basis-hint", `The amount column looks ${det.basisHint} of VAT but you chose ${o.amountBasis}`, `Header "${headers[mapping.amount]}". Check the "amounts are" setting before trusting VAT figures.`);
  }

  const cell = (rec, f) => (mapping[f] >= 0 && mapping[f] < rec.cells.length ? rec.cells[mapping[f]] : "");
  const originBpOverride = o.originRate ? parseRateCell(o.originRate) : null;
  if (o.originRate && (!originBpOverride || originBpOverride.bp === undefined)) add("warning", null, "origin-rate", "Origin VAT rate not understood", `"${o.originRate}" was ignored; the seller country's standard rate is used.`);
  const originBp = originBpOverride && originBpOverride.bp !== undefined ? originBpOverride.bp : sellerIsEu ? Math.round(BY_CODE.get(o.sellerCountry).std * 100) : 0;

  // ---- Pass 1: read and classify every row ----
  const rows = [];
  const currencies = new Set();
  const orderSeen = new Map();
  for (let i = 1; i < records.length; i++) {
    const rec = records[i];
    const r = { line: rec.line, raw: rec.cells, status: "pending", reason: "", date: null, dateStr: "", year: null, period: "", country: null, countryName: "", currency: "", amountMicroEur: 0n, netMicro: 0n, bp: null, rateLabel: "", refund: false, b2b: false };
    rows.push(r);
    const fail = (code, title, detail) => { r.status = "excluded"; r.reason = title; add("error", r.line, code, title, detail); };

    const d = parseDate(cell(rec, "date"), o.dateOrder);
    if (!d) { fail("bad-date", "Date not understood", `"${cell(rec, "date")}" is not a date. Use YYYY-MM-DD or day/month/year (change the date order setting for month/day/year).`); continue; }
    r.date = d; r.dateStr = iso(d); r.year = d.y; r.period = periodOf(d);

    const am = parseAmount(cell(rec, "amount"), o.decimal);
    if (!am) { fail("bad-amount", "Amount not understood", `"${cell(rec, "amount")}" is not a number.`); continue; }
    if (am.ambiguous) add("warning", r.line, "amount-ambiguous", `Amount "${cell(rec, "amount").trim()}" read as thousands`, "A single separator followed by three digits is ambiguous. If it is a decimal, set the decimal separator by hand.");

    const typeCell = cell(rec, "type");
    let signed = am.micro;
    r.refund = isRefundText(typeCell) || signed < 0n;
    if (isRefundText(typeCell) && signed > 0n) signed = -signed;

    let cur = String(cell(rec, "currency")).trim().toUpperCase() || o.defaultCurrency;
    if (cur === "€") cur = "EUR";
    if (!/^[A-Z]{3}$/.test(cur)) { fail("bad-currency", "Currency not understood", `"${cur}" is not a three-letter currency code.`); continue; }
    r.currency = cur;
    if (cur !== "EUR") {
      currencies.add(cur);
      if (!fx.has(cur)) { fail("fx-missing", `No exchange rate for ${cur}`, `Enter how many ${cur} equal 1 EUR (the ECB reference rate for the last day of the return period is the usual choice).`); continue; }
      r.amountMicroEur = divRound(signed * MICRO, fx.get(cur));
    } else r.amountMicroEur = signed;

    const c = parseCountry(cell(rec, "country"));
    r.countryName = String(cell(rec, "country")).trim();
    if (c.kind === "unknown") { fail("country-unknown", "Country not recognised", `${c.note}. Use a two-letter code such as DE or FR.`); continue; }
    r.country = c.code;
    if (c.note && c.kind === "eu") add("info", r.line, "country-note", `${r.countryName}: ${c.note}`, "", `cn:${c.note}`);
    if (c.kind === "other") {
      r.status = "excluded"; r.reason = `${c.code} is outside the EU VAT area`;
      add(c.code === "XI" || SPECIAL[c.code] ? "warning" : "info", r.line, "country-non-eu", `${c.code} is not an EU OSS destination`, c.note, `ne:${c.code}`);
      continue;
    }

    // domestic and B2B come before any threshold maths
    const b = parseB2b(cell(rec, "b2b"), r.country);
    r.b2b = b.b2b;
    if (sellerIsEu && r.country === o.sellerCountry) {
      r.status = "domestic"; r.reason = "domestic sale: not part of OSS";
      continue;
    }
    if (b.b2b) {
      r.status = "b2b"; r.reason = "B2B sale with a VAT ID: excluded";
      if (b.mismatch) add("warning", r.line, "vatid-mismatch", `VAT ID prefix ${b.prefix} does not match the destination ${r.country}`, "A customer's VAT ID normally starts with the country it is registered in; this sale was still excluded as B2B. Check the ID and where the customer is established.");
      if (b.unrecognised) add("warning", r.line, "vatid-format", `Business flag "${b.unrecognised}" is not a recognisable VAT ID`, "The sale was excluded as B2B. A valid, checked VAT ID is your evidence; keep the VIES check.");
      if (b.vatId === null && !b.unrecognised) add("info", r.line, "b2b-no-id", "B2B flag without a VAT ID", "Excluded as B2B on the flag alone. Keep the customer's validated VAT ID as evidence.", "b2b-noid");
      continue;
    }

    const rc = parseRateCell(cell(rec, "rate"));
    if (!rc) { fail("rate-unknown", "Rate not understood", `"${cell(rec, "rate")}" is not standard, reduced, zero, e-book or a percentage.`); continue; }
    const dr = destinationRate(r.country, rc);
    for (const n of dr.notes) add(n.sev, r.line, n.code, n.msg, "", `${n.code}:${r.country}`);
    r.bp = dr.bp; r.rateKind = rc.kind;
    r.rateLabel = `${dr.bp / 100}%`;
    r.orderId = cell(rec, "orderId").trim();
    if (r.orderId) {
      const key = [r.orderId, r.dateStr, r.country, r.amountMicroEur].join("|");
      if (orderSeen.has(key)) add("warning", r.line, "duplicate-row", `Row looks like a duplicate of row ${orderSeen.get(key)}`, `Same order id "${r.orderId}", date, country and amount. Kept in the totals; delete it if it is a double export.`);
      else orderSeen.set(key, r.line);
    }
  }
  result.rows = rows;
  result.currencies = [...currencies].sort();

  // ---- Pass 2: the EUR 10,000 threshold, in date order ----
  const eligible = rows.filter((r) => r.status === "pending").sort((a, b) => (a.dateStr < b.dateStr ? -1 : a.dateStr > b.dateStr ? 1 : a.line - b.line));
  const netAt = (r, bp) => (o.amountBasis === "net" ? r.amountMicroEur : divRound(r.amountMicroEur * 10000n, 10000n + BigInt(bp)));
  const thresholdMicro = THRESHOLD_CENTS * 10000n;
  const yearTotals = new Map();
  const years = [...new Set(eligible.map((r) => r.year))].sort((a, b) => a - b);
  const priorManual = o.priorYearNet === "" ? null : parsePlainDecimal(o.priorYearNet.replace(",", "."));
  if (o.priorYearNet !== "" && priorManual === null) add("warning", null, "prior-invalid", "Previous-year sales figure not understood", `"${o.priorYearNet}" was ignored.`);
  let gross2net = false;

  for (const y of years) {
    const yr = eligible.filter((r) => r.year === y);
    let prevMicro = null, prevSource = "none";
    if (yearTotals.has(y - 1)) { prevMicro = yearTotals.get(y - 1); prevSource = "data"; }
    else if (y === years[0] && priorManual !== null) { prevMicro = priorManual; prevSource = "manual"; }
    const prevExceeded = prevMicro !== null && prevMicro > thresholdMicro;
    let cum = 0n, crossed = prevExceeded, crossedRow = null, originCount = 0, originMicro = 0n;
    for (const r of yr) {
      if (sellerNonEu) { r.status = "oss"; r.netMicro = netAt(r, r.bp); cum += r.netMicro; continue; }
      if (o.ossMode === "optin" || prevExceeded) {
        r.status = "oss"; r.netMicro = netAt(r, r.bp); cum += r.netMicro;
        if (!crossed && cum > thresholdMicro) { crossed = true; crossedRow = r; }
        continue;
      }
      if (!crossed) {
        const n = netAt(r, originBp);
        if (cum + n > thresholdMicro) {
          crossed = true; crossedRow = r; r.status = "oss"; r.netMicro = netAt(r, r.bp); cum += r.netMicro;
        } else {
          r.status = "origin"; r.reason = "below the EUR 10,000 threshold: origin-country VAT may apply, not on the OSS return";
          r.netMicro = n; cum += n; originCount++; originMicro += n;
          if (o.amountBasis === "gross" && r.rateKind && r.rateKind !== "standard") gross2net = true;
        }
      } else { r.status = "oss"; r.netMicro = netAt(r, r.bp); cum += r.netMicro; }
    }
    yearTotals.set(y, cum);
    const ty = {
      year: y, count: yr.length, totalCents: microToCents(cum), headroomCents: THRESHOLD_CENTS - microToCents(cum),
      exceeded: crossed, reason: prevExceeded ? "previous-year" : crossedRow ? "current-year" : null,
      crossedLine: crossedRow ? crossedRow.line : null, crossedDate: crossedRow ? crossedRow.dateStr : null,
      prevTotalCents: prevMicro === null ? null : microToCents(prevMicro), prevSource,
      originCount, originCents: microToCents(originMicro),
    };
    result.thresholdYears.push(ty);
    if (sellerNonEu) continue;
    if (prevExceeded) add("info", null, "threshold-prev-year", `${y}: previous-year sales exceeded EUR 10,000`, `${formatCents(ty.prevTotalCents, { group: true })} EUR in ${y - 1} (${prevSource === "manual" ? "figure you entered" : "from this file"}), so destination-country VAT applies to every cross-border sale in ${y}.`);
    else if (crossedRow) add("warning", crossedRow.line, "threshold-crossed", `${y}: the EUR 10,000 threshold was crossed on ${crossedRow.dateStr}`, `This sale and every later cross-border B2C sale in ${y} takes destination-country VAT and goes on the OSS return. Earlier sales that year (${ty.originCount}, ${formatCents(ty.originCents, { group: true })} EUR net) carry origin-country VAT and are not on the OSS return.`);
    else if (cum * 5n >= thresholdMicro * 4n && o.ossMode === "threshold") add("warning", null, "threshold-near", `${y}: ${formatCents(ty.headroomCents, { group: true })} EUR of headroom left under the EUR 10,000 threshold`, "Above 80% of the threshold. The next sales may need destination-country VAT.");
    if (ty.prevSource === "none" && y === years[0] && sellerIsEu && o.ossMode === "threshold") add("info", null, "prior-year-unknown", `Previous-year sales to other EU countries were not supplied for ${y}`, "The previous year counts too: if it was over EUR 10,000 the whole of this year takes destination VAT. Enter the figure in the previous-year box to include it.", `prior:${y}`);
  }
  if (gross2net) add("info", null, "origin-gross", "Gross amounts below the threshold were converted with the origin rate", `${originBp / 100}% was used to remove VAT from sales before the threshold was crossed. Change the origin rate box if you charged a different rate.`);

  // refunds after the threshold crossed in a year that also has origin-VAT sales
  for (const ty of result.thresholdYears) {
    if (ty.originCount > 0 && ty.exceeded) {
      for (const r of eligible) if (r.year === ty.year && r.refund && r.status === "oss") add("warning", r.line, "refund-after-crossing", "Refund after the threshold was crossed", "If this refunds a sale made below the threshold (origin-country VAT), it does not belong on the OSS return. Check which sale it reverses.");
    }
  }

  // ---- Pass 3: group the chosen period ----
  const periods = [...new Set(rows.filter((r) => r.period).map((r) => r.period))].sort();
  result.periods = periods;
  const inPeriod = (r) => !o.period || r.period === o.period;
  const groups = new Map();
  const buckets = { oss: { count: 0, cents: 0n }, origin: { count: 0, cents: 0n }, domestic: { count: 0, cents: 0n }, b2b: { count: 0, cents: 0n }, excluded: { count: 0, cents: 0n } };
  const asEnteredMicro = { domestic: 0n, b2b: 0n, origin: 0n, oss: 0n };
  for (const r of rows) {
    if (r.date && !inPeriod(r)) continue;
    const b = buckets[r.status];
    if (!b) continue;
    b.count++;
    if (r.status !== "excluded") asEnteredMicro[r.status] += r.status === "domestic" || r.status === "b2b" ? r.amountMicroEur : r.netMicro;
    if (r.status !== "oss") continue;
    const key = `${r.country}|${r.bp}`;
    let g = groups.get(key);
    if (!g) { g = { country: r.country, name: BY_CODE.get(r.country).name, bp: r.bp, rate: `${r.bp / 100}%`, amountMicro: 0n, count: 0, refunds: 0 }; groups.set(key, g); }
    g.amountMicro += r.amountMicroEur;
    g.count++;
    if (r.refund) g.refunds++;
  }
  for (const k of Object.keys(asEnteredMicro)) buckets[k].cents = microToCents(asEnteredMicro[k]);
  result.buckets = buckets;

  const lines = [];
  for (const g of groups.values()) {
    const bp = BigInt(g.bp);
    let base, vat, gross;
    if (o.amountBasis === "gross") {
      // Round the gross total once, take the VAT out of it once; base + VAT then equals the gross.
      gross = microToCents(g.amountMicro);
      base = divRound(gross * 10000n, 10000n + bp);
      vat = gross - base;
    } else {
      base = microToCents(g.amountMicro);
      vat = divRound(base * bp, 10000n);
      gross = base + vat;
    }
    lines.push({ country: g.country, name: g.name, bp: g.bp, rate: g.rate, baseCents: base, vatCents: vat, grossCents: gross, count: g.count, refunds: g.refunds });
  }
  lines.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : b.bp - a.bp));
  result.lines = lines;
  for (const l of lines) {
    result.totals.baseCents += l.baseCents; result.totals.vatCents += l.vatCents; result.totals.grossCents += l.grossCents; result.totals.count += l.count;
    if (l.baseCents < 0n) add("info", null, "negative-group", `${l.name} ${l.rate}: refunds exceed sales in this period`, "A negative taxable amount is shown as it is. Your authority may want the credit handled as a correction.", `neg:${l.country}:${l.bp}`);
  }
  if (buckets.domestic.count) add("info", null, "domestic-excluded", `${buckets.domestic.count} domestic sale${buckets.domestic.count === 1 ? "" : "s"} (${formatCents(buckets.domestic.cents, { group: true })} EUR as entered) left off the OSS return`, "Sales to customers in your own country go on your normal VAT return, never on the OSS return.", "domestic");
  if (buckets.b2b.count) add("info", null, "b2b-excluded", `${buckets.b2b.count} B2B sale${buckets.b2b.count === 1 ? "" : "s"} with a VAT ID left off the OSS return`, "Business sales are normally outside OSS; the customer accounts for the VAT (reverse charge) if the rules for your supply apply.", "b2b");
  if (buckets.excluded.count) add("warning", null, "rows-excluded", `${buckets.excluded.count} row${buckets.excluded.count === 1 ? "" : "s"} could not be included`, "Each is listed above with its row number. Fix the file or the setting and run again.", "excluded");
  if (sellerNonEu && o.supply === "goods") add("warning", null, "noneu-goods", "Non-Union OSS covers services, not goods", "Goods sent from outside the EU to EU consumers go through import VAT or IOSS (consignments up to EUR 150), not the non-Union OSS. The result below treats the sales as services.");
  if (sellerNonEu) add("info", null, "noneu-no-threshold", "No EUR 10,000 threshold applies to a seller established outside the EU", "Every B2C sale to an EU country is taxed at the destination rate.", "noneu");
  result.ok = true;
  return result;
}

// ---------------------------------------------------------------------------------------------
// Output

export const csvCell = (v) => {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function ossCsv(result) {
  const out = [["Member state of consumption", "Country code", "VAT rate %", "Taxable amount EUR", "VAT due EUR", "Rows"].join(",")];
  for (const l of result.lines) out.push([l.name, l.country, l.bp / 100, formatCents(l.baseCents), formatCents(l.vatCents), l.count].map(csvCell).join(","));
  out.push(["Total", "", "", formatCents(result.totals.baseCents), formatCents(result.totals.vatCents), result.totals.count].map(csvCell).join(","));
  return out.join("\n") + "\n";
}

export function findingsCsv(result) {
  const out = ["Row,Severity,Code,Finding,Detail"];
  for (const f of result.findings) out.push([f.row ?? "", f.severity, f.code, f.title, f.detail].map(csvCell).join(","));
  return out.join("\n") + "\n";
}

export function rowsCsv(result) {
  const out = ["Row,Date,Country,Status,Rate %,Amount EUR as entered,Net EUR,Reason"];
  for (const r of result.rows) out.push([r.line, r.dateStr, r.country || "", r.status, r.bp === null || r.bp === undefined ? "" : r.bp / 100, formatCents(microToCents(r.amountMicroEur)), r.status === "oss" || r.status === "origin" ? formatCents(microToCents(r.netMicro)) : "", r.reason].map(csvCell).join(","));
  return out.join("\n") + "\n";
}

// ---------------------------------------------------------------------------------------------
// Worked example: a synthetic German course seller, net amounts, crossing the threshold in Q2.

export function sampleCsv() {
  return [
    "Date,Country,Net amount,Currency,Rate,VAT ID,Type,Order",
    "2025-11-12,FR,4000.00,EUR,standard,,sale,A-1",
    "2026-01-08,FR,1500.00,EUR,standard,,sale,B-1",
    "2026-01-20,NL,1200.00,EUR,standard,,sale,B-2",
    "2026-02-03,DE,800.00,EUR,standard,,sale,B-3",
    "2026-02-14,ES,2100.00,EUR,standard,,sale,B-4",
    "2026-02-27,IT,1800.00,EUR,standard,,sale,B-5",
    "2026-03-10,FR,900.00,EUR,ebook,,sale,B-6",
    "2026-03-18,AT,2400.00,EUR,standard,ATU12345678,sale,B-7",
    "2026-03-25,FR,-300.00,EUR,standard,,refund,B-1",
    "2026-04-02,PL,2200.00,EUR,standard,,sale,C-1",
    "2026-04-09,SE,1450.00,EUR,standard,,sale,C-2",
    "2026-04-21,FR,600.50,EUR,reduced,,sale,C-3",
    "2026-05-05,GR,1000.00,EUR,standard,,sale,C-4",
    "2026-05-19,US,700.00,EUR,standard,,sale,C-5",
    "2026-05-30,ES,0.50,EUR,standard,,sale,C-6",
    "2026-06-11,ES,0.50,EUR,standard,,sale,C-7",
    "2026-06-11,ES,0.50,EUR,standard,,sale,C-8",
    "2026-06-28,IE,1300.00,EUR,standard,,sale,C-9",
  ].join("\n") + "\n";
}

export function sampleGrossCsv() {
  return [
    "Created at,Shipping Country,Total,Presentment Currency,Financial Status",
    "2026-07-03,DE,119.00,EUR,paid",
    "2026-07-09,FR,60.00,EUR,paid",
    "2026-07-15,ES,121.00,EUR,paid",
    "2026-08-02,SE,250.00,SEK,paid",
    "2026-08-10,FR,-60.00,EUR,refunded",
  ].join("\n") + "\n";
}
