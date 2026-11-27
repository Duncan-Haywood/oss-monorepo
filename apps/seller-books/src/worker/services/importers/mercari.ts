// Mercari (US) sales report CSV (Sales > Download sales report). One row = one item sold. Fees are
// itemised (selling fee, payment processing on older listings, shipping adjustment). docs/IMPORTERS.md#mercari.
import {
  abs,
  emptyResult,
  type ImportParseResult,
  type ParsedFee,
  parseDate,
  parseMoney,
  pushFee,
  readTable,
  sumFees,
} from "./parse";

const SPEC = {
  itemId: { names: ["Item Id", "Item ID"], required: true },
  soldDate: { names: ["Sold Date", "Sale Date"], required: true },
  completedDate: { names: ["Completed Date"] },
  status: { names: ["Order Status", "Status"] },
  title: { names: ["Item Title", "Item Name", "Title"] },
  itemPrice: { names: ["Item Price", "Price"], required: true },
  buyerShipping: { names: ["Buyer Shipping Fee", "Shipping Fee Paid by Buyer"] },
  sellerShipping: { names: ["Seller Shipping Fee", "Shipping Fee Paid by Seller"] },
  sellingFee: { names: ["Mercari Selling Fee", "Mercari Selling Fees", "Selling Fee"] },
  processingFee: {
    names: [
      "Payment Processing Fee",
      "Payment Processing Fees",
      "Payment Processing Fee Charged To Seller",
    ],
  },
  shippingAdjustment: { names: ["Shipping Adjustment Fee", "Shipping Adjustment Fees"] },
  salesTax: { names: ["Sales Tax Charged to Buyer", "Sales Tax"] },
  net: { names: ["Net Seller Proceeds", "Net Proceeds"], required: true },
} as const;

type Field = keyof typeof SPEC;

export function parseMercariSalesReport(text: string): ImportParseResult {
  const out = emptyResult("mercari", "sales_report");
  const table = readTable<Field>(text, SPEC, "Mercari sales report");
  const col = (f: Field) => table.matched[f];
  out.rowCount = table.rows.length;
  for (const row of table.rows) {
    try {
      const status = (row.get("status") ?? "").toLowerCase();
      if (/cancel/.test(status)) {
        out.skipped.push({ line: row.line, reason: "Cancelled order" });
        continue;
      }
      const date = parseDate(row.get("soldDate"));
      if (!date) {
        out.skipped.push({
          line: row.line,
          reason: `Unreadable date "${row.get("soldDate") ?? ""}"`,
        });
        continue;
      }
      const fees: ParsedFee[] = [];
      pushFee(fees, "commission", row.get("sellingFee"), col("sellingFee"));
      pushFee(fees, "payment_processing", row.get("processingFee"), col("processingFee"));
      pushFee(fees, "other", row.get("shippingAdjustment"), col("shippingAdjustment"));
      const item = abs(parseMoney(row.get("itemPrice"))) ?? 0;
      const buyerShip = abs(parseMoney(row.get("buyerShipping"))) ?? 0;
      const sellerShip = abs(parseMoney(row.get("sellerShipping"))) ?? 0;
      const net = parseMoney(row.get("net"));
      if (net != null && fees.length === 0) {
        // Older or trimmed exports: keep the reconciliation honest with one derived fee.
        const derived = item - sellerShip - net;
        if (derived !== 0)
          fees.push({
            kind: "marketplace_fee",
            amountCents: derived,
            sourceColumn: "Price − Net (derived)",
          });
      }
      if (net != null && sumFees(fees) !== item - sellerShip - net) {
        out.warnings.push(
          `Line ${row.line}: item − fees − seller-paid shipping ≠ net proceeds (check promotions or adjustments).`,
        );
      }
      const itemId = row.get("itemId") ?? "";
      out.sales.push({
        kind: "order",
        externalId: itemId,
        orderId: itemId,
        date,
        title: row.get("title") || null,
        sku: null,
        quantity: 1,
        itemCents: item,
        shippingChargedCents: buyerShip,
        salesTaxCents: abs(parseMoney(row.get("salesTax"))) ?? 0,
        refundCents: 0,
        shippingLabelCents: sellerShip + buyerShip, // Mercari buys the label with the shipping money.
        netCents: net,
        fees,
      });
    } catch (e) {
      out.skipped.push({ line: row.line, reason: (e as Error).message });
    }
  }
  return out;
}
