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
    agent: "claude/dazzling-allen-cpghie",
    summary:
      "Merged PR #5 (the process system from a concurrent session), then completed the next agent-doable roadmap item: the concierge pricing one-pager plus outreach templates to actually get it in front of prospects.",
    changes: [
      "Merged PR #5 (claude/dazzling-allen-wg8i3m) into main: process/ system + Phase 1-2 deliverables.",
      "Added process/pricing-one-pager.tsx: typed $19/listing concierge offer (what's included, how it works, FAQ, guarantee) plus a standalone, screenshot/print-shareable PricingOnePager component (p2-pricing-page).",
      "Added process/outreach-templates.ts: email/DM/in-person/brokerage-intro copy for agents, brokerages, and STR hosts, plus a minimal booking-intake field list (p2-outreach-templates, new task).",
      "Wired both into docs-site's new /pricing page (docs-site/src/app/pricing/page.tsx) and added it to DocsShell's Live nav.",
      "Logged the concierge offer-terms decision in decisions-log.ts, including the honest 1-business-day turnaround claim (vs. STRATEGY.md's looser 'under 2 hours') until real delivery data exists.",
      "Updated roadmap.ts: p2-pricing-page done, new p2-outreach-templates task added and done.",
    ],
    nextUp: [
      "Human: use process/outreach-templates.ts + the /pricing page to book and run the first concierge shoots (p2-first-deliveries) — still the highest-value human-blocked task.",
      "Human: run Phase 1 interviews (p1-run-interviews) and the Zillow listing audit (p1-listing-audit) — both still blocked on real-world action.",
      "Agent (next session): once any real concierge deliveries or interview results are logged, tighten the turnaround claim in decisions-log.ts and pricing-one-pager.ts with real data; otherwise, prep Phase 3 app-scope framing (p3-app-scope) or improve this process itself.",
    ],
  },
];
