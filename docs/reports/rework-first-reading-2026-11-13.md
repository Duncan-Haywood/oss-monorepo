---
kind: note
topics: [run-records, scoring, shallow-clone]
date: 2026-11-13
---
# 14-day rework, first reading: 3,389 merged PRs, 0 reverts, median survival 0.963 (2026-11-13, process run)

- **Finding.** `prompts/derive.py` has measured rework (revert, follow-ups,
  14-day `git blame` line survival) since 2026-10-16, but `promptctl.py measure`
  showed `None (0 of 0)` in every "14-day survival" cell. `prompts/derived/runs.json`
  was last built 2026-10-31, when almost every window was still open, and only
  review runs rebuild it (no review has merged since: PR #12367 holds the claim,
  PR #14686 waits on the owner). No record had ever been measured.
- **Why nobody rebuilt it.** Two causes, both in `prompts/derive.py` (control
  plane, so fixed in a separate owner-approval PR):
  1. `git()` decodes output as strict UTF-8. The first build with closed windows
     died after 43 minutes on a blamed file holding byte 0xfc, losing all rows.
  2. `build` recomputes every closed window each time. Serial, it ran about 1 day
     of merges per 10 minutes (Oct 20 reached after 40 min); with 4 processes the
     whole build took 43 min. Closed windows never change, so they can be reused.
- **How this reading was made.** `git fetch --shallow-since=2026-10-10 origin main`
  (1 min 53 s, `.git` 768 MB to 2.6 GB), then derive's own `measured()` for every
  record in 4 processes, with `git()` patched to `errors="replace"` and a per-record
  try/except (a 40-line throwaway driver; the derive.py PR below makes it unneeded). `github.json` was not
  refetched, so records after 2026-10-31 read "not fetched yet". PRs merged before
  2026-10-10 are not on the clone and read `unavailable`.
- **Numbers** (`python3 prompts/derive.py report`, plus a per-PR pass deduplicating
  records that share a PR): 3,392 records, 3,389 PRs with a closed window, merged
  2026-10-15 to 10-29.
  - Reverts: **0** (`git log --grep "This reverts commit"` since 10-10 also finds none).
  - Follow-up commits naming the PR within 14 days: 58 PRs (1.7%).
  - Line survival, per PR (2,546 with counted lines): median 0.963, mean 0.886;
    710 at 1.0; 407 under 0.8; 129 under 0.5.
  - Lines-weighted: 1,003,450 of 1,202,536 added lines alive (0.834). Ventures
    0.81 (big generated files: #9239's 101,732 CAD lines at 0.366), process 0.90,
    redteam 0.92, explore 0.93, research 0.95 (mirrored paths excluded), creative 0.98.
  - Median by track/version: process/1 0.923 is the lowest working track; review/1
    0.851 (prompt rewrites by later reviews, expected).
- **What low survival is here.** The lowest-survival PRs with 50+ lines are sweeps
  a later sweep replaced, not defects: #9986 pointed venture front doors at the
  GitHub Pages path (0.005, superseded by the marisstella.app move), #10384
  redated 77 posts (0.077), #7050 edited 862 workflow checkouts (0.135),
  #9532/#9239 generated CAD that later regenerated. Survival as measured mixes
  "replaced by the next sweep" with "fixed because it was wrong"; follow-ups
  (a later commit naming the PR) is the closer signal to rework, and it is rare.
- **Next.** The owner-approval PR makes `derive.py build` reuse closed windows
  from the previous `runs.json` and decode with `errors="replace"`, so the next
  rebuild costs minutes. Then the weekly-measures workflow (PR #12917) or a review
  run can keep it current. Re-read after 2026-11-27 to compare candidates
  (ventures/2, process/2) whose windows are still open.
