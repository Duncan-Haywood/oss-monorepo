import type { ProgressEntry } from "./types";

/**
 * Append-only session log. One entry per agent session that materially
 * changes the repo. Keep `summary` to a sentence or two; put specifics in
 * `changes`. This is the first thing a new agent session should skim.
 */
export const progressLog: ProgressEntry[] = [
  {
    date: "2026-06-13",
    agent: "initial-scaffold",
    summary:
      "Bootstrapped the repo: market-research Next.js site, STRATEGY.md, and the private docs-site skeleton.",
    changes: [
      "Added research/ Next.js static-export site with hero, audience comparison, market analysis, and business plan sections.",
      "Added STRATEGY.md with verdict, GTM plan, pricing, and scope guard.",
      "Added docs-site/ private Next.js site on Cloudflare Pages + Access.",
    ],
    nextUp: ["Run problem interviews", "Stand up a shared process-tracking system"],
  },
  {
    date: "2026-06-15",
    agent: "cursor/fix-pages-access-4a7e",
    summary: "Fixed Cloudflare Access enforcement for the docs site on *.pages.dev.",
    changes: [
      "Rewrote docs-site/scripts/setup-cloudflare-access.sh to verify status instead of applying a broken API-only Access app.",
      "Added optional Pages Functions JWT middleware for defense-in-depth.",
      "Opened PR #4 (draft) — still needs a one-time manual Cloudflare dashboard step from Duncan.",
    ],
    nextUp: ["Duncan enables the Pages Access policy in the Cloudflare dashboard and merges PR #4"],
  },
  {
    date: "2026-07-11",
    agent: "claude/dazzling-allen-wg8i3m",
    summary:
      "Added the process/ system (roadmap, decisions log, progress log, interview script) so agent sessions can coordinate without re-deriving context, and shipped the Phase 1 interview script plus a Phase 2 capture checklist.",
    changes: [
      "process/types.ts, roadmap.ts, decisions-log.ts, progress-log.ts, interview-script.ts, prompt_process.tsx.",
      "docs-site: added /process page rendering the live roadmap/decisions/progress from process/.",
      "Wrote the room-by-room guided capture checklist (process/capture-checklist.ts) for the Phase 2 concierge MVP.",
      "Updated AGENTS.md and README.md to document the process convention for future agents.",
    ],
    nextUp: [
      "Human: run the Phase 1 interview script with 10 agents + 5 STR hosts and log results in interview-script.ts's loggedInterviewResults.",
      "Agent: draft the $19/listing concierge one-pager (p2-pricing-page) next session.",
      "Watch PR #4 (cursor/fix-pages-access-4a7e) — still blocked on a human dashboard step.",
    ],
  },
  {
    date: "2026-07-11",
    agent: "claude/dazzling-allen-wg8i3m",
    summary:
      "PR #5 merged, then fixed all 6 Cursor Bugbot findings it surfaced (broken Tailwind content globs, a stale deploy trigger, two status/data inconsistencies, a bad task-ID reference, and an unrendered checklist) in a follow-up PR #6, now merged.",
    changes: [
      "docs-site/tailwind.config.ts: added ../process/**/*.{ts,tsx} to content so classes used only by ProcessDashboard actually get generated.",
      ".github/workflows/deploy-docs.yml: added process/** to the push trigger paths so process-only edits still redeploy the dashboard.",
      "process/roadmap.ts: p2-first-deliveries and p0-docs-site corrected to status \"blocked\" (both had a blockedReason but the wrong status); p0-docs-site now explicitly notes Access enforcement is still pending PR #4.",
      "process/decisions-log.ts: fixed the scope-guard decision's relatedTaskIds to reference real task IDs instead of phase IDs.",
      "process/prompt_process.tsx: ProcessDashboard now renders captureChecklist, matching p2-capture-checklist's doneWhen criterion.",
    ],
    nextUp: [
      "Another agent session (branch claude/dazzling-allen-cpghie) opened PR #7 on top of this work adding process/pricing-one-pager.tsx and process/outreach-templates.ts for the $19/listing concierge offer — not this session's to merge, but worth reading once it lands since it'll touch roadmap.ts/progress-log.ts/DocsShell.tsx too.",
      "Human: run the Phase 1 interviews (still the biggest unblock — everything else is prep work).",
      "Human: Cloudflare Access dashboard step for PR #4.",
    ],
  },
];
