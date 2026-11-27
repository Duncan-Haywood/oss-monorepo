// Shopify: two files work together, like Etsy's (docs/IMPORTERS.md#shopify). Both column lists are from
// Shopify's own help pages, read 2026-11-26:
//  - Orders > Export ("orders_export*.csv"), help.shopify.com/en/manual/fulfillment/managing-orders/
//    exporting-orders: one row per line item. "Orders with multiple line items display their additional
//    line items on separate lines. Many of the fields are left blank", so the order's totals sit on its first
//    row only. Gives the sales, and the refunded amount (dated by the order, since the export has no refund
//    date).
//  - Finance > Payouts > View transactions > Export, help.shopify.com/en/manual/payments/shopify-payments/
//    payouts/view-details ("Transaction CSV file columns"): one row per Shopify Payments balance transaction
//    (charge, refund, chargeback, adjustment...). Gives the processing fee on each charge, chargebacks,
//    adjustments and Shopify bills paid from the balance. Its charge and refund amounts are skipped because
//    the orders export already holds them (importing both would double count).
import type { ChargeKind } from "@shared/enums";
import {
  abs,
  emptyResult,
  type ImportParseResult,
  parseDate,
  parseMoney,
  readTable,
  rowKey,
} from "./parse";

const ORDERS_SPEC = {
  name: { names: ["Name"], required: true },
  createdAt: { names: ["Created at"], required: true },
  paidAt: { names: ["Paid at"] },
  financialStatus: { names: ["Financial Status"] },
  currency: { names: ["Currency"] },
  subtotal: { names: ["Subtotal"] },
  shipping: { names: ["Shipping"] },
  taxes: { names: ["Taxes"] },
  total: { names: ["Total"], required: true },
  refunded: { names: ["Refunded Amount"] },
  canceledAt: { names: ["Canceled at", "Cancelled at"] },
  lineQuantity: { names: ["Lineitem quantity"], required: true },
  lineName: { names: ["Lineitem name"] },
  lineSku: { names: ["Lineitem SKU"] },
  id: { names: ["Id"] },
} as const;

type OrderField = keyof typeof ORDERS_SPEC;

/** Financial statuses with no captured payment: nothing was earned. */
const UNPAID = new Set(["pending", "authorized", "voided", "expired"]);

interface OrderGroup {
  line: number;
  head: { get: (f: OrderField) => string | undefined } | null;
  quantity: number;
  names: string[];
  skus: Set<string>;
}

