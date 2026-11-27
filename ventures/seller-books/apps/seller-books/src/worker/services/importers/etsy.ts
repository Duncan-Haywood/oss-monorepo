// Etsy: two files work together (docs/IMPORTERS.md#etsy).
//  - Shop Manager > Settings > Options > Download Data > Orders ("EtsySoldOrders*.csv"): one row = one
//    order, with Card Processing Fees. Gives the sales.
//  - Shop Manager > Finances > Payment account > monthly statement CSV: one row = one ledger entry (Sale,
//    Fee, Marketing, Shipping, Refund, Tax, Deposit...). Gives Etsy's other fees (transaction, listing,
//    ads), postage and refunds. Its Sale rows and its processing-fee rows are skipped because the Orders
//    file already holds them (importing both would double count).
import type { ChargeKind } from "@shared/enums";
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

const ORDERS_SPEC = {
  saleDate: { names: ["Sale Date"], required: true },
  orderId: { names: ["Order ID"], required: true },
  items: { names: ["Number of Items"] },
  orderValue: { names: ["Order Value"], required: true },
  discount: { names: ["Discount Amount"] },
  shippingDiscount: { names: ["Shipping Discount"] },
  shipping: { names: ["Shipping"] },
  salesTax: { names: ["Sales Tax"] },
  orderTotal: { names: ["Order Total"] },
  currency: { names: ["Currency"] },
  status: { names: ["Status"] },
  cardFees: { names: ["Card Processing Fees"] },
  orderNet: { names: ["Order Net"] },
  sku: { names: ["SKU"] },
} as const;

export function parseEtsySoldOrders(text: string): ImportParseResult {
  const out = emptyResult("etsy", "sold_orders");
  const table = readTable<keyof typeof ORDERS_SPEC>(
    text,
    ORDERS_SPEC,
    "Etsy Orders (EtsySoldOrders) file",
  );
  out.rowCount = table.rows.length;
  for (const row of table.rows) {
    try {
      const currency = row.get("currency");
      if (currency && currency.toUpperCase() !== "USD") {
        out.skipped.push({
          line: row.line,
          reason: `Currency ${currency} (only USD is supported)`,
        });
        continue;
      }
      const date = parseDate(row.get("saleDate"));
      if (!date) {
        out.skipped.push({
          line: row.line,
          reason: `Unreadable date "${row.get("saleDate") ?? ""}"`,
        });
        continue;
      }
      if (/cancel/i.test(row.get("status") ?? "")) {
        out.skipped.push({ line: row.line, reason: "Cancelled order" });
        continue;
      }
      const fees: ParsedFee[] = [];
      pushFee(fees, "payment_processing", row.get("cardFees"), table.matched.cardFees);
      const value = abs(parseMoney(row.get("orderValue"))) ?? 0;
      const discount = abs(parseMoney(row.get("discount"))) ?? 0;
      const shipping = abs(parseMoney(row.get("shipping"))) ?? 0;
      const shipDiscount = abs(parseMoney(row.get("shippingDiscount"))) ?? 0;
      const orderId = row.get("orderId") ?? "";
      out.sales.push({
        kind: "order",
        externalId: orderId,
        orderId,
        date,
        title: `Etsy order ${orderId}`,
        sku: row.get("sku") || null,
        quantity: Math.max(1, Number.parseInt(row.get("items") ?? "1", 10) || 1),
        itemCents: Math.max(0, value - discount),
        shippingChargedCents: Math.max(0, shipping - shipDiscount),
        salesTaxCents: abs(parseMoney(row.get("salesTax"))) ?? 0,
        refundCents: 0,
        shippingLabelCents: 0, // postage comes from the payment account statement
        netCents: parseMoney(row.get("orderNet")),
        fees,
      });
    } catch (e) {
      out.skipped.push({ line: row.line, reason: (e as Error).message });
    }
  }
  return out;
}

const STATEMENT_SPEC = {
  date: { names: ["Date"], required: true },
  type: { names: ["Type"], required: true },
  title: { names: ["Title"], required: true },
  info: { names: ["Info"] },
  currency: { names: ["Currency"] },
  amount: { names: ["Amount"] },
  fees: { names: ["Fees & Taxes", "Fees and Taxes"] },
  net: { names: ["Net"], required: true },
} as const;

