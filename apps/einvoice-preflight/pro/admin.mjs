// @ts-check
// Platform admin API for the owner console (apps/admin): GET /v1/admin/metrics and
// GET /v1/admin/accounts (also served at /api/admin/*, the path every other product uses).
// FSL-1.1-MIT (see ../LICENSE, part 2). Contract: packages/admin-metrics (ProductAdminMetrics,
// AdminAccountsPage).
//
// Gate: ONLY the console's service credential, `Authorization: Bearer <ADMIN_SERVICE_TOKEN>`
// (at least 32 characters, compared in constant time; packages/admin-metrics gate.ts). This app
// has no email-verified users (accounts are API-key accounts), so the PLATFORM_ADMIN_EMAILS
// session path the Worker apps offer does not exist here. ADMIN_TOKEN (which creates accounts)
// does NOT grant these reads: one secret per purpose, so the console never holds account creation.
// Unset token = the admin read API is closed. Every read is written to the store's admin audit log.
//
// What it shows: account metadata (name, plan, dates, subscription, recorded price). Never runs,
// clients, file names or invoice contents. Numbers this app does not measure are null.
import {
  ADMIN_ACCOUNT_LISTS,
  ADMIN_CONTRACT_VERSION,
  ADMIN_METRICS_ACTOR,
  ADMIN_SERVICE_ACTOR,
  bearerToken,
  dayBuckets,
  monthlyRecurringMinor,
  serviceTokenScope,
  summarizeMrr,
  weekBuckets,
  weekStart,
  windowStart,
} from "../../../packages/admin-metrics/src/index.ts";
import { catalog } from "./plans.mjs";

export const PRODUCT = { key: "einvoice-preflight", name: "E-invoice fix and explain" };
const DAY_MS = 86_400_000;