export function parseShopifyOrders(text: string): ImportParseResult {
  const out = emptyResult("shopify", "orders_export");
  const table = readTable<OrderField>(text, ORDERS_SPEC, "Shopify orders export");
  out.rowCount = table.rows.length;

  // Group the line-item rows by order. The first row of an order carries its totals; later rows leave them
  // blank. Rows of one order are adjacent in the export, but grouping by name does not rely on it.
  const groups = new Map<string, OrderGroup>();
  for (const row of table.rows) {
    const name = row.get("name") ?? "";
    if (!name) {
      out.skipped.push({ line: row.line, reason: "No order name" });
      continue;
    }
    let g = groups.get(name);
    if (!g) {
      g = { line: row.line, head: null, quantity: 0, names: [], skus: new Set() };
      groups.set(name, g);
    }
    if (!g.head && (row.get("total") ?? "") !== "") g.head = row;
    g.quantity += Math.max(0, Number.parseInt(row.get("lineQuantity") ?? "0", 10) || 0);
    const lineName = row.get("lineName");
    if (lineName) g.names.push(lineName);
    const sku = row.get("lineSku");
    if (sku) g.skus.add(sku);
  }

  let refundsOnOrderDate = 0;
  for (const [name, g] of groups) {
    try {
      const head = g.head;
      if (!head) {
        out.skipped.push({ line: g.line, reason: `Order ${name} has no row with its total` });
        continue;
      }
      const currency = head.get("currency");
      if (currency && currency.toUpperCase() !== "USD") {
        out.skipped.push({ line: g.line, reason: `Currency ${currency} (only USD is supported)` });
        continue;
      }
      const status = (head.get("financialStatus") ?? "").toLowerCase().replace(/\s+/g, "_");
      if (UNPAID.has(status)) {
        out.skipped.push({ line: g.line, reason: `Not paid (financial status ${status})` });
        continue;
      }
      const date = parseDate(head.get("paidAt")) ?? parseDate(head.get("createdAt"));
      if (!date) {
        out.skipped.push({
          line: g.line,
          reason: `Unreadable date "${head.get("paidAt") || head.get("createdAt") || ""}"`,
        });
        continue;
      }
      const total = abs(parseMoney(head.get("total"))) ?? 0;
      const shipping = abs(parseMoney(head.get("shipping"))) ?? 0;
      const taxes = abs(parseMoney(head.get("taxes"))) ?? 0;
      // What the buyer paid for the goods: the total less shipping and tax. This holds whether or not the
      // export's Subtotal is before or after discounts, which Shopify's page does not say.
      const items = Math.max(0, total - shipping - taxes);
      const title =
        g.names.length === 0
          ? `Shopify order ${name}`
          : g.names.length === 1
            ? (g.names[0] ?? null)
            : `${g.names[0]} and ${g.names.length - 1} more`;
      const ext = head.get("id") || name;
      const sku = g.skus.size === 1 ? ([...g.skus][0] ?? null) : null;
      out.sales.push({
        kind: "order",
        externalId: ext,
        orderId: name,
        date,
        title,
        sku,
        quantity: Math.max(1, g.quantity),
        itemCents: items,
        shippingChargedCents: shipping,
        salesTaxCents: taxes,
        refundCents: 0,
        shippingLabelCents: 0, // Shopify Shipping labels are billed on the Shopify bill, not on the order
        netCents: null, // the processing fee is in the Shopify Payments transactions file
        fees: [],
      });
      const refunded = abs(parseMoney(head.get("refunded")));
      if (refunded) {
        refundsOnOrderDate++;
        out.sales.push({
          kind: "refund",
          externalId: `${ext}:refund`,
          orderId: name,
          date,
          title,
          sku,
          quantity: 1,
          itemCents: 0,
          shippingChargedCents: 0,
          salesTaxCents: 0,
          refundCents: refunded,
          shippingLabelCents: 0,
          netCents: null,
          fees: [],
        });
      }
    } catch (e) {
      out.skipped.push({ line: g.line, reason: (e as Error).message });
    }
  }
  if (refundsOnOrderDate) {
    out.warnings.push(
      `${refundsOnOrderDate} refunded order(s) recorded on the order's payment date: the orders export has no refund date.`,
    );
  }
  out.warnings.push(
    "Processing fees are not in the orders export: import the Shopify Payments transactions file for the same months to count them.",
  );
  return out;
}

const TRANSACTIONS_SPEC = {
  date: { names: ["Transaction Date"], required: true },
  type: { names: ["Type"], required: true },
  order: { names: ["Order"] },
  amount: { names: ["Amount"], required: true },
  fee: { names: ["Fee"], required: true },
  net: { names: ["Net"] },
  currency: { names: ["Currency"] },
  payoutId: { names: ["Payout ID"] },
  checkout: { names: ["Checkout"] },
} as const;

/** Shopify's CSV types, lower case with underscores read as spaces ("refund_failure" = "refund failure"). */
const SKIPPED_TYPES: Record<string, string> = {
  "reserved funds": "Reserved funds (money held back, not income or a cost)",
  "marketplace sales tax": "Marketplace sales tax collected and remitted by Shopify",
  "shop cash credit": "Shop Cash part of an order's payment (the order's total already counts it)",
  "refund failure":
    "Refund that did not go through: check the order's Refunded Amount in the orders export",
  payout: "Payout (money movement, not income)",
  transfer: "Transfer (money movement, not income)",
};

