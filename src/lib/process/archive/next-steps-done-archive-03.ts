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
  },];
