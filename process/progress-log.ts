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
  {
    date: "2026-07-11",
    agent: "claude/dazzling-allen-rkmj0x",
    summary:
      "Merged PR #7 (concierge pricing + outreach, resolving its conflict with the just-merged PR #6/#8 progress-log entries), then closed the biggest actually-agent-buildable gap left in Phase 2: the 'manual AI pipeline' from STRATEGY.md existed only as prose across every prior session, so built it as a real, tested CLI.",
    changes: [
      "Merged PR #7 (claude/dazzling-allen-cpghie) into main: rebased it onto main first to resolve a progress-log.ts merge conflict against PR #6/#8, verified docs-site still builds clean, then merged.",
      "New pipeline/ package (Node + TypeScript, run via tsx, no build step): src/enhance.ts (auto-orient, contrast/white-balance normalize, sharpen, resize, re-encode via sharp), src/coverage.ts (cross-checks output count against process/capture-checklist.ts's expected shot count), src/cli.ts (`npm run enhance -- --in <raw> --out <delivery> --listing \"<addr>\"`), src/enhance.test.ts (generates synthetic images, no real listing photos needed — `npm test` passes).",
      "Verified end-to-end: `npm test` passes, `npx tsc --noEmit` is clean, and a manual CLI smoke run against synthetic photos correctly produced renamed/resized JPEGs and correctly flagged an under-count against the checklist (exit code 1).",
      "roadmap.ts: added p2-ai-pipeline (done); p2-first-deliveries blockedReason updated to point at the new pipeline as the concrete unblock for the edit step.",
      "decisions-log.ts: logged why the pipeline is a local deterministic CLI (sharp) instead of a paid cloud AI API — zero marginal cost, fully agent-testable, respects the 'no spend of real money' guardrail; virtual staging/twilight/object removal stay a future paid 'Polish' step once revenue justifies it.",
    ],
    nextUp: [
      "Human: p2-first-deliveries is now the single highest-leverage next step — shoot a real listing with process/capture-checklist.ts, run `npm run enhance` in pipeline/ on the raw photos, and use process/outreach-templates.ts + the /pricing page to book and deliver it. This exercises the whole concierge loop end-to-end for the first time.",
      "Human: Phase 1 interviews (p1-run-interviews) and the Zillow listing audit (p1-listing-audit) are still the other real unblocks; nothing agent-side is left to prep for either.",
      "Agent (next session): once pipeline/ gets used on a real shoot, feed back any real timing/quality data into the turnaround claim in decisions-log.ts and pricing-one-pager.ts. Do not start p3-app-scope yet — STRATEGY.md sequences it after interview + concierge validation data exists, not before; jumping ahead would be scope creep against the phase-1-first plan. If nothing is agent-actionable, look for the next gap between STRATEGY.md prose and what's actually built/runnable, the way p2-ai-pipeline was found this session.",
    ],
  },
  {
    date: "2026-07-11",
    agent: "claude/dazzling-allen-7i8o70",
    summary:
      "Confirmed all prior Phase 1-2 agent-doable work was already merged to main (this branch's own prior PR #9 included), then closed two more gaps flagged by the last session: STRATEGY.md's unanswered 'MLS compliance by board' open question, and the fact that p2-first-deliveries had no structured place to land a real lead/booking once outreach starts.",
    changes: [
      "Added process/mls-compliance.ts: sourced desk research on MLS photo rules — no agent/brokerage branding or watermarks on MLS-submitted photos (fineable per-board), virtual staging/digital-alteration disclosure required in most states as of 2026 (California's AB 723 strictest, effective Jan 1 2026), and photo-count best practice vs. what capture-checklist.ts currently specs.",
      "decisions-log.ts: logged the resulting guardrail — pipeline/ and any future 'Brand' step must never brand MLS photo files; a future 'Polish'-step virtual staging feature must default to the strictest disclosure (visible caption + keep the original) regardless of state, since the pipeline can't detect the listing's board at run time.",
      "STRATEGY.md: checked off the MLS-compliance open question with a pointer to the new file and a note that board-specific re-verification is still needed once a real listing is booked.",
      "Added process/leads-log.ts: typed Lead/LeadStage schema and an intentionally empty leadsLog (agents must never fabricate lead/booking/revenue data here — only real entries from a human's actual outreach get appended).",
      "prompt_process.tsx: ProcessDashboard now renders an 'MLS compliance notes' section and a 'Leads & bookings funnel' section (currently all-zero, correctly reflecting that no real outreach has happened yet).",
      "roadmap.ts: added p1-mls-compliance (done) and p2-leads-tracking (done).",
      "Verified: git ls-remote showed claude/dazzling-allen-{cpghie,rkmj0x} fully merged into main and claude/dazzling-allen-wg8i3m fully superseded (empty diff / strict subset) before starting, per this file's own process step 6.",
    ],
    nextUp: [
      "Human: p2-first-deliveries is still the single highest-leverage next step. Once a real prospect responds, log it in process/leads-log.ts (even a one-line entry) so the funnel section on the docs site reflects reality instead of staying at zero.",
      "Human: Phase 1 interviews (p1-run-interviews) and the Zillow listing audit (p1-listing-audit) remain the other real unblocks.",
      "Agent (next session): do not start p3-app-scope yet (same reasoning as prior sessions — sequenced after validation data exists). If still nothing is human-unblocked, good next candidates are re-verifying process/mls-compliance.ts against a specific real MLS board once one is known, or tightening capture-checklist.ts's shot count toward the 15-25 photo range the pricing one-pager already promises.",
    ],
  },
];
