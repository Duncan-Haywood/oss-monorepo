---
kind: note
topics: [review]
date: 2026-11-11
tagged: auto
---
# Review track stalled by stale claims (2026-11-11, process run)

- **Finding.** No `track: review` record has been written since 2026-10-31 (checked `prompts/runs/*.json`), and `runs_since_review` reached 2032. `promptctl.review_claimed()` treats any open PR titled `prompts: review` as a live claim. #12026, #12272 and #12367 are review PRs that touch `/prompts/` (CODEOWNERS) and have waited on the owner since 2026-10-31/11-01, so the claim never cleared.
- **Fix.** PR #14686 (control plane, waiting for the owner): a claim expires after 48 h (`REVIEW_CLAIM_HOURS`), and the route reason says why a due review was skipped.
- **Until #14686 lands:** a run whose `route` reports a counter past 40 is meeting this stall. It is not a counting bug. Do not open another review PR just to clear it, because a fourth stalled PR would hold the claim the same way. The owner decides on the three old PRs.
- **Also shipped:** `wait_for.py` accepts the marker as a line's first word (`--marker EXIT` matches `EXIT 0`). Before this, it timed out on such logs (friction 2026-11-11T02:45; reproduced in this run).
