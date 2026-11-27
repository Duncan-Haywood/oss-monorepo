// Amazon Seller Central "Date Range Report", transaction kind (Payments > Reports Repository > Transaction,
// or the older Reports > Payments > Date Range Reports). docs/IMPORTERS.md#amazon.
//
// One row is one transaction: an Order (one SKU of an order), a Refund, a Service Fee (the selling plan,
// advertising), an FBA Inventory Fee (storage, removal), an Adjustment (reimbursements), a Transfer (a
// payout), and so on. Above the header sit a few lines of preamble ("All amounts in USD, unless specified",
// then definitions); `readTable` skips them.
//
// The money columns add up to "total", which is what the row added to (or took from) the seller's balance:
//   product sales + shipping credits + gift wrap credits + promotional rebates   (what the buyer paid)
//   + the tax columns + marketplace withheld tax                                 (net zero where Amazon collects)
//   + selling fees + fba fees + other transaction fees + Regulatory Fee + other (negative = charged)
//   = total.
// So every fee is read from its own column with its own sign (a fee credited back on a refund is positive in
// the report and becomes a negative fee here), never from a rate.
//
// Column names: Amazon's help pages could not be opened from the build environment (2026-11-26), so the
// names are the widely quoted US layout, matched by name, with the older spellings as fallbacks. IMPORTERS.md
// says so; replace the fixture with a real export before launch.
import type { ChargeKind } from "@shared/enums";
import {
  emptyResult,
  ImportFormatError,
  type ImportParseResult,
  normHeader,
  type ParsedFee,
  parseDate,
  parseMoney,
  readTable,
  rowKey,
  sumFees,
} from "./parse";

const SPEC = {
  date: { names: ["date/time", "date time", "posted date", "date"], required: true },
  settlementId: { names: ["settlement id"] },
  type: { names: ["type", "transaction type"], required: true },
  orderId: { names: ["order id"] },
  sku: { names: ["sku"] },
  description: { names: ["description"] },
  quantity: { names: ["quantity"] },
  marketplace: { names: ["marketplace"] },
  fulfillment: { names: ["fulfillment", "fulfilment"] },
  productSales: { names: ["product sales"] },
  productSalesTax: { names: ["product sales tax", "sales tax collected"] },
  shippingCredits: { names: ["shipping credits"] },
  shippingCreditsTax: { names: ["shipping credits tax"] },
  giftWrap: { names: ["gift wrap credits", "giftwrap credits"] },
  giftWrapTax: { names: ["giftwrap credits tax", "gift wrap credits tax"] },
  regulatory: { names: ["Regulatory Fee"] },
  regulatoryTax: { names: ["Tax On Regulatory Fee"] },
  promoRebates: { names: ["promotional rebates"] },
  promoRebatesTax: { names: ["promotional rebates tax"] },
  withheldTax: {
    names: [
      "marketplace withheld tax",
      "marketplace facilitator tax",
      "Marketplace Facilitator Tax",
    ],
  },
  sellingFees: { names: ["selling fees"] },
  fbaFees: { names: ["fba fees"] },
  otherTransactionFees: { names: ["other transaction fees"] },
  other: { names: ["other"] },
  total: { names: ["total"], required: true },
} as const;

type Field = keyof typeof SPEC;

/** 850 -> "$8.50", by string, for messages. */
const dollars = (cents: number) => {
  const digits = String(Math.abs(cents)).padStart(3, "0");
  return `${cents < 0 ? "-" : ""}$${digits.slice(0, -2)}.${digits.slice(-2)}`;
};

/**
 * What each transaction type is, by normalised name ("FBA Inventory Fee" -> "fbainventoryfee"). Types not
 * listed are skipped with their name, never guessed at.
 */
