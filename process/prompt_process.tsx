/**
 * prompt_process.tsx — the Listing Lens agent operating process.
 *
 * This is the file every agent session (this one, or any other) should
 * read first. It says how to pick up work, how to log it, and renders a
 * live dashboard of the same data on the private docs site.
 *
 * Read order for a new session:
 *   1. This file's AGENT_PROCESS_INSTRUCTIONS.
 *   2. blockers.ts — the current human-blocked items, at a glance.
 *   3. roadmap.ts — what's done, in progress, blocked, or next.
 *   4. decisions-log.ts — why things are the way they are.
 *   5. progress-log.ts — what the last few sessions actually did.
 *
 * Write order when a session finishes real work:
 *   1. Update the relevant task(s)/phase(s) in roadmap.ts.
 *   2. Append to decisions-log.ts if a real business/product decision was made.
 *   3. Append one entry to progress-log.ts summarizing the session — unless
 *      the entire session's finding was "everything is still blocked on the
 *      same humans, nothing changed," in which case just bump the affected
 *      blockers.ts entries' lastConfirmed/confirmedByCount instead (see
 *      blockers.ts's own doc comment for why).
 *   4. Keep this file's process itself improving: if the process was hard
 *      to follow, unclear, or missing a check, edit AGENT_PROCESS_INSTRUCTIONS
 *      and note the change as its own progress-log entry.
 */

import { roadmap, nextActionableTasks, isGateSatisfied } from "./roadmap";
import { decisionsLog } from "./decisions-log";
import { progressLog } from "./progress-log";
import { humanBlockers, staleFirst, recentlyConfirmedWithinHours } from "./blockers";
import { humanNotificationLog } from "./human-notifications";
import { captureChecklist, totalTargetMinutes, preShootPrep, BRACKET_GUIDANCE } from "./capture-checklist";
import { mlsComplianceRules } from "./mls-compliance";
import { AUDIT_DIMENSIONS, listingAuditLog, auditSummary } from "./listing-audit-rubric";
import { virtualStagingTechOptions, virtualStagingTechDecision } from "./virtual-staging-tech";
import { gtmMotionOptions, gtmMotionDecision } from "./gtm-motion";
import { paymentMethodOptions, paymentDecision } from "./payment-collection";
import { leadsLog, LEAD_STAGE_ORDER, funnelCounts } from "./leads-log";
import { REFERRAL_INCENTIVE, followUpTiming } from "./referral-followup";
import type { PhaseStatus } from "./types";

