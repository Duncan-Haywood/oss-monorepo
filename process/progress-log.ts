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
  {
    date: "2026-07-12",
    agent: "claude/dazzling-allen-luc0w5",
    summary:
      "Confirmed all prior agent branches were already merged to main (git ls-remote + list_pull_requests: only PR #4 remains open, still blocked on Duncan's Cloudflare dashboard step, untouched by this session). All Phase 1-2 agent-doable tasks were done and every remaining roadmap task was human-blocked or explicitly deferred (p3-app-scope), so this session took up the prior session's own suggested next candidate plus one process improvement.",
    changes: [
      "process/capture-checklist.ts: closed the gap flagged in the last two sessions' progress-log entries — outreach-templates.ts's cold-email copy already promises '15-25 enhanced, MLS-ready photos' but the checklist only produced ~9-11 fixed shots. Made secondary bedroom/bathroom rooms scale per additional unit (perAdditionalUnit), added 7 new fixed detail shots (entry, living feature, dining, kitchen detail, primary closet, primary vanity/tub, flex space), and added totalShotCount()/updated totalTargetMinutes() to compute real totals from actual or typical bed/bath counts.",
      "pipeline/src/coverage.ts + cli.ts: expectedShotCount()/checkCoverage() now accept optional additionalBeds/additionalBaths; `npm run enhance` gained --beds/--baths flags (total counts, converted to additional-beyond-primary internally) so coverage checking reflects the real listing size instead of a fixed number.",
      "Verified: typical-home default (no args) now returns 19 shots (inside the promised 15-25 range); a 0-extra-bed/bath listing returns 16; a 5-bed/3-bath listing returns 22. pipeline/ `npm test` and `tsc --noEmit` pass; docs-site `npm run build` passes.",
      "Added .github/workflows/ci.yml: runs pipeline/'s test+typecheck and docs-site/research builds on every push and PR, independent of deploy-docs.yml (which only builds docs-site on push to main). Automates the manual verification prompt_process.tsx step 7 has always required, which several concurrent agent branches made easy to skip.",
      "decisions-log.ts: logged both the checklist-scaling decision and the CI decision. roadmap.ts: added p2-capture-checklist-scaling (done) and p0-ci (done).",
    ],
    nextUp: [
      "Human: p2-first-deliveries remains the single highest-leverage next step — the checklist, pricing, outreach copy, and pipeline (now with a real --beds/--baths-aware coverage check) are all ready for a first real shoot.",
      "Human: Phase 1 interviews (p1-run-interviews) and the Zillow listing audit (p1-listing-audit) remain the other real unblocks.",
      "Agent (next session): once CI has run on a real PR, confirm it's green before relying on it as a merge gate. Do not start p3-app-scope yet. If still nothing is human-unblocked, good candidates are re-verifying mls-compliance.ts against a specific real MLS board once one is known, or building the booking-intake -> leads-log.ts transcription path so a human's real outreach replies are fast to log.",
    ],
  },
  {
    date: "2026-07-12",
    agent: "claude/dazzling-allen-y9fqb5",
    summary:
      "Verified all prior agent branches were already merged to main (git ls-remote + list_pull_requests: only draft PR #4 remains open, still blocked on Duncan's Cloudflare dashboard step, untouched by this session). Every Phase 1-2 agent-doable roadmap task was already done and every remaining task was human-blocked or explicitly deferred (p3-app-scope), so this session built the concrete tooling gap the last two sessions' progress-log entries both flagged: a lead-intake CLI.",
    changes: [
      "Added pipeline/src/log-lead.ts: `npm run log-lead -- --audience <agent|brokerage|str_host> --contact \"<label>\" --channel <email|dm|in_person_script|sms> [--stage contacted] [--template <id>] [--notes \"...\"] [--date YYYY-MM-DD] [--dry-run]` validates input against leads-log.ts's/outreach-templates.ts's existing typed enums and appends a correctly-formatted entry to process/leads-log.ts, so a human can log a real reply/booking from a terminal without hand-editing TypeScript. --dry-run previews the exact diff first.",
      "Added pipeline/src/log-lead.test.ts: exercises validation, id-generation (lead-001, lead-002, ...), and append formatting (including quote-escaping) against an in-memory copy of leads-log.ts's shape — never touches the real file. Wired into pipeline's existing `npm test`.",
      "Verified end-to-end against the real file: ran `npm run log-lead` for real (no --dry-run), confirmed the exact expected diff landed in process/leads-log.ts, then reverted it — leads-log.ts stays genuinely empty, no fabricated entries committed.",
      "pipeline/ `npm test` and `npx tsc --noEmit` both pass with the new files.",
      "roadmap.ts: added p2-lead-intake-tool (done). decisions-log.ts: logged why this is a validated CLI rather than a form/backend — still requires a human to supply every real field, no new infrastructure.",
      "AGENTS.md: documented the new `pipeline/src/log-lead.ts` usage alongside the existing enhance-pipeline docs.",
    ],
    nextUp: [
      "Human: p2-first-deliveries is still the single highest-leverage next step, and now the first real reply can be logged in one command with `npm run log-lead` the moment it happens.",
      "Human: Phase 1 interviews (p1-run-interviews) and the Zillow listing audit (p1-listing-audit) remain the other real unblocks.",
      "Agent (next session): do not start p3-app-scope yet (same reasoning as every prior session). STRATEGY.md's remaining open question ('on-device vs cloud for virtual staging') is desk-researchable without customer contact, similar to how p1-mls-compliance was answered — a reasonable next candidate if nothing is human-unblocked. Otherwise keep watching PR #4 (still needs Duncan's Cloudflare dashboard step) and re-verify CI stays green as branches merge.",
    ],
  },
  {
    date: "2026-07-12",
    agent: "claude/dazzling-allen-q7uwlq",
    summary:
      "Verified all prior agent branches were already merged to main (git ls-remote + list_pull_requests: only draft PR #4 remains open, still blocked on Duncan's Cloudflare dashboard step). All Phase 1-2 agent-doable roadmap tasks were done and every remaining task was human-blocked or explicitly deferred (p3-app-scope), so this session took up the prior session's own suggested next candidate: STRATEGY.md's other unanswered open question, 'on-device vs cloud for virtual staging'.",
    changes: [
      "Added process/virtual-staging-tech.ts: sourced desk research (Apple's own Core ML/Stable Diffusion research, Virtual Staging AI's published API pricing, and general mobile-ML cost-crossover data) comparing on-device Core ML inpainting vs a pay-per-image cloud API for the future Polish-step virtual-staging feature. Decision: use a cloud API (not on-device) until real monthly volume approaches the ~1,000-15,000 image/month crossover and an iOS app actually exists — Listing Lens has neither yet.",
      "decisions-log.ts: logged the resulting decision with rationale and an explicit revisit condition, tied to p3-app-scope so a future session doesn't have to re-derive this when the app-scope question finally comes up.",
      "STRATEGY.md: checked off the 'on-device vs cloud for virtual staging' open question with a pointer to the new file.",
      "roadmap.ts: added p1-virtual-staging-tech (done). prompt_process.tsx: ProcessDashboard now renders a 'Virtual staging tech (Polish step)' section showing the decision and both options compared, mirroring how the MLS-compliance section already renders.",
      "Verified: docs-site `npm run build` and research `npm run build` both pass with the new file wired in; pipeline/ untouched this session so no need to re-run its tests.",
    ],
    nextUp: [
      "Human: p2-first-deliveries is still the single highest-leverage next step — checklist, pricing, outreach copy, and pipeline are all ready for a first real shoot.",
      "Human: Phase 1 interviews (p1-run-interviews) and the Zillow listing audit (p1-listing-audit) remain the other real unblocks.",
      "Agent (next session): both of STRATEGY.md's originally-open, desk-researchable questions are now answered (MLS compliance, virtual-staging tech); the only remaining open question ('v1 scope: photos only vs photos + 3D lite') is explicitly gated on p3-app-scope, which every session has correctly deferred until validation data exists. Do not start p3-app-scope yet. If still nothing is human-unblocked, look for the next gap between STRATEGY.md prose and what's actually built/runnable — e.g. STRATEGY.md's 'brokerage sales cycle vs agent PLG' open question is genuinely data-dependent (not desk-researchable) so leave it, but check whether outreach-templates.ts/leads-log.ts need any small usability fix once a human has actually tried the lead-intake flow end to end.",
    ],
  },
  {
    date: "2026-07-12",
    agent: "claude/checklist-novice-audit",
    summary:
      "Found that this exact session's cron tick raced a concurrent one: PR #13 (branch claude/dazzling-allen-vstaging-2937) and PR #14 (branch claude/dazzling-allen-q7uwlq) had independently answered STRATEGY.md's same virtual-staging question about 10 minutes apart. #14 was already merged to main, so closed #13 unmerged with an explanatory comment instead of landing duplicate content, per prompt_process.tsx step 8. Since every agent-doable, desk-researchable roadmap item was otherwise done or explicitly deferred (p3-app-scope), spent the rest of the session on two things per AGENT_PROCESS_INSTRUCTIONS step 4: hardening the process itself, and a prior session's own flagged-but-undone audit.",
    changes: [
      "prompt_process.tsx: added AGENT_PROCESS_INSTRUCTIONS step 2a — claim a not-started task by committing its in_progress status to main as the very first action of a session, before doing the rest of the work, so a concurrent hourly session sees it's taken instead of independently duplicating it. This is a direct response to the PR #13/#14 race, not a hypothetical.",
      "capture-checklist.ts: added `preShootPrep` (an 8-item, once-per-shoot home/equipment prep checklist — lights, blinds, decluttering, moving cars, fans off, phone storage/battery/grid-lines) and `BRACKET_GUIDANCE` (plain-language explanation of what 'single'/'hdr_3'/'hdr_5' mean and exactly how to shoot each on an iPhone or Android camera app, including the previously-undocumented gotcha that pipeline/'s coverage check expects exactly one merged output file per shot, not one per raw bracket exposure).",
      "prompt_process.tsx: ProcessDashboard's capture-checklist section now renders the pre-shoot prep list above the room-by-room checklist, and each shot shows its plain-language bracket how-to alongside the existing camera instructions.",
      "roadmap.ts: added p2-checklist-novice-audit (done). decisions-log.ts: logged the PR #13/#14 duplicate-work decision and rationale, so a future session understands why virtual-staging-tech.ts (not virtual-staging-options.ts) is the file that exists.",
      "Verified: docs-site `npm run build` passes with the new preShootPrep/BRACKET_GUIDANCE rendering; pipeline/ `npm test` + `npx tsc --noEmit` and research `npm run build` both still pass (neither package's own files were touched, ran them anyway since capture-checklist.ts is imported by pipeline/src/coverage.ts).",
      "Attempted to delete the now-fully-merged/closed claude/dazzling-allen-* branches for hygiene (repo convention is short-lived branches) but the session's git proxy hit its concurrency cap on every delete attempt (\"remote end hung up unexpectedly\") — left for a future session or Duncan to clean up manually; not blocking.",
    ],
    nextUp: [
      "Human: p2-first-deliveries remains the single highest-leverage next step across every session so far.",
      "Human: PR #4 (cursor/fix-pages-access-4a7e) is still open, still needs the Cloudflare Access dashboard toggle.",
      "Human/agent: the 8 stale claude/dazzling-allen-* branches (all already merged or closed) should get deleted next session when the git proxy isn't rate-limited, or manually by Duncan.",
      "Agent (next session): still do not start p3-app-scope. Try step 2a (task-claiming commit) for real on your first agent-doable task and note in this log whether it actually prevented a collision — that's the only way to know if it's working. If nothing is human-unblocked, re-verify mls-compliance.ts against a specific real MLS board once one is known, or review outreach-templates.ts/leads-log.ts for usability once a human has tried the lead-intake flow end to end.",
    ],
  },
];
