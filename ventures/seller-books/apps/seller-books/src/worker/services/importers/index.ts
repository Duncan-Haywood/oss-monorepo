// Importer registry: one entry per supported report. `detect` lets the upload form auto-pick a report.
import type { Platform } from "@shared/enums";
import { parseAmazonDateRangeReport } from "./amazon";
import { parseDepopSales } from "./depop";
import { parseEbayTransactionReport } from "./ebay";
import { parseEtsySoldOrders, parseEtsyStatement } from "./etsy";
import { parseMercariSalesReport } from "./mercari";
import type { ImportParseResult } from "./parse";
import { parsePaypalActivity } from "./paypal";
import { parsePoshmarkSalesReport } from "./poshmark";
import { parseShopifyOrders, parseShopifyPaymentsTransactions } from "./shopify";
import { parseSquareTransactions } from "./square";
import { parseTiktokShopStatement } from "./tiktok";
import { parseWhatnotOrdersReport } from "./whatnot";

export type { ImportParseResult, ParsedCharge, ParsedFee, ParsedSale } from "./parse";
export { ImportFormatError } from "./parse";

export const REPORTS = {
  ebay_transaction_report: {
    platform: "ebay",
    label: "eBay: Transaction report (Payments > Reports)",
    parse: parseEbayTransactionReport,
  },
  poshmark_my_sales_report: {
    platform: "poshmark",
    label: "Poshmark: My Sales Report",
    parse: parsePoshmarkSalesReport,
  },
  mercari_sales_report: {
    platform: "mercari",
    label: "Mercari: Gross Sales Report",
    parse: parseMercariSalesReport,
  },
  whatnot_orders_report: {
    platform: "whatnot",
    label: "Whatnot: Seller weekly orders report",
    parse: parseWhatnotOrdersReport,
  },
  depop_sales_download: {
    platform: "depop",
    label: "Depop: sales download",
    parse: parseDepopSales,
  },
  etsy_sold_orders: {
    platform: "etsy",
    label: "Etsy: Orders file (EtsySoldOrders)",
    parse: parseEtsySoldOrders,
  },
  etsy_payment_statement: {
    platform: "etsy",
    label: "Etsy: payment account monthly statement",
    parse: parseEtsyStatement,
  },
  shopify_orders_export: {
    platform: "shopify",
    label: "Shopify: orders export (Orders > Export)",
    parse: parseShopifyOrders,
  },
  shopify_payments_transactions: {
    platform: "shopify",
    label: "Shopify Payments: transactions export (Finance > Payouts > View transactions)",
    parse: parseShopifyPaymentsTransactions,
  },
  amazon_date_range_report: {
    platform: "amazon",
    label: "Amazon: Date Range Report, transaction (Payments > Reports Repository)",
    parse: parseAmazonDateRangeReport,
  },
  tiktok_shop_statement: {
    platform: "tiktok",
    label:
      "TikTok Shop: statement, Order details sheet saved as CSV (Finances > Statements > Export)",
    parse: parseTiktokShopStatement,
  },
  square_transactions: {
    platform: "square",
    label: "Square: Transactions CSV (Transactions > Export), card reader and market sales",
    parse: parseSquareTransactions,
  },
  paypal_activity_download: {
    platform: "paypal",
    label:
      "PayPal: Activity download, CSV (Activity > Statements), sales paid by PayPal off the marketplaces",
    parse: parsePaypalActivity,
  },
} as const satisfies Record<
  string,
  { platform: Platform; label: string; parse: (text: string) => ImportParseResult }
>;

export type ReportKey = keyof typeof REPORTS;
export const REPORT_KEYS = Object.keys(REPORTS) as [ReportKey, ...ReportKey[]];
