// Whatnot "Seller Weekly Orders Report" (Seller Hub). One row = one transaction; a refund is a second row
// with the same order id. Headers have been seen both as Title Case ("Commission Fee") and as
// UPPER_SNAKE ("ORDER_ID"); matching ignores case and underscores, so both work. docs/IMPORTERS.md#whatnot.
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
  orderId: { names: ["Order ID", "ORDER_ID", "Order Id"], required: true },
  type: { names: ["Transaction Type", "TRANSACTION_TYPE", "Type"] },
  date: {
    names: [
      "Transaction Date",
      "Order Date",
      "TRANSACTION_DATE",
      "ORDER_DATE",
      "Date",
      "Created At",
    ],
    required: true,
  },
  title: { names: ["Product Name", "PRODUCT_NAME", "Listing Title", "Item Name", "Title"] },
  sku: { names: ["SKU"] },
  quantity: { names: ["Quantity", "QUANTITY"] },
  price: {
    names: [
      "Sold Price",
      "SOLD_PRICE",
      "Item Price",
      "ITEM_PRICE",
      "Subtotal",
      "Order Amount",
      "Sale Price",
    ],
    required: true,
  },
  shipping: { names: ["Shipping Charge", "SHIPPING_CHARGE", "Shipping"] },
  salesTax: { names: ["Sales Tax", "SALES_TAX", "Tax"] },
  commission: { names: ["Commission Fee", "COMMISSION_FEE", "Commission"] },
  commissionTax: { names: ["Tax On Commission Fee", "TAX_ON_COMMISSION_FEE"] },
  processing: {
    names: ["Payment Processing Fee", "PAYMENT_PROCESSING_FEE", "Processing Fee"],
  },
  net: {
    names: [
      "Total Earnings",
      "TOTAL_EARNINGS",
      "Net Earnings",
      "Seller Earnings",
      "Net Amount",
      "Payout Amount",
    ],
  },
  transactionId: { names: ["Transaction ID", "TRANSACTION_ID"] },
} as const;

type Field = keyof typeof SPEC;

export function parseWhatnotOrdersReport(text: string): ImportParseResult {
  const out = emptyResult("whatnot", "weekly_orders_report");
  const table = readTable<Field>(text, SPEC, "Whatnot orders report");
  const col = (f: Field) => table.matched[f];
  out.rowCount = table.rows.length;
  if (!table.matched.commission && !table.matched.net) {
    out.warnings.push("No commission or earnings column found: fees for this file are unknown.");
  }
  for (const row of table.rows) {
    try {
      const date = parseDate(row.get("date"));
      if (!date) {
        out.skipped.push({ line: row.line, reason: `Unreadable date "${row.get("date") ?? ""}"` });
        continue;
      }
      const type = (row.get("type") ?? "").toLowerCase();
      const orderId = row.get("orderId") || null;
      const price = parseMoney(row.get("price")) ?? 0;
      const net = parseMoney(row.get("net"));
      const isRefund = /refund|return|chargeback/.test(type) || price < 0;
      const ext =
        row.get("transactionId") || rowKey(orderId, type, date, row.get("price"), row.get("net"));
      const fees: ParsedFee[] = [];
      const sign = isRefund ? -1 : 1;
      pushFee(fees, "commission", row.get("commission"), col("commission"), sign);
      pushFee(fees, "other", row.get("commissionTax"), col("commissionTax"), sign);
      pushFee(fees, "payment_processing", row.get("processing"), col("processing"), sign);
      if (isRefund) {
        out.sales.push({
          kind: "refund",
          externalId: `${ext}:refund`,
          orderId,
          date,
          title: row.get("title") || null,
          sku: row.get("sku") || null,
          quantity: 1,
          itemCents: 0,
          shippingChargedCents: 0,
          salesTaxCents: 0,
          refundCents: Math.abs(price),
          shippingLabelCents: 0,
          netCents: net,
          fees,
        });
        continue;
      }
      out.sales.push({
        kind: "order",
        externalId: ext,
        orderId,
        date,
        title: row.get("title") || (/tip/.test(type) ? "Tip" : null),
        sku: row.get("sku") || null,
        quantity: Math.max(1, Number.parseInt(row.get("quantity") ?? "1", 10) || 1),
        itemCents: price,
        // Whatnot buyers pay shipping to Whatnot, which buys the label: income and cost cancel out.
        shippingChargedCents: abs(parseMoney(row.get("shipping"))) ?? 0,
        salesTaxCents: abs(parseMoney(row.get("salesTax"))) ?? 0,
        refundCents: 0,
        shippingLabelCents: abs(parseMoney(row.get("shipping"))) ?? 0,
        netCents: net,
        fees,
      });
    } catch (e) {
      out.skipped.push({ line: row.line, reason: (e as Error).message });
    }
  }
  return out;
}
