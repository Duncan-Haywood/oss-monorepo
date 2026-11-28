// The column-mapped CSV import, shared by the Worker (which reads the file) and the SPA (which shows the
// seller their own header row and asks which column is which).
//
// Why it exists: Grailed, StockX and Vinted publish no column list for their sales exports (StockX Pro's
// "Export History" is documented only as "CSV"; Grailed and Vinted document no export at all), and smaller
// marketplaces never will. Writing an importer against guessed headers would import wrong numbers with
// confidence. Here the seller names the columns, so nothing is guessed; the SPA's prefill below is only a
// suggestion they confirm, and the mapping they confirm is saved per platform for the next file.
import type { FeeKind, Platform } from "./enums";

/** "Final Value Fee - variable" -> "finalvaluefeevariable" (the importers' `normHeader`). */
export const normHeaderKey = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Platforms that import through a column mapping instead of a fixed report layout. */
export const MAPPED_PLATFORMS = [
  "grailed",
  "stockx",
  "vinted",
  "reverb",
  "other",
] as const satisfies readonly Platform[];
export type MappedPlatform = (typeof MAPPED_PLATFORMS)[number];

/** Each single-column field, its label in the form, and whether a file can be read without it. */
export const MAPPED_FIELDS = [
  { key: "date", label: "Sale date", required: true },
  { key: "itemPrice", label: "Item price (what the buyer paid for the item)", required: true },
  { key: "title", label: "Item title" },
  { key: "orderId", label: "Order number" },
  { key: "sku", label: "SKU or your own item code" },
  { key: "quantity", label: "Quantity" },
  { key: "status", label: "Order status (cancelled orders are left out)" },
  { key: "shipping", label: "Shipping the buyer paid" },
  { key: "salesTax", label: "Sales tax" },
  { key: "shippingLabel", label: "Shipping label you paid for" },
  { key: "refund", label: "Refund to the buyer" },
  { key: "net", label: "Net payout (what you received)" },
] as const;

export type MappedField = (typeof MAPPED_FIELDS)[number]["key"];

/** Fee kinds a mapped fee column can be filed under (a subset of FEE_KINDS that fits any marketplace). */
export const MAPPED_FEE_KINDS = [
  "commission",
  "payment_processing",
  "transaction",
  "advertising",
  "listing",
  "marketplace_fee",
  "other",
] as const satisfies readonly FeeKind[];
export type MappedFeeKind = (typeof MAPPED_FEE_KINDS)[number];

export const MAX_MAPPED_FEES = 6;

/**
 * Amounts the chosen price column already holds besides the item. Some exports have no item price, only
 * what the buyer paid in all (Reverb's orders export lists an "Order Total" and a "Shipping Cost", and no
 * item price): ticking these takes the chosen shipping and tax columns back out of it, so shipping is not
 * counted twice and tax is never income.
 */
export const PRICE_INCLUDES = ["shipping", "salesTax"] as const;
export type PriceInclude = (typeof PRICE_INCLUDES)[number];

/** Header text, exactly as the file's header row has it (matched ignoring case, spaces and punctuation). */
export type ColumnMapping = Partial<Record<MappedField, string>> & {
  date: string;
  itemPrice: string;
  fees?: { column: string; kind: MappedFeeKind }[];
  priceIncludes?: PriceInclude[];
};

/** An order status that means the sale did not happen ("Cancelled", "Canceled", "Voided", "Declined"). */
export const CANCELLED_STATUS = /cancel|void|declin|fail|reject/i;

/** Problems with a mapping against a header row; empty when it can be imported. */
export function mappingProblems(mapping: ColumnMapping, headers: readonly string[]): string[] {
  const have = new Set(headers.map(normHeaderKey).filter(Boolean));
  const problems: string[] = [];
  const used = new Map<string, string>();
  const claim = (column: string, what: string) => {
    const k = normHeaderKey(column);
    if (!have.has(k)) {
      problems.push(`${what}: the file has no column "${column}".`);
      return;
    }
    const before = used.get(k);
    if (before) problems.push(`"${column}" is chosen for both ${before} and ${what}.`);
    else used.set(k, what);
  };
  for (const f of MAPPED_FIELDS) {
    const column = mapping[f.key];
    if (!column) {
      if ("required" in f && f.required) problems.push(`Choose the column for ${f.label}.`);
      continue;
    }
    claim(column, f.label);
  }
  const fees = mapping.fees ?? [];
  if (fees.length > MAX_MAPPED_FEES) problems.push(`At most ${MAX_MAPPED_FEES} fee columns.`);
  for (const fee of fees) claim(fee.column, `a fee (${fee.column})`);
  for (const inc of mapping.priceIncludes ?? []) {
    const f = MAPPED_FIELDS.find((x) => x.key === inc);
    if (f && !mapping[inc])
      problems.push(`The price includes ${f.label.toLowerCase()}: choose that column too.`);
  }
  return problems;
}

