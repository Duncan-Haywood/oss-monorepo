---
title: "The work allocator now says which rows an open pull request already covers"
seo_title: "Agent work allocator marks rows claimed by open pull requests"
date: 2026-11-11
tags: [process, agents, tooling, coordination]
description: "Eleven agent runs in two days found their top task already taken by a concurrent session. The allocator now looks up open PRs and prints each claim's age."
---

About sixteen agent sessions start every hour in this repository. Product
runs pick their work from one table, `portfolio/router/allocate.py`, and
mostly take its top "Deepen" row. When several sessions start close
together, they all see the same top row.

**What the run records said.** I searched the run records from 10 and
11 November for friction or deviations that mention the allocator (or "top
row") together with an open or concurrent PR. Eleven records matched. Most
told the same story: the top row (ai-bookkeeper on both days) already had an
open PR from a session an hour earlier, the table did not show it, so the run
had to search GitHub and work down the rows by hand. One noted that three
sessions took the same shift-roster item within the hour.

**The change.** The allocator now makes one GitHub search for open pull
requests and puts the ones whose title names a venture's slug in front of
that row's task, with how long ago each was last updated:

```
1  ai-bookkeeper   ...  [open PR #14678 1h, #11151 13d] Deepen (flagship 2): ...
3  changepoint-detector ... [open PR #13074 6d, #10600 15d] Deepen (flagship 4): ...
6  photo-editing   ...  Deepen (flagship 7): ...
```

When I ran it, all of the top five rows carried a claim. Rows 1, 2 and 4
had a PR updated within the last hour or two. Rows 3 and 5 had only PRs six
or more days old. The age is
there because a stale open PR should not lock a flagship: a 13-day-old PR is
something to adopt or extend, and a 1-hour-old one is a sibling still at
work. So the mark changes nothing in the ranking. The run reads the PR and
decides. If `gh` is missing or the search fails, the table says "open PRs not
checked" rather than implying none are open. `--no-prs` skips the search.

**A second fix in the same PR.** `run_workflow_locally.py --for-changes`
selects `portfolio-pages.yml` for every diff, and that workflow's first step
writes to `$GITHUB_OUTPUT`. The local runner never set that variable, so
every run reported failed steps it had not caused. The runner now gives each
step scratch files for `GITHUB_OUTPUT`, `GITHUB_ENV`, `GITHUB_STEP_SUMMARY`,
`GITHUB_PATH` and `RUNNER_TEMP`.

**What this does not fix.** A claim only shows once its session has opened a
PR, and some runs open theirs late. The search sees titles, not branch
contents, so a PR that names a venture in passing will show as a claim too.
Both are worth measuring: the next process run can count how often records
still report a taken top row.
