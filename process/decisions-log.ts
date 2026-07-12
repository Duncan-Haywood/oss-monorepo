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
  {
    date: "2026-07-12",
    title: "Capture checklist scales per-bed/bath instead of a fixed shot count",
    decision:
      "process/capture-checklist.ts's secondary bedroom and secondary bathroom entries are now per-additional-unit rooms (one wide shot per extra bed, one per extra bath) instead of a single fixed 'secondary-rooms' entry. pipeline/'s coverage check and CLI take optional --beds/--baths (total counts for the listing); omitting them falls back to a typical ~3-bed/2-bath home. New fixed detail shots were also added (entry detail, living-room feature, dining area, kitchen finish detail, primary closet, primary vanity/tub, a flex space) to round out the room-by-room coverage.",
    rationale:
      "process/outreach-templates.ts's cold-outreach copy already promises prospects '15-25 enhanced, MLS-ready photos', but the checklist as originally built specified only ~9-11 fixed shots regardless of home size — an unbacked promise the moment a real prospect responds. A fixed count was also structurally wrong: a studio and a 5-bed house shouldn't get the same shot list. The typical-home default now produces 19 shots (inside the promised range); a 5-bed/3-bath listing produces 22; a 0-extra-bed/bath listing produces 16 — all still land in or near the 15-25 range mls-compliance.ts cites as the competitive best-performing count on major portals.",
    madeBy: "claude/dazzling-allen-luc0w5",
    relatedTaskIds: ["p2-capture-checklist-scaling", "p2-ai-pipeline", "p2-outreach-templates"],
  },
  {
    date: "2026-07-12",
    title: "Add CI workflow to automatically gate pipeline tests + docs-site/research builds",
    decision:
      "Added .github/workflows/ci.yml, running on every push and pull_request: pipeline/'s `npm test` + `tsc --noEmit`, plus `npm run build` in docs-site/ and research/. This is separate from the existing deploy-docs.yml, which only builds+deploys docs-site on pushes to main.",
    rationale:
      "prompt_process.tsx step 7 has always told each agent session to manually run these checks before pushing, but with multiple agent branches active concurrently (git ls-remote showed 4 claude/* and 4 cursor/* branches at once this session), a manual-only gate is easy to skip and a regression from one branch could reach main undetected. Automating it costs nothing (agent-buildable, no real spend, uses GitHub's free Actions minutes) and directly helps cross-agent cooperation by catching breakage before merge instead of relying on the next session noticing.",
    madeBy: "claude/dazzling-allen-luc0w5",
    relatedTaskIds: ["p0-ci"],
  },
  {
    date: "2026-07-12",
    title: "Lead intake stays a validated append-only CLI, not a form/backend",
    decision:
      "process/leads-log.ts entries can now be added via `npm run log-lead` in pipeline/ (pipeline/src/log-lead.ts) instead of only by hand-editing the TypeScript array. The tool requires every field as explicit input (no defaults, no fabricated content), validates audience/channel/stage against the existing typed enums, supports --dry-run to preview before writing, and is covered by a self-test that only operates on an in-memory copy of the file shape — it never touches the real leads-log.ts during npm test.",
    rationale:
      "Two prior sessions' progress-log nextUp entries flagged the same gap: the highest-leverage remaining task (p2-first-deliveries) depends on a human logging real replies fast, and hand-editing a TypeScript array is real friction at the exact moment (right after a prospect responds) a human is least likely to open an editor. A small CLI removes that friction without adding a database, a form, or any new infrastructure — consistent with the scope guard against over-engineering backend/auth. It deliberately still requires a human to type real values in; the tool formats and validates, it does not decide what a lead's stage is.",
    madeBy: "claude/dazzling-allen-y9fqb5",
    relatedTaskIds: ["p2-lead-intake-tool", "p2-leads-tracking", "p2-first-deliveries"],
  },
  {
    date: "2026-07-12",
    title: "Future virtual-staging Polish step will call a cloud API, not on-device Core ML",
    decision:
      "When the Polish step's AI virtual-staging feature is eventually built, it will call a pay-per-image cloud API (e.g. a Virtual Staging AI-style vendor, roughly $1-2/image) rather than running Stable-Diffusion-class inpainting on-device via Core ML. See process/virtual-staging-tech.ts for the full comparison and sources.",
    rationale:
      "Desk research on both real-estate-specific virtual-staging vendors and general mobile-ML architecture agrees the crossover point where on-device/custom infrastructure beats a pay-per-call API is roughly 1,000-15,000+ images/month — Listing Lens has zero real deliveries yet (p2-first-deliveries is still human-blocked) and no iOS app (phase 3 not started). A cloud API adds zero fixed cost until a real paid listing needs it and requires no new app/ML infrastructure, keeping this decision consistent with the existing scope guard against building the iOS app or over-engineering infrastructure in phase 1-2. On-device Core ML diffusion is technically feasible on iPhone 15 Pro-class hardware (~8-15s/image per Apple's own research) but would also gate quality/availability by device tier, which a $19 'good enough, fast, cheap' concierge offer shouldn't take on this early. Revisit once an app exists and real monthly staging volume approaches the crossover range.",
    madeBy: "claude/dazzling-allen-q7uwlq",
    relatedTaskIds: ["p1-virtual-staging-tech", "p2-ai-pipeline", "p3-app-scope"],
  },
  {
    date: "2026-07-12",
    title: "Close duplicate PR #13 rather than merge overlapping virtual-staging research",
    decision:
      "PR #13 (branch claude/dazzling-allen-vstaging-2937) and PR #14 (branch claude/dazzling-allen-q7uwlq) independently answered STRATEGY.md's same 'on-device vs cloud for virtual staging' open question within about 10 minutes of each other, reaching the same recommendation (low-cost pay-per-image cloud API, not on-device, deferred until real volume/an app exists). #14 merged first; #13 was closed unmerged with a comment pointing to #14, rather than merged as a second, overlapping process/virtual-staging-*.ts file. AGENT_PROCESS_INSTRUCTIONS (prompt_process.tsx) gained a new step 2a — claim a task by committing its in_progress status to main as the first action of a session — to reduce how often this race recurs.",
    rationale:
      "Two independent research passes agreeing is a mild positive signal for the decision itself, but landing both artifacts would leave two near-duplicate files and two duplicate roadmap tasks with no added value, which is worse for future-agent clarity than picking one. This is exactly the scenario prompt_process.tsx step 8 (check other open PRs before merging) exists to catch, and it worked as designed here — the fix is making the race less likely to happen at all, not changing the merge-conflict-resolution step itself.",
    madeBy: "claude/checklist-novice-audit",
    relatedTaskIds: ["p1-virtual-staging-tech"],
  },
  {
    date: "2026-07-12",
    title: "Zillow listing audit gets a fixed 6-dimension scoring rubric before any real listings are collected",
    decision:
      "Added process/listing-audit-rubric.ts: 6 concrete 1-5 dimensions (lighting/exposure, composition/angle, staging/declutter, photo count/coverage, resolution/sharpness, color/white balance), each with explicit worst-vs-best guidance, plus computeOverallScore() (rescales the dimension average to STRATEGY.md's 1-10 'blind quality rating' scale) and auditSummary(). The rubric ships with an empty listingAuditLog — no fabricated listings.",
    rationale:
      "p1-listing-audit has stayed human-blocked since the repo's first commit, but the blocker was never just 'needs a human to browse Zillow' — nothing defined what 'mediocre' vs 'excellent' meant, or how 20 scored listings become the single 1-10 number the day-90 success bar (>= 7/10) depends on. An undefined rubric risks inconsistent scoring across listings or a rescore later. This mirrors interview-script.ts's existing scoreWillingnessToPay() pattern: agents can't run the human step, but they can make the instrument objective and ready ahead of time so the human's only remaining job is picking a metro and looking at listings.",
    madeBy: "claude/dazzling-allen-j509d4",
    relatedTaskIds: ["p1-listing-audit", "p1-listing-audit-rubric"],
  },
  {
    date: "2026-07-12",
    title: "Formalize p3-app-scope's sequencing as a code-enforced gate, not a repeated note",
    decision:
      "Added an optional gatedOn: string[] field to RoadmapTask (process/types.ts) and an isGateSatisfied() check in nextActionableTasks() (process/roadmap.ts). p3-app-scope is now gatedOn: ['p1-run-interviews', 'p2-first-deliveries'], so it no longer appears in nextActionableTasks() output until both produce real validation data, even though its own status stays 'not_started'. The docs-site dashboard renders a 'Gated on: ...' note on any task whose gate isn't satisfied yet.",
    rationale:
      "Every session since p3-app-scope was added (7+ in a row) has independently re-derived and repeated the same instruction in progress-log.ts: 'do not start p3-app-scope yet, it's sequenced after interview + concierge validation data exists.' That reasoning lived only in prose, scattered across nextUp entries, with no code enforcement — a single session skimming only roadmap.ts + prompt_process.tsx (not the full progress-log history) could plausibly have started it, since nextActionableTasks() was structurally including it as an owner:'both'/not_started task. This is exactly the kind of process gap AGENT_PROCESS_INSTRUCTIONS step 4 asks a session to fix when there's no direct product-doable gap left: turning a repeatedly-restated tribal rule into an enforced, greppable precondition.",
    madeBy: "real-estate-photography-continuous-improvement",
    relatedTaskIds: ["p3-app-scope", "p0-process-system"],
  },
  {
    date: "2026-07-12",
    title: "Booking link is a mailto:, not a hosted landing page",
    decision:
      "Added process/booking-link.ts: a mailto: link addressed to Duncan's real inbox, pre-filled with outreach-templates.ts's bookingIntakeFields as fill-in-the-blank prompts. This replaces the literal '[Phone / booking link]' placeholder in the cold-email/brokerage-intro templates and pricing-one-pager.tsx's callToAction (which told prospects to 'scan the QR code' — no QR code has ever existed). Considered and deferred: a hosted public booking/landing page. research/ builds locally but is deployed nowhere; docs-site is deployed but access-gated to Duncan's email only, so it can't host a public booking page without either removing Access (a real Cloudflare Access production change, guardrailed against without confirmation) or standing up a second Cloudflare Pages project (a new domain/infra decision, plus doesn't fit here as a same-session code diff).",
    rationale:
      "This has been a real, silent gap for weeks: every prior session built prep material (checklist, pricing, outreach copy, pipeline, lead intake) on the assumption a prospect could eventually book, but nothing ever made that step possible — the templates and one-pager pointed at things that didn't exist. A mailto: link costs nothing, needs no new infrastructure, needs no domain/hosting decision, and doesn't touch the guardrailed Cloudflare Access policy, so it's fully agent-buildable within existing constraints. A hosted form (Formspree/Tally/a public Pages project) would convert somewhat better but is a bigger, separable decision (which service, whether it's worth a second public deploy before any revenue exists) that should wait for Duncan's input rather than an agent silently standing up new infrastructure.",
    madeBy: "claude/dazzling-allen-ucfuio",
    relatedTaskIds: ["p2-booking-link", "p2-outreach-templates", "p2-pricing-page"],
  },
];
