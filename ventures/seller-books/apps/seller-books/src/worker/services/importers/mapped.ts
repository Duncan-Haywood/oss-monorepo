// Column-mapped CSV: any marketplace's sales export, read with the columns the seller named
// (src/shared/column-mapping.ts says why). One row = one sale. A row whose item price is negative is a
// refund (many exports list returns that way); a mapped refund column adds a refund beside the sale.
// Amounts come only from the columns chosen: nothing is derived from an assumed fee rate.
import {
  CANCELLED_STATUS,
  type ColumnMapping,
  MAPPED_FIELDS,
  type MappedField,
  type MappedPlatform,
  mappingProblems,
  normHeaderKey,
} from "@shared/column-mapping";
import { parseCsv } from "@shared/csv";
import { PLATFORM_LABELS } from "@shared/enums";
import {
  abs,
  type ColumnSpec,
  emptyResult,
  ImportFormatError,
  type ImportParseResult,
  type ParsedFee,
  parseDate,
  parseMoney,
  readTable,
  rowKey,
} from "./parse";

export const MAPPED_REPORT_KIND = "mapped_csv";

/** The header row: the first of the first 30 rows holding both required columns (or the first row). */
export function headerRow(text: string, mapping?: Pick<ColumnMapping, "date" | "itemPrice">) {
  const rows = parseCsv(text).slice(0, 30);
  if (mapping) {
    const want = [mapping.date, mapping.itemPrice].map(normHeaderKey);
    const hit = rows.find((r) => {
      const cells = r.map(normHeaderKey);
      return want.every((w) => cells.includes(w));
    });
    if (hit) return hit;
  }
  return rows.find((r) => r.filter((c) => c.trim() !== "").length > 1) ?? [];
}

export function parseMappedCsv(
  text: string,
  platform: MappedPlatform,
  mapping: ColumnMapping,
): ImportParseResult {
  const label = `${PLATFORM_LABELS[platform]} file`;
  const problems = mappingProblems(mapping, headerRow(text, mapping));
  if (problems.length)
    throw new ImportFormatError(`The column choices don't fit this ${label}.`, problems);

  type Key = MappedField | `fee${number}`;
  const spec = {} as ColumnSpec<Key>;
  for (const f of MAPPED_FIELDS) {
    const column = mapping[f.key];
    if (column) spec[f.key] = { names: [column], required: "required" in f && f.required };
  }
  const fees = mapping.fees ?? [];
  fees.forEach((fee, i) => {
    spec[`fee${i}`] = { names: [fee.column] };
  });

  const out = emptyResult(platform, MAPPED_REPORT_KIND);
  const table = readTable<Key>(text, spec, label);
  out.rowCount = table.rows.length;
  // The same order number (or the same row key) twice in one file is two sales, not a duplicate: the
  // n-th occurrence gets ":n", which stays the same when the same file is imported again.
  const seen = new Map<string, number>();
  const occurrence = (key: string) => {
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    return n === 1 ? key : `${key}:${n}`;
  };
  let negativeFees = false;
  const includes = new Set(mapping.priceIncludes ?? []);

  for (const row of table.rows) {
    try {
      const date = parseDate(row.get("date"));
      if (!date) {
        out.skipped.push({ line: row.line, reason: `Unreadable date "${row.get("date") ?? ""}"` });
        continue;
      }
      const status = row.get("status")?.trim();
      if (status && CANCELLED_STATUS.test(status)) {
        out.skipped.push({ line: row.line, reason: `Order status "${status}": not a sale` });
        continue;
      }
      const raw = parseMoney(row.get("itemPrice"));
      if (raw == null) {
        out.skipped.push({ line: row.line, reason: "No item price" });
        continue;
      }
      const shippingIn = abs(parseMoney(row.get("shipping"))) ?? 0;
      const taxIn = abs(parseMoney(row.get("salesTax"))) ?? 0;
      // A total that holds shipping and tax: the item is what is left once they are taken out.
      const inside =
        (includes.has("shipping") ? shippingIn : 0) + (includes.has("salesTax") ? taxIn : 0);
      const price = raw < 0 ? raw + inside : raw - inside;
      if (inside && (raw < 0 ? price > 0 : price < 0)) {
        out.skipped.push({
          line: row.line,
          reason: "Shipping and tax are more than the total the price column holds",
        });
        continue;
      }
      const orderId = row.get("orderId") || null;
      const title = row.get("title") || null;
      const sku = row.get("sku") || null;
      const ext = occurrence(
        orderId ?? rowKey(date, title, sku, row.get("itemPrice"), row.get("net")),
      );
      const feeList: ParsedFee[] = [];
      fees.forEach((fee, i) => {
        const v = parseMoney(row.get(`fee${i}`));
        if (v == null || v === 0) return;
        // A fee column is the platform's charge; its sign varies by export ("-3.20" or "3.20"). On a
        // refund row a fee credited back is stored negative, like the fixed importers do.
        if (price > 0 && v > 0 && /refund|credit/i.test(fee.column)) negativeFees = true;
        feeList.push({
          kind: fee.kind,
          amountCents: (price < 0 ? -1 : 1) * Math.abs(v),
          sourceColumn: table.matched[`fee${i}`] ?? fee.column,
        });
      });
      const net = parseMoney(row.get("net"));
      const quantity = Math.max(1, Number.parseInt(row.get("quantity") ?? "1", 10) || 1);
      if (price < 0) {
        out.sales.push({
          kind: "refund",
          externalId: ext,
          orderId,
          date,
          title,
          sku,
          quantity,
          itemCents: 0,
          shippingChargedCents: 0,
          salesTaxCents: 0,
          // Item and shipping back; when the total held the tax, that part went back as tax, not income.
          refundCents: Math.abs(price) + shippingIn,
          shippingLabelCents: 0,
          netCents: net,
          fees: feeList,
        });
        continue;
      }
      out.sales.push({
        kind: "order",
        externalId: ext,
        orderId,
        date,
        title,
        sku,
        quantity,
        itemCents: price,
        shippingChargedCents: shippingIn,
        salesTaxCents: taxIn,
        refundCents: 0,
        shippingLabelCents: abs(parseMoney(row.get("shippingLabel"))) ?? 0,
        netCents: net,
        fees: feeList,
      });
      const refund = abs(parseMoney(row.get("refund")));
      if (refund) {
        out.sales.push({
          kind: "refund",
          externalId: `${ext}:refund`,
          orderId,
          date,
          title,
          sku,
          quantity: 1,
          itemCents: 0,
          shippingChargedCents: 0,
          salesTaxCents: 0,
          refundCents: refund,
          shippingLabelCents: 0,
          netCents: null,
          fees: [],
        });
        out.warnings.push(
          `Line ${row.line}: refund recorded on the sale date (the file has no separate refund date).`,
        );
      }
    } catch (e) {
      out.skipped.push({ line: row.line, reason: (e as Error).message });
    }
  }
  if (negativeFees)
    out.warnings.push(
      "A column named like a refund or credit was chosen as a fee: fees are stored as charges. If that column is money back to you, leave it out.",
    );
  if (!mapping.net)
    out.warnings.push(
      "No net payout column was chosen, so the payout check cannot compare this platform's deposits to its sales.",
    );
  return out;
}
