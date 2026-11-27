// eBay Seller Hub > Payments > Reports > "Transaction report" (CSV). One row = one ledger entry: Order,
// Refund, Shipping label, Other fee, Claim, Payout, Charge, Adjustment, Hold... Fees are itemised per order
// row. The file starts with a few preamble lines and columns are customisable, so headers are matched by
// name (docs/IMPORTERS.md#ebay).
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
  date: { names: ["Transaction creation date", "Transaction date", "Date"], required: true },
  type: { names: ["Type", "Transaction type"], required: true },
  orderNumber: { names: ["Order number", "Order ID"] },
  legacyOrderId: { names: ["Legacy order ID"] },
  title: { names: ["Item title", "Title"] },
  customLabel: { names: ["Custom label", "Custom label (SKU)", "SKU"] },
  quantity: { names: ["Quantity"] },
  itemSubtotal: { names: ["Item subtotal"] },
  shipping: { names: ["Shipping and handling", "Postage and packaging"] },
  sellerTax: { names: ["Seller collected tax"] },
  ebayTax: { names: ["eBay collected tax"] },
  fvfFixed: { names: ["Final Value Fee - fixed", "Final value fee fixed"] },
  fvfVariable: { names: ["Final Value Fee - variable", "Final value fee variable"] },
  regulatory: { names: ["Regulatory operating fee"] },
  inad: { names: ['Very high "item not as described" fee', "Very high item not as described fee"] },
  belowStandard: { names: ["Below standard performance fee"] },
  international: { names: ["International fee"] },
  gross: { names: ["Gross transaction amount"] },
  net: { names: ["Net amount"], required: true },
  description: { names: ["Description"] },
  itemId: { names: ["Item ID"] },
  transactionId: { names: ["Transaction ID"] },
  referenceId: { names: ["Reference ID"] },
  currency: { names: ["Transaction currency", "Currency"] },
} as const;

type Field = keyof typeof SPEC;

export function parseEbayTransactionReport(text: string): ImportParseResult {
  const out = emptyResult("ebay", "transaction_report");
  const table = readTable<Field>(text, SPEC, "eBay Transaction report");
  const col = (f: Field) => table.matched[f];
  out.rowCount = table.rows.length;
  let nonUsd = 0;
  for (const row of table.rows) {
    try {
      const type = (row.get("type") ?? "").toLowerCase();
      const date = parseDate(row.get("date"));
      if (!date) {
        out.skipped.push({ line: row.line, reason: `Unreadable date "${row.get("date") ?? ""}"` });
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
      const orderId = row.get("orderNumber") || row.get("legacyOrderId") || null;
      const net = parseMoney(row.get("net"));
      const description = row.get("description") || null;
      const ext =
        row.get("transactionId") ||
        rowKey(type, date, orderId, row.get("itemId"), row.get("referenceId"), net, description);

      if (type === "payout" || type === "transfer" || type === "hold") {
        out.skipped.push({
          line: row.line,
          reason: `${row.get("type")} row (money movement, not income)`,
        });
        continue;
      }
      if (type === "order") {
        const fees: ParsedFee[] = [];
        pushFee(fees, "final_value", row.get("fvfVariable"), col("fvfVariable"));
        pushFee(fees, "per_order", row.get("fvfFixed"), col("fvfFixed"));
        pushFee(fees, "regulatory", row.get("regulatory"), col("regulatory"));
        pushFee(fees, "international", row.get("international"), col("international"));
        pushFee(fees, "other", row.get("inad"), col("inad"));
        pushFee(fees, "other", row.get("belowStandard"), col("belowStandard"));
        out.sales.push({
          kind: "order",
          externalId: `${ext}:order`,
          orderId,
          date,
          title: row.get("title") || null,
          sku: row.get("customLabel") || null,
          quantity: Math.max(1, Number.parseInt(row.get("quantity") ?? "1", 10) || 1),
          itemCents: abs(parseMoney(row.get("itemSubtotal"))) ?? 0,
          shippingChargedCents: abs(parseMoney(row.get("shipping"))) ?? 0,
          salesTaxCents:
            (abs(parseMoney(row.get("ebayTax"))) ?? 0) +
            (abs(parseMoney(row.get("sellerTax"))) ?? 0),
          refundCents: 0,
          shippingLabelCents: 0,
          netCents: net,
          fees,
        });
        continue;
      }
      if (type === "refund" || type === "claim") {
        // Money back to the buyer; eBay credits part of the fees back on the same row.
        const fees: ParsedFee[] = [];
        pushFee(fees, "final_value", row.get("fvfVariable"), col("fvfVariable"), -1);
        pushFee(fees, "per_order", row.get("fvfFixed"), col("fvfFixed"), -1);
        pushFee(fees, "regulatory", row.get("regulatory"), col("regulatory"), -1);
        pushFee(fees, "international", row.get("international"), col("international"), -1);
        const gross = abs(parseMoney(row.get("gross")));
        const taxBack =
          (abs(parseMoney(row.get("ebayTax"))) ?? 0) + (abs(parseMoney(row.get("sellerTax"))) ?? 0);
        out.sales.push({
          kind: "refund",
          externalId: `${ext}:refund`,
          orderId,
          date,
          title: row.get("title") || description,
          sku: row.get("customLabel") || null,
          quantity: 1,
          itemCents: 0,
          shippingChargedCents: 0,
          salesTaxCents: 0,
          // Sales tax refunded goes back through eBay, not the seller: exclude it from the refund.
          refundCents: Math.max(0, (gross ?? abs(net) ?? 0) - taxBack),
          shippingLabelCents: 0,
          netCents: net,
          fees,
        });
        continue;
      }
      if (net == null || net === 0) {
        out.skipped.push({ line: row.line, reason: `${row.get("type")} row with no amount` });
        continue;
      }
      // Shipping label, Other fee, Charge, Adjustment...: the net amount is the charge (negative = cost).
      const label = `${row.get("type") ?? ""} ${description ?? ""}`.toLowerCase();
      const kind = type.includes("shipping label")
        ? ("shipping_label" as const)
        : /promot|advert|ad fee/.test(label)
          ? ("advertising" as const)
          : /subscription|store/.test(label)
            ? ("subscription" as const)
            : ("other" as const);
      out.charges.push({
        externalId: `${ext}:charge`,
        date,
        kind,
        amountCents: -net,
        orderId,
        description: [row.get("type"), description].filter(Boolean).join(": ") || null,
      });
    } catch (e) {
      out.skipped.push({ line: row.line, reason: (e as Error).message });
    }
  }
  if (nonUsd) out.warnings.push(`${nonUsd} non-USD rows were skipped.`);
  return out;
}
