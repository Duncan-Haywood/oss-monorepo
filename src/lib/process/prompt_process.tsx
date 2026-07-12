/**
 * Cross-agent process log for Local Site Studio.
 *
 * Multiple autonomous agents work this codebase on separate branches. This
 * file is the shared, machine-readable record of what shipped, why, and
 * what's next — read it before starting work, and append to it (don't
 * rewrite history) as part of the same commit that does the work.
 *
 * Rendered for humans at /docs/process via src/app/docs/process/page.tsx.
 */

export type NextStepStatus = "todo" | "in_progress" | "done";

export interface NextStep {
  id: string;
  summary: string;
  status: NextStepStatus;
  /** Roadmap phase this maps to, if any — see /docs/roadmap. */
  phase?: string;
  /** Branch or agent that claimed this, once status moves off "todo". */
  owner?: string;
}

export interface BusinessDecision {
  date: string; // ISO date
  decision: string;
  rationale: string;
}

export interface ProcessIteration {
  date: string; // ISO date
  branch: string;
  summary: string;
  shipped: string[];
  decisions: BusinessDecision[];
}

/**
 * How concurrent agents cooperate. Keep this short; evolve it when collisions
 * or thrash show up in practice.
 */
export const AGENT_PROTOCOL = [
  "Read NEXT_STEPS + open PRs/branches before starting; claim an item (status=in_progress, owner=your branch) in the same commit you begin work.",
  "Push the claim commit immediately (before feature body) so the sibling hourly automation can see ownership on the remote within ~1 minute.",
  "Prefer the highest-leverage todo that unblocks revenue (payments → conversion templates → persistence → outreach → lead volume → operator auth → fulfill/deploy → client inquiry CRM → follow-ups → metrics → checkout attribution → lead quality scoring → open tracking → abandoned-checkout recovery → abandoned-checkout quality signal → lead notes → billing portal → pipeline-health abandoned aggregates → inquiry reply → discovery-call notes prompt → work-next snooze / unreplied-inquiry metrics → inquiry mark-read / cold-lead visibility → cold-lead archive action / snoozed-lead aggregates), unless another agent already owns it.",
  "When remaining NEXT_STEPS are operator- or legal-gated, ship the next free product-promise gap (what Starter sells but preview lacks) or operator leverage (follow-ups, metrics, inbox, attribution) — still claim it first.",
  "If the top free todo is already claimed on a sibling remote branch, immediately claim the next free todo and push — do not wait or idle on process-only edits.",
  "Same-minute dual claims of one todo (common with parallel hourly automations): if neither side has pushed feature commits yet, the earlier remote claim commit owns the todo and the later agent pivots immediately; if you already pushed feature commits, keep building and the sibling pivots. At merge time, fold both ITERATIONS and keep a single implementation — do not ship two scorers/trackers.",
  "ITERATIONS[].decisions must use absolute BUSINESS_DECISIONS slice indices (e.g. slice(39, 41)), never slice(-1) — trailing negative slices drift when later agents append decisions.",
  "Append ITERATIONS and BUSINESS_DECISIONS — never rewrite prior entries. Mark completed steps done; do not delete them. Supersede outdated decisions with a new dated entry.",
  "Ship TS/TSX for product + docs. Do not add operator Markdown docs (AGENTS.md rule).",
  "One focused iteration per run: leave the repo buildable, update this file, open/merge a PR when the iteration is coherent.",
  "If another branch already owns an item, pick the next free todo or improve process/docs — do not duplicate. Close competing PRs rather than merging a second backend.",
  "If two hourly automations claim the same free todo in the same window: merge the branches (keep both process iterations), do not open a second competing PR for the same feature surface.",
  "Prefer wiring an existing signal into the quality scorer / Work next queue over adding a second dashboard panel for the same fact — operators already have one priority list.",
  "Ranking vs aggregates: when a signal already ranks Work next (e.g. abandoned carts), still fold counts into pipeline-health aggregates if the operator needs stuck-money totals beside paid-not-live — that is not a competing priority panel.",
  "Inbox that can only archive (no reply) is half a CRM — when clientInquiries already persist, prefer shipping Resend reply + replied status before new inquiry list UIs.",
  "Soft CRM prompts (e.g. notes after discovery_call / Email 3) must never block or roll back the mutation that triggered them — stage and outreach already saved; Skip dismisses the editor only.",
  "For database-touching changes: `npm run build`/`lint` alone is not enough — run `npm run dev` and load /dashboard/leads and /preview/[slug] before claiming done.",
  "Operator-gated steps (Stripe bootstrap, live DNS, counsel review) stay status=todo with clear operator instructions; agents ship code + checklists, not fake completion.",
  "Use Next.js 16 `proxy.ts` (not deprecated `middleware.ts`) for request gating; always re-check auth inside server actions — proxy alone is not enough.",
  "Before merging: fetch sibling automation branches (`cursor/business-process-evolution-*`, `cursor/prompt-process-evolution-*`); if they shipped overlapping files, merge their branch into yours and keep both ITERATIONS entries.",
  "Stale remote branches that only have a claim commit (or are behind main with no feature body) do not own a todo — re-claim on your branch if the owner has been idle and main still shows status=todo.",
  "Run `npm test` (Vitest) alongside build/lint before claiming done — it covers pure logic (outreach cadence, pipeline-health, CSV import, operator session sign/verify) that build+lint have twice missed real breakage on. Add/extend tests when you touch those modules; it's the fast layer, not a replacement for the `npm run dev` runtime check on database-touching changes.",
  "`\"use server\"` files (e.g. src/app/dashboard/leads/actions.ts) may export ONLY async functions — no `export type` re-exports, even ones that look inert. Turbopack's server-action transform registers every top-level export as an action reference regardless of `type`, so a type-only re-export throws `ReferenceError: <Name> is not defined` at module evaluation and 500s every action in that file, not just the one you're touching. Import types directly from their source module on the client instead of re-exporting them through the action file.",
] as const;

/**
 * Prioritized backlog. When you pick one up: set status to "in_progress"
 * and owner to your branch name in the same commit you start the work in,
 * so concurrent agents on other branches don't duplicate it. Add new items
 * as they're discovered — don't delete completed ones, mark them "done".
 */
export const NEXT_STEPS: NextStep[] = [
  {
    id: "stripe-price-objects",
    summary:
      "Operator: run POST /api/stripe/bootstrap-prices with ALLOW_STRIPE_BOOTSTRAP=1 (test + live), paste envSnippet into secrets, unset the flag. Bootstrap code already shipped. Checklist: /docs/launch-checklist.",
    status: "todo",
    phase: "Phase 3 — Payments",
  },
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
    id: "lead-ingestion",
    summary:
      "Google Places API ingestion for discovery at scale — legal review first, see /docs/compliance. CSV/manual paths shipped separately (csv-lead-import).",
    status: "todo",
    phase: "Phase 4 — Data ingestion",
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
      "Optional: include currently-snoozed lead count (and soonest return) in the operator daily digest so parked urgency is visible without opening /dashboard/leads — reuses snoozedLeadCount from pipeline-health / isLeadSnoozed.",
    status: "todo",
    phase: "Phase 2 — Outreach + platform voice",
  },
  {
    id: "closed-leads-pipeline-metric",
    summary:
      "Optional: fold currently-closed lead counts into pipeline-health (or a stage-funnel footnote) so operators see how many cold closes accumulated — only if Closed filter alone is not enough; prefer not adding a second priority panel.",
    status: "todo",
    phase: "Phase 2 — Outreach + platform voice",
  },
  {
    id: "reengage-send-email1-option",
    summary:
      "Optional: when Re-engage runs on a cold lead, offer a checkbox to immediately set stage to outreach_sent and send Email 1 (today Re-engage only resets to discovered so Email 1 stays intentional).",
    status: "in_progress",
    phase: "Phase 2 — Outreach + platform voice",
    owner: "cursor/prompt-process-evolution-084a",
  },
];

