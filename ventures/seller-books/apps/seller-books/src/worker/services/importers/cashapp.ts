// Cash App activity export (cash.app on the web > Statements > the Transactions CSV, a file named
// `cash_app_report_<number>.csv`): the money a reseller is paid through Cash App, such as a buyer paying for a
// local pickup or a Facebook Marketplace sale, on a personal or a business account. One row is one balance entry:
// a payment sent or received, a Cash Card purchase, a deposit or cash-out, a Bitcoin or stock trade.
//
// Layout: one header row, `Transaction ID, Date, Transaction Type, Currency, Amount, Fee, Net Amount, Asset Type,
// Asset Price, Asset Amount, Status, Notes, Name of sender/receiver, Account`, then the rows, newest first.
// Amounts read "$10.00" and "-$5.00"; the fee is negative and Net Amount = Amount + Fee; dates read
// "2024-09-26 16:18:23 EDT". That header was read from three exports users published on GitHub (read
// 2026-11-28, header rows and type values only), and the same names are used by open-source importers
// (BittyTax's `cashapp.py`). Older exports name payments "Received P2P" and "Sent P2P"; newer ones say "P2P" and
// give the direction by the sign. Cash App's own help pages render client-side and could not be read.
// See docs/IMPORTERS.md#cash-app for what is and is not confirmed. No business-account export was seen.
import {
  emptyResult,
  type ImportParseResult,
  type ParsedFee,
  parseDate,
  parseMoney,
  readTable,
  rowKey,
} from "./parse";

const SPEC = {
  id: { names: ["Transaction ID"] },
  date: { names: ["Date"], required: true },
  type: { names: ["Transaction Type"], required: true },
  currency: { names: ["Currency"] },
  amount: { names: ["Amount"], required: true },
  fee: { names: ["Fee"] },
  net: { names: ["Net Amount"], required: true },
  assetType: { names: ["Asset Type"] },
  status: { names: ["Status"], required: true },
  notes: { names: ["Notes"] },
  counterparty: { names: ["Name of sender/receiver"] },
} as const;

type Field = keyof typeof SPEC;

/** Investing and rewards: Bitcoin and stock trades, dividends, Boosts and round-ups. */
const INVESTING = /bitcoin|btc|stock|dividend|boost|round ?up|interest/i;
/** The Cash Card's own activity: purchases, ATM withdrawals. */
const CARD = /cash card|card purchase|card debit|atm/i;
/** Money moved between the seller's own accounts: cash-outs, deposits, paychecks, paper money. */
const TRANSFER =
  /deposit|withdrawal|cash ?out|cash ?in|transfer|paper money|direct deposit|paycheck/i;
/** Money going back to a buyer (debit) or coming back to the seller (credit). */
const REFUNDISH = /refund|reversal|chargeback|dispute/i;
/** A person-to-person or business payment: "P2P", "Received P2P", "Sent P2P", a Cash App Pay payment. */
const PAYMENT = /p2p|payment|cash app pay|request|business/i;
const COMPLETE = /^complete(d)?$/i;

const usd = (c: number) => `$${(c / 100).toFixed(2)}`;