export function parseShopifyPaymentsTransactions(text: string): ImportParseResult {
  const out = emptyResult("shopify", "payments_transactions");
  const table = readTable<keyof typeof TRANSACTIONS_SPEC>(
    text,
    TRANSACTIONS_SPEC,
    "Shopify Payments transactions export",
  );
  out.rowCount = table.rows.length;
  let amountsFromOrders = 0;
  const adjustments: number[] = [];
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
      const type = (row.get("type") ?? "").toLowerCase().replace(/_/g, " ").trim();
      const order = row.get("order") || null;
      const amount = parseMoney(row.get("amount"));
      const fee = parseMoney(row.get("fee"));
      const ext = rowKey(
        date,
        type,
        order,
        row.get("amount"),
        row.get("fee"),
        row.get("net"),
        row.get("payoutId"),
        row.get("checkout"),
      );
      const where = order ? ` (order ${order})` : "";

      if (type === "charge" || type === "refund") {
        // The amount is in the orders export; only the fee is new here. Shopify's Fee is positive when
        // charged; a refunded fee arrives negative.
        amountsFromOrders++;
        if (fee) {
          out.charges.push({
            externalId: `${ext}:fee`,
            date,
            kind: "payment_processing",
            amountCents: fee,
            orderId: order,
            description: `Shopify Payments ${type} fee${where}`,
          });
        } else {
          out.skipped.push({
            line: row.line,
            reason:
              type === "charge"
                ? "Charge with no fee (the sale comes from the orders export)"
                : "Refund with no fee (the refund comes from the orders export)",
          });
        }
        continue;
      }
      if (type === "chargeback" || type === "chargeback won") {
        // Money the card network took back for an order (negative), or returned when the dispute was won
        // (positive). Booked as a return, so a won dispute reverses it.
        if (amount == null || amount === 0) {
          out.skipped.push({ line: row.line, reason: "No amount" });
          continue;
        }
        out.sales.push({
          kind: "refund",
          externalId: `${ext}:chargeback`,
          orderId: order,
          date,
          title: type === "chargeback" ? `Chargeback${where}` : `Chargeback won${where}`,
          sku: null,
          quantity: 1,
          itemCents: 0,
          shippingChargedCents: 0,
          salesTaxCents: 0,
          refundCents: -amount,
          shippingLabelCents: 0,
          netCents: null,
          fees: fee ? [{ kind: "other", amountCents: fee, sourceColumn: "Fee" }] : [],
        });
        continue;
      }
      const skipReason = SKIPPED_TYPES[type];
      if (skipReason) {
        out.skipped.push({ line: row.line, reason: skipReason });
        continue;
      }
      // Everything else changes the balance as a cost or a credit: Shopify bills paid from the balance and
      // their refunds, adjustments (chargeback fees, fee refunds, Capital repayments...) and Fraud Protect.
      const net = parseMoney(row.get("net")) ?? (amount == null ? null : amount - (fee ?? 0));
      if (net == null || net === 0) {
        out.skipped.push({ line: row.line, reason: "No amount" });
        continue;
      }
      let kind: ChargeKind;
      if (type === "bill payment" || type === "bill refund") kind = "subscription";
      else if (type === "adjustment" || type === "fraud protect adjustment") kind = "other";
      else {
        out.skipped.push({
          line: row.line,
          reason: `Unknown transaction type "${row.get("type") ?? ""}": not imported`,
        });
        continue;
      }
      out.charges.push({
        externalId: ext,
        date,
        kind,
        amountCents: -net,
        orderId: order,
        description: `Shopify Payments ${type}${where}`,
      });
      if (type === "adjustment") adjustments.push(row.line);
    } catch (e) {
      out.skipped.push({ line: row.line, reason: (e as Error).message });
    }
  }
  if (adjustments.length) {
    out.warnings.push(
      `Adjustments on line(s) ${adjustments.join(", ")} are recorded as other fees or credits. Shopify's CSV uses this one type for chargeback fees, fee refunds and Shopify Capital or Credit repayments; a repayment pays back a loan and is not a business cost, so match these against the Payouts page.`,
    );
  }
  if (amountsFromOrders) {
    out.warnings.push(
      `${amountsFromOrders} charge and refund rows gave their fee only: import the orders export for the same months for the sales and refunds.`,
    );
  }
  return out;
}
