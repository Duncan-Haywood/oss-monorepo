/**
 * Archived NextStep entries — see src/lib/process/prompt_process.tsx for
 * why this exists (process-log-archive-scalability-split in
 * BUSINESS_DECISIONS) and for the live, editable tail. Part 3, oldest-first
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

export const NEXT_STEPS_DONE_ARCHIVE_03: NextStep[] = [
{
    id: "followups-due-panel-staleness-signal",
    summary:
      "Empty-backlog audit (tier 1 — sold-capability wiring gap) found the operator dashboard's 'Follow-ups due' and 'Cold leads' panels were the only two due-queue panels on the summary-card grid with zero 'oldest Xh' staleness signal in their header, unlike every sibling panel (Starter upsell, abandoned checkouts, marketing packs due, etc.) once the staleness-signal series closed their gaps. pipeline-health.ts and daily-digest.ts both already computed this same age (oldest lastOutreachAt across the cold/follow-up-due set) but as four separate hand-rolled inline loops/IIFEs, none of them a shared helper the dashboard could reuse. Extracted oldestLastOutreachAgeHours (src/lib/email/outreach-followups.ts) following the existing oldestCheckoutSessionAgeHours precedent (order-agnostic, takes a pre-filtered list + nowMs), replaced all four inline duplicates, and wired it into the two dashboard panel headers.",
    status: "done",
    phase: "Phase 2 — Outreach + platform voice",
    owner: "claude/nice-euler-fimvs9",
  },
{
    id: "dashboard-landing-staleness-signal",
    summary:
      "Empty-backlog audit (tier 1 — sold-capability wiring gap) found the operator dashboard LANDING page (src/app/dashboard/page.tsx, the summary-card grid an operator sees before drilling into /dashboard/leads) never got the 'oldest Xh' staleness suffix its sibling detailed panel (PipelineHealthPanel on /dashboard/leads) already carries on every due-queue card — the entire staleness-signal series (PRs #443 onward, through #466) only ever touched the detailed panel and daily-digest.ts, never this simpler landing page, even though it reads the exact same PipelineHealth object (oldestOpenHandoffAgeHours, oldestAbandonedAgeHours, oldestUnrepliedInquiryAgeHours were already computed and unused here). Wired the same formatAbandonedAgeHours suffix into the landing page's Open handoffs, Recovery due (appended to the existing 'N abandoned carts' line), and Unreplied inquiries cards — no new data loading, pure UI wiring of already-available fields. leadsMissingEmailCount correctly stays without an age suffix (PipelineHealth has no corresponding oldest-age field for it) and Revenue is not a due-queue.",
    status: "done",
    phase: "Phase 1 — Website foundation",
    owner: "claude/upbeat-dijkstra-vckuj3",
  },
{
    id: "dashboard-landing-buy-now-carts-card",
    summary:
      "Empty-backlog audit (tier 1 — sold-capability wiring gap) found the operator dashboard LANDING page's 'Recovery due' card only ever surfaced the bundle-plan abandoned-checkout queue (recoveryDueCount / abandonedCheckoutCount / oldestAbandonedAgeHours) — the entirely separate Commerce Buy Now recovery queue (commerceRecoveryDueCount / commerceAbandonedCheckoutCount / oldestCommerceAbandonedAgeHours, kind=commerce_sku checkouts) was invisible on this page even though computePipelineHealth (already called here) computes it from data the page already loads (listOpenCheckoutSessions()), and both sibling surfaces (PipelineHealthPanel's 'Buy now carts' card on /dashboard/leads, daily-digest.ts's 'Abandoned Buy now' email section) already treat it as a first-class, independently-tracked due-queue. Added a new 'Buy now carts' card to the landing grid (lg:grid-cols-5 → lg:grid-cols-6), copying PipelineHealthPanel's exact card copy verbatim rather than folding the count into the existing bundle-only 'Recovery due' card — bundle and commerce are deliberately never summed anywhere else in this codebase (see the money-separation AGENT_PROTOCOL rule for the analogous revenue case), so a landing-page-only combined total would have been a new, unprecedented aggregate.",
    status: "done",
    phase: "Phase 3 — Payments",
    owner: "claude/upbeat-dijkstra-vckuj3",
  },
{
    id: "dashboard-landing-paid-not-live-card",
    summary:
      "Empty-backlog audit (tier 1 — sold-capability wiring gap; explicitly re-checked tiers 2-5 first since the landing-page-vs-detailed-panel gap had already been mined twice in a row) found the operator dashboard LANDING page's summary grid (six cards: Revenue, Open handoffs, Recovery due, Buy now carts, Unreplied inquiries, Missing email) was still missing paidNotLiveCount / oldestPaidNotLiveAgeHours — leads that reached stage=paid but have no deploy handoff at all yet, the most revenue-critical stuck-money signal in PipelineHealthPanel (a distinct queue from Open handoffs, which only counts leads that DO have a handoff row still open). Already computed by computePipelineHealth on this exact page and already surfaced on both PipelineHealthPanel (/dashboard/leads) and daily-digest.ts. Added a 'Paid, not live' card immediately after 'Open handoffs' (grid lg:grid-cols-6 → lg:grid-cols-4 xl:grid-cols-7 to fit the seventh card), copying PipelineHealthPanel's exact card copy verbatim ('See the Paid, not live panel on /dashboard/leads' / 'None pending').",
    status: "done",
    phase: "Phase 1 — Website foundation",
    owner: "claude/upbeat-dijkstra-vckuj3",
  },
{
    id: "dashboard-landing-clawback-cards",
    summary:
      "Empty-backlog audit dispatched with explicit instructions to weight tiers 2-5 heavily this time, since PRs #466-#469 were four consecutive tier-1 'landing page missing a card the detailed panel has' fixes. Tiers 2-5 came back clean (Convex/SQLite parity, security/rate-limiting, untested src/lib modules, digest header-count rule — all independently reconfirmed clean). The one remaining tier-1 gap judged genuinely high-priority rather than a mechanical continuation: commerceOrdersRefundClawbackUsd / commerceOrdersDisputeClawbackUsd (Buy Now orders the operator already paid out to a client, then Stripe refunded or the shopper disputed after the fact — real realized-loss dollars the operator must claw back) were computed by computePipelineHealth on the landing page already but never surfaced there, unlike PipelineHealthPanel's two dedicated USD-amount cards. Unlike every prior card in this series (all queue counts), this is a dollar-loss figure — the second-most severe money signal in the whole PipelineHealth object after Revenue itself. Added two cards ('Refund clawback needed', 'Dispute clawback needed') near the top of the landing grid, right after Revenue, copying PipelineHealthPanel's copy. Also added an AGENT_PROTOCOL note formally closing the landing-page-parity series: the landing page is a deliberately compact pre-drill-down summary, not a second detailed panel, and future landing-page card requests need an affirmative case (a comparable realized-loss dollar signal), not merely 'the detailed panel has this and the landing page doesn't' — to stop this becoming an indefinite one-card-per-iteration mechanical series against PipelineHealthPanel's ~20 remaining MetricCards.",
    status: "done",
    phase: "Phase 3 — Payments",
    owner: "claude/upbeat-dijkstra-vckuj3",
  },
{
    id: "daily-digest-empty-state-copy-drift",
    summary:
      "Empty-backlog audit, explicitly steered away from the now-closed landing-page-parity series (see dashboard-landing-clawback-cards / AGENT_PROTOCOL's 'deliberately compact pre-drill-down summary' note) and told to weight tiers 2-5 heavily. Found renderDailyDigestHtml's (src/lib/digest/daily-digest.ts) 'Nothing urgent today' empty-state prose hand-duplicated a hardcoded 13-section subset of the same 19 sections actionableItemCount sums (and isEmpty gates on) — silently omitting refund clawback, dispute clawback, bundle refunds, bundle disputes, paid-not-live, and missing email, six sections including the two dollar-denominated clawback signals PR #470 just added to the landing page. The isEmpty boolean itself was correct (not a functional bug); only the operator-facing copy undersold what was actually checked. Same root-cause class as the already-fixed daily-digest-button-item-count-drift (a second hand-maintained enumeration silently falling behind the one true section list). Refactored the manual actionableItemCount `+` chain into a single ReadonlyArray<{label, count}> source of truth (actionableSections), deriving both actionableItemCount (via reduce) and a new actionableSectionLabels field on the DailyDigest interface from it, and rewrote renderDailyDigestHtml's empty-state sentence to join digest.actionableSectionLabels via a new joinWithAnd helper instead of a hardcoded string — so a future 20th section added to actionableItemCount can no longer omit itself from this prose the way six sections previously did.",
    status: "done",
    phase: "Phase 2 — Outreach + platform voice",
    owner: "claude/upbeat-dijkstra-vckuj3",
  },
{
    id: "agent-protocol-clawback-rejection-ui-stale-claim",
    summary:
      "Empty-backlog audit found AGENT_PROTOCOL's money-ledger section made a factually wrong blanket claim: 'there is no automated clawback or Mark-paid-out rejection UI, since that ledger is never mechanically disbursed.' A sibling agent's just-merged PR #471 (refund-reversal tracking) prompted a fresh audit of that PR's parity, which surfaced that the claim was already false before #471 even shipped — Commerce Buy now HAS had a Mark-paid-out rejection UI since the clawback-tracking series: markCommerceOrderPaidOutAction (src/app/dashboard/leads/actions.ts:1239-1254) hard-rejects the action once order.refundedAt/disputedAt is set, and leads-client.tsx (:1691-1721) swaps the 'Mark paid out' button for 'Refunded/Disputed — nothing owed' (or '— claw back from client' once already paid out). Only Bundle orders genuinely have no such UI (no dashboard action ever disburses that ledger at all, so nothing to reject) — the docs page (src/app/docs/architecture/page.tsx) already got this distinction right, but AGENT_PROTOCOL itself, the rulebook every agent reads first, conflated the two ledgers with an over-broad blanket statement. Left uncorrected, a future agent could waste a cycle 'discovering' and rebuilding a rejection UI that already exists. Corrected the AGENT_PROTOCOL bullet to state the accurate distinction and cross-reference the actual code + docs page.",
    status: "done",
    phase: "Phase 3 — Payments",
    owner: "claude/upbeat-dijkstra-vckuj3",
  },
{
    id: "launch-checklist-convex-api-secret-gap",
    summary:
      "Empty-backlog audit (tier 5 — docs staleness) diffed all 15 assess*EnvReadiness helpers in the codebase against /docs/launch-checklist's '4. Persistence' section and found assessConvexApiSecretEnvReadiness (src/lib/convex/convex-api-secret-env-readiness.ts) was the one banner never mentioned there — the checklist documented only the NEXT_PUBLIC_CONVEX_URL banner (assessConvexUrlEnvReadiness), not the second, distinct CONVEX_API_SECRET banner that gates on top of it once the URL is configured. Not cosmetic: ConvexApiSecretEnvBanner renders live on /dashboard and /dashboard/leads whenever the secret is missing, and every convex/*.ts public function requires it (requireApiSecret) — a missing secret fails every Convex call closed and silently falls back to instance-local SQLite, the same split-brain risk the URL banner exists to warn about. An operator following the checklist top-to-bottom, having satisfied the URL banner, would see no further guidance and could ship with every Convex write silently degrading to SQLite. /docs/architecture already documented this correctly; only launch-checklist was stale. Added a bullet mirroring architecture's accurate wording, right after the existing Convex URL bullet.",
    status: "done",
    phase: "Phase 1 — Website foundation",
    owner: "claude/upbeat-dijkstra-vckuj3",
  },
{
    id: "homepage-organization-jsonld",
    summary:
      "Picked up as a scheduled routine after a clean tiers-2-5 re-audit (Convex/SQLite parity, security/injection, untested orchestration, accessibility — img alt text, form label association, heading hierarchy — all independently re-verified clean, the third-plus consecutive clean pass on this exact backlog state). Found the homepage-own-SEO-parity gap of the same class as homepage-social-share-metadata (PR #462): /preview/[slug] emits schema.org LocalBusiness JSON-LD for a client's business, but the platform's own marketing site (root layout, every page) emitted no structured data describing itself at all. Shipped: homepageOrganizationJsonLd (src/lib/seo.ts) — a schema.org Organization block (name, legalName, url, email from brand.*) embedded sitewide in src/app/layout.tsx via safeJsonLdScript, the same escaping helper LocalBusiness JSON-LD already uses. Deliberately omits brand.postalAddress: unlike every other brand.* fallback, its no-env-set default is a bracketed placeholder string, not plausible real content, and publishing it verbatim as structured data would misrepresent a placeholder as a real address.",
    status: "done",
    phase: "Phase 1 — Website foundation",
    owner: "claude/upbeat-dijkstra-3aej2g",
  },
{
    id: "security-response-headers",
    summary:
      "Empty-backlog audit found this app sent zero hardening HTTP response headers anywhere (no X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, or Strict-Transport-Security) — next.config.ts had no headers() at all. Shipped: SECURITY_HEADERS (src/lib/security/security-headers.ts, a plain tested data module) wired into next.config.ts's headers() for source '/:path*' — clickjacking protection on /dashboard/login and every operator action, MIME-sniffing protection, reduced cross-origin referrer leakage, camera/microphone/geolocation locked to none, and HSTS. Content-Security-Policy deliberately NOT included in this pass — see csp-nonce-rollout.",
    status: "done",
    phase: "Phase 1 — Website foundation",
    owner: "claude/nice-euler-9y896u",
  },
  {
    id: "contact-form-success-message-focus-restore",
    summary:
      "Fresh-angle empty-backlog audit (research agent steered at TOCTOU races, Convex/TS type drift, public-form accessibility, and swallowed-error paths) found a genuine focus-loss bug in src/components/preview/contact-form.tsx — the Starter-tier sold contact form rendered on every live customer site: a successful submit unmounts the whole <form> (including the focused submit button, on a keyboard-driven Enter/Space submit) and replaces it with a <p role=\"status\"> success message, with no focus() call on that transition, so a keyboard-only/screen-reader visitor's focus silently reset to <body>. Shipped: focus now moves onto the success message itself (ref + tabIndex={-1} + a useEffect keyed on status). Verified with a real Playwright browser check (globally-installed Chromium, repo has no playwright devDependency) — confirmed via document.activeElement that this exact class of regression (undetectable by curl/build/lint/test alone) is fixed. See contact-form-success-message-focus-restore in BUSINESS_DECISIONS.",
    status: "done",
    phase: "Phase 1 — Website foundation",
    owner: "claude/nice-euler-ozmixm",
  },
  {
    id: "vercel-domain-provisioning-fetch-timeout",
    summary:
      "Fresh-angle empty-backlog audit found tryProvisionVercelDomain/releaseVercelDomains (src/lib/deploy/handoff.ts) had solid error handling (response.ok checks, 409-vs-hard-error distinction, network-error catch, never-downgrade-live) but neither Vercel Domains API fetch call (POST register, DELETE release) passed an AbortSignal — the exact gap anthropic-generator-fetch-timeout closed for the LLM generator fetches one iteration earlier. enqueueProductionHandoff awaits tryProvisionVercelDomain synchronously from the paid-checkout fulfillment path (Stripe webhook), so a hung Vercel connection could tie up that handler indefinitely instead of failing fast into the existing error_network handling. Shipped a VERCEL_REQUEST_TIMEOUT_MS = 15_000 constant and signal: AbortSignal.timeout(...) on both fetch calls, mirroring the just-shipped Anthropic pattern; an aborted call now degrades into the existing catch block's error_network handling unchanged.",
    status: "done",
    phase: "Phase 3 — Payments",
    owner: "claude/upbeat-dijkstra-2lowxy",
  },
  {
    id: "csp-nonce-rollout",
    summary:
      "Shipped as a two-tier policy, set per-request from src/proxy.ts (src/lib/security/content-security-policy.ts) rather than next.config.ts's static headers(): routes Next already renders dynamically per request (/dashboard, /checkout, /preview — isNonceCspPath) get the full nonce-scoped script-src/style-src + 'strict-dynamic' tier, following Next's documented proxy-nonce pattern exactly (the nonce is folded into the outgoing request's headers, not just the response, so Next can read it back out during SSR and auto-nonce its own framework scripts); every other route (static marketing/docs pages, /api/*) gets a nonce-free but still-hardened tier (object-src/base-uri/form-action/frame-ancestors) that deliberately leaves script-src/style-src unset so static-page hydration keeps working unchanged — a nonce there would permanently block Next's own framework script on every pre-rendered page. Turned out neither of this app's two inline <script> sinks (both application/ld+json JSON-LD, layout.tsx + preview/[slug]/page.tsx) needed the nonce threaded in at all: script-src only governs elements the browser would execute as script, and a JSON-LD data block never executes — so the 'thread the nonce through every inline script' half of this item's original framing turned out to be unnecessary once verified against the actual sinks in this codebase, not merely deferred. A rewrite (preview-subdomain / custom-domain Host routing) classifies by its /preview/[slug] destination, not the original \"/\" request path.",
    status: "done",
    phase: "Phase 1 — Website foundation",
    owner: "claude/upbeat-dijkstra-ifyjlb",
  },
  {
    id: "csp-nonce-preview-maps-frame-src",
    summary:
      "Empty-backlog audit after PR #478 (csp-nonce-rollout) found a real regression it introduced: buildNonceContentSecurityPolicy sets default-src 'self' with no frame-src directive, so the cross-origin Google Maps iframe on every /preview/[slug] page (src/components/preview/maps-embed.tsx) is CSP-blocked in a real browser — invisible to PR #478's own curl-only verification, which checked header presence and script nonce distribution but never rendered the page. Fixed: added frame-src 'self' https://www.google.com https://maps.google.com to the nonce tier.",
    status: "done",
    phase: "Phase 1 — Website foundation",
    owner: "claude/nice-euler-yw5xgd",
  },
  {
    id: "commerce-buy-now-client-receipt-visibility",
    summary:
      "Found-but-deferred while auditing tier 1 (sold-capability wiring gaps): commerceOrders.clientReceiptEmailSentAt (src/lib/db.ts, CommerceOrderRecord in src/lib/commerce/orders.ts) has zero visibility anywhere in pipeline-health, the daily digest, or the dashboard — there is no listCommerceOrdersMissingClientReceipt() and no manual resend action, so a permanently-bad client email or a sustained Resend outage past Stripe's webhook retry window leaves a local business never told they made a Commerce Buy-now sale, with no operator-visible signal that anything is wrong. Trivially wirable via a copy of the existing listCommerceOrdersRefunded()/listCommerceOrdersDisputed() pattern (src/lib/db.ts) plus a pipeline-health/digest section mirroring commerceCatalogsMissingCount. Left as a todo rather than shipped this round in favor of the higher-severity tier-2 revenue-integrity race fixed in the same iteration (cold-lead-disposition-paid-live-race-guard). Shipped 2026-07-20 — see commerce-buy-now-client-receipt-visibility-shipped in BUSINESS_DECISIONS. Updated 2026-07-20: the aggregate-count-only visibility shipped there turned out to still leave the operator unable to identify or act on which order was stuck (the fetched per-order list was never passed past the page component down to LeadsClient) — see commerce-buy-now-client-receipt-manual-resend in BUSINESS_DECISIONS for the row-level list + resend action that closes the gap for real.",
    status: "done",
    phase: "Phase 8 — Commerce",
    owner: "claude/nice-euler-rpyxre",
  },
  {
    id: "csv-import-text-length-capacity-math",
    summary:
      "Empty-backlog audit (tier 3/docs clarity, after a broad tier 1-4 sweep across the Stripe webhook, refund/dispute Convex+SQLite twins, proxy.ts, and OG-image routes turned up nothing else). MAX_CSV_IMPORT_TEXT_LENGTH's own doc comment in src/lib/leads/csv-import.ts claimed 512 KiB 'comfortably fits 100 capped rows (create-path MAX_* per cell)' — false by ~2.6x: a single row with a maximal services cell alone (MAX_SERVICES=100 x MAX_SERVICE_ITEM_LENGTH=100) is already ~10KB, so 100 such rows need ~1.3MB. A services-heavy bulk import (e.g. a trades/repair category CSV using the documented per-field caps) hits the 512KB byte gate well before MAX_ROWS=100, and importLeadsCsvAction returned a flat 'CSV text is too long' with no indication of why or how to fix it. Not raising the cap to actually fit 100 max rows: importLeadsCsvAction is a \"use server\" action and next.config.ts does not override Next's default serverActions.bodySizeLimit (1MB) — raising past that framework ceiling would trade an actionable too_long result for an opaque Next-level body-size rejection on requests between the two limits, a worse outcome. Shipped: corrected the misleading doc comment; the too_long error now says '...(over 512,000 characters) — split it into smaller batches (fewer rows, or shorter services lists) and import each separately'; two new Vitest guards in csv-import.test.ts — one pinning MAX_CSV_IMPORT_TEXT_LENGTH under Next's 1MB default, one recomputing the worst-case fully-capped row size so this exact capacity-math claim can't silently go stale again.",
    status: "done",
    phase: "Phase 4 — Data ingestion",
    owner: "claude/upbeat-dijkstra-v2iugu",
  },
  {
    id: "checkout-page-rate-limit",
    summary:
      "Empty-backlog audit found the plain public /checkout entry page (src/app/checkout/page.tsx) was the one page in the preview-page-rate-limit / checkout-success-page-rate-limit family never swept — it calls loadCheckoutPrefillLead(params.slug) unconditionally on every request, which fires a real Convex/SQLite getLeadBySlug round trip for any slug that passes the length gate with no per-IP throttle at all, unlike its two siblings. A scripted loop over guessed/leaked slugs forces unbounded DB round trips plus a full SSR render with zero backoff — the same resource-exhaustion class AGENT_PROTOCOL documents (public, unauthenticated, data-driven GET, no existence short-circuit, an expensive per-request lookup). Shipped: planCheckoutPageAccess + CHECKOUT_PAGE_RATE_LIMIT (src/lib/checkout/checkout-page-access.ts), mirroring planCheckoutSuccessAccess exactly — checks checkRateLimit(`checkout-page:${clientIp}`) BEFORE loadCheckoutPrefillLead; a rate-limited hit falls back to the un-prefilled checkout ({ slug: undefined, lead: null }) rather than erroring, so a throttled caller never gets stranded mid-purchase, same fail-to-cheap-existing-path pattern as the two sibling fixes.",
    status: "done",
    phase: "Phase 3 — Payments",
    owner: "claude/upbeat-dijkstra-1xj7hh",
  },
  {
    id: "leads-convex-query-return-validator-system-field-leak",
    summary:
      "Tier 2 (Convex/SQLite parity) audit found convex/leads.ts's list/getBySlug and convex/checkoutSessions.ts's listOpen were the last two Convex queries in this app still declared `returns: v.any()`, handing back the raw ctx.db document (which always carries Convex's own _id/_creationTime system fields) straight through — unlike every sibling file (orders/commerceOrders/deployHandoffs/marketingPacks/clientVoicePacks/commerceCatalogs/inquiries), which all define an explicit xReturn validator + mapXRow function naming only their own domain fields. src/lib/db.ts's getLeads()/getLeadBySlug()/listOpenCheckoutSessions() then blindly cast that raw doc as Lead[]/Lead/CheckoutSessionRecord[], so on a Convex-backed deployment every in-memory Lead/CheckoutSessionRecord silently carried two extra properties its own TypeScript type has no field for — a real backend-shape divergence from the SQLite fallback (which builds a clean object literal). Concretely this undermined the immediately-preceding iteration's own security fix (public-lead-strip-notes-and-stripe-connect-id, PR #585): softCapLeadForPublicSurface's `const { notes, stripeConnectAccountId, ...publicLead } = lead` only names two fields to strip, so `_id` would have survived that spread on a Convex-backed instance. Shipped: leadReturn + mapLeadRow (convex/leads.ts), checkoutSessionReturn + mapCheckoutSessionRow (convex/checkoutSessions.ts), mirroring commerceOrders.ts's mapOrderRow pattern — deliberately using schema.ts's own loose v.string() typing for category/stage/recommendedTier/tier/status/kind rather than the stricter write-side literal unions, so a pre-existing row with an unexpected value can't make list/getBySlug/listOpen throw. New Vitest cases in convex/leads.test.ts and convex/checkoutSessions.test.ts assert no _id/_creationTime leak and no unexpected key ever appears.",
    status: "done",
    phase: "Phase 1 — Website foundation",
    owner: "claude/upbeat-dijkstra-nbqcq2",
  },
  {
    id: "suppressed-emails-operator-visibility",
    summary:
      "Empty-backlog audit (tier 1 — sold-capability wiring gap) found getSuppressedEmails() (src/lib/db.ts, dual-backend since suppression-convex-parity-fix) had zero callers anywhere in application code — no operator surface could see who had unsubscribed, only a reactive per-send note when a send happened to target an already-suppressed address. Shipped a read-only SuppressedEmailsPanel on /dashboard/leads listing every suppressed address (alphabetically sorted client-side to sidestep the two backends' differing, uncontracted row order). No unsuppress/remove control yet — deliberately left as a follow-up to keep this iteration focused, matching how this same feature's own history has scoped prior passes.",
    status: "done",
    phase: "Phase 2 — Outreach + platform voice",
    owner: "claude/nice-euler-9bn7gs",
  },
  {
    id: "lead-preview-meta-description-length-cap",
    summary:
      "Empty-backlog audit (SEO/growth-lever gap, same class as the just-shipped category-landing-meta-description-length-cap and homepage-meta-description-length-cap) found /preview/[slug]'s generateMetadata was the one meta-description surface those two prior fixes never touched — and the highest-value one, since it's a real paying customer's own live site (Starter sells 'Basic SEO'; see src/lib/seo.ts's file header). leadMetaDescription(lead) returned softCapLeadForPublicSurface(lead).description verbatim, which soft-caps at create-path max (MAX_DESCRIPTION_LENGTH=2000, an on-page-body-rendering bound) rather than Google's ~155-160 char SERP-truncation width — unlike homepageMetadata/docPageMetadata/categoryLandingPageMetadata, this page builds its Metadata object by hand rather than through staticPageMetadata, so it never picked up the shared capMetaDescription cap those three get for free. A real client with more than a one-sentence business description got an uncapped (up to 2000-char) <meta name=\"description\">/openGraph.description/twitter.description on their own indexable preview page, silently defeating the paid SEO deliverable — the existing seo.test.ts test even pinned the bug as spec ('toHaveLength(2000)'). Shipped: leadMetaDescription now applies the same capMetaDescription/MAX_META_DESCRIPTION_LENGTH=155 helper directly (single choke point in seo.ts, no new constant). Updated the stale test to assert the capped behavior instead of the 2000-char bug, plus a new realistic-long-description regression case. Deliberately left alone: leadMetaTitle (title-width SERP truncation is a distinct, narrower bound — ~60 chars vs description's ~155 — and titles were out of scope for both prior fixes in this same series too; a future iteration can pick that up as its own fix rather than folding an unrelated bound into this one).",
    status: "done",
    phase: "Phase 1 — Website foundation",
    owner: "claude/nice-euler-c2moyl",
  },
  {
    id: "lead-preview-meta-title-length-cap",
    summary:
      "Follow-up flagged by the immediately-preceding iteration (lead-preview-meta-description-length-cap): leadMetaTitle (src/lib/seo.ts) built `${businessName} — ${city}, ${state} | ${tagline}` with no SERP-title-width cap — businessName/tagline soft-cap at create-path max (200 chars each, MAX_BUSINESS_NAME_LENGTH/MAX_TAGLINE_LENGTH) for on-page rendering, not Google's much narrower ~60-char title-truncation width. Same gap class as the just-closed description series, one field over. Widened the fix to the shared choke point too: staticPageMetadata's title (homepage/docs/category-landing) had the identical unbounded-upstream problem via brand.name, confirmed concretely — a realistic long NEXT_PUBLIC_BRAND_NAME renders the homepage <title> past 60 chars with zero existing cap. Shipping both together (not staggering title-then-chokepoint across two more iterations) also surfaced a real, already-shipped-but-oversized static string: two of the three /websites-for-* category-landing seoTitles (restaurant 67 chars, trades 72 chars) were already over the new 60-char cap and would have started silently truncating mid-word the moment staticPageMetadata's title cap shipped — the same 'hand-shorten hardcoded copy' fix category-landing-meta-description-length-cap already applied to these same three pages' descriptions.",
    status: "done",
    phase: "Phase 1 — Website foundation",
    owner: "claude/upbeat-dijkstra-subad7",
  },
  {
    id: "business-decisions-archive-08-split",
    summary:
      "Process maintenance flagged by the immediately-preceding iteration (post-commerce-checkout-quantity-empty-backlog-clean-audit): business-decisions.ts had grown to 261,047 bytes, close enough to the 262,144-byte (256KiB) read-limit ceiling that a future append could hit it mid-iteration. Split the oldest 39 of the live tail's 50 entries into a new archive/business-decisions-archive-08.ts (following the same ~200KB-per-file convention as archive files 01-07), leaving the newest 11 entries live at 64,052 bytes. Verified lossless via an AST-level deep-equality check (tsx import + assert.deepStrictEqual of the old vs. new assembled BUSINESS_DECISIONS arrays, 654 entries, identical order) before finalizing, per the archive-scalability-split bullet's own verification requirement.",
    status: "done",
    phase: "Phase 1 — Website foundation",
    owner: "claude/upbeat-dijkstra-anx43p",
  },
  {
    id: "recovery-email-escalating-cadence",
    summary:
      "Growth-lever fix found by a research agent explicitly steered toward fresh conversion levers rather than another micro defect-fix, after a saturated same-day backlog of 30+ prior iterations. sendCheckoutAbandonedRecovery/sendCommerceAbandonedRecovery sent byte-identical copy on every repeat operator-triggered nudge for the same abandoned session, unlike the cold-outreach cadence (Email 1/2/3) which deliberately varies angle/urgency across touches — a real gap since abandoned-checkout shoppers already showed purchase intent (reached Stripe Checkout) and deserved stronger follow-through than a copy-paste re-send. Shipped a new recoverySentCount field on checkoutSessions (both Convex and SQLite backends, incremented atomically alongside recoverySentAt) and a 3-tier escalating copy split (reassurance → objection-handling → final soft close, capped at tier 3 for nudge 4+) in both recovery email templates, wired through the two dashboard recovery actions and surfaced as a '(#N)' indicator on both dashboard panels. See recovery-email-escalating-cadence in BUSINESS_DECISIONS for full detail.",
    status: "done",
    phase: "Phase 3 — Payments",
    owner: "claude/nice-euler-wueqtv",
  },
  {
    id: "marketing-scheduling-buffer-profile-mapping-missing-visibility",
    summary:
      "Empty-backlog audit (tier 1 — sold-capability wiring gap, flagged as a likely-parallel gap by buffer-token-header-not-query's own decision text but never picked up until now) found scheduleMarketingPackToBufferAction hard-fails for any eligible Growth/Complete lead with no saved Buffer profile mapping, but nothing anywhere (pipeline-health, digest, dashboard) surfaced which/how-many leads were stuck — same visibility-gap class as stripe-connect-onboarding-pipeline-health-visibility. Unlike that precedent, this metric's polarity meant it would show unactionable noise for every eligible lead while ALLOW_MARKETING_SCHEDULING is off (the default) — gated the new count behind a marketingSchedulingEnabled input on both pipeline-health.ts and daily-digest.ts so it stays 0/empty while the Buffer scaffold is dormant. Shipped new pure helpers in src/lib/marketing/buffer.ts (listLeadsMissingBufferProfileMapping, oldestBufferProfileMappingMissingAgeHours), wired into a new PipelineHealthPanel MetricCard and a matching daily-digest section — deliberately not added to the dashboard landing page (that series is closed per the dashboard-landing-clawback-cards note; this is a due-queue count, not a comparable dollar-loss signal). See marketing-scheduling-buffer-profile-mapping-missing-visibility in BUSINESS_DECISIONS for full detail.",
    status: "done",
    phase: "Phase 6 — Marketing automation",
    owner: "claude/nice-euler-sqwl6z",
  },
];
