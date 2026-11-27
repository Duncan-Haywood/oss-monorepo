// @ts-check
// Paid plans through the merchant of record (Paddle), shipped dark. Proprietary (see ../LICENSE, part 2).
//
// Built on packages/billing (signature checks, checkout tokens, ordering rules, entitlements); this
// module owns the storage calls and the account binding:
//
//   checkout  An API-key holder picks a plan. A pending-checkout row is stored for the account and
//             a signed, opaque token (never the account id, never the plan) goes into the Paddle
//             transaction's custom_data. The plan comes only from the billed price id.
//   webhook   Verified signature, then once per event id: bind the account by the stored
//             subscription id, else by the checkout token (one-time, 24 h); apply the package's
//             ordering rules; write the account's subscription row; always answer 200 with
//             applied / duplicate / ignored so Paddle stops retrying.
//   plan      An entitled subscription (active, trialing, or past_due inside the 7-day grace) sets
//             the plan; otherwise the account's own plan (`trial` unless an operator set another).
//
// Dark until the owner sets BILLING_PROVIDER=paddle, BILLING_API_KEY, BILLING_WEBHOOK_SECRET,
// BILLING_PRICE_IDS, CHECKOUT_SECRET and APP_URL (docs/BILLING.md). FAKE_EXTERNALS=true or
// APP_ENV=test selects the signed fake provider for tests and the offline demo.
import {
  CHECKOUT_TOKEN_TTL_MS,
  checkoutPriceKey,
  createBillingProvider,
  decideSubscriptionUpdate,
  isNewPaidSubscription,
  newCheckoutId,
  nextLifecycleStamps,
  PromoCodeError,
  parseCheckoutToken,
  resolveCheckoutToken,
  resolveEntitlement,
  signCheckoutToken,
  WebhookSignatureError,
} from "../../../packages/billing/src/index.ts";
import { catalog, meterStatement, PLANS, periodOf, planOf, publicPlan } from "./plans.mjs";

/** Public, demo-only secret for the fake provider. Never used when a real provider is configured. */
const DEMO_CHECKOUT_SECRET = "einvoice-demo-checkout-secret-not-for-production";
const DEMO_APP_URL = "http://localhost:8790";
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