export class AdminError extends Error {
  /** @param {number} status @param {string} code @param {string} message */
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/**
 * 401 without a bearer token, 403 with a wrong one (or when the API is closed). Returns the scope:
 * "full" (ADMIN_SERVICE_TOKEN, the owner console) or "metrics" (ADMIN_METRICS_TOKEN, read-only for
 * agents: aggregate metrics only, never the account list).
 * @param {string | undefined} authorization @param {Record<string, string | undefined>} env
 * @returns {Promise<"full" | "metrics">}
 */
export async function requireServiceToken(authorization, env) {
  const presented = bearerToken(authorization);
  if (!presented) throw new AdminError(401, "unauthorized", "Send Authorization: Bearer <ADMIN_SERVICE_TOKEN>.");
  const scope = await serviceTokenScope(presented, {
    serviceToken: env.ADMIN_SERVICE_TOKEN,
    metricsToken: env.ADMIN_METRICS_TOKEN,
  });
  if (!scope) throw new AdminError(403, "forbidden", "Platform admin access required.");
  return scope;
}

/** @param {any} s */
const priceOf = (s) => ({
  priceAmountMinor: s.priceAmountMinor ?? null,
  priceCurrency: s.priceCurrency ?? null,
  billingInterval: s.billingInterval ?? null,
  billingFrequency: s.billingFrequency ?? null,
  priceQuantity: s.priceQuantity ?? null,
  priceDiscounted: s.priceDiscounted ?? null,
});

/**
 * @param {{ adminSnapshot: (sinceIso: string) => Promise<any> }} store @param {Date} now @param {number} windowDays
 * @returns {Promise<import("../../../packages/admin-metrics/src/index.ts").ProductAdminMetrics>}
 */
export async function productMetrics(store, now, windowDays) {
  const since = windowStart(now, windowDays);
  const sinceIso = since.toISOString();
  const weeks = Math.max(1, Math.ceil(windowDays / 7));
  const snap = await store.adminSnapshot(sinceIso);
  /** @type {any[]} */
  const subs = snap.subscriptions;
  const stamps = snap.accountCreatedAt.map((/** @type {string} */ at) => ({ at: new Date(at) }));
  const byDay = dayBuckets(stamps, now, windowDays, false);
  const paid = subs.filter((s) => (s.status === "active" || s.status === "past_due") && catalog.isPurchasable(s.planKey));
  /** @type {Map<string, { planKey: string, status: string, count: number }>} */
  const byPlan = new Map();
  for (const s of subs) {
    const k = `${s.planKey}\u0000${s.status}`;
    const row = byPlan.get(k) ?? { planKey: s.planKey, status: s.status, count: 0 };
    row.count++;
    byPlan.set(k, row);
  }
  /** @type {{ type: string, receivedAt: string }[]} */
  const events = snap.webhookEvents;
  const anyTransaction = events.some((e) => e.type.startsWith("transaction."));
  const failed = events.filter((e) => e.type === "transaction.payment_failed" && e.receivedAt >= sinceIso).length;
  return {
    contractVersion: ADMIN_CONTRACT_VERSION,
    kind: "app",
    product: PRODUCT.key,
    productName: PRODUCT.name,
    generatedAt: now.toISOString(),
    windowDays,
    signups: {
      total: stamps.length,
      // Accounts are API-key accounts (sign-up by name): there is no email to verify.
      verified: null,
      unverified: null,
      lastWindow: byDay.reduce((n, d) => n + d.total, 0),
      byDay,
      byWeek: weekBuckets(stamps, now, weeks, false),
    },
    orgs: {
      total: stamps.length,
      active: snap.activeAccounts,
      activeDefinition: `One of the account's API keys was used in the last ${windowDays} days`,
    },
    trials: {
      current: subs.filter((s) => s.status === "trialing").length,
      startedInWindow: subs.filter((s) => s.trialStartedAt && s.trialStartedAt >= sinceIso).length,
      converted: subs.filter((s) => s.trialStartedAt && s.firstPaidAt).length,
      expired: subs.filter((s) => s.trialStartedAt && !s.firstPaidAt && s.status === "canceled").length,
      note: "Paddle trials only, stamped from webhooks since admin metrics shipped. The free 'trial' plan every sign-up starts on has no end date, so it is counted as sign-ups, not trials",
    },
    subscriptions: {
      byPlan: [...byPlan.values()].sort((a, b) => b.count - a.count),
      paid: paid.length,
    },
    mrr: summarizeMrr(paid.map((s) => ({ ...priceOf(s), status: s.status }))),
    cancellations: {
      inWindow: subs.filter((s) => s.canceledAt && s.canceledAt >= sinceIso).length,
      scheduled: paid.filter((s) => s.cancelAtPeriodEnd).length,
    },
    failedPayments: {
      inWindow: anyTransaction ? failed : null,
      pastDueNow: subs.filter((s) => s.status === "past_due").length,
    },
    // Model calls are metered as units per invoice, not as measured cost: spend is not recorded.
    llmSpend: null,
  };
}

/**
 * @param {{ adminListAccounts: (list: "recent" | "trials" | "churn", limit: number, trialSinceIso: string) => Promise<{ account: any, subscription: any }[]> }} store
 * @param {Date} now @param {"recent" | "trials" | "churn"} list @param {number} limit
 * @returns {Promise<import("../../../packages/admin-metrics/src/index.ts").AdminAccountsPage>}
 */
export async function accountList(store, now, list, limit) {
  const rows = await store.adminListAccounts(list, limit, new Date(now.getTime() - 90 * DAY_MS).toISOString());
  return {
    contractVersion: ADMIN_CONTRACT_VERSION,
    kind: "app",
    product: PRODUCT.key,
    list,
    limit,
    items: rows.map(({ account, subscription: s }) => ({
      orgId: account.id,
      orgName: account.name,
      createdAt: account.createdAt,
      // No email is collected at sign-up (the billing contact goes to Paddle only).
      owner: null,
      planKey: s?.planKey ?? account.plan,
      status: s?.status ?? null,
      trialStartedAt: s?.trialStartedAt ?? null,
      firstPaidAt: s?.firstPaidAt ?? null,
      canceledAt: s?.canceledAt ?? null,
      cancelAtPeriodEnd: s?.cancelAtPeriodEnd ?? false,
      currentPeriodEnd: s?.currentPeriodEnd ?? null,
      mrr: s && (s.status === "active" || s.status === "past_due") ? monthlyRecurringMinor(priceOf(s)) : null,
    })),
  };
}

/** @param {string | null} v @param {number} dflt @param {number} min @param {number} max */
function intParam(v, dflt, min, max) {
  if (v === null || v === "") return dflt;
  if (!/^\d+$/.test(v)) throw new AdminError(400, "invalid", "Expected a whole number.");
  const n = Number(v);
  if (n < min || n > max) throw new AdminError(400, "invalid", `Expected a number from ${min} to ${max}.`);
  return n;
}

/**
 * Handles GET /v1/admin/{metrics,accounts} (and /api/admin/*): gate, read, audit.
 * @param {"metrics" | "accounts"} what @param {URL} url @param {string | undefined} authorization
 * @param {{ store: any, env: Record<string, string | undefined>, now: () => Date }} deps
 */
export async function adminRead(what, url, authorization, deps) {
  const scope = await requireServiceToken(authorization, deps.env);
  const actorId = scope === "metrics" ? ADMIN_METRICS_ACTOR : ADMIN_SERVICE_ACTOR;
  const now = deps.now();
  if (what === "metrics") {
    const days = intParam(url.searchParams.get("days"), 30, 1, 366);
    const body = await productMetrics(deps.store, now, days);
    await deps.store.adminAudit({ actorId, action: "admin.metrics_read", metadata: { days } });
    return body;
  }
  // The account list carries names: never for the read-only metrics token.
  if (scope !== "full") throw new AdminError(403, "forbidden", "This credential may read aggregate metrics only.");
  const listParam = url.searchParams.get("list") ?? "recent";
  const list = ADMIN_ACCOUNT_LISTS.find((l) => l === listParam);
  if (!list) throw new AdminError(400, "invalid", `list must be one of: ${ADMIN_ACCOUNT_LISTS.join(", ")}.`);
  const limit = intParam(url.searchParams.get("limit"), 50, 1, 200);
  const body = await accountList(deps.store, now, list, limit);
  await deps.store.adminAudit({ actorId, action: "admin.accounts_read", metadata: { list, limit, returned: body.items.length } });
  return body;
}