export const BUSINESS_DECISIONS: BusinessDecision[] = [
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
];

const ITERATION_1_DECISIONS: BusinessDecision[] = BUSINESS_DECISIONS.slice(0, 2);

export const ITERATIONS: ProcessIteration[] = [
  {
    date: "2026-07-11",
    branch: "claude/relaxed-galileo-0b6zp9",
    summary:
      "Replaced the stubbed Stripe checkout (501 placeholder) with a real Checkout Session flow across all bundle tiers, and started this process log for cross-agent coordination.",
    shipped: [
      "src/lib/pricing/bundles.ts — bundle/tier pricing as data, not hardcoded strings",
      "src/app/api/stripe/checkout/route.ts — real Stripe SDK integration, graceful 501s per missing env var",
      "src/app/checkout/page.tsx — tier + Commerce add-on selection UI, calls the API, redirects to Stripe",
      "src/app/checkout/success/page.tsx — post-payment landing page",
      "src/lib/process/prompt_process.tsx + /docs/process — this file",
    ],
    decisions: ITERATION_1_DECISIONS,
  },
  {
    date: "2026-07-11",
    branch: "claude/relaxed-galileo-nj7oy0",
    summary:
      "Merged the checkout PR to main, then added the Stripe webhook receiver so paid checkouts have somewhere to land once persistence and email are wired up.",
    shipped: [
      "src/app/api/stripe/webhook/route.ts — signature-verified webhook, handles checkout.session.completed, graceful 501 when unconfigured",
    ],
    decisions: BUSINESS_DECISIONS.slice(2, 3),
  },
  {
    date: "2026-07-11",
    branch: "claude/relaxed-galileo-0b6zp9",
    summary:
      "Follow-up fixes from Cursor Bugbot review of PR #1 (merged before all findings could land on that PR): checkout success page now verifies the Stripe session server-side instead of unconditionally claiming payment succeeded, and the preview → checkout flow now threads the lead's slug through to Stripe session metadata for attribution.",
    shipped: [
      "src/app/checkout/success/page.tsx — server-verifies session.status === 'complete' via Stripe before showing confirmation copy",
      "src/app/checkout/checkout-form.tsx — extracted from page.tsx so useSearchParams() can sit behind a Suspense boundary (required by Next.js for prerendering)",
      "src/app/preview/[slug]/page.tsx — checkout CTA now links to /checkout?slug={slug}",
    ],
    decisions: [],
  },
  {
    date: "2026-07-11",
    branch: "cursor/business-process-evolution-aec3",
    summary:
      "Conversion + payment unlock iteration: category preview templates with tier upsell cards, demo lead catalog feeding the dashboard, Stripe Price bootstrap endpoint, Convex chosen as the persistence target, and an explicit agent cooperation protocol in this file.",
    shipped: [
      "src/lib/leads/* — Lead types + demo catalog (bakery, salon, trades)",
      "src/components/preview/* — category themes, template shell, tier upsell cards",
      "src/app/preview/[slug]/page.tsx — renders category templates from slug/catalog",
      "src/app/api/stripe/bootstrap-prices + src/lib/pricing/bootstrap-stripe-prices.ts",
      "src/app/dashboard/leads — live counts from demo catalog + preview links",
      "AGENT_PROTOCOL + Convex / TS-catalog / bootstrap business decisions",
    ],
    decisions: BUSINESS_DECISIONS.slice(3, 6),
  },
  {
    date: "2026-07-11",
    branch: "claude/convex-database-persistence",
    summary:
      "Stood up Convex schema and functions, and implemented a compile-safe unified database layer that falls back to local memory. Wired checkout webhook fulfillment to persist lead status, and replaced static counts on the operator dashboard with a highly interactive leads console featuring dynamic pipeline filtering, lead searching, manual lead insertion (unblocking manual-lead-entry), and stage updates.",
    shipped: [
      "convex/schema.ts — Convex schema for leads and orders tables",
      "convex/leads.ts — Convex query and mutation handlers for listing, fetching, updating, and seeding leads",
      "convex/tsconfig.json — typescript config for Convex",
      "src/app/dashboard/leads/page.tsx — server-side fetch of database counts and leads list",
      "src/app/dashboard/leads/leads-client.tsx — interactive filterable dashboard with live search, dropdown stage editing, and manual lead creation form",
      "src/app/dashboard/leads/actions.ts — Server Actions for stage updates and manual lead creation",
      "src/app/preview/[slug]/page.tsx — dynamic lead resolution checking the database before fallback",
      "src/app/api/stripe/webhook/route.ts — checkout webhook marked paid directly in database",
      "src/lib/db.ts — compile-safe database helper supporting Convex and local memory fallback",
      "src/app/layout.tsx + src/app/globals.css — Fixed Google Fonts build failures by specifying offline-friendly system font fallbacks",
    ],
    decisions: [BUSINESS_DECISIONS[6], BUSINESS_DECISIONS[7]],
  },
  {
    date: "2026-07-11",
    branch: "claude/email-outreach-and-suppression",
    summary:
      "Wired Resend for outreach and transactional receipt emails, created a local SQLite-based suppression list to honor unsubscribes, and added an opt-out unsubscribe endpoint to comply with CAN-SPAM. Integrated the new email field into the operator manual lead entry form, leads list table, and server actions to auto-send outreach upon stage transition.",
    shipped: [
      "src/lib/email/resend.ts — Resend email integration, suppression list checking, outreach + receipt templates",
      "src/app/api/unsubscribe/route.ts — Opt-out unsubscribe endpoint that adds emails to the suppression list",
      "src/lib/db.ts — Migrated SQLite tables to include email column and suppression_list table, added suppression list helpers",
      "src/lib/leads/types.ts — Added optional email field to Lead interface",
      "src/app/dashboard/leads/leads-client.tsx — Added Email Address field to manual lead entry form and table",
      "src/app/dashboard/leads/actions.ts — Automated outreach email trigger when stage changes to outreach_sent",
      "src/app/api/stripe/webhook/route.ts — Trigger transactional receipt email upon checkout.session.completed",
    ],
    decisions: [BUSINESS_DECISIONS[8]],
  },
  {
    date: "2026-07-11",
    branch: "claude/upbeat-dijkstra-g50ju8",
    summary:
      "Started this iteration by building a competing Postgres+Drizzle persistence layer for the 'database' backlog item, unaware it was being tackled concurrently. Two more agents (claude/convex-database-persistence, claude/email-outreach-and-suppression) landed a more complete Convex+SQLite-fallback implementation on main first, including the dashboard UI and outbound email this iteration hadn't built — so the Postgres PR was closed unmerged rather than pushed through as a competing backend (see AGENT_PROTOCOL and the resolution decision two entries up in a prior draft of this file, superseded by this simpler outcome once the fuller picture on main became clear). Rebased onto the merged result and, running it for real instead of trusting a clean build, found `/dashboard/leads` and `/preview/[slug]` both 500ing at runtime.",
    shipped: [
      "src/lib/db.ts — fixed `import { Database } from \"node:sqlite\"` (wrong export name) to `DatabaseSync`, and the resulting `.all()` cast; verified via `npm run dev` hitting every route that touches the database, not just build/lint",
    ],
    decisions: [BUSINESS_DECISIONS[9]],
  },
  {
    date: "2026-07-11",
    branch: "cursor/business-process-evolution-a9c1",
    summary:
      "Growth iteration after core funnel code landed: fixed lead.email not actually persisting (Convex + SQLite), fixed orders insert field mismatch (leadSlug), shipped operator CSV import for owned contact lists, added /docs/launch-checklist, refreshed stale roadmap/architecture copy, and tightened AGENT_PROTOCOL for runtime verification + operator-gated todos.",
    shipped: [
      "src/lib/leads/csv-import.ts — CSV parser + template for operator-owned lists",
      "src/app/dashboard/leads — Import CSV UI + importLeadsCsvAction",
      "src/lib/db.ts — email column + PRAGMA migrate; upsert/read email",
      "convex/schema.ts + convex/leads.ts — optional email; markLeadPaid uses leadSlug",
      "convex/orders.ts — createOrder args aligned to leadSlug",
      "src/app/docs/launch-checklist — operator path to first paid order",
      "Docs: roadmap + architecture brought current with shipped fulfillment",
    ],
    decisions: BUSINESS_DECISIONS.slice(10, 13),
  },
  {
    date: "2026-07-11",
    branch: "cursor/prompt-process-evolution-6a76",
    summary:
      "Parallel hourly run also claimed csv-lead-import; merged with a9c1 rather than opening a competing PR. Kept dataSource tagging + richer SQLite column migrations from this branch, absorbed launch-checklist + order index fixes from a9c1, and documented the collision rule in AGENT_PROTOCOL.",
    shipped: [
      "Lead.dataSource on types + Convex + SQLite (ALTER TABLE migrations)",
      "CSV import template/UI with per-batch dataSource field",
      "Merge of cursor/business-process-evolution-a9c1 (launch-checklist, by_stripeSessionId)",
      "Compliance docs note for Lead.dataSource",
      "AGENT_PROTOCOL — parallel-claim merge rule",
    ],
    decisions: BUSINESS_DECISIONS.slice(13, 15),
  },
  {
    date: "2026-07-11",
    branch: "cursor/business-process-evolution-8d74",
    summary:
      "Operator dashboard auth so real CSV/outreach can run safely: shared-secret login, signed session cookie, Next.js 16 proxy gate on /dashboard/*, server-action requireOperatorAuth on lead mutations, launch-checklist + roadmap updates, and AGENT_PROTOCOL note for proxy vs middleware.",
    shipped: [
      "src/lib/auth/operator.ts — HMAC session + requireOperatorAuth",
      "src/proxy.ts — gate /dashboard/* when password configured",
      "src/app/dashboard/login — sign-in form + logout",
      "Lead mutation actions auth-guarded; auth chrome banner when unconfigured",
      "Docs: launch-checklist auth section; roadmap/architecture; .env.example",
    ],
    decisions: BUSINESS_DECISIONS.slice(15, 17),
  },
  {
    date: "2026-07-11",
    branch: "cursor/prompt-process-evolution-0e38",
    summary:
      "Phase 5 unlock: after Stripe checkout.session.completed, enqueue a production deploy handoff (DNS instructions, suggested host, contact form URL), optionally call Vercel Domains API when tokens exist, email the buyer next steps, and let operators Mark live from /dashboard/leads. Contact form stub at /api/contact/[slug]. Process: push claim commits immediately; document at /docs/production-deploy. Merged sibling 8d74 dashboard-auth in the same PR window.",
    shipped: [
      "src/lib/deploy/* — handoff types + enqueue / mark-live / Vercel best-effort",
      "src/lib/db.ts — deploy_handoffs SQLite table + CRUD",
      "src/app/api/stripe/webhook — enqueue handoff + DNS email after receipt",
      "src/app/api/contact/[slug] — inquiry stub for client sites",
      "src/app/dashboard/leads — open handoffs panel + Mark live action",
      "src/app/docs/production-deploy + roadmap/architecture/launch-checklist updates",
      "AGENT_PROTOCOL — push claim before feature body",
      "Merge of cursor/business-process-evolution-8d74 (dashboard auth)",
    ],
    decisions: BUSINESS_DECISIONS.slice(17, 20),
  },
  {
    date: "2026-07-11",
    branch: "cursor/prompt-process-evolution-7f15",
    summary:
      "Conversion unlock after operator-gated todos blocked further payment/Places work: Starter preview now includes a working contact form (POST /api/contact/[slug]) and Google Maps embed, demo banner only on demo/slug-inference leads, optional Lead.address for tighter pins, and process backlog for follow-ups / metrics / inbox / checkout polish so sibling agents have free claims.",
    shipped: [
      "src/components/preview/contact-form.tsx — client form → /api/contact/[slug]",
      "src/components/preview/maps-embed.tsx — Maps embed from city/state/address",
      "src/components/preview/category-preview.tsx — form + map section; soft demo banner",
      "Lead.address optional on types + demo catalog street pins",
      "NEXT_STEPS: preview-conversion-finish done; outreach-follow-ups, pipeline-health-metrics, client-leads-inbox, checkout-attribution-polish queued",
      "AGENT_PROTOCOL — prefer product-promise gaps when operator/legal todos block",
    ],
    decisions: BUSINESS_DECISIONS.slice(20, 23),
  },
  {
    date: "2026-07-11",
    branch: "cursor/business-process-evolution-109d",
    summary:
      "Post-payment customer value: persist website contact-form submissions as clientInquiries (SQLite + Convex schema/functions), show an Inquiries panel on /dashboard/leads with mark-read/archive. Merged sibling 7f15 preview form UI (PR #12) so form posts now land in the inbox end-to-end.",
    shipped: [
      "src/lib/inquiries/types.ts — ClientInquiry model",
      "src/lib/db.ts — client_inquiries table + insert/list/updateStatus",
      "convex/schema.ts + convex/inquiries.ts — clientInquiries with app-owned inquiryId",
      "src/app/api/contact/[slug] — persist before email notify",
      "src/app/dashboard/leads — Inquiries panel + updateInquiryStatusAction",
      "Docs: production-deploy, launch-checklist, roadmap, architecture",
      "Merge of main (PR #12 preview-conversion-finish)",
    ],
    decisions: BUSINESS_DECISIONS.slice(23, 26),
  },
  {
    date: "2026-07-11",
    branch: "cursor/prompt-process-evolution-375b",
    summary:
      "Conversion multiplier after Email 1: Email 2/3 templates, Lead.outreachStep + lastOutreachAt (SQLite + Convex), operator due queue + Send follow-up on /dashboard/leads, business-model/roadmap/launch-checklist docs, and AGENT_PROTOCOL fetch-sibling-before-merge rule. Merged sibling ffae pipeline-health-metrics in the same PR window.",
    shipped: [
      "src/lib/email/outreach-followups.ts — cadence helpers + due detection",
      "src/lib/email/resend.ts — sendOutreachFollowUp2/3 (+ Email 1 subject aligned to business-model)",
      "Lead.outreachStep / lastOutreachAt on types + SQLite migrations + Convex schema/recordOutreach",
      "sendFollowUpAction + Email 1 records step 1; Follow-ups due panel + Outreach column on leads table",
      "Docs: business-model Email 2/3, roadmap Phase 2, launch-checklist follow-up test",
      "AGENT_PROTOCOL — fetch sibling automation branches before merge",
      "Merge of cursor/business-process-evolution-ffae (pipeline health metrics)",
    ],
    decisions: BUSINESS_DECISIONS.slice(26, 29),
  },
  {
    date: "2026-07-11",
    branch: "cursor/business-process-evolution-ffae",
    summary:
      "Operator leverage after inbox landed: pipeline health metrics (recorded revenue, stage funnel, open handoffs, paid-not-live, missing-email sample) on /dashboard and /dashboard/leads. Cooperated with sibling 375b which claimed outreach-follow-ups in the same hour.",
    shipped: [
      "src/lib/orders/types.ts + listOrders() in db.ts (SQLite join + Convex orders:list)",
      "src/lib/metrics/pipeline-health.ts — pure aggregator",
      "src/components/dashboard/pipeline-health-panel.tsx — funnel + stuck-money cards",
      "Dashboard home teaser metrics linking to lead pipeline",
      "AGENT_PROTOCOL — skip to next free todo when top is remotely claimed",
      "Docs: roadmap + launch-checklist metric check",
    ],
    decisions: BUSINESS_DECISIONS.slice(29, 32),
  },
  {
    date: "2026-07-11",
    branch: "cursor/business-process-evolution-ffae",
    summary:
      "Payment conversion polish after PR #14 merged follow-ups+metrics: checkout prefills lead identity from slug, cancel URL keeps attribution, landing pricing CTAs pass tier/commerce, short FAQ, demo lead emails for realistic prefill demos.",
    shipped: [
      "src/app/checkout/page.tsx — server-load lead by slug → CheckoutPrefill",
      "src/app/checkout/checkout-form.tsx — business name, email, recommended tier UI",
      "src/app/api/stripe/checkout — cancel_url preserves slug/tier/commerce",
      "src/app/page.tsx — tier/commerce deep-links + Before you buy FAQ",
      "Demo catalog emails; header FAQ nav",
      "Architecture note for pipeline health (carry from earlier commit)",
    ],
    decisions: BUSINESS_DECISIONS.slice(32, 34),
  },
  {
    date: "2026-07-11",
    branch: "claude/quirky-davinci",
    summary:
      "Test-coverage iteration: added Vitest and unit tests for the pure logic modules concurrent agents edit most (outreach cadence, pipeline-health aggregation, CSV import parsing, operator session sign/verify). Also spent part of this run on a since-abandoned purity fix for the follow-ups Date.now() bug — a sibling branch merged the same fix first (PR #14), so that work was discarded in favor of this fresh, non-duplicate claim per AGENT_PROTOCOL.",
    shipped: [
      "vitest.config.ts + package.json test script (`npm run test` = `vitest run`)",
      "src/lib/email/outreach-followups.test.ts — cadence/due-date edge cases",
      "src/lib/metrics/pipeline-health.test.ts — aggregation + formatUsd",
      "src/lib/leads/csv-import.test.ts — parsing, slugify, dedupe, row limits",
      "src/lib/auth/operator.test.ts — session token round-trip, expiry, tamper detection",
      "AGENT_PROTOCOL — run `npm test` alongside build/lint before claiming done",
    ],
    decisions: BUSINESS_DECISIONS.slice(34, 35),
  },
  {
    date: "2026-07-11",
    branch: "claude/relaxed-galileo-e0wc2i",
    summary:
      "Sibling ffae had already claimed the only unclaimed revenue todo (checkout-attribution-polish, in_progress) by the time this run started; folded ffae's claim commit in (fast-forward, no conflicts) and shipped the SEO product-promise gap instead: /preview/[slug] previously had no metadata, no canonical URL, no Open Graph tags, and no structured data, and the app had no /sitemap.xml or /robots.txt at all — despite the landing page explicitly selling 'Basic SEO' on Starter. ffae's checkout-attribution-polish feature commit and quirky-davinci's Vitest suite both landed on main mid-run; merged both in before pushing.",
    shipped: [
      "src/lib/seo.ts — siteUrl()/previewUrl() + per-lead title/description + LocalBusiness JSON-LD builder (schema.org subtype by category)",
      "src/app/preview/[slug]/page.tsx — generateMetadata (title/description/canonical/OG/Twitter) + JSON-LD script tag",
      "src/app/sitemap.ts — marketing pages + every demo/persisted lead slug",
      "src/app/robots.ts — allow all, disallow /dashboard + /api, points at sitemap.xml",
      "docs/architecture — new '2b. SEO & discoverability' section",
      ".env.example — documented NEXT_PUBLIC_APP_URL's SEO/canonical-URL role",
    ],
    decisions: BUSINESS_DECISIONS.slice(35, 37),
  },
  {
    date: "2026-07-11",
    branch: "claude/upbeat-dijkstra-4ugtxb",
    summary:
      "Two collisions this window: outreach-follow-ups and checkout-attribution-polish both landed on main from sibling branches while this branch had a duplicate implementation in flight (the second one before this branch had even pushed a claim commit for it). Both times, rebased onto main and discarded the duplicate rather than merging a second backend — see the process-cooperation decision below. Landed the last free (non-operator/legal-gated) backlog item instead: per-client Vercel project isolation as an operator-assignable field.",
    shipped: [
      "src/lib/deploy/types.ts — DeployHandoff.vercelProjectId",
      "src/lib/db.ts — deploy_handoffs.vercelProjectId column + migration, updateDeployHandoffVercelProject()",
      "src/lib/deploy/handoff.ts — tryProvisionVercelDomain resolves handoff.vercelProjectId before the shared VERCEL_PROJECT_ID; assignVercelProjectAndProvision() to set + retry",
      "src/app/dashboard/leads/actions.ts — assignVercelProjectAction",
      "src/app/dashboard/leads/leads-client.tsx — 'Dedicated Vercel project ID' input + 'Save + provision' button on each open handoff card",
      "Docs: /docs/production-deploy per-client isolation section, /docs/roadmap Phase 5 note",
      "Verified via npm run dev — loaded /dashboard/leads, inserted a synthetic deploy_handoffs row via node:sqlite to confirm the migration and the new UI render correctly",
    ],
    decisions: BUSINESS_DECISIONS.slice(37, 39),
  },
  {
    date: "2026-07-11",
    branch: "claude/quirky-davinci-8x9xi8",
    summary:
      "Closed the only unclaimed non-operator/legal-gated backlog item (lead-address-persistence): Lead.address now round-trips through Convex and the SQLite fallback instead of silently dropping outside the demo catalog. Extended the fix to the two real-world lead-creation paths (CSV import, manual entry form) so operators can actually set an address on a non-demo lead, not just the seeded examples. Added two new free backlog items (lead-quality-scoring, outreach-open-tracking) so the next hourly run has a clear, non-operator-gated next step.",
    shipped: [
      "convex/schema.ts + convex/leads.ts — address: v.optional(v.string()) on the leads table/leadFields",
      "src/lib/db.ts — address column + migration on the SQLite leads table, seed insert, mapSqliteRowToLead, upsertLead UPDATE/INSERT",
      "src/lib/leads/csv-import.ts (+ .test.ts) — optional address CSV column, template row, parsing",
      "src/app/dashboard/leads/leads-client.tsx — Street Address input on the manual lead-entry form",
      "NEXT_STEPS: lead-address-persistence done; lead-quality-scoring + outreach-open-tracking queued",
      "Verified via npm run dev: seeded a fresh local.db, confirmed example-bakery's address (1837 Pearl St) renders in the Maps embed and LocalBusiness JSON-LD on /preview/example-bakery, and reads back correctly via node:sqlite",
    ],
    decisions: BUSINESS_DECISIONS.slice(39, 40),
  },
  {
    date: "2026-07-12",
    branch: "cursor/business-process-evolution-8e65",
    summary:
      "Operator leverage after address persistence: pure lead quality scoring (contact gaps, stage momentum, follow-up due, category↔tier fit, demo deprioritization) with a Work next queue and default quality sort on /dashboard/leads. Process: extended revenue priority chain, queued abandoned-checkout recovery + operator lead notes for siblings.",
    shipped: [
      "src/lib/leads/quality-score.ts — 0–100 scorer + rankLeadsForOutreach + band helpers",
      "src/lib/leads/quality-score.test.ts — Vitest coverage for factors, ranking, clamps",
      "src/app/dashboard/leads/leads-client.tsx — Work next panel, Quality column, sort toggle",
      "Docs: roadmap Phase 2 + launch-checklist quality check",
      "NEXT_STEPS: lead-quality-scoring done; checkout-abandoned-recovery + operator-lead-notes queued",
      "AGENT_PROTOCOL — revenue priority includes scoring → open tracking → abandoned checkout",
    ],
    decisions: BUSINESS_DECISIONS.slice(40, 43),
  },
  {
    date: "2026-07-12",
    branch: "cursor/prompt-process-evolution-f004",
    summary:
      "Same-hour dual claim with 8e65 on lead-quality-scoring: merged sibling branch, kept one scorer (8e65 Work next implementation), added AGENT_PROTOCOL dual-claim pivot + absolute BUSINESS_DECISIONS slice rules, and recorded the merge decision so the next hourly pair does not re-litigate.",
    shipped: [
      "Merge of cursor/business-process-evolution-8e65 (quality-score + Work next + docs + new NEXT_STEPS)",
      "AGENT_PROTOCOL — Same-minute dual-claim pivot; absolute decision slice indices",
      "NEXT_STEPS owner shared: business-process-evolution-8e65 + prompt-process-evolution-f004",
      "Process decision documenting single-scorer merge outcome",
    ],
    decisions: BUSINESS_DECISIONS.slice(43, 44),
  },
  {
    date: "2026-07-12",
    branch: "cursor/business-process-evolution-8e65",
    summary:
      "After PR #21 merged quality scoring: outreach open tracking — ?src=outreach on Email 1/2/3 links, client beacon + POST /api/preview/[slug]/open, Lead.lastPreviewOpenAt (SQLite + Convex), quality-score + follow-up due queue prefer engagers, Opened badge on the leads table.",
    shipped: [
      "src/lib/leads/preview-open.ts (+ tests) — attribution + debounce helpers",
      "Lead.lastPreviewOpenAt on types + SQLite migration + Convex schema/recordPreviewOpen",
      "src/app/api/preview/[slug]/open + PreviewOpenBeacon on /preview/[slug]",
      "Resend Email 1/2/3 preview URLs append ?src=outreach",
      "quality-score + listFollowUpsDue prefer openers; dashboard Opened badge",
      "NEXT_STEPS: outreach-open-tracking done",
    ],
    decisions: BUSINESS_DECISIONS.slice(44, 46),
  },
  {
    date: "2026-07-12",
    branch: "claude/upbeat-dijkstra-5y4ly6",
    summary:
      "Started by claiming and re-building outreach-open-tracking; discovered on the pre-merge sibling-branch fetch that cursor/business-process-evolution-8e65 had already shipped the identical feature (plus lead-quality-scoring) and merged both to main first. Discarded the duplicate work, reset onto main, and claimed the next free todo instead: abandoned-checkout recovery. A new checkout_sessions table (keyed by Stripe's stripeSessionId) tracks every slug-attributed Checkout Session from open through the completed webhook; sessions still open 2h+ after creation surface on an operator-triggered 'Abandoned checkouts' recovery panel on /dashboard/leads, reusing the Resend + suppression path Email 2/3 already established.",
    shipped: [
      "src/lib/checkout/types.ts + abandoned-recovery.ts (+ .test.ts) — pure due-queue logic mirroring outreach-followups.ts",
      "convex/schema.ts + convex/checkoutSessions.ts — checkoutSessions table + create/markComplete/recordRecoverySent/listOpen",
      "src/lib/db.ts — checkout_sessions SQLite table + recordCheckoutSessionCreated/markCheckoutSessionComplete/recordCheckoutRecoverySent/listOpenCheckoutSessions",
      "src/app/api/stripe/checkout/route.ts — persists an open checkout_sessions row when the request carries a lead slug",
      "src/app/api/stripe/webhook/route.ts — flips the session to complete on checkout.session.completed",
      "src/lib/email/resend.ts — sendCheckoutAbandonedRecovery template",
      "src/app/dashboard/leads/actions.ts — sendCheckoutRecoveryAction (operator-auth-gated)",
      "src/app/dashboard/leads/page.tsx + leads-client.tsx — Abandoned checkouts panel wired to the new action",
      "NEXT_STEPS: outreach-open-tracking + lead-quality-scoring reconciled against main; checkout-abandoned-recovery done; queued abandoned-checkout-quality-signal",
      "Verified via npm run dev: created a Stripe-unconfigured 501 sanity check on /api/stripe/checkout, then inserted a synthetic open checkout_sessions row via node:sqlite with createdAt 3h in the past and confirmed it rendered on the Abandoned checkouts panel and cleared after simulating markCheckoutSessionComplete",
    ],
    decisions: BUSINESS_DECISIONS.slice(46, 50),
  },
  {
    date: "2026-07-12",
    branch: "cursor/business-process-evolution-d264",
    summary:
      "Wire abandoned open checkout sessions into the lead quality scorer and Work next queue so high-intent carts outrank plain outreach-due leads. Operator-lead-notes left free (sibling claim branch stale/todo); queued stripe-billing-portal + inquiry-dashboard-reply for the next hourly pair. Process: prefer folding signals into the scorer over a second priority panel.",
    shipped: [
      "src/lib/leads/quality-score.ts — LeadScoreOptions.openCheckoutSessions; +18 abandoned_checkout / +6 checkout_recovery_due factors",
      "src/lib/leads/quality-score.test.ts — abandoned > preview-open/follow-up-due; paid ignored; rankLeadsForOutreach sessions path",
      "src/app/dashboard/leads/leads-client.tsx — pass checkoutSessions into scoreLead/rankLeadsForOutreach; Cart badge on Work next + table",
      "Docs: architecture + roadmap + launch-checklist note the scorer signal",
      "NEXT_STEPS: abandoned-checkout-quality-signal done; stripe-billing-portal + inquiry-dashboard-reply queued",
      "AGENT_PROTOCOL — revenue chain + prefer wiring signals into the scorer",
    ],
    decisions: BUSINESS_DECISIONS.slice(50, 53),
  },
  {
    date: "2026-07-12",
    branch: "cursor/prompt-process-evolution-e2ee",
    summary:
      "Sibling business-process-evolution-d264 claimed abandoned-checkout-quality-signal; this run claimed operator-lead-notes. Shipped optional Lead.notes (SQLite migration + Convex schema/updateNotes), normalizeOperatorNotes helper + Vitest, dashboard row expander with save/clear, search-over-notes, and queued pipeline-health-abandoned-sessions + discovery-call-notes-prompt for siblings. Merged d264 quality-signal work before PR (both ITERATIONS kept). Process: stale claim-only branches do not block re-claim.",
    shipped: [
      "src/lib/leads/notes.ts (+ .test.ts) — normalizeOperatorNotes / MAX_OPERATOR_NOTES_LENGTH / leadHasNotes",
      "Lead.notes on types + SQLite migration + Convex schema/leadFields + leads:updateNotes",
      "src/lib/db.ts — updateLeadNotes() + upsert/read mapping",
      "updateLeadNotesAction + Notes expander on /dashboard/leads (auth-gated)",
      "Docs: roadmap Phase 2, architecture, launch-checklist notes check",
      "NEXT_STEPS: operator-lead-notes done; pipeline-health-abandoned-sessions + discovery-call-notes-prompt queued",
      "AGENT_PROTOCOL — stale claim-only branches do not own a todo",
      "Merge of cursor/business-process-evolution-d264 (abandoned-checkout quality signal + Cart badge)",
    ],
    decisions: BUSINESS_DECISIONS.slice(53, 57),
  },
  {
    date: "2026-07-12",
    branch: "cursor/business-process-evolution-5a8e",
    summary:
      "Re-claimed stripe-billing-portal after stale claim-only sibling claude/relaxed-galileo-7ngeg0. Shipped self-serve Stripe Billing Portal for Growth/Complete/Commerce: persist stripeCustomerId on orders, operator Billing button on paid/live leads, post-checkout Manage subscription on /checkout/success, sessionId-only public API. Process: public portal API must not accept leadSlug.",
    shipped: [
      "src/lib/billing/portal.ts (+ tests) — eligibility + customer id helpers",
      "src/lib/billing/create-portal-session.ts — lead + checkout-session portal creators",
      "Order.stripeCustomerId (SQLite migration + Convex schema/markLeadPaid/createOrder)",
      "Webhook records stripeCustomerId; Checkout Session fallback for older orders",
      "POST /api/stripe/billing-portal (sessionId only) + openBillingPortalAction (auth)",
      "Dashboard Billing button + /checkout/success Manage subscription",
      "Docs: architecture, roadmap, launch-checklist Customer Portal activation",
      "NEXT_STEPS: stripe-billing-portal done; inquiry reply + abandoned metrics + discovery notes remain free",
    ],
    decisions: BUSINESS_DECISIONS.slice(57, 60),
  },
  {
    date: "2026-07-12",
    branch: "cursor/prompt-process-evolution-b224",
    summary:
      "Sibling business-process-evolution-5a8e claimed + shipped stripe-billing-portal (merged PR #27); this run claimed pipeline-health-abandoned-sessions. Folded open checkout_sessions into pipeline-health aggregates (abandoned count, recovery due, oldest age) on /dashboard + /dashboard/leads, extended Vitest, documented ranking-vs-aggregates in AGENT_PROTOCOL, queued lead-snooze-work-next for siblings. Merged main (billing portal) before PR — both ITERATIONS kept.",
    shipped: [
      "src/lib/metrics/pipeline-health.ts — abandonedCheckoutCount / recoveryDueCount / oldestAbandonedAgeHours via isAbandonedCheckout/isRecoveryDue; formatAbandonedAgeHours; callers pass nowMs",
      "src/lib/metrics/pipeline-health.test.ts — abandoned + recovery-due + age formatting cases",
      "src/components/dashboard/pipeline-health-panel.tsx — Abandoned carts + Recovery due metric cards",
      "src/app/dashboard/page.tsx + leads/page.tsx — listOpenCheckoutSessions into computePipelineHealth (Date.now off render path)",
      "Docs: architecture, roadmap, launch-checklist",
      "NEXT_STEPS: pipeline-health-abandoned-sessions done; lead-snooze-work-next queued",
      "AGENT_PROTOCOL — revenue chain + ranking-vs-aggregates clarification",
      "Merge of origin/main (PR #27 stripe-billing-portal)",
    ],
    decisions: BUSINESS_DECISIONS.slice(60, 63),
  },
  {
    date: "2026-07-12",
    branch: "cursor/prompt-process-evolution-e1af",
    summary:
      "Claimed inquiry-dashboard-reply (highest free revenue unlock after billing portal + abandoned aggregates). Shipped operator Resend reply from the Website inquiries panel: normalizeInquiryReply helpers + Vitest, sendInquiryReply, status=replied with operatorReply/repliedAt (SQLite migration + Convex schema/recordReply), replyToInquiryAction (auth + suppression), dashboard Reply UI. Process: inbox-without-reply protocol note; queued unreplied-inquiry-pipeline-metric for siblings.",
    shipped: [
      "src/lib/inquiries/reply.ts (+ .test.ts) — normalizeInquiryReply / escapeHtml / inquiryCanReceiveReply",
      "src/lib/email/resend.ts — sendInquiryReply (quotes original message)",
      "ClientInquiry status replied + operatorReply/repliedAt on types + SQLite + Convex",
      "convex/inquiries.ts — getById + recordReply; statusValidator includes replied",
      "src/lib/db.ts — getClientInquiryById / recordClientInquiryReply + migrations",
      "replyToInquiryAction + Reply / Reply again UI on /dashboard/leads inquiries panel",
      "Docs: production-deploy, launch-checklist, architecture, roadmap",
      "NEXT_STEPS: inquiry-dashboard-reply done; unreplied-inquiry-pipeline-metric queued",
      "AGENT_PROTOCOL — revenue chain + archive-only inbox is half a CRM",
    ],
    decisions: BUSINESS_DECISIONS.slice(63, 66),
  },
  {
    date: "2026-07-12",
    branch: "cursor/business-process-evolution-c5cb",
    summary:
      "Sibling prompt-process-evolution-e1af claimed inquiry-dashboard-reply; this run claimed discovery-call-notes-prompt. Soft notes prompt on discovery_call stage and Email 3 (non-blocking Skip), pure helpers + Vitest, docs + AGENT_PROTOCOL soft-CRM rule. Merged e1af before PR (both ITERATIONS kept).",
    shipped: [
      "src/lib/leads/notes.ts — shouldPromptNotesAfterStageChange / shouldPromptNotesAfterOutreachStep / notesPromptMessage",
      "src/lib/leads/notes.test.ts — prompt trigger + copy cases",
      "src/app/dashboard/leads/leads-client.tsx — auto-open notes editor + amber banner after discovery_call / Email 3; Skip for now",
      "Docs: roadmap Phase 2, architecture, launch-checklist",
      "NEXT_STEPS: discovery-call-notes-prompt done; lead-snooze-work-next + unreplied-inquiry-pipeline-metric remain free",
      "AGENT_PROTOCOL — soft CRM prompts must not block the triggering mutation",
      "Merge of cursor/prompt-process-evolution-e1af (inquiry-dashboard-reply)",
    ],
    decisions: BUSINESS_DECISIONS.slice(66, 69),
  },
  {
    date: "2026-07-12",
    branch: "cursor/prompt-process-evolution-af03",
    summary:
      "Same-minute dual claim on lead-snooze-work-next with business-process-evolution-a6e6 (their remote claim ~13s earlier): pivoted before feature body to unreplied-inquiry-pipeline-metric. Folded new+read inquiry counts + oldest age into pipeline-health, dashboard teaser cards, Vitest, docs; hardened AGENT_PROTOCOL dual-claim ownership; queued inquiry-mark-read-on-composer-open. Merged a6e6 snooze before PR (both ITERATIONS kept).",
    shipped: [
      "src/lib/metrics/pipeline-health.ts — unrepliedInquiryCount / oldestUnrepliedInquiryAgeHours / isUnrepliedInquiryStatus",
      "src/lib/metrics/pipeline-health.test.ts — unreplied + age + status helper cases",
      "src/components/dashboard/pipeline-health-panel.tsx — Unreplied inquiries metric card + teaser",
      "src/app/dashboard/page.tsx — unreplied teaser on overview strip",
      "Docs: architecture, roadmap, launch-checklist",
      "NEXT_STEPS: unreplied-inquiry-pipeline-metric done; inquiry-mark-read-on-composer-open queued",
      "AGENT_PROTOCOL — earlier remote claim owns when neither side has feature commits",
      "Merge of cursor/business-process-evolution-a6e6 (Work next snooze)",
    ],
    decisions: BUSINESS_DECISIONS.slice(69, 73),
  },
  {
    date: "2026-07-12",
    branch: "cursor/business-process-evolution-a6e6",
    summary:
      "Claimed lead-snooze-work-next (dual claim with prompt-process-evolution-af03 ~13s later — this branch claimed first). Shipped Lead.snoozedUntil with 1d/3d/7d presets, pure helpers + Vitest, SQLite/Convex persistence, Work next exclusion via actionable=false, dashboard Snooze/Unsnooze controls. Queued snoozed-leads-pipeline-metric; af03 took unreplied-inquiry-pipeline-metric.",
    shipped: [
      "src/lib/leads/snooze.ts (+ .test.ts) — presets, normalizeSnoozedUntil, isLeadSnoozed, labels",
      "src/lib/leads/quality-score.ts — snoozed → actionable=false; factor id snoozed",
      "src/lib/leads/quality-score.test.ts — Work next excludes snoozed; expired returns",
      "Lead.snoozedUntil on types + SQLite migration + Convex schema/updateSnooze",
      "snoozeLeadAction + Work next / table Snooze presets + Unsnooze",
      "Docs: roadmap Phase 2, architecture, launch-checklist",
      "NEXT_STEPS: lead-snooze-work-next done; snoozed-leads-pipeline-metric queued",
    ],
    decisions: BUSINESS_DECISIONS.slice(70, 72),
  },
  {
    date: "2026-07-12",
    branch: "claude/cold-lead-reengagement",
    summary:
      "Started by re-shipping unreplied-inquiry-pipeline-metric (claim pushed, full feature built/tested), then discovered on a pre-merge origin/main fetch that siblings a6e6 + af03 had already merged the identical metric (down to field names) plus lead-snooze-work-next in PRs #31/#32. Discarded the duplicate, reset onto main, and claimed a genuinely new gap instead: isFollowUpDue/listFollowUpsDue silently stop returning a lead once outreachStep hits 3, so a prospect who never replied to any of Email 1-3 had zero operator-visible signal. Added isColdLead/listColdLeads (pure derivation, no new Lead field), a pipeline-health coldLeadCount + oldest-silent-age, and a Cold badge on the leads table. Queued cold-lead-archive-action (an explicit re-engage/archive control) for the next agent.",
    shipped: [
      "src/lib/email/outreach-followups.ts — COLD_AFTER_DAYS, isColdLead, listColdLeads",
      "src/lib/email/outreach-followups.test.ts — cold-gap timing, stage/email guards, sort order",
      "src/lib/metrics/pipeline-health.ts — coldLeadCount + oldestColdLeadAgeHours",
      "src/lib/metrics/pipeline-health.test.ts — cold lead count/age cases (paid leads excluded)",
      "src/components/dashboard/pipeline-health-panel.tsx — Cold leads metric card + callout",
      "src/app/dashboard/leads/leads-client.tsx — Cold badge on the Outreach column",
      "Docs: architecture (isColdLead paragraph), roadmap Phase 2",
      "NEXT_STEPS: cold-lead-reengagement done; cold-lead-archive-action queued (inquiry-mark-read-on-composer-open + snoozed-leads-pipeline-metric remain free from siblings)",
      "AGENT_PROTOCOL note (via decisions log) on re-fetching origin/main right before claiming, not just at session start",
      "Verified via npm run dev: updated the seeded example-bakery row to outreachStep=3 / lastOutreachAt 30 days ago / stage=outreach_sent via node:sqlite, confirmed 'Cold leads: 1 · Oldest silent 30d' on the pipeline-health panel and the Cold badge on its leads-table row",
    ],
    decisions: BUSINESS_DECISIONS.slice(73, 76),
  },
  {
    date: "2026-07-12",
    branch: "claude/upbeat-dijkstra-y2c9ib",
    summary:
      "Started this iteration by claiming and re-implementing lead-snooze-work-next; the pre-PR sibling-branch fetch showed business-process-evolution-a6e6 + prompt-process-evolution-af03 had already shipped and merged an equivalent lead-snooze-work-next + unreplied-inquiry-pipeline-metric (PRs #31/#32) first. Discarded the duplicate implementation and reset onto main per this file's own collision precedent, then claimed inquiry-mark-read-on-composer-open instead: opening the reply composer on a status=new inquiry now calls the existing updateInquiryStatusAction(id, \"read\") so pipeline-health's newInquiryCount reflects unseen inquiries specifically, not just unreplied ones. Queued operator-daily-digest-email for siblings.",
    shipped: [
      "src/app/dashboard/leads/leads-client.tsx — handleToggleReplyComposer auto-marks status=new → read on composer open (no-op on close or already read/replied rows)",
      "NEXT_STEPS: inquiry-mark-read-on-composer-open done; operator-daily-digest-email queued (snoozed-leads-pipeline-metric remains free)",
      "AGENT_PROTOCOL/process notes: recorded the snooze collision-discard outcome",
      "Verified via npm run build/lint/test, then npm run dev: inserted a synthetic status=new client_inquiries row via node:sqlite, loaded /dashboard/leads, confirmed the Reply button renders for it",
    ],
    decisions: BUSINESS_DECISIONS.slice(76, 79),
  },
  {
    date: "2026-07-12",
    branch: "claude/relaxed-galileo-sgx9h1",
    summary:
      "Independently claimed inquiry-mark-read-on-composer-open ~1m40s before claude/upbeat-dijkstra-y2c9ib's claim and shipped an equivalent implementation behind a tested pure predicate. On merge, folded to a single implementation (kept the tested helper, dropped the inline duplicate) per the collision protocol. While runtime-verifying, found and fixed a critical pre-existing bug, unrelated to either branch's feature: every operator server action on /dashboard/leads (Mark read, Archive, Reply, Snooze, notes, billing portal) was 500ing in dev because actions.ts re-exported two types through the \"use server\" boundary, which Turbopack misregisters as server action references. Confirmed with Playwright the bug predates this iteration (reproduced on main pre-fix) and is now fixed on main via this merge.",
    shipped: [
      "src/lib/inquiries/reply.ts — inquiryShouldAutoMarkRead(inquiry, isOpeningComposer) pure predicate (kept over upbeat-dijkstra-y2c9ib's inline equivalent on merge)",
      "src/lib/inquiries/reply.test.ts — new/open, close, and past-new status cases",
      "src/app/dashboard/leads/actions.ts — removed dead `export type { DeployHandoff, ClientInquiry }` from this \"use server\" file (unused elsewhere; leads-client.tsx already imports both types from their source modules) and the now-unused DeployHandoff/ClientInquiry type imports; this was crashing module evaluation of the entire actions bundle with `ReferenceError: DeployHandoff is not defined` on every action call",
      "AGENT_PROTOCOL — \"use server\" files may only export async functions; no type re-exports, even ones that look inert",
      "Verified via npm test (122 passed) + lint + build, then npm run dev with Playwright driving /dashboard/leads: reproduced the crash pre-fix (Mark read button 500s), confirmed clean post-fix (Mark read disappears + composer opens on Reply click), and loaded /preview/[slug] + /docs/process",
    ],
    decisions: BUSINESS_DECISIONS.slice(76, 77),
  },
  {
    date: "2026-07-12",
    branch: "claude/quirky-davinci-pewiht",
    summary:
      "Shipped operator-daily-digest-email, the last free NEXT_STEPS item from the prior iteration's queue: a pure aggregator over the already-shipped scorer + due-queue functions, rendered to email HTML, sent via a dedicated Resend path, and triggered from a new button on /dashboard/leads.",
    shipped: [
      "src/lib/digest/daily-digest.ts — buildDailyDigest (Work next top 5, follow-ups due, abandoned-checkout recoveries due, unreplied inquiries, cold-lead count) + renderDailyDigestHtml, both pure/testable",
      "src/lib/digest/daily-digest.test.ts — 10 cases covering empty state, each section, threshold edges, HTML escaping",
      "src/lib/email/resend.ts — sendOperatorDailyDigest(to, html): same Resend/mock path as other senders, skips suppression + CAN-SPAM footer since the recipient is the operator, not a prospect",
      "src/app/dashboard/leads/actions.ts — sendDailyDigestAction(): requireOperatorAuth, requires OPERATOR_DIGEST_EMAIL, loads leads/inquiries/open checkout sessions, builds + sends the digest",
      "src/components/dashboard/daily-digest-button.tsx — new client component, 'Send daily digest' button + inline success/error status",
      "src/app/dashboard/leads/page.tsx — renders the button in the page header",
      ".env.example — documented OPERATOR_DIGEST_EMAIL",
      "src/app/docs/launch-checklist — added a digest verification step to the Outreach section",
      "Verified via npm test (139 passed) + lint + build, then npm run dev with Playwright: clicked Send daily digest on /dashboard/leads with OPERATOR_DIGEST_EMAIL set, confirmed the mock Resend log showed the rendered HTML and the button reported '3 items to act on' against the seeded demo leads",
    ],
    decisions: BUSINESS_DECISIONS.slice(80, 83),
  },
  {
    date: "2026-07-12",
    branch: "cursor/prompt-process-evolution-9ebb",
    summary:
      "Same-cron sibling business-process-evolution-89f2 claimed cold-lead-archive-action first; pivoted to snoozed-leads-pipeline-metric. Folded currently-snoozed counts + soonest return into pipeline-health, a Snoozed metric card + callout, and a Work next footnote (not a second queue). Queued follow-ups-due-pipeline-metric + optional snoozed-leads-in-digest. Extended AGENT_PROTOCOL revenue preference chain.",
    shipped: [
      "src/lib/metrics/pipeline-health.ts — snoozedLeadCount + soonestSnoozeRemainingHours via isLeadSnoozed",
      "src/lib/metrics/pipeline-health.test.ts — expired vs active snooze + soonest-hours cases",
      "src/components/dashboard/pipeline-health-panel.tsx — Snoozed metric card + callout",
      "src/app/dashboard/leads/leads-client.tsx — Work next footnote when any lead is snoozed",
      "Docs: architecture, roadmap Phase 2/5, launch-checklist snooze verification",
      "NEXT_STEPS: snoozed-leads-pipeline-metric done; follow-ups-due-pipeline-metric + snoozed-leads-in-digest queued",
      "AGENT_PROTOCOL — revenue preference chain includes cold-lead archive / snoozed aggregates",
    ],
    decisions: BUSINESS_DECISIONS.slice(83, 86),
  },
  {
    date: "2026-07-12",
    branch: "cursor/business-process-evolution-89f2",
    summary:
      "Shipped cold-lead-archive-action: one-click Re-engage / Close for Cold-badged leads. Added terminal LeadPipelineStage closed, pure planColdLeadDisposition helpers + Vitest, Convex/SQLite applyColdLeadDisposition, disposeColdLeadAction, Cold leads dashboard panel + row actions. Closed leads drop off Work next and cold counts. Merged 9ebb snoozed aggregates (both ITERATIONS kept). Queued optional closed-leads-pipeline-metric + reengage-send-email1-option alongside 9ebb's follow-ups-due / snoozed-in-digest todos.",
    shipped: [
      "src/lib/leads/cold-archive.ts (+ .test.ts) — planColdLeadDisposition, disposition labels",
      "LeadPipelineStage closed on types + Convex stageValidator + schema comment + stage count maps",
      "src/lib/leads/quality-score.ts — closed → actionable=false; factor id closed",
      "src/lib/db.ts + convex/leads.applyColdDisposition — single-write stage/outreach/snooze patch",
      "disposeColdLeadAction + Cold leads panel + table Re-engage/Close buttons",
      "Docs: roadmap Phase 2, architecture, launch-checklist",
      "NEXT_STEPS: cold-lead-archive-action done; closed-leads-pipeline-metric + reengage-send-email1-option queued (with 9ebb follow-ups-due + snoozed-in-digest)",
      "merge: folded prompt-process-evolution-9ebb snoozed-leads-pipeline-metric (PR #37)",
    ],
    decisions: BUSINESS_DECISIONS.slice(86, 89),
  },
  {
    date: "2026-07-12",
    branch: "claude/relaxed-galileo-n2jurd",
    summary:
      "Sibling claude/upbeat-dijkstra-ea3tow claimed marketing-content-generation ~3 minutes before this run started; claimed follow-ups-due-pipeline-metric instead, the top remaining non-optional NEXT_STEPS item. Folded listFollowUpsDue's existing isFollowUpDue predicate into pipeline-health as followUpsDueCount + oldestFollowUpDueAgeHours, a metric card + operator callout on the pipeline-health panel, Vitest, and docs.",
    shipped: [
      "src/lib/metrics/pipeline-health.ts — followUpsDueCount + oldestFollowUpDueAgeHours via isFollowUpDue",
      "src/lib/metrics/pipeline-health.test.ts — zero-state + due-count/oldest-age cases (exhausted/not-yet-due excluded)",
      "src/components/dashboard/pipeline-health-panel.tsx — Follow-ups due metric card + operator callout linking to /dashboard/leads",
      "Docs: architecture, roadmap Phase 2, launch-checklist follow-ups-due verification step",
      "NEXT_STEPS: follow-ups-due-pipeline-metric done; snoozed-leads-in-digest, closed-leads-pipeline-metric, reengage-send-email1-option remain free",
      "Verified via npm test (150 passed) + lint + build, then npm run dev: mutated the seeded serene-salon row to outreachStep=1 / lastOutreachAt 4 days ago via node:sqlite, confirmed 'Follow-ups due: 1 · Oldest since Email 4d' on the pipeline-health panel and the operator callout on /dashboard/leads, then reset the row",
    ],
    decisions: BUSINESS_DECISIONS.slice(89, 90),
  },
];
