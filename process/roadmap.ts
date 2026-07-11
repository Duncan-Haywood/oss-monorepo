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
        blockedReason: "Requires picking a target metro and manual collection from live listings.",
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
        id: "p2-first-deliveries",
        title: "Deliver 5 concierge packs, collect payment",
        status: "blocked",
        owner: "human",
        rationale: "Real revenue is the strongest validation signal.",
        doneWhen: "5 paid concierge deliveries logged with turnaround time and customer feedback.",
        blockedReason: "Requires a human to shoot/edit and take payment; not agent-executable yet.",
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
      },
    ],
  },
  {
    id: "phase-4-pick-wedge",
    title: "Phase 4 — Pick the wedge",
    status: "not_started",
    window: "Month 3",
    summary: "Select the audience where 40%+ would pay $49/mo; land 1 brokerage pilot.",
    tasks: [],
  },
];

export function findTask(taskId: string): RoadmapTask | undefined {
  for (const phase of roadmap) {
    const task = phase.tasks.find((t) => t.id === taskId);
    if (task) return task;
  }
  return undefined;
}

export function nextActionableTasks(): { phase: RoadmapPhase; task: RoadmapTask }[] {
  const out: { phase: RoadmapPhase; task: RoadmapTask }[] = [];
  for (const phase of roadmap) {
    for (const task of phase.tasks) {
      if (task.status === "not_started" && (task.owner === "agent" || task.owner === "both")) {
        out.push({ phase, task });
      }
    }
  }
  return out;
}