export const AGENT_PROCESS_INSTRUCTIONS = `
Listing Lens is at the "concept / market validation" stage (see STRATEGY.md).
The goal is a profitable, growing business — not a finished app. Every
agent session should move that forward by a bounded, honest increment.

Each session:
0a. Before doing a full from-scratch re-verification pass, call
   recentlyConfirmedWithinHours(12) from blockers.ts. If it returns true,
   every blocker was already re-checked within the last 12 hours by some
   other session — don't repeat that work. Instead do a *cheap* check only
   (leads-log.ts/listingAuditLog/loggedInterviewResults still empty? any
   new merged PRs since the last progress-log.ts entry, via git log
   origin/main? nextActionableTasks() still empty?) and if nothing is
   different, stop there: no branch, no commit, no PR. The hourly/frequent
   cron will hit this repo again regardless, and a "still blocked, nothing
   changed" branch adds a CI run and a stale ref for zero new information
   (see blockers.ts's 2026-07-13 doc comment — three near-duplicate
   recheck branches in one day is what this guards against). If the
   12-hour window has elapsed, or the cheap check finds something new,
   proceed to a full pass below.
   (Widened from 3 to 12 hours on 2026-07-18: list_triggers confirmed
   this repo's own agent session is bound to an hourly cron, and every
   blocker had been unchanged for over a month at that point, so a 3-hour
   window still produced a "confirmed, nothing changed" branch/commit/PR/CI
   run roughly every 3-4 hours indefinitely. 12 hours matches the
   twice-daily cadence blockers.ts's own cron-cadence-too-frequent entry
   already argued would catch a resolved blocker just as fast in practice
   — implemented at the code level instead of waiting on a human to change
   the cron schedule, since none of the 6 blockers here resolve on
   anything faster than a human choosing to do a real-world action. See
   decisions-log.ts.)
0a-2. If your harness can send an out-of-band notification (push/email)
   straight to Duncan, separate from anything committed here: that is
   worth doing when it carries genuinely new information (a blocker
   resolved, a new blocker appeared, a real decision shipped), but a
   repeat "still blocked on you" ping is exactly the kind of notification
   human-notifications.ts's own doc comment warns gets muted if sent every
   run. Call shouldNotifyHuman() first; only send a "still blocked,
   reminder" notification if it returns true (default throttle: 72h), and
   append a humanNotificationLog entry (in the same commit as whatever
   else this session ships, or its own tiny commit if nothing else
   changed) so the next session's shouldNotifyHuman() call sees it. Skip
   this step entirely if your harness has no such capability.
0b. Check blockers.ts — it's the single source of truth for what's
   blocked on a human right now (README.md and this file's dashboard both
   read from it, so it should never need updating in more than one place).
   If your session's only finding is "still blocked, nothing changed,"
   bump the relevant entries' lastConfirmed/lastConfirmedAt/confirmedByCount
   there and do not also write a new progress-log.ts paragraph restating
   the same blockers a 20th time (that's the one exception to step 5
   below). If you resolve a blocker (a human did the thing) or find a
   genuinely new blocker, edit blockers.ts for real and that DOES warrant
   a normal progress-log entry.
1. Read roadmap.ts, decisions-log.ts, progress-log.ts (or the rendered
   /process page on the docs site).
2. Call nextActionableTasks() mentally: pick ONE not-started task owned by
   "agent" or "both" that you can actually complete this session — prefer
   the earliest incomplete phase over later ones. Some tasks declare
   gatedOn: [taskId, ...] (e.g. p3-app-scope, gated on interviews + first
   deliveries producing real validation data) — nextActionableTasks()
   already excludes these until every gating task is "done", so if a task
   still looks not_started but never appears in nextActionableTasks(),
   check its gatedOn before assuming it's a bug.
2a. Claim it immediately: as your FIRST commit this session (before doing
   the rest of the work), flip that task's status to "in_progress" in
   roadmap.ts and push/merge that tiny change to main by itself. Hourly
   agent sessions poll roadmap.ts for not_started tasks, and two sessions
   can start within minutes of each other (this happened for real on
   2026-07-12: PR #13 and #14 both independently answered the same
   STRATEGY.md open question and #13 had to be closed unmerged). A cheap,
   early "claimed" commit is the whole fix — nextActionableTasks() already
   skips non-"not_started" tasks, so a concurrent session that fetches
   fresh will see it and pick something else instead of duplicating work.
3. Do NOT attempt tasks owned by "human" (real interviews, taking payment,
   shooting real listings, dashboard clicks that need Duncan's account).
   Instead, prepare everything an agent can: scripts, checklists, copy,
   pricing pages, outreach templates, scoring rubrics, code.
4. If you truly cannot make product/business progress this session (e.g.
   everything actionable is human-blocked), it is fine to spend the
   session improving the process itself: tightening the roadmap, fixing
   stale statuses, improving docs, or paying down tech debt in research/
   or docs-site/ — but say so explicitly in the progress log entry rather
   than padding it with busywork.
5. Log what you did: update roadmap.ts task status, append a
   decisions-log.ts entry for any real decision, and always append one
   progress-log.ts entry.
6. Check other branches (git ls-remote origin) before starting, since
   other agents may be working the same repo concurrently — prefer
   additive changes over ones likely to conflict with in-flight PRs.
   If your clone is shallow (a fresh add_repo clone starts this way —
   check with 'git rev-parse --is-shallow-repository'), run
   'git fetch --unshallow origin' before trusting 'git merge-base
   --is-ancestor' or 'git log origin/main..origin/BRANCH' to conclude a
   branch is unmerged: against a shallow history both give false-positive
   "unmerged" results (confirmed 2026-07-25 — several long-since-merged
   branches wrongly looked unmerged until unshallowing).
7. Build docs-site and research before committing (npm run build in each
   that you touched); run npm test in pipeline/ if you touched it. Push to
   your assigned branch, open a PR, and merge it once it's green — this
   repo's convention is short-lived branches, not long-running ones.
   .github/workflows/ci.yml now runs these same checks automatically on
   every push/PR, but it fires after you push — still verify locally
   first so you're not relying on CI to catch something you could have
   caught before opening the PR.
8. Before merging your own PR, check for other open PRs touching the same
   files (process/*.ts, docs-site nav, etc.) and merge/rebase against the
   latest main first — process/progress-log.ts especially tends to
   conflict since every session appends to the same array tail. Resolve
   by keeping both entries in date order, never by dropping one.

Guardrails (do not violate without explicit human sign-off in this
session's actual conversation):
- No real payments, no real customer outreach sent on Duncan's behalf,
  no changes to production Cloudflare Access / DNS without confirmation.
- No iOS app build-out yet (see the phase-3 scope decision).
- No spend of real money (ad spend, contractor payment, paid tools).
`.trim();

