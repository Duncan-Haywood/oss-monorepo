// PayPal Activity Download (paypal.com > Activity > Statements > Activity download, CSV): the money a
// reseller is paid through PayPal outside the marketplaces' own payouts, such as a buyer paying for a local
// pickup or a Facebook Marketplace or Instagram sale by PayPal goods and services, or a sale on a site whose
// buyers pay into the seller's PayPal account. One row is one balance entry: a payment received or sent, a
// refund, a fee, a hold, a transfer to the bank or a currency conversion.
//
// Header names and meanings: PayPal's own field reference for the report ("Activity Download report",
// developer.paypal.com/reports/activity-download, read 2026-11-27) and its transaction event code list
// (developer.paypal.com/reports/reference/t-codes, same day). See docs/IMPORTERS.md#paypal for what is and is
// not confirmed. No real export was seen.
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
  date: { names: ["Date"], required: true },
  type: { names: ["Type"], required: true },
  status: { names: ["Status"], required: true },
  gross: { names: ["Gross", "Amount"], required: true },
  fee: { names: ["Fee"] },
  net: { names: ["Net"] },
  currency: { names: ["Currency"] },
  name: { names: ["Name"] },
  transactionId: { names: ["Transaction ID"] },
  referenceId: { names: ["Reference Txn ID"] },
  itemTitle: { names: ["Item Title"] },
  subject: { names: ["Subject"] },
  quantity: { names: ["Quantity"] },
  shipping: { names: ["Shipping and Handling Amount"] },
  insurance: { names: ["Insurance Amount"] },
  salesTax: { names: ["Sales Tax"] },
  balanceImpact: { names: ["Balance Impact"] },
} as const;

type Field = keyof typeof SPEC;

/**
 * Payouts from a marketplace or card processor this app imports from its own report. Counting the payout
 * too would count each of those sales twice, so a payment whose counterparty is one of these is skipped.
 */
const MARKETPLACE_PAYERS: [RegExp, string][] = [
  [/\bebay\b/i, "eBay"],
  [/\bposhmark\b/i, "Poshmark"],
  [/\bmercari\b/i, "Mercari"],
  [/\bwhatnot\b/i, "Whatnot"],
  [/\bdepop\b/i, "Depop"],
  [/\betsy\b/i, "Etsy"],
  [/\bshopify\b/i, "Shopify"],
  [/\bamazon\b/i, "Amazon"],
  [/\btiktok\b/i, "TikTok Shop"],
  [/\bsquare\b/i, "Square"],
];

// Types (PayPal's T-code descriptions), matched by words so a renamed or regional label still sorts.
/** Holds and authorisations: money set aside or released, not earned or spent. */
const HOLD = /\bhold\b|\brelease\b|\breserve\b|authori[sz]ation/i;
/** Money moved between the seller's own accounts. */
const TRANSFER =
  /withdrawal|transfer|deposit|currency conversion|sweep|\bbank\b|balance manager|\bfunding\b/i;
/** Money going back to a buyer (debit) or coming back to the seller (credit). */
const REFUNDISH = /refund|reversal|chargeback|charge-off/i;
const FEE = /\bfee\b/i;
const PAYMENT = /payment|checkout|purchase|money received|goods|services/i;

const usd = (c: number) => `$${(c / 100).toFixed(2)}`;

