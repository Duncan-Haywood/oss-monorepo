// CMMC Workspace plans. Level 1 (the 15 FAR 52.204-21 safeguards) is free: it is the front door and
// the upgrade path. Level 2 (the 110 NIST SP 800-171 Rev. 2 requirements, the SPRS score, SSP and
// POA&M) is the paid workspace. Prices are the proposals in the public repository's
// portfolio/monetization/models.yaml (row app: private-monorepo/apps/cmmc), set under FutureFeed
// ($99/$399 a month) and PreVeil Pass ($450 a month for 3 users) and against a consultant's
// $3k-25k for an SSP and POA&M. They are untested hypotheses until the first paying shop.
//
// Checkout is dark: nothing is sold until the owner sets the Paddle secrets (docs/BILLING.md).
import { annualPriceFor, type BillablePlan, definePlanCatalog } from "@billing";

export interface Plan extends BillablePlan {
  name: string;
  description: string;
  /** Record answers, drafts, evidence links and POA&M items on Level 2 requirements. */
  level2: boolean;
  /** Record the ISO 9001 clause checklist (src/shared/quality); everyone can read it. */
  quality: boolean;
  /** Members of the organization; null = unlimited. */
  maxMembers: number | null;
  /** AI implementation-statement drafts per calendar month (UTC); null = unlimited (fair use). */
  draftsPerMonth: number | null;
  /** Bytes of evidence files the org may keep. */
  evidenceStorageBytes: number;
  /** Shown on the billing page. Only list what the app does today. */
  features: readonly string[];
}

const MB = 1024 * 1024;
const GB = 1024 * MB;

/** Drafts assumed for an unlimited plan in the margin test (a busy month, not a ceiling). */
export const FAIR_USE_DRAFTS = 1_000;

export const PLAN_LIST: readonly Plan[] = [
  {
    key: "free",
    name: "Level 1",
    description:
      "The 15 Level 1 safeguards (FAR 52.204-21): status, evidence, SSP and the pass/fail result.",
    priceCents: 0,
    annualPriceCents: null,
    purchasable: false,
    level2: false,
    quality: false,
    maxMembers: 1,
    draftsPerMonth: 10,
    evidenceStorageBytes: 250 * MB,
    features: [
      "Level 1: the 15 FAR 52.204-21 safeguards",
      "1 user",
      "10 AI statement drafts a month",
      "250 MB of evidence",
      "Level 2 requirements to read (recording them needs Level 2)",
      "The ISO 9001 clause checklist to read",
    ],
  },
  {
    key: "level2",
    name: "Level 2",
    description:
      "The 110 NIST SP 800-171 Rev. 2 requirements with objectives, SPRS score, SSP and POA&M for a small shop.",
    priceCents: 24_900,
    annualPriceCents: annualPriceFor(24_900),
    purchasable: true,
    level2: true,
    quality: false,
    maxMembers: 3,
    draftsPerMonth: 150,
    evidenceStorageBytes: 10 * GB,
    features: [
      "Level 2: 110 requirements and 320 assessment objectives",
      "3 users",
      "150 AI statement drafts a month",
      "10 GB of evidence",
      "SPRS score, SSP and POA&M (CSV) with conditional-status checks",
      "Everything in Level 1",
    ],
  },
  {
    key: "team",
    // Key kept as "team" so the Paddle catalog entry and any subscription keep their id.
    name: "Level 2 + Quality",
    description:
      "Level 2 plus the ISO 9001:2015 clause checklist on the same evidence, for a shop where IT, quality and the owner all work in it.",
    priceCents: 39_900,
    annualPriceCents: annualPriceFor(39_900),
    purchasable: true,
    level2: true,
    quality: true,
    maxMembers: 10,
    draftsPerMonth: 400,
    evidenceStorageBytes: 50 * GB,
    features: [
      "Level 2: 110 requirements and 320 assessment objectives",
      "10 users",
      "400 AI statement drafts a month",
      "50 GB of evidence",
      "ISO 9001:2015 clause checklist: status, notes, readiness and a gap report, reusing your CMMC evidence",
      "Everything in Level 2",
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
    level2: true,
    quality: true,
    maxMembers: null,
    draftsPerMonth: null,
    evidenceStorageBytes: 50 * GB,
    features: [
      "Level 2",
      "ISO 9001 checklist",
      "Unlimited users",
      "AI drafts (fair use)",
      "50 GB of evidence",
    ],
  },
];

export const catalog = definePlanCatalog<Plan>(PLAN_LIST);

/** The plan an org without a usable subscription is on. */
export const FREE_PLAN = catalog.get("free") as Plan;
export const COMP_PLAN = catalog.get("comp") as Plan;

/** Plans shown publicly (free + purchasable), in price order. */
export const PUBLIC_PLANS = PLAN_LIST.filter((p) => p.key === "free" || p.purchasable);

/** Level 2 requirement ids look like "AC.L2-3.1.1"; Level 1 like "AC.L1-b.1.i". */
export const isLevel2Control = (controlId: string) => /\.L2-/.test(controlId);

export const formatBytes = (n: number) =>
  n >= GB ? `${Math.round((n / GB) * 10) / 10} GB` : `${Math.round(n / MB)} MB`;

// ---- API shapes (worker and client) -------------------------------------------------------------

export interface PlanDto {
  key: string;
  name: string;
  description: string;
  priceCents: number;
  annualPriceCents: number | null;
  level2: boolean;
  quality: boolean;
  maxMembers: number | null;
  draftsPerMonth: number | null;
  evidenceStorageBytes: number;
  features: string[];
  purchasable: boolean;
}

export interface BillingDto {
  /** The plan whose limits apply now (Level 1 free when there is no usable subscription). */
  plan: { key: string; name: string; level2: boolean; quality: boolean };
  status: "trialing" | "active" | "past_due" | "paused" | "canceled" | "comp" | "none";
  /** True when a subscription exists but no longer grants its plan (free limits apply). */
  lapsed: boolean;
  /** past_due only: when access falls back to the free plan. */
  graceUntil: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  limits: { members: number | null; draftsPerMonth: number | null; evidenceBytes: number };
  usage: { members: number; draftsThisMonth: number; evidenceBytes: number };
  /** YYYY-MM-DD (UTC): the first day of next month, when the draft allowance starts again. */
  allowanceResetsOn: string;
  /** False while paid plans are dark on this deployment. */
  checkoutAvailable: boolean;
  portalAvailable: boolean;
  plans: PlanDto[];
}
