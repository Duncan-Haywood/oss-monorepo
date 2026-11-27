// The shop's currency (shop_settings.currency): one ISO 4217 code per shop, null reading as USD.
//
// Every amount is still stored in the currency's minor unit ("cents"), so only currencies with two
// minor units are offered: no JPY or HUF-style amounts that a "cents" column would misstate. Nothing
// converts between currencies: a shop prices, quotes and analyses in its own currency, and changing the setting relabels amounts, it never converts them.
//
// Formatting is done here, not by Intl, so the Worker, the browser and the quote PDF print the same
// characters (Intl's output differs between ICU versions and uses non-breaking spaces the PDF's
// WinAnsi text cannot always carry). The prefixes follow Intl's en-US currency display: "$" for USD,
// "CA$" and "A$" where a bare "$" would be ambiguous, "£" and "€", and the code for the rest.

export const SHOP_CURRENCIES = [
  "USD",
  "CAD",
  "MXN",
  "GBP",
  "EUR",
  "AUD",
  "NZD",
  "CHF",
  "SEK",
  "NOK",
  "DKK",
  "PLN",
] as const;
export type ShopCurrency = (typeof SHOP_CURRENCIES)[number];

export const DEFAULT_CURRENCY: ShopCurrency = "USD";

const PREFIX: Record<ShopCurrency, string> = {
  USD: "$",
  CAD: "CA$",
  MXN: "MX$",
  GBP: "£",
  EUR: "€",
  AUD: "A$",
  NZD: "NZ$",
  CHF: "CHF ",
  SEK: "SEK ",
  NOK: "NOK ",
  DKK: "DKK ",
  PLN: "PLN ",
};

export const CURRENCY_NAMES: Record<ShopCurrency, string> = {
  USD: "US dollar",
  CAD: "Canadian dollar",
  MXN: "Mexican peso",
  GBP: "Pound sterling",
  EUR: "Euro",
  AUD: "Australian dollar",
  NZD: "New Zealand dollar",
  CHF: "Swiss franc",
  SEK: "Swedish krona",
  NOK: "Norwegian krone",
  DKK: "Danish krone",
  PLN: "Polish zloty",
};

export function isShopCurrency(v: unknown): v is ShopCurrency {
  return typeof v === "string" && (SHOP_CURRENCIES as readonly string[]).includes(v);
}

/** The stored value (null, or a code from an older list) as a currency to print in. */
export function shopCurrency(stored: string | null | undefined): ShopCurrency {
  const code = stored?.trim().toUpperCase();
  return isShopCurrency(code) ? code : DEFAULT_CURRENCY;
}

/** "$", "CA$", "€", "CHF " ... the text printed before an amount. */
export function currencyPrefix(currency: string | null | undefined): string {
  return PREFIX[shopCurrency(currency)];
}

export interface MoneyFormat {
  /** "1,234.56" (default) or "1234.56". */
  grouping?: boolean;
  /** "$1,200" rather than "$1,200.00" when there are no cents. */
  dropZeroCents?: boolean;
}

/** 123456 cents -> "$1,234.56" (USD), "€1,234.56", "CHF 1,234.56"; negatives as "-$5.00". */
export function formatMoney(
  cents: number,
  currency: string | null | undefined,
  opts: MoneyFormat = {},
): string {
  const { grouping = true, dropZeroCents = false } = opts;
  const negative = cents < 0;
  const abs = Math.round(Math.abs(cents));
  const whole = Math.floor(abs / 100);
  const minor = abs % 100;
  const wholeText = grouping ? whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") : `${whole}`;
  const body =
    dropZeroCents && minor === 0 ? wholeText : `${wholeText}.${minor.toString().padStart(2, "0")}`;
  return `${negative ? "-" : ""}${currencyPrefix(currency)}${body}`;
}

/**
 * Strips any currency marker a person types or a sheet carries before or after an amount ("$",
 * "CA$", "€", "£", "CHF", "85.00 EUR"), leaving the number text. Thousands commas stay for the
 * caller's own parse.
 */
export function stripCurrencyMarks(s: string): string {
  return s
    .trim()
    .replace(/^(?:[A-Za-z]{1,3}\s?)?[$€£]\s*/, "")
    .replace(/^[A-Za-z]{3}\s+/, "")
    .replace(/(?<=\d)\s*(?:[$€£]|[A-Za-z]{3})$/, "")
    .trim();
}

// ---------------------------------------------------------------------------------------------
// Currency marks in imported sheets
//
// A rate-card sheet may write "€85", "85,00 €", "CA$95", "£40 /hr" or "Rate (EUR/hr)". The import
// reads an amount only in the shop's own currency and refuses one marked in another: nothing
// converts (no rate is ever guessed), so the refusal names both currencies. A bare "$" is any of
// the dollar or peso currencies on the list and "kr" any of the three krone/krona, so a Canadian
// shop's "$95" and a Danish shop's "450 kr" read as the shop's own. Codes outside the shop list are
// still recognised, so "JPY 9000" is refused for its currency rather than as text.

export interface CurrencyMark {
  /** The mark as written: "€", "CA$", "EUR", "kr". */
  mark: string;
  /** The ISO 4217 codes it can stand for. */
  codes: readonly string[];
}

