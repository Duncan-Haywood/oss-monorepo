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
    lastConfirmed: "2026-07-13",
    lastConfirmedAt: "2026-07-13T16:15:00Z",
    confirmedByCount: 7,
  },
  {
    id: "phase-1-interviews",
    title: "Run the Phase 1 interviews",
    whatsNeeded: "Conduct 10 agent + 5 STR host interviews using process/interview-script.ts and log results.",
    unblocks: ["p1-run-interviews", "p3-app-scope"],
    firstFlagged: "2026-06-13",
    lastConfirmed: "2026-07-13",
    lastConfirmedAt: "2026-07-13T16:15:00Z",
    confirmedByCount: 7,
  },
  {
    id: "zillow-listing-audit",
    title: "Score 20 Zillow listings against the audit rubric",
    whatsNeeded:
      "Pick a target metro, browse Zillow, and score 20 listings (mediocre vs excellent) using process/listing-audit-rubric.ts.",
    unblocks: ["p1-listing-audit"],
    firstFlagged: "2026-06-13",
    lastConfirmed: "2026-07-13",
    lastConfirmedAt: "2026-07-13T16:15:00Z",
    confirmedByCount: 7,
  },
  {
    id: "cloudflare-access-dashboard",
    title: "Flip on the Cloudflare Access policy for the docs site",
    whatsNeeded:
      "In the Cloudflare dashboard: Workers & Pages -> listing-lens-docs -> Settings -> Enable access policy, restrict to duncan.andrew.haywood@gmail.com, then merge PR #4 (cursor/fix-pages-access-4a7e).",
    unblocks: ["p0-docs-site"],
    firstFlagged: "2026-06-15",
    lastConfirmed: "2026-07-13",
    lastConfirmedAt: "2026-07-13T16:15:00Z",
    confirmedByCount: 8,
  },
  {
    id: "stale-branch-cleanup",
    title: "Delete ~31 confirmed-stale, fully-merged branches",
    whatsNeeded:
      "From github.com (or a token with delete permission) delete the branches confirmed strictly merged/behind main (still 31 non-main branches per `git ls-remote --heads origin`, unchanged since the last session's count; only cursor/fix-pages-access-4a7e is live, as PR #4). This is now confirmed a proxy-level restriction, not a repo-permissions issue: the GitHub REST `DELETE /git/refs/heads/...` endpoint returns a distinct 403 ('Write access to this GitHub API path is not permitted through this proxy'), different from a plain permissions 403 — no agent session behind this proxy can ever delete a ref, regardless of GITHUB_TOKEN scope. Re-check with `git diff origin/main origin/<branch> --stat` (not the triple-dot form, which false-positives after squash merges) before deleting any branch that isn't empty-diff, in case a new session pushed real work to an old branch name.",
    unblocks: [],
    firstFlagged: "2026-07-12",
    lastConfirmed: "2026-07-13",
    lastConfirmedAt: "2026-07-13T16:15:00Z",
    confirmedByCount: 8,
  },
  {
    id: "payment-handle-setup",
    title: "Confirm/set the real payment handle prospects will pay",
    whatsNeeded:
      "process/payment-collection.ts (built 2026-07-13) defaults to requesting payment via Zelle (primary) / PayPal goods & services (fallback) sent to duncan.andrew.haywood@gmail.com (the same known real address already used for booking-link.ts and Cloudflare Access). Confirm that email actually receives payments on at least one of those apps (or link it), or swap in a different real handle in payment-collection.ts if not. Quick (a few minutes), independent of booking a shoot — worth doing before the first delivery, not blocking on it.",
    unblocks: ["p2-first-deliveries"],
    firstFlagged: "2026-07-13",
    lastConfirmed: "2026-07-13",
    lastConfirmedAt: "2026-07-13T16:15:00Z",
    confirmedByCount: 2,
  },
  {
    id: "cron-cadence-too-frequent",
    title: "Reconsider the hourly-or-tighter agent cron cadence now that everything is human-blocked",
    whatsNeeded:
      "Duncan to decide (and update the schedule in whatever's calling this repo's agent sessions) whether to slow the cadence. As of 2026-07-13, nextActionableTasks() has been empty for multiple days straight — every remaining roadmap task is gated on one of the five human actions above, none of which change hour to hour. At least three separate cron triggers hit this repo's agent process on sub-daily schedules (two hourly on local-site-studio, one hourly here), and today alone produced 3+ near-duplicate 'still blocked, nothing changed' branches (claude/blocker-recheck-0713a/b/c) before this session added the recentlyConfirmedWithinHours() throttle in prompt_process.tsx/blockers.ts to cut most of that. The throttle reduces branch/PR/CI churn but doesn't reduce token spend on the sessions that still spin up hourly and read the whole process/ tree before concluding there's nothing to do. A daily (or twice-daily) cadence would very likely catch a resolved human blocker just as fast in practice, since resolving any of them (an interview, a shoot, a dashboard click) is not itself an hourly-cadence event.",
    unblocks: [],
    firstFlagged: "2026-07-13",
    lastConfirmed: "2026-07-13",
    lastConfirmedAt: "2026-07-13T16:15:00Z",
    confirmedByCount: 1,
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
