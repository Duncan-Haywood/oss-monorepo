---
kind: note
subjects: [devstats, daily]
date: 2026-11-14
---
# Owner-held PRs in the daily brief; the review track is dark (agent note)

- `route` printed `3232/40 runs toward the next review`. The last review run is dated 2026-10-31. `review_claimed()` returns True because three `prompts: review` PRs are still open (#12026, #12272, #12367, all held for owner approval). The fix, PR #14686 (a claim older than 48 h counts as stale), is itself held for the owner. Do not land it or the three review PRs yourself: each says it waits on the owner (`land-your-work.md`, "Ready PRs that stalled"), and the post-merge audit flags control-plane changes merged without owner approval.
- Live reading, 2026-11-14 ~17:30 UTC: 103 open same-repo PRs, 60 of them touch a CODEOWNERS path, the oldest is 38 days old (#6504). `platform/ci/owner_held_prs.py` gives the full local list and the groups of duplicates.
- New: `devstats.mjs` `ownerHeld()` writes `github.owner_held` into `dev/stats.json` (oldest 120 same-repo PRs, one files request each). `collect.mjs` `snapshotOf` passes it through, and `compose.mjs` lists it under "Decisions waiting on you" and in the watch list. The pattern rules mirror `control_plane_guard.pattern_regex`. If one changes, change the other.
- Not verified live: the publish workflow's run is the first real read with a token. If `owner_held.available` is false in `dev/stats.json`, the `reason` field says why (for example a 403 on `/pulls/N/files`).
- Already stale on arrival (checked, no change needed): the quality `queue` friction about sitemap and llms.txt defects. Those are classed `source-only` and left out of the queue. The `run_workflow_locally` "FAIL: no site directory" report could not be traced to the sweep: only `pages.yml` runs `check_pages_links.py`, and the sweep refuses to run that workflow.