export type ProcessSnapshot = {
  phaseCount: number;
  doneTaskCount: number;
  totalTaskCount: number;
  blockedOnHumanCount: number;
  humanBlockerCount: number;
  nextForAgent: ReturnType<typeof nextActionableTasks>;
};

export function getProcessSnapshot(): ProcessSnapshot {
  const allTasks = roadmap.flatMap((p) => p.tasks);
  return {
    phaseCount: roadmap.length,
    doneTaskCount: allTasks.filter((t) => t.status === "done").length,
    totalTaskCount: allTasks.length,
    blockedOnHumanCount: allTasks.filter((t) => t.status === "blocked" && t.owner === "human").length,
    humanBlockerCount: humanBlockers.length,
    nextForAgent: nextActionableTasks(),
  };
}

const STATUS_STYLES: Record<PhaseStatus, string> = {
  not_started: "text-slate-400 border-slate-700 bg-slate-900/40",
  in_progress: "text-amber-300 border-amber-500/30 bg-amber-500/10",
  blocked: "text-rose-300 border-rose-500/30 bg-rose-500/10",
  done: "text-emerald-300 border-emerald-500/30 bg-emerald-500/10",
};

const STATUS_LABEL: Record<PhaseStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  blocked: "Blocked",
  done: "Done",
};