export function parseCashAppReport(text: string): ImportParseResult {
  const out = emptyResult("cashapp", "activity");
  const table = readTable<Field>(text, SPEC, "Cash App activity CSV");
  out.rowCount = table.rows.length;
  const col = (f: Field) => table.matched[f];

  const seen = new Map<string, number>();
  let sentCount = 0;
  let sentCents = 0;
  const creditsBack: number[] = [];
  let feesSeen = 0;
  let refunds = 0;

  for (const row of table.rows) {
    try {
      const rawDate = row.get("date") ?? "";
      const type = (row.get("type") ?? "").trim();
      const date = parseDate(rawDate);
      if (!date) {
        out.skipped.push({ line: row.line, reason: `Unreadable date "${rawDate}"` });
        continue;
      }
      if (!type) {
        out.skipped.push({ line: row.line, reason: "No transaction type: not a payment" });
        continue;
      }
      if (/notification/i.test(type)) {
        out.skipped.push({
          line: row.line,
          reason: `"${type}": an account notice, no money moved`,
        });
        continue;
      }
      const asset = (row.get("assetType") ?? "").trim();
      if (INVESTING.test(type) || asset) {
        out.skipped.push({
          line: row.line,
          reason: `"${type}": investing or rewards, not a sale`,
        });
        continue;
      }
      if (CARD.test(type)) {
        out.skipped.push({
          line: row.line,
          reason: `"${type}": Cash Card activity, not a sale (a card purchase for the business goes in Expenses)`,
        });
        continue;
      }
      if (TRANSFER.test(type)) {
        out.skipped.push({
          line: row.line,
          reason: `"${type}": money moved between your own accounts`,
        });
        continue;
      }
      const status = (row.get("status") ?? "").trim();
      if (!COMPLETE.test(status)) {
        out.skipped.push({
          line: row.line,
          reason: `Status "${status}": only complete transactions are imported`,
        });
        continue;
      }
      const currency = (row.get("currency") ?? "").trim();
      if (currency && currency.toUpperCase() !== "USD") {
        out.skipped.push({
          line: row.line,
          reason: `Currency "${currency}": only US dollar rows are imported`,
        });
        continue;
      }
      const amount = parseMoney(row.get("amount"));
      if (amount == null || amount === 0) {
        out.skipped.push({ line: row.line, reason: `${type} of $0.00` });
        continue;
      }

      const id = row.get("id") || null;
      const baseKey =
        id ?? rowKey(date, type, row.get("amount"), row.get("counterparty"), row.get("notes"));
      const n = (seen.get(baseKey) ?? 0) + 1;
      seen.set(baseKey, n);
      const externalId = n === 1 ? baseKey : `${baseKey}#${n}`;
      // Cash App writes its fee as a negative amount (Net Amount = Amount + Fee); a fee given back is positive.
      const feeRaw = parseMoney(row.get("fee")) ?? 0;
      const note = (row.get("notes") ?? "").replace(/\s+/g, " ").trim();
      const title = note || "Cash App payment";

      if (REFUNDISH.test(type)) {
        if (amount > 0) {
          creditsBack.push(row.line);
          out.skipped.push({
            line: row.line,
            reason: `"${type}" credited to you: not a sale (a refund of a purchase belongs with that inventory or expense)`,
          });
          continue;
        }
        refunds++;
        const fees: ParsedFee[] = [];
        if (feeRaw !== 0 && col("fee")) {
          fees.push({
            kind: "payment_processing",
            amountCents: -Math.abs(feeRaw),
            sourceColumn: col("fee") as string,
          });
        }
        out.sales.push({
          kind: "refund",
          externalId,
          orderId: null,
          date,
          title,
          sku: null,
          quantity: 1,
          itemCents: 0,
          shippingChargedCents: 0,
          salesTaxCents: 0,
          refundCents: Math.abs(amount),
          shippingLabelCents: 0,
          netCents: null,
          fees,
        });
        continue;
      }

      if (PAYMENT.test(type)) {
        // "Sent P2P", or a "P2P" with a "-": money the seller paid out.
        if (amount < 0 || /sent/i.test(type)) {
          sentCount++;
          sentCents += Math.abs(amount);
          out.skipped.push({
            line: row.line,
            reason: `"${type}" you sent: add it as inventory or an expense if it was for the business`,
          });
          continue;
        }
        const fees: ParsedFee[] = [];
        if (feeRaw !== 0 && col("fee")) {
          feesSeen++;
          fees.push({
            kind: "payment_processing",
            amountCents: Math.abs(feeRaw),
            sourceColumn: col("fee") as string,
          });
        }
        const net = parseMoney(row.get("net"));
        // Amount is what the buyer sent, before Cash App's fee; Net Amount is what reached the balance.
        out.sales.push({
          kind: "order",
          externalId,
          orderId: id,
          date,
          title,
          sku: null,
          quantity: 1,
          itemCents: amount,
          shippingChargedCents: 0,
          salesTaxCents: 0,
          refundCents: 0,
          shippingLabelCents: 0,
          netCents: net,
          fees,
        });
        continue;
      }
      out.skipped.push({
        line: row.line,
        reason: `Type "${type}": not a payment received or a refund`,
      });
    } catch (e) {
      out.skipped.push({ line: row.line, reason: (e as Error).message });
    }
  }

  out.warnings.push(
    "Every payment received in this file is imported as a sale. Delete afterwards any that were not sales: money from friends or family splitting a bill, rent, a loan repaid, or a personal item sold at a loss.",
  );
  if (feesSeen) {
    out.warnings.push(
      `${feesSeen} payments carry a Cash App fee, kept as payment processing; the sale is the amount the buyer sent, before the fee.`,
    );
  }
  if (sentCount) {
    out.warnings.push(
      `${sentCount} payments you sent (${usd(sentCents)} in all) left out: a purchase of stock goes in Inventory, and supplies or postage in Expenses.`,
    );
  }
  if (creditsBack.length) {
    out.warnings.push(
      `${creditsBack.length} refunds credited to you (lines ${creditsBack.slice(0, 5).join(", ")}) left out: if one returns money for stock or an expense, lower that cost instead.`,
    );
  }
  if (refunds) {
    out.warnings.push(
      `${refunds} refunds imported. Cash App's file does not say which payment a refund belongs to, so each is booked on its own date; check the sale it refunds is in the books.`,
    );
  }
  return out;
}
