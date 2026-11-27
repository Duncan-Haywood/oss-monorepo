// Whatnot "Seller Weekly Orders Report" (Seller Hub > Financials > Statements, one CSV per week).
// docs/IMPORTERS.md#whatnot.
//
// Column names, transaction types and their meanings are Whatnot's own ("Seller Weekly Orders Report",
// help article 36772664621837, "Metric Definitions", read 2026-11-26 through the help centre's public
// article API). The rules that follow from it:
//  - One row is one transaction. Its Transaction Type is Order Earnings, Order Refund, Tips or Shipping
//    Charge; a refund is a second row with the same Order ID, in the week the refund completed.
//  - Only completed transactions are in the report (pending, failed and cancelled orders are not), and
//    Whatnot's statements count a transaction in the month it completed (article 44413003987981). So every
//    row is dated by "Transaction Completed at UTC". That is a UTC timestamp; the books keep its UTC date.
//  - "Transaction Amount" is what reached (or left) the seller's balance. For Order Earnings it is the sale
//    price minus commission, payment processing and seller-paid shipping, so it is the row's net.
//  - The sale price is "Post Coupon Price" (after the seller's own coupons; commission is charged on it).
//    "Buyer Paid" adds buyer-paid shipping and taxes, which Whatnot collects and spends itself, so neither
//    is the seller's income and the column is not read.
// Older or third-party spellings (UPPER_SNAKE "ORDER_ID", "Total Earnings", "Sold Price") are still
// accepted as fallbacks; matching ignores case and punctuation.
import {
  abs,
  emptyResult,
  type ImportParseResult,
  normHeader,
  type ParsedFee,
  parseDate,
  parseMoney,
  pushFee,
  readTable,
  rowKey,
  sumFees,
} from "./parse";

const SPEC = {
  type: { names: ["Transaction Type", "Type"], required: true },
  completed: {
    names: ["Transaction Completed at UTC", "Transaction Completed At", "Transaction Date"],
  },
  placed: { names: ["Order Placed At UTC", "Order Placed At", "Order Date"] },
  amount: {
    names: ["Transaction Amount", "Total Earnings", "Net Earnings", "Net Amount"],
    required: true,
  },
  currency: { names: ["Transaction Currency", "Currency"] },
  ledgerId: { names: ["Ledger Transaction ID", "Transaction ID"] },
  orderId: { names: ["Order ID", "Order Id"] },
  shipmentId: { names: ["Shipment ID"] },
  message: { names: ["Transaction Message"] },
  title: { names: ["Listing Title", "Product Name", "Item Name"] },
  buyFormat: { names: ["Buy Format"] },
  sku: { names: ["SKU"] },
  quantity: { names: ["Quantity Sold", "Quantity"] },
  postCouponPrice: { names: ["Post Coupon Price"] },
  originalPrice: { names: ["Original Item Price", "Sold Price", "Item Price"] },
  couponCost: { names: ["Coupon Cost"] },
  sellerShipping: { names: ["Shipping Fee"] },
  commission: { names: ["Commission Fee"] },
  processing: { names: ["Payment Processing Fee"] },
  commissionTax: { names: ["Tax on Commission", "Tax On Commission Fee"] },
  processingTax: { names: ["Tax on Payment Processing Fee"] },
} as const;

type Field = keyof typeof SPEC;

/** Transaction types by normalised name: "Order Earnings" and "ORDER_EARNINGS" -> "orderearnings". */
const TYPES = {
  orderearnings: "order",
  orderrefund: "refund",
  tips: "tip",
  tip: "tip",
  shippingcharge: "shipping",
} as const;

