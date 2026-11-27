// Venmo statement (venmo.com or the app > Me > Statements > Download CSV): the money a reseller is paid
// through Venmo, such as a buyer paying for a local pickup or a Facebook Marketplace sale, on a personal
// profile (goods and services payments) or a business profile. One row is one balance entry: a payment or
// charge received or sent, a refund, a transfer to the bank, a Venmo card purchase or reward.
//
// Layout: two title lines ("Account Statement - (@handle) - ...", "Account Activity"), then the header row with an
// empty first column, a row with only the beginning balance, the transactions, and a closing row with the
// ending balance and the period's fee totals. Amounts read "+ $45.00" and "- $885.00"; dates are ISO
// ("2021-08-07T04:11:17"). Seen in a statement a user published (github.com/egost/venmo_statement, a 2021
// personal statement), with the same column names in two open-source importers (jbms/beancount-import and
// jbms/finance-dl, read 2026-11-27). Venmo's own help pages could not be opened from this environment.
// See docs/IMPORTERS.md#venmo for what is and is not confirmed. No business-profile export was seen.
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
  id: { names: ["ID", "Transaction ID"] },
  date: { names: ["Datetime", "Date"], required: true },
  type: { names: ["Type"], required: true },
  status: { names: ["Status"], required: true },
  total: { names: ["Amount (total)", "Amount"], required: true },
  tip: { names: ["Amount (tip)"] },
  tax: { names: ["Amount (tax)"] },
  fee: { names: ["Amount (fee)"] },
  note: { names: ["Note"] },
  from: { names: ["From"] },
  to: { names: ["To"] },
  fundingSource: { names: ["Funding Source"] },
  destination: { names: ["Destination"] },
} as const;

type Field = keyof typeof SPEC;

/** Money moved between the seller's own accounts: cash-outs, top-ups. */
const TRANSFER = /transfer|add funds|cash ?out|withdraw|deposit|direct deposit|bank/i;
/** The Venmo credit or debit card's own activity: rewards, card bill payments, card purchases. */
const CARD = /credit card|debit card|venmo card|reward|cashback|merchant transaction/i;
/** Money going back to a buyer (debit) or coming back to the seller (credit). */
const REFUNDISH = /refund|reversal|chargeback|dispute/i;
/** A person-to-person or business payment: "Payment" (they paid) and "Charge" (a request that was paid). */
const PAYMENT = /payment|charge|purchase|goods|services|tap to pay|qr/i;
const COMPLETE = /^complete(d)?$/i;

const usd = (c: number) => `$${(c / 100).toFixed(2)}`;

export function parseVenmoStatement(text: string): ImportParseResult {
  const out = emptyResult("venmo", "statement");
  const table = readTable<Field>(text, SPEC, "Venmo statement CSV");
  out.rowCount = table.rows.length;
  const col = (f: Field) => table.matched[f];

  const seen = new Map<string, number>();
  const sent: number[] = [];
  let sentCents = 0;
  const creditsBack: number[] = [];
  let feesSeen = 0;
  let refunds = 0;

  for (const row of table.rows) {
    try {
      const rawDate = row.get("date") ?? "";
      const type = row.get("type") ?? "";
      // The closing row carries the ending balance and the fee totals but no date or type.
      if (!rawDate && !type) {
        out.skipped.push({
          line: row.line,
          reason: "Balance or fee summary row, not a transaction",
        });
        continue;
      }
      const date = parseDate(rawDate);
      if (!date) {
        out.skipped.push({ line: row.line, reason: `Unreadable date "${rawDate}"` });
        continue;
      }
      // Transfers read "Issued", not "Complete": sorted out by type first so the reason is the right one.
      if (CARD.test(type)) {
        out.skipped.push({
          line: row.line,
          reason: `"${type}": Venmo card activity, not a sale (a card purchase for the business goes in Expenses)`,
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
      const status = row.get("status") ?? "";
      if (!COMPLETE.test(status.trim())) {
        out.skipped.push({
          line: row.line,
          reason: `Status "${status}": only complete transactions are imported`,
        });
        continue;
      }
      const total = parseMoney(row.get("total"));
      if (total == null || total === 0) {
        out.skipped.push({ line: row.line, reason: `${type || "Row"} of $0.00` });
        continue;
      }

      const id = row.get("id") || null;
      const baseKey =
        id ?? rowKey(date, type, row.get("total"), row.get("from"), row.get("to"), row.get("note"));
      const n = (seen.get(baseKey) ?? 0) + 1;
      seen.set(baseKey, n);
      const externalId = n === 1 ? baseKey : `${baseKey}#${n}`;
      const feeRaw = parseMoney(row.get("fee")) ?? 0;
      const tax = Math.abs(parseMoney(row.get("tax")) ?? 0);
      const note = (row.get("note") ?? "").replace(/\s+/g, " ").trim();
      const title = note || `Venmo ${type.toLowerCase()}`;

      if (REFUNDISH.test(type)) {
        if (total > 0) {
          creditsBack.push(row.line);
          out.skipped.push({
            line: row.line,
            reason: `"${type}" credited to you: not a sale (a refund of a purchase belongs with that inventory or expense)`,
          });
          continue;
        }
        refunds++;
        const fees: ParsedFee[] = [];
        // A fee given back on a refund arrives as a credit in the fee column.
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
          refundCents: Math.max(0, Math.abs(total) - tax),
          shippingLabelCents: 0,
          netCents: null,
          fees,
        });
        continue;
      }

      if (PAYMENT.test(type)) {
        // The sign is the statement owner's side: "+" came in, "-" went out, whoever started it.
        if (total < 0) {
          sent.push(row.line);
          sentCents += Math.abs(total);
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
        // Amount (total) is read as what the buyer sent, tip and any tax included, before Venmo's fee. A tip is
        // income like the price; sales tax is the state's money.
        out.sales.push({
          kind: "order",
          externalId,
          orderId: id,
          date,
          title,
          sku: null,
          quantity: 1,
          itemCents: Math.max(0, total - tax),
          shippingChargedCents: 0,
          salesTaxCents: tax,
          refundCents: 0,
          shippingLabelCents: 0,
          netCents: null,
          fees,
        });
        continue;
      }
      out.skipped.push({
        line: row.line,
        reason: `Type "${type}": not a payment, charge or refund`,
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
      `${feesSeen} payments carry a Venmo fee. Amount (total) is read as what the buyer sent, before the fee; check one sale against its detail in the Venmo app, and tell us if the app shows that figure after the fee.`,
    );
  }
  if (sent.length) {
    out.warnings.push(
      `${sent.length} payments you sent (${usd(sentCents)} in all) left out: a purchase of stock goes in Inventory, and supplies or postage in Expenses.`,
    );
  }
  if (creditsBack.length) {
    out.warnings.push(
      `${creditsBack.length} refunds credited to you (lines ${creditsBack.slice(0, 5).join(", ")}) left out: if one returns money for stock or an expense, lower that cost instead.`,
    );
  }
  if (refunds) {
    out.warnings.push(
      `${refunds} refunds imported. Venmo's statement does not say which payment a refund belongs to, so each is booked on its own date; check the sale it refunds is in the books.`,
    );
  }
  return out;
}
