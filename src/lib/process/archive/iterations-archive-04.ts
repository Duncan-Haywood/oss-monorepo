/**
 * Archived ProcessIteration entries — see src/lib/process/prompt_process.tsx for
 * why this exists (process-log-archive-scalability-split in
 * BUSINESS_DECISIONS) and for the live, editable tail. Part 4 of 8, oldest-first (chronological order preserved across all archive files + the live tail).
 *
 * Append-only, like the live arrays it was split from — never edit an entry
 * here, and never append new entries directly to an archive file. New
 * entries always go in the live array in prompt_process.tsx (or
 * business-decisions.ts for BUSINESS_DECISIONS); a future maintenance pass
 * moves the oldest live entries into a new archive file (or a new numbered
 * file in this directory) once the live file grows large again.
 */
import type { ProcessIteration } from "../types";
import { BUSINESS_DECISIONS } from "../business-decisions";

export const ITERATIONS_ARCHIVE_04: ProcessIteration[] = [
  {
    date: "2026-07-17",
    branch: "cursor/business-process-evolution-0c15",
    summary:
      "Empty-backlog after PR #341 (bundle-paid-orphan-open-checkout-session-cleanup). Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI remotes were invent-optional-aggregate / clean-audit-only / already-merged — rejected. Fresh residual twin: webhook ran markCompleteOpenBundleCheckoutSessionsForLead as soon as parseLeadSlugLookup succeeded — before getBundle / catalog Prices / currency usd / amount parity / recordLeadPayment. A paid Session that later skipped fulfillment still closed sibling open bundle carts and ACKed 200, permanently killing Finish-checkout / digest recovery without recording payment. Moved orphan cleanup to after durable recordLeadPayment (+ handoff enqueue); Vitest amount/tier/currency skip + call-order regressions; architecture + AGENT_PROTOCOL note.",
    shipped: [
      "src/app/api/stripe/webhook/route.ts — orphan open bundle cleanup only after recordLeadPayment + handoff enqueue",
      "src/app/api/stripe/webhook/route.test.ts — +3 skip-path keep-recovery regressions; 500 cleanup after payment; call-order vs recordLeadPayment",
      "Docs: architecture.tsx notes cleanup gated behind durable fulfillment (not slug parse alone)",
      "AGENT_PROTOCOL — after orphan-open cleanup ships, immediately gate it behind catalog + durable payment",
      "NEXT_STEPS: bundle-orphan-cleanup-after-catalog-fulfillment done",
      "BUSINESS_DECISIONS — require orphan cleanup after durable recordLeadPayment (absolute index 390)",
      "Process: object-parse by decision text (orphan cleanup=389, lead portal=388) before appending ours",
      "Verified: npm test (1688 passed = main@#341's 1685 + 3 skip-path keep-recovery regressions) + lint",
    ],
    // Object-parse by decision text: cleanup-after-fulfillment owns BD[390]; orphan cleanup=389.
    decisions: BUSINESS_DECISIONS.slice(390, 391),
  },
  {
    date: "2026-07-17",
    branch: "cursor/prompt-process-evolution-ff47",
    summary:
      "Empty-backlog after PR #341 (bundle-paid-orphan-open-checkout-session-cleanup). Sibling business-process-evolution-0c15 shipped bundle-orphan-cleanup-after-catalog-fulfillment (#342) same window — complementary pivot; folded both ITERATIONS. Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI remotes already-merged — rejected. Fresh sold residual: paid commerce_sku only markComplete'd the paid stripeSessionId, so earlier abandoned Buy now carts for the same shopper+SKU stayed in digest / Send Buy now recovery. Shipped markCompleteOpenCommerceForLeadSkuCustomer scoped by leadSlug+skuId+normalized customerEmail (skip blank email); webhook calls it only after insertCommerceOrder; Vitest + architecture note; process now requires commerce twin after bundle orphan cleanup and after-fulfillment ordering for both.",
    shipped: [
      "merge: origin/main (PR #342 bundle orphan cleanup after durable fulfillment) — keep sibling ITERATION; complementary commerce twin",
      "convex/checkoutSessions.ts — markCompleteOpenCommerceForLeadSkuCustomer (by_leadSlug; lead+sku+email; skip blank email)",
      "src/lib/db.ts — markCompleteOpenCommerceCheckoutSessionsForLeadSkuCustomer + static API map registration",
      "src/lib/checkout/abandoned-recovery.ts — openCommerceCheckoutSessionsToClose + normalizeCheckoutCustomerEmailForMatch",
      "src/lib/payments/webhook-fulfillment.ts — checkout_session_orphan_commerce_cleanup 5xx step",
      "src/app/api/stripe/webhook/route.ts — close orphan open commerce carts after durable insertCommerceOrder",
      "Vitest: abandoned-recovery + webhook + fulfillment step regressions (after-ledger ordering, blank-email skip, amount-gate skip)",
      "Docs: architecture.tsx notes commerce orphan cleanup beside bundle twin",
      "AGENT_PROTOCOL — after-fulfillment orphan cleanup ordering; commerce twin after bundle orphan-open",
      "NEXT_STEPS: commerce-paid-orphan-open-checkout-session-cleanup done; bundle-orphan-cleanup-after-catalog-fulfillment done (0c15 / #342)",
      "BUSINESS_DECISIONS — require commerce orphan open cleanup after paid Buy now ledger (absolute index 391)",
      "Process: object-parse by decision text (after-fulfillment=390, bundle orphan=389) before appending ours; claim pushed before feature body",
      "Verified: npm test (1697 passed after #342 fold = sibling 1688 + commerce orphan regressions) + lint",
    ],
    // Object-parse by decision text: commerce orphan open cleanup owns BD[391]; after-fulfillment=390.
    decisions: BUSINESS_DECISIONS.slice(391, 392),
  },
  {
    date: "2026-07-17",
    branch: "cursor/business-process-evolution-a654",
    summary:
      "Empty-backlog after PR #343 (commerce-paid-orphan-open-checkout-session-cleanup). Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI remotes invent-optional-aggregate / clean-audit-only / already-merged — rejected. Sibling prompt-process-evolution-9a1a had not claimed. Fresh money-path residual: customer.subscription.deleted was ACK'd without CRM sync, so canceled Growth/Complete/Commerce subscribers kept marketing/voice/catalog entitlement. Shipped orders.recurringCanceledAt + markRecurringCanceledByCustomer (by_stripeCustomerId) + webhook handler (5xx on write fail); gated pack/catalog eligibility on !recurringCanceledAt; kept Billing Portal + stage=paid|live; Vitest + architecture note.",
    shipped: [
      "convex/schema.ts — orders.recurringCanceledAt + by_stripeCustomerId index",
      "convex/orders.ts — markRecurringCanceledByCustomer (idempotent; Growth/Complete/Commerce only)",
      "src/lib/db.ts — markOrdersRecurringCanceledByCustomer + SQLite ALTER/index + API map registration",
      "src/lib/orders/recurring.ts (+ test) — orderHasActiveRecurringEntitlement helpers",
      "src/lib/marketing/monthly-pack.ts + voice/faq-pack.ts + commerce/catalog.ts — gate eligibility on !recurringCanceledAt",
      "src/app/api/stripe/webhook/route.ts — customer.subscription.deleted → CRM sync (orders_recurring_canceled 5xx)",
      "src/lib/payments/webhook-fulfillment.ts — orders_recurring_canceled step",
      "Vitest: webhook + fulfillment + eligibility + recurring helper regressions",
      "Docs: architecture.tsx notes subscription.deleted CRM sync beside Billing Portal cancel",
      "AGENT_PROTOCOL — after commerce orphan cleanup, sync subscription.deleted into recurringCanceledAt",
      "NEXT_STEPS: customer-subscription-deleted-crm-sync done",
      "BUSINESS_DECISIONS — require subscription.deleted CRM sync (absolute index 392)",
      "Process: object-parse by decision text (commerce orphan=391, after-fulfillment=390) before appending ours; claim pushed before feature body",
      "Verified: npm test (1708 passed) + lint",
    ],
    // Object-parse by decision text: subscription.deleted CRM sync owns BD[392]; commerce orphan=391.
    decisions: BUSINESS_DECISIONS.slice(392, 393),
  },
  {
    date: "2026-07-17",
    branch: "cursor/prompt-process-evolution-9a1a",
    summary:
      "Empty-backlog after PR #344 (customer-subscription-deleted-crm-sync). Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI remotes invent-optional-aggregate / clean-audit-only / already-merged — rejected. Fresh twin residual: subscription.deleted set recurringCanceledAt, but active|trialing Subscription events never cleared it — Billing Portal / Checkout resubscribers stayed blocked from packs/catalog. Shipped clearRecurringCanceledByCustomer (Convex replace + SQLite NULL) + webhook on created|updated when status grants entitlement; past_due/unpaid skip; Vitest + architecture note; process now requires reactivate twin immediately after cancel sync.",
    shipped: [
      "convex/orders.ts — clearRecurringCanceledByCustomer (replace omits optional; Growth/Complete/Commerce only)",
      "src/lib/db.ts — clearOrdersRecurringCanceledByCustomer + static API map registration",
      "src/lib/orders/recurring.ts (+ test) — stripeSubscriptionGrantsRecurringEntitlement (active|trialing)",
      "src/app/api/stripe/webhook/route.ts — created|updated → clear CRM cancel (orders_recurring_reactivated 5xx)",
      "src/lib/payments/webhook-fulfillment.ts — orders_recurring_reactivated step",
      "Vitest: webhook reactivate + past_due skip + fulfillment step + recurring helper regressions",
      "Docs: architecture.tsx notes resubscribe clear beside subscription.deleted CRM sync",
      "AGENT_PROTOCOL — after subscription.deleted CRM sync, immediately clear on active|trialing",
      "NEXT_STEPS: customer-subscription-reactivated-crm-sync done",
      "BUSINESS_DECISIONS — require subscription reactivate CRM clear (absolute index 393)",
      "Process: object-parse by decision text (subscription.deleted=392) before appending ours; claim pushed before feature body; patched agent-hooks secret-name filter for CLOUD_AGENT_INJECTED_SECRET_NAMES labels",
      "Verified: npm test (1715 passed) + lint",
    ],
    // Object-parse by decision text: subscription reactivate CRM clear owns BD[393]; deleted sync=392.
    decisions: BUSINESS_DECISIONS.slice(393, 394),
  },
  {
    date: "2026-07-17",
    branch: "cursor/prompt-process-evolution-8b08",
    summary:
      "Empty-backlog after PR #345 (customer-subscription-reactivated-crm-sync). Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI remotes invent-optional-aggregate / clean-audit-only / already-merged — rejected. Fresh twin residual: active|trialing clear restored packs after cancel, but past_due|unpaid renewals and invoice.payment_failed never paused CRM — failed card renewals kept marketing/voice/catalog until hard cancel. Shipped pause via markOrdersRecurringCanceledByCustomer on subscription.updated past_due|unpaid + invoice.payment_failed (subscription invoices only); helpers + Vitest + architecture note; process now requires pause twin immediately after reactivate clear. Merged to main as PR #346 — this ITERATION kept when folding onto business-process-evolution-13bc.",
    shipped: [
      "src/lib/orders/recurring.ts (+ test) — stripeSubscriptionPausesRecurringEntitlement + invoicePaymentFailedPausesRecurringEntitlement",
      "src/app/api/stripe/webhook/route.ts — past_due|unpaid + invoice.payment_failed → CRM pause (orders_recurring_canceled 5xx)",
      "Vitest: webhook past_due/unpaid pause + invoice.payment_failed + one-time skip + write-fail 5xx",
      "Docs: architecture.tsx notes past_due/unpaid + invoice.payment_failed pause beside cancel/reactivate",
      "AGENT_PROTOCOL — after subscription reactivate clear, immediately pause on past_due/unpaid + invoice.payment_failed",
      "NEXT_STEPS: invoice-payment-failed-past-due-crm-pause done",
      "BUSINESS_DECISIONS — require past_due/unpaid + invoice.payment_failed CRM pause (absolute index 394)",
      "Process: object-parse by decision text (reactivate clear=393) before appending ours; claim pushed before feature body; patched agent-hooks secret-name filter for CLOUD_AGENT_INJECTED_SECRET_NAMES labels",
      "Verified: npm test (1724 passed) + lint; later main merge as PR #346",
    ],
    // Object-parse by decision text: past_due/invoice pause owns BD[394]; reactivate clear=393.
    decisions: BUSINESS_DECISIONS.slice(394, 395),
  },
  {
    date: "2026-07-17",
    branch: "cursor/business-process-evolution-13bc",
    summary:
      "Empty-backlog after PR #345 (customer-subscription-reactivated-crm-sync). Sibling prompt-process-evolution-8b08 claimed + shipped invoice-payment-failed-past-due-crm-pause (PR #346) — complementary pivot; folded their feature body then merged origin/main. Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI remotes invent-optional-aggregate / clean-audit-only / already-merged — rejected. Fresh residual: Stripe pause_collection keeps status=active|trialing while collection is paused, so the grants-first clear path restored/kept packs for non-paying paused subscribers. Shipped stripeSubscriptionHasPauseCollection + webhook pause before clear; Vitest + architecture note; process now requires pause_collection twin immediately after past_due pause.",
    shipped: [
      "merge: sibling prompt-process-evolution-8b08 past_due/invoice.payment_failed CRM pause — keep both NEXT_STEPS/ITERATIONS",
      "merge: origin/main after PR #346 — resolve process conflicts; restore 8b08+13bc ITERATIONS",
      "src/lib/orders/recurring.ts (+ test) — stripeSubscriptionHasPauseCollection",
      "src/app/api/stripe/webhook/route.ts — pause_collection → CRM pause before active|trialing clear",
      "Vitest: webhook active+pause_collection / trialing+pause_collection regressions (no clear)",
      "Docs: architecture.tsx notes pause_collection beside past_due/invoice pause",
      "AGENT_PROTOCOL — after past_due pause, immediately close pause_collection twin (status-active hole)",
      "NEXT_STEPS: subscription-pause-collection-crm-pause done; invoice-payment-failed-past-due-crm-pause done (8b08/#346)",
      "BUSINESS_DECISIONS — require pause_collection CRM pause (absolute index 395)",
      "Process: object-parse by decision text (past_due pause=394) before appending ours; claim pushed before feature body; same-minute coop fold of 8b08; remapped BD slices after main merge",
      "Verified: npm test (1728 passed = sibling 1724 + 2 pause_collection helper + 2 webhook regressions) + lint",
    ],
    // Object-parse by decision text: pause_collection CRM pause owns BD[395]; past_due/invoice=394.
    decisions: BUSINESS_DECISIONS.slice(395, 396),
  },
  {
    date: "2026-07-17",
    branch: "cursor/business-process-evolution-4b2e",
    summary:
      "Empty-backlog after PR #347 (subscription-pause-collection-crm-pause). Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI remotes invent-optional-aggregate / clean-audit-only / already-merged — rejected. Fresh wiring residual: #344–#347 persist recurringCanceledAt and gate packs/catalog, but paused/canceled MRR customers silently vanished from marketingPacksDue with no recovery queue. Shipped listRecurringEntitlementPaused + oldest age helper; wired pipeline-health count/age, daily digest action section (capped 5, pre-slice header count), and dashboard metric/callout pointing at Manage billing; Vitest + architecture note; process now requires this wiring immediately after CRM pause sync.",
    shipped: [
      "src/lib/orders/recurring.ts (+ test) — listRecurringEntitlementPaused + oldestRecurringEntitlementPausedAgeHours",
      "src/lib/metrics/pipeline-health.ts (+ test) — recurringEntitlementPausedCount + oldest age",
      "src/lib/digest/daily-digest.ts (+ test) — MRR paused/canceled section + escapeHtml rows",
      "src/components/dashboard/pipeline-health-panel.tsx — metric card + Manage billing callout",
      "Docs: architecture.tsx notes paused MRR recovery queue beside recurringCanceledAt",
      "AGENT_PROTOCOL — after #344–#347 CRM sync, immediately wire listRecurringEntitlementPaused into health/digest",
      "NEXT_STEPS: recurring-entitlement-paused-pipeline-digest done",
      "BUSINESS_DECISIONS — require paused MRR pipeline/digest wiring (absolute index 396)",
      "Process: object-parse by decision text (pause_collection=395) before appending ours; claim pushed before feature body; tightened #344–#347 ITERATIONS BD slices after cascade",
    ],
    // Object-parse by decision text: paused MRR pipeline/digest owns BD[396]; pause_collection=395.
    decisions: BUSINESS_DECISIONS.slice(396, 397),
  },
  {
    date: "2026-07-17",
    branch: "cursor/prompt-process-evolution-716e",
    summary:
      "Empty-backlog after PR #347 (subscription-pause-collection-crm-pause). Sibling business-process-evolution-4b2e claimed recurring-entitlement-paused-pipeline-digest — complementary pivot (operator digest visibility); kept claim ownership of create-path + sync gates. Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI remotes invent-optional-aggregate / clean-audit-only / already-merged — rejected. Fresh residual after #344–#347 CRM triad: preview + saveCommerceCatalogAction gated on leadEligibleForCommerceCatalog, but POST /api/commerce/checkout and syncCommerceCatalogToStripeAction still trusted catalog+stripePriceId — canceled/paused Commerce subscribers kept Buy now Session mint + operator Price re-sync. Shipped same predicate on both paths; Vitest + architecture note; process now requires create/sync twins immediately after CRM entitlement pause for a sold surface.",
    shipped: [
      "src/app/api/commerce/checkout/route.ts — getLeadBySlug + listOrdersByLeadSlug + leadEligibleForCommerceCatalog before Session create (404 lead / 403 ineligible)",
      "src/app/api/commerce/checkout/route.test.ts — +3 entitlement regressions (missing lead / paused recurring / no commerceAddon); fixtures default eligible",
      "src/app/dashboard/leads/actions.ts — syncCommerceCatalogToStripeAction entitlement gate (twin of save)",
      "src/app/dashboard/leads/sync-commerce-catalog-to-stripe-action.test.ts — +2 entitlement regressions; listOrdersByLeadSlug wired",
      "Docs: architecture.tsx notes Buy now create + Sync share leadEligibleForCommerceCatalog with preview/save",
      "AGENT_PROTOCOL — after CRM entitlement pause for a sold surface, immediately close create-path + Sync twins",
      "NEXT_STEPS: commerce-buy-now-create-path-entitlement-gate + commerce-sync-recurring-entitlement-gate done",
      "merge: sibling business-process-evolution-4b2e paused MRR pipeline/digest — keep both NEXT_STEPS/ITERATIONS",
      "BUSINESS_DECISIONS — require Buy now create + Sync entitlement gates (absolute index 397)",
      "Process: coop with sibling 4b2e digest claim; claim pushed before feature body; patched agent-hooks secret-name filter; remapped BD slices after fold (digest=396, create/sync=397)",
      "Verified: npm test (1739 passed) + lint after sibling fold",
    ],
    // Object-parse by decision text: Buy now create/sync entitlement owns BD[397]; paused digest=396.
    decisions: BUSINESS_DECISIONS.slice(397, 398),
  },
  {
    date: "2026-07-17",
    branch: "cursor/business-process-evolution-19f7",
    summary:
      "Empty-backlog after PR #348/#349 (Buy now create/sync entitlement + paused MRR digest). Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI remotes invent-optional-aggregate / clean-audit-only / already-merged (email-href #238, redirect-url #218) — rejected. Fresh residual twin: #348 gates mint + Sync on leadEligibleForCommerceCatalog, but checkout.session.completed commerce_sku still fulfilled from catalog+Price alone — Dashboard-minted or pre-pause Sessions still ledgers insertCommerceOrder / inquiry / client receipt for paused/canceled Commerce subscribers. Shipped same predicate before insertCommerceOrder; Vitest + architecture note; process now requires webhook twin immediately after create/sync entitlement. Merged to main as PR #350 — this ITERATION kept when folding onto prompt-process-evolution-f273.",
    shipped: [
      "src/app/api/stripe/webhook/route.ts — getLeadBySlug + listOrdersByLeadSlug + leadEligibleForCommerceCatalog before commerce_sku ledger (missing lead / ineligible skip)",
      "src/app/api/stripe/webhook/route.test.ts — +3 entitlement regressions (missing lead / paused recurring / no commerceAddon); fixtures default eligible",
      "Docs: architecture.tsx notes commerce_sku webhook shares leadEligibleForCommerceCatalog with Buy now create/sync",
      "AGENT_PROTOCOL — after create/sync entitlement (#348), immediately close commerce_sku webhook twin",
      "NEXT_STEPS: commerce-webhook-recurring-entitlement-gate done",
      "BUSINESS_DECISIONS — require commerce_sku webhook entitlement gate (absolute index 398)",
      "Process: object-parse by decision text (create/sync=397) before appending ours; claim pushed before feature body; sibling prompt-process-evolution-f273 claimed invoice-paid restore + payment_failed stale-repause (complementary; no overlap)",
      "Verified: npm test (1742 passed = prior 1739 + 3 webhook entitlement regressions) + lint; later main merge as PR #350",
    ],
    // Object-parse by decision text: commerce webhook entitlement owns BD[398]; create/sync=397.
    decisions: BUSINESS_DECISIONS.slice(398, 399),
  },
  {
    date: "2026-07-17",
    branch: "cursor/prompt-process-evolution-f273",
    summary:
      "Empty-backlog after PR #348/#349 (Buy now create/sync entitlement + paused MRR digest). Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI remotes invent-optional-aggregate / clean-audit-only / already-merged — rejected. Sibling business-process-evolution-19f7 claimed/shipped commerce-webhook-recurring-entitlement-gate (#350) — complementary pivot; folded origin/main. Fresh CRM restore asymmetry: #346 pauses packs on invoice.payment_failed so entitlement does not lag delayed subscription.updated past_due, but invoice.paid was a no-op — a paying customer could stay recurringCanceledAt-paused when invoice.paid won the race; payment_failed also re-paused after recovery without re-checking Subscription status. Shipped invoice.paid restore + payment_failed stale-repause guard via subscriptions.retrieve + shared shouldRestore/shouldPause helpers; Vitest + architecture note; process now requires invoice restore twin immediately after payment_failed pause.",
    shipped: [
      "merge: origin/main after PR #350 commerce_sku webhook entitlement — keep both NEXT_STEPS/ITERATIONS",
      "src/lib/orders/recurring.ts (+ test) — stripeSubscriptionIdFromInvoice, invoicePaidMayRestoreRecurringEntitlement, stripeSubscriptionShouldRestoreRecurringEntitlement, stripeSubscriptionShouldPauseRecurringEntitlement",
      "src/app/api/stripe/webhook/route.ts — invoice.paid restore + invoice.payment_failed retrieve-before-mark (subscription_retrieve 5xx)",
      "src/lib/payments/webhook-fulfillment.ts (+ test) — subscription_retrieve step",
      "Vitest: webhook invoice.paid restore / pause_collection skip / payment_failed stale-active skip / retrieve-fail 5xx",
      "Docs: architecture.tsx notes invoice.paid restore + payment_failed stale-repause beside past_due pause",
      "AGENT_PROTOCOL — after invoice.payment_failed pause, immediately close invoice.paid restore + stale-repause guard",
      "NEXT_STEPS: invoice-paid-recurring-entitlement-restore + invoice-payment-failed-stale-repause-guard done; commerce-webhook-recurring-entitlement-gate done (#350)",
      "BUSINESS_DECISIONS — require invoice.paid restore + payment_failed retrieve-before-mark (absolute index 399)",
      "Process: coop fold of sibling 19f7/#350; claim pushed before feature body; patched agent-hooks secret-name filter; remapped BD slices after main merge (webhook=398, invoice restore=399)",
      "Verified: npm test + lint after main fold",
    ],
    // Object-parse by decision text: invoice.paid restore + payment_failed stale guard owns BD[399]; commerce webhook=398.
    decisions: BUSINESS_DECISIONS.slice(399, 400),
  },
  {
    date: "2026-07-17",
    branch: "cursor/business-process-evolution-cbcb",
    summary:
      "Empty-backlog after PR #350/#351 (commerce webhook entitlement + invoice.paid restore). Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI remotes invent-optional-aggregate / clean-audit-only / already-merged — rejected. No concurrent sibling claim. Fresh residual twin: #348–#350 gate Buy now create/sync/webhook on leadEligibleForCommerceCatalog, but sendCommerceCheckoutRecoveryAction + due queues / digest / pipeline-health still nudged end-customer carts for paused/canceled Commerce subscribers. Shipped same predicate on recovery send + leadSlugsEligibleForCommerceAbandonedRecovery filter; Vitest + architecture note; process now requires abandoned-recovery twin immediately after create/sync/webhook entitlement.",
    shipped: [
      "src/lib/checkout/abandoned-recovery.ts (+ test) — leadSlugsEligibleForCommerceAbandonedRecovery + eligibleLeadSlugs filter on listCommerceAbandonedCheckoutsDue",
      "src/app/dashboard/leads/actions.ts — sendCommerceCheckoutRecoveryAction entitlement gate (twin of create/sync/webhook)",
      "src/app/dashboard/leads/checkout-recovery-actions.test.ts — +2 entitlement regressions (missing lead / paused recurring); fixtures default eligible",
      "src/lib/digest/daily-digest.ts (+ test) — filter Buy now recovery section via entitlement set",
      "src/lib/metrics/pipeline-health.ts (+ test) — omit commerce abandoned counts for ineligible leads",
      "src/app/dashboard/leads/leads-client.tsx — dashboard Abandoned Buy now panel uses entitlement set",
      "Docs: architecture.tsx notes Buy now recovery shares leadEligibleForCommerceCatalog with create/sync/webhook",
      "AGENT_PROTOCOL — after create/sync/webhook entitlement, immediately close abandoned-recovery twin",
      "NEXT_STEPS: commerce-abandoned-recovery-entitlement-gate done",
      "BUSINESS_DECISIONS — require Buy now recovery + due-queue entitlement gates (absolute index 400)",
      "Process: object-parse by decision text (invoice restore=399, webhook=398) before appending ours; claim pushed before feature body",
      "Verified: npm test (1761 passed = main@#351's 1752 + 9 entitlement regressions) + lint",
    ],
    // Object-parse by decision text: abandoned-recovery entitlement owns BD[400]; invoice restore=399.
    decisions: BUSINESS_DECISIONS.slice(400, 401),
  },
  {
    date: "2026-07-17",
    branch: "cursor/prompt-process-evolution-d772",
    summary:
      "Empty-backlog after PR #352 (commerce-abandoned-recovery-entitlement-gate). Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI remotes invent-optional-aggregate / clean-audit-only / already-merged — rejected. Folded sibling cbcb/#352 onto this branch before claiming. Dated clean-audit (escapeHtml sinks, webhook alreadyRecorded side-effect recovery, uncapped debt lists, marketing/voice entitlement, archiveOrphan intentional) came back clean. Fresh residual: #352 left listCommerceAbandonedCheckoutsDue.eligibleLeadSlugs optional (omit→allow-all). Required the arg at the type level + empty-set fail-closed Vitest; process now requires type-level require after optional entitlement filters ship.",
    shipped: [
      "merge: origin/main after #352 abandoned-recovery entitlement — keep sibling cbcb ITERATION",
      "src/lib/checkout/abandoned-recovery.ts — eligibleLeadSlugs required (no omit→allow-all)",
      "src/lib/checkout/abandoned-recovery.test.ts — call sites pass set; +1 empty-set fail-closed case",
      "Docs: architecture.tsx notes required entitlement set on Buy now recovery due helper",
      "AGENT_PROTOCOL — after optional entitlement filter ships, immediately require it at the type level",
      "NEXT_STEPS: commerce-abandoned-recovery-require-entitlement-set done; commerce-abandoned-recovery-entitlement-gate done (#352)",
      "BUSINESS_DECISIONS — require type-level eligibleLeadSlugs (absolute index 401)",
      "Process: coop fold of sibling cbcb/#352; claim pushed before feature body; clean-audit documented (no invent-optional-aggregate)",
      "Verified: npm test (1762 passed = main@#352's 1761 + 1 empty-set fail-closed) + lint",
    ],
    // Object-parse by decision text: require-entitlement-set owns BD[401]; abandoned-recovery gate=400.
    decisions: BUSINESS_DECISIONS.slice(401, 402),
  },
  {
    date: "2026-07-17",
    branch: "cursor/business-process-evolution-6b9c",
    summary:
      "Empty-backlog after PR #353 (commerce-abandoned-recovery-require-entitlement-set). Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI remotes invent-optional-aggregate / clean-audit-only / already-merged — rejected. Concurrent sibling prompt-process-evolution-203f claimed entitlement-order-arg-recurring-canceled-type-parity — complementary; merged as #354 then folded onto 203f. Fresh residual: leadEligibleForMarketingPack gates generate on !recurringCanceledAt, but bestMarketingOrderTier still preferred any Complete (including paused/canceled) over active Growth — over-delivered full_marketing. Shipped active-entitlement filter on bestMarketingOrderTier; Vitest + architecture note; process now requires inner tier selectors after outer eligibility gates.",
    shipped: [
      "src/lib/marketing/monthly-pack.ts — bestMarketingOrderTier skips recurringCanceledAt rows",
      "src/lib/marketing/monthly-pack.test.ts — canceled Complete + active Growth → growth; all-paused → null",
      "Docs: architecture.tsx notes bestMarketingOrderTier shares !recurringCanceledAt with leadEligibleForMarketingPack",
      "AGENT_PROTOCOL — after outer pack eligibility, immediately audit inner tier/package selectors",
      "NEXT_STEPS: best-marketing-order-tier-active-entitlement done",
      "BUSINESS_DECISIONS — require active-entitlement bestMarketingOrderTier (absolute index 402)",
      "Process: object-parse by decision text (require-entitlement-set=401) before appending ours; claim pushed before feature body",
      "Verified: npm test (1763 passed = main@#353's 1762 + 1 active-tier regression) + lint",
    ],
    // Object-parse by decision text: best-marketing-order-tier owns BD[402]; require-entitlement-set=401.
    decisions: BUSINESS_DECISIONS.slice(402, 403),
  },
  {
    date: "2026-07-17",
    branch: "cursor/prompt-process-evolution-203f",
    summary:
      "Empty-backlog after PR #353 (commerce-abandoned-recovery-require-entitlement-set). Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI remotes invent-optional-aggregate / clean-audit-only / already-merged — rejected. Sibling business-process-evolution-6b9c claimed/shipped best-marketing-order-tier-active-entitlement (#354) — complementary pivot; folded here after merging origin/main. Fresh type-level residual twin of #353: marketing/voice deliver-pack + listCommerceCatalogsUnsynced omitted recurringCanceledAt from orders arg types. Aligned types with leadEligibleFor* predicates + Vitest paused-delivery / unsynced exclusion; process now audits wrapper order-arg types after entitlement filter requires.",
    shipped: [
      "merge: origin/main #354 best-marketing-order-tier-active-entitlement — keep both ITERATIONS",
      "src/lib/marketing/deliver-pack.ts — orders arg includes recurringCanceledAt?",
      "src/lib/voice/deliver-pack.ts — orders arg includes recurringCanceledAt?",
      "src/lib/commerce/catalog.ts — listCommerceCatalogsUnsynced orders arg includes recurringCanceledAt?",
      "Vitest: +3 paused entitlement regressions (marketing/voice deliver + unsynced exclusion)",
      "Docs: architecture.tsx notes wrapper order-arg type parity with entitlement predicates",
      "AGENT_PROTOCOL — after type-level entitlement filter require, audit wrapper helpers' orders args",
      "NEXT_STEPS: entitlement-order-arg-recurring-canceled-type-parity done; best-marketing-order-tier-active-entitlement done (#354)",
      "BUSINESS_DECISIONS — require recurringCanceledAt on entitlement-wrapper order args (absolute index 403)",
      "Process: coop fold of sibling 6b9c/#354; claim pushed before feature body",
      "Verified: npm test (1766 passed = main@#354's 1763 + 3 type-parity) + lint",
    ],
    // Object-parse by decision text: order-arg type parity owns BD[403]; bestMarketingOrderTier=402.
    decisions: BUSINESS_DECISIONS.slice(403, 404),
  },
  {
    date: "2026-07-17",
    branch: "cursor/business-process-evolution-3811",
    summary:
      "Empty-backlog after PR #354/#355 (bestMarketingOrderTier active entitlement + wrapper order-arg type parity). Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI remotes invent-optional-aggregate / clean-audit-only / already-merged — rejected. Concurrent sibling prompt-process-evolution-b43f had not claimed yet. Fresh residual twin: POST /api/marketing/generate soft-caps business via normalizeMarketingGenerateBusiness, but businessContextFromLead / clientVoiceBusinessContextFromLead still passed raw lead fields into Anthropic/stub. Soft-capped both builders; Vitest + architecture note; process now requires lead→request soft-cap after public generate soft-cap.",
    shipped: [
      "src/lib/marketing/build-request.ts — businessContextFromLead → normalizeMarketingGenerateBusiness",
      "src/lib/voice/build-request.ts — clientVoiceBusinessContextFromLead reuses same soft-cap (strip websiteUrl)",
      "Vitest: +2 soft-cap regressions (marketing + voice build-request)",
      "Docs: architecture.tsx notes lead→request soft-cap parity with public generate",
      "AGENT_PROTOCOL — after public generate soft-cap, immediately close dashboard lead→request twin",
      "NEXT_STEPS: marketing-voice-build-request-business-context-soft-cap done",
      "BUSINESS_DECISIONS — require lead→request soft-cap (absolute index 405)",
      "Process: object-parse by decision text (order-arg type parity=404, bestMarketingOrderTier=403) before appending ours; claim pushed before feature body",
      "Verified: npm test (1768 passed = main@#355's 1766 + 2 soft-cap regressions) + lint; later main merge as PR #356",
    ],
    // Object-parse by decision text: lead→request soft-cap owns BD[404] ("businessContextFromLead
    // and clientVoiceBusinessContextFromLead must soft-cap..."); order-arg type parity=403.
    // Re-corrected 2026-07-17 (claude/upbeat-dijkstra-hpts79): claude/nice-euler-0x1k8a's prior
    // "correction" (shifting this to slice(405,406)) was itself the off-by-one bug it claimed to
    // fix — direct index-by-content verification of the full BUSINESS_DECISIONS array (matching
    // each entry's literal decision text to its actual array position, per AGENT_PROTOCOL's
    // "never trust a prior slice comment" rule) confirms BD[404] is this soft-cap decision and
    // BD[403] is the order-arg type parity one. Restored the original (correct) indices here and
    // on every entry that cascaded from nice-euler-0x1k8a's mistaken shift (b43f, 3a51, 516f, and
    // nice-euler-0x1k8a's own final entry).
    decisions: BUSINESS_DECISIONS.slice(404, 405),
  },
  {
    date: "2026-07-17",
    branch: "cursor/prompt-process-evolution-b43f",
    summary:
      "Empty-backlog after PR #355 (entitlement-order-arg-recurring-canceled-type-parity). Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI remotes invent-optional-aggregate / clean-audit-only / already-merged — rejected. Sibling business-process-evolution-3811 claimed/shipped marketing-voice-build-request-business-context-soft-cap — complementary pivot; folded here. Fresh residual: lib predicates + commerce sync/recovery already cover recurringCanceledAt, but Generate/Email marketing + voice + Save catalog action suites lacked paused Vitest. Shipped five action-level regressions; process now requires action-glue Vitest after type-level entitlement gates.",
    shipped: [
      "merge: sibling business-process-evolution-3811 lead→request soft-caps — keep both NEXT_STEPS/ITERATIONS",
      "generate-marketing-pack-action.test.ts — +1 recurringCanceledAt reject (no LLM/persist)",
      "send-marketing-pack-to-client-action.test.ts — +1 recurringCanceledAt reject (no pack load/email)",
      "generate-client-voice-pack-action.test.ts — +1 recurringCanceledAt reject (no LLM/persist)",
      "send-client-voice-pack-to-client-action.test.ts — +1 recurringCanceledAt reject (no pack load/email)",
      "save-commerce-catalog-action.test.ts — +1 recurringCanceledAt reject (no upsert)",
      "Docs: architecture.tsx notes action-level paused Vitest beside entitlement predicates",
      "AGENT_PROTOCOL — after type-level entitlement, lock dashboard action glue with paused Vitest",
      "NEXT_STEPS: marketing-voice-commerce-action-entitlement-regression done; marketing-voice-build-request-business-context-soft-cap done (3811)",
      "BUSINESS_DECISIONS — require action-level paused entitlement Vitest (absolute index 406)",
      "Process: coop fold of sibling 3811; claim pushed before feature body; object-parse by decision text (build-request soft-cap=405) before appending ours",
      "Verified: npm test (1773 passed = main@#355's 1766 + sibling 2 build-request soft-cap + 5 action entitlement) + lint",
    ],
    // Object-parse by decision text: action entitlement Vitest owns BD[405]; build-request soft-cap=404.
    // Re-corrected 2026-07-17 (claude/upbeat-dijkstra-hpts79) — see cascade note on the 3811 entry above.
    decisions: BUSINESS_DECISIONS.slice(405, 406),
  },
  {
    date: "2026-07-17",
    branch: "cursor/prompt-process-evolution-3a51",
    summary:
      "Empty-backlog after PR #356/#357 (lead→request soft-cap + action entitlement Vitest). Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI remotes invent-optional-aggregate / clean-audit-only / already-merged — rejected. Sibling business-process-evolution-516f claimed subscription-items-crm-entitlement-sync — complementary pivot (CRM sync axis); no overlap. Fresh residual of #356: normalizeMarketingGenerateBusiness truncated joined Weekdays/Weekends hours at MAX_HOURS_SEGMENT_LENGTH, wiping weekend hours from Growth/Complete pack + Complete voice prompts. Soft-capped each CRM segment via formatPackBusinessHours and raised joined ceiling to MAX_PACK_BUSINESS_HOURS_LENGTH; Vitest + architecture note; process now requires joined-ceiling audit after multi-field CRM→generate joins.",
    shipped: [
      "src/lib/marketing/generate-limits.ts — formatPackBusinessHours + MAX_PACK_BUSINESS_HOURS_LENGTH; normalize hours ceiling",
      "src/lib/marketing/build-request.ts — businessContextFromLead uses formatPackBusinessHours",
      "src/lib/voice/build-request.ts — clientVoiceBusinessContextFromLead uses formatPackBusinessHours",
      "Vitest: generate-limits + marketing/voice build-request weekend-retention regressions",
      "Docs: architecture.tsx notes joined hours ceiling beside lead→request soft-cap",
      "AGENT_PROTOCOL — after joining multi-field CRM values into one generate field, audit joined ceiling vs per-field max",
      "NEXT_STEPS: marketing-voice-pack-hours-join-soft-cap done",
      "BUSINESS_DECISIONS — require formatPackBusinessHours + MAX_PACK_BUSINESS_HOURS_LENGTH (absolute index 407)",
      "Process: coop note of sibling 516f subscription-items claim; claim pushed before feature body; object-parse by decision text (action entitlement=406) before appending ours",
      "merge: sibling business-process-evolution-516f subscription-items CRM sync feature body — keep both NEXT_STEPS/ITERATIONS",
      "Verified: npm test (1791 passed = main@#357's 1773 + 6 hours-join + sibling subscription-items suite) + lint after fold",
    ],
    // Object-parse by decision text: hours-join soft-cap owns BD[406]; action entitlement Vitest=405.
    // Re-corrected 2026-07-17 (claude/upbeat-dijkstra-hpts79) — see cascade note on the 3811 entry above.
    decisions: BUSINESS_DECISIONS.slice(406, 407),
  },
  {
    date: "2026-07-17",
    branch: "cursor/business-process-evolution-516f",
    summary:
      "Empty-backlog after PR #356/#357 (lead→request soft-cap + action entitlement Vitest). Free NEXT_STEPS stayed operator/legal-gated. Stuck CLI remotes invent-optional-aggregate / clean-audit-only / already-merged — rejected. Concurrent sibling prompt-process-evolution-3a51 claimed marketing-voice-pack-hours-join-soft-cap — complementary pivot; folded onto 3a51. Fresh money-path residual: subscription.created|updated / invoice.paid only toggled recurringCanceledAt — Billing Portal plan changes left CRM unlocking Complete voice / Commerce catalog / full_marketing after downgrade. Shipped deriveLiveRecurringEntitlementFromPriceIds + syncOrdersRecurringEntitlementByCustomer on grants restore; foreign-Price active subscriptions pause; Vitest + Convex API map registration.",
    shipped: [
      "src/lib/orders/subscription-entitlement.ts (+ test) — deriveLiveRecurringEntitlementFromPriceIds / syncedRecurringOrderFields / priceIdsFromStripeSubscriptionItems",
      "src/lib/db.ts + convex/orders.ts — syncOrdersRecurringEntitlementByCustomer (Convex syncRecurringEntitlementByCustomer + SQLite) on static API map",
      "src/app/api/stripe/webhook/route.ts — subscription.created|updated + invoice.paid require catalog recurring before clear; sync tier/commerceAddon; foreign-Price pause",
      "Docs: architecture.tsx notes subscription-items CRM sync beside invoice.paid restore",
      "Vitest: subscription-entitlement + webhook regressions for downgrade / Commerce-only / foreign-Price pause",
      "AGENT_PROTOCOL — after CRM pause/restore, sync live Subscription items onto orders.tier/commerceAddon",
      "NEXT_STEPS: subscription-items-crm-entitlement-sync done; marketing-voice-pack-hours-join-soft-cap done (3a51)",
      "BUSINESS_DECISIONS — require subscription-items CRM sync on grants restore (absolute index 408)",
      "Process: folded onto prompt-process-evolution-3a51; object-parse by decision text (hours-join=407) before appending ours",
      "Verified: npm test (1791 passed) + lint on fold branch",
    ],
    // Object-parse by decision text: subscription-items sync owns BD[407]; hours-join soft-cap=406.
    // Re-corrected 2026-07-17 (claude/upbeat-dijkstra-hpts79) — see cascade note on the 3811 entry above.
    decisions: BUSINESS_DECISIONS.slice(407, 408),
  },
  {
    date: "2026-07-17",
    branch: "claude/nice-euler-0x1k8a",
    summary:
      "Empty-backlog after PR #357 (action-level paused MRR entitlement Vitest). Free NEXT_STEPS stayed operator/legal-gated. No concurrent sibling claim seen at start; merged sibling prompt-process-evolution-3a51 (hours-join soft-cap) + business-process-evolution-516f (subscription-items CRM sync) from origin/main onto this branch before pushing. Direct code audit (grep for 'refund' across the repo) found a genuine, previously undiscussed money-integrity gap: Stripe charge.refunded/disputes were entirely unhandled — an operator could Mark paid out a Commerce Buy now order Stripe had already refunded to the shopper, losing that money twice. Shipped commerce-order-refund-clawback-tracking end to end (webhook + ledger + payout-safety gate + pipeline-health + digest + payouts-panel UI), plus a drive-by fix for a pre-existing, unrelated `npm run build` break (Stripe SDK 22.3.1 moved Subscription.current_period_start to SubscriptionItem and Invoice.subscription to invoice.parent.subscription_details.subscription) discovered while verifying the build stayed green.",
    shipped: [
      "src/lib/commerce/orders.ts (+ test) — CommerceOrderRecord.refundedAt, isCommerceOrderRefunded, commerceOrderNeedsClawback; summarizeCommerceOrdersByLead excludes refunded orders from unpaidTotalUsd/unpaidCount",
      "src/lib/commerce/index.ts — barrel exports for the two new helpers",
      "src/lib/payments/refunds.ts (+ test) — chargeHasRefund, chargePaymentIntentId (pure Stripe charge.refunded helpers)",
      "convex/schema.ts + convex/commerceOrders.ts — refundedAt column; markRefunded mutation; listRefunded query (uncapped, mirrors listUnpaid)",
      "src/lib/commerce/sqlite-row-mapping.ts (+ test) — refundedAt column round-trip, empty-string→undefined parity",
      "src/lib/db.ts — commerce_orders.refundedAt SQLite migration; markCommerceOrderRefunded (Convex-first, requireConvex); listCommerceOrdersRefunded (uncapped); static Convex API map registrations (commerceOrders.markRefunded, commerceOrders.listRefunded)",
      "src/app/api/stripe/webhook/route.ts (+ test) — charge.refunded handler: resolve Checkout Session via stripe.checkout.sessions.list({payment_intent}), mark commerceOrders.refundedAt when it backs a ledgered order, idempotent, 5xx on Session-lookup/mark failure",
      "src/lib/payments/webhook-fulfillment.ts (+ test) — commerce_order_refund_session_lookup + commerce_order_refund fulfillment steps",
      "src/app/dashboard/leads/actions.ts (+ test) — markCommerceOrderPaidOutAction rejects a refunded order (clawback safety)",
      "src/lib/metrics/pipeline-health.ts (+ test) — excludes refunded orders from commerceOrdersRevenueUsd/commerceOrdersCount; new commerceOrdersRefundClawbackCount/Usd + oldest age fields (fed by listCommerceOrdersRefunded)",
      "src/lib/digest/daily-digest.ts (+ test) — new 'Refund clawback needed' section (count/total/rows), commercePayoutsOwed automatically benefits from the orders.ts fix",
      "src/app/dashboard/page.tsx + src/app/dashboard/leads/page.tsx + src/app/dashboard/leads/actions.ts (sendDailyDigestAction) — wire listCommerceOrdersRefunded() into pipeline-health + digest",
      "src/components/dashboard/pipeline-health-panel.tsx — new 'Refund clawback needed' metric card",
      "src/app/dashboard/leads/leads-client.tsx — Commerce payouts panel shows Refunded / Refunded after payout instead of Mark paid out button",
      "src/lib/orders/recurring.ts (+ test) — drive-by build fix: stripeSubscriptionPausedAtMs (reads subscription.items.data[0].current_period_start); stripeSubscriptionIdFromInvoice widened to also check invoice.parent.subscription_details.subscription",
      "src/app/api/stripe/webhook/route.ts + route.test.ts — use stripeSubscriptionPausedAtMs; test fixtures nest current_period_start under items.data[]",
      "merge: origin/main #358 (siblings 3a51 hours-join + 516f subscription-items sync) — kept both NEXT_STEPS/ITERATIONS/BUSINESS_DECISIONS entries",
      "NEXT_STEPS: commerce-order-refund-clawback-tracking done",
      "BUSINESS_DECISIONS — commerce refund/clawback tracking + Stripe SDK subscription/invoice shape migration build fix (indices recomputed below by decision text)",
      "Process: verified via `git stash` that both pre-existing build type errors predate this branch (present on origin/main @ 9b3fcdd/#357) before fixing them",
      "Verified: npm test (1815 passed = main@#358's 1811 + 4 stripeSubscriptionPausedAtMs) + lint + build (tsc clean, all 31 routes generated) + npm run dev sanity check on /dashboard, /dashboard/leads, /preview/demo-cafe (200s, no console errors, new Refund clawback needed card renders)",
    ],
    // Object-parse by decision text: refund/clawback tracking = BD[408] ("Stripe charge.refunded
    // (full or partial) must resolve..."), Stripe SDK shape migration = BD[409] ("Stripe SDK 22.3.1
    // (API versions 2025-03-31 and later) removed Subscription.current_period_start..."); (subscription-
    // items sync = BD[407]).
    // Re-corrected 2026-07-17 (claude/upbeat-dijkstra-hpts79): this entry's own "cascade fix" comment
    // (claiming 3811 through this entry were each pointing one index too low, and shifting them all
    // up by one) was itself wrong and introduced a real off-by-one — BUSINESS_DECISIONS has exactly
    // 410 entries (indices 0-409) at this point in history, so slice(409, 411) both skips this
    // entry's own first decision (BD[408]) and reads past the end of the array for a nonexistent
    // BD[410]. Verified by object-parsing the full array (matching each entry's literal decision
    // text to its actual position) rather than trusting any prior slice comment, per AGENT_PROTOCOL's
    // explicit warning that a same-window fold can leave an off-by-one cascade that comments then
    // rubber-stamp — restored the original (correct) indices on this entry and the four it cascaded
    // through (3811, b43f, 3a51, 516f).
    decisions: BUSINESS_DECISIONS.slice(408, 410),
  },
  {
    date: "2026-07-17",
    branch: "claude/upbeat-dijkstra-hpts79",
    summary:
      "Empty-backlog after PR #357. Free NEXT_STEPS stayed fully operator/legal-gated (4 items, all gated). Stuck-branch scan of every remote committed within the last day found nothing genuinely unshipped — every cursor/opencode commit ahead of main was either docs-only bookkeeping already superseded, or a feature body already merged and referenced done in AGENT_PROTOCOL/NEXT_STEPS. A fresh direct-code audit (Convex/SQLite behavioral parity for the 5 newest recurring-entitlement mutations beyond the static API-map check; durable-marker-after-unchecked-await re-check on the #348-#357 action/webhook surface; escapeHtmlForEmail spot-check on every resend.ts template) came back clean on all three axes. While auditing, main moved twice from concurrent siblings: PR #358 (hours-join soft-cap + subscription-items CRM sync) and then PR #360 (claude/nice-euler-0x1k8a — Commerce refund/clawback tracking, plus a drive-by fix for a real `npm run build` break: Stripe SDK 22.3.1 moved Subscription.current_period_start to SubscriptionItem). Independently confirmed the build break was still live on main@#358 and began folding #358 into #360 to fix a second reintroduced instance of it — but the nice-euler-0x1k8a session completed and pushed the identical fold+fix moments earlier, and its PR #360 merged to main before this branch could push, making this branch's parallel resolution redundant (per AGENT_PROTOCOL's fold rule: do not open a duplicate PR for identical work). Verifying main@#360 as the new baseline surfaced a real, separate, live bug: claude/nice-euler-0x1k8a's own merge-conflict resolution had 'corrected' five ITERATIONS entries' BUSINESS_DECISIONS.slice() indices (3811, b43f, 3a51, 516f, and its own final entry) based on a claimed off-by-one that was itself wrong — its own final entry's slice(409, 411) read past the end of a 410-entry array. Verified by object-parsing BUSINESS_DECISIONS.length and every entry's actual array position against its literal decision text (not by trusting any slice comment, including one that itself claims to be a correction), then restored the original, evidence-confirmed indices on all five entries.",
    shipped: [
      "No product code change — this run's own fold attempt was superseded by claude/nice-euler-0x1k8a's own concurrent fold + merge (PR #360), which is functionally identical to what this branch had independently prepared (same stripeSubscriptionPausedAtMs drive-by fix for #358's reintroduced second current_period_start read, same test count 1833)",
      "Fixed a real off-by-one bug left on main by PR #360's own merge-conflict resolution: BUSINESS_DECISIONS.slice() on 5 ITERATIONS entries (business-process-evolution-3811, prompt-process-evolution-b43f, prompt-process-evolution-3a51, business-process-evolution-516f, claude/nice-euler-0x1k8a) pointed one index too high after nice-euler-0x1k8a's cascade 'correction'; restored to the verified-correct indices 404/405/406/407/408-410",
      "AGENT_PROTOCOL — added a testing-section bullet: npm test never runs a full tsc typecheck, so a Stripe SDK type-shape drift can silently break npm run build with zero Vitest signal for one or more iterations; when folding a build-break fix alongside a concurrently-merged sibling touching the same file, re-grep the merged result for the same raw broken pattern before declaring green (a sibling can reintroduce a second instance in a code path the original fix never saw)",
      "Verified on main@#360 (final state, after this run's own doc-only fix): npm run build (clean) + npm run lint (clean) + npm test (1833 passed, unchanged — this run shipped no code, only corrected ITERATIONS bookkeeping)",
    ],
    // No new BUSINESS_DECISIONS — this iteration is a bookkeeping correction (BD slice indices)
    // and a clean audit + fold-race outcome, not a new product/business decision.
    decisions: [],
  },
  {
    date: "2026-07-17",
    branch: "claude/nice-euler-x13feb",
    summary:
      "Empty-backlog after PR #361 (BUSINESS_DECISIONS slice off-by-one correction, no code change). Free NEXT_STEPS stayed fully operator/legal-gated (4 items). Fetched every remote branch and diffed each against main — every branch with commits ahead of main was either already-superseded docs-only bookkeeping or content already shipped via a different path; no genuine fold candidate. Both the commerce-order-refund-clawback-tracking ITERATIONS entry and its BUSINESS_DECISIONS note explicitly flagged charge.dispute.created as the natural next step (the original 'refund' grep audit found charge.refunded/disputes were BOTH entirely unhandled, but only the refund half shipped). Shipped commerce-order-dispute-clawback-tracking end to end, mirroring the refund clawback shape exactly: commerceOrders.disputedAt, exclude disputed orders from the owed total, reject Mark paid out on a disputed order, commerceOrderNeedsClawback extended to (refunded OR disputed), dedicated uncapped listCommerceOrdersDisputed() feed, pipeline-health 'Dispute clawback needed' card, daily-digest 'Dispute clawback needed' section, and Commerce payouts panel UI. Also discovered and fixed a real, separate gap while auditing: despite ITERATIONS entries repeatedly claiming 'Docs: architecture.tsx notes...' for the refund-clawback feature, /docs/architecture never actually documented it — added a combined refund+dispute clawback paragraph there covering both axes.",
    shipped: [
      "src/lib/commerce/orders.ts (+ test) — CommerceOrderRecord.disputedAt, isCommerceOrderDisputed; commerceOrderNeedsClawback extended to (refunded OR disputed); summarizeCommerceOrdersByLead excludes disputed orders from unpaidTotalUsd/unpaidCount",
      "src/lib/commerce/index.ts — barrel export for isCommerceOrderDisputed",
      "convex/schema.ts + convex/commerceOrders.ts — disputedAt column; markDisputed mutation; listDisputed query (uncapped, mirrors listRefunded)",
      "src/lib/commerce/sqlite-row-mapping.ts (+ test) — disputedAt column round-trip, empty-string→undefined parity",
      "src/lib/db.ts — commerce_orders.disputedAt SQLite migration; markCommerceOrderDisputed (Convex-first, requireConvex); listCommerceOrdersDisputed (uncapped); static Convex API map registrations (commerceOrders.markDisputed, commerceOrders.listDisputed)",
      "src/app/api/stripe/webhook/route.ts (+ test) — charge.dispute.created handler: resolve Checkout Session via stripe.checkout.sessions.list({payment_intent}) from Dispute.payment_intent, mark commerceOrders.disputedAt when it backs a ledgered order, idempotent, 5xx on Session-lookup/mark failure; dispute *resolution* (charge.dispute.closed) explicitly out of scope",
      "src/lib/payments/webhook-fulfillment.ts (+ test) — commerce_order_dispute_session_lookup + commerce_order_dispute fulfillment steps",
      "src/app/dashboard/leads/actions.ts (+ test) — markCommerceOrderPaidOutAction rejects a disputed order (clawback safety, mirrors refunded rejection)",
      "src/lib/metrics/pipeline-health.ts (+ test) — excludes disputed orders from commerceOrdersRevenueUsd/commerceOrdersCount; new commerceOrdersDisputeClawbackCount/Usd + oldest age fields (fed by listCommerceOrdersDisputed)",
      "src/lib/digest/daily-digest.ts (+ test) — new 'Dispute clawback needed' section (count/total/rows)",
      "src/app/dashboard/page.tsx + src/app/dashboard/leads/page.tsx + src/app/dashboard/leads/actions.ts (sendDailyDigestAction) — wire listCommerceOrdersDisputed() into pipeline-health + digest",
      "src/components/dashboard/pipeline-health-panel.tsx — new 'Dispute clawback needed' metric card",
      "src/app/dashboard/leads/leads-client.tsx — Commerce payouts panel shows Disputed / Disputed after payout instead of Mark paid out button",
      "src/app/docs/architecture/page.tsx — new paragraph documenting both refund AND dispute clawback tracking (the refund half was previously undocumented despite prior ITERATIONS claims)",
      "NEXT_STEPS: commerce-order-dispute-clawback-tracking done",
      "BUSINESS_DECISIONS — commerce dispute/clawback tracking (absolute index 411)",
      "Process: claim commit pushed before feature body; verified BUSINESS_DECISIONS.length via object-parse rather than trusting the prior entry's slice comment before appending",
      "Verified: npm test (1855 passed = main@#361's 1835 + 20 dispute-axis regressions) + lint + build (tsc clean, all 31 routes generated) + npm run dev sanity check on /dashboard, /dashboard/leads, /preview/demo-cafe (200s, no console errors, new Dispute clawback needed card renders)",
    ],
    // Object-parse by decision text (2026-07-17, prompt-process-evolution-50d3): dispute/clawback
    // tracking = BD[411] ("Stripe charge.dispute.created..."). Prior slice(410, 411) wrongly
    // pointed at Stripe SDK BD[410] — restored after matching decision text to indexOf.
    decisions: BUSINESS_DECISIONS.slice(411, 412),
  },
  {
    date: "2026-07-17",
    branch: "cursor/business-process-evolution-f01f",
    summary:
      "Empty-backlog after PR #362 (commerce-order-dispute-clawback-tracking). Free NEXT_STEPS stayed fully operator/legal-gated (4 items). Scanned stuck CLI/cursor/grok/opencode remotes ahead of main — every branch with commits was already-superseded docs-only or content already shipped (brand-escape #115, href-escape #238, billing-portal commerceAddon parity, etc.); no genuine fold candidate. BD[410] + AGENT_PROTOCOL + /docs/architecture explicitly flagged charge.dispute.closed as the natural twin of dispute.created: without it, a won dispute left disputedAt set forever (false Mark-paid-out reject + false Dispute clawback). Shipped commerce-order-dispute-closed-resolution end to end.",
    shipped: [
      "src/lib/payments/refunds.ts (+ test) — disputeStatusClearsDisputeFlag (won / warning_closed clear; lost keeps)",
      "convex/commerceOrders.ts — clearDisputed mutation (replace omit disputedAt, mirrors orders.clearRecurringCanceledByCustomer)",
      "src/lib/db.ts — clearCommerceOrderDisputed (Convex-first, requireConvex); static API map registration commerceOrders.clearDisputed",
      "src/app/api/stripe/webhook/route.ts (+ test) — charge.dispute.closed handler: Session via payment_intent; won/warning_closed clears; lost ensures disputedAt; idempotent; 5xx on Session-lookup/clear/mark failure",
      "src/lib/payments/webhook-fulfillment.ts (+ test) — commerce_order_dispute_closed_session_lookup + commerce_order_dispute_clear steps",
      "src/lib/commerce/orders.ts — disputedAt doc notes clear-on-won twin",
      "src/app/docs/architecture/page.tsx — document dispute.closed resolution alongside created/refunded clawback",
      "AGENT_PROTOCOL — after dispute.created, immediately close dispute.closed before inventing another dated clean-audit",
      "NEXT_STEPS: commerce-order-dispute-closed-resolution done",
      "BUSINESS_DECISIONS — commerce dispute.closed resolution (absolute index 412)",
      "Process: claim commit pushed before feature body; verified BUSINESS_DECISIONS.length via object-parse rather than trusting slice comments",
      "Verified: npm test (1872 passed = main@#362's 1855 + 17 dispute.closed-axis regressions) + lint + build (tsc clean, all 31 routes generated)",
    ],
    // Object-parse by decision text (2026-07-17, prompt-process-evolution-50d3): dispute.closed
    // resolution = BD[412]. Prior slice(411, 412) wrongly pointed at dispute.created BD[411].
    decisions: BUSINESS_DECISIONS.slice(412, 413),
  },
  {
    date: "2026-07-17",
    branch: "cursor/prompt-process-evolution-50d3",
    summary:
      "Empty-backlog after PR #363 (dispute.closed on f01f). Same-minute dual claim on commerce-order-dispute-closed-resolution — f01f merged first with lost-ensures-disputedAt; this branch folded onto main rather than shipping a duplicate clear handler. Fixed #362/#363 ITERATIONS BUSINESS_DECISIONS.slice off-by-ones (object-parse by decision text). Pivoted to the named public-preview residual: softCapLeadForPublicSurface on CategoryPreview + seo meta/JSON-LD so pre-cap lead.description (and sibling free-text) cannot emit unbounded HTML.",
    shipped: [
      "src/lib/leads/public-fields.ts (+ test) — softCapLeadDescription + softCapLeadForPublicSurface (create-path MAX_*)",
      "src/lib/seo.ts (+ test) — leadMetaTitle/Description + leadLocalBusinessJsonLd soft-cap at read",
      "src/components/preview/category-preview.tsx — displayLead via softCapLeadForPublicSurface",
      "Docs: architecture.tsx notes public-preview read soft-cap beside JSON-LD consent gating",
      "AGENT_PROTOCOL — after write-path soft-cap, audit public SSR/meta/JSON-LD read twin",
      "NEXT_STEPS: preview-lead-description-read-soft-cap done",
      "BUSINESS_DECISIONS — public preview/meta/JSON-LD read soft-cap (absolute index 413)",
      "Process: fold race with f01f/#363 documented; fixed x13feb→BD[411] + f01f→BD[412] slices; claim pushed before feature body",
      "Verified: npm test (1877 passed = main@#363's 1872 + 5 public-fields soft-cap) + lint + build (tsc clean, all 31 routes generated)",
    ],
    // Object-parse by decision text: public-preview read soft-cap = BD[413].
    // BUSINESS_DECISIONS.length === 414 after append (indices 0-413).
    decisions: BUSINESS_DECISIONS.slice(413, 414),
  },
  {
    date: "2026-07-17",
    branch: "claude/upbeat-dijkstra-cd2ftu",
    summary:
      "Empty-backlog after PR #363 (commerce-order-dispute-closed-resolution). Free NEXT_STEPS stayed fully operator/legal-gated (4 items). commerce-order-dispute-closed-resolution had been double-claimed by two siblings seconds before this run started; the earlier claim (business-process-evolution-f01f, 15:02:35 UTC) merged as PR #363 while this run was still fetching/scanning, resolving the collision without this run needing to pivot mid-build. Audited the freshly-merged dispute-closed code plus the whole payout/clawback dashboard surface directly (a targeted, not-yet-dated angle, rather than re-running an already-2x-confirmed-clean generic axis) and found a real dashboard-completeness bug: the Commerce payouts (manual) panel's own per-order UI already has text for 'Refunded/Disputed after payout — claw back from client', but it was dead code — the panel's data source (listUnpaidCommerceOrders) excludes every paidOutAt row by definition, so a clawback-needed order's data never reached the client, and the panel's own per-lead `.filter(unpaidCount > 0)` would have hidden that lead even if it had. Clawback-needed orders were visible only via the aggregate pipeline-health count/$ card (no lead names) and the batch daily-digest email — the always-on dashboard, where an operator actually works, had zero row-level detail to actually go recover the money. Shipped the fix end to end and verified it live against a real SQLite row, not just build/lint/test.",
    shipped: [
      "src/lib/commerce/orders.ts (+ test) — mergeCommerceOrdersForReview (dedup-by-id union of multiple order feeds), commerceOrdersByLeadSummaryNeedsAttention (unpaidCount > 0 OR any order needs clawback)",
      "src/lib/commerce/index.ts — barrel exports for both new helpers",
      "src/app/dashboard/leads/page.tsx — loadLeadsPipelineHealth returns commerceOrdersRefunded/commerceOrdersDisputed alongside commerceOrders; LeadsPage merges all three via mergeCommerceOrdersForReview into the panel's initialCommerceOrders prop (pipeline-health computation itself is unchanged — still fed the raw unpaid-only list)",
      "src/app/dashboard/leads/leads-client.tsx — commercePayoutsByLead filters on commerceOrdersByLeadSummaryNeedsAttention instead of a bare unpaidCount > 0 check; panel description now mentions clawback rows",
      "src/app/docs/architecture/page.tsx — new paragraph documenting the panel merge + widened filter",
      "src/lib/process/prompt_process.tsx — added BusinessDecision.id (optional, stable slug) and a new AGENT_PROTOCOL bullet: new entries must filter BUSINESS_DECISIONS by id instead of slice(absoluteIndex, ...), which structurally prevents the off-by-one cascade documented there (discovered while verifying this append's own index — the ITERATIONS chain from best-marketing-order-tier-active-entitlement through commerce-order-dispute-closed-resolution has an unresolved drift that survived two prior correction attempts; left as-is per the protocol note rather than risking a third failed rewrite)",
      "NEXT_STEPS: commerce-payouts-panel-clawback-visibility done",
      "BUSINESS_DECISIONS — commerce-payouts-panel-clawback-visibility (id-based entry, no absolute index tracked)",
      "Process: claim commit pushed before feature body; new decision + this entry reference each other by id, not a hand-computed slice index",
      "Verified: npm test (1879 passed = main@#363's 1872 + 7 new regressions) + lint + build (tsc clean, all 31 routes generated) + live npm run dev check — inserted a paid-out+refunded commerce_orders row into the dev SQLite DB, confirmed 'Refunded after payout — claw back from client' now renders on /dashboard/leads with the correct $42.50 amount, then cleaned up the test row",
    ],
    decisions: BUSINESS_DECISIONS.filter(
      (d) => d.id === "commerce-payouts-panel-clawback-visibility",
    ),
  },
  {
    date: "2026-07-17",
    branch: "claude/nice-euler-98urq3",
    summary:
      "Empty-backlog after PR #367 (commerce-payouts-panel-clawback-visibility). Free NEXT_STEPS stayed fully operator/legal-gated (4 items: stripe-price-objects, lead-ingestion, marketing-content-scheduling, commerce-payouts-stripe-connect). Fetched every remote branch and diffed the newest ones (committed within the last day) against main: claude/relaxed-archimedes-9r5fq6 and claude/vigilant-goldberg-q3rsfe were stale CI-workflow-only branches forked from well before the current commerce clawback work landed (their diffs against current main showed thousands of lines of already-shipped product code being deleted, confirming they predate it rather than extend it) — not genuine fold candidates. AGENT_PROTOCOL's most recent 'next empty-backlog' pointer and the commerce-order-refund-clawback-tracking decision both explicitly named the bundle-order refund twin as the next residual, deliberately deferred across three prior iterations (#360 refund, #362 dispute-created, #363 dispute-closed) on the reasoning that bundle orders carry no manual-payout double-loss risk. That reasoning holds for clawback UI, but a direct grep of the `orders` table found zero refundedAt column or webhook handling at all — a refunded Growth/Complete/Commerce-addon bundle purchase silently kept counting in pipeline-health revenueTotalUsd forever with no operator visibility, a real (if lower-severity) money-accuracy gap distinct from the clawback risk already ruled out. Shipped the visibility-only twin end to end, mirroring the commerce refund shape but deliberately omitting any Mark-paid-out reject or clawback UI since bundle revenue is never manually disbursed to a third party. Also merged the concurrently-shipped commerce-payouts-panel-clawback-visibility (PR #367) mid-session with a clean auto-merge (no overlapping files).",
    shipped: [
      "src/lib/orders/types.ts (+ test) — OrderRecord.refundedAt, isOrderRefunded",
      "src/lib/orders/sqlite-row-mapping.ts (+ test) — SqliteOrderJoinRow.refundedAt column round-trip, null→undefined parity",
      "convex/schema.ts — orders.refundedAt optional column",
      "convex/orders.ts — orderDocValidator.refundedAt; markRefunded mutation (by stripeSessionId, idempotent); clearRecurringCanceledByCustomer's replace now carries refundedAt forward instead of dropping it",
      "src/lib/db.ts — orders SQLite migration (ALTER TABLE orders ADD COLUMN refundedAt); mapConvexOrderRow + both listOrders/listOrdersByLeadSlug SQLite SELECTs include refundedAt; getOrderByStripeSessionId + markOrderRefunded (Convex-first, requireConvex-capable, SQLite fallback); static Convex API map registers orders.getByStripeSessionId (previously a deliberate dead-code orphan, now a live consumer) + orders.markRefunded",
      "src/lib/db/convex-api-map-audit.ts — removed orders:getByStripeSessionId from DELIBERATE_CONVEX_API_ORPHANS now that it has a live call site",
      "src/app/api/stripe/webhook/route.ts (+ test) — charge.refunded: when the resolved Checkout Session backs no commerceOrders row, fall back to getOrderByStripeSessionId and markOrderRefunded on a bundle order match; idempotent; 5xx on mark-write failure (new bundle_order_refund fulfillment step)",
      "src/lib/payments/webhook-fulfillment.ts (+ test) — new WebhookFulfillmentStep 'bundle_order_refund'",
      "src/lib/metrics/pipeline-health.ts (+ test) — revenueTotalUsd excludes refunded orders; new bundleOrdersRefundedCount/Usd + oldestBundleOrdersRefundedAgeHours fields (computed directly from the already-uncapped input.orders — no new list* query needed)",
      "src/lib/digest/daily-digest.ts (+ test) — BuildDailyDigestInput.orders widened with amountPaid?/refundedAt?; new bundleOrdersRefunded[]/Count/TotalUsd fields + 'Bundle revenue refunded' HTML section (visibility footnote framing, 'no action needed')",
      "src/components/dashboard/pipeline-health-panel.tsx — new 'Bundle revenue refunded' metric card",
      "src/app/docs/architecture/page.tsx — new paragraph documenting the bundle-order refund visibility twin beside the Commerce refund/dispute clawback paragraph",
      "NEXT_STEPS: bundle-order-refund-tracking done",
      "BUSINESS_DECISIONS — bundle-order-refund-tracking (id-based entry, filter-by-id convention)",
      "Process: claim + feature body in one commit (empty prior claim window — no sibling was concurrently building this); merged origin/main (PR #367) mid-session with a clean auto-merge; new decision + this entry reference each other by id",
      "Verified: npm test (1898 passed = main@#367's 1877 + 7 sibling clawback-visibility + 14 bundle-refund) + lint + build (tsc clean, all 31 routes generated) + npm run dev sanity check on /dashboard, /dashboard/leads (confirmed 'Bundle revenue refunded' card renders), /preview/demo-cafe, /docs/architecture (all 200s, no console errors)",
    ],
    decisions: BUSINESS_DECISIONS.filter((d) => d.id === "bundle-order-refund-tracking"),
  },
  {
    date: "2026-07-17",
    branch: "cursor/business-process-evolution-19a4",
    summary:
      "Empty-backlog after PR #368 (bundle-order-refund-tracking). Free NEXT_STEPS stayed fully operator/legal-gated (4 items). Cooperated with sibling claude/nice-euler-98urq3 by merging #368 into main before claiming work — did not dual-build the refund twin. Scanned stuck CLI/cursor remotes ahead of main: convex-order-parity / preview-index-consent / lead-quality-scoring / CI-workflow-only branches were already-merged, invent-optional-aggregate, or stale — rejected. #368's AGENT_PROTOCOL note said the refund/dispute/clawback axis was closed, but charge.dispute.created/closed still skipped bundle orders entirely (explicit 'e.g. a bundle purchase — no payout-safety ledger to flag' early-break), so a disputed Growth/Complete purchase kept counting in revenueTotalUsd with zero operator visibility — the same incomplete-axis residual as shipping commerce refund without dispute. Shipped bundle-order-dispute-tracking end to end (created + closed in one iteration per AGENT_PROTOCOL's immediately-close-the-resolution-twin rule).",
    shipped: [
      "src/lib/orders/types.ts (+ test) — OrderRecord.disputedAt, isOrderDisputed, orderCountsTowardRevenue",
      "src/lib/orders/sqlite-row-mapping.ts (+ test) — SqliteOrderJoinRow.disputedAt round-trip",
      "convex/schema.ts — orders.disputedAt optional column",
      "convex/orders.ts — orderDocValidator.disputedAt; markDisputed + clearDisputed mutations; clearRecurringCanceledByCustomer replace carries disputedAt (+ refundedAt via spread)",
      "src/lib/db.ts — orders.disputedAt SQLite migration; mapConvexOrderRow + list*/getByStripeSessionId SELECTs include disputedAt; markOrderDisputed + clearOrderDisputed (Convex-first, requireConvex); static API map orders.markDisputed / orders.clearDisputed",
      "src/app/api/stripe/webhook/route.ts (+ test) — charge.dispute.created/closed fall back to bundle orders when no commerceOrders row; won/warning_closed clears; lost ensures; 5xx on mark/clear failure",
      "src/lib/payments/webhook-fulfillment.ts (+ test) — bundle_order_dispute + bundle_order_dispute_clear steps",
      "src/lib/metrics/pipeline-health.ts (+ test) — revenueTotalUsd excludes disputed; bundleOrdersDisputedCount/Usd + oldestBundleOrdersDisputedAgeHours",
      "src/lib/digest/daily-digest.ts (+ test) — bundleOrdersDisputed[]/Count/TotalUsd + HTML section",
      "src/components/dashboard/pipeline-health-panel.tsx — Bundle revenue disputed metric card",
      "src/app/docs/architecture/page.tsx — bundle refund paragraph extended to cover dispute created/closed",
      "NEXT_STEPS: bundle-order-dispute-tracking done",
      "BUSINESS_DECISIONS — bundle-order-dispute-tracking (id-based entry)",
      "Process: merged sibling #368 first; claim commit pushed before feature body; created+closed shipped together; AGENT_PROTOCOL corrected to stop declaring the money axis closed after only the refund twin",
    ],
    decisions: BUSINESS_DECISIONS.filter((d) => d.id === "bundle-order-dispute-tracking"),
  },
  {
    date: "2026-07-17",
    branch: "claude/upbeat-dijkstra-yd6du5",
    summary:
      "Empty-backlog after PR #369 (bundle-order-dispute-tracking, merged after a two-way sibling claim race resolved to cursor/business-process-evolution-19a4). Free NEXT_STEPS stayed fully operator/legal-gated (4 items). Scanned ~25 of the most recently-pushed remotes by actual committer date for a stuck-but-complete fold candidate — nothing genuine turned up (already-superseded, byte-identical to merged code, or CI-workflow-only, same category as the two already-open #365/#366 PRs). Read pipeline-health.ts and daily-digest.ts side by side and found daily-digest.ts computes the same refund/dispute-clawback row lists as pipeline-health.ts but never the matching oldest-age aggregate pipeline-health computes and the dashboard renders — every other digest action section already has this pattern, so the operator-email surface had a real staleness-signal gap versus the always-on dashboard for money that needs clawing back from a client.",
    shipped: [
      "src/lib/digest/daily-digest.ts (+ test) — oldestCommerceOrdersRefundClawbackAgeHours, oldestCommerceOrdersDisputeClawbackAgeHours, oldestBundleOrdersRefundedAgeHours, oldestBundleOrdersDisputedAgeHours on DailyDigest, computed via the same min-timestamp-scan IIFE pattern already used for oldestFollowUpDueAgeHours/oldestAbandonedAgeHours (scans the full pre-slice candidate list, never Date.now()); renderDailyDigestHtml appends ' · oldest Xh' to all four section titles (Refund clawback needed, Dispute clawback needed, Bundle revenue refunded, Bundle revenue disputed) matching the dashboard hint text exactly",
      "NEXT_STEPS: digest-clawback-oldest-age done",
      "BUSINESS_DECISIONS — digest-clawback-oldest-age (id-based entry)",
      "Process: claim commit pushed before feature body; new decision + this entry reference each other by id",
      "Verified: npm test (1923 passed = main@#369's 1918 + 5 new: 4 multi-record oldest-age unit tests + 1 combined render test) + lint + build (tsc clean, all 31 routes generated) + npm run dev sanity check on /, /dashboard/leads, /docs/architecture (all 200s)",
    ],
    decisions: BUSINESS_DECISIONS.filter((d) => d.id === "digest-clawback-oldest-age"),
  },
  {
    date: "2026-07-17",
    branch: "claude/nice-euler-ivhr57",
    summary:
      "Empty-backlog after PR #370 (digest-clawback-oldest-age). Free NEXT_STEPS stayed fully operator/legal-gated (4 items: stripe-price-objects, lead-ingestion, marketing-content-scheduling, commerce-payouts-stripe-connect). Fetched every remote branch and filtered to ones with real commits ahead of origin/main; the live ones (claude/relaxed-archimedes-9r5fq6, claude/vigilant-goldberg-q3rsfe — CI/scheduled-agent workflow auth; cursor/prompt-process-evolution-0329 + cursor/business-process-evolution-d518 — billing-portal-session commerceAddon/payment-mode metadata parity) were unrelated infra, no collision risk. Per AGENT_PROTOCOL's empty-backlog fallback ladder (tier 1: wire an already-shipped sold-capability helper missing from pipeline-health/digest/dashboard), read every NEXT_STEPS entry end to end and found paid-starter-upsell-nudge was the one capability whose due-count never reached pipeline-health.ts's always-on summary-card grid — listStarterUpsellCandidates was wired into daily-digest.ts and its own dashboard panel, but every sibling due-queue (marketing packs due, voice packs due, catalogs missing/unsynced, follow-ups due, recurring-entitlement-paused) also gets a pipeline-health MetricCard + oldest-age staleness signal, which this one lacked.",
    shipped: [
      "src/lib/billing/starter-upsell.ts (+ test) — oldestStarterUpsellCandidateAgeHours (list+age-helper-pair pattern matching oldestRecurringEntitlementPausedAgeHours: filters orders to candidate slugs + isStarterOnlyOrder, min createdAt, hours-since via caller-supplied nowMs, clamps to 0 when nowMs precedes the order)",
      "src/lib/metrics/pipeline-health.ts (+ test) — starterUpsellCandidatesCount + oldestStarterUpsellCandidateAgeHours fields on PipelineHealth, computed via listStarterUpsellCandidates + the new age helper",
      "src/components/dashboard/pipeline-health-panel.tsx — new 'Starter → MRR upsell' MetricCard beside 'MRR paused / canceled', same hint/attention shape as every other due-queue card",
      "NEXT_STEPS: starter-upsell-pipeline-health-metric done",
      "BUSINESS_DECISIONS — starter-upsell-pipeline-health-metric (id-based entry)",
      "Process: claim + feature body shipped together (no sibling concurrently building this file); new decision + this entry reference each other by id",
      "Verified: npm test (1927 passed = main@#370's 1923 + 4 new: 3 oldestStarterUpsellCandidateAgeHours unit tests + 1 pipeline-health integration test) + lint (clean) + tsc --noEmit -p . (46 pre-existing unrelated errors, unchanged before/after — confirmed via git stash) + build (tsc clean under next build's own config, all 31 routes generated) + npm run dev sanity check on /dashboard/leads (curl confirmed the 'Starter → MRR upsell' card text renders in the HTML)",
    ],
    decisions: BUSINESS_DECISIONS.filter(
      (d) => d.id === "starter-upsell-pipeline-health-metric",
    ),
  },
  {
    date: "2026-07-17",
    branch: "claude/upbeat-dijkstra-fofwgy",
    summary:
      "Empty-backlog after PR #371 (starter-upsell-pipeline-health-metric). Free NEXT_STEPS stayed fully operator/legal-gated (4 items: stripe-price-objects, lead-ingestion, marketing-content-scheduling, commerce-payouts-stripe-connect). Fetched every remote branch (200+) and diffed the ones with real commits ahead of origin/main — only the two already-open CI/scheduled-agent-auth PRs (#365 restore-oauth-auth secret-wins-over-cache + Codex flag fix, #366 subscription-only workflow auth, both unrelated to product surface) and a handful of already-superseded single-digit-commit docs/bookkeeping branches (billing-portal-session commerceAddon parity already folded per BD[413]-adjacent entries; dispute/refund BUSINESS_DECISIONS slice corrections already landed) turned up — no genuine fold candidate. Per AGENT_PROTOCOL's empty-backlog tier-1 fallback ('wire an already-shipped sold-capability helper missing from pipeline-health/digest/dashboard'), read PipelineHealth's full field list end to end and found the last remaining asymmetry: every fulfillment/money due-queue already carries an 'oldest Xh' staleness signal (abandoned checkouts, unreplied inquiries, cold leads, follow-ups, recurring-entitlement-paused, refund clawback, dispute clawback, bundle refunded, bundle disputed, Starter upsell) except the four Growth/Complete/Commerce fulfillment queues (marketing packs due, catalogs missing, catalogs unsynced, voice packs due) — none of the three files (pipeline-health.ts, daily-digest.ts, pipeline-health-panel.tsx) had it for any of the four. Shipped end to end, deliberately anchoring the month-keyed marketing-packs queue to month-start (not raw order tenure) so the signal stays an actionable 'how overdue is THIS month's pack' rather than a monotonically-growing, non-actionable subscriber-tenure number.",
    shipped: [
      "src/lib/marketing/monthly-pack.ts (+ test) — marketingMonthStartMs (UTC epoch ms for a YYYY-MM key) + oldestMarketingPacksDueAgeHours (due-since = max(month start, qualifying order's createdAt); null/clamped-to-0 edge cases mirror oldestStarterUpsellCandidateAgeHours)",
      "src/lib/commerce/catalog.ts (+ test) — oldestCommerceCatalogCandidateAgeHours (shared by listCommerceCatalogsMissing AND listCommerceCatalogsUnsynced candidates — both already share leadEligibleForCommerceCatalog, so one helper covers both rather than two near-duplicate scorers)",
      "src/lib/voice/faq-pack.ts (+ test) — oldestClientVoicePacksDueAgeHours (same list+age-helper-pair shape, Complete-tier orders)",
      "src/lib/marketing/index.ts, src/lib/commerce/index.ts, src/lib/voice/index.ts — barrel exports for the three new helpers + marketingMonthStartMs",
      "src/lib/metrics/pipeline-health.ts (+ test) — oldestMarketingPacksDueAgeHours / oldestCommerceCatalogsMissingAgeHours / oldestCommerceCatalogsUnsyncedAgeHours / oldestClientVoicePacksDueAgeHours fields on PipelineHealth, computed via the new helpers fed from the already-computed candidate lists (no new list* query)",
      "src/lib/digest/daily-digest.ts (+ test) — BuildDailyDigestInput.orders widened with optional createdAt (existing test fixtures that omit it still type-check; the three new helpers treat createdAt as optional and skip missing/unparseable values rather than requiring it, so real OrderRecord[] callers and bare test fixtures both work); same four oldest-age fields on DailyDigest; ' · oldest Xh' suffix appended to the Marketing packs due / Commerce catalogs missing / Commerce Sync to Stripe due / Complete voice packs due section titles in renderDailyDigestHtml, matching the refund/dispute-clawback precedent exactly",
      "src/components/dashboard/pipeline-health-panel.tsx — ' · oldest Xh' suffix appended to the same four MetricCard hints (only when count > 0, matching every sibling card)",
      "src/app/docs/architecture/page.tsx — new paragraph documenting the four helpers, the shared-helper reuse decision for catalogs missing/unsynced, and the month-start-anchoring rationale for marketing packs specifically; flags the Starter-upsell digest-email oldest-age twin as a remaining smaller gap for a future iteration",
      "NEXT_STEPS: due-queue-oldest-age-parity done",
      "BUSINESS_DECISIONS — due-queue-oldest-age-parity (id-based entry)",
      "Process: claim + feature body shipped together (no sibling concurrently building these files); new decision + this entry reference each other by id",
      "Verified: npm test (1942 passed = main@#371's ~1931 + ~11 new: 5 marketingMonthStartMs/oldestMarketingPacksDueAgeHours unit tests + 4 oldestCommerceCatalogCandidateAgeHours unit tests + 3 oldestClientVoicePacksDueAgeHours unit tests + pipeline-health/daily-digest integration assertions folded into existing tests rather than new files) + lint (clean) + tsc --noEmit -p . (31 pre-existing unrelated errors — missing @types/node etc. — unchanged before/after, confirmed via git stash) + build (tsc clean under next build's own config, all 31 routes generated) + npm run dev sanity check — inserted a real paid Growth-tier order (createdAt 9h ago) for a demo lead into the dev SQLite DB, confirmed 'oldest 9h' renders on the Marketing packs due card on /dashboard/leads, then cleaned up the test row and reset the lead's stage",
    ],
    decisions: BUSINESS_DECISIONS.filter((d) => d.id === "due-queue-oldest-age-parity"),
  },
  {
    date: "2026-07-17",
    branch: "claude/nice-euler-eojcaa",
    summary:
      "Cooperation pass: reviewed/reconciled/merged the two already-open, unrelated CI/scheduled-agent-auth PRs (#365, #366) first — they conflicted on the same codex-scheduled.yml approval-flag line with two different diagnoses; kept #365's config-key override (verified against the live codex exec --help) over #366's flag-reposition guess, merged #366 first (broader: drops API-key fallbacks across all 6 workflows, migrates Gemini to Antigravity), then rebased #365 onto post-#366 main to keep its distinct restore-oauth-auth.sh secret-wins-over-stale-cache fix. Re-scanned remote branches for stuck-but-complete feature work per AGENT_PROTOCOL before claiming anything new (confirmed claude/nice-euler-0x1k8a and cursor/prompt-process-evolution-0329 / cursor/business-process-evolution-d518 are strict subsets of already-shipped main code) — none found, so picked up the residual gap due-queue-oldest-age-parity's own writeup flagged: the Starter → MRR upsell digest-email oldest-age twin.",
    shipped: [
      "Merged PR #366 (fix(ci): make all scheduled agent workflows subscription-only) then PR #365 (secret-wins-over-stale-cache + Codex CLI flag), reconciling their overlapping codex-scheduled.yml fix in favor of #365's more rigorously verified approach",
      "src/lib/billing/starter-upsell.ts (+ test) — oldestStarterUpsellCandidateAgeHours's orders[].createdAt widened from required to optional (skip missing/unparseable, same pattern as the due-queue-oldest-age-parity helpers) so the one existing helper serves both pipeline-health.ts's real OrderRecord[] and daily-digest.ts's lighter orders shape — no second scorer",
      "src/lib/digest/daily-digest.ts (+ test) — oldestStarterUpsellCandidateAgeHours field on DailyDigest, computed alongside the other four oldest-age values; ' · oldest Xh' suffix appended to the Starter → MRR upsell section title in renderDailyDigestHtml, matching every sibling due-queue section",
      "src/app/docs/architecture/page.tsx — updated the due-queue-oldest-age-parity paragraph to record this gap as closed instead of an open follow-up",
      "NEXT_STEPS: starter-upsell-digest-oldest-age done",
      "BUSINESS_DECISIONS — starter-upsell-digest-oldest-age (id-based entry)",
      "Verified: npm test (1944 passed = prior 1942 baseline + 2 new) + lint (clean) + tsc --noEmit -p . (31 pre-existing unrelated errors, unchanged) + build (all 31 routes generated) + npm run dev — curled /dashboard/leads and /preview/demo-cafe, both 200",
    ],
    decisions: BUSINESS_DECISIONS.filter((d) => d.id === "starter-upsell-digest-oldest-age"),
  },
  {
    date: "2026-07-17",
    branch: "claude/upbeat-dijkstra-czjurd",
    summary:
      "Empty-backlog after PR #373 (starter-upsell-digest-oldest-age). Free NEXT_STEPS stayed fully operator/legal-gated (4 items: stripe-price-objects, lead-ingestion, marketing-content-scheduling, commerce-payouts-stripe-connect). Fetched origin and spot-checked branches pushed since the last coordinator scan — nothing new landed worth folding. Per AGENT_PROTOCOL's empty-backlog tier-1 fallback ('wire an already-shipped sold-capability helper missing from pipeline-health/digest/dashboard'), read pipeline-health.ts, daily-digest.ts, and pipeline-health-panel.tsx side by side field-by-field rather than trusting the ITERATIONS log's claim that the due-queue-oldest-age-parity axis was fully closed. Found the one real gap: bundle abandoned checkouts (oldestAbandonedAgeHours) carry the 'oldest Xh' staleness signal on all three surfaces, but the sibling Commerce Buy now abandoned-cart due-queue (commerceAbandonedCheckoutCount / commerceRecoveryDueCount, kind=commerce_sku) had it on none of them — an operator staring at 'Buy now carts: 1' had no way to tell whether that cart was minutes old or a week stale, unlike its bundle-checkout sibling one card over. Shipped oldestCommerceAbandonedAgeHours end to end, computed independently from the bundle field so a stale bundle cart's age can never leak into the commerce-only signal or vice versa.",
    shipped: [
      "src/lib/metrics/pipeline-health.ts (+ test) — oldestCommerceAbandonedAgeHours field on PipelineHealth, computed via the same min/max-age scan loop already used for oldestAbandonedAgeHours, but over the independent commerceAbandoned array",
      "src/lib/digest/daily-digest.ts (+ test) — oldestCommerceAbandonedAgeHours field on DailyDigest (same IIFE pattern as the bundle oldestAbandonedAgeHours computation); ' · oldest Xh' suffix appended to the 'Abandoned Buy now' section title in renderDailyDigestHtml, matching the 'Abandoned checkouts' bundle section exactly",
      "src/components/dashboard/pipeline-health-panel.tsx — 'Buy now carts' MetricCard hint now appends ' · oldest Xh' after the recovery-due count, mirroring the Marketing packs due card's combined count+age hint shape",
      "src/app/docs/architecture/page.tsx — new paragraph documenting the gap and the independent-computation rationale",
      "NEXT_STEPS: commerce-abandoned-checkout-oldest-age-parity done (claimed in_progress and pushed before the feature body per protocol)",
      "BUSINESS_DECISIONS — commerce-abandoned-checkout-oldest-age-parity (id-based entry)",
      "Process: claim commit pushed before feature body; new decision + this entry reference each other by id",
      "Verified: npm test (1948 passed = prior 1944 baseline + 4 new: 1 pipeline-health independent-age unit test + 1 zero-default assertion + 2 daily-digest unit/render tests) + lint (clean) + build (tsc clean, all 31 routes generated) + npm run dev sanity check — inserted a real open commerce_sku checkout_session row (20h old, kind=commerce_sku, kept separate from a fresh bundle cart) plus a paid Commerce-addon order for a demo lead (example-bakery) into the dev SQLite DB, confirmed '1 recovery due · oldest 20h' renders on the Buy now carts MetricCard on /dashboard/leads (and did NOT leak into the bundle Abandoned carts card), then deleted the test rows and reverted the lead's stage",
    ],
    decisions: BUSINESS_DECISIONS.filter(
      (d) => d.id === "commerce-abandoned-checkout-oldest-age-parity",
    ),
  },
  {
    date: "2026-07-17",
    branch: "claude/nice-euler-igqi67",
    summary:
      "Empty-backlog after PR #374 (commerce-abandoned-checkout-oldest-age-parity). NEXT_STEPS stayed fully operator/legal-gated (4 items: stripe-price-objects, lead-ingestion, marketing-content-scheduling, commerce-payouts-stripe-connect). All ~370 remote branches were confirmed already-merged ancestors of main (no active sibling work, no collision risk). The pipeline-health/digest/dashboard oldest-age metric-parity axis (tier-1 empty-backlog fallback) was confirmed fully closed by the last ~15 iterations before proposing anything further there, so delegated a subagent-assisted audit scoped to AGENT_PROTOCOL tiers 2–4 (Convex/SQLite parity, security/injection, untested orchestration) instead of re-mining tier 1. The audit surfaced a real, verified gap: orders.refundedAt/disputedAt (shipped by bundle-order-refund-tracking/bundle-order-dispute-tracking, #368/#369) only ever fed revenue reporting — every sold recurring-capability eligibility predicate (marketing packs, client voice packs, commerce catalog, Starter→MRR upsell) checked only recurringCanceledAt, so a refund or dispute (which lands on the charge, not necessarily the Subscription) left the customer with indefinite paid-tier service delivery: Generate/Email pack, Sync to Stripe, and Buy now checkout all stayed live for a lead whose money Stripe had already returned or was actively disputing, and a refunded Starter customer could still receive a paid-upgrade upsell pitch.",
    shipped: [
      "src/lib/orders/recurring.ts (+ test) — orderGrantsSoldCapabilityEntitlement: orderHasActiveRecurringEntitlement AND !isOrderRefunded AND !isOrderDisputed. orderHasActiveRecurringEntitlement itself is unchanged (still the sole gate for listRecurringEntitlementPaused, a distinct subscription-status recovery surface) — this is a new, explicitly-named combinator, not a silent behavior change to an already-tested function",
      "src/lib/marketing/monthly-pack.ts (+ test) — leadEligibleForMarketingPack and bestMarketingOrderTier now call orderGrantsSoldCapabilityEntitlement instead of separately reimplementing the recurringCanceledAt-only inline check; orders param widened with optional commerceAddon/refundedAt/disputedAt",
      "src/lib/marketing/deliver-pack.ts — leadEligibleForMarketingPackDelivery's orders param widened to match (forwards to leadEligibleForMarketingPack, no logic change needed there)",
      "src/lib/voice/faq-pack.ts (+ test) — leadEligibleForClientVoicePack same treatment",
      "src/lib/voice/deliver-pack.ts — leadEligibleForClientVoicePackDelivery orders param widened to match",
      "src/lib/commerce/catalog.ts (+ test) — leadEligibleForCommerceCatalog same treatment (gates POST /api/commerce/checkout and the commerce_sku webhook branch directly, not just the dashboard)",
      "src/lib/billing/starter-upsell.ts (+ test) — isStarterOnlyOrder excludes a refunded/disputed Starter order directly (isOrderRefunded/isOrderDisputed from src/lib/orders/types.ts); leadEligibleForStarterUpsell's ordersForLead param widened to match",
      "src/app/docs/architecture/page.tsx — new paragraph documenting the gap and the fix, immediately after the existing bundle-order-refund/dispute revenue-visibility paragraphs",
      "NEXT_STEPS: refund-dispute-entitlement-gate done (added directly as done — this is an audit-discovered bug, not a pre-existing todo, matching the commerce-payouts-panel-clawback-visibility precedent)",
      "BUSINESS_DECISIONS — refund-dispute-entitlement-gate (id-based entry)",
      "Process: no sibling concurrently building these files (all remote branches confirmed already-merged); new decision + this entry reference each other by id",
      "Verified: npm test (1958 passed = prior 1948 baseline + 10 new: isStarterOnlyOrder/leadEligibleForStarterUpsell refund+dispute cases, leadEligibleForMarketingPack/bestMarketingOrderTier refund+dispute cases, leadEligibleForClientVoicePack refund+dispute case, leadEligibleForCommerceCatalog refund+dispute case, 4 direct orderGrantsSoldCapabilityEntitlement unit tests) + lint (clean) + tsc --noEmit -p . (same pre-existing unrelated vitest/process/NodeJS type errors, no new ones from the touched files) + build (tsc clean under next build's own config, all 31 routes generated) + npm run dev live check — inserted a paid/live Growth-tier lead with a refunded order (refundedAt set) into the dev SQLite DB via node:sqlite, confirmed via curl that 'Generate pack' no longer renders on that lead's dashboard row and it drops out of the 'Marketing packs due' MetricCard count (0), while a control lead with a healthy (non-refunded) Growth order still shows 'Generate pack'; deleted both test rows afterward",
    ],
    decisions: BUSINESS_DECISIONS.filter((d) => d.id === "refund-dispute-entitlement-gate"),
  },
  {
    date: "2026-07-17",
    branch: "claude/upbeat-dijkstra-gipcyc",
    summary:
      "Empty-backlog after PR #375 (refund-dispute-entitlement-gate, now the tip of main). Confirmed the single open PR (#202, draft, base far behind main) is unrelated pre-existing human/operator work, not a fold candidate. Sampled ~30 of the ~319 remote branches (git ls-remote + shallow fetch by ahead-count, plus list_commits date checks on distinctively-named ones like claude/pipeline-inquiry-metric) — every one checked was either a stale multi-day-old claim-only commit for an id already marked done in NEXT_STEPS, or far enough diverged from current main to be an abandoned/superseded snapshot; none was a genuine stuck-but-complete fold candidate. Delegated a subagent-assisted audit (same pattern as the prior iteration) scoped to the same refund/dispute-entitlement family the last iteration just shipped, since that's the freshest-touched surface and the most likely place for a sibling oversight. It found one: refund-dispute-entitlement-gate (#375) wired orderGrantsSoldCapabilityEntitlement into every *eligibility* predicate but left the three sibling *oldest-age* helpers (oldestMarketingPacksDueAgeHours, oldestCommerceCatalogCandidateAgeHours, oldestClientVoicePacksDueAgeHours — all three shipped earlier by due-queue-oldest-age-parity, PR #371, before orderGrantsSoldCapabilityEntitlement existed) still scanning orders with their own older recurringCanceledAt-only inline filter. Verified directly by reading all three functions plus their test files and every call site (pipeline-health.ts, daily-digest.ts both already pass full OrderRecord with refundedAt/disputedAt, confirmed via the OrderRecord import) before implementing — oldestStarterUpsellCandidateAgeHours was the one sibling that reuses isStarterOnlyOrder instead of reimplementing, confirming the other three were the actual gap, not a repeat of an already-closed axis.",
    shipped: [
      "src/lib/marketing/monthly-pack.ts (+ test) — oldestMarketingPacksDueAgeHours now gates each order on orderGrantsSoldCapabilityEntitlement instead of a raw recurringCanceledAt check; orders param widened with optional commerceAddon/refundedAt/disputedAt",
      "src/lib/commerce/catalog.ts (+ test) — oldestCommerceCatalogCandidateAgeHours same treatment; orders param widened with optional tier/refundedAt/disputedAt (tier defaults to \"\" via the existing leadEligibleForCommerceCatalog pattern, since commerceAddon alone already grants orderHadRecurringEntitlement)",
      "src/lib/voice/faq-pack.ts (+ test) — oldestClientVoicePacksDueAgeHours same treatment; orders param widened with optional commerceAddon/refundedAt/disputedAt",
      "NEXT_STEPS: refund-dispute-oldest-age-parity done (added directly as done — audit-discovered bug, not a pre-existing todo, same precedent as refund-dispute-entitlement-gate)",
      "BUSINESS_DECISIONS — refund-dispute-oldest-age-parity (id-based entry)",
      "Process: claim + feature body shipped together (no sibling concurrently building these three files, confirmed via branch scan); new decision + this entry reference each other by id",
      "Verified: npm test (1961 passed = prior 1958 baseline + 3 new: one refund/dispute regression test per helper, each with a stale refunded/disputed order alongside a newer active one to prove the older row no longer anchors the age) + lint (clean) + build (tsc clean, all 31 routes generated) + npm run dev sanity check — curled /dashboard/leads, /preview/demo-cafe, /docs/architecture (all 200)",
    ],
    decisions: BUSINESS_DECISIONS.filter((d) => d.id === "refund-dispute-oldest-age-parity"),
  },
  {
    date: "2026-07-17",
    branch: "codex/dev-work-rate-limit-bounds",
    summary:
      "Empty-backlog after PR #375 (refund-dispute-entitlement-gate). The four remaining NEXT_STEPS items stayed fully operator/legal-gated. A remote scan found codex/dev-work-rate-limit-cleanup with a complete, unmerged security body and no open PR, so I folded it instead of redoing the audit. The shared public rate limiter retained expired client-IP buckets forever and had no ceiling for rotating forwarded keys, allowing process memory growth. Shipped bounded expiry cleanup and oldest-key eviction.",
    shipped: [
      "src/lib/security/rate-limit.ts — purge expired buckets before each request and cap active keys at MAX_RATE_LIMIT_BUCKETS=10,000 by evicting the oldest key",
      "src/lib/security/rate-limit.test.ts — cover expired-bucket cleanup and oldest-key eviction at the active-state ceiling",
      "src/app/docs/architecture/page.tsx — document bounded limiter state beside the per-instance rate-limit caveat",
      "NEXT_STEPS: rate-limiter-bucket-bounds done",
      "BUSINESS_DECISIONS — rate-limiter-bucket-bounds (id-based entry)",
      "Process: claim commit pushed before feature body; folded the complete remote security body without its unrelated cache-ignore commits",
    ],
    decisions: BUSINESS_DECISIONS.filter((d) => d.id === "rate-limiter-bucket-bounds"),
  },
  {
    date: "2026-07-17",
    branch: "claude/nice-euler-mdquyc",
    summary:
      "Empty-backlog after PR #376 (refund-dispute-oldest-age-parity). Free NEXT_STEPS stayed fully operator/legal-gated (4 items: stripe-price-objects, lead-ingestion, marketing-content-scheduling, commerce-payouts-stripe-connect). Per AGENT_PROTOCOL's fold-scan-first rule, fetched every remote and found only two branches pushed after main's tip: codex/continuous-work-clean-audit-20260717-luna (docs-only 'still clean' audit entry — reviewed, no code, nothing to fold) and codex/dev-work-rate-limit-bounds, which had a real, complete, tested security fix already open as draft PR #377 (base sha exactly matched this run's starting HEAD, so no rebase was needed). That branch's own ITERATIONS entry says it folded a second remote, codex/dev-work-rate-limit-cleanup, itself. Read the diff before trusting the PR description: src/lib/security/rate-limit.ts's shared in-memory limiter (keys every public write route by clientIp) kept every bucket forever with no eviction — a client rotating X-Forwarded-For values (trivially spoofable, no auth) could grow the process-local Map without bound, a real memory-exhaustion/availability risk on every long-lived Node instance. The fix purges expired fixed-window buckets on each check and caps active keys at MAX_RATE_LIMIT_BUCKETS=10,000 via oldest-key eviction (relies on Map insertion-order semantics, verified correct: delete+re-set on window rollover advances a key to the back, so keys().next() is always the true oldest). Fast-forward merged the branch (identical base, zero conflicts) rather than reinventing it, then independently re-ran every check locally instead of trusting the branch's self-reported numbers.",
    shipped: [
      "No new product code this iteration — folded codex/dev-work-rate-limit-bounds (already merged origin/codex/dev-work-rate-limit-cleanup per its own ITERATIONS entry) via a clean fast-forward merge: src/lib/security/rate-limit.ts (bounded bucket eviction), src/lib/security/rate-limit.test.ts (expiry + oldest-key-eviction coverage), src/app/docs/architecture/page.tsx (documents the bound), .gitignore + eslint.config.mjs (ignore the agent's local .codex-home/ tool cache)",
      "NEXT_STEPS: rate-limiter-bucket-bounds already marked done by the folded commit — no change needed",
      "No new BUSINESS_DECISIONS — the folded branch's own rate-limiter-bucket-bounds entry already covers this decision; nothing to supersede",
      "Process: independently re-verified the folded branch's claims rather than trusting its self-reported PR numbers (npm ci was required first — node_modules was not preinstalled in this session); will close draft PR #377 as superseded once this branch's PR merges, since the two carry an identical diff",
      "Verified (fresh, this session, after npm ci): npm test (1963 passed, matches PR #377's reported count) + npm run lint (clean) + npm run build (tsc clean, all 31 routes generated, Node v22.22.2) + npm run dev sanity check — curled /, /dashboard, /preview/demo-cafe, /docs/architecture (all 200), then stopped the dev server and confirmed port 3000 was free",
    ],
    decisions: [],
  },
  {
    date: "2026-07-17",
    branch: "codex/dev-work-webhook-email-retry",
    summary:
      "Empty-backlog after PR #378 (rate-limiter-bucket-bounds). The four remaining NEXT_STEPS stayed fully operator/legal-gated, and the recent remote scan found no newer complete feature body to fold. A fresh sold-capability webhook audit found that bundle receipt/DNS and Commerce client receipt failures were logged as best-effort while the route still acknowledged checkout.session.completed with 200. That defeated the existing per-email marker recovery planners: Stripe does not reliably redeliver an acknowledged event, so a transient Resend failure could permanently lose a paid buyer receipt, DNS instructions, or Commerce client order notification. Shipped retryable transactional email delivery: preserve independent marker semantics, attempt sibling bundle email even if the first send throws/fails, then return 500 with a dedicated fulfillment step so Stripe redelivers missing markers.",
    shipped: [
      "src/app/api/stripe/webhook/route.ts — track resolved send failures and thrown send errors for bundle receipt/DNS and Commerce client receipt; return webhookFulfillmentFailureResponse(...), while successful sibling markers remain durable and failed markers stay absent",
      "src/lib/payments/webhook-fulfillment.ts (+ test) — add bundle_email_send and commerce_client_receipt_send retry steps; update policy comments to include transactional delivery",
      "src/app/api/stripe/webhook/route.test.ts — update existing redelivery-marker tests to assert 500 + step and preserve independent sibling-send/marker assertions",
      "src/app/docs/architecture/page.tsx — document that transactional email send and marker failures both cause Stripe retry",
      "NEXT_STEPS: webhook-email-send-failure-retry done",
      "BUSINESS_DECISIONS — webhook-email-send-failure-retry (id-based entry)",
      "Process: claimed and pushed the in_progress item before the feature body; appended the done status, decision, and iteration after implementation",
      "Verified: focused webhook/fulfillment suite (154 passed), full npm test (passed), npm run lint (clean), and npm run build under Node v22.22.2 (TypeScript clean, all 31 routes generated). Node 20 cannot load the repo's node:sqlite dependency, so the first build attempt was rerun with the available Node 22 runtime.",
    ],
    decisions: BUSINESS_DECISIONS.filter(
      (d) => d.id === "webhook-email-send-failure-retry",
    ),
  },
  {
    date: "2026-07-17",
    branch: "codex/continuous-work-bundle-email-unexpected-error",
    summary:
      "The four remaining NEXT_STEPS stayed fully operator/legal-gated. A fresh audit of the just-shipped transactional webhook retry path found one residual failure boundary: the bundle receipt/DNS email outer catch logged unexpected formatter/import errors and still acknowledged checkout.session.completed with 200, leaving both sent-markers absent without a guaranteed Stripe retry. Closed that boundary fail-closed while preserving independent sibling-marker semantics.",
    shipped: [
      "src/app/api/stripe/webhook/route.ts — return webhookFulfillmentFailureResponse(\"bundle_email_send\") from the outer receipt/DNS email catch instead of logging and acknowledging an unexpected error",
      "src/app/api/stripe/webhook/route.test.ts — regression coverage confirms malformed DNS handoff formatting returns 500 with bundle_email_send while the independently successful buyer receipt marker remains durable",
      "NEXT_STEPS: bundle-email-unexpected-error-retry done",
      "BUSINESS_DECISIONS — bundle-email-unexpected-error-retry (id-based entry)",
      "Process: claimed the audit-discovered item and pushed the in_progress claim commit before the feature body; no sibling had a competing body for this residual",
      "Verified: focused webhook suite (131 passed), full npm test (1966 passed), npm run lint (clean), and npm run build (TypeScript clean, all 31 routes generated) under Node v22.23.1; Node 20's expected node:sqlite limitation was separately confirmed",
    ],
    decisions: BUSINESS_DECISIONS.filter(
      (d) => d.id === "bundle-email-unexpected-error-retry",
    ),
  },
  {
    date: "2026-07-17",
    branch: "codex/dev-work-email-subject-control",
    summary:
      "Empty-backlog after PR #379 (webhook-email-send-failure-retry). The four remaining NEXT_STEPS stayed operator/legal-gated, and the remote fold scan found no newer complete unmerged feature body. A fresh email security audit found that client/operator-controlled business names, SKU names, and brand values flowed into provider-facing subjects without control-character normalization. HTML bodies were escaped, but CR/LF and other controls could produce malformed or deceptive subject lines depending on provider parsing. Shipped a shared sendEmail boundary sanitizer that replaces controls with spaces, collapses whitespace, trims, and falls back to 'Notification' when empty; operator digest subjects use the same normalization.",
    shipped: [
      "src/lib/email/resend.ts — add sanitizeEmailSubject and apply it to sendEmail provider payloads/mock logs and operator digest subjects",
      "src/lib/email/resend.test.ts — cover direct CR/LF/control-character normalization and dynamic business-name subject sanitization",
      "src/lib/process/prompt_process.tsx — mark NEXT_STEPS email-subject-control-character-sanitization done and append the id-based business decision",
      "Process: pushed the in_progress claim commit before the feature body; no operator-gated item was changed",
      "Verified: focused resend suite (26 passed), full npm test (1967 passed across 153 files), npm run lint (clean), and npm run build under Node v22.23.1 (TypeScript clean, all 31 routes generated). Node 20 cannot load the repo's node:sqlite dependency, so the initial build was rerun with the available Node 22 runtime.",
      "PR handoff: branch pushed, but both gh pr create and the REST pull-request endpoint were rejected with GitHub Actions token policy 'GitHub Actions is not permitted to create or approve pull requests' (HTTP 403).",
    ],
    decisions: BUSINESS_DECISIONS.filter(
      (d) => d.id === "email-subject-control-character-sanitization",
    ),
  },
  {
    date: "2026-07-17",
    branch: "claude/nice-euler-rtvd4q",
    summary:
      "Cooperation pass, then still-clean empty-backlog audit. Two complete, tested, unmerged sibling branches (codex/continuous-work-bundle-email-unexpected-error, codex/dev-work-email-subject-control) were stuck with no open PR — both had documented the same GitHub Actions token policy block ('GitHub Actions is not permitted to create or approve pull requests') that codex/dev-work-email-subject-control's own ITERATIONS entry already flagged. Verified both diffs independently (fail-closed webhook catch + subject control-character sanitizer), fast-merged both into this branch (one prompt_process.tsx append-only conflict, resolved by keeping both entries), re-ran the full verification suite fresh, and merged as PR #380 — this session has real PR-creation/merge access those CLI runners lack, so folding+shipping stuck-but-complete work is the highest-leverage move available before spending effort on a fresh audit. After that, the four NEXT_STEPS items remained operator/legal-gated (stripe-price-objects, lead-ingestion, marketing-content-scheduling, commerce-payouts-stripe-connect) with no live sibling claim, and no other pushed-since-main-tip branch had a genuine unmerged feature body (all ~300+ other remote branches diffed as pure deletions against current main — stale snapshots main has since superseded, not new work). Delegated a subagent-assisted audit across AGENT_PROTOCOL tiers 1 (Convex/SQLite parity) and 2 (security/injection), with partial tier 3 (test coverage) — it traced convex/orders.ts + convex/commerceOrders.ts sort/idempotency parity, src/lib/db.ts mapping, the convex-api-map-audit.test.ts structural guard, every Resend send site's escaping/sanitization, src/proxy.ts routing + safeNextPath bypass attempts, the rate-limiter eviction correctness, Stripe dispute-status enum handling, CSV RFC 4180 parsing, and the refund/dispute entitlement-gate wiring's real call-site types — and found nothing to fix. Recorded this as a documented clean audit per AGENT_PROTOCOL (a documented clean audit is more useful to sibling agents than manufactured busywork) rather than inventing an optional aggregate.",
    shipped: [
      "Merged PR #380 (fold codex/continuous-work-bundle-email-unexpected-error + codex/dev-work-email-subject-control): src/app/api/stripe/webhook/route.ts (+test) fail-closed on unexpected bundle receipt/DNS email errors; src/lib/email/resend.ts (+test) sanitizeEmailSubject strips control characters from every provider-facing subject",
      "Process: no new NEXT_STEPS/BUSINESS_DECISIONS — both ids were already marked done by their source branches; this iteration only merged the code and reconciled the append-only process log",
      "Audit coverage (no fix needed): Convex/SQLite list-query sort + idempotency parity on orders/commerceOrders, convex-api-map-audit.test.ts structural guard, Resend HTML/subject escaping across every send helper, proxy.ts routing + safeNextPath bypass attempts, rate-limiter bucket eviction, Stripe dispute-status enum, CSV multiline-quoted-field parsing, refund/dispute entitlement-gate real call-site types, and dashboard/leads action test coverage (25/25 actions have a dedicated test file)",
      "Verified (fresh, this session, after npm ci): npm test (1968 passed, 153 files) + npm run lint (clean) + npm run build (tsc clean under Node v22.22.2, all 31 routes generated) + npm run dev sanity check — curled /, /dashboard/leads, /preview/demo-cafe, /docs/architecture, /docs/process (all 200), then stopped the dev server and confirmed the port was freed",
    ],
    decisions: [],
  },
  {
    date: "2026-07-17",
    branch: "claude/upbeat-dijkstra-b2msyu",
    summary:
      "Empty-backlog after PR #381 (still-clean audit merge). The four NEXT_STEPS items remained operator/legal-gated (stripe-price-objects, lead-ingestion, marketing-content-scheduling, commerce-payouts-stripe-connect). Per AGENT_PROTOCOL's fold-scan-first rule, a subagent enumerated all 329 remote branches, computed ahead-of-main commit counts for each, and inspected every branch with a small ahead-count and recent timestamp — every candidate that looked like fresh unfolded work (webhook-email-retry, rate-limit-bounds, refund-dispute oldest-age gating, starter-upsell digest oldest-age) turned out to be byte-identical to content already merged into main under a different (squash-merged) SHA; the rest were docs/claim-only stubs or badly stale forks (tens of thousands of lines behind main, some with unrelated git history from the original scaffold). No stuck-but-complete sibling work existed to fold. Rotated to the one bug class AGENT_PROTOCOL explicitly flagged as not-yet-fully-exhausted: durable markers written after an unchecked send await. A second subagent enumerated every real call site (not import/definition) of every src/lib/email/resend.ts send helper across the whole repo — 16 total, 3 in the Stripe webhook route, 1 in contact/[slug], 12 in dashboard/leads actions — and verified each against three sub-invariants: (a) any durable marker/mutation gated on that send checks the resolved `{ success }` shape rather than writing unconditionally after the await, (b) every dashboard action taking a client-submitted id fetches/validates existence before writing, (c) every multi-branch `success: true/false` return literal is `as const` for caller narrowing. All 16 call sites, all id-taking actions, and all success-literal returns were already correct. Recording this as a documented clean audit (a dated 'still clean on axis X' entry is worth more to sibling agents than a repeated identical audit or manufactured busywork) and updating the AGENT_PROTOCOL note that previously flagged this axis as unexhausted, so sibling agents don't immediately re-run the identical sweep.",
    shipped: [
      "src/lib/process/prompt_process.tsx — AGENT_PROTOCOL: updated the marker-after-unchecked-await note from 'NOT fully exhausted' to record the 2026-07-17 clean sweep result (16 call sites enumerated, all correct), while keeping it a living invariant for future new send call sites",
      "No product code changes — this iteration is a documented clean audit, not a fix",
      "No new BUSINESS_DECISIONS — nothing to decide; no bug found to fix",
      "Sibling-scan coverage (no fold needed): confirmed all recently-pushed branches with small ahead-counts (claude/upbeat-dijkstra-ftu6jk, codex/dev-work-webhook-email-retry, codex/dev-work-rate-limit-bounds, codex/dev-work-rate-limit-cleanup, claude/nice-euler-mdquyc, claude/upbeat-dijkstra-gipcyc, claude/nice-euler-eojcaa) are byte-identical to already-merged main content on their touched files",
      "Audit coverage (no fix needed): every live resend.ts call site across src/app/api/stripe/webhook/route.ts (3), src/app/api/contact/[slug]/route.ts (1), and src/app/dashboard/leads/actions.ts (12) — durable-marker-after-checked-success, fetch-before-write on client-submitted ids, and as-const success-literal narrowing all confirmed correct on a fresh read (not trusted from prior audit summaries)",
      "Verified: npm test (1968 passed, 153 files) + npm run lint (clean) + npm run build (tsc clean, all 31 routes generated)",
    ],
    decisions: [],
  },
  {
    date: "2026-07-17",
    branch: "claude/nice-euler-9vrw23",
    summary:
      "Empty-backlog after PR #382 (marker-after-unchecked-await clean sweep, now the tip of main). The four NEXT_STEPS items remained operator/legal-gated (stripe-price-objects, lead-ingestion, marketing-content-scheduling, commerce-payouts-stripe-connect). Per AGENT_PROTOCOL's fold-scan-first rule, fetched all 330+ remote branches and diffed every recently-pushed one (small ahead-count, 2026-07-17 timestamp: nice-euler-*, upbeat-dijkstra-ftu6jk/gipcyc/b2msyu, codex/dev-work-*, codex/continuous-work-*, cursor/prompt-process-evolution-*, cursor/business-process-evolution-*) against main excluding the process log — every one was either empty (claim-only stub, already-superseded id) or a pure-deletion diff (an old fork diverged from a much earlier main, missing thousands of lines main has since added) — no stuck-but-complete fold candidate existed, consistent with the immediately preceding two iterations' findings. Checked tier-4 (untested orchestration modules): every route.ts has a sibling test, every dashboard action has a dedicated test file (25/25), and src/lib/db.ts's 3,244 lines of Convex/SQLite glue are deliberately untested directly (import \"server-only\", same accepted pattern as stripe-sync.ts — its pure logic is already extracted into tested sibling modules, and convex-api-map-audit.test.ts already guards its Convex table registration structurally) — that axis stayed clean, not a new gap. Rotated to an axis AGENT_PROTOCOL's audit-rotation list had never named: the public doc pages themselves as a growth/performance surface, distinct from the existing 'public marketing OUTPUT surfaces' (indexability/JSON-LD) axis. /docs/process (src/app/docs/process/page.tsx) renders every ITERATIONS/BUSINESS_DECISIONS/NEXT_STEPS entry with no cap; these are explicitly append-only per AGENT_PROTOCOL and grow roughly one entry per PR across dozens of concurrent agents. Confirmed via a real npm run build: the page's SSR HTML was already 1,330,327 bytes (365 iterations, 428 decisions, 336 NEXT_STEPS, 4 still todo) with no ceiling — a real, compounding page-weight regression on a page every agent (and any curious operator) loads, not a one-time cost.",
    shipped: [
      "src/app/docs/process/page.tsx — cap the Iteration history and Business decisions sections to the most recent 25 / 50 entries (newest first) and the Backlog table to all todo/in_progress items plus the most recent 20 done items, each with a visible 'showing X of Y — full history in source/git' note; underlying prompt_process.tsx arrays are untouched and stay fully append-only",
      "src/lib/process/prompt_process.tsx: NEXT_STEPS process-doc-unbounded-history-pagination added directly as done (audit-discovered fix, same precedent as refund-dispute-entitlement-gate/rate-limiter-bucket-bounds — found and fixed within one iteration, no pre-existing todo)",
      "BUSINESS_DECISIONS — process-doc-unbounded-history-pagination (id-based entry)",
      "Process: no sibling concurrently touching src/app/docs/process/page.tsx (confirmed via the branch scan above); claim + feature body shipped together since this is an audit-discovered fix with zero collision risk, matching the established precedent for this class of finding",
      "Verified: npm ci (node_modules was not preinstalled in this session) + npm run lint (clean) + npm run build (tsc clean, all 31 routes generated, Node v22.22.2) — confirmed the fix directly by measuring .next/server/app/docs/process.html before (1,330,327 bytes) and after (800,699 bytes, a ~40% reduction even with AGENT_PROTOCOL and the small todo/in_progress set left uncapped by design) and by grepping the rendered HTML for the 'Showing the N most recent of M' notes with the correct true totals (50 of 428 decisions, 25 of 365 iterations) — npm test (1968 passed, 153 files, unchanged from baseline — this is a presentation-only change with no logic under test) — npm run dev sanity check: curled /, /dashboard/leads, /preview/demo-cafe, /docs/process (all 200), then stopped the dev server and confirmed port 3000 was freed",
    ],
    decisions: BUSINESS_DECISIONS.filter(
      (d) => d.id === "process-doc-unbounded-history-pagination",
    ),
  },
  {
    date: "2026-07-17",
    branch: "claude/upbeat-dijkstra-cc9bke",
    summary:
      "Empty-backlog after PR #383 (process-doc-unbounded-history-pagination). The four NEXT_STEPS items remained operator/legal-gated (stripe-price-objects, lead-ingestion, marketing-content-scheduling, commerce-payouts-stripe-connect). Fold-scanned the two branches pushed after the last merge (codex/dev-work-starter-upsell-digest-age, codex/continuous-work-public-input-audit-0717) and found both were claim-only stubs (process-log diff only, zero code) — no fold candidate. Delegated a fresh empty-backlog audit to a subagent; it found that the previous iteration's own fix (capping /docs/process's render of ITERATIONS/BUSINESS_DECISIONS/NEXT_STEPS to bound page weight) had not touched the fourth array on that same page, AGENT_PROTOCOL — and while that array is a live rulebook (correctly NOT display-capped, since agents need the full ruleset, not 'the most recent N rules'), its *source content* had independently grown to 121 entries / ~100KB through an accumulated chain of narrow 'after X ships, close Y twin' entries across the field-length-cap and Stripe entitlement/webhook hardening series — exactly the audit-trail-style content the file's own header says belongs in BUSINESS_DECISIONS/ITERATIONS/git history instead. This mirrors a prior 2026-07-14 consolidation (~198 entries down to ~32) that the file had since regrown past. Read every one of the 121 entries end to end, identified every still-binding distinct technical invariant, and rewrote the two narrative chains (~35 entries) into ~13 general statements — confirming first that no distinct fact was lost (one stale residual-gap callout was intentionally dropped: PR #373 had already closed it) and leaving every entry outside those two chains untouched.",
    shipped: [
      "src/lib/process/prompt_process.tsx — AGENT_PROTOCOL: consolidated the field-length-cap chain (public + auth-gated opaque-id/free-text/redirect size bounds, whole-body byte ceilings) and the Stripe webhook/recurring-entitlement chain (fulfillment re-derivation, async_payment_failed reopen, recurring MRR entitlement sync, orphan-session cleanup, refund/dispute visibility) into general invariant statements; kept every compact still-current specific rule (lead-slug sanitization, markHandoffLive null guard, custom-domain normalize + www/apex aliasing, operator-password trim + proxy parity, preview listOrders indexing, server-only barrel gotcha, Convex API map lock, public marketing-output indexability, parseLeadHours middot split, pipeline-health/digest aggregate pitfalls) verbatim or near-verbatim",
      "NEXT_STEPS: agent-protocol-narrative-consolidation added directly as done (audit-discovered process fix)",
      "BUSINESS_DECISIONS — agent-protocol-narrative-consolidation (id-based entry)",
      "Process: audit-discovered fix with zero collision risk (no sibling branch touching AGENT_PROTOCOL this cycle), so claim + feature body shipped together, matching the established precedent for this class of finding",
      "Verified: npm ci (node_modules not preinstalled this session) + npm run lint (clean) + npx tsc --noEmit (no errors from prompt_process.tsx; only pre-existing unrelated convex/*.ts type errors from missing @types, present before this change) + npm run build (tsc clean, all 31 routes generated) + npm test (1968 passed, 153 files, unchanged from baseline — process-log-only change, no logic under test) + npm run dev sanity check: curled /, /dashboard/leads, /preview/demo-cafe, /docs/process, /docs/architecture (all 200), confirmed /docs/process rendered the new consolidated AGENT_PROTOCOL text (grepped for the new parseLeadHours entry), then stopped the dev server and confirmed port 3000 was freed",
    ],
    decisions: BUSINESS_DECISIONS.filter(
      (d) => d.id === "agent-protocol-narrative-consolidation",
    ),
  },
  {
    date: "2026-07-17",
    branch: "claude/nice-euler-67ezwq",
    summary:
      "Empty-backlog after PR #384 (agent-protocol-narrative-consolidation, tip of main). The four remaining NEXT_STEPS items stayed fully operator/legal-gated (stripe-price-objects, lead-ingestion, marketing-content-scheduling, commerce-payouts-stripe-connect). Per AGENT_PROTOCOL's fold-scan-first rule, checked branches pushed after main's tip: only codex/dev-work-empty-backlog-audit-0718 (23:24:46 UTC, 20s after main) existed, and it is a docs-only 'clean audit' entry based on a commit that predates PR #384's AGENT_PROTOCOL consolidation (its own diff would revert the consolidated text) — not a fold candidate, and its underlying audit claims (Convex/SQLite list parity, JSON-LD/preview escaping) were already independently re-verified by claude/nice-euler-rtvd4q and claude/upbeat-dijkstra-b2msyu two iterations prior. Rather than re-running an already-multiply-confirmed generic sweep, independently re-derived correctness (reading current source, not trusting prior ITERATIONS prose) on the specific chain of money-integrity fixes shipped in the last ~10 iterations, since a fast sequence of similarly-shaped fixes is the likeliest place for a copy-paste gap: (1) orderGrantsSoldCapabilityEntitlement is wired into every eligibility predicate (marketing pack, voice pack, commerce catalog, Starter upsell) AND every sibling oldest-age helper — confirmed by reading src/lib/orders/recurring.ts, src/lib/marketing/monthly-pack.ts, src/lib/voice/faq-pack.ts, src/lib/commerce/catalog.ts, src/lib/billing/starter-upsell.ts directly; (2) commerceOrders/orders markRefunded|markDisputed|clearDisputed mutations have matching convex/schema.ts by_stripeSessionId indexes, are registered on db.ts's static Convex API map, use idempotent no-op-safe WHERE/patch guards on both backends, and pass requireConvex from the webhook; (3) pipeline-health.ts's revenueTotalUsd and commerceOrdersRevenueUsd both gate through the shared orderCountsTowardRevenue / !isCommerceOrderRefunded && !isCommerceOrderDisputed predicates (no double-count when an order is both refunded and disputed, since the two clawback cards are independent, non-summed fields and mergeCommerceOrdersForReview dedupes by id); (4) every send helper in src/lib/email/resend.ts funnels through the single sendEmail boundary that applies sanitizeEmailSubject — no bypass; (5) the bounded rate limiter's oldest-key eviction relies on Map insertion-order semantics and the delete+re-set-on-rollover pattern correctly re-orders a touched key to the back; (6) /docs/process's slice(-N).reverse() pagination renders newest-first with correct counts. All 26 dashboard actions and all 9 API routes still have a dedicated test file. No defect found on any of these axes.",
    shipped: [
      "No product code changes — documented clean re-audit only",
      "src/lib/process/prompt_process.tsx — BUSINESS_DECISIONS post-consolidation-money-integrity-clean-audit-0718 (id-based entry)",
      "Process: checked the one branch pushed after PR #384 (codex/dev-work-empty-backlog-audit-0718) — docs-only, pre-consolidation base, not a fold candidate",
      "Audit coverage (no fix needed): refund/dispute entitlement gating on every eligibility + oldest-age helper; commerceOrders/orders refund-dispute mutation Convex/SQLite parity (schema indexes, API map registration, idempotency, requireConvex); revenueTotalUsd/commerceOrdersRevenueUsd shared-predicate gating and clawback-card independence; sendEmail subject-sanitization boundary (no bypass across any send helper); rate-limiter oldest-key eviction correctness; /docs/process pagination slice/reverse ordering; dashboard-action (26/26) and API-route (9/9) test-file coverage",
      "Verified (fresh, this session, after npm ci): npm test (1968 passed, 153 files — unchanged from the PR #384 baseline, confirming no drift) + npm run lint (clean) + npm run build (tsc clean, all 31 routes generated, Node v22.22.2)",
    ],
    decisions: BUSINESS_DECISIONS.filter(
      (d) => d.id === "post-consolidation-money-integrity-clean-audit-0718",
    ),
  },
  {
    date: "2026-07-17",
    branch: "codex/continuous-work-20260717-luna",
    summary:
      "Empty-backlog after PR #382. The four remaining NEXT_STEPS items are still operator/legal-gated (stripe-price-objects, lead-ingestion, marketing-content-scheduling, commerce-payouts-stripe-connect). The required sibling fold scan found no complete unmerged body: cursor/prompt-process-evolution-0329 and cursor/business-process-evolution-d518 are already represented by merged PRs #331/#330, while the recent Codex rate-limit and webhook branches are already represented on main or closed as superseded. Rotated through a fresh cross-cutting audit of the dual-backend Convex API map, transactional marker/send boundaries, client-id existence checks, and orchestration test coverage; no new defect was found. Per AGENT_PROTOCOL, recorded a dated still-clean audit instead of manufacturing an optional feature.",
    shipped: [
      "No product code changes — this was a documented clean empty-backlog audit",
      "Sibling fold scan: checked recent codex/grok/opencode/gemini/cursor branches and open PRs; no genuine unmerged feature body remained",
      "Audit coverage (no fix needed): Convex API map registration and list ordering guards, durable marker writes after resolved send success, dashboard fetch-before-write checks for submitted ids, public/security input boundaries, and route/action orchestration tests",
      "NEXT_STEPS: all four remaining todo items remain unchanged because each requires operator action, legal review, or external Stripe Connect setup",
      "Verified: npm test, npm run lint, and npm run build",
      "PR handoff: branch pushed, but gh pr create and the REST pull-request endpoint are blocked by the GitHub Actions token policy (HTTP 403: GitHub Actions is not permitted to create or approve pull requests) — folded onto claude/upbeat-dijkstra-yqw6f4 by a later iteration that could open a PR.",
    ],
    decisions: [],
  },
  {
    date: "2026-07-18",
    branch: "codex/dev-work-empty-backlog-audit-0718",
    summary:
      "Empty-backlog audit after PR #383. The four remaining NEXT_STEPS items stayed operator/legal-gated, and the remote fold scan found no complete unmerged feature body. Re-audited Convex/SQLite persistence list parity and unauthenticated public render sinks after the latest webhook and public-doc work; all guards remain intact, so this is a documented clean audit rather than manufactured product work.",
    shipped: [
      "NEXT_STEPS: empty-backlog-convex-public-surface-audit-0718 done",
      "Convex/SQLite audit (no fix needed): every production debt/fulfillment feed uses an uncapped helper; intentional UI pages remain capped; listOpenCheckoutSessions, orders, packs, catalogs, voice packs, deploy handoffs, and commerce ledgers preserve their documented ordering/completeness contracts; convex-api-map-audit.test.ts still covers every public Convex export and the deliberate orders.createOrder orphan",
      "Public-surface security audit (no fix needed): exactly one executable dangerouslySetInnerHTML sink remains and it uses safeJsonLdScript; preview lead text is soft-capped before render/metadata/JSON-LD; Maps URLs are fixed-origin with encodeURIComponent query values; React handles remaining href/src attribute escaping",
      "Process: claim commit f5cdbd7 was pushed before the audit body; no BUSINESS_DECISIONS entry was needed because no new product decision or defect was found",
      "Verified: npm test (1968 passed, 153 files), npm run lint (clean), and npm run build via Node 22.23.1 (TypeScript clean, all 31 routes generated). Node 20.20.2 cannot load the repository's node:sqlite dependency; the same build completed successfully under Node 22.",
      "Folded onto claude/upbeat-dijkstra-yqw6f4 by a later iteration — this branch (codex/dev-work-empty-backlog-audit-0718) had a complete audit body but could not open its own PR (GitHub Actions token policy blocks gh pr create for that automation).",
    ],
    decisions: [],
  },
  {
    date: "2026-07-18",
    branch: "claude/upbeat-dijkstra-yqw6f4",
    summary:
      "Empty-backlog after the post-consolidation clean audit (nice-euler-67ezwq). NEXT_STEPS stayed fully operator/legal-gated (stripe-price-objects, lead-ingestion, marketing-content-scheduling, commerce-payouts-stripe-connect). Folded two stuck sibling branches first (codex/dev-work-empty-backlog-audit-0718, codex/continuous-work-20260717-luna) — both had complete, honest clean-audit bodies but could not open their own PRs (GitHub Actions token policy blocks gh pr create for those automations); merged both into this branch, resolving the ITERATIONS-array tail-append conflicts by keeping every entry from all three histories in chronological order. With every correctness/security/parity axis re-confirmed clean across the last several iterations, shifted the search from 'find a defect' to 'find a shipped-but-unwired customer-facing gap' (AGENT_PROTOCOL's own empty-backlog priority order ranks this first) and found one: invoice.payment_failed has paused Growth/Complete/Commerce CRM entitlement internally since #345/#346, but never told the paying customer — the only signal was operator-side. Shipped a transactional dunning notice.",
    shipped: [
      "convex/orders.ts — getByStripeCustomerId query on the existing by_stripeCustomerId index (mirrors listByLeadSlug/getByStripeSessionId)",
      "src/lib/db.ts — getOrdersByStripeCustomerId (dual-backend: Convex query + SQLite orders/leads join), registered on the static Convex API map",
      "src/lib/email/resend.ts — sendPaymentFailedNotice (skipSuppression: true; billing-critical, same class as sendReceiptEmail — a cold-outreach unsubscribe must not hide a card-decline notice from a paying customer); links to /checkout/success?session_id=<original Checkout Session id> rather than minting a fresh Billing Portal session from inside the webhook",
      "src/app/api/stripe/webhook/route.ts — invoice.payment_failed now looks up the failing customer's recurring order + lead and sends the notice as a best-effort side effect after the existing CRM pause succeeds (its own try/catch; a notify failure cannot turn the already-durable pause into a 5xx/retry loop)",
      "NEXT_STEPS + BUSINESS_DECISIONS: recurring-payment-failed-dunning-notice (id-based entries)",
      "Tests: 5 new route.test.ts cases (sends on recurring order, skips when no recurring order / no lead email, does not 5xx when the lookup throws or the send resolves success:false) + 3 new resend.test.ts cases (businessName escaping, href escaping, skipSuppression delivery)",
      "Verified: npm ci (node_modules not preinstalled this session) + npm test (1976 passed, 153 files) + npm run lint (clean) + npm run build (tsc clean, all 31 routes generated) + npm run dev sanity check: curled /dashboard/leads, /preview/demo-cafe, /docs/process, /checkout/success (all 200) and POST /api/stripe/webhook without a valid signature (501, expected — no regression), then stopped the dev server",
    ],
    decisions: BUSINESS_DECISIONS.filter(
      (d) => d.id === "recurring-payment-failed-dunning-notice",
    ),
  },
  {
    date: "2026-07-18",
    branch: "claude/nice-euler-uvmq9u",
    summary:
      "Empty-backlog after PR merging recurring-payment-failed-dunning-notice (claude/upbeat-dijkstra-yqw6f4). NEXT_STEPS stayed fully operator/legal-gated (stripe-price-objects, lead-ingestion, marketing-content-scheduling, commerce-payouts-stripe-connect). Fetched all remote branches; the only one pushed after main's tip was codex/dev-work-post-dunning-audit-0718, a claim-only stub (status=in_progress, no feature body) whose stated scope is re-checking the just-shipped invoice.payment_failed customer-notice path, its Convex/SQLite lookup, webhook failure boundaries, and public render/email sinks for a regression. Per the run brief, avoided duplicating that exact audit scope and read the full invoice.payment_failed / invoice.paid pair directly instead of trusting prior ITERATIONS prose. Found a real, adjacent gap that is additive rather than a regression in the new code: sendPaymentFailedNotice (shipped the prior iteration) told the customer their service paused on a failed renewal, but the invoice.paid restore handler — which already clears the CRM pause when the subscription recovers — had no customer-facing twin. A subscriber who fixed their declined card got zero email confirmation that service resumed; the only prior signal came from the dunning notice itself going silent, which is not a real 'you're back' confirmation. This mirrors AGENT_PROTOCOL's existing dispute/refund opened/closed-twin rule, generalized from a dashboard flag to an outbound email.",
    shipped: [
      "src/lib/email/resend.ts (+ test) — sendPaymentRecoveredNotice: skipSuppression: true (billing-critical, same class as sendPaymentFailedNotice/sendReceiptEmail); reuses the /checkout/success?session_id=<original Checkout Session id> Manage-billing link, no new Stripe API call from inside the webhook",
      "src/app/api/stripe/webhook/route.ts (+ test) — invoice.paid handler now tracks the clearOrdersRecurringCanceledByCustomer return count; when cleared > 0 (a pause was actually reversed, not an ordinary healthy renewal), looks up the customer's recurring order + lead via the existing getOrdersByStripeCustomerId/getLeadBySlug pair (same pattern as the payment_failed notice) and sends the recovery notice as a best-effort side effect after the durable clear+sync succeeds — its own try/catch, notify failure cannot turn the already-durable restore into a 5xx/retry loop",
      "src/app/docs/architecture/page.tsx — extended the invoice.paid restore-twin paragraph to document both notice twins (sendPaymentFailedNotice / sendPaymentRecoveredNotice) and the cleared > 0 gate rationale",
      "src/lib/process/prompt_process.tsx — AGENT_PROTOCOL: new bullet generalizing the dispute/refund opened/closed-twin rule to customer-facing pause/restore notices, and recording the cleared > 0 anti-spam gate as a named invariant",
      "NEXT_STEPS + BUSINESS_DECISIONS: payment-recovered-confirmation-notice (id-based entries, added directly as done — audit-discovered gap, same precedent as recurring-payment-failed-dunning-notice)",
      "Tests: 6 new route.test.ts cases (emails when cleared > 0 and a recurring order/lead-email exist; skips when cleared === 0 — the healthy-renewal anti-spam case; skips when no recurring order; skips when lead has no email; does not 5xx when the lookup throws; does not fail the webhook when the send resolves success:false) + 3 new resend.test.ts cases (businessName escaping, manage-billing href escaping, skipSuppression delivery)",
      "Verified: npm ci (node_modules not preinstalled this session) + npm test (1985 passed, 153 files = prior 1976 baseline + 9 new) + npm run lint (clean) + npm run build (tsc clean, all 31 routes generated) + npm run dev sanity check: curled /, /dashboard/leads, /preview/demo-cafe, /docs/process, /docs/architecture (all 200; confirmed the new sendPaymentRecoveredNotice text renders on /docs/architecture), then stopped the dev server and confirmed port 3000 was freed",
    ],
    decisions: BUSINESS_DECISIONS.filter(
      (d) => d.id === "payment-recovered-confirmation-notice",
    ),
  },
  {
    date: "2026-07-18",
    branch: "claude/nice-euler-65qs5d",
    summary:
      "Empty-backlog after payment-recovered-confirmation-notice (claude/nice-euler-uvmq9u, merged as PR #386/#387). NEXT_STEPS stayed fully operator/legal-gated (stripe-price-objects, lead-ingestion, marketing-content-scheduling, commerce-payouts-stripe-connect). Ran a fresh three-tier audit (sold-capability wiring, Convex/SQLite parity, security) and spot-checked the newest-pushed remote branches before picking work: the two branches pushed after main's tip (codex/dev-work-post-dunning-audit-0718, codex/continuous-work-20260718-luna) are stale forks whose diffs show deletions of the just-merged dunning-notice code, confirming they forked before PR #386/#387 landed — nothing to fold. Convex/SQLite ORDER BY parity re-check (commerceOrders.listRefunded/listDisputed, inquiries.listCommerceCheckoutBySlug, orders.getByStripeCustomerId) found no regression. The real gap: invoice.payment_failed/invoice.paid's dunning/recovery pair (the last two iterations) only covers Stripe's past_due/unpaid status axis — customer.subscription.updated's separate pause_collection axis (billing paused with the Subscription otherwise left active/trialing, settable with zero invoice event at all — e.g. directly from the Stripe Dashboard) already paused/restored CRM entitlement internally via the existing markOrdersRecurringCanceledByCustomer/clearOrdersRecurringCanceledByCustomer calls, but had no customer-facing signal whatsoever, and reusing the existing payment-failed/recovered copy for it would have been actively misleading ('your card was declined' when no charge was ever attempted).",
    shipped: [
      "src/lib/email/resend.ts (+ test) — sendSubscriptionPausedNotice / sendSubscriptionResumedNotice: skipSuppression: true, same /checkout/success?session_id=<original Checkout Session id> Manage-billing link pattern as the payment-failed/recovered pair, but with accurate 'billing paused/resumed' copy instead of 'card declined'",
      "src/app/api/stripe/webhook/route.ts (+ test) — customer.subscription.created|updated handler now derives pauseCollectionJustChanged from event.data.previous_attributes (Stripe only lists fields that actually changed on a *.updated event) and fires the paused notice only when collectionPaused && pauseCollectionJustChanged (the pause branch), and the resumed notice only when cleared > 0 && pauseCollectionJustChanged (the grants/restore branch, which needed `cleared` hoisted out of its try block to survive into the notify step) — both best-effort with their own try/catch after the already-durable CRM write, and both gates required in both directions to avoid double-emailing an ordinary past_due/unpaid transition already covered by invoice.payment_failed/invoice.paid",
      "AGENT_PROTOCOL — extended the payment-recovered-confirmation-notice bullet to cover the pause_collection axis and the previous_attributes-key gating mechanism",
      "NEXT_STEPS + BUSINESS_DECISIONS: subscription-pause-collection-notice (id-based entries, added directly as done — audit-discovered gap, same precedent as the two prior notice-pair iterations)",
      "Tests: 11 new route.test.ts cases (sends paused notice on a genuine pause_collection transition; skips on an already-paused subsequent update; skips on an ordinary past_due pause; does not 5xx when the lookup throws; sends resumed notice on a genuine pause_collection-clear + cleared>0; skips on an ordinary catalog-Price restore with no pause_collection change; skips when cleared===0; does not 5xx when the resume lookup throws; does not fail the webhook when either send resolves success:false) + 6 new resend.test.ts cases (businessName escaping + href escaping + skipSuppression delivery, ×2 functions)",
      "Verified: npm ci (node_modules not preinstalled this session) + npm test (2000 passed, 153 files = prior 1985 baseline + 15 new) + npm run lint (clean) + npm run build (tsc clean, all 31 routes generated) + npm run dev sanity check: curled /, /dashboard/leads, /preview/demo-cafe, /docs/process, /docs/architecture (all 200) and POST /api/stripe/webhook without a valid signature (501, expected — no regression), then stopped the dev server and confirmed port 3000 was freed",
    ],
    decisions: BUSINESS_DECISIONS.filter(
      (d) => d.id === "subscription-pause-collection-notice",
    ),
  },
  {
    date: "2026-07-18",
    branch: "claude/upbeat-dijkstra-74a30g",
    summary:
      "Empty-backlog after PR #388 (subscription-pause-collection-notice, tip of main). NEXT_STEPS stayed fully operator/legal-gated (stripe-price-objects, lead-ingestion, marketing-content-scheduling, commerce-payouts-stripe-connect). Only one open PR existed repo-wide (#202, a draft, human-authored, unrelated agent-dashboard feature — not a fold candidate). Per AGENT_PROTOCOL's fold-scan-first rule, diffed every branch pushed at/after main's tip: two were pure-additive test-only forks (codex/continuous-work-20260718-luna-fold and its near-duplicate codex/dev-work-post-dunning-audit-0718, both adding recurring.test.ts coverage for Stripe's nested invoice.parent.subscription_details.subscription payload shape — confirmed the source already handles that shape correctly, so this is coverage, not a fix) and one had a real fix: codex/dev-work-billing-notice-entitlement found that sendPaymentFailedNotice/sendPaymentRecoveredNotice selected their recipient order via orderHadRecurringEntitlement (tier/commerceAddon only) instead of orderGrantsSoldCapabilityEntitlement (the refund/dispute-aware predicate every eligibility gate already uses), so a refunded/disputed historical order could still surface a misleading notice. That branch forked before subscription-pause-collection-notice (PR #388) shipped its two additional call sites (sendSubscriptionPausedNotice/sendSubscriptionResumedNotice), which had copy-pasted the same orderHadRecurringEntitlement bug into fresh code — re-derived the fix against current main and extended it to all four call sites in one pass rather than folding the narrower two-site diff as-is. All three source branches carry the same 'GitHub Actions is not permitted to create or approve pull requests' PR-handoff limitation as several prior folded iterations.",
    shipped: [
      "src/app/api/stripe/webhook/route.ts — all four billing-notice recipient-selection sites (payment-failed, payment-recovered, subscription-paused, subscription-resumed) switched from orderHadRecurringEntitlement to orderGrantsSoldCapabilityEntitlement; removed the now-unused orderHadRecurringEntitlement import (CRM pause/restore writes elsewhere in the file are unchanged)",
      "src/app/api/stripe/webhook/route.test.ts — 4 new regression cases (one per notice) proving a refunded/disputed historical recurring order is skipped (no lead lookup, no send)",
      "src/lib/orders/recurring.test.ts — folded 2 additive test cases proving invoicePaymentFailedPausesRecurringEntitlement/invoicePaidMayRestoreRecurringEntitlement already accept Stripe's nested invoice.parent.subscription_details.subscription shape",
      "NEXT_STEPS + BUSINESS_DECISIONS: billing-notice-entitlement-selection (id-based entries)",
      "Verified: npm ci (node_modules not preinstalled this session) + npm test (2006 passed, 153 files = prior 2000 baseline + 6 new) + npm run lint (clean) + npm run build (tsc clean, all 31 routes generated) + npm run dev sanity check: curled /, /dashboard/leads, /preview/demo-cafe, /docs/process, /docs/architecture (all 200) and POST /api/stripe/webhook without a valid signature (501, expected — no regression), then stopped the dev server and confirmed port 3000 was freed",
    ],
    decisions: BUSINESS_DECISIONS.filter(
      (d) => d.id === "billing-notice-entitlement-selection",
    ),
  },
  {
    date: "2026-07-18",
    branch: "claude/nice-euler-fuhf7h",
    summary:
      "Empty-backlog after PR #389 (billing-notice-entitlement-selection, tip of main). NEXT_STEPS stayed fully operator/legal-gated (stripe-price-objects, lead-ingestion, marketing-content-scheduling, commerce-payouts-stripe-connect). Per AGENT_PROTOCOL's fold-scan-first rule, checked every branch pushed at/after main's tip and found none — this run is the first to pick up work after PR #389 landed. The only open PR repo-wide (#202) is the same unrelated human-authored draft agent-run-dashboard feature noted by the last several iterations. Dispatched an independent, from-source (not from-ITERATIONS-prose) re-audit across the seven axes most likely to regress after the dense, fast chain of billing-notice fixes shipped over the last five iterations: skipSuppression correctness on all 17 exported send* helpers in src/lib/email/resend.ts, href-attribute escaping in every outbound email template, Convex/SQLite ORDER BY parity on every list query in convex/*.ts (including ones not explicitly named in AGENT_PROTOCOL's list), existence-check-before-write on every client-submitted-id dashboard action, `as const` on every `success:` literal in the three actions.ts files, non-trivial src/lib modules missing a .test.ts sibling, and pipeline-health/daily-digest wiring for every list*Due-style helper. No defect found on any axis. The audit did surface one cosmetic-only inaccuracy: sendCommerceBuyNowClientReceipt's docstring said 'Honors suppression via sendEmail' when the function has always correctly passed skipSuppression: true (it bypasses suppression, matching every other billing-critical send, not honors it) — fixed the wording to match sendReceiptEmail's accurate phrasing rather than leaving a misleading comment for the next agent to trip over.",
    shipped: [
      "src/lib/email/resend.ts — corrected sendCommerceBuyNowClientReceipt's docstring (no behavior change; the function already passed skipSuppression: true)",
      "src/lib/process/prompt_process.tsx — NEXT_STEPS + BUSINESS_DECISIONS: post-billing-notice-entitlement-clean-audit-0718 (id-based entries)",
      "Process: zero branches pushed at/after main's tip to fold; audit coverage (no fix needed beyond the doc comment): resend.ts skipSuppression on all 17 send helpers; href escaping in every outbound email template; Convex/SQLite ORDER BY parity across all 10 convex/*.ts files' list queries; existence-check-before-write on all client-submitted-id dashboard actions; `as const` on every success literal in the three actions.ts files; src/lib test-file coverage (only barrels/type-only files/documented db.ts glue are untested); pipeline-health + daily-digest wiring for every list*Due-style helper",
      "Verified: npm test (2006 passed, 153 files — unchanged from the PR #389 baseline, confirming no drift) + npm run lint (clean) + npm run build (tsc clean, all 31 routes generated, Node v22.22.2) + npm run dev sanity check: curled /, /dashboard/leads, /preview/demo-cafe, /docs/process, /docs/architecture (all 200) and POST /api/stripe/webhook without a valid signature (501, expected — no regression), then stopped the dev server and confirmed port 3000 was freed",
    ],
    decisions: BUSINESS_DECISIONS.filter(
      (d) => d.id === "post-billing-notice-entitlement-clean-audit-0718",
    ),
  },
  {
    date: "2026-07-18",
    branch: "claude/upbeat-dijkstra-ooowlb",
    summary:
      "Empty-backlog after the post-billing-notice-entitlement-clean-audit-0718 clean audit (claude/nice-euler-fuhf7h, tip of main). NEXT_STEPS stayed fully operator/legal-gated (stripe-price-objects, lead-ingestion, marketing-content-scheduling, commerce-payouts-stripe-connect). The only open PR (#202) is the same unrelated human-authored draft. Independently re-diffed the four remote branches sitting closest to main's tip (codex/dev-work-billing-notice-entitlement, codex/dev-work-post-dunning-audit-0718, codex/continuous-work-20260718-luna, codex/continuous-work-20260718-luna-fold) against current main rather than trusting the prior iteration's fold assessment — confirmed all four are fully superseded ancestors (their entitlement-selection and nested-invoice-subscription test diffs are already present verbatim on main), nothing to fold. Delegated a subagent-assisted audit scoped to AGENT_PROTOCOL's tier-1 empty-backlog priority (a shipped sold-capability helper missing from wiring/eligibility), instructed to read current source directly rather than ITERATIONS prose. It found a real gap: leadEligibleForStarterUpsell's 'no Growth/Complete/Commerce order yet' exclusion still reused orderEligibleForBillingPortal raw (tier/commerceAddon only) — refund-dispute-entitlement-gate (#375) made the Starter-order side of this exact same mutual-exclusion check (isStarterOnlyOrder) refund/dispute-aware but its own diff never touched this sibling line, so a lead with a live Starter order plus a separate refunded/disputed Growth/Complete/Commerce order was permanently locked out of the Starter→MRR upsell nudge even though that order grants zero live entitlement.",
    shipped: [
      "src/lib/billing/starter-upsell.ts (+ test) — new isLiveRecurringOrder predicate (orderEligibleForBillingPortal && !isOrderRefunded && !isOrderDisputed), used only for the 'already has recurring' exclusion in leadEligibleForStarterUpsell; deliberately not orderGrantsSoldCapabilityEntitlement, which also excludes a merely-canceled order and would incorrectly unblock the upsell for a former (not refunded) subscriber",
      "src/app/dashboard/leads/send-starter-upsell-action.test.ts — action-level regression: sendStarterUpsellAction now succeeds when the lead's existing Growth order was refunded",
      "NEXT_STEPS + BUSINESS_DECISIONS: starter-upsell-exclusion-refund-dispute-aware (id-based entries, added directly as done — audit-discovered gap, same precedent as refund-dispute-entitlement-gate)",
      "Tests: 2 new starter-upsell.test.ts cases (allows the upsell when the Growth/Complete/Commerce order was refunded/disputed, still rejects when it's live) + 1 new send-starter-upsell-action.test.ts case (action succeeds through a refunded Growth order)",
      "Verified: npm ci (node_modules not preinstalled this session) + npm test (2009 passed, 153 files = prior 2006 baseline + 3 new) + npm run lint (clean) + npm run build (tsc clean, all 31 routes generated, Node v22.22.2) + npm run dev sanity check: curled /, /dashboard/leads, /preview/demo-cafe, /docs/process (all 200), then stopped the dev server and confirmed port 3000 was freed",
    ],
    decisions: BUSINESS_DECISIONS.filter(
      (d) => d.id === "starter-upsell-exclusion-refund-dispute-aware",
    ),
  },
  {
    date: "2026-07-18",
    branch: "claude/nice-euler-fnq49q",
    summary:
      "Empty-backlog after starter-upsell-exclusion-refund-dispute-aware (claude/upbeat-dijkstra-ooowlb, tip of main). NEXT_STEPS stayed fully operator/legal-gated. The only open PR (#202) is the same unrelated human-authored draft. Independently re-checked the four 2026-07-18-dated remote branches (codex/continuous-work-20260718-luna, codex/continuous-work-20260718-luna-fold, codex/dev-work-empty-backlog-audit-0718, codex/dev-work-post-dunning-audit-0718) against current main via git merge-base --is-ancestor + diff --stat — none are ancestors, but every diff is pure deletions relative to main (their feature bodies are already present verbatim on main), confirming the prior two iterations' fold assessment still holds; nothing to fold. Delegated a subagent-assisted audit per AGENT_PROTOCOL's empty-backlog priority order, seeded with the hypothesis that the freshest shipped feature cluster (#386-389, the four subscription-notice PRs) was the highest-probability place for a wiring gap or regression given how many fast, similarly-shaped fixes had just landed there. It found a real regression, not a gap: PR #389 (billing-notice-entitlement-selection) uniformly swapped all four notice call sites from orderHadRecurringEntitlement to orderGrantsSoldCapabilityEntitlement to fix a refund/dispute recipient-selection hole — correct for the two resume-direction sites (read happens after clearOrdersRecurringCanceledByCustomer), but silently broken for the two pause-direction sites (subscription.updated pause_collection branch, invoice.payment_failed dunning), where the read happens immediately after markOrdersRecurringCanceledByCustomer sets recurringCanceledAt on that exact order — orderGrantsSoldCapabilityEntitlement requires that field unset, so it always rejected the order it had just paused and the two notices (sendSubscriptionPausedNotice, sendPaymentFailedNotice) never fired on main despite being merged, unit-tested, and marked done. route.test.ts's blanket `vi.mock(\"@/lib/db\")` hid this: the pause-notice fixtures never set recurringCanceledAt, a state that cannot occur at that point in the real flow.",
    shipped: [
      "src/lib/orders/recurring.ts (+ test) — new orderEligibleForPauseNotice predicate (orderHadRecurringEntitlement && !isOrderRefunded && !isOrderDisputed), the pause-notice twin of orderGrantsSoldCapabilityEntitlement that deliberately ignores recurringCanceledAt since it is expected to be freshly set at its call sites",
      "src/app/api/stripe/webhook/route.ts — swapped orderEligibleForPauseNotice into the two pause-direction recipient lookups only (customer.subscription.updated pause_collection branch, invoice.payment_failed dunning); the two resume-direction sites (subscription.updated grants branch, invoice.paid) keep orderGrantsSoldCapabilityEntitlement unchanged",
      "src/app/api/stripe/webhook/route.test.ts — fixed 5 fixtures across the pause_collection-notice and payment_failed-dunning-notice describe blocks to include a realistic recurringCanceledAt (matching what the preceding write actually produces), so this class of bug now fails before the fix and passes after — the mock previously agreed with itself regardless of correctness",
      "NEXT_STEPS + BUSINESS_DECISIONS: billing-notice-pause-recipient-write-before-read-fix (id-based entries, added directly as done)",
      "Tests: 4 new orderEligibleForPauseNotice unit tests (recurring.test.ts) + 5 existing route.test.ts fixtures corrected to realistic post-write state",
      "Verified: npm ci (fresh clone, node_modules not preinstalled) + npm test (2013 passed, 153 files = prior 2009 baseline + 4 new) + npm run lint (clean) + npm run build (tsc clean, all 31 routes generated) + npm run dev sanity check: curled /, /dashboard/leads, /preview/demo-cafe, /docs/process (all 200), then stopped the dev server and confirmed port 3000 was freed",
    ],
    decisions: BUSINESS_DECISIONS.filter(
      (d) => d.id === "billing-notice-pause-recipient-write-before-read-fix",
    ),
  },
  {
    date: "2026-07-18",
    branch: "claude/upbeat-dijkstra-q7wwna",
    summary:
      "Empty-backlog after PR #392 (billing-notice-pause-recipient-write-before-read-fix, tip of main). NEXT_STEPS stayed fully operator/legal-gated (stripe-price-objects, lead-ingestion, marketing-content-scheduling, commerce-payouts-stripe-connect). Fetched every remote branch — none pushed after main's tip, and the sole open PR (#202) is the same unrelated human-authored draft the last several iterations already found. Dispatched a subagent-assisted audit scoped to AGENT_PROTOCOL's empty-backlog priority order, seeded with the hypothesis that the dense five-iteration chain of billing-notice fixes (#386-#392) was the highest-probability place for a residual gap, instructed to read current source directly rather than trust ITERATIONS prose. It re-verified: all four webhook billing-notice recipient-selection sites now use the correct predicate for their read timing (the pause-direction fix in #392 held); getOrdersByStripeCustomerId's Convex/SQLite parity (index, ordering, API map registration); refund/dispute clawback wiring into pipeline-health + daily digest; every sold-capability helper is consumed somewhere (no orphans); and every non-trivial src/lib/src/app module has test coverage. No defect found on any axis, and no new remote branch existed to fold. Recording this as a dated clean audit rather than manufacturing an optional feature, per AGENT_PROTOCOL's explicit guidance that a documented clean audit is more useful to sibling agents than busywork.",
    shipped: [
      "No product code changes — this was a documented clean empty-backlog audit",
      "Sibling fold scan: git fetch origin + reviewed all remote branches and the one open PR (#202, unrelated human-authored draft); nothing to fold",
      "Audit coverage (no fix needed): webhook billing-notice recipient-selection predicate correctness at all four call sites post-#392; Convex/SQLite parity for getOrdersByStripeCustomerId; refund/dispute clawback pipeline-health + digest wiring; sold-capability helper wiring; orchestration test coverage",
      "NEXT_STEPS: post-pause-recipient-fix-clean-audit-0718 done",
      "Verified: npm ci + npx vitest run (2013 passed, 153 files — unchanged from the PR #392 baseline, confirming no drift) + npm run lint (clean) + npm run build (tsc clean, all 31 routes generated)",
    ],
    decisions: [],
  },
  {
    date: "2026-07-18",
    branch: "claude/nice-euler-2p6914",
    summary:
      "Empty-backlog after PR #393 (tip of main), same starting point as the prior iteration. Went wider than a single re-verify pass this time: fetched all 300+ remote branches across every sibling automation family (claude/codex/cursor/grok/opencode) and triaged every branch whose only commits ahead of main touched real files (not just the process log) — about 15 candidates. All were superseded: several converged independently on fixes already merged to main via a different commit (webhook email-send-failure retry, oldest-age refund/dispute gating on marketing/voice-pack helpers, rate-limit bucket bound, dunning notice, bundle-order dispute tracking); one (codex/dev-work-billing-notice-entitlement) would have actively reintroduced the #392 write-before-read regression had it been folded; one (claude/nice-euler-eojcaa) was speculative type-loosening for a state OrderRecord's type guarantees can't occur. Deliberately skipped claude/relaxed-archimedes-9r5fq6's Gemini→Antigravity CI workflow migration — it needs a new ANTIGRAVITY_OAUTH_TOKEN secret this environment doesn't have, so folding it blind isn't safe. PR #202 is still the same unrelated human-authored draft. With nothing to fold, ran a subagent audit deliberately scoped away from the exact axes the last two iterations already covered (it went one level deeper: full pipeline-health/digest/dashboard wiring for every oldestX/listX helper rather than just getOrdersByStripeCustomerId; six more Convex/SQLite function pairs; a broader security/injection sweep; and a fresh look at 'untested' module candidates). No defect found on any axis — recorded as a clean audit per AGENT_PROTOCOL rather than manufacturing optional work.",
    shipped: [
      "No product code changes — this was a documented clean empty-backlog audit",
      "Sibling fold scan: fetched all 300+ remote branches (chore/claude/codex/cursor/grok/opencode) and triaged ~15 candidates with real non-process-log diffs against main; all superseded or unsafe to fold blind (see NEXT_STEPS entry for the full per-branch breakdown)",
      "Audit coverage (no fix needed): oldestX/listX helper wiring into pipeline-health + daily-digest + dashboard panel; Convex/SQLite parity for 6 additional function pairs (commerceOrders list variants, orders recurring-entitlement mutations, inquiries list variants, checkoutSessions mark-complete variants, leads disposition/payment mutations); security/injection surface (rate-limit coverage, HTML-escaping, JSON-LD safety, redirect hardening, unsubscribe token, CSV caps, subject sanitization, no dynamic SQL); untested-module candidates (db.ts's server-only exclusion, dashboard/leads/actions.ts's per-action test coverage, zero-.test.tsx convention)",
      "NEXT_STEPS: post-393-sibling-fold-scan-and-audit-0718 done",
      "Verified: npm ci + npm test (2013 passed, 153 files — unchanged, confirming no drift) + npm run lint (clean) + npm run build (all 31 routes generated)",
    ],
    decisions: [],
  },
  {
    date: "2026-07-18",
    branch: "claude/upbeat-dijkstra-2icoid",
    summary:
      "Empty-backlog after PR #394 (tip of main), same starting point as the prior iteration. Fold scan: fetched all 350+ remote branches; checked the two branches the task brief specifically flagged as plausible unmerged fixes (codex/dev-work-rate-limit-bounds, codex/dev-work-rate-limit-cleanup — bound the in-memory rate-limit bucket Map) and confirmed both fully superseded, already on main verbatim via PR #378. Also re-checked codex/dev-work-webhook-email-retry (best-effort bundle/commerce-client-receipt email sends → required 5xx-on-failure) — main's route.ts already has this wired on both the inline and outer-catch paths, a superset of the branch, matching #394's independent finding for the same branch. Every remaining 0717/0718-dated branch was docs-only (claim/clean-audit entries). Nothing to fold. Steered explicitly away from every axis #393/#394 already covered (billing-notice predicates, Convex/SQLite ORDER BY parity, skipSuppression/href-escaping, existence-check-before-write, pipeline-health/digest wiring, db.ts's deliberate no-test policy) and instead investigated the fresh angles the task brief suggested: the rate-limit bucket memory bound (confirmed already fixed — MAX_RATE_LIMIT_BUCKETS=10_000 + eviction, with getRateLimiterBucketCountForTests coverage); N+1/scalability in pipeline-health + daily-digest (every builder loop iterates already-bulk-fetched arrays, no per-row awaited DB/Stripe call); CSRF surface on every state-changing route (dashboard mutations are Next.js Server Actions with same-origin enforcement on by default per this fork's own serverActions.md docs and an unmodified next.config.ts; the one cookie-authenticated path, requireOperatorAuth, uses sameSite:'lax', which browsers withhold from cross-site POST; every public route.ts POST is either unauthenticated-by-design + rate-limited or Stripe-signature-verified); SSRF (the only fetch() with a non-literal URL, tryProvisionVercelDomain, targets a fixed api.vercel.com host — only the URL-encoded path segment varies); and /docs/launch-checklist accuracy (spot-checked referenced action test files, env-readiness function names, and behavioral claims against current source — all match). No defect found on any axis.",
    shipped: [
      "No product code changes — this was a documented clean empty-backlog audit",
      "Sibling fold scan: fetched all 350+ remote branches; verified the two rate-limit-bound branches and the webhook-email-retry branch (all specifically re-checked per the task brief's suggested angles) are fully superseded by PR #378 and independently-convergent main code respectively; remaining 0717/0718-dated branches are docs-only",
      "Audit coverage (no fix needed): rate-limit bucket memory bound; N+1/per-row-await scan of pipeline-health + daily-digest builders; CSRF surface (Server Action same-origin default, sameSite:'lax' operator cookie, public route auth/signature/rate-limit posture); SSRF scan of every fetch() call site; /docs/launch-checklist accuracy spot-check",
      "NEXT_STEPS: post-394-scalability-security-audit-0718 done",
      "Verified: npm ci (fresh, node_modules not preinstalled) + npm test (2013 passed, 153 files — unchanged from the PR #394 baseline, confirming no drift) + npm run lint (clean) + npm run build (tsc clean, all routes generated) + npm run dev sanity check: curled /, /dashboard/leads, /preview/demo-cafe, /docs/process (all 200), then stopped the dev server and confirmed the port was freed",
    ],
    decisions: [],
  },
  {
    date: "2026-07-18",
    branch: "claude/nice-euler-ragsj2",
    summary:
      "Empty-backlog after PR #395 (tip of main). All four remaining NEXT_STEPS items are operator/legal-gated; the last several iterations already re-verified money/security/Convex-parity/orchestration-test axes clean (#392-#395). Checked a dimension none of those had touched — App Router file-convention resilience — and found a real, live gap: zero error.tsx / not-found.tsx / global-error.tsx anywhere in src/app, so a stale outreach link, a mistyped preview slug, or any uncaught render exception fell through to Next.js's generic unbranded UI with no path back to conversion, on a site that runs unattended. Read node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/{error,not-found}.md first per this fork's own AGENTS.md instruction (this Next.js 16.2 build introduced `unstable_retry` as the primary error-boundary recovery affordance, superseding `reset` as the documented default) before writing anything. Shipped a branded root not-found.tsx (Server Component — covers both notFound() throws and unmatched URLs, since the single root layout means no need for the experimental global-not-found flag) and error.tsx (Client Component using unstable_retry), both reusing the homepage's zinc/rounded-full visual language with links back to / and /checkout. Caught and fixed a JSX whitespace bug during dev-server verification: a ternary-adjacent text node (`{ternary} can help...`) silently lost its leading space in the rendered HTML — rewrote the paragraph as a single template-literal expression and re-verified the exact rendered text via curl + a tag-stripping parse, not just a visual build pass.",
    shipped: [
      "src/app/not-found.tsx — branded 404 (zinc/rounded-full style matching src/app/page.tsx), Back to homepage + View pricing CTAs",
      "src/app/error.tsx — branded client error boundary using the Next.js 16.2 unstable_retry API, Try again + Back to homepage CTAs, logs error.digest for server-log correlation",
      "NEXT_STEPS: branded-error-not-found-pages done",
      "BUSINESS_DECISIONS: branded-error-not-found-pages",
      "Verified: npm ci (fresh, node_modules not preinstalled) + npm test (2013 passed, 153 files — unchanged, confirming no drift) + npm run lint (clean) + npm run build (tsc clean, all 31 routes generated, /_not-found present in the route list) + npm run dev sanity check: curled an unknown /preview/[slug] (branded 404, correct status/CTAs) and a nonexistent path (branded 404, status 404), plus / and /dashboard/leads and /docs/process (all 200) unaffected, then stopped the dev server and confirmed port 3000 was freed",
    ],
    decisions: BUSINESS_DECISIONS.filter((d) => d.id === "branded-error-not-found-pages"),
  },
  {
    date: "2026-07-18",
    branch: "claude/upbeat-dijkstra-bpm73m",
    summary:
      "Empty-backlog after PR #396 (branded-error-not-found-pages, tip of main). All four remaining NEXT_STEPS items are operator/legal-gated (stripe-price-objects, lead-ingestion, marketing-content-scheduling, commerce-payouts-stripe-connect). Fold scan: fetched all remote branches; every branch pushed at/after main's tip is a superseded duplicate of already-merged work (re-implementations of the branded error/not-found pages, the subscription-notice pair, and the entitlement-selection fix, each under a different commit hash) — nothing to fold. Dispatched a subagent audit deliberately steered away from every axis the last ~20 iterations already re-confirmed clean, and it surfaced a real, live gap: src/app/sitemap.ts's STATIC_ROUTES hand-duplicated the /docs/* sub-page list from src/app/docs/page.tsx and was only ever updated once, at authoring time, when just 2 of the now-12 docs pages existed — 9 fully public, indexable docs pages (marketing-automation, legal, voice-agent-flow, architecture, compliance, launch-checklist, production-deploy, roadmap, process, cli-agents) were silently missing from sitemap.xml despite being linked, crawlable, and never noindexed.",
    shipped: [
      "src/lib/docs/routes.ts — new shared DOCS_PAGES array (title/href/description), the single source of truth for /docs/* sub-pages",
      "src/app/docs/page.tsx — now imports DOCS_PAGES instead of defining its own local docs list (no rendering change)",
      "src/app/sitemap.ts — STATIC_ROUTES now spreads DOCS_PAGES.map(page => page.href) instead of hand-copying 2 of 12 docs routes; a new /docs/* page can no longer ship indexable-but-unlisted",
      "src/app/sitemap.test.ts — new: asserts every DOCS_PAGES href appears in sitemap.xml (would have failed before the fix) plus the existing top-level static routes and every curated demo preview",
      "NEXT_STEPS + BUSINESS_DECISIONS: sitemap-docs-route-sync (id-based entries, added directly as done — audit-discovered fix, same precedent as prior single-iteration audit-discovered gaps)",
      "Verified: npm ci (fresh, node_modules not preinstalled) + npm test (2015 passed, 154 files = prior 2013 baseline + 2 new) + npm run lint (clean) + npm run build (tsc clean, all 31 routes generated) + npm run dev sanity check: curled /sitemap.xml and confirmed all 12 /docs/* <loc> entries render, plus /, /dashboard/leads, /preview/demo-cafe, /docs/process, /docs/compliance, /docs/legal, /docs/launch-checklist (all 200), then stopped the dev server and confirmed port 3000 was freed",
    ],
    decisions: BUSINESS_DECISIONS.filter((d) => d.id === "sitemap-docs-route-sync"),
  },
  {
    date: "2026-07-18",
    branch: "claude/nice-euler-3zie69",
    summary:
      "Empty-backlog after PR #397 (sitemap-docs-route-sync, tip of main). All four remaining NEXT_STEPS items are operator/legal-gated (stripe-price-objects, lead-ingestion, marketing-content-scheduling, commerce-payouts-stripe-connect). Fold scan: fetched all remotes — none pushed after main's tip (the most recent, claude/upbeat-dijkstra-bpm73m, is main's own tip commit), and the sole open PR (#202) is the same unrelated human-authored draft the last several iterations already found; nothing to fold, so skipped a wider historical re-scan per the run brief's explicit light-budget guidance. Re-verified from source (not ITERATIONS prose) that the dense billing-notice chain (#386-#392) still reads the correct predicate at each of its four Stripe webhook recipient-selection call sites (orderEligibleForPauseNotice on the two pause-direction sites, orderGrantsSoldCapabilityEntitlement on the two resume-direction sites) — clean, no regression. Also confirmed src/lib/docs/routes.ts (added in #397) lists all 12 directories under src/app/docs, matching in both directions. With those two freshest-touched axes clean, checked the one App Router file-convention #396 (branded-error-not-found-pages) left unaudited: whether error.tsx actually covers every render-failure surface. It does not — per this fork's own docs, error.tsx never wraps the layout.tsx above it, only global-error.tsx does, and #396's own decision text had incorrectly extrapolated not-found.tsx's single-root-layout reasoning onto error.tsx as well. src/app/layout.tsx renders SiteHeader/SiteFooter (which read src/lib/brand.ts) outside any error.tsx boundary on every request, so a root-layout throw fell through to Next's unbranded default UI.",
    shipped: [
      "src/app/global-error.tsx — new: Client Component root-layout error boundary (own <html>/<body>, imports ./globals.css directly, next/link — not a raw <a> — for the Back-to-homepage CTA to satisfy @next/next/no-html-link-for-pages), matching error.tsx/not-found.tsx's zinc/rounded-full visual language",
      "NEXT_STEPS + BUSINESS_DECISIONS: global-error-root-layout-boundary (id-based entries, added directly as done — audit-discovered gap in already-shipped code, same precedent as prior single-iteration audit-discovered gaps)",
      "Verified live, not just by reading docs or by build/lint/test passing: temporarily forced src/app/layout.tsx to throw behind a one-off env-gated flag, ran npm run dev, confirmed the RSC payload tagged the active boundary {\"type\":\"global-error\",\"pagePath\":\"global-error.tsx\"} with HTTP 500 and the branded markup rendering, then reverted layout.tsx to its exact original content (git diff clean) before re-running the full suite",
      "Verified: npm ci (fresh node_modules, not preinstalled this session) + npm test (2015 passed, 154 files — unchanged from the PR #397 baseline, confirming no drift) + npm run lint (clean) + npm run build (tsc clean, all 31 routes generated) + npm run dev sanity check: curled /, /dashboard/leads, /preview/demo-cafe, /docs/process, /docs/architecture (all 200) and an unknown path (still 404 via the existing branded not-found.tsx, confirming no interaction between the two sibling boundaries), then stopped the dev server and confirmed port 3000 was freed",
    ],
    decisions: BUSINESS_DECISIONS.filter((d) => d.id === "global-error-root-layout-boundary"),
  },
  {
    date: "2026-07-18",
    branch: "claude/upbeat-dijkstra-obken3",
    summary:
      "Empty-backlog after PR #398 (global-error-root-layout-boundary, tip of main). All four remaining NEXT_STEPS items are operator/legal-gated. Fold scan: fetched origin — the repo has grown to 350+ remote branches from six CLI agent families (claude/codex/cursor/gemini/grok/opencode); the sole open PR (#202) is still the same unrelated human-authored draft prior iterations found, so nothing to fold there. Rather than a wide re-scan of an already-350-branch haystack, ran `npm run build`/`npm test`/`npm run lint` (all green, as every prior iteration reports) and then went one level past that: `npx tsc --noEmit -p tsconfig.json` directly, which nothing in this repo's own build/test/lint pipeline actually runs on test files. That surfaced 25 real (if inert — all 2015 runtime tests still passed) type errors across 10 *.test.ts files, all pure drift: stale enum literals ('new' LeadPipelineStage, 'social_post' MarketingContentType) never updated after a rename, test fixtures with excess/mismatched properties against narrowed helper param types, a pre-Vitest-4 vi.fn generic signature, a missing Product.name field, a generic type lost through an untyped mock chain, and a shallow-Partial test helper override type. Root cause: this is a swarm of concurrent agents that each self-merge PRs per AGENT_PROTOCOL's 'open/merge a PR when the iteration is coherent' rule, but every .github/workflows/*.yml file here is a scheduled agent-run workflow, not a pull_request-triggered check — there has never been an automated gate catching this class of drift before it lands on main. Fixed all 25 at their actual source (stale fixture value or too-narrow helper type, never a production-type loosening or a blanket ts-expect-error) and added .github/workflows/pr-checks.yml so lint/typecheck/test/build now run on every PR and push to main, closing the structural gap rather than just the one-time drift.",
    shipped: [
      "src/lib/checkout/prefill-slug.test.ts, src/lib/leads/preview-page-lead.test.ts — stale stage: \"new\" → \"discovered\" (LeadPipelineStage no longer has a \"new\" member)",
      "src/lib/email/resend.test.ts — stale contentType: \"social_post\" → \"facebook_caption\" (MarketingContentType has no \"social_post\" member)",
      "src/lib/commerce/catalog.test.ts, src/lib/digest/daily-digest.test.ts, src/lib/metrics/pipeline-health.test.ts — commerceCatalogs item fixtures trimmed/adjusted to match the { stripePriceId?: string } shape the consuming helpers actually declare, instead of carrying unrelated id/priceCents fields that tripped TS's excess-property/weak-type checks",
      "src/lib/digest/daily-digest.test.ts — added an explicit paidOutAt: undefined to a CommerceOrderRecord literal so .filter(row => !row.paidOutAt) narrows correctly across the mixed array",
      "src/lib/orders/recurring.test.ts — the four orderEligibleForPauseNotice test calls now build a named `order` const (matching the function's own doc-commented 'recurringCanceledAt is present but ignored here' semantics) instead of an inline literal, so the excess-property check no longer fires on a field the function's type intentionally omits",
      "src/lib/billing/create-portal-session.test.ts — vi.fn<[string], Promise<OrderRecord[]>>() → vi.fn<(slug: string) => Promise<OrderRecord[]>>() (Vitest 4 generic signature); fakeStripe()'s override parameter type changed from a shallow Partial<StripeBillingPortalClient> to a type with checkout.sessions deep-partial, matching what the helper's own merge logic already did at runtime, so overriding only `retrieve` no longer requires also supplying `listLineItems`",
      "src/lib/pricing/bootstrap-stripe-prices.test.ts — added the required name field to a filler Product.create() fixture",
      "src/lib/stripe/list-all-pages.test.ts — listAllPages<Item>(...) explicit type argument so the until callback's `item` parameter keeps its `key` field instead of collapsing to `{ id: string }` through an untyped vi.fn() mock chain",
      "src/app/dashboard/login/actions.test.ts — a zero-arg mock's (...args) => sessionMaxAgeSeconds(...args) spread (invalid for a 0-param target under Vitest 4's stricter Mock typing) simplified to a direct 0-arg call",
      ".github/workflows/pr-checks.yml — new: npm ci + lint + `npx tsc --noEmit` + test + build, triggered on pull_request and push to main — the first PR-blocking check in this repo; every other workflow here is a scheduled agent run",
      "NEXT_STEPS + BUSINESS_DECISIONS: test-typecheck-drift-plus-pr-ci-gate (id-based entries, added directly as done — audit-discovered gap, same precedent as prior single-iteration audit-discovered fixes)",
      "Verified: npm ci (fresh, node_modules not preinstalled) + npx tsc --noEmit -p tsconfig.json (0 errors, was 25) + npm test (2015 passed, 154 files — unchanged, confirming zero runtime behavior change from the type-only fixes) + npm run lint (clean) + npm run build (tsc clean, all 31 routes generated)",
    ],
    decisions: BUSINESS_DECISIONS.filter((d) => d.id === "test-typecheck-drift-plus-pr-ci-gate"),
  },
  {
    date: "2026-07-18",
    branch: "claude/nice-euler-megcqq",
    summary:
      "Empty-backlog after PR #399 (test-typecheck-drift-plus-pr-ci-gate, tip of main). All four remaining NEXT_STEPS items are still operator/legal-gated. Fold scan: fetched all 350+ remote branches and checked ancestry against main; every branch pushed at or after main's tip that looked promising by commit message turned out, on a direct `git diff <main-equivalent-commit> <branch-commit>`, to be byte-identical to work already merged under a different hash (squash-merge on PR merge rewrites the commit hash even when content is unchanged) — including the one branch that looked like a genuine unmerged fold candidate (codex/continuous-work-20260718-luna-fold, which had a complete ITERATIONS/BUSINESS_DECISIONS write-up and an explicit 'gh pr create is blocked by Actions token policy' handoff note): its sole code change (nested Stripe parent.subscription_details.subscription test coverage) was already present verbatim in main, added by a sibling that landed first. No fold candidate existed. Rotated to an axis none of the last ~20 iterations had touched: social-share metadata. /preview/[slug] (the only metadata-exporting page besides the root layout) already sets openGraph/twitter/canonical, but src/app/layout.tsx — which backs the homepage and every page without its own generateMetadata (/checkout, /docs/*, /privacy, /terms, /dashboard/*) — had title/description only. Sharing the homepage or checkout link on Slack/iMessage/X/LinkedIn unfurled as a bare link with no title, description, or preview — a real, live gap directly touching organic acquisition, since this product sells directly off the homepage to non-outreach 'organic-*' checkout buyers, not only via CRM-tracked cold leads.",
    shipped: [
      "src/lib/seo.ts — new homepageMetadata() export: title/description (unchanged copy) + openGraph + twitter (summary card) + alternates.canonical, built from brand.ts + siteUrl(); extracted out of layout.tsx so it's unit-testable (layout.tsx imports globals.css and has no React test harness in this repo)",
      "src/app/layout.tsx — `export const metadata: Metadata = homepageMetadata();` replaces the inline title/description-only object; no import of brand.ts needed there anymore",
      "src/lib/seo.test.ts — 3 new homepageMetadata() cases: canonical/openGraph/twitter use the configured NEXT_PUBLIC_APP_URL, fall back to the localhost siteUrl() default, and pick up NEXT_PUBLIC_BRAND_NAME in title/description/openGraph.siteName",
      "NEXT_STEPS + BUSINESS_DECISIONS: homepage-social-share-metadata (id-based entries, added directly as done — audit-discovered gap, same precedent as prior single-iteration audit-discovered fixes)",
      "Verified: npm ci (fresh, node_modules not preinstalled) + npm test (2018 passed, 154 files = prior 2015 baseline + 3 new) + npm run lint (clean) + npx tsc --noEmit -p tsconfig.json (0 errors) + npm run build (tsc clean, all 31 routes generated) + npm run dev sanity check: curled / and confirmed og:title/og:description/og:url/og:site_name/og:type + twitter:card/twitter:title/twitter:description + <link rel=\"canonical\"> all render with brand-derived values; confirmed /checkout (no metadata override of its own) inherits the same openGraph tags; confirmed /, /dashboard/leads, /preview/demo-cafe, /docs/process, /checkout all still 200, then stopped the dev server and confirmed port 3000 was freed",
    ],
    decisions: BUSINESS_DECISIONS.filter((d) => d.id === "homepage-social-share-metadata"),
  },
  {
    date: "2026-07-18",
    branch: "claude/upbeat-dijkstra-xyl3dp",
    summary:
      "Empty-backlog after PR #401 (github-actions-runner-unavailable operator note, tip of main). All five remaining NEXT_STEPS items are operator/legal/infra-gated. Fold scan: fetched all 356 remote branches, filtered to the 21 whose diff against their merge-base with main touches anything besides prompt_process.tsx, and confirmed every one of those 21 (including the two rate-limit-bound branches, webhook-email-retry, billing-notice-entitlement, and the large claude/nice-euler-0x1k8a branch) is already referenced in this log as superseded or merged under a different commit hash — nothing to fold. Dispatched a subagent audit deliberately scoped to a parity axis distinct from the ORDER BY parity ~20 prior iterations exhaustively re-confirmed: for every Convex mutation keyed on an app-owned id, does its SQLite twin in db.ts behave the same way on a missing row (both throw, or both silently no-op)? Found a real, if not-currently-reachable, divergence: updateLeadStage and recordLeadOutreach's SQLite fallbacks were bare UPDATE statements with no existence check, silently no-op'ing on an unknown slug while their convex/leads.ts twins throw — the same bug class every sibling lead-mutation helper in db.ts (updateLeadNotes, updateLeadSnooze, applyColdLeadDisposition) had already been hardened against. A secondary, lower-priority finding (marketing-automation docs page stale against monthly-pack.ts's actual content-type list, plus a nonexistent 'Generate-only' pricing tier referenced there) was deliberately left unfixed for a future iteration rather than combined with this parity fix, per AGENT_PROTOCOL's one-focused-iteration-per-run rule and its priority order ranking a parity/idempotency gap above docs clarity.",
    shipped: [
      "src/lib/db.ts — updateLeadStage and recordLeadOutreach's SQLite fallbacks now throw `Lead with slug ${slug} not found` on an unknown slug, matching their convex/leads.ts twins",
      "src/lib/db/lead-write-not-found-parity.ts (+ test) — new structural Vitest guard (source-text extraction, following convex-api-map-audit.ts's precedent since db.ts is \"server-only\" and cannot be imported directly): asserts updateLeadStage/recordLeadOutreach now throw, and contrasts against recordLeadPreviewOpen, whose convex twin deliberately stays a silent no-op",
      "NEXT_STEPS + BUSINESS_DECISIONS: db-convex-sqlite-not-found-parity (id-based entries, added directly as done — audit-discovered gap, same precedent as prior single-iteration audit-discovered fixes)",
      "Flagged (not fixed this iteration): /docs/marketing-automation's content-type table and pricing-tier claims are stale against src/lib/marketing/monthly-pack.ts and src/lib/pricing/bundles.ts — left for a future docs-clarity pass",
      "Verified: npm test (2026 passed, 155 files = prior 2018 baseline + 8 new) + npm run lint (clean) + npx tsc --noEmit (0 errors) + npm run build (tsc clean, all 31 routes generated) + npm run dev sanity check: curled /, /dashboard/leads, /preview/demo-cafe, /docs/process, /docs/architecture (all 200), then stopped the dev server and confirmed port 3000 was freed",
    ],
    decisions: BUSINESS_DECISIONS.filter((d) => d.id === "db-convex-sqlite-not-found-parity"),
  },
  {
    date: "2026-07-18",
    branch: "claude/nice-euler-wrym4s",
    summary:
      "Empty-backlog after PR #402 (tip of main, db-convex-sqlite-not-found-parity). All five remaining NEXT_STEPS items stayed operator/legal/infra-gated. Fold scan: fetched all 357 remote branches and confirmed none carries a commit newer than main's HEAD (afa7f9a, 2026-07-18T10:23:07+02:00) that is also ahead of main — no stuck sibling work exists to fold. The repo's one open PR (#202) is an unrelated stale draft from 2026-07-14 (agent-run dashboard, not a NEXT_STEPS item). With no fold candidate and the higher-priority empty-backlog axes (sold-capability wiring, Convex/SQLite parity, security/injection, untested orchestration) having each been exhaustively re-audited across dozens of prior iterations with nothing new surfacing, took the already-identified, ready-to-fix docs-clarity item the immediately prior iteration flagged but deliberately deferred: /docs/marketing-automation's Content types table and Automation levels list were stale against src/lib/marketing/monthly-pack.ts and src/lib/pricing/bundles.ts.",
    shipped: [
      "src/app/docs/marketing-automation/page.tsx — Content types table now lists the exact MONTHLY_MARKETING_PACK_TYPES breakdown (2 GBP posts, 3 Facebook captions, 3 Instagram captions, 1 email campaign, 1 review-request email) instead of an undercounted generic 'Social captions 4/mo' row and a 'Seasonal promos' row that isn't part of the generated pack at all; added a note that local_seo_meta/seasonal_promo/ad_copy are ad-hoc-only types (POST /api/marketing/generate) with no dashboard fulfillment action. Automation levels no longer invents a nonexistent 'Generate-only $49 one-time copy pack' tier or implies Growth/Complete already auto-schedule/optimize — states plainly both tiers generate the identical pack and Buffer/GBP/Meta auto-posting stays optional and OAuth-gated for both, cross-linking /docs/product-bundles for the real sold tiers.",
      "NEXT_STEPS + BUSINESS_DECISIONS: marketing-automation-docs-content-type-sync (id-based entries, added directly as done — audit-discovered docs gap, same precedent as prior single-iteration audit-discovered fixes)",
      "Verified: npm ci (fresh, node_modules not preinstalled) + npm test (2026 passed, 155 files — no new test files, a docs-only content fix) + npm run lint (clean) + npx tsc --noEmit -p tsconfig.json (0 errors) + npm run build (tsc clean, all 31 routes generated) + npm run dev sanity check: curled /docs/marketing-automation and confirmed the rewritten GBP post / Facebook caption / Instagram caption rows and corrected Automation levels prose render; confirmed /docs and / (homepage) still 200, then stopped the dev server and confirmed port 3000 was freed",
    ],
    decisions: BUSINESS_DECISIONS.filter((d) => d.id === "marketing-automation-docs-content-type-sync"),
  },
  {
    date: "2026-07-18",
    branch: "claude/upbeat-dijkstra-veu460",
    summary:
      "Empty-backlog after PR #403 (tip of main, marketing-automation-docs-content-type-sync). All remaining NEXT_STEPS items stayed operator/legal/infra-gated, including github-actions-runner-unavailable, which was re-verified still failing (run 29637925074 against main's tip e91d3ec, 2026-07-18T08:43Z, completed with no runner ever assigned). Fold scan: checked all 340 remote refs carrying commits ahead of main's merge-base and confirmed every one at 6+ occurrences in this file's owner/branch fields is a squash-merge artifact already reflected in prior ITERATIONS entries — no stuck sibling work exists to fold, and the repo's one open PR (#202) is the same unrelated stale draft prior iterations already ruled out. With no fold candidate, dispatched a research-only audit subagent scoped to find one real, non-duplicate sold-capability/parity/security/docs gap rather than re-running yet another pass over the axes already exhaustively covered (money/ledger separation, webhook idempotency, HTML-escaping, redirect validation, dashboard existence-checks, field-size caps). It found a root-cause CI defect: .nvmrc pinned Node 20, which cannot load src/lib/db.ts's node:sqlite import (requires Node >=22.5) — a fact at least 8 prior iterations independently hit and manually worked around by re-running build/test under a locally-available Node 22, without ever fixing the pin driving the recurring friction.",
    shipped: [
      ".nvmrc (20 → 22) + package.json engines.node (>=20.9.0 → >=22.5.0) + package-lock.json's root engines block (regenerated via `npm install`, no dependency version changes) — pr-checks.yml, claude-scheduled.yml, and codex-scheduled.yml all resolve Setup Node from node-version-file: .nvmrc, so this was latent-but-guaranteed to 100%-red-fail every future PR on `Cannot find module 'node:sqlite'` the moment the operator resolves the still-failing runner-provisioning issue. No other workflow file runs actions/setup-node.",
      "NEXT_STEPS + BUSINESS_DECISIONS: ci-nvmrc-node22-sqlite-fix (id-based entries, added directly as done — audit-discovered root-cause infra gap, same precedent as prior single-iteration audit-discovered fixes)",
      "Verified: npm ci (fresh, node_modules not preinstalled) + npm test (2026 passed, 155 files, unchanged — a build-config-only fix) + npm run lint (clean) + npx tsc --noEmit -p tsconfig.json (0 errors) + npm run build (tsc clean, all 31 routes generated, expected SQLite-experimental warning still present under Node v22.22.2) + npm run dev sanity check: curled /, /dashboard/leads, /preview/demo-cafe, /docs/process (all 200), then stopped the dev server and confirmed port 3000 was freed",
    ],
    decisions: BUSINESS_DECISIONS.filter((d) => d.id === "ci-nvmrc-node22-sqlite-fix"),
  },
  ];
