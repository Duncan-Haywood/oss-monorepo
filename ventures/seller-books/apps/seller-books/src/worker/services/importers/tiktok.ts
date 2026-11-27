// TikTok Shop settlement statement, "Order details" sheet (Seller Center > Finances > Statements > Export;
// the export is an Excel workbook: save its "Order details" sheet as CSV). docs/IMPORTERS.md#tiktok-shop.
//
// One row is one settled order line (Type "Order") or one adjustment (a reimbursement, a deduction, a
// logistics or ads charge) with its own Type. TikTok Shop defines the row's total as
//   Total settlement amount = Net sales + Shipping + Fees + Adjustment amount
// (Seller University, settlement report fields), so in that layout fees and shipping costs are negative and
// add straight up to the total. Some guides quote the same file with costs as positive numbers
// ("Net sales - Shipping - Fees + Adjustments"), so the sign is read from the file: if any fee or shipping
// cost cell is negative the file is signed, otherwise costs are positive. Either way every fee comes from
// its own column, never from a rate; whatever the itemised fee columns leave of the "Fees" subtotal is
// kept as an unitemised fee so the books still add up to the settlement.
//
// Column names: TikTok's help pages list the fields but not always their exact header strings. The names
// below come from the Seller University field definitions, TikTok's Finance API field names and an MIT
// column dictionary (github.com/Perufitlife/tiktok-shop-settlement); none was checked against a real
// download from this environment. Matched by name, so a changed header fails loudly. IMPORTERS.md says so.
import type { ChargeKind, FeeKind } from "@shared/enums";
import {
  emptyResult,
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
  type: { names: ["Type", "Transaction type"], required: true },
  total: { names: ["Total settlement amount", "Settlement amount"], required: true },
  statementDate: { names: ["Statement date", "Settlement date", "Order settled time"] },
  orderCreated: { names: ["Order created date", "Order created time", "Order date"] },
  statementId: { names: ["Statement ID"] },
  currency: { names: ["Currency"] },
  orderId: { names: ["Order/adjustment ID", "Order ID", "Adjustment ID"] },
  relatedOrderId: { names: ["Related order ID"] },
  sku: { names: ["Seller SKU", "SKU ID", "SKU"] },
  product: { names: ["Product name", "Product"] },
  quantity: { names: ["Quantity"] },
  netSales: { names: ["Net sales"] },
  grossSales: { names: ["Gross sales", "Subtotal before discounts"] },
  grossSalesRefund: { names: ["Gross sales refund", "Refund subtotal before discounts"] },
  sellerDiscount: { names: ["Seller discount"] },
  sellerDiscountRefund: { names: ["Seller discount refund"] },
  shipping: { names: ["Shipping", "Shipping total"] },
  tiktokShippingFee: { names: ["TikTok Shop shipping fee", "Actual shipping fee"] },
  customerShipping: { names: ["Customer-paid shipping fee", "Customer paid shipping fee"] },
  shippingInsurance: { names: ["Shipping insurance fee"] },
  returnShipping: { names: ["Return shipping fee"] },
  fees: { names: ["Fees", "Total fees"] },
  referralFee: { names: ["Referral fee"] },
  transactionFee: { names: ["Transaction fee"] },
  refundAdminFee: { names: ["Refund administration fee"] },
  affiliateCommission: { names: ["Affiliate commission"] },
  affiliatePartnerCommission: { names: ["Affiliate partner commission"] },
  affiliateAdsCommission: { names: ["Affiliate shop ads commission"] },
  adjustment: { names: ["Adjustment amount"] },
  salesTaxPayment: { names: ["Sales tax payment", "Sales tax"] },
} as const;

type Field = keyof typeof SPEC;

/** Itemised fee columns and the kind each is booked as. Creator commissions are a marketing cost. */
const FEE_COLUMNS: [Field, FeeKind][] = [
  ["referralFee", "commission"],
  ["refundAdminFee", "commission"],
  ["transactionFee", "payment_processing"],
  ["affiliateCommission", "advertising"],
  ["affiliatePartnerCommission", "advertising"],
  ["affiliateAdsCommission", "advertising"],
];

/** Cost columns whose sign tells which layout the file uses. */
const COST_COLUMNS: Field[] = [
  "fees",
  ...FEE_COLUMNS.map(([f]) => f),
  "tiktokShippingFee",
  "shippingInsurance",
  "returnShipping",
];

/** 850 -> "$8.50", by string, for messages. */
const dollars = (cents: number) => {
  const digits = String(Math.abs(cents)).padStart(3, "0");
  return `${cents < 0 ? "-" : ""}$${digits.slice(0, -2)}.${digits.slice(-2)}`;
};

type RowKind = "order" | "refund" | "skip" | "adjustment";

