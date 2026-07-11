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
 * Prioritized backlog. When you pick one up: set status to "in_progress"
 * and owner to your branch name in the same commit you start the work in,
 * so concurrent agents on other branches don't duplicate it. Add new items
 * as they're discovered — don't delete completed ones, mark them "done".
 */
export const NEXT_STEPS: NextStep[] = [
  {
    id: "stripe-price-objects",
    summary:
      "Create Stripe Price objects (test + live) for Starter/Growth/Complete setup + monthly, and Commerce add-on; set STRIPE_PRICE_ID_* env vars.",
    status: "todo",
    phase: "Phase 3 — Payments",
  },
  {
    id: "stripe-webhook",
    summary:
      "Add /api/stripe/webhook: verify signature, handle checkout.session.completed → mark lead paid, trigger production deploy + receipt email.",
    status: "in_progress",
    phase: "Phase 3 — Payments",
    owner: "claude/relaxed-galileo-nj7oy0",
  },
  {
    id: "database",
    summary:
      "Pick a database (Postgres vs Convex — see /docs/architecture) and wire lead + order persistence; replace static pipeline counts in /dashboard/leads.",
    status: "todo",
    phase: "Phase 1 — Website foundation",
  },
  {
    id: "category-templates",
    summary: "Build category-specific preview templates (restaurant, salon, trades) beyond the generic placeholder at /preview/[slug].",
    status: "todo",
    phase: "Phase 1 — Website foundation",
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
    decisions: BUSINESS_DECISIONS.slice(2),
  },
];
