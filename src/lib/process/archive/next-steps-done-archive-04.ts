/**
 * Archived NextStep entries — see src/lib/process/prompt_process.tsx for
 * why this exists (process-log-archive-scalability-split in
 * BUSINESS_DECISIONS) and for the live, editable tail. Part 4, oldest-first
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

export const NEXT_STEPS_DONE_ARCHIVE_04: NextStep[] = [
  {
    id: "lead-preview-opening-hours-jsonld",
    summary:
      "Growth/SEO gap found by a research agent explicitly told to independently re-verify prior clean claims before proposing anything new, after four consecutive zero-product-diff iterations. leadLocalBusinessJsonLd never emitted schema.org openingHoursSpecification even though Lead.hours (weekday/weekend free text) is already public via softCapLeadForPublicSurface and already rendered on the page — a core, Google-surfaced LocalBusiness property directly relevant to Starter's sold 'Basic SEO' deliverable, with zero prior reference anywhere in the repo. Shipped a strict, match-or-omit parser (src/lib/leads/hours-schema.ts, leadOpeningHoursSpecification) rather than a fuzzy one: real hours data spans prose like 'by appointment'/'emergency on-call' that has no parseable time range, and publishing a wrong open/close time into a real customer's Google Knowledge Panel is worse than publishing none — unparseable segments are silently dropped, never guessed. Wired into leadLocalBusinessJsonLd via the same optional-spread pattern hasOfferCatalog already uses. See lead-preview-opening-hours-jsonld in BUSINESS_DECISIONS for full detail.",
    status: "done",
    phase: "Phase 1 — Website foundation",
    owner: "claude/nice-euler-q33g6d",
  },
  {
    id: "dashboard-inline-editor-close-focus-restore",
    summary:
      "Empty-backlog audit (tier 6/8 — accessibility, the one candidate left open by the prior iteration's AGENT_PROTOCOL note after the LLM prompt-injection and Stripe Connect onboarding-link candidates both closed). A research agent's deep landmark/keyboard/focus-management pass found landmarks and keyboard operability already correct across the dashboard, but a real, high-leverage focus-loss bug: the operator notes editor, Commerce catalog editor, and inquiry reply composer are each an inline row panel toggled open by a persistent button, but their own Save/Cancel/Close controls live inside the panel — clicking any of them unmounts the focused element and silently drops keyboard/screen-reader focus to <body>, with the next Tab restarting from the top of the page. This is the single most-repeated interaction shape in the dashboard's busiest file. Added src/lib/leads/dashboard-focus-restore.ts (pure toggle-button element-id builders, unit-tested, mirroring the dashboard-row-aria-labels.ts precedent) and wired closeNotesEditor/closeCommerceEditor/a new closeReplyComposer to refocus the still-mounted toggle button after clearing state, at all six close-triggering call sites. See dashboard-inline-editor-close-focus-restore in BUSINESS_DECISIONS for full detail.",
    status: "done",
    phase: "Phase 1 — Website foundation",
    owner: "claude/nice-euler-5nlmxr",
  },
  {
    id: "due-queue-panel-aria-live-removals",
    summary:
      "Empty-backlog audit — closed the last explicitly-deferred finding from the accessibility series (dashboard-inline-editor-close-focus-restore's runner-up, reconfirmed as still deferred by leads-dashboard-sort-filter-aria-pressed): the leads dashboard's 16 due-queue panels (Commerce catalogs missing/unsynced, Starter→MRR upsell, MRR paused/canceled, Marketing/Voice packs due, Abandoned checkouts bundle+Buy now, Commerce payouts manual, Missing client receipt, Bundle order refunds & disputes, Follow-ups due, Cold leads, Work next, Paid-not-live, Production deploy handoffs, Website inquiries) each silently drop a row from the DOM the moment an operator resolves it, with zero screen-reader announcement. Added aria-live=\"polite\" aria-relevant=\"removals\" to all 16 `<ul>` containers in one uniform pass — fixing only some would have left an inconsistent screen-reader experience across sibling panels. See due-queue-panel-aria-live-removals in BUSINESS_DECISIONS for full detail.",
    status: "done",
    phase: "Phase 1 — Website foundation",
    owner: "claude/nice-euler-to3z0u",
  },
  {
    id: "operator-login-form-error-aria-invalid-describedby",
    summary:
      "Empty-backlog audit — natural sibling gap left by dashboard-form-error-aria-invalid-describedby, which only touched leads-client.tsx. The operator sign-in page (src/app/dashboard/login/page.tsx) has a single password input and a server-rendered 'Incorrect password'/'Too many attempts' error paragraph — the same clean field-to-error shape as the just-fixed Add-Lead/CSV/notes cases, just on a file that pass never scanned. Added aria-invalid + a conditional aria-describedby on the password input, pointing at a new stable id on whichever error paragraph renders. Checked the public checkout form (src/app/checkout/checkout-form.tsx) too and deliberately left it alone: its error banner covers three unrelated failure causes across several inputs with no single field it can be attributed to, so forcing an aria-describedby there would misrepresent which field is 'invalid' rather than fix anything.",
    status: "done",
    phase: "Phase 1 — Website foundation",
    owner: "claude/upbeat-dijkstra-7rdjcd",
  },
  {
    id: "bundle-order-refund-dispute-panel-aria-live-gap-fix",
    summary:
      "Found the due-queue-panel-aria-live-removals entry's own claimed coverage was incomplete: its single replace_all edit targeted the literal string `<ul className=\"mt-4 space-y-3\">`, but the Bundle order refunds & disputes panel's `<ul>` (leads-client.tsx:2157) uses `space-y-2` instead — one class name different from every sibling due-queue panel — so it was silently skipped despite being explicitly named as covered in that same entry's rationale. Added aria-live=\"polite\" aria-relevant=\"removals\" to that one `<ul>` (space-y-2 left untouched, out of scope) so all 17 due-queue panels now announce row removals uniformly.",
    status: "done",
    phase: "Phase 1 — Website foundation",
    owner: "claude/nice-euler-mz3dnt",
  },
  {
    id: "commerce-abandoned-checkout-panel-catalog-lookup-linear-scan-fix",
    summary:
      "Follow-up to dashboard-leads-table-per-row-linear-scan-to-map-lookup (PR #724): the Commerce Buy now abandoned checkouts due panel was the one call site that fix's own catalogForLead(slug) helper missed — it still did a raw commerceCatalogs.find()/.find() linear scan per abandoned session instead of using the Map-backed helper already defined earlier in the same file and used correctly at four other call sites. Swapped it to catalogForLead(session.leadSlug)?.items.find(...), identical behavior, O(1) lookup instead of O(catalogs).",
    status: "done",
    phase: "Phase 1 — Website foundation",
    owner: "claude/nice-euler-mz3dnt",
  },
  {
    id: "generic-lead-default-tagline-restaurant-leak",
    summary:
      "mapSqliteRowToLead and buildPaymentStubLeadFields (shared by SQLite recordLeadPayment and Convex markLeadPaid) each duplicated csv-import.ts's defaultTagline(category) mapping instead of importing it, and both duplicates collapsed the 4-way BusinessCategory split into 3 — giving category=\"generic\" leads (every organic/no-slug Stripe checkout stub, plus any dashboard-added lead left at the default category with a blank tagline) the same hardcoded restaurant tagline ('Local favorites made fresh daily') as actual restaurants on their live public /preview/[slug] hero. Extracted the mapping into a new shared src/lib/leads/default-tagline.ts (mirroring the category-normalize.ts precedent) and rewired all three call sites through it; fixed two existing tests that had locked the wrong tagline in as spec.",
    status: "done",
    phase: "Phase 1 — Website foundation",
    owner: "claude/upbeat-dijkstra-5wamwy",
  },
  {
    id: "leads-client-date-hydration-mismatch-regression-fix",
    summary:
      "Research-agent audit found the hydration-mismatch bug class fixed once already in leads-client.tsx (leads-client-date-hydration-mismatch, PR #489, 13-site sweep) had regressed at three call sites via two later, unrelated feature PRs: the marketing pack and client voice pack 'Emailed to client {date}' lines (added 2026-07-23 by the pack client-send-visibility work) and the Stripe Connect payouts panel's '(as of {date})' line (added 2026-07-24, explicitly modeled on the same already-buggy pattern). All three used raw new Date(x).toLocaleDateString() in a \"use client\" component still server-rendered for the initial HTML — locale-default formatting resolves against the SSR host's system timezone, which can visibly disagree with the browser's on hydration. Fixed by swapping all three to the same formatAbandonedAgeHours(deployHandoffAgeHours(x, nowMs)) + \" ago\" pattern already used elsewhere in this file; added a new AGENT_PROTOCOL bullet requiring future timestamp displays in this file to use that pattern and grep for regressions before claiming a change done, since this is now the second occurrence with no test harness to catch it mechanically.",
    status: "done",
    phase: "Phase 1 — Website foundation",
    owner: "claude/upbeat-dijkstra-2gn0oi",
  },
  {
    id: "checkout-session-no-payment-required-fulfillment-gap",
    summary:
      "A research-agent audit steered at fresh pricing/coupon edge cases found that isStripeCheckoutSessionPaid (shared by webhook fulfillment, /checkout/success, and the public billing-portal Session twin) only ever accepted payment_status === \"paid\", silently and permanently dropping any Checkout Session that settles at exactly $0 via allow_promotion_codes (both checkout create routes enable customer-facing promo codes). Stripe sets payment_status \"no_payment_required\" for a $0 total — a TERMINAL status, unlike \"unpaid\" (async ACH pending), so no later event ever arrives to resolve it. Broadened the predicate to accept \"paid\" OR \"no_payment_required\"; relaxed the commerce_sku webhook branch's amount check to allow amount_total === 0 specifically when payment_status is no_payment_required (kept rejecting amount_total <= 0 for an ordinary \"paid\" session, preserving an existing test); the bundle branch's amount check already tolerated 0 via Math.max(0, expectedCents - discountCents), so only the shared payment_status gate needed fixing there. Added direct regression tests for a 100%-off bundle checkout and a 100%-off commerce_sku Buy-now checkout, plus updated the architecture doc.",
    status: "done",
    phase: "Phase 1 — Website foundation",
    owner: "claude/nice-euler-6xbwq8",
  },
  {
    id: "commerce-order-zero-amount-owed-exclusion",
    summary:
      "Empty-backlog audit steered at the just-merged checkout-session-no-payment-required-fulfillment-gap fix (PR #743) as the least-audited surface — newly-reachable code is undertested by definition. Making a $0 100%-off Buy now order reachable at all (previously silently dropped before insertCommerceOrder) exposed a latent bug: four separate call sites (summarizeCommerceOrdersByLead in src/lib/commerce/orders.ts, pipeline-health.ts's unpaidCommerceOrders, daily-digest.ts's commerceOrdersOwed, leads-client.tsx's commerceOrdersStillOwed) each duplicated the same paidOutAt/refundedAt/disputedAt-only 'unpaid' check with no amount guard, so a $0 order would sit in the Commerce payouts (manual) panel, the daily digest, and pipeline-health's owed staleness signal forever with a live 'Mark paid out' button that accomplishes nothing. Shipped a single shared isCommerceOrderOwed predicate replacing all four duplicated filters, plus a per-row UI fix (a $0, unresolved order now renders 'Free order — nothing owed' instead of 'owed ... Mark paid out'). See commerce-order-zero-amount-owed-exclusion in BUSINESS_DECISIONS for full detail.",
    status: "done",
    phase: "Phase 8 — Commerce",
    owner: "claude/upbeat-dijkstra-lxzzsa",
  },
];
