// Square Transactions CSV (Square Dashboard > Transactions > Export > Transactions CSV): the card reader
// and point-of-sale app many resellers use at markets, flea markets and pop-ups. One row is one payment or
// one refund. Cash rung up in the Square app is in the file too (tender "Cash", no fee).
//
// Header names: a seller's full, ordered header row quoted on the Square Community (2023-02-28) and the
// money definitions in Square's own glossary (help article 5200, read 2026-11-26). No real export was seen;
// see docs/IMPORTERS.md#square for what is and is not confirmed.
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
  date: { names: ["Date"], required: true },
  eventType: { names: ["Event Type"], required: true },
  netTotal: { names: ["Net Total"], required: true },
  grossSales: { names: ["Gross Sales"] },
  discounts: { names: ["Discounts"] },
  serviceCharges: { names: ["Service Charges"] },
  netSales: { names: ["Net Sales"] },
  giftCardSales: { names: ["Gift Card Sales"] },
  tax: { names: ["Tax"] },
  tip: { names: ["Tip"] },
  partialRefunds: { names: ["Partial Refunds"] },
  totalCollected: { names: ["Total Collected"] },
  fees: { names: ["Fees"] },
  transactionId: { names: ["Transaction ID"] },
  paymentId: { names: ["Payment ID"] },
  description: { names: ["Description"] },
  status: { names: ["Transaction Status"] },
} as const;

type Field = keyof typeof SPEC;

/** Statuses that mean no money moved. Anything else (Complete, blank, a new word) is imported. */
const NOT_SETTLED = /fail|cancel|declin|void|pending/i;

const usd = (c: number) => `$${(c / 100).toFixed(2)}`;