export class BillingError extends Error {
  /** @param {number} status @param {string} code @param {string} message */
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** @param {string | null | undefined} iso */
const toDate = (iso) => (iso ? new Date(iso) : null);
/** @param {Date | null | undefined} d */
const toIso = (d) => (d ? d.toISOString() : null);

/** The subscription fields an account may see (no provider ids). @param {import("./store.mjs").Subscription} s */
export const publicSubscription = (s) => ({
  plan: s.planKey,
  status: s.status,
  currentPeriodEnd: s.currentPeriodEnd,
  cancelAtPeriodEnd: s.cancelAtPeriodEnd,
});

/**
 * @param {{ env: Record<string, string | undefined>, store: import("./store.mjs").MemoryStore, now: () => Date,
 *   fetch?: typeof fetch, log?: (msg: string) => void }} deps
 */
export function createBilling(deps) {
  const { env, store, now } = deps;
  const log = deps.log ?? ((m) => console.warn(m));
  const fake = env.FAKE_EXTERNALS === "true" || env.APP_ENV === "test";
  const provider = createBillingProvider(env, { planKeys: catalog.purchasableKeys, fetch: deps.fetch });
  const secret = env.CHECKOUT_SECRET && env.CHECKOUT_SECRET.length >= 32 ? env.CHECKOUT_SECRET : fake ? DEMO_CHECKOUT_SECRET : null;
  const appUrlRaw = (env.APP_URL ?? (fake ? DEMO_APP_URL : "")).replace(/\/+$/, "");
  const appUrl = /^https:\/\/[^/\s]+/.test(appUrlRaw) || (fake && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(appUrlRaw)) ? appUrlRaw : null;
  const available = Boolean(provider && secret && appUrl);

  /** @param {import("./store.mjs").Account} account */
  async function entitlement(account) {
    const sub = await store.getSubscription(account.id);
    const fallback = planOf(account.plan);
    if (!sub) return { plan: fallback, source: "account", subscription: null, graceUntil: null };
    const ent = resolveEntitlement(
      { planKey: sub.planKey, status: sub.status, currentPeriodStart: toDate(sub.currentPeriodStart), pastDueSince: toDate(sub.pastDueSince) },
      { getPlan: catalog.get, now: now() },
    );
    return ent.active && ent.plan
      ? { plan: ent.plan, source: "subscription", subscription: publicSubscription(sub), graceUntil: toIso(ent.graceUntil) }
      : { plan: fallback, source: "account", subscription: publicSubscription(sub), graceUntil: null, blockedReason: ent.blockedReason };
  }

  function requireAvailable() {
    if (!available || !provider || !secret || !appUrl) throw new BillingError(503, "billing_unavailable", "Paid plans are not on sale yet.");
    return { provider, secret, appUrl };
  }

  /**
   * @param {import("./store.mjs").Account} account
   * @param {{ plan?: unknown, interval?: unknown, email?: unknown, promoCode?: unknown }} input
   */
  async function checkout(account, input) {
    const { provider, secret, appUrl } = requireAvailable();
    const planKey = typeof input.plan === "string" ? input.plan : "";
    const plan = catalog.get(planKey);
    if (!plan || !catalog.isPurchasable(planKey)) throw new BillingError(400, "invalid", `plan must be one of: ${catalog.purchasableKeys.join(", ")}.`);
    const interval = input.interval === "year" ? "year" : input.interval === undefined || input.interval === "month" ? "month" : null;
    if (!interval) throw new BillingError(400, "invalid", 'interval must be "month" or "year".');
    if (interval === "year" && !plan.annualPriceCents) throw new BillingError(400, "invalid", `${plan.name} is not sold annually.`);
    const email = typeof input.email === "string" ? input.email.trim() : "";
    if (!EMAIL_RE.test(email) || email.length > 254) throw new BillingError(400, "invalid", "email (the billing contact) is required.");
    const promoCode = typeof input.promoCode === "string" && input.promoCode.trim() ? input.promoCode.trim().slice(0, 64) : undefined;

    const current = await store.getSubscription(account.id);
    if (current && current.status !== "canceled") {
      throw new BillingError(409, "already_subscribed", "This account already has a subscription: change or cancel it in the billing portal.");
    }
    const id = newCheckoutId();
    await store.createPendingCheckout(account.id, {
      id,
      planKey,
      interval,
      expiresAt: new Date(now().getTime() + CHECKOUT_TOKEN_TTL_MS).toISOString(),
    });
    const checkoutToken = await signCheckoutToken(secret, id, account.id);
    try {
      return await provider.createCheckout({
        checkoutToken,
        planKey: checkoutPriceKey(planKey, interval),
        interval,
        customerEmail: email,
        successUrl: `${appUrl}/billing/success`,
        cancelUrl: `${appUrl}/billing/cancel`,
        promoCode,
        providerCustomerId: current?.providerCustomerId ?? null,
      });
    } catch (e) {
      if (e instanceof PromoCodeError) throw new BillingError(400, "invalid_promo_code", "That promotion code is not valid.");
      throw e;
    }
  }

  /** @param {import("./store.mjs").Account} account */
  async function portal(account) {
    const { provider, appUrl } = requireAvailable();
    const sub = await store.getSubscription(account.id);
    if (!sub?.providerCustomerId) throw new BillingError(404, "no_subscription", "This account has no subscription to manage.");
    return provider.createPortalSession(sub.providerCustomerId, `${appUrl}/billing`);
  }

  /**
   * @param {Request} request
   * @returns {Promise<{ status: number, body: { result: "applied" | "duplicate" | "ignored", reason?: string } | { error: { code: string, message: string } } }>}
   */
  async function webhook(request) {
    if (!provider) return { status: 503, body: { error: { code: "billing_unavailable", message: "Billing is not configured." } } };
    let event;
    try {
      event = await provider.parseWebhook(request);
    } catch (e) {
      if (e instanceof WebhookSignatureError) return { status: 401, body: { error: { code: "bad_signature", message: "Invalid webhook signature." } } };
      throw e;
    }
    if (!event.providerEventId) return { status: 200, body: { result: "ignored", reason: "no event id" } };
    if (!(await store.claimWebhookEvent(provider.name, event.providerEventId, event.type))) {
      return { status: 200, body: { result: "duplicate" } };
    }
    try {
      const out = await apply(event);
      await store.finishWebhookEvent(provider.name, event.providerEventId, {
        outcome: out.result,
        reason: out.reason ?? null,
        accountId: out.accountId ?? null,
      });
      return { status: 200, body: out.reason ? { result: out.result, reason: out.reason } : { result: out.result } };
    } catch (e) {
      await store.releaseWebhookEvent(provider.name, event.providerEventId);
      throw e;
    }
  }

  /**
   * @param {import("../../../packages/billing/src/index.ts").BillingWebhookEvent} event
   * @returns {Promise<{ result: "applied" | "ignored", reason?: string, accountId?: string }>}
   */
  async function apply(event) {
    const subId = event.subscription?.providerSubscriptionId ?? event.providerSubscriptionId;
    if (!event.subscription || !subId) return { result: "ignored", reason: "no subscription data" };

    let accountId = null;
    let checkoutId = null;
    const bound = await store.findSubscriptionByProviderId(subId);
    if (bound) accountId = bound.accountId;
    else {
      if (!event.checkoutToken || !secret) return { result: "ignored", reason: "no checkout token" };
      const parsed = parseCheckoutToken(event.checkoutToken);
      const row = parsed ? await store.getPendingCheckout(parsed.checkoutId) : null;
      const res = await resolveCheckoutToken(
        secret,
        event.checkoutToken,
        row && {
          id: row.id,
          orgId: row.accountId,
          expiresAt: new Date(row.expiresAt),
          consumedAt: toDate(row.consumedAt),
          providerSubscriptionId: row.providerSubscriptionId,
        },
        subId,
        now(),
      );
      if (!res.ok) return { result: "ignored", reason: res.reason };
      accountId = res.orgId;
      checkoutId = res.checkoutId;
    }
    if (!(await store.getAccount(accountId))) return { result: "ignored", reason: "unknown account" };

    const current = await store.getSubscription(accountId);
    const decision = decideSubscriptionUpdate(
      current && {
        status: current.status,
        providerCustomerId: current.providerCustomerId,
        providerSubscriptionId: current.providerSubscriptionId,
        providerUpdatedAt: toDate(current.providerUpdatedAt),
        pastDueSince: toDate(current.pastDueSince),
      },
      event,
      { isPurchasable: catalog.isPurchasable, now: now() },
    );
    if (!decision.apply) {
      if (decision.reason === "customer mismatch") log(`einvoice-billing: customer mismatch ignored for account ${accountId}, event ${event.providerEventId}`);
      return { result: "ignored", reason: decision.reason, accountId };
    }
    if (checkoutId && !(await store.consumePendingCheckout(checkoutId, subId))) {
      return { result: "ignored", reason: "checkout token replay", accountId };
    }
    const s = decision.subscription;
    // The billed price exactly as this event reports it (the only MRR source; admin metrics) and
    // the lifecycle stamps, which only ever record what webhooks said (never back-filled).
    const price = s.price;
    const stamps = nextLifecycleStamps(
      current && { trialStartedAt: toDate(current.trialStartedAt), firstPaidAt: toDate(current.firstPaidAt), canceledAt: toDate(current.canceledAt) },
      s.status,
      event.occurredAt ?? now(),
    );
    await store.upsertSubscription(accountId, {
      priceAmountMinor: price?.unitAmountMinor ?? null,
      priceCurrency: price?.currency ?? null,
      billingInterval: price?.interval ?? null,
      billingFrequency: price?.frequency ?? null,
      priceQuantity: price?.quantity ?? null,
      priceDiscounted: price ? price.discounted : null,
      trialStartedAt: toIso(stamps.trialStartedAt),
      firstPaidAt: toIso(stamps.firstPaidAt),
      canceledAt: toIso(stamps.canceledAt),
      planKey: s.planKey,
      status: s.status,
      providerCustomerId: s.providerCustomerId,
      providerSubscriptionId: s.providerSubscriptionId,
      currentPeriodStart: toIso(s.currentPeriodStart),
      currentPeriodEnd: toIso(s.currentPeriodEnd),
      cancelAtPeriodEnd: s.cancelAtPeriodEnd,
      providerUpdatedAt: toIso(decision.providerUpdatedAt),
      pastDueSince: toIso(decision.pastDueSince),
    });
    // Owner "new paid subscription" notice: this app has no email port yet, so it is a log line
    // only (account id + plan; the account has no email on record). apps/admin's digest covers it.
    if (isNewPaidSubscription(current, s) && (env.OWNER_NOTIFICATIONS ?? "").toLowerCase() === "on") {
      log(`einvoice-billing: new paid subscription for account ${accountId} on plan ${s.planKey}`);
    }
    return { result: "applied", accountId };
  }

  /**
   * Bill a closed month's metered usage (the `api` plan): for every subscription on a metered plan,
   * the usage above the monthly minimum goes to the provider as a one-time charge with the next
   * renewal. Once per account and month: the row is claimed before the provider call and never
   * retried automatically, so a crash leaves a "pending" row for a person, never a double charge.
   * A month with nothing above the minimum is recorded as "none"; a subscription that cannot be
   * charged (canceled, paused, past_due, no provider id) as "skipped" with the reason.
   * @param {string} period "YYYY-MM", before the current month
   */
  async function settleUsage(period) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new BillingError(400, "invalid", "period must be YYYY-MM.");
    if (period >= periodOf(now())) throw new BillingError(400, "invalid", "Only a month that has ended can be settled.");
    if (!provider?.chargeUsage) throw new BillingError(503, "billing_unavailable", "The billing provider cannot charge usage.");
    /** @type {{ accountId: string, status: string, amountMinor: number, reason: string | null }[]} */
    const results = [];
    for (const planKey of Object.values(PLANS).filter((p) => p.metered).map((p) => p.key)) {
      for (const sub of await store.listSubscriptionsByPlan(planKey)) {
        const statement = meterStatement(await store.getUsage(sub.accountId, period));
        const amountMinor = statement.overageCents;
        const base = { planKey, amountMinor, currency: statement.currency, providerSubscriptionId: sub.providerSubscriptionId };
        /** @type {{ status: "none" | "skipped" | "pending", reason: string | null }} */
        const plan =
          amountMinor <= 0
            ? { status: "none", reason: "usage within the monthly minimum" }
            : !sub.providerSubscriptionId
              ? { status: "skipped", reason: "no provider subscription" }
              : sub.status !== "active" && sub.status !== "trialing"
                ? { status: "skipped", reason: `subscription is ${sub.status}` }
                : { status: "pending", reason: null };
        if (!(await store.claimUsageCharge(sub.accountId, period, { ...base, ...plan }))) {
          const existing = await store.getUsageCharge(sub.accountId, period);
          results.push({ accountId: sub.accountId, status: "already", amountMinor: existing?.amountMinor ?? amountMinor, reason: `settled earlier: ${existing?.status ?? "unknown"}` });
          continue;
        }
        if (plan.status !== "pending" || !sub.providerSubscriptionId) {
          results.push({ accountId: sub.accountId, status: plan.status, amountMinor, reason: plan.reason });
          continue;
        }
        try {
          const r = await provider.chargeUsage({
            providerSubscriptionId: sub.providerSubscriptionId,
            planKey,
            amountMinor,
            currency: statement.currency,
            name: `API usage ${period}`,
            description: `einvoice-preflight metered usage above the minimum, ${period}: ${statement.validations} validated, ${statement.explained} explained`,
          });
          await store.finishUsageCharge(sub.accountId, period, { status: "charged", providerChargeId: r.chargeId });
          results.push({ accountId: sub.accountId, status: "charged", amountMinor, reason: null });
        } catch (e) {
          const reason = e instanceof Error ? e.message.slice(0, 200) : "charge failed";
          await store.finishUsageCharge(sub.accountId, period, { status: "failed", reason });
          log(`einvoice-billing: usage charge failed for account ${sub.accountId}, ${period}: ${reason}`);
          results.push({ accountId: sub.accountId, status: "failed", amountMinor, reason });
        }
      }
    }
    return { period, results };
  }

  /**
   * An account's metered statement for a month, and how it was settled (null until it is).
   * @param {import("./store.mjs").Account} account @param {string} period
   */
  async function usageStatement(account, period) {
    const statement = meterStatement(await store.getUsage(account.id, period));
    const charge = await store.getUsageCharge(account.id, period);
    return {
      ...statement,
      settlement: charge && { status: charge.status, amountCents: charge.amountMinor, reason: charge.reason, finishedAt: charge.finishedAt },
    };
  }

  return {
    available,
    providerName: provider?.name ?? null,
    settleUsage,
    usageStatement,
    plans: () => catalog.plans.map(publicPlan),
    entitlement,
    checkout,
    portal,
    webhook,
  };
}
