---
kind: note
topics: [guidance-system, software-for-routine]
date: 2026-11-19
---
# stalled_prs.py: null mergeable is not a clean merge (process, 2026-11-19)

**Defect.** `classify()` treated the single-PR API's `mergeable: null` (GitHub
has not computed it yet; it does so lazily after the first request since the
base moved) as "no conflict". Live reading, ~17:20 UTC: 17 stalled unowned
PRs, 0 conflicted, #17310 "ready". Merging main into #17310 conflicted at
once. A re-read gave `mergeable: false, dirty` for #17310 and #10600.

**Fix.** `settled_detail()` re-reads up to `MERGEABLE_TRIES` (4) times, 2 s
apart, while null; still null and otherwise ready → `unknown merge` bucket.
After: ready 2, red 1, conflicted 7, no checks 0 (before: 3 / 5 / 0 / 2).

**For the next sweep.** The conflicted seven (#7442, #8630, #10600, #10881,
#12130, #12779, plus #17310 landed via PR #17736) need main merged in, not
closing. #8509 (Dependabot pyarrow pin in a research reproduction) stays
listed as ready although the 2026-11-18 sweep left it open on purpose: the
tool reads blockers only from the PR text, so a sweep's verdict is lost.
A file of sweep verdicts the tool reads would stop each sweep re-triaging it.