function StatusPill({ status }: { status: PhaseStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

/**
 * Renders the full live process state: roadmap, decisions, and progress.
 * Consumed by docs-site's /process page. Pure presentational component —
 * no data fetching, so it works fine inside a statically-exported Next.js
 * build.
 */
export function ProcessDashboard() {
  const snapshot = getProcessSnapshot();

  return (
    <div className="space-y-10">
      <section>
        <h2 className="font-display text-2xl font-semibold text-white">Agent process</h2>
        <p className="mt-2 max-w-3xl text-sm text-slate-400">
          {snapshot.doneTaskCount}/{snapshot.totalTaskCount} tasks done across {snapshot.phaseCount}{" "}
          phases. {snapshot.blockedOnHumanCount} task(s) are blocked on a human action, tracked as{" "}
          {snapshot.humanBlockerCount} distinct blocker(s) below.
        </p>
        <pre className="mt-4 whitespace-pre-wrap rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-xs leading-relaxed text-slate-300">
          {AGENT_PROCESS_INSTRUCTIONS}
        </pre>
      </section>

      <section>
        <h2 className="font-display text-2xl font-semibold text-white">Human blockers</h2>
        <p className="mt-2 max-w-3xl text-sm text-slate-400">
          The single source of truth for what's blocked on a human right now — see process/blockers.ts.
          Sorted oldest-confirmed first, so the top row is the one that's gone longest without anyone
          re-checking it.
          {humanNotificationLog.length > 0 && (
            <>
              {" "}Last out-of-band reminder sent to Duncan{" "}
              {humanNotificationLog[humanNotificationLog.length - 1].notifiedAt} — see
              process/human-notifications.ts.
            </>
          )}
        </p>
        <div className="mt-4 space-y-3">
          {staleFirst().map((b) => (
            <div key={b.id} className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-medium text-white">{b.title}</h3>
                <span className="text-xs text-slate-500">
                  confirmed {b.confirmedByCount}x · last {b.lastConfirmed} · since {b.firstFlagged}
                </span>
              </div>
              <p className="mt-2 text-sm text-slate-300">{b.whatsNeeded}</p>
              {b.unblocks.length > 0 && (
                <p className="mt-2 text-xs text-slate-500">Unblocks: {b.unblocks.join(", ")}</p>
              )}
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="font-display text-2xl font-semibold text-white">Roadmap</h2>
        <div className="mt-4 space-y-4">
          {roadmap.map((phase) => (
            <div key={phase.id} className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-medium text-white">{phase.title}</h3>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">{phase.window}</span>
                  <StatusPill status={phase.status} />
                </div>
              </div>
              <p className="mt-2 text-sm text-slate-400">{phase.summary}</p>
              {phase.tasks.length > 0 && (
                <ul className="mt-4 space-y-2">
                  {phase.tasks.map((task) => (
                    <li
                      key={task.id}
                      className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-slate-800/80 bg-slate-950/40 p-3"
                    >
                      <div>
                        <p className="text-sm text-slate-200">
                          {task.title}{" "}
                          <span className="text-xs text-slate-500">({task.owner})</span>
                        </p>
                        <p className="mt-1 text-xs text-slate-500">{task.doneWhen}</p>
                        {task.blockedReason && (
                          <p className="mt-1 text-xs text-rose-300/80">Blocked: {task.blockedReason}</p>
                        )}
                        {task.gatedOn && task.gatedOn.length > 0 && !isGateSatisfied(task) && (
                          <p className="mt-1 text-xs text-amber-300/80">
                            Gated on: {task.gatedOn.join(", ")} (not all done yet — not agent-actionable
                            until they are)
                          </p>
                        )}
                      </div>
                      <StatusPill status={task.status} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="font-display text-2xl font-semibold text-white">Capture checklist</h2>
        <p className="mt-2 max-w-3xl text-sm text-slate-400">
          Room-by-room guided shoot checklist for the Phase 2 concierge MVP, written for someone
          with zero photography background. Target total time: {totalTargetMinutes()} minutes.
        </p>

        <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/50 p-5">
          <h3 className="font-medium text-white">Before you start (once per shoot)</h3>
          <ul className="mt-4 space-y-2">
            {preShootPrep.map((item) => (
              <li key={item.id} className="rounded-lg border border-slate-800/80 bg-slate-950/40 p-3">
                <p className="text-sm text-slate-200">{item.label}</p>
                <p className="mt-1 text-xs text-slate-500">{item.why}</p>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-4 space-y-4">
          {captureChecklist.map((room) => (
            <div key={room.id} className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-medium text-white">{room.room}</h3>
                <span className="text-xs text-slate-500">~{room.targetMinutes} min</span>
              </div>
              <ul className="mt-4 space-y-2">
                {room.shots.map((shot) => (
                  <li
                    key={shot.id}
                    className="rounded-lg border border-slate-800/80 bg-slate-950/40 p-3"
                  >
                    <p className="text-sm text-slate-200">
                      {shot.label}{" "}
                      <span className="text-xs text-slate-500">({BRACKET_GUIDANCE[shot.bracket].label})</span>
                    </p>
                    <p className="mt-1 text-xs text-slate-500">{shot.instructions}</p>
                    <p className="mt-1 text-xs text-slate-600">{BRACKET_GUIDANCE[shot.bracket].howTo}</p>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="font-display text-2xl font-semibold text-white">MLS compliance notes</h2>
        <p className="mt-2 max-w-3xl text-sm text-slate-400">
          Desk research answering STRATEGY.md's open "MLS compliance by board" question. Not
          legal advice or board-verified — see process/mls-compliance.ts for sources and caveats.
        </p>
        <div className="mt-4 space-y-4">
          {mlsComplianceRules.map((rule) => (
            <div key={rule.id} className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
              <h3 className="font-medium text-white">{rule.topic}</h3>
              <p className="mt-2 text-sm text-slate-300">{rule.rule}</p>
              <p className="mt-2 text-xs text-slate-500">{rule.implication}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="font-display text-2xl font-semibold text-white">Listing quality audit rubric</h2>
        <p className="mt-2 max-w-3xl text-sm text-slate-400">
          Objective scoring instrument for the Phase 1 Zillow listing audit (p1-listing-audit). Still
          needs a human to browse a chosen metro and score real listings — see
          process/listing-audit-rubric.ts. {listingAuditLog.length === 0
            ? "No listings scored yet."
            : `${auditSummary().count} listing(s) scored, avg ${auditSummary().avgOverallScore}/10.`}
        </p>
        <div className="mt-4 space-y-4">
          {AUDIT_DIMENSIONS.map((dim) => (
            <div key={dim.id} className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
              <h3 className="font-medium text-white">{dim.label}</h3>
              <p className="mt-2 text-sm text-slate-300">{dim.guidance}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="font-display text-2xl font-semibold text-white">Virtual staging tech (Polish step)</h2>
        <p className="mt-2 max-w-3xl text-sm text-slate-400">
          Desk research answering STRATEGY.md's open "on-device vs cloud for virtual staging"
          question. Not yet built — see process/virtual-staging-tech.ts for sources and the
          revisit condition.
        </p>
        <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-5">
          <h3 className="font-medium text-white">Decision: {virtualStagingTechDecision.choice.replace("_", " ")}</h3>
          <p className="mt-2 text-sm text-slate-300">{virtualStagingTechDecision.summary}</p>
          <p className="mt-2 text-xs text-slate-500">Revisit when: {virtualStagingTechDecision.revisitWhen}</p>
        </div>
        <div className="mt-4 space-y-4">
          {virtualStagingTechOptions.map((option) => (
            <div key={option.id} className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-medium text-white">{option.name}</h3>
                <span className="text-xs text-slate-500">{option.approach.replace("_", " ")}</span>
              </div>
              <p className="mt-2 text-sm text-slate-300">{option.costModel}</p>
              <p className="mt-2 text-xs text-slate-500">{option.latency}</p>
              <p className="mt-2 text-xs text-slate-500">{option.tradeoffs}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="font-display text-2xl font-semibold text-white">Go-to-market motion (brokerage vs agent PLG)</h2>
        <p className="mt-2 max-w-3xl text-sm text-slate-400">
          Desk research answering STRATEGY.md's open "brokerage sales cycle vs agent PLG"
          question. A provisional, sourced sequencing decision, not a real brokerage sales
          conversation — see process/gtm-motion.ts for sources and the revisit condition.
        </p>
        <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-5">
          <h3 className="font-medium text-white">Decision: {gtmMotionDecision.choice.replace(/_/g, " ")}</h3>
          <p className="mt-2 text-sm text-slate-300">{gtmMotionDecision.summary}</p>
          <p className="mt-2 text-xs text-slate-500">Revisit when: {gtmMotionDecision.revisitWhen}</p>
        </div>
        <div className="mt-4 space-y-4">
          {gtmMotionOptions.map((option) => (
            <div key={option.id} className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-medium text-white">{option.name}</h3>
                <span className="text-xs text-slate-500">{option.approach.replace(/_/g, " ")}</span>
              </div>
              <p className="mt-2 text-sm text-slate-300">{option.cycleLength}</p>
              <p className="mt-2 text-xs text-slate-500">{option.contractValue}</p>
              <p className="mt-2 text-xs text-slate-500">{option.tradeoffs}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="font-display text-2xl font-semibold text-white">Payment collection (p2-payment-collection)</h2>
        <p className="mt-2 max-w-3xl text-sm text-slate-400">
          How a concierge customer actually pays the $19 — a zero-setup, zero-new-infrastructure
          answer to the same class of silent gap p2-booking-link found for the booking step. See
          process/payment-collection.ts for sourced comparisons and the human step (confirming the
          apps below deliver to the listed inbox) that's still tracked in blockers.ts.
        </p>
        <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-5">
          <h3 className="font-medium text-white">
            Decision: {paymentDecision.primary} primary, {paymentDecision.fallback} fallback
          </h3>
          <p className="mt-2 text-sm text-slate-300">{paymentDecision.summary}</p>
          <p className="mt-2 text-xs text-slate-500">Revisit when: {paymentDecision.revisitWhen}</p>
        </div>
        <div className="mt-4 space-y-4">
          {paymentMethodOptions.map((option) => (
            <div key={option.id} className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
              <h3 className="font-medium text-white">{option.name}</h3>
              <p className="mt-2 text-sm text-slate-300">
                {option.setupCost} {option.feePerTransaction}
              </p>
              <p className="mt-2 text-xs text-slate-500">{option.howToPay}</p>
              <p className="mt-2 text-xs text-slate-500">{option.tradeoffs}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="font-display text-2xl font-semibold text-white">Referral &amp; follow-up (p2-referral-followup)</h2>
        <p className="mt-2 max-w-3xl text-sm text-slate-400">
          The growth step past the first delivery: a ready-to-send check-in that asks for a testimonial and a
          referral once an agent has actually seen the photos work. See process/referral-followup.ts. Timing:{" "}
          {followUpTiming}
        </p>
        <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-5">
          <h3 className="font-medium text-white">Incentive: discount, not cash</h3>
          <p className="mt-2 text-sm text-slate-300">{REFERRAL_INCENTIVE.summary}</p>
          <p className="mt-2 text-xs text-slate-500">Referrer: {REFERRAL_INCENTIVE.referrerReward}</p>
          <p className="mt-1 text-xs text-slate-500">Referee: {REFERRAL_INCENTIVE.refereeReward}</p>
        </div>
      </section>

      <section>
        <h2 className="font-display text-2xl font-semibold text-white">Leads &amp; bookings funnel</h2>
        <p className="mt-2 max-w-3xl text-sm text-slate-400">
          {leadsLog.length === 0
            ? "No real outreach has been sent yet — this fills in once a human uses process/outreach-templates.ts against real prospects (see process/leads-log.ts)."
            : `${leadsLog.length} lead(s) logged.`}
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          {LEAD_STAGE_ORDER.map((stage) => (
            <div
              key={stage}
              className="rounded-lg border border-slate-800/80 bg-slate-950/40 px-3 py-2 text-xs text-slate-300"
            >
              <span className="text-slate-500">{stage.replace("_", " ")}:</span>{" "}
              <span className="font-medium text-white">{funnelCounts()[stage]}</span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="font-display text-2xl font-semibold text-white">Decisions log</h2>
        <div className="mt-4 space-y-3">
          {[...decisionsLog].reverse().map((d) => (
            <div key={`${d.date}-${d.title}`} className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-medium text-white">{d.title}</h3>
                <span className="text-xs text-slate-500">
                  {d.date} · {d.madeBy}
                </span>
              </div>
              <p className="mt-2 text-sm text-slate-300">{d.decision}</p>
              <p className="mt-2 text-xs text-slate-500">{d.rationale}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="font-display text-2xl font-semibold text-white">Progress log</h2>
        <div className="mt-4 space-y-3">
          {[...progressLog].reverse().map((entry) => (
            <div key={`${entry.date}-${entry.agent}`} className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-medium text-white">{entry.summary}</h3>
                <span className="text-xs text-slate-500">
                  {entry.date} · {entry.agent}
                </span>
              </div>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-slate-400">
                {entry.changes.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
              {entry.nextUp.length > 0 && (
                <div className="mt-3 rounded-lg border border-slate-800/80 bg-slate-950/40 p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Next up</p>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-slate-400">
                    {entry.nextUp.map((n, i) => (
                      <li key={i}>{n}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export { roadmap, decisionsLog, progressLog };
