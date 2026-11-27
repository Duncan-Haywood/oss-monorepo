// PayApps plans. Priced by active jobs (projects with status "active"), the unit subcontractors
// think in, plus seats. Prices are the proposals in the public repository's
// portfolio/monetization/models.yaml (row app: private-monorepo/apps/payapps), set against
// PayAppHub ($39.99–$129.99), Trimble Pay's sub plan ($99), SubLien (from $199) and JobTread
// ($199 + $20/user). They are untested hypotheses until the first paying customer.
//
// Checkout is dark: nothing is sold until the owner sets the Paddle secrets (docs/BILLING.md).
import { annualPriceFor, type BillablePlan, definePlanCatalog } from "@billing";

export interface Plan extends BillablePlan {
  name: string;
  description: string;
  /** Active jobs at once; null = unlimited (fair use, see FAIR_USE_ACTIVE_JOBS). */
  maxActiveJobs: number | null;
  /** Members of the organization; null = unlimited. */
  maxMembers: number | null;
  /** Lien waivers per pay app (packages/lien-waivers): Crew and up. */
  lienWaivers: boolean;
  /** Send pay applications to QuickBooks Online as invoices (docs/QUICKBOOKS.md): Crew and up. */
  quickbooks: boolean;
  /** Job costing: cost budgets, costs and the WIP schedule (src/shared/job-cost.ts): Crew and up. */
  jobCosting: boolean;
  /** Bytes of pay-app attachments the org may keep (src/shared/attachments.ts). */
  attachmentStorageBytes: number;
  /** Shown on the plans page. Only list what the app does today or says "coming". */
  features: readonly string[];
}

const MB = 1024 * 1024;
const GB = 1024 * MB;

/** Active jobs assumed for an unlimited plan in the margin test (a large sub, not a ceiling). */
export const FAIR_USE_ACTIVE_JOBS = 200;

export const PLAN_LIST: readonly Plan[] = [
  {
    key: "free",
    name: "Free",
    description:
      "One active job: schedule of values, change orders, retainage, pay-app PDF and CSV.",
    priceCents: 0,
    annualPriceCents: null,
    purchasable: false,
    maxActiveJobs: 1,
    maxMembers: 1,
    lienWaivers: false,
    quickbooks: false,
    jobCosting: false,
    attachmentStorageBytes: 250 * MB,
    features: [
      "1 active job",
      "1 user",
      "Pay apps with retainage",
      "Change orders",
      "PDF + CSV",
      "250 MB of attached backup and photos",
    ],
  },
  {
    key: "solo",
    name: "Solo",
    description: "Up to 5 active jobs for a small subcontractor billing monthly pay applications.",
    priceCents: 9_900,
    annualPriceCents: annualPriceFor(9_900),
    purchasable: true,
    maxActiveJobs: 5,
    maxMembers: 2,
    lienWaivers: false,
    quickbooks: false,
    jobCosting: false,
    attachmentStorageBytes: 5 * GB,
    features: ["5 active jobs", "2 users", "5 GB of attachments", "Everything in Free"],
  },
  {
    key: "crew",
    name: "Crew",
    description: "Up to 20 active jobs and 3 users for a growing specialty contractor.",
    priceCents: 17_900,
    annualPriceCents: annualPriceFor(17_900),
    purchasable: true,
    maxActiveJobs: 20,
    maxMembers: 3,
    lienWaivers: true,
    quickbooks: true,
    jobCosting: true,
    attachmentStorageBytes: 20 * GB,
    features: [
      "20 active jobs",
      "3 users",
      "20 GB of attachments",
      "Everything in Solo",
      "Lien-waiver tracking per pay app, with waiver PDFs (Arizona, California, Florida, Georgia, Michigan, Nevada, Texas, Utah and Wyoming statutory forms, Missouri's residential final waiver and Massachusetts' partial waiver and subordination of lien; general forms where no statutory form applies)",
      "Send pay apps to QuickBooks Online as invoices, with retainage",
      "Job costing: cost budgets per line, costs, and a WIP schedule (percent complete, over/under billing, projected profit)",
    ],
  },
  {
    key: "company",
    name: "Company",
    description: "Unlimited active jobs and users.",
    priceCents: 24_900,
    annualPriceCents: annualPriceFor(24_900),
    purchasable: true,
    maxActiveJobs: null,
    maxMembers: null,
    lienWaivers: true,
    quickbooks: true,
    jobCosting: true,
    attachmentStorageBytes: 50 * GB,
    features: [
      "Unlimited active jobs",
      "Unlimited users",
      "50 GB of attachments",
      "Everything in Crew",
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
    maxActiveJobs: null,
    maxMembers: null,
    lienWaivers: true,
    quickbooks: true,
    jobCosting: true,
    attachmentStorageBytes: 50 * GB,
    features: ["Unlimited active jobs", "Unlimited users"],
  },
];

export const catalog = definePlanCatalog<Plan>(PLAN_LIST);

/** The plan an org without a usable subscription is on. */
export const FREE_PLAN = catalog.get("free") as Plan;
export const COMP_PLAN = catalog.get("comp") as Plan;

/** Plans shown publicly (free + purchasable), in price order. */
export const PUBLIC_PLANS = PLAN_LIST.filter((p) => p.key === "free" || p.purchasable);
