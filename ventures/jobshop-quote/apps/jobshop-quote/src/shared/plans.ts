// Job Shop Quote plans. Priced per shop with a monthly RFQ allowance and seats, the numbers the
// marketing site's pricing page proposes (apps/jobshop-site/src/shared/plans.ts and its
// docs/PRICING.md; a unit test keeps the two in step). Anchored on QuotedPart's $199/mo per shop;
// untested hypotheses until the first paying shop.
//
// What counts as an RFQ: one customer request, counted the first time the AI reads it (extraction).
// Re-reading, editing and re-pricing the same RFQ never counts again.
//
// Checkout is dark: nothing is sold until the owner sets the Paddle secrets (docs/BILLING.md).
import { annualPriceFor, type BillablePlan, definePlanCatalog } from "@billing";

export interface Plan extends BillablePlan {
  name: string;
  description: string;
  /** RFQs the AI may read per calendar month (UTC); null = unlimited (operator grant only). */
  rfqsPerMonth: number | null;
  /** Members of the shop; null = unlimited. */
  maxMembers: number | null;
  /**
   * Ceiling on AI spend per shop per calendar month (UTC), in USD: the backstop behind the RFQ
   * allowance (services/guards/llm-budget.ts `orgCapMicros`). The margin test holds at this ceiling,
   * so even RFQs far larger than the cost model assumes cannot sell a plan below the 40% floor.
   */
  llmMonthlyCapUsd: number;
  /** Shown on the billing page. Only list what the app does today. */
  features: readonly string[];
}

export const PLAN_LIST: readonly Plan[] = [
  {
    // The site's "Early access": free while in development, capped so its cost stays bounded.
    key: "free",
    name: "Early access",
    description: "Free while Job Shop Quote is in development: try it on your own RFQs.",
    priceCents: 0,
    annualPriceCents: null,
    purchasable: false,
    rfqsPerMonth: 40,
    maxMembers: 3,
    llmMonthlyCapUsd: 20,
    features: ["40 RFQs a month", "3 users", "Rate card, quote PDFs and the won/lost log"],
  },
  {
    key: "shop",
    name: "Shop",
    description: "For a shop where the owner or one estimator does the quoting.",
    priceCents: 19_900,
    annualPriceCents: annualPriceFor(19_900),
    purchasable: true,
    rfqsPerMonth: 125,
    maxMembers: 3,
    llmMonthlyCapUsd: 60,
    features: [
      "125 RFQs a month",
      "3 users",
      "AI reads the RFQ email and drawings; every value checked against the source",
      "STEP, DXF, STL and IGES geometry",
      "Quote PDFs, cover notes and the won/lost log",
    ],
  },
  {
    key: "shop_plus",
    name: "Shop Plus",
    description: "For shops with a quoting team or a steady stream of multi-part RFQs.",
    priceCents: 39_900,
    annualPriceCents: annualPriceFor(39_900),
    purchasable: true,
    rfqsPerMonth: 300,
    maxMembers: 10,
    llmMonthlyCapUsd: 150,
    features: ["300 RFQs a month", "10 users", "Everything in Shop"],
  },
  {
    // Granted by an operator (pilots, partners); never sold and never granted by a webhook.
    key: "comp",
    name: "Complimentary",
    description: "Operator-granted access.",
    priceCents: 0,
    annualPriceCents: null,
    purchasable: false,
    rfqsPerMonth: null,
    maxMembers: null,
    llmMonthlyCapUsd: 150,
    features: ["Unlimited RFQs (fair use)", "Unlimited users"],
  },
];

export const catalog = definePlanCatalog<Plan>(PLAN_LIST);

/** The plan a shop without a usable subscription is on. */
export const FREE_PLAN = catalog.get("free") as Plan;
export const COMP_PLAN = catalog.get("comp") as Plan;

/** Plans shown publicly (free + purchasable), in price order. */
export const PUBLIC_PLANS = PLAN_LIST.filter((p) => p.key === "free" || p.purchasable);
