import type { ProgressEntry } from "./types";

/**
 * Append-only session log. One entry per agent session that materially
 * changes the repo. Keep `summary` to a sentence or two; put specifics in
 * `changes`. This is the first thing a new agent session should skim.
 */
export const progressLog: ProgressEntry[] = [
  {
    date: "2026-08-27",
    agent: "cursor/branch-and-pr-integration-4d4e",
    summary:
      "Remeshed the leftover MLS preflight export extra: a run can now copy a short handoff summary in addition to the dated Markdown and JSON downloads.",
    changes: [
      "research/src/components/PhotoCheckTool.tsx adds Copy handoff summary next to the dated Markdown and JSON downloads. The text lists filenames, rule ids, and skipped files — never photo pixels — and states it is evidence only.",
      "Added an opt-out local handoff_summary_copied usage event. Clipboard write falls back to execCommand when the Clipboard API is unavailable.",
    ],
    nextUp: [
      "Human: run the check against a real delivery folder once a concierge listing exists.",
      "Agent: keep leftover wording PRs open until supersede_check.py exits 0.",
    ],
  },
  {
    date: "2026-08-24",
    agent: "session/agent_0f91c692-9c76-4ae5-bc98-79b2014f706e",
    summary:
      "Completed the customer-facing artifact for the MLS photo-spec preflight product line: a browser run can now be retained as a dated Markdown findings record.",
    changes: [
      "research/src/components/PhotoCheckTool.tsx now creates a local Markdown download with the checked timestamp, dated spec identifier, file-level findings, skipped-file count, and explicit out-of-scope checks. Table values are escaped so imported filenames or parser details cannot corrupt the record format.",
      "Added an opt-out local report_downloaded usage event. Photo bytes, findings, and filenames remain in the browser; no analytics vendor, account, or server endpoint was introduced.",
      "Added the p2-photo-preflight-record roadmap task and recorded the local-export product decision.",
    ],
    nextUp: [
      "Human: run the check against a real delivery folder once a concierge listing exists; the current record is still based on the dated generic floor spec, not a board-specific acceptance rule.",
      "Agent: validate the research build and browser download behavior, then use local usage readings to decide whether a PDF or board-profile feature is worth building.",
    ],
  },
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
  {
    date: "2026-07-12",
    agent: "claude/dazzling-allen-j509d4",
    summary:
      "Verified all prior agent branches were merged to main (git fetch + list_pull_requests: only draft PR #4 remains open, still blocked on Duncan's Cloudflare dashboard step) and that main's CI is green on its last 4 runs. Every Phase 1-2 agent-doable roadmap task was done and p3-app-scope stays correctly deferred per every prior session's reasoning, so this session closed a real gap flagged by p1-listing-audit's own blockedReason (it was blocked on 'a human' but never actually defined what to score) and did the branch-hygiene cleanup the last session ran out of retries for.",
    changes: [
      "Added process/listing-audit-rubric.ts: a 6-dimension, 1-5-per-dimension objective scoring rubric (lighting/exposure, composition/angle, staging/declutter, photo count/coverage, resolution/sharpness, color/white balance) with concrete worst-vs-best guidance per dimension, computeOverallScore() (rescales to STRATEGY.md's 1-10 'blind quality rating' scale), and auditSummary(). Ships with an empty listingAuditLog — mirrors the leads-log.ts/interview-script.ts convention of shipping the instrument, never fabricated data.",
      "prompt_process.tsx: ProcessDashboard renders a new 'Listing quality audit rubric' section showing all 6 dimensions and the (currently zero) scored-listing summary, same pattern as the MLS-compliance and virtual-staging-tech sections.",
      "roadmap.ts: added p1-listing-audit-rubric (done); updated p1-listing-audit's blockedReason to point at the rubric as the now-ready scoring instrument, so the remaining blocker is purely 'human picks a metro and browses listings'.",
      "decisions-log.ts: logged the rubric decision and rationale.",
      "Branch hygiene: confirmed 9 claude/* and 3 cursor/* branches have zero unique content vs. current main (git diff origin/main origin/<branch> showed each branch strictly behind main, i.e. fully superseded by earlier squash-merges) and attempted to delete them — claude/checklist-novice-audit, claude/dazzling-allen-{7i8o70,cpghie,luc0w5,q7uwlq,rkmj0x,vstaging-2937,wg8i3m,y9fqb5}, cursor/docs-cloudflare-access-{4a7e,5df0}, cursor/setup-dev-environment-2314. Unlike the prior session's 'concurrency cap' theory, this session's `git push origin :<branch>` returned a hard `HTTP 403`, not a transient disconnect — this session's git credential can push commits but cannot delete refs on this repo. Left all 12 branches in place; this needs either Duncan to delete them manually (they're all confirmed safe — verified fully superseded above) or a token/permission fix, not more retries. Left cursor/fix-pages-access-4a7e alone regardless — it's still open PR #4, human-blocked on a Cloudflare dashboard step.",
      "Confirmed via GitHub Actions API that .github/workflows/ci.yml has been green on all 4 of its runs on main so far — closes the 'confirm CI is actually green' follow-up two sessions back flagged and never checked.",
    ],
    nextUp: [
      "Human: p2-first-deliveries remains the single highest-leverage next step — checklist, pricing, outreach copy, pipeline, and lead-intake CLI are all ready for a first real shoot.",
      "Human: p1-listing-audit now just needs a metro pick + Zillow browsing session, scored against process/listing-audit-rubric.ts's 6 dimensions.",
      "Human: PR #4 (cursor/fix-pages-access-4a7e) is still open, still needs the Cloudflare Access dashboard toggle.",
      "Human: delete the 12 confirmed-stale branches listed above from github.com directly (Settings/branches UI or `gh api -X DELETE`) — agent sessions get HTTP 403 trying to delete refs, so stop assigning this to a future agent session.",
      "Agent (next session): still do not start p3-app-scope — unchanged from every prior session's reasoning, no new validation data exists yet. Do not re-attempt branch deletion (403 is a hard permission wall, not transient). If nothing is human-unblocked, look for the next gap between a roadmap task's stated blocker and what's actually true (the way this session found p1-listing-audit's blocker was really 'no rubric exists', not just 'needs a human'), or re-verify mls-compliance.ts against a specific real MLS board once one is known.",
    ],
  },
  {
    date: "2026-07-12",
    agent: "claude/gate-sequencing",
    summary:
      "Verified all prior branches were already merged to main (git ls-remote + PR list: only draft PR #4 open, all 12 other claude/*/cursor/* branches confirmed diverged-by-1 squash-merge artifacts, zero unique content) and that every Phase 1-2 agent-doable roadmap task was done, with the sole not_started task (p3-app-scope) explicitly deferred by 7+ consecutive prior sessions in prose only. Per AGENT_PROCESS_INSTRUCTIONS step 4, spent the session hardening the process itself instead of padding with busywork: made that repeatedly-restated deferral an enforced precondition in code.",
    changes: [
      "process/types.ts: added optional gatedOn?: string[] to RoadmapTask — task IDs that must all be status \"done\" before a not_started task counts as agent-actionable.",
      "process/roadmap.ts: added isGateSatisfied(task); nextActionableTasks() now excludes any not_started/agent-or-both task whose gatedOn tasks aren't all done. p3-app-scope gained gatedOn: [\"p1-run-interviews\", \"p2-first-deliveries\"], matching what every session's nextUp notes already said by hand.",
      "process/prompt_process.tsx: AGENT_PROCESS_INSTRUCTIONS step 2 now explains gatedOn; ProcessDashboard's roadmap section renders an amber 'Gated on: ...' note under any task whose gate isn't satisfied yet, next to the existing blockedReason rendering.",
      "decisions-log.ts: logged why (turning a rule seven sessions independently repeated in prose into something nextActionableTasks() itself enforces, so a future session skimming only roadmap.ts can't accidentally start it).",
      "Verified: docs-site `npm run build` and research `npm run build` both pass with the new gate rendering; pipeline/ `npm test` + `npx tsc --noEmit` pass (types.ts change doesn't affect pipeline's own types, ran anyway since capture-checklist.ts is in the same process/ package).",
    ],
    nextUp: [
      "Human: p2-first-deliveries remains the single highest-leverage next step — checklist, pricing, outreach copy, pipeline, and lead-intake CLI are all ready for a first real shoot.",
      "Human: p1-listing-audit just needs a metro pick + Zillow browsing session, scored against process/listing-audit-rubric.ts.",
      "Human: PR #4 (cursor/fix-pages-access-4a7e) is still open, still needs the Cloudflare Access dashboard toggle; the 12 confirmed-stale branches still need manual deletion (agent git credential gets HTTP 403 on ref deletes).",
      "Agent (next session): p3-app-scope now won't appear in nextActionableTasks() until p1-run-interviews and p2-first-deliveries are both done — verify that holds once one of them actually flips to done, rather than assuming the gate works untested. If nothing is human-unblocked, the gatedOn mechanism could extend to other implicitly-sequenced tasks if any are found; otherwise re-verify mls-compliance.ts against a specific real MLS board once one is known.",
    ],
  },
  {
    date: "2026-07-12",
    agent: "real-estate-photography-continuous-improvement",
    summary:
      "Re-confirmed the state every session for the last month has independently re-confirmed: nextActionableTasks() is empty (all agent-doable roadmap work is done; every remaining task is owner:\"human\" or gated on one), leads-log.ts/loggedInterviewResults/listingAuditLog are all still genuinely empty (no human action has landed yet since the repo's first commit on 2026-06-13), PR #4 is still the only open PR, and branch deletion still hard-403s (retested on claude/checklist-novice-audit, same result as the last two sessions that tried). Rather than add another process/roadmap.ts tweak on top of the 8+ already shipped this way, made the actual bottleneck impossible to miss: a human-facing summary at the top of README.md.",
    changes: [
      "README.md: added a '⚠ Human action needed to unblock the next stage' section directly under the Status line, listing the 5 concrete pending human actions (book+shoot a concierge listing, run Phase 1 interviews, score 20 Zillow listings, flip the Cloudflare Access policy for PR #4, delete the ~12 stale branches) with pointers to the exact files/PRs involved. This is a communication fix, not new process machinery — the roadmap/gating system already correctly tracks all of this, but a human skimming the repo root previously had to open process/roadmap.ts and cross-reference progress-log.ts to see it.",
      "No roadmap.ts/decisions-log.ts changes — no new agent-doable task exists and no new business decision was made this session, only a documentation change surfacing existing state.",
    ],
    nextUp: [
      "Human: same 5 items as every recent session's nextUp, now also in README.md's top-level 'Human action needed' section so they don't require reading progress-log.ts to find. p2-first-deliveries is still the single highest-leverage one.",
      "Human: consider whether running this and the sibling 'real estate photo app Business development progress' trigger both hourly against the same fully-human-blocked roadmap is worth the cost — neither has had agent-doable work to do for several consecutive sessions now, and that's expected to continue until one of the 5 items above happens.",
      "Agent (next session): check leads-log.ts/loggedInterviewResults/listingAuditLog for real (non-empty) entries first — that's the actual signal anything changed. If still empty and nextActionableTasks() is still empty, don't invent another roadmap.ts/process/*.ts tweak just to have a diff; re-verify PR #4 and branch-deletion permissions (cheap, 30 seconds each) and stop there if nothing changed, rather than padding the session.",
    ],
  },
  {
    date: "2026-07-12",
    agent: "claude/dazzling-allen-ucfuio",
    summary:
      "Confirmed leads-log.ts/loggedInterviewResults/listingAuditLog are all still genuinely empty and PR #18 (the README human-action-needed banner) had already merged to main during this session's own investigation, so re-based onto it rather than duplicating it. Rather than stop at 'nothing agent-doable, re-verify and exit' for what would be the 9th consecutive session to do so, looked for the next gap between what prep material *says* and what actually works end-to-end (the way p1-listing-audit-rubric and p2-capture-checklist-scaling were found in earlier sessions) and found a real one: every outreach template and the pricing one-pager have told prospects to use a '[Phone / booking link]' or 'scan the QR code' since they were written — neither has ever existed, so a prospect who wanted to book from either surface had no way to.",
    changes: [
      "Added process/booking-link.ts: BOOKING_LINK, a mailto: link to Duncan's real inbox pre-filled with outreach-templates.ts's bookingIntakeFields as fill-in-the-blank prompts. Zero cost, zero new infrastructure, no Cloudflare Access/domain decision — deliberately not a hosted landing page (research/ builds but is deployed nowhere; docs-site is deployed but Access-gated to Duncan only, so it can't host a public booking page without a guardrailed Access change or a new public Pages project).",
      "process/outreach-templates.ts: added renderTemplateBody(template, bookingLink) to substitute the placeholder (kept as a parameter, not an import, since booking-link.ts already imports bookingIntakeFields from this file and importing back would cycle).",
      "process/pricing-one-pager.tsx: callToAction no longer references a nonexistent QR code; PricingOnePager now renders an actual 'Book now' link using BOOKING_LINK.",
      "docs-site/src/app/pricing/page.tsx: outreach template previews now render with the real link substituted (renderTemplateBody(t, BOOKING_LINK)); Booking intake section now shows the raw link text for pasting into DM/in-person follow-ups that don't use the placeholder.",
      "README.md: repo-structure tree lists the new file; bullet 1 of the 'Human action needed' section now notes the booking link is real, not a placeholder.",
      "roadmap.ts: added p2-booking-link (done). decisions-log.ts: logged the mailto-vs-hosted-landing-page decision and why a hosted page was considered and deferred.",
      "Verified: docs-site `npm run build` passes and the exported pricing/index.html contains the correctly URL-encoded mailto: link in both the one-pager button and the substituted template bodies; research `npm run build` passes (untouched); pipeline `npm test` + `npx tsc --noEmit` pass (untouched, run anyway since it imports process/capture-checklist.ts from the same package).",
    ],
    nextUp: [
      "Human: p2-first-deliveries is still the single highest-leverage next step, and a prospect who replies to an outreach template or clicks 'Book now' on the one-pager now lands in a real, pre-filled email to Duncan instead of a dead end.",
      "Human: Phase 1 interviews (p1-run-interviews) and the Zillow listing audit (p1-listing-audit) remain the other real unblocks; PR #4 (Cloudflare Access dashboard step) and the ~12 stale branches (agent git credential 403s on ref deletion) are unchanged.",
      "Agent (next session): if a hosted public booking page ever becomes worth it (e.g. Duncan wants a shareable link instead of a mailto:, or wants to A/B test copy), that's a real infra/domain decision for a human to weigh in on first — don't stand one up unilaterally. Otherwise check leads-log.ts/loggedInterviewResults/listingAuditLog for real entries first, same as every recent session's note.",
    ],
  },
  {
    date: "2026-07-12",
    agent: "claude/dazzling-allen-v3kn1n",
    summary:
      "This session's designated branch (claude/dazzling-allen-v3kn1n) had already been merged and its remote ref deleted before this session started, so restarted it from origin/main per the fresh-branch convention. Re-verified the now-familiar state: leads-log.ts/loggedInterviewResults/listingAuditLog are all still genuinely empty, PR #4 is still the only open PR (still draft, still blocked on Duncan's Cloudflare dashboard step), branch deletion still hard-403s (retested on claude/dazzling-allen-luc0w5, same result as every prior session), and all ~12 other agent/cursor branches are still confirmed strictly behind main (re-verified via git diff --stat). Rather than add an 11th re-confirmation session, looked for a genuine product gap and found one: STRATEGY.md's 5-step workflow (Guide -> Enhance -> Polish -> Deliver -> Brand) had 4 of 5 steps built (or, for Polish, explicitly deferred) but 'Brand' — agent headshot, logo, property microsite — had never been started by any session since the repo's first commit.",
    changes: [
      "Added pipeline/src/microsite.ts: generateMicrositeForDelivery() reads an enhance.ts delivery folder's photo filenames (numeric-aware sorted, agent logo/headshot excluded) and buildMicrositeHtml() renders a single responsive, HTML-escaped gallery page (hero photo, grid, agent contact card) referencing those photos by relative filename. Never opens, modifies, or overwrites the underlying photo files — enforces the mls-compliance.ts no-branding-on-MLS-photos guardrail by construction, since it only ever adds one new HTML file next to them.",
      "Added pipeline/src/cli-microsite.ts: `npm run microsite -- --dir <delivery-dir> --listing \"<address>\" --agent-name \"<name>\" [--agent-phone] [--agent-email] [--agent-brokerage] [--agent-headshot <filename>] [--agent-logo <filename>] [--tagline] [--out index.html]` writes the generated HTML into the delivery dir.",
      "Added pipeline/src/microsite.test.ts: covers filename sorting/exclusion, HTML-escaping of a hostile agent name/listing address (no script/attribute injection), and zero-photos/zero-optional-fields rendering. Wired into pipeline's existing `npm test`.",
      "Ran a real end-to-end smoke test (not just unit tests): generated two synthetic photos, ran the existing `enhance` CLI to produce a real delivery folder, then ran the new `microsite` CLI against that real output and confirmed the resulting index.html correctly referenced both delivered filenames and rendered the supplied agent contact info, without touching the two photo files.",
      "roadmap.ts: added p2-brand-microsite (done). decisions-log.ts: logged why this is a static HTML file the agent hosts/forwards themselves rather than a new deployed service (same reasoning as the earlier booking-link decision — no new domain/hosting/Cloudflare Access decision, zero infra cost).",
      "README.md: repo-structure tree and pipeline section document the new files and `npm run microsite` usage; the top-level 'Human action needed' banner's item 1 now mentions the microsite generator alongside the booking link. AGENTS.md: added a microsite usage section alongside the existing enhance/log-lead docs.",
      "Verified: pipeline/ `npm test` (all 3 self-tests) and `npx tsc --noEmit` pass; docs-site `npm run build` and research `npm run build` both pass (neither touched, run per prompt_process.tsx step 7 since capture-checklist.ts/process/ types are shared).",
    ],
    nextUp: [
      "Human: p2-first-deliveries is still the single highest-leverage next step — a concierge delivery can now ship as enhanced photos *and* a branded, shareable microsite in one extra command, not just a folder of renamed JPEGs.",
      "Human: Phase 1 interviews (p1-run-interviews), the Zillow listing audit (p1-listing-audit), PR #4's Cloudflare dashboard step, and the ~12 stale-branch deletions remain the other real unblocks — all unchanged this session.",
      "Agent (next session): once a real concierge delivery happens, get feedback on whether the microsite's fixed template (dark theme, single hero + grid) is actually what an agent wants to forward to a client, or whether it needs a lighter/on-brand theme option — don't guess further without that signal. If still nothing is human-unblocked and leads-log.ts/loggedInterviewResults/listingAuditLog are still empty, resist adding another roadmap.ts/process/*.ts tweak just to have a diff; a real product gap (the way this session found 'Brand' was never built, and p2-capture-checklist-scaling/p1-listing-audit-rubric found theirs) is worth more than another status re-confirmation.",
    ],
  },
  {
    date: "2026-07-12",
    agent: "real-estate-photography-continuous-improvement-2",
    summary:
      "Re-confirmed the now month-long human-blocked state (leads-log.ts/loggedInterviewResults/listingAuditLog still genuinely empty, PR #4 still open/draft/unchanged since 2026-06-15, all other branches confirmed strictly merged/behind main, branch deletion still expected to 403) and, rather than add an 11th re-confirmation, closed STRATEGY.md's last unaddressed open question: brokerage sales cycle vs agent PLG. This was genuinely open (unlike v1 app scope, which is correctly gatedOn real validation data) and desk-researchable the same way mls-compliance.ts and virtual-staging-tech.ts closed the first two questions.",
    changes: [
      "Added process/gtm-motion.ts: sourced comparison of brokerage-led vs agent-led PLG go-to-market motions (general B2B SaaS sales-cycle/PLG benchmarks plus 2026 real-estate-specific AI-tool-adoption reporting), with an explicit provisional decision (lead with agent PLG now, sequence brokerage sales as a Month-3 expansion step) and revisit condition.",
      "process/roadmap.ts: added p4-gtm-motion (done) under the previously-empty Phase 4 task list.",
      "process/prompt_process.tsx: imports and renders the new 'Go-to-market motion' dashboard section (decision + both options), same pattern as the existing virtual-staging-tech section.",
      "STRATEGY.md: checked off the 'Brokerage sales cycle vs agent PLG' open question with a pointer to process/gtm-motion.ts.",
      "decisions-log.ts: logged the decision and the specific evidence (Inman's May-2026 reporting on brokerage AI-tool adoption stalling within ~90 days) that drove it.",
      "Verified: docs-site `npm run build` and research `npm run build` both pass with the new dashboard section; pipeline `npm test` + `npx tsc --noEmit` pass (untouched, run anyway since it imports process/capture-checklist.ts from the same package).",
    ],
    nextUp: [
      "Human: same 5 items as every recent session's README banner — p2-first-deliveries (book+shoot a concierge listing) remains the single highest-leverage next step; Phase 1 interviews; the Zillow listing audit; PR #4's Cloudflare dashboard step; the ~12 stale branches.",
      "Agent (next session): check leads-log.ts/loggedInterviewResults/listingAuditLog for real entries first. STRATEGY.md's only remaining open checkbox (v1 app scope) is correctly gatedOn p1-run-interviews + p2-first-deliveries via p3-app-scope — don't answer it early without that data, unlike this session's question which was genuinely desk-researchable. If nothing new and no fresh product gap is found, don't pad the session; a short re-verification is fine and honest.",
    ],
  },
  {
    date: "2026-07-13",
    agent: "claude/dazzling-allen-k4o1nz",
    summary:
      "Re-verified the human-blocked state (all roadmap tasks still done/blocked-on-human as of the last session, PR #4 still open/draft, all other remote branches still confirmed strictly merged/behind main via `git diff origin/main...origin/<branch> --stat`, docs-site's /pricing flow re-checked and confirmed not actually broken — it's an internal copy-from page backed by a mailto: link by deliberate design, not a public prospect-facing URL, per the existing booking-link.ts decision). Rather than add yet another prose re-confirmation, fixed the repeated-re-confirmation problem itself: added process/blockers.ts as the one place blocker state lives, so future sessions with nothing new to report can update it in a one-line diff instead of writing a new paragraph.",
    changes: [
      "Added process/blockers.ts: typed HumanBlocker[] for the 5 known human-blocked items (first concierge delivery, Phase 1 interviews, Zillow listing audit, Cloudflare Access dashboard step, stale-branch cleanup), each with whatsNeeded/unblocks/firstFlagged/lastConfirmed/confirmedByCount, plus staleFirst() to sort oldest-confirmed first.",
      "process/prompt_process.tsx: imports blockers.ts, adds step 0 to AGENT_PROCESS_INSTRUCTIONS telling sessions to bump a blocker's lastConfirmed/confirmedByCount instead of writing a new progress-log paragraph when nothing changed, adds a 'Human blockers' dashboard section above Roadmap, and adds humanBlockerCount to ProcessSnapshot.",
      "README.md: replaced the hand-written 5-item 'Human action needed' list with a short pointer to process/blockers.ts as the single source of truth (was independently drifting from roadmap.ts's blockedReason text — different wording, same facts, both hand-maintained).",
      "AGENTS.md: added blockers.ts to the process read-order list with the same instruction.",
      "decisions-log.ts: logged the consolidation decision and why (progress-log.ts had grown to ~300 lines with much of the growth being 'still blocked' restatements; three independently hand-written blocker copies is a real drift risk, not just verbosity).",
      "Verified: docs-site `npm run build` passes with the new dashboard section; research untouched (doesn't import process/, not rebuilt); pipeline untouched, not rebuilt.",
    ],
    nextUp: [
      "Human: process/blockers.ts is now the one place to check — same 5 items, unchanged this session.",
      "Agent (next session): read process/blockers.ts first. If your finding is 'still blocked, nothing changed,' bump lastConfirmed/confirmedByCount there instead of writing a new progress-log paragraph — that's the entire point of this session's change. If a blocker's confirmedByCount climbs into the double digits with lastConfirmed dates spanning weeks and it's still unresolved, that's a real signal worth surfacing to Duncan directly (e.g. in a PR description) rather than silently re-bumping forever.",
    ],
  },
  {
    date: "2026-07-13",
    agent: "real-estate-photography-continuous-improvement-2",
    summary:
      "Re-confirmed process/blockers.ts's 5 items are all still true (leads-log.ts/loggedInterviewResults/listingAuditLog still genuinely empty, PR #4 still open/draft/unchanged since 2026-06-15, branch deletion still hard-403s — re-tested live on claude/dazzling-allen-wg8i3m) and bumped confirmedByCount 1->2 on all 5 rather than writing a new prose paragraph, per blockers.ts's own convention. Also re-verified all 19 non-PR-#4 remote branches are still strictly behind/merged into main (git diff against each, up from the 12 last counted) and updated blockers.ts's stale-branch-cleanup count accordingly. Rather than stop there as an 18th+ re-confirmation session, read the npm install/audit output this session's own `npm install` runs produced (something no prior session's progress-log entry mentions doing) and found a real, agent-fixable gap: next.js had been pinned to a vulnerable 14.1.0 in both docs-site/ and research/ since the repo's first commit.",
    changes: [
      "docs-site/package.json + research/package.json: next 14.1.0 -> 14.2.35 (latest 14.x patch release; no App Router/config API changes needed). Verified `npm run build` passes clean in both, with identical route/page output.",
      "Deliberately did not go further to next@16.x, which is the only version that clears every advisory `npm audit` currently flags for this package (npm reports one combined vulnerable range spanning 9.3.4-canary.0 through 16.3.0-canary.5) — that's a major-version App Router migration with real breaking-change risk and no e2e/visual regression coverage in this repo to catch a silent break, not a same-session patch bump. Logged as a deliberately deferred follow-up in decisions-log.ts, not silently dropped.",
      "roadmap.ts: added p0-nextjs-security-patch (done). decisions-log.ts: logged the patch-vs-major-bump reasoning and why the major bump was deferred rather than attempted blind.",
      "process/blockers.ts: confirmedByCount 1->2 on all 5 entries; stale-branch-cleanup title/whatsNeeded updated from ~15 to ~19 confirmed-stale branches.",
      "Verified: pipeline/ `npm test` (all 3 self-tests) + `npx tsc --noEmit` pass, untouched by this session's changes (ran anyway per step 7 since it imports process/capture-checklist.ts from the same package).",
    ],
    nextUp: [
      "Human: same 5 items in process/blockers.ts — p2-first-deliveries (book+shoot a concierge listing) remains the single highest-leverage next step; Phase 1 interviews; the Zillow listing audit; PR #4's Cloudflare dashboard step; now ~19 stale branches (agent git credential still hard-403s on ref deletion, re-tested live this session).",
      "Human/agent: the next@16 migration (docs-site/ + research/) is a real, scoped follow-up once someone can eyeball the deployed site after — don't attempt it as a routine hourly-session patch; treat it like p3-app-scope, worth a deliberate session with more build/deploy verification than `npm run build` passing locally.",
      "Agent (next session): check leads-log.ts/loggedInterviewResults/listingAuditLog for real entries first, same as every recent session. If still empty and nextActionableTasks() is still empty, this session's approach (actually reading `npm install`/`npm audit` output instead of assuming dependencies are fine) is a reasonable place to look again — check pipeline/'s and docs-site/'s other dependencies for anything similarly newly-flagged, but don't attempt a major-version bump without a human able to verify the deployed result.",
    ],
  },
  {
    date: "2026-07-13",
    agent: "real-estate-photography-continuous-improvement-2",
    summary:
      "Completed p2-payment-collection, which a prior session (commit 9505fa7, ~4h earlier) had claimed in_progress but never finished — no branch or open PR had the actual work, so leads-log.ts/loggedInterviewResults/listingAuditLog were all still empty and this was the highest-leverage agent-doable task left. Closed the same class of silent gap p2-booking-link found for the booking step: pricing-one-pager.tsx has said 'Book your first listing for $19' since it was written, but nothing anywhere said HOW to actually pay.",
    changes: [
      "New process/payment-collection.ts: sourced comparison of Zelle / PayPal / Venmo (setup cost, fee, how-to-pay, tradeoffs, sources) plus a decision (Zelle primary, PayPal goods & services fallback, both to duncan.andrew.haywood@gmail.com) and a revisit condition (real merchant processor once volume/price outgrows peer-to-peer transfers).",
      "pricing-one-pager.tsx: howItWorks step 4 now says 'Pay & get the folder'; added a 'How do I pay?' FAQ entry rendering paymentInstructionsText().",
      "leads-log.ts: Lead type gained optional paymentMethod/paymentReference fields. pipeline/src/log-lead.ts: CLI accepts --payment-method/--payment-reference, validates paymentMethod against payment-collection.ts's options and rejects paymentReference on any non-'paid' stage.",
      "prompt_process.tsx: new 'Payment collection' dashboard section (decision + per-method cards), same pattern as the existing virtual-staging-tech/gtm-motion sections.",
      "roadmap.ts: p2-payment-collection in_progress -> done. decisions-log.ts: logged the Zelle/PayPal decision and rationale.",
      "pipeline/src/log-lead.test.ts: added assertions for invalid payment method, payment-reference-without-paid-stage rejection, and correct formatting of paid entries.",
      "Verified: pipeline/ `npm test` (all 3 self-tests) + `npx tsc --noEmit` pass; docs-site/ `npm run build` passes clean (9/9 static pages including /process, /pricing).",
    ],
    nextUp: [
      "Human: process/blockers.ts's 5 items unchanged by this session (still all confirmed 2026-07-13 by the prior session) — p2-first-deliveries remains the single highest-leverage next step, now that both booking (p2-booking-link) and payment (this session) have real, working instructions behind them. payment-handle-setup in blockers.ts specifically still needs a human to confirm duncan.andrew.haywood@gmail.com actually receives Zelle/PayPal payments before the first real delivery.",
      "Agent (next session): with p2-payment-collection done, re-run nextActionableTasks() fresh — if it's empty again (likely, since phase 2's agent-doable tasks are now essentially all done), fall back to checking leads-log.ts/loggedInterviewResults/listingAuditLog for real entries first, then process-quality passes (this session didn't audit outreach-templates.ts or interview-script.ts against the new payment/booking info for consistency, which would be a reasonable next look).",
    ],
  },
  {
    date: "2026-07-13",
    agent: "claude/dazzling-allen-rb6omk",
    summary:
      "Found process/payment-collection.ts already built and open as PR #25 by a concurrent session (started this session's own duplicate copy first, then caught the collision via `git ls-remote origin` per step 6, discarded the duplicate, verified PR #25's CI was green, and merged it) — the exact race step 2a exists to prevent, except here both sessions carried the work all the way to a PR before either checked, so the fix was catching it at merge time instead. With nextActionableTasks() empty afterward (every phase-0/1/2/4 agent task done, p3-app-scope correctly gated on human-blocked interviews/deliveries), audited outreach-templates.ts against the new booking/payment info per the merged session's own nextUp suggestion (found no gap — payment terms belong at delivery time, not in cold-outreach copy, which the existing templates already get right) and then found a real, still-unaddressed gap one step further down the funnel: nothing combined the finished photos + microsite + payment ask into an actual ready-to-send delivery message.",
    changes: [
      "New process/delivery-message.ts: deliveryMessageText(), composing listing address, photo count, an optional microsite mention, payment-collection.ts's paymentInstructionsText(), and the existing free-redo guarantee into one ready-to-paste handoff message.",
      "pipeline/src/cli-microsite.ts: now imports and prints the delivery message automatically right after a successful microsite build (skipped when photoCount is 0, matching the existing no-photos warning path) — the exact moment a real delivery is ready to hand over, so there's nothing extra to remember.",
      "New pipeline/src/delivery-message.test.ts (added to pipeline's `npm test` script): asserts the named/generic greeting branches, that the listing address/photo count/microsite filename are included when set, that the microsite line is omitted when unset, and that the payment instructions are present.",
      "roadmap.ts: added p2-delivery-message (done). decisions-log.ts: logged the decision and why it's the same class of gap as booking-link.ts/payment-collection.ts, one step later in the funnel.",
      "blockers.ts: bumped confirmedByCount 2->3 (3 for stale-branch-cleanup too) on the 4 long-standing blockers — re-verified leads-log.ts/loggedInterviewResults/listingAuditLog still empty, PR #4 still open/draft, and re-ran the branch-diff check (no working delete-branch tool on the GitHub MCP surface, confirming the prior 403 finding). Left payment-handle-setup's confirmedByCount at 1 (still genuinely only confirmed once) but updated its wording now that payment-collection.ts is built, not still in progress.",
      "Verified: pipeline/ `npm test` (now 4 self-tests) + `npx tsc --noEmit` pass; docs-site/ `npm run build` passes clean; research/ untouched, not rebuilt.",
    ],
    nextUp: [
      "Human: process/blockers.ts's items are unchanged in substance — p2-first-deliveries is now fully prepped end-to-end (booking, capture, enhance, brand, delivery message, and payment ask all exist as real, working tools) and remains the single highest-leverage next step. payment-handle-setup specifically still needs Duncan to confirm duncan.andrew.haywood@gmail.com actually receives Zelle/PayPal funds before the first real delivery closes the loop.",
      "Agent (next session): check for concurrent branches/PRs *before* writing any code, not just before pushing — this session's near-miss (a second independent payment-collection.ts, caught only because ls-remote happened to run early) shows step 6's branch check needs to happen first, not as a pre-push formality. With nextActionableTasks() empty again, check leads-log.ts/loggedInterviewResults/listingAuditLog for real entries first; if still empty, look for the next silent 'nothing tells a human what to actually do/say' gap the way booking-link/payment-collection/delivery-message each did, rather than defaulting straight to a blockers.ts re-confirmation.",
    ],
  },
  {
    date: "2026-07-13",
    agent: "real-estate-photography-continuous-improvement-2",
    summary:
      "This session's own scheduling was misconfigured (a duplicate hourly trigger with no repo/branch bound to it, unlike its properly-configured sibling), so first re-attached the session to this repo, then picked up PR #26 (claude/dazzling-allen-rb6omk, p2-delivery-message) since neither the GitHub check-runs nor actions-runs REST endpoints are reachable from this session (403 'Resource not accessible by integration', same limitation prior sessions hit) and WebFetch 404s on this private repo's PR page. Verified locally instead: checked out the branch, ran pipeline `npm test` + `npx tsc --noEmit` (all pass) and docs-site `npm run build` (9/9 static pages, clean) against the actual PR content, read the diff for quality, then squash-merged.",
    changes: [
      "Merged PR #26 (p2-delivery-message) to main via the GitHub REST merge endpoint (mergeable_state: clean, no review/bot comments, verified locally as above since CI status wasn't readable via API or WebFetch).",
      "Re-verified nextActionableTasks() is still empty and leads-log.ts/loggedInterviewResults/listingAuditLog are still genuinely empty (no real human data has landed since the repo's first commit); PR #4 (Cloudflare Access) still open/draft/unchanged since 2026-06-15; branch deletion still hard-403s, now tested a second way (the GitHub REST `DELETE /git/refs/heads/...` endpoint directly, not just `git push --delete`) with the same result.",
      "process/blockers.ts: bumped confirmedByCount 3->4 on the five blockers this session re-verified (all but payment-handle-setup, which needs a human financial confirmation this session can't check) and corrected stale-branch-cleanup's count from the earlier '~19' to the actual ~23 (24 non-main branches exist; only cursor/fix-pages-access-4a7e is live, as PR #4) — the estimate had drifted stale itself. Also documented in whatsNeeded that three-dot `git diff main...branch` false-positives as 'unmerged' after a squash merge (the branch ref still points at its original, un-squashed commit) and that direct two-argument `git diff main branch` is the reliable check; this tripped up this session's own first pass at auditing the branch list before working out why.",
    ],
    nextUp: [
      "Human: process/blockers.ts's items are unchanged in substance from the prior session — p2-first-deliveries (book, shoot, deliver one real concierge listing end-to-end using the now-complete toolchain) remains the single highest-leverage next step.",
      "Agent (next session): with p2-delivery-message now merged, nextActionableTasks() is empty again — check leads-log.ts/loggedInterviewResults/listingAuditLog for real entries first, same as every recent session. This session found the remaining agent-doable surface area for this idea has gotten thin (the last several sessions in a row have each found one small real gap, but they're getting rarer and smaller); if still nothing new and no genuine product/process gap turns up, a short, honest re-verification bumping blockers.ts is the right call, not inventing busywork.",
    ],
  },
  {
    date: "2026-07-13",
    agent: "claude/dazzling-allen-l25h2i",
    summary:
      "Ran `git ls-remote` + a diff check against every remote claude/* branch per step 6 before doing anything else, and initially found what looked like a real problem: PR #26 (p2-delivery-message) showed `merged: false` with a `merged_at` timestamp set, and `git merge-base --is-ancestor` confirmed its commit wasn't on main yet — so cherry-picked it fresh and opened PR #28 to land it. Mid-session, that PR's merge attempt hit a conflict: a concurrent session had independently noticed the same PR #26 was stuck and merged it for real in the meantime (main's e5782b0 and af58679), making PR #28 a pure duplicate. Closed #28 unmerged and rebased onto the real main instead of re-litigating who was 'right' — the outcome (delivery-message.ts on main) was already achieved. With nextActionableTasks() empty again afterward and leads-log.ts/loggedInterviewResults/listingAuditLog still genuinely empty, found the next real, still-unaddressed gap one step past delivery-message.ts: nothing in the repo ever asked a paying customer for a testimonial or a referral, even though STRATEGY.md's own numbers (4-12 listings/month, agents who talk to each other) make word-of-mouth the cheapest growth channel available under the no-ad-spend guardrail.",
    changes: [
      "New process/referral-followup.ts: followUpMessageText() (a 3-7-days-post-delivery check-in asking for a concrete testimonial and offering a referral), REFERRAL_INCENTIVE (a future-delivery discount for both referrer/referee — $10/$5 off, not cash, so it doesn't violate the no-real-spend guardrail), TESTIMONIAL_PROMPT, and REFERRAL_SOURCED_NOTE_HINT (how to log a referral-sourced lead in the existing leads-log.ts notes field without adding a new LeadStage).",
      "New pipeline/src/referral-followup.test.ts (added to pipeline's `npm test` script): asserts named/generic greeting branches, listing address inclusion, the testimonial ask, and that both incentive amounts are discounts (not cash).",
      "process/prompt_process.tsx: new 'Referral & follow-up' dashboard section (incentive card + timing), same pattern as the existing payment-collection/gtm-motion sections.",
      "roadmap.ts: added p2-referral-followup (done). decisions-log.ts: logged the decision and rationale.",
      "Verified: pipeline/ `npm test` (now 6 self-tests) + `npx tsc --noEmit` pass; docs-site/ `npm run build` passes clean; research/ untouched, not rebuilt.",
    ],
    nextUp: [
      "Human: process/blockers.ts's items unchanged in substance — p2-first-deliveries remains the single highest-leverage next step, now fully prepped end-to-end including a post-delivery growth loop (booking, capture, enhance, brand, deliver + payment ask, and testimonial/referral follow-up all exist as real, working tools). payment-handle-setup specifically still needs Duncan to confirm duncan.andrew.haywood@gmail.com actually receives Zelle/PayPal funds.",
      "Agent (next session): before assuming a PR is stuck/lost, check whether a sibling session is mid-fix on it right now (fetch immediately before merging, not just at session start) — this session's near-miss (opening a duplicate recovery PR for work another session was already correctly merging) cost a wasted PR, not wasted product work, only because the rebase-and-drop was cheap; a more entangled duplicate could have been worse. With nextActionableTasks() empty again, check leads-log.ts/loggedInterviewResults/listingAuditLog for real entries first; if still empty, the funnel now runs booking -> capture -> enhance -> brand -> deliver -> follow-up/referral end-to-end, so the next silent gap (if one exists) is more likely in process quality/consistency than a missing funnel step — audit for drift between outreach-templates.ts, delivery-message.ts, and referral-followup.ts's tone/promises before inventing new files.",
    ],
  },
  {
    date: "2026-07-13",
    agent: "claude/dazzling-allen-mf5cdg",
    summary:
      "Re-verified the human-blocked state first (nextActionableTasks() still empty, leads-log.ts/loggedInterviewResults/listingAuditLog still genuinely empty, PR #4 still the only open PR, all 27 non-main remote branches — up from ~23, including a new claude/promise-consistency-audit-0713 whose empty diff confirms a sibling session already ran the exact outreach/delivery/referral consistency audit this repo's last few nextUp notes suggested, finding nothing wrong there, matching this session's own spot-check). Rather than re-run that same audit a second time, widened it to the docs-site itself and found two real, concrete drift bugs: (1) docs-site/content/strategy.md — a hand-copied duplicate of root STRATEGY.md rendered live at the private /docs/strategy page — had silently fallen behind for weeks, still showing 3 already-answered STRATEGY.md open questions (MLS compliance, virtual staging tech, brokerage-vs-PLG GTM) as unanswered checkboxes; (2) auditing that surfaced a second, older drift underneath it: STRATEGY.md's own Business model table and research/'s public site both said Host-pack (Airbnb/STR) pricing was a flat '$19/listing', contradicting the actual '$19-79/listing, scales with size' decision this repo logged on day one (2026-06-13) and used consistently everywhere else (interview-script.ts, outreach-templates.ts's str-host-dm template).",
    changes: [
      "docs-site/src/lib/docs.ts: strategy and replication doc pages now read STRATEGY.md and docs/REPLICATION_PROMPT.md directly from their canonical repo-root paths at build time instead of a manually-synced content/ duplicate — the same fix blockers.ts already applied to human-blocker facts, applied here to a different pair of files so this class of drift can't recur. Deleted the now-unused docs-site/content/strategy.md and docs-site/content/replication.md (which was, on inspection, still byte-identical to its source — only strategy.md had actually drifted). docs-site/content/deployment.md has no canonical source elsewhere, so it stays a real file, just resolved via the same repo-root-relative path for consistency.",
      "STRATEGY.md + research/src/lib/data.ts: Host-pack pricing corrected from '$19/listing' to '$19-79/listing' to match the actual day-one pricing decision and every other place it's already stated correctly.",
      "roadmap.ts: added p0-docs-content-drift-fix (done) under Phase 0. decisions-log.ts: logged both the docs-site dedup fix and the pricing-drift fix as one entry (same root cause, discovered together).",
      "blockers.ts: bumped confirmedByCount 4->5 on all 5 long-standing blockers (re-verified each is still true) and corrected stale-branch-cleanup's count from ~23 to ~26 confirmed-stale (27 non-main branches now exist, only cursor/fix-pages-access-4a7e/PR #4 is live).",
      "Verified: docs-site/ `npm run build` passes clean (9/9 static pages) and the built /docs/strategy/index.html was spot-checked to confirm its 3 answered checkboxes now render checked and the still-genuinely-open v1-scope question renders unchecked; research/ `npm run build` passes clean; pipeline/ `npm test` (all 5 self-tests) passes, untouched by this session (run anyway per step 7 since it imports process/capture-checklist.ts from the same package).",
    ],
    nextUp: [
      "Human: process/blockers.ts's items are unchanged in substance — p2-first-deliveries (book, shoot, deliver one real concierge listing end-to-end using the now-complete toolchain) remains the single highest-leverage next step. payment-handle-setup still needs Duncan to confirm duncan.andrew.haywood@gmail.com actually receives Zelle/PayPal funds.",
      "Agent (next session): the docs-site/content/ dedup pattern (read canonical files live instead of hand-copying) is worth applying proactively if any future session adds a new docs-site page mirroring another repo-root doc — don't reintroduce a hand-synced copy. With nextActionableTasks() still empty and leads-log.ts/loggedInterviewResults/listingAuditLog still empty, check for other cross-file numeric/pricing claims (turnaround times, photo counts, fee percentages) that might have drifted the same way pricing did, before defaulting to a blockers.ts-only re-confirmation.",
    ],
  },
  {
    date: "2026-07-13",
    agent: "claude/promise-consistency-audit-0713",
    summary:
      "Every open PR check across both this repo and local-site-studio came back clean (no open PRs on either besides the pre-existing, human-blocked cursor/fix-pages-access-4a7e), and leads-log.ts/loggedInterviewResults/listingAuditLog are all still empty — nextActionableTasks() is empty and every process/blockers.ts item genuinely still needs Duncan. Took up the prior session's own suggestion: audited outreach-templates.ts, pricing-one-pager.tsx, payment-collection.ts, delivery-message.ts, and referral-followup.ts against each other for promise drift. Price ($19), turnaround (1 business day), and payment instructions were all consistent (the latter shared via paymentInstructionsText(), so there was no way for it to drift). Found one real gap: deliveryMessageText() unconditionally told every recipient 'the redo is free on this first delivery' and signed off 'Thanks for trying Listing Lens!' regardless of whether they were actually a first-time or repeat/referred client — harmless with zero real deliveries so far, but wrong on its face the moment referral-followup.ts's own incentive loop produces a repeat booking.",
    changes: [
      "process/delivery-message.ts: DeliveryMessageInput gains an optional isRepeatClient flag (default false); first-delivery output is byte-for-byte unchanged, repeat-client output swaps in 'same free-redo guarantee as always' / 'Thanks again for using Listing Lens!'.",
      "pipeline/src/delivery-message.test.ts: added assertions for the default (first-delivery) wording and the new isRepeatClient branch.",
      "roadmap.ts: added p2-promise-consistency-audit (done). decisions-log.ts: logged the decision and rationale.",
      "Verified: pipeline/ `npm test` (still 6 self-tests, extended assertions) + `npx tsc --noEmit` pass; docs-site/ untouched, not rebuilt; research/ untouched, not rebuilt.",
    ],
    nextUp: [
      "Human: process/blockers.ts unchanged in substance — p2-first-deliveries (book, shoot, deliver one real concierge listing) remains the single highest-leverage next step; the toolchain now correctly handles a repeat/referred 2nd delivery too, not just the first.",
      "Agent (next session): with nextActionableTasks() empty again, check leads-log.ts/loggedInterviewResults/listingAuditLog for real entries first. cli-microsite.ts still always calls deliveryMessageText() with isRepeatClient left at its default (false) — once leads-log.ts has a real 'paid' entry for a given contact, wiring an actual repeat-client lookup into the CLI (instead of leaving the flag manual/unused) would be the natural next increment, but isn't worth building ahead of any real repeat customer existing.",
    ],
  },
  {
    date: "2026-07-13",
    agent: "claude/mls-photo-count-drift-fix-0713",
    summary:
      "Only open PR on this repo was still the pre-existing, human-blocked cursor/fix-pages-access-4a7e (#4); leads-log.ts/loggedInterviewResults/listingAuditLog all still empty, nextActionableTasks() still empty. Took up the prior two sessions' own suggestion to hunt for cross-file numeric drift (turnaround times, photo counts, fee percentages) and found two real gaps, both traceable to the same root cause: p2-capture-checklist-scaling (2026-07-12) changed capture-checklist.ts's shot counts/timing to hit the promised 15-25 photo range, but nothing cross-checked the other files that cite the checklist's old numbers by hand. (1) mls-compliance.ts's photo-count-guidance implication still said the checklist 'currently specs roughly 9-11 shots,' a fact the docs site renders live, when the real typical default is now 19. (2) More consequential: pricing-one-pager.tsx and 3 spots in outreach-templates.ts quote '~30 minutes' for the guided capture step, but totalTargetMinutes() now computes 33-47.5 minutes (38.5 typical) — an outreach-copy promise a human would actually read to a real prospect that the checklist itself can no longer honor.",
    changes: [
      "process/mls-compliance.ts: photo-count-guidance implication updated to the real current default (19 typical, 16-22 range) instead of the stale pre-scaling '9-11' figure.",
      "process/pricing-one-pager.tsx (2 spots) and process/outreach-templates.ts (3 spots: agent-cold-email, agent-in-person, brokerage-intro): '~30 minute(s)' capture-time promise corrected to '~35-40 minutes' to match capture-checklist.ts's real scaled default. STRATEGY.md's own looser 'in 30 minutes' tagline deliberately left as-is (whole-workflow positioning, not a literal capture-time SLA) — same treatment precedent already gave the 'under 2 hours' delivery target vs. the actual '1 business day' promise.",
      "process/capture-checklist.ts: preShootPrep doc comment's stale '30-minute-fix' reference updated to match.",
      "roadmap.ts: added p2-mls-compliance-photo-count-drift-fix and p2-capture-time-promise-drift-fix (both done). decisions-log.ts: logged both as separate entries (distinct customer-facing surfaces, same root cause).",
      "Verified: pipeline/ `npm install && npm test` (all 5 self-tests) + `npx tsc --noEmit` pass; docs-site/ `npm run build` passes clean (9/9 static pages); research/ `npm run build` passes clean (4/4 static pages). Checked open PRs via the GitHub API directly (no gh CLI in this session) — only #4 open, unrelated files.",
    ],
    nextUp: [
      "Human: process/blockers.ts unchanged in substance — p2-first-deliveries remains the single highest-leverage next step. payment-handle-setup still needs Duncan to confirm duncan.andrew.haywood@gmail.com actually receives Zelle/PayPal funds.",
      "Agent (next session): with nextActionableTasks() empty again, check leads-log.ts/loggedInterviewResults/listingAuditLog for real entries first. The cross-file-drift-hunting approach (grep every concrete number — price, time, count, percentage — across process/*.ts, STRATEGY.md, research/, docs-site/, and diff against what the code that backs it actually computes) paid off twice in a row now (this session and the promise-consistency-audit session before it); worth repeating periodically rather than treating either audit as final, since any future change to capture-checklist.ts, payment-collection.ts, etc. can silently re-introduce the same class of gap. ~40+ non-main branches still exist (only cursor/fix-pages-access-4a7e is live); branch deletion remains proxy-blocked (see blockers.ts's stale-branch-cleanup entry) — still needs a human with real GitHub UI/token access.",
    ],
  },
  {
    date: "2026-07-13",
    agent: "claude/dazzling-allen-wrkyk8",
    summary:
      "Independently found and fixed the exact same '~30 minutes' capture-time promise-drift bug as the concurrent claude/mls-photo-count-drift-fix-0713 session, computing the identical honest number (35-40 minutes) by hand from capture-checklist.ts's totalTargetMinutes(). Opened PR #34 with that fix; by the time CI finished, PR #33 (the other session's near-identical fix) had already merged to main, and PR #34's merge attempt hit a real conflict. Rather than force through a duplicate, reset this branch onto the new main and kept only the genuinely additive delta: instead of re-landing the same hardcoded '35-40 minutes' strings a second time, made pricing-one-pager.tsx compute that value live from a new capture-checklist.ts export (onSiteTimeRange()) instead of quoting a hand-typed number — the same class of fix each fix-then-drift cycle in this repo's history has eventually converged on (see p0-docs-content-drift-fix's 'stop hand-syncing, read the canonical source' pattern), applied here to a computed number instead of a duplicated file.",
    changes: [
      "process/capture-checklist.ts: added onSiteTimeRange(additionalBeds?, additionalBaths?) — rounds totalTargetMinutes() outward to the nearest 5 minutes on each end (default home: '35-40 minutes'), documented with the near-simultaneous-duplicate-fix incident as the reason it exists.",
      "process/pricing-one-pager.tsx: imports onSiteTimeRange() and computes both on-site-time copy lines from it instead of the (now on main, from PR #33) hardcoded '~35-40 minutes' string — output text unchanged, but can no longer independently drift from the checklist.",
      "process/outreach-templates.ts: left PR #33's hand-fixed '35-40 minutes' text as-is (these are static string literals, not computed); added a doc comment pointing at onSiteTimeRange() as the source of truth to check by eye if the checklist changes again.",
      "pipeline/src/coverage.ts: comment cleanup (dropped a stale reference to a fixed '30-minute target'), independent of the duplicate — kept.",
      "roadmap.ts: added p2-capture-time-single-source (done). decisions-log.ts: logged the near-duplicate-PR incident and the follow-up fix as its own entry. blockers.ts: bumped confirmedByCount on the 4 blockers re-verified this session and corrected the stale-branch count to 31 (up from 26, `git ls-remote --heads origin`).",
      "Verified: pipeline/ `npm test` (all 5 self-tests) + `npx tsc --noEmit` pass; docs-site/ `npm run build` passes clean (9/9 static pages), spot-checked the built /pricing page's HTML for '35-40 minutes' in both places; research/ untouched, not rebuilt.",
    ],
    nextUp: [
      "Human: process/blockers.ts unchanged in substance — p2-first-deliveries remains the single highest-leverage next step.",
      "Agent (next session): before opening a PR for a fix found via a repo-wide audit (numeric drift, promise consistency, etc.), re-fetch origin and re-grep for the same symptom immediately before pushing, not just at session start — this session's near-duplicate happened because two sessions started their audits close enough together that neither saw the other's fix land mid-session. When a duplicate is found post-hoc, prefer rebasing onto the winner and shipping only the genuinely additive delta (as here) over re-litigating which PR was 'first'. With nextActionableTasks() empty again, check leads-log.ts/loggedInterviewResults/listingAuditLog for real entries first.",
    ],
  },
  {
    date: "2026-07-13",
    agent: "claude/blocker-throttle-0713",
    summary:
      "nextActionableTasks() still empty, all three real-data logs (leads-log.ts, listingAuditLog, loggedInterviewResults) still empty, PR #4 still open/draft/unchanged — no product-facing progress possible this session. Found the actual cause of the repeated-recheck waste flagged in blockers.ts's own doc comment is still happening: three same-day, near-identical 'still blocked, nothing changed' branches (claude/blocker-recheck-0713a/b/c) sitting on the remote, each independently re-verifying the same ~5 blockers. Spent the session on the process improvement prompt_process.tsx explicitly permits when nothing else is agent-actionable: added real-time throttling so future sessions can skip a full re-verification pass (and the branch/commit/PR that comes with it) when one already happened recently.",
    changes: [
      "process/blockers.ts: added lastConfirmedAt (ISO timestamp) to every HumanBlocker entry alongside the existing date-only lastConfirmed, and an exported recentlyConfirmedWithinHours(hours) helper. staleFirst() now sorts by the finer-grained lastConfirmedAt. Bumped confirmedByCount on all 5 pre-existing blockers (re-verified: still all true, PR #4 still open/draft, stale-branch count still 31 non-main per `git ls-remote --heads origin`) and added a 6th, different-in-kind entry — cron-cadence-too-frequent — flagging for Duncan that the sub-daily agent cron cadence itself may be worth loosening now that the business has been fully human-blocked for multiple days straight.",
      "process/prompt_process.tsx: new step 0a tells a session to call recentlyConfirmedWithinHours(3) before spending a full session re-verifying blockers already re-checked within the last 3 hours; if true and a cheap check (empty logs still empty, no new merges, nextActionableTasks() still empty) finds nothing new, stop there — no branch/commit/PR. Old step 0 renumbered to 0b, otherwise unchanged.",
      "roadmap.ts: added p2-blocker-recheck-throttle (done) under phase-2. decisions-log.ts: logged the throttle mechanism and the cron-cadence flag as one decision entry.",
      "Verified: pipeline/ `npm install && npm test` (all 5 self-tests) + `npx tsc --noEmit` pass (untouched by this change, run as a sanity check anyway); docs-site/ `npm run build` passes clean (imports prompt_process.tsx directly, so this is the real type-check for the new blockers.ts fields/helper and the updated instructions string); research/ untouched, not rebuilt. Checked open PRs via the GitHub REST API directly with the session's injected GITHUB_TOKEN (no gh CLI available) — only #4 open, unrelated files, still draft/unchanged.",
    ],
    nextUp: [
      "Human: same five items as every recent session (first concierge delivery, phase-1 interviews, Zillow listing audit, Cloudflare Access dashboard toggle + merge PR #4, confirm the Zelle/PayPal payment handle actually receives funds) remain the highest-leverage next steps — see blockers.ts. New: consider whether the agent cron(s) hitting this repo need to run as often as they currently do (see the new cron-cadence-too-frequent blocker) — this is a call only Duncan can make since it involves schedules outside this repo.",
      "Agent (next session): call recentlyConfirmedWithinHours(3) first. If true and nothing new, do the cheap check only and stop — do not push a branch just to restate this entry. If a genuine human-blocker resolution or new business-relevant finding shows up, that still always warrants a real progress-log entry regardless of the throttle window.",
    ],
  },
  {
    date: "2026-07-17",
    agent: "claude/dazzling-allen-on504g",
    summary:
      "recentlyConfirmedWithinHours(3) was true (blockers last confirmed 51 minutes earlier by PR #39) and the cheap check found nothing new (leads-log.ts/listingAuditLog/loggedInterviewResults still empty, nextActionableTasks() still empty, PR #4 still the only open PR, still draft/unchanged) — so per prompt_process.tsx step 0a, no full re-verification pass or 'still blocked' branch was warranted on its own. Instead used the session to finish work the stale-branch-cleanup blocker's own text had flagged as incomplete: every prior session had only spot-checked 5 of the ~20 dazzling-allen-* branches for unique content, extrapolating to the other ~30+ non-main branches rather than actually checking them. Audited all 36 non-main branches this time, using a better method than the diff --stat one blockers.ts previously recommended (which false-positives on every stale branch since main has moved on): `git log origin/main..origin/<branch> --oneline` to list each branch's own unmerged commits, then cross-referenced every one of those commit subjects against `git log origin/main --oneline` by hand. Result: zero branches contain business value not already on main — every unique-looking commit subject turned out to match an already-merged main commit under near-identical wording (checklist-scaling/gate-sequencing/on-device-vs-cloud/capture-time/blocker-recheck variants all included), except cursor/fix-pages-access-4a7e, which is the already-tracked live PR #4. This closes the open question of whether any of the ~35 stale-looking branches might be hiding real unmerged work.",
    changes: [
      "process/blockers.ts: stale-branch-cleanup entry rewritten from 'spot-checked 5 of the ~20' to a full audit of all 36, with the corrected branch count (36, up 1) and the better diff methodology documented so a future session doesn't need to redo the exhaustive per-branch check unless the branch count itself changes. Bumped lastConfirmed/lastConfirmedAt/confirmedByCount on all 6 blockers (all independently re-verified true this session, not just carried forward).",
      "No roadmap.ts or decisions-log.ts change — no task status flipped and no product/business decision made, just process rigor (closing a known gap in evidence quality for an existing blocker).",
      "Verified: docs-site/ `npm run build` (imports prompt_process.tsx, which imports blockers.ts, so this type-checks the edits) passes clean; pipeline/ and research/ untouched, not rebuilt. Checked open PRs via the GitHub MCP server (list_pull_requests) — only #4 open, unrelated files, still draft/unchanged.",
    ],
    nextUp: [
      "Human: same six items as every recent session remain the highest-leverage next steps — see blockers.ts (first concierge delivery, phase-1 interviews, Zillow listing audit, Cloudflare Access dashboard toggle + merge PR #4, confirm the Zelle/PayPal payment handle actually receives funds, and reconsider the cron cadence now that this has been true for over a month straight).",
      "Agent (next session): the stale-branch audit is now exhaustive as of this session — no need to re-spot-check individual branches again unless `git ls-remote --heads origin`'s branch count changes from 36, in which case only the new branch(es) need the same commit-subject cross-reference, not the full set again.",
    ],
  },
  {
    date: "2026-07-18",
    agent: "claude/dazzling-allen-imbgjx",
    summary:
      "Full blocker re-verification pass (recentlyConfirmedWithinHours(3) had just lapsed, ~4h since the last check) confirmed all 6 human blockers unchanged again — then used list_triggers to get hard evidence on the cron-cadence-too-frequent blocker's open question, and used that evidence to make the one part of it that's actually agent-actionable: widened the recheck-throttle window itself from 3 to 12 hours, since a 3-hour window on a confirmed-hourly cron was still generating a full-pass 'nothing changed' branch/commit/PR/CI run every 3-4 hours indefinitely.",
    changes: [
      "process/blockers.ts: bumped lastConfirmed/lastConfirmedAt/confirmedByCount on all 6 entries. Re-confirmed the CI runner outage is still ongoing (run 29651540404 at 16:13:42Z, PR #46's push, same runner_id-0/~3s pattern, now ~16h in) — checked its 3 job records directly via the GitHub MCP server rather than trusting the prior note. Re-counted branches (42 non-main now, up 1 from 41) and confirmed the one new branch, claude/dazzling-allen-rqcae1, is PR #46's own source branch with an empty diff against main — not unique work. Rewrote cron-cadence-too-frequent's text: list_triggers confirms this repo's agent prompt is bound to a literal hourly cron (`0 * * * *`), not just 'sub-daily', and notes this session's throttle-window widening as the agent-actionable slice of what that blocker was already arguing for.",
      "prompt_process.tsx: step 0a's recentlyConfirmedWithinHours(3) call is now recentlyConfirmedWithinHours(12), with a doc note explaining why (hourly cron confirmed + over a month of zero blocker movement means 12h can't plausibly delay noticing a real resolution any more than a human would already notice it) and pointing at decisions-log.ts.",
      "roadmap.ts: added p2-blocker-recheck-window-widen (phase 2), status done, as its own task distinct from the original p2-blocker-recheck-throttle so the historical 3-hour reasoning stays on record.",
      "decisions-log.ts: new entry documenting the window-widen decision and rationale.",
      "Verified: docs-site/ `npm run build` passes clean (imports prompt_process.tsx -> blockers.ts, so this type-checks all the edits above); pipeline/ and research/ untouched, not rebuilt. Checked open PRs via the GitHub MCP server — only #4 open, unrelated files, still draft/unchanged. Checked all 42 non-main branches via `git merge-base --is-ancestor` plus a manual diff check on the one new one; no new unmerged business value found beyond what's already tracked.",
    ],
    nextUp: [
      "Human: same six items as every recent session remain the highest-leverage next steps — see blockers.ts (first concierge delivery, phase-1 interviews, Zillow listing audit, Cloudflare Access dashboard toggle + merge PR #4, confirm the Zelle/PayPal payment handle actually receives funds, and — now partially addressed at the code level, but the cron itself is still hourly — reconsider the actual cron schedule).",
      "Agent (next session): with the window now 12h, expect a full pass to actually be due roughly twice a day rather than every 3-4 hours; if recentlyConfirmedWithinHours(12) returns true, do only the cheap check (empty logs? new merges? nextActionableTasks() still empty?) per step 0a and skip the branch/commit/PR entirely if nothing's different — that's now the common case, not the exception.",
    ],
  },
  {
    date: "2026-07-19",
    agent: "claude/dazzling-allen-a4sdsa",
    summary:
      "recentlyConfirmedWithinHours(12) was true (blockers last confirmed ~5h earlier by PR #47) and the cheap check found nothing new — 6/6 human blockers unchanged, leads-log.ts/listingAuditLog/loggedInterviewResults still empty, PR #4 still the only open PR (draft/unchanged), nextActionableTasks() still empty (p3-app-scope remains correctly gated), and the actions-ci-runner-outage blocker independently re-confirmed still ongoing (run 29659392167 on main at 20:16:41Z, identical runner_id-0/~4s pattern, now ~21h in). Per step 0a this alone doesn't warrant a full re-verification branch. This session's harness can send Duncan an actual push notification/email, separate from anything in this repo, and no prior session's progress-log/blockers.ts entry showed any evidence that capability had ever been used to tell him the business has been 100% human-blocked for over a month or that CI has been down for over a day — so, judging that worth surfacing once rather than never, built a throttle for it first (so it doesn't become a new source of noise) and then used it.",
    changes: [
      "process/human-notifications.ts (new): humanNotificationLog + shouldNotifyHuman(hours = 72), the out-of-band equivalent of blockers.ts's recentlyConfirmedWithinHours(), so a repeat 'still blocked' push/email reminder doesn't get sent every session.",
      "prompt_process.tsx: new step 0a-2 tells a session with notification capability to check shouldNotifyHuman() before sending a reminder and to log every notification sent; imports humanNotificationLog and renders its most recent timestamp under the Human blockers dashboard section.",
      "roadmap.ts: added p2-human-notification-throttle (phase 2), status done. decisions-log.ts: logged the decision and rationale.",
      "Sent one push notification this session summarizing the month-long human-blocked state and the CI outage, and recorded it in humanNotificationLog (2026-07-19T01:20:00Z) so no session re-sends one for at least 72h absent genuinely new information.",
      "Verified: docs-site/ `npm run build` passes clean (imports prompt_process.tsx -> human-notifications.ts, so this type-checks the new file/import/dashboard change); pipeline/ and research/ untouched, not rebuilt. Checked open PRs via the GitHub MCP server — only #4 open, unrelated files, still draft/unchanged.",
    ],
    nextUp: [
      "Human: same six items as every recent session remain the highest-leverage next steps — see blockers.ts (first concierge delivery, phase-1 interviews, Zillow listing audit, Cloudflare Access dashboard toggle + merge PR #4, confirm the Zelle/PayPal payment handle actually receives funds, and check GitHub Actions billing/quota for the runner outage, now the most time-sensitive item).",
      "Agent (next session): if recentlyConfirmedWithinHours(12) is true and the cheap check finds nothing new, skip the branch/commit/PR per step 0a same as always. Separately, only send another out-of-band reminder if shouldNotifyHuman() returns true (72h throttle) or a genuinely new finding (blocker resolved / new blocker) justifies bypassing it — don't notify every run just because the capability exists.",
    ],
  },
  {
    date: "2026-07-22",
    agent: "claude/dazzling-allen-dco74e",
    summary:
      "Full re-verification pass (recentlyConfirmedWithinHours(12) had just elapsed, ~13h since the last check at 06:13Z). All 7 human blockers re-confirmed unchanged: real-data logs still empty, PR #4 still the only open PR (draft/unchanged), nextActionableTasks() still empty, CI outage re-confirmed still ongoing (~111h, run 29896411411). No product/business progress was agent-actionable this session, so per prompt_process.tsx step 4 spent it on process hygiene instead: trimmed the actions-ci-runner-outage blocker out of the same unbounded-growth pattern stale-branch-cleanup hit in 2026-07-19's fix, and corrected a branch-count error (recorded 48, actually 51 — a `list_branches` recount, not new agent activity).",
    changes: [
      "process/blockers.ts: bumped lastConfirmed/lastConfirmedAt/confirmedByCount on all 7 entries with fresh evidence (GitHub Actions job list checked directly on the newest run on main; open-PR list checked via the GitHub MCP server; leads-log.ts/listingAuditLog/roadmap.ts read directly). Rewrote actions-ci-runner-outage's whatsNeeded from an ever-appended per-session paragraph (13 sessions deep) down to the fixed diagnosis plus one overwritable 'most recent run / duration as of' data point. Corrected stale-branch-cleanup's branch count from a recorded 48 to the actual 51 (full-pagination list_branches, not just page 1) and confirmed via ancestry check that the two non-standard-named branches behind that delta (cursor/docs-cloudflare-access-5df0, cursor/setup-dev-environment-2314) are pre-existing 2026-06-14 abandoned scaffolding with no merge-base to main and no unique business content, not new work from a concurrent agent session — the repo's other open branches were all checked for genuinely new, not-yet-PR'd work per prompt_process.tsx step 6 and found to be the usual pattern (each one the immediately-preceding session's own now-merged source branch).",
      "decisions-log.ts: new entry documenting the CI-outage blocker trim and the branch-count correction.",
      "Verified: docs-site/ `npm run build` passes clean (type-checks blockers.ts/decisions-log.ts/progress-log.ts via prompt_process.tsx's import chain). pipeline/ and research/ untouched, not rebuilt. shouldNotifyHuman(72) returned false (~17h since the 2026-07-22T02:10Z push) — no repeat out-of-band notification sent this session, consistent with the throttle.",
    ],
    nextUp: [
      "Human: same seven items remain the highest-leverage next steps — see blockers.ts (first concierge delivery, phase-1 interviews, Zillow listing audit, Cloudflare Access dashboard toggle + merge PR #4, confirm the Zelle/PayPal payment handle actually receives funds, check GitHub Actions billing/quota for the runner outage — now ~111h and the single most actionable item — and reconsider the cron cadence).",
      "Agent (next session): a full pass on actions-ci-runner-outage should now just overwrite the 'most recent run' / 'duration as of' facts in blockers.ts in place, not append another paragraph — same pattern already established for stale-branch-cleanup.",
    ],
  },
  {
    date: "2026-07-25",
    agent: "claude/dazzling-allen-lfyv1d",
    summary:
      "recentlyConfirmedWithinHours(12) was true (last full pass ~4h earlier at 11:10Z) but did a full independent re-verification anyway while auditing branches for cooperation with other concurrent agent sessions, and found a real methodology bug in that audit process worth fixing: this session's fresh clone was shallow, which made `git merge-base --is-ancestor`/`git log origin/main..origin/<branch>` falsely report several long-merged branches as having unmerged commits (up to 11 for one). Ran `git fetch --unshallow origin`, re-checked, and cross-verified against GitHub's own PR history (list_pull_requests) — confirmed all 58 non-main branches are either fully merged (PRs #1-#16 and everything since, per prior sessions' finding) or the two known pre-existing abandoned-scaffolding branches; only PR #4 remains open and still human-blocked. All 7 human blockers re-confirmed unchanged with fresh evidence (CI outage run 30155979952 on main @ 31a9a47, same runner_id:0/empty-runner_name/~2-3s signature, now ~179h/~7.5 days; all data logs still empty; nextActionableTasks() still empty).",
    changes: [
      "prompt_process.tsx: step 6 now tells a session to check for a shallow clone and unshallow before trusting branch-ancestry checks, to avoid future sessions being misled the way this one briefly was.",
      "blockers.ts: bumped lastConfirmed/lastConfirmedAt/confirmedByCount on all 7 entries with this session's fresh evidence; stale-branch-cleanup's branch count corrected to 58 (up 1) with the shallow-clone caveat noted; actions-ci-runner-outage's 'most recent run' data overwritten in place per the existing convention (now run 30155979952, ~179h).",
      "decisions-log.ts: new entry documenting the shallow-clone finding and fix.",
      "No roadmap.ts task status changed and no product/business decision made — process rigor only, per prompt_process.tsx step 4 (nothing else was agent-actionable this session).",
      "Verified: docs-site/ `npm run build` passes clean (type-checks blockers.ts/decisions-log.ts/progress-log.ts via prompt_process.tsx's import chain); pipeline/ and research/ untouched, not rebuilt. shouldNotifyHuman(72) returned false (~13h since the 2026-07-25T02:11Z push) — no repeat out-of-band notification sent this session, consistent with the throttle.",
    ],
    nextUp: [
      "Human: same seven items remain the highest-leverage next steps — see blockers.ts. The CI outage (now ~7.5 days, still the single most time-sensitive item) and the cron-cadence reconsideration are the two most worth a direct look.",
      "Agent (next session): if your clone is shallow, unshallow before doing a branch audit (see prompt_process.tsx step 6) — this session's false-positive scare should not repeat.",
    ],
  },
  {
    date: "2026-07-26",
    agent: "claude/dazzling-allen-42ohts",
    summary:
      "recentlyConfirmedWithinHours(12) came back false by only ~29 seconds (last full pass 2026-07-26T04:10:00Z), which forced a full re-verification pass that then found nothing new: all 7 human blockers unchanged, CI outage re-confirmed on the newest main run (30187482944, identical runner_id:0/empty-runner_name/~3s signature, now ~204h/8.5 days), leads-log.ts/listingAuditLog/loggedInterviewResults still empty, PR #4 still the only open PR (draft/unchanged since 2026-06-15), and a fresh full-pagination list_branches call confirmed still exactly 60 non-main branches with no new ones. Since a full pass was mechanically triggered for literally zero new information, used the session to push the recheck-throttle window one notch further (12h -> 24h) rather than just re-stating the same facts again — same reasoning that justified 3h->12h on 2026-07-18, now applied at 22-34 confirmations per blocker with zero exceptions.",
    changes: [
      "process/blockers.ts: bumped lastConfirmed/lastConfirmedAt/confirmedByCount on all 7 entries with fresh evidence; actions-ci-runner-outage's 'most recent run'/'duration as of' data overwritten in place (now run 30187482944, ~204h) per the existing convention; cron-cadence-too-frequent's whatsNeeded updated to mention the 12h->24h widening.",
      "process/prompt_process.tsx: step 0a's recentlyConfirmedWithinHours(12) call is now recentlyConfirmedWithinHours(24), with a doc note explaining why (every blocker stable 6+ weeks to 8.5 days with 22-34 zero-exception confirmations; the 12h window was firing right at its own boundary for no new information; the separate 72h shouldNotifyHuman() out-of-band throttle is unchanged and remains the real mechanism for making sure Duncan hears about anything time-sensitive promptly).",
      "process/roadmap.ts: added p2-blocker-recheck-window-widen-24h (done) documenting this change, alongside the existing p2-blocker-recheck-window-widen task.",
      "decisions-log.ts: new entry documenting the 12h->24h widening and its rationale.",
      "Verified: docs-site/ `npm run build` passes clean (type-checks blockers.ts/decisions-log.ts/progress-log.ts/roadmap.ts via prompt_process.tsx's import chain). pipeline/ and research/ untouched, not rebuilt. shouldNotifyHuman(72) returned false (~38h since the 2026-07-25T02:11Z push) — no repeat out-of-band notification sent this session, consistent with the throttle.",
    ],
    nextUp: [
      "Human: same seven items remain the highest-leverage next steps — see blockers.ts. The CI outage (now ~8.5 days, still the single most time-sensitive item) and the cron-cadence reconsideration are the two most worth a direct look.",
      "Agent (next session): with the window now 24h, expect a full pass to actually be due roughly once a day; if recentlyConfirmedWithinHours(24) returns true, do only the cheap check per step 0a and skip the branch/commit/PR entirely if nothing's different.",
    ],
  },
  {
    date: "2026-07-27",
    agent: "claude/dazzling-allen-v5cz6k",
    summary:
      "recentlyConfirmedWithinHours(24) had just elapsed (last full pass 2026-07-26T16:15:00Z, ~25h earlier), so did a full re-verification pass: all 7 human blockers re-confirmed unchanged (real-data logs — leads-log.ts, listingAuditLog, loggedInterviewResults — still empty; nextActionableTasks() still empty, p3-app-scope still correctly gated; PR #4 still the only open PR, draft/unchanged since 2026-06-15; a fresh full-pagination list_branches call confirmed still exactly 60 non-main branches, no new ones, so no per-branch re-audit was needed). Went one step further than prior sessions on the CI outage specifically: instead of only checking the newest run's job metadata (runner_id/duration), tried downloading that run's actual job logs via get_job_logs and got a flat HTTP 404 — proof no runner ever picked up the job at all (not a step that failed and left logs), which rules out a workflow-file-level misconfiguration and confirms this is purely an account/org-level Actions issue, exactly as prior sessions suspected but hadn't directly verified. Also spot-checked ci.yml itself (plain `runs-on: ubuntu-latest`, nothing self-hosted or custom) to double-check there's no fixable repo-side cause. shouldNotifyHuman(72) returned false (~63h since the 2026-07-25T02:11Z push, due ~2026-07-28T02:11Z) — no repeat out-of-band notification sent this session, consistent with the throttle.",
    changes: [
      "process/blockers.ts: bumped lastConfirmed/lastConfirmedAt/confirmedByCount on all 7 entries with fresh evidence. actions-ci-runner-outage's 'most recent run'/'duration as of' data overwritten in place (now run 30210058863, ~229h/9.5 days) plus a new sentence documenting the job-log-404 finding and the ci.yml spot-check, so a future session doesn't need to re-derive that the workflow file itself is fine. stale-branch-cleanup's branch-count evidence simplified now that the count (60) is unchanged from last session — no new branch, so no per-branch ancestry re-audit was needed this time.",
      "No roadmap.ts or decisions-log.ts change — no task status flipped and no new product/business decision made; the job-log-404 check strengthens existing evidence for an already-tracked blocker rather than surfacing a new one.",
      "Verified: docs-site/ `npm run build` passes clean (type-checks blockers.ts/progress-log.ts via prompt_process.tsx's import chain). pipeline/ and research/ untouched, not rebuilt.",
    ],
    nextUp: [
      "Human: same seven items remain the highest-leverage next steps — see blockers.ts. The CI outage (now ~9.5 days, confirmed account/org-level via the job-log-404 check, not a workflow bug — still the single most time-sensitive item) and the cron-cadence reconsideration are the two most worth a direct look.",
      "Agent (next session): if recentlyConfirmedWithinHours(24) is true, do only the cheap check per step 0a and skip the branch/commit/PR entirely if nothing's different. For the CI blocker specifically, pulling the newest run's job list (runner_id:0/empty-runner_name/~2-4s duration) is sufficient re-verification — no need to re-fetch job logs again since the 404 finding is now a permanent, one-time diagnosis (ci.yml isn't going to change on its own).",
    ],
  },
  {
    date: "2026-08-24",
    agent: "claude/exciting-brown-5nvsyb",
    summary:
      "Wired the MLS photo-spec preflight check into the pipeline CLI. portfolio/pipeline/candidates/mls-photo-spec-preflight.md graduated as a product_lines entry on this venture on 2026-08-24 (session_gate.py's build-now marker) and already shipped a browser tool (research/src/app/photo-check/) using research/src/lib/photo-spec.ts, but the actual local CLI a photographer/agent runs (pipeline/) had no way to run the same check — only the enhance/microsite/log-lead commands existed. That meant the check the candidate write-up sells ('a dated file the agent can keep next to the delivery') was reachable only through the marketing site, not through the tool that produces the delivery folder.",
    changes: [
      "pipeline/src/preflight.ts: reads a delivery directory, filters to .jpg/.jpeg/.png, and runs the shared research/src/lib/photo-spec.ts checkBatch() against it — same rule set and same disclosed UNIMPLEMENTED_RULES as the browser tool, imported directly (no logic duplicated or re-ported).",
      "pipeline/src/cli-preflight.ts: `npm run preflight -- --dir <delivery-dir>` — prints per-photo findings (blocking/degrading), a summary line, and the floor-spec disclaimer; exits 1 when any blocking finding is present, matching cli.ts's coverage-check exit-code convention.",
      "pipeline/src/preflight.test.ts: exercises preflightDir end-to-end against a real temp directory with sharp-generated synthetic PNGs (long_edge and branding_filename failures, a passing photo, a non-image file correctly ignored, and an all-clean folder), plus package.json's test script now runs it.",
      "Manually ran the CLI against a synthetic delivery folder (not just the test suite): confirmed the printed report, exit code 1 on blocking findings, exit code 0 on a clean folder, and the usage error when --dir is omitted.",
      "Verified: `npm test` and `npx tsc --noEmit` both clean in pipeline/ (strict mode, no new findings). research/ and docs-site/ untouched by this change; re-verified their builds anyway per AGENTS.md's 'build research/ and docs-site/ for anything you touched' — see this entry's next changes/verification note.",
    ],
    nextUp: [
      "Human: same long-open blockers remain (see process/blockers.ts) — booking a real concierge shoot is still what turns this from a synthetic-fixture check into the real one the candidate write-up's first experiment needs (running the check on an enhance.ts-produced delivery from an actual listing).",
      "Agent (next session): once a real delivery folder exists (from a real or realistic test shoot), run `npm run preflight -- --dir <delivery>` against it and fold the result into the candidate write-up's first-experiment section as real evidence instead of the current fixture-only precision/recall claim.",
    ],
  },
  {
    date: "2026-08-25",
    agent: "cursor/deploy-built-products-priority-ffdc",
    summary:
      "Added a deploy-first task to the Listing Lens roadmap so already-built public surfaces (research report, /photo-check) outrank more process work, matching the portfolio Current priority in DIRECTION.md.",
    changes: [
      "process/roadmap.ts: new p0-deploy-built-surfaces (not_started, owner both) — done when a stranger can open the existing research report and /photo-check without cloning the repo. Points at the existing deploy-settings owner ask; does not open a second one.",
    ],
    nextUp: [
      "Agent: prepare the public deploy artifact for the already-built research / photo-check surfaces; do not start p3-app-scope or another tool.",
      "Human: flip deploy-settings (Pages / Cloudflare credentials) if that is what unblocks the URL. Same long-open blockers in process/blockers.ts otherwise stand.",
    ],
  },
  {
    date: "2026-08-25",
    agent: "cursor/product-first-development-mandate-b002",
    summary:
      "Turned MLS photo-check findings into a copyable reshoot / desk-fix list so a photographer knows which rooms to recapture versus which files to rename, recrop, or pair — complementary to the three open evidence-download PRs (#1333, #1358, #1385).",
    changes: [
      "research/src/lib/photo-spec.ts: buildReshootPlan + formatReshootPlan map each finding to recapture / pair / reexport / rename with disclosed unimplemented rules on the copied text.",
      "research/src/components/PhotoCheckTool.tsx: What to fix next panel and Copy shot list; usage events reshoot_list_viewed / reshoot_list_copied stay localStorage-only.",
      "pipeline/src/cli-preflight.ts: prints the same list after the findings so the CLI path matches the browser.",
      "Tests: three new photo-spec cases (9/9). Did not add a second download/export — those PRs already cover that.",
    ],
    nextUp: [
      "Keep #1333/#1358/#1385 open for the evidence-record download; do not close them as superseded by this list.",
      "Public URL is still owner-gated (deploy-settings). Do not add another trade bid calculator.",
    ],
  },
  {
    date: "2026-08-26",
    agent: "cursor/listing-lens-photo-read-recovery-20260824",
    summary:
      "Made the Listing Lens browser preflight recover cleanly when a selected photo cannot be read.",
    changes: [
      "PhotoCheckTool now catches delayed File.arrayBuffer failures, stops the processing state, and renders an actionable alert without an unhandled rejection.",
      "Added a focused regression test for specific and unknown read-error messages; research test command now runs both the photo-spec and component helper checks.",
      "Kept the existing Markdown/JSON evidence downloads and reshoot list from main. No photo data, filenames, or error contents are sent to usage tracking.",
    ],
    nextUp: [
      "Human: run the preflight against a real listing delivery after the first concierge shoot; the check remains a dated floor-spec observation, not an MLS acceptance guarantee.",
    ],
  },
];