export function parseSquareTransactions(text: string): ImportParseResult {
  const out = emptyResult("square", "transactions_csv");
  const table = readTable<Field>(text, SPEC, "Square Transactions CSV");
  out.rowCount = table.rows.length;
  const col = (f: Field) => table.matched[f];

  // Square's export shows fees as negative amounts; a file edited so costs read positive is read the same
  // way when no payment row has a negative fee (as for TikTok Shop).
  const signed = table.rows.some(
    (r) => /payment/i.test(r.get("eventType") ?? "") && (safeMoney(r.get("fees")) ?? 0) < 0,
  );

  const seen = new Map<string, number>();
  let tipsCents = 0;
  let tipRows = 0;
  let giftCardCents = 0;
  const partialRefundLines: number[] = [];
  const unbalanced: number[] = [];
  let refundFeesIgnored = 0;

  for (const row of table.rows) {
    try {
      const date = parseDate(row.get("date"));
      if (!date) {
        out.skipped.push({ line: row.line, reason: `Unreadable date "${row.get("date") ?? ""}"` });
        continue;
      }
      const status = row.get("status") ?? "";
      if (NOT_SETTLED.test(status)) {
        out.skipped.push({
          line: row.line,
          reason: `Transaction status "${status}": no money moved`,
        });
        continue;
      }
      const event = (row.get("eventType") ?? "").trim().toLowerCase();
      const isPayment = event === "payment";
      const isRefund = event === "refund";
      if (!isPayment && !isRefund) {
        out.skipped.push({
          line: row.line,
          reason: `Event type "${row.get("eventType") ?? ""}": only payments and refunds are imported`,
        });
        continue;
      }

      const tax = parseMoney(row.get("tax")) ?? 0;
      const tip = parseMoney(row.get("tip")) ?? 0;
      const service = parseMoney(row.get("serviceCharges")) ?? 0;
      const giftCards = parseMoney(row.get("giftCardSales")) ?? 0;
      const netTotal = parseMoney(row.get("netTotal"));
      const feeRaw = parseMoney(row.get("fees")) ?? 0;
      // Goods after discounts: Net Sales, or Gross Sales less Discounts when Net Sales is not in the file.
      let goods = parseMoney(row.get("netSales"));
      if (goods == null) {
        const gross = parseMoney(row.get("grossSales"));
        if (gross != null) {
          const disc = abs(parseMoney(row.get("discounts"))) ?? 0;
          goods = gross < 0 ? gross + disc : gross - disc;
        }
      }
      if (goods == null) {
        const collected = parseMoney(row.get("totalCollected"));
        if (collected != null) goods = collected - tax - tip - service - giftCards;
      }
      if (goods == null) {
        out.skipped.push({
          line: row.line,
          reason: "No Net Sales, Gross Sales or Total Collected",
        });
        continue;
      }

      const txn = row.get("transactionId") || null;
      const payment = row.get("paymentId") || null;
      const baseKey =
        txn || payment
          ? `${txn ?? ""}:${payment ?? ""}:${event}`
          : rowKey(date, event, row.get("description"), row.get("netSales"), row.get("netTotal"));
      // A payment refunded twice has two Refund rows with the same ids: tell them apart by amount, then
      // by their order among equals, so re-importing the same file adds nothing.
      const amountKey = isRefund ? `${baseKey}:${row.get("netTotal") ?? ""}` : baseKey;
      const n = (seen.get(amountKey) ?? 0) + 1;
      seen.set(amountKey, n);
      const externalId = n === 1 ? amountKey : `${amountKey}#${n}`;
      const title = row.get("description") || `Square ${event}${txn ? ` ${txn}` : ""}`;

      if (isPayment) {
        // Income: the goods, plus tips and service charges (gross receipts, not the platform's money).
        // Gift card sales are left out: money for a card is owed to its holder until the card is spent,
        // and the spend shows up later as a payment's sales.
        const fees: ParsedFee[] = [];
        const fee = signed ? -feeRaw : Math.abs(feeRaw);
        if (fee !== 0 && col("fees")) {
          fees.push({
            kind: "payment_processing",
            amountCents: fee,
            sourceColumn: col("fees") as string,
          });
        }
        if (tip) {
          tipsCents += tip;
          tipRows++;
        }
        if (giftCards) giftCardCents += giftCards;
        if (parseMoney(row.get("partialRefunds"))) partialRefundLines.push(row.line);
        const income = goods + tip + service;
        if (netTotal != null && income + tax + giftCards - fee !== netTotal)
          unbalanced.push(row.line);
        if (income === 0) {
          // Nothing sold (a gift card on its own): no order, but the fee Square took is still a cost.
          if (fee !== 0) {
            out.charges.push({
              externalId: `${externalId}:fee`,
              date,
              kind: "payment_processing",
              amountCents: fee,
              orderId: txn ?? payment,
              description: `Square fee on ${title}`,
            });
          } else {
            out.skipped.push({ line: row.line, reason: "Payment of $0.00 for goods" });
          }
          continue;
        }
        out.sales.push({
          kind: "order",
          externalId,
          orderId: txn ?? payment,
          date,
          title,
          sku: null,
          quantity: 1,
          itemCents: Math.max(0, income),
          shippingChargedCents: 0,
          salesTaxCents: Math.abs(tax),
          refundCents: 0,
          shippingLabelCents: 0,
          // Net Total includes the sales tax the seller collected and must send to the state, so it is not
          // the "net after fees" the marketplaces report; the fee is in the row above.
          netCents: null,
          fees,
        });
      } else {
        // A refund row carries negative amounts. The refund is what went back for the goods, tips and
        // service charges; the tax given back is the state's money, never income, so it is left out.
        const refund = Math.abs(goods) + Math.abs(tip) + Math.abs(service);
        if (refund === 0) {
          out.skipped.push({ line: row.line, reason: "Refund of $0.00 for goods (tax only)" });
          continue;
        }
        const fees: ParsedFee[] = [];
        if (feeRaw !== 0 && col("fees")) {
          if (signed) {
            // Signed layout: a positive fee on a refund is fee money Square gave back (a credit).
            fees.push({
              kind: "payment_processing",
              amountCents: -feeRaw,
              sourceColumn: col("fees") as string,
            });
          } else {
            refundFeesIgnored++;
          }
        }
        out.sales.push({
          kind: "refund",
          externalId,
          orderId: txn ?? payment,
          date,
          title,
          sku: null,
          quantity: 1,
          itemCents: 0,
          shippingChargedCents: 0,
          salesTaxCents: 0,
          refundCents: refund,
          shippingLabelCents: 0,
          netCents: null,
          fees,
        });
      }
    } catch (e) {
      out.skipped.push({ line: row.line, reason: (e as Error).message });
    }
  }

  if (tipRows) {
    out.warnings.push(
      `${tipRows} payments include tips (${usd(tipsCents)} in all): counted as sales income, as tips are gross receipts.`,
    );
  }
  if (giftCardCents) {
    out.warnings.push(
      `${usd(giftCardCents)} of gift card sales left out of income: it becomes a sale when the card is spent.`,
    );
  }
  if (partialRefundLines.length) {
    out.warnings.push(
      `${partialRefundLines.length} payments show a partial refund (lines ${partialRefundLines.slice(0, 5).join(", ")}): the refund is imported from its own Refund row, so export a date range that includes it.`,
    );
  }
  if (refundFeesIgnored) {
    out.warnings.push(
      `${refundFeesIgnored} refunds show a fee, but the file's fees are not signed, so it cannot tell a fee given back from one charged: left out.`,
    );
  }
  if (unbalanced.length) {
    out.warnings.push(
      `${unbalanced.length} payments (lines ${unbalanced.slice(0, 5).join(", ")}) do not add up to Net Total (sales + tips + service charges + tax + gift cards − fees): imported as the file shows them.`,
    );
  }
  return out;
}

function safeMoney(raw: string | undefined): number | null {
  try {
    return parseMoney(raw);
  } catch {
    return null;
  }
}
