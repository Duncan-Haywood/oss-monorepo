// Poshmark "My Sales Report" (Account > My Sales Report, emailed CSV). One row = one listing sold (bundles
// give several rows with the same order id). The report gives the order price and the seller's net
// earnings but does not itemise Poshmark's fee, so the difference is stored as one `marketplace_fee`
// (derived from the report, never from an assumed rate). docs/IMPORTERS.md#poshmark.
import {
  abs,
  emptyResult,
  type ImportParseResult,
  type ParsedFee,
  parseDate,
  parseMoney,
  readTable,
  rowKey,
} from "./parse";

const SPEC = {
  orderDate: { names: ["Order Date", "Sold Date", "Date Sold"], required: true },
  orderId: { names: ["Order Id", "Order ID", "Order Number"] },
  title: { names: ["Listing Title", "Title", "Item Title"] },
  sku: { names: ["SKU", "Sku"] },
  orderPrice: { names: ["Order Price", "Listing Price Sold", "Sold Price"], required: true },
  shippingDiscount: { names: ["Seller Shipping Discount"] },
  upgradedShipping: { names: ["Upgraded Shipping Label Fee", "Seller Paid Shipping"] },
  texasFeeTax: { names: ["Texas Seller Fee Tax"] },
  netEarnings: { names: ["Net Earnings", "Your Earnings", "Earnings"], required: true },
  salesTax: { names: ["Sales Tax", "Sales Tax (Paid by Buyer)"] },
  status: { names: ["Order Status", "Status"] },
} as const;

type Field = keyof typeof SPEC;

export function parsePoshmarkSalesReport(text: string): ImportParseResult {
  const out = emptyResult("poshmark", "my_sales_report");
  const table = readTable<Field>(text, SPEC, "Poshmark My Sales Report");
  out.rowCount = table.rows.length;
  const seenPerOrder = new Map<string, number>();
  for (const row of table.rows) {
    try {
      const date = parseDate(row.get("orderDate"));
      if (!date) {
        out.skipped.push({
          line: row.line,
          reason: `Unreadable date "${row.get("orderDate") ?? ""}"`,
        });
        continue;
      }
      const status = (row.get("status") ?? "").toLowerCase();
      if (/cancel/.test(status)) {
        out.skipped.push({ line: row.line, reason: "Cancelled order" });
        continue;
      }
      const price = abs(parseMoney(row.get("orderPrice"))) ?? 0;
      const net = parseMoney(row.get("netEarnings"));
      if (net == null) {
        out.skipped.push({ line: row.line, reason: "No net earnings" });
        continue;
      }
      const shipDiscount = abs(parseMoney(row.get("shippingDiscount"))) ?? 0;
      const upgraded = abs(parseMoney(row.get("upgradedShipping"))) ?? 0;
      const texas = abs(parseMoney(row.get("texasFeeTax"))) ?? 0;
      const fees: ParsedFee[] = [];
      if (texas)
        fees.push({ kind: "other", amountCents: texas, sourceColumn: "Texas Seller Fee Tax" });
      // Whatever the report does not explain between price and net is Poshmark's fee.
      const derived = price - shipDiscount - upgraded - texas - net;
      if (derived !== 0) {
        fees.push({
          kind: "marketplace_fee",
          amountCents: derived,
          sourceColumn: "Order Price − Net Earnings (derived)",
        });
      }
      const orderId = row.get("orderId") || null;
      const title = row.get("title") || null;
      const n = (seenPerOrder.get(orderId ?? "") ?? 0) + 1;
      seenPerOrder.set(orderId ?? "", n);
      out.sales.push({
        kind: "order",
        externalId: orderId ? `${orderId}:${n}:${title ?? ""}` : rowKey(date, title, price, net),
        orderId,
        date,
        title,
        sku: row.get("sku") || null,
        quantity: 1,
        itemCents: price,
        shippingChargedCents: 0, // Poshmark's buyer-paid shipping never reaches the seller.
        salesTaxCents: abs(parseMoney(row.get("salesTax"))) ?? 0,
        refundCents: 0,
        shippingLabelCents: shipDiscount + upgraded,
        netCents: net,
        fees,
      });
    } catch (e) {
      out.skipped.push({ line: row.line, reason: (e as Error).message });
    }
  }
  return out;
}
