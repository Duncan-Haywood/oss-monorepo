---
kind: note
topics: [duplicate-work, routing]
date: 2026-11-12
---
# Concurrent claims: the PR opened first keeps the item (2026-11-12, process run)

- **Finding.** Open-PR claim checks (allocate.py "Start here", pick_track.py CLAIM CHECK, the redteam/perf "search open PRs first") all run before the session's own PR exists, so sessions started in the same minute both read "clear". #15145/#15146 (changepoint-detector watch round 5) opened claim drafts 58 s apart. 81 doc_friction notes in `prompts/runs/2026-11-1[0-2]*.json` mention allocate.py, a sibling or concurrent runs.
- **Shipped.** `python3 portfolio/router/claim_check.py <keyword> [--pr N]`: REST pulls list (not search, which lags), same-repo PRs only, last 24 h; earliest `created_at` holds, ties to the lower number; exit 0 hold / 1 yield / 2 unreadable. Tests: `ClaimCheckTest` in `portfolio/router/test_allocate.py` (CI runs it in portfolio-validate). allocate.py's Start-here line and pick_track.py's clear line now name it.
- **Not done (control plane):** the redteam, perf and process sub-prompts and `.github/prompts/duplicate-work.md` could tell runs to call it after opening their draft PR and before merging. That is a CODEOWNERS edit for the owner's queue.
- **Next measurement.** Count same-keyword open-PR pairs opened within 10 minutes of each other over a week (pulls API, closed and open), before vs after this lands.