export function parseWhatnotOrdersReport(text: string): ImportParseResult {
  const out = emptyResult("whatnot", "weekly_orders_report");
  const table = readTable<Field>(text, SPEC, "Whatnot Seller Weekly Orders Report");
  const col = (f: Field) => table.matched[f];
  out.rowCount = table.rows.length;
  if (!table.matched.completed) {
    out.warnings.push(
      table.matched.placed
        ? 'No "Transaction Completed at UTC" column: rows are dated by when the order was placed instead.'
        : 'No "Transaction Completed at UTC" column: rows without a date are skipped.',
    );
  }
  let nonUsd = 0;
  for (const row of table.rows) {
    try {
      const rawType = row.get("type") ?? "";
      const type = TYPES[normHeader(rawType) as keyof typeof TYPES];
      if (!type) {
        out.skipped.push({
          line: row.line,
          reason: `Transaction type "${rawType}" is not one this report defines`,
        });
        continue;
      }
      const currency = row.get("currency");
      if (currency && currency.toUpperCase() !== "USD") {
        nonUsd++;
        out.skipped.push({
          line: row.line,
          reason: `Currency ${currency} (only USD is supported)`,
        });
        continue;
      }
      const dateText = row.get("completed") || row.get("placed") || "";
      const date = parseDate(dateText);
      if (!date) {
        out.skipped.push({ line: row.line, reason: `Unreadable date "${dateText}"` });
        continue;
      }
      const amount = parseMoney(row.get("amount"));
      if (amount == null) {
        out.skipped.push({ line: row.line, reason: `${rawType} row with no Transaction Amount` });
        continue;
      }
      const orderId = row.get("orderId") || null;
      const shipmentId = row.get("shipmentId") || null;
      const ext =
        row.get("ledgerId") || rowKey(orderId, rawType, dateText, row.get("amount"), shipmentId);

      if (type === "shipping") {
        // Label adjustments and bring-your-own-label costs, charged per shipment after the sale.
        out.charges.push({
          externalId: `${ext}:charge`,
          date,
          kind: "shipping_label",
          amountCents: -amount,
          orderId,
          description:
            [rawType, row.get("message"), shipmentId && `shipment ${shipmentId}`]
              .filter(Boolean)
              .join(": ") || null,
        });
        continue;
      }

      if (type === "refund") {
        // The amount is what the refund took from the balance. The report does not say how it splits
        // between the item, shipping and any fee credit, so it is booked whole as the refund.
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
          refundCents: Math.abs(amount),
          shippingLabelCents: 0,
          netCents: amount,
          fees: [],
        });
        continue;
      }

      // Order Earnings and Tips.
      const fees: ParsedFee[] = [];
      pushFee(fees, "commission", row.get("commission"), col("commission"));
      pushFee(fees, "payment_processing", row.get("processing"), col("processing"));
      pushFee(fees, "other", row.get("commissionTax"), col("commissionTax"));
      pushFee(fees, "other", row.get("processingTax"), col("processingTax"));
      const sellerShip = abs(parseMoney(row.get("sellerShipping"))) ?? 0;
      let price = abs(parseMoney(row.get("postCouponPrice")));
      if (price == null) {
        const original = abs(parseMoney(row.get("originalPrice")));
        if (original != null) price = original - (abs(parseMoney(row.get("couponCost"))) ?? 0);
      }
      if (price == null) {
        // A tip (or a trimmed file) with no price columns: the amount plus its fees is the income.
        price = amount + sumFees(fees) + sellerShip;
      } else if (price - sumFees(fees) - sellerShip !== amount) {
        out.warnings.push(
          `Line ${row.line}: sale price − fees − seller-paid shipping ≠ Transaction Amount (check the row in Seller Hub).`,
        );
      }
      const giveaway = /giveaway/i.test(row.get("buyFormat") ?? "");
      out.sales.push({
        kind: "order",
        externalId: ext,
        orderId,
        date,
        title: row.get("title") || (type === "tip" ? "Tip" : giveaway ? "Giveaway" : null),
        sku: row.get("sku") || null,
        quantity: Math.max(1, Number.parseInt(row.get("quantity") ?? "1", 10) || 1),
        itemCents: price,
        // Buyer-paid shipping goes to Whatnot, which buys the label: neither income nor cost here.
        shippingChargedCents: 0,
        // Buyer-paid tax is collected by Whatnot and is not in the seller's amount.
        salesTaxCents: 0,
        refundCents: 0,
        shippingLabelCents: sellerShip,
        netCents: amount,
        fees,
      });
    } catch (e) {
      out.skipped.push({ line: row.line, reason: (e as Error).message });
    }
  }
  if (nonUsd > 0) out.warnings.push(`${nonUsd} non-USD rows were skipped.`);
  return out;
}
