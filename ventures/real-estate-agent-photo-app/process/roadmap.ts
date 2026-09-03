import type { RoadmapPhase, RoadmapTask } from "./types";

/**
 * The Listing Lens roadmap, derived from STRATEGY.md's 90-day GTM plan.
 *
 * Update task/phase `status` in place as work completes. Add new tasks as
 * they're discovered. Do not delete history — if a task is abandoned, set
 * its status to "blocked" and explain why in `blockedReason` rather than
 * removing it, so future agents don't repeat the same dead end.
 *
 * Portfolio rule (2026-08-25): deploy what is already built before more
 * process or GTM scaffolding. See portfolio/DIRECTION.md "Current priority".
 */
export const roadmap: RoadmapPhase[] = [
  {
    id: "phase-0-scaffold",
    title: "Phase 0 — Repo & docs scaffold",
    status: "in_progress",
    window: "Pre-week 1",
    summary:
      "Bootstrap the repo, market research site, private docs site, and this process system.",
    tasks: [
      {
        id: "p0-research-site",
        title: "Next.js market research report",
        status: "done",
        owner: "agent",
        rationale: "Document feasibility, audience fit, competition, and pricing.",
        doneWhen: "research/ builds and exports statically.",
      },
      {
        id: "p0-deploy-built-surfaces",
        title: "Put already-built public surfaces on a live URL before more process work",
        status: "not_started",
        owner: "both",
        rationale:
          "The research site and /photo-check tool already exist. A static export nobody can open does not produce interviews, usage, or a first concierge lead. Portfolio-wide, undeployed products on main outrank new scaffolding — see portfolio/DIRECTION.md Current priority. The owner flip for Pages/Cloudflare is deploy-settings; do not open a second ask.",
        doneWhen:
          "A stranger can open the already-built research report and /photo-check without cloning this repo. Agent prepares the deploy artifact; owner flips the existing gated workflow. No new product is started in this venture until that URL exists.",
      },
      {
        id: "p0-docs-site",
        title: "Private docs site on Cloudflare Pages + Access",
        status: "blocked",
        owner: "both",
        rationale: "Internal, access-gated home for strategy/process docs.",
        doneWhen: "docs-site deploys and Cloudflare Access blocks anonymous visitors.",
        blockedReason:
          "Site deploys fine, but Cloudflare Access isn't actually enforced on *.pages.dev yet — PR #4 (cursor/fix-pages-access-4a7e) needs Duncan to flip the Access policy on in the Cloudflare dashboard before this is really done.",
      },
      {
        id: "p0-process-system",
        title: "Typed TS/TSX process-tracking system",
        status: "done",
        owner: "agent",
        rationale:
          "Multiple agents work this repo concurrently on independent schedules; a typed, greppable process file lets each session pick up where the last left off without re-deriving context from scratch.",
        doneWhen:
          "process/prompt_process.tsx exists, is rendered on the docs site, and this roadmap reflects real status.",
      },
      {
        id: "p0-ci",
        title: "CI workflow runs tests/builds on every push and PR",
        status: "done",
        owner: "agent",
        rationale:
          "prompt_process.tsx step 7 has always required each agent session to manually run pipeline tests and docs-site/research builds before pushing, but with several agent branches active concurrently (see git ls-remote), a manual-only gate is easy to skip or forget and a regression from one branch could land on main undetected until the next session happens to catch it.",
        doneWhen:
          ".github/workflows/ci.yml runs `npm test` + `tsc --noEmit` in pipeline/ and `npm run build` in docs-site/ and research/ on every push and pull_request, independent of the existing deploy-docs.yml (which only builds docs-site on push to main).",
      },
      {
        id: "p0-nextjs-security-patch",
        title: "Patch next.js off the vulnerable 14.1.0 pin in docs-site/ and research/",
        status: "done",
        owner: "agent",
        rationale:
          "npm had been printing a next.js security-vulnerability warning on every install of docs-site/ or research/ since the repo's first commit, unnoticed until this session actually read the install/audit output; several of the 14 flagged advisories were critical (DoS, request smuggling, middleware auth bypass).",
        doneWhen:
          "next bumped to 14.2.35 (latest 14.x patch) in both packages, npm run build verified clean in both. See decisions-log.ts for why the full next@16 major-version migration (needed to clear every advisory npm audit flags) was deliberately deferred rather than attempted in the same session.",
      },
      {
        id: "p0-docs-content-drift-fix",
        title: "Fix stale docs-site /docs/strategy content and the Host-pack pricing drift it exposed",
        status: "done",
        owner: "agent",
        rationale:
          "docs-site/content/strategy.md was a hand-copied duplicate of root STRATEGY.md that had silently drifted for weeks — the live docs site still showed 3 already-answered open questions as unanswered. Auditing it also surfaced a second, longer-standing drift: STRATEGY.md's own Business model table and research/'s public site said Host pack pricing was a flat '$19/listing', contradicting the actual $19-79/listing decision logged on day one and used everywhere else in the repo.",
        doneWhen:
          "docs-site/src/lib/docs.ts reads STRATEGY.md and docs/REPLICATION_PROMPT.md directly from their canonical repo-root paths (no more hand-synced duplicates in docs-site/content/); STRATEGY.md and research/src/lib/data.ts both say Host pack is $19-79/listing; docs-site `npm run build` and research `npm run build` both pass. See decisions-log.ts.",
      },
    ],
  },
  {
    id: "phase-1-interviews",
    title: "Phase 1 — Problem interviews",
    status: "in_progress",
    window: "Week 1-2",
    summary: "Validate the pain and willingness to pay before building anything else.",
    tasks: [
      {
        id: "p1-interview-script",
        title: "Agent + STR host interview script",
        status: "done",
        owner: "agent",
        rationale:
          "A repeatable script lets Duncan (or a hired researcher) run consistent interviews fast, and lets agents score results against the day-90 success criteria.",
        doneWhen:
          "A structured, typed interview script + scoring rubric exists in process/ and/or docs-site.",
      },
      {
        id: "p1-run-interviews",
        title: "Run 10 agent + 5 STR host interviews",
        status: "blocked",
        owner: "human",
        rationale: "Requires real-world outreach and conversations no agent can perform.",
        doneWhen: "15 interviews logged with pay-willingness scored per the rubric.",
        blockedReason:
          "Needs a human to conduct live interviews. Agents can prep scripts/outreach copy but cannot talk to real agents or hosts.",
      },
      {
        id: "p1-listing-audit",
        title: "Collect 20 Zillow listings in one metro (mediocre vs excellent)",
        status: "blocked",
        owner: "human",
        rationale: "Anchors the \"blind quality rating\" success metric.",
        doneWhen: "20 listings collected and tagged mediocre/excellent with notes.",
        blockedReason:
          "Requires picking a target metro and manual collection from live listings. The scoring instrument is ready (see p1-listing-audit-rubric) — a human just needs to browse Zillow in a chosen metro and score what they find.",
      },
      {
        id: "p1-listing-audit-rubric",
        title: "Build an objective scoring rubric for the Zillow listing audit",
        status: "done",
        owner: "agent",
        rationale:
          "p1-listing-audit has been blocked on a human since the repo's first commit, but nothing ever defined what 'mediocre' vs 'excellent' means or how 20 scored listings turn into the '1-10 blind quality rating' STRATEGY.md's day-90 success criteria (>= 7/10) requires. Without a fixed rubric, scoring would drift listing to listing and rater to rater, making the eventual number unreliable. This mirrors how interview-script.ts already gives p1-run-interviews a structured scoring function (scoreWillingnessToPay) instead of leaving it as unstructured notes.",
        doneWhen:
          "A typed rubric (6 concrete 1-5 dimensions with worst/best guidance) and a computeOverallScore()/auditSummary() scoring function exist in process/listing-audit-rubric.ts, rendered on the docs site, with an empty (no fabricated data) listingAuditLog ready for real entries. See process/listing-audit-rubric.ts.",
      },
      {
        id: "p1-mls-compliance",
        title: "Answer STRATEGY.md's open 'MLS compliance by board' question",
        status: "done",
        owner: "agent",
        rationale:
          "STRATEGY.md's open-questions checklist has carried this unanswered since the initial scaffold; general MLS-board photo/branding/disclosure rules are public and agent-researchable without any customer contact, and directly gate what the Brand step and a future Polish/virtual-staging step are allowed to do.",
        doneWhen:
          "Documented, sourced compliance rules exist in process/mls-compliance.ts, rendered on the docs site, with STRATEGY.md's open question checked off. See process/mls-compliance.ts.",
      },
      {
        id: "p1-virtual-staging-tech",
        title: "Answer STRATEGY.md's open 'on-device vs cloud for virtual staging' question",
        status: "done",
        owner: "agent",
        rationale:
          "The second unanswered box in STRATEGY.md's open-questions checklist; like MLS compliance, this is desk-researchable (public vendor pricing, Apple's own Core ML research) without customer contact, and settles what a future Polish-step virtual-staging feature should actually call before any of that gets built.",
        doneWhen:
          "Documented, sourced comparison exists in process/virtual-staging-tech.ts with an explicit decision and a stated revisit condition, rendered on the docs site, with STRATEGY.md's open question checked off. See process/virtual-staging-tech.ts.",
      },
    ],
  },
  {
    id: "phase-2-concierge-mvp",
    title: "Phase 2 — Concierge MVP",
    status: "in_progress",
    window: "Week 3-4",
    summary:
      "Deliver MLS-ready photo packs by hand (checklist + manual AI pipeline) before writing an app, to test willingness to pay for $19/listing.",
    tasks: [
      {
        id: "p2-capture-checklist",
        title: "Guided shoot checklist (room-by-room)",
        status: "done",
        owner: "agent",
        rationale: "Needed before the first concierge delivery; codifies the 5-step workflow from STRATEGY.md.",
        doneWhen: "A typed checklist (rooms, shots, brackets) exists and renders on the docs site. See process/capture-checklist.ts.",
      },
      {
        id: "p2-capture-checklist-scaling",
        title: "Scale checklist shot count to match the 15-25 photo promise",
        status: "done",
        owner: "agent",
        rationale:
          "process/outreach-templates.ts's cold-email copy already promises prospects '15-25 enhanced, MLS-ready photos', but the checklist as first built only specified ~9-11 fixed shots regardless of home size (flagged as a gap in the prior session's mls-compliance.ts research and progress-log.ts nextUp). An unbacked promise in outreach copy is a real business risk the moment p2-first-deliveries produces a first real customer.",
        doneWhen:
          "process/capture-checklist.ts's secondary bedroom/bathroom rooms scale per additional unit instead of a fixed single entry, pipeline/src/coverage.ts + cli.ts accept real --beds/--baths, and the typical-home default (totalShotCount() with no args) falls inside the promised 15-25 range. Verified: typical default is now 19.",
      },
      {
        id: "p2-pricing-page",
        title: "$19/listing concierge offer one-pager",
        status: "done",
        owner: "agent",
        rationale: "Needed to pitch the first paying concierge customers.",
        doneWhen:
          "A shareable one-pager (site page or PDF-able doc) states offer, price, turnaround. See process/pricing-one-pager.tsx, rendered at docs-site's /pricing page.",
      },
      {
        id: "p2-outreach-templates",
        title: "Cold outreach templates for mid-market agents",
        status: "done",
        owner: "agent",
        rationale:
          "The pricing one-pager needs a way to actually reach prospective agents; ready-to-send copy shortens the human's path from 'offer exists' to 'first booked shoot'.",
        doneWhen:
          "Email/DM/in-person templates plus a lightweight booking intake exist in process/. See process/outreach-templates.ts.",
      },
      {
        id: "p2-ai-pipeline",
        title: "Automated photo enhancement pipeline (CLI)",
        status: "done",
        owner: "agent",
        rationale:
          "STRATEGY.md's Week 3-4 plan calls for a 'manual AI pipeline' to hit MLS-ready delivery in under 2 hours, but until now that step existed only as prose — every session described it, none built it. A local, deterministic CLI (auto-orient, contrast/white-balance normalization, sharpen, resize, sequential MLS-ready renaming) turns the slowest part of a concierge delivery into a one-command step and directly de-risks the turnaround-time claim in the pricing one-pager.",
        doneWhen:
          "A typed CLI exists at pipeline/ (npm run enhance -- --in <raw> --out <delivery> --listing \"<address>\"), batch-processes a folder of photos into renamed MLS-ready JPEGs, cross-checks output count against process/capture-checklist.ts's expected shot count, and has a passing self-test (npm test) with no real listing photos required. See pipeline/src/enhance.ts, cli.ts, coverage.ts, enhance.test.ts.",
      },
      {
        id: "p2-checklist-novice-audit",
        title: "Audit capture-checklist.ts for a shooter with zero photography background",
        status: "done",
        owner: "agent",
        rationale:
          "A prior session's progress-log.ts nextUp flagged this as unreviewed: the checklist used bracket labels (\"hdr_3\"/\"hdr_5\") throughout without ever explaining what they mean or how to shoot them on a phone, and had no general pre-shoot home/equipment prep step, even though STRATEGY.md's whole concierge premise is that Duncan (not a professional photographer) can run the shoot himself from the checklist alone.",
        doneWhen:
          "process/capture-checklist.ts exports preShootPrep (a once-per-shoot prep list) and BRACKET_GUIDANCE (plain-language capture instructions per bracket type, including the coverage.ts gotcha that brackets must be merged down to one file per shot before running pipeline/enhance), both rendered on the docs site's capture checklist section.",
      },
      {
        id: "p2-first-deliveries",
        title: "Deliver 5 concierge packs, collect payment",
        status: "blocked",
        owner: "human",
        rationale: "Real revenue is the strongest validation signal.",
        doneWhen: "5 paid concierge deliveries logged with turnaround time and customer feedback.",
        blockedReason:
          "Requires a human to shoot/edit and take payment; not agent-executable yet. The edit step is now faster thanks to pipeline/ (p2-ai-pipeline) — shoot with the checklist, run `npm run enhance` in pipeline/, deliver the output folder.",
      },
      {
        id: "p2-leads-tracking",
        title: "Typed leads/bookings funnel tracker",
        status: "done",
        owner: "agent",
        rationale:
          "outreach-templates.ts gives a human copy to send and fields to collect, but nothing structured to log what actually happens after — every prior session left p2-first-deliveries as an opaque 'blocked on human' box with no visible funnel. A ready, empty, typed log lets the first real reply/booking/payment get recorded in one place instead of scattered across texts/DMs.",
        doneWhen:
          "process/leads-log.ts exists with a typed Lead/LeadStage schema, starts empty (no fabricated data), and renders a funnel-count view on the docs site. See process/leads-log.ts.",
      },
      {
        id: "p2-booking-link",
        title: "Replace the outreach templates' placeholder booking link with a real one",
        status: "done",
        owner: "agent",
        rationale:
          "outreach-templates.ts's cold-email/brokerage-intro bodies and pricing-one-pager.tsx's callToAction have said '[Phone / booking link]' / 'scan the QR code' since they were written — neither a phone number nor a QR code nor any link ever existed, so a prospect who wanted to book from either surface had no way to do so. This sat unnoticed for weeks because every session focused on prep documents, not on what a prospect does after reading one.",
        doneWhen:
          "process/booking-link.ts exists with a real mailto: link (BOOKING_LINK) addressed to Duncan and pre-filled with bookingIntakeFields' questions; outreach-templates.ts's renderTemplateBody() substitutes it into the placeholder; pricing-one-pager.tsx renders an actual 'Book now' link; docs-site's /pricing page shows both with the real link substituted. See process/booking-link.ts.",
      },
      {
        id: "p2-brand-microsite",
        title: "Property microsite generator (the 'Brand' step)",
        status: "done",
        owner: "agent",
        rationale:
          "STRATEGY.md's 5-step workflow (Guide -> Enhance -> Polish -> Deliver -> Brand) has had Guide (capture-checklist.ts), Enhance (pipeline/), and a plain Deliver (renamed JPEGs) since earlier sessions, but 'Brand' (agent headshot, logo, property microsite) was never built at all — every prior session focused on prep/outreach/tracking, not on completing the actual product workflow the pricing page sells. A concierge delivery today is just a folder of photos with no branded, shareable artifact for the agent to forward to their client or post.",
        doneWhen:
          "A CLI (`npm run microsite -- --dir <delivery-dir> --listing \"<address>\" --agent-name \"<name>\" ...`) generates a single self-contained index.html gallery microsite from an enhance.ts delivery folder, with agent name/phone/email/brokerage/logo/headshot fields, without ever modifying the underlying MLS-bound photo files (per the mls-compliance.ts branding guardrail). Has a passing self-test (npm test) with no real listing photos, logos, or headshots required. See pipeline/src/microsite.ts, cli-microsite.ts, microsite.test.ts.",
      },
      {
        id: "p2-lead-intake-tool",
        title: "CLI to append a real lead to leads-log.ts without hand-editing TypeScript",
        status: "done",
        owner: "agent",
        rationale:
          "p2-leads-tracking gave leads-log.ts a schema, but the only way to add a real entry was hand-editing a TypeScript array — friction on exactly the moment (a real prospect just replied) when a human is least likely to open an editor. A one-command intake tool lowers the cost of keeping the funnel data honest and current once real outreach starts, directly supporting p2-first-deliveries.",
        doneWhen:
          "`npm run log-lead -- --audience ... --contact ... --channel ... [--dry-run]` in pipeline/ validates required fields against the Lead/LeadStage/OutreachTemplate types and appends a correctly-formatted entry to process/leads-log.ts; has a passing self-test (npm test) that never touches the real file. See pipeline/src/log-lead.ts.",
      },
      {
        id: "p2-payment-collection",
        title: "Define how the $19 concierge payment actually gets collected",
        status: "done",
        owner: "agent",
        rationale:
          "pricing-one-pager.tsx's callToAction has said 'Book your first listing for $19' since it was written, and leads-log.ts has tracked a 'paid' stage since p2-leads-tracking, but nothing anywhere in the repo ever said HOW a prospect actually pays — no payment method, no instructions, no mention in the one-pager's FAQ or in any outreach copy. This is the same class of silent gap p2-booking-link found for the booking step (prospects could read the offer and even reply to book, but had no way to pay once delivered).",
        doneWhen:
          "process/payment-collection.ts exists with a sourced comparison of zero-setup payment methods (no new business infrastructure, no real spend), an explicit decision, and ready-to-use instructions addressed to Duncan's known real inbox; pricing-one-pager.tsx's FAQ and howItWorks reference it; leads-log.ts's Lead type gains optional paymentMethod/paymentReference fields so a real 'paid' entry can record how; pipeline/src/log-lead.ts's CLI accepts them. Rendered on the docs site.",
      },
      {
        id: "p2-delivery-message",
        title: "Ready-to-send delivery handoff message (photos + microsite + payment ask)",
        status: "done",
        owner: "agent",
        rationale:
          "The same class of silent gap booking-link.ts and payment-collection.ts each found and fixed: outreach-templates.ts covers getting booked and payment-collection.ts covers how to pay, but nothing ever combined 'here are your photos/microsite' with the payment ask into one ready-to-send message for the actual delivery moment — p2-first-deliveries' doneWhen says 'deliver it' but a human would have had to improvise that message from scratch, including re-deriving the payment ask by hand every time.",
        doneWhen:
          "process/delivery-message.ts exists with deliveryMessageText(), combining listing address, photo count, an optional microsite mention, payment-collection.ts's paymentInstructionsText(), and the existing free-redo guarantee into one ready-to-paste message; pipeline/src/cli-microsite.ts prints it automatically after a successful microsite build; has a passing self-test (npm test) with no real listing photos required. See process/delivery-message.ts, pipeline/src/cli-microsite.ts, delivery-message.test.ts.",
      },
      {
        id: "p2-referral-followup",
        title: "Post-delivery follow-up message: testimonial + referral ask",
        status: "done",
        owner: "agent",
        rationale:
          "The funnel had a message for getting booked (outreach-templates.ts), a way to pay (payment-collection.ts), and a handoff message for the delivery moment (delivery-message.ts) — but nothing for the moment that actually grows the business past one transaction. STRATEGY.md's own target customer has 4-12 listings/month and mid-market agents talk to each other; with zero ad spend available under the guardrails, turning a single $19 delivery into a repeat booking and a referral is the cheapest credible growth channel this business has, and nothing agent-doable stood between 'delivered' and 'hope they come back'.",
        doneWhen:
          "process/referral-followup.ts exists with followUpMessageText() (a 3-7-days-after-delivery check-in that asks for a concrete testimonial and offers a zero-cash-spend discount-based referral incentive), a TESTIMONIAL_PROMPT for turning a vague reply into a usable quote, and REFERRAL_INCENTIVE defined as future-delivery discounts (not cash) so it doesn't violate the no-real-spend guardrail; has a passing self-test (npm test) with no real listing/customer data required. See process/referral-followup.ts, pipeline/src/referral-followup.test.ts.",
      },
      {
        id: "p2-photo-preflight-record",
        title: "Download a dated MLS photo preflight record",
        status: "done",
        owner: "agent",
        rationale:
          "The browser preflight check showed findings but did not let an agent keep the dated evidence artifact described by the product-line candidate. A local Markdown download completes the review workflow without uploading photos or adding a backend.",
        doneWhen:
          "The /photo-check browser tool downloads a Markdown record containing the checked date, spec ID, per-file findings, skipped-file count, and explicit unimplemented checks; downloading is counted as an opt-out local usage event and no photo bytes leave the browser.",
      },
      {
        id: "p2-promise-consistency-audit",
        title: "Audit outreach/delivery/referral copy for drifted customer promises",
        status: "done",
        owner: "agent",
        rationale:
          "With booking, payment, delivery, and referral messages all shipped as separate files by separate sessions, nothing had ever cross-checked them for a promise that drifts between surfaces. deliveryMessageText() unconditionally said 'the redo is free on this first delivery' and 'Thanks for trying Listing Lens!' regardless of whether the recipient was actually a first-time or repeat/referred client — harmless today (no real deliveries yet) but would read oddly or understate the guarantee on any 2nd+ delivery once referral-followup.ts's referral loop starts producing repeat/referred bookings.",
        doneWhen:
          "process/delivery-message.ts's DeliveryMessageInput gains an optional isRepeatClient flag (default false, preserving today's exact output) that swaps the guarantee/signoff wording for repeat clients instead of always claiming 'this first delivery'; delivery-message.test.ts covers both branches. All other cross-file promises (price $19, 1-business-day turnaround, free-redo guarantee scope, payment instructions) re-checked and found consistent. See process/delivery-message.ts, pipeline/src/delivery-message.test.ts.",
      },
      {
        id: "p2-mls-compliance-photo-count-drift-fix",
        title: "Fix stale photo-count claim left behind in mls-compliance.ts by the checklist-scaling fix",
        status: "done",
        owner: "agent",
        rationale:
          "p2-capture-checklist-scaling (2026-07-12) rewrote capture-checklist.ts's shot counts to scale per bed/bath (typical default 19, up from a fixed ~9-11) but never touched mls-compliance.ts's 'photo-count-guidance' rule, whose implication field still asserted the checklist 'currently specs roughly 9-11 shots ... near the low end of the effective range' — a factually stale claim sitting in the one file whose whole job is to state accurate photo-count facts, rendered live on the docs site. Found while auditing for the exact class of cross-file numeric drift the prior session's progress-log entry flagged as the next thing to check (turnaround times, photo counts, fee percentages).",
        doneWhen:
          "process/mls-compliance.ts's photo-count-guidance implication now states the real current default (19 shots typical; 16-22 range) instead of the pre-scaling 9-11 figure. Repo-wide grep for the old '9-11' figure confirms every remaining mention is correctly past-tense (describing what the checklist used to specify, not a claim about its current behavior).",
      },
      {
        id: "p2-capture-time-promise-drift-fix",
        title: "Correct the '~30 minute' capture-time promise in outreach/pricing copy to match the scaled checklist",
        status: "done",
        owner: "agent",
        rationale:
          "The same p2-capture-checklist-scaling change that made mls-compliance.ts's photo count stale also pushed totalTargetMinutes() to 33-47.5 minutes (38.5 typical) — above the '~30 minutes' quoted verbatim in process/pricing-one-pager.tsx and 3 spots in process/outreach-templates.ts, copy a human will actually read/send to a real prospect. An unbacked time promise in outreach copy is the same class of real business risk p2-capture-checklist-scaling itself flagged for the photo-count promise.",
        doneWhen:
          "process/pricing-one-pager.tsx and process/outreach-templates.ts quote '~35-40 minutes' instead of '~30 minutes' for the guided capture step; process/capture-checklist.ts's preShootPrep doc comment updated to match. STRATEGY.md's own looser 'in 30 minutes' tagline is deliberately left unchanged (aspirational whole-workflow positioning, not a literal capture-time SLA) — same treatment as the 'under 2 hours' delivery target vs. the actual '1 business day' customer promise.",
      },
      {
        id: "p2-capture-time-single-source",
        title: "Make the on-site capture-time promise computed, not a second hand-typed number",
        status: "done",
        owner: "agent",
        rationale:
          "Two independent agent sessions (this one and p2-capture-time-promise-drift-fix) hand-fixed the exact same stale '~30 minutes' -> '~35-40 minutes' promise within about a minute of each other on 2026-07-13 — the second PR hit a real merge conflict against the first. Both sessions computed the identical correct number by hand from totalTargetMinutes(), which is reassuring (the number itself was right) but also proof the underlying risk is real: nothing connected the quoted promise to the checklist that's supposed to back it, so any future capture-checklist.ts change can silently re-introduce the same gap, and any two concurrent sessions auditing for it will duplicate the same fix again.",
        doneWhen:
          "process/capture-checklist.ts exports onSiteTimeRange(additionalBeds?, additionalBaths?), which rounds totalTargetMinutes() outward to the nearest 5 minutes on each end; process/pricing-one-pager.tsx now imports and computes its two on-site-time copy lines from it directly instead of a hardcoded string, so that surface can no longer drift on its own. process/outreach-templates.ts's 3 template bodies are plain string literals (not template functions) and still need a human/agent to eyeball-sync against onSiteTimeRange()'s output — documented in a doc comment there pointing back at the source of truth. See process/capture-checklist.ts, process/pricing-one-pager.tsx, decisions-log.ts.",
      },
      {
        id: "p2-blocker-recheck-throttle",
        title: "Throttle redundant hourly 'still blocked, nothing changed' recheck branches",
        status: "done",
        owner: "agent",
        rationale:
          "By 2026-07-13 afternoon, three separate hourly-or-tighter cron triggers were hitting this repo's (and the sibling local-site-studio repo's) agent process, and with nextActionableTasks() empty for days, several sessions independently spent a full session re-verifying the same ~5 human blockers and pushing a throwaway branch just to say so (claude/blocker-recheck-0713a/b/c, all same-day, all confirming nothing had changed). Date-only lastConfirmed granularity meant no session could tell 'confirmed 5 minutes ago' from 'confirmed 20 hours ago' on the same calendar day.",
        doneWhen:
          "process/blockers.ts gains lastConfirmedAt (real timestamp) on every entry and an exported recentlyConfirmedWithinHours(hours) helper; prompt_process.tsx's AGENT_PROCESS_INSTRUCTIONS step 0 tells a session to call it before doing a full re-verification pass and to skip the branch/commit/PR entirely if nothing changed and the window hasn't elapsed. See process/blockers.ts and decisions-log.ts.",
      },
      {
        id: "p2-blocker-recheck-window-widen",
        title: "Widen the recheck-throttle window from 3h to 12h now that an hourly cron is confirmed",
        status: "done",
        owner: "agent",
        rationale:
          "p2-blocker-recheck-throttle's 3-hour window stopped the worst churn (three same-day recheck branches) but, once list_triggers confirmed this repo's own agent session is bound to a literal hourly cron (`0 * * * *`), a 3-hour window still guaranteed a full-pass 'confirmed, nothing changed' branch/commit/PR/CI run every 3-4 hours indefinitely — exactly what the cron-cadence-too-frequent human blocker describes, except the fix for that specific piece doesn't require waiting on Duncan to touch the cron: the window itself is agent-editable. All 6 human blockers had been stable for over a month with zero hour-to-hour variance, so a wider window can't plausibly miss a resolution any later than a human would notice it anyway.",
        doneWhen:
          "prompt_process.tsx's step 0a calls recentlyConfirmedWithinHours(12) instead of (3), with a doc note explaining why and pointing at this decision. See process/blockers.ts's cron-cadence-too-frequent entry and decisions-log.ts.",
      },
      {
        id: "p2-blocker-recheck-window-widen-24h",
        title: "Widen the recheck-throttle window from 12h to 24h — 20-34 confirmations with zero variance each",
        status: "done",
        owner: "agent",
        rationale:
          "By 2026-07-26, every one of the 7 tracked human blockers had confirmedByCount in the 21-34 range with zero exceptions — the CI outage stable for 8+ days, the other six for 6+ weeks — and the 12-hour window (set 2026-07-18) had started firing right at its own boundary: this session's own recentlyConfirmedWithinHours(12) check landed ~29 seconds past the 12h mark from the prior full pass, triggering a full re-verification pass that found literally nothing new (same CI signature, same empty logs, same single open PR, no new branches). A window that borderline-fires for zero new information is the same waste p2-blocker-recheck-window-widen fixed at the 3h->12h step, one notch further.",
        doneWhen:
          "prompt_process.tsx's step 0a calls recentlyConfirmedWithinHours(24) instead of (12), with a doc note explaining why and pointing at this decision. The separate 72h shouldNotifyHuman() out-of-band throttle (step 0a-2) is unchanged — this only affects in-repo branch/commit/PR churn, not when Duncan gets pinged directly. See process/blockers.ts's cron-cadence-too-frequent entry and decisions-log.ts.",
      },
      {
        id: "p2-human-notification-throttle",
        title: "Throttle out-of-band (push/email) reminders to Duncan, separate from in-repo blocker rechecks",
        status: "done",
        owner: "agent",
        rationale:
          "blockers.ts's recentlyConfirmedWithinHours() already throttles in-repo noise (a branch/commit/PR every run), but some agent harnesses can also send an actual push notification/email straight to Duncan — a heavier interruption than a git commit, and unthrottled it would repeat the same 'still blocked on you' fact on nearly every run given the 6 human blockers have been stable for over a month (see blockers.ts's confirmedByCount values). No evidence existed that any prior session's finding had ever reached Duncan outside a git log, despite the business being 100% human-blocked since 2026-06-13 and a ~21-hour GitHub Actions runner outage needing a timely billing check.",
        doneWhen:
          "process/human-notifications.ts exists with a humanNotificationLog and shouldNotifyHuman(hours = 72) helper; prompt_process.tsx's step 0a-2 tells a session to check it before sending a repeat reminder and to log every notification sent. First notification sent and logged 2026-07-19. See process/human-notifications.ts and decisions-log.ts.",
      },
    ],
  },
  {
    id: "phase-3-smoke-test-app",
    title: "Phase 3 — Smoke-test app",
    status: "not_started",
    window: "Month 2",
    summary: "TestFlight with 20 users; measure time-to-publish, NPS, willingness to pay.",
    tasks: [
      {
        id: "p3-app-scope",
        title: "Define v1 app scope (photos-only vs photos+3D lite)",
        status: "not_started",
        owner: "both",
        rationale: "Resolves the open scope question in STRATEGY.md before any iOS work starts.",
        doneWhen: "A decision is logged in decisions-log.ts with rationale.",
        gatedOn: ["p1-run-interviews", "p2-first-deliveries"],
      },
      {
        id: "p2-photo-check-read-recovery",
        title: "Recover clearly when a browser cannot read selected photos",
        status: "done",
        owner: "agent",
        rationale:
          "Mobile file pickers and temporary file handles can fail after selection. A silent rejected read leaves an agent without a report or a recovery path during a delivery preflight.",
        doneWhen:
          "The browser preflight catches file-read failures, shows an actionable alert, clears processing state, and has a regression test for the message contract.",
      },
    ],
  },
  {
    id: "phase-4-pick-wedge",
    title: "Phase 4 — Pick the wedge",
    status: "in_progress",
    window: "Month 3",
    summary: "Select the audience where 40%+ would pay $49/mo; land 1 brokerage pilot.",
    tasks: [
      {
        id: "p4-gtm-motion",
        title: "Answer STRATEGY.md's open 'brokerage sales cycle vs agent PLG' question",
        status: "done",
        owner: "agent",
        rationale:
          "The last unaddressed box in STRATEGY.md's open-questions checklist (the other, v1 app scope, is correctly gatedOn real interview/delivery data via p3-app-scope). Which GTM motion to lead with is desk-researchable now, the same way mls-compliance.ts and virtual-staging-tech.ts closed the first two open questions without customer contact, and it directly informs how Month-3 'land 1 brokerage pilot' should actually be approached once phase 2 produces real revenue.",
        doneWhen:
          "A sourced comparison of brokerage-led (top-down) vs agent-led (bottom-up/PLG) go-to-market motions exists in process/gtm-motion.ts with an explicit provisional decision and revisit condition, rendered on the docs site, with STRATEGY.md's open question checked off. See process/gtm-motion.ts.",
      },
    ],
  },
];

export function findTask(taskId: string): RoadmapTask | undefined {
  for (const phase of roadmap) {
    const task = phase.tasks.find((t) => t.id === taskId);
    if (task) return task;
  }
  return undefined;
}

/** True if every task `taskId` depends on (via gatedOn) is done. Ungated tasks are always ready. */
export function isGateSatisfied(task: RoadmapTask): boolean {
  if (!task.gatedOn || task.gatedOn.length === 0) return true;
  return task.gatedOn.every((id) => findTask(id)?.status === "done");
}

export function nextActionableTasks(): { phase: RoadmapPhase; task: RoadmapTask }[] {
  const out: { phase: RoadmapPhase; task: RoadmapTask }[] = [];
  for (const phase of roadmap) {
    for (const task of phase.tasks) {
      if (
        task.status === "not_started" &&
        (task.owner === "agent" || task.owner === "both") &&
        isGateSatisfied(task)
      ) {
        out.push({ phase, task });
      }
    }
  }
  return out;
}
