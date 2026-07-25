import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Lead } from "./leads/types";

/**
 * Direct coverage for src/lib/db.ts's own Convex-first/SQLite-fallback
 * ORCHESTRATION — the `if (convexClient) { try { ...; return; } catch {
 * ...fallback... } } ... SQLite fallback` wiring itself, not just the pure
 * helpers it delegates to (sqlite-queries.ts, convex-primary.ts) which
 * already had isolated coverage.
 *
 * Every other test file that touches "@/lib/db" mocks the whole module away
 * (see AGENT_PROTOCOL's "a `\"server-only\"` lib file cannot be
 * Vitest-tested directly" rule) — which means db.ts's actual branch
 * selection (does a Convex success return early without falling through?
 * does a Convex failure correctly choose fail-closed vs fall-back per
 * `options.requireConvex`? does no-Convex-configured skip Convex entirely?)
 * had never once been exercised by an automated test, only by manual
 * `npm run dev` smoke checks. A regression here (e.g. a missing `return;`
 * after a successful Convex call, or a flipped `shouldFallbackToSqliteOnConvexFailure`
 * condition) would pass tsc/lint/the full mocked Vitest suite/a routine dev
 * smoke check, and only surface in production as a silent split-brain or a
 * duplicate external side effect.
 *
 * Follows the pattern AGENT_PROTOCOL documents for this exact situation:
 * mock the "server-only" guard to a no-op and mock "convex/browser"'s
 * ConvexHttpClient to a controllable fake, so the REAL db.ts module body
 * runs against a fake Convex client and a real (but isolated, temp-dir)
 * SQLite file — not a second reimplementation of its logic. Three
 * representative exports are covered here (getLeads/getLeadBySlug/upsertLead
 * for the ordinary soft-fallback shape, updateLeadBufferPostedVariantKeys for
 * the `requireConvex` fail-closed shape, and recordSubscriptionRenewalPayment
 * — see below) rather than all ~76 exports — every other db.ts function
 * shares one of these same shapes, so this establishes the reusable test
 * scaffold and real regression guards rather than a from-scratch rewrite of
 * the whole file's test surface.
 *
 * recordSubscriptionRenewalPayment specifically closes a gap the other two
 * exports didn't: its SQLite-fallback branch (src/lib/db.ts ~1494-1533) is a
 * hand-written duplicate of the accrual/idempotency/entitlement-filtering
 * logic convex/orders.ts's own mutation already has direct coverage for
 * (convex/orders.test.ts) — a money-ledger write (lifetimeRevenueUsd) that,
 * on a SQLite-only deployment (no NEXT_PUBLIC_CONVEX_URL — a fully supported
 * mode per AGENT_PROTOCOL), had never been exercised by any automated test.
 * A future edit to the Convex side's accrual math or entitlement filter that
 * isn't mirrored into this SQL branch would silently misstate real
 * subscriber lifetime revenue with nothing to catch it — the same
 * duplicated-logic bug class as convex-orders-recurring-entitlement-duplicate-fix.
 *
 * markOrdersRecurringCanceledByCustomer / clearOrdersRecurringCanceledByCustomer /
 * syncOrdersRecurringEntitlementByCustomer (src/lib/db.ts ~1233-1447) share the
 * identical duplicated-logic risk: each has a Convex mutation with direct
 * coverage (convex/orders.test.ts) and a hand-written SQLite-fallback branch
 * that had never been exercised by any automated test — these three drive the
 * pause/resume/re-tier entitlement state read by every "is this lead
 * currently entitled" consumer (Buy now/catalog sync, digest, dashboard), so a
 * drift here would silently mis-gate paid recurring access on a SQLite-only
 * deployment.
 *
 * markOrderRefunded/clearOrderRefunded/markOrderDisputed/clearOrderDisputed
 * (bundle orders, ~1092-1226) and markCommerceOrderRefunded/
 * clearCommerceOrderRefunded/markCommerceOrderDisputed/clearCommerceOrderDisputed
 * (Commerce Buy now orders, ~3269-3419) share the same shape again: each has a
 * Convex mutation directly covered in convex/orders.test.ts /
 * convex/commerceOrders.test.ts, and a hand-written single-UPDATE SQLite
 * fallback with zero automated coverage anywhere (the webhook route test that
 * calls these mocks "@/lib/db" away entirely). These flip the exact booleans
 * every refund/dispute/clawback-visibility reader depends on
 * (isCommerceOrderOwed, orderEligibleForBillingPortal, the bundle/Commerce
 * refund & dispute due-queue panels) — a broken WHERE clause or a missing
 * early-return here would silently misstate money already refunded or
 * disputed on a SQLite-only deployment.
 *
 * markCommerceOrderPaidOut (~3189) gets its own describe block: unlike its
 * seven siblings above, its SQLite fallback (sqliteMarkCommerceOrderPaidOut,
 * src/lib/db/sqlite-queries.ts) re-verifies refundedAt/disputedAt/paidOutAt
 * atomically with the write (commerce-order-paid-out-refund-race-guard) —
 * Convex's own markPaidOut mutation has a direct test proving that same
 * atomic rejection (convex/commerceOrders.test.ts), but the SQLite twin never
 * did until now.
 *
 * markMarketingPackSentToClient / markCommerceOrderClientReceiptSent /
 * markClientVoicePackSentToClient (~2759, ~3228, ~3547) share a third shape:
 * a single-field sent-marker guarded by `WHERE ... IS NULL OR ... = ''`
 * (sqliteMarkMarketingPackSentToClient / sqliteMarkCommerceOrderClientReceiptSent /
 * sqliteMarkClientVoicePackSentToClient, src/lib/db/sqlite-queries.ts) that
 * returns whether the row was actually (re-)marked rather than void — the
 * exact boolean the webhook/dashboard redelivery-recovery contract
 * (AGENT_PROTOCOL's "durable recovery marker" rule) depends on to decide
 * whether a send actually needs to happen. Each Convex mutation
 * (marketingPacks.markSentToClient / commerceOrders.markClientReceiptSent /
 * clientVoicePacks.markSentToClient) already has direct coverage; the SQLite
 * fallback branch — including that it stays false, not just a no-op, on a
 * redelivered mark with a different timestamp — never did until now.
 *
 * updateLeadStripeConnectAccountId / updateLeadStripeConnectStatus (~525,
 * ~589) are the dormant Stripe Connect Express scaffold's own two
 * requireConvex fail-closed writes: each has a Convex mutation with direct
 * coverage (convex/leads.test.ts's updateStripeConnectAccountId /
 * updateStripeConnectStatus) and a hand-written SQLite-fallback branch with
 * zero automated coverage anywhere (every action/webhook test that calls
 * these mocks "@/lib/db" away entirely). getLeads/getLeadBySlug read
 * Convex-first and connectOnboardingIncompleteCount (pipeline-health/digest)
 * reads this same cache cross-instance, so a broken SQLite fallback or a
 * regressed set-once accountCreatedAt COALESCE would silently misstate the
 * onboarding-incomplete due-queue on a SQLite-only deployment — never did
 * until now.
 *
 * updateLeadStage (~263) is the core pipeline-stage transition every stage
 * change in the app funnels through (dashboard updateLeadStageAction, Mark
 * live). It has a Convex mutation with direct coverage (convex/leads.test.ts)
 * and a hand-written SQLite-fallback branch (sqliteUpdateLeadStage,
 * src/lib/db/sqlite-queries.ts) that duplicates a business-critical guard —
 * once a lead reaches paid/live, a stage write cannot silently revert it to
 * an earlier stage (update-lead-stage-action-paid-live-revert-guard) — with
 * zero automated coverage of that guard on the SQLite side until now. A drift
 * between the two backends' guards would let a stale/racing stage write
 * regress a paying or live customer back to an earlier funnel stage on a
 * SQLite-only deployment, which several eligibility predicates (Billing
 * Portal, Starter upsell, paid-not-live) read directly.
 */

vi.mock("server-only", () => ({}));

const convexQuery = vi.fn();
const convexMutation = vi.fn();

