// The platform-admin API contract. Every product serves GET /api/admin/metrics and
// GET /api/admin/accounts in these shapes; apps/admin (the owner console) reads them.
//
// Anti-fabrication: a number the product does not measure is `null` ("not measured"), never 0.
// Money is in minor units per currency (no FX conversion); MRR comes only from the price each
// subscription's Paddle webhook recorded (packages/billing SubscriptionPrice).

export const ADMIN_CONTRACT_VERSION = 1 as const;

/** Header the console sends: `Authorization: Bearer <ADMIN_SERVICE_TOKEN>`. */
export const ADMIN_SERVICE_ACTOR = "admin-console";

export interface DayCount {
  /** UTC day, YYYY-MM-DD. */
  day: string;
  total: number;
  /** Verified (accounts) or confirmed (early access) among `total`; null when not tracked. */
  verified: number | null;
}

export interface WeekCount {
  /** Monday (UTC) starting the ISO week, YYYY-MM-DD. */
  weekStart: string;
  total: number;
  verified: number | null;
}

export interface MoneyByCurrency {
  currency: string;
  amountMinor: number;
}

export interface MrrSummary {
  /** Monthly recurring revenue per currency, from recorded Paddle prices (before tax). */
  byCurrency: MoneyByCurrency[];
  /** Paid subscriptions (active or past_due) whose recorded price went into byCurrency. */
  subscriptionsCounted: number;
  /**
   * Paid subscriptions with no usable recorded price (recorded before prices were stored, a
   * discount whose effect the webhook does not state, or an unsupported cycle). Not in byCurrency.
   */
  subscriptionsUnpriced: number;
  source: "paddle_webhook";
}

/** GET /api/admin/metrics for a product app (signed-in accounts + Paddle subscriptions). */
export interface ProductAdminMetrics {
  contractVersion: typeof ADMIN_CONTRACT_VERSION;
  kind: "app";
  /** Stable key, e.g. "payapps". */
  product: string;
  productName: string;
  generatedAt: string;
  /** Length of the byDay series and of every "last N days" window below. */
  windowDays: number;
  signups: {
    total: number;
    /** null when the product has no email verification (e.g. API-key accounts). */
    verified: number | null;
    unverified: number | null;
    lastWindow: number;
    byDay: DayCount[];
    byWeek: WeekCount[];
  };
  orgs: {
    total: number;
    /** Orgs with activity inside the window; null when the product does not record activity. */
    active: number | null;
    /** What "active" means in this product, in words. */
    activeDefinition: string;
  };
  trials: {
    /** Trialing right now. */
    current: number;
    /** Trials that started inside the window (stamped from webhooks). */
    startedInWindow: number;
    /** All-time trials (stamped) that later became paid. */
    converted: number;
    /** All-time trials (stamped) that ended canceled without ever being paid. */
    expired: number;
    /** Trials are stamped only from the webhooks recorded since stamping shipped. */
    note: string;
  };
  subscriptions: {
    /** Current subscription rows by plan and status (comp and none included, labelled). */
    byPlan: { planKey: string; status: string; count: number }[];
    /** active + past_due rows on purchasable plans. */
    paid: number;
  };
  mrr: MrrSummary;
  cancellations: {
    /** Subscriptions whose cancel was recorded inside the window. */
    inWindow: number;
    /** Paid subscriptions set to cancel at the end of the period. */
    scheduled: number;
  };
  failedPayments: {
    /** Paddle transaction.payment_failed events received inside the window; null if not recorded. */
    inWindow: number | null;
    /** Subscriptions past_due right now. */
    pastDueNow: number;
  };
  /** Measured LLM spend (micro-USD); null when the product makes no LLM calls or does not record them. */
  llmSpend: {
    monthToDateMicros: number;
    windowMicros: number;
  } | null;
}

/** GET /api/admin/metrics for a marketing site's early-access list. */
export interface EarlyAccessMetrics {
  contractVersion: typeof ADMIN_CONTRACT_VERSION;
  kind: "early_access";
  product: string;
  productName: string;
  generatedAt: string;
  windowDays: number;
  total: number;
  /** Double opt-in confirmed; null on a single opt-in list. */
  confirmed: number | null;
  unsubscribed: number | null;
  lastWindow: number;
  byDay: DayCount[];
  /** Sign-ups by the page (or form source) they came from. */
  bySource: { source: string; count: number }[];
}

export type AdminMetrics = ProductAdminMetrics | EarlyAccessMetrics;

/** Which list GET /api/admin/accounts returns. */
export const ADMIN_ACCOUNT_LISTS = ["recent", "trials", "churn"] as const;
export type AdminAccountList = (typeof ADMIN_ACCOUNT_LISTS)[number];

/**
 * One account (org) for the owner. Only what the owner needs: names, the owner's email, plan.
 * Never tenant content.
 */
export interface AdminAccountDto {
  orgId: string;
  orgName: string;
  createdAt: string;
  owner: { name: string | null; email: string; emailVerified: boolean | null } | null;
  planKey: string | null;
  status: string | null;
  trialStartedAt: string | null;
  firstPaidAt: string | null;
  canceledAt: string | null;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
  /** This subscription's MRR from its recorded price; null when unpaid or unpriced. */
  mrr: MoneyByCurrency | null;
}

/** An early-access sign-up (marketing sites). */
export interface AdminSignupDto {
  id: string;
  email: string;
  name: string | null;
  source: string | null;
  confirmed: boolean | null;
  createdAt: string;
}

export interface AdminAccountsPage {
  contractVersion: typeof ADMIN_CONTRACT_VERSION;
  kind: "app";
  product: string;
  list: AdminAccountList;
  items: AdminAccountDto[];
  /** Lists are capped at `limit` (max 200); no paging at this scale. */
  limit: number;
}

/** GET /api/admin/accounts on a marketing site: the newest early-access sign-ups. */
export interface AdminSignupsPage {
  contractVersion: typeof ADMIN_CONTRACT_VERSION;
  kind: "early_access";
  product: string;
  list: "recent";
  items: AdminSignupDto[];
  limit: number;
}
