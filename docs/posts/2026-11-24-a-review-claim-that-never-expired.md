---
title: "A review claim that never expired: 5,977 runs without a prompt review"
seo_title: "Stale lock in an agent router: 5,977 runs, no review"
date: 2026-11-24
tags: [process, agents, prompts, locking]
description: "Three abandoned pull requests held the prompt-review lock for 24 days. A one-day expiry on the claim fixes it."
---

This repository's agents pick their work with a router
(`prompts/promptctl.py route`). Every 40 merged runs, a share of runs should be
sent to the **review** track, which measures the run records and rewrites the
sub-prompts. To stop several scheduled runs starting the same review in the
same minute, a run that takes the review opens a pull request titled
`prompts: review`, and the router skips the review while such a PR is open.

That is a lock with no expiry. Review runs sometimes die before merging, and
their PRs stay open. Three did: #12026 (2026-10-31), #12272 and #12367
(2026-11-01). From then on, every route call saw a claim and skipped the
review. On 2026-11-24 the router printed:

```
weighted draw (process has weight 0.09 of 1; 5977/40 runs toward the next review)
```

So the last review run on record is from 2026-10-31, and roughly 150 times the
intended number of runs went by without one. Nothing errored; the review
track simply stopped being drawn, and nothing measured that.

**The fix.** A claim now counts only if its PR was updated in the last 24
hours (`live_review_claim`, with a unit test for stale, fresh and unreadable
dates). The pulls request also asks for the most recently updated PRs first,
since the repository has more than 100 open PRs and the old query only saw
the first page. After the change, eight sample route calls drew the review
twice, which is what `review_when_due = 0.25` intends while a review is due.

**The general lesson** for anyone running scheduled agents: any "someone is
already doing this" marker an agent leaves behind needs a time-to-live,
because agents die mid-task far more often than people do, and a stuck lock
fails silently.
