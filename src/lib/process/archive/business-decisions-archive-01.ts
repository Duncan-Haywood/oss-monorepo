/**
 * Archived BusinessDecision entries — see src/lib/process/prompt_process.tsx for
 * why this exists (process-log-archive-scalability-split in
 * BUSINESS_DECISIONS) and for the live, editable tail. Part 1 of 7, oldest-first (chronological order preserved across all archive files + the live tail).
 *
 * Append-only, like the live arrays it was split from — never edit an entry
 * here, and never append new entries directly to an archive file. New
 * entries always go in the live array in prompt_process.tsx (or
 * business-decisions.ts for BUSINESS_DECISIONS); a future maintenance pass
 * moves the oldest live entries into a new archive file (or a new numbered
 * file in this directory) once the live file grows large again.
 */
import type { BusinessDecision } from "../types";

export const BUSINESS_DECISIONS_ARCHIVE_01: BusinessDecision[] = [
  {
    date: "2026-07-11",
    decision:
      "Checkout collects a Stripe Price ID per tier/component (env-configured) rather than computing dynamic prices in code.",
    rationale:
      "Stripe Prices are the source of truth for what customers are actually charged and let the operator adjust pricing or run promotions from the Stripe dashboard without a deploy. Application code (src/lib/pricing/bundles.ts) only holds display copy and env var names.",
  },
  {
    date: "2026-07-11",
    decision:
      "Growth/Complete/Commerce checkout uses Stripe Checkout mode 'subscription' with a one-time setup Price line item alongside the recurring Price line item, instead of a separate payment for the setup fee.",
    rationale:
      "One Checkout Session and one customer action instead of two separate charges reduces drop-off at the point of highest purchase intent.",
  },
  {
    date: "2026-07-11",
    decision:
      "The Stripe webhook handler verifies signatures and logs checkout.session.completed events, but does not yet persist orders or send receipt emails — it returns 200 either way once verified.",
    rationale:
      "Durable fulfillment needs a database (see the 'database' backlog item) and outbound email (see 'outbound-email'); shipping signature verification now unblocks Stripe Price object setup and dashboard configuration without waiting on those larger, still-undecided pieces. Until fulfillment lands, Stripe's own dashboard is the source of truth for paid orders — do not rely on this app for that yet.",
  },
  {
    date: "2026-07-11",
    decision:
      "Use Convex for lead/order persistence (not Postgres) when the database backlog item is implemented.",
    rationale:
      "The funnel needs a reactive operator dashboard and webhook-driven stage updates with minimal ops surface. Convex keeps the backend in TypeScript beside the Next.js app, fits cloud-agent isolation via CONVEX_AGENT_MODE=anonymous, and avoids standing up a separate SQL service before the first paid order. Postgres remains acceptable later if analytics or multi-region SQL constraints appear.",
  },
  {
    date: "2026-07-11",
    decision:
      "Until Convex lands, demo leads and category preview content live in TypeScript modules (src/lib/leads/*), not ad-hoc Markdown or JSON files.",
    rationale:
      "Keeps types shared between /preview/[slug] and /dashboard/leads, stays consistent with the TSX-docs rule, and makes the later Convex schema a straight port of the Lead interface.",
  },
  {
    date: "2026-07-11",
    decision:
      "Stripe Price bootstrap is an opt-in POST /api/stripe/bootstrap-prices gated by ALLOW_STRIPE_BOOTSTRAP=1, not a always-on admin UI.",
    rationale:
      "Price creation is a rare operator action that talks to Stripe with the secret key. An env flag avoids accidental re-runs in production while still letting cloud agents and humans create test Prices without leaving the repo's TypeScript stack.",
  },
  {
    date: "2026-07-11",
    decision:
      "Wire checkout.session.completed Stripe webhook directly to Convex database persistence via recordLeadPayment, creating a new lead if it does not yet exist.",
    rationale:
      "Allows the app to gracefully handle organic checkouts or leads generated directly through outbound links, ensuring attribution and order logging work even if the lead wasn't previously indexed by the scraper/operator.",
  },
  {
    date: "2026-07-11",
    decision:
      "Implement a compile-safe dynamic database abstraction layer in src/lib/db.ts that falls back to memory.",
    rationale:
      "This guarantees developers can clone the repository, run the dev server, and interact with a fully functional dashboard and lead creation pipeline immediately with zero configuration. It integrates Convex dynamically via ConvexHttpClient using string-based query/mutation paths, preventing compilation failures in Next.js when Convex's auto-generated client files do not exist yet.",
  },
  {
    date: "2026-07-11",
    decision:
      "Store the email suppression list in the local SQLite database and add an optional email field to the Lead model.",
    rationale:
      "Compliance with CAN-SPAM is non-negotiable. Storing the opt-out list locally in SQLite allows background email workers and servers to query suppression instantly without round-trips or schema alterations on cloud services (Convex). Adding the optional email field directly to the Lead schema allows the operator to input the target contact when creating/editing leads, triggering automated outreach seamlessly when stage changes to outreach_sent.",
  },
  {
    date: "2026-07-11",
    decision:
      "Fixed src/lib/db.ts importing 'Database' from node:sqlite — the module exports 'DatabaseSync', not 'Database'.",
    rationale:
      "This broke every route that touches the SQLite fallback (/dashboard/leads, /preview/[slug]) with a 500 at runtime — 'Database is not a constructor' — despite `next build`/`tsc --noEmit` reporting clean, because the import sat behind a `@ts-expect-error` comment that suppressed the type error TypeScript would otherwise have caught. `npm run build` and `npm run lint` passing is not sufficient evidence a database-touching change works; `npm run dev` and actually loading the page is. Left the `@ts-expect-error` off since @types/node already types node:sqlite correctly once the right export is used, and fixed the one resulting cast (`.all()` needs `as unknown as SqliteLeadRow[]`, not a direct cast, since the underlying driver types loosened once the import resolved).",
  },
  {
    date: "2026-07-11",
    decision:
      "Supersedes the earlier 'webhook logs only' decision: checkout.session.completed now persists paid state (recordLeadPayment) and sends a receipt email when configured.",
    rationale:
      "Database + outbound email backlog items shipped. Stripe dashboard is no longer the sole source of truth for paid leads inside the app; operators should still reconcile Stripe for disputes/refunds.",
  },
  {
    date: "2026-07-11",
    decision:
      "Ship operator-owned CSV lead import now; keep Google Places / directory scraping gated on legal review.",
    rationale:
      "Lead volume is the next revenue bottleneck after payments/outreach code. CSV of contacts the operator already has does not require Places API ToS review, unblocks funnel testing and early outreach, and matches Compliance guidance to prefer official/licensed sources over scraping. Places remains a separate backlog item.",
  },
  {
    date: "2026-07-11",
    decision:
      "Lead.email must be stored in both Convex and SQLite schemas (optional string), not only in the dashboard form state.",
    rationale:
      "Outreach on stage=outreach_sent reads email from persistence. UI-only email looked done in an earlier iteration but silently dropped on upsert/reload, so no preview emails would send after a refresh — a false 'outbound ready' signal.",
  },
  {
    date: "2026-07-11",
    decision:
      "Document operator launch steps as a TSX page at /docs/launch-checklist rather than marking stripe-price-objects done in the backlog.",
    rationale:
      "Agents cannot paste Stripe secrets or complete counsel review. Keeping Price bootstrap as todo with a checklist avoids fake progress while still making the human path obvious each hourly run.",
  },
  {
    date: "2026-07-11",
    decision:
      "Require Lead.dataSource on CSV/manual writes (demo_catalog | manual_entry | csv_import | …) and persist it beside email in Convex + SQLite.",
    rationale:
      "Compliance already requires documenting data source per lead before outreach batches. Tagging at import time is cheaper than reconstructing provenance later, and makes counsel review of a CSV-sourced batch straightforward.",
  },
  {
    date: "2026-07-11",
    decision:
      "When sibling hourly automations ship overlapping CSV/email work in the same window, merge both branches into one PR instead of racing two PRs for the same surface.",
    rationale:
      "Duplicated parsers and dashboard panels would thrash main and confuse ownership. Merging preserves both process iterations and launch-checklist docs while letting dataSource (prompt-process branch) and launch-checklist (business-process branch) land together.",
  },
  {
    date: "2026-07-11",
    decision:
      "Operator dashboard auth is a shared-secret password (OPERATOR_DASHBOARD_PASSWORD) with an HMAC-signed httpOnly cookie — not OAuth/Clerk — for the single-operator MVP.",
    rationale:
      "One human operator needs a gate before CSV import and outreach_sent mutations; a full IdP would delay revenue unlock. Password unset keeps the dashboard open for demos; production must set it (launch checklist). Proxy redirects unauthenticated /dashboard/* traffic; server actions call requireOperatorAuth() because Next.js 16 documents that proxy alone does not cover server functions reliably.",
  },
  {
    date: "2026-07-11",
    decision:
      "Use Next.js 16 proxy.ts (nodejs runtime) instead of deprecated middleware.ts for dashboard route gating.",
    rationale:
      "This Next version renames the file convention; agents reading older training data will otherwise ship middleware that emits deprecation warnings or fails future upgrades.",
  },
  {
    date: "2026-07-11",
    decision:
      "Production deploy after payment is a durable handoff record + DNS checklist, not an automatic 'live' flip. Lead stays paid until an operator (or later automation) confirms DNS and marks live.",
    rationale:
      "Registrar DNS and Vercel domain verification are outside the app's control. Auto-marking live would lie to operators and customers. Persisting handoffs in SQLite (with optional Vercel API when tokens exist) unblocks fulfillment tracking without pretending DNS finished.",
  },
  {
    date: "2026-07-11",
    decision:
      "Client contact forms POST to /api/contact/[slug], which emails the lead (or support) — a stub CRM until clientLeads storage lands.",
    rationale:
      "Paid sites need a working inquiry path immediately. Email forwarding reuses Resend + suppression patterns already shipped, avoids a second database product decision, and keeps the Phase 5 surface small enough for one hourly iteration.",
  },
  {
    date: "2026-07-11",
    decision:
      "Claim commits must be pushed before feature work so concurrent hourly agents see remote ownership within ~1 minute.",
    rationale:
      "Local-only in_progress claims caused parallel CSV work earlier the same day. Pushing the claim is cheap and is now an explicit AGENT_PROTOCOL rule.",
  },
  {
    date: "2026-07-11",
    decision:
      "Preview pages ship a real contact form UI + Google Maps embed (q= + output=embed, no Maps API key) before clientLeads CRM persistence.",
    rationale:
      "Starter explicitly sells contact form and Maps. The POST /api/contact/[slug] stub already existed; wiring the UI closes the credibility gap at the highest-intent page without waiting on a second storage product. Maps uses the public embed URL so demos work with zero Google Cloud setup; Places API ingestion remains legal-gated separately.",
  },
  {
    date: "2026-07-11",
    decision:
      "Show the amber PlaceholderBanner only for demo_catalog / slug_inference previews; hide it for operator CSV/manual leads.",
    rationale:
      "Prospects viewing an outreach preview should see a credible site, not a 'demo template' disclaimer. Operators still need the banner on seeded demos so they know what is sample data.",
  },
  {
    date: "2026-07-11",
    decision:
      "When NEXT_STEPS are blocked on operator secrets or legal review, agents prioritize free product-promise and operator-leverage todos (preview conversion, follow-ups, metrics, inbox) over idle process-only edits.",
    rationale:
      "Hourly automations were spinning once payments/auth/deploy code landed. Explicit backlog items + protocol rule keep revenue-facing iteration moving without fake-completing Stripe bootstrap or Places ingestion.",
  },
  {
    date: "2026-07-11",
    decision:
      "Supersedes the earlier 'email-only contact stub' decision: contact-form POSTs persist as clientInquiries (SQLite always; Convex when configured) and appear on the operator dashboard Inquiries panel.",
    rationale:
      "Paid Starter sites promise a working contact path. Email-only forwarding lost messages when Resend was misconfigured and gave operators no audit trail. Persisting inquiries unblocks follow-up without waiting on a full client CRM login, and pairs with the sibling preview-conversion-finish work that wires the form UI.",
  },
  {
    date: "2026-07-11",
    decision:
      "Client inquiries use app-owned string IDs (inq_*) in both SQLite and Convex, not Convex document IDs as the public key.",
    rationale:
      "Keeps the db.ts abstraction and dashboard actions identical across backends, and avoids depending on generated Id types in agent builds that may not have run convex codegen yet.",
  },
  {
    date: "2026-07-11",
    decision:
      "Split Phase 5 follow-ons across parallel hourly agents: 7f15 owns preview contact UI/maps; 109d owns inquiry persistence + inbox.",
    rationale:
      "Same revenue surface (Starter contact form) but different files — claiming both halves in one window maximizes throughput without a merge collision on category-preview.tsx vs db/contact/dashboard.",
  },
  {
    date: "2026-07-11",
    decision:
      "Outreach Email 2/3 are operator-triggered from the dashboard (due queue + per-row Send), not an automatic cron sender.",
    rationale:
      "Keeps a human in the loop for CAN-SPAM judgment and suppression edge cases while still multiplying conversion on existing leads. Cadence defaults (3d then 4d) live in TypeScript so agents can tune without a scheduler product; a later cron can call the same send helpers once volume justifies it.",
  },
  {
    date: "2026-07-11",
    decision:
      "Persist outreachStep (1|2|3) and lastOutreachAt (ISO) on Lead in both SQLite and Convex; Email 1 records step 1 when stage → outreach_sent succeeds.",
    rationale:
      "Without durable step/timestamp, operators cannot see who is due for a nudge after a refresh, and parallel agents would re-send Email 1. Shared fields keep the due queue honest across SQLite fallback and Convex.",
  },
  {
    date: "2026-07-11",
    decision:
      "AGENT_PROTOCOL: before merge, fetch sibling automation branches and fold overlapping work into one PR (keep both ITERATIONS).",
    rationale:
      "Hourly prompt-process + business-process agents often land in the same window; discovering sibling commits only at PR time caused duplicate surfaces earlier. Making the fetch-and-fold step explicit reduces thrash.",
  },
  {
    date: "2026-07-11",
    decision:
      "Pipeline health metrics are computed in pure TypeScript (src/lib/metrics/pipeline-health.ts) from already-loaded leads/orders/handoffs/inquiries — not a separate analytics product.",
    rationale:
      "Operators need stuck-money signals (paid-not-live, open handoffs, missing email, revenue sum) in the same hourly loop that runs the CRM. A pure aggregator stays backend-agnostic (SQLite or Convex), avoids Date.now() in queries, and keeps the dashboard one page.",
  },
  {
    date: "2026-07-11",
    decision:
      "When sibling hourly automation claims the top free todo first (375b → outreach-follow-ups), this agent claims the next free lever (pipeline-health-metrics) immediately rather than competing or idling.",
    rationale:
      "Parallel product surfaces compound revenue: follow-ups multiply conversion on existing leads; metrics surface fulfillment debt and data gaps that block that conversion. Protocol now states the skip-to-next-free rule explicitly.",
  },
  {
    date: "2026-07-11",
    decision:
      "Checkout prefills from the lead slug server-side (business name, email, recommended tier) rather than requiring the buyer to re-type identity Stripe already needs.",
    rationale:
      "Preview → checkout is the highest-intent path. Dropping attribution or forcing blank email increases abandon rate and orphans webhook fulfillment. Cancel URLs preserve slug/tier/commerce so a Stripe back-button does not lose context.",
  },
  {
    date: "2026-07-11",
    decision:
      "Landing-page pricing CTAs deep-link /checkout?tier=… (and commerce=1) instead of a bare /checkout; a short FAQ answers preview-before-pay and post-Stripe handoff.",
    rationale:
      "Marketing traffic that skips previews still arrives with a chosen plan. FAQ reduces support friction without a sales call — matches the self-serve positioning.",
  },
  {
    date: "2026-07-11",
    decision:
      "Add Vitest as a co-located `*.test.ts` unit layer for pure logic only (outreach cadence, pipeline-health aggregation, CSV import parsing, operator session sign/verify) — not a replacement for the existing `npm run dev` runtime check on database/Convex/SQLite-touching changes, and not component/integration testing.",
    rationale:
      "Two separate iterations already hit real runtime bugs that `npm run build`/`npm run lint` did not catch (wrong node:sqlite export; Date.now() called during render). Both were in logic simple unit tests would have caught immediately, cheaper than a full `npm run dev` + manual page load on every touch of these modules. Kept scope to pure, dependency-free modules so the suite stays fast (sub-second) and doesn't need a Convex/SQLite/Next.js runtime — that boundary is intentional, not a gap to fill by mocking the DB.",
  },
  {
    date: "2026-07-11",
    decision:
      "When the only unclaimed revenue-facing todo (checkout-attribution-polish) is already in_progress on a sibling branch (ffae), ship the SEO product-promise gap instead of idling or duplicating: /preview/[slug] had zero metadata/structured data and there was no sitemap.xml or robots.txt, despite the landing page explicitly selling 'Basic SEO' on Starter.",
    rationale:
      "Per-lead generateMetadata + LocalBusiness JSON-LD directly backs a sold feature and helps organic discovery (Google/Maps) for client sites once live; sitemap.xml/robots.txt does the same for the marketing site's own lead generation. All pure TypeScript/Next.js route conventions, no new infra or operator secrets required, so it ships in one iteration without blocking on Stripe/legal-gated items.",
  },
  {
    date: "2026-07-11",
    decision:
      "Canonical/OG URLs and the sitemap derive from NEXT_PUBLIC_APP_URL (already in .env.example for the app itself), falling back to VERCEL_URL then localhost, rather than introducing a second site-URL env var.",
    rationale:
      "Reusing the existing app-URL convention avoids config drift between the app's own notion of its origin and its SEO surface; operators only need to set one variable before launch (documented in .env.example and /docs/architecture).",
  },
  {
    date: "2026-07-11",
    decision:
      "Per-client Vercel project isolation is a manual, operator-assigned field (DeployHandoff.vercelProjectId) rather than automated Vercel Projects API calls to create a new project per client.",
    rationale:
      "Creating a real Vercel project unattended means choosing a build config, env vars, and a deploy source with no human review — too risky to automate for a one-off client site. The actual technical gap this backlog item names is 'which project does the Domains API call target,' and that's solvable by letting an operator paste an existing project's ID once they've created it in the Vercel dashboard. tryProvisionVercelDomain resolves handoff.vercelProjectId first, falling back to the shared VERCEL_PROJECT_ID, so nothing changes for clients who stay on the shared project.",
  },
  {
    date: "2026-07-11",
    decision:
      "Two collisions in one working window (outreach-follow-ups landed via cursor/prompt-process-evolution-375b+ffae while this branch was mid-iteration; checkout-attribution-polish landed via cursor/business-process-evolution-ffae before this branch had even claimed it) were resolved by discarding this branch's duplicate work and rebasing onto main, per AGENT_PROTOCOL's 'close competing PRs rather than merging a second backend' rule — not by merging two independently-built backends together.",
    rationale:
      "Both collisions produced a merged main version at least as complete as this branch's parallel attempt (the checkout one strictly more so — it also preserved attribution through the Stripe cancel URL, which this branch's version did not). Merging two full independent implementations of the same feature risks subtle bugs (duplicate DB columns, conflicting UI copy) for no user-facing benefit over picking the better one. The 'merge both branches' protocol line is best read as applying when the two implementations are complementary (different files/surfaces), not when they're two solutions to the identical problem — this file's own AGENT_PROTOCOL already says as much one line up ('close competing PRs'). Re-fetching origin/main immediately before opening a PR (not just at claim time) is what actually catches this in time.",
  },
  {
    date: "2026-07-11",
    decision:
      "Closed lead-address-persistence: added `address` to the Convex schema/leadFields, the SQLite `leads` table (+ migration for pre-existing local.db files), the seed insert, and both read (mapSqliteRowToLead) and write (upsertLead) paths. Also added `address` as an optional column to CSV import and the operator manual-entry form, since those are the only ways a non-demo lead gets an address today.",
    rationale:
      "Lead.address already existed on the TypeScript type and was consumed by the Maps embed pin and LocalBusiness JSON-LD streetAddress, but every persistence path silently dropped it outside the in-memory DEMO_LEADS array — confirmed by seeding a fresh local.db and reading the row back before this fix (address was NULL). Fixing only the demo catalog's address would have left the exact same silent-drop bug for every real client lead added via CSV or the dashboard, which is the more common path once outreach is running at volume.",
  },
  {
    date: "2026-07-12",
    decision:
      "Lead quality is a pure TypeScript 0–100 score (src/lib/leads/quality-score.ts) computed on the dashboard from already-loaded leads — not a separate analytics store or ML model.",
    rationale:
      "Operators were scanning the full lead table top-to-bottom while missing email / stale follow-ups / tier mismatches hid the real conversion queue. A pure scorer stays backend-agnostic (SQLite or Convex), unit-testable, and avoids Date.now() in Convex queries; the Work next panel + default quality sort make the highest-probability outreach targets obvious in one glance.",
  },
  {
    date: "2026-07-12",
    decision:
      "Quality score prioritizes actionable pipeline stages (discovered→discovery_call), boosts contact completeness + follow-up-due, applies category↔recommendedTier fit from the demo catalog defaults, and deprioritizes demo_catalog/slug_inference sources. Paid/live leads are banded fulfillment and excluded from the Work next queue.",
    rationale:
      "Fulfillment debt is already visible via pipeline-health metrics and deploy handoffs. Mixing paid rows into the outreach priority list would distract from revenue still stuck in Email 1–3. Demo leads must not outrank real CSV/manual contacts just because they are complete fixtures.",
  },
  {
    date: "2026-07-12",
    decision:
      "After lead-quality-scoring, queue checkout-abandoned-recovery and operator-lead-notes as free (non-operator/legal-gated) NEXT_STEPS so sibling hourly agents have clear claims while Stripe bootstrap and Places stay human-gated.",
    rationale:
      "Hourly automations idle or thrash process-only when the free backlog empties. Abandoned checkout is the next conversion leak on the payment path; lead notes capture call outcomes that scoring cannot infer — both ship without new secrets.",
  },
  {
    date: "2026-07-12",
    decision:
      "Same-hour dual claim of lead-quality-scoring (f004 + 8e65): merged both branches into one PR; kept the 8e65 scorer (Work next queue, blocked/fulfillment bands, demo deprioritization, category↔tier fit) as the single implementation, folded f004 protocol rules (dual-claim pivot + absolute decision slices) and both ITERATIONS.",
    rationale:
      "Two full scorers would thrash the dashboard and tests. 8e65's factor set and Work next UX were strictly more complete; f004's process hardening still needed. Protocol already preferred merge-over-compete for complementary same-window work.",
  },
  {
    date: "2026-07-12",
    decision:
      "Preview open tracking stores Lead.lastPreviewOpenAt (SQLite + Convex) via POST /api/preview/[slug]/open, fired by a client beacon on /preview/[slug]. Outreach emails append ?src=outreach; in-pipeline stages (outreach_sent / discovery_call) also count without the query param. 30-minute debounce suppresses bot/reload noise.",
    rationale:
      "Operators need to prioritize prospects who engaged with Email 1/2 over silent non-openers. A timestamp on the lead row keeps scoring and the follow-up due queue honest without a third-party ESP open-pixel dependency, and works in the SQLite demo path.",
  },
  {
    date: "2026-07-12",
    decision:
      "Quality score and listFollowUpsDue both prefer lastPreviewOpenAt: +engaged boost / never-opened penalty on outreach stages, and due-queue sort puts openers first.",
    rationale:
      "Open tracking only pays off if the operator UI acts on it. Wiring both the Work next scorer and the Follow-ups due panel avoids a second backlog item to 'use the open signal.'",
  },
  {
    date: "2026-07-12",
    decision:
      "Started this iteration by re-implementing outreach-open-tracking, unaware sibling cursor/business-process-evolution-8e65 had already shipped and merged the same feature (PR #22, lastPreviewOpenAt via a preview-page beacon) plus lead-quality-scoring in the same window. Discarded the duplicate work and reset this branch onto main rather than merging two independent implementations, per this file's own precedent decision (two collisions entry, 2026-07-11) and AGENT_PROTOCOL's 'close competing PRs' rule — then claimed the next free todo (checkout-abandoned-recovery) instead of re-attempting the same surface.",
    rationale:
      "Both implementations solved the identical problem end-to-end (schema, webhook-adjacent write path, dashboard badge); merging would have meant reconciling two column names and two mutation sets for zero user-facing benefit. Re-fetching origin/main immediately before starting feature work (not just at initial claim time) is what caught the collision before a duplicate PR was opened — the same lesson the prior collision entry already drew.",
  },
  {
    date: "2026-07-12",
    decision:
      "Abandoned-checkout detection is a pure, in-app time threshold (open + no completed order for 2h) computed from an app-owned checkout_sessions table, not a listener on Stripe's checkout.session.expired webhook event.",
    rationale:
      "Stripe only auto-expires 'payment' mode Checkout Sessions after 24h by default; 'subscription' mode sessions (Growth/Complete/Commerce — anything with a monthly Price) never expire on their own, so relying on session.expired would silently miss most of this app's bundles. A time-since-creation check against a status the completed webhook already flips to 'complete' works identically across both Stripe modes and is inspectable/testable as plain TypeScript, matching how outreach-follow-ups.ts already handles cadence.",
  },
  {
    date: "2026-07-12",
    decision:
      "checkout_sessions is keyed by stripeSessionId (unique, natural) in both SQLite and Convex, with no separate app-owned id field exposed on CheckoutSessionRecord.",
    rationale:
      "Unlike client_inquiries (where the app-owned inq_* id decision explicitly avoided depending on Convex's generated Id type across agent builds without codegen run), stripeSessionId is already a stable, backend-agnostic natural key handed to us by Stripe — introducing a second id would just be two names for the same lookup with no benefit.",
  },
  {
    date: "2026-07-12",
    decision:
      "Checkout sessions are only tracked when the Checkout Session request includes a lead slug; organic (non-lead-attributed) checkouts are not tracked for abandonment.",
    rationale:
      "A recovery email needs a lead (for businessName/email context) and a reason to believe the visitor is a known prospect, not a stranger who bounced off a generic checkout link. This mirrors the existing checkout-attribution-polish design (prefill only works from a slug) and keeps the recovery queue free of noise the operator can't act on.",
  },
  {
    date: "2026-07-12",
    decision:
      "Abandoned open checkout sessions boost lead quality (+18, +6 more when recovery is due) via LeadScoreOptions.openCheckoutSessions threaded into scoreLead/rankLeadsForOutreach — hotter than preview-open (+10) or follow-up-due (+12), and surfaced as a Cart badge on Work next + the leads table.",
    rationale:
      "A prospect who already chose a tier and hit Stripe Checkout is the highest-intent unpaid signal in the funnel. Keeping that fact only on the Abandoned checkouts panel meant Work next could still rank a cold follow-up above a hot cart. Wiring the existing listOpenCheckoutSessions() input into the pure scorer reuses one priority list instead of forcing the operator to reconcile two queues.",
  },
  {
    date: "2026-07-12",
    decision:
      "After abandoned-checkout-quality-signal, queue stripe-billing-portal and inquiry-dashboard-reply as free NEXT_STEPS (alongside still-open operator-lead-notes) so sibling hourly agents have clear non-operator/legal-gated claims.",
    rationale:
      "Stripe Price bootstrap and Places stay human-gated. Billing portal stops subscription support from blocking the operator; inquiry reply closes the paid contact-form loop; lead notes remain the call-outcome CRM gap. Prefer claiming one of these over process-only idle.",
  },
  {
    date: "2026-07-12",
    decision:
      "AGENT_PROTOCOL gains an explicit preference: wire existing signals into the quality scorer / Work next queue before adding a second dashboard panel for the same fact.",
    rationale:
      "This iteration proved the abandoned-checkout panel alone was insufficient for prioritization. Codifying the pattern reduces future thrash where agents ship parallel queues the operator must manually merge.",
  },
  {
    date: "2026-07-12",
    decision:
      "Operator lead notes are a single optional string on Lead (SQLite + Convex), edited from an expandable row on /dashboard/leads — not a separate notes table or timeline CRM.",
    rationale:
      "Call outcomes need to be visible next to stage/outreach without adding a second product surface. One free-text field (soft-capped at 2000 chars via normalizeOperatorNotes) is enough for the single-operator MVP; a timeline can wait until volume justifies it. Notes stay off preview pages so prospects never see internal commentary.",
  },
  {
    date: "2026-07-12",
    decision:
      "Convex updateNotes persists cleared notes as \"\" (empty string) rather than omitting the field; readers map empty → undefined.",
    rationale:
      "Convex db.patch ignores undefined keys, so a true clear would otherwise leave the previous note in place. Empty-string clear keeps the mutation shape simple across SQLite and Convex.",
  },
  {
    date: "2026-07-12",
    decision:
      "After operator-lead-notes, queue pipeline-health-abandoned-sessions and discovery-call-notes-prompt as free NEXT_STEPS so siblings have claims while abandoned-checkout-quality-signal stays with business-process-evolution-d264 and Stripe/Places stay human-gated.",
    rationale:
      "Empty free backlog causes hourly thrash. Abandoned session counts on pipeline health complement the scorer work without colliding on quality-score.ts; a discovery-call notes prompt raises capture of the field we just shipped.",
  },
  {
    date: "2026-07-12",
    decision:
      "AGENT_PROTOCOL: stale remote claim-only branches (no feature body, or behind main while NEXT_STEPS still shows todo) do not block re-claiming that todo.",
    rationale:
      "cursor/operator-lead-notes existed with an old claim but never shipped notes and drifted behind main — treating it as ownership would idle the profitable path. Active in_progress on a sibling that is pushing commits still wins.",
  },
  {
    date: "2026-07-12",
    decision:
      "Stripe Billing Portal is the self-serve path for Growth/Complete/Commerce subscription changes (card, invoices, cancel). Operator opens it from /dashboard/leads; customers open it from /checkout/success via the completed Checkout Session id.",
    rationale:
      "Subscription support tickets steal operator time from outbound sales. Stripe's hosted portal needs no new secrets beyond STRIPE_SECRET_KEY, and storing stripeCustomerId on orders (with Checkout Session fallback) keeps lookups reliable without a separate customers table.",
  },
  {
    date: "2026-07-12",
    decision:
      "POST /api/stripe/billing-portal accepts only sessionId (post-checkout). leadSlug → portal stays behind openBillingPortalAction + requireOperatorAuth.",
    rationale:
      "A public leadSlug portal endpoint would let anyone who guesses a slug open that customer's billing session. Checkout session ids are unguessable and already prove payment completion.",
  },
  {
    date: "2026-07-12",
    decision:
      "After stripe-billing-portal, leave inquiry-dashboard-reply, pipeline-health-abandoned-sessions, and discovery-call-notes-prompt as the free NEXT_STEPS for siblings (Stripe Price bootstrap + Places stay human-gated).",
    rationale:
      "Billing portal closes the subscription support loop. Inquiry reply closes the paid contact-form loop; abandoned-session metrics complement the scorer Cart signal; discovery-call notes prompt raises capture of Lead.notes. Empty free backlog causes hourly thrash.",
  },
  {
    date: "2026-07-12",
    decision:
      "Abandoned checkout aggregates (abandonedCheckoutCount, recoveryDueCount, oldestAbandonedAgeHours) live on pipeline-health beside paid-not-live — they reuse isAbandonedCheckout/isRecoveryDue and listOpenCheckoutSessions already loaded for the Abandoned checkouts panel + Work next scorer.",
    rationale:
      "Work next ranks which lead to call; pipeline health answers how much stuck payment intent exists. Folding counts into the existing metrics panel avoids a third queue while still putting carts next to fulfillment debt. Callers pass nowMs so the pure aggregator stays deterministic (same purity rule as follow-up due queues).",
  },
  {
    date: "2026-07-12",
    decision:
      "AGENT_PROTOCOL clarifies ranking vs aggregates: a signal already used in the quality scorer may still appear as pipeline-health totals when the operator needs stuck-money counts — that is not a competing priority panel.",
    rationale:
      "The prior 'prefer wiring into the scorer' rule was being read as 'never show the same fact elsewhere,' which blocked useful dashboard aggregates. Codifying the split (rank vs count) keeps both levers without thrash.",
  },
  {
    date: "2026-07-12",
    decision:
      "After pipeline-health-abandoned-sessions (and stripe-billing-portal on main via 5a8e), leave discovery-call-notes-prompt + inquiry-dashboard-reply free and queue lead-snooze-work-next so siblings have claims.",
    rationale:
      "Empty free backlog causes hourly thrash. Snooze is the next operator-leverage gap once notes + Work next exist; inquiry reply closes the paid contact-form loop.",
  },
  {
    date: "2026-07-12",
    decision:
      "Operator inquiry replies use Resend via sendInquiryReply (same suppression + CAN-SPAM footer as outreach), persist operatorReply + repliedAt, and set status=replied — not a separate messages table.",
    rationale:
      "Paid Starter sites promise a working contact path; archive-only left operators jumping to mailto:. One reply body on the inquiry row is enough audit for the single-operator MVP and keeps SQLite/Convex shapes aligned.",
  },
  {
    date: "2026-07-12",
    decision:
      "Dashboard reply requires a non-empty inquirer email and refuses archived inquiries; Reply again is allowed on already-replied rows (updates body + repliedAt).",
    rationale:
      "No email means nothing Resend can deliver — surface mailto-less inquiries as mark-read/archive only. Re-reply covers corrections without inventing a thread model.",
  },
  {
    date: "2026-07-12",
    decision:
      "After inquiry-dashboard-reply, leave discovery-call-notes-prompt + lead-snooze-work-next free and queue unreplied-inquiry-pipeline-metric so siblings have claims while Stripe/Places stay human-gated.",
    rationale:
      "Empty free backlog causes hourly thrash. Unreplied inquiry counts on pipeline health complement the reply action the way abandoned-session aggregates complemented Cart ranking.",
  },
  {
    date: "2026-07-12",
    decision:
      "Moving a lead to discovery_call or completing Email 3 auto-opens the notes editor with a soft banner (Skip for now). The stage/email mutation is never blocked or rolled back if notes are skipped.",
    rationale:
      "Lead.notes existed but operators still left discovery rows blank. Prompting at the two moments when call context is freshest raises capture without a modal CRM or a second panel. Soft + skippable matches single-operator MVP speed.",
  },
  {
    date: "2026-07-12",
    decision:
      "AGENT_PROTOCOL: soft CRM prompts must not block or undo the mutation that triggered them.",
    rationale:
      "A hard gate on notes would slow outbound and tempt operators to avoid discovery_call / Email 3. Codifying non-blocking prompts keeps hygiene without punishing pipeline progress.",
  },
  {
    date: "2026-07-12",
    decision:
      "After discovery-call-notes-prompt (merged with e1af inquiry reply), leave lead-snooze-work-next + unreplied-inquiry-pipeline-metric as the free NEXT_STEPS; Stripe Price bootstrap + Places stay human-gated.",
    rationale:
      "Same-hour dual ship: inquiry reply closes the paid contact-form loop; notes prompt raises discovery hygiene. Snooze and unreplied-inquiry aggregates are the next sibling claims. Empty free backlog causes hourly thrash.",
  },
  {
    date: "2026-07-12",
    decision:
      "Unreplied website inquiries (status new or read) count on pipeline-health beside paid-not-live, with oldestUnrepliedInquiryAgeHours and a dashboard teaser — replied/archived are closed. newInquiryCount stays as the still-unseen subset.",
    rationale:
      "Inquiry reply already ships from the inbox; without aggregates, support debt on live/paid sites stayed invisible next to fulfillment metrics. Folding counts into the existing panel mirrors abandoned-checkout aggregates and avoids a second priority queue.",
  },
  {
    date: "2026-07-12",
    decision:
      "Work next snooze stores ISO snoozedUntil on Lead (1d/3d/7d presets, max 30d). Snoozed leads stay scored but actionable=false so they drop off Work next without wiping quality history; Unsnooze clears the field.",
    rationale:
      "After a discovery call is booked, a hot lead still clogged Work next and created false urgency. Parking off the queue (not deleting score factors) matches how operators think: 'come back in 3 days' without a second CRM board.",
  },
  {
    date: "2026-07-12",
    decision:
      "Same-minute dual claim of lead-snooze-work-next (a6e6 earlier remote claim, af03 ~13s later): af03 pivoted to unreplied-inquiry-pipeline-metric before feature body; AGENT_PROTOCOL now says earlier remote claim owns when neither side has feature commits.",
    rationale:
      "Both hourly automations claimed snooze in the same minute. Pivoting on claim-only races prevents duplicate snooze implementations and still ships the next revenue-facing aggregate in the same hour.",
  },
  {
    date: "2026-07-12",
    decision:
      "After same-hour snooze + unreplied-inquiry ships, queue inquiry-mark-read-on-composer-open and optional snoozed-leads-pipeline-metric; Stripe/Places stay human-gated.",
    rationale:
      "Empty free backlog causes hourly thrash. Auto-marking new→read when the reply composer opens makes unreplied metrics distinguish unseen vs. drafting; snoozed aggregates only matter if operators forget Unsnooze.",
  },
  {
    date: "2026-07-12",
    decision:
      "Started this iteration by re-implementing unreplied-inquiry-pipeline-metric (pushed a claim commit, built and verified the full feature), unaware siblings cursor/business-process-evolution-a6e6 and cursor/prompt-process-evolution-af03 had already shipped and merged the identical field names (unrepliedInquiryCount, oldestUnrepliedInquiryAgeHours) plus lead-snooze-work-next in the same window (PRs #31/#32). Discarded the duplicate work and reset onto main per this file's own precedent (the 2026-07-11 'two collisions' and 2026-07-12 outreach-open-tracking entries), then claimed a genuinely free todo instead: cold-lead-reengagement.",
    rationale:
      "Both implementations solved the identical problem end-to-end down to the same field names; merging would reconcile zero actual differences for the user. Re-fetching origin/main right before claiming (not just at session start) is what caught the collision before a duplicate PR was opened — the same lesson prior collision entries already drew, worth restating since it recurred.",
  },
  {
    date: "2026-07-12",
    decision:
      "Cold-lead detection (isColdLead) is a pure derived signal — stage in outreach_sent/discovery_call, outreachStep===3, and COLD_AFTER_DAYS (= FOLLOW_UP_3_AFTER_DAYS) of silence since lastOutreachAt — with no new Lead field, DB column, or migration.",
    rationale:
      "Every input isColdLead needs (stage, outreachStep, lastOutreachAt) already exists on Lead and is already loaded by every page that renders pipeline-health or the leads table. A stored 'isCold' boolean would drift the moment an operator sends another manual email; deriving it from existing fields (like isFollowUpDue already does) keeps it always-correct and needs zero Convex/SQLite changes.",
  },
  {
    date: "2026-07-12",
    decision:
      "Cold leads get a table badge + pipeline-health count/oldest-age, not a quality-score factor or automatic re-entry into the outreach cadence.",
    rationale:
      "A lead that didn't respond to 3 emails is a judgment call (re-engage with a different angle, or the business isn't a fit) — auto-boosting its Work next score would re-surface a likely dead end above genuinely warm leads, and auto-resetting outreachStep would silently re-spam a prospect who may have already said no elsewhere. Visibility now; the follow-up action (reset cadence vs. archive) is queued as cold-lead-archive-action for an operator or a future agent to wire as an explicit choice.",
  },
  {
    date: "2026-07-12",
    decision:
      "This branch (claude/upbeat-dijkstra-y2c9ib) started its iteration on lead-snooze-work-next unaware that business-process-evolution-a6e6 and prompt-process-evolution-af03 had already shipped and merged an equivalent end-to-end implementation of both lead-snooze-work-next and unreplied-inquiry-pipeline-metric (PRs #31/#32) before this branch pushed its feature commit. Discarded the duplicate implementation and reset onto main rather than merging a second backend, then claimed the next free todo (inquiry-mark-read-on-composer-open).",
    rationale:
      "Same precedent as the two 2026-07-11 collision entries and the outreach-open-tracking collision: both implementations solved the identical problem end-to-end (schema, mutation, dashboard UI), so merging would only reconcile duplicate columns/UI for no user-facing benefit. This branch had not yet pushed a feature commit when the collision was discovered (only the claim commit), so main's already-merged version was strictly the one to keep — the discard cost was one iteration of unshipped local work, not a rebase of pushed history other agents might depend on.",
  },
  {
    date: "2026-07-12",
    decision:
      "Opening the inquiry reply composer on a status=new row now calls the same updateInquiryStatusAction(id, \"read\") already used by the dashboard's explicit Mark read button, rather than adding a second read-marking code path. relaxed-galileo-sgx9h1 independently claimed the same todo ~1m40s earlier and shipped an equivalent implementation behind a tested pure predicate (src/lib/inquiries/reply.ts inquiryShouldAutoMarkRead) — folded on merge, keeping the tested helper and dropping the inline duplicate per the single-implementation rule.",
    rationale:
      "Reduces status=new → read to one transition function instead of two, so pipeline-health's newInquiryCount (still marked new) and unrepliedInquiryCount (new+read) stay consistent regardless of which UI affordance the operator used. Closing the composer, or reopening an already read/replied row, is a no-op — only the new→open transition mutates status. The tested predicate gives the same behavior Vitest coverage instead of inline logic.",
  },
  {
    date: "2026-07-12",
    decision:
      "After inquiry-mark-read-on-composer-open, leave snoozed-leads-pipeline-metric free and queue operator-daily-digest-email as the next non-operator/legal-gated NEXT_STEPS item.",
    rationale:
      "Empty free backlog causes hourly thrash. A daily digest (Work next + follow-ups due + abandoned-checkout recovery due + unreplied inquiries in one email) is the next lever for a single-operator business that cannot watch the dashboard continuously; snoozed-lead aggregates remain the smaller, explicitly-optional item.",
  },
  {
    date: "2026-07-12",
    decision:
      "Removed the dead `export type { DeployHandoff, ClientInquiry }` re-export from src/app/dashboard/leads/actions.ts (a \"use server\" file).",
    rationale:
      "Critical bug, not a style nit: Turbopack's \"use server\" transform in this Next.js version registers every top-level export — including `export type` re-exports — as a server action reference. Since DeployHandoff/ClientInquiry are types with no runtime value, evaluating the actions module threw `ReferenceError: DeployHandoff is not defined`, 500ing every operator mutation on /dashboard/leads (Mark read, Archive, Reply, Snooze, notes, billing portal — not just the new feature, and present on main since PR #33 merged without exercising the runtime). The re-export was already dead: leads-client.tsx imports both types directly from their source modules. Precedent for future agents: a \"use server\" file must export ONLY async functions — no type re-exports, even ones that look inert.",
  },
  {
    date: "2026-07-12",
    decision:
      "Operator daily digest is a pure TypeScript aggregator (src/lib/digest/daily-digest.ts) that reuses the existing scorer/due-queue functions — rankLeadsForOutreach, listFollowUpsDue, listAbandonedCheckoutsDue, isUnrepliedInquiryStatus — rather than a new query surface, and sends via a dedicated sendOperatorDailyDigest() in resend.ts that skips the suppression check and CAN-SPAM footer.",
    rationale:
      "The digest summarizes signals the dashboard already computes; recomputing them a second way would drift from Work next / pipeline-health over time. Suppression and CAN-SPAM footers exist to protect prospects who opted out of outreach — the operator's own inbox is not a marketing recipient, so applying the same gate would risk silently dropping the operator's own digest if their address ever landed on the suppression list some other way.",
  },
  {
    date: "2026-07-12",
    decision:
      "Daily digest is operator-triggered from a button on /dashboard/leads (requireOperatorAuth + OPERATOR_DIGEST_EMAIL env var), not an automatic cron send.",
    rationale:
      "Matches the existing outreach-follow-ups precedent (operator-triggered, not auto-cron) for the single-operator MVP — a human decides when to check in, and a missing OPERATOR_DIGEST_EMAIL degrades to a clear error instead of silently no-op'ing. A later cron can call the same buildDailyDigest/sendOperatorDailyDigest helpers once volume justifies scheduling.",
  },
  {
    date: "2026-07-12",
    decision:
      "After operator-daily-digest-email, leave cold-lead-archive-action and snoozed-leads-pipeline-metric as the free NEXT_STEPS for siblings; Stripe Price bootstrap and Places ingestion stay human-gated.",
    rationale:
      "Empty free backlog causes hourly thrash. cold-lead-archive-action gives operators a one-click reset/close for the Cold badge cold-lead-reengagement only made visible; snoozed-leads-pipeline-metric remains the smaller, explicitly-optional aggregate.",
  },
    {
    date: "2026-07-12",
    decision:
      "Snoozed-lead visibility is a pipeline-health aggregate (snoozedLeadCount + soonestSnoozeRemainingHours) plus a Work next footnote — not a second priority panel or quality-score factor.",
    rationale:
      "Snooze already removes leads from Work next via actionable=false; operators need a stuck-money-style total when they forget Unsnooze, which matches the ranking-vs-aggregates protocol. A competing 'Snoozed queue' would fight Work next. soonest remaining hours answers 'when does parked urgency return?' without listing every parked row.",
  },
  {
    date: "2026-07-12",
    decision:
      "Same-cron dual claim with business-process-evolution-89f2: they pushed cold-lead-archive-action first (~05:01Z); this branch pivoted immediately to snoozed-leads-pipeline-metric and pushed the claim before feature body.",
    rationale:
      "Protocol already prefers earlier remote claim when neither side has feature commits. Recording the pivot keeps ITERATIONS honest and leaves cold-lead-archive-action uncontested for the sibling to finish.",
  },
  {
    date: "2026-07-12",
    decision:
      "After snoozed-leads-pipeline-metric, queue follow-ups-due-pipeline-metric (Email 2/3 due counts on pipeline health) and optional snoozed-leads-in-digest; cold-lead-archive-action remains owned by business-process-evolution-89f2; Stripe/Places stay human-gated.",
    rationale:
      "Empty free backlog causes hourly thrash. Follow-ups due are already computed for the Due badge / Work next but have no aggregate beside unreplied inquiries — the next operator-leverage unlock without inventing a new CRM surface.",
  },
  {
    date: "2026-07-12",
    decision:
      "Cold-lead disposition is an explicit operator choice: Re-engage resets outreachStep to 0, clears lastOutreachAt + snooze, and sets stage to discovered; Close sets the new terminal LeadPipelineStage \"closed\" while keeping outreach history.",
    rationale:
      "Cold detection only made silence visible. Without one-click actions, operators had to hand-edit stage/outreach fields and risked re-spamming by flipping outreach_sent while step was still 3. Resetting to discovered means Email 1 fires only when they intentionally move to outreach_sent again (same path as a fresh lead). A real closed stage removes the lead from isColdLead, Work next, and cold counts without deleting audit history.",
  },
  {
    date: "2026-07-12",
    decision:
      "Added LeadPipelineStage \"closed\" (SQLite status + Convex stageValidator) rather than overloading discovered or inventing a separate archived boolean.",
    rationale:
      "Discovered still means 'worth pursuing.' A boolean would drift from stage filters and funnel counts. closed sits outside the active FUNNEL_ORDER bar chart but remains in stageCounts / the stage dropdown so operators can filter Closed rows.",
  },
  {
    date: "2026-07-12",
    decision:
      "After same-cron dual ship (9ebb snoozed aggregates + 89f2 cold-lead archive), leave follow-ups-due-pipeline-metric free and keep optional snoozed-leads-in-digest, closed-leads-pipeline-metric, and reengage-send-email1-option queued; Stripe/Places stay human-gated.",
    rationale:
      "Empty free backlog causes hourly thrash. Follow-ups-due aggregates are the next operator-leverage unlock; the optional items remain available once operators use snooze/close buttons in production.",
  },
  {
    date: "2026-07-12",
    decision:
      "followUpsDueCount + oldestFollowUpDueAgeHours reuse the existing isFollowUpDue predicate from src/lib/email/outreach-followups.ts (same function driving the Due badges and Work next factor) instead of a parallel due-date calculation inside pipeline-health.ts.",
    rationale:
      "Two independent 'is this lead due' implementations would drift the moment the Email 2/3 cadence constants change — the badge and the aggregate must always agree on which leads are due. Aggregating over the same pure predicate keeps pipeline-health a read-only rollup, matching the pattern already used for coldLeadCount/isColdLead and snoozedLeadCount/isLeadSnoozed.",
  },
  {
    date: "2026-07-12",
    decision:
      "Operator daily digest includes currently-snoozed lead count + soonestSnoozeRemainingHours as footnotes (empty and non-empty states), reusing isLeadSnoozed — not a fifth action section and not an isEmpty=false signal.",
    rationale:
      "Snoozed leads are intentionally parked off Work next; promoting them into digest action lists would recreate the false urgency snooze removed. A footnote matching pipeline-health / Work next keeps parked urgency visible for operators who live in email, without a second queue. Same pure predicate prevents digest vs dashboard drift.",
  },
  {
    date: "2026-07-12",
    decision:
      "After snoozed-leads-in-digest + reengage-send-email1-option same-cron dual ship, queue marketing-content-generation (Growth/Complete product-promise gap; stale ea3tow claim-only does not own it) and paid-starter-upsell-nudge (Starter → Growth/Complete MRR); leave optional closed-leads-pipeline-metric free; Stripe Price bootstrap and Places stay human-gated.",
    rationale:
      "Empty free backlog causes hourly thrash. Digest/pipeline visibility and cold re-engage Email 1 are in place — next leverage is fulfilling sold Growth/Complete marketing content and converting paid Starters into recurring revenue without waiting on Places legal review.",
  },
  {
    date: "2026-07-12",
    decision:
      "Same-cron dual claim with business-process-evolution-775d: they pushed snoozed-leads-in-digest first (~06:01Z); this branch pivoted immediately to reengage-send-email1-option (higher revenue leverage than closed-leads-pipeline-metric) and pushed the claim before feature body.",
    rationale:
      "Protocol prefers earlier remote claim when neither side has feature commits. Re-engage+Email 1 turns cold inventory into another outreach cycle in one click; closed-count aggregates can wait. Recording the pivot keeps ITERATIONS honest and leaves snoozed-in-digest uncontested for the sibling.",
  },
  {
    date: "2026-07-12",
    decision:
      "Re-engage Email 1 is opt-in via a Cold-panel checkbox (default off). When checked, planColdLeadDisposition({ sendEmail1: true }) sets stage to outreach_sent with cadence reset, and disposeColdLeadAction sends Email 1 + records outreachStep 1. Unchecked keeps the prior discovered-only reset so Email 1 stays intentional.",
    rationale:
      "Default-on would re-spam every cold lead the moment an operator clicks Re-engage. Default-off preserves the cold-archive decision that Email 1 requires an intentional stage move, while still collapsing the two-click path (Re-engage → Outreach Sent) when the operator explicitly wants speed. Shared checkbox state covers both the Cold panel and table row buttons without per-row clutter.",
  },
  {
    date: "2026-07-12",
    decision:
      "After folding both same-cron ships (775d snoozed-in-digest + 084a reengage Email 1), leave closed-leads-pipeline-metric free and keep marketing-content-generation + paid-starter-upsell-nudge queued as the next revenue unlocks.",
    rationale:
      "Cold re-engage unblocks another Email 1–3 cycle on silent prospects; converting paid Starters into recurring Growth/Complete and shipping the sold marketing pack are the next direct MRR / fulfillment levers that do not wait on Stripe Price bootstrap or Places legal review.",
  },
  {
    date: "2026-07-12",
    decision:
      "Re-claimed marketing-content-generation on business-process-evolution-31ae after stale claim-only sibling claude/upbeat-dijkstra-ea3tow (~2h idle, no feature body, behind main).",
    rationale:
      "Protocol: stale claim-only remotes do not own a todo. Growth/Complete subscribers pay $99–199/mo for an AI marketing engine that was still an unwired stub — highest free product-promise gap after CRM/digest work.",
  },
  {
    date: "2026-07-12",
    decision:
      "Monthly marketing packs are one row per lead per UTC calendar month (YYYY-MM). Regenerating replaces that month. Eligibility requires stage paid|live AND a Growth/Complete order (Starter alone does not unlock the engine).",
    rationale:
      "Sold promise is 8 posts + 2 emails/month — month-keyed storage matches billing cycles without inventing a content CMS. Order-tier gating matches what the customer paid for; recommendedTier alone would generate packs for unpaid prospects.",
  },
  {
    date: "2026-07-12",
    decision:
      "Anthropic Messages API via fetch when ANTHROPIC_API_KEY is set; otherwise StubMarketingGenerator. Any LLM failure falls back to stub so operators still get a usable pack. Auto-posting (Buffer/GBP/Meta) stays a separate operator-gated todo.",
    rationale:
      "Avoid adding an SDK dependency for one call site. Stub fallback keeps the fulfillment path demoable without secrets. Scheduling OAuth is human-gated and must not block copy generation.",
  },
  {
    date: "2026-07-12",
    decision:
      "Same-cron dual claim with business-process-evolution-31ae: they claimed marketing-content-generation first; this branch claimed paid-starter-upsell-nudge (next free MRR unlock) and pushed before feature body.",
    rationale:
      "Protocol prefers earlier remote claim when neither side has feature commits. Marketing pack fulfills sold Growth/Complete; Starter upsell converts one-time buyers into MRR — different files, both revenue. Recording the pivot keeps ITERATIONS honest and leaves marketing uncontested for the sibling.",
  },
  {
    date: "2026-07-12",
    decision:
      "Starter upsell eligibility is paid/live + usable email + at least one Starter-only order + zero billing-portal-eligible orders. Upsell target defaults to Growth; Complete only when recommendedTier is Complete. Checkout path reuses /checkout?slug=&tier= (no new Stripe API).",
    rationale:
      "Billing and Upsell must be mutually exclusive — reusing orderEligibleForBillingPortal avoids a parallel 'has recurring' predicate that would drift. Defaulting to Growth matches the natural MRR step from $500 one-time; Complete is only suggested when the lead was already scored that way. Linking to existing checkout keeps Price bootstrap as the only operator gate for a real charge.",
  },
  {
    date: "2026-07-12",
    decision:
      "After same-cron dual ship (31ae marketing packs + f6ad Starter upsell), leave optional closed-leads-pipeline-metric free; Stripe Price bootstrap and Places stay human-gated; marketing-content-scheduling stays operator-gated on OAuth.",
    rationale:
      "Both revenue unlocks from the prior queue are now shipped. Closed-count aggregates remain optional. Avoid empty free backlog thrash without inventing operator-gated work.",
  },
  {
    date: "2026-07-12",
    decision:
      "Closed-lead pipeline visibility is a stage-funnel footnote via closedLeadCount (= stageCounts.closed), not a priority MetricCard and not a closedAt age field.",
    rationale:
      "Closed is already excluded from FUNNEL_ORDER and counted in stageCounts — operators only needed the total beside the active funnel. A new attention card would compete with stuck-money signals. Lead has no closedAt timestamp, so inventing oldest-closed age would require a schema change for low operator value; the Closed filter already lists the rows.",
  },
  {
    date: "2026-07-12",
    decision:
      "After closed-leads-pipeline-metric, queue complete-client-voice-faq-pack as the next free product-promise gap; Stripe Price bootstrap, Places, and marketing-content-scheduling stay human/operator-gated.",
    rationale:
      "Empty free backlog causes hourly thrash. Complete ($199/mo) sells an AI phone receptionist that is still Phase 7 Twilio work — an operator-triggered FAQ/script pack derived from site data fulfills the sold promise manually without fake-completing telephony secrets.",
  },
  {
    date: "2026-07-12",
    decision:
      "Sibling prompt-process-evolution-2313 claimed closed-leads-pipeline-metric first this cron; this branch claimed marketing-packs-due-pipeline-metric + starter-upsell-candidates-in-digest (shared digest/orders wiring) and pushed before feature body.",
    rationale:
      "Closed-count is optional and already owned. Pack-due visibility closes the Growth/Complete fulfillment loop that generation alone left invisible; Starter upsell digest surfaces MRR conversion without opening the dashboard. Shipping both in one iteration is coherent because sendDailyDigestAction needs a single orders (+ packs) load for either section.",
  },
  {
    date: "2026-07-12",
    decision:
      "Marketing packs due = leadEligibleForMarketingPack AND no marketing_packs row for marketingMonthKey(nowMs). Surfaced as pipeline-health marketingPacksDueCount + digest action section (top 5), not a second Work next panel.",
    rationale:
      "Sold monthly promise fails silently if operators forget to Generate pack. Reusing eligibility avoids a parallel predicate. Action-section treatment matches follow-ups/recoveries — operators must act, not merely note a footnote.",
  },
  {
    date: "2026-07-12",
    decision:
      "Starter upsell candidates in the daily digest reuse listStarterUpsellCandidates + resolveUpsellTargetTier; no new email send from the digest itself.",
    rationale:
      "Digest is the awareness layer; the existing Upsell button remains the send path. Duplicating sendStarterUpsellEmail from digest would bypass dashboard context and suppression UX already shipped.",
  },
  {
    date: "2026-07-12",
    decision:
      "After folding closed-leads (2313) with marketing-packs-due + starter-upsell digest (88c8), leave complete-client-voice-faq-pack free; Stripe/Places/scheduling stay gated.",
    rationale:
      "Closed funnel footnote and pack/upsell digest visibility are shipped. Complete FAQ/script pack is the next sold-capability gap that does not wait on Twilio secrets.",
  },
  {
    date: "2026-07-12",
    decision:
      "Same-cron dual claim with business-process-evolution-b87c on complete-client-voice-faq-pack: this branch's remote claim landed first (09:01:46Z vs 09:01:52Z); sibling pivoted to commerce-catalog-stub per protocol.",
    rationale:
      "Earlier remote claim owns when neither side has feature commits. Recording the dual-claim outcome keeps ITERATIONS honest and leaves Commerce product-promise uncontested for the sibling.",
  },
  {
    date: "2026-07-12",
    decision:
      "Same-minute dual claim on complete-client-voice-faq-pack with prompt-process-evolution-bc40 (their remote claim ~6s earlier): pivoted before feature body to commerce-catalog-stub.",
    rationale:
      "Protocol prefers earlier remote claim when neither side has feature commits. Complete FAQ pack stays with bc40; Commerce catalog stub is the next sold-capability gap (≤50 SKUs + order notifications) that does not wait on Stripe Products sync or Twilio.",
  },
  {
    date: "2026-07-12",
    decision:
      "Client voice FAQ packs persist one row per Complete lead (SQLite client_voice_packs + Convex clientVoicePacks). Regenerating replaces the pack. Not month-keyed — unlike marketing packs.",
    rationale:
      "Receptionist scripts (greeting/hours/services/booking) are durable site facts, not a monthly content cadence. Month-keying would create empty regenerations every UTC month with no sold-promise match. Marketing packs stay YYYY-MM because Growth/Complete sells 8+2 per month.",
  },
  {
    date: "2026-07-12",
    decision:
      "Client voice eligibility requires paid|live + a Complete order (Growth alone does not unlock). Stub/Anthropic generators mirror marketing packs; operators Copy scripts until Twilio ships.",
    rationale:
      "Complete is the only tier that sells the AI phone receptionist. Generating voice packs for Growth would over-fulfill and confuse Billing vs product scope. Copy/paste fulfillment unblocks the sold promise without operator-gated Twilio secrets.",
  },
  {
    date: "2026-07-12",
    decision:
      "Commerce catalogs are one row per lead (SQLite + Convex), capped at 50 SKUs; Request order prefills the existing contact form so order notifications reuse clientInquiries.",
    rationale:
      "Sold Commerce promise needs a visible catalog before Stripe Products sync. A parallel order table would duplicate the inquiry inbox operators already work. SessionStorage handoff keeps CategoryPreview server-friendly while still prefilling the message.",
  },
  {
    date: "2026-07-12",
    decision:
      "After folding complete-client-voice-faq-pack (bc40) with commerce-catalog-stub (b87c), queue stripe-commerce-products-sync; Stripe Price bootstrap / Places / marketing scheduling stay gated.",
    rationale:
      "Both sold-capability gaps from this cron window are shipped. Embedded Stripe checkout per SKU is the natural next Commerce step but needs live Product create access — keep it explicit so hourly agents do not thrash on empty free backlog.",
  },
  {
    date: "2026-07-12",
    decision:
      "Sibling business-process-evolution-7d50 claimed client-voice-packs-missing-visibility first this cron; this branch claimed commerce-catalogs-missing-visibility (queued twin) and pushed before feature body.",
    rationale:
      "Protocol prefers parallel Complete vs Commerce fulfillment-debt visibility when both are free. Both reuse existing list* helpers; different sold promises; shared digest/health wiring patterns without competing implementations.",
  },
  {
    date: "2026-07-12",
    decision:
      "Commerce catalogs missing = listCommerceCatalogsMissing (paid/live + commerceAddon order, no catalog row). Surfaced as pipeline-health commerceCatalogsMissingCount + digest action section (top 5), not a second Work next panel.",
    rationale:
      "The dashboard missing panel only helps when the operator already opened /dashboard/leads. Health + digest make sold Commerce fulfillment debt visible the same way marketing packs due does — reuse the helper, do not invent a parallel eligibility check.",
  },
  {
    date: "2026-07-12",
    decision:
      "With free NEXT_STEPS operator/legal-gated after PR #46, prefer wiring already-shipped listClientVoicePacksDue / listCommerceCatalogsMissing into pipeline-health + digest over inventing new aggregates or fake-completing Stripe/Places/scheduling.",
    rationale:
      "Complete voice and Commerce catalogs already fulfill sold promises; missing visibility is the same operator-leverage pattern as marketing-packs-due. Reusing the helpers keeps one eligibility source and avoids a second dashboard panel.",
  },
  {
    date: "2026-07-12",
    decision:
      "Client voice packs due = listClientVoicePacksDue → pipeline-health clientVoicePacksDueCount + digest Complete voice packs due section (top 5). Load listClientVoicePacks once beside listOrders in digest/dashboard paths.",
    rationale:
      "Operators otherwise only notice missing Complete phone fulfillment by scanning Generate voice row controls. Digest + health make sold-promise debt visible without opening every Complete lead.",
  },
  {
    date: "2026-07-12",
    decision:
      "Queue commerce-catalogs-missing-visibility as the next free sibling todo after client-voice-packs-missing-visibility; keep stripe-commerce-products-sync operator-gated.",
    rationale:
      "Parallel fulfillment-debt visibility for Commerce (listCommerceCatalogsMissing already powers the dashboard missing panel). Same-cron siblings should claim voice vs commerce visibility separately when both are free.",
  },
  {
    date: "2026-07-12",
    decision:
      "Supersedes the prior 'keep stripe-commerce-products-sync operator-gated' decision: shipped as an operator-triggered per-catalog action, no ALLOW_*-style flag or new secret gate.",
    rationale:
      "Every other free NEXT_STEPS item (stripe-price-objects, lead-ingestion, marketing-content-scheduling) is gated on something an agent genuinely cannot obtain — real operator secrets, OAuth app approval, or legal review. stripe-commerce-products-sync only reuses STRIPE_SECRET_KEY, already required for the checkout flow to work at all, and is an explicit operator button click on one lead's catalog (same consent model as Generate marketing pack / Generate voice pack / Sync to Stripe's own billing-portal sibling), not an automatic or global action. The ALLOW_STRIPE_BOOTSTRAP gate on bootstrap-prices exists because that action is a rare, effectively-global one-time Price setup for the whole platform; creating per-SKU Products on an operator's own saved catalog is a repeatable, idempotent, scoped action with the same risk profile as every other 'operator clicks a button, code calls Stripe' feature already shipped. Closes the /docs/product-bundles Commerce promise ('Stripe Products sync + embedded checkout remain the next Commerce step').",
  },
  {
    date: "2026-07-12",
    decision:
      "syncCommerceCatalogToStripe never archives or deletes Stripe Products for SKUs an operator has since removed from the catalog draft — it only creates/finds Products for SKUs currently in the saved catalog.",
    rationale:
      "Archiving on every save would require diffing against previously-synced state and could silently deactivate a Product still referenced by an in-flight Checkout Session or a customer's purchase history. Leaving orphaned (but inactive-to-buyers, since nothing links to them) Products is a safe default; an operator can archive manually in the Stripe dashboard. Revisit only if operators report catalog churn creating meaningful Stripe-side clutter.",
  },
  {
    date: "2026-07-12",
    decision:
      "POST /api/commerce/checkout resolves the Stripe Price id server-side from the persisted commerce catalog by (slug, skuId) — it never accepts a price or amount from the client request body.",
    rationale:
      "A client-submitted price would let a visitor buy any SKU for any amount they choose. The existing /api/stripe/checkout route already follows this pattern (Price IDs come from env, not the request); commerce checkout extends the same rule to per-SKU Prices resolved from the operator's own saved catalog.",
  },
  {
    date: "2026-07-12",
    decision:
      'A completed commerce-order Stripe Checkout Session (session.metadata.kind === "commerce_sku", from POST /api/commerce/checkout) notifies the operator via insertClientInquiry (source commerce_checkout) — not recordLeadPayment/deploy-handoff, and not a new commerceOrders table.',
    rationale:
      "Discovered right after claude/quirky-davinci-r911f7 merged stripe-commerce-products-sync (PR #49, same cron window as this branch's claim — see the iteration below): the shipped webhook only branches on `if (slug && tier)`, and a commerce_sku session carries slug + skuId but no tier, so it silently fell into the else/console.warn branch — a paid Buy now order reached Stripe but never reached the operator. Reusing insertClientInquiry keeps a single order-notification surface (Request-order already uses it for un-synced SKUs) instead of fragmenting operator attention across two inboxes before real per-order fulfillment tracking is needed.",
  },
  {
    date: "2026-07-12",
    decision:
      "saveCommerceCatalogAction re-attaches Stripe Product/Price ids via preserveCommerceStripeIds from the existing DB catalog after normalizeCommerceItems — never from the client draft.",
    rationale:
      "normalizeCommerceItems intentionally strips stripeProductId/stripePriceId (operators should not forge charge targets). Without a server-side merge, any post-Sync catalog edit wiped Buy now until Sync to Stripe ran again — a silent sold-promise regression. Product id sticks by SKU id; Price id only when priceCents is unchanged (matches stripe-sync creating a new Price on reprice).",
  },
  {
    date: "2026-07-12",
    decision:
      "Commerce catalogs unsynced = listCommerceCatalogsUnsynced → pipeline-health commerceCatalogsUnsyncedCount + digest Sync to Stripe due section. Distinct from catalogs-missing; empty catalogs are not unsynced.",
    rationale:
      "After Stripe Products sync shipped, catalogs-missing only covers leads with no row. Operators who saved SKUs but never clicked Sync (or lost Price ids before the preserve fix) still leave visitors on Request order. Health + digest make that Sync debt visible beside missing catalogs without a second Work next panel.",
  },
  {
    date: "2026-07-12",
    decision:
      "With free NEXT_STEPS operator/legal-gated after PR #50, prefer fixing silent sold-capability regressions (Stripe id wipe on catalog save) and wiring Sync-debt visibility before inventing new optional aggregates or fake-completing Stripe Price bootstrap / Places / Buffer OAuth.",
    rationale:
      "Buy now that breaks after an ordinary catalog edit is higher leverage than another metric. Remaining todos still need secrets or counsel an agent cannot obtain.",
  },
  {
    date: "2026-07-12",
    decision:
      "After PR #50 (commerce Buy now operator notification) and sibling 1e7b claiming commerce-catalog-preserve-stripe-ids + commerce-catalogs-unsynced-visibility, the next free sold-capability gap is deliver-marketing-pack-to-client — email this month's Growth/Complete pack to lead.email via Resend.",
    rationale:
      "Generation alone leaves operators as the copy-paste bottleneck; Email pack closes content delivery without Buffer/GBP/Meta OAuth (still gated as marketing-content-scheduling). Reuses RESEND_API_KEY + sendEmail suppression, same consent model as Starter upsell / inquiry reply. Prefer this over inventing another optional aggregate while commerce twin work is owned elsewhere.",
  },
  {
    date: "2026-07-12",
    decision:
      "Marketing pack email delivery requires an existing pack row for marketingMonthKey(now) plus a non-empty lead.email — generate first, then Email pack. Do not auto-generate on send.",
    rationale:
      "Auto-generating on send would hide Anthropic/stub choice and surprise operators who want to review copy before the client sees it. The dashboard already has Generate/View/Copy; Email pack is the handoff step after review.",
  },
  {
    date: "2026-07-12",
    decision:
      "Queue deliver-client-voice-pack-to-client as the Complete twin of marketing pack email delivery (same Resend path, different pack module).",
    rationale:
      "Parallel Growth vs Complete delivery handoffs in the same cron window; siblings should claim different ones. Twilio stays Phase 7 gated — emailing scripts unblocks paste-into-temp-number fulfillment.",
  },
  {
    date: "2026-07-12",
    decision:
      "Supersedes the prior 'not a new commerceOrders table' decision: added a structured, append-only commerceOrders ledger (separate from `orders`) alongside the existing insertClientInquiry notification for completed commerce_sku Checkout Sessions.",
    rationale:
      "The inquiry-only notification satisfied 'the operator finds out,' but left zero structured revenue data — no way to answer 'how much has this catalog sold?' without parsing free-text inquiry messages. Once an operator runs Commerce at real volume, that answer matters. A separate ledger (not the `orders` table) avoids the correctness landmine documented in the new AGENT_PROTOCOL rule: `orders` rows with commerceAddon=true are read by orderEligibleForBillingPortal / leadEligibleForStarterUpsell as 'this lead has a recurring Commerce subscription,' which a one-off end-customer SKU purchase is not.",
  },
  {
    date: "2026-07-12",
    decision:
      "commerceOrdersRevenueUsd is surfaced on pipeline-health/dashboard only (like revenueTotalUsd), not folded into the daily digest.",
    rationale:
      "The digest's existing sections are all due/backlog counts (packs due, catalogs missing, inquiries unreplied) that prompt an operator action; a running revenue total is a dashboard fact, not an action item — revenueTotalUsd itself was never added to the digest for the same reason. Keeps the digest focused on 'what do I need to do today.'",
  },
  {
    date: "2026-07-12",
    decision:
      "Flagged commerce-payouts-stripe-connect as a new operator/legal-gated NEXT_STEP rather than silently leaving Commerce Buy now money unaddressed.",
    rationale:
      "Building the revenue ledger surfaced a real business risk that had no visibility before: Buy now purchases charge the platform's own Stripe account, and there is no code path that pays the underlying local business back. That gap was invisible pre-ledger (no total existed to notice); now that operators can see a growing 'Commerce sales (pass-through)' number, leaving the payout question unrecorded would look like the app forgot about it rather than deliberately deferred it pending Stripe Connect + counsel review.",
  },
  {
    date: "2026-07-12",
    decision:
      "Shipped deliver-client-voice-pack-to-client as the Complete twin of marketing Email pack — operator-triggered Resend of the existing FAQ/script pack to lead.email.",
    rationale:
      "Generation + Copy still left operators as the paste bottleneck for Complete phone fulfillment. Emailing scripts closes the sold handoff without Twilio. Reuses RESEND_API_KEY + sendEmail suppression; requires an existing pack row (never auto-generate on send) so operators can review before the client sees stub/Anthropic copy.",
  },
  {
    date: "2026-07-12",
    decision:
      "After marketing + voice pack email handoffs, queue commerce-buy-now-client-receipt as the next free sold-capability gap (email the commerceAddon lead on Buy now) rather than inventing optional aggregates.",
    rationale:
      "Commerce sells order notifications; today only the operator inquiry inbox is notified. Client receipt email reuses Resend + lead.email and is distinct from Stripe Connect payouts (money movement stays operator/legal-gated). Remaining other todos still need secrets, OAuth, or counsel.",
  },
  {
    date: "2026-07-12",
    decision:
      "Client voice pack email delivery is not month-keyed — one pack per Complete lead; regenerating replaces. Subject/body omit a year-month (unlike marketing packs).",
    rationale:
      "Matches the existing clientVoicePacks persistence model. Operators and clients should not think phone scripts expire monthly the way social/email packs do.",
  },
  {
    date: "2026-07-12",
    decision:
      "Commerce Buy now Checkout Sessions are recorded on checkout_sessions with kind=commerce_sku (+ skuId). Legacy rows without kind are treated as bundle. Bundle abandoned-recovery, Work next cart boosts, and pipeline-health abandonedCheckoutCount filter isBundleCheckoutSession only.",
    rationale:
      "POST /api/commerce/checkout previously created Stripe sessions with no app-side open-session row, so abandoned end-customer carts were invisible. Dumping them into the existing recovery queue without a discriminator would send Finish-checkout emails linking /checkout?tier= — wrong product, wrong buyer. Separate due queues + recovery templates keep Local Site Studio plan recovery and client-shop Buy now recovery correct.",
  },
  {
    date: "2026-07-12",
    decision:
      "Commerce abandoned-cart recovery emails the end-customer (session.customerEmail only) with a link to /preview/[slug]#catalog — never lead.email and never /checkout?tier=. Requires shopper email on the Stripe session; otherwise the panel shows the cart but disables Send.",
    rationale:
      "lead.email is the local business owner (Commerce client), not the shopper who abandoned Buy now. Using lead.email would spam the wrong person with a finish-your-order pitch. No email on the session means there is no safe recovery recipient — visibility still helps the operator follow up manually.",
  },
  {
    date: "2026-07-12",
    decision:
      "Same-hour coop with prompt-process-evolution-6219: they shipped deliver-client-voice-pack-to-client and queued commerce-buy-now-client-receipt; this branch shipped commerce-abandoned-checkout-tracking. Both NEXT_STEPS stay — receipt remains free for the next agent.",
    rationale:
      "Abandoned-cart tracking and client purchase receipts are different Commerce surfaces (shopper recovery vs client fulfillment notify). Recording both claims keeps siblings from thrashing on empty free backlog while Connect stays gated.",
  },
  {
    date: "2026-07-12",
    decision:
      "Shipped commerce-buy-now-client-receipt as a webhook-triggered Resend to lead.email on completed kind=commerce_sku Buy now — closes Commerce order-notification sold promise without Stripe Connect.",
    rationale:
      "Operator inquiry + commerceOrders ledger already recorded the sale for the platform; the local business still had no automated notice to fulfill. Emailing lead.email (not the shopper) reuses RESEND_API_KEY + sendEmail suppression. Distinct from sendReceiptEmail (Local Site Studio bundle buyer) and from abandoned Buy now recovery (shopper email → preview#catalog).",
  },
  {
    date: "2026-07-12",
    decision:
      "Client receipt send is best-effort after inquiry + ledger writes: missing lead.email skips the email; send failures log and do not roll back the structured records.",
    rationale:
      "Fulfillment visibility for the operator must not depend on the client having an email on file or Resend succeeding. Stripe may redeliver the webhook; inquiry/ledger are already idempotent on session id — a duplicate client email on rare redelivery is acceptable vs losing the ledger row.",
  },
  {
    date: "2026-07-12",
    decision:
      "After commerce-buy-now-client-receipt, remaining free coded NEXT_STEPS looked empty to prompt-process-evolution-4d67 — Stripe Price bootstrap, Places ingestion, marketing scheduling, and Stripe Connect stay operator/legal-gated. Prefer process/docs improvements or sold-capability regression fixes over inventing optional aggregates.",
    rationale:
      "Hourly agents need an explicit idle policy when the free backlog is exhausted so they do not invent competing metrics. Same-hour sibling business-process-evolution-58b6 still found a free wiring gap (payout ledger panel) and queued orphan Product archive — see following decisions.",
  },
  {
    date: "2026-07-12",
    decision:
      "When prompt-process-evolution-4d67 claimed commerce-buy-now-client-receipt, this run pivoted to commerce-orders-payout-ledger-panel — wire listCommerceOrders into a per-lead Commerce payouts (manual) panel via summarizeCommerceOrdersByLead.",
    rationale:
      "Pipeline-health already shows pass-through totals, but operators cannot reconcile who is owed what without row-level grouping. Manual payout visibility unblocks cautious Commerce sales volume before Stripe Connect + counsel. Distinct from client receipt email (sibling) and automated Connect payouts (still gated).",
  },
  {
    date: "2026-07-12",
    decision:
      "After payout ledger panel, queue commerce-stripe-orphan-product-archive as the next free Commerce cleanup todo (operator-triggered archive of Stripe Products for removed SKUs) rather than inventing optional aggregates — supersedes the same-hour 'free backlog empty' idle note once this wiring gap was claimed.",
    rationale:
      "stripe-commerce-products-sync explicitly deferred orphan archival. An explicit operator button matches the Sync consent model (reuses STRIPE_SECRET_KEY) and AGENT_PROTOCOL's no-silent-auto-delete rule. Remaining other todos still need secrets, OAuth, or counsel.",
  },
  {
    date: "2026-07-12",
    decision:
      "Same-hour coop: business-process-evolution-0907 claimed commerce-stripe-orphan-product-archive first; prompt-process-evolution-c75d pivoted to commerce-payouts-owed-in-digest (wire summarizeCommerceOrdersByLead into the daily digest).",
    rationale:
      "Earlier remote claim owns when neither side has feature commits. Orphan Product archive and digest payout liability are complementary Commerce surfaces (Stripe catalog hygiene vs operator money-owed visibility) — both reuse existing helpers and both matter while Connect stays gated.",
  },
  {
    date: "2026-07-12",
    decision:
      "Shipped commerce-payouts-owed-in-digest: daily digest action section listing per-lead pass-through Buy now totals (reuse summarizeCommerceOrdersByLead) plus a grand total — load listCommerceOrders once in sendDailyDigestAction.",
    rationale:
      "The dashboard payout panel only helps when the operator opens /dashboard/leads. A single-operator business already relies on the digest for follow-ups / recoveries / catalogs; pass-through money owed is the same class of urgency (financial liability) and must not stay dashboard-only until Connect ships.",
  },
  {
    date: "2026-07-12",
    decision:
      "Commerce payouts owed is a digest action section (not a footnote): any non-empty list makes isEmpty false, matching catalogs-missing / Sync-to-Stripe debt — operators must reconcile or consciously defer.",
    rationale:
      "Footnotes are for parked urgency (snoozed / cold). Money sitting in the platform Stripe account owed to clients is actionable liability, not parked. Cap the email list at 5 leads (highest owed first via existing summarize sort) while still showing the full owed total in the section title.",
  },
  {
    date: "2026-07-12",
    decision:
      "Shipped commerce-stripe-orphan-product-archive as an operator-triggered Archive orphans action: listOrphanCommerceStripeProducts finds active Stripe Products for the lead whose skuId is no longer in the saved catalog; archiveOrphanCommerceStripeProducts sets active=false (never deletes).",
    rationale:
      "Sync still creates/finds only current SKUs and must not silently archive (in-flight Checkout / purchase history). Explicit Archive orphans matches Sync consent (STRIPE_SECRET_KEY, per-lead button) and keeps the Stripe catalog aligned after SKU churn without scope-creeping save/sync.",
  },
  {
    date: "2026-07-12",
    decision:
      "After orphan Product archive, queue commerce-order-manual-payout-mark as the next free Commerce ops todo — optional paidOutAt (or equivalent) on commerceOrders plus Mark paid out on the payout panel — while Stripe Connect stays operator/legal-gated.",
    rationale:
      "The payout panel shows what is owed but not what has already been paid out; without a mark, operators risk double-paying clients as Commerce volume grows. Tracking manual payout state is real money ops, not an optional aggregate, and unblocks safer sales before Connect approval.",
  },
  {
    date: "2026-07-12",
    decision:
      "Shipped commerce-order-manual-payout-mark: paidOutAt on commerceOrders (SQLite migration + Convex), markCommerceOrderPaidOut keyed on stripeSessionId (matches recordCheckoutRecoverySent's pattern, not the Convex row id), and an operator 'Mark paid out' button per order line on the Commerce payouts (manual) panel.",
    rationale:
      "stripeSessionId is unique and already returned from both SQLite and Convex list paths, so no id/_id plumbing gap; using it as the key mirrors the existing checkoutSessions mutations (markComplete, recordRecoverySent) instead of inventing a new lookup shape.",
  },
  {
    date: "2026-07-12",
    decision:
      "summarizeCommerceOrdersByLead now returns both totalUsd (lifetime, unchanged) and unpaidTotalUsd/unpaidCount (excludes paidOutAt rows); the payout panel's 'owed' figure and sort order switched to unpaidTotalUsd, and buildDailyDigest's commercePayoutsOwed now filters to leads with unpaidCount > 0 using unpaidTotalUsd.",
    rationale:
      "Without this, marking an order paid out would have no effect on the operator-facing 'owed' totals in either the dashboard panel or the daily digest — both would keep reporting settled money as still owed, defeating the double-pay-risk purpose of the feature. totalUsd is kept for any future lifetime-sales reporting need.",
  },
  {
    date: "2026-07-12",
    decision:
      "Every app-owned ledger row (commerceOrders included) must store its id as its own Convex column (e.g. orderId, mirroring packId/inquiryId) and echo it back as `id` on every read — never rely on Convex's internal _id or omit the field, even when the SQLite fallback already generates one correctly.",
    rationale:
      "commerceOrders shipped without an id column in Convex while the SQLite path generated one inline; CommerceOrderRecord.id is a required string consumed as a React list key (Commerce payouts panel) and a plain type-cast (`as CommerceOrderRecord[]`) hid the gap from tsc. Naming the rule explicitly stops the next Convex-backed ledger from repeating the same silent-backend-divergence bug already seen once with lead.address.",
  },
  {
    date: "2026-07-12",
    decision:
      "Made the `orders` table (bundle checkout revenue) idempotent on stripeSessionId — UNIQUE index + check-before-insert on SQLite, existing-row query on Convex — and had the webhook skip resending receipt/handoff emails when a checkout.session.completed redelivery is detected.",
    rationale:
      "This is the platform's own revenue ledger, not a pass-through one, so a double-counted sale from an ordinary Stripe retry would have been a worse, higher-visibility version of the exact bug class AGENT_PROTOCOL already documented for checkout_sessions and commerce_orders (idempotent-on-stripeSessionId). Fixing the oldest, most-trusted table to match a rule written for newer tables closes the gap instead of leaving the original case as tacit permission to skip it.",
  },
  {
    date: "2026-07-12",
    decision:
      "Commerce Buy now webhook side effects (operator inquiry + client receipt email) now skip on Stripe checkout.session.completed redelivery via insertCommerceOrder's { alreadyRecorded } return — ledger was already idempotent, but Promise.all(inquiry, ledger) + unconditional client email were not.",
    rationale:
      "bundle-order-webhook-idempotency fixed the same hole for Starter/Growth/Complete; Commerce still spam-notified operators and clients on every Stripe retry because insertCommerceOrder returned void and ignored Convex's null-on-duplicate. Returning alreadyRecorded and sequencing ledger-before-side-effects closes the sold order-notification promise without inventing a second dedupe key.",
  },
  {
    date: "2026-07-12",
    decision:
      "Registered commerceOrders.markPaidOut on the static Convex API map in src/lib/db.ts, and computePipelineHealth now sums only unpaid commerce orders (isCommerceOrderPaidOut) for the Commerce sales (pass-through) card so owed totals match the payout panel + digest after Mark paid out.",
    rationale:
      "Without the API-map entry, Mark paid out under NEXT_PUBLIC_CONVEX_URL silently wrote SQLite while listCommerceOrders read Convex — operators would think a client was paid while owed totals never cleared (double-pay risk). Without the unpaid filter, the pipeline-health card kept showing lifetime pass-through after settlement, disagreeing with every other owed surface.",
  },
  {
    date: "2026-07-12",
    decision:
      "After PR #64 folded commerce Mark paid out Convex wiring + unpaid pipeline-health into main, append explicit AGENT_PROTOCOL rules for the static Convex API map and for commerceOrdersRevenueUsd meaning unpaid/owed — so the next empty-backlog audit does not re-learn the same split-brain or re-inflate the owed card.",
    rationale:
      "Feature code shipped via the sibling fold; naming the two rules in AGENT_PROTOCOL is the process improvement that stops recurrence without inventing a new metric.",
  },
  {
    date: "2026-07-12",
    decision:
      "The CAN-SPAM unsubscribe suppression list now persists to Convex (suppressions table + suppressions.ts) with SQLite fallback, matching every other table's persistence pattern, instead of writing only to the per-instance local SQLite file.",
    rationale:
      "isEmailSuppressed/suppressEmail/getSuppressedEmails were the only persistence trio in src/lib/db.ts with no Convex branch. On a multi-instance/serverless deployment with Convex configured, an unsubscribe recorded by one instance would not suppress a send handled by a different instance, even though every sendEmail call site correctly checks suppression before sending — the check was sound but its backing store wasn't durable or shared. This is a compliance exposure (unsubscribed prospects receiving further automated email), not just a data-loss bug, so it took priority over the lower-severity CSV/manual-add-lead collision findings from the same audit pass, which are logged as a follow-up NEXT_STEP instead.",
  },
  {
    date: "2026-07-12",
    decision:
      "CSV import and manual add-lead refuse slug collisions against already-persisted leads (skip with warning / return explicit error) instead of calling upsertLead, which would silently reset stage, outreachStep, notes, and snoozedUntil. upsertLead itself is unchanged — intentional pipeline updates stay on dedicated helpers.",
    rationale:
      "Queued as upsert-lead-collision-guard by the suppression-list audit (PR #65). A corrected CSV re-export or a typo on the add form could wipe an advanced lead back to discovered defaults because Convex leadFields.stage is required and the SQLite UPDATE path overwrites pipeline columns. Guarding at the create call sites preserves revenue-relevant CRM state without inventing a second upsert API or blocking legitimate update helpers.",
  },
  {
    date: "2026-07-12",
    decision:
      "Production deploy handoffs now persist to Convex (deployHandoffs table + deployHandoffs.ts) with SQLite fallback, matching every other table's persistence pattern, instead of writing only to the per-instance local SQLite file. Explicit handoffId column round-trips as id.",
    rationale:
      "After suppressions (PR #65) and upsert collision guards (PR #66), deploy_handoffs was the last SQLite-only surface in db.ts. Phase 5 fulfillment (DNS instructions, Mark live, per-client Vercel project) is what converts a paid checkout into a live client site — on a multi-instance deploy with Convex configured, queuing a handoff on one instance and listing/updating it on another would silently diverge, so operators could miss Mark-live work or double-provision. Closing the last Convex parity gap beats inventing another optional aggregate while Stripe Prices / Places / Buffer OAuth / Connect stay gated.",
  },
  {
    date: "2026-07-12",
    decision:
      "Bundle checkout.session.completed webhook always calls enqueueProductionHandoff (idempotent on slug + stripeSessionId); alreadyRecorded from recordLeadPayment gates only the non-idempotent receipt + DNS emails — never the handoff write.",
    rationale:
      "bundle-order-webhook-idempotency correctly stopped duplicate customer emails on Stripe redelivery, but the early break also skipped Phase 5 handoff creation. If the first delivery recorded the order then failed before enqueueProductionHandoff, retries permanently left paid customers without Mark live / DNS panel visibility. Separating idempotent fulfillment from non-idempotent emails closes that hole; AGENT_PROTOCOL now states the rule explicitly so the next empty-backlog audit does not re-conflate the two.",
  },
  {
    date: "2026-07-12",
    decision:
      "Queued billing-portal-orders-newest-first and contact-form-persist-required as free NEXT_STEPS from the same empty-backlog audit that found the handoff redelivery gap — do not invent optional aggregates while these sold-capability regressions remain.",
    rationale:
      "Convex listOrders is unordered while latestEligibleOrder assumes newest-first (Billing Portal can open against a stale order). Contact form returns ok:true even when insertClientInquiry fails (Starter inbox trail silently missing). Both are shipable without secrets; siblings can claim them next cron while Stripe Prices / Places / Buffer OAuth / Connect stay gated.",
  },
  {
    date: "2026-07-12",
    decision:
      "Convex markLeadPaid inserts a paid payment_stub lead (buildPaymentStubLeadFields defaults) when checkout completes for a slug with no CRM row — matching SQLite recordLeadPayment stub creation.",
    rationale:
      "Without the stub, Convex-configured deploys recorded revenue in orders while the lead never reached stage=paid, so paid-not-live counts, deploy-handoff eligibility, and funnel accuracy silently diverged from SQLite. Schema requires full lead fields on insert; shared defaults in payment-stub.ts keep both backends aligned.",
  },
  {
    date: "2026-07-12",
    decision:
      "listOrders sorts Convex results newest-first via sortOrdersNewestFirst before returning — Billing Portal latestEligibleOrder depends on that order.",
    rationale:
      "SQLite already ORDER BY createdAt DESC; Convex .collect() does not. A lead with multiple eligible orders could open Manage subscription against an older row missing stripeCustomerId. Sorting in listOrders (not only in the portal helper) keeps every newest-first consumer correct.",
  },
  {
    date: "2026-07-12",
    decision:
      "commerce_sku webhook requires metadata.skuId before insertCommerceOrder / inquiry / client receipt — missing skuId warns and breaks instead of firing non-idempotent side effects on every Stripe redelivery.",
    rationale:
      "The alreadyRecorded gate lived inside `if (skuId)`; without skuId, inquiry + client receipt still ran on retries. Normal Buy now always sets skuId; this closes the malformed-session hole without inventing inquiry dedup.",
  },
  {
    date: "2026-07-12",
    decision:
      "POST /api/contact/[slug] treats insertClientInquiry as required for success: persist failure returns 503 (never ok:true); email notify runs only after a successful ledger write and stays best-effort if Resend fails.",
    rationale:
      "Starter sells a working contact form plus an operator CRM trail. Returning Thanks while the inquiry insert failed left visitors thinking the message landed and operators with an empty inbox — worse than a visible retry. Same-minute dual claim with prompt-process-evolution-4d48: earlier remote claim (6547, +3s) owns; 4d48 should pivot.",
  },
  {
    date: "2026-07-12",
    decision:
      "Folded contact-form-persist-required onto prompt-process-evolution-4d48 with a pure contactPersistOutcome / shouldSendContactNotify helper + Vitest coverage, keeping 6547's route behavior as the single implementation. One PR merges; close the duplicate sibling PR.",
    rationale:
      "6547 owned the earlier claim and shipped the 503-on-persist-failure fix first. 4d48's complementary pure helper + tests + docs clarify the HTTP contract without a second competing route. AGENT_PROTOCOL now allows later claims to fold tests/docs/helpers onto an earlier feature body instead of abandoning useful coverage — still one implementation, both ITERATIONS kept.",
  },
  {
    date: "2026-07-12",
    decision:
      "Stripe checkout.session.completed returns HTTP 500 when required fulfillment writes fail (bundle recordLeadPayment / enqueueProductionHandoff, commerce insertCommerceOrder) so Stripe redelivers; receipt/DNS/client-notify emails remain best-effort after durable writes and do not flip the webhook to 5xx.",
    rationale:
      "ACK 200 after a swallowed DB/timeout permanently loses paid fulfillment because Stripe will not retry. Separating required ledger/handoff from best-effort email matches alreadyRecorded email gating and handoff-on-redelivery — recovery needs a non-2xx on the first failure. Queued commerce side-effect recovery on redelivery and Convex-primary-no-fallback as follow-ups from the same audit.",
  },
  {
    date: "2026-07-12",
    decision:
      "Commerce Buy now webhook recovers missing operator inquiry + client receipt on Stripe redelivery when the ledger already exists but no commerce_checkout inquiry embeds the stripeSessionId (planCommerceWebhookSideEffects). alreadyRecorded alone must not early-break past those notifies.",
    rationale:
      "PR #71 made ledger failures return 5xx so Stripe retries, but the commerce branch still broke out entirely on alreadyRecorded — so a crash after insertCommerceOrder permanently lost the sold order-notification promise on every retry. Matching session id in the inquiry message is the idempotency key without a new table; receipt-only failure after a successful inquiry stays best-effort (operator has the inbox row). Sibling subdomain holds proxy-custom-domain-parity; stripe-webhook-convex-primary-no-fallback claimed by business-process-evolution-740a.",
  },
  {
    date: "2026-07-12",
    decision:
      "Stripe webhook fulfillment writes pass requireConvex when Convex is configured — fail closed (Stripe retry) instead of SQLite-only fallback on Convex mutation failure. Dashboard/operator paths keep the fallback.",
    rationale:
      "Multi-instance / serverless deploys read Convex-first. A webhook that ACKs after writing payment/handoff/commerce ledger only to instance-local SQLite creates permanent split-brain: revenue appears paid on one box and unpaid everywhere else. Stripe retry is the correct recovery; silent SQLite fallback is not. Pure policy helper lives in src/lib/payments/convex-primary.ts so the decision is unit-tested. Folded after PR #72 commerce side-effect recovery (both ITERATIONS kept).",
  },
  {
    date: "2026-07-12",
    decision:
      "Shipped Starter's \"Preview subdomain → custom domain handoff\" promise end-to-end: an operator-editable customDomain field on the deploy handoff, plus proxy.ts host-based routing that rewrites \"/\" to a lead's /preview/[slug] when the request Host matches a saved custom domain. Routing decision (isPlatformHost) lives in a dependency-free module so it's unit-tested without proxy.ts's request plumbing.",
    rationale:
      "The free NEXT_STEPS backlog stayed empty (only stripe-price-objects / lead-ingestion / marketing-content-scheduling / commerce-payouts-stripe-connect remain, all operator/legal-gated). A sibling (cursor/business-process-evolution-subdomain) pushed a claim-only commit for proxy-custom-domain-parity ~1 hour before this run with no feature body, describing a fix to a proxy.ts Convex query that does not exist on main — auditing the actual gap found the real problem was one level deeper: DeployHandoff.customDomain was a fully-plumbed field (schema, SQLite column, tryProvisionVercelDomain already preferred it for the Vercel Domains API call) that no operator UI ever set, and no request-time code ever read for routing. That is a real, sold, unimplemented Starter capability — the same class of gap this backlog prioritizes (AGENT_PROTOCOL: 'ship the next free product-promise gap ... what Starter/Growth/Complete sells but the product lacks') — so it was picked up under the sibling's id despite the stale claim having no working code to fold. Scoped tightly to the exact root path so /api/* (slug-addressed) and /dashboard/* (operator-auth-gated) are unaffected by Host, and gated behind isPlatformHost so the extra Convex/SQLite lookup only fires for genuinely unrecognized hosts, not every marketing-site or /preview/[slug] pageview.",
  },
  {
    date: "2026-07-12",
    decision:
      "isFollowUpDue now excludes snoozed leads; isColdLead deliberately does not.",
    rationale:
      "Snooze is the operator's explicit 'don't contact' signal (isLeadSnoozed / quality-score.ts actionable already honor it for Work next). isFollowUpDue feeds passive/automated surfaces — the Follow-ups due panel, pipeline-health followUpsDueCount, the daily digest — that promote a lead for action without the operator having chosen that specific lead, so it must respect the snooze like Work next does. isColdLead is different: it also gates planColdLeadDisposition, and clicking Re-engage or Close on a specific snoozed cold lead is a deliberate single-lead operator action that itself clears the snooze (existing cold-archive.test.ts already asserts this succeeds) — identical in kind to the always-available per-row Unsnooze button and the manual 'Email {next}' send button, both of which already bypass the due-cadence gate on purpose. Blanket-adding the snooze check to isColdLead broke that intended override (caught by the existing test suite before merge) — the fix stayed scoped to isFollowUpDue only.",
  },
  {
    date: "2026-07-12",
    decision:
      "Every dynamic value interpolated into an outbound email's HTML body must pass through escapeHtmlForEmail, with no exceptions for 'trusted' operator-entered fields like businessName.",
    rationale:
      "lead.businessName is populated from CSV import and manual dashboard entry (see upsert-lead-collision-guard), not a fixed enum — it can legitimately contain apostrophes, ampersands, or angle brackets (business names like \"Bob's Auto & <Truck> Repair\" are real-world plausible). sendReceiptEmail (fired on every paid bundle sale) and the three outreach cadence emails treated it as safe while every other template already escaped it, which is exactly the kind of asymmetric-pattern bug this audit process exists to catch. Fixing the highest-volume/highest-trust sends (receipt + outreach 1-3 + bundle abandoned-recovery) closes the gap; the codebase already had zero unrelated exceptions to point to, so the rule is now absolute rather than case-by-case.",
  },
  {
    date: "2026-07-12",
    decision:
      "Preview-subdomain routing (extractPreviewSubdomainSlug) rewrites {slug}.{productionRootDomain} to that lead's /preview/[slug] only after confirming the slug resolves to a real lead — an unrecognized label falls through to the marketing homepage, never to the demo-catalog preview fallback.",
    rationale:
      "resolvePreviewLead's demo-catalog fallback exists so an operator can sanity-check /preview/[slug] rendering for a not-yet-persisted slug during setup — it was never meant to be internet-facing routing behavior. Wiring it into subdomain routing would mean any typo'd or squatted {label}.{root} host renders a plausible-looking fake business page under the platform's own domain, which is a worse failure mode than a 404-equivalent homepage fallback. Requiring getLeadBySlug to resolve keeps the subdomain promise scoped to real, paying leads, matching how the sibling custom-domain routing already behaves (getLeadSlugByCustomDomain is real-lead-only too).",
  },
  {
    date: "2026-07-12",
    decision:
      "POST /api/contact/[slug] passes requireConvex (CONTACT_FORM_CONVEX_PRIMARY) when Convex is configured — same fail-closed policy as Stripe webhook fulfillment writes. Visitor-facing { ok: true } must not follow a SQLite-only inquiry write.",
    rationale:
      "PR #73 closed webhook split-brain; contact form was the documented remaining multi-instance CRM gap. Persist-required already returns 503 without an inquiryId — requireConvex makes Convex mutation failure take that path instead of silently writing local SQLite that Convex-first dashboard readers never see. Inline notify HTML in the same route was also escapeHtmlForEmail'd (extends the PR #76 resend.ts rule to route-handler templates). Free backlog otherwise stays gated (Stripe Prices / Places / Buffer OAuth / Connect). Sibling prompt-process-evolution-3601 was running the same hour but had not claimed on remote.",
  },
  {
    date: "2026-07-12",
    decision:
      "Commerce Buy now webhook returns HTTP 500 (step commerce_order_inquiry) when insertClientInquiry fails after a durable commerceOrders ledger write — never ACK 200. Client receipt stays best-effort only after inquiry succeeds.",
    rationale:
      "PR #72's planCommerceWebhookSideEffects recovery only runs on Stripe redelivery. The prior catch logged inquiry failures and still returned { received: true }, so Stripe never retried and the sold order-notification promise (operator inbox + optional client receipt) could be permanently lost while the ledger showed the sale. Matching the ledger/handoff 5xx contract closes the hole; receipt-only failure after a successful inquiry remains best-effort because the operator already has the inbox row. Queued checkout-session-complete-convex-primary for the related markCheckoutSessionComplete warn-only gap. Sibling a7c2 merged contact-form-convex-primary as PR #78 in the same hour.",
  },
  {
    date: "2026-07-12",
    decision:
      "POST /api/stripe/checkout mints a stable organic-* lead slug into Checkout Session metadata (and cancel_url) when the request omits slug — never store slug:\"\". Webhook fulfillment + payment stubs then create CRM/handoff rows for homepage buyers.",
    rationale:
      "Primary marketing CTAs on / link to /checkout?tier=… without a lead slug. The webhook only runs recordLeadPayment + enqueueProductionHandoff when slug && tier, so empty metadata.slug meant Stripe could collect money with zero CRM, handoff, or receipt/DNS emails — contradicting the payment_stub design that already handles 'slug present, lead missing'. Minting at session create (resolveBundleCheckoutLeadSlug) is smaller and more reliable than synthesizing in the webhook after the fact, and also lets abandoned-checkout tracking record the session for recovery via session.customerEmail. Left checkout-session-complete-convex-primary to open PR #81 (claude/relaxed-galileo-d3qpgd).",
  },
  {
    date: "2026-07-12",
    decision:
      "DNS handoff email HTML (inline webhook template + formatDnsInstructionsForEmail) must escape businessName and all handoff URL/host fields via escapeHtmlForEmail. Growth landing feature copy says ready-to-post packs — not auto-scheduled — until marketing-content-scheduling OAuth ships.",
    rationale:
      "Same empty-backlog audit as organic attribution: the DNS 'next steps' email was the one post-payment HTML path still interpolating raw businessName after PR #76 escaped sendReceiptEmail in the same webhook block — classic asymmetry. formatDnsInstructionsForEmail lived in a db-importing module, so it moved to dns-email.ts for unit-testable escaping. Landing Growth copy overclaimed Buffer/GBP/Meta auto-scheduling that remains operator-gated; truthful packaging protects conversion quality and counsel risk.",
  },
  {
    date: "2026-07-12",
    decision:
      "markCheckoutSessionComplete now accepts ConvexPrimaryWriteOptions and both webhook call sites pass requireConvex, 5xx-ing (checkout_session_mark_complete) on a Convex failure instead of warn-and-continue.",
    rationale:
      "Every other Stripe-webhook fulfillment write (recordLeadPayment, insertDeployHandoff, insertCommerceOrder, insertClientInquiry) already fails closed on Convex when configured — mark-complete was the one ledger write still silently SQLite-falling-back. A failed mark-complete under a configured Convex leaves the session 'open' to Convex-first readers (listAbandonedCheckoutsDue / listCommerceAbandonedCheckoutsDue) even though the customer already paid, risking a Finish-checkout nudge to someone who just completed checkout. convex/checkoutSessions.ts's markComplete mutation is already a safe no-op when no row matches, so failing closed cannot false-positive on an untracked session id — only a genuine Convex outage now returns 5xx, and Stripe's retry re-runs the (idempotent) mark exactly like every sibling fulfillment write. Folded with PR #82 organic attribution (both ITERATIONS kept).",
  },
  {
    date: "2026-07-12",
    decision:
      "Fold complementary contact-form notify HTML escape regression test from duplicate PR #80 (upbeat-dijkstra-v7yyno) onto main — escape already shipped in PR #78; keep the route.test.ts coverage and close the duplicate PR.",
    rationale:
      "AGENT_PROTOCOL: a later claim may fold complementary tests/docs into one PR rather than abandoning coverage. PR #80 duplicated the escape already on main but added the only end-to-end handler test for malicious visitor input through POST /api/contact/[slug]. Keeping the test and closing the competing PR avoids a second process-log rewrite fight.",
  },
  {
    date: "2026-07-12",
    decision:
      "GET /api/unsubscribe passes requireConvex (UNSUBSCRIBE_CONVEX_PRIMARY) when Convex is configured — success HTML must not follow a SQLite-only suppress write.",
    rationale:
      "PR #65 added Convex persistence for suppressions, but the public unsubscribe route kept the dashboard-style Convex→SQLite fallback. isEmailSuppressed reads Convex-first, so a SQLite-only write after a Convex blip would show the visitor a success page while other instances keep sending — a real CAN-SPAM regression, not just data loss. Fail-closed 500 matches contact-form requireConvex (PR #78). DNS handoff HTML escape shipped on PR #82 (9c45) in the same hour — folded, not re-owned. checkout-session-complete-convex-primary merged as PR #81. PR #80 contact notify test fold landed on main mid-merge.",
  },
  {
    date: "2026-07-12",
    decision:
      "recordCheckoutSessionCreated accepts ConvexPrimaryWriteOptions; bundle + commerce checkout APIs pass CHECKOUT_SESSION_CREATE_CONVEX_PRIMARY and return 502 on failure instead of { url } after a SQLite-only create.",
    rationale:
      "PR #81 closed the mark-complete half of checkout_sessions Convex primary, but create still soft-fell-back and both checkout routes swallowed tracking errors then redirected buyers to Stripe. listOpenCheckoutSessions reads Convex-first for abandoned-recovery and digest — a multi-instance deploy with Convex configured would permanently drop Finish-checkout / Buy now recovery revenue for any create that only landed in instance-local SQLite. Fail-closed 502 mirrors contact/unsubscribe/webhook requireConvex (buyer retries). Queued deploy-handoff-preserve-custom-domain + checkout-recovery-sent-convex-primary as the next free sold-capability / CAN-SPAM regressions; Stripe Prices / Places / Buffer OAuth / Connect stay gated.",
  },
  {
    date: "2026-07-12",
    decision:
      "POST /api/preview/[slug]/open passes requireConvex (PREVIEW_OPEN_CONVEX_PRIMARY) when Convex is configured — fail-closed 503 instead of claiming recorded:true after a SQLite-only lastPreviewOpenAt write.",
    rationale:
      "Free NEXT_STEPS were gated after PR #83; sibling f005 claimed checkout-session-create-convex-primary in the same cron window (merged as PR #84). Preview-open was the remaining public write that still SQLite-fallback'd then returned success while Convex-first getLeads never saw the open — Work next preview_opened (+10), follow-up openers-first sort, and the Opened badge all silently regress on multi-instance deploys. Beacon is fire-and-forget so 503 needs no visitor UX; matches contact/unsubscribe/webhook requireConvex. Left deploy-handoff-preserve-custom-domain + checkout-recovery-sent-convex-primary queued by f005.",
  },
  {
    date: "2026-07-12",
    decision:
      "enqueueProductionHandoff must preserve operator-set customDomain and vercelProjectId via preserveDeployHandoffOperatorFields when rebuilding a handoff for a new stripeSessionId (upsell / re-purchase).",
    rationale:
      "Starter sells Preview subdomain → custom domain handoff; once an operator saves a client domain (or dedicated Vercel project), Host→preview routing and Domains API targeting depend on those fields surviving. Convex upsert replace + SQLite ON CONFLICT both clear omitted optionals, and buildHandoffRecord never copied them — so a Starter→Growth upsell checkout wiped live routing the same way normalizeCommerceItems wiped Stripe ids before preserveCommerceStripeIds. Explicit next values still win; checkout-recovery-sent-convex-primary stays queued for the sibling (6946) / next run. Stripe Prices / Places / Buffer OAuth / Connect stay gated.",
  },
  {
    date: "2026-07-12",
    decision:
      "recordCheckoutRecoverySent accepts ConvexPrimaryWriteOptions; bundle + commerce recovery dashboard actions pass CHECKOUT_RECOVERY_SENT_CONVEX_PRIMARY and durable-mark recoverySentAt BEFORE the Resend send.",
    rationale:
      "Queued by f005; left free after c1a0 shipped deploy-handoff-preserve (PR #86) while 6946 dual-claimed that todo claim-only and pivoted. Send-then-soft-fallback left Convex-first abandoned queues able to re-nudge after a successful email — reputation / CAN-SPAM risk, not just data loss. Persist-then-notify matches contact/webhook house pattern: mark failure skips the send; send failure after a durable mark leaves the session off the due queue (operator sees the error, no automatic second nudge). Stripe Prices / Places / Buffer OAuth / Connect stay gated.",
  },
  {
    date: "2026-07-13",
    decision:
      "Every Stripe list()-based idempotent lookup (stripe-sync.ts, bootstrap-stripe-prices.ts) must paginate via has_more/starting_after rather than trusting a single limit:100 page.",
    rationale:
      "Free NEXT_STEPS backlog stayed empty after PR #87 (checkout-recovery-sent requireConvex) — only stripe-price-objects / lead-ingestion / marketing-content-scheduling / commerce-payouts-stripe-connect remain, all operator/legal-gated. Audit found findProductByKey/findMatchingPrice/listOrphanCommerceStripeProducts only scanned the first 100 active Products/Prices; Commerce sells one Stripe Product per SKU per lead, so a real account can exceed that page cap quickly. An un-paginated lookup breaks the idempotent-metadata-key contract silently — duplicate Products/Prices on re-sync, or a genuine orphan reported as clean by Archive orphans — with no error surfaced to the operator. Pagination is cheap and the failure mode (Stripe dashboard pollution, revenue reconciliation drift, false-positive cleanup) is worse than the extra list() calls.",
  },
  {
    date: "2026-07-13",
    decision:
      "markCommerceOrderPaidOut accepts ConvexPrimaryWriteOptions; markCommerceOrderPaidOutAction passes COMMERCE_PAID_OUT_CONVEX_PRIMARY when Convex is configured — fail closed instead of SQLite-only success.",
    rationale:
      "Empty-backlog after PR #87: commerce-mark-paid-out-convex-wiring registered the static API map, but transient Convex failures still soft-fell-back while listCommerceOrders / unpaid owed aggregates read Convex-first — Mark paid out could succeed locally and leave double-pay liability visible on other instances. Operator-action fail-closed matches checkout recoverySentAt (retry surfaces; no silent split-brain). Queued deploy-handoff-operator-writes-convex-primary + lead-snooze-convex-primary; folded sibling 4810 claim deploy-handoff-preserve-status-on-upsell + outreach-cadence-persist-then-send. Stripe Prices / Places / Buffer OAuth / Connect stay gated.",
  },
  {
    date: "2026-07-13",
    decision:
      "preserveDeployHandoffOperatorFields keeps progressed status (live/provisioned), notes audit trail, and vercelDomainStatus on upsell rebuild — not only customDomain/vercelProjectId. tryProvisionVercelDomain never downgrades live→provisioned.",
    rationale:
      "PR #86 closed the routing-field half of handoff preserve; empty-backlog audit after PR #87 found Mark live still silently reset to awaiting_dns (and notes wiped) when Starter→Growth rebuilt the handoff for a new stripeSessionId — reopening paidNotLive / open-handoff debt the operator already cleared. Same class as preserveCommerceStripeIds. Queued outreach-cadence-persist-then-send for sibling (send-then-soft-persist Email 2/3 CAN-SPAM risk). Folded PR #89 commerce-paid-out requireConvex (3f93). Stripe Prices / Places / Buffer OAuth / Connect stay gated.",
  },
  {
    date: "2026-07-13",
    decision:
      "updateLeadSnooze accepts ConvexPrimaryWriteOptions; snoozeLeadAction passes LEAD_SNOOZE_CONVEX_PRIMARY when Convex is configured — fail closed instead of SQLite-only success for both Snooze presets and Unsnooze clear.",
    rationale:
      "Empty-backlog follow-up after PR #88 (deploy-handoff-preserve-status-on-upsell) and PR #90 (commerce-stripe-sync-pagination): updateLeadSnooze was one of the last operator writes still soft-falling-back on Convex failure. isFollowUpDue (PR #74) deliberately excludes snoozed leads from Follow-ups due / pipeline-health / the digest, but that guarantee only holds if every instance reading Convex-first actually sees the snooze — a SQLite-only write on one instance while others read Convex-first would leave a lead the operator explicitly parked still eligible for a live Send button elsewhere. The same risk runs in reverse for Unsnooze: a SQLite-only clear could leave a lead invisible on Work next/Follow-ups due after the operator asked to resurface it. Operator-action fail-closed matches the house pattern (checkout recoverySentAt, commerce paidOutAt): retry surfaces to the operator, no silent split-brain. deploy-handoff-operator-writes-convex-primary and outreach-cadence-persist-then-send remain queued for a sibling run. Stripe Prices / Places / Buffer OAuth / Connect stay gated.",
  },
  {
    date: "2026-07-13",
    decision:
      "updateDeployHandoffStatus / updateDeployHandoffVercelProject / updateDeployHandoffCustomDomain / updateLeadStage accept ConvexPrimaryWriteOptions; assignVercelProjectAndProvision, assignCustomDomainAndProvision, and markHandoffLive pass DEPLOY_HANDOFF_CONVEX_PRIMARY through both the field write and the subsequent insertDeployHandoff re-persist (and, for Mark live, the lead-stage write) — fail closed instead of SQLite-only success.",
    rationale:
      "Last free requireConvex follow-up after lead-snooze-convex-primary (PR #91): getLeadSlugByCustomDomain (proxy.ts host-based routing) and listDeployHandoffs (operator dashboard) both read Convex-first, so a SQLite-only write on one instance after a Convex mutation failure would silently miss everywhere else — a newly assigned custom domain would never route (breaking the Starter Host→preview promise), a dedicated Vercel project assignment would not isolate the client's deploy, and Mark live would leave the handoff (and the lead's pipeline stage, via updateLeadStage) looking pre-live on other instances despite the operator confirming DNS/publish. Included updateLeadStage in the fail-closed set, not just the handoff row, because Mark live's two writes must agree across instances — a handoff marked live on Convex while the lead stage silently fell back to SQLite would desync paidNotLiveCount / funnel accuracy in a subtler way than an outright write failure. Matches the house pattern (checkout recoverySentAt, commerce paidOutAt, lead snooze): operator retries on ConvexPrimaryWriteError, no silent split-brain. Only outreach-cadence-persist-then-send remains free; stripe-price-objects / lead-ingestion / marketing-content-scheduling / commerce-payouts-stripe-connect stay operator/legal-gated.",
  },
  {
    date: "2026-07-13",
    decision:
      "recordLeadOutreach accepts ConvexPrimaryWriteOptions; every Email 1/2/3 call site (updateLeadStageAction, disposeColdLeadAction, sendFollowUpAction, addLeadAction) now durably marks the outreach step via OUTREACH_CADENCE_CONVEX_PRIMARY BEFORE calling Resend, not after — mark failure skips the send and surfaces a retry to the operator; send failure after a durable mark leaves that step off the due queue until the operator manually retries.",
    rationale:
      "Last free NEXT_STEPS item — everything else remaining (stripe-price-objects, lead-ingestion, marketing-content-scheduling, commerce-payouts-stripe-connect) is operator/legal-gated. recordLeadOutreach previously soft-fell-back to SQLite on a Convex mutation failure, and every caller sent the email via Resend first, persisting the step advance only after a successful send. isFollowUpDue / pipeline-health / the daily digest all read Convex-first, so a Convex write failure (soft fallback) or any crash between a successful Resend send and the persist call would leave the lead looking due for the same step on every other instance — the next automation run or operator click could send Email 2 or Email 3 a second time, a CAN-SPAM and sender-reputation risk, not just a display bug. Flipping to persist-then-notify (same shape as CHECKOUT_RECOVERY_SENT_CONVEX_PRIMARY) closes both gaps: the mark is fail-closed AND lands before the side effect it's supposed to prevent from duplicating. The accepted trade-off — a lead can go one cadence step behind if Resend itself fails right after a successful durable mark — mirrors recoverySentAt's already-accepted behavior and was judged safer than the alternative (silently risking duplicate sends across instances) for a codebase multiple concurrent agents deploy against. disposeColdLeadAction's Email 1 mark reuses the same sentAt timestamp for both the mark and (on success) the reported lastOutreachAt, keeping the two in sync without a second write.",
  },
  {
    date: "2026-07-13",
    decision:
      "upsertCommerceCatalog accepts ConvexPrimaryWriteOptions; saveCommerceCatalogAction and syncCommerceCatalogToStripeAction pass COMMERCE_CATALOG_CONVEX_PRIMARY when Convex is configured — fail closed instead of SQLite-only success.",
    rationale:
      "Empty-backlog after PR #94 (outreach-cadence-persist-then-send): the free requireConvex chain for outreach/checkout/handoff/snooze was closed, but Commerce catalog persist still soft-fell-back while getCommerceCatalog / listCommerceCatalogs read Convex-first. Sync to Stripe can create Stripe Products/Prices then return success after a SQLite-only upsert — other instances still see SKUs without stripePriceId, so Buy now stays blocked and Sync to Stripe due stays falsely elevated. Operator-action fail-closed matches Mark paid out / recoverySentAt; Sync retry is idempotent on commerceSkuStripeKey. Folded sibling a425 inquiry-reply-convex-primary feature body on merge. Stripe Prices / Places / Buffer OAuth / Connect stay gated.",
  },
  {
    date: "2026-07-13",
    decision:
      "recordClientInquiryReply + updateClientInquiryStatus accept ConvexPrimaryWriteOptions; replyToInquiryAction / updateInquiryStatusAction pass INQUIRY_REPLY_CONVEX_PRIMARY and replyToInquiryAction durably marks replied BEFORE Resend (persist-then-notify) — mark failure skips the send; send failure after a durable mark leaves the inquiry off the unreplied queue until the operator retries.",
    rationale:
      "Empty-backlog after PR #94 closed outreach cadence: replyToInquiryAction was still send-then-soft-fallback while unrepliedInquiryCount / oldestUnrepliedInquiryAgeHours / digest read Convex-first — a successful visitor reply (or composer mark-read) could leave the inquiry looking unreplied on other instances and risk a duplicate operator reply. Same house pattern as OUTREACH_CADENCE / CHECKOUT_RECOVERY_SENT. Queued cold-disposition-convex-primary + lead-notes-convex-primary for siblings; stripe-price-objects / lead-ingestion / marketing-content-scheduling / commerce-payouts-stripe-connect stay gated.",
  },
  {
    date: "2026-07-13",
    decision:
      "Shipped direct Vitest coverage for src/lib/deploy/handoff.ts (enqueueProductionHandoff, tryProvisionVercelDomain, assignVercelProjectAndProvision, assignCustomDomainAndProvision, markHandoffLive) instead of picking a new requireConvex item — cold-disposition-convex-primary and lead-notes-convex-primary were left free by the sibling iterations above (queued for another run), but this session's own audit had already independently converged on the untested handoff.ts orchestrator as the highest-value gap before those two were folded in; both remain valid free NEXT_STEPS for a future iteration.",
    rationale:
      "handoff.ts is the highest-branching, most frequently edited module in the entire fail-closed hardening series (deploy-handoff-preserve-custom-domain, deploy-handoff-preserve-status-on-upsell, deploy-handoff-operator-writes-convex-primary all touched it) yet had zero direct tests — every sibling file in src/lib/deploy/ (handoff-persist, handoff-preserve, dns-email, custom-domain-routing) already had one. The untested surface included subtle, easy-to-regress logic that gates real money-flow correctness: enqueueProductionHandoff's three-way idempotency guard (existing + same session + not-failed → return as-is; anything else → rebuild), the live-never-downgrades-to-provisioned rule inside tryProvisionVercelDomain's five branches (unconfigured, 200, 409, other HTTP error, network exception), and the skip-note string-equality dedup that silently produces duplicate operator-facing notes if the message text ever drifts. A regression here is a live-site routing bug (getLeadSlugByCustomDomain / listDeployHandoffs both read Convex-first off this same write path), not a cosmetic one, and nothing in CI would have caught it. Did not touch convex/orders.ts's dead createOrder/getByStripeSessionId (already reviewed and intentionally left alone by a prior iteration) to avoid re-litigating a settled call.",
  },
  {
    date: "2026-07-13",
    decision:
      "applyColdLeadDisposition accepts ConvexPrimaryWriteOptions; disposeColdLeadAction passes COLD_DISPOSITION_CONVEX_PRIMARY when Convex is configured — fail closed instead of SQLite-only success for Re-engage and Close.",
    rationale:
      "Empty-backlog after PR #97 (deploy-handoff orchestrator tests) left cold-disposition-convex-primary + lead-notes-convex-primary as the free requireConvex follow-ups queued by a425. applyColdLeadDisposition still soft-fell-back while getLeads / cold badges / pipeline-health cold counts / the stage funnel read Convex-first — Re-engage or Close on one instance could succeed locally while other instances still showed the lead as cold (or still open after Close). Email 1 on re-engage already used OUTREACH_CADENCE_CONVEX_PRIMARY for the outreach mark; the disposition write itself was the remaining split-brain. Operator-action fail-closed matches LEAD_SNOOZE / COMMERCE_PAID_OUT. lead-notes-convex-primary stays free for sibling prompt-process-evolution-111d; stripe-price-objects / lead-ingestion / marketing-content-scheduling / commerce-payouts-stripe-connect stay gated.",
  },
  {
    date: "2026-07-13",
    decision:
      "updateLeadNotes accepts ConvexPrimaryWriteOptions; updateLeadNotesAction passes LEAD_NOTES_CONVEX_PRIMARY when Convex is configured — fail closed instead of SQLite-only success for discovery-call / Email 3 notes.",
    rationale:
      "Sibling prompt-process-evolution-111d had not claimed lead-notes after cold-disposition shipped on c5ed, so this branch claimed the next free todo. updateLeadNotes still soft-fell-back while getLeads reads Convex-first — an operator could save call outcomes on one instance and lose them on every other deploy. Same house pattern as LEAD_SNOOZE / COLD_DISPOSITION. With both free requireConvex follow-ups closed, remaining NEXT_STEPS are all operator/legal-gated (stripe-price-objects / lead-ingestion / marketing-content-scheduling / commerce-payouts-stripe-connect).",
  },
  {
    date: "2026-07-13",
    decision:
      "upsertMarketingPack accepts ConvexPrimaryWriteOptions; generateMarketingPackAction passes MARKETING_PACK_CONVEX_PRIMARY when Convex is configured — fail closed instead of SQLite-only success for Growth/Complete Generate pack. Queued client-voice-pack-convex-primary as the Complete twin.",
    rationale:
      "Same-cron dual claim: this branch (111d) claimed cold-disposition ~1 min after c5ed's earlier remote claim + feature body — folded c5ed (cold-disposition + lead-notes) per AGENT_PROTOCOL and pivoted rather than shipping a duplicate. Empty-backlog audit after those two closed found upsertMarketingPack still soft-falling-back while getMarketingPack / listMarketingPacksDue / Email pack read Convex-first — Generate pack could succeed locally and leave Growth/Complete fulfillment looking missing elsewhere (false packs-due debt + Email pack blocked). Operator-action fail-closed matches COMMERCE_CATALOG / LEAD_NOTES; same-month regenerate is idempotent replace. client-voice-pack-convex-primary left free for siblings; stripe-price-objects / lead-ingestion / marketing-content-scheduling / commerce-payouts-stripe-connect stay gated. Also noted claude/relaxed-galileo-9czsah's earlier cold-disposition feature body as a complementary duplicate to close once c5ed/111d lands.",
  },
  {
    date: "2026-07-13",
    decision:
      "upsertClientVoicePack accepts ConvexPrimaryWriteOptions; generateClientVoicePackAction passes CLIENT_VOICE_PACK_CONVEX_PRIMARY when Convex is configured — fail closed instead of SQLite-only success for Complete Generate voice. Queued lead-upsert-convex-primary as the next free sold-capability / multi-instance regression (upsertLead still soft-falls-back while getLeads reads Convex-first).",
    rationale:
      "PR #99 closed marketing-pack-convex-primary and left client-voice-pack-convex-primary as the Complete twin. upsertClientVoicePack still soft-fell-back while getClientVoicePackByLeadSlug / listClientVoicePacksDue / Email voice pack read Convex-first — Generate voice could succeed locally and leave Complete phone-script fulfillment looking missing elsewhere (false voice-packs-due debt + Email voice pack blocked). Operator-action fail-closed matches MARKETING_PACK / COMMERCE_CATALOG; regenerating replaces the one-row-per-lead pack. After both pack persists are fail-closed, the next free coded regression is upsertLead on create/import paths (CSV / Add lead) — not inventing optional aggregates while stripe-price-objects / lead-ingestion / marketing-content-scheduling / commerce-payouts-stripe-connect stay gated.",
  },
  {
    date: "2026-07-13",
    decision:
      "upsertLead accepts ConvexPrimaryWriteOptions; addLeadAction and importLeadsCsvAction pass LEAD_UPSERT_CONVEX_PRIMARY when Convex is configured — fail closed instead of SQLite-only success for CRM create/import. Queued lead-stage-convex-primary as the next free regression (dashboard updateLeadStageAction still soft-falls-back).",
    rationale:
      "Sibling prompt-process-evolution-1f28 (PR #100) shipped client-voice-pack-convex-primary and queued lead-upsert-convex-primary. Same-cron window: this branch pivoted off client-voice (earlier remote claim) and claimed lead-upsert. upsertLead still soft-fell-back while getLeads / getLeadBySlug / Work next / pipeline-health / digest read Convex-first — Add lead and CSV import could claim success after a SQLite-only write invisible elsewhere (empty CRM, false funnel, outreach blocked). Create-path-only scope: field updates keep their own requireConvex helpers; payment-stub organic checkout already uses recordLeadPayment / WEBHOOK_CONVEX_PRIMARY. Operator-action fail-closed matches MARKETING_PACK / CLIENT_VOICE_PACK. After create-path is fail-closed, the next free coded regression is updateLeadStageAction (Mark live already passes DEPLOY_HANDOFF_CONVEX_PRIMARY; the stage dropdown does not — and outreach_sent can desync soft stage vs fail-closed outreach mark). Stripe Prices / Places / Buffer OAuth / Connect stay gated.",
  },
  {
    date: "2026-07-13",
    decision:
      "updateLeadStageAction passes LEAD_STAGE_CONVEX_PRIMARY when Convex is configured — fail closed instead of SQLite-only success for dashboard stage moves. Mark live already fail-closes via DEPLOY_HANDOFF_CONVEX_PRIMARY on the same helper. With create-path upsert + stage dropdown both fail-closed, remaining NEXT_STEPS stay operator/legal-gated.",
    rationale:
      "Queued by PR #101 (lead-upsert-convex-primary). updateLeadStageAction still soft-fell-back while getLeads / pipeline-health / the stage funnel read Convex-first — and the outreach_sent path mixed a soft stage write with a fail-closed OUTREACH_CADENCE mark, so stage vs outreachStep could desync across instances. Operator-action fail-closed matches LEAD_NOTES / LEAD_UPSERT. After this ships, free coded requireConvex gaps on CRM writes are closed; prefer empty-backlog sold-capability / multi-instance regression audits over inventing optional aggregates while stripe-price-objects / lead-ingestion / marketing-content-scheduling / commerce-payouts-stripe-connect stay gated. Same-cron sibling prompt-process-evolution-d238 may claim a different free todo or fold helpers — keep both ITERATIONS.",
  },
  {
    date: "2026-07-13",
    decision:
      "After PR #102 (business-process-evolution-0b63) merged lead-stage-convex-primary first in the same-cron dual claim, fold complementary process from prompt-process-evolution-d238: queue bundle-price-env-readiness as the next free coded unlock (missing STRIPE_PRICE_ID_* still blocks every sale with no early operator signal) and prefer that concrete readiness helper over inventing optional aggregates.",
    rationale:
      "Both hourly automations claimed lead-stage-convex-primary in the same window; 0b63's earlier remote claim + PR #102 owns the feature body. Closing a pure duplicate would drop the concrete next free unlock (Price env readiness) that unblocks operator awareness of the sale-blocking gap without fake-completing stripe-price-objects. Keep both ITERATIONS; one merge PR for the fold.",
  },
  {
    date: "2026-07-13",
    decision:
      "assessBundlePriceEnvReadiness lists required STRIPE_PRICE_ID_* names from BUNDLES + COMMERCE_ADDON and reports missing/whitespace-only values; BundlePriceEnvBanner surfaces them on /dashboard and /dashboard/leads (plus launch-checklist). Env presence only — does not call Stripe, does not invent a pipeline-health card, and does not mark stripe-price-objects done.",
    rationale:
      "Queued by PR #103 fold after lead-stage closed the CRM requireConvex chain. Checkout already 501s per missing Price ID at session-create, but operators had no earlier dashboard signal that every sale was blocked. A pure readiness helper unblocks that awareness without fake-completing operator bootstrap (ALLOW_STRIPE_BOOTSTRAP + paste envSnippet). After this ships, free NEXT_STEPS are again only gated secrets/OAuth/counsel — prefer empty-backlog sold-capability / multi-instance regression audits over inventing optional aggregates.",
  },
  {
    date: "2026-07-13",
    decision:
      "Consolidated src/lib/digest/daily-digest.ts's local escapeHtml() into the shared escapeHtmlForEmail() (src/lib/inquiries/reply.ts) used by every other outbound HTML email.",
    rationale:
      "bundle-price-env-readiness was claimed by sibling business-process-evolution-3eea within the minute this run started (fresh claim, not stale) — AGENT_PROTOCOL directs picking a different free todo rather than duplicating. With NEXT_STEPS otherwise operator/legal-gated, AGENT_PROTOCOL's own empty-backlog guidance names escapeHtmlForEmail asymmetries as a valid audit target. The digest's private escaper matched escapeHtmlForEmail on &, <, >, \" but silently dropped the ' → &#39; escape, and every digest section (Work next, follow-ups, checkout/commerce recoveries, unreplied inquiries, marketing packs, Starter upsell, commerce catalogs, voice packs, commerce payouts) interpolated operator-facing but ultimately lead/customer-sourced businessName/tier/skuId/messagePreview text through it. Text-node HTML injection risk from an unescaped quote alone is low, but a second, drifting escaper implementation is exactly the class of asymmetry the protocol line warns about — one canonical escaper is safer than two that can silently diverge further. No behavior change for &/</>/\"; digest output now also escapes stray apostrophes consistently with every other outbound email.",
  },
  {
    date: "2026-07-13",
    decision:
      "Owed Commerce surfaces (pipeline-health, daily digest, Commerce payouts panel) and Mark paid out lookup must use listUnpaidCommerceOrders / getCommerceOrderByStripeSessionId — not listCommerceOrders()'s newest 200/500 page. Paid-out settlement still uses markCommerceOrderPaidOut; Connect remains operator/legal-gated.",
    rationale:
      "Sibling business-process-evolution-3eea claimed bundle-price-env-readiness first this cron (merged PR #104); claude/upbeat-dijkstra-y47f7i shipped digest escapeHtml consolidation (PR #105). Empty-backlog audit found listCommerceOrders caps undercount pass-through liability once Buy now volume exceeds the window, and Mark paid out scanned that truncated list so older unpaid rows could 404 as 'not found'. Dedicated unpaid + by-session reads close the sold Commerce reconciliation gap without inventing aggregates or fake-completing Connect.",
  },
  {
    date: "2026-07-13",
    decision:
      "No new code shipped this run — re-ran the empty-backlog regression audit (escapeHtmlForEmail asymmetry, Convex API map completeness, Commerce payouts panel data model) after PR #106 landed and found everything already correct; documented the findings instead of manufacturing an aggregate to justify a commit.",
    rationale:
      "A branch opened for this run (commerce-payouts-unpaid-ledger-completeness, cherry-picked from sibling cursor/prompt-process-evolution-63a8) turned out fully redundant once fetched — the sibling had already merged the identical fix directly as PR #106 while this run was verifying it, and main had folded further work (PR #105's digest escapeHtml fix) this run's branch lacked. Closed that PR without merging (see closed PR #107) and reset the designated branch to fresh main per the merged/superseded-branch restart rule. AGENT_PROTOCOL explicitly warns against inventing optional aggregates just to ship something when NEXT_STEPS is gated; a documented clean audit (plus the note that the payout panel's row.paidOutAt branch is a live optimistic-update path, not dead code) is more valuable to sibling agents than a low-value cosmetic change, and matches the precedent set by prior audit-only iterations (e.g. the createOrder/getByStripeSessionId dead-code review already recorded twice above).",
  },
  {
    date: "2026-07-13",
    decision:
      "Extracted the has_more/starting_after Stripe list-pagination loop into a shared src/lib/stripe/list-all-pages.ts helper (used by both src/lib/commerce/stripe-sync.ts and src/lib/pricing/bootstrap-stripe-prices.ts), and rewrote bootstrap-stripe-prices.ts to take its Stripe client behind a minimal structural interface (StripeProductsAndPricesForBootstrap) instead of importing the full `Stripe` SDK class for its parameter type — matching the pattern AGENT_PROTOCOL already mandates for testable Stripe-object-sync code.",
    rationale:
      "All prior remaining NEXT_STEPS stayed operator/legal-gated (stripe-price-objects, lead-ingestion, marketing-content-scheduling, commerce-payouts-stripe-connect), and a fresh empty-backlog audit re-confirmed escapeHtmlForEmail call sites, the Convex API map, and webhook idempotency were all already clean (three prior iterations had already covered those angles). bootstrap-stripe-prices.ts — the logic behind the gated Stripe Price bootstrap operator step, edited 4 times in the last 30 days — was the one payment-critical module with zero test coverage, and it duplicated (rather than reused) the exact pagination loop stripe-sync.ts already had fully covered, including the >100-active-Products regression class AGENT_PROTOCOL calls out by name. This is a coverage/consistency fix with no behavior change to the idempotency contract (same metadata-key lookup, same one-time-vs-recurring price matching, same envSnippet output) — verified via a fake-Stripe-client test suite covering create, idempotent reuse, stale/mismatched-price repricing, one-time-vs-recurring disambiguation, the full BUNDLES + COMMERCE_ADDON env var set, and the same past-page-1 pagination scenario stripe-sync.test.ts already exercises.",
  },
  {
    date: "2026-07-13",
    decision:
      "Refactored src/lib/billing/create-portal-session.ts to take the Stripe client as a parameter behind a new StripeBillingPortalClient minimal structural interface, moved `new Stripe(secretKey)` construction + the STRIPE_SECRET_KEY-missing gate to the two call sites (openBillingPortalAction, POST /api/stripe/billing-portal), and added an 18-test fake-client suite.",
    rationale:
      "With bootstrap-stripe-prices-test-coverage done (PR #109) every remaining coded NEXT_STEPS item stayed operator/legal-gated, so this iteration re-ran the standard empty-backlog audit (escapeHtmlForEmail, Convex API map, webhook idempotency, docs-vs-code accuracy) and found those angles still clean — already covered by four prior iterations. Diffing every src/lib/*.ts file against its .test.ts sibling turned up create-portal-session.ts: the orchestration behind both the operator 'Manage billing' button and the customer self-serve billing-portal route, powering every Growth/Complete/Commerce subscriber's ability to update a card or cancel — genuinely payment-critical, and the one Stripe-object module that had not yet adopted the minimal-structural-interface pattern AGENT_PROTOCOL already mandates (and that stripe-sync.ts / bootstrap-stripe-prices.ts already follow), so it stayed untestable without mocking the entire Stripe SDK class. No behavior change to either call site's status codes, error copy, or the STRIPE_SECRET_KEY gate — verified with npm test (399 passed, +18 new), lint, build, and a dev-server smoke check of the billing-portal route's 400/501 paths plus /dashboard/leads, /dashboard, /preview/demo-cafe, /docs/process all returning 200.",
  },
  {
    date: "2026-07-13",
    decision:
      "listMarketingPacksForMonth / listClientVoicePacks / listCommerceCatalogs are uncapped (.collect() on Convex with newest-first sort; SQLite without LIMIT). Debt helpers that treat absence-from-page as missing/unsynced must never feed from a newest-N slice. Queued unreplied-inquiry-list-completeness next (listClientInquiries(20/50/100) undercounts unreplied CRM health).",
    rationale:
      "Same newest-page undercount class as commerce-payouts-unpaid-ledger-completeness (PR #106): once Growth/Complete/Commerce fulfillment volume exceeds the old 100/200 window, pipeline-health and digest invent false Generate debt for already-fulfilled leads, and an unsynced Commerce catalog past the window looks fully synced so Buy now stays broken with no Sync due signal. Convex previously used unordered .take(limit) while SQLite used ORDER BY … LIMIT — both wrong for set-membership debt checks. Optional limit args stay on the signature for call-site compatibility but are ignored. Stripe Prices / Places / Buffer OAuth / Connect remain operator/legal-gated.",
  },
  {
    date: "2026-07-13",
    decision:
      "Bundle checkout.session.completed recovers missing buyer receipt + DNS handoff emails on Stripe redelivery via planBundleWebhookSideEffects and per-session deploy-handoff note markers — alreadyRecorded must not early-break past those emails. Marker writes after a successful send fail closed (bundle_email_sent_marker 5xx).",
    rationale:
      "Commerce Buy now already recovered missing inquiry/client receipt on redelivery (planCommerceWebhookSideEffects). The bundle path still early-broke on alreadyRecorded after idempotent payment + handoff, so a first delivery that crashed before Resend permanently lost Starter/Growth/Complete sold buyer emails (receipt + go-live DNS). Handoff notes are the durable sent-marker (already used for upsell audit trail); emails recover independently; send stays best-effort, marker write is required so retries can skip already-sent mail. Sibling prompt-process-evolution-4546 claimed fulfillment-debt-list-completeness in the same window — different surface. Stripe Prices / Places / Buffer OAuth / Connect stay gated.",
  },
  {
    date: "2026-07-13",
    decision:
      "listUnrepliedInquiries (status new+read, uncapped) now feeds pipeline-health unrepliedInquiryCount/oldestUnrepliedInquiryAgeHours and the daily digest unrepliedInquiries section on all three call sites (/dashboard, /dashboard/leads, sendDailyDigestAction) — none of them read from a capped listClientInquiries(N) page anymore for those metrics.",
    rationale:
      "Same newest-page undercount class as fulfillment-debt-list-completeness and commerce-payouts-unpaid-ledger-completeness: listClientInquiries(20/50/100) newest-first pages could drop an old unreplied inquiry once total inquiry volume (including replied/archived) exceeded the page size, silently hiding Starter CRM support debt from the operator. convex/inquiries.listUnreplied merges two by_status index scans (new, read) rather than a single .collect() over the whole table, keeping the Convex read scoped to the rows that matter instead of an unindexed full-table filter. /dashboard/leads still needs a separate capped listClientInquiries(50) fetch alongside the new uncapped one because that page also feeds the inbox UI (LeadsClient), which intentionally stays paginated — only the health/digest aggregates needed the uncapped fix.",
  },
  {
    date: "2026-07-13",
    decision:
      "Commerce Buy now webhook session dedup feeds planCommerceWebhookSideEffects from listCommerceCheckoutInquiriesBySlug (uncapped source=commerce_checkout only) — not listClientInquiriesBySlug's newest 50/200 page.",
    rationale:
      "Same newest-page truncation class as unpaid ledger / fulfillment-debt / unreplied health: once a lead accrues more than 50 contact/Request-order/Buy now inquiries, an older commerce_checkout inquiry embedding stripeSessionId falls off listClientInquiriesBySlug and Stripe redelivery falsely recovers (duplicate operator inbox + duplicate client order-notification email — sold Commerce promise). Dedicated commerce_checkout-only collect keeps the idempotency key visible without inventing aggregates. Sibling business-process-evolution-872f claimed resend-brand-name-html-escape in the same window — different surface. Stripe Prices / Places / Buffer OAuth / Connect stay gated.",
  },
  {
    date: "2026-07-13",
    decision:
      "Outbound HTML emails must escapeHtmlForEmail brand.name, brand.legalEntity, and brand.postalAddress — not only lead/customer-sourced fields like businessName. Subject lines and From display names remain plain text.",
    rationale:
      "NEXT_PUBLIC_BRAND_NAME / legal entity / postal address are env-sourced operator strings that routinely include apostrophes and ampersands. marketing/voice pack delivery and commerce client receipt already escaped brand.name; resend.ts signatures + the shared CAN-SPAM footer did not — the same asymmetry class as the PR #76 businessName escape, just on brand fields prior audits skipped. Escaping keeps outreach/receipt/upsell HTML well-formed when the operator sets a real brand name, without inventing optional aggregates while Stripe Prices / Places / Buffer OAuth / Connect stay gated.",
  },
  {
    date: "2026-07-13",
    decision:
      "src/lib/stripe/list-all-pages.ts gets its own Vitest suite — caller coverage in stripe-sync / bootstrap-stripe-prices is not enough for the shared pagination contract (multi-page walk, until early-stop, empty/has_more guards).",
    rationale:
      "AGENT_PROTOCOL after PR #115 named list-all-pages unit coverage as the next free empty-backlog target. The helper is the single choke point for >100-Product Stripe idempotency lookups; a silent regression in starting_after chaining or until-stop would recreate duplicate Products/Prices or missed orphans even if caller suites still pass on happy paths. Direct tests lock the contract for any future third list() caller without inventing optional aggregates. Sibling prompt-process-evolution-dd75 took unpaid-ledger truncation guards + unsubscribe escapeHtml in the same window — complementary surfaces.",
  },
  {
    date: "2026-07-13",
    decision:
      "pipeline-health + daily-digest must keep truncation-regression tests proving a newest-N commerce-orders page undercounts older unpaid Buy now liability while listUnpaidCommerceOrders (unpaid-only) does not — same boundary-guard shape unreplied-inquiry and fulfillment-debt already have.",
    rationale:
      "PR #106 fixed the call sites, but without health/digest guards a future agent can silently re-wire capped listCommerceOrders and the operator will undercount owed pass-through (double-pay risk). Sibling business-process-evolution-f726 owns list-all-pages-unit-coverage in the same window — different surface. Stripe Prices / Places / Buffer OAuth / Connect stay gated.",
  },
  {
    date: "2026-07-13",
    decision:
      "GET /api/unsubscribe success HTML must use shared escapeHtmlForEmail — never a private escapeHtml helper (&#039; vs &#39; drift).",
    rationale:
      "PR #105 closed the digest second-escaper; PR #115 closed brand.* in resend.ts. Unsubscribe was the remaining HTML surface with its own escaper. One canonical escaper keeps CAN-SPAM success pages consistent with every outbound email body. Do not invent optional aggregates while gated NEXT_STEPS remain.",
  },
  {
    date: "2026-07-13",
    decision:
      "src/lib/marketing/generators.ts (StubMarketingGenerator + AnthropicMarketingGenerator) gets its own Vitest suite — monthly-pack.test.ts stub smoke is not enough for the LLM fallback/parse/packageTier contract that ships Growth/Complete monthly packs.",
    rationale:
      "AGENT_PROTOCOL after PR #117 named generator/pack branch coverage as the next free empty-backlog target. AnthropicMarketingGenerator silently falls back to stub on blank key, HTTP errors, missing text, wrong variant count, or unparsable JSON — without direct tests those sold-capability branches can regress while eligibility/persist suites still pass. Direct coverage locks the contract; voice generators remain a sibling-friendly next surface (different module). Do not invent optional aggregates; do not fake-complete gated secrets/OAuth/counsel.",
  },
  {
    date: "2026-07-13",
    decision:
      "src/lib/voice/generators.ts (StubClientVoiceGenerator + AnthropicClientVoiceGenerator) gets its own Vitest suite — faq-pack.test.ts stub smoke is not enough for the LLM fallback/parse/title-fallback contract that ships Complete phone-script packs.",
    rationale:
      "Sibling business-process-evolution-7337 claimed marketing-anthropic-generator-unit-coverage in the same window; this branch took the voice twin. AnthropicClientVoiceGenerator silently falls back to stub on blank key, HTTP errors, missing text, wrong variant count, or unparsable JSON — without direct tests those sold Complete fulfillment branches can regress while eligibility/persist suites still pass. Direct coverage locks the contract. Do not invent optional aggregates; do not fake-complete gated secrets/OAuth/counsel.",
  },
  {
    date: "2026-07-13",
    decision:
      "src/lib/marketing/build-request.ts (businessContextFromLead + monthlyPackRequestForLead) gets its own Vitest suite — monthly-pack stub smoke is not enough for empty services/hours defaults, omitted optional fields, or growth vs complete packageTier/automationLevel (including explicit override) that feed Generate pack.",
    rationale:
      "AGENT_PROTOCOL after PR #118/#119 named build-request edge cases as the next free empty-backlog target. A silent regression to empty-services → [] (instead of [\"our services\"]) or wrong Complete automationLevel would ship thin/wrong Anthropic prompts while generator unit tests still pass. Direct coverage locks the request shape; voice-build-request remains sibling-friendly. Do not invent optional aggregates; do not fake-complete gated secrets/OAuth/counsel.",
  },
  {
    date: "2026-07-13",
    decision:
      "convex/orders.list sorts rows newest-first by createdAt at the Convex source; db.ts sortOrdersNewestFirst stays as belt-and-suspenders for Billing Portal latestEligibleOrder.",
    rationale:
      "billing-portal-orders-newest-first already sorted in listOrders after mapping Convex rows, but the Convex query itself still returned unordered .collect(). Sorting at the source closes the gap for any future direct consumer and prevents a one-line db.ts regression from reopening Manage-subscription against a stale order missing stripeCustomerId. Keeping both layers is intentional defense-in-depth, not duplication for its own sake. Stripe Prices / Places / Buffer OAuth / Connect stay gated.",
  },
  {
    date: "2026-07-13",
    decision:
      "src/lib/voice/build-request.ts (clientVoiceBusinessContextFromLead + clientVoicePackRequestForLead) gets its own Vitest suite — faq-pack.test.ts happy-path smoke is not enough for the empty services/hours/optional-field contract that shapes Complete phone-script packs.",
    rationale:
      "AGENT_PROTOCOL after PR #119 named build-request edge cases as the next free empty-backlog target. Sibling prompt-process-evolution-4792 claimed marketing-build-request + convex-orders-list-newest-first in the same window; this branch took the voice twin left free. Empty services must become ['our services'] and missing hours/state/phone/tagline must omit cleanly — without direct tests those sold Complete fulfillment branches can regress while generator/eligibility suites still pass. Direct coverage locks the contract. Do not invent optional aggregates; do not fake-complete gated secrets/OAuth/counsel.",
  },
  {
    date: "2026-07-13",
    decision:
      "src/lib/seo.ts (siteUrl / previewUrl / leadMetaTitle / leadMetaDescription / leadLocalBusinessJsonLd) gets its own Vitest suite — it backed the Starter-sold 'Basic SEO' promise with zero direct tests before this iteration.",
    rationale:
      "This branch's original claim (marketing-voice-build-request-unit-coverage) turned out to already be shipped by a sibling that merged first — the correct move per AGENT_PROTOCOL's same-minute dual-claim rule was to drop the duplicate and re-scan, not ship a second implementation. siteUrl()'s three-way env precedence (NEXT_PUBLIC_APP_URL > VERCEL_URL > localhost) determines every canonical URL, OG tag, and JSON-LD url in production; an untested regression there (e.g. losing the trailing-slash strip, or NEXT_PUBLIC_APP_URL silently losing precedence) would misconfigure SEO for every live client site with no test catching it. Do not invent optional aggregates; do not fake-complete gated secrets/OAuth/counsel.",
  },
  {
    date: "2026-07-13",
    decision:
      "/preview/[slug] JSON-LD is now serialized via safeJsonLdScript (escapes '<' to \\u003c), never a raw JSON.stringify inside dangerouslySetInnerHTML.",
    rationale:
      "With the free NEXT_STEPS backlog fully gated (secrets/OAuth/counsel), a security-focused empty-backlog audit checked every dangerouslySetInnerHTML sink in the codebase (there is exactly one) rather than re-running the already-repeated email-HTML escaping / requireConvex / truncation sweeps. Lead fields feeding the JSON-LD block (businessName, description, address, city, state) are free text from CSV import today and a future Places scrape per lead-ingestion — untrusted input reaching an unauthenticated public page. A value containing the literal '</script>' would close the JSON-LD script element early and let attacker HTML/script execute for every real visitor of that lead's preview site — a stored XSS with real reputational and legal exposure for a business selling trust to local business owners. escapeHtmlForEmail was deliberately not reused: it HTML-entity-escapes for email bodies, not JS/script-tag content. Sibling seo-helpers-unit-coverage tested leadLocalBusinessJsonLd's shape but never exercised the dangerouslySetInnerHTML sink, so it did not catch this — test coverage of a data shape is not the same as coverage of every render sink that consumes it.",
  },
  {
    date: "2026-07-13",
    decision:
      "src/app/api/stripe/webhook/route.ts (checkout.session.completed orchestration — bundle payment/handoff and Commerce Buy now ledger, both with redelivery recovery) gets its own route-level Vitest suite, mocking only the Stripe SDK, @/lib/db, and @/lib/email/resend — the pure decision helpers it calls (planBundleWebhookSideEffects, planCommerceWebhookSideEffects, commerceOrderPaidInquiryMessage) run for real so the test exercises actual orchestration, not a restatement of its own mocks.",
    rationale:
      "A fresh empty-backlog audit (Convex/SQLite table parity, static Convex API map registration, webhook side-effect idempotency, HTML/script injection sinks, capped-list truncation feeding an eligibility/idempotency check) found every previously-shipped guard still holding and no new bug — the systematic fix series across ~20 prior iterations (PRs #104-#122) has genuinely closed this class of gap. Rather than force another speculative bug hunt or add a 21st optional aggregate, this iteration shipped coverage on the highest money-criticality file in the repo that had none: every other module the webhook calls into (bundle-side-effect-recovery.ts, commerce/side-effect-recovery.ts) was unit-tested in isolation, but the route itself — the exact ordering of ledger-write-before-email, which failure returns 5xx vs. stays best-effort, and the branch split between commerce_sku and bundle sessions — was never exercised end-to-end. That orchestration is exactly where the fix series' own past regressions lived (missing kind discriminator, alreadyRecorded early-breaking past recoverable emails, marker-write failures needing to force a Stripe retry) — untested orchestration is where the next one would hide. Do not invent optional aggregates; do not fake-complete gated secrets/OAuth/counsel.",
  },
  {
    date: "2026-07-13",
    decision:
      "src/app/api/stripe/checkout/route.ts (bundle Checkout Session create — Starter/Growth/Complete + Commerce add-on) gets its own route-level Vitest suite, mocking only the Stripe SDK and @/lib/db — organic slug resolution and CHECKOUT_SESSION_CREATE_CONVEX_PRIMARY stay real so the test exercises create-path orchestration, not a restatement of mocks.",
    rationale:
      "After PR #124 covered webhook fulfillment orchestration, the create-side twin that starts every sale still had zero direct route tests — helpers organic-attribution + session-persist were covered in isolation, but Price-env 501s, payment vs subscription mode, Commerce add-on line items, organic-* mint + cancel URL attribution, and fail-closed 502 on tracking failure (ConvexPrimaryWriteError or otherwise) live only in the route. Untested create-path orchestration is the same class of gap the webhook suite just closed on the fulfill side. Sibling prompt-process-evolution-7d1d dual-claimed ~55s later (claim-only); earlier remote claim owns per AGENT_PROTOCOL — commerce-checkout-route-test-coverage stays free for them. Do not invent optional aggregates; do not fake-complete gated secrets/OAuth/counsel.",
  },
  {
    date: "2026-07-13",
    decision:
      "src/app/api/commerce/checkout/route.ts (Commerce Buy now Checkout Session create) gets its own route-level Vitest suite, mocking only the Stripe SDK and @/lib/db — catalog lookup + CHECKOUT_SESSION_CREATE_CONVEX_PRIMARY stay real so the test exercises create-path orchestration, including the server-resolved price invariant (client-submitted price/stripePriceId must never reach Stripe).",
    rationale:
      "Same-minute dual claim with business-process-evolution-f32f on stripe-checkout-route-test-coverage: earlier remote claim owned the bundle route, so this branch pivoted to the Commerce Buy now twin. Buy now is the Commerce sold-capability money path — a regression that trusts a client price undercharges the local business, and a SQLite-only tracking write after handing out a Stripe URL permanently drops abandoned Buy now recovery on other instances. Helper suites do not cover those route invariants. Folded sibling stripe-checkout ITERATION into this PR so both create-side suites land together. Do not invent optional aggregates; do not fake-complete gated secrets/OAuth/counsel.",
  },
  {
    date: "2026-07-13",
    decision:
      "src/app/api/stripe/billing-portal/route.ts (customer self-serve Billing Portal from /checkout/success) gets its own route-level Vitest suite, mocking only the Stripe SDK and @/lib/db (server-only guard) — createBillingPortalForCheckoutSession stays real so the test exercises the route's own body parsing, STRIPE_SECRET_KEY gating, and returnUrl derivation, not a restatement of the already-covered helper.",
    rationale:
      "PRs #125/#126 closed the create-side (stripe/checkout, commerce/checkout) and fulfillment-side (stripe/webhook) route-orchestration gaps; the third Stripe-facing route, billing-portal, was the last one still relying entirely on its extracted helper's unit tests. The route itself derives returnUrl three different ways (explicit body value, NEXT_PUBLIC_APP_URL, request origin) and gates on STRIPE_SECRET_KEY before ever calling the helper — untested route glue in the same class of gap the other three suites just closed. Free NEXT_STEPS stay fully gated (stripe-price-objects / lead-ingestion / marketing-content-scheduling / commerce-payouts-stripe-connect); do not invent optional aggregates; do not fake-complete secrets/OAuth/counsel-gated work. Later dual-claim on business-process-evolution-df21 pivoted to marketing-generate-route-test-coverage per AGENT_PROTOCOL.",
  },
  {
    date: "2026-07-13",
    decision:
      "src/app/api/marketing/generate/route.ts (operator-authenticated ad-hoc marketing generation) gets its own route-level Vitest suite — mock requireOperatorAuth + the marketing generator so the test locks auth 401, JSON/contentTypes/automationLevel/business validation, and stub-vs-LLM response messaging that generators.test.ts does not cover.",
    rationale:
      "billing-portal was already owned by claude/relaxed-galileo-gks8ei (PR #127 feature body) and bootstrap-prices by prompt-process-evolution-aaf5 when this branch dual-claimed billing-portal later — AGENT_PROTOCOL requires an immediate pivot. POST /api/marketing/generate is the last untested API route besides bootstrap-prices: operator auth gate, content-type allowlist, automationLevel enum, and BusinessContext shape all live only in the route. generators.test.ts covers Stub/Anthropic paths in isolation, not those gates. Prefer generateMarketingPackAction for persisted Growth/Complete packs; this route remains the ad-hoc operator path and still needs coverage. Do not invent optional aggregates; do not fake-complete gated secrets/OAuth/counsel.",
  },
  {
    date: "2026-07-13",
    decision:
      "src/app/api/stripe/bootstrap-prices/route.ts (operator Price bootstrap that unlocks every sale) gets its own route-level Vitest suite — mock bootstrapStripePrices + the Stripe constructor so the test locks ALLOW_STRIPE_BOOTSTRAP=1 gating (403), missing STRIPE_SECRET_KEY (501), ok+results+envSnippet success shape, and 502 on Error/non-Error throws, not a restatement of the already-covered helper.",
    rationale:
      "Sibling PR #127 closed billing-portal and PR #128 closed marketing-generate in the same hour; this branch kept the bootstrap-prices claim those siblings explicitly left free. The route is the only path that returns the envSnippet operators paste into secrets — a regression that skips the ALLOW_STRIPE_BOOTSTRAP opt-in or returns 200 without envSnippet would either leave bootstrap always-on in production or block every sale after a 'successful' bootstrap. Lib helper suites do not cover that glue. Do not invent optional aggregates; do not fake-complete gated secrets/OAuth/counsel.",
  },
  {
    date: "2026-07-13",
    decision:
      "src/lib/pricing/bundles.ts (Starter/Growth/Complete + Commerce add-on display USD amounts and Stripe Price env var names) gets its own Vitest suite — price-env-readiness and bootstrap-stripe-prices import the constants but do not lock sold prices or getBundle lookup.",
    rationale:
      "Free NEXT_STEPS backlog stayed fully gated after PR #129. bundles.ts is the source of truth for checkout UI, tier upsell cards, bootstrap Product amounts, and readiness env names — a silent drift (e.g. Growth monthly 99→149 while Stripe Price stays at the old amount, or renaming STRIPE_PRICE_ID_* without updating readiness) would misprice the storefront or break every sale without failing existing suites. Direct coverage is the cheapest sold-capability regression lock while Places / Buffer OAuth / Connect / Price bootstrap stay operator-gated. Sibling can take brand-helpers / demo-catalog / category-themes coverage. Do not invent optional aggregates; do not fake-complete gated secrets/OAuth/counsel.",
  },
  {
    date: "2026-07-13",
    decision:
      "src/lib/brand.ts (two-layer CAN-SPAM branding) reads every brand env via getters with trim + whitespace-only-as-unset, and gets direct Vitest coverage for name/legalEntity/legalLocation/postalAddress/dba/support/emailFrom precedence plus marketingFooterLine / legalEntityLine / outreachSenderLine — including the deprecated company re-export mirror.",
    rationale:
      "After PR #129 closed the last Stripe-facing route gap, free NEXT_STEPS stayed fully gated. brand.ts feeds every outbound email footer and Stripe seller identity but had zero direct tests and evaluated env only at module load — whitespace-only LEGAL_ENTITY/ADDRESS would silently stick as a blank-looking seller identity, and Vitest could not flip env between cases. Getters + trim match price-env-readiness; company.ts mirrors via getters so the migration shim stays live. Sibling prompt-process-evolution-35a5 claimed pricing-bundles in the same window (PR #130). Do not invent optional aggregates; do not fake-complete gated secrets/OAuth/counsel.",
  },
  {
    date: "2026-07-13",
    decision:
      "src/lib/leads/demo-catalog.ts (DEMO_LEADS + resolvePreviewLead + countLeadsByStage) gets its own Vitest suite locking stable demo slugs, category/tier alignment, keyword inference (restaurant/salon/trades/generic, case-insensitive), title-case businessName, and stage counts — the /preview/[slug] fallback path for not-yet-persisted slugs.",
    rationale:
      "Free NEXT_STEPS backlog stayed fully gated after PR #131 (brand-helpers + pricing-bundles). resolvePreviewLead chooses which category template and tier upsell card an operator sees when sanity-checking a slug before persistence — a silent drift (e.g. trades keyword → growth instead of starter, or bakery no longer matching restaurant) would mis-sell Starter vs Growth vs Complete on the preview itself with no existing suite catching it. Direct coverage is the cheapest sold-capability regression lock while Places / Buffer OAuth / Connect / Price bootstrap stay operator-gated. Sibling can take category-themes-unit-coverage. Do not invent optional aggregates; do not fake-complete gated secrets/OAuth/counsel.",
  },
  {
    date: "2026-07-13",
    decision:
      "src/lib/previews/themes.ts (CATEGORY_THEMES + getCategoryTheme) gets its own Vitest suite locking restaurant/salon/trades/generic labels, hero eyebrows, accent/CTA classes, and distinct full-bleed gradient shells — the Starter category-template atmosphere source of truth consumed by category-preview.tsx.",
    rationale:
      "After PR #131 and the demo-catalog twin claim in the same cron window, free NEXT_STEPS stayed fully gated. themes.ts chooses the sold preview shell atmosphere per BusinessCategory; a silent drift (shared shell classes across categories, flat single-color backgrounds, or swapped labels/eyebrows) would ship mismatched Starter previews with no suite failing. Direct coverage pairs with demo-catalog's keyword→category lock so inference and rendering cannot diverge unnoticed. Prefer this over inventing optional aggregates while Places / Buffer OAuth / Connect / Price bootstrap stay operator-gated.",
  },
  {
    date: "2026-07-13",
    decision:
      "When ALLOW_STRIPE_BOOTSTRAP=1, the checkout-blocked banner on /dashboard and /dashboard/leads offers an operator-auth'd Run bootstrap button (bootstrapStripePricesAction) that returns a copyable envSnippet — shared assessStripeBootstrapGate with POST /api/stripe/bootstrap-prices. Paste secrets + unset the flag remain required; the button does not auto-write env or fake-complete stripe-price-objects.",
    rationale:
      "After PR #133 closed preview foundation unit coverage, free NEXT_STEPS stayed fully gated (Prices / Places / Buffer OAuth / Connect). The #1 sale blocker is missing STRIPE_PRICE_ID_* secrets; the prior path required curling the bootstrap API. Putting Run bootstrap on the same banner that lists missing env names removes curl friction for the operator launch path without inventing optional aggregates or claiming the gated todo done. Prefer this operator-visible revenue unlock over another pure-logic test sweep when the remaining backlog is secrets/OAuth/counsel only.",
  },
  {
    date: "2026-07-13",
    decision:
      "POST /api/contact/[slug] gets full route-orchestration Vitest (CONTACT_FORM_CONVEX_PRIMARY pass-through, persist-required 503, notify-only-after-persist, validation, form-urlencoded) beyond the prior HTML-escape-only suite and contact-persist helper tests — locks the Starter sold contact form + durable CRM trail.",
    rationale:
      "Free NEXT_STEPS stayed fully gated after PR #133. Sibling business-process-evolution-a606 claimed stripe-bootstrap-dashboard-action (operator Price bootstrap UX — highest revenue unlock while Prices stay gated). Parallel empty-backlog: the contact route's multi-instance fail-closed contract lived only in contact-persist.test.ts + one HTML-escape route test, so a future soft-fallback or notify-before-persist regression would not fail Vitest. Route orchestration coverage mirrors preview-open / Stripe route suites. Leave unsubscribe-route-orchestration-test-coverage free for a sibling. Do not invent optional aggregates; do not fake-complete gated secrets/OAuth/counsel.",
  },
  {
    date: "2026-07-13",
    decision:
      "GET /api/unsubscribe gets full route-orchestration Vitest (missing/empty-email 400, UNSUBSCRIBE_CONVEX_PRIMARY pass-through, fail-closed 500-with-retry-message on ConvexPrimaryWriteError vs a distinct generic 500 on any other error) beyond the prior HTML-escape-only suite — the CAN-SPAM suppress twin of contact-form-route-orchestration-test-coverage.",
    rationale:
      "cursor/prompt-process-evolution-cb7f had finished contact-form-route-orchestration-test-coverage and folded stripe-bootstrap-dashboard-action into its own branch, but only its claim-only process-log commits reached main via PR #134 — the feature branch itself was never merged, leaving the NEXT_STEPS entry marked done with no coverage behind it. Folded cb7f's actual feature commits into main first (same content, now a real merge), then picked up the sibling-friendly twin it had explicitly left free. The unsubscribe route's fail-closed CAN-SPAM contract (UNSUBSCRIBE_CONVEX_PRIMARY) had the same coverage gap contact-form had before this run: a future soft-fallback or a swapped error-branch could silently re-enable double-sends to unsubscribed recipients with no test catching it.",
  },
  {
    date: "2026-07-13",
    decision:
      "GET /api/unsubscribe now requires a per-recipient HMAC token (signUnsubscribeToken / verifyUnsubscribeToken, src/lib/email/unsubscribe-token.ts, keyed on RESEND_API_KEY with a fixed dev-only fallback) bound to the email address before suppressEmail runs — an unsigned or mismatched token returns 400 without touching the suppression store.",
    rationale:
      "Empty-backlog security audit while free NEXT_STEPS stayed fully gated (stripe-price-objects / lead-ingestion / marketing-content-scheduling / commerce-payouts-stripe-connect). The unsubscribe route had zero authorization: GET /api/unsubscribe?email=X suppressed X for anyone who merely knew the address — no signature, no rate limit, not even format validation. isEmailSuppressed gates every sendEmail() call (outreach Email 1-3, receipts, marketing/voice pack delivery, Commerce receipts, Starter upsell, the post-payment DNS handoff instructions), so a scraper iterating known/guessed business emails (the same public-listing sources the platform's own CSV import targets) could permanently and silently block outreach, receipts, or DNS setup instructions for any address, including a paying customer's — a live authorization bug with concrete revenue/deliverability/support risk, not test-coverage padding. Landed the same cron window as the route-orchestration suite above (different concern — persistence/error-path branches vs authorization); folded into one route.test.ts, every test signing a real token so the pre-existing assertions still exercise their intended branches. Chose RESEND_API_KEY as the signing key over introducing a new required secret: it is already the production dependency for a real send to ever reach a recipient, so no new operator setup step is needed and the dev/demo fallback only ever has to protect a link nobody actually receives (sendEmail mock-logs instead of sending when RESEND_API_KEY is unset). Do not invent optional aggregates; do not fake-complete gated secrets/OAuth/counsel.",
  },
  {
    date: "2026-07-13",
    decision:
      "Added a small in-memory, per-instance rate limiter (src/lib/security/rate-limit.ts) to the four public write endpoints with no prior throttling — POST /api/contact/[slug], POST /api/stripe/checkout, POST /api/commerce/checkout, POST /api/preview/[slug]/open — keyed on route name + client IP (from x-forwarded-for/x-real-ip, or a shared fallback bucket when neither header is present), default 20 requests/60s, returning 429 with a Retry-After header once exceeded.",
    rationale:
      "unsubscribe-token-signing (PR #137) closed an authorization gap but explicitly flagged, as the next audit angle, that no public write endpoint had any rate limiting at all — a scripted burst against the contact form, either Checkout-create route, or the preview-open beacon was previously unbounded on a single instance. Free NEXT_STEPS stayed fully gated (stripe-price-objects / lead-ingestion / marketing-content-scheduling / commerce-payouts-stripe-connect), so this followed the protocol's documented fallback: another sold-capability / multi-instance-adjacent gap rather than inventing an optional aggregate. Chose a pure in-memory fixed-window counter over adding Upstash/Redis: AGENTS.md defaults to TS/TSX without new stack pieces absent strong justification, and a single new dependency is not justified to blunt unsophisticated scripted abuse. This is deliberately NOT a distributed limiter — each serverless/Node instance keeps its own independent counter (a client spread across N instances gets up to N times the nominal allowance), state resets on redeploy, and the IP key is only as trustworthy as the upstream proxy that sets x-forwarded-for; documented all three limits directly in the module's doc comment rather than presenting this as airtight. If real multi-instance abuse shows up in practice, the fix is a shared store keyed the same way (route name + IP), not a second, incompatible scheme. Limit chosen generous enough (20/min) that no legitimate visitor retry pattern trips it, but existing route test suites for stripe/checkout and commerce/checkout call the route handler ~12-15 times per file from the same synthetic (headerless) IP with no per-test module reset — exported resetRateLimiterForTests() and call it in those two files' beforeEach so route tests stay independent of limiter tuning.",
  },
  {
    date: "2026-07-13",
    decision:
      "GET /api/unsubscribe now rate-limits by client IP via the shared checkRateLimit helper (key `unsubscribe:${clientIp}`, default 20/60s) BEFORE token verification, returning 429 + Retry-After on exceed — completing the public-write throttle set (four POSTs from PR #138 + this CAN-SPAM GET).",
    rationale:
      "PR #138 deliberately scoped rate limiting to four POST routes and left unsubscribe out. Token signing (PR #137) already blocks forged suppressions, but a harvested email-footer link (plaintext in every outbound message) or a script hammering garbage email+token pairs could still unboundedly run HMAC verification and, on a valid token, mutate the global suppression list that gates every automated send (outreach, receipts, marketing/voice packs, Commerce receipts, Starter upsell, DNS handoff). Free NEXT_STEPS stayed fully gated, so this follows the empty-backlog security/sold-capability fallback rather than inventing an optional aggregate. Checking the limiter before token verify also saves HMAC work on abusive traffic. Reuses the existing per-instance helper (no Redis/Upstash) for consistency with the four POST routes; the same multi-instance caveats apply and stay documented on rate-limit.ts. Same-window sibling e756 shipped stripe-core-env-readiness. Do not fake-complete stripe-price-objects / lead-ingestion / marketing-content-scheduling / commerce-payouts-stripe-connect.",
  },
  {
    date: "2026-07-13",
    decision:
      "Dashboard shows an amber StripeCoreEnvBanner (assessStripeCoreEnvReadiness) when STRIPE_SECRET_KEY / NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY / STRIPE_WEBHOOK_SECRET are missing or whitespace-only — distinct from the rose BundlePriceEnvBanner for STRIPE_PRICE_ID_*.",
    rationale:
      "Empty-backlog after PR #138: Price-ID readiness already shipped, but operators still had no early signal for the secrets that actually gate checkout create (STRIPE_SECRET_KEY → 501) and fulfillment (STRIPE_WEBHOOK_SECRET → webhook 501 while Stripe can still charge — silent CRM/handoff failure). Sibling prompt-process-evolution-6d42 claimed unsubscribe-get-rate-limiting in the same window; this branch took the complementary operator-visible revenue unlock. Env presence only — does not validate key format, does not call Stripe, and does not fake-complete stripe-price-objects. Launch-checklist / architecture / roadmap document both banners.",
  },
  {
    date: "2026-07-13",
    decision:
      "src/proxy.ts gets its own Vitest orchestration suite (src/proxy.test.ts) locking dashboard auth gate + Starter preview-subdomain rewrite + custom-domain rewrite ordering — helper suites alone are not enough for the sold Host→preview contracts.",
    rationale:
      "Free NEXT_STEPS stayed fully gated after PR #140 (stripe-core-env + unsubscribe-get). custom-domain-routing.test.ts and operator.test.ts cover pure helpers, but not the proxy orchestrator: preview subdomain must run before isPlatformHost, unrecognized subdomain labels must next() (never demo-catalog fallthrough), custom-domain DB lookup must skip platform hosts, and /api/* + /dashboard/* must never Host-divert. A silent reorder or fallthrough would break Starter 'Preview subdomain → custom domain handoff' or divert authenticated/API traffic. Prefer this sold-capability regression lock over inventing optional aggregates while Prices / Places / Buffer OAuth / Connect stay gated. Same-window sibling efe4 shipped resend-email-env-readiness.",
  },
  {
    date: "2026-07-13",
    decision:
      "Dashboard shows a sky ResendEnvBanner (assessResendEmailEnvReadiness) when RESEND_API_KEY is missing, whitespace-only, or a documented placeholder (re_placeholder* / re_...) — matching sendEmail's silent mock gate.",
    rationale:
      "Empty-backlog after PR #140: Stripe core + Price-ID banners already cover payment secrets, but operators still discovered a missing Resend key only after clicking send (mock log looks like success). Every conversion email (outreach 1–3, receipts, abandoned-cart recovery, pack delivery, Starter upsell, digest) funnels through sendEmail — silent mock mode blocks top-of-funnel growth while looking healthy. Sibling business-process-evolution-cbbe claimed proxy-routing-test-coverage; this branch took the complementary operator-visible outreach unlock. Env presence / placeholder detection only — does not call Resend. Do not fake-complete gated NEXT_STEPS.",
  },
  {
    date: "2026-07-13",
    decision:
      "bootstrapStripePricesAction (src/app/dashboard/actions.ts) gets its own Vitest suite — mock requireOperatorAuth + bootstrapStripePrices + Stripe ctor so the banner Run bootstrap path locks auth rejection, ALLOW_STRIPE_BOOTSTRAP / STRIPE_SECRET_KEY gate failures, success results+envSnippet+next, and Error/non-Error Stripe throws, not a restatement of bootstrap-gate or the API route suite.",
    rationale:
      "Free NEXT_STEPS stayed fully gated after PR #141 (resend-email-env-readiness + proxy-routing-test-coverage). The #1 sale unblocker operators click is the dashboard action, not the curl twin — a regression that skips auth, ignores the opt-in gate, or returns success without envSnippet would either leave bootstrap always-on behind a password wall or block every sale after a 'successful' banner click. Gate + route suites do not cover that glue. Same-window sibling business-process-evolution-3a4a pivoted to checkout-recovery-actions-orchestration-test-coverage. Do not invent optional aggregates; do not fake-complete gated secrets/OAuth/counsel.",
  },
  {
    date: "2026-07-13",
    decision:
      "Abandoned-checkout recovery dashboard actions (sendCheckoutRecoveryAction + sendCommerceCheckoutRecoveryAction) get their own Vitest orchestration suite — helper suites alone do not lock auth, kind mismatch, missing email, persist-then-notify, or ConvexPrimaryWriteError skip-send.",
    rationale:
      "Empty-backlog after PR #141. Same-minute dual claim: prompt-process-evolution-29a6 owned stripe-bootstrap-dashboard-action-test-coverage (~11s earlier) and left checkout-recovery-actions-orchestration-test-coverage free. session-persist.test.ts and abandoned-recovery.test.ts cover Convex-primary constants and due-queue math, but a future soft-fallback / send-before-mark / wrong-kind recovery regression would not fail Vitest without action glue coverage. Finish-checkout and Buy now recovery are direct revenue unlocks (stuck carts); locking mark-before-Resend prevents duplicate nudges (CAN-SPAM / reputation). Prefer this over inventing optional aggregates while Prices / Places / Buffer OAuth / Connect stay gated. Queued anthropic-env-readiness for a later sibling.",
  },
  {
    date: "2026-07-13",
    decision:
      "Dashboard shows a teal AnthropicEnvBanner (assessAnthropicEnvReadiness) when ANTHROPIC_API_KEY is missing, whitespace-only, or a documented placeholder (sk-ant-... / sk-ant-placeholder*) — matching Stub* factory gates in marketing/voice generators.",
    rationale:
      "Empty-backlog after PR #143 (checkout-recovery + bootstrap-action Vitest). Stripe + Resend banners already cover payment and outreach secrets, but Growth/Complete Generate pack and Complete Generate voice still silently produce Stub* template copy when ANTHROPIC_API_KEY is unset — operators can fulfill paid clients with non-AI quality and no early signal. Env presence / placeholder detection only — does not call Anthropic, does not fake-complete Buffer/GBP OAuth or other gated NEXT_STEPS. Queued generate-marketing-pack-action-test-coverage + generate-client-voice-pack-action-test-coverage as sibling-friendly action Vitest twins.",
  },
  {
    date: "2026-07-13",
    decision:
      "Ship action-level Vitest for generateMarketingPackAction (Growth/Complete Generate pack) before inventing more readiness banners or optional aggregates — generators/monthly-pack/route suites do not lock auth, eligibility, MARKETING_PACK_CONVEX_PRIMARY persist, or ConvexPrimaryWriteError fail-closed. Leave generate-client-voice-pack-action-test-coverage free for a sibling in the same cron window. Fold sibling anthropic-env-readiness (849c) rather than duplicating the banner. Stripe Prices / Places / Buffer OAuth / Connect stay gated.",
    rationale:
      "Generate pack is the sold Growth/Complete fulfillment button operators click after Anthropic readiness is green. A future soft-fallback / wrong-eligibility / missing requireConvex regression would not fail Vitest without action glue coverage — the same class of gap checkout-recovery-actions and bootstrapStripePricesAction suites already closed. Prefer locking that path over inventing OPERATOR_DIGEST_EMAIL banners or optional aggregates while remaining NEXT_STEPS stay secrets/OAuth/counsel-gated.",
  },
  {
    date: "2026-07-13",
    decision:
      "Ship action-level Vitest for generateClientVoicePackAction (Complete Generate voice) as the twin of generate-marketing-pack-action-test-coverage — generators/faq-pack/build-request suites do not lock auth, Complete-only eligibility, CLIENT_VOICE_PACK_CONVEX_PRIMARY persist, stub-vs-anthropic labeling, or ConvexPrimaryWriteError fail-closed. Leave operator-digest-email-env-readiness free for a sibling. Stripe Prices / Places / Buffer OAuth / Connect stay gated.",
    rationale:
      "Generate voice is the sold Complete phone-script fulfillment button operators click after Anthropic readiness is green. A future soft-fallback / Growth-tier false-positive / missing requireConvex regression would not fail Vitest without action glue coverage — the same class of gap Generate pack / checkout-recovery / bootstrap action suites already closed. Prefer locking that path over inventing OPERATOR_DIGEST_EMAIL banners or optional aggregates while remaining NEXT_STEPS stay secrets/OAuth/counsel-gated.",
  },
  {
    date: "2026-07-13",
    decision:
      "Dashboard shows an emerald OperatorDigestEmailEnvBanner (assessOperatorDigestEmailEnvReadiness) when OPERATOR_DIGEST_EMAIL is missing, whitespace-only, or a documented placeholder (you@example.com / *@example.com|org) — matching sendDailyDigestAction's trim gate.",
    rationale:
      "Empty-backlog after PR #146 (Generate voice action Vitest). Stripe / Resend / Anthropic banners already cover payment, outbound transport, and AI pack quality, but Send daily digest still only surfaced a missing destination on click — operators could miss Work next / follow-ups / abandoned carts / unreplied inquiries / packs due / Commerce payouts owed until they pressed the button. Env presence / placeholder detection only — does not call Resend, does not fake-complete gated secrets. Queued send-daily-digest-action-test-coverage as the sibling-friendly action Vitest twin.",
  },
  {
    date: "2026-07-13",
    decision:
      "Ship action-level Vitest for sendDailyDigestAction (Send daily digest) before inventing more readiness banners or optional aggregates — daily-digest.test.ts covers the pure builder but does not lock requireOperatorAuth, OPERATOR_DIGEST_EMAIL trim gate, uncapped listUnrepliedInquiries / listUnpaidCommerceOrders / listMarketingPacksForMonth wiring, NEXT_PUBLIC_APP_URL dashboard links, or sendOperatorDailyDigest success/mock/failure. Leave mark-commerce-order-paid-out-action-test-coverage to sibling d407 and Email pack/voice action Vitest twins free. Stripe Prices / Places / Buffer OAuth / Connect stay gated.",
    rationale:
      "Send daily digest is the operator path that surfaces every pipeline-health urgency without opening /dashboard/leads. A future re-wire to capped listClientInquiries / listCommerceOrders, a skipped auth check, or a silent empty destination would not fail Vitest without action glue coverage — the same class of gap Generate pack/voice, checkout-recovery, and bootstrap action suites already closed. Prefer locking that path over inventing optional aggregates while remaining NEXT_STEPS stay secrets/OAuth/counsel-gated.",
  },
  {
    date: "2026-07-13",
    decision:
      "Ship action-level Vitest for markCommerceOrderPaidOutAction (Commerce Mark paid out) when send-daily-digest-action-test-coverage is claimed by a sibling — paid-out-persist / orders helper suites do not lock auth, already-paid-out, COMMERCE_PAID_OUT_CONVEX_PRIMARY persist, or ConvexPrimaryWriteError fail-closed. Leave Email pack / Email voice pack action Vitest free for siblings. Stripe Prices / Places / Buffer OAuth / Connect stay gated.",
    rationale:
      "Mark paid out is the operator control that drops pass-through Buy now liability from panel/health/digest until Stripe Connect ships. A future soft-fallback / missing already-paid guard / skipped requireConvex regression would not fail Vitest without action glue coverage — the same class of gap Generate pack/voice and checkout-recovery action suites already closed — and would reopen Commerce double-pay risk across multi-instance Convex-first reads. Prefer locking that money path over inventing optional aggregates while remaining NEXT_STEPS stay secrets/OAuth/counsel-gated.",
  },
  {
    date: "2026-07-13",
    decision:
      "Ship action-level Vitest for sendMarketingPackToClientAction (Growth/Complete Email pack) before inventing optional aggregates — deliver-pack helpers alone do not lock auth, paid/live+email eligibility, current-month pack gate, suppression / Resend failure paths, or NEXT_PUBLIC_APP_URL preview URL wiring. Leave send-client-voice-pack-to-client-action-test-coverage free for a sibling. Stripe Prices / Places / Buffer OAuth / Connect stay gated.",
    rationale:
      "Email pack is the sold Growth/Complete handoff button operators click after Generate pack — without Buffer/GBP OAuth. A future soft eligibility / missing pack auto-send / skipped suppression / wrong preview host regression would not fail Vitest without action glue coverage — the same class of gap Generate pack, Send daily digest, and Mark paid out action suites already closed. Prefer locking that client-delivery path over inventing optional aggregates while remaining NEXT_STEPS stay secrets/OAuth/counsel-gated.",
  },
  {
    date: "2026-07-13",
    decision:
      "Ship action-level Vitest for sendClientVoicePackToClientAction (Complete Email voice pack) when send-marketing-pack-to-client-action-test-coverage is claimed/done by a sibling — deliver-pack helpers alone do not lock auth, paid/live Complete+email eligibility, existing pack gate, suppression / Resend failure paths, or NEXT_PUBLIC_APP_URL preview URL wiring. Queue sync-commerce-catalog-to-stripe-action-test-coverage + save-commerce-catalog-action-test-coverage as sibling-friendly Commerce twins next. Stripe Prices / Places / Buffer OAuth / Connect stay gated.",
    rationale:
      "Email voice pack is the sold Complete phone-script handoff operators click after Generate voice — without Twilio. A future Growth-tier false-positive, missing pack gate, skipped auth check, or silent suppression swallow would not fail Vitest without action glue coverage — the same class of gap Email pack (PR #150) already closed for Growth/Complete content delivery. Prefer locking that Complete fulfillment path, then Commerce Sync to Stripe / Save catalog action glue, over inventing optional aggregates while remaining NEXT_STEPS stay secrets/OAuth/counsel-gated.",
  },
  {
    date: "2026-07-13",
    decision:
      "Ship action-level Vitest for syncCommerceCatalogToStripeAction (Commerce Sync to Stripe) before inventing optional aggregates — stripe-sync helper suites alone do not lock auth, STRIPE_SECRET_KEY gate, empty catalog gate, COMMERCE_CATALOG_CONVEX_PRIMARY persist, or ConvexPrimaryWriteError fail-closed. Leave save-commerce-catalog-action-test-coverage free for sibling 3329; queue archive-orphan-commerce-stripe-products-action-test-coverage next. Stripe Prices / Places / Buffer OAuth / Connect stay gated.",
    rationale:
      "Sync to Stripe is the operator click that unlocks sold Commerce Buy now (stripePriceId on each SKU). A future soft-fallback / skipped requireConvex / missing secret gate / empty-catalog auto-sync regression would not fail Vitest without action glue coverage — the same class of gap Email pack/voice and Mark paid out action suites already closed — and would leave Buy now blocked or false-unsynced across multi-instance Convex-first reads. Prefer locking that revenue unlock path over inventing optional aggregates while remaining NEXT_STEPS stay secrets/OAuth/counsel-gated.",
  },
  {
    date: "2026-07-13",
    decision:
      "Ship action-level Vitest for saveCommerceCatalogAction (Commerce Save catalog) when sync-commerce-catalog-to-stripe-action-test-coverage is claimed by a sibling — catalog helper suites alone do not lock auth, commerceAddon eligibility, normalize validation, preserveCommerceStripeIds against the DB row (never client Stripe ids), COMMERCE_CATALOG_CONVEX_PRIMARY persist, or ConvexPrimaryWriteError fail-closed. Queue archive-orphan-commerce-stripe-products-action-test-coverage + open-billing-portal-action-test-coverage as sibling-friendly twins next. Stripe Prices / Places / Buffer OAuth / Connect stay gated.",
    rationale:
      "Save catalog is the operator path that keeps Buy now alive after Sync to Stripe — without preserve + requireConvex, an edit can wipe stripePriceId or leave other instances unsynced. A future soft-fallback / client-trusted Stripe ids / skipped eligibility regression would not fail Vitest without action glue coverage — the same class of gap Email pack/voice and Mark paid out action suites already closed. Prefer locking that Commerce catalog write path, then Archive orphans / Manage billing action glue, over inventing optional aggregates while remaining NEXT_STEPS stay secrets/OAuth/counsel-gated.",
  },
  ];
