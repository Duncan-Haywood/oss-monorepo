import { listAllPages } from "../stripe/list-all-pages";

/**
 * Stripe Connect Express account creation + onboarding-link generation +
 * status checking for commerce-payouts-stripe-connect (tier-6 empty-backlog
 * scaffold, 2026-07-20). ACCOUNT CREATION AND STATUS-CHECKING ONLY — this
 * module never moves money (no transfers, no destination charges). Commerce
 * Buy now revenue still lands entirely in the platform's own Stripe account
 * (STRIPE_SECRET_KEY) until a future, counsel-reviewed iteration wires actual
 * payouts. Dormant behind ALLOW_STRIPE_CONNECT_ONBOARDING (see
 * stripe-connect-gate.ts), default OFF.
 *
 * The Stripe client is passed in behind a minimal structural interface (not
 * `import Stripe from "stripe"` types) so this stays unit testable with a
 * fake client — mirrors src/lib/pricing/bootstrap-stripe-prices.ts and
 * src/lib/commerce/stripe-sync.ts. Only the dashboard action that calls this
 * constructs the real `new Stripe(secretKey)` client and gates on
 * assessStripeConnectOnboardingGate.
 */

type MinimalStripeConnectAccount = {
  id: string;
  metadata?: Record<string, string>;
  charges_enabled?: boolean;
  payouts_enabled?: boolean;
  details_submitted?: boolean;
};

type MinimalStripeAccountLink = { url: string };

/** Interface subset this module calls — matches the real Stripe SDK shape. */
export interface StripeConnectAccountsClient {
  accounts: {
    list(params: {
      limit: number;
      starting_after?: string;
    }): Promise<{ data: MinimalStripeConnectAccount[]; has_more: boolean }>;
    create(
      params: {
        type: "express";
        email?: string;
        business_type?: "company" | "individual";
        capabilities: { card_payments: { requested: true }; transfers: { requested: true } };
        metadata: Record<string, string>;
      },
      options?: { idempotencyKey?: string },
    ): Promise<MinimalStripeConnectAccount>;
    retrieve(accountId: string): Promise<MinimalStripeConnectAccount>;
  };
  accountLinks: {
    create(params: {
      account: string;
      refresh_url: string;
      return_url: string;
      type: "account_onboarding";
    }): Promise<MinimalStripeAccountLink>;
  };
}

/** Metadata key used to idempotently locate a lead's Connect account across retries. */
const LEAD_SLUG_METADATA_KEY = "local_site_studio_lead_slug";

/**
 * Stable Stripe Idempotency-Key for a lead's account.create call — mirrors
 * commerceSkuStripeKey's stable-metadata-key pattern, but as a real Stripe
 * idempotency key rather than a post-hoc metadata search. The list-then-create
 * check in findConnectAccountByLeadSlug is a check-then-act race: two
 * concurrent createExpressConnectAccount calls for the same lead (a
 * double-click, or two open dashboard tabs) can both see no existing account
 * and both call accounts.create, minting two permanently-orphaned Express
 * accounts under the same lead-slug metadata. Passing this key as the
 * request's Idempotency-Key closes that race at the Stripe API layer: Stripe
 * guarantees at most one account is ever created for a given key, and any
 * replayed request (including a genuinely concurrent one) gets back the
 * identical first response instead of minting a duplicate.
 */
function connectAccountIdempotencyKey(leadSlug: string): string {
  return `local_site_studio_connect_account_${leadSlug}`;
}

export type ConnectAccountResult = { accountId: string; created: boolean };

async function findConnectAccountByLeadSlug(
  stripe: StripeConnectAccountsClient,
  leadSlug: string,
): Promise<MinimalStripeConnectAccount | null> {
  const matchesSlug = (account: MinimalStripeConnectAccount) =>
    account.metadata?.[LEAD_SLUG_METADATA_KEY] === leadSlug;
  const listed = await listAllPages(
    (starting_after) => stripe.accounts.list({ limit: 100, starting_after }),
    matchesSlug,
  );
  return listed.find(matchesSlug) ?? null;
}

/**
 * Create (or find, if a prior call already created one for this lead — e.g.
 * after a Convex persist failure on retry) a Stripe Connect Express account
 * for a local business. Requests card_payments + transfers capabilities (the
 * standard Express shape so the account is ready once payout wiring ships)
 * but this call alone never moves money — capabilities stay unused until a
 * future charge/transfer flow reads accountId.
 */
export async function createExpressConnectAccount(
  stripe: StripeConnectAccountsClient,
  params: { leadSlug: string; email?: string; businessName: string },
): Promise<ConnectAccountResult> {
  const existing = await findConnectAccountByLeadSlug(stripe, params.leadSlug);
  if (existing) {
    return { accountId: existing.id, created: false };
  }

  const account = await stripe.accounts.create(
    {
      type: "express",
      email: params.email,
      business_type: "company",
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      metadata: {
        [LEAD_SLUG_METADATA_KEY]: params.leadSlug,
        local_site_studio_business_name: params.businessName,
      },
    },
    { idempotencyKey: connectAccountIdempotencyKey(params.leadSlug) },
  );
  return { accountId: account.id, created: true };
}

/**
 * Generate a Stripe-hosted Connect Express onboarding link for an
 * already-created account. The operator sends this URL to the client, who
 * completes their own KYC/bank details on Stripe's hosted flow.
 */
export async function createConnectOnboardingLink(
  stripe: StripeConnectAccountsClient,
  accountId: string,
  urls: { refreshUrl: string; returnUrl: string },
): Promise<{ url: string }> {
  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: urls.refreshUrl,
    return_url: urls.returnUrl,
    type: "account_onboarding",
  });
  return { url: link.url };
}

export type ConnectAccountStatus = {
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
};

/** Fetch the live onboarding status of a Connect account — status-checking only, no writes. */
export async function fetchConnectAccountStatus(
  stripe: StripeConnectAccountsClient,
  accountId: string,
): Promise<ConnectAccountStatus> {
  const account = await stripe.accounts.retrieve(accountId);
  return {
    chargesEnabled: account.charges_enabled ?? false,
    payoutsEnabled: account.payouts_enabled ?? false,
    detailsSubmitted: account.details_submitted ?? false,
  };
}
