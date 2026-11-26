// Where each marketplace publishes its seller fees, and which fee kinds each importer reads from the
// platform's own report.
//
// Policy: Seller Books never computes a fee from an assumed rate. Every fee in the books comes from a
// column of the platform's own report (or, when the report gives only gross and net, the difference,
// stored as "marketplace_fee" and labelled as derived). So no rates are recorded here. A rate may be added
// only with the marketplace's own page URL, a verbatim quote and the date it was read (see `FeeRule`);
// test/unit/reference.test.ts enforces that shape.
//
// 2026-11-24: the official fee pages below could not be opened from the build environment, so no rate was
// recorded (`rules: []`). docs/RESEARCH-2026-11-24.md lists the unverified figures found by search, for the
// owner to confirm on the live pages.
import type { FeeKind, Platform } from "@shared/enums";

export interface FeeRule {
  kind: FeeKind;
  description: string;
  /** Verbatim sentence from the marketplace's own page. */
  quote: string;
  url: string;
  /** YYYY-MM-DD the page was read. */
  checkedOn: string;
}

export interface PlatformFeeSource {
  platform: Platform;
  officialPages: string[];
  /** Fee kinds the importer takes from report columns for this platform. */
  feesFromReport: FeeKind[];
  rules: FeeRule[];
  note: string;
}

export const FEE_SOURCES: PlatformFeeSource[] = [
  {
    platform: "ebay",
    officialPages: ["https://www.ebay.com/help/selling/fees-credits-invoices/selling-fees?id=4822"],
    feesFromReport: [
      "final_value",
      "per_order",
      "regulatory",
      "international",
      "advertising",
      "other",
    ],
    rules: [],
    note: "The Transaction report itemises each order's final value fee (variable and fixed parts) and other fees; promoted-listing fees arrive as separate “Other fee” rows.",
  },
  {
    platform: "poshmark",
    officialPages: ["https://support.poshmark.com/s/article/297755057?language=en_US"],
    feesFromReport: ["marketplace_fee", "other"],
    rules: [],
    note: "My Sales Report gives the order price and your net earnings; the difference (less any shipping discount and Texas seller fee tax) is recorded as Poshmark's fee.",
  },
  {
    platform: "mercari",
    officialPages: ["https://www.mercari.com/us/help_center/article/169/"],
    feesFromReport: ["commission", "payment_processing", "other"],
    rules: [],
    note: "The sales report itemises the selling fee, any payment processing fee and shipping adjustments.",
  },
  {
    platform: "whatnot",
    officialPages: [
      "https://www.whatnot.com/seller/fees",
      "https://help.whatnot.com/hc/en-us/articles/4847069165965-Whatnot-seller-fees",
    ],
    feesFromReport: ["commission", "payment_processing", "other"],
    rules: [],
    note: "The orders report itemises commission, tax on commission and payment processing per transaction.",
  },
  {
    platform: "depop",
    officialPages: [
      "https://depophelp.zendesk.com/hc/en-gb/articles/360001791127-Seller-fees-and-charges",
    ],
    feesFromReport: ["payment_processing", "commission", "advertising"],
    rules: [],
    note: "The sales download itemises Depop Payments, selling and boosting fees per sale.",
  },
  {
    platform: "etsy",
    officialPages: ["https://www.etsy.com/legal/fees/"],
    feesFromReport: [
      "payment_processing",
      "transaction",
      "listing",
      "advertising",
      "regulatory",
      "other",
    ],
    rules: [],
    note: "Processing fees come from the Orders file; transaction, listing and ad fees from the payment account statement.",
  },
];