export function parsePaypalActivity(text: string): ImportParseResult {
  const out = emptyResult("paypal", "activity_download");
  const table = readTable<Field>(text, SPEC, "PayPal Activity Download CSV");
  out.rowCount = table.rows.length;
  const col = (f: Field) => table.matched[f];

  const seen = new Map<string, number>();
  const importedSales = new Set<string>();
  /** Imported payments whose own Fee cell holds the fee, so a fee row for the same payment is not counted twice. */
  const salesWithFee = new Set<string>();
  const skippedPayments = new Set<string>();
  const sent: number[] = [];
  let sentCents = 0;
  const creditsBack: number[] = [];
  const otherCurrency = new Map<string, number>();
  const marketplacePayouts = new Map<string, number>();
  let unreferencedRefunds = 0;

  // Two passes: a refund names its payment in Reference Txn ID, which may sit later in the file (PayPal
  // lists newest first), so the payments are sorted out first.
  type Row = (typeof table.rows)[number];
  const classified: {
    row: Row;
    date: string;
    gross: number;
    kind: "sale" | "refund" | "fee";
  }[] = [];

  for (const row of table.rows) {
    try {
      const date = parseDate(row.get("date"));
      if (!date) {
        out.skipped.push({ line: row.line, reason: `Unreadable date "${row.get("date") ?? ""}"` });
        continue;
      }
      const type = row.get("type") ?? "";
      const status = row.get("status") ?? "";
      const txn = row.get("transactionId") || null;
      if (!/^completed$/i.test(status.trim())) {
        if (txn) skippedPayments.add(txn);
        out.skipped.push({
          line: row.line,
          reason: `Status "${status}": only completed transactions are imported`,
        });
        continue;
      }
      const gross = parseMoney(row.get("gross"));
      if (gross == null || gross === 0) {
        out.skipped.push({ line: row.line, reason: `${type || "Row"} of $0.00` });
        continue;
      }
      const currency = (row.get("currency") ?? "").trim().toUpperCase();
      if (currency && currency !== "USD") {
        otherCurrency.set(currency, (otherCurrency.get(currency) ?? 0) + 1);
        out.skipped.push({
          line: row.line,
          reason: `In ${currency}: the books are in US dollars (PayPal's own currency conversion rows show the dollars)`,
        });
        continue;
      }
      const impact = (row.get("balanceImpact") ?? "").trim().toLowerCase();
      if (impact === "memo") {
        out.skipped.push({
          line: row.line,
          reason: `"${type}" is a memo: it did not change the balance`,
        });
        continue;
      }
      const credit = impact ? impact === "credit" : gross > 0;

      if (HOLD.test(type)) {
        out.skipped.push({
          line: row.line,
          reason: `"${type}": a hold or its release, not income or a cost`,
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
      // Fee rows first: "Chargeback fee" and "Fee reversal" are fees, not refunds of a sale.
      if (FEE.test(type)) {
        classified.push({ row, date, gross, kind: "fee" });
        continue;
      }
      if (REFUNDISH.test(type)) {
        if (credit) {
          // A refund of something the seller bought, or a chargeback decided in the seller's favour: not a sale.
          creditsBack.push(row.line);
          out.skipped.push({
            line: row.line,
            reason: `"${type}" credited to you: not a sale (a refund of a purchase belongs with that inventory or expense)`,
          });
          continue;
        }
        classified.push({ row, date, gross, kind: "refund" });
        continue;
      }
      if (PAYMENT.test(type)) {
        if (!credit) {
          sent.push(row.line);
          sentCents += Math.abs(gross);
          out.skipped.push({
            line: row.line,
            reason: `"${type}" you sent: add it as inventory or an expense if it was for the business`,
          });
          continue;
        }
        const payer = row.get("name") ?? "";
        const market = MARKETPLACE_PAYERS.find(([re]) => re.test(payer))?.[1];
        if (market) {
          marketplacePayouts.set(market, (marketplacePayouts.get(market) ?? 0) + 1);
          if (txn) skippedPayments.add(txn);
          out.skipped.push({
            line: row.line,
            reason: `A payment from ${market}: import ${market}'s own report so its sales are counted once`,
          });
          continue;
        }
        classified.push({ row, date, gross, kind: "sale" });
        if (txn) {
          importedSales.add(txn);
          if (parseMoney(row.get("fee"))) salesWithFee.add(txn);
        }
        continue;
      }
      out.skipped.push({
        line: row.line,
        reason: `Type "${type}": not a payment, refund or fee`,
      });
    } catch (e) {
      out.skipped.push({ line: row.line, reason: (e as Error).message });
    }
  }

  for (const { row, date, gross, kind } of classified) {
    try {
      const txn = row.get("transactionId") || null;
      const ref = row.get("referenceId") || null;
      const type = row.get("type") ?? "";
      const baseKey = txn ?? rowKey(date, type, row.get("gross"), row.get("fee"), row.get("name"));
      const n = (seen.get(baseKey) ?? 0) + 1;
      seen.set(baseKey, n);
      const externalId = n === 1 ? baseKey : `${baseKey}#${n}`;
      const feeRaw = parseMoney(row.get("fee")) ?? 0;
      const tax = Math.abs(parseMoney(row.get("salesTax")) ?? 0);
      const shipping =
        Math.abs(parseMoney(row.get("shipping")) ?? 0) +
        Math.abs(parseMoney(row.get("insurance")) ?? 0);
      const title = row.get("itemTitle") || row.get("subject") || `PayPal ${type.toLowerCase()}`;

      if (kind === "fee") {
        if (ref && salesWithFee.has(ref)) {
          out.skipped.push({
            line: row.line,
            reason: `"${type}" for payment ${ref}, whose fee is already on its own row`,
          });
          continue;
        }
        // A fee row of its own (a dispute or chargeback fee). Its gross is negative when charged and positive
        // when given back.
        out.charges.push({
          externalId,
          date,
          kind: /chargeback|dispute/i.test(type) ? "other" : "payment_processing",
          amountCents: -gross,
          orderId: ref,
          description: `PayPal: ${type}`,
        });
        continue;
      }

      if (kind === "refund") {
        // The payment it refunds was left out (not completed, or a marketplace payout): leave this out too.
        if (ref && skippedPayments.has(ref)) {
          out.skipped.push({
            line: row.line,
            reason: `"${type}" for a payment that was not imported (${ref})`,
          });
          continue;
        }
        if (!ref || !importedSales.has(ref)) unreferencedRefunds++;
        // Gross is what went back to the buyer; the sales tax in it is the state's money, never income.
        const refund = Math.abs(gross) - tax;
        const fees: ParsedFee[] = [];
        // PayPal signs the fee column: on a refund, a positive fee is part of the fee given back.
        if (feeRaw !== 0 && col("fee")) {
          fees.push({
            kind: "payment_processing",
            amountCents: -feeRaw,
            sourceColumn: col("fee") as string,
          });
        }
        out.sales.push({
          kind: "refund",
          externalId,
          orderId: ref,
          date,
          title,
          sku: null,
          quantity: 1,
          itemCents: 0,
          shippingChargedCents: 0,
          salesTaxCents: 0,
          refundCents: Math.max(0, refund),
          shippingLabelCents: 0,
          netCents: null,
          fees,
        });
        continue;
      }

      // A payment received. Gross is what the buyer paid (shipping, insurance and sales tax included, before
      // PayPal's fee); the item income is what is left once the shipping and tax are taken out.
      const fees: ParsedFee[] = [];
      if (feeRaw !== 0 && col("fee")) {
        fees.push({
          kind: "payment_processing",
          amountCents: Math.abs(feeRaw),
          sourceColumn: col("fee") as string,
        });
      }
      const qty = Number.parseInt(row.get("quantity") ?? "", 10);
      out.sales.push({
        kind: "order",
        externalId,
        orderId: txn,
        date,
        title,
        sku: null,
        quantity: Number.isFinite(qty) && qty > 0 ? qty : 1,
        itemCents: Math.max(0, gross - shipping - tax),
        shippingChargedCents: shipping,
        salesTaxCents: tax,
        refundCents: 0,
        shippingLabelCents: 0,
        // Net includes any sales tax the buyer paid, so it is not the "net after fees" the marketplaces
        // report; the fee is in the row above.
        netCents: null,
        fees,
      });
    } catch (e) {
      out.skipped.push({ line: row.line, reason: (e as Error).message });
    }
  }

  out.warnings.push(
    "Every payment received in this file is imported as a sale. Leave out, or delete afterwards, any that were not sales: money from friends or family, a loan repaid, or a personal item sold at a loss.",
  );
  for (const [market, count] of marketplacePayouts) {
    out.warnings.push(
      `${count} payments from ${market} left out: import ${market}'s own report, which carries the sales behind them.`,
    );
  }
  if (sent.length) {
    out.warnings.push(
      `${sent.length} payments you sent (${usd(sentCents)} in all) left out: a purchase of stock goes in Inventory, and supplies or postage in Expenses.`,
    );
  }
  if (creditsBack.length) {
    out.warnings.push(
      `${creditsBack.length} refunds or reversals credited to you (lines ${creditsBack.slice(0, 5).join(", ")}) left out: if one returns money for stock or an expense, lower that cost instead.`,
    );
  }
  if (unreferencedRefunds) {
    out.warnings.push(
      `${unreferencedRefunds} refunds are for payments outside this file: imported as refunds; check each sale is in the books (an earlier download).`,
    );
  }
  for (const [currency, count] of otherCurrency) {
    out.warnings.push(
      `${count} rows in ${currency} left out: the books are in US dollars. Choose USD in the download, or type the sale in by hand.`,
    );
  }
  return out;
}
