/**
 * blockers.ts — the single source of truth for what's blocking the
 * business on a human action right now.
 *
 * Why this exists: by 2026-07-13, roughly two dozen agent sessions in a
 * row had found every agent-doable roadmap task already `done` and spent
 * part of their session re-describing the same ~5 human-blocked items —
 * once in README.md prose, again in a fresh progress-log.ts paragraph,
 * sometimes a third time in roadmap.ts `blockedReason` fields. Three
 * independent hand-written copies of the same facts drift apart quietly
 * (nobody notices until they disagree), and progress-log.ts grew large
 * without adding new information.
 *
 * The fix: one typed list, one entry per real blocker. A session that
 * checks and finds nothing changed bumps `lastConfirmed` and
 * `confirmedByCount` right here — a one-line diff — instead of writing a
 * new progress-log.ts paragraph. A session only owes progress-log.ts (and
 * roadmap.ts, decisions-log.ts) a new entry when it actually changes
 * something: ships an artifact, flips a task's status, makes a real
 * decision, resolves a blocker, or edits this list itself.
 *
 * roadmap.ts's per-task `blockedReason` still exists and should stay
 * accurate, but treat *this* file as the canonical, at-a-glance list —
 * README.md and prompt_process.tsx both read from it instead of
 * maintaining their own prose copy.
 *
 * 2026-07-13, later the same day: date-only `lastConfirmed` granularity
 * turned out not to be enough. With three separate hourly cron triggers
 * hitting this repo (two on local-site-studio, one here), several sessions
 * within the same day each independently re-verified the same unchanged
 * facts and pushed their own throwaway branch to record it (see
 * claude/blocker-recheck-0713a/b/c — all now-stale, all confirming nothing
 * had changed). Re-confirming is still worth doing periodically in case a
 * human quietly resolved something, but doing it every single hourly tick
 * is pure overhead: a fresh branch, commit, push, and CI run to say
 * "still true" again. `lastConfirmedAt` (real timestamp) plus
 * `recentlyConfirmedWithinHours()` below let a session check, in one call,
 * whether a from-scratch re-verification is actually due yet.
 */

export type HumanBlocker = {
  id: string;
  title: string;
  /** The exact human action that unblocks this — specific enough to act on without more research. */
  whatsNeeded: string;
  /** Roadmap task id(s) this unblocks once resolved. */
  unblocks: string[];
  /** First session that flagged this, for history. */
  firstFlagged: string; // YYYY-MM-DD
  /** Bump this (and confirmedByCount) when a session re-checks and finds it still true. Do not add a progress-log.ts entry for that alone. */
  lastConfirmed: string; // YYYY-MM-DD
  /**
   * Same re-check, full timestamp. Use this (not `lastConfirmed`) for any
   * throttling logic — `lastConfirmed` only has day granularity, which
   * can't tell an hourly cron tick apart from one 20 hours ago on the same
   * calendar day. Added 2026-07-13; backfilled onto pre-existing entries
   * with a best-guess time rather than left undefined, since undefined
   * would make every blocker look infinitely stale to
   * recentlyConfirmedWithinHours() and defeat the point.
   */
  lastConfirmedAt: string; // ISO 8601 UTC, e.g. "2026-07-13T16:04:00Z"
  /**
   * Sessions that have re-checked and confirmed this is still blocked,
   * counting from when this tracker was introduced (2026-07-13) — earlier
   * re-confirmations exist in progress-log.ts's history but aren't
   * back-counted here to avoid guessing an exact number.
   */
  confirmedByCount: number;
};

