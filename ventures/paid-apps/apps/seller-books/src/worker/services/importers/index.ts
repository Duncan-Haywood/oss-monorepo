// Importer registry: one entry per supported report. `detect` lets the upload form auto-pick a report.
import type { Platform } from "@shared/enums";
import { parseDepopSales } from "./depop";
import { parseEbayTransactionReport } from "./ebay";
import { parseEtsySoldOrders, parseEtsyStatement } from "./etsy";
import { parseMercariSalesReport } from "./mercari";
import type { ImportParseResult } from "./parse";
import { parsePoshmarkSalesReport } from "./poshmark";
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
    label: "Mercari: sales report",
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
} as const satisfies Record<
  string,
  { platform: Platform; label: string; parse: (text: string) => ImportParseResult }
>;

export type ReportKey = keyof typeof REPORTS;
export const REPORT_KEYS = Object.keys(REPORTS) as [ReportKey, ...ReportKey[]];
