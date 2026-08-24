/**
 * Archived NextStep entries — see src/lib/process/prompt_process.tsx for
 * why this exists (process-log-archive-scalability-split in
 * BUSINESS_DECISIONS) and for the live, editable tail. Part 5, oldest-first
 * (chronological order preserved across all archive files + the live tail).
 *
 * Append-only, like the live arrays it was split from — never edit an entry
 * here, and never append new entries directly to an archive file. New
 * entries always go in the live array in prompt_process.tsx (or
 * business-decisions.ts for BUSINESS_DECISIONS); a future maintenance pass
 * moves the oldest live entries into a new archive file (or a new numbered
 * file in this directory) once the live file grows large again.
 */
import type { NextStep } from "../types";

export const NEXT_STEPS_DONE_ARCHIVE_05: NextStep[] = [
  {
    id: "anthropic-generator-fetch-timeout",
    summary:
      "Empty-backlog audit (fresh angle: LLM prompt cost controls, one of seven angles a research agent was steered at after HTTP security headers, cookie flags, CSRF, SQLite index coverage, webhook signature verification, and env-var validation all came back clean). AnthropicMarketingGenerator and AnthropicClientVoiceGenerator (src/lib/marketing/generators.ts, src/lib/voice/generators.ts) already cap max_tokens and soft-cap the business context sent to Anthropic, but neither fetch() call passed an AbortSignal — a repo-wide grep confirmed zero application-layer request timeouts exist anywhere in src/lib. A hung/stalled Anthropic connection would tie up the request for the hosting platform's own function-duration ceiling instead of failing fast into the existing stub fallback both classes' try/catch already uses for every other failure mode. Shipped: signal: AbortSignal.timeout(30_000) on both fetch calls, composing with the existing catch-and-fall-back-to-stub path with no new error handling needed. See anthropic-generator-fetch-timeout in BUSINESS_DECISIONS for full detail.",
    status: "done",
    phase: "Phase 1 — Website foundation",
    owner: "claude/nice-euler-8xf8hp",
  },
  {
    id: "due-queue-panel-resolve-button-focus-restore",
    summary:
      "Empty-backlog audit closed a gap explicitly named-but-deferred by suppressed-emails-panel-aria-live-focus-restore: none of the 17 due-queue panels' own row-level resolve/action buttons (Mark paid out, Re-engage, Close, Send Email N, Mark live, Create deploy handoff, Mark read, Archive, Sync to Stripe, Generate pack, Send recovery, Resend receipt, Snooze) restored keyboard/screen-reader focus after their own click unmounted the row (or, in several cases, just the conditionally-rendered button itself) — focus silently dropped to <body> on every one of them. Shipped: all 17 panel headings got a stable id + tabIndex={-1} + focus:outline-none (mirroring suppressed-emails-panel.tsx's own precedent), and the 14 handlers that actually remove a row/button on success now refocus the owning panel heading via document.getElementById(headingId)?.focus() — 7 of which are shared with an always-mounted main-table control and took an optional headingId param so that unrelated call site's behavior is unchanged. Four panels' headings got id/tabIndex only, no handler wiring, after confirming they have no row-removing action of their own (Commerce catalogs missing/unsynced's editor-opening buttons already restore focus via the existing dashboard-focus-restore.ts toggle pattern once saved; Starter → MRR upsell and MRR paused/canceled only send an email or open an external Stripe window; Bundle order refunds & disputes is genuinely read-only).",
    status: "done",
    phase: "Phase 1 — Website foundation",
    owner: "claude/nice-euler-wlofuf",
  },
  {
    id: "commerce-request-order-contact-form-focus-restore",
    summary:
      "Empty-backlog audit found the public storefront's Commerce 'Request order' link (src/components/preview/commerce-catalog.tsx, shown for any SKU not yet synced to Stripe) stored a prefilled message and hash-jumped to #contact with no programmatic focus management — the contact form (src/components/preview/contact-form.tsx) updated its message textarea's value but never moved DOM focus there, leaving a keyboard-only or screen-reader shopper with a silent scroll and no indication their message was pre-filled. A first fix attempt (ref + focus() call) looked correct by code review but failed a real Playwright check: the native #contact hash-navigation resets focus to <body> *after* the click handler runs (the target section has no tabindex), silently discarding the JS focus() call. Fixed by having the link's onClick preventDefault() (only for unmodified primary clicks — ctrl/cmd/shift/alt/middle-click still open a new tab natively) before the existing sessionStorage/CustomEvent logic, so the native refocus never fires; a ref-based .focus() on the message textarea then reliably lands focus there both for the same-page click and the cross-navigation (sessionStorage) mount case. Verified end-to-end with Playwright against a locally seeded lead (paid stage + commerceAddon order) — click, cross-navigation reload, and ctrl+click-opens-new-tab all confirmed in a real browser, since this repo has no component test harness to catch a pure client-side focus bug otherwise.",
    status: "done",
    phase: "Phase 1 — Website foundation",
    owner: "claude/upbeat-dijkstra-devka5",
  },
  {
    id: "revenue-total-usd-renewal-gap",
    summary:
      "Empty-backlog audit (money/ledger-correctness angle) found PipelineHealth.revenueTotalUsd summed orders.amountPaid — the first billing period only. Every Growth/Complete/Commerce-addon bundle order is a Stripe subscription Checkout Session, and the existing invoice.paid handler only ever restored/synced recurring entitlement, never recorded a renewal's amount anywhere. The operator's headline 'Recorded revenue' card silently stopped growing for any subscriber past their first cycle, understating real Stripe-collected revenue more with every billing period a subscriber stayed active. Shipped orders.lifetimeRevenueUsd + lastRenewalInvoiceId (both backends), a new invoiceIsSubscriptionRenewalCharge gate (billing_reason === \"subscription_cycle\", excluding the first invoice already counted at order creation), and recordSubscriptionRenewalPayment wired into invoice.paid unconditionally (not gated on the existing notify path's cleared > 0, since an ordinary healthy renewal is the common case this needed to fix). pipeline-health.ts now sums orderLifetimeRevenueUsd(order) instead of amountPaid directly. Also fixed a related landmine: three Convex mutations that replace() the whole orders document (clearRecurringCanceledByCustomer/clearRefunded/clearDisputed) needed the two new fields added to their conditional-spread field lists, or a resubscribe/refund-reversal/dispute-win would have silently wiped previously-recorded renewal revenue. Deliberately left as a follow-up, not folded into this fix: a refund/dispute on a renewal charge itself has no correlation path back to the order at all (renewal invoices' PaymentIntents are never attached to a Checkout Session, so the existing stripe.checkout.sessions.list({ payment_intent }) correlation used by charge.refunded/charge.dispute.created cannot find them). See revenue-total-usd-renewal-gap in BUSINESS_DECISIONS for full detail.",
    status: "done",
    phase: "Phase 8 — Commerce",
    owner: "claude/upbeat-dijkstra-5zsawh",
  },
  {
    id: "duplicate-sku-id-guard",
    summary:
      "Fresh-angle empty-backlog audit (research agent steered at the two 'half shipped, dormant' features — Stripe Connect Express onboarding, Buffer marketing scheduling — plus dual-backend parity and untested orchestration; all came back clean) found src/lib/commerce/catalog.ts's normalizeCommerceItems validated SKU name/price/description/id-length but never rejected a client-submitted id that duplicates an earlier row in the same catalog-save submission. saveCommerceCatalogAction is a Server Action reachable with an arbitrary items array by anything holding the operator's session, not only the dashboard form (which never itself produces a duplicate). Two SKUs sharing an id both key off the same commerceSkuStripeKey in stripe-sync.ts, syncing to one mislabeled shared Stripe Product with distinct Prices, and preserveCommerceStripeIds's id-keyed Map silently drops one duplicate's Stripe id association on the next save — a real bookkeeping-corruption bug, not a customer overcharge (Buy now still charges each row's own resolved Price). Shipped: normalizeCommerceItems now hard-rejects a same-submission duplicate id with the same `SKU {i+1} ...` actionable-error shape every other per-row check in this function already uses; server-minted ids (blank/missing branch) are deliberately excluded from the check since they're never client-controlled and practically collision-free. See duplicate-sku-id-guard in BUSINESS_DECISIONS.",
    status: "done",
    phase: "Phase 8 — Commerce",
    owner: "claude/nice-euler-lfte60",
  },
  {
    id: "account-updated-connect-status-refresh",
    summary:
      "Empty-backlog audit (tier 1/2 — sold-capability wiring gap on the dormant Stripe Connect Express scaffold) found fetchConnectAccountStatus/checkStripeConnectAccountStatusAction was the ONLY code path that ever refreshed a lead's stripeConnectChargesEnabled/PayoutsEnabled/DetailsSubmitted cache — purely an operator manual-click, no webhook listener, no cron. Once an operator stopped re-checking a lead, the 'Stripe Connect onboarding incomplete' due-queue signal (already wired into pipeline-health/digest) could never self-correct even after the client finished onboarding on Stripe's hosted flow. Shipped: a new findLeadSlugByStripeConnectAccountId pure helper (src/lib/commerce/stripe-connect.ts) plus an `account.updated` webhook handler (src/app/api/stripe/webhook/route.ts) that resolves the matching lead via getLeads() and persists the fresh status through the existing updateLeadStripeConnectStatus call (same fail-closed-on-Convex, swallow-and-continue policy the manual check already uses — a display-cache refresh, never a required/5xx-worthy write). Registered the event in STRIPE_WEBHOOK_HANDLED_EVENT_TYPES (src/lib/stripe/webhook-event-types.ts) with a caveat in /docs/launch-checklist + /docs/architecture: this one event also needs the operator to check 'Listen to events on connected accounts' in the Stripe Dashboard, unlike every other type in that list. Still no money movement — commerce-payouts-stripe-connect stays status: \"todo\".",
    status: "done",
    phase: "Phase 8 — Commerce",
    owner: "claude/nice-euler-r5775w",
  },
  {
    id: "bundle-order-missing-buyer-email-visibility",
    summary:
      "Empty-backlog audit (tier 1 — sold-capability wiring gap) found the bundle (Starter/Growth/Complete/Commerce-addon) buyer receipt + DNS/go-live handoff emails — already redelivery-safe via src/lib/payments/bundle-side-effect-recovery.ts's sent-marker notes since the very first archived iteration — had zero operator-facing visibility anywhere: no listBundleOrdersMissingBuyerEmail-style helper, no pipeline-health/digest signal, no dashboard panel. Same visibility-gap class already closed for Commerce Buy now via commerce-buy-now-client-receipt-visibility, never applied to the bundle ledger. Once Stripe's redelivery window is exhausted against a persistently-bad customerEmail or a sustained Resend outage, the buyer never gets notified and the operator has zero signal. Shipped: isBundleHandoffMissingBuyerEmail pure predicate, wired into pipeline-health.ts (count + staleness age, from the existing required handoffs input) and daily-digest.ts (a capped section naming which email — receipt and/or DNS — is still missing per row, from the existing optional handoffs input), plus a read-only due-queue panel on /dashboard/leads. Visibility only, matching the two-PR precedent commerce-buy-now-client-receipt-visibility itself set — a manual resend action needs the DNS-handoff email body extracted out of the webhook route into a reusable helper first, left as a scoped follow-up. See bundle-order-missing-buyer-email-visibility in BUSINESS_DECISIONS.",
    status: "done",
    phase: "Phase 3 — Payments",
    owner: "claude/upbeat-dijkstra-xl4gog",
  },
  {
    id: "suppression-reason-upgrade-not-just-downgrade-guard",
    summary:
      "Empty-backlog audit (research agent steered at the newest ~10 ITERATIONS entries' own shipped features, on the theory that a session focused on shipping something new is the least likely to have re-audited it) found convex/suppressions.ts's `suppress` mutation and db.ts's SQLite fallback treated ANY existing row as a full no-op, not just a downgrade-from-bounce/complaint-to-unsubscribe (the intentional protection suppression-reason-visibility shipped) — so a routine unsubscribe followed later by a real hard bounce or spam complaint for that same address never got its reason upgraded, silently discarding the exact sender-reputation signal PR #768/#769 shipped to surface (pipeline-health MetricCard + daily-digest footnote undercounts it) and leaving the SuppressedEmailsPanel row mislabeled 'Unsubscribed' with copy telling the operator it's safe to remove, when it in fact carries a bounce/complaint the same panel's copy says should almost never be removed. Shipped preferSuppressionReason (src/lib/email/suppression.ts, rank-based unsubscribe<bounce<complaint, mirroring preferAdvancedHandoffStatus's never-downgrade pattern) wired into both the Convex mutation (patch on upgrade) and the SQLite fallback (SELECT-then-UPDATE in place of INSERT OR IGNORE). Deliberately left out of scope: createdAt stays untouched on an upgrade, so the 7-day rolling bounce/complaint recency window won't surface an old-unsubscribe-then-new-bounce address as 'recent' — fixing that needs a second mutable timestamp field (Convex's _creationTime can't be patched) and was judged secondary to the more severe reason-loss/mislabeling defect this iteration closes. See suppression-reason-upgrade-not-just-downgrade-guard in BUSINESS_DECISIONS.",
    status: "done",
    phase: "Phase 2 — Outreach + platform voice",
    owner: "claude/upbeat-dijkstra-tm7xns",
  },
  {
    id: "db-ts-stripe-connect-scaffold-sqlite-fallback-test-coverage",
    summary:
      "Continuation of the db.ts SQLite-fallback test-coverage series. updateLeadStripeConnectAccountId and updateLeadStripeConnectStatus (the dormant Stripe Connect Express onboarding scaffold's two requireConvex fail-closed writes) had zero runtime coverage of their db.ts orchestration — every consumer test mocked @/lib/db away entirely. Each has a covered Convex mutation counterpart (convex/leads.test.ts) but a hand-written SQLite-fallback branch nothing exercised; getLeads/getLeadBySlug read Convex-first and connectOnboardingIncompleteCount (pipeline-health/digest) reads this same cache cross-instance, so a broken fallback or a regressed set-once accountCreatedAt COALESCE would silently misstate the onboarding-incomplete due-queue on a SQLite-only deployment. Shipped 9 new Vitest cases in src/lib/db.test.ts covering both functions' Convex-success early-return, requireConvex fail-closed throw, SQLite-fallback write + not-found guard, and the account-id function's set-once COALESCE semantics — verified the test actually catches a regression by temporarily removing the early return and confirming the targeted test failed before restoring. See db-ts-stripe-connect-scaffold-sqlite-fallback-test-coverage in BUSINESS_DECISIONS for full detail.",
    status: "done",
    phase: "Phase 8 — Commerce",
    owner: "claude/nice-euler-1f16x0",
  },
  {
    id: "db-ts-cold-lead-disposition-sqlite-fallback-test-coverage",
    summary:
      "Continuation of the db.ts SQLite-fallback test-coverage series. applyColdLeadDisposition (backing disposeColdLeadAction's Re-engage/Close dashboard buttons) shares updateLeadStage's exact duplicated-logic risk: its SQLite fallback re-implements a paid/live stage-revert guard that the Convex mutation already has direct test coverage for, but the SQLite twin's copy had never been exercised. Shipped 7 new Vitest cases in src/lib/db.test.ts covering Convex-success early-return, trusting Convex's returned boolean directly, requireConvex fail-closed throw, SQLite-fallback write + not-found guard, and the SQLite fallback correctly rejecting a stage revert for both a paid and a live lead — verified the tests actually catch a regression by temporarily dropping the early return and confirming 2 of 7 cases failed before restoring. See db-ts-cold-lead-disposition-sqlite-fallback-test-coverage in BUSINESS_DECISIONS for full detail.",
    status: "done",
    phase: "Phase 2 — Outreach + platform voice",
    owner: "claude/nice-euler-0rps7w",
  },
];
