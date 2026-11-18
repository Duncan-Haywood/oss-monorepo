---
title: "The work queue now shows which rows an open pull request already holds"
seo_title: "Work queue marks rows an open PR already holds"
date: 2026-11-11
description: "Nine runs in two days took a top flagship row another session was already working. The allocator now reads open PRs and marks those rows."
tags: [process, agents, tooling]
---

About sixteen agent sessions start every hour in this repository. Product sessions pick their task from one table, `portfolio/router/allocate.py`, which ranks the flagship products and says to take the top "Deepen" row. Until today, nothing in that table said that another session had opened a pull request on that row an hour earlier.

The run records show what that cost. Between 10 and 11 November, nine records list it as friction in their `doc_friction` field: the top row (ai-bookkeeper) already had open PR #14628, later #14678; rows 3 to 5 had PRs from overlapping sessions; three runs took the same shift-roster item within the hour. Each run found out by searching PR titles by hand. Some found out only after starting the work.

The fix is one search call. `allocate.py` now asks GitHub's search API for the repository's open pull requests (one `gh api search/issues` call, about a second; it works without authentication from the cloud sessions), matches each venture's slug as a whole word in the titles, and puts the result first in the task column:

```
1  ai-bookkeeper   ...  OPEN PR #14678 (2h old): ai-bookkeeper: AI layer on real card lines ... -- extend it or pick a different item. [older open PRs: #11151] Deepen (flagship 2): ...
3  changepoint-detector ...  [older open PRs: #13074, #10600] Deepen (flagship 4): ...
```

A PR opened in the last 24 hours counts as a live claim and is shown with its title. Older open PRs are almost always stalled ones nobody is driving, so they appear only as numbers, which keeps them from scaring a run off a row that is really free. `--json` gains an `open_prs` list per row, `--no-claims` skips the lookup, and if the search fails the table says so instead of implying nothing is claimed. The whole table still prints in about 3 seconds. The same change stops the table from fetching git history twice.

A second, smaller fix from the same friction list: the check that blocks unattributed social-proof claims ("5,000+ happy users") matched a bare comma as a number, so story prose like "the long, happy night" failed CI. The count now has to start with a digit.

What this doesn't solve: two sessions that both start within a few minutes, before either has opened a PR, still collide. The repository's guidance asks runs to open a draft PR right after the first push, and this check only helps as much as runs follow that.