const DOLLARS = ["USD", "CAD", "MXN", "AUD", "NZD"] as const;
const KRONE = ["SEK", "NOK", "DKK"] as const;
const OTHER_CODES = [
  "JPY",
  "CNY",
  "INR",
  "BRL",
  "ZAR",
  "HUF",
  "CZK",
  "KRW",
  "SGD",
  "HKD",
  "TRY",
  "ILS",
  "RON",
  "ISK",
] as const;
const KNOWN_CODES = new Set<string>([...SHOP_CURRENCIES, ...OTHER_CODES]);

/** Symbols, longest first so "CA$" is not read as "$". Letters match in any case. */
const SYMBOLS: [string, readonly string[]][] = [
  ["US$", ["USD"]],
  ["CA$", ["CAD"]],
  ["MX$", ["MXN"]],
  ["AU$", ["AUD"]],
  ["NZ$", ["NZD"]],
  ["C$", ["CAD"]],
  ["A$", ["AUD"]],
  ["R$", ["BRL"]],
  ["$", DOLLARS],
  ["€", ["EUR"]],
  ["£", ["GBP"]],
  ["¥", ["JPY", "CNY"]],
  ["₹", ["INR"]],
  ["zł", ["PLN"]],
  ["kr.", KRONE],
  ["kr", KRONE],
];

/** Every regex metacharacter escaped, backslash included. */
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const SYMBOL_ALT = SYMBOLS.map(([s]) => esc(s)).join("|");
const CODE_ALT = "[A-Za-z]{3}";
const PREFIX_RE = new RegExp(`^(${SYMBOL_ALT}|${CODE_ALT})\\s*(?=[\\d.,])`, "i");
const SUFFIX_RE = new RegExp(`(?<=[\\d.,])\\s*(${SYMBOL_ALT}|${CODE_ALT})$`, "i");

function markFor(raw: string): CurrencyMark | null {
  const lower = raw.toLowerCase();
  const sym = SYMBOLS.find(([s]) => s.toLowerCase() === lower);
  if (sym) return { mark: raw, codes: sym[1] };
  const code = raw.toUpperCase();
  return KNOWN_CODES.has(code) ? { mark: code, codes: [code] } : null;
}

/**
 * The currency mark before or after an amount in one cell, and the number text left without it:
 * "€85" -> € and "85"; "12,50 EUR" -> EUR and "12,50"; "85" -> no mark. Three letters that are not
 * a currency code ("85 abc") are left in place for the caller's number parse to refuse.
 */
export function splitCurrencyMark(s: string): { mark: CurrencyMark | null; rest: string } {
  const t = s.trim();
  const pre = PREFIX_RE.exec(t);
  if (pre?.[1]) {
    const mark = markFor(pre[1]);
    if (mark) return { mark, rest: t.slice(pre[0].length).trim() };
  }
  const suf = SUFFIX_RE.exec(t);
  if (suf?.[1]) {
    const mark = markFor(suf[1]);
    if (mark) return { mark, rest: t.slice(0, t.length - suf[0].length).trim() };
  }
  return { mark: null, rest: t };
}

// In a header the mark can sit anywhere ("Rate (€/hr)", "Price EUR/lb", "Hourly CA$"). A code
// counts only as a whole word next to a bracket, a slash, "per" or the end, so "CAD time" (the
// software) is not Canadian dollars.
const HEADER_SYMBOL_RE = new RegExp(
  `(?:^|[^A-Za-z])(${SYMBOLS.filter(([s]) => !/^kr/.test(s))
    .map(([s]) => esc(s))
    .join("|")})`,
  "i",
);
const HEADER_CODE_RE =
  /(?:^|[\s(/[])([A-Za-z]{3})(?=\s*(?:[)\]/]|$|\s+per\b))|\(\s*([A-Za-z]{3})\b|\bin\s+([A-Za-z]{3})\b/;

/** The currency a column header names, if any: "Rate (€/hr)" -> €; "Hourly rate" -> none. */
export function headerCurrencyMark(header: string): CurrencyMark | null {
  const sym = HEADER_SYMBOL_RE.exec(header);
  if (sym?.[1]) {
    const mark = markFor(sym[1]);
    if (mark) return mark;
  }
  const code = HEADER_CODE_RE.exec(header);
  const raw = code?.[1] ?? code?.[2] ?? code?.[3];
  if (raw) {
    const upper = raw.toUpperCase();
    if (KNOWN_CODES.has(upper)) return { mark: upper, codes: [upper] };
  }
  return null;
}

/** Whether an amount with this mark (or none) is in the shop's currency. No mark always fits. */
export function markFits(mark: CurrencyMark | null, currency: string | null | undefined): boolean {
  return mark === null || mark.codes.includes(shopCurrency(currency));
}

/** "EUR" for a mark that is one currency, "$ (a dollar)" style text for one that is several. */
export function describeMark(mark: CurrencyMark): string {
  if (mark.codes.length === 1) return mark.codes[0] ?? mark.mark;
  return `"${mark.mark}" (${mark.codes.join(", ")})`;
}

/** The refusal for an amount or column marked in another currency than the shop's. */
export function otherCurrencyMessage(mark: CurrencyMark, currency: string | null | undefined) {
  return `is in ${describeMark(mark)} but the rate card is in ${shopCurrency(currency)}; nothing is converted: convert the sheet, or change the currency on the rate card first`;
}