export const humanBlockers: HumanBlocker[] = [
  {
    id: "first-concierge-delivery",
    title: "Book and shoot one real concierge listing",
    whatsNeeded:
      "Use process/outreach-templates.ts + process/booking-link.ts to book one real listing, shoot it with process/capture-checklist.ts, run pipeline/ (enhance + microsite), and deliver it using process/delivery-message.ts's ready-to-send handoff message (printed automatically by `npm run microsite`).",
    unblocks: ["p2-first-deliveries", "p3-app-scope"],
    firstFlagged: "2026-06-13",
    lastConfirmed: "2026-07-20",
    lastConfirmedAt: "2026-07-20T03:15:00Z",
    confirmedByCount: 20,
  },
  {
    id: "phase-1-interviews",
    title: "Run the Phase 1 interviews",
    whatsNeeded: "Conduct 10 agent + 5 STR host interviews using process/interview-script.ts and log results.",
    unblocks: ["p1-run-interviews", "p3-app-scope"],
    firstFlagged: "2026-06-13",
    lastConfirmed: "2026-07-20",
    lastConfirmedAt: "2026-07-20T03:15:00Z",
    confirmedByCount: 20,
  },
  {
    id: "zillow-listing-audit",
    title: "Score 20 Zillow listings against the audit rubric",
    whatsNeeded:
      "Pick a target metro, browse Zillow, and score 20 listings (mediocre vs excellent) using process/listing-audit-rubric.ts.",
    unblocks: ["p1-listing-audit"],
    firstFlagged: "2026-06-13",
    lastConfirmed: "2026-07-20",
    lastConfirmedAt: "2026-07-20T03:15:00Z",
    confirmedByCount: 20,
  },
  {
    id: "cloudflare-access-dashboard",
    title: "Flip on the Cloudflare Access policy for the docs site",
    whatsNeeded:
      "In the Cloudflare dashboard: Workers & Pages -> listing-lens-docs -> Settings -> Enable access policy, restrict to duncan.andrew.haywood@gmail.com, then merge PR #4 (cursor/fix-pages-access-4a7e).",
    unblocks: ["p0-docs-site"],
    firstFlagged: "2026-06-15",
    lastConfirmed: "2026-07-20",
    lastConfirmedAt: "2026-07-20T03:15:00Z",
    confirmedByCount: 21,
  },
  {
    id: "stale-branch-cleanup",
    title: "Delete ~45 confirmed-stale, fully-merged branches",
    whatsNeeded:
      "From github.com (or a token with delete permission) delete the branches confirmed strictly merged/superseded (45 non-main branches per `git ls-remote --heads origin` as of 2026-07-20T03:15Z, up 1 from the last session's count; only cursor/fix-pages-access-4a7e is live, as PR #4, still draft and still waiting on the same Cloudflare dashboard step). The one new branch since the last count, claude/dazzling-allen-lijq0y (tip a0d81a6), is simply PR #49's own source branch — its one commit's subject ('re-verify all blockers, CI outage now ~34h, simplify future stale-branch audits') matches main's tip commit (7a2e101, same subject + '(#49)') verbatim, same pattern as every other branch in this list, 21 confirmations in a row now with zero exceptions. Confirmed (again) a proxy-level restriction, not a repo-permissions issue: the GitHub REST `DELETE /git/refs/heads/...` endpoint returns a distinct 403 ('Write access to this GitHub API path is not permitted through this proxy'). No unique unmerged business value found anywhere in the 45 — this blocker is purely about GitHub-side cleanup hygiene, not lost work. Given 21 straight confirmations of the identical pattern (new branch == the immediately-preceding PR's own source branch, zero surprises), a future session can skip the full per-branch commit-subject re-derivation and just diff the branch list against this entry's previous count/name — only worth a deeper look if the delta is more than 1 new branch, or a branch's name doesn't obviously match the most recent PR.",
    unblocks: [],
    firstFlagged: "2026-07-12",
    lastConfirmed: "2026-07-20",
    lastConfirmedAt: "2026-07-20T03:15:00Z",
    confirmedByCount: 21,
  },
  {
    id: "payment-handle-setup",
    title: "Confirm/set the real payment handle prospects will pay",
    whatsNeeded:
      "process/payment-collection.ts (built 2026-07-13) defaults to requesting payment via Zelle (primary) / PayPal goods & services (fallback) sent to duncan.andrew.haywood@gmail.com (the same known real address already used for booking-link.ts and Cloudflare Access). Confirm that email actually receives payments on at least one of those apps (or link it), or swap in a different real handle in payment-collection.ts if not. Quick (a few minutes), independent of booking a shoot — worth doing before the first delivery, not blocking on it.",
    unblocks: ["p2-first-deliveries"],
    firstFlagged: "2026-07-13",
    lastConfirmed: "2026-07-20",
    lastConfirmedAt: "2026-07-20T03:15:00Z",
    confirmedByCount: 15,
  },
  {
    id: "cron-cadence-too-frequent",
    title: "Reconsider the hourly-or-tighter agent cron cadence now that everything is human-blocked",
    whatsNeeded:
      "Duncan to decide (and update the schedule in whatever's calling this repo's agent sessions) whether to slow the cadence. As of 2026-07-18, nextActionableTasks() has been empty for well over a month straight (first flagged 2026-07-13, unchanged since) — every remaining roadmap task is gated on one of the five human actions above, none of which change hour to hour. Directly confirmed this session via `list_triggers`: this repo's own agent-process prompt ('real estate photo app Business development progress') is bound to a literal hourly cron (`0 * * * *`), not just 'sub-daily' as previously worded, alongside several other recurring/one-shot triggers spanning this repo and local-site-studio from the same account. Changing that cron schedule is still a real spend/schedule decision for Duncan, not something an agent session should alter unilaterally — but this session did make the one piece of this that IS agent-actionable: widened recentlyConfirmedWithinHours()'s call site in prompt_process.tsx from 3 to 12 hours (see decisions-log.ts), so an hourly cron now produces a full-pass 'confirmed, nothing changed' branch/commit/PR/CI run roughly twice a day instead of every 3-4 hours, without waiting on the cron itself to change. That reduces but does not eliminate the token/CI spend this blocker describes — a real cron-cadence change would still cut it further.",
    unblocks: [],
    firstFlagged: "2026-07-13",
    lastConfirmed: "2026-07-20",
    lastConfirmedAt: "2026-07-20T03:15:00Z",
    confirmedByCount: 14,
  },
  {
    id: "actions-ci-runner-outage",
    title: "GitHub Actions stopped assigning runners to this repo's CI workflow",
    whatsNeeded:
      "Duncan to check GitHub billing/Actions settings for this account (Settings -> Billing -> Plans and usage -> Actions, and Settings -> Actions -> General for the repo/org) for an exhausted included-minutes quota, a hit spending limit, or Actions disabled. Evidence: PR #42 (2026-07-18T04:14Z, a trivial process/blockers.ts-only change) had all 3 ci.yml jobs (pipeline/docs-site/research) fail twice in a row — both the original run and one manual rerun — each completing in ~3-6 seconds with runner_id 0 / runner_name empty / 0ms billable duration (i.e. no runner was ever assigned, not a real test/build failure). The immediately prior run on main, 4 hours earlier at 00:20:55Z (PR #41, run #99), completed normally with real durations (15-100s/job) on the exact same workflow file and dependency lockfiles. Nothing in the repo changed between those two points other than blockers.ts's own timestamps, which is confirmed correct by a clean local `npm run build` in docs-site before pushing — so this is an account/infra-level Actions problem, not a code regression. Re-confirmed still ongoing on every subsequent push through this session's own PR #50 (both the push-triggered run 29714226364 and the pull_request-triggered run 29714241445, both 2026-07-20T03:14Z, head 34e95d9) — identical pattern on both runs, all 3 jobs, ~5s wall time, 0ms billable per `get_workflow_run_usage`. Duration is now ~47 hours and counting (started 2026-07-18T04:14Z) with zero signs of self-resolving. Because ci.yml has no required-status-check branch protection, every affected PR (#42 onward) still merged (content verified locally each time) rather than being blocked, but every subsequent PR from any agent session will show the same false 'failure' until this is fixed — don't treat that failure as a signal to debug your own change first, check this blocker. Pushed to Duncan once out-of-band on 2026-07-19T01:20Z (see human-notifications.ts) specifically citing this outage; shouldNotifyHuman(72) is still false as of this check (~26h since that notification), so no repeat sent this session, but the next session should treat crossing the 72h mark (2026-07-22T01:20Z) with the outage still unresolved as grounds to send a second reminder regardless of whether anything else changed — at ~47h and climbing, this is now the single most time-sensitive item in this file.",
    unblocks: [],
    firstFlagged: "2026-07-18",
    lastConfirmed: "2026-07-20",
    lastConfirmedAt: "2026-07-20T03:15:00Z",
    confirmedByCount: 8,
  },
];

/** Oldest-confirmed first — the blocker that's gone longest without anyone re-checking it. */
export function staleFirst(): HumanBlocker[] {
  return [...humanBlockers].sort((a, b) => (a.lastConfirmedAt < b.lastConfirmedAt ? -1 : 1));
}

/**
 * True only if every blocker was re-verified within the last `hours` hours.
 * A session should call this before spending a full re-verification pass
 * (re-reading every process/*.ts file, re-checking PR #4, re-running
 * `git ls-remote`) and before pushing a branch/commit whose only content
 * would be "confirmed, nothing changed" — see this file's 2026-07-13 doc
 * comment for why that got expensive. If this returns true and nothing
 * else in the session's own findings changed, skip the branch/commit/PR
 * entirely; there's nothing to record that isn't already here.
 *
 * Deliberately conservative: any blocker older than the window makes this
 * false, so a session that finds nine of ten blockers fresh but one stale
 * still does the full pass — a partial skip risks missing the one that
 * actually got resolved.
 */
export function recentlyConfirmedWithinHours(hours: number, now: Date = new Date()): boolean {
  const cutoff = now.getTime() - hours * 60 * 60 * 1000;
  return humanBlockers.every((b) => new Date(b.lastConfirmedAt).getTime() >= cutoff);
}
