/**
 * Archived NextStep entries — see src/lib/process/prompt_process.tsx for
 * why this exists (process-log-archive-scalability-split in
 * BUSINESS_DECISIONS) and for the live, editable tail. Part 1 of 2 of the pre-2026-07-21-archive done backlog.
 *
 * Append-only, like the live arrays it was split from — never edit an entry
 * here, and never append new entries directly to an archive file. New
 * entries always go in the live array in prompt_process.tsx (or
 * business-decisions.ts for BUSINESS_DECISIONS); a future maintenance pass
 * moves the oldest live entries into a new archive file (or a new numbered
 * file in this directory) once the live file grows large again.
 */
import type { NextStep } from "../types";

export const NEXT_STEPS_DONE_ARCHIVE_01: NextStep[] = [
  {
    id: "stripe-webhook",
    summary:
      "Add /api/stripe/webhook: verify signature, handle checkout.session.completed → mark lead paid, trigger production deploy + receipt email.",
    status: "done",
    phase: "Phase 3 — Payments",
    owner: "claude/relaxed-galileo-nj7oy0",
  },
  {
    id: "category-templates",
    summary:
      "Build category-specific preview templates (restaurant, salon, trades) beyond the generic placeholder at /preview/[slug], including tier upsell cards.",
    status: "done",
    phase: "Phase 1 — Website foundation",
    owner: "cursor/business-process-evolution-aec3",
  },
  {
    id: "database",
    summary:
      "Stand up Convex (chosen over Postgres for this app) for lead + order persistence; replace demo catalog counts in /dashboard/leads; wire webhook fulfillment to mark leads paid. Fixed post-merge: the SQLite fallback in src/lib/db.ts imported the wrong export ('Database' instead of 'DatabaseSync' from node:sqlite), which 500'd /dashboard/leads and /preview/[slug] at runtime despite a clean build — always run `npm run dev` and load the page for database-touching changes, not just build/lint.",
    status: "done",
    phase: "Phase 1 — Website foundation",
    owner: "claude/convex-database-persistence",
  },
  {
    id: "csv-lead-import",
    summary:
      "Operator CSV import on /dashboard/leads for owned contact lists (businessName required; email/phone/category optional) with Lead.dataSource tagging — unblocks lead volume without Places API.",
    status: "done",
    phase: "Phase 4 — Data ingestion",
    owner: "cursor/business-process-evolution-a9c1 + cursor/prompt-process-evolution-6a76",
  },
  {
    id: "email-field-persistence",
    summary:
      "Persist optional lead.email in Convex schema + SQLite fallback (was UI-only; broke outreach_sent email sends after reload).",
    status: "done",
    phase: "Phase 1 — Website foundation",
    owner: "cursor/business-process-evolution-a9c1",
  },
  {
    id: "outbound-email",
    summary: "Wire Resend for outreach Email 1 (preview link) with CAN-SPAM footer and suppression list.",
    status: "done",
    phase: "Phase 2 — Outreach + platform voice",
    owner: "claude/email-outreach-and-suppression",
  },
  {
    id: "manual-lead-entry",
    summary:
      "Operator UI or authenticated API to add/edit a lead (slug, category, stage) into Convex — unblocks non-demo previews without scraping.",
    status: "done",
    phase: "Phase 1 — Website foundation",
    owner: "claude/convex-database-persistence",
  },
  {
    id: "dashboard-auth",
    summary:
      "Protect /dashboard/* (and lead mutation server actions) with operator auth before real customer data or outbound sends at scale.",
    status: "done",
    phase: "Phase 1 — Website foundation",
    owner: "cursor/business-process-evolution-8d74",
  },
  {
    id: "production-deploy-handoff",
    summary:
      "After paid checkout: enqueue production deploy handoff (DNS instructions, optional Vercel domain API, contact form stub) and operator Mark live — see /docs/production-deploy.",
    status: "done",
    phase: "Phase 5 — Production deploy",
    owner: "cursor/prompt-process-evolution-0e38",
  },
  {
    id: "vercel-per-client-projects",
    summary:
      "Optional scale-up: isolate each paid client on its own Vercel project (or multi-tenant routing rules) instead of shared project + path/host conventions. Shipped as an operator-assignable vercelProjectId per handoff (falls back to shared VERCEL_PROJECT_ID); automated Vercel project *creation* via API stays a manual operator step — see /docs/production-deploy.",
    status: "done",
    phase: "Phase 5 — Production deploy",
    owner: "claude/upbeat-dijkstra-4ugtxb",
  },
  {
    id: "preview-conversion-finish",
    summary:
      "Close the Starter product promise on /preview/[slug]: wire contact form UI to POST /api/contact/[slug], embed Google Maps for the lead's city, soften demo-only placeholder copy for non-demo leads.",
    status: "done",
    phase: "Phase 1 — Website foundation",
    owner: "cursor/prompt-process-evolution-7f15",
  },
  {
    id: "outreach-follow-ups",
    summary:
      "Email 2/3 follow-up templates + outreachStep/lastOutreachAt on Lead + operator 'send follow-up' (and optional due queue) — multiplies conversion without new lead sources.",
    status: "done",
    phase: "Phase 2 — Outreach + platform voice",
    owner: "cursor/prompt-process-evolution-375b",
  },
  {
    id: "pipeline-health-metrics",
    summary:
      "Operator dashboard metrics: revenue from orders, stage funnel counts, open deploy handoffs, leads missing email — surface stuck money without row-scanning.",
    status: "done",
    phase: "Phase 1 — Website foundation",
    owner: "cursor/business-process-evolution-ffae",
  },
  {
    id: "client-leads-inbox",
    summary:
      "Persist contact-form submissions (clientInquiries) in SQLite (+ Convex when configured) and show an Inquiries panel on the operator dashboard — upgrade the email-only contact stub.",
    status: "done",
    phase: "Phase 5 — Production deploy",
    owner: "cursor/business-process-evolution-109d",
  },
  {
    id: "checkout-attribution-polish",
    summary:
      "Prefill checkout from lead slug (email/business name), keep marketing CTAs on slug-aware paths, light trust/FAQ on the landing page.",
    status: "done",
    phase: "Phase 3 — Payments",
    owner: "cursor/business-process-evolution-ffae",
  },
  {
    id: "unit-test-coverage",
    summary:
      "Vitest + unit tests for the pure logic modules concurrent agents keep editing (outreach cadence, pipeline-health aggregation, CSV import parsing, operator session sign/verify) — a build+lint pass has twice missed a real runtime bug (wrong node:sqlite export; Date.now() in render), so a fast non-DB, non-browser test layer catches logic regressions before they reach `npm run dev`.",
    status: "done",
    phase: "Phase 1 — Website foundation",
    owner: "claude/quirky-davinci",
  },
  {
    id: "client-site-seo",
    summary:
      "Close the Starter 'Basic SEO' promise: per-lead generateMetadata (title/description/canonical/OG) + LocalBusiness JSON-LD on /preview/[slug], plus /sitemap.xml and /robots.txt for the marketing site and known lead slugs.",
    status: "done",
    phase: "Phase 1 — Website foundation",
    owner: "claude/relaxed-galileo-e0wc2i",
  },
  {
    id: "lead-address-persistence",
    summary:
      "Discovered while verifying client-site-seo: the SQLite fallback schema/mapping in src/lib/db.ts has no `address` column, so Lead.address (used by the Maps embed pin and now LocalBusiness JSON-LD streetAddress) silently drops to city/state-only for any lead not served from the in-memory demo catalog. Add the column + migration + read/write mapping.",
    status: "done",
    phase: "Phase 1 — Website foundation",
    owner: "claude/quirky-davinci-8x9xi8",
  },
  {
    id: "lead-quality-scoring",
    summary:
      "Pure TypeScript lead scoring (missing email/address/phone, stale outreach, category fit vs. recommendedTier) surfaced on the dashboard so the operator works the highest-probability leads first instead of scanning the full list top-to-bottom.",
    status: "done",
    phase: "Phase 2 — Outreach + platform voice",
    owner: "cursor/business-process-evolution-8e65 + cursor/prompt-process-evolution-f004",
  },
  {
    id: "checkout-abandoned-recovery",
    summary:
      "Operator (or later cron) recovery nudge for Stripe Checkout sessions that were created but not completed — reuse lead slug attribution + Resend, honor suppression, link back to prefilled /checkout?slug=.",
    status: "done",
    phase: "Phase 3 — Payments",
    owner: "claude/upbeat-dijkstra-5y4ly6",
  },
  {
    id: "abandoned-checkout-quality-signal",
    summary:
      "Feed src/lib/checkout/abandoned-recovery.ts into the lead quality scorer (src/lib/leads/quality-score.ts) and Work next queue — a lead with an open, unrecovered Stripe Checkout Session is the hottest signal in the pipeline (higher intent than a preview open) and should outrank plain outreach-due leads. Needs listOpenCheckoutSessions() threaded into scoreLead/rankLeadsForOutreach call sites.",
    status: "done",
    phase: "Phase 3 — Payments",
    owner: "cursor/business-process-evolution-d264",
  },
  {
    id: "operator-lead-notes",
    summary:
      "Optional free-text operator notes on Lead (SQLite + Convex) shown on the dashboard row expand / edit — capture call outcomes without a full CRM, and keep scoring inputs human-auditable.",
    status: "done",
    phase: "Phase 2 — Outreach + platform voice",
    owner: "cursor/prompt-process-evolution-e2ee",
  },
  {
    id: "pipeline-health-abandoned-sessions",
    summary:
      "Fold open/abandoned checkout_sessions into pipeline-health metrics + dashboard panel (count due recoveries, oldest abandoned age) so stuck payment intent sits beside paid-not-live — complements abandoned-checkout-quality-signal on the scorer.",
    status: "done",
    phase: "Phase 3 — Payments",
    owner: "cursor/prompt-process-evolution-b224",
  },
  {
    id: "discovery-call-notes-prompt",
    summary:
      "When an operator moves a lead to discovery_call (or sends Email 3), surface a lightweight prompt to add/update Lead.notes before leaving the row — raises note capture without a separate CRM workflow.",
    status: "done",
    phase: "Phase 2 — Outreach + platform voice",
    owner: "cursor/business-process-evolution-c5cb",
  },
  {
    id: "outreach-open-tracking",
    summary:
      "Track preview-link opens (simple pixel or link-visit timestamp on /preview/[slug] for outreach-sourced traffic) so the follow-up due queue can prioritize leads who opened but didn't convert over ones who never saw the email.",
    status: "done",
    phase: "Phase 2 — Outreach + platform voice",
    owner: "cursor/business-process-evolution-8e65",
  },
  {
    id: "stripe-billing-portal",
    summary:
      "Self-serve Stripe Billing Portal link for Growth/Complete subscribers (update card, view invoices, cancel) so subscription changes don't become operator support tickets. Uses the existing STRIPE_SECRET_KEY — no new secrets. Re-claimed after stale claim-only sibling claude/relaxed-galileo-7ngeg0.",
    status: "done",
    phase: "Phase 3 — Payments",
    owner: "cursor/business-process-evolution-5a8e",
  },
  {
    id: "recurring-payment-failed-dunning-notice",
    summary:
      "invoice.payment_failed already paused CRM entitlement internally but never told the customer — the only signal was an operator-side pause, so a subscriber whose card expired had no idea their Growth/Complete/Commerce service had stopped until they noticed missing content. Email the lead (skipSuppression: true — billing-critical, same class as the receipt) with a link back into the existing /checkout/success Manage-billing flow (reuses the original Checkout Session id — no new Stripe API call from inside the webhook). Reduces involuntary-churn revenue loss without any operator-gated secret.",
    status: "done",
    phase: "Phase 3 — Payments",
    owner: "claude/upbeat-dijkstra-yqw6f4",
  },
  {
    id: "inquiry-dashboard-reply",
    summary:
      "Operator reply-from-dashboard for clientInquiries (Resend, honor suppression, mark replied) so paid Starter contact-form leads get a human response without leaving /dashboard/leads — closes the inbox loop that currently only archives.",
    status: "done",
    phase: "Phase 5 — Production deploy",
    owner: "cursor/prompt-process-evolution-e1af",
  },
  {
    id: "lead-snooze-work-next",
    summary:
      "Optional snooze / defer on Work next (store snoozedUntil on Lead) so operators can park a hot lead without losing score history — reduces false urgency after a call is booked.",
    status: "done",
    phase: "Phase 2 — Outreach + platform voice",
    owner: "cursor/business-process-evolution-a6e6",
  },
  {
    id: "unreplied-inquiry-pipeline-metric",
    summary:
      "Fold new/unreplied clientInquiries counts into pipeline-health (and optionally a dashboard teaser) so unpaid-looking support debt on live/paid sites sits beside paid-not-live — complements inquiry-dashboard-reply without a second inbox.",
    status: "done",
    phase: "Phase 5 — Production deploy",
    owner: "cursor/prompt-process-evolution-af03",
  },
  {
    id: "inquiry-mark-read-on-composer-open",
    summary:
      "When an operator opens the inquiry reply composer on a status=new row, auto-mark the inquiry read (SQLite + Convex) so unreplied counts distinguish 'seen, drafting' from brand-new — small hygiene after unreplied-inquiry-pipeline-metric.",
    status: "done",
    phase: "Phase 5 — Production deploy",
    owner: "claude/upbeat-dijkstra-y2c9ib + claude/relaxed-galileo-sgx9h1",
  },
  {
    id: "snoozed-leads-pipeline-metric",
    summary:
      "Optional: fold currently-snoozed lead counts into pipeline-health (or a Work next footnote) so parked urgency is visible beside abandoned carts — only if operators miss unsnooze; prefer not adding a second priority panel.",
    status: "done",
    phase: "Phase 2 — Outreach + platform voice",
    owner: "cursor/prompt-process-evolution-9ebb",
  },
  {
    id: "cold-lead-reengagement",
    summary:
      "isFollowUpDue/listFollowUpsDue return null forever once outreachStep reaches 3 with no reply — these leads went permanently invisible to the operator. Added isColdLead/listColdLeads (outreach-followups.ts), a pipeline-health coldLeadCount + oldest-age, and a 'Cold' badge on the leads table so operators can manually re-engage or move the lead to a closed stage.",
    status: "done",
    phase: "Phase 2 — Outreach + platform voice",
    owner: "claude/cold-lead-reengagement",
  },
  {
    id: "cold-lead-archive-action",
    summary:
      "Operator one-click action on a Cold-badged lead (from cold-lead-reengagement) to either reset outreachStep to 0 + clear lastOutreachAt (re-enter the Email 1-3 cadence) or move the lead to a terminal/closed stage — today operators can only see the badge, not act on it without manually editing stage/notes. Shipped: planColdLeadDisposition + disposeColdLeadAction; Re-engage → discovered + cleared cadence; Close → new terminal closed stage.",
    status: "done",
    phase: "Phase 2 — Outreach + platform voice",
    owner: "cursor/business-process-evolution-89f2",
  },
  {
    id: "operator-daily-digest-email",
    summary:
      "Operator-triggered (or later cron) daily digest email summarizing Work next top leads, follow-ups due, abandoned-checkout recoveries due, and unreplied inquiries — a single-operator business should not have to open /dashboard/leads to know what's urgent today.",
    status: "done",
    phase: "Phase 2 — Outreach + platform voice",
    owner: "claude/quirky-davinci-pewiht",
  },
  {
    id: "follow-ups-due-pipeline-metric",
    summary:
      "Fold listFollowUpsDue counts (+ oldest due age) into pipeline-health aggregates so Email 2/3 backlog sits beside unreplied inquiries and abandoned carts — operators currently only see Due badges row-by-row / Work next factors. Shipped: followUpsDueCount + oldestFollowUpDueAgeHours reuse isFollowUpDue; metric card + callout on the pipeline-health panel.",
    status: "done",
    phase: "Phase 2 — Outreach + platform voice",
    owner: "claude/relaxed-galileo-n2jurd",
  },
  {
    id: "snoozed-leads-in-digest",
    summary:
      "Optional: include currently-snoozed lead count (and soonest return) in the operator daily digest so parked urgency is visible without opening /dashboard/leads — reuses isLeadSnoozed (same predicate as pipeline-health snoozedLeadCount). Shipped as digest footnotes, not a second action section.",
    status: "done",
    phase: "Phase 2 — Outreach + platform voice",
    owner: "cursor/business-process-evolution-775d",
  },
  {
    id: "closed-leads-pipeline-metric",
    summary:
      "Optional: fold currently-closed lead counts into pipeline-health (or a stage-funnel footnote) so operators see how many cold closes accumulated — only if Closed filter alone is not enough; prefer not adding a second priority panel. Shipped: closedLeadCount (= stageCounts.closed) + stage-funnel footnote linking to the Closed filter — not a priority MetricCard.",
    status: "done",
    phase: "Phase 2 — Outreach + platform voice",
    owner: "cursor/prompt-process-evolution-2313",
  },
  {
    id: "marketing-packs-due-pipeline-metric",
    summary:
      "Fold eligible Growth/Complete leads missing this UTC month's marketing pack into pipeline-health + daily digest (action section) so monthly fulfillment debt is visible without scanning every row — reuses leadEligibleForMarketingPack + marketingMonthKey. Shipped: listMarketingPacksDue + marketingPacksDueCount on pipeline health + digest Marketing packs due section.",
    status: "done",
    phase: "Phase 6 — Marketing automation",
    owner: "cursor/business-process-evolution-88c8",
  },
  {
    id: "starter-upsell-candidates-in-digest",
    summary:
      "Include Starter → MRR upsell candidates (top 5) in the operator daily digest via listStarterUpsellCandidates — dashboard Upsell panel already ships; digest makes MRR conversion visible without opening /dashboard/leads. Shipped alongside marketing-packs-due (shared orders load in sendDailyDigestAction).",
    status: "done",
    phase: "Phase 3 — Payments",
    owner: "cursor/business-process-evolution-88c8",
  },
  {
    id: "reengage-send-email1-option",
    summary:
      "Optional: when Re-engage runs on a cold lead, offer a checkbox to immediately set stage to outreach_sent and send Email 1 (today Re-engage only resets to discovered so Email 1 stays intentional). Shipped: planColdLeadDisposition options.sendEmail1; disposeColdLeadAction sends via sendOutreachEmail + recordLeadOutreach(1); Cold panel checkbox (default off) shared with table row actions.",
    status: "done",
    phase: "Phase 2 — Outreach + platform voice",
    owner: "cursor/prompt-process-evolution-084a",
  },
  {
    id: "marketing-content-generation",
    summary:
      "Growth ($99/mo) and Complete ($199/mo) both sell 'AI marketing engine: 8 social/GBP posts + 2 emails/month' (see /docs/product-bundles). Shipped: operator-triggered generateMarketingPackAction on /dashboard/leads for paid/live Growth/Complete leads — MONTHLY_MARKETING_PACK_TYPES (8 posts + 2 emails), AnthropicMarketingGenerator when ANTHROPIC_API_KEY is set (StubMarketingGenerator fallback), persisted per lead/UTC-month in SQLite + Convex marketingPacks, View pack + Copy for operator posting. Buffer/GBP OAuth auto-posting stays marketing-content-scheduling.",
    status: "done",
    phase: "Phase 6 — Marketing automation",
    owner: "cursor/business-process-evolution-31ae",
  },
  {
    id: "paid-starter-upsell-nudge",
    summary:
      "Operator-triggered Growth/Complete upsell email for paid Starter leads (no recurring yet) — include preview of marketing add-ons + checkout/billing upgrade link. Converts one-time $500 customers into MRR without waiting on the marketing engine phase. Shipped: leadEligibleForStarterUpsell (inverse of billing-portal eligibility), sendStarterUpsellEmail + sendStarterUpsellAction, Starter → MRR upsell panel + row Upsell button; checkout preselects Growth or Complete from recommendedTier.",
    status: "done",
    phase: "Phase 3 — Payments",
    owner: "cursor/prompt-process-evolution-f6ad",
  },
  {
    id: "complete-client-voice-faq-pack",
    summary:
      "Complete ($199/mo) sells an AI phone receptionist (see /docs/product-bundles + /docs/voice-agent-flow). Shipped: operator-triggered generateClientVoicePackAction on /dashboard/leads for paid/live Complete leads — CLIENT_VOICE_FAQ_SCRIPT_TYPES (greeting, hours, services, booking CTA, after-hours, take-a-message), AnthropicClientVoiceGenerator when ANTHROPIC_API_KEY is set (StubClientVoiceGenerator fallback), persisted one row per lead in SQLite + Convex clientVoicePacks, Generate voice / View voice + Copy UI. Twilio provisioning stays Phase 7 / operator-gated.",
    status: "done",
    phase: "Phase 7 — Client AI phone",
    owner: "cursor/prompt-process-evolution-bc40",
  },
  {
    id: "commerce-catalog-stub",
    summary:
      "Commerce add-on (+$300 + $49/mo) sells a simple catalog ≤50 SKUs + order notifications (see /docs/product-bundles). Before Stripe Products sync, ship operator-editable catalog per paid/live commerceAddon lead (SQLite + Convex), show it on /preview/[slug], and route 'Request order' through the existing contact/inquiry path so operators get notified — full Stripe catalog sync stays a later Phase 8 step. Shipped: leadEligibleForCommerceCatalog + normalizeCommerceItems, commerceCatalogs persistence, saveCommerceCatalogAction, dashboard editor + missing panel, preview Menu & products with Request order → contact form.",
    status: "done",
    phase: "Phase 8 — Commerce",
    owner: "cursor/business-process-evolution-b87c",
  },
  {
    id: "stripe-commerce-products-sync",
    summary:
      "Sync operator Commerce catalogs to Stripe Products/Prices and embed Checkout (or Payment Links) per SKU — replaces the Request-order → inquiry stub. Shipped: syncCommerceCatalogToStripe (src/lib/commerce/stripe-sync.ts) idempotently creates/finds a Stripe Product + Price per SKU (metadata-keyed, reuses STRIPE_SECRET_KEY — no new secrets) via an operator-triggered Sync to Stripe button on a saved catalog; /preview/[slug] shows Buy now (POST /api/commerce/checkout, server-resolves price by id, never trusts client input) for synced SKUs, falling back to Request order → inquiry inbox otherwise. Orphaned Stripe Products for SKUs later removed from the catalog draft are not auto-archived — a follow-up if it matters in practice.",
    status: "done",
    phase: "Phase 8 — Commerce",
    owner: "claude/quirky-davinci-r911f7",
  },
  {
    id: "client-voice-packs-missing-visibility",
    summary:
      "Fold eligible Complete leads missing a client voice FAQ pack into pipeline-health + daily digest (action section) so Complete phone fulfillment debt is visible without scanning every row — reuses listClientVoicePacksDue (already shipped with complete-client-voice-faq-pack). Shipped: clientVoicePacksDueCount on pipeline health + digest Complete voice packs due section.",
    status: "done",
    phase: "Phase 7 — Client AI phone",
    owner: "cursor/business-process-evolution-7d50",
  },
  {
    id: "commerce-catalogs-missing-visibility",
    summary:
      "Fold paid/live commerceAddon leads missing a catalog into pipeline-health + daily digest (action section) so Commerce fulfillment debt is visible without relying only on the dashboard missing panel — reuses listCommerceCatalogsMissing. Shipped: commerceCatalogsMissingCount on pipeline health + digest Commerce catalogs missing section (shared catalogs load).",
    status: "done",
    phase: "Phase 8 — Commerce",
    owner: "cursor/prompt-process-evolution-ca53",
  },
  {
    id: "commerce-order-webhook-notification",
    summary:
      "checkout.session.completed only records a payment/deploy-handoff when session.metadata has both slug AND tier — a commerce_sku Buy now purchase (stripe-commerce-products-sync, POST /api/commerce/checkout) sets slug + skuId but no tier, so it silently fell into the else/console.warn branch and never reached the operator. Shipped: the webhook now branches on metadata.kind === \"commerce_sku\" first and notifies via insertClientInquiry (source commerce_checkout, reusing commerceOrderPaidInquiryMessage) — same inbox Request-order already uses for un-synced SKUs.",
    status: "done",
    phase: "Phase 8 — Commerce",
    owner: "claude/relaxed-galileo-lmdbq4",
  },
  {
    id: "commerce-catalog-preserve-stripe-ids",
    summary:
      "Bug: saveCommerceCatalogAction → normalizeCommerceItems drops stripeProductId/stripePriceId, so any catalog edit after Sync to Stripe silently disables Buy now until the operator re-syncs. Shipped: preserveCommerceStripeIds merges Stripe ids server-side from the existing catalog row (keep product id by sku id; keep price id only when priceCents is unchanged — matches stripe-sync reprice behavior). Do not trust client-submitted Stripe ids.",
    status: "done",
    phase: "Phase 8 — Commerce",
    owner: "cursor/business-process-evolution-1e7b",
  },
  {
    id: "commerce-catalogs-unsynced-visibility",
    summary:
      "Fold saved commerce catalogs that still have ≥1 SKU without stripePriceId into pipeline-health + daily digest (action section) so Sync-to-Stripe debt is visible beside catalogs-missing — reuses catalog rows already loaded for listCommerceCatalogsMissing. Partial sync counts as unsynced (Buy now only works per-SKU). Shipped: listCommerceCatalogsUnsynced + commerceCatalogsUnsyncedCount + digest Commerce Sync to Stripe due section.",
    status: "done",
    phase: "Phase 8 — Commerce",
    owner: "cursor/business-process-evolution-1e7b",
  },
  {
    id: "deliver-marketing-pack-to-client",
    summary:
      "Growth/Complete sell monthly marketing content; today operators only Copy from the dashboard. Shipped: operator-triggered Email pack (sendMarketingPackToClientAction) sends this UTC month's pack to lead.email via Resend (reuses RESEND_API_KEY — no new secrets) so clients can post themselves without Buffer/GBP OAuth. Requires an existing pack row + email on the lead; suppression honored via sendEmail.",
    status: "done",
    phase: "Phase 6 — Marketing automation",
    owner: "cursor/prompt-process-evolution-6348",
  },
  {
    id: "deliver-client-voice-pack-to-client",
    summary:
      "Complete sells AI phone scripts; operators currently Copy from the dashboard. Shipped: operator-triggered Email voice pack (sendClientVoicePackToClientAction) sends the existing FAQ/script pack to lead.email via Resend (reuses RESEND_API_KEY — no new secrets) so clients can paste into a temp number / Cal.com without waiting on Twilio. Requires an existing pack row + email on the lead; suppression honored via sendEmail.",
    status: "done",
    phase: "Phase 7 — Client AI phone",
    owner: "cursor/prompt-process-evolution-6219",
  },
  {
    id: "commerce-order-revenue-ledger",
    summary:
      "A completed Commerce Buy now Checkout Session reached the operator only as a text inquiry — no structured revenue record existed anywhere, so total pass-through Commerce sales were invisible on the dashboard. Shipped: commerceOrders append-only ledger (SQLite commerce_orders table + Convex, idempotent on stripeSessionId), written by the webhook alongside the existing inquiry notification; pipeline-health commerceOrdersRevenueUsd + commerceOrdersCount (kept separate from revenueTotalUsd/orders — see AGENT_PROTOCOL); dashboard 'Commerce sales (pass-through)' metric card.",
    status: "done",
    phase: "Phase 8 — Commerce",
    owner: "claude/upbeat-dijkstra-7u4fj7",
  },
  {
    id: "commerce-order-refund-reversal-tracking",
    summary:
      "Disputes got a resolution twin (charge.dispute.closed clearing disputedAt) from the day dispute tracking shipped; refunds never did. A refund that charge.refunded already flagged (amount_refunded > 0) can itself later fail or be canceled — common for bank-sourced refunds (ACH, some debit cards) that Stripe reports as pending/succeeded first, then reverses days later when the destination account rejects it. Until this fix that left the order permanently excluded from the 'owed to client' total and blocked Mark paid out forever, even though the funds never actually left the platform. Shipped: refundStatusReversesRefund (failed/canceled) in src/lib/payments/refunds.ts; convex/orders.clearRefunded + convex/commerceOrders.clearRefunded (mirror clearDisputed exactly — Convex replace-omit, registered on the db.ts API map); clearOrderRefunded/clearCommerceOrderRefunded in src/lib/db.ts (SQLite NULL twin); a refund.updated webhook case (mirrors charge.dispute.closed's Session-correlation + commerce-then-bundle-order fallback shape) with two new WebhookFulfillmentStep entries (commerce_order_refund_reversed_session_lookup, commerce_order_refund_clear, bundle_order_refund_clear).",
    status: "done",
    phase: "Phase 8 — Commerce",
    owner: "claude/nice-euler-lnt4wv",
  },
  {
    id: "convex-public-function-api-secret",
    summary:
      "CRITICAL security audit finding, multi-iteration in progress. Every convex/*.ts query/mutation is built with the plain query/mutation builders (never internalQuery/internalMutation) and has zero ctx.auth or shared-secret check — in Convex's model that makes each one a public HTTP-callable RPC reachable by anyone who knows the deployment URL + function name, completely bypassing this app's requireOperatorAuth/checkRateLimit/signed-token/Stripe-signature layers (e.g. a raw ConvexHttpClient call to leads:markLeadPaid forges a paid order with zero Stripe involvement; suppressions:suppress silently kills transactional delivery to any address with no HMAC token, defeating the entire signed-unsubscribe design). The deployment URL lives in NEXT_PUBLIC_CONVEX_URL, whose NEXT_PUBLIC_ prefix signals 'safe to expose' by Next.js convention and is exactly the value Convex's own client libraries expect apps to ship to the browser — this app doesn't do that today, but the URL is not treated as a secret anywhere in docs/deploy config, so a single future addition of client-side Convex usage, a leaked deploy log, or a shared dashboard screenshot is enough to leak it. The 'obvious' fix (convert everything to internalQuery/internalMutation) does NOT work here: src/lib/db.ts's sole Convex caller is a bare `new ConvexHttpClient(convexUrl)` with no admin/auth token, and ConvexHttpClient's public API can only invoke public (api.*) functions, not internal ones — ConvexHttpClient.mutation()/.query() are typed to FunctionReference<'mutation'|'query'> (public), confirmed against node_modules/convex/dist/esm-types/browser/http_client.d.ts. Mitigation: requireApiSecret (convex/lib/apiSecret.ts) — every migrated function takes an explicit apiSecret: v.string() arg and throws unless it exactly matches the Convex deployment's own CONVEX_API_SECRET env var (Convex dashboard / `npx convex env set`, a separate store from this app's hosting env); db.ts sends the matching value from its own server-only (non-NEXT_PUBLIC_) CONVEX_API_SECRET. Fails closed: unset/mismatched secret on either side makes that module's Convex calls throw and fall back to SQLite (same degraded-but-safe path as any other Convex outage), not a hard crash. ALL TEN Convex files now fully migrated: convex/suppressions.ts (isSuppressed/suppress/list — the first, smallest complete file, proved the pattern end-to-end), convex/leads.ts (11 exports incl. markLeadPaid — forges paid revenue/stage with zero Stripe involvement), convex/orders.ts (11 exports incl. markRefunded/markDisputed/markRecurringCanceledByCustomer/syncRecurringEntitlementByCustomer — a successful unauthorized call could forge a refund/dispute flag, clear a real customer's recurring-entitlement cancellation, or silently retier a subscriber's monthly unlock; createOrder is a legacy orphan with no live db.ts caller — order writes go through leads.markLeadPaid — but is still a reachable public RPC and still needed the same migration), convex/commerceOrders.ts (11 exports incl. markPaidOut/markRefunded/markDisputed/clearDisputed — a successful unauthorized call could forge payout-cleared state or forge/erase clawback flags on the pass-through Commerce Buy now revenue ledger), convex/checkoutSessions.ts (7 exports incl. create/markComplete/markOpen/markCompleteOpenBundleForLead/markCompleteOpenCommerceForLeadSkuCustomer — a successful unauthorized call could forge or falsely clear abandoned-checkout state, defeating the recovery-nudge/digest queues that assume this table's status is only ever written by a real Stripe webhook), convex/deployHandoffs.ts (7 exports incl. updateCustomDomain/updateStatus/updateVercelProject — a successful unauthorized call could rewrite host-based routing for any live paid customer's production site, forge a Mark-live status transition, or repoint a client's isolated Vercel project, all with zero auth), convex/inquiries.ts (8 exports incl. updateStatus/recordReply — a successful unauthorized call could read every raw customer PII inquiry — name/email/phone/message across every lead — or forge/mutate operator replies; migrated 2026-07-19, owner claude/nice-euler-4fgto2), convex/commerceCatalogs.ts (3 exports incl. upsert — a successful unauthorized call could forge/corrupt a paid Commerce lead's SKU catalog including stripeProductId/stripePriceId, hijacking or breaking Buy now checkout for that lead; migrated 2026-07-19, owner claude/upbeat-dijkstra-jvtuyd), and convex/marketingPacks.ts + convex/clientVoicePacks.ts (3 exports each — a successful unauthorized call could forge/corrupt a paid Growth/Complete subscriber's sold monthly marketing content or receptionist voice scripts, or read them; migrated together 2026-07-19 as the ninth and tenth files since neither's `upsert` spreads args into ctx.db — every field is named explicitly in both the patch and insert branches — so both had the lowest-risk migration in the whole series; owner claude/nice-euler-31qpgz). upsertLead/seed (leads.ts), createOrder (orders.ts), insert (commerceOrders.ts), create (checkoutSessions.ts), and upsert (deployHandoffs.ts) all needed extra care since their args are spread directly into ctx.db.patch/insert/replace — apiSecret must be destructured out first (discarded via `void apiSecret`) or it leaks into the table as an extra column, since every convex/schema.ts table is a strict defineTable that rejects unlisted fields. Every convex/*.ts public query/mutation is now behind requireApiSecret; the structural convex-api-map-audit guard (src/lib/db/convex-api-map-audit.ts) continues to lock the db.ts↔convex/*.ts map so a future new table/handler can't silently ship unmigrated. Remaining follow-up (not yet started, see convex-api-secret-readiness-banner below): an operator-visible readiness banner (mirroring ConvexUrlEnvBanner) so an operator running Convex without CONVEX_API_SECRET configured sees why writes are silently SQLite-only instead of discovering it via missing data.",
    status: "done",
    phase: "Phase 1 — Website foundation",
    owner: "claude/upbeat-dijkstra-hcl8wh + claude/nice-euler-4fgto2 (inquiries.ts) + claude/upbeat-dijkstra-jvtuyd (commerceCatalogs.ts, eighth) + claude/nice-euler-31qpgz (marketingPacks.ts + clientVoicePacks.ts, ninth+tenth — series complete)",
  },
  {
    id: "convex-api-secret-readiness-banner",
    summary:
      "Follow-up to convex-public-function-api-secret (now fully shipped, all 10 files migrated behind requireApiSecret): add an operator-visible readiness banner (mirroring ConvexUrlEnvBanner / src/lib/convex/convex-url-env-readiness.ts) that warns when NEXT_PUBLIC_CONVEX_URL is configured but the server-only CONVEX_API_SECRET env var is unset or doesn't match the Convex deployment's own CONVEX_API_SECRET — today that misconfiguration fails silently (every Convex call throws inside requireApiSecret and falls back to SQLite-only, same degraded path as any other Convex outage) with no dashboard signal, so an operator could run for a long time believing multi-instance Convex persistence is active when every write is actually landing on instance-local SQLite. Env-presence check only, mirroring the existing NEXT_PUBLIC_CONVEX_URL banner's shape — does not attempt to verify the secret actually matches the Convex deployment (that would require a live round-trip call, which is out of scope for a login/dashboard-load readiness check).",
    status: "done",
    phase: "Phase 1 — Website foundation",
    owner: "claude/upbeat-dijkstra-jpf6bu",
  },
  {
    id: "sitemap-docs-route-sync",
    summary:
      "Bug: src/app/sitemap.ts's STATIC_ROUTES hand-duplicated only 2 of the 12 indexable /docs/* pages linked from src/app/docs/page.tsx, silently omitting 9 unauthenticated, crawlable docs pages from sitemap.xml. Shipped: shared src/lib/docs/routes.ts (DOCS_PAGES) imported by both docs/page.tsx and sitemap.ts so the two lists can no longer drift.",
    status: "done",
    owner: "claude/upbeat-dijkstra-bpm73m",
  },
  {
    id: "empty-backlog-convex-public-surface-audit-0718",
    summary:
      "Empty-backlog audit: re-check Convex/SQLite persistence parity and unauthenticated public render sinks after the latest webhook/docs work; ship any real regression found, otherwise record a dated clean audit.",
    status: "done",
    owner: "codex/dev-work-empty-backlog-audit-0718",
  },
  {
    id: "deploy-handoff-orchestrator-test-coverage",
    summary:
      "src/lib/deploy/handoff.ts (enqueueProductionHandoff, tryProvisionVercelDomain, assignVercelProjectAndProvision, assignCustomDomainAndProvision, markHandoffLive) had zero direct test coverage despite being the most frequently edited, highest-branching module in the fail-closed hardening series (5+ iterations touched it: preserve-custom-domain, preserve-status-on-upsell, operator-writes-convex-primary). Every sibling file in src/lib/deploy/ had a test except the orchestrator itself. Shipped src/lib/deploy/handoff.test.ts covering the enqueue idempotency guard (same session/non-failed → return existing; failed → rebuild; new session → preserve via preserveDeployHandoffOperatorFields), all 5 tryProvisionVercelDomain branches (unconfigured skip incl. no-duplicate-note, 200, 409, other HTTP error, network exception) including the live-never-downgrades rule, assignVercelProjectAndProvision / assignCustomDomainAndProvision null-handoff + re-provision-and-persist paths, and markHandoffLive updating both handoff status and lead stage.",
    status: "done",
    phase: "Phase 5 — Production deploy",
    owner: "claude/upbeat-dijkstra-3xf88o",
  },
  {
    id: "commerce-abandoned-checkout-tracking",
    summary:
      "POST /api/commerce/checkout creates Buy now Stripe sessions but never wrote checkout_sessions, so abandoned end-customer carts were invisible. Bundle abandoned-recovery must NOT ingest commerce sessions without a kind discriminator — a Finish-checkout email linking /checkout?tier= would be wrong. Shipped: kind+skuId on checkout_sessions, record on Buy now create, mark complete on webhook, bundle vs commerce due queues, pipeline-health + digest Buy now carts, operator Send Buy now recovery → preview#catalog.",
    status: "done",
    phase: "Phase 8 — Commerce",
    owner: "cursor/business-process-evolution-015b",
  },
  {
    id: "commerce-buy-now-client-receipt",
    summary:
      "Commerce sells order notifications (see /docs/product-bundles). Shipped: on checkout.session.completed for kind=commerce_sku, after inquiry + commerceOrders ledger, webhook emails lead.email via sendCommerceBuyNowClientReceipt (Resend, honor suppression) with SKU/amount/customer email + preview#catalog link — so the local business knows to fulfill. Skips send when lead has no email; send failure does not roll back inquiry/ledger. Distinct from commerce-payouts-stripe-connect (money movement stays gated) and from sendReceiptEmail (bundle buyer).",
    status: "done",
    phase: "Phase 8 — Commerce",
    owner: "cursor/prompt-process-evolution-4d67",
  },
  {
    id: "commerce-orders-payout-ledger-panel",
    summary:
      "commerceOrders ledger + pipeline-health total exist, but operators still lack a row-level panel of Buy now orders grouped by lead — needed for manual client payouts until Stripe Connect ships. Shipped: summarizeCommerceOrdersByLead + Commerce payouts (manual) panel on /dashboard/leads (per-lead totals + recent lines from listCommerceOrders). Distinct from commerce-buy-now-client-receipt (client email) and commerce-payouts-stripe-connect (automated money movement).",
    status: "done",
    phase: "Phase 8 — Commerce",
    owner: "cursor/business-process-evolution-58b6",
  },
  {
    id: "commerce-stripe-orphan-product-archive",
    summary:
      "syncCommerceCatalogToStripe creates/updates Products for current SKUs only — Products for SKUs later removed from a catalog stay active in Stripe (documented follow-up on stripe-commerce-products-sync). Shipped: listOrphanCommerceStripeProducts + archiveOrphanCommerceStripeProducts (operator Archive orphans button; active=false; never auto-delete; scoped by lead metadata). Prefer after client-receipt + payout panel; still free while Connect stays gated.",
    status: "done",
    phase: "Phase 8 — Commerce",
    owner: "cursor/business-process-evolution-0907",
  },
  {
    id: "commerce-order-manual-payout-mark",
    summary:
      "Commerce payouts (manual) panel shows owed totals but operators cannot mark which commerceOrders lines have already been paid out to the client — at any real volume, double-pay risk grows until Stripe Connect. Shipped: paidOutAt on commerceOrders (SQLite + Convex), markCommerceOrderPaidOutAction + Mark paid out button per order line, summarizeCommerceOrdersByLead unpaidTotalUsd/unpaidCount driving both the payout panel and daily digest owed totals so settled orders drop out of both.",
    status: "done",
    phase: "Phase 8 — Commerce",
    owner: "claude/relaxed-galileo-chd6ul",
  },
  {
    id: "commerce-payouts-owed-in-digest",
    summary:
      "Commerce payouts (manual) panel existed on /dashboard/leads, but the operator daily digest never surfaced pass-through money owed to Commerce clients. Shipped: buildDailyDigest commercePayoutsOwed (+ totalUsd) via summarizeCommerceOrdersByLead; sendDailyDigestAction loads listCommerceOrders once; digest HTML section 'Commerce payouts owed'. Distinct from commerce-orders-payout-ledger-panel (dashboard UI) and commerce-payouts-stripe-connect (automated money movement).",
    status: "done",
    phase: "Phase 8 — Commerce",
    owner: "cursor/prompt-process-evolution-c75d",
  },
  {
    id: "commerce-orders-convex-id-integrity",
    summary:
      "Bug found while sibling cursor/business-process-evolution-0907 held the only free backlog item (commerce-stripe-orphan-product-archive, claim-only, no feature code yet): commerce-order-revenue-ledger's Convex path never persisted an id. Unlike every sibling ledger (clientVoicePacks.packId, marketingPacks.packId, clientInquiries.inquiryId — each stored as an app-owned *Id column and echoed back as `id`), convex/schema.ts's commerceOrders table and convex/commerceOrders.ts's insert/list had no id field at all, so CommerceOrderRecord.id (required string, populated correctly on the SQLite fallback) was silently undefined for every row once Convex is configured — the /dashboard/leads Commerce payouts (manual) panel keys each order line with `key={row.id}`, breaking React list identity for that panel and any future id-keyed consumer. Shipped: newCommerceOrderId() (mirrors newCommerceSkuId), generated once in insertCommerceOrder and passed to both backends; Convex schema/insert/list now carry an orderId column and echo it back as id, matching the established pattern.",
    status: "done",
    phase: "Phase 8 — Commerce",
    owner: "claude/upbeat-dijkstra-noo0a3",
  },
  {
    id: "bundle-order-webhook-idempotency",
    summary:
      "Bug found auditing for a regression while the free backlog stayed empty (only stripe-price-objects / lead-ingestion / marketing-content-scheduling / commerce-payouts-stripe-connect remained, all operator/legal-gated): the core `orders` table (Starter/Growth/Complete bundle purchases — the thing this business actually sells) had no uniqueness guard on stripeSessionId, unlike checkout_sessions and commerce_orders, which AGENT_PROTOCOL already requires ('Any ledger written from a Stripe webhook handler must be idempotent on stripeSessionId'). A Stripe checkout.session.completed retry/timeout redelivery would insert a second orders row, double-counting revenueTotalUsd on the operator dashboard and resending the buyer receipt email + 'next steps' deploy-handoff email a second time. Shipped: UNIQUE index migration on orders.stripeSessionId (SQLite) + existence check before insert on both backends (SQLite SELECT-then-insert; Convex markLeadPaid queries the existing by_stripeSessionId index first); recordLeadPayment/markLeadPaid now return { alreadyRecorded }, and the webhook handler skips the receipt/handoff emails entirely when a session was already processed. Verified end-to-end against a running dev server: constructed a real Stripe-signed checkout.session.completed payload (stripe.webhooks.generateTestHeaderString) and POSTed it twice — first call recorded the order + queued the handoff email, second call logged 'already recorded — skipping duplicate emails/handoff' and the SQLite orders table held exactly one row for that stripeSessionId afterward.",
    status: "done",
    phase: "Phase 3 — Payments",
    owner: "claude/quirky-davinci-wuk0al",
  },
  {
    id: "commerce-buy-now-webhook-side-effect-idempotency",
    summary:
      "Bug found auditing after bundle-order-webhook-idempotency: commerceOrders ledger was already idempotent on stripeSessionId, but the commerce_sku webhook branch still ran insertClientInquiry + sendCommerceBuyNowClientReceipt on every Stripe redelivery — spamming the operator inbox and re-emailing the local business. insertCommerceOrder returned void and ignored Convex's null-on-duplicate signal. Shipped: insertCommerceOrder → { alreadyRecorded } (Convex null + SQLite SELECT-before-insert); webhook ledgers first then skips inquiry/client receipt on redelivery — mirrors bundle recordLeadPayment.",
    status: "done",
    phase: "Phase 8 — Commerce",
    owner: "cursor/business-process-evolution-22f4",
  },
  {
    id: "commerce-mark-paid-out-convex-wiring",
    summary:
      "Bug found auditing while sibling business-process-evolution-22f4 owns commerce-buy-now-webhook-side-effect-idempotency: markCommerceOrderPaidOut calls api.commerceOrders.markPaidOut, and convex/commerceOrders.ts defines the mutation, but the static Convex API map in src/lib/db.ts never registered markPaidOut — so with NEXT_PUBLIC_CONVEX_URL set the mutation is undefined, the catch falls back to SQLite, then listCommerceOrders reads Convex first and returns unpaid rows. Operator sees Mark paid out 'succeed' while owed totals never clear → double-pay risk until Connect. Shipped: registered markPaidOut on the static Convex API map so Mark paid out stays on the Convex primary path.",
    status: "done",
    phase: "Phase 8 — Commerce",
    owner: "cursor/prompt-process-evolution-6a3c",
  },
  {
    id: "commerce-pipeline-health-unpaid-owed",
    summary:
      "After commerce-order-manual-payout-mark, the payout panel + digest use unpaidTotalUsd, but pipeline-health's Commerce sales (pass-through) card still sums lifetime amountPaidUsd — settled orders keep looking 'owed'. Shipped: computePipelineHealth filters with isCommerceOrderPaidOut so the card shows unpaid/owed totals matching panel + digest (lifetime remains available via full order list).",
    status: "done",
    phase: "Phase 8 — Commerce",
    owner: "cursor/prompt-process-evolution-6a3c",
  },
  {
    id: "suppression-list-convex-persistence",
    summary:
      "Bug found via subagent-assisted audit outside Commerce while the free backlog stayed empty (stripe-price-objects / lead-ingestion / marketing-content-scheduling / commerce-payouts-stripe-connect all operator/legal-gated): isEmailSuppressed / suppressEmail / getSuppressedEmails were the one persistence trio in src/lib/db.ts with no `if (convexClient)` branch at all — every other table (leads, orders, inquiries, checkout_sessions, marketing/voice packs, commerce catalogs/orders) follows Convex-first-then-SQLite-fallback, but suppression wrote/read only the per-instance local SQLite file. On a multi-instance/serverless deployment with Convex configured, an unsubscribe handled by one instance would not suppress a send handled by another — a real CAN-SPAM compliance gap, not just a data-loss bug. Shipped: convex/schema.ts suppressions table (by_email index) + convex/suppressions.ts (isSuppressed/suppress/list, idempotent insert), registered on the static Convex API map, and all three db.ts functions now try Convex first with the same try/catch-and-fall-back-to-SQLite pattern as every sibling function.",
    status: "done",
    phase: "Phase 2 — Outreach + platform voice",
    owner: "claude/relaxed-galileo-5kwtxz",
  },
  {
    id: "upsert-lead-collision-guard",
    summary:
      "Discovered during the suppression-list-convex-persistence audit: upsertLead (src/lib/db.ts) has update-or-insert semantics with no protection against clobbering an already-advanced lead. Shipped: partitionLeadsByExistingSlugs + existingLeadSlugConflictMessage; addLeadAction rejects an existing slug; importLeadsCsvAction skips collisions against a one-shot getLeads() slug set (row warnings, no pipeline overwrite). upsertLead itself unchanged — intentional updates stay on dedicated helpers.",
    status: "done",
    phase: "Phase 4 — Data ingestion",
    owner: "cursor/business-process-evolution-aa64",
  },
  {
    id: "deploy-handoffs-convex-persistence",
    summary:
      "Bug found auditing after suppression-list-convex-persistence while the free backlog stayed empty (stripe-price-objects / lead-ingestion / marketing-content-scheduling / commerce-payouts-stripe-connect all operator/legal-gated; upsert-lead-collision-guard claimed then shipped by sibling business-process-evolution-aa64 as PR #66): insertDeployHandoff / getDeployHandoffBySlug / listDeployHandoffs / updateDeployHandoffStatus / updateDeployHandoffVercelProject were the last persistence surface in src/lib/db.ts with no Convex branch — every other table follows Convex-first-then-SQLite-fallback, but deploy handoffs wrote/read only the per-instance local SQLite file. On a multi-instance/serverless deployment with Convex configured, a paid checkout that queues a handoff on one instance would not show on another instance's /dashboard/leads, and Mark live / Vercel project assign would update a different store than listDeployHandoffs — breaking Phase 5 fulfillment visibility after the money already cleared. Shipped: convex deployHandoffs table (explicit handoffId) + upsert/getByLeadSlug/list/updateStatus/updateVercelProject, registered on the static Convex API map, and Convex-first wrappers for all five db.ts functions.",
    status: "done",
    phase: "Phase 5 — Production deploy",
    owner: "cursor/prompt-process-evolution-dc94",
  },
  {
    id: "bundle-webhook-handoff-on-redelivery",
    summary:
      "Bug found auditing after deploy-handoffs-convex-persistence while the free backlog stayed empty (only operator/legal-gated todos remain): the bundle checkout.session.completed handler broke out entirely when recordLeadPayment returned alreadyRecorded, skipping enqueueProductionHandoff even though that helper is idempotent on slug + stripeSessionId. If the first delivery recorded the order but handoff enqueue failed (timeout/crash), Stripe retries permanently skipped Phase 5 fulfillment — paid customers never got Mark live / DNS panel visibility. Shipped: always call enqueueProductionHandoff; gate only the non-idempotent receipt + DNS emails on alreadyRecorded. Queued billing-portal-orders-newest-first + contact-form-persist-required from the same audit.",
    status: "done",
    phase: "Phase 5 — Production deploy",
    owner: "cursor/prompt-process-evolution-3df6",
  },
  {
    id: "billing-portal-orders-newest-first",
    summary:
      "Discovered during the same empty-backlog audit: listOrders SQLite path ORDER BY createdAt DESC, but Convex orders.list .collect() is unordered and db.ts returns rows as-is. latestEligibleOrder (billing portal) assumes newest-first — a lead with multiple eligible orders can open Manage subscription against an older row missing stripeCustomerId. Sort Convex-sourced orders newest-first in listOrders (or in convex/orders.list) so portal + any other newest-first consumer match SQLite. Shipped: sortOrdersNewestFirst on the Convex path in listOrders.",
    status: "done",
    phase: "Phase 3 — Payments",
    owner: "cursor/business-process-evolution-da3d",
  },
  {
    id: "contact-form-persist-required",
    summary:
      "Discovered during the same empty-backlog audit: POST /api/contact/[slug] catches insertClientInquiry failures, still sends the notify email, and returns { ok: true } — preview shows Thanks while no inquiry row lands in the operator inbox. Starter sold promise is contact form + CRM trail; treat persist as required for success (503 on DB failure; do not claim success without a ledger row). Shipped: persist failure → 503; email notify only after a successful inquiry ledger write. Folded onto 4d48 with contactPersistOutcome helper + unit tests.",
    status: "done",
    phase: "Phase 5 — Production deploy",
    owner: "cursor/business-process-evolution-6547 + cursor/prompt-process-evolution-4d48",
  },
  {
    id: "stripe-webhook-retry-on-fulfillment-failure",
    summary:
      "Empty-backlog audit after contact-form-persist-required: checkout.session.completed catches recordLeadPayment / enqueueProductionHandoff (and commerce insertCommerceOrder) failures, logs them, then still returns { received: true } 200 — Stripe never retries, so a transient DB/timeout on first delivery permanently loses paid fulfillment (order, handoff, commerce ledger). Shipped: return 500 when required ledger/handoff writes fail; email/notify best-effort after durable writes. Queued commerce-webhook-side-effect-recovery-on-redelivery + stripe-webhook-convex-primary-no-fallback.",
    status: "done",
    phase: "Phase 3 — Payments",
    owner: "cursor/prompt-process-evolution-4d48",
  },
  {
    id: "commerce-webhook-side-effect-recovery-on-redelivery",
    summary:
      "Related empty-backlog finding: commerce alreadyRecorded early-break skips insertClientInquiry + client receipt entirely. If the first delivery wrote the ledger then failed before inquiry/receipt, Stripe retries permanently skip those sold-capability notifies. Shipped: planCommerceWebhookSideEffects recovers missing inquiry/receipt on redelivery when no commerce_checkout inquiry embeds the stripeSessionId; skips only when that inquiry already exists.",
    status: "done",
    phase: "Phase 8 — Commerce",
    owner: "cursor/prompt-process-evolution-aa07",
  },
  {
    id: "stripe-webhook-convex-primary-no-fallback",
    summary:
      "Related empty-backlog finding: webhook fulfillment helpers (recordLeadPayment, insertDeployHandoff, insertCommerceOrder, insertClientInquiry) silently SQLite-fallback when Convex mutations fail, then the webhook ACKs 200. Dashboard/other instances read Convex-first and never see the payment — multi-instance split-brain on the revenue hot path. Prefer failing the webhook (Stripe retry) over writing only to local SQLite when Convex is configured.",
    status: "done",
    phase: "Phase 3 — Payments",
    owner: "cursor/business-process-evolution-740a",
  },
  {
    id: "mark-lead-paid-convex-stub-lead",
    summary:
      "Bug found auditing after deploy-handoffs-convex-persistence while the free backlog stayed empty (stripe-price-objects / lead-ingestion / marketing-content-scheduling / commerce-payouts-stripe-connect all operator/legal-gated): SQLite recordLeadPayment creates a minimal paid lead when checkout completes for a slug that does not yet exist, but Convex markLeadPaid only patches stage when a lead row is present — otherwise it still inserts the order and never marks anyone paid. listOrders then shows revenue while paidNotLiveCount / deploy-handoff eligibility / outreach stage stay wrong. Shipped: Convex markLeadPaid inserts a payment stub lead (slug-derived businessName + generic defaults matching mapSqliteRowToLead / buildPaymentStubLeadFields) when no lead exists, then records the order — parity with SQLite.",
    status: "done",
    phase: "Phase 3 — Payments",
    owner: "cursor/business-process-evolution-da3d",
  },
  {
    id: "commerce-webhook-require-sku-for-side-effects",
    summary:
      "Related webhook edge case found in the same empty-backlog audit: the commerce_sku branch only runs insertCommerceOrder (the alreadyRecorded gate) when metadata.skuId is present; if skuId is missing, insertClientInquiry + sendCommerceBuyNowClientReceipt still fire on every Stripe redelivery. Normal POST /api/commerce/checkout always sets skuId, but malformed/manual sessions violate AGENT_PROTOCOL ledger-first idempotency. Shipped: require skuId before ledger/side effects (warn + break when missing).",
    status: "done",
    phase: "Phase 8 — Commerce",
    owner: "cursor/business-process-evolution-da3d",
  },
  {
    id: "proxy-custom-domain-parity",
    summary:
      "Starter sells \"Preview subdomain → custom domain handoff\" (product-bundles, landing page) but the promise was DNS-instructions-only: no operator UI ever set DeployHandoff.customDomain, and no request-time routing served a lead's preview under a client's own domain (only tryProvisionVercelDomain read it, for the Vercel Domains API call). Shipped end-to-end: Save domain input + assignCustomDomainAction on the handoff card (mirrors the existing Vercel-project-isolation input); updateDeployHandoffCustomDomain + getLeadSlugByCustomDomain in src/lib/db.ts (Convex-first via new deployHandoffs.updateCustomDomain / getByCustomDomain + by_customDomain index, SQLite fallback); src/proxy.ts now rewrites pathname === \"/\" to /preview/[slug] when the request Host matches a saved customDomain and is not a platform-owned host (src/lib/deploy/custom-domain-routing.ts — isPlatformHost/normalizeRequestHost, unit tested). /api/* and /dashboard/* are untouched by Host. Verified against a running dev server: a request with an unrecognized Host and a matching customDomain row served that lead's preview at \"/\"; an unrecognized Host with no row, and the platform's own host, both still served the marketing site; /api/contact/[slug] and /dashboard/leads were unaffected under the custom Host.",
    status: "done",
    phase: "Phase 5 — Production deploy",
    owner: "claude/relaxed-galileo-haen9f",
  },
  {
    id: "follow-ups-due-exclude-snoozed",
    summary:
      "Bug found auditing outreach cadence after PR #73 (stripe-webhook-convex-primary-no-fallback / requireConvex) left the free backlog empty: isFollowUpDue never checked snoozedUntil, so a lead the operator explicitly snoozed still appeared in the 'Follow-ups due' panel (live Send button), pipeline-health followUpsDueCount, and the digest follow-ups-due section once its Email 2/3 cadence gap elapsed — directly contradicting the operator's snooze instruction and risking an unwanted send right after a customer asked not to be contacted. isColdLead has the same missing check but is deliberately left alone: it also gates planColdLeadDisposition, and Re-engage/Close on a snoozed cold lead is a valid explicit single-lead override that itself clears the snooze (existing cold-archive.test.ts coverage confirms this is intended, not a bug) — same contract as the per-lead Unsnooze button and the row-level manual 'Email {next}' button, both of which already bypass the due-cadence gate as intentional operator overrides. Shipped: isFollowUpDue returns false while isLeadSnoozed is true.",
    status: "done",
    phase: "Phase 2 — Outreach + platform voice",
    owner: "claude/business-continuity-4f9c",
  },
  {
    id: "outreach-email-businessname-html-escape",
    summary:
      "Subagent-assisted audit after PR #74 left the free backlog empty (only stripe-price-objects / lead-ingestion / marketing-content-scheduling / commerce-payouts-stripe-connect remain, all operator/legal-gated), scoped deliberately away from the last ~10 heavily-audited areas (Commerce, Stripe bundle webhook, contact form, deploy handoffs, suppression list, lead upsert collisions). Found: five HTML email templates in src/lib/email/resend.ts interpolated lead.businessName directly into the HTML body without escapeHtmlForEmail — sendOutreachEmail, sendOutreachFollowUp2, sendOutreachFollowUp3, sendCheckoutAbandonedRecovery, and sendReceiptEmail (the payment-confirmation email fired for every bundle sale, src/app/api/stripe/webhook/route.ts). Every sibling template already escapes the exact same field (sendCommerceAbandonedRecovery's safeBiz, sendInquiryReply, sendStarterUpsellEmail, marketing/voice pack delivery, commerce client receipt, daily-digest.ts) — a businessName containing HTML-significant characters (plausible on CSV import or manual add, see upsert-lead-collision-guard) would corrupt the rendered email or inject markup into a real customer's inbox on the product's highest-volume outreach and transactional sends. Shipped: escapeHtmlForEmail(businessName) at all five HTML interpolation sites (subject lines are plain text, left unchanged); new src/lib/email/resend.test.ts mocks ../db + fetch to assert the actual Resend API payload for each fixed function contains the escaped name and never the raw unsafe substring — this file had no prior test coverage.",
    status: "done",
    phase: "Phase 2 — Outreach + platform voice",
    owner: "claude/upbeat-dijkstra-e1w0pw",
  },
  {
    id: "preview-subdomain-routing",
    summary:
      "Free NEXT_STEPS backlog stayed empty after PR #76 (proxy-custom-domain-parity fold) — only stripe-price-objects / lead-ingestion / marketing-content-scheduling / commerce-payouts-stripe-connect remain, all operator/legal-gated. Audit found a real, sold, unimplemented Starter capability adjacent to the already-shipped custom-domain half of the same promise: the roadmap's Phase 1 line still said 'Remaining: preview subdomain hosting', and every deploy handoff has generated a suggestedHost ({leadSlug}.{productionRootDomain}) since Phase 5 shipped, but src/proxy.ts's isPlatformHost check deliberately treats {slug}.{root} hosts as platform traffic and skips the custom-domain DB lookup for them — so even once an operator finishes the (still-operator-gated) wildcard DNS + Vercel wildcard domain step, no code path would ever have served that lead's preview there; the request would fall through to the marketing homepage. Shipped: extractPreviewSubdomainSlug (src/lib/deploy/custom-domain-routing.ts), a dependency-free pure helper mirroring isPlatformHost's own style, extracting the candidate slug from a {slug}.{root} host (null for the bare root, multi-level subdomains, reserved labels, or hosts outside productionRootDomain). proxy.ts calls it before the isPlatformHost custom-domain branch and only rewrites to /preview/[slug] after confirming the slug resolves to a real lead via getLeadBySlug — an unrecognized label (typo or an unlisted reserved word) falls through to the normal marketing homepage rather than the demo-catalog preview fallback, so only real leads get a working subdomain.",
    status: "done",
    phase: "Phase 1 — Website foundation",
    owner: "claude/quirky-davinci-c1j0bf",
  },
  {
    id: "contact-form-convex-primary-no-fallback",
    summary:
      "After PR #77 (preview-subdomain-routing) left only gated NEXT_STEPS, the documented follow-up from stripe-webhook-convex-primary-no-fallback remains: POST /api/contact/[slug] calls insertClientInquiry without requireConvex. When NEXT_PUBLIC_CONVEX_URL is set and Convex mutations fail, the contact form still SQLite-fallbacks then returns { ok: true } — visitor sees Thanks while other instances read Convex-first and never see the inquiry (Starter sold contact form + CRM trail split-brain). Prefer fail-closed 503 (already the persist-required contract) over writing only to instance-local SQLite. Shipped: CONTACT_FORM_CONVEX_PRIMARY on insertClientInquiry; inline notify HTML also escapeHtmlForEmail'd (same asymmetry resend.ts fixed in PR #76).",
    status: "done",
    phase: "Phase 5 — Production deploy",
    owner: "cursor/business-process-evolution-a7c2",
  },
  {
    id: "commerce-webhook-inquiry-retry-on-failure",
    summary:
      "PR #72 shipped planCommerceWebhookSideEffects so Stripe redelivery can recover a missing commerce_checkout inquiry/receipt after the ledger already exists — but the webhook catch around insertClientInquiry still logged and returned { received: true } 200, so Stripe never redelivers and recovery never runs. Sold Commerce promise (operator inbox + client order notification) can be permanently lost after a transient inquiry write failure. Shipped: return 500 with step commerce_order_inquiry when inquiry (or pre-inquiry lead/catalog/inquiry-list loads) fail after a durable ledger write; client receipt stays best-effort only after inquiry succeeds. Queued checkout-session-complete-convex-primary from the same audit (markCheckoutSessionComplete still warn-only).",
    status: "done",
    phase: "Phase 8 — Commerce",
    owner: "cursor/prompt-process-evolution-3601",
  },
  {
    id: "checkout-session-complete-convex-primary",
    summary:
      "Related empty-backlog finding: webhook markCheckoutSessionComplete (bundle + commerce) catches failures, warns, and still ACKs 200 — and the helper has no requireConvex option. When Convex is configured, a failed mark-complete leaves the session open in Convex while payment succeeded; listAbandonedCheckoutsDue / listCommerceAbandonedCheckoutsDue can email Finish-checkout to someone who already paid. Shipped: markCheckoutSessionComplete accepts ConvexPrimaryWriteOptions and throws ConvexPrimaryWriteError on a requireConvex failure (mirrors recordLeadPayment/insertClientInquiry/insertDeployHandoff); both webhook call sites (bundle + commerce_sku) pass WEBHOOK_CONVEX_PRIMARY and return the new checkout_session_mark_complete 5xx so Stripe retries instead of ACKing past an unmarked session.",
    status: "done",
    phase: "Phase 3 — Payments",
    owner: "claude/relaxed-galileo-d3qpgd",
  },
  {
    id: "organic-checkout-crm-attribution",
    summary:
      "Homepage / pricing CTAs link to /checkout?tier=… without a lead slug. Checkout Session metadata then stores slug:\"\" and the webhook only fulfills when slug && tier — so an organic buyer who pays gets Stripe money with zero CRM lead, order row, deploy handoff, or receipt/DNS emails (contradicts the payment-stub design that already creates a lead when a slug exists but no CRM row). Shipped: mint a stable organic-* attribution slug at Checkout Session create when none is provided; webhook + stub-lead path then work unchanged. Also escape DNS handoff email HTML (same payment path, AGENT_PROTOCOL gap vs sendReceiptEmail) and correct Growth landing copy that overclaimed auto-scheduling.",
    status: "done",
    phase: "Phase 3 — Payments",
    owner: "cursor/prompt-process-evolution-9c45",
  },
  {
    id: "unsubscribe-suppress-convex-primary",
    summary:
      "After PR #79 left only gated NEXT_STEPS (plus checkout-session-complete-convex-primary owned by PR #81 / sibling 9c45 claimed organic-checkout-crm-attribution), audited public/CAN-SPAM write paths. GET /api/unsubscribe called suppressEmail without requireConvex — when Convex is configured and the mutation fails, the route still SQLite-fallbacks then shows 'You have been unsubscribed' while isEmailSuppressed on other instances reads Convex-first and returns false, so automated outreach can keep emailing someone who just opted out (CAN-SPAM split-brain). Shipped: UNSUBSCRIBE_CONVEX_PRIMARY on suppressEmail; route returns 500 on ConvexPrimaryWriteError. DNS handoff HTML escape folded with PR #82 (9c45).",
    status: "done",
    phase: "Phase 2 — Outreach + platform voice",
    owner: "cursor/business-process-evolution-6a13",
  },
  {
    id: "webhook-dns-handoff-email-html-escape",
    summary:
      "Empty-backlog asymmetry after PR #76 escaped businessName in resend.ts sendReceiptEmail: the sibling Stripe webhook DNS/production-handoff email still interpolated raw businessName (and formatDnsInstructionsForEmail hosts/URLs). Shipped on PR #82 (9c45): dns-email.ts escaping + webhook safeBiz/safeBrand; complementary fold on 6a13. Subject lines remain plain text.",
    status: "done",
    phase: "Phase 5 — Production deploy",
    owner: "cursor/prompt-process-evolution-9c45 + cursor/business-process-evolution-6a13",
  },
  {
    id: "checkout-session-create-convex-primary",
    summary:
      "After PR #81 hardened markCheckoutSessionComplete with requireConvex, the create-side twin stayed soft: recordCheckoutSessionCreated still SQLite-falls-back on Convex failure, and both POST /api/stripe/checkout + /api/commerce/checkout swallow tracking errors then return { url }. listOpenCheckoutSessions reads Convex-first for abandoned-recovery / digest — a SQLite-only create leaves paid-intent carts invisible to other instances (lost Finish-checkout / Buy now recovery revenue). Shipped: CHECKOUT_SESSION_CREATE_CONVEX_PRIMARY on recordCheckoutSessionCreated; both checkout routes return 502 on ConvexPrimaryWriteError (or any tracking failure) instead of handing out a Stripe URL after a split-brain write.",
    status: "done",
    phase: "Phase 3 — Payments",
    owner: "cursor/prompt-process-evolution-f005",
  },
  {
    id: "deploy-handoff-preserve-custom-domain",
    summary:
      "Empty-backlog audit follow-up: enqueueProductionHandoff rebuilds the handoff via buildHandoffRecord on a new stripeSessionId and insertDeployHandoff upserts without copying existing.customDomain / vercelProjectId — a second bundle checkout (upsell / re-purchase) after the operator saved a custom domain can wipe live Host→preview routing. Same class as preserveCommerceStripeIds. Shipped: preserveDeployHandoffOperatorFields merges operator-set customDomain + vercelProjectId from the existing handoff before insert (next explicit values still win). Dual-claim: c1a0 earlier remote claim owns (PR #86); 6946 claim-only then pivoted.",
    status: "done",
    phase: "Phase 5 — Production deploy",
    owner: "cursor/prompt-process-evolution-c1a0",
  },
  {
    id: "checkout-recovery-sent-convex-primary",
    summary:
      "Empty-backlog audit follow-up (queued by f005): recordCheckoutRecoverySent still soft-falls-back after the operator already sent the Finish-checkout / Buy now recovery email — Convex-first listOpenCheckoutSessions then keeps the session due and can nudge again (reputation / CAN-SPAM risk). Shipped: CHECKOUT_RECOVERY_SENT_CONVEX_PRIMARY; durable mark before Resend send in both recovery actions; ConvexPrimaryWriteError surfaces to the operator and skips the send.",
    status: "done",
    phase: "Phase 3 — Payments",
    owner: "cursor/business-process-evolution-6946",
  },
  {
    id: "preview-open-convex-primary",
    summary:
      "After PR #83 (unsubscribe requireConvex) left only gated NEXT_STEPS, sibling prompt-process-evolution-f005 claimed checkout-session-create-convex-primary. Empty-backlog audit found POST /api/preview/[slug]/open still SQLite-fallbacks on Convex failure then returns { ok: true, recorded: true } while getLeads/getLeadBySlug read Convex-first — Work next preview_opened scoring, follow-up openers-first sort, and the Opened badge silently miss on other instances. Shipped: PREVIEW_OPEN_CONVEX_PRIMARY on recordLeadPreviewOpen; route returns 503 on ConvexPrimaryWriteError (beacon is fire-and-forget).",
    status: "done",
    phase: "Phase 2 — Outreach + platform voice",
    owner: "cursor/business-process-evolution-51f0",
  },
  {
    id: "commerce-stripe-sync-pagination",
    summary:
      "Bug found auditing after PR #87 (checkout-recovery-sent requireConvex) left only gated NEXT_STEPS: findProductByKey / findMatchingPrice (src/lib/commerce/stripe-sync.ts, mirrored in src/lib/pricing/bootstrap-stripe-prices.ts) and listOrphanCommerceStripeProducts each called Stripe's products.list/prices.list with limit: 100 and no has_more/starting_after pagination loop — Stripe caps a single page at 100 items. Once an account's active Products exceed 100 (trivial once a handful of Commerce-addon leads each sync a multi-SKU catalog, since every SKU gets its own Product), a re-sync of an already-synced SKU whose Product/Price fell past page 1 would silently create a duplicate Product + Price instead of finding the existing one — violating the AGENT_PROTOCOL idempotent-metadata-key rule (line ~90) despite the key itself being stable — and Archive orphans would silently leave a genuine orphan un-archived while reporting success. Shipped: listAllPages walks has_more/starting_after until a match is found or the list is exhausted, used by all three lookups in stripe-sync.ts; matching fix in bootstrap-stripe-prices.ts. New stripe-sync.test.ts coverage seeds >100 active Products across filler leads and asserts re-sync still finds the existing Product/Price (no duplicate) and orphan detection still finds a removed SKU past page 1.",
    status: "done",
    phase: "Phase 8 — Commerce",
    owner: "claude/upbeat-dijkstra-cfwf5k",
  },
  {
    id: "commerce-paid-out-convex-primary",
    summary:
      "Empty-backlog audit after PR #87 (checkout-recovery-sent requireConvex): markCommerceOrderPaidOut still soft-falls-back on Convex failure while listCommerceOrders / summarizeCommerceOrdersByLead / pipeline-health unpaid owed read Convex-first — Mark paid out can return success after a SQLite-only write and never clear owed totals on other instances (Commerce double-pay risk until Connect). Shipped: COMMERCE_PAID_OUT_CONVEX_PRIMARY; markCommerceOrderPaidOutAction fails closed on ConvexPrimaryWriteError. Queued deploy-handoff-operator-writes-convex-primary + lead-snooze-convex-primary; folded sibling 4810 claim deploy-handoff-preserve-status-on-upsell + outreach-cadence-persist-then-send.",
    status: "done",
    phase: "Phase 6 — Commerce",
    owner: "cursor/prompt-process-evolution-3f93",
  },
  {
    id: "deploy-handoff-operator-writes-convex-primary",
    summary:
      "Empty-backlog follow-up: assignCustomDomain / assignVercelProject / markHandoffLive still SQLite-fallback on Convex failure then return success while getLeadSlugByCustomDomain + listDeployHandoffs read Convex-first — Starter Host→preview routing and Mark live can silently miss on other instances. Shipped: DEPLOY_HANDOFF_CONVEX_PRIMARY (src/lib/deploy/handoff-persist.ts); updateDeployHandoffStatus / updateDeployHandoffVercelProject / updateDeployHandoffCustomDomain / updateLeadStage accept ConvexPrimaryWriteOptions and throw ConvexPrimaryWriteError instead of silently falling back when required; assignVercelProjectAndProvision / assignCustomDomainAndProvision / markHandoffLive pass it through (including the insertDeployHandoff re-persist and the Mark live lead-stage write); markHandoffLiveAction / assignVercelProjectAction / assignCustomDomainAction surface a retry message on ConvexPrimaryWriteError. outreach-cadence-persist-then-send remains queued for a sibling run.",
    status: "done",
    phase: "Phase 5 — Production deploy",
    owner: "claude/quirky-davinci-dj48ao",
  },
  {
    id: "lead-snooze-convex-primary",
    summary:
      "Empty-backlog follow-up after PR #88: updateLeadSnooze still soft-fell-back on Convex failure then returned success while isFollowUpDue (PR #74) / pipeline-health / the daily digest read Convex-first lead rows — a snooze (or Unsnooze clear) on one instance could silently leave Follow-ups due / Work next / digest Send live on another (CAN-SPAM exposure both directions). Shipped: LEAD_SNOOZE_CONVEX_PRIMARY on updateLeadSnooze; snoozeLeadAction (both Snooze presets and Unsnooze share this one action) fails closed on ConvexPrimaryWriteError and surfaces a retry message to the operator instead of a false success.",
    status: "done",
    phase: "Phase 2 — Outreach + platform voice",
    owner: "claude/lead-snooze-convex-primary",
  },
  {
    id: "deploy-handoff-preserve-status-on-upsell",
    summary:
      "Empty-backlog audit after PR #86/#87: preserveDeployHandoffOperatorFields kept customDomain/vercelProjectId but buildHandoffRecord still reset status to awaiting_dns and wiped notes/vercelDomainStatus on upsell rebuild — Mark live / provisioned progress and operator audit trail silently regress after Starter→Growth. Shipped: preserve progressed status + notes + vercelDomainStatus; tryProvisionVercelDomain never downgrades live→provisioned. Queued outreach-cadence-persist-then-send for sibling.",
    status: "done",
    phase: "Phase 5 — Production deploy",
    owner: "cursor/business-process-evolution-4810",
  },
  {
    id: "outreach-cadence-persist-then-send",
    summary:
      "Empty-backlog audit follow-up (queued for sibling): recordLeadOutreach still soft-falls-back and follow-up / Email 1 actions send Resend THEN persist — Convex-first isFollowUpDue / digest can re-nudge Email 2/3 after a SQLite-only outreachStep advance (CAN-SPAM). Shipped: OUTREACH_CADENCE_CONVEX_PRIMARY (fail-closed); recordLeadOutreach takes an options param and throws ConvexPrimaryWriteError on Convex failure when requireConvex; all four callers (updateLeadStageAction Email 1, disposeColdLeadAction re-engage Email 1, sendFollowUpAction Email 2/3, addLeadAction create-in-outreach_sent Email 1) now durably mark the step BEFORE calling Resend and surface a retry message on mark failure without sending — send failure after a durable mark leaves that step off the due queue until the operator retries (accepted trade-off, matches recoverySentAt).",
    status: "done",
    phase: "Phase 2 — Outreach + platform voice",
    owner: "claude/relaxed-galileo-6ty1m2",
  },
  {
    id: "commerce-catalog-convex-primary",
    summary:
      "Empty-backlog audit after PR #94 (outreach-cadence-persist-then-send): upsertCommerceCatalog still soft-falls-back on Convex failure while getCommerceCatalog / listCommerceCatalogs (Buy now, Sync to Stripe due, pipeline-health, digest) read Convex-first — Save catalog / Sync to Stripe can return success after a SQLite-only write that leaves stripePriceId missing on other instances (Commerce Buy now blocked + false unsynced debt). Shipped: COMMERCE_CATALOG_CONVEX_PRIMARY; upsertCommerceCatalog accepts ConvexPrimaryWriteOptions and throws ConvexPrimaryWriteError when requireConvex; saveCommerceCatalogAction + syncCommerceCatalogToStripeAction fail closed and surface a retry (Sync retry is idempotent on commerceSkuStripeKey). Folded sibling a425 inquiry-reply-convex-primary feature body on merge.",
    status: "done",
    phase: "Phase 6 — Commerce",
    owner: "cursor/prompt-process-evolution-d82b",
  },
  {
    id: "inquiry-reply-convex-primary",
    summary:
      "Empty-backlog audit after PR #94 (outreach persist-then-send) left only gated NEXT_STEPS: replyToInquiryAction still sends Resend THEN soft-falls-back on recordClientInquiryReply, and updateClientInquiryStatus (mark-read on composer open / Archive) still SQLite-fallbacks — unrepliedInquiryCount / oldestUnrepliedInquiryAgeHours / digest read Convex-first, so a successful visitor reply (or mark-read) can leave the inquiry looking unreplied on other instances and risk a duplicate operator reply. Shipped: INQUIRY_REPLY_CONVEX_PRIMARY; recordClientInquiryReply + updateClientInquiryStatus accept ConvexPrimaryWriteOptions and throw ConvexPrimaryWriteError when requireConvex; replyToInquiryAction durably marks replied BEFORE Resend (persist-then-notify) and surfaces a retry on mark failure without sending; updateInquiryStatusAction fails closed the same way. Same work as sibling-queued inquiry-reply-persist-then-send (d82b). Queued cold-disposition-convex-primary + lead-notes-convex-primary; folded sibling commerce-catalog-convex-primary on merge.",
    status: "done",
    phase: "Phase 1 — Website foundation",
    owner: "cursor/business-process-evolution-a425",
  },
  {
    id: "inquiry-reply-persist-then-send",
    summary:
      "Queued by sibling prompt-process-evolution-d82b as the inquiry requireConvex + persist-then-notify follow-up — shipped on a425 as inquiry-reply-convex-primary (same implementation; both NEXT_STEPS kept on fold).",
    status: "done",
    phase: "Phase 5 — Production deploy",
    owner: "cursor/business-process-evolution-a425",
  },
  {
    id: "cold-disposition-convex-primary",
    summary:
      "Empty-backlog follow-up: applyColdLeadDisposition still soft-falls-back on Convex failure while getLeads / cold-lead badges / stage funnel read Convex-first — Re-engage/Close can succeed locally and leave cold inventory looking open (or closed) on other instances. Prefer requireConvex fail-closed on disposeColdLeadAction's disposition write (Email 1 mark already uses OUTREACH_CADENCE_CONVEX_PRIMARY).",
    status: "done",
    phase: "Phase 2 — Outreach + platform voice",
    owner: "cursor/business-process-evolution-c5ed",
  },
  {
    id: "lead-notes-convex-primary",
    summary:
      "Empty-backlog follow-up: updateLeadNotes still soft-falls-back on Convex failure while getLeads reads Convex-first — discovery-call / Email 3 notes prompts can claim success after a SQLite-only write that other instances never see (operator loses call outcomes across deploys). Prefer requireConvex fail-closed on updateLeadNotesAction.",
    status: "done",
    phase: "Phase 1 — Website foundation",
    owner: "cursor/business-process-evolution-c5ed",
  },
  {
    id: "marketing-pack-convex-primary",
    summary:
      "Empty-backlog follow-up after cold-disposition + lead-notes requireConvex: upsertMarketingPack still soft-falls-back on Convex failure while getMarketingPack / listMarketingPacksForMonth / listMarketingPacksDue (pipeline-health + digest + Email pack) read Convex-first — Generate pack can succeed locally and leave Growth/Complete fulfillment + Email pack looking missing on other instances. Shipped: MARKETING_PACK_CONVEX_PRIMARY; upsertMarketingPack accepts ConvexPrimaryWriteOptions and throws ConvexPrimaryWriteError when requireConvex; generateMarketingPackAction fails closed and surfaces an operator retry.",
    status: "done",
    phase: "Phase 6 — Marketing automation",
    owner: "cursor/prompt-process-evolution-111d",
  },
  {
    id: "client-voice-pack-convex-primary",
    summary:
      "Empty-backlog follow-up twin of marketing-pack-convex-primary: upsertClientVoicePack still soft-fell-back on Convex failure while getClientVoicePackByLeadSlug / listClientVoicePacks / listClientVoicePacksDue (pipeline-health + digest + Email voice pack) read Convex-first — Generate voice could succeed locally and leave Complete phone-script fulfillment + Email voice pack looking missing on other instances. Shipped: CLIENT_VOICE_PACK_CONVEX_PRIMARY; upsertClientVoicePack accepts ConvexPrimaryWriteOptions and throws ConvexPrimaryWriteError when requireConvex; generateClientVoicePackAction fails closed and surfaces an operator retry.",
    status: "done",
    phase: "Phase 6 — Marketing automation",
    owner: "cursor/prompt-process-evolution-1f28",
  },
  {
    id: "lead-upsert-convex-primary",
    summary:
      "Empty-backlog follow-up after marketing + voice pack requireConvex: upsertLead still soft-fell-back on Convex failure while getLeads / getLeadBySlug read Convex-first — CSV import / Add lead create paths could claim success after a SQLite-only write that other instances never see (operator loses new inventory; outreach/checkout attribution miss the lead). Shipped: LEAD_UPSERT_CONVEX_PRIMARY; upsertLead accepts ConvexPrimaryWriteOptions and throws ConvexPrimaryWriteError when requireConvex; addLeadAction / importLeadsCsvAction fail closed and surface an operator retry. Payment-stub organic checkout already uses recordLeadPayment requireConvex.",
    status: "done",
    phase: "Phase 1 — Website foundation",
    owner: "cursor/business-process-evolution-098b",
  },
  {
    id: "lead-stage-convex-primary",
    summary:
      "Empty-backlog follow-up after lead-upsert-convex-primary: updateLeadStageAction still soft-fell-back on Convex failure while getLeads / getLeadBySlug / pipeline-health / the stage funnel read Convex-first — manual stage moves (and the outreach_sent path's mixed soft-stage + fail-closed outreach mark) could leave funnel state or stage/outreachStep desynced across instances. Shipped: LEAD_STAGE_CONVEX_PRIMARY; updateLeadStageAction passes requireConvex and throws/surfaces ConvexPrimaryWriteError (Mark live already passes DEPLOY_HANDOFF_CONVEX_PRIMARY).",
    status: "done",
    phase: "Phase 1 — Website foundation",
    owner: "cursor/business-process-evolution-0b63",
  },
  {
    id: "bundle-price-env-readiness",
    summary:
      "Empty-backlog follow-up after lead-stage-convex-primary closed the CRM write requireConvex chain: checkout still fails only at session-create time when required STRIPE_PRICE_ID_* env vars are missing — operators get no earlier dashboard/docs signal that every sale is blocked. Shipped: assessBundlePriceEnvReadiness (BUNDLES + COMMERCE_ADDON) + BundlePriceEnvBanner on /dashboard and /dashboard/leads + launch-checklist/architecture/roadmap notes. Does not fake-complete stripe-price-objects (bootstrap + paste secrets stays operator-gated).",
    status: "done",
    phase: "Phase 3 — Payments",
    owner: "cursor/business-process-evolution-3eea",
  },
  {
    id: "commerce-payouts-unpaid-ledger-completeness",
    summary:
      "Empty-backlog audit while sibling owns bundle-price-env-readiness: owed Commerce surfaces (manual payout panel, digest, pipeline-health) and Mark paid out lookup all call listCommerceOrders() which caps at 200/500 newest rows — older unpaid Buy now orders vanish from owed totals and can fail Mark paid out with 'not found'. Prefer listUnpaidCommerceOrders + getCommerceOrderByStripeSessionId (no recent-page truncation) for reconciliation until Connect.",
    status: "done",
    phase: "Phase 8 — Commerce",
    owner: "cursor/prompt-process-evolution-63a8",
  },
  {
    id: "stripe-bootstrap-prices-test-coverage",
    summary:
      "Empty-backlog audit after PR #107/#108's re-confirmed-clean escapeHtmlForEmail/Convex-API-map/payout-panel sweep: src/lib/pricing/bootstrap-stripe-prices.ts (the Stripe Price bootstrap logic behind the gated stripe-price-objects operator step — touched 4x in the last 30 days) had zero test coverage and duplicated the has_more/starting_after pagination loop that src/lib/commerce/stripe-sync.ts already implements against a minimal structural Stripe interface (the exact pattern AGENT_PROTOCOL requires for testability). bootstrap-stripe-prices.ts instead imported the full `Stripe` SDK class for its client parameter type, which is why it never got the fake-client unit tests stripe-sync.ts has — including the page-1-only-lookup regression class AGENT_PROTOCOL already flags as a real risk once an account holds >100 active Products/Prices (trivial after a few Commerce catalog syncs). Shipped: src/lib/stripe/list-all-pages.ts (shared pagination helper, also adopted by stripe-sync.ts in the same commit — no behavior change there); bootstrap-stripe-prices.ts now takes StripeProductsAndPricesForBootstrap (minimal structural interface) instead of the full Stripe SDK type; bootstrap-stripe-prices.test.ts (7 tests: create, idempotent reuse, stale-price repricing, one-time-vs-recurring disambiguation, full env var coverage, >100-Product pagination). No behavior change to the idempotency contract or the bootstrap-prices route.",
    status: "done",
    phase: "Phase 3 — Payments",
    owner: "claude/quirky-davinci-b0l1eb",
  },
  {
    id: "billing-portal-testable-refactor",
    summary:
      "Empty-backlog audit after PR #109 (bootstrap-stripe-prices coverage): src/lib/billing/create-portal-session.ts — the orchestration behind both billing-portal call sites (operator 'Manage billing' in dashboard/leads and the customer self-serve /api/stripe/billing-portal route) — had zero test coverage. Unlike stripe-sync.ts / bootstrap-stripe-prices.ts, it constructed `new Stripe(secretKey)` internally instead of taking the client as a parameter behind a minimal structural interface, so it never got fake-client unit tests. Real logic worth covering: resolveCustomerId's stored-id-vs-Checkout-Session-retrieve fallback (including the retrieve throwing), latestEligibleOrder filtering by leadSlug, the mode===\"subscription\" OR orderEligibleForBillingPortal eligibility branch, and every 400/404/501/502 status path. Shipped: StripeBillingPortalClient minimal structural interface; createBillingPortalForLead / createBillingPortalForCheckoutSession now take the Stripe client as a parameter (client construction + STRIPE_SECRET_KEY gating moved to the two call sites, matching the syncCommerceCatalogToStripe / archiveOrphanCommerceStripeProducts precedent already in dashboard/leads/actions.ts); create-portal-session.test.ts (18 tests). No behavior change to either call site's status codes or error copy.",
    status: "done",
    phase: "Phase 3 — Payments",
    owner: "claude/upbeat-dijkstra-j03ldn",
  },
  {
    id: "fulfillment-debt-list-completeness",
    summary:
      "Empty-backlog audit after PR #106/#109: listMarketingPacksForMonth / listClientVoicePacks / listCommerceCatalogs still capped at 100/200 newest rows (Convex .take unordered) while listMarketingPacksDue / listClientVoicePacksDue / listCommerceCatalogsMissing / listCommerceCatalogsUnsynced treat absence-from-the-page as missing — past the window a fulfilled lead looks due (false Generate debt) and an unsynced catalog can look synced (Buy now stays broken). Same newest-page undercount class as commerce-payouts-unpaid-ledger-completeness. Shipped: uncapped .collect() + SQLite without LIMIT; newest-first sort on Convex; truncation regression tests. Queued unreplied-inquiry-list-completeness.",
    status: "done",
    phase: "Phase 8 — Commerce",
    owner: "cursor/prompt-process-evolution-4546",
  },
  {
    id: "unreplied-inquiry-list-completeness",
    summary:
      "Empty-backlog follow-up after fulfillment-debt-list-completeness: unrepliedInquiryCount / oldestUnrepliedInquiryAgeHours / digest unreplied section still fed from listClientInquiries(20) on /dashboard, (50) on /dashboard/leads, and (100) in sendDailyDigestAction — an unreplied inquiry older than the N newest total inquiries vanished from Starter CRM health. Shipped listUnrepliedInquiries (uncapped status new+read) via convex/inquiries.listUnreplied (two by_status index scans merged + sorted) and a SQLite WHERE status IN ('new','read') fallback, registered on the static Convex API map. Wired into pipeline-health + digest only on all three call sites; /dashboard/leads keeps its separate capped listClientInquiries(50) fetch for the inbox UI (LeadsClient initialInquiries) alongside the new uncapped fetch for computePipelineHealth. Truncation-regression tests added to pipeline-health.test.ts and daily-digest.test.ts mirroring the fulfillment-debt-list-completeness pattern.",
    status: "done",
    phase: "Phase 6 — Client inquiry CRM",
    owner: "claude/relaxed-galileo-ez3zfp",
  },
  {
    id: "bundle-webhook-side-effect-recovery-on-redelivery",
    summary:
      "Empty-backlog audit after PR #109 (bootstrap-stripe-prices test coverage): Commerce Buy now already recovers missing inquiry/client receipt on Stripe redelivery via planCommerceWebhookSideEffects, but the bundle (Starter/Growth/Complete) webhook still early-broke on alreadyRecorded and skipped sendReceiptEmail + DNS handoff email forever — so a first delivery that recorded payment/handoff then failed before Resend permanently lost buyer receipt and go-live DNS instructions. Shipped: planBundleWebhookSideEffects + durable handoff-note sent-markers (bundleReceiptEmailSentNote / bundleDnsHandoffEmailSentNote) per stripeSessionId; webhook recovers only the missing email(s) on retry; marker writes after successful send fail closed (bundle_email_sent_marker 5xx). Twin of commerce-webhook-side-effect-recovery-on-redelivery.",
    status: "done",
    phase: "Phase 3 — Payments",
    owner: "cursor/business-process-evolution-a0bf",
  },
  {
    id: "commerce-webhook-inquiry-idempotency-list-completeness",
    summary:
      "Empty-backlog audit after unreplied-inquiry-list-completeness: commerce Buy now webhook feeds planCommerceWebhookSideEffects from listClientInquiriesBySlug (default 50 / max 200 newest) — once a lead has more contact/Request-order/Buy-now inquiries than that window, an older commerce_checkout inquiry embedding stripeSessionId falls off the page and Stripe redelivery falsely recovers (duplicate operator inbox + duplicate client order-notification email). Same newest-page truncation class as unpaid ledger / fulfillment-debt / unreplied health. Shipped: listCommerceCheckoutInquiriesBySlug (source=commerce_checkout only, uncapped) via convex/inquiries.listCommerceCheckoutBySlug + SQLite WHERE source='commerce_checkout'; wired into the webhook; truncation regression in side-effect-recovery.test.ts.",
    status: "done",
    phase: "Phase 8 — Commerce",
    owner: "cursor/prompt-process-evolution-0ed2",
  },
  {
    id: "resend-brand-name-html-escape",
    summary:
      "Empty-backlog audit after unreplied-inquiry-list-completeness (PR #113) + sibling commerce-webhook-inquiry-idempotency-list-completeness (PR #114): src/lib/email/resend.ts still interpolated brand.name (and CAN-SPAM footer brand.legalEntity / brand.postalAddress) raw into outbound HTML — outreach Email 1/2/3, abandoned checkout, inquiry reply, Starter upsell, receipt, and the shared sendEmail footer — while marketing/voice pack delivery, commerce client receipt, commerce abandoned recovery, and the Stripe webhook DNS handoff already used escapeHtmlForEmail(brand.name). Shipped: escapeHtmlForEmail on all resend.ts HTML brand.* sites + footer; Vitest coverage for footer + signatures (outreach, upsell, receipt, inquiry reply). Subject/From stay plain text.",
    status: "done",
    phase: "Phase 2 — Outreach",
    owner: "cursor/business-process-evolution-872f",
  },
  {
    id: "list-all-pages-unit-coverage",
    summary:
      "Empty-backlog audit after PR #115 (resend-brand-name-html-escape): src/lib/stripe/list-all-pages.ts — the shared has_more/starting_after pagination helper extracted for stripe-sync + bootstrap-stripe-prices (PR #109) and named by AGENT_PROTOCOL as the next free coverage target — still had zero direct unit tests. Only exercised indirectly via those callers. Shipped: list-all-pages.test.ts (6 tests: single-page, multi-page starting_after walk, until early-stop on match page, until match on later page, empty-page guard, empty first page). Sibling prompt-process-evolution-dd75 shipped complementary unpaid-ledger truncation guards + unsubscribe escapeHtml consolidation in the same window.",
    status: "done",
    phase: "Phase 3 — Payments",
    owner: "cursor/business-process-evolution-f726",
  },
  {
    id: "commerce-unpaid-ledger-truncation-regression-tests",
    summary:
      "Empty-backlog after PR #106/#115: listUnpaidCommerceOrders is wired at dashboard/digest call sites, and orders.test.ts documents newest-N undercount, but computePipelineHealth + buildDailyDigest lacked the truncation-regression guard unreplied-inquiry and fulfillment-debt already have. Without it, a future re-wire to capped listCommerceOrders silently drops older unpaid Buy now rows from owed totals (operator double-pay risk). Shipped: mirror truncation tests at the health/digest boundary (unpaid-only set keeps older liability; newest-N paid-out page reports $0 owed).",
    status: "done",
    phase: "Phase 8 — Commerce",
    owner: "cursor/prompt-process-evolution-dd75",
  },
  {
    id: "unsubscribe-escape-html-consolidation",
    summary:
      "Empty-backlog escapeHtml asymmetry after PR #105 (digest) + PR #115 (brand.*): GET /api/unsubscribe still used a private escapeHtml() that emits &#039; for apostrophe instead of the shared escapeHtmlForEmail (&#39;). Same second-escaper drift class. Shipped: import escapeHtmlForEmail; drop the private helper; route-level apostrophe + metacharacter regression tests.",
    status: "done",
    phase: "Phase 2 — Outreach",
    owner: "cursor/prompt-process-evolution-dd75",
  },
  {
    id: "marketing-anthropic-generator-unit-coverage",
    summary:
      "Empty-backlog after PR #117 (list-all-pages + unpaid-ledger truncation + unsubscribe escaper): AGENT_PROTOCOL named generator/pack branch coverage next. StubMarketingGenerator was only lightly exercised via monthly-pack.test.ts; AnthropicMarketingGenerator (empty-key fallback, HTTP/parse/length mismatch → stub, packageTier for generate_schedule_optimize, hashtag/body sanitization) had zero direct tests. Shipped: generators.test.ts (14 tests) locking those sold Growth/Complete fulfillment branches. Sibling can take voice-anthropic-generator-unit-coverage (different module).",
    status: "done",
    phase: "Phase 6 — Marketing automation",
    owner: "cursor/business-process-evolution-7337",
  },
  {
    id: "voice-anthropic-generator-unit-coverage",
    summary:
      "Twin of marketing-anthropic-generator-unit-coverage for Complete phone scripts: StubClientVoiceGenerator was only lightly exercised via faq-pack.test.ts; AnthropicClientVoiceGenerator (empty-key fallback, HTTP/parse/length mismatch → stub, successful JSON parse, title fallback, every scriptType stub path) had zero direct tests. Shipped: src/lib/voice/generators.test.ts with mocked fetch — locks sold Complete voice-pack fulfillment branches without calling live Anthropic.",
    status: "done",
    phase: "Phase 2 — Outreach + platform voice",
    owner: "cursor/prompt-process-evolution-8d92",
  },
  {
    id: "marketing-build-request-unit-coverage",
    summary:
      "Empty-backlog after PR #118/#119 (marketing + voice Anthropic generator suites): src/lib/marketing/build-request.ts (businessContextFromLead + monthlyPackRequestForLead) still only exercised indirectly via monthly-pack stub smoke — empty services/hours defaults, growth vs complete packageTier/automationLevel, and explicit automationLevel override had no direct tests. Shipped: build-request.test.ts locking those sold Growth/Complete request-shape branches. Sibling-friendly twin: voice-build-request-unit-coverage.",
    status: "done",
    phase: "Phase 6 — Marketing automation",
    owner: "cursor/prompt-process-evolution-4792",
  },
  {
    id: "voice-build-request-unit-coverage",
    summary:
      "Twin of marketing-build-request-unit-coverage for Complete phone scripts: src/lib/voice/build-request.ts (clientVoiceBusinessContextFromLead + clientVoicePackRequestForLead) was only lightly exercised via faq-pack.test.ts happy path — empty services→[\"our services\"], empty hours→undefined, omitted optional state/phone/tagline, and CLIENT_VOICE_FAQ_SCRIPT_TYPES composition need direct coverage. Shipped: src/lib/voice/build-request.test.ts locking those sold Complete request-shape branches.",
    status: "done",
    phase: "Phase 7 — Client AI phone",
    owner: "cursor/business-process-evolution-5383",
  },
  {
    id: "convex-orders-list-newest-first",
    summary:
      "Defense-in-depth after billing-portal-orders-newest-first: listOrders sorted Convex rows only in db.ts via sortOrdersNewestFirst while convex/orders.list returned unordered .collect(). Shipped: sort newest-first by createdAt at the Convex source; keep db.ts sortOrdersNewestFirst as belt-and-suspenders so Billing Portal latestEligibleOrder cannot reopen against a stale order missing stripeCustomerId.",
    status: "done",
    phase: "Phase 3 — Payments",
    owner: "cursor/prompt-process-evolution-4792",
  },
  {
    id: "seo-helpers-unit-coverage",
    summary:
      "Empty-backlog after PR #120 (marketing/voice build-request coverage + convex-orders-list-newest-first) — only gated secrets/OAuth/counsel remained. src/lib/seo.ts backs the Starter-sold 'Basic SEO' promise (canonical URL, per-page metadata, LocalBusiness JSON-LD) and had zero direct tests: siteUrl()'s three-way env precedence (NEXT_PUBLIC_APP_URL trimmed+trailing-slash-stripped > VERCEL_URL > localhost default) and the per-category schema.org @type mapping were unlocked. Shipped: src/lib/seo.test.ts (14 tests) locking siteUrl precedence/trimming, previewUrl composition, leadMetaTitle/Description, and leadLocalBusinessJsonLd (per-category @type + nested PostalAddress).",
    status: "done",
    phase: "Phase 1 — Website foundation",
    owner: "claude/upbeat-dijkstra-t4ass7",
  },
  {
    id: "preview-jsonld-script-escape",
    summary:
      "Security audit while free NEXT_STEPS backlog stayed gated: /preview/[slug] (public, unauthenticated) embedded leadLocalBusinessJsonLd via dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} — JSON.stringify does not escape '<', so a lead field (businessName/description/address/city/state — free text from CSV import or a future Places scrape, not just operator-typed) containing the literal '</script>' would prematurely close the JSON-LD <script> tag and let an attacker-controlled '<script>' after it execute for every real site visitor (stored XSS). Sibling claude/upbeat-dijkstra-t4ass7's seo-helpers-unit-coverage (merged first as PR #122) tested leadLocalBusinessJsonLd's shape but never exercised the dangerouslySetInnerHTML call site, so it did not catch this. No prior escapeHtmlForEmail/requireConvex/truncation audit covered this file either — those all scoped to outbound email HTML, not page-rendered JSON-LD. Shipped: safeJsonLdScript (src/lib/seo.ts) escaping '<' to \\u003c before embedding (JSON.parse still recovers an identical object); wired into the one dangerouslySetInnerHTML call site in the codebase; folded into the merged seo.test.ts (which now also covers the </script> breakout attempts in businessName and address).",
    status: "done",
    phase: "Phase 1 — Website foundation",
    owner: "claude/relaxed-galileo-e13pc6",
  },
  {
    id: "stripe-webhook-route-test-coverage",
    summary:
      "Free NEXT_STEPS backlog stayed fully gated (stripe-price-objects / lead-ingestion / marketing-content-scheduling / commerce-payouts-stripe-connect); a Convex/SQLite parity, webhook-idempotency, HTML-escaping, and truncation audit found no new bugs (all previously-shipped guards held). src/app/api/stripe/webhook/route.ts — the single highest money-criticality file in the repo (bundle payment + handoff, Commerce Buy now ledger, both with redelivery recovery) — had zero direct test coverage; only its extracted pure decision helpers (planBundleWebhookSideEffects, planCommerceWebhookSideEffects) were tested in isolation, not the orchestration itself (ordering, 5xx-per-failure-step, the commerce_sku vs bundle branch split). Shipped route.test.ts: signature/config failures, bundle first-delivery + redelivery skip/recovery + all three 5xx fulfillment steps, commerce first-delivery + redelivery skip/recovery + missing-skuId/missing-slug guards + both 5xx fulfillment steps, and best-effort-vs-durable email/marker distinctions for both branches.",
    status: "done",
    phase: "Phase 3 — Payments",
    owner: "claude/quirky-davinci-jyedzb",
  },
  {
    id: "stripe-checkout-route-test-coverage",
    summary:
      "Empty-backlog after PR #124 (stripe-webhook-route-test-coverage): create-side twin of the webhook suite. src/app/api/stripe/checkout/route.ts is the only path that starts every Starter/Growth/Complete (+ Commerce add-on) sale — organic slug minting, Price ID line items, requireConvex fail-closed session tracking, and cancel URL attribution — and had zero direct route tests (helpers organic-attribution + session-persist were covered in isolation). Shipped route.test.ts (15 tests): missing secret/Price-env 501s, invalid JSON / unknown tier 400s, Starter payment + Growth subscription + Commerce add-on line items, organic-* mint + whitespace-slug mint + cancel URL attribution, missing-url / Stripe-throw / ConvexPrimaryWriteError / generic tracking 502s. Sibling claimed the same todo ~55s later (claim-only); earlier remote claim owns — sibling should take commerce-checkout-route-test-coverage.",
    status: "done",
    phase: "Phase 3 — Payments",
    owner: "cursor/business-process-evolution-f32f",
  },
  {
    id: "commerce-checkout-route-test-coverage",
    summary:
      "Sibling twin of stripe-checkout-route-test-coverage for Commerce Buy now: POST /api/commerce/checkout resolves stripePriceId server-side from the catalog (never trusts client price), records kind=commerce_sku + skuId for abandoned-cart tracking, and fail-closes on CHECKOUT_SESSION_CREATE_CONVEX_PRIMARY. Shipped route.test.ts (12 tests): missing secret 501, invalid JSON / missing slug|skuId 400s, unknown catalog/item 404, unsynced SKU 501, payment session from server-resolved price (client price/stripePriceId ignored), trim slug/skuId, missing-url / Stripe-throw / ConvexPrimaryWriteError / generic tracking 502s. Folded sibling stripe-checkout ITERATION after dual-claim pivot.",
    status: "done",
    phase: "Phase 8 — Commerce",
    owner: "cursor/prompt-process-evolution-7d1d",
  },
  {
    id: "billing-portal-route-test-coverage",
    summary:
      "Empty-backlog after PR #125/#126 (stripe/commerce checkout route coverage) — only stripe-price-objects / lead-ingestion / marketing-content-scheduling / commerce-payouts-stripe-connect remained, all secrets/OAuth/counsel-gated. createBillingPortalForCheckoutSession (src/lib/billing/create-portal-session.ts) already had direct helper coverage, but src/app/api/stripe/billing-portal/route.ts — the customer self-serve entry point from /checkout/success for every Growth/Complete/Commerce subscriber — had zero route-level tests, the same orchestration gap already closed for stripe/checkout, commerce/checkout, and stripe/webhook. Shipped route.test.ts (12 tests): invalid JSON / missing / whitespace-only sessionId 400s, missing STRIPE_SECRET_KEY 501, returnUrl derivation (explicit body value > NEXT_PUBLIC_APP_URL > request origin, both defaulting to /checkout/success?session_id=), and status/error passthrough from the helper (400 not-complete, 400 no-recurring-plan, 404 no-customer, 502 no-url, 502 retrieve-throws). Mocks only the Stripe SDK and @/lib/db (server-only guard), matching the other route suites' pattern. Later dual-claim on business-process-evolution-df21 pivoted to marketing-generate-route-test-coverage.",
    status: "done",
    phase: "Phase 3 — Payments",
    owner: "claude/relaxed-galileo-gks8ei",
  },
  {
    id: "bootstrap-prices-route-test-coverage",
    summary:
      "Sibling twin of billing-portal-route-test-coverage: POST /api/stripe/bootstrap-prices gates on ALLOW_STRIPE_BOOTSTRAP=1 (403 when unset / non-1), requires STRIPE_SECRET_KEY (501), returns ok+results+envSnippet on success, and 502s on Stripe throw (Error message + non-Error fallback). bootstrap-stripe-prices + list-all-pages already have lib coverage — this locks the route's opt-in gate + response shape an operator copies into secrets. Shipped route.test.ts (6 tests). Claimed by cursor/prompt-process-evolution-aaf5 while siblings shipped billing-portal (PR #127) and marketing-generate (PR #128).",
    status: "done",
    phase: "Phase 3 — Payments",
    owner: "cursor/prompt-process-evolution-aaf5",
  },
  {
    id: "marketing-generate-route-test-coverage",
    summary:
      "Empty-backlog after PR #126 + billing-portal claimed by gks8ei (PR #127) + bootstrap-prices claimed by aaf5: POST /api/marketing/generate is the operator-authenticated ad-hoc marketing generation route (prefer generateMarketingPackAction for persisted packs). Auth 401 / JSON + contentTypes + automationLevel + business validation / stub-vs-LLM response shape had zero direct route tests — generators.test.ts covers the LLM path, not the route gates. Shipped route.test.ts: auth 401, invalid JSON / missing leadId / empty contentTypes / invalid types / automationLevel / business shape 400s, stub messaging with and without ANTHROPIC_API_KEY, Anthropic success messaging.",
    status: "done",
    phase: "Phase 6 — Marketing automation",
    owner: "cursor/business-process-evolution-df21",
  },
  {
    id: "pricing-bundles-unit-coverage",
    summary:
      "Empty-backlog after PR #129 (every Stripe-facing API route + marketing/generate now have route orchestration coverage) — only stripe-price-objects / lead-ingestion / marketing-content-scheduling / commerce-payouts-stripe-connect remain, all secrets/OAuth/counsel-gated. src/lib/pricing/bundles.ts is the display + env-name source of truth for Starter/Growth/Complete + Commerce add-on (checkout UI, tier upsell, bootstrap-stripe-prices, price-env-readiness) and had zero direct tests — only exercised indirectly via readiness/bootstrap suites that import the constants. Shipped: bundles.test.ts locking sold USD amounts, Stripe Price env var names, Starter monthly=null, and getBundle lookup so a silent price/env drift cannot ship without failing Vitest. Sibling-friendly leftovers: brand-helpers-unit-coverage, demo-catalog-unit-coverage, category-themes-unit-coverage.",
    status: "done",
    phase: "Phase 3 — Payments",
    owner: "cursor/prompt-process-evolution-35a5",
  },
  {
    id: "brand-helpers-unit-coverage",
    summary:
      "Empty-backlog after PR #129 (bootstrap-prices route coverage) — only gated secrets/OAuth/counsel remained. src/lib/brand.ts is the CAN-SPAM / two-layer branding source of truth for every outbound email footer + Stripe seller identity, but had zero direct tests: NEXT_PUBLIC_BRAND_NAME > NEXT_PUBLIC_APP_NAME > fallback precedence, legalEntity/legalLocation/postalAddress legacy env aliases, whitespace-only treated as unset, and marketingFooterLine / legalEntityLine / outreachSenderLine composition. Shipped: brand getters (env read at access time) + trim/whitespace-as-unset parity with price-env-readiness; brand.test.ts (20 tests) including deprecated company re-exports. Sibling prompt-process-evolution-35a5 claimed pricing-bundles-unit-coverage in the same window (PR #130).",
    status: "done",
    phase: "Phase 1 — Website foundation",
    owner: "cursor/business-process-evolution-8134",
  },
  {
    id: "demo-catalog-unit-coverage",
    summary:
      "Empty-backlog after PR #131 (brand-helpers + pricing-bundles) — only stripe-price-objects / lead-ingestion / marketing-content-scheduling / commerce-payouts-stripe-connect remain gated. src/lib/leads/demo-catalog.ts backs /preview/[slug] fallback rendering (resolvePreviewLead category inference + recommendedTier) and DEMO_LEADS seed data for operator sanity-checks; had zero direct tests. Shipped: demo-catalog.test.ts locking catalog slug lookup, restaurant/salon/trades/generic keyword inference (case-insensitive), title-case businessName, recommendedTier mapping, and countLeadsByStage. Sibling-friendly leftover: category-themes-unit-coverage (src/lib/previews/themes.ts).",
    status: "done",
    phase: "Phase 1 — Website foundation",
    owner: "cursor/business-process-evolution-cae5",
  },
  {
    id: "category-themes-unit-coverage",
    summary:
      "Sibling twin of demo-catalog-unit-coverage: src/lib/previews/themes.ts (CATEGORY_THEMES + getCategoryTheme) drives category-specific preview shells for restaurant/salon/trades/generic — sold Starter capability with no direct Vitest yet. Shipped: themes.test.ts locking the four BusinessCategory keys, sold labels/hero eyebrows/accent+CTA classes, distinct full-bleed gradient shells, and getCategoryTheme identity with the map. Folded sibling demo-catalog-unit-coverage (cae5). Remaining NEXT_STEPS stay operator/legal-gated.",
    status: "done",
    phase: "Phase 1 — Website foundation",
    owner: "cursor/prompt-process-evolution-fa0a",
  },
  {
    id: "stripe-bootstrap-dashboard-action",
    summary:
      "Empty-backlog after PR #133 (demo-catalog + category-themes coverage) — only stripe-price-objects / lead-ingestion / marketing-content-scheduling / commerce-payouts-stripe-connect remain gated. The #1 sale blocker is missing STRIPE_PRICE_ID_* secrets; operators previously had to curl POST /api/stripe/bootstrap-prices with ALLOW_STRIPE_BOOTSTRAP=1. Shipped: assessStripeBootstrapGate (shared with the API route), bootstrapStripePricesAction (operator-auth'd), Run bootstrap + copyable envSnippet on the checkout-blocked banner. Does not fake-complete stripe-price-objects — paste secrets + unset flag still required.",
    status: "done",
    phase: "Phase 3 — Payments",
    owner: "cursor/business-process-evolution-a606",
  },
  {
    id: "contact-form-route-orchestration-test-coverage",
    summary:
      "Empty-backlog after PR #133 — only gated secrets/OAuth/counsel remain. Sibling business-process-evolution-a606 claimed stripe-bootstrap-dashboard-action (operator Price bootstrap UX). POST /api/contact/[slug] had only HTML-escape route coverage; contact-persist.test.ts does not exercise route orchestration (CONTACT_FORM_CONVEX_PRIMARY pass-through, persist-required 503, notify-only-after-persist, validation). Shipped: route-level Vitest locking Convex-primary pass-through, 400 validation, persist-required 503 (missing inquiryId + ConvexPrimaryWriteError), notify-only-after-persist, best-effort notify failure, form-urlencoded, and HTML escape. Sibling-friendly twin: unsubscribe-route-orchestration-test-coverage.",
    status: "done",
    phase: "Phase 5 — Client sites + handoff",
    owner: "cursor/prompt-process-evolution-cb7f",
  },
  {
    id: "unsubscribe-route-orchestration-test-coverage",
    summary:
      "Sibling twin of contact-form-route-orchestration-test-coverage. GET /api/unsubscribe had only HTML-escape route coverage; no test exercised missing-email 400, UNSUBSCRIBE_CONVEX_PRIMARY pass-through to suppressEmail, or the ConvexPrimaryWriteError-vs-generic-error 500 branches. Shipped: route-level Vitest locking the CAN-SPAM suppress fail-closed contract (missing/empty-email 400, UNSUBSCRIBE_CONVEX_PRIMARY pass-through, 500-with-retry-message on ConvexPrimaryWriteError vs generic 500 on any other error) plus the existing HTML-escape regression.",
    status: "done",
    phase: "Phase 5 — Client sites + handoff",
    owner: "claude/relaxed-galileo-fys8gf",
  },
  {
    id: "unsubscribe-token-signing",
    summary:
      "Security audit while free NEXT_STEPS backlog stayed gated: GET /api/unsubscribe?email=X suppressed X for anyone who merely knew the address — no signature, no rate limit, no format check — and isEmailSuppressed gates every sendEmail() call (outreach, receipts, marketing/voice pack delivery, Commerce receipts, Starter upsell, post-payment DNS handoff), so a scraper could silently and permanently suppress outreach or, worse, a paying customer's receipt/DNS instructions. Shipped: signUnsubscribeToken / verifyUnsubscribeToken (src/lib/email/unsubscribe-token.ts, HMAC keyed on RESEND_API_KEY — already a required production secret, no new operator setup); sendEmail's footer link now embeds &token=; the route rejects a missing/mismatched token with 400 before calling suppressEmail. Folded into the same route.test.ts as unsubscribe-route-orchestration-test-coverage (sibling landed the same cron window) — every test now signs a real token so the persistence/error-path assertions above still exercise the branches they were written to lock, not the new 400 gate.",
    status: "done",
    phase: "Phase 2 — Outreach + platform voice",
    owner: "claude/upbeat-dijkstra-o8942x",
  },
  {
    id: "public-write-rate-limiting",
    summary:
      "unsubscribe-token-signing (PR #137) flagged that no public write endpoint has rate limiting — POST /api/contact/[slug], POST /api/stripe/checkout, POST /api/commerce/checkout, and POST /api/preview/[slug]/open could all be hit unboundedly by a script (contact-form spam, Stripe Checkout Session churn, preview-open beacon flooding). Shipped src/lib/security/rate-limit.ts — a pure, dependency-free fixed-window counter (checkRateLimit, default 20 req/60s) keyed on `${routeName}:${clientIp}` (clientIpFromHeaders reads x-forwarded-for/x-real-ip, falling back to a shared \"unknown\" bucket). All four routes now check the limiter first and return 429 + Retry-After on exceed. Explicitly documented as per-instance, best-effort — no shared/distributed store (no Upstash/Redis), consistent with this codebase not fake-completing airtight-sounding solutions. Direct Vitest on the limiter (window edges, reset-after-window, distinct-key isolation, retryAfterSeconds rounding) plus a 429-after-limit test extended onto each route's existing route.test.ts (not a parallel file); stripe/checkout and commerce/checkout route.test.ts call the new resetRateLimiterForTests() in beforeEach since those two files reuse one module instance across all `it` blocks (no vi.resetModules()) — without it the pre-existing ~15/~12 same-IP test requests per file would have tripped the limiter and broken CI.",
    status: "done",
    phase: "Phase 5 — Client sites + handoff",
    owner: "claude/quirky-davinci-swhbug",
  },
  {
    id: "unsubscribe-get-rate-limiting",
    summary:
      "Empty-backlog after PR #138 (public-write-rate-limiting) — only gated secrets/OAuth/counsel remain. That PR hardened four POST write routes but left GET /api/unsubscribe — the only remaining public, unauthenticated, state-changing endpoint — unbounded. Token signing (PR #137) blocks forged suppressions, but a harvested footer link or a script hammering HMAC verification + suppressEmail still had no throttle. Shipped: reuse checkRateLimit (`unsubscribe:${clientIp}`) before token verify; return 429 + Retry-After (plain-text, matching the route's response style). Extended route.test.ts with a 429-after-limit case; resetRateLimiterForTests in beforeEach. Sibling-friendly twin on e756: stripe-core-env-readiness.",
    status: "done",
    phase: "Phase 2 — Outreach + platform voice",
    owner: "cursor/prompt-process-evolution-6d42",
  },
  {
    id: "stripe-core-env-readiness",
    summary:
      "Empty-backlog after public-write-rate-limiting: BundlePriceEnvBanner only covers STRIPE_PRICE_ID_* — operators still get no early dashboard signal when STRIPE_SECRET_KEY / NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY / STRIPE_WEBHOOK_SECRET are missing. Missing secret key → checkout 501; missing webhook secret → Stripe can charge while CRM/handoff never records (silent fulfillment failure). Shipped: assessStripeCoreEnvReadiness + StripeCoreEnvBanner on /dashboard + /dashboard/leads + launch-checklist/architecture/roadmap notes. Sibling 6d42 owns unsubscribe-get-rate-limiting.",
    status: "done",
    phase: "Phase 3 — Payments",
    owner: "cursor/business-process-evolution-e756",
  },
  {
    id: "proxy-routing-test-coverage",
    summary:
      "Empty-backlog after PR #140 (stripe-core-env-readiness + unsubscribe-get-rate-limiting) — only gated secrets/OAuth/counsel remain. src/proxy.ts orchestrates dashboard auth gate + Starter preview-subdomain rewrite + custom-domain rewrite, but helper suites (custom-domain-routing.test.ts, operator.test.ts) do not lock the ordering or fail-closed paths (preview subdomain before isPlatformHost; unrecognized subdomain must not rewrite; /api and /dashboard must never Host-divert; auth redirect when password set). Shipped: src/proxy.test.ts (10 tests) locking auth gate, preview-subdomain rewrite + unrecognized-label next(), custom-domain rewrite, platform-host skip of DB lookup, and never Host-divert /api/* or /dashboard/*. Sibling efe4 owns resend-email-env-readiness.",
    status: "done",
    phase: "Phase 5 — Client sites + handoff",
    owner: "cursor/business-process-evolution-cbbe",
  },
  {
    id: "resend-email-env-readiness",
    summary:
      "Empty-backlog after PR #140 (unsubscribe-get-rate-limiting + stripe-core-env-readiness). Stripe banners cover payment secrets, but operators still get no early dashboard signal when RESEND_API_KEY is missing or a placeholder — every outreach / receipt / recovery / pack / digest path silently mock-sends. Shipped: assessResendEmailEnvReadiness + ResendEnvBanner on /dashboard + /dashboard/leads + launch-checklist/architecture/roadmap notes. Sibling cbbe owns proxy-routing-test-coverage.",
    status: "done",
    phase: "Phase 2 — Outreach + platform voice",
    owner: "cursor/prompt-process-evolution-efe4",
  },
  {
    id: "stripe-bootstrap-dashboard-action-test-coverage",
    summary:
      "Empty-backlog after PR #141 (resend-email-env-readiness + proxy-routing-test-coverage) — only gated secrets/OAuth/counsel remain. stripe-bootstrap-dashboard-action (PR #134) shipped bootstrapStripePricesAction on the checkout-blocked banner, but only assessStripeBootstrapGate + POST /api/stripe/bootstrap-prices had Vitest — the operator-auth'd dashboard action (auth fail, gate fail, success envSnippet, Stripe throw) had zero coverage. Shipped: src/app/dashboard/actions.test.ts locking requireOperatorAuth + assessStripeBootstrapGate + bootstrapStripePrices wiring. Sibling-friendly twin: checkout-recovery-actions-orchestration-test-coverage.",
    status: "done",
    phase: "Phase 3 — Payments",
    owner: "cursor/prompt-process-evolution-29a6",
  },
  {
    id: "checkout-recovery-actions-orchestration-test-coverage",
    summary:
      "Empty-backlog after PR #141. Dual-claim: 29a6 earlier remote claim owns stripe-bootstrap-dashboard-action-test-coverage; this branch pivoted to the twin they left free. sendCheckoutRecoveryAction / sendCommerceCheckoutRecoveryAction are the operator Finish-checkout / Buy now recovery paths (persist-then-notify + CHECKOUT_RECOVERY_SENT_CONVEX_PRIMARY) but had zero action-level Vitest — helper suites do not lock auth, kind mismatch, missing email, mark-before-send, or ConvexPrimaryWriteError skip-send. Shipped: checkout-recovery-actions.test.ts.",
    status: "done",
    phase: "Phase 3 — Payments",
    owner: "cursor/business-process-evolution-3a4a",
  },
  {
    id: "anthropic-env-readiness",
    summary:
      "Empty-backlog after PR #143 (checkout-recovery + bootstrap-action Vitest). Growth/Complete marketing + Complete voice packs silently fall back to Stub* generators when ANTHROPIC_API_KEY is missing/placeholder — operators had no dashboard signal that sold AI copy is stub quality. Shipped: assessAnthropicEnvReadiness + AnthropicEnvBanner on /dashboard + /dashboard/leads + launch-checklist/architecture/roadmap/marketing-automation notes.",
    status: "done",
    phase: "Phase 6 — Marketing automation",
    owner: "cursor/business-process-evolution-849c",
  },
  {
    id: "generate-marketing-pack-action-test-coverage",
    summary:
      "Empty-backlog twin after anthropic-env-readiness: generateMarketingPackAction is the operator Generate pack path for sold Growth/Complete fulfillment (requireConvex + Anthropic/stub), but only generators/monthly-pack/route suites exist — no action-level Vitest for auth, eligibility, or persist wiring. Shipped: generate-marketing-pack-action.test.ts (11 tests). Sibling-friendly twin remains generate-client-voice-pack-action-test-coverage.",
    status: "done",
    phase: "Phase 6 — Marketing automation",
    owner: "cursor/prompt-process-evolution-e889",
  },
  {
    id: "generate-client-voice-pack-action-test-coverage",
    summary:
      "Empty-backlog twin after anthropic-env-readiness / Generate pack action Vitest: generateClientVoicePackAction is the operator Generate voice path for sold Complete phone-script fulfillment (requireConvex + Anthropic/stub), but only generators/faq-pack suites existed — no action-level Vitest. Shipped: generate-client-voice-pack-action.test.ts (11 tests). Sibling-friendly next: operator-digest-email-env-readiness.",
    status: "done",
    phase: "Phase 7 — Client AI phone",
    owner: "cursor/business-process-evolution-b17e",
  },
  {
    id: "operator-digest-email-env-readiness",
    summary:
      "Empty-backlog twin after Generate pack/voice action Vitest: Send daily digest only erred on click when OPERATOR_DIGEST_EMAIL was missing — operators had no early dashboard signal that pipeline-health digest delivery was unconfigured. Shipped: assessOperatorDigestEmailEnvReadiness + OperatorDigestEmailEnvBanner (emerald). Sibling-friendly next: send-daily-digest-action-test-coverage.",
    status: "done",
    phase: "Phase 2 — Outreach + platform voice",
    owner: "cursor/prompt-process-evolution-dde6",
  },
  {
    id: "send-daily-digest-action-test-coverage",
    summary:
      "Empty-backlog twin after operator-digest-email-env-readiness: sendDailyDigestAction is the operator Send daily digest path (requireOperatorAuth + OPERATOR_DIGEST_EMAIL + uncapped list* feeds into buildDailyDigest), but only daily-digest.test.ts covers the pure builder — no action-level Vitest for auth, missing destination, or list wiring. Shipped: send-daily-digest-action.test.ts (10 tests). Sibling d407 owns mark-commerce-order-paid-out-action-test-coverage; Email pack/voice action Vitest twins remain free.",
    status: "done",
    phase: "Phase 2 — Outreach + platform voice",
    owner: "cursor/prompt-process-evolution-2753",
  },
  {
    id: "mark-commerce-order-paid-out-action-test-coverage",
    summary:
      "Empty-backlog pivot while sibling owns send-daily-digest-action-test-coverage: markCommerceOrderPaidOutAction is the operator Mark paid out path (COMMERCE_PAID_OUT_CONVEX_PRIMARY fail-closed + already-paid-out guard) that drops owed liability from panel/health/digest — helper suites alone do not lock auth, missing session, ConvexPrimaryWriteError, or revalidate. Shipped: mark-commerce-order-paid-out-action.test.ts (8 tests). Sibling-friendly next: send-marketing-pack-to-client-action-test-coverage / send-client-voice-pack-to-client-action-test-coverage.",
    status: "done",
    phase: "Phase 8 — Commerce",
    owner: "cursor/business-process-evolution-d407",
  },
  {
    id: "send-marketing-pack-to-client-action-test-coverage",
    summary:
      "Empty-backlog twin after Generate pack / Mark paid out / Send daily digest action Vitest: sendMarketingPackToClientAction is the operator Email pack path for sold Growth/Complete handoff (eligibility + existing month pack + Resend). Shipped: send-marketing-pack-to-client-action.test.ts (13 tests). Sibling-friendly next: send-client-voice-pack-to-client-action-test-coverage.",
    status: "done",
    phase: "Phase 6 — Marketing automation",
    owner: "cursor/business-process-evolution-85ad",
  },
  {
    id: "send-client-voice-pack-to-client-action-test-coverage",
    summary:
      "Empty-backlog twin after Email pack action Vitest (PR #150): sendClientVoicePackToClientAction is the operator Email voice pack path for sold Complete phone-script handoff (eligibility + existing pack + Resend). Shipped: send-client-voice-pack-to-client-action.test.ts (13 tests). Sibling-friendly next: sync-commerce-catalog-to-stripe-action-test-coverage / save-commerce-catalog-action-test-coverage.",
    status: "done",
    phase: "Phase 7 — Client AI phone",
    owner: "cursor/prompt-process-evolution-8591",
  },
  {
    id: "sync-commerce-catalog-to-stripe-action-test-coverage",
    summary:
      "Empty-backlog twin after Email pack/voice action Vitest: syncCommerceCatalogToStripeAction is the operator Sync to Stripe path that unlocks Commerce Buy now (COMMERCE_CATALOG_CONVEX_PRIMARY + Stripe Product/Price create). Shipped: sync-commerce-catalog-to-stripe-action.test.ts (11 tests). Twin of save-commerce-catalog-action-test-coverage (3329).",
    status: "done",
    phase: "Phase 8 — Commerce",
    owner: "cursor/prompt-process-evolution-5c2b",
  },
  {
    id: "save-commerce-catalog-action-test-coverage",
    summary:
      "Empty-backlog twin after Email voice pack action Vitest: saveCommerceCatalogAction is the operator Save catalog path (COMMERCE_CATALOG_CONVEX_PRIMARY + preserveCommerceStripeIds so edits cannot wipe Buy now). Shipped: save-commerce-catalog-action.test.ts (12 tests). Twin of sync-commerce-catalog-to-stripe-action-test-coverage (5c2b).",
    status: "done",
    phase: "Phase 8 — Commerce",
    owner: "cursor/business-process-evolution-3329",
  },
  {
    id: "archive-orphan-commerce-stripe-products-action-test-coverage",
    summary:
      "Empty-backlog twin after Save catalog / Sync to Stripe action Vitest: archiveOrphanCommerceStripeProductsAction is the operator Archive orphans path (STRIPE_SECRET_KEY + active=false, never auto-delete) that cleans Products for removed SKUs — helper suites alone are not enough for action glue. Shipped: archive-orphan-commerce-stripe-products-action.test.ts (9 tests). Twin of open-billing-portal-action-test-coverage.",
    status: "done",
    phase: "Phase 8 — Commerce",
    owner: "cursor/prompt-process-evolution-dc97",
  },
  {
    id: "open-billing-portal-action-test-coverage",
    summary:
      "Empty-backlog twin after Commerce catalog action Vitest: openBillingPortalAction is the operator Manage billing path (STRIPE_SECRET_KEY + createBillingPortalForLead) — create-portal-session helper + billing-portal route suites alone are not enough for dashboard action glue. Shipped: open-billing-portal-action.test.ts (9 tests). Twin of archive-orphan-commerce-stripe-products-action-test-coverage (dc97).",
    status: "done",
    phase: "Phase 5 — Payments & billing",
    owner: "cursor/business-process-evolution-a3b5",
  },
  {
    id: "send-starter-upsell-action-test-coverage",
    summary:
      "Empty-backlog twin after Manage billing / Archive orphans action Vitest: sendStarterUpsellAction is the operator Starter → MRR Upsell path (eligibility inverse of billing portal + Resend) — starter-upsell helper suites alone are not enough for action glue. Shipped: send-starter-upsell-action.test.ts (13 tests). Twin of send-follow-up-action-test-coverage (left free).",
    status: "done",
    phase: "Phase 5 — Payments & billing",
    owner: "cursor/business-process-evolution-cd3b",
  },
  {
    id: "send-follow-up-action-test-coverage",
    summary:
      "Empty-backlog twin after Manage billing / Archive orphans action Vitest: sendFollowUpAction is the operator Email 2/3 outreach path (OUTREACH_CADENCE_CONVEX_PRIMARY persist-then-notify) — outreach helper suites alone are not enough for action glue. Shipped: send-follow-up-action.test.ts (14 tests). Twin of send-starter-upsell-action-test-coverage (cd3b / PR #156).",
    status: "done",
    phase: "Phase 4 — Outreach",
    owner: "cursor/prompt-process-evolution-6b73",
  },
  {
    id: "reply-to-inquiry-action-test-coverage",
    summary:
      "Empty-backlog twin after Starter upsell / Email 2/3 follow-up action Vitest: replyToInquiryAction is the operator Starter inquiry reply path (INQUIRY_REPLY_CONVEX_PRIMARY persist-then-notify) — inquiry helper suites alone are not enough for action glue. Shipped: reply-to-inquiry-action.test.ts (14 tests; f9b1 + fff2 complementary fold). Twin of dispose-cold-lead-action-test-coverage.",
    status: "done",
    phase: "Phase 3 — CRM & inbox",
    owner: "cursor/prompt-process-evolution-f9b1 + cursor/business-process-evolution-fff2",
  },
  {
    id: "dispose-cold-lead-action-test-coverage",
    summary:
      "Empty-backlog twin after Starter inquiry Reply action Vitest: disposeColdLeadAction is the operator cold Re-engage/Close path (COLD_DISPOSITION_CONVEX_PRIMARY + optional Email 1) — cold-archive helper suites alone are not enough for action glue. Shipped: dispose-cold-lead-action.test.ts (17 tests). Twin of update-inquiry-status-action-test-coverage (5178).",
    status: "done",
    phase: "Phase 4 — Outreach",
    owner: "cursor/prompt-process-evolution-3672",
  },
  {
    id: "update-inquiry-status-action-test-coverage",
    summary:
      "Empty-backlog twin after inquiry Reply action Vitest: updateInquiryStatusAction is the operator mark-read (composer open) / Archive path (INQUIRY_REPLY_CONVEX_PRIMARY fail-closed) — reply helper + replyToInquiryAction suites alone do not lock status-only glue. Shipped: update-inquiry-status-action.test.ts (10 tests). Twin of dispose-cold-lead-action-test-coverage (3672).",
    status: "done",
    phase: "Phase 3 — CRM & inbox",
    owner: "cursor/business-process-evolution-5178",
  },
  {
    id: "update-lead-stage-action-test-coverage",
    summary:
      "Empty-backlog twin after inquiry status / cold disposition action Vitest: updateLeadStageAction is the operator dashboard stage dropdown path (LEAD_STAGE_CONVEX_PRIMARY fail-closed + optional Email 1 persist-then-notify) — lead-stage helper suites alone are not enough for action glue. Shipped: update-lead-stage-action.test.ts (16 tests). Twin of snooze-lead-action-test-coverage (b8a0; folded here).",
    status: "done",
    phase: "Phase 3 — CRM & inbox",
    owner: "cursor/business-process-evolution-a622",
  },
  {
    id: "snooze-lead-action-test-coverage",
    summary:
      "Empty-backlog twin after inquiry status / cold disposition action Vitest: snoozeLeadAction is the operator Work next park path (snoozedUntil + LEAD_SNOOZE requireConvex when configured) — lead-snooze helper suites alone are not enough for action glue. Shipped: snooze-lead-action.test.ts (12 tests). Twin of update-lead-stage-action-test-coverage (a622 folded).",
    status: "done",
    phase: "Phase 3 — CRM & inbox",
    owner: "cursor/prompt-process-evolution-b8a0",
  },
  {
    id: "update-lead-notes-action-test-coverage",
    summary:
      "Empty-backlog twin after stage / snooze action Vitest: updateLeadNotesAction is the operator discovery-call / Email 3 notes path (LEAD_NOTES_CONVEX_PRIMARY fail-closed) — notes helper suites alone are not enough for action glue. Shipped: update-lead-notes-action.test.ts (10 tests). Twin of add-lead-action-test-coverage (a322; folded here).",
    status: "done",
    phase: "Phase 3 — CRM & inbox",
    owner: "cursor/prompt-process-evolution-3eb3",
  },
  {
    id: "add-lead-action-test-coverage",
    summary:
      "Empty-backlog twin after stage / snooze action Vitest: addLeadAction is the operator manual create path (LEAD_UPSERT_CONVEX_PRIMARY + optional Email 1 on outreach_sent) — upsert / outreach helper suites alone are not enough for action glue. Shipped: add-lead-action.test.ts (13 tests). Twin of update-lead-notes-action-test-coverage (3eb3; folded here).",
    status: "done",
    phase: "Phase 3 — CRM & inbox",
    owner: "cursor/business-process-evolution-a322",
  },
  {
    id: "import-leads-csv-action-test-coverage",
    summary:
      "Empty-backlog twin after notes / Add lead action Vitest: importLeadsCsvAction is the operator bulk inventory path (LEAD_UPSERT_CONVEX_PRIMARY per row + parse/validate) — CSV parse helper + upsert-persist suites alone are not enough for action glue. Shipped: import-leads-csv-action.test.ts (12 tests). Twin of mark-handoff-live-action-test-coverage (1ca9; folded here).",
    status: "done",
    phase: "Phase 2 — Lead volume",
    owner: "cursor/prompt-process-evolution-3be7",
  },
  {
    id: "mark-handoff-live-action-test-coverage",
    summary:
      "Empty-backlog twin after notes / Add lead action Vitest: markHandoffLiveAction is the operator Mark live fulfill path (DEPLOY_HANDOFF_CONVEX_PRIMARY + stage live) — deploy-handoff helper suites alone are not enough for action glue. Shipped: mark-handoff-live-action.test.ts (7 tests). Twin of import-leads-csv-action-test-coverage (3be7; folded here).",
    status: "done",
    phase: "Phase 5 — Fulfill & deploy",
    owner: "cursor/business-process-evolution-1ca9",
  },
  {
    id: "assign-vercel-project-action-test-coverage",
    summary:
      "Empty-backlog twin after CSV import / Mark live action Vitest: assignVercelProjectAction is the operator Assign Vercel project path (DEPLOY_HANDOFF_CONVEX_PRIMARY + Domains API provision) — handoff helper suites alone are not enough for action glue. Shipped: assign-vercel-project-action.test.ts (9 tests). Twin of assign-custom-domain-action-test-coverage (d08a; folded here).",
    status: "done",
    phase: "Phase 5 — Fulfill & deploy",
    owner: "cursor/business-process-evolution-699c",
  },
  {
    id: "assign-custom-domain-action-test-coverage",
    summary:
      "Empty-backlog twin after CSV import / Mark live action Vitest: assignCustomDomainAction is the operator Save domain Host→preview path (DEPLOY_HANDOFF_CONVEX_PRIMARY + custom-domain routing) — handoff helper suites alone are not enough for action glue. Shipped: assign-custom-domain-action.test.ts (8 tests). Twin of assign-vercel-project-action-test-coverage (699c; folded via PR #168).",
    status: "done",
    phase: "Phase 5 — Fulfill & deploy",
    owner: "cursor/prompt-process-evolution-d08a",
  },
  {
    id: "get-commerce-catalog-action-test-coverage",
    summary:
      "Empty-backlog after Assign Vercel / Save domain action Vitest: getCommerceCatalogAction is the operator Commerce catalog read path that seeds the Save/Sync panel — save/sync action suites alone are not enough for the thin read glue (auth + slug + getCommerceCatalog). Prefer when both Assign twins are done; sibling-friendly with empty-backlog sold-capability / multi-instance regression audits.",
    status: "done",
    phase: "Phase 2 — Lead volume",
    owner: "cursor/prompt-process-evolution-f4bf",
  },
  {
    id: "login-operator-action-test-coverage",
    summary:
      "Empty-backlog after get-commerce-catalog action Vitest: loginOperatorAction / logoutOperatorAction are the operator session write/clear path (safeNextPath open-redirect guard + cookie set/clear) — operator.test.ts token crypto + proxy.test.ts gate alone are not enough for login form glue. Shipped: src/app/dashboard/login/actions.test.ts (7 tests). Sibling-friendly next: requireOperatorAuth cookie-read coverage.",
    status: "done",
    phase: "Phase 1 — Website foundation",
    owner: "cursor/business-process-evolution-7f7e",
  },
  {
    id: "require-operator-auth-cookie-read-coverage",
    summary:
      "Empty-backlog after login-operator-action-test-coverage: requireOperatorAuth / isOperatorAuthenticated are the cookie-read path every dashboard mutation + proxy gate share — login action Vitest locks write/clear; token crypto alone does not lock jar read (open demo when unset, reject missing/invalid/expired, accept valid). Shipped: operator.test.ts cookie-read suite (10 tests; 20 total in file). Sibling-friendly next: empty-backlog sold-capability / multi-instance regression audits.",
    status: "done",
    phase: "Phase 1 — Website foundation",
    owner: "cursor/business-process-evolution-b2e7",
  },
  {
    id: "operator-dashboard-password-env-readiness",
    summary:
      "Empty-backlog after require-operator-auth-cookie-read-coverage: operators get no early dashboard signal when OPERATOR_DASHBOARD_PASSWORD is unset/whitespace/placeholder — proxy + requireOperatorAuth stay open-demo while CRM/outreach mutations are world-reachable. Shipped: assessOperatorAuthEnvReadiness + OperatorAuthEnvBanner on /dashboard + /dashboard/leads + docs. Sibling-friendly next: app-url-env-readiness (NEXT_PUBLIC_APP_URL) or empty-backlog sold-capability / multi-instance regression audits.",
    status: "done",
    phase: "Phase 1 — Website foundation",
    owner: "cursor/prompt-process-evolution-02c1",
  },
  {
    id: "app-url-env-readiness",
    summary:
      "Empty-backlog after operator-dashboard-password-env-readiness: operators get no early dashboard signal when NEXT_PUBLIC_APP_URL is missing, whitespace-only, or still localhost while other secrets are live — checkout cancel/success URLs, digest links, unsubscribe/footer canonicals, and SEO siteUrl() drift. Shipped: assessAppUrlEnvReadiness + AppUrlEnvBanner on /dashboard + /dashboard/leads + docs. Sibling-friendly next: brand-name-env-readiness (NEXT_PUBLIC_BRAND_NAME) or production-domain-env-readiness (NEXT_PUBLIC_PRODUCTION_DOMAIN) or empty-backlog sold-capability / multi-instance regression audits.",
    status: "done",
    phase: "Phase 1 — Website foundation",
    owner: "cursor/business-process-evolution-618c",
  },
  {
    id: "brand-name-env-readiness",
    summary:
      "Empty-backlog after app-url-env-readiness (sibling 618c / PR #174): operators get no early dashboard signal when NEXT_PUBLIC_BRAND_NAME is missing/whitespace — outreach From name, marketing footers, and voice intros silently ship as brand.name fallback 'Your Brand' while Resend/Stripe/APP_URL secrets look ready. Shipped: assessBrandNameEnvReadiness + BrandNameEnvBanner on /dashboard + /dashboard/leads + docs. Sibling-friendly next: production-domain-env-readiness or empty-backlog sold-capability / multi-instance regression audits.",
    status: "done",
    phase: "Phase 2 — Outreach + platform voice",
    owner: "cursor/prompt-process-evolution-edae",
  },
  {
    id: "production-domain-env-readiness",
    summary:
      "Empty-backlog after brand-name-env-readiness (edae / PR #175): operators get no early dashboard signal when NEXT_PUBLIC_PRODUCTION_DOMAIN is missing/whitespace while APP_URL/brand are live — preview subdomain suggestedHost + wildcard DNS counseling drift (proxy preview-subdomain routing still works via APP_URL host, but handoff suggested hosts and launch docs assume the production root). Shipped: assessProductionDomainEnvReadiness + ProductionDomainEnvBanner on /dashboard + /dashboard/leads + docs. Sibling-friendly next: vercel-token-env-readiness or empty-backlog sold-capability / multi-instance regression audits.",
    status: "done",
    phase: "Phase 5 — Client handoff",
    owner: "cursor/business-process-evolution-6506",
  },
  {
    id: "vercel-token-env-readiness",
    summary:
      "Empty-backlog after production-domain-env-readiness (sibling 6506 / PR #176): operators get no early dashboard signal when VERCEL_TOKEN is missing/whitespace/placeholder while PRODUCTION_DOMAIN + APP_URL are live — paid handoffs stay awaiting_dns with manual notes and tryProvisionVercelDomain never calls the Domains API. Shipped: assessVercelTokenEnvReadiness + VercelTokenEnvBanner (blue) on /dashboard + /dashboard/leads + docs. Sibling-friendly next: company-address-env-readiness (CAN-SPAM postal) / vercel-project-id-env-readiness / empty-backlog sold-capability audits.",
    status: "done",
    phase: "Phase 5 — Client handoff",
    owner: "cursor/prompt-process-evolution-9930",
  },
  {
    id: "company-address-env-readiness",
    summary:
      "Empty-backlog after vercel-token-env-readiness (9930 / PR #177): operators get no early dashboard signal when NEXT_PUBLIC_COMPANY_ADDRESS is missing/whitespace/bracket-placeholder while Resend/brand look ready — every outreach CAN-SPAM footer silently ships brand.postalAddress fallback '[Registered business address — Colorado, USA]'. Shipped: assessCompanyAddressEnvReadiness + CompanyAddressEnvBanner (yellow) on /dashboard + /dashboard/leads + docs. Sibling-friendly next: vercel-project-id-env-readiness / empty-backlog sold-capability / multi-instance regression audits.",
    status: "done",
    phase: "Phase 3 — Outreach",
    owner: "cursor/business-process-evolution-01fb",
  },
  {
    id: "vercel-project-id-env-readiness",
    summary:
      "Empty-backlog after vercel-token-env-readiness (9930 / PR #177): operators get no early dashboard signal when shared VERCEL_PROJECT_ID is missing/whitespace/placeholder while VERCEL_TOKEN (and PRODUCTION_DOMAIN) look ready — tryProvisionVercelDomain still skips Domains API unless every handoff gets Assign project. Shipped: assessVercelProjectIdEnvReadiness + VercelProjectIdEnvBanner (indigo) on /dashboard + /dashboard/leads + docs. Folded sibling company-address-env-readiness (01fb / PR #178).",
    status: "done",
    phase: "Phase 5 — Client handoff",
    owner: "cursor/prompt-process-evolution-7511",
  },
  {
    id: "convex-url-env-readiness",
    summary:
      "Empty-backlog after vercel-project-id-env-readiness (7511 / PR #179): operators get no early dashboard signal when NEXT_PUBLIC_CONVEX_URL is missing/whitespace/placeholder while Stripe/Resend/Vercel look ready — multi-instance / serverless deploys keep SQLite-only split-brain (payments, CRM, handoffs invisible across instances) and db.ts treated whitespace-only as truthy for ConvexHttpClient. Shipped: assessConvexUrlEnvReadiness + ConvexUrlEnvBanner (pink) on /dashboard + /dashboard/leads + resolveConvexDeploymentUrl trim/placeholder gate in db.ts + docs. Sibling b901 owns email-from-env-readiness.",
    status: "done",
    phase: "Phase 1 — Website foundation",
    owner: "cursor/prompt-process-evolution-382f",
  },
  {
    id: "email-from-env-readiness",
    summary:
      "Empty-backlog after vercel-project-id-env-readiness (7511 / PR #179): launch checklist requires EMAIL_FROM and brand.emailFrom exists, but Resend sendEmail / sendOperatorDailyDigest hardcoded from: outreach@updates.localsitestudio.com — operators could set EMAIL_FROM + SPF/DKIM and still send from the wrong domain. Shipped: wire formatResendFromHeader(brand.name, brand.emailFrom) into both Resend from headers + assessEmailFromEnvReadiness + EmailFromEnvBanner (lime) on /dashboard + /dashboard/leads + docs.",
    status: "done",
    phase: "Phase 2 — Outreach + platform voice",
    owner: "cursor/business-process-evolution-b901",
  },
  {
    id: "bundle-webhook-receipt-marker-requires-send-success",
    summary:
      "Empty-backlog after vercel-project-id-env-readiness (7511 / PR #179): the env-readiness banner chain and action-test-coverage backlog are both fully exhausted. Multi-instance/sold-capability regression audit found src/app/api/stripe/webhook/route.ts wrote the durable bundleReceiptEmailSentNote/bundleDnsHandoffEmailSentNote unconditionally right after awaiting sendReceiptEmail/sendEmail — but those functions never throw (they resolve { success: false, reason/error } on suppression-list hits or Resend failures), so a suppressed or failed send got marked 'sent' anyway and Stripe redelivery could never recover it (planBundleWebhookSideEffects sees the note and skips forever). A paying bundle customer whose email is suppressed (e.g. a former cold-outreach unsubscribe who later converts) or who hits a transient Resend outage at checkout permanently never receives their receipt or DNS go-live instructions, with the webhook still returning 200. Shipped: the webhook now checks result.success before writing either marker; on success:false it logs and leaves the marker unwritten so the next Stripe redelivery retries the send. Updated route.test.ts's default sendEmail/sendReceiptEmail mocks to resolve { success: true } (matching the real contract, not a rejection) and added two regression tests asserting the marker is skipped on success:false for each email independently.",
    status: "done",
    phase: "Phase 3 — Payments",
    owner: "claude/upbeat-dijkstra-shyape",
  },
  {
    id: "commerce-client-receipt-redelivery-recovery",
    summary:
      "Empty-backlog after PR #184/#185 (bundle receipt-marker success gate + billing-portal rate-limit): Commerce Buy now planCommerceWebhookSideEffects still gated BOTH operator inquiry + client receipt on inquiry presence — once the inquiry row exists, sendCommerceBuyNowClientReceipt was never retried on Stripe redelivery even when the send resolved { success: false } or threw. Bundle already recovers receipt/DNS independently via durable sent-markers; Commerce sold promise (order notification to lead.email) could be permanently lost after a transient Resend/suppression failure while the operator inbox looked complete. Shipped: decouple receipt from inquiry with clientReceiptEmailSentAt on commerceOrders (mirror paidOutAt) + success-gated marker write + commerce_client_receipt_sent_marker 5xx on marker failure.",
    status: "done",
    phase: "Phase 3 — Payments",
    owner: "cursor/business-process-evolution-6445",
  },
  {
    id: "email-1-outreach-send-success-check",
    summary:
      "Empty-backlog after PR #184/#185; sibling 6445 claimed commerce-client-receipt-redelivery-recovery. Complementary audit found updateLeadStageAction + addLeadAction durably mark Email 1 via recordLeadOutreach then await sendOutreachEmail without checking { success } — sendEmail never throws on suppression/Resend failure, so the action still returns success:true while the lead looks outreach_sent and drops out of Email-1 work. Follow-ups / cold re-engage / inquiry reply already surface !sent.success. Shipped: mirror that check (persist-then-notify mark stays; operator gets success:false + retry/suppression hint); Vitest regressions for both actions; docs note the contract.",
    status: "done",
    phase: "Phase 2 — Outreach + platform voice",
    owner: "cursor/prompt-process-evolution-b16c",
  },
  {
    id: "billing-portal-return-url-open-redirect-guard",
    summary:
      "Empty-backlog after PR #185 (billing-portal rate-limit on quirky-davinci-6tghy1); siblings cursor/business-process-evolution-6445 and cursor/prompt-process-evolution-b16c claimed the two remaining known bugs from that audit window (commerce-client-receipt-redelivery-recovery, email-1-outreach-send-success-check) before this run started, so a fresh audit swept a different angle (money/ledger recovery-marker recheck, Convex/SQLite parity, HTML/JSON-LD escaping, orchestrator test-coverage ratio) and found: POST /api/stripe/billing-portal is public, keyed only by a client-supplied Stripe Checkout Session id (not truly secret — appears in redirect URLs, referrer headers, browser history), and passed body.returnUrl straight through to stripe.billingPortal.sessions.create's return_url with zero same-origin validation. An attacker holding any valid completed session id could get Stripe to mint a real billing.stripe.com portal URL whose 'Return to [merchant]' link points anywhere they choose — using the merchant's own trusted Stripe relationship as an open-redirect gateway for phishing. The codebase already has the right pattern for this (safeNextPath in src/app/dashboard/login/actions.ts) but it was never applied here. Shipped: reject any body.returnUrl whose origin does not match the derived appUrl, falling back to the existing default (${appUrl}/checkout/success?session_id=...) instead.",
    status: "done",
    phase: "Phase 3 — Payments",
    owner: "claude/relaxed-galileo-h8lib0",
  },
  {
    id: "sqlite-row-mapping-test-coverage",
    summary:
      "Free NEXT_STEPS backlog stayed fully gated after PR #189 (billing-portal open-redirect guard). Rotated to an axis not yet audited (orchestrator test-coverage gaps + CSV injection) per the audit-rotation rule; found that src/lib/db.ts — the shared Convex-primary/SQLite-fallback module every payment-critical write funnels through — has zero test file, and every existing test mocks `@/lib/db` wholesale (confirmed the module throws under Vitest via its `import \"server-only\"`, same as resend.test.ts's documented workaround), so the SQLite row-mapping logic the protocol itself flags as a risk (hours string round-trip, JSON stringify/parse of services) had never actually run under test. Extracted the pure mapping (mapSqliteRowToLead, serializeLeadHours/parseLeadHours, serializeLeadServices/parseLeadServices) into src/lib/leads/sqlite-row-mapping.ts (no server-only import, mirrors the stripe-sync.ts testability pattern) and gave it direct Vitest coverage. Along the way, unified hoursStr serialization across the demo-seed insert and upsertLead (which previously always emitted a trailing '· ' when weekend was empty, unlike the demo path's conditional format) — round-trips identically either way, but the shared helper removes the inconsistency and the noisy stored artifact.",
    status: "done",
    phase: "Phase 2 — Lead volume",
    owner: "claude/quirky-davinci-p8s7o7",
  },
  {
    id: "open-handoffs-in-digest",
    summary:
      "Empty-backlog after PR #190 (sqlite-row-mapping-test-coverage): pipeline-health + /dashboard already expose openHandoffCount (paid sites awaiting DNS / Mark live), but the operator daily digest never loaded listDeployHandoffs — so a single-operator business that relies on Send daily digest could miss production go-live debt entirely. PR #188's wiring audit checked list*Due/Missing/Unsynced helpers and missed this inline handoffs filter. Shipped: openHandoffs action section in buildDailyDigest/renderDailyDigestHtml (status !== live, same predicate as pipeline-health) + listDeployHandoffs in sendDailyDigestAction.",
    status: "done",
    phase: "Phase 5 — Production deploy",
    owner: "cursor/prompt-process-evolution-e73c",
  },
  {
    id: "contact-form-notify-send-success-check",
    summary:
      "Empty-backlog after PR #190 (sqlite-row-mapping) / sibling open-handoffs-in-digest (e73c / PR #192): re-checked the durable-marker-after-unchecked-await class on public routes. POST /api/contact/[slug] awaits sendEmail for the Starter sold business/operator notify but never inspects `{ success }` — sendEmail resolves `{ success: false }` on suppression/Resend failure without throwing, so the route's try/catch only covers the throw path and tests mocked an undefined resolve + rejection. Inquiry CRM trail stays correct (persist-required); the lead/support notify can fail silently with no inquiry-correlated log and no notifySent signal. Shipped: check sent.success, log inquiryId + reason/error on failure, return notifySent on the ok:true response (visitor still succeeds after durable persist).",
    status: "done",
    phase: "Phase 1 — Website foundation",
    owner: "cursor/business-process-evolution-c966",
  },
  {
    id: "bootstrap-prices-operator-auth-rate-limit",
    summary:
      "Queued from sibling business-process-evolution-c966's empty-backlog audit: POST /api/stripe/bootstrap-prices was gated only by ALLOW_STRIPE_BOOTSTRAP=1 (no requireOperatorAuth, no checkRateLimit) while the dashboard twin bootstrapStripePricesAction was auth-gated. When the flag is briefly set for launch, the public route could mint Stripe Products/Prices without operator session or IP throttling. Claimed and shipped both halves in the same run: requireOperatorAuth as the first check (401 on rejection, mirroring bootstrapStripePricesAction and the src/app/api/marketing/generate/route.ts precedent), then checkRateLimit per client IP (429 + Retry-After) matching every other public Stripe-facing route.",
    status: "done",
    phase: "Phase 3 — Payments",
    owner: "claude/relaxed-galileo-t69qzz",
  },
  {
    id: "sqlite-row-mapping-coverage-remaining-modules",
    summary:
      "Free NEXT_STEPS backlog stayed fully gated after PR #194 (bootstrap-prices auth+rate-limit); sibling claude/upbeat-dijkstra-yrtt98 claimed leads-client-optimistic-state-desync (in progress at run start) on a UI-file-coverage axis. Rotated to complete sqlite-row-mapping-test-coverage's own axis: db.ts still had 7 more private SQLite row-mapping/JSON-parsing helpers (deploy handoff, marketing pack, commerce catalog, commerce order, client voice pack, client inquiry, checkout session) with zero direct test coverage — same server-only-import blocker sqlite-row-mapping-test-coverage documented for Lead. Auditing them against their JSON-parsing siblings found a real gap: mapDeployHandoffRow's dnsInstructions/notes JSON.parse had no Array.isArray guard, unlike parsePackVariants/parseCommerceItems/parseClientVoiceVariants in the same file — a corrupted/malformed column value would silently produce a non-array or wrong-shaped value instead of degrading to [] like every sibling parser. Claimed and shipped: extracted all 7 remaining mapping functions into sqlite-row-mapping.ts modules under their owning domain (src/lib/deploy, marketing, commerce, voice, inquiries, checkout, orders), fixed the missing guard, and added direct Vitest coverage for each (round-trip + malformed-JSON + non-array-JSON cases).",
    status: "done",
    phase: "Phase 2 — Lead volume",
    owner: "claude/quirky-davinci-emqanw",
  },
  {
    id: "paid-not-live-in-digest",
    summary:
      "Empty-backlog after PR #194 (bootstrap-prices-operator-auth-rate-limit). Fresh audit re-checked route/action auth-parity (clean — every dashboard action and public API route already has requireOperatorAuth or checkRateLimit or is intentionally public/signature-verified) before finding a real sold-capability visibility gap: pipeline-health's paidNotLiveCount (leads with stage=paid) was dashboard-only. It is a distinct set from openHandoffs (fixed in PR #192) — a lead can be moved to stage=paid via the stage dropdown or CSV import with no deploy_handoffs row ever created, so it would never surface in Production handoffs open. A single-operator business relying on Send daily digest could have paying customers with zero fulfillment record and never know. Shipped: paidNotLive action section in buildDailyDigest/renderDailyDigestHtml (same lead.stage === \"paid\" predicate as pipeline-health, no new data load — leads is already a digest input).",
    status: "done",
    phase: "Phase 5 — Production deploy",
    owner: "claude/relaxed-galileo-t69qzz",
  },
  {
    id: "digest-section-counts-uncapped",
    summary:
      "Empty-backlog after PR #196 (paid-not-live-in-digest). Fresh audit re-checked the disjoint-aggregate trap across every pipeline-health/daily-digest field pair (clean — the remaining pairs all share the exact same underlying list*/is* helper, so they can't drift) and found a different, real bug in the digest's rendering layer instead: every action-section title in renderDailyDigestHtml used the capped display array's `.length` (e.g. `Follow-ups due (${digest.followUpsDue.length})`), not the true pre-slice count — every section (10 of 12; Work next is an inherently-ranked top-5, not a debt total) silently freezes its header at '(5)' forever once the underlying queue naturally exceeds its hardcoded LIMIT, even though pipeline-health already computes several of the same true counts correctly. A single-operator business relying on the digest email to gauge urgency without opening the dashboard would see '(5)' for a queue of 12 and have no way to know 7 more exist. Claimed and shipped: added an uncapped *Count field per section (reusing the exact pre-slice array already computed, mirroring the commercePayoutsOwedTotalUsd pattern) and repointed every section title to it.",
    status: "done",
    phase: "Phase 5 — Production deploy",
    owner: "claude/relaxed-galileo-t69qzz",
  },
  {
    id: "leads-missing-email-in-digest",
    summary:
      "Empty-backlog after PR #196 (paid-not-live-in-digest): pipeline-health's leadsMissingEmailCount (email-critical stages site_built/outreach_sent/discovery_call/paid with no usable email) was still dashboard-only. Send daily digest never surfaced those rows, so a single-operator business could miss the top-of-funnel block that prevents Email 1 / follow-ups / recovery / receipts entirely. Shipped: export leadIsMissingCriticalEmail + EMAIL_CRITICAL_STAGES from pipeline-health; leadsMissingEmail action section in buildDailyDigest/renderDailyDigestHtml with uncapped leadsMissingEmailCount header (same *Count pattern as digest-section-counts-uncapped).",
    status: "done",
    phase: "Phase 2 — Outreach + platform voice",
    owner: "cursor/prompt-process-evolution-2101",
  },
  {
    id: "marketing-generate-rate-limit",
    summary:
      "Empty-backlog after PR #196 (paid-not-live-in-digest): POST /api/marketing/generate had requireOperatorAuth but no checkRateLimit, unlike bootstrap-prices (auth+rate-limit twin) and every other public write route. When OPERATOR_DASHBOARD_PASSWORD is unset (open demo), auth returns ok for every caller — unthrottled Anthropic spend / stub hammering. Shipped: checkRateLimit per client IP (429 + Retry-After) after auth, matching bootstrap-prices. Folded PR #197 digest-section-counts-uncapped.",
    status: "done",
    phase: "Phase 6 — Marketing automation",
    owner: "cursor/business-profitability-process-8f90",
  },
  {
    id: "list-unpaid-empty-string-parity",
    summary:
      "Same empty-backlog audit twin: Convex commerceOrders.listUnpaid filtered paidOutAt === undefined only, while SQLite uses (paidOutAt IS NULL OR paidOutAt = '') and isCommerceOrderPaidOut uses Boolean(paidOutAt) (empty string = unpaid). Shipped: listUnpaid treats falsy paidOutAt as unpaid; mapOrderRow / mapCommerceOrderRow normalize empty string to undefined.",
    status: "done",
    phase: "Phase 3 — Payments",
    owner: "cursor/business-profitability-process-8f90",
  },
  {
    id: "leads-client-optimistic-state-desync",
    summary:
      "Free NEXT_STEPS backlog stayed fully gated after PR #198 (leads-missing-email-in-digest). Sibling claude/upbeat-dijkstra-yrtt98 had claimed this id on an unpushed branch (claim commit only, no feature code in over an hour) diagnosing two real bugs in leads-client.tsx (the largest UI file in the repo, previously zero test coverage): (1) the Add Lead form's Slug field is free-text with no client-side normalization, but addLeadAction normalizes server-side (lowercase, non-[a-z0-9-] -> '-') before persisting and returns that normalized slug — the client ignored the response and pushed the raw client-typed slug into local state, so any add where the typed slug wasn't already normalized rendered a row whose slug matched no DB record, silently no-op'ing every later action (stage change, snooze, notes, follow-up) on that row until reload; (2) handleStageChange's error-path revert called setLeads(initialLeads) — the page-load prop snapshot — wiping every other optimistic edit made earlier in the session (other stage changes, added leads, snooze/notes/cold-disposition updates) back to stale state whenever a single unrelated stage-change call failed, not just the one that failed. Independently re-verified both by reading the current code (not by trusting the stale branch's diagnosis) before fixing. Shipped: use addLeadAction's returned res.slug (not the raw form input) when merging the saved lead into local state; revert only the affected row on a failed stage change, not the whole list. Extracted both behaviors into src/lib/leads/optimistic-updates.ts (mirrors the notes.ts pure-helper pattern already used by this file) with direct Vitest coverage, since the repo has no React component test harness to exercise leads-client.tsx directly.",
    status: "done",
    phase: "Phase 2 — Outreach + platform voice",
    owner: "claude/optimistic-oyster-lc4b2q",
  },
  {
    id: "update-lead-stage-action-existence-check",
    summary:
      "Empty-backlog after PR #203/#199 (leads-client-optimistic-state-desync + re-confirmed sold-vs-shipped/orchestration-coverage clean). A same-minute duplicate leads-client-optimistic fix (independently found, already superseded by #203) was discarded rather than shipped as a second competing implementation. Rotated to client-submitted-id existence checks: updateLeadStageAction (src/app/dashboard/leads/actions.ts) was the one write action in this file that skipped the getLeadBySlug-then-404 pattern every sibling action (notes, snooze, cold disposition, catalogs, marketing/voice packs, payouts) already uses — it called updateLeadStage(slug, ...) directly on the raw parameter. The SQLite fallback's `UPDATE leads SET status = ? WHERE slug = ?` matches zero rows and never throws on an unknown slug, so a mistyped/stale/scripted slug returned { success: true } with nothing actually written — a false-positive success signal, not caught by any existing test (update-lead-stage-action.test.ts had a 'lead missing' case but only for the post-write outreach-email branch, never for the write itself). Shipped: hoist a single getLeadBySlug existence check before the stage write (reusing the same lookup the outreach_sent branch already needed), returning { success: false, error: \"Lead not found\" } before any write on an unknown slug — matching every sibling action's contract exactly.",
    status: "done",
    phase: "Phase 2 — Lead volume",
    owner: "claude/relaxed-galileo-t69qzz",
  },
  {
    id: "app-url-header-injection-guard",
    summary:
      "Empty-backlog after PR #205 (update-lead-stage-action-existence-check) and PR #199 (re-confirmed sold-vs-shipped/orchestration-coverage clean). Rotated to genuinely unexplored ground given how much of today's audit surface (route/action auth, digest wiring, db.ts coverage, sold-vs-shipped docs, leads/actions.ts existence checks) was already exhaustively covered: openBillingPortalAction and sendDailyDigestAction (src/app/dashboard/leads/actions.ts) both derive an appUrl fallback from x-forwarded-host/host request headers when NEXT_PUBLIC_APP_URL is unset, with no validation before use. That value flows unescaped into the daily digest's outbound email href (renderDailyDigestHtml, violating the same escapeHtmlForEmail rule already enforced for every lead field) and, separately, into the Stripe billing-portal return_url (openBillingPortalAction) with no same-origin/well-formedness check — unlike the public POST /api/stripe/billing-portal route's isSameOriginReturnUrl, which validates a client-body-supplied returnUrl against the derived appUrl but never anticipated the derived appUrl itself being the untrusted part. A raw HTTP client or a misconfigured proxy that forwards an unvalidated Host/X-Forwarded-Host can inject arbitrary text into both an operator-facing email link and a genuine Stripe redirect target. Shipped: resolveTrustedAppUrl (src/lib/security/app-url.ts) validates the header-derived candidate as a well-formed absolute URL before use, falling back to the documented localhost default on anything malformed; wired into both call sites; escapeHtmlForEmail added around the digest's baseUrl as defense-in-depth regardless of provenance.",
    status: "done",
    phase: "Phase 3 — Payments",
    owner: "claude/relaxed-galileo-t69qzz",
  },
  {
    id: "login-authenticated-open-redirect",
    summary:
      "Empty-backlog after PR #206 (app-url-header-injection-guard): free NEXT_STEPS stayed operator/legal-gated. Security-surface audit found /dashboard/login's already-authenticated redirect and form next field used a weaker startsWith('/') check than loginOperatorAction's private safeNextPath — protocol-relative //evil.example is an open redirect for any operator with a live session who hits /dashboard/login?next=//evil.example. Action-side safeNextPath blocked // but was private to actions.ts and never used by the page; it also allowed backslash host tricks (/\\evil) and /dashboard/login self-redirect loops. Sibling CLI branches grok/dev-work-login-open-redirect + grok/continuous-work-login-redirect already had the complete fix with no open PR (Actions token blocked) — folded that body onto this automation branch rather than rebuilding. Shipped: pure shared safeNextPath (dashboard-only paths; reject //, backslash, control chars, scheme-smuggled paths, login self-target) used by page + action; Vitest unit + action regressions.",
    status: "done",
    phase: "Phase 1 — Website foundation",
    owner: "cursor/business-process-evolution-07e5",
  },
  {
    id: "commerce-catalog-sync-lost-update-guard",
    summary:
      "Empty-backlog after PR #206 (app-url-header-injection-guard) and PR #199 (re-confirmed clean twice). Seventh consecutive audit run today; explicitly calibrated toward accepting a documented clean pass given how exhaustively today's surface (auth, rate-limiting, digest wiring, db.ts coverage, sold-vs-shipped docs, existence checks, header trust) had been swept. Checked for N+1 query patterns (clean — daily-digest.ts and actions.ts already batch/Map-lookup where needed) and re-verified BUSINESS_DECISIONS/ITERATIONS slice bookkeeping against a stale unmerged draft's claimed drift (clean — no mismatch found in the last 10 entries). Found a real TOCTOU lost-update on money-adjacent data: syncCommerceCatalogToStripeAction reads the Commerce catalog once, then runs syncCommerceCatalogToStripe's real, sequential per-SKU Stripe API loop (up to MAX_COMMERCE_SKUS) — a materially long window — then writes the ENTIRE items array back via an unconditional full-row upsertCommerceCatalog with no version/CAS check. A concurrent saveCommerceCatalogAction (a second tab, or a follow-up edit) landing during that window would be silently overwritten by the sync's stale pre-loop snapshot, discarding any price change, added SKU, or removed SKU. Shipped: re-read the catalog immediately before the final write and merge in only the freshly-created Stripe ids via the existing preserveCommerceStripeIds helper (previous ↔ synced roles swapped from its saveCommerceCatalogAction usage), which also correctly drops a SKU's just-synced stripePriceId if its price changed mid-sync.",
    status: "done",
    phase: "Phase 8 — Commerce",
    owner: "claude/relaxed-galileo-t69qzz",
  },
  {
    id: "stripe-redirect-app-url-no-host-trust",
    summary:
      "Empty-backlog after PR #206 (app-url-header-injection-guard). Sibling business-process-evolution-07e5 claimed login-authenticated-open-redirect (folding grok's safeNextPath). Complementary security twin: the three public Stripe routes (POST /api/stripe/checkout, /api/commerce/checkout, /api/stripe/billing-portal) still derived appUrl via `NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin` and interpolated it into Stripe success_url / cancel_url / return_url. When APP_URL is unset, that origin is attacker-influenceable (Host / X-Forwarded-Host / crafted request URL) — an unauthenticated POST can mint a real Checkout Session whose post-payment redirect lands on an attacker origin (post-payment phishing), and billing-portal's isSameOriginReturnUrl guard is bypassed because the comparison origin itself is attacker-controlled. resolveTrustedAppUrl (PR #206) is insufficient here: it still trusts well-formed attacker hosts. Shipped: resolveStripeRedirectAppUrl (NEXT_PUBLIC_APP_URL > VERCEL_URL > localhost — never request Host/origin) wired into all three public routes + openBillingPortalAction; Vitest regressions for spoofed request origin and same-origin bypass.",
    status: "done",
    phase: "Phase 3 — Payments",
    owner: "cursor/prompt-process-evolution-e382",
  },
  {
    id: "orphan-archive-lost-update-guard",
    summary:
      "Empty-backlog after PR #210 (commerce-catalog-sync-lost-update-guard) and PR #209 (stripe-redirect-app-url-no-host-trust, merged mid-window — not touched, in-flight sibling territory avoided). Eighth consecutive audit today; explicitly instructed to prefer a documented clean pass. Checked the same TOCTOU pattern for LLM-generation actions (clean — generateMarketingPackAction/generateClientVoicePackAction write a freshly-built complete pack with no fields carried over from a pre-op read, so last-write-wins between two concurrent regenerations is intended and harmless, unlike a merge that could drop a concurrent edit). Found the same lost-update bug class as commerce-catalog-sync-lost-update-guard applied to a different action: archiveOrphanCommerceStripeProductsAction reads the catalog once, then listOrphanCommerceStripeProducts paginates every active Stripe Product on the account (real, materially long) before sequentially archiving every computed orphan — all against that single stale keepSkuIds snapshot. A concurrent saveCommerceCatalogAction that re-adds/renames a SKU into the same id during that window would still get its live Stripe Product archived (active=false), silently breaking that SKU's Buy now checkout with no operator signal (the action still reports success). Shipped: split archiveCommerceStripeProducts (archive-only) out of archiveOrphanCommerceStripeProducts (list+archive convenience wrapper, unchanged for existing callers); the action re-reads the catalog between the list and archive steps and drops any candidate whose skuId reappeared.",
    status: "done",
    phase: "Phase 8 — Commerce",
    owner: "claude/relaxed-galileo-t69qzz",
  },
  {
    id: "safe-next-path-dot-segment-traversal",
    summary:
      "Empty-backlog after PR #211 (orphan-archive-lost-update-guard); only one unrelated open PR (#202, draft, agent-run dashboard) — no overlap. Ninth consecutive audit today; reviewed the newest sibling-authored code (safe-next-path.ts, shipped by PR #208) rather than re-running an already-exhaustively-covered axis. isSafeNextPath restricts a next path to /dashboard or /dashboard/*, but never rejected a `..` path segment: /dashboard/../checkout?ref=x literally starts with \"/dashboard/\" and passed every existing check, yet a browser normalizes both that literal form and its percent-encoded twin /dashboard/%2e%2e/checkout down to /checkout before the redirect is ever sent — escaping the documented /dashboard/*-only contract on a same-origin (not cross-domain) basis. Verified by manually tracing the function against the exploit string and empirically confirming the normalization with `new URL()`. Shipped: containsDotDotSegment(path) — strips query/hash, fully percent-decodes the pathname (failing closed, i.e. treating a decode error as unsafe), and rejects any `/`-split segment equal to `..` — checked in isSafeNextPath alongside the existing structural checks. Deliberately conservative: because decodeURIComponent decodes %2f into a literal slash too, the escaped-slash variant /dashboard/..%2fcheckout also gets rejected (it decodes to a `..` segment) even though a real browser treats %2f as an inert literal within one segment rather than a separator — over-rejecting an ambiguous encoding is the safer failure mode for a security gate than under-rejecting it, and no real dashboard next-path legitimately contains %2f.",
    status: "done",
    phase: "Phase 1 — Website foundation",
    owner: "claude/relaxed-galileo-t69qzz",
  },
  {
    id: "checkout-slug-sanitize-traversal",
    summary:
      "Empty-backlog after PR #213 (safe-next-path-dot-segment-traversal); re-checked origin/main and open PRs first — only #202 (unrelated draft) open, no collision risk. Tenth consecutive audit today; dispatched a background review agent instructed to look for a NEW instance of an already-fixed bug class in an unexplored surface rather than re-running a fully-covered axis, since the dot-segment-traversal class just fixed on the login-redirect surface was a strong hint other input surfaces feeding path/host construction might share the same gap. It found one: resolveBundleCheckoutLeadSlug (src/lib/checkout/organic-attribution.ts), used by the public, unauthenticated POST /api/stripe/checkout to resolve the CRM lead slug for a bundle Checkout Session, only trimmed whitespace on a client-supplied slug — no charset restriction — unlike every other lead-slug-creation path (slugifyBusinessName, addLeadAction's explicit-slug sanitize, CSV import's slug-column sanitize), which all normalize to [a-z0-9-]+. A crafted slug (e.g. \"../../dashboard/leads\") flows into session.metadata.slug, then on checkout.session.completed the webhook's recordLeadPayment/markLeadPaid persists it verbatim as a brand-new paid lead (no existing-lead gate on this path, unlike POST /api/commerce/checkout which requires an existing catalog match first and was independently re-verified as not exploitable). That persisted slug is later interpolated unescaped into suggestedHost/previewUrl/contactFormUrl (src/lib/deploy/handoff.ts) and, most seriously, proxy.ts's preview-subdomain rewrite (`NextResponse.rewrite(new URL(`/preview/${slug}`, request.url))`) — WHATWG URL path normalization collapses a `..`-segment slug there, and proxy.ts's dashboard auth gate only inspects the ORIGINAL incoming pathname (\"/\"), never the post-rewrite destination, so a request whose Host resolves to this poisoned slug could have Next.js serve dashboard-route content with the auth gate never re-evaluated for that route (dashboard/leads/page.tsx has no independent requireOperatorAuth call of its own — the comment in proxy.ts notes only server actions do, not page rendering). Real-world network-layer reachability of that exact proxy.ts bypass is narrowed by Host headers not syntactically supporting `/` or `..` at the DNS/TLS layer, but the underlying gap — an unauthenticated, real-payment-gated path that can persist a non-conforming lead slug at all, violating the established 'every lead slug is a safe token' invariant — is real and worth closing regardless of that specific downstream chain's practical reach. Shipped: sanitizeCheckoutLeadSlug (mirrors the existing [a-z0-9-]+ normalize-and-collapse pattern, plus a leading/trailing-dash trim) applied inside resolveBundleCheckoutLeadSlug; falls back to minting an organic-* slug when a raw value sanitizes away to nothing (all-symbol or dots-only input), matching the existing missing/whitespace-only handling.",
    status: "done",
    phase: "Phase 3 — Payments",
    owner: "claude/relaxed-galileo-t69qzz",
  },
  {
    id: "preview-indexing-consent-guard",
    summary:
      "Empty-backlog after PR #216 (checkout-slug-sanitize-traversal). Sibling remotes claude/dev-work-preview-index-consent and grok/continuous-work-preview-index had a complete feature body for gating /preview/[slug] sitemap+robots indexability on consent, but neither opened a mergeable PR (Actions token blocked / handoff via issue #214). On main, sitemap.ts listed EVERY persisted lead slug and /preview emitted no robots directive — cold-prospected local businesses got AI demos indexed under the platform domain. Folded that body onto this automation branch per AGENT_PROTOCOL. Shipped: isLeadPreviewIndexable (src/lib/seo.ts) + isCuratedDemoLeadSlug (src/lib/leads/demo-catalog.ts); sitemap filters to indexable slugs; /preview/[slug] generateMetadata emits robots noindex,nofollow otherwise.",
    status: "done",
    phase: "Phase 1 — Website foundation",
    owner: "cursor/business-process-evolution-7bfa (folded from claude/dev-work-preview-index-consent + grok/continuous-work-preview-index)",
  },
  {
    id: "redirect-url-validator-hardening",
    summary:
      "Empty-backlog after PR #216 (checkout-slug-sanitize-traversal). Same-minute sibling business-process-evolution-7bfa claimed preview-indexing-consent-guard (folding claude/dev-work-preview-index-consent). Complementary: grok/dev-work-redirect-url-hardening had a complete feature body hardening residual gaps on the two newest security validators, but no mergeable PR (Actions token blocked; handoff via issue #215). Verified empirically on main: isSafeNextPath still accepted /dashboard/login#x, /dashboard/./login, and /dashboard/%6cogin (authenticated-operator login redirect loop); resolveTrustedAppUrl still accepted javascript: proto and host path-smuggling because bare new URL() succeeds. Folded that body onto this automation branch: normalizePathnameForSafety in safe-next-path (decode + collapse `.` + reject `..`, then apply dashboard-prefix + login self-loop checks on the normalized form); tryHeaderDerivedAppOrigin in app-url (http(s) only, host-only, no userinfo/path/query/hash, return url.origin).",
    status: "done",
    phase: "Phase 1 — Website foundation",
    owner: "cursor/prompt-process-evolution-f936 (folded from grok/dev-work-redirect-url-hardening)",
  },
  {
    id: "convex-query-ordering-parity",
    summary:
      "Empty-backlog after PR #218 (redirect-url-validator-hardening). Free NEXT_STEPS stayed operator/legal-gated. Scanned stuck CLI remotes first and found multiple complete feature bodies for Convex↔SQLite list-order parity (grok/dev-work-convex-order-parity, grok/continuous-work-convex-order, claude/dev-work-convex-order-parity, opencode/dev-work-7qz1k9, opencode/dev-work-convex-order-parity, claude/continuous-work-convex-parity) with no open PR (Actions token blocked). On main: leads.list bare .collect() (oldest-first) vs getLeads ORDER BY createdAt DESC; checkoutSessions.listOpen unsorted vs SQLite ASC; inquiries.listBySlug .order(\"desc\") sorts _creationTime not app createdAt. Folded that body: leads.list .order(\"desc\"); checkoutSessions.listOpen sort createdAt ISO asc; inquiries.listBySlug collect + sort createdAt numeric desc + slice(limit); architecture + AGENT_PROTOCOL dual-backend ordering contract.",
    status: "done",
    phase: "Phase 1 — Website foundation",
    owner:
      "cursor/prompt-process-evolution-7291 (folded from grok/dev-work-convex-order-parity + claude/dev-work-convex-order-parity + opencode/dev-work-7qz1k9)",
  },
  {
    id: "handoff-provision-lost-update-guard",
    summary:
      "Empty-backlog after PR #222 (convex-query-ordering-parity). Free NEXT_STEPS stayed operator/legal-gated. Sibling 7291 owned ordering parity; pivoted to TOCTOU axis (commerce sync + orphan archive already guarded). assignCustomDomainAndProvision / assignVercelProjectAndProvision / enqueueProductionHandoff called tryProvisionVercelDomain (real Vercel fetch) then insertDeployHandoff the pre-call snapshot via full-row upsert — a concurrent Mark live during that window was silently reverted. Shipped: mergeProvisionOntoFreshHandoff + re-read before final write.",
    status: "done",
    phase: "Phase 5 — Fulfillment",
    owner: "cursor/business-process-evolution-eccd",
  },
  {
    id: "handoff-email-marker-status-no-downgrade",
    summary:
      "Empty-backlog after PR #223 (handoff-provision-lost-update-guard). Bundle webhook durable receipt/DNS sent-markers called updateDeployHandoffStatus(slug, handoff.status, [markerNote]) with the status snapshot from enqueueProductionHandoff — if an operator Mark live landed during the Resend window, the marker write overwrote status back to awaiting_dns/provisioned and undid Mark live (handoff/lead stage desync). Shipped: preferAdvancedHandoffStatus never-downgrade merge inside updateDeployHandoffStatus (Convex mutation + SQLite path) so note-only marker writes cannot regress live/provisioned progress while Mark live upgrades still win.",
    status: "done",
    phase: "Phase 5 — Fulfillment",
    owner:
      "cursor/business-process-evolution-8524 (folded from grok/dev-work-handoff-marker-status)",
  },
  {
    id: "client-voice-factory-test-env-isolation",
    summary:
      "Empty-backlog after PR #226 (handoff-email-marker-status-no-downgrade, sibling-owned). Free NEXT_STEPS stayed gated. Scanned stuck CLI remotes: grok/continuous-work-voice-test-env had a complete fix — faq-pack.test.ts default factory .generate() lacked ANTHROPIC_API_KEY isolation (generators.test.ts already clears it), so CI/agent secrets can force a live Anthropic call mid-suite. Folded: clear/restore key around getClientVoiceGenerator().generate(); assert StubClientVoiceGenerator + CLIENT_VOICE_FAQ_SCRIPT_TYPES.length.",
    status: "done",
    phase: "Phase 6 — Marketing automation",
    owner:
      "cursor/prompt-process-evolution-6033 (folded from grok/continuous-work-voice-test-env)",
  },
  {
    id: "csv-import-hours-multiline-limits",
    summary:
      "Empty-backlog after PR #227 (client-voice-factory-test-env-isolation). Sibling business-process-evolution-2d7a already claimed legacy-slug-encode-at-use-path-safety — pivoted. Next stuck CLI remote with feature body and no open PR: opencode/dev-work-f3k8p1. CSV import still hardcodes default hours (no hours column), splits on every newline (breaks RFC 4180 quoted multiline descriptions), and has no field-length caps; parseLeadHours splits on every '·' so a weekend value that itself contains the delimiter loses the tail. Folded: hours column + first-separator parseLeadHours + splitCsvIntoLines + businessName/description/services limits.",
    status: "done",
    phase: "Phase 4 — Data ingestion",
    owner:
      "cursor/prompt-process-evolution-78e4 (folded from opencode/dev-work-f3k8p1)",
  },
  {
    id: "legacy-slug-encode-at-use-path-safety",
    summary:
      "PR #216 closed the create-path (sanitizeCheckoutLeadSlug on POST /api/stripe/checkout) so new payment_stub / paid leads cannot land with path-breaking slugs. Residual: several use-sites still interpolated lead.slug into /preview/{slug}, /api/contact/{slug}, proxy rewrites, deploy handoff preview/contact URLs, and outreach email links without encodeURIComponent — a legacy or pre-sanitize row (and any future create-path miss) remains a single-segment path hazard. Shipped: src/lib/leads/slug-path.ts (encodeLeadSlugPathSegment / leadPreviewPath / leadPreviewAbsoluteUrl / leadContact* / leadSlugAsDnsLabel) wired through seo.previewUrl, handoff build, resend outreach/upsell/commerce recovery, proxy rewrites, sitemap, commerce cancel_url, webhook receipt, dashboard/checkout hrefs.",
    status: "done",
    phase: "Phase 1 — Website foundation",
    owner:
      "cursor/business-process-evolution-2d7a (folded from grok/continuous-work-slug-path-encode ← grok/dev-work-slug-path-encode; issues #228/#229)",
  },
  {
    id: "server-action-as-const-success-restore",
    summary:
      "PR #231 (slug-path-encode fold) silently reverted as const on updateLeadStageAction / importLeadsCsvAction / bootstrapStripePricesAction success literals by merging a pre-fix actions.ts. Without as const, TS widens success to boolean and defeats discriminated-union narrowing at call sites. Also restore as const on sendEmail / sendOperatorDailyDigest (same class; sibling continuous-work-062115). Shipped: restored as const on all three action return paths + sendEmail/sendOperatorDailyDigest (no duplicate keys).",
    status: "done",
    phase: "Phase 1 — Website foundation",
    owner:
      "cursor/prompt-process-evolution-7c34 (earlier claim; folded from grok/continuous-work-as-const-restore ← grok/dev-work-as-const-restore ← opencode/dev-work-9k2m4x + opencode/continuous-work-062115; issues #232/#233; same-minute dual with business-process-evolution-9ced — both ITERATIONS kept; 9ced follow-up: architecture as-const prose)",
  },
  {
    id: "email-href-url-html-escape",
    summary:
      "src/lib/email/resend.ts injects previewUrl / checkoutUrl / catalogUrl / unsubscribeUrl / baseUrl into HTML href attributes without escapeHtmlForEmail, while sibling templates (client-receipt, marketing/voice deliver-pack, dns-email, daily-digest) already escape URLs. Env-sourced NEXT_PUBLIC_APP_URL (or a future header-derived base) with a quote/ampersand can break out of the attribute. Ship escapeHtmlForEmail on every dynamic href in resend.ts + Vitest regressions.",
    status: "done",
    phase: "Phase 2 — Outreach + platform voice",
    owner:
      "cursor/business-process-evolution-266d (folded from grok/continuous-work-email-href-escape; issue #236)",
  },
  {
    id: "mark-handoff-live-null-status-guard",
    summary:
      "markHandoffLive advanced lead stage to live even when updateDeployHandoffStatus returned null (handoff vanished between the initial get and the status write). Operator then saw \"No deploy handoff found\" while stage=live and paid-not-live / open-handoff metrics diverged. Shipped: return null before updateLeadStage when the status write is null; Vitest regression; dashboard revalidatePath uses leadPreviewPath (encode-at-use).",
    status: "done",
    phase: "Phase 5 — Production deploy",
    owner:
      "cursor/prompt-process-evolution-7e66 (folded from grok/dev-work-mark-live-null-guard; issue #237; sibling 266d owns email-href-url-html-escape)",
  },
  {
    id: "custom-domain-host-normalize",
    summary:
      "Empty-backlog audit: assignCustomDomainAction / updateDeployHandoffCustomDomain only trim+lowercase operator Save domain input. Pasting a browser URL (https://joesplumbing.com/), a port (host:443), trailing FQDN dot, or path leaves a stored customDomain that never equals normalizeRequestHost(Host), so proxy.ts Host→preview routing and Vercel domain registration silently fail the sold Starter custom-domain handoff. Shipped: normalizeOperatorCustomDomainHost + parseOperatorCustomDomain; wire into action + db + Convex updateCustomDomain; Vitest on routing + action glue.",
    status: "done",
    phase: "Phase 5 — Production deploy",
    owner:
      "cursor/business-process-evolution-57f2 (folded from grok/continuous-work-custom-domain-normalize ← grok/dev-work-custom-domain-normalize; issues #240/#241)",
  },
  {
    id: "custom-domain-normalize-and-unique",
    summary:
      "Complement to custom-domain-host-normalize: also reject when getLeadSlugByCustomDomain returns a different lead before assignCustomDomainAndProvision — Host→preview first-match would otherwise silently serve the wrong client when two handoffs share one customDomain. Shipped with bare-host normalize in one path.",
    status: "done",
    phase: "Phase 5 — Production deploy",
    owner:
      "cursor/business-process-evolution-57f2 (folded from grok/dev-work-custom-domain-normalize uniqueness; same-window with continuous-work host-normalize; issues #240/#241)",
  },
  {
    id: "transactional-email-skip-marketing-suppression",
    summary:
      "sendEmail always honors the marketing suppression list, so sendReceiptEmail / post-payment DNS handoff sendEmail / sendCommerceBuyNowClientReceipt permanently fail for a lead who unsubscribed from cold outreach then later paid — markers stay unwritten and Stripe redelivers forever (bundle-webhook-receipt-marker-requires-send-success named the scenario but only gated the marker). Ship skipSuppression (or equivalent) for transactional paid-fulfillment sends; keep suppression for outreach, abandoned recovery, upsell, and marketing/voice pack delivery.",
    status: "done",
    phase: "Phase 3 — Payments",
    owner: "cursor/prompt-process-evolution-f6b5",
  },
  {
    id: "contact-form-notify-skip-marketing-suppression",
    summary:
      "POST /api/contact/[slug] notifies lead.email (or support) via sendEmail without skipSuppression. After transactional-email-skip-marketing-suppression, a lead who unsubscribed from cold outreach then converted still never receives Starter sold contact-form inquiry alerts — CRM trail exists but business/operator notify is permanently suppressed. Ship skipSuppression: true on that product notify; keep suppression for outreach, abandoned recovery, upsell, and marketing/voice pack delivery.",
    status: "done",
    phase: "Phase 5 — Production deploy",
    owner:
      "cursor/prompt-process-evolution-63b3 (PR #246; folded from grok/continuous-work-contact-notify-skip; issue #244; same-minute dual with business-process-evolution-fbad — fbad claimed ~2s earlier and also folded, then pivoted after #246 landed)",
  },
  {
    id: "create-path-slug-edge-dash-normalize",
    summary:
      "Empty-backlog sold-capability audit: addLeadAction and CSV slug-column sanitize keep leading/trailing dashes (e.g. \"Demo Cafe!\" → demo-cafe-) while sanitizeCheckoutLeadSlug, slugifyBusinessName, and leadSlugAsDnsLabel all strip them. suggestedHost then becomes demo-cafe.{root} but the CRM slug stays demo-cafe-, so extractPreviewSubdomainSlug → getLeadBySlug misses the lead and Starter preview-subdomain Host→preview silently falls through to the marketing homepage. Align every create-path on a shared sanitizeLeadSlug (collapse + strip edge dashes; reject/fallback when empty). Stuck feature body: grok/dev-work-slug-edge-dash (issue #245; Actions token blocked).",
    status: "done",
    phase: "Phase 1 — Website foundation",
    owner:
      "cursor/business-process-evolution-fbad (folded from grok/dev-work-slug-edge-dash; issue #245; pivoted after PR #246 absorbed contact-form-notify-skip)",
  },
  {
    id: "inquiry-reply-skip-marketing-suppression",
    summary:
      "After contact-form-notify-skip-marketing-suppression, the operator Reply half of the same Starter sold contact-form CRM loop still honors marketing suppression via sendInquiryReply. Persist-then-notify marks the inquiry replied even when the visitor never receives the email (global CAN-SPAM list — e.g. a cold-outreach unsub who later writes a paying client's site). Ship skipSuppression: true on sendInquiryReply; keep suppression for outreach, abandoned recovery, upsell, and marketing/voice pack delivery.",
    status: "done",
    phase: "Phase 5 — Client sites + handoff",
    owner: "cursor/prompt-process-evolution-f037",
  },
  {
    id: "custom-domain-www-apex-alias",
    summary:
      "After custom-domain-host-normalize + uniqueness (exact host only): Save www.client.com still misses Host client.com (and vice versa), and two leads can own www vs apex of the same domain — Host→preview first-match then serves the wrong business under what operators treat as one domain. Ship customDomainHostAliases + alias-aware getLeadSlugByCustomDomain / assignCustomDomainAction uniqueness / tryProvisionVercelDomain dual-register. Keep storing the operator's chosen bare host.",
    status: "done",
    phase: "Phase 5 — Production deploy",
    owner: "cursor/business-process-evolution-0064",
  },
  {
    id: "marketing-voice-pack-skip-suppression",
    summary:
      "Empty-backlog scan after transactional + contact-form + inquiry-reply skipSuppression: sendMarketingPackToClientEmail and sendClientVoicePackToClientEmail deliver paid Growth/Complete features (monthly marketing content, AI phone scripts) to lead.email but still honor marketing suppression — a paying customer who unsubscribed from cold outreach silently loses features they are billed for. Ship skipSuppression: true on both; keep suppression for outreach, abandoned recovery, and Starter upsell. Stuck feature body: grok/continuous-work-marketing-voice-skip + grok/dev-work-marketing-voice-skip + opencode/dev-work-marketing-voice-skip-suppression (Actions token blocked; no open PR). Dual-claimed same window by cursor/business-process-evolution-d2b8; ea8d merged as PR #252.",
    status: "done",
    phase: "Phase 6 — Marketing automation",
    owner:
      "cursor/prompt-process-evolution-ea8d (PR #252; dual with cursor/business-process-evolution-d2b8; folded from grok/continuous-work-marketing-voice-skip + grok/dev-work-marketing-voice-skip + opencode/dev-work-marketing-voice-skip-suppression)",
  },
  {
    id: "digest-pipeline-health-age-and-count-wiring",
    summary:
      "Empty-backlog audit of pipeline-health/digest wiring completeness found dashboard-only age/count fields with no DailyDigest equivalent. Wire the four most actionable: newInquiryCount (distinct new vs unreplied urgency), oldestUnrepliedInquiryAgeHours, oldestFollowUpDueAgeHours, and closedLeadCount (settled-inventory footnote). Each is a direct map of an existing pipeline-health aggregate, not a new metric. Stuck feature body: grok/continuous-work-digest-age-counts + opencode/dev-work-20260715 + codex/continuous-work-6a36ae (Actions token blocked; no open PR). Stale claim-only remotes cursor/prompt-process-evolution-8fc4 + cursor/business-process-evolution-3fe8 do not own this (idle with no feature body).",
    status: "done",
    phase: "Phase 2 — Outreach + platform voice",
    owner:
      "cursor/prompt-process-evolution-7d49 (folded from opencode/dev-work-20260715 + grok/continuous-work-digest-age-counts + codex/continuous-work-6a36ae; reclaimed after stale claim-only 8fc4/3fe8)",
  },
  {
    id: "login-rate-limit",
    summary:
      "Empty-backlog audit after PR #253 (marketing-voice-pack-skip-suppression): loginOperatorAction had zero rate limiting despite being a public, unauthenticated password-check endpoint. A brute-force script can guess passwords at wire speed with no throttle. Ship checkRateLimit with a tighter login-appropriate limit (5 attempts/60s) before the password comparison. Rate-limited attempts redirect to the login page with error=rate_limited and the page renders a 'Too many attempts' alert. Complementary: the existing checkRateLimit helper and clientIpFromHeaders are already tested by 7 other route/action sites. Stuck feature body: grok/continuous-work-login-rate-limit + grok/dev-work-login-rate-limit + opencode/dev-work-login-rate-limit* (Actions token blocked; no open PR). Sibling prompt-process-evolution-7d49 claimed/merged digest-pipeline-health-age-and-count-wiring (PR #276) in the same window — this is the next free fold.",
    status: "done",
    phase: "Phase 1 — Website foundation",
    owner:
      "cursor/business-process-evolution-693b (folded from grok/continuous-work-login-rate-limit + grok/dev-work-login-rate-limit + opencode/dev-work-login-rate-limit*)",
  },
  {
    id: "digest-age-mirror-oldest-abandoned-cold",
    summary:
      "Empty-backlog after PR #277 (login-rate-limit): remaining PipelineHealth age mirrors oldestAbandonedAgeHours and oldestColdLeadAgeHours were still missing from the daily digest. The digest section headers show only the count for abandoned checkouts and cold leads, never how long the oldest has been sitting — a single-operator business relying on the digest has no way to gauge urgency of stale abandoned carts or cold inventory without opening the dashboard. Shipped: oldestAbandonedAgeHours (from listAbandonedCheckoutsDue) + oldestColdLeadAgeHours (from listColdLeads) on DailyDigest + buildDailyDigest + renderDailyDigestHtml section headers + Vitest regressions. Stuck feature body: opencode/dev-work-digest-age-mirrors (Actions token blocked; no open PR).",
    status: "done",
    phase: "Phase 2 — Outreach + platform voice",
    owner:
      "cursor/prompt-process-evolution-1ce7 (folded from opencode/dev-work-digest-age-mirrors)",
  },
  ];
