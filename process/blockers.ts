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
 * 2026-07-22: the actions-ci-runner-outage entry had grown into an
 * ever-longer paragraph — each of 13 re-verification sessions appended its
 * own run ID/timestamp/duration rather than replacing the previous ones,
 * the same unbounded-growth pattern stale-branch-cleanup hit first (see its
 * 2026-07-19 note below). Trimmed it to the fixed diagnosis plus the latest
 * data point; a future full pass should overwrite the "most recent run" and
 * "duration as of" facts in place rather than appending another paragraph.
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
    lastConfirmed: "2026-07-24",
    lastConfirmedAt: "2026-07-24T09:20:00Z",
    confirmedByCount: 28,
  },
  {
    id: "phase-1-interviews",
    title: "Run the Phase 1 interviews",
    whatsNeeded: "Conduct 10 agent + 5 STR host interviews using process/interview-script.ts and log results.",
    unblocks: ["p1-run-interviews", "p3-app-scope"],
    firstFlagged: "2026-06-13",
    lastConfirmed: "2026-07-24",
    lastConfirmedAt: "2026-07-24T09:20:00Z",
    confirmedByCount: 28,
  },
  {
    id: "zillow-listing-audit",
    title: "Score 20 Zillow listings against the audit rubric",
    whatsNeeded:
      "Pick a target metro, browse Zillow, and score 20 listings (mediocre vs excellent) using process/listing-audit-rubric.ts.",
    unblocks: ["p1-listing-audit"],
    firstFlagged: "2026-06-13",
    lastConfirmed: "2026-07-24",
    lastConfirmedAt: "2026-07-24T09:20:00Z",
    confirmedByCount: 28,
  },
  {
    id: "cloudflare-access-dashboard",
    title: "Flip on the Cloudflare Access policy for the docs site",
    whatsNeeded:
      "In the Cloudflare dashboard: Workers & Pages -> listing-lens-docs -> Settings -> Enable access policy, restrict to duncan.andrew.haywood@gmail.com, then merge PR #4 (cursor/fix-pages-access-4a7e).",
    unblocks: ["p0-docs-site"],
    firstFlagged: "2026-06-15",
    lastConfirmed: "2026-07-24",
    lastConfirmedAt: "2026-07-24T09:20:00Z",
    confirmedByCount: 29,
  },
  {
    id: "stale-branch-cleanup",
    title: "Delete ~54 confirmed-stale, fully-merged/abandoned branches",
    whatsNeeded:
      "From github.com (or a token with delete permission) delete the branches confirmed strictly merged/superseded or dead-end (54 non-main branches per `git ls-remote --heads origin` as of 2026-07-24T09:20Z, up 1 from 53 — the delta is claude/dazzling-allen-kvbu3h, which is PR #58's own now-merged source branch with a diff against main that's already on main verbatim, not new unmerged work, same pattern as every prior session's delta; only cursor/fix-pages-access-4a7e is live, as PR #4, still draft and still waiting on the same Cloudflare dashboard step). Two non-'dazzling-allen' branches without a merge-base to main (cursor/docs-cloudflare-access-5df0, cursor/setup-dev-environment-2314, both dated 2026-06-14, pre-dating this repo's current main lineage) remain confirmed abandoned early scaffolding with no unique business content worth recovering. Per prior sessions' repeated confirmation, deletion is blocked by a proxy-level restriction, not a repo-permissions issue: the GitHub REST `DELETE /git/refs/heads/...` endpoint returns a distinct 403 ('Write access to this GitHub API path is not permitted through this proxy').",
    unblocks: [],
    firstFlagged: "2026-07-12",
    lastConfirmed: "2026-07-24",
    lastConfirmedAt: "2026-07-24T09:20:00Z",
    confirmedByCount: 29,
  },
  {
    id: "payment-handle-setup",
    title: "Confirm/set the real payment handle prospects will pay",
    whatsNeeded:
      "process/payment-collection.ts (built 2026-07-13) defaults to requesting payment via Zelle (primary) / PayPal goods & services (fallback) sent to duncan.andrew.haywood@gmail.com (the same known real address already used for booking-link.ts and Cloudflare Access). Confirm that email actually receives payments on at least one of those apps (or link it), or swap in a different real handle in payment-collection.ts if not. Quick (a few minutes), independent of booking a shoot — worth doing before the first delivery, not blocking on it.",
    unblocks: ["p2-first-deliveries"],
    firstFlagged: "2026-07-13",
    lastConfirmed: "2026-07-24",
    lastConfirmedAt: "2026-07-24T09:20:00Z",
    confirmedByCount: 23,
  },
  {
    id: "cron-cadence-too-frequent",
    title: "Reconsider the hourly-or-tighter agent cron cadence now that everything is human-blocked",
    whatsNeeded:
      "Duncan to decide (and update the schedule in whatever's calling this repo's agent sessions) whether to slow the cadence. nextActionableTasks() has been empty for well over a month straight (first flagged 2026-07-13, unchanged since) — every remaining roadmap task is gated on one of the five human actions above, none of which change hour to hour. Directly confirmed via `list_triggers`: this repo's own agent-process prompt is bound to a literal hourly cron (`0 * * * *`). The agent-actionable slice (widening recentlyConfirmedWithinHours()'s call site in prompt_process.tsx from 3 to 12 hours, see decisions-log.ts) is already shipped and continues to hold up: this session's full pass was triggered ~13h after the last one, matching the intended twice-daily cadence. That reduces but does not eliminate the token/CI spend this blocker describes — a real cron-cadence change would still cut it further.",
    unblocks: [],
    firstFlagged: "2026-07-13",
    lastConfirmed: "2026-07-24",
    lastConfirmedAt: "2026-07-24T09:20:00Z",
    confirmedByCount: 22,
  },
  {
    id: "actions-ci-runner-outage",
    title: "GitHub Actions stopped assigning runners to this repo's CI workflow",
    whatsNeeded:
      "Duncan to check GitHub billing/Actions settings for this account (Settings -> Billing -> Plans and usage -> Actions, and Settings -> Actions -> General for the repo/org) for an exhausted included-minutes quota, a hit spending limit, or Actions disabled. Started 2026-07-18T04:14Z: PR #42's ci.yml runs began completing all 3 jobs in ~3-6s with runner_id 0 / runner_name empty / 0ms billable duration (no runner ever assigned — not a real test/build failure), versus the prior run's normal 15-100s/job durations on the identical workflow file and lockfiles. ci.yml has no required-status-check branch protection, so affected PRs still merge (content verified locally each time) — this just means every subsequent PR shows the same false 'failure' until fixed; don't treat it as a signal to debug your own change first, check this blocker instead. Re-confirmed unchanged on 17 full-pass re-verifications since, zero exceptions, most recently on run 30041321799 (main @ 32c81c5, 2026-07-23T20:15:13Z, the newest run on main as of this check since no further pushes landed) — identical runner_id:0/empty-runner_name/~2-4s-duration signature on all 3 jobs, checked directly via list_workflow_jobs. Duration as of this check (2026-07-24T09:20Z): ~149 hours (~6.2 days) and counting, zero sign of self-resolving. Two out-of-band pushes already sent to Duncan citing this specifically (2026-07-19T01:20Z, 2026-07-22T02:10Z — see human-notifications.ts); further reminders throttled to 72h via shouldNotifyHuman(), which still returns false (~55h since the last one) — no new notification sent this session. A session doing a full pass should just pull the newest run on main via list_workflow_runs/list_workflow_jobs and check for the same runner_id:0/empty-runner_name/~3s-duration signature rather than re-deriving or re-narrating this history — 17 identical confirmations is enough to stop appending a fresh paragraph each time. At ~6.2 days old with zero self-resolution and two throttled reminders already sent, this remains squarely a 'go check the account directly' item.",
    unblocks: [],
    firstFlagged: "2026-07-18",
    lastConfirmed: "2026-07-24",
    lastConfirmedAt: "2026-07-24T09:20:00Z",
    confirmedByCount: 17,
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
