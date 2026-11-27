// Depop sales download (Selling Hub > Stats > Download sales, up to 3 months per file). One row = one sale.
// Depop's help describes the file as date, buyer, item description, quantity, pricing, fees (Depop
// Payments, Buyer Marketplace, Selling, Boosting), shipping and tax; the exact header strings were not
// verifiable, so several spellings are accepted (docs/IMPORTERS.md#depop).
import {
  abs,
  emptyResult,
  type ImportParseResult,
  type ParsedFee,
  parseDate,
  parseMoney,
  pushFee,
  readTable,
  rowKey,
} from "./parse";

const SPEC = {
  date: { names: ["Date of sale", "Date", "Sale Date", "Sold Date"], required: true },
  buyer: { names: ["Buyer", "Buyer Username"] },
  description: { names: ["Description", "Item Description", "Item"] },
  sku: { names: ["SKU"] },
  quantity: { names: ["Quantity"] },
  itemPrice: { names: ["Item price", "Item Price", "Price"], required: true },
  shipping: { names: ["Buyer shipping cost", "Shipping", "Shipping Price", "Postage"] },
  labelCost: {
    names: ["USPS Cost", "Shipping label cost", "Seller shipping cost", "Depop shipping label"],
  },
  salesTax: { names: ["Sales tax", "Sales Tax", "Tax"] },
  paymentFee: { names: ["Depop Payments fee", "Depop Payments Fee", "Payment fee", "PayPal fee"] },
  sellingFee: { names: ["Depop fee", "Selling fee", "Depop Selling Fee"] },
  boostingFee: { names: ["Boosting fee", "Boosted listing fee", "Boosting Fee"] },
  refund: { names: ["Refunded", "Refund amount", "Refund"] },
  net: { names: ["Total", "Net", "Net earnings", "You earned"] },
  orderId: { names: ["Order ID", "Transaction ID", "Order number"] },
} as const;

type Field = keyof typeof SPEC;

export function parseDepopSales(text: string): ImportParseResult {
  const out = emptyResult("depop", "sales_download");
  const table = readTable<Field>(text, SPEC, "Depop sales download");
  const col = (f: Field) => table.matched[f];
  out.rowCount = table.rows.length;
  for (const row of table.rows) {
    try {
      const date = parseDate(row.get("date"));
      if (!date) {
        out.skipped.push({ line: row.line, reason: `Unreadable date "${row.get("date") ?? ""}"` });
        continue;
      }
      const fees: ParsedFee[] = [];
      pushFee(fees, "payment_processing", row.get("paymentFee"), col("paymentFee"));
      pushFee(fees, "commission", row.get("sellingFee"), col("sellingFee"));
      pushFee(fees, "advertising", row.get("boostingFee"), col("boostingFee"));
      const orderId = row.get("orderId") || null;
      const title = row.get("description") || null;
      const item = abs(parseMoney(row.get("itemPrice"))) ?? 0;
      const net = parseMoney(row.get("net"));
      const ext =
        orderId ?? rowKey(date, row.get("buyer"), title, row.get("itemPrice"), row.get("net"));
      out.sales.push({
        kind: "order",
        externalId: ext,
        orderId,
        date,
        title,
        sku: row.get("sku") || null,
        quantity: Math.max(1, Number.parseInt(row.get("quantity") ?? "1", 10) || 1),
        itemCents: item,
        shippingChargedCents: abs(parseMoney(row.get("shipping"))) ?? 0,
        salesTaxCents: abs(parseMoney(row.get("salesTax"))) ?? 0,
        refundCents: 0,
        shippingLabelCents: abs(parseMoney(row.get("labelCost"))) ?? 0,
        netCents: net,
        fees,
      });
      const refund = abs(parseMoney(row.get("refund")));
      if (refund) {
        out.sales.push({
          kind: "refund",
          externalId: `${ext}:refund`,
          orderId,
          date,
          title,
          sku: row.get("sku") || null,
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
          `Line ${row.line}: refund recorded on the sale date (the download has no separate refund date).`,
        );
      }
    } catch (e) {
      out.skipped.push({ line: row.line, reason: (e as Error).message });
    }
  }
  return out;
}