function rowKind(rawType: string): RowKind {
  const t = normHeader(rawType);
  if (/reserve|payout|withdraw|transfer/.test(t)) return "skip";
  if (/refund|return/.test(t)) return "refund";
  if (/order|sale/.test(t) && !/adjust/.test(t)) return "order";
  return "adjustment";
}

function adjustmentKind(text: string): ChargeKind {
  const t = text.toLowerCase();
  if (/shipping|logistic|label|postage/.test(t)) return "shipping_label";
  if (/\bads?\b|advertis|promot|campaign|gmv max/.test(t)) return "advertising";
  return "other";
}

export function parseTiktokShopStatement(text: string): ImportParseResult {
  const out = emptyResult("tiktok", "statement_order_details");
  const table = readTable<Field>(text, SPEC, "TikTok Shop statement (Order details sheet)");
  const col = (f: Field) => table.matched[f];
  const has = (f: Field) => col(f) !== undefined;
  out.rowCount = table.rows.length;
  const money = (raw: string | undefined) => parseMoney(raw) ?? 0;

  // Signed layout (TikTok's own definition): a cost is negative. Otherwise costs are positive numbers.
  const signed = table.rows.some((row) => COST_COLUMNS.some((f) => money(row.get(f)) < 0));
  /** A cost cell as cents charged to the seller (negative = credited back). */
  const cost = (raw: string | undefined) => (signed ? -money(raw) : money(raw));

  const seen = new Map<string, number>();
  const offLines: number[] = [];
  let otherCurrency = 0;
  let credits = 0;
  let creditCents = 0;
  let refundsByStatementDate = 0;

  for (const row of table.rows) {
    try {
      const rawType = row.get("type") ?? "";
      if (!rawType) {
        out.skipped.push({ line: row.line, reason: "Row with no type" });
        continue;
      }
      const kind = rowKind(rawType);
      if (kind === "skip") {
        out.skipped.push({ line: row.line, reason: `${rawType} row (money movement, not income)` });
        continue;
      }
      const currency = (row.get("currency") ?? "").toUpperCase();
      if (currency && currency !== "USD") {
        otherCurrency++;
        out.skipped.push({
          line: row.line,
          reason: `Currency ${currency} (only US shops, in USD, are supported)`,
        });
        continue;
      }
      const statementDateText = row.get("statementDate") ?? "";
      const createdText = row.get("orderCreated") ?? "";
      const statementDate = parseDate(statementDateText);
      const created = parseDate(createdText);
      const saleDate = created ?? statementDate;
      if (!saleDate) {
        out.skipped.push({
          line: row.line,
          reason: `Unreadable date "${createdText || statementDateText}"`,
        });
        continue;
      }
      const total = parseMoney(row.get("total"));
      if (total == null) {
        out.skipped.push({ line: row.line, reason: `${rawType} row with no settlement amount` });
        continue;
      }
      const orderId = row.get("orderId") || row.get("relatedOrderId") || null;
      const sku = row.get("sku") || null;
      const title = row.get("product") || null;
      const base = rowKey(row.get("statementId"), rawType, orderId, sku, row.get("total"));
      const n = (seen.get(base) ?? 0) + 1;
      seen.set(base, n);
      const ext = n === 1 ? base : `${base}#${n}`;

      if (kind === "adjustment") {
        const amount =
          has("adjustment") && money(row.get("adjustment")) !== 0
            ? money(row.get("adjustment"))
            : total;
        if (amount === 0) {
          out.skipped.push({ line: row.line, reason: `${rawType} row with a zero amount` });
          continue;
        }
        if (amount > 0) {
          credits++;
          creditCents += amount;
        }
        out.charges.push({
          externalId: `${ext}:charge`,
          date: statementDate ?? saleDate,
          kind: adjustmentKind(`${rawType} ${title ?? ""}`),
          amountCents: -amount,
          orderId,
          description: [rawType, title].filter(Boolean).join(": "),
        });
        continue;
      }

      // Fees, each from its own column; what the itemised columns leave of the subtotal stays a fee.
      const fees: ParsedFee[] = [];
      for (const [f, feeKind] of FEE_COLUMNS) {
        const v = cost(row.get(f));
        const column = col(f);
        if (v !== 0 && column) fees.push({ kind: feeKind, amountCents: v, sourceColumn: column });
      }
      if (has("fees")) {
        const rest = cost(row.get("fees")) - sumFees(fees);
        if (rest !== 0) {
          fees.push({
            kind: fees.length ? "other" : "marketplace_fee",
            amountCents: rest,
            sourceColumn: `${col("fees")} (not itemised)`,
          });
        }
      }

      // Item value after the seller's own discounts, and the part of it refunded on this row.
      let itemCents: number;
      let refundCents: number;
      if (has("grossSales")) {
        itemCents =
          Math.abs(money(row.get("grossSales"))) - Math.abs(money(row.get("sellerDiscount")));
        refundCents =
          Math.abs(money(row.get("grossSalesRefund"))) -
          Math.abs(money(row.get("sellerDiscountRefund")));
      } else {
        const net = money(row.get("netSales"));
        itemCents = Math.max(0, net);
        refundCents = Math.max(0, -net);
      }
      if (kind === "refund" && itemCents > 0 && refundCents === 0) {
        // A row typed as a refund whose amounts are shown positive.
        refundCents = itemCents;
        itemCents = 0;
      }

      // Shipping: what the buyer paid, and the postage TikTok Shop charged for the label.
      let shippingChargedCents: number;
      let shippingLabelCents: number;
      if (has("shipping")) {
        const netShipping = signed ? money(row.get("shipping")) : -money(row.get("shipping"));
        shippingChargedCents = has("customerShipping")
          ? Math.abs(money(row.get("customerShipping")))
          : Math.max(0, netShipping);
        shippingLabelCents = shippingChargedCents - netShipping;
        if (shippingLabelCents < 0) {
          shippingChargedCents -= shippingLabelCents;
          shippingLabelCents = 0;
        }
      } else {
        shippingChargedCents = Math.abs(money(row.get("customerShipping")));
        shippingLabelCents =
          cost(row.get("tiktokShippingFee")) +
          cost(row.get("shippingInsurance")) +
          cost(row.get("returnShipping"));
      }

      const adjustmentOnRow = money(row.get("adjustment"));
      if (adjustmentOnRow !== 0) {
        out.charges.push({
          externalId: `${ext}:adjustment`,
          date: statementDate ?? saleDate,
          kind: "other",
          amountCents: -adjustmentOnRow,
          orderId,
          description: `${rawType}: adjustment amount`,
        });
        if (adjustmentOnRow > 0) {
          credits++;
          creditCents += adjustmentOnRow;
        }
      }

      const salesTaxCents = Math.abs(money(row.get("salesTaxPayment")));
      const orderNet = itemCents + shippingChargedCents - shippingLabelCents - sumFees(fees);
      if (orderNet - refundCents + adjustmentOnRow !== total) offLines.push(row.line);
      const quantity = Math.max(1, Number.parseInt(row.get("quantity") ?? "1", 10) || 1);

      if (itemCents > 0) {
        out.sales.push({
          kind: "order",
          externalId: `${ext}:order`,
          orderId,
          date: saleDate,
          title,
          sku,
          quantity,
          itemCents,
          shippingChargedCents,
          // Tax the buyer paid, collected and sent to the state by TikTok Shop: never income.
          salesTaxCents,
          refundCents: 0,
          shippingLabelCents,
          netCents: orderNet,
          fees,
        });
      }
      if (refundCents > 0) {
        const refundDate = statementDate ?? saleDate;
        if (itemCents > 0 && refundDate !== saleDate) refundsByStatementDate++;
        const alone = itemCents <= 0;
        out.sales.push({
          kind: "refund",
          externalId: `${ext}:refund`,
          orderId,
          date: refundDate,
          title: title ?? rawType,
          sku,
          quantity: 1,
          itemCents: 0,
          shippingChargedCents: 0,
          salesTaxCents: 0,
          refundCents,
          // A row that is only a refund carries its own fee credits and return postage.
          shippingLabelCents: alone ? shippingLabelCents : 0,
          netCents: alone ? total - adjustmentOnRow : -refundCents,
          fees: alone ? fees : [],
        });
      }
      if (itemCents <= 0 && refundCents <= 0) {
        out.skipped.push({ line: row.line, reason: `${rawType} row with no sales amount` });
      }
    } catch (e) {
      out.skipped.push({ line: row.line, reason: (e as Error).message });
    }
  }

  if (offLines.length > 0) {
    const shown = offLines.slice(0, 5).join(", ");
    out.warnings.push(
      `${offLines.length} rows (line${offLines.length > 1 ? "s" : ""} ${shown}${offLines.length > 5 ? ", ..." : ""}) do not add up: net sales, shipping, fees and adjustments differ from the total settlement amount. Check those orders in Seller Center; the sale and fees are booked as the file shows them.`,
    );
  }
  if (refundsByStatementDate > 0) {
    out.warnings.push(
      `${refundsByStatementDate} refunds are dated on their statement date, the day TikTok Shop settled them (the file has no separate refund date).`,
    );
  }
  if (credits > 0) {
    out.warnings.push(
      `${credits} credits (reimbursements or fee refunds, ${dollars(creditCents)} in all) are booked against fees, which lowers Schedule C line 10. A reimbursement for lost or damaged stock may belong on line 6 (other income) instead: ask your preparer, and mark that stock written off.`,
    );
  }
  if (otherCurrency > 0) {
    out.warnings.push(`${otherCurrency} rows in other currencies were skipped.`);
  }
  return out;
}