const TYPES: Record<string, "order" | "refund" | "skip" | ChargeKind> = {
  order: "order",
  liquidations: "order", // FBA liquidation: sold through Amazon's liquidation programme, with its own fees
  refund: "refund",
  chargebackrefund: "refund",
  atozguaranteeclaim: "refund",
  transfer: "skip", // a payout to the bank
  debt: "skip", // a negative balance charged to the card on file: money movement, not a cost
  servicefee: "other", // refined by the description below (subscription, advertising)
  fbainventoryfee: "fulfillment",
  fbacustomerreturnfee: "fulfillment",
  fbatransactionfee: "fulfillment",
  inboundtransportationfee: "fulfillment",
  dealfee: "advertising",
  couponfee: "advertising",
  shippingservices: "shipping_label",
  adjustment: "other",
  liquidationsadjustments: "other",
  feeadjustment: "other",
  amazonfees: "other",
  retrocharge: "other",
  orderretrocharge: "other",
  safetreimbursement: "other",
};

export function parseAmazonDateRangeReport(text: string): ImportParseResult {
  const out = emptyResult("amazon", "date_range_report");
  // The preamble names the currency for the whole file ("All amounts in USD, unless specified").
  const currency = /All amounts in ([A-Z]{3})/i.exec(text.slice(0, 2000))?.[1]?.toUpperCase();
  if (currency && currency !== "USD") {
    throw new ImportFormatError(
      `This report is in ${currency}. Seller Books supports USD only: download the report for amazon.com.`,
    );
  }
  const table = readTable<Field>(text, SPEC, "Amazon Date Range Report (transaction)");
  const col = (f: Field) => table.matched[f];
  out.rowCount = table.rows.length;
  const money = (raw: string | undefined) => parseMoney(raw) ?? 0;
  const seen = new Map<string, number>();
  let otherMarketplace = 0;
  let credits = 0;
  let creditCents = 0;

  for (const row of table.rows) {
    try {
      const rawType = row.get("type") ?? "";
      const type = TYPES[normHeader(rawType)];
      if (!type) {
        out.skipped.push({
          line: row.line,
          reason: rawType
            ? `Transaction type "${rawType}" is not one Seller Books reads yet`
            : "Row with no transaction type",
        });
        continue;
      }
      if (type === "skip") {
        out.skipped.push({ line: row.line, reason: `${rawType} row (money movement, not income)` });
        continue;
      }
      const marketplace = (row.get("marketplace") ?? "").toLowerCase();
      if (marketplace && !/^(www\.)?amazon\.com$/.test(marketplace)) {
        otherMarketplace++;
        out.skipped.push({
          line: row.line,
          reason: `Marketplace ${row.get("marketplace")} (only amazon.com, in USD, is supported)`,
        });
        continue;
      }
      const dateText = row.get("date") ?? "";
      const date = parseDate(dateText);
      if (!date) {
        out.skipped.push({ line: row.line, reason: `Unreadable date "${dateText}"` });
        continue;
      }
      const total = parseMoney(row.get("total"));
      if (total == null) {
        out.skipped.push({ line: row.line, reason: `${rawType} row with no total` });
        continue;
      }
      const orderId = row.get("orderId") || null;
      const sku = row.get("sku") || null;
      const description = row.get("description") || null;
      // The report has no transaction id. Identical rows (two equal storage fees on one statement line)
      // are told apart by their position among equals, which is the same on every download of the file.
      const base = rowKey(
        row.get("settlementId"),
        rawType,
        orderId,
        sku,
        dateText,
        row.get("total"),
        description,
      );
      const n = (seen.get(base) ?? 0) + 1;
      seen.set(base, n);
      const ext = n === 1 ? base : `${base}#${n}`;

      // Fees, each from its own column: the report shows a charge as negative, a credit as positive.
      const fees: ParsedFee[] = [];
      const fee = (kind: ParsedFee["kind"], f: Field) => {
        const v = parseMoney(row.get(f));
        const column = col(f);
        if (v == null || v === 0 || !column) return;
        fees.push({ kind, amountCents: -v, sourceColumn: column });
      };
      fee("commission", "sellingFees");
      fee("fulfillment", "fbaFees");
      fee("other", "otherTransactionFees");
      fee("regulatory", "regulatory");
      fee("other", "regulatoryTax");
      fee("other", "other");

      const itemCents = money(row.get("productSales")) + money(row.get("promoRebates"));
      const shippingCents = money(row.get("shippingCredits")) + money(row.get("giftWrap"));
      const taxCents =
        money(row.get("productSalesTax")) +
        money(row.get("shippingCreditsTax")) +
        money(row.get("giftWrapTax")) +
        money(row.get("promoRebatesTax"));
      const withheldCents = money(row.get("withheldTax"));
      const addsUp = itemCents + shippingCents + taxCents + withheldCents - sumFees(fees) === total;

      if (type === "order" || type === "refund") {
        const hasColumns = col("productSales") !== undefined;
        if (hasColumns && !addsUp) {
          out.warnings.push(
            `Line ${row.line}: the sales, tax and fee columns do not add up to the total (check the order in Seller Central).`,
          );
        }
        if (type === "order") {
          out.sales.push({
            kind: "order",
            externalId: `${ext}:order`,
            orderId,
            date,
            title: description,
            sku,
            quantity: Math.max(1, Number.parseInt(row.get("quantity") ?? "1", 10) || 1),
            // Promotional rebates are the seller's own discounts: they lower what the item sold for.
            itemCents: hasColumns ? itemCents : total + sumFees(fees),
            shippingChargedCents: shippingCents,
            // Tax the buyer paid. Where Amazon collects and remits it, the withheld-tax column takes it back
            // out on the same row, so it never reaches the seller; either way it is not income.
            salesTaxCents: Math.max(0, taxCents),
            refundCents: 0,
            shippingLabelCents: 0,
            netCents: total,
            fees,
          });
        } else {
          // Money back to the buyer. The item and shipping refunded (not the tax, which goes back through
          // Amazon) is the refund; fees credited back are negative fees.
          out.sales.push({
            kind: "refund",
            externalId: `${ext}:refund`,
            orderId,
            date,
            title: description ?? rawType,
            sku,
            quantity: 1,
            itemCents: 0,
            shippingChargedCents: 0,
            salesTaxCents: 0,
            refundCents: hasColumns
              ? Math.max(0, -(itemCents + shippingCents))
              : Math.max(0, -(total + sumFees(fees))),
            shippingLabelCents: 0,
            netCents: total,
            fees,
          });
        }
        continue;
      }

      if (total === 0) {
        out.skipped.push({ line: row.line, reason: `${rawType} row with a zero total` });
        continue;
      }
      // Account-level charges and credits: the total is the amount (negative in the report = a cost).
      let kind: ChargeKind = type;
      if (normHeader(rawType) === "servicefee") {
        const d = (description ?? "").toLowerCase();
        kind = /subscription/.test(d)
          ? "subscription"
          : /advertis|sponsored|coupon|deal|vine/.test(d)
            ? "advertising"
            : "other";
      }
      if (total > 0) {
        credits++;
        creditCents += total;
      }
      out.charges.push({
        externalId: `${ext}:charge`,
        date,
        kind,
        amountCents: -total,
        orderId,
        description: [rawType, description].filter(Boolean).join(": ") || null,
      });
    } catch (e) {
      out.skipped.push({ line: row.line, reason: (e as Error).message });
    }
  }
  if (credits > 0) {
    // FBA reimbursements (lost or damaged stock) and fee refunds raise the balance. They are booked as
    // credits against the fees, so profit is right; on the worksheet they lower line 10.
    out.warnings.push(
      `${credits} account credits (reimbursements or fee refunds, ${dollars(creditCents)} in all) are booked against fees, which lowers Schedule C line 10. A reimbursement for lost or damaged stock may belong on line 6 (other income) instead: ask your preparer, and mark that stock written off.`,
    );
  }
  if (otherMarketplace > 0) {
    out.warnings.push(`${otherMarketplace} rows from other Amazon marketplaces were skipped.`);
  }
  return out;
}
