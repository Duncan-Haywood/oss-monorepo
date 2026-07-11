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
  "Prefer the highest-leverage todo that unblocks revenue (payments → conversion templates → persistence → outreach), unless another agent already owns it.",
  "Append ITERATIONS and BUSINESS_DECISIONS — never rewrite prior entries. Mark completed steps done; do not delete them.",
  "Ship TS/TSX for product + docs. Do not add operator Markdown docs (AGENTS.md rule).",
  "One focused iteration per run: leave the repo buildable, update this file, open/merge a PR when the iteration is coherent.",
  "If another branch already owns an item, pick the next free todo or improve process/docs — do not duplicate.",
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
      "Operator: run POST /api/stripe/bootstrap-prices with ALLOW_STRIPE_BOOTSTRAP=1 (test + live), paste envSnippet into secrets, unset the flag. Bootstrap code already shipped.",
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
      "Stand up Convex (chosen over Postgres for this app) for lead + order persistence; replace demo catalog counts in /dashboard/leads; wire webhook fulfillment to mark leads paid.",
    status: "done",
    phase: "Phase 1 — Website foundation",
    owner: "claude/convex-database-persistence",
  },
  {
    id: "lead-ingestion",
    summary: "Google Places API ingestion or CSV import for manual lead entry — legal review first, see /docs/compliance.",
    status: "todo",
    phase: "Phase 4 — Data ingestion",
  },
  {
    id: "outbound-email",
    summary: "Wire Resend for outreach Email 1 (preview link) with CAN-SPAM footer and suppression list.",
    status: "todo",
    phase: "Phase 2 — Outreach + platform voice",
  },
  {
    id: "manual-lead-entry",
    summary:
      "Operator UI or authenticated API to add/edit a lead (slug, category, stage) into Convex — unblocks non-demo previews without scraping.",
    status: "done",
    phase: "Phase 1 — Website foundation",
    owner: "claude/convex-database-persistence",
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
    decisions: [BUSINESS_DECISIONS[6]],
  },
];

