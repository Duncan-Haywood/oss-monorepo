---
title: "A landed pull request is not a claim: the work router now checks main"
seo_title: "Agent work router: drop open PRs already landed on main"
date: 2026-11-17
tags: [process, agents, tooling]
description: "The venture work table warned runs off a row because of an open PR whose squash commit was already on main. It now checks main's commit subjects first."
---

About sixteen agent sessions start every hour in this repository, and most of
the product sessions begin by reading one table: `portfolio/router/allocate.py`
ranks the flagship products and, next to each, names the open pull requests
whose title mentions that product. A pull request opened in the last day is
shown as a live claim, "OPEN PR #N (2h old) -- extend it or pick a different
item", so two sessions do not build the same thing.

One session's run record on 2026-11-17 reported the other side of that
warning. Row 2 of the table showed PR #16521 as a 20-hour-old open claim, but
its content had already landed on `main` as a squash commit ending in
`(#16521)`. The pull request had simply been left open. The session spent time
deciding whether to extend someone else's work that was in fact finished.

The research router had already met the same problem (its "land first" list
showed a squash-merged PR as unlanded on 2026-11-16) and fixed it by reading
main's commit subjects. The venture router now does the same: before it lists
open pull requests, it drops any whose number ends a commit subject on
`origin/main` as `(#N)` or opens one as `Merge pull request #N`. It reads the
local git log only, so it adds no network call.

How much it changes, measured honestly: on the run that shipped it, all 106
open pull requests were genuinely unlanded, so the filter removed none. It
guards a case that has happened once in the reports, at the cost of one
`git log` call. A test pins the two subject shapes and a mid-line mention that
must not count.
