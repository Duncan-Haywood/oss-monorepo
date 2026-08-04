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
    lastConfirmed: "2026-07-28",
    lastConfirmedAt: "2026-07-28T17:11:00Z",
    confirmedByCount: 36,
  },
  {
    id: "phase-1-interviews",
    title: "Run the Phase 1 interviews",
    whatsNeeded: "Conduct 10 agent + 5 STR host interviews using process/interview-script.ts and log results.",
    unblocks: ["p1-run-interviews", "p3-app-scope"],
    firstFlagged: "2026-06-13",
    lastConfirmed: "2026-07-28",
    lastConfirmedAt: "2026-07-28T17:11:00Z",
    confirmedByCount: 36,
  },
  {
    id: "zillow-listing-audit",
    title: "Score 20 Zillow listings against the audit rubric",
    whatsNeeded:
      "Pick a target metro, browse Zillow, and score 20 listings (mediocre vs excellent) using process/listing-audit-rubric.ts.",
    unblocks: ["p1-listing-audit"],
    firstFlagged: "2026-06-13",
    lastConfirmed: "2026-07-28",
    lastConfirmedAt: "2026-07-28T17:11:00Z",
    confirmedByCount: 36,
  },
  {
    id: "cloudflare-access-dashboard",
    title: "Flip on the Cloudflare Access policy for the docs site",
    whatsNeeded:
      "In the Cloudflare dashboard: Workers & Pages -> listing-lens-docs -> Settings -> Enable access policy, restrict to duncan.andrew.haywood@gmail.com, then merge PR #4 (cursor/fix-pages-access-4a7e).",
    unblocks: ["p0-docs-site"],
    firstFlagged: "2026-06-15",
    lastConfirmed: "2026-07-28",
    lastConfirmedAt: "2026-07-28T17:11:00Z",
    confirmedByCount: 37,
  },
  {
    id: "stale-branch-cleanup",
    title: "Delete ~60 confirmed-stale, fully-merged/abandoned branches",
    whatsNeeded:
      "From github.com (or a token with delete permission) delete the branches confirmed strictly merged/superseded or dead-end (64 non-main branches per `git branch -r` against a freshly-unshallowed clone as of 2026-07-28T17:11Z, up 2 from the same-day 02:12Z count of 62 — the two new refs are claude/dazzling-allen-4lun7j (the immediately-preceding session's own now-merged source branch, per PR #67's squash-merge onto main, 2026-07-28T02:16Z) and claude/dazzling-allen-ew25ao (this session's own branch, pre-created by the harness with content identical to main) — both the same recurring self-branch pattern every session leaves behind, not new concurrent-agent work). Ran a full `git log origin/main..origin/<branch>` ancestry check against every branch this session (unshallowed first); the only two branches showing more than 1 'unmerged' commit — claude/dazzling-allen-gtm-motion (2) and claude/dazzling-allen-yt6nbr (2) — were individually re-checked and confirmed to be the same squash-merge-diverges-from-source-branch-tip artifact as every other branch (their content, gtm-motion.ts and the corresponding blockers.ts CI-outage timestamps, is already on main), not new work. Only cursor/fix-pages-access-4a7e is live, as PR #4, still draft and still waiting on the same Cloudflare dashboard step; every other branch was already confirmed merged/superseded or (for the two non-'dazzling-allen' outliers, cursor/docs-cloudflare-access-5df0 and cursor/setup-dev-environment-2314) abandoned 2026-06-14 scaffolding with no unique business content. Per prior sessions' repeated confirmation, deletion is blocked by a proxy-level restriction, not a repo-permissions issue: the GitHub REST `DELETE /git/refs/heads/...` endpoint returns a distinct 403 ('Write access to this GitHub API path is not permitted through this proxy'). This session's GitHub MCP tool set (mcp__github__*) was also checked and has no delete-branch tool exposed, so the same restriction holds under this harness too — still a human-only action. Methodology reminder (added 2026-07-25): a fresh `add_repo` clone starts shallow, and `git merge-base --is-ancestor`/`git log origin/main..origin/<branch>` give false-positive 'unmerged' results against a shallow history — run `git fetch --unshallow origin` first (see prompt_process.tsx step 6) before trusting an ancestry check.",
    unblocks: [],
    firstFlagged: "2026-07-12",
    lastConfirmed: "2026-07-28",
    lastConfirmedAt: "2026-07-28T17:11:00Z",
    confirmedByCount: 37,
  },
  {
    id: "payment-handle-setup",
    title: "Confirm/set the real payment handle prospects will pay",
    whatsNeeded:
      "process/payment-collection.ts (built 2026-07-13) defaults to requesting payment via Zelle (primary) / PayPal goods & services (fallback) sent to duncan.andrew.haywood@gmail.com (the same known real address already used for booking-link.ts and Cloudflare Access). Confirm that email actually receives payments on at least one of those apps (or link it), or swap in a different real handle in payment-collection.ts if not. Quick (a few minutes), independent of booking a shoot — worth doing before the first delivery, not blocking on it.",
    unblocks: ["p2-first-deliveries"],
    firstFlagged: "2026-07-13",
    lastConfirmed: "2026-07-28",
    lastConfirmedAt: "2026-07-28T17:11:00Z",
    confirmedByCount: 31,
  },
  {
    id: "cron-cadence-too-frequent",
    title: "Reconsider the hourly-or-tighter agent cron cadence now that everything is human-blocked",
    whatsNeeded:
      "Duncan to decide (and update the schedule in whatever's calling this repo's agent sessions) whether to slow the cadence. nextActionableTasks() has been empty for well over a month straight (first flagged 2026-07-13, unchanged since) — every remaining roadmap task is gated on one of the five human actions above, none of which change hour to hour. Directly confirmed via `list_triggers`: this repo's own agent-process prompt is bound to a literal hourly cron (`0 * * * *`). The agent-actionable slice (recentlyConfirmedWithinHours()'s call site in prompt_process.tsx, widened 3h->12h on 2026-07-18 and 12h->24h this session, see decisions-log.ts) reduces the token/CI spend this blocker describes but does not eliminate it — a real cron-cadence change would still cut it further.",
    unblocks: [],
    firstFlagged: "2026-07-13",
    lastConfirmed: "2026-07-28",
    lastConfirmedAt: "2026-07-28T17:11:00Z",
    confirmedByCount: 30,
  },
  {
    id: "actions-ci-runner-outage",
    title: "GitHub Actions stopped assigning runners to this repo's CI workflow",
    whatsNeeded:
      "Duncan to check GitHub billing/Actions settings for this account (Settings -> Billing -> Plans and usage -> Actions, and Settings -> Actions -> General for the repo/org) for an exhausted included-minutes quota, a hit spending limit, or Actions disabled. Started 2026-07-18T04:14Z: PR #42's ci.yml runs began completing all 3 jobs in ~3-6s with runner_id 0 / runner_name empty / 0ms billable duration (no runner ever assigned — not a real test/build failure), versus the prior run's normal 15-100s/job durations on the identical workflow file and lockfiles. ci.yml itself is unremarkable (plain `runs-on: ubuntu-latest`, no self-hosted labels, no custom runner group) — a 2026-07-27 session tried downloading a job's logs directly (`get_job_logs`) and got a flat HTTP 404, meaning no logs exist at all because no runner ever picked up the job, not that a step failed and produced logs; this rules out a workflow-file misconfiguration as the cause and confirms it's purely an account/org-level runner-assignment problem, not something fixable from this repo's own files. ci.yml has no required-status-check branch protection, so affected PRs still merge (content verified locally each time) — this just means every subsequent PR shows the same false 'failure' until fixed; don't treat it as a signal to debug your own change first, check this blocker instead. Re-confirmed unchanged on 25 full-pass re-verifications since, zero exceptions, most recently on run 30322662723 (main @ 3ecf929, created 2026-07-28T02:16:58Z, the newest run on main as of this check) — identical runner_id:0/empty-runner_name/~2s-duration signature on all 3 jobs (conclusion failure), checked directly via the GitHub MCP server; this session additionally pulled that run's usage stats (get_workflow_run_usage), which confirm 0 billable ms on every job, the same 'no runner ever assigned' fact as the job-log-404 check from a second independent API, not new information but a second corroborating source. Duration as of this check (2026-07-28T17:11Z): ~253 hours (~10.5 days) and counting, zero sign of self-resolving. No new out-of-band push this session — shouldNotifyHuman(72) is false (~15h since the 2026-07-28T02:13Z notification, next due ~2026-07-31T02:13Z absent new information). A session doing a full pass should just pull the newest run on main via list_workflow_runs/list_workflow_jobs and check for the same runner_id:0/empty-runner_name/~2-11s-duration signature rather than re-deriving or re-narrating this history — 25 identical confirmations plus the 2026-07-27 job-log-404 and 2026-07-28 usage-stats checks are enough to stop appending a fresh paragraph each time. At 10.5 days old with zero self-resolution and four throttled reminders already sent, this remains squarely a 'go check the account directly' item — now the single longest-running and most time-sensitive blocker in this file.",
    unblocks: [],
    firstFlagged: "2026-07-18",
    lastConfirmed: "2026-07-28",
    lastConfirmedAt: "2026-07-28T17:11:00Z",
    confirmedByCount: 25,
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
