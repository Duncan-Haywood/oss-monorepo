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

/** Header text, exactly as the file's header row has it (matched ignoring case, spaces and punctuation). */
export type ColumnMapping = Partial<Record<MappedField, string>> & {
  date: string;
  itemPrice: string;
  fees?: { column: string; kind: MappedFeeKind }[];
};

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
  return problems;
}

// Words that, in a header, suggest a field. Only a prefill: the seller sees each choice and confirms it.
const HINTS: [MappedField, RegExp][] = [
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
} {
  const fields: Partial<Record<MappedField, string>> = {};
  const fees: { column: string; kind: MappedFeeKind }[] = [];
  const taken = new Set<string>();
  for (const h of headers) {
    const k = normHeaderKey(h);
    if (!k || taken.has(k)) continue;
    if (/fee|commission/.test(k) && !/shipping|tax/.test(k)) {
      if (fees.length < MAX_MAPPED_FEES) {
        const kind: MappedFeeKind = /process|payment|paypal|stripe|card/.test(k)
          ? "payment_processing"
          : /commission|selling|seller|marketplace|transaction/.test(k)
            ? "commission"
            : /boost|promot|ad/.test(k)
              ? "advertising"
              : "marketplace_fee";
        fees.push({ column: h, kind });
        taken.add(k);
      }
      continue;
    }
    for (const [field, re] of HINTS) {
      if (fields[field] || !re.test(k)) continue;
      fields[field] = h;
      taken.add(k);
      break;
    }
  }
  return { fields, fees };
}