function feeKindForTitle(title: string): ChargeKind | "skip" {
  const t = title.toLowerCase();
  if (/processing fee/.test(t)) return "skip"; // already on the Orders file (Card Processing Fees)
  if (/listing|renew/.test(t)) return "listing";
  if (/transaction fee/.test(t)) return "transaction";
  if (/offsite|etsy ads|ads fee|advert/.test(t)) return "advertising";
  if (/regulatory/.test(t)) return "regulatory";
  if (/subscription|plus|pattern/.test(t)) return "subscription";
  if (/label|postage|shipping/.test(t)) return "shipping_label";
  return "other";
}

export function parseEtsyStatement(text: string): ImportParseResult {
  const out = emptyResult("etsy", "payment_statement");
  const table = readTable<keyof typeof STATEMENT_SPEC>(
    text,
    STATEMENT_SPEC,
    "Etsy payment account statement",
  );
  out.rowCount = table.rows.length;
  let processingSkipped = 0;
  for (const row of table.rows) {
    try {
      const currency = row.get("currency");
      if (currency && currency.toUpperCase() !== "USD") {
        out.skipped.push({
          line: row.line,
          reason: `Currency ${currency} (only USD is supported)`,
        });
        continue;
      }
      const date = parseDate(row.get("date"));
      if (!date) {
        out.skipped.push({ line: row.line, reason: `Unreadable date "${row.get("date") ?? ""}"` });
        continue;
      }
      const type = (row.get("type") ?? "").toLowerCase();
      const title = row.get("title") ?? "";
      const info = row.get("info") || null;
      // Net is the reliable signed column; fall back to Fees & Taxes, then Amount.
      const value =
        parseMoney(row.get("net")) ?? parseMoney(row.get("fees")) ?? parseMoney(row.get("amount"));
      const ext = rowKey(
        date,
        type,
        title,
        info,
        row.get("amount"),
        row.get("fees"),
        row.get("net"),
      );
      if (type === "sale" || type === "deposit" || type === "payment" || type === "tax") {
        out.skipped.push({
          line: row.line,
          reason:
            type === "sale"
              ? "Sale row (sales come from the Orders file)"
              : type === "tax"
                ? "Sales tax collected and remitted by Etsy"
                : "Money movement, not income",
        });
        continue;
      }
      if (value == null || value === 0) {
        out.skipped.push({ line: row.line, reason: "No amount" });
        continue;
      }
      if (type === "refund") {
        out.sales.push({
          kind: "refund",
          externalId: `${ext}:refund`,
          orderId: `${title} ${info ?? ""}`.match(/order\s*#?\s*(\d+)/i)?.[1] ?? null,
          date,
          title,
          sku: null,
          quantity: 1,
          itemCents: 0,
          shippingChargedCents: 0,
          salesTaxCents: 0,
          refundCents: Math.abs(value),
          shippingLabelCents: 0,
          netCents: value,
          fees: [],
        });
        continue;
      }
      const kind: ChargeKind | "skip" =
        type === "shipping" || type === "shipping label"
          ? "shipping_label"
          : type === "marketing"
            ? "advertising"
            : feeKindForTitle(title);
      if (kind === "skip") {
        processingSkipped++;
        out.skipped.push({ line: row.line, reason: "Processing fee (already in the Orders file)" });
        continue;
      }
      out.charges.push({
        externalId: ext,
        date,
        kind,
        amountCents: -value,
        orderId: `${title} ${info ?? ""}`.match(/order\s*#?\s*(\d+)/i)?.[1] ?? null,
        description: [title, info].filter(Boolean).join(" · "),
      });
    } catch (e) {
      out.skipped.push({ line: row.line, reason: (e as Error).message });
    }
  }
  if (processingSkipped) {
    out.warnings.push(
      `${processingSkipped} processing-fee rows were skipped: import the Orders file for the same months to count them.`,
    );
  }
  return out;
}
