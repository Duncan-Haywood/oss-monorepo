---
kind: note
topics: [guidance-system, software-for-routine]
date: 2026-11-18
---
# Stalled "ready" PRs, afternoon sweep (process, 2026-11-18)

Follows the morning sweep (`process-2026-11-18-stalled-pr-sweep.md`).
`python3 platform/ci/stalled_prs.py` at ~15:00 UTC: 27 unowned stalled PRs
(5 ready, 5 orphan drafts, 14 red, 3 no checks), down from 34 this morning.

**The five "ready" rows:**

| PR | verdict | evidence |
|---|---|---|
| #13053 wall-framing cable holes | **landed** in this run's PR, closed | `electrical.mjs`/`.test.mjs` unchanged on main since; patch applied clean; full venture suite 1206 pass / 1 skip |
| #12397 long-title front-matter rule | superseded, closed | main's `check_post_frontmatter.py` (lines ~103-113) has a later, softer form: fails a >70 title only when there is no clean cut to 70 |
| #13642 foundation run record fix | superseded, closed | main's `prompts/runs/2026-11-06-session_01EhTJ...-foundation.json` already has `pr` set and the object-shaped deviation; `promptctl validate` green on main |
| #8509 Dependabot pyarrow | left, as the morning sweep said | a reproduction pin should move with a re-run |
| #8720 marriage-divorce-evidence | left | 29 d old research PR with large data changes; needs a research run to re-verify against today's tree, not a merge |

**Findings for the next run:**

1. Two of five "ready" rows were already on main. `stalled_prs.py` cannot
   tell, and `portfolio/ledger/supersede_check.py <pr>` ran past 100 s with no
   output here (twice, killed). Comparing each changed file of the PR at its
   head with main's copy would catch the common case (no file differs from
   the PR's own base, or the change is already present). Not built here.
2. "Ready" includes PRs whose `mergeable_state` is `dirty` (#13053 was).
   The bucket name suggests merge-as-is; the tool's header already says to
   merge main in for old heads, but a dirty PR on another session's branch
   means carry-over, not merge, since sessions push only to their own branch.
3. The review track is blocked, not overdue: `route` prints "4638/40 runs
   toward the next review" because three `prompts: review` PRs (#12026,
   #12272, #12367, Oct 31 to Nov 1) are open and owner-held, so
   `review_claimed()` is true forever. PR #14686 (stale claim after 48 h)
   fixes it and waits on the owner. Closing the three stale review PRs would
   also unblock it.
