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
// 2026-11-26: Mercari's fee page (article 169) and report article (541) rendered in a browser; its selling fee
// is recorded below with the verbatim sentence. eBay's help pages still answer with a bot check.
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
    officialPages: [
      "https://www.mercari.com/us/help_center/article/169/",
      "https://www.mercari.com/us/help_center/article/541/",
    ],
    feesFromReport: ["commission", "payment_processing", "other"],
    // Recorded for reference only: the importer still takes every fee from the report's own columns.
    rules: [
      {
        kind: "commission",
        description:
          "10% selling fee on item price plus buyer-paid shipping, for listings created or updated from 6 January 2025",
        quote:
          "A 10% selling fee of the combined amount of item price and buyer-paid shipping will be charged to the seller.",
        url: "https://www.mercari.com/us/help_center/article/169/",
        checkedOn: "2026-11-26",
      },
    ],
    note: "The Gross Sales Report itemises the selling fee, any payment processing fee and shipping adjustments; Mercari charges them when an order completes, so only completed orders are booked.",
  },
  {
    platform: "whatnot",
    officialPages: [
      "https://www.whatnot.com/seller/fees",
      "https://help.whatnot.com/hc/en-us/articles/4847069165965-Whatnot-seller-fees",
    ],
    feesFromReport: ["commission", "payment_processing", "other"],
    rules: [],
    note: "The weekly orders report itemises commission, payment processing and the taxes on both per transaction (help article 36772664621837, read 2026-11-26). Commission rates are tiered by four-week sales and category, so no single rate is recorded.",
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
  {
    platform: "shopify",
    officialPages: [
      "https://help.shopify.com/en/manual/payments/shopify-payments/payouts/pay-periods-and-fees",
      "https://help.shopify.com/en/manual/payments/shopify-payments/payouts/view-details",
    ],
    feesFromReport: ["payment_processing", "other"],
    rules: [],
    note: "The Shopify Payments transactions export gives the fee on every charge (help page “Transaction CSV file columns”, read 2026-11-26); chargebacks, chargeback fees and other adjustments arrive as their own rows. Rates depend on the Shopify plan and card, so none is recorded. The monthly Shopify subscription is on the Shopify bill: add it as an expense unless it was paid from the Payments balance.",
  },
  {
    platform: "amazon",
    officialPages: ["https://sell.amazon.com/pricing"],
    feesFromReport: ["commission", "fulfillment", "regulatory", "advertising", "other"],
    rules: [],
    note: "The Date Range Report (transaction) gives selling (referral) fees, FBA fees and other transaction fees on every order row, and storage, advertising and the selling plan as their own rows. Referral rates vary by category and FBA fees by size tier, so none is recorded. Amazon's help pages could not be opened from the build environment on 2026-11-26.",
  },
  {
    platform: "tiktok",
    officialPages: ["https://seller-us.tiktok.com/university/essay?knowledge_id=2336057241700098"],
    feesFromReport: ["commission", "payment_processing", "advertising", "marketplace_fee", "other"],
    rules: [],
    note: "The statement's Order details sheet gives the referral fee, refund administration fee, transaction fee and affiliate (creator) commissions per order, with adjustments as their own rows. Seller University defines the total settlement amount as net sales + shipping + fees + adjustment amount. Referral rates vary by category and have changed (6% is widely quoted; an 8% rise from 2026-08-04 is reported but not confirmed on TikTok's own pages), so none is recorded. TikTok's help pages could not be opened from the build environment on 2026-11-26.",
  },
  {
    platform: "square",
    officialPages: ["https://squareup.com/help/us/en/article/5200-square-glossary"],
    feesFromReport: ["payment_processing"],
    rules: [],
    note: "The Transactions CSV gives Square's fee on every payment (glossary: \u201cFees: The amount of fees collected at the time of payment processing or service (excludes taxes)\u201d, read 2026-11-26). Rates depend on how the card was taken (tapped, keyed, online) and the seller's plan, so none is recorded. Cash payments carry no fee.",
  },
];
