import type { BusinessDecision } from "./types";

/**
 * Append-only log of business decisions. Never rewrite history — if a
 * decision is reversed, add a new entry that supersedes it and say so in
 * `rationale`. This is what lets a new agent session understand *why*
 * things are the way they are without re-reading every prior diff.
 */
export const decisionsLog: BusinessDecision[] = [
  {
    date: "2026-06-13",
    title: "Lead with agents, not Airbnb/STR hosts",
    decision:
      "Listing Lens leads with mid-market real estate agents as the primary subscription wedge. Airbnb/STR hosts are a secondary, product-led, one-time-pack market.",
    rationale:
      "Agents have recurring demand (4-12 listings/month) and a clear spend anchor (photographer invoices). Single-property STR hosts are episodic and churn-prone; multi-property managers behave like agents but are a smaller pool.",
    madeBy: "initial-scaffold",
  },
  {
    date: "2026-06-13",
    title: "Pricing anchors set at $29-99/mo and $19-79/listing",
    decision:
      "Starter $29/mo, Agent Pro $79/mo, Team $249/mo (agents/brokerages); Host pack $19-79/listing (STR). Validation pricing starts lower: $19/listing concierge, $8-15/listing transactional test.",
    rationale:
      "Anchored against real agent photography spend (~$150-500/listing or $300-1,200 opportunity cost) and STR payback data (photography ROI in ~1 night for 85% of hosts).",
    madeBy: "initial-scaffold",
  },
  {
    date: "2026-06-13",
    title: "Scope guard: no iOS app, no backend/auth build-out in phase 1",
    decision:
      "Do not build the iOS app or over-engineer backend/auth/Convex until problem interviews and a concierge MVP validate willingness to pay.",
    rationale:
      "STRATEGY.md's 90-day plan is interview-first, concierge-MVP-second, app-third. Building the app before validation risks wasted engineering effort on the wrong wedge.",
    madeBy: "initial-scaffold",
    relatedTaskIds: ["p2-first-deliveries", "p3-app-scope"],
  },
  {
    date: "2026-07-11",
    title: "Adopt a typed TS/TSX process system for cross-agent coordination",
    decision:
      "Track roadmap, decisions, and progress in process/*.ts(x) instead of ad-hoc markdown. Docs (strategy, deployment, etc.) also default to TS/TSX going forward unless there's a strong reason to use plain markdown.",
    rationale:
      "Multiple agents (this session, plus 'cursor/*' branches) work this repo independently on different schedules with no shared memory beyond git history. A typed, greppable, buildable process file gives every session a fast, structured way to see what's done, what's blocked on a human, and what to do next — cheaper than re-deriving state from STRATEGY.md prose and commit logs each run. TS/TSX also lets the process render directly as a page on the private docs site instead of staying a file nobody reads.",
    madeBy: "claude/dazzling-allen-wg8i3m",
    relatedTaskIds: ["p0-process-system"],
  },
  {
    date: "2026-07-11",
    title: "Concierge MVP offer terms locked for outreach",
    decision:
      "The first concierge offer to prospects is: $19/listing flat, 15-25 enhanced MLS-ready photos, delivered within 1 business day, free re-edit guarantee if unhappy. Outreach stays manual/one-at-a-time (email, DM, in-person, brokerage intro) — no bulk or automated sending.",
    rationale:
      "STRATEGY.md set the $19/listing validation price and 'deliver in under 2 hours' target loosely; a concrete, single offer with a guarantee is needed before any human can actually pitch a prospect. 1-business-day turnaround (vs. STRATEGY's 'under 2 hours') is the honest agent-achievable claim until a real delivery pipeline is timed end-to-end; tighten this claim once p2-first-deliveries produces real turnaround data. Manual-only outreach avoids spam/compliance risk while the offer is unvalidated.",
    madeBy: "claude/dazzling-allen-cpghie",
    relatedTaskIds: ["p2-pricing-page", "p2-outreach-templates", "p2-first-deliveries"],
  },
  {
    date: "2026-07-11",
    title: "Enhancement pipeline is a local deterministic CLI, not a cloud AI API",
    decision:
      "The Phase 2 'manual AI pipeline' is a local Node/TypeScript CLI (pipeline/, using sharp) doing auto-orient, per-channel contrast/white-balance normalization, sharpening, resize, and MLS-ready renaming — not a call to a paid cloud vision/image API.",
    rationale:
      "Every prior session described the Enhance step in prose but none built it, leaving the 1-business-day turnaround claim in the pricing one-pager unbacked by anything runnable. A local pipeline is free to run (no per-image API cost, no API key setup) and fully agent-buildable/testable without real listing photos or human sign-off on spend, matching the 'no spend of real money' guardrail in prompt_process.tsx. It intentionally does not attempt virtual staging, twilight conversion, or object removal — those stay the human/cloud 'Polish' step per STRATEGY.md's 5-step workflow, and can graduate to a paid API once concierge revenue justifies the cost.",
    madeBy: "claude/dazzling-allen-rkmj0x",
    relatedTaskIds: ["p2-ai-pipeline", "p2-first-deliveries"],
  },
  {
    date: "2026-07-11",
    title: "MLS photos stay unbranded; virtual staging (when built) defaults to the strictest disclosure",
    decision:
      "Two guardrails going forward, based on public MLS-board rules research (process/mls-compliance.ts): (1) the pipeline/ enhancement CLI and any future 'Brand' step must never write agent/brokerage names, logos, watermarks, or contact info onto MLS-submitted photo files — branding stays confined to marketing collateral like a property microsite or flyer. (2) If/when a Polish-step virtual staging feature is built, it must default to the strictest disclosure behavior available (a visible 'Virtually Staged' caption on the altered image, plus keeping the original unaltered photo in the delivery) regardless of which state/board the listing is in, since the pipeline has no reliable way to detect that at run time.",
    rationale:
      "Roughly three-quarters of states now require some form of virtual-staging disclosure, several (including California, effective Jan 1 2026) require a per-image label, and MLS boards fine broker accounts automatically (no notice) for branding on submitted media — real financial and compliance risk to a business that doesn't exist yet to absorb it. The current pipeline already complies (no watermarking, no branding) by construction; this decision makes that an explicit constraint instead of an accident, so a future session adding the 'Brand' or 'Polish' step doesn't regress it.",
    madeBy: "claude/dazzling-allen-7i8o70",
    relatedTaskIds: ["p1-mls-compliance", "p2-ai-pipeline", "p3-app-scope"],
  },
];
