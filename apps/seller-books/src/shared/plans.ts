// Seller Books plans. Prices and order allowances are the proposal on the marketing site
// (apps/seller-books-site/src/content.mjs TIERS, docs/PRICING.md there): Side hustle $15, Full time
// $35, Business $69 a month, annual = 10 × monthly. They are untested hypotheses until the first
// paying seller. The free plan is this app's own addition: one platform, one user and a small,
// hard order cap, so a seller can see their own numbers before paying.
//
// Checkout is dark: nothing is sold until the owner sets the Paddle secrets (docs/BILLING.md).
import { type BillablePlan, definePlanCatalog } from "@billing";

export interface Plan extends BillablePlan {
  name: string;
  description: string;
  /** Distinct marketplaces the org may import from; null = all supported platforms. */
  maxPlatforms: number | null;
  /** Members of the organization; null = unlimited. */
  maxMembers: number | null;
  /** Orders a calendar month (by sale date, all platforms). null = unlimited. */
  ordersPerMonth: number | null;
  /**
   * True: an import that would take a month over `ordersPerMonth` is refused (free plan only).
   * False: the allowance is a guide; going over never blocks anything, the billing page suggests a
   * bigger plan (the site's promise: "going over the order cap in a busy month never locks anything").
   */
  hardOrderCap: boolean;
  /** Shown on the billing page. Only list what the app does today. */
  features: readonly string[];
}

export const PLAN_LIST: readonly Plan[] = [
  {
    key: "free",
    name: "Free",
    description: "One platform and up to 25 orders a month: see your own profit before you pay.",
    priceCents: 0,
    annualPriceCents: null,
    purchasable: false,
    maxPlatforms: 1,
    maxMembers: 1,
    ordersPerMonth: 25,
    hardOrderCap: true,
    features: [
      "1 platform",
      "Up to 25 orders a month",
      "Fees, cost of goods and profit per sale",
      "Mileage and expense logs",
      "Schedule C worksheet",
    ],
  },
  {
    key: "side",
    name: "Side hustle",
    description: "Selling part time on one or two platforms.",
    priceCents: 1_500,
    annualPriceCents: 15_000,
    purchasable: true,
    maxPlatforms: 2,
    maxMembers: 1,
    ordersPerMonth: 100,
    hardOrderCap: false,
    features: [
      "Up to 2 platforms",
      "About 100 orders a month (going over never locks anything)",
      "Fees, cost of goods and profit per sale",
      "Bulk lots split across items",
      "Mileage and expense logs",
      "Schedule C worksheet and CSV export",
    ],
  },
  {
    key: "fulltime",
    name: "Full time",
    description: "Reselling is your main work and you crosslist on every platform.",
    priceCents: 3_500,
    annualPriceCents: 35_000,
    purchasable: true,
    maxPlatforms: null,
    maxMembers: 1,
    ordersPerMonth: 600,
    hardOrderCap: false,
    features: [
      "All 6 platforms: eBay, Poshmark, Mercari, Whatnot, Depop, Etsy",
      "About 600 orders a month (going over never locks anything)",
      "Monthly profit by platform",
      "Year-end inventory at cost",
      "Everything in Side hustle",
    ],
  },
  {
    key: "business",
    name: "Business",
    description: "A reselling business with a helper, a bookkeeper or a tax preparer.",
    priceCents: 6_900,
    annualPriceCents: 69_000,
    purchasable: true,
    maxPlatforms: null,
    maxMembers: 4,
    ordersPerMonth: 2_500,
    hardOrderCap: false,
    features: [
      "All 6 platforms",
      "About 2,500 orders a month (going over never locks anything)",
      "Up to 3 extra users (a helper, your bookkeeper or tax preparer)",
      "Everything in Full time",
    ],
  },
  {
    // Granted by an operator (pilots, partners); never sold and never granted by a webhook.
    key: "comp",
    name: "Complimentary",
    description: "Operator-granted access.",
    priceCents: 0,
    annualPriceCents: null,
    purchasable: false,
    maxPlatforms: null,
    maxMembers: null,
    ordersPerMonth: null,
    hardOrderCap: false,
    features: ["All 6 platforms", "Unlimited orders", "Unlimited users"],
  },
];

export const catalog = definePlanCatalog<Plan>(PLAN_LIST);

/** The plan an org without a usable subscription is on. */
export const FREE_PLAN = catalog.get("free") as Plan;
export const COMP_PLAN = catalog.get("comp") as Plan;

/** Plans shown publicly (free + purchasable), in price order. */
export const PUBLIC_PLANS = PLAN_LIST.filter((p) => p.key === "free" || p.purchasable);

/**
 * The cheapest sold plan that fits a seller's busiest month and platform count, or null when none
 * does (more than the Business allowance: talk to us).
 */
export function planFor(busiestMonthOrders: number, platforms: number): Plan | null {
  return (
    catalog.purchasable.find(
      (p) =>
        (p.ordersPerMonth === null || busiestMonthOrders <= p.ordersPerMonth) &&
        (p.maxPlatforms === null || platforms <= p.maxPlatforms),
    ) ?? null
  );
}

// ---- API shapes (worker and client) -------------------------------------------------------------

export interface PlanDto {
  key: string;
  name: string;
  description: string;
  priceCents: number;
  annualPriceCents: number | null;
  maxPlatforms: number | null;
  maxMembers: number | null;
  ordersPerMonth: number | null;
  hardOrderCap: boolean;
  features: string[];
  purchasable: boolean;
}

export interface BillingDto {
  /** The plan whose limits apply now (Free when there is no usable subscription). */
  plan: { key: string; name: string };
  status: "trialing" | "active" | "past_due" | "paused" | "canceled" | "comp" | "none";
  /** True when a subscription exists but no longer grants its plan (free limits apply). */
  lapsed: boolean;
  /** past_due only: when access falls back to the free plan. */
  graceUntil: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  limits: {
    platforms: number | null;
    members: number | null;
    ordersPerMonth: number | null;
    hardOrderCap: boolean;
  };
  usage: {
    /** Platforms with at least one import. */
    platforms: string[];
    members: number;
    /** Orders dated in the current calendar month (UTC). */
    ordersThisMonth: number;
    /** The month (YYYY-MM) with the most orders in the last 12 months, and its count. */
    busiestMonth: { month: string; orders: number } | null;
  };
  /** The cheapest sold plan that fits the usage, when it is not the current plan. */
  suggestedPlan: string | null;
  /** False while paid plans are dark on this deployment. */
  checkoutAvailable: boolean;
  portalAvailable: boolean;
  plans: PlanDto[];
}
