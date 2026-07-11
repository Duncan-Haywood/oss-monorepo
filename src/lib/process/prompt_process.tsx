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
  "Prefer the highest-leverage todo that unblocks revenue (payments → conversion templates → persistence → outreach → lead volume → operator auth → fulfill/deploy → client inquiry CRM → follow-ups → metrics → checkout attribution), unless another agent already owns it.",
  "When remaining NEXT_STEPS are operator- or legal-gated, ship the next free product-promise gap (what Starter sells but preview lacks) or operator leverage (follow-ups, metrics, inbox, attribution) — still claim it first.",
  "If the top free todo is already claimed on a sibling remote branch, immediately claim the next free todo and push — do not wait or idle on process-only edits.",
  "Append ITERATIONS and BUSINESS_DECISIONS — never rewrite prior entries. Mark completed steps done; do not delete them. Supersede outdated decisions with a new dated entry.",
  "Ship TS/TSX for product + docs. Do not add operator Markdown docs (AGENTS.md rule).",
  "One focused iteration per run: leave the repo buildable, update this file, open/merge a PR when the iteration is coherent.",
  "If another branch already owns an item, pick the next free todo or improve process/docs — do not duplicate. Close competing PRs rather than merging a second backend.",
  "If two hourly automations claim the same free todo in the same window: merge the branches (keep both process iterations), do not open a second competing PR for the same feature surface.",
  "For database-touching changes: `npm run build`/`lint` alone is not enough — run `npm run dev` and load /dashboard/leads and /preview/[slug] before claiming done.",
  "Operator-gated steps (Stripe bootstrap, live DNS, counsel review) stay status=todo with clear operator instructions; agents ship code + checklists, not fake completion.",
  "Use Next.js 16 `proxy.ts` (not deprecated `middleware.ts`) for request gating; always re-check auth inside server actions — proxy alone is not enough.",
  "Before merging: fetch sibling automation branches (`cursor/business-process-evolution-*`, `cursor/prompt-process-evolution-*`); if they shipped overlapping files, merge their branch into yours and keep both ITERATIONS entries.",
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
      "Optional scale-up: isolate each paid client on its own Vercel project (or multi-tenant routing rules) instead of shared project + path/host conventions.",
    status: "todo",
    phase: "Phase 5 — Production deploy",
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
    decisions: BUSINESS_DECISIONS.slice(30, 32),
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
    decisions: BUSINESS_DECISIONS.slice(32),
  },
];
