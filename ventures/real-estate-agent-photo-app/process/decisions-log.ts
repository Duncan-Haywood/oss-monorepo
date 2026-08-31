import type { BusinessDecision } from "./types";

/**
 * Append-only log of business decisions. Never rewrite history — if a
 * decision is reversed, add a new entry that supersedes it and say so in
 * `rationale`. This is what lets a new agent session understand *why*
 * things are the way they are without re-reading every prior diff.
 */
export const decisionsLog: BusinessDecision[] = [
  {
    date: "2026-08-24",
    title: "Keep preflight records local and downloadable",
    decision:
      "The MLS photo preflight browser tool exports a dated Markdown findings record locally; it does not upload photos, create accounts, or store customer media on portfolio infrastructure.",
    rationale:
      "Agents need an artifact to keep beside a delivery folder, but a hosted upload path would add privacy, retention, and operational liability before demand is proven. A browser-generated record delivers the value at zero variable cost while preserving the explicit boundary that file-header checks are not a board acceptance warranty.",
    madeBy: "session/agent_0f91c692-9c76-4ae5-bc98-79b2014f706e",
    relatedTaskIds: ["p2-photo-preflight-record"],
  },
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
  {
    date: "2026-07-12",
    title: "Property microsite is a self-contained static HTML file, not a hosted page",
    decision:
      "Added pipeline/src/microsite.ts + cli-microsite.ts: reads an already-enhanced delivery folder and writes one index.html gallery page (agent name/logo/headshot/contact, plus the delivered photos) alongside the existing photo files. Deliberately a static file the agent hosts/forwards however they like (email attachment, drag into any free static host, open locally) rather than a new deployed service — same reasoning as the booking-link decision: no new domain/hosting/Cloudflare Access decision, zero infra cost, fully agent-buildable today.",
    rationale:
      "STRATEGY.md's 5-step workflow (Guide -> Enhance -> Polish -> Deliver -> Brand) had 4 of 5 steps built or explicitly deferred (Polish/virtual-staging), but 'Brand' — agent headshot, logo, and property microsite — had never been started; every session since the repo's first commit focused on outreach/pricing/tracking prep, not on finishing the product itself. This closes that gap without opening a new scope debate: it never touches the underlying MLS-bound photo files (enforces the same no-branding-on-MLS-photos guardrail from process/mls-compliance.ts by construction, since it only ever writes one new HTML file next to them, never overwrites them), and needs no real agent logo/headshot to exist yet (both fields are optional, never fabricated).",
    madeBy: "claude/dazzling-allen-v3kn1n",
    relatedTaskIds: ["p2-brand-microsite", "p2-ai-pipeline", "p1-mls-compliance"],
  },
  {
    date: "2026-07-12",
    title: "Lead with agent-led PLG; sequence brokerage sales as a later expansion step",
    decision:
      "Added process/gtm-motion.ts, closing STRATEGY.md's last unaddressed open question (brokerage sales cycle vs agent PLG; the other, v1 app scope, is correctly deferred via p3-app-scope's gatedOn). Desk research (general B2B SaaS sales-cycle benchmarks, PLG-vs-sales-led literature, and 2026 real-estate-specific AI-tool-adoption reporting) supports leading with bottom-up agent PLG now and treating a brokerage-led sales motion (STRATEGY.md's $249/mo Team tier) as a Month-3 expansion step that comes after real paying agent customers exist, not a parallel or earlier motion.",
    rationale:
      "This doesn't change STRATEGY.md's existing 90-day plan (agent interviews and concierge MVP first, brokerage pilot in Month 3) — it answers the open question with sourced reasoning instead of leaving the checkbox unticked. The strongest single piece of evidence: 2026 real-estate-specific reporting (Inman, May 2026) found brokerages already buying AI/tech licenses and announcing them internally, then individual-agent adoption stalling within about 90 days, with agents defaulting back to their own preferred tools even after a brokerage-wide purchase. A brokerage-led motion here risks closing a Team-tier contract with near-zero real usage and no fast signal; an agent-led PLG motion (a $19 concierge delivery is functionally a paid trial) produces a direct pay/no-pay signal per prospect, which is what phase 2 actually needs. General B2B SaaS data reinforces this: PLG motions convert faster and post better Rule-of-40 scores than pure sales-led motions, and hybrid PLG-then-sales-assist outperforms either motion alone once real usage exists to sell into.",
    madeBy: "real-estate-photography-continuous-improvement-2",
    relatedTaskIds: ["p4-gtm-motion", "p2-first-deliveries"],
  },
  {
    date: "2026-07-13",
    title: "Consolidate human-blocker tracking into one file (process/blockers.ts)",
    decision:
      "Added process/blockers.ts as the single source of truth for what's blocked on a human right now, replacing three separately hand-maintained copies of the same ~5 facts (README.md prose, roadmap.ts blockedReason fields, and a fresh progress-log.ts paragraph almost every session). A session that re-checks and finds nothing changed now bumps a blocker's lastConfirmed/confirmedByCount field instead of writing a new progress-log entry; README.md and prompt_process.tsx's dashboard both read from blockers.ts instead of maintaining their own prose list.",
    rationale:
      "By this date, roughly two dozen agent sessions in a row had found every agent-doable roadmap task already done and spent part of the session re-describing the same 5 human-blocked items in prose, each written independently. This is real, observable waste (progress-log.ts had grown to ~300 lines with much of it repeating 'still blocked, nothing changed') and a real drift risk (three independently hand-written copies of the same facts can silently disagree — README's blocker list and roadmap.ts's blockedReason text were already independently worded even though they describe the same underlying facts). This doesn't resolve any blocker or invent agent-doable work where none exists; it's the kind of process-improvement session prompt_process.tsx's step 4 explicitly allows when nothing else is actionable, aimed specifically at a failure mode this repo's own history demonstrates.",
    madeBy: "claude/dazzling-allen-k4o1nz",
    relatedTaskIds: ["p0-docs-site", "p1-run-interviews", "p1-listing-audit", "p2-first-deliveries"],
  },
  {
    date: "2026-07-13",
    title: "Patch docs-site/research off next@14.1.0 to next@14.2.35 (same major); defer the full next@16 migration",
    decision:
      "Bumped `next` from 14.1.0 to 14.2.35 in both docs-site/ and research/ (patch-only within the same major version, no App Router / config API changes needed). Verified `npm run build` still passes clean in both. Deliberately did NOT go further to next@16.x, which is the only version `npm audit` reports as clearing every currently-known advisory for this package (npm's audit range for `next` was reported as a single span from 9.3.4-canary.0 up to 16.3.0-canary.5, i.e. it considers all of 14.x and 15.x still partially vulnerable to at least one advisory in that combined set) — that's a major-version App Router migration with real breaking-change risk, not a same-session patch bump, and this repo has no automated visual/e2e regression coverage for docs-site or research to catch a silent breakage before a human notices.",
    rationale:
      "`npm install` was printing `next@14.1.0: This version has a security vulnerability` on every session that happened to touch docs-site or research, and `npm audit` on 14.1.0 listed 14 next.js advisories (several critical: DoS via Image Optimizer, HTTP request smuggling in rewrites, middleware authorization bypass, RSC cache poisoning) that no prior session had noticed or acted on — it was pure incidental noise in install logs until this session actually read it. The patch bump closes the specific, already-fixed-in-14.x-line vulnerabilities at zero behavioral risk (build output is byte-for-byte the same route structure, verified). Doing the full 14->16 jump unilaterally in an hourly automated session — especially right when p0-docs-site is about to go from Access-blocked-but-live to actually protected once PR #4 merges — is exactly the kind of change that needs a human able to click through the deployed site afterward, not an agent's local `npm run build` passing as the only signal. Left as a flagged, scoped follow-up rather than either ignoring it (prior status quo) or attempting it blind.",
    madeBy: "real-estate-photography-continuous-improvement-2",
    relatedTaskIds: ["p0-docs-site", "p0-research-site"],
  },
  {
    date: "2026-07-13",
    title: "Collect the $19 concierge payment via Zelle (primary) / PayPal goods & services (fallback)",
    decision:
      "process/payment-collection.ts defines how a concierge customer actually pays: lead with Zelle (zero fee, fastest, bank-to-bank) to duncan.andrew.haywood@gmail.com, with PayPal goods & services (~$0.85 fee on $19, buyer protection) as the fallback for prospects whose bank doesn't support Zelle or who prefer PayPal. Venmo is documented as a distant third option but not offered by default since no handle is confirmed for it. pricing-one-pager.tsx's howItWorks step 4 and a new FAQ entry now state this; leads-log.ts's Lead type gained optional paymentMethod/paymentReference fields and pipeline/src/log-lead.ts's CLI validates and accepts them (paymentReference only valid with --stage paid).",
    rationale:
      "This was the same class of silent gap p2-booking-link found for the booking step: pricing-one-pager.tsx has said 'Book your first listing for $19' and leads-log.ts has tracked a 'paid' stage since early sessions, but nothing anywhere ever said HOW a prospect pays — no method, no instructions, no FAQ mention. A prospect who read the offer, replied to book, and got their photos delivered had no stated way to actually pay. Zelle-primary/PayPal-fallback was chosen over Venmo (no confirmed handle yet, higher effective fee) and over standing up a real merchant processor like Stripe (real setup cost and a paid tool, which the guardrails explicitly rule out before there's proven demand) — both route to the same already-known real inbox already used by outreach-templates.ts and booking-link.ts, so zero new business infrastructure is needed to take the first paid delivery. Confirming the inbox actually receives funds via these apps remains a human step, tracked separately in blockers.ts's payment-handle-setup entry — this decision defines the process, not the confirmation.",
    madeBy: "real-estate-photography-continuous-improvement-2",
    relatedTaskIds: ["p2-payment-collection", "p2-first-deliveries", "p2-pricing-page"],
  },
  {
    date: "2026-07-13",
    title: "Combine the delivery handoff and payment ask into one ready-to-send message",
    decision:
      "Added process/delivery-message.ts's deliveryMessageText(), which composes the listing address, photo count, an optional microsite mention, payment-collection.ts's paymentInstructionsText(), and the existing free-redo guarantee into a single ready-to-paste message. Wired it into pipeline/src/cli-microsite.ts so it prints automatically right after a successful microsite build — the exact moment a real delivery is ready to hand over.",
    rationale:
      "Same class of silent gap as booking-link.ts (no way to book) and payment-collection.ts (no way to pay), just one step later in the funnel: p2-first-deliveries' doneWhen says 'deliver it' and STRATEGY.md's 5-step workflow ends at 'Brand' (the microsite), but nothing ever defined what a human actually sends at handoff. Without this, every real delivery would require improvising a message from scratch and re-deriving the payment ask by hand each time, risking the same kind of inconsistency (or omission) that let the booking-link and payment-collection gaps go unnoticed for weeks. Printing it straight from the microsite CLI (rather than a separate step to remember) means the first real delivery gets the message for free, not as a thing to look up.",
    madeBy: "claude/dazzling-allen-rb6omk",
    relatedTaskIds: ["p2-delivery-message", "p2-first-deliveries", "p2-brand-microsite", "p2-payment-collection"],
  },
  {
    date: "2026-07-13",
    title: "Add a post-delivery testimonial + referral follow-up, with a discount (not cash) incentive",
    decision:
      "Added process/referral-followup.ts's followUpMessageText(): a message sent 3-7 days after delivery (once the agent has seen real showing traffic) that asks for a concrete, usable testimonial quote and offers a referral to another agent. The incentive (REFERRAL_INCENTIVE) is a discount off a *future* paid delivery for both sides ($10 off for the referrer, $5 off for the referee), not a cash payout, so it costs nothing until a referral actually converts and doesn't violate the 'no spend of real money' guardrail.",
    rationale:
      "The funnel had messages for getting booked, paying, and the delivery handoff, but nothing for the moment that actually grows the business past a single $19 transaction. STRATEGY.md's target customer has 4-12 listings/month and mid-market agents talk to each other; with ad spend and paid tools both ruled out by the guardrails, word-of-mouth from a satisfied first customer is the cheapest credible growth channel available, and this repo had never built the ask for it.",
    madeBy: "claude/dazzling-allen-l25h2i",
    relatedTaskIds: ["p2-referral-followup", "p2-first-deliveries"],
  },
  {
    date: "2026-07-13",
    title: "Fix stale Host-pack pricing copy and eliminate the docs-site content duplication that let it drift",
    decision:
      "STRATEGY.md's own Business model table and research/'s public site both said Host pack (Airbnb/STR) pricing was a flat '$19/listing', contradicting the actual pricing decision this repo logged on day one ($19-79/listing, scaling with unit size — see the 2026-06-13 'Pricing anchors' entry above) and contradicting every other place that figure appears (process/interview-script.ts, process/outreach-templates.ts's str-host-dm template). Fixed both to read '$19-79/listing'. Separately, the private docs site's /docs/strategy page was rendering docs-site/content/strategy.md, a manually hand-copied duplicate of root STRATEGY.md that had silently fallen behind — it still showed 3 open questions (MLS compliance, virtual staging tech, brokerage-vs-PLG GTM) as unanswered checkboxes weeks after STRATEGY.md itself had checked them off. Rather than just re-syncing the copy (which would drift again), changed docs-site/src/lib/docs.ts to read STRATEGY.md and docs/REPLICATION_PROMPT.md directly from their canonical repo-root locations at build time, and deleted the now-unused docs-site/content/strategy.md and docs-site/content/replication.md duplicates entirely.",
    rationale:
      "Same root cause blockers.ts fixed for human-blocker facts (three independently hand-maintained copies drift apart quietly until something forces a diff), just discovered in a different pair of files. A manually-synced copy is a standing liability the moment the canonical source changes and nobody remembers to re-copy it — the fix that actually prevents recurrence is removing the duplicate, not re-syncing it once more. docs-site/content/deployment.md has no canonical source elsewhere in the repo, so it was left as a real file, just resolved via the same repo-root-relative path for consistency.",
    madeBy: "claude/dazzling-allen-mf5cdg",
    relatedTaskIds: ["p0-docs-site"],
  },
  {
    date: "2026-07-13",
    title: "Make the delivery guarantee wording depend on repeat-client status instead of always claiming 'first delivery'",
    decision:
      "process/delivery-message.ts's deliveryMessageText() gained an optional isRepeatClient input (default false). First-delivery output is byte-for-byte unchanged ('the redo is free on this first delivery' / 'Thanks for trying Listing Lens!'); when isRepeatClient is true it instead says 'same free-redo guarantee as always' / 'Thanks again for using Listing Lens!'. Also re-checked pricing-one-pager.tsx, outreach-templates.ts, payment-collection.ts, and referral-followup.ts against each other for price ($19), turnaround (1 business day), and payment-instructions drift — all consistent, no further changes needed there.",
    rationale:
      "outreach-templates.ts, delivery-message.ts, payment-collection.ts, and referral-followup.ts were each written by a different session, one funnel step at a time, with no session ever cross-reading all of them for a promise that drifts between surfaces. deliveryMessageText() unconditionally told every recipient this was their first delivery, which is wrong on its face once referral-followup.ts's own incentive loop produces a repeat or referred booking — a minor inconsistency today (zero real deliveries so far) but exactly the kind of silent gap this repo's progress-log keeps finding after the fact. Cheap to fix now, before any real customer sees the message.",
    madeBy: "claude/promise-consistency-audit-0713",
    relatedTaskIds: ["p2-promise-consistency-audit", "p2-delivery-message", "p2-referral-followup"],
  },
  {
    date: "2026-07-13",
    title: "Fix stale photo-count claim left in mls-compliance.ts by the checklist-scaling fix",
    decision:
      "process/mls-compliance.ts's photo-count-guidance rule now states the real current capture-checklist.ts default (19 shots for a typical home; 16-22 depending on bed/bath count) instead of the pre-scaling '~9-11 shots' figure that p2-capture-checklist-scaling (2026-07-12) made obsolete but never updated here.",
    rationale:
      "mls-compliance.ts is the one file whose entire job is to state accurate, sourced facts about MLS photo rules, and it's rendered live on the docs site — a stale number there is worse than the same staleness elsewhere, since a reader would reasonably treat it as current. This is the same class of drift p0-docs-content-drift-fix and p2-promise-consistency-audit already found and fixed in other files (a change in one file not propagating to a related claim in another); found by doing the exact cross-file numeric audit (turnaround times, photo counts, fee percentages) the prior session's progress-log entry suggested as the next check, since nextActionableTasks() was empty and leads-log.ts/loggedInterviewResults/listingAuditLog remain empty.",
    madeBy: "claude/mls-photo-count-drift-fix-0713",
    relatedTaskIds: ["p2-mls-compliance-photo-count-drift-fix", "p1-mls-compliance", "p2-capture-checklist-scaling"],
  },
  {
    date: "2026-07-13",
    title: "Correct the customer-facing '~30 minute' capture-time promise to match the scaled checklist",
    decision:
      "process/pricing-one-pager.tsx (2 spots) and process/outreach-templates.ts (3 spots, across the agent cold-email, in-person script, and brokerage-intro templates) now quote '~35-40 minutes' for the guided on-site capture step instead of '~30 minutes'. STRATEGY.md's own tagline/positioning ('in 30 minutes') is deliberately left as-is — same precedent as the 'under 2 hours' STRATEGY.md delivery target being left loose while decisions-log.ts's actual customer-facing turnaround promise was independently tightened to '1 business day'.",
    rationale:
      "process/capture-checklist.ts's totalTargetMinutes() (scaled by p2-capture-checklist-scaling on 2026-07-12 to hit the promised 15-25 photo range) now computes 33-47.5 minutes depending on bed/bath count, 38.5 for the typical-home default — every one of those is already above the '~30 minutes' quoted verbatim in the actual outreach copy a human will read to a real prospect. This is the same silent gap p2-promise-consistency-audit found in delivery-message.ts's guarantee wording: one session's fix (scaling the checklist for photo-count accuracy) created a new drift in a claim living in a different file, and nobody had re-checked outreach-templates.ts's specific time promise since. Also updated capture-checklist.ts's own preShootPrep doc comment, which still cited the old '30-minute-fix' figure.",
    madeBy: "claude/mls-photo-count-drift-fix-0713",
    relatedTaskIds: ["p2-outreach-templates", "p2-pricing-page", "p2-capture-checklist-scaling"],
  },
  {
    date: "2026-07-13",
    title: "Make the on-site capture-time promise computed, to stop it drifting (and being independently re-fixed) again",
    decision:
      "process/capture-checklist.ts gains onSiteTimeRange(), which rounds totalTargetMinutes() outward to the nearest 5 minutes on each end (default home: '35-40 minutes'). process/pricing-one-pager.tsx now computes its two on-site-time copy lines from this function instead of a hardcoded string. process/outreach-templates.ts's 3 template bodies stay hand-typed (they're plain string literals, not template functions) but gained a doc comment pointing at onSiteTimeRange() as the source of truth to check by eye.",
    rationale:
      "This session opened a PR (#34) that duplicated PR #33's fix for the exact same '~30 minutes' -> '~35-40 minutes' promise-drift bug, merged roughly a minute apart by two independent sessions auditing the same gap at the same time; #34 hit a real merge conflict against #33's already-landed fix. Both sessions independently computed the same correct number by hand from totalTargetMinutes(), which confirms the number was right, but the near-simultaneous duplicate is itself evidence the underlying design was fragile: a promise with no code connecting it to the value that's supposed to back it will keep drifting (and keep getting rediscovered/refixed from scratch) every time capture-checklist.ts's shot list changes. Closing the loop for at least the computed surface (pricing-one-pager.tsx) removes that specific recurrence risk permanently; outreach-templates.ts's static prose is left as a documented manual-sync point since making it a template function was judged more churn than the actual risk (3 short strings, unlikely to change again soon) currently justifies.",
    madeBy: "claude/dazzling-allen-wrkyk8",
    relatedTaskIds: ["p2-capture-time-single-source", "p2-capture-time-promise-drift-fix"],
  },
  {
    date: "2026-07-13",
    title: "Throttle full blocker re-verification passes to once per ~3 hours instead of every session",
    decision:
      "process/blockers.ts's HumanBlocker entries gain a lastConfirmedAt timestamp (in addition to the existing date-only lastConfirmed) and an exported recentlyConfirmedWithinHours(hours) helper. prompt_process.tsx's step 0 now tells a session to check that first: if every blocker was confirmed within the last 3 hours, do a cheap check only (empty logs still empty? any new merges? nextActionableTasks() still empty?) and skip creating a branch/commit/PR if nothing changed, rather than repeating a full re-verification pass and pushing another 'still blocked, nothing changed' branch. Also logged a new, different kind of blocker — cron-cadence-too-frequent — flagging for Duncan that the sub-daily cron cadence itself may be worth loosening now that the business has been fully human-blocked for multiple days running.",
    rationale:
      "This session found three same-day branches (claude/blocker-recheck-0713a/b/c) that each independently re-verified the identical unchanged set of ~5 human blockers and pushed a throwaway branch to record it — real cost (a branch, a commit, a CI run) for zero new information, driven by at least three separate hourly-or-tighter cron triggers hitting this repo and its sibling local-site-studio concurrently while nextActionableTasks() has been empty for days. Date-only lastConfirmed couldn't distinguish a recheck 5 minutes old from one 20 hours old on the same calendar day, so nothing in the data itself could tell a session it was about to duplicate very recent work. A 3-hour window was chosen as a compromise: short enough that a human resolving a blocker gets picked up within a few cron ticks, long enough to eliminate the same-hour pile-up actually observed today. This is a process/tooling decision, not a product one — no roadmap task depended on it, but prompt_process.tsx explicitly permits spending a session on process improvement when nothing product-facing is agent-actionable, which was the case this session (nextActionableTasks() empty, all logs still empty).",
    madeBy: "claude/blocker-throttle-0713",
    relatedTaskIds: ["p2-blocker-recheck-throttle"],
  },
  {
    date: "2026-07-18",
    title: "Widen the blocker recheck-throttle window from 3 hours to 12 now that an hourly cron is confirmed",
    decision:
      "prompt_process.tsx's step 0a now calls recentlyConfirmedWithinHours(12) instead of (3) before doing a full from-scratch blocker re-verification pass, with a doc note explaining the change and pointing here.",
    rationale:
      "This session called list_triggers directly and confirmed this repo's own agent-process prompt ('real estate photo app Business development progress') is bound to a literal hourly cron (`0 * * * *`) — not just 'sub-daily' as blockers.ts's cron-cadence-too-frequent entry previously worded it. With a 3-hour window, an hourly cron still produces a full-pass 'confirmed, nothing changed' branch/commit/PR/CI run roughly every 3-4 hours, forever, since none of the 6 tracked human blockers have moved in over a month (first flagged 2026-06-13/2026-07-12/2026-07-13). The cron-cadence-too-frequent blocker already argued a twice-daily cadence would catch a resolved blocker just as fast in practice, but treated that as a human-only decision (changing the actual cron schedule). It missed that the window recentlyConfirmedWithinHours() checks against is itself agent-editable and doesn't require touching the cron at all — 12 hours matches that same twice-daily reasoning at the code level. This is not a full fix (a real cron-cadence change would cut the spend further, and stays a human decision per that blocker), but it directly reduces wasted branch/CI churn without any realistic risk of missing a human resolving a blocker later than they'd otherwise be noticed. Logged as its own roadmap task (p2-blocker-recheck-window-widen) rather than folded into p2-blocker-recheck-throttle, since that task's doneWhen (3-hour window, now superseded) is itself a useful historical record of why 3 was chosen first.",
    madeBy: "claude/dazzling-allen-imbgjx",
    relatedTaskIds: ["p2-blocker-recheck-window-widen", "p2-blocker-recheck-throttle"],
  },
  {
    date: "2026-07-19",
    title: "Throttle out-of-band (push/email) reminders to Duncan separately from in-repo blocker rechecks, and send the first one",
    decision:
      "Added process/human-notifications.ts with a humanNotificationLog and shouldNotifyHuman(hours = 72) helper, mirroring blockers.ts's in-repo recentlyConfirmedWithinHours() pattern but for out-of-band notifications (push/email) some agent harnesses can send directly to Duncan. prompt_process.tsx's step 0a-2 tells a session to call shouldNotifyHuman() before sending a repeat 'still blocked on you' reminder, and to log one entry per notification sent so later sessions don't duplicate it. This session's own cheap check (recentlyConfirmedWithinHours(12) was true, ~5h since the last full pass) found nothing changed — 6/6 human blockers still unresolved (some over a month old), only PR #4 open/unchanged, all real-data logs still empty, and the actions-ci-runner-outage blocker now ~21 hours in with the identical runner_id-0 signature re-confirmed on run 29659392167 (main, 20:16:41Z). Because no evidence exists that any prior session's 'still blocked' finding was ever surfaced to Duncan outside a git commit, and because the CI outage specifically needs a timely billing/quota check, this session sent one push notification summarizing both, then recorded it here so it isn't repeated for at least 72 hours.",
    rationale:
      "The scheduled-routine guidance this session runs under is explicit that an unneeded notification is 'annoying in a way that accumulates,' and blockers.ts's own confirmedByCount values (11-18 across the 6 blockers) prove a fresh session rediscovers the same 'still blocked' fact on essentially every run — sending a notification every time would guarantee Duncan mutes them, defeating the point. But the opposite failure (never notifying, because every session assumes a previous one must have) is worse here: a business that's been 100% human-blocked for over a month, plus a day-plus-long CI outage, are exactly the kind of things a routine is supposed to surface, not quietly track in a file nobody opens. A 72-hour throttle (vs. blockers.ts's 12-hour in-repo one) reflects that an out-of-band ping is a heavier interruption than a git commit, and that none of the 6 blockers have ever resolved on a timescale where a 3-day gap would cost meaningfully more delay than a human would tolerate anyway. Genuinely new findings (a blocker resolving, a new blocker appearing) should still bypass this throttle per human-notifications.ts's own doc comment.",
    madeBy: "claude/dazzling-allen-a4sdsa",
    relatedTaskIds: ["p2-human-notification-throttle"],
  },
  {
    date: "2026-07-19",
    title: "Stop re-deriving the full stale-branch commit-subject cross-reference every session; check only the delta",
    decision:
      "process/blockers.ts's stale-branch-cleanup entry no longer needs a from-scratch commit-subject cross-reference against all ~44 branches every re-verification pass. Going forward, a session should just diff the current `git ls-remote --heads origin` branch count/name list against this entry's previously recorded count and name, and only do the deeper per-commit check when the delta is more than the expected +1 (this session's own branch merging) or a new branch's name doesn't obviously correspond to the immediately-preceding merged PR. Also fixed a small stale-status paydown: phase-4-pick-wedge's phase-level status was still 'not_started' even though its only task (p4-gtm-motion) has been 'done' since 2026-07-18 — flipped the phase to 'in_progress' since real work has started even though the phase's actual goal (landing a paying brokerage pilot) hasn't.",
    rationale:
      "This session re-verified all 6 human blockers (12-hour recheck window had elapsed) and, as part of that, re-ran the full per-branch commit-subject audit one more time — the 20th consecutive time it has found exactly one new branch, and that branch has been, every single time without exception, simply the most recently merged PR's own now-abandoned source branch. Twenty-for-twenty is enough confirmations that continuing to re-derive this from first principles every ~12 hours is exactly the kind of redundant busywork blockers.ts itself exists to eliminate for the other 5 blockers (see this file's original 2026-07-13 doc comment) — the check has stopped producing new information and just costs a `git fetch` per branch plus reasoning tokens every pass. The GitHub-side proxy restriction on branch deletion (confirmed 403, 'Write access to this GitHub API path is not permitted through this proxy') means this blocker can't be resolved by an agent regardless of how thoroughly it's re-audited, so the audit's only remaining value is catching an actual surprise — which a simple delta check still does, at a fraction of the cost. The phase-4 status fix is unrelated small hygiene noticed while reading roadmap.ts for nextActionableTasks() during this same pass, in the spirit of prompt_process.tsx's guidance to pay down stale statuses when nothing else is agent-actionable.",
    madeBy: "claude/dazzling-allen-lijq0y",
    relatedTaskIds: ["p2-blocker-recheck-throttle", "p4-gtm-motion"],
  },
  {
    date: "2026-07-22",
    title: "Stop re-narrating the CI-outage blocker's full history each session; overwrite the latest data point instead",
    decision:
      "process/blockers.ts's actions-ci-runner-outage entry is trimmed from a paragraph that had grown a new run-ID/timestamp/duration sentence every re-verification (13 sessions deep, all confirming the identical runner_id:0/empty-runner_name/~3s-duration signature) down to the fixed diagnosis plus one 'most recent run' / 'duration as of' data point. A future full pass should overwrite those two facts in place, not append another paragraph. Also corrected the stale-branch-cleanup entry's branch count from a recorded 48 to the actual 51 (verified via a full-pagination `list_branches` call, not just the first page) and confirmed the two non-standard-named branches found in the process (cursor/docs-cloudflare-access-5df0, cursor/setup-dev-environment-2314) are pre-existing, no-merge-base, abandoned early scaffolding from 2026-06-14 with no unique business content — not new work from a concurrent agent session.",
    rationale:
      "Same unbounded-growth pattern the 2026-07-19 stale-branch-cleanup decision above already fixed for that blocker, just discovered a session later in a different entry: a human blocker's job is to state the current diagnosis and evidence, not to accumulate an audit trail every session re-reads and re-writes. At 14 confirmations with zero exceptions, the diagnosis (an account/infra-level Actions problem, not a code regression) is settled; only the 'is it still happening, how long has it been' facts need to stay current. This session was otherwise a routine full re-verification pass (recentlyConfirmedWithinHours(12) had just elapsed, ~13h since the last check) that found nothing else changed: leads-log.ts/listingAuditLog/loggedInterviewResults still empty, PR #4 still the only open PR (draft, unchanged), nextActionableTasks() still empty, and the CI outage re-confirmed still ongoing (~111h) via a fresh GitHub Actions API check rather than trusting a prior session's note. shouldNotifyHuman(72) returned false (~17h since the last out-of-band ping), so no repeat push notification was sent — consistent with the throttle's own purpose.",
    madeBy: "claude/dazzling-allen-dco74e",
    relatedTaskIds: ["p2-blocker-recheck-throttle", "p2-human-notification-throttle"],
  },
  {
    date: "2026-07-25",
    title: "Document that a shallow clone gives false-positive 'unmerged branch' results",
    decision:
      "Added a note to prompt_process.tsx's step 6 (and blockers.ts's stale-branch-cleanup entry): before concluding a branch has no unmerged content via `git merge-base --is-ancestor` or `git log origin/main..origin/<branch>`, check `git rev-parse --is-shallow-repository` and run `git fetch --unshallow origin` first if it's shallow.",
    rationale:
      "This session's fresh `add_repo` clone started shallow. Auditing all 58 non-main branches against that shallow history, several already-merged branches (e.g. claude/dazzling-allen-7i8o70, claude/dazzling-allen-rkmj0x, cursor/docs-cloudflare-access-4a7e/5df0, cursor/setup-dev-environment-2314) wrongly showed unmerged commits — up to 11 for one branch — purely because the shallow boundary made `merge-base` compute the wrong ancestry. `git fetch --unshallow origin` fixed it immediately (verified against GitHub's own PR history via `list_pull_requests` state=closed: PRs #1-#16 confirmed merged/closed, matching the corrected local result). Left unfixed, this could eventually cost a future session real wasted effort (or worse, a bad merge/cherry-pick attempt) chasing branches that were never actually unmerged. No other findings changed this session: all 7 human blockers re-confirmed unchanged with fresh evidence (CI outage run 30155979952, ~179h and counting; only PR #4 open; all data logs still empty; nextActionableTasks() still empty); shouldNotifyHuman(72) returned false (~13h since the last push) so no repeat notification was sent.",
    madeBy: "claude/dazzling-allen-lfyv1d",
    relatedTaskIds: ["stale-branch-cleanup", "p2-blocker-recheck-throttle"],
  },
  {
    date: "2026-07-26",
    title: "Widen the recheck-throttle window from 12h to 24h — the 12h window was now firing on its own boundary for zero new information",
    decision:
      "prompt_process.tsx's step 0a now calls recentlyConfirmedWithinHours(24) instead of (12) before a full from-scratch blocker re-verification pass, with a doc note explaining the change. blockers.ts's cron-cadence-too-frequent and actions-ci-runner-outage entries updated to reference the new window.",
    rationale:
      "This session's own recentlyConfirmedWithinHours(12) check came back false by roughly 29 seconds (last full pass 2026-07-26T04:10:00Z, this check at 2026-07-26T16:10:29Z) — the window elapsing by a hair triggered a full re-verification pass that then found nothing new whatsoever: the CI outage showed the identical runner_id:0/empty-runner_name/~3s-duration signature on the newest main run (30187482944, now ~204h/8.5 days), all 6 other blockers unchanged, leads-log.ts/listingAuditLog/loggedInterviewResults still empty, PR #4 still the only open PR (draft/unchanged since 2026-06-15), and a fresh `list_branches` call confirmed still exactly 60 non-main branches with no new ones beyond the two already accounted for in blockers.ts. Every blocker's confirmedByCount is now in the 22-34 range with zero exceptions across 6+ weeks (the CI outage: 8.5 days) — the same reasoning that justified 3h->12h on 2026-07-18 applies again one notch further: a 24-hour window ('once a human is likely to look at this today') can't plausibly delay noticing a real resolution any later than a human would already notice it, and the separate 72h shouldNotifyHuman() out-of-band throttle (unchanged) is the actual mechanism for making sure Duncan hears about it promptly regardless of this window's width. This reduces in-repo branch/commit churn further without changing when Duncan gets pinged directly.",
    madeBy: "claude/dazzling-allen-42ohts",
    relatedTaskIds: ["p2-blocker-recheck-window-widen-24h", "cron-cadence-too-frequent"],
  },
];
