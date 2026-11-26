// Builds the owner dashboard from what each product's admin API returned. Pure.
// Rules: a product that could not be read is listed under `unreadable` and adds nothing to totals;
// a number a product does not measure (null) is never counted as 0 — totals say where it is missing.
// Money stays per currency (no FX). Costs are only measured LLM spend; hosting, Paddle fees and
// anything else are not measured, so "MRP so far" is MRR minus measured costs and is left blank
// (null) wherever costs are not measured.
import {
  type AdminAccountDto,
  type AdminSignupDto,
  addMoney,
  type EarlyAccessMetrics,
  type MoneyByCurrency,
  type ProductAdminMetrics,
} from "../../../packages/admin-metrics/src/index.ts";
import type { ProductConfig } from "./config.ts";
import type { Fetched } from "./products.ts";

export interface ProductReading {
  config: ProductConfig;
  metrics: Fetched<ProductAdminMetrics | EarlyAccessMetrics>;
  recent: Fetched<{ items: (AdminAccountDto | AdminSignupDto)[] }>;
  trials: Fetched<{ items: AdminAccountDto[] }> | null;
  churn: Fetched<{ items: AdminAccountDto[] }> | null;
}

/** A total that some products may not measure. */
export interface PartialTotal {
  /** Sum over the products that measure it; null when none does. */
  value: number | null;
  /** Products (names) that do not measure it. */
  unmeasuredIn: string[];
}

export interface Mrp {
  /** MRR minus measured costs this month, in USD cents; null = costs not measured or MRR not all USD. */
  amountMinor: number | null;
  currency: "USD";
  mrrMinor: number | null;
  measuredCostMinor: number | null;
  note: string;
}

export interface ProductCard {
  key: string;
  name: string;
  kind: "app" | "early_access";
  ok: boolean;
  error: string | null;
  metrics: ProductAdminMetrics | EarlyAccessMetrics | null;
  mrp: Mrp | null;
}

export interface FeedItem {
  product: string;
  productName: string;
  kind: "account" | "early_access";
  at: string;
  /** Org name for accounts; the person's name (if given) for early access. */
  label: string;
  name: string | null;
  email: string | null;
  planKey: string | null;
  source: string | null;
}

export type AccountRow = AdminAccountDto & { product: string; productName: string };

export interface Dashboard {
  generatedAt: string;
  windowDays: number;
  products: ProductCard[];
  unreadable: { name: string; error: string }[];
  totals: {
    signupsInWindow: number;
    signupsTotal: number;
    verified: PartialTotal;
    orgs: number;
    activeOrgs: PartialTotal;
    paidSubscriptions: number;
    trialsCurrent: number;
    trialsStartedInWindow: number;
    trialsConverted: number;
    trialsExpired: number;
    cancellationsInWindow: number;
    cancellationsScheduled: number;
    pastDueNow: number;
    failedPaymentsInWindow: PartialTotal;
    mrr: MoneyByCurrency[];
    mrrUnpricedSubscriptions: number;
    llmSpendMonthToDateMicros: PartialTotal;
    /** Sum of per-product MRP; null unless every readable app product has one. */
    mrpSoFar: { amountMinor: number | null; currency: "USD"; missingIn: string[] };
    earlyAccess: { total: number; confirmed: PartialTotal; inWindow: number };
  };
  feed: FeedItem[];
  trials: AccountRow[];
  churn: AccountRow[];
}

const MICROS_PER_CENT = 10_000;

function addPartial(t: PartialTotal, v: number | null, name: string): void {
  if (v === null) t.unmeasuredIn.push(name);
  else t.value = (t.value ?? 0) + v;
}
const partial = (): PartialTotal => ({ value: null, unmeasuredIn: [] });

/** MRR − measured LLM spend this month, for one app product. */
export function productMrp(m: ProductAdminMetrics): Mrp {
  const currencies = m.mrr.byCurrency.filter((c) => c.amountMinor !== 0);
  const onlyUsd = currencies.every((c) => c.currency === "USD");
  const mrrMinor = onlyUsd ? (currencies[0]?.amountMinor ?? 0) : null;
  const cost = m.llmSpend ? Math.round(m.llmSpend.monthToDateMicros / MICROS_PER_CENT) : null;
  const unpriced = m.mrr.subscriptionsUnpriced;
  let note =
    "MRR − measured LLM spend this month. Hosting, Paddle fees and other costs are not measured.";
  if (!m.llmSpend) note = "Blank: this product does not measure its costs.";
  else if (!onlyUsd) note = "Blank: MRR is not all in USD (no currency conversion).";
  if (unpriced > 0)
    note += ` ${unpriced} paid subscription(s) have no recorded price and are not in MRR.`;
  return {
    amountMinor: mrrMinor !== null && cost !== null ? mrrMinor - cost : null,
    currency: "USD",
    mrrMinor,
    measuredCostMinor: cost,
    note,
  };
}

