import type { RoadmapPhase, RoadmapTask } from "./types";

/**
 * The Listing Lens roadmap, derived from STRATEGY.md's 90-day GTM plan.
 *
 * Update task/phase `status` in place as work completes. Add new tasks as
 * they're discovered. Do not delete history — if a task is abandoned, set
 * its status to "blocked" and explain why in `blockedReason` rather than
 * removing it, so future agents don't repeat the same dead end.
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
    ],
  },
  {
    id: "phase-4-pick-wedge",
    title: "Phase 4 — Pick the wedge",
    status: "not_started",
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