vi.mock("convex/browser", () => ({
  ConvexHttpClient: class {
    query(...args: unknown[]) {
      return convexQuery(...args);
    }
    mutation(...args: unknown[]) {
      return convexMutation(...args);
    }
  },
}));

type DbModule = typeof import("./db");

const ORIGINAL_ENV = { ...process.env };
const CONVEX_URL = "https://test-deployment.convex.cloud";

let tmpDir: string;
let cwdSpy: ReturnType<typeof vi.spyOn>;

/**
 * (Re)loads the real db.ts module fresh, with NEXT_PUBLIC_CONVEX_URL set
 * (or deleted) beforehand — db.ts computes its module-level `convexClient`
 * singleton once at import time from that env var, so a fresh
 * `vi.resetModules()` + dynamic import per scenario is required to flip
 * "Convex configured" vs "no Convex client at all".
 */
async function loadDb(convexUrl: string | undefined): Promise<DbModule> {
  vi.resetModules();
  if (convexUrl === undefined) {
    delete process.env.NEXT_PUBLIC_CONVEX_URL;
  } else {
    process.env.NEXT_PUBLIC_CONVEX_URL = convexUrl;
  }
  return import("./db");
}

function testLead(slug: string, overrides: Partial<Lead> = {}): Lead {
  return {
    slug,
    businessName: "Test Business",
    category: "restaurant",
    city: "Boulder",
    state: "CO",
    tagline: "A test business",
    description: "A business used only in tests.",
    phone: "(303) 555-0100",
    services: ["Testing"],
    hours: { weekday: "Mon-Fri 9-5", weekend: "Closed" },
    stage: "discovered",
    recommendedTier: "starter",
    ...overrides,
  };
}