// Columns that hold words, not money ("Order Status", "Refund Status", "Payment Method", "Shipping Provider",
// "Tax Responsible Party"): never suggested for an amount, though their names carry "refund", "tax" or
// "shipping". Reverb's orders export has several (its help article's field list, docs/IMPORTERS.md).
const TEXT_COLUMN =
  /(status|method|type|provider|service|carrier|tracking|party|responsible|currency|country|state|city|zip|postal|address|location|source|code|name|email|phone|date)$/;
const MONEY_FIELDS: ReadonlySet<MappedField> = new Set([
  "itemPrice",
  "shipping",
  "salesTax",
  "shippingLabel",
  "refund",
  "net",
]);
// A fee column that is the sum of the others ("Total Fees"): taking it beside them counts each fee twice.
const TOTAL_FEE = /^total|total$|^allfees|^fees$/;

// Words that, in a header, suggest a field. Only a prefill: the seller sees each choice and confirms it.
const HINTS: [MappedField, RegExp][] = [
  ["status", /^(order|sale)?status$/],
  ["orderId", /^(order|transaction|sale)(id|number|no)?$/],
  ["date", /date|soldon|^sold$|^created/],
  ["refund", /refund/],
  ["salesTax", /tax/],
  ["shippingLabel", /label|postage(cost|paid)?$|shippingcost(seller|paid)/],
  ["shipping", /shipping|postage/],
  ["net", /net|payout|youreceived|youearned|earnings|proceeds/],
  ["itemPrice", /price|^amount$|^sale(amount|price)?$|^total$|^gross/],
  ["title", /title|description|^item$|^itemname$|^listing|^product|^name$/],
  ["sku", /^sku$|^customlabel$|itemcode|^style/],
  ["quantity", /^(qty|quantity)$/],
];

/** A suggested mapping from header names alone; fee-looking columns are suggested as fees. */
export function suggestMapping(headers: readonly string[]): {
  fields: Partial<Record<MappedField, string>>;
  fees: { column: string; kind: MappedFeeKind }[];
  priceIncludes: PriceInclude[];
} {
  const fields: Partial<Record<MappedField, string>> = {};
  const fees: { column: string; kind: MappedFeeKind }[] = [];
  const taken = new Set<string>();
  const isFee = (k: string) => /fee|commission/.test(k) && !/shipping|tax/.test(k);
  const feeKeys = headers.map(normHeaderKey).filter((k) => k && isFee(k) && !TEXT_COLUMN.test(k));
  // A total is suggested only when it is the file's one fee column; otherwise its parts are.
  const hasParts = feeKeys.some((k) => !TOTAL_FEE.test(k));
  for (const h of headers) {
    const k = normHeaderKey(h);
    if (!k || taken.has(k)) continue;
    if (isFee(k)) {
      if (TEXT_COLUMN.test(k) || (hasParts && TOTAL_FEE.test(k))) continue;
      if (fees.length < MAX_MAPPED_FEES) {
        const kind: MappedFeeKind = /process|payment|paypal|stripe|card/.test(k)
          ? "payment_processing"
          : /commission|selling|seller|marketplace|transaction/.test(k)
            ? "commission"
            : /boost|bump|promot|ad/.test(k)
              ? "advertising"
              : "marketplace_fee";
        fees.push({ column: h, kind });
        taken.add(k);
      }
      continue;
    }
    for (const [field, re] of HINTS) {
      if (fields[field] || !re.test(k)) continue;
      if (MONEY_FIELDS.has(field) && TEXT_COLUMN.test(k)) continue;
      fields[field] = h;
      taken.add(k);
      break;
    }
  }
  // No item price, but an order total: suggest it, with the shipping and tax columns taken back out.
  const priceIncludes: PriceInclude[] = [];
  if (!fields.itemPrice) {
    const total = headers.find((h) => {
      const k = normHeaderKey(h);
      return !taken.has(k) && /^(order|sale|grand)total$|^totalpaid$|^buyerpaid$/.test(k);
    });
    if (total) {
      fields.itemPrice = total;
      for (const inc of PRICE_INCLUDES) if (fields[inc]) priceIncludes.push(inc);
    }
  }
  return { fields, fees, priceIncludes };
}