export function buildDashboard(
  readings: ProductReading[],
  now: Date,
  windowDays: number,
): Dashboard {
  const products: ProductCard[] = [];
  const unreadable: { name: string; error: string }[] = [];
  const t: Dashboard["totals"] = {
    signupsInWindow: 0,
    signupsTotal: 0,
    verified: partial(),
    orgs: 0,
    activeOrgs: partial(),
    paidSubscriptions: 0,
    trialsCurrent: 0,
    trialsStartedInWindow: 0,
    trialsConverted: 0,
    trialsExpired: 0,
    cancellationsInWindow: 0,
    cancellationsScheduled: 0,
    pastDueNow: 0,
    failedPaymentsInWindow: partial(),
    mrr: [],
    mrrUnpricedSubscriptions: 0,
    llmSpendMonthToDateMicros: partial(),
    mrpSoFar: { amountMinor: null, currency: "USD", missingIn: [] },
    earlyAccess: { total: 0, confirmed: partial(), inWindow: 0 },
  };
  const feed: FeedItem[] = [];
  const trials: AccountRow[] = [];
  const churn: AccountRow[] = [];
  let mrpSum = 0;
  let anyApp = false;

  for (const r of readings) {
    const { key, name, kind } = r.config;
    if (!r.metrics.ok) {
      unreadable.push({ name, error: r.metrics.error });
      products.push({
        key,
        name,
        kind,
        ok: false,
        error: r.metrics.error,
        metrics: null,
        mrp: null,
      });
      continue;
    }
    const m = r.metrics.data;
    let mrp: Mrp | null = null;
    if (m.kind === "app") {
      anyApp = true;
      mrp = productMrp(m);
      if (mrp.amountMinor === null) t.mrpSoFar.missingIn.push(name);
      else mrpSum += mrp.amountMinor;
      t.signupsInWindow += m.signups.lastWindow;
      t.signupsTotal += m.signups.total;
      addPartial(t.verified, m.signups.verified, name);
      t.orgs += m.orgs.total;
      addPartial(t.activeOrgs, m.orgs.active, name);
      t.paidSubscriptions += m.subscriptions.paid;
      t.trialsCurrent += m.trials.current;
      t.trialsStartedInWindow += m.trials.startedInWindow;
      t.trialsConverted += m.trials.converted;
      t.trialsExpired += m.trials.expired;
      t.cancellationsInWindow += m.cancellations.inWindow;
      t.cancellationsScheduled += m.cancellations.scheduled;
      t.pastDueNow += m.failedPayments.pastDueNow;
      addPartial(t.failedPaymentsInWindow, m.failedPayments.inWindow, name);
      t.mrr = addMoney(t.mrr, m.mrr.byCurrency);
      t.mrrUnpricedSubscriptions += m.mrr.subscriptionsUnpriced;
      addPartial(
        t.llmSpendMonthToDateMicros,
        m.llmSpend ? m.llmSpend.monthToDateMicros : null,
        name,
      );
    } else {
      t.earlyAccess.total += m.total;
      t.earlyAccess.inWindow += m.lastWindow;
      addPartial(t.earlyAccess.confirmed, m.confirmed, name);
    }
    products.push({ key, name, kind, ok: true, error: null, metrics: m, mrp });

    if (r.recent.ok) {
      for (const it of r.recent.data.items) {
        if ("orgId" in it) {
          feed.push({
            product: key,
            productName: name,
            kind: "account",
            at: it.createdAt,
            label: it.orgName,
            name: it.owner?.name ?? null,
            email: it.owner?.email ?? null,
            planKey: it.planKey,
            source: null,
          });
        } else {
          feed.push({
            product: key,
            productName: name,
            kind: "early_access",
            at: it.createdAt,
            label: it.name ?? it.email,
            name: it.name,
            email: it.email,
            planKey: null,
            source: it.source,
          });
        }
      }
    }
    if (r.trials?.ok)
      for (const a of r.trials.data.items) trials.push({ ...a, product: key, productName: name });
    if (r.churn?.ok)
      for (const a of r.churn.data.items) churn.push({ ...a, product: key, productName: name });
  }
  if (anyApp && t.mrpSoFar.missingIn.length === 0) t.mrpSoFar.amountMinor = mrpSum;

  const byAt = (a: { at: string }, b: { at: string }) => b.at.localeCompare(a.at);
  feed.sort(byAt);
  trials.sort((a, b) =>
    (b.trialStartedAt ?? b.createdAt).localeCompare(a.trialStartedAt ?? a.createdAt),
  );
  churn.sort((a, b) => (b.canceledAt ?? b.createdAt).localeCompare(a.canceledAt ?? a.createdAt));
  return {
    generatedAt: now.toISOString(),
    windowDays,
    products,
    unreadable,
    totals: t,
    feed: feed.slice(0, 100),
    trials: trials.slice(0, 100),
    churn: churn.slice(0, 100),
  };
}