describe("db.ts dual-backend orchestration (real module, mocked Convex client)", () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lss-db-orchestration-test-"));
    // db.ts derives its SQLite file path from process.cwd() at import time
    // with no override hook — redirect it to an isolated temp dir so this
    // suite never touches the repo's own local.db.
    cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(tmpDir);
    convexQuery.mockReset();
    convexMutation.mockReset();
  });

  afterEach(() => {
    cwdSpy.mockRestore();
    fs.rmSync(tmpDir, { recursive: true, force: true });
    process.env = { ...ORIGINAL_ENV };
    vi.resetModules();
  });

  describe("getLeads / getLeadBySlug (soft Convex-first, silent SQLite fallback)", () => {
    it("goes straight to SQLite and never calls Convex when no client is configured", async () => {
      const db = await loadDb(undefined);
      await db.upsertLead(testLead("no-convex-lead"));
      const leads = await db.getLeads();
      expect(convexQuery).not.toHaveBeenCalled();
      expect(leads.map((l) => l.slug)).toContain("no-convex-lead");
    });

    it("returns Convex's result directly on success, without falling through to SQLite", async () => {
      // Convex resolves a payload that shares nothing with the SQLite
      // fallback (which would otherwise return the schema's demo-seeded
      // leads) — if the real return-early path were broken (e.g. a missing
      // `return`), this array would come back padded with demo leads too.
      convexQuery.mockResolvedValueOnce([{ slug: "convex-only-lead" }]);
      const db = await loadDb(CONVEX_URL);
      const leads = await db.getLeads();
      expect(leads).toEqual([{ slug: "convex-only-lead" }]);
      expect(convexQuery).toHaveBeenCalledTimes(1);
    });

    it("falls back to SQLite when the Convex query throws", async () => {
      // Seed via the SQLite-only path first (no Convex client for the seed).
      const seedDb = await loadDb(undefined);
      await seedDb.upsertLead(testLead("fallback-read-lead"));

      convexQuery.mockRejectedValueOnce(new Error("convex outage"));
      const db = await loadDb(CONVEX_URL);
      const leads = await db.getLeads();
      expect(leads.map((l) => l.slug)).toContain("fallback-read-lead");
    });

    it("getLeadBySlug returns Convex's object directly on success", async () => {
      convexQuery.mockResolvedValueOnce({ slug: "convex-single-lead" });
      const db = await loadDb(CONVEX_URL);
      const lead = await db.getLeadBySlug("convex-single-lead");
      expect(lead).toEqual({ slug: "convex-single-lead" });
    });
  });

  describe("upsertLead (soft Convex-first write, no requireConvex passed)", () => {
    it("trusts Convex's return value directly on success rather than recomputing via SQLite", async () => {
      // sqliteUpsertLead would return true for this never-before-seen slug
      // (a fresh insert) — mock Convex to resolve false instead, so the
      // assertion only passes if upsertLead actually used Convex's result
      // and returned early rather than falling through to SQLite.
      convexMutation.mockResolvedValueOnce(false);
      const db = await loadDb(CONVEX_URL);
      const result = await db.upsertLead(testLead("convex-write-lead"));
      expect(result).toBe(false);
      expect(convexMutation).toHaveBeenCalledTimes(1);
    });

    it("falls back to a real SQLite write when the Convex mutation throws", async () => {
      convexMutation.mockRejectedValueOnce(new Error("convex outage"));
      const db = await loadDb(CONVEX_URL);
      const result = await db.upsertLead(testLead("fallback-write-lead"));
      expect(result).toBe(true);

      // Confirm it actually landed in SQLite (readable via the same
      // no-Convex-client path used elsewhere in this suite).
      convexQuery.mockRejectedValueOnce(new Error("convex outage (read)"));
      const lead = await db.getLeadBySlug("fallback-write-lead");
      expect(lead?.businessName).toBe("Test Business");
    });
  });

  describe("updateLeadBufferPostedVariantKeys (requireConvex fail-closed write)", () => {
    it("returns after a successful Convex mutation without touching SQLite", async () => {
      convexMutation.mockResolvedValueOnce(undefined);
      const db = await loadDb(CONVEX_URL);
      // No lead with this slug exists in the fresh SQLite file at all — the
      // SQLite fallback branch would throw "Lead with slug ... not found"
      // if the Convex-success path incorrectly fell through to it, so a
      // clean resolve here proves the early `return;` actually ran.
      await expect(
        db.updateLeadBufferPostedVariantKeys("no-sqlite-row-lead", ["k1"], {
          requireConvex: true,
        }),
      ).resolves.toBeUndefined();
      expect(convexMutation).toHaveBeenCalledTimes(1);
    });

    it("throws ConvexPrimaryWriteError instead of silently falling back when requireConvex is set and Convex fails", async () => {
      convexMutation.mockRejectedValueOnce(new Error("convex outage"));
      const db = await loadDb(CONVEX_URL);
      await expect(
        db.updateLeadBufferPostedVariantKeys("some-lead", ["k1"], { requireConvex: true }),
      ).rejects.toThrow(/updateLeadBufferPostedVariantKeys/);
    });

    it("falls back to a real SQLite write when requireConvex is not set and Convex fails", async () => {
      // Seed the lead row via the SQLite-only path (no Convex client).
      const seedDb = await loadDb(undefined);
      await seedDb.upsertLead(testLead("buffer-lead"));

      convexMutation.mockRejectedValueOnce(new Error("convex outage"));
      const db = await loadDb(CONVEX_URL);
      await expect(
        db.updateLeadBufferPostedVariantKeys("buffer-lead", ["k1", "k2"]),
      ).resolves.toBeUndefined();

      convexQuery.mockRejectedValueOnce(new Error("convex outage (read)"));
      const lead = await db.getLeadBySlug("buffer-lead");
      expect(lead?.bufferPostedVariantKeys).toEqual(["k1", "k2"]);
    });

    it("throws a not-found error via the pure-SQLite path when no Convex client is configured and the slug does not exist", async () => {
      const db = await loadDb(undefined);
      await expect(
        db.updateLeadBufferPostedVariantKeys("missing-slug", ["k1"]),
      ).rejects.toThrow(/not found/i);
      expect(convexMutation).not.toHaveBeenCalled();
    });
  });

  describe("recordSubscriptionRenewalPayment (money-ledger write, optional requireConvex)", () => {
    it("returns Convex's result directly on success without touching SQLite", async () => {
      convexMutation.mockResolvedValueOnce({ recorded: true });
      const db = await loadDb(CONVEX_URL);
      const result = await db.recordSubscriptionRenewalPayment("cus_convex_only", "in_1", 49);
      expect(result).toEqual({ recorded: true });
      expect(convexMutation).toHaveBeenCalledTimes(1);
    });

    it("throws ConvexPrimaryWriteError instead of silently falling back when requireConvex is set and Convex fails", async () => {
      convexMutation.mockRejectedValueOnce(new Error("convex outage"));
      const db = await loadDb(CONVEX_URL);
      await expect(
        db.recordSubscriptionRenewalPayment("cus_1", "in_1", 49, { requireConvex: true }),
      ).rejects.toThrow(/recordSubscriptionRenewalPayment/);
    });

    it("accrues lifetimeRevenueUsd onto the entitled order and is idempotent on invoiceId (SQLite fallback)", async () => {
      // Seed a Growth-tier order via the pure-SQLite path (no Convex client).
      const seedDb = await loadDb(undefined);
      await seedDb.recordLeadPayment({
        slug: "renewal-lead",
        stripeSessionId: "cs_renewal",
        customerEmail: "renewal@example.com",
        tier: "growth",
        commerceAddon: false,
        amountTotal: 99,
        stripeCustomerId: "cus_renewal_1",
      });

      convexMutation.mockRejectedValueOnce(new Error("convex outage"));
      const db = await loadDb(CONVEX_URL);
      const first = await db.recordSubscriptionRenewalPayment("cus_renewal_1", "in_cycle_1", 49);
      expect(first).toEqual({ recorded: true });

      const readDb = await loadDb(undefined);
      const [orderAfterFirst] = await readDb.getOrdersByStripeCustomerId("cus_renewal_1");
      expect(orderAfterFirst?.lifetimeRevenueUsd).toBe(148);
      expect(orderAfterFirst?.lastRenewalInvoiceId).toBe("in_cycle_1");

      // Stripe redelivers invoice.paid with the same invoiceId — must not double-count.
      convexMutation.mockRejectedValueOnce(new Error("convex outage"));
      const redeliveredDb = await loadDb(CONVEX_URL);
      const redelivered = await redeliveredDb.recordSubscriptionRenewalPayment(
        "cus_renewal_1",
        "in_cycle_1",
        49,
      );
      expect(redelivered).toEqual({ recorded: false });
      const [orderAfterRedelivery] = await (
        await loadDb(undefined)
      ).getOrdersByStripeCustomerId("cus_renewal_1");
      expect(orderAfterRedelivery?.lifetimeRevenueUsd).toBe(148);

      // A second, distinct renewal invoice accrues on top of the prior base.
      convexMutation.mockRejectedValueOnce(new Error("convex outage"));
      const secondDb = await loadDb(CONVEX_URL);
      const second = await secondDb.recordSubscriptionRenewalPayment(
        "cus_renewal_1",
        "in_cycle_2",
        49,
      );
      expect(second).toEqual({ recorded: true });
      const [orderAfterSecond] = await (
        await loadDb(undefined)
      ).getOrdersByStripeCustomerId("cus_renewal_1");
      expect(orderAfterSecond?.lifetimeRevenueUsd).toBe(197);
      expect(orderAfterSecond?.lastRenewalInvoiceId).toBe("in_cycle_2");
    });

    it("skips a customer with no currently sold-capability-entitled order (SQLite fallback)", async () => {
      // A Starter-tier, non-Commerce-addon order never grants recurring
      // entitlement (orderGrantsSoldCapabilityEntitlement) regardless of
      // refund/dispute state — recordSubscriptionRenewalPayment must find no
      // row to accrue onto rather than crediting an ineligible order.
      const seedDb = await loadDb(undefined);
      await seedDb.recordLeadPayment({
        slug: "starter-lead",
        stripeSessionId: "cs_starter",
        customerEmail: "starter@example.com",
        tier: "starter",
        commerceAddon: false,
        amountTotal: 29,
        stripeCustomerId: "cus_starter_1",
      });

      convexMutation.mockRejectedValueOnce(new Error("convex outage"));
      const db = await loadDb(CONVEX_URL);
      const result = await db.recordSubscriptionRenewalPayment("cus_starter_1", "in_1", 49);
      expect(result).toEqual({ recorded: false });

      const [order] = await (await loadDb(undefined)).getOrdersByStripeCustomerId(
        "cus_starter_1",
      );
      expect(order?.lifetimeRevenueUsd).toBeUndefined();
    });
  });

  describe("markOrdersRecurringCanceledByCustomer (pause-write, requireConvex fail-closed)", () => {
    it("returns Convex's updatedCount directly without touching SQLite", async () => {
      convexMutation.mockResolvedValueOnce({ updatedCount: 2 });
      const db = await loadDb(CONVEX_URL);
      const result = await db.markOrdersRecurringCanceledByCustomer("cus_convex_only", Date.now());
      expect(result).toBe(2);
      expect(convexMutation).toHaveBeenCalledTimes(1);
    });

    it("throws ConvexPrimaryWriteError instead of silently falling back when requireConvex is set and Convex fails", async () => {
      convexMutation.mockRejectedValueOnce(new Error("convex outage"));
      const db = await loadDb(CONVEX_URL);
      await expect(
        db.markOrdersRecurringCanceledByCustomer("cus_1", Date.now(), { requireConvex: true }),
      ).rejects.toThrow(/markOrdersRecurringCanceledByCustomer/);
    });

    it("only cancels the recurring-entitlement order and is idempotent on a second call (SQLite fallback)", async () => {
      const seedDb = await loadDb(undefined);
      await seedDb.recordLeadPayment({
        slug: "pause-growth-lead",
        stripeSessionId: "cs_pause_growth",
        customerEmail: "pause@example.com",
        tier: "growth",
        commerceAddon: false,
        amountTotal: 99,
        stripeCustomerId: "cus_pause_1",
      });
      // A Starter, non-Commerce order for the SAME customer must never be
      // touched — it never had recurring entitlement in the first place.
      await seedDb.recordLeadPayment({
        slug: "pause-starter-lead",
        stripeSessionId: "cs_pause_starter",
        customerEmail: "pause@example.com",
        tier: "starter",
        commerceAddon: false,
        amountTotal: 29,
        stripeCustomerId: "cus_pause_1",
      });

      const canceledAt = Date.now();
      convexMutation.mockRejectedValueOnce(new Error("convex outage"));
      const db = await loadDb(CONVEX_URL);
      const first = await db.markOrdersRecurringCanceledByCustomer("cus_pause_1", canceledAt);
      expect(first).toBe(1);

      const readDb = await loadDb(undefined);
      const orders = await readDb.getOrdersByStripeCustomerId("cus_pause_1");
      const growthOrder = orders.find((o) => o.tier === "growth");
      const starterOrder = orders.find((o) => o.tier === "starter");
      expect(growthOrder?.recurringCanceledAt).toBe(canceledAt);
      expect(starterOrder?.recurringCanceledAt).toBeUndefined();

      // Idempotent: a redelivered/duplicate pause event must not error or
      // re-count an already-canceled row.
      convexMutation.mockRejectedValueOnce(new Error("convex outage"));
      const second = await (
        await loadDb(CONVEX_URL)
      ).markOrdersRecurringCanceledByCustomer("cus_pause_1", Date.now());
      expect(second).toBe(0);
    });
  });

  describe("clearOrdersRecurringCanceledByCustomer (resume-write, requireConvex fail-closed)", () => {
    it("returns Convex's updatedCount directly without touching SQLite", async () => {
      convexMutation.mockResolvedValueOnce({ updatedCount: 1 });
      const db = await loadDb(CONVEX_URL);
      const result = await db.clearOrdersRecurringCanceledByCustomer("cus_convex_only");
      expect(result).toBe(1);
      expect(convexMutation).toHaveBeenCalledTimes(1);
    });

    it("throws ConvexPrimaryWriteError instead of silently falling back when requireConvex is set and Convex fails", async () => {
      convexMutation.mockRejectedValueOnce(new Error("convex outage"));
      const db = await loadDb(CONVEX_URL);
      await expect(
        db.clearOrdersRecurringCanceledByCustomer("cus_1", { requireConvex: true }),
      ).rejects.toThrow(/clearOrdersRecurringCanceledByCustomer/);
    });

    it("clears a paused order and is idempotent on a second call (SQLite fallback)", async () => {
      const seedDb = await loadDb(undefined);
      await seedDb.recordLeadPayment({
        slug: "resume-growth-lead",
        stripeSessionId: "cs_resume_growth",
        customerEmail: "resume@example.com",
        tier: "growth",
        commerceAddon: false,
        amountTotal: 99,
        stripeCustomerId: "cus_resume_1",
      });
      convexMutation.mockRejectedValueOnce(new Error("convex outage"));
      await (
        await loadDb(CONVEX_URL)
      ).markOrdersRecurringCanceledByCustomer("cus_resume_1", Date.now());

      convexMutation.mockRejectedValueOnce(new Error("convex outage"));
      const db = await loadDb(CONVEX_URL);
      const first = await db.clearOrdersRecurringCanceledByCustomer("cus_resume_1");
      expect(first).toBe(1);

      const [order] = await (
        await loadDb(undefined)
      ).getOrdersByStripeCustomerId("cus_resume_1");
      expect(order?.recurringCanceledAt).toBeUndefined();

      // Idempotent: a row with no cancel timestamp must not error or re-count.
      convexMutation.mockRejectedValueOnce(new Error("convex outage"));
      const second = await (
        await loadDb(CONVEX_URL)
      ).clearOrdersRecurringCanceledByCustomer("cus_resume_1");
      expect(second).toBe(0);
    });
  });

  describe("syncOrdersRecurringEntitlementByCustomer (re-tier write, requireConvex fail-closed)", () => {
    it("returns Convex's updatedCount directly without touching SQLite", async () => {
      convexMutation.mockResolvedValueOnce({ updatedCount: 1 });
      const db = await loadDb(CONVEX_URL);
      const result = await db.syncOrdersRecurringEntitlementByCustomer("cus_convex_only", {
        tier: "complete",
        commerceAddon: true,
      });
      expect(result).toBe(1);
      expect(convexMutation).toHaveBeenCalledTimes(1);
    });

    it("throws ConvexPrimaryWriteError instead of silently falling back when requireConvex is set and Convex fails", async () => {
      convexMutation.mockRejectedValueOnce(new Error("convex outage"));
      const db = await loadDb(CONVEX_URL);
      await expect(
        db.syncOrdersRecurringEntitlementByCustomer(
          "cus_1",
          { tier: "growth", commerceAddon: false },
          { requireConvex: true },
        ),
      ).rejects.toThrow(/syncOrdersRecurringEntitlementByCustomer/);
    });

    it("refuses a non-recurring target before touching Convex or SQLite", async () => {
      const db = await loadDb(CONVEX_URL);
      const result = await db.syncOrdersRecurringEntitlementByCustomer("cus_refuse", {
        tier: "starter",
        commerceAddon: false,
      });
      expect(result).toBe(0);
      expect(convexMutation).not.toHaveBeenCalled();
    });

    it("re-tiers the recurring-entitlement order and is idempotent once it matches the target (SQLite fallback)", async () => {
      const seedDb = await loadDb(undefined);
      await seedDb.recordLeadPayment({
        slug: "retier-lead",
        stripeSessionId: "cs_retier",
        customerEmail: "retier@example.com",
        tier: "growth",
        commerceAddon: false,
        amountTotal: 99,
        stripeCustomerId: "cus_retier_1",
      });

      convexMutation.mockRejectedValueOnce(new Error("convex outage"));
      const db = await loadDb(CONVEX_URL);
      const first = await db.syncOrdersRecurringEntitlementByCustomer("cus_retier_1", {
        tier: "complete",
        commerceAddon: true,
      });
      expect(first).toBe(1);

      const readDb = await loadDb(undefined);
      const [order] = await readDb.getOrdersByStripeCustomerId("cus_retier_1");
      expect(order?.tier).toBe("complete");
      expect(order?.commerceAddon).toBe(true);

      // Idempotent: a row already matching the target must not re-count.
      convexMutation.mockRejectedValueOnce(new Error("convex outage"));
      const second = await (
        await loadDb(CONVEX_URL)
      ).syncOrdersRecurringEntitlementByCustomer("cus_retier_1", {
        tier: "complete",
        commerceAddon: true,
      });
      expect(second).toBe(0);
    });
  });

  describe("markOrderRefunded / clearOrderRefunded (bundle order refund tracking, optional requireConvex)", () => {
    it("returns after a successful Convex mutation without touching SQLite", async () => {
      const seedDb = await loadDb(undefined);
      await seedDb.recordLeadPayment({
        slug: "refund-bundle-lead",
        stripeSessionId: "cs_refund_bundle",
        customerEmail: "refund@example.com",
        tier: "growth",
        commerceAddon: false,
        amountTotal: 99,
      });

      convexMutation.mockResolvedValueOnce(undefined);
      const db = await loadDb(CONVEX_URL);
      await db.markOrderRefunded("cs_refund_bundle");
      expect(convexMutation).toHaveBeenCalledTimes(1);

      // A missing early-`return;` would have also run the SQLite UPDATE —
      // reading through the pure-SQLite path confirms it did not.
      const order = await (await loadDb(undefined)).getOrderByStripeSessionId(
        "cs_refund_bundle",
      );
      expect(order?.refundedAt).toBeUndefined();
    });

    it("throws ConvexPrimaryWriteError instead of silently falling back when requireConvex is set and Convex fails", async () => {
      convexMutation.mockRejectedValueOnce(new Error("convex outage"));
      const db = await loadDb(CONVEX_URL);
      await expect(
        db.markOrderRefunded("cs_1", undefined, { requireConvex: true }),
      ).rejects.toThrow(/markOrderRefunded/);
    });

    it("marks and clears refundedAt via SQLite, idempotently, on Convex failure", async () => {
      const seedDb = await loadDb(undefined);
      await seedDb.recordLeadPayment({
        slug: "refund-bundle-fallback-lead",
        stripeSessionId: "cs_refund_bundle_fallback",
        customerEmail: "refund-fallback@example.com",
        tier: "growth",
        commerceAddon: false,
        amountTotal: 99,
      });

      convexMutation.mockRejectedValueOnce(new Error("convex outage"));
      const markDb = await loadDb(CONVEX_URL);
      await markDb.markOrderRefunded("cs_refund_bundle_fallback", "2026-01-01T00:00:00.000Z");

      const afterMark = await (
        await loadDb(undefined)
      ).getOrderByStripeSessionId("cs_refund_bundle_fallback");
      expect(afterMark?.refundedAt).toBe("2026-01-01T00:00:00.000Z");

      // Redelivered mark with a different timestamp must not overwrite the first.
      convexMutation.mockRejectedValueOnce(new Error("convex outage"));
      await (
        await loadDb(CONVEX_URL)
      ).markOrderRefunded("cs_refund_bundle_fallback", "2026-01-02T00:00:00.000Z");
      const afterRedelivery = await (
        await loadDb(undefined)
      ).getOrderByStripeSessionId("cs_refund_bundle_fallback");
      expect(afterRedelivery?.refundedAt).toBe("2026-01-01T00:00:00.000Z");

      // clearOrderRefunded reverses it (refund.updated reporting the refund
      // never actually completed) and is itself idempotent.
      convexMutation.mockRejectedValueOnce(new Error("convex outage"));
      await (await loadDb(CONVEX_URL)).clearOrderRefunded("cs_refund_bundle_fallback");
      const afterClear = await (
        await loadDb(undefined)
      ).getOrderByStripeSessionId("cs_refund_bundle_fallback");
      expect(afterClear?.refundedAt).toBeUndefined();

      convexMutation.mockRejectedValueOnce(new Error("convex outage"));
      await expect(
        (await loadDb(CONVEX_URL)).clearOrderRefunded("cs_refund_bundle_fallback"),
      ).resolves.toBeUndefined();
    });
  });

  describe("markOrderDisputed / clearOrderDisputed (bundle order dispute tracking, optional requireConvex)", () => {
    it("returns after a successful Convex mutation without touching SQLite", async () => {
      const seedDb = await loadDb(undefined);
      await seedDb.recordLeadPayment({
        slug: "dispute-bundle-lead",
        stripeSessionId: "cs_dispute_bundle",
        customerEmail: "dispute@example.com",
        tier: "growth",
        commerceAddon: false,
        amountTotal: 99,
      });

      convexMutation.mockResolvedValueOnce(undefined);
      const db = await loadDb(CONVEX_URL);
      await db.markOrderDisputed("cs_dispute_bundle");
      expect(convexMutation).toHaveBeenCalledTimes(1);

      const order = await (await loadDb(undefined)).getOrderByStripeSessionId(
        "cs_dispute_bundle",
      );
      expect(order?.disputedAt).toBeUndefined();
    });

    it("throws ConvexPrimaryWriteError instead of silently falling back when requireConvex is set and Convex fails", async () => {
      convexMutation.mockRejectedValueOnce(new Error("convex outage"));
      const db = await loadDb(CONVEX_URL);
      await expect(
        db.markOrderDisputed("cs_1", undefined, { requireConvex: true }),
      ).rejects.toThrow(/markOrderDisputed/);
    });

    it("marks and clears disputedAt via SQLite, idempotently, on Convex failure", async () => {
      const seedDb = await loadDb(undefined);
      await seedDb.recordLeadPayment({
        slug: "dispute-bundle-fallback-lead",
        stripeSessionId: "cs_dispute_bundle_fallback",
        customerEmail: "dispute-fallback@example.com",
        tier: "growth",
        commerceAddon: false,
        amountTotal: 99,
      });

      convexMutation.mockRejectedValueOnce(new Error("convex outage"));
      await (
        await loadDb(CONVEX_URL)
      ).markOrderDisputed("cs_dispute_bundle_fallback", "2026-01-01T00:00:00.000Z");

      const afterMark = await (
        await loadDb(undefined)
      ).getOrderByStripeSessionId("cs_dispute_bundle_fallback");
      expect(afterMark?.disputedAt).toBe("2026-01-01T00:00:00.000Z");

      convexMutation.mockRejectedValueOnce(new Error("convex outage"));
      await (await loadDb(CONVEX_URL)).clearOrderDisputed("cs_dispute_bundle_fallback");
      const afterClear = await (
        await loadDb(undefined)
      ).getOrderByStripeSessionId("cs_dispute_bundle_fallback");
      expect(afterClear?.disputedAt).toBeUndefined();

      convexMutation.mockRejectedValueOnce(new Error("convex outage"));
      await expect(
        (await loadDb(CONVEX_URL)).clearOrderDisputed("cs_dispute_bundle_fallback"),
      ).resolves.toBeUndefined();
    });
  });

  describe("markCommerceOrderRefunded / clearCommerceOrderRefunded (Commerce Buy now order refund tracking, optional requireConvex)", () => {
    it("returns after a successful Convex mutation without touching SQLite", async () => {
      const seedDb = await loadDb(undefined);
      await seedDb.insertCommerceOrder({
        leadSlug: "commerce-refund-lead",
        skuId: "sku_1",
        skuName: "Test SKU",
        amountPaidUsd: 25,
        stripeSessionId: "cs_commerce_refund",
      });

      convexMutation.mockResolvedValueOnce(undefined);
      const db = await loadDb(CONVEX_URL);
      await db.markCommerceOrderRefunded("cs_commerce_refund");
      expect(convexMutation).toHaveBeenCalledTimes(1);

      const order = await (
        await loadDb(undefined)
      ).getCommerceOrderByStripeSessionId("cs_commerce_refund");
      expect(order?.refundedAt).toBeUndefined();
    });

    it("throws ConvexPrimaryWriteError instead of silently falling back when requireConvex is set and Convex fails", async () => {
      convexMutation.mockRejectedValueOnce(new Error("convex outage"));
      const db = await loadDb(CONVEX_URL);
      await expect(
        db.markCommerceOrderRefunded("cs_1", undefined, { requireConvex: true }),
      ).rejects.toThrow(/markCommerceOrderRefunded/);
    });

    it("marks and clears refundedAt via SQLite, idempotently, on Convex failure", async () => {
      const seedDb = await loadDb(undefined);
      await seedDb.insertCommerceOrder({
        leadSlug: "commerce-refund-fallback-lead",
        skuId: "sku_1",
        skuName: "Test SKU",
        amountPaidUsd: 25,
        stripeSessionId: "cs_commerce_refund_fallback",
      });

      convexMutation.mockRejectedValueOnce(new Error("convex outage"));
      await (
        await loadDb(CONVEX_URL)
      ).markCommerceOrderRefunded("cs_commerce_refund_fallback", "2026-01-01T00:00:00.000Z");

      const afterMark = await (
        await loadDb(undefined)
      ).getCommerceOrderByStripeSessionId("cs_commerce_refund_fallback");
      expect(afterMark?.refundedAt).toBe("2026-01-01T00:00:00.000Z");

      convexMutation.mockRejectedValueOnce(new Error("convex outage"));
      await (
        await loadDb(CONVEX_URL)
      ).clearCommerceOrderRefunded("cs_commerce_refund_fallback");
      const afterClear = await (
        await loadDb(undefined)
      ).getCommerceOrderByStripeSessionId("cs_commerce_refund_fallback");
      expect(afterClear?.refundedAt).toBeUndefined();

      convexMutation.mockRejectedValueOnce(new Error("convex outage"));
      await expect(
        (await loadDb(CONVEX_URL)).clearCommerceOrderRefunded("cs_commerce_refund_fallback"),
      ).resolves.toBeUndefined();
    });
  });

  describe("markCommerceOrderDisputed / clearCommerceOrderDisputed (Commerce Buy now order dispute tracking, optional requireConvex)", () => {
    it("returns after a successful Convex mutation without touching SQLite", async () => {
      const seedDb = await loadDb(undefined);
      await seedDb.insertCommerceOrder({
        leadSlug: "commerce-dispute-lead",
        skuId: "sku_1",
        skuName: "Test SKU",
        amountPaidUsd: 25,
        stripeSessionId: "cs_commerce_dispute",
      });

      convexMutation.mockResolvedValueOnce(undefined);
      const db = await loadDb(CONVEX_URL);
      await db.markCommerceOrderDisputed("cs_commerce_dispute");
      expect(convexMutation).toHaveBeenCalledTimes(1);

      const order = await (
        await loadDb(undefined)
      ).getCommerceOrderByStripeSessionId("cs_commerce_dispute");
      expect(order?.disputedAt).toBeUndefined();
    });

    it("throws ConvexPrimaryWriteError instead of silently falling back when requireConvex is set and Convex fails", async () => {
      convexMutation.mockRejectedValueOnce(new Error("convex outage"));
      const db = await loadDb(CONVEX_URL);
      await expect(
        db.markCommerceOrderDisputed("cs_1", undefined, { requireConvex: true }),
      ).rejects.toThrow(/markCommerceOrderDisputed/);
    });

    it("marks and clears disputedAt via SQLite, idempotently, on Convex failure", async () => {
      const seedDb = await loadDb(undefined);
      await seedDb.insertCommerceOrder({
        leadSlug: "commerce-dispute-fallback-lead",
        skuId: "sku_1",
        skuName: "Test SKU",
        amountPaidUsd: 25,
        stripeSessionId: "cs_commerce_dispute_fallback",
      });

      convexMutation.mockRejectedValueOnce(new Error("convex outage"));
      await (
        await loadDb(CONVEX_URL)
      ).markCommerceOrderDisputed("cs_commerce_dispute_fallback", "2026-01-01T00:00:00.000Z");

      const afterMark = await (
        await loadDb(undefined)
      ).getCommerceOrderByStripeSessionId("cs_commerce_dispute_fallback");
      expect(afterMark?.disputedAt).toBe("2026-01-01T00:00:00.000Z");

      convexMutation.mockRejectedValueOnce(new Error("convex outage"));
      await (
        await loadDb(CONVEX_URL)
      ).clearCommerceOrderDisputed("cs_commerce_dispute_fallback");
      const afterClear = await (
        await loadDb(undefined)
      ).getCommerceOrderByStripeSessionId("cs_commerce_dispute_fallback");
      expect(afterClear?.disputedAt).toBeUndefined();

      convexMutation.mockRejectedValueOnce(new Error("convex outage"));
      await expect(
        (await loadDb(CONVEX_URL)).clearCommerceOrderDisputed("cs_commerce_dispute_fallback"),
      ).resolves.toBeUndefined();
    });
  });

  describe("markCommerceOrderPaidOut (atomic paid-out/refunded/disputed race guard, optional requireConvex)", () => {
    it("returns Convex's result directly without touching SQLite", async () => {
      const seedDb = await loadDb(undefined);
      await seedDb.insertCommerceOrder({
        leadSlug: "commerce-paidout-lead",
        skuId: "sku_1",
        skuName: "Test SKU",
        amountPaidUsd: 25,
        stripeSessionId: "cs_commerce_paidout",
      });

      convexMutation.mockResolvedValueOnce(true);
      const db = await loadDb(CONVEX_URL);
      const result = await db.markCommerceOrderPaidOut("cs_commerce_paidout");
      expect(result).toBe(true);
      expect(convexMutation).toHaveBeenCalledTimes(1);

      // A missing early-`return` would have also run the SQLite UPDATE.
      const order = await (
        await loadDb(undefined)
      ).getCommerceOrderByStripeSessionId("cs_commerce_paidout");
      expect(order?.paidOutAt).toBeUndefined();
    });

    it("throws ConvexPrimaryWriteError instead of silently falling back when requireConvex is set and Convex fails", async () => {
      convexMutation.mockRejectedValueOnce(new Error("convex outage"));
      const db = await loadDb(CONVEX_URL);
      await expect(
        db.markCommerceOrderPaidOut("cs_1", undefined, { requireConvex: true }),
      ).rejects.toThrow(/markCommerceOrderPaidOut/);
    });

    it("marks paidOutAt via SQLite and is idempotent on a redelivered mark (Convex failure)", async () => {
      const seedDb = await loadDb(undefined);
      await seedDb.insertCommerceOrder({
        leadSlug: "commerce-paidout-fallback-lead",
        skuId: "sku_1",
        skuName: "Test SKU",
        amountPaidUsd: 25,
        stripeSessionId: "cs_commerce_paidout_fallback",
      });

      convexMutation.mockRejectedValueOnce(new Error("convex outage"));
      const first = await (
        await loadDb(CONVEX_URL)
      ).markCommerceOrderPaidOut("cs_commerce_paidout_fallback", "2026-01-01T00:00:00.000Z");
      expect(first).toBe(true);

      const afterFirst = await (
        await loadDb(undefined)
      ).getCommerceOrderByStripeSessionId("cs_commerce_paidout_fallback");
      expect(afterFirst?.paidOutAt).toBe("2026-01-01T00:00:00.000Z");

      // Idempotent: a second mark must not overwrite the original timestamp.
      convexMutation.mockRejectedValueOnce(new Error("convex outage"));
      const second = await (
        await loadDb(CONVEX_URL)
      ).markCommerceOrderPaidOut("cs_commerce_paidout_fallback", "2026-01-02T00:00:00.000Z");
      expect(second).toBe(false);
      const afterSecond = await (
        await loadDb(undefined)
      ).getCommerceOrderByStripeSessionId("cs_commerce_paidout_fallback");
      expect(afterSecond?.paidOutAt).toBe("2026-01-01T00:00:00.000Z");
    });

    it("atomically refuses to mark paid out an order that is already refunded (commerce-order-paid-out-refund-race-guard)", async () => {
      const seedDb = await loadDb(undefined);
      await seedDb.insertCommerceOrder({
        leadSlug: "commerce-paidout-race-lead",
        skuId: "sku_1",
        skuName: "Test SKU",
        amountPaidUsd: 25,
        stripeSessionId: "cs_commerce_paidout_race",
      });

      // Simulate an independent Stripe webhook (charge.refunded) recording a
      // refund in the window between an operator's stale read and this call.
      convexMutation.mockRejectedValueOnce(new Error("convex outage"));
      await (
        await loadDb(CONVEX_URL)
      ).markCommerceOrderRefunded("cs_commerce_paidout_race");

      convexMutation.mockRejectedValueOnce(new Error("convex outage"));
      const result = await (
        await loadDb(CONVEX_URL)
      ).markCommerceOrderPaidOut("cs_commerce_paidout_race");
      expect(result).toBe(false);

      const order = await (
        await loadDb(undefined)
      ).getCommerceOrderByStripeSessionId("cs_commerce_paidout_race");
      expect(order?.paidOutAt).toBeUndefined();
      expect(order?.refundedAt).toBeDefined();
    });
  });

  describe("markMarketingPackSentToClient (sent-marker idempotency, optional requireConvex)", () => {
    it("returns Convex's result directly without touching SQLite", async () => {
      const seedDb = await loadDb(undefined);
      await seedDb.upsertMarketingPack({
        leadSlug: "marketing-pack-lead",
        yearMonth: "2026-07",
        variants: [{ contentType: "gbp_post", body: "Test post" }],
        generatedAt: "2026-07-01T00:00:00.000Z",
        generator: "stub",
      });

      convexMutation.mockResolvedValueOnce(true);
      const db = await loadDb(CONVEX_URL);
      const result = await db.markMarketingPackSentToClient("marketing-pack-lead", "2026-07");
      expect(result).toBe(true);
      expect(convexMutation).toHaveBeenCalledTimes(1);

      // A missing early-`return;` would have also run the SQLite UPDATE —
      // reading through the pure-SQLite path confirms it did not.
      const pack = await (
        await loadDb(undefined)
      ).getMarketingPack("marketing-pack-lead", "2026-07");
      expect(pack?.sentToClientAt).toBeUndefined();
    });

    it("throws ConvexPrimaryWriteError instead of silently falling back when requireConvex is set and Convex fails", async () => {
      convexMutation.mockRejectedValueOnce(new Error("convex outage"));
      const db = await loadDb(CONVEX_URL);
      await expect(
        db.markMarketingPackSentToClient("some-lead", "2026-07", undefined, {
          requireConvex: true,
        }),
      ).rejects.toThrow(/markMarketingPackSentToClient/);
    });

    it("marks sentToClientAt via SQLite, idempotently, on Convex failure", async () => {
      const seedDb = await loadDb(undefined);
      await seedDb.upsertMarketingPack({
        leadSlug: "marketing-pack-fallback-lead",
        yearMonth: "2026-07",
        variants: [{ contentType: "gbp_post", body: "Test post" }],
        generatedAt: "2026-07-01T00:00:00.000Z",
        generator: "stub",
      });

      convexMutation.mockRejectedValueOnce(new Error("convex outage"));
      const markDb = await loadDb(CONVEX_URL);
      const firstResult = await markDb.markMarketingPackSentToClient(
        "marketing-pack-fallback-lead",
        "2026-07",
        "2026-01-01T00:00:00.000Z",
      );
      expect(firstResult).toBe(true);

      const afterMark = await (
        await loadDb(undefined)
      ).getMarketingPack("marketing-pack-fallback-lead", "2026-07");
      expect(afterMark?.sentToClientAt).toBe("2026-01-01T00:00:00.000Z");

      // Redelivered mark with a different timestamp must not overwrite the
      // first, and must report it did not change the row.
      convexMutation.mockRejectedValueOnce(new Error("convex outage"));
      const secondResult = await (
        await loadDb(CONVEX_URL)
      ).markMarketingPackSentToClient(
        "marketing-pack-fallback-lead",
        "2026-07",
        "2026-01-02T00:00:00.000Z",
      );
      expect(secondResult).toBe(false);

      const afterRedelivery = await (
        await loadDb(undefined)
      ).getMarketingPack("marketing-pack-fallback-lead", "2026-07");
      expect(afterRedelivery?.sentToClientAt).toBe("2026-01-01T00:00:00.000Z");
    });
  });

  describe("markCommerceOrderClientReceiptSent (sent-marker idempotency, optional requireConvex)", () => {
    it("returns Convex's result directly without touching SQLite", async () => {
      const seedDb = await loadDb(undefined);
      await seedDb.insertCommerceOrder({
        leadSlug: "commerce-receipt-lead",
        skuId: "sku_1",
        skuName: "Test SKU",
        amountPaidUsd: 25,
        stripeSessionId: "cs_commerce_receipt",
      });

      convexMutation.mockResolvedValueOnce(true);
      const db = await loadDb(CONVEX_URL);
      const result = await db.markCommerceOrderClientReceiptSent("cs_commerce_receipt");
      expect(result).toBe(true);
      expect(convexMutation).toHaveBeenCalledTimes(1);

      const order = await (
        await loadDb(undefined)
      ).getCommerceOrderByStripeSessionId("cs_commerce_receipt");
      expect(order?.clientReceiptEmailSentAt).toBeUndefined();
    });

    it("throws ConvexPrimaryWriteError instead of silently falling back when requireConvex is set and Convex fails", async () => {
      convexMutation.mockRejectedValueOnce(new Error("convex outage"));
      const db = await loadDb(CONVEX_URL);
      await expect(
        db.markCommerceOrderClientReceiptSent("cs_1", undefined, { requireConvex: true }),
      ).rejects.toThrow(/markCommerceOrderClientReceiptSent/);
    });

    it("marks clientReceiptEmailSentAt via SQLite, idempotently, on Convex failure", async () => {
      const seedDb = await loadDb(undefined);
      await seedDb.insertCommerceOrder({
        leadSlug: "commerce-receipt-fallback-lead",
        skuId: "sku_1",
        skuName: "Test SKU",
        amountPaidUsd: 25,
        stripeSessionId: "cs_commerce_receipt_fallback",
      });

      convexMutation.mockRejectedValueOnce(new Error("convex outage"));
      const firstResult = await (
        await loadDb(CONVEX_URL)
      ).markCommerceOrderClientReceiptSent(
        "cs_commerce_receipt_fallback",
        "2026-01-01T00:00:00.000Z",
      );
      expect(firstResult).toBe(true);

      const afterMark = await (
        await loadDb(undefined)
      ).getCommerceOrderByStripeSessionId("cs_commerce_receipt_fallback");
      expect(afterMark?.clientReceiptEmailSentAt).toBe("2026-01-01T00:00:00.000Z");

      convexMutation.mockRejectedValueOnce(new Error("convex outage"));
      const secondResult = await (
        await loadDb(CONVEX_URL)
      ).markCommerceOrderClientReceiptSent(
        "cs_commerce_receipt_fallback",
        "2026-01-02T00:00:00.000Z",
      );
      expect(secondResult).toBe(false);

      const afterRedelivery = await (
        await loadDb(undefined)
      ).getCommerceOrderByStripeSessionId("cs_commerce_receipt_fallback");
      expect(afterRedelivery?.clientReceiptEmailSentAt).toBe("2026-01-01T00:00:00.000Z");
    });
  });

  describe("markClientVoicePackSentToClient (sent-marker idempotency, optional requireConvex)", () => {
    it("returns Convex's result directly without touching SQLite", async () => {
      const seedDb = await loadDb(undefined);
      await seedDb.upsertClientVoicePack({
        leadSlug: "voice-pack-lead",
        variants: [{ scriptType: "inbound_greeting", title: "Greeting", body: "Hello!" }],
        generatedAt: "2026-07-01T00:00:00.000Z",
        generator: "stub",
      });

      convexMutation.mockResolvedValueOnce(true);
      const db = await loadDb(CONVEX_URL);
      const result = await db.markClientVoicePackSentToClient("voice-pack-lead");
      expect(result).toBe(true);
      expect(convexMutation).toHaveBeenCalledTimes(1);

      const pack = await (
        await loadDb(undefined)
      ).getClientVoicePackByLeadSlug("voice-pack-lead");
      expect(pack?.sentToClientAt).toBeUndefined();
    });

    it("throws ConvexPrimaryWriteError instead of silently falling back when requireConvex is set and Convex fails", async () => {
      convexMutation.mockRejectedValueOnce(new Error("convex outage"));
      const db = await loadDb(CONVEX_URL);
      await expect(
        db.markClientVoicePackSentToClient("some-lead", undefined, { requireConvex: true }),
      ).rejects.toThrow(/markClientVoicePackSentToClient/);
    });

    it("marks sentToClientAt via SQLite, idempotently, on Convex failure", async () => {
      const seedDb = await loadDb(undefined);
      await seedDb.upsertClientVoicePack({
        leadSlug: "voice-pack-fallback-lead",
        variants: [{ scriptType: "inbound_greeting", title: "Greeting", body: "Hello!" }],
        generatedAt: "2026-07-01T00:00:00.000Z",
        generator: "stub",
      });

      convexMutation.mockRejectedValueOnce(new Error("convex outage"));
      const firstResult = await (
        await loadDb(CONVEX_URL)
      ).markClientVoicePackSentToClient("voice-pack-fallback-lead", "2026-01-01T00:00:00.000Z");
      expect(firstResult).toBe(true);

      const afterMark = await (
        await loadDb(undefined)
      ).getClientVoicePackByLeadSlug("voice-pack-fallback-lead");
      expect(afterMark?.sentToClientAt).toBe("2026-01-01T00:00:00.000Z");

      convexMutation.mockRejectedValueOnce(new Error("convex outage"));
      const secondResult = await (
        await loadDb(CONVEX_URL)
      ).markClientVoicePackSentToClient("voice-pack-fallback-lead", "2026-01-02T00:00:00.000Z");
      expect(secondResult).toBe(false);

      const afterRedelivery = await (
        await loadDb(undefined)
      ).getClientVoicePackByLeadSlug("voice-pack-fallback-lead");
      expect(afterRedelivery?.sentToClientAt).toBe("2026-01-01T00:00:00.000Z");
    });
  });

  describe("updateLeadStripeConnectAccountId (requireConvex fail-closed write, set-once accountCreatedAt)", () => {
    it("returns after a successful Convex mutation without touching SQLite", async () => {
      convexMutation.mockResolvedValueOnce(undefined);
      const db = await loadDb(CONVEX_URL);
      // No lead with this slug exists in the fresh SQLite file at all — the
      // SQLite fallback branch would throw "Lead with slug ... not found" if
      // the Convex-success path incorrectly fell through to it.
      await expect(
        db.updateLeadStripeConnectAccountId("no-sqlite-row-lead", "acct_123", {
          requireConvex: true,
        }),
      ).resolves.toBeUndefined();
      expect(convexMutation).toHaveBeenCalledTimes(1);
    });

    it("throws ConvexPrimaryWriteError instead of silently falling back when requireConvex is set and Convex fails", async () => {
      convexMutation.mockRejectedValueOnce(new Error("convex outage"));
      const db = await loadDb(CONVEX_URL);
      await expect(
        db.updateLeadStripeConnectAccountId("some-lead", "acct_123", { requireConvex: true }),
      ).rejects.toThrow(/updateLeadStripeConnectAccountId/);
    });

    it("falls back to a real SQLite write when requireConvex is not set and Convex fails", async () => {
      const seedDb = await loadDb(undefined);
      await seedDb.upsertLead(testLead("connect-account-fallback-lead"));

      convexMutation.mockRejectedValueOnce(new Error("convex outage"));
      const db = await loadDb(CONVEX_URL);
      await expect(
        db.updateLeadStripeConnectAccountId(
          "connect-account-fallback-lead",
          "acct_456",
          undefined,
          "2026-01-01T00:00:00.000Z",
        ),
      ).resolves.toBeUndefined();

      convexQuery.mockRejectedValueOnce(new Error("convex outage (read)"));
      const lead = await db.getLeadBySlug("connect-account-fallback-lead");
      expect(lead?.stripeConnectAccountId).toBe("acct_456");
      expect(lead?.stripeConnectAccountCreatedAt).toBe("2026-01-01T00:00:00.000Z");
    });

    it("never overwrites an already-set accountCreatedAt on a later SQLite-fallback call (set-once via COALESCE)", async () => {
      const seedDb = await loadDb(undefined);
      await seedDb.upsertLead(testLead("connect-account-set-once-lead"));

      convexMutation.mockRejectedValueOnce(new Error("convex outage"));
      const firstDb = await loadDb(CONVEX_URL);
      await firstDb.updateLeadStripeConnectAccountId(
        "connect-account-set-once-lead",
        "acct_first",
        undefined,
        "2026-01-01T00:00:00.000Z",
      );

      convexMutation.mockRejectedValueOnce(new Error("convex outage"));
      const secondDb = await loadDb(CONVEX_URL);
      await secondDb.updateLeadStripeConnectAccountId(
        "connect-account-set-once-lead",
        "acct_first",
        undefined,
        "2026-02-01T00:00:00.000Z",
      );

      convexQuery.mockRejectedValueOnce(new Error("convex outage (read)"));
      const lead = await secondDb.getLeadBySlug("connect-account-set-once-lead");
      expect(lead?.stripeConnectAccountCreatedAt).toBe("2026-01-01T00:00:00.000Z");
    });

    it("throws a not-found error via the pure-SQLite path when no Convex client is configured and the slug does not exist", async () => {
      const db = await loadDb(undefined);
      await expect(
        db.updateLeadStripeConnectAccountId("missing-slug", "acct_789"),
      ).rejects.toThrow(/not found/i);
      expect(convexMutation).not.toHaveBeenCalled();
    });
  });

  describe("updateLeadStripeConnectStatus (requireConvex fail-closed write, onboarding-status display cache)", () => {
    const STATUS = { chargesEnabled: true, payoutsEnabled: false, detailsSubmitted: true };

    it("returns after a successful Convex mutation without touching SQLite", async () => {
      convexMutation.mockResolvedValueOnce(undefined);
      const db = await loadDb(CONVEX_URL);
      await expect(
        db.updateLeadStripeConnectStatus(
          "no-sqlite-row-lead",
          STATUS,
          "2026-01-01T00:00:00.000Z",
          { requireConvex: true },
        ),
      ).resolves.toBeUndefined();
      expect(convexMutation).toHaveBeenCalledTimes(1);
    });

    it("throws ConvexPrimaryWriteError instead of silently falling back when requireConvex is set and Convex fails", async () => {
      convexMutation.mockRejectedValueOnce(new Error("convex outage"));
      const db = await loadDb(CONVEX_URL);
      await expect(
        db.updateLeadStripeConnectStatus("some-lead", STATUS, "2026-01-01T00:00:00.000Z", {
          requireConvex: true,
        }),
      ).rejects.toThrow(/updateLeadStripeConnectStatus/);
    });

    it("falls back to a real SQLite write when requireConvex is not set and Convex fails", async () => {
      const seedDb = await loadDb(undefined);
      await seedDb.upsertLead(testLead("connect-status-fallback-lead"));

      convexMutation.mockRejectedValueOnce(new Error("convex outage"));
      const db = await loadDb(CONVEX_URL);
      await expect(
        db.updateLeadStripeConnectStatus(
          "connect-status-fallback-lead",
          STATUS,
          "2026-01-01T00:00:00.000Z",
        ),
      ).resolves.toBeUndefined();

      convexQuery.mockRejectedValueOnce(new Error("convex outage (read)"));
      const lead = await db.getLeadBySlug("connect-status-fallback-lead");
      expect(lead?.stripeConnectChargesEnabled).toBe(true);
      expect(lead?.stripeConnectPayoutsEnabled).toBe(false);
      expect(lead?.stripeConnectDetailsSubmitted).toBe(true);
      expect(lead?.stripeConnectStatusCheckedAt).toBe("2026-01-01T00:00:00.000Z");
    });

    it("throws a not-found error via the pure-SQLite path when no Convex client is configured and the slug does not exist", async () => {
      const db = await loadDb(undefined);
      await expect(
        db.updateLeadStripeConnectStatus("missing-slug", STATUS, "2026-01-01T00:00:00.000Z"),
      ).rejects.toThrow(/not found/i);
      expect(convexMutation).not.toHaveBeenCalled();
    });
  });

  describe("updateLeadStage (requireConvex fail-closed write, paid/live revert guard)", () => {
    it("returns after a successful Convex mutation without touching SQLite", async () => {
      convexMutation.mockResolvedValueOnce(true);
      const db = await loadDb(CONVEX_URL);
      // No lead with this slug exists in the fresh SQLite file at all — the
      // SQLite fallback branch would throw "Lead with slug ... not found" if
      // the Convex-success path incorrectly fell through to it.
      await expect(
        db.updateLeadStage("no-sqlite-row-lead", "outreach_sent", { requireConvex: true }),
      ).resolves.toBe(true);
      expect(convexMutation).toHaveBeenCalledTimes(1);
    });

    it("trusts Convex's returned boolean directly on success rather than recomputing via SQLite", async () => {
      // Seed a paid lead via the SQLite-only path — sqliteUpdateLeadStage
      // would itself return false for a paid -> discovered downgrade below,
      // so mocking Convex to resolve true instead only passes if
      // updateLeadStage actually used Convex's result and returned early.
      const seedDb = await loadDb(undefined);
      await seedDb.upsertLead(testLead("convex-stage-lead", { stage: "paid" }));

      convexMutation.mockResolvedValueOnce(true);
      const db = await loadDb(CONVEX_URL);
      const result = await db.updateLeadStage("convex-stage-lead", "discovered");
      expect(result).toBe(true);
    });

    it("throws ConvexPrimaryWriteError instead of silently falling back when requireConvex is set and Convex fails", async () => {
      convexMutation.mockRejectedValueOnce(new Error("convex outage"));
      const db = await loadDb(CONVEX_URL);
      await expect(
        db.updateLeadStage("some-lead", "outreach_sent", { requireConvex: true }),
      ).rejects.toThrow(/updateLeadStage/);
    });

    it("falls back to a real SQLite write when requireConvex is not set and Convex fails", async () => {
      const seedDb = await loadDb(undefined);
      await seedDb.upsertLead(testLead("stage-fallback-lead"));

      convexMutation.mockRejectedValueOnce(new Error("convex outage"));
      const db = await loadDb(CONVEX_URL);
      await expect(db.updateLeadStage("stage-fallback-lead", "outreach_sent")).resolves.toBe(true);

      convexQuery.mockRejectedValueOnce(new Error("convex outage (read)"));
      const lead = await db.getLeadBySlug("stage-fallback-lead");
      expect(lead?.stage).toBe("outreach_sent");
    });

    it("throws a not-found error via the pure-SQLite path when no Convex client is configured and the slug does not exist", async () => {
      const db = await loadDb(undefined);
      await expect(db.updateLeadStage("missing-slug", "outreach_sent")).rejects.toThrow(/not found/i);
      expect(convexMutation).not.toHaveBeenCalled();
    });

    it("SQLite fallback skips the write and returns false when a paid/live lead's stage would be reverted (update-lead-stage-action-paid-live-revert-guard parity)", async () => {
      const db = await loadDb(undefined);
      await db.upsertLead(testLead("paid-stage-lead", { stage: "paid" }));

      const result = await db.updateLeadStage("paid-stage-lead", "discovered");
      expect(result).toBe(false);

      const lead = await db.getLeadBySlug("paid-stage-lead");
      expect(lead?.stage).toBe("paid");
    });

    it("SQLite fallback still allows the normal paid -> live transition from a paid row", async () => {
      const db = await loadDb(undefined);
      await db.upsertLead(testLead("paid-to-live-lead", { stage: "paid" }));

      const result = await db.updateLeadStage("paid-to-live-lead", "live");
      expect(result).toBe(true);

      const lead = await db.getLeadBySlug("paid-to-live-lead");
      expect(lead?.stage).toBe("live");
    });
  });
});
