import { randomUUID } from "node:crypto";
import type { PaymentClass, SaleEvent, SaleLineItem } from "@retail-pilot/schemas";
import { parseCsvRecords } from "./csv.js";

const PAYMENT_CLASS_BY_KEYWORD: Array<[RegExp, PaymentClass]> = [
  [/cash/i, "cash"],
  [/card|credit|debit|visa|mastercard|amex/i, "card"],
  [/mixed|split/i, "mixed"],
];

function toPaymentClass(raw: string | undefined): PaymentClass {
  if (!raw) {
    return "unknown";
  }
  for (const [pattern, paymentClass] of PAYMENT_CLASS_BY_KEYWORD) {
    if (pattern.test(raw)) {
      return paymentClass;
    }
  }
  return "other";
}

export interface CsvImportIssue {
  rowNumber: number;
  reason: string;
}

export interface CsvImportResult {
  events: SaleEvent[];
  issues: CsvImportIssue[];
}

/**
 * Normalizes a generic line-item-per-row POS export (one row per SKU sold,
 * grouped by a receipt/basket id column) into `SaleEvent`s.
 *
 * Expected columns (header names, case-sensitive): receipt_id, closed_at,
 * sku, quantity, unit_price_cents. Optional: currency, description,
 * payment_method, store_id, pos_vendor.
 *
 * Malformed rows are skipped and reported in `issues` rather than aborting
 * the whole import — a single bad line in a real POS export shouldn't lose
 * every other basket in the file.
 */
export function importSaleEventsFromCsv(csvText: string, defaultStoreId: string): CsvImportResult {
  const records = parseCsvRecords(csvText);
  const issues: CsvImportIssue[] = [];
  const lineItemsByReceipt = new Map<string, SaleLineItem[]>();
  const metaByReceipt = new Map<
    string,
    { closedAt: string; currency: string; storeId: string; paymentClass: PaymentClass; posVendor?: string; receiptId: string }
  >();

  records.forEach((record, index) => {
    const rowNumber = index + 2; // +1 for 0-index, +1 for the header row

    const receiptId = record.receipt_id;
    const closedAt = record.closed_at;
    const sku = record.sku;
    const quantityRaw = record.quantity;
    const unitPriceRaw = record.unit_price_cents;

    if (!receiptId || !closedAt || !sku || !quantityRaw || !unitPriceRaw) {
      issues.push({
        rowNumber,
        reason: "missing one of: receipt_id, closed_at, sku, quantity, unit_price_cents",
      });
      return;
    }

    if (Number.isNaN(Date.parse(closedAt))) {
      issues.push({ rowNumber, reason: `closed_at is not a valid date-time: "${closedAt}"` });
      return;
    }

    const quantity = Number.parseInt(quantityRaw, 10);
    const unitPriceCents = Number.parseInt(unitPriceRaw, 10);
    if (!Number.isInteger(quantity) || quantity < 1) {
      issues.push({ rowNumber, reason: `quantity must be a positive integer, got "${quantityRaw}"` });
      return;
    }
    if (!Number.isInteger(unitPriceCents) || unitPriceCents < 0) {
      issues.push({ rowNumber, reason: `unit_price_cents must be a non-negative integer, got "${unitPriceRaw}"` });
      return;
    }

    const lineItem: SaleLineItem = {
      sku,
      quantity,
      unit_price_cents: unitPriceCents,
      ...(record.description ? { description: record.description } : {}),
    };

    const existing = lineItemsByReceipt.get(receiptId) ?? [];
    existing.push(lineItem);
    lineItemsByReceipt.set(receiptId, existing);

    if (!metaByReceipt.has(receiptId)) {
      const currency = record.currency && /^[A-Z]{3}$/.test(record.currency) ? record.currency : "EUR";
      metaByReceipt.set(receiptId, {
        closedAt,
        currency,
        storeId: record.store_id || defaultStoreId,
        paymentClass: toPaymentClass(record.payment_method),
        posVendor: record.pos_vendor || undefined,
        receiptId,
      });
    }
  });

  const events: SaleEvent[] = [];
  for (const [receiptId, lineItems] of lineItemsByReceipt) {
    const meta = metaByReceipt.get(receiptId);
    if (!meta) {
      continue;
    }
    const totalCents = lineItems.reduce((sum, item) => sum + item.quantity * item.unit_price_cents, 0);
    events.push({
      event_id: randomUUID(),
      store_id: meta.storeId,
      basket_id: receiptId,
      closed_at: new Date(meta.closedAt).toISOString(),
      currency: meta.currency,
      line_items: lineItems,
      total_cents: totalCents,
      payment_class: meta.paymentClass,
      ...(meta.posVendor ? { pos_vendor: meta.posVendor } : {}),
      raw_reference: meta.receiptId,
    });
  }

  return { events, issues };
}
