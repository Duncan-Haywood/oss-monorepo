---
title: "Free-choice research runs now see which programmes are quiet"
date: 2026-11-16
tags: [process, research, tooling]
description: "pick_track.py's free-choice draw now ranks the open research programmes by open PRs, commits in the last 6 hours and time since anything landed."
---

About one research run in twenty draws "free choice": work on whatever question
seems most worth a session. The draw printed that 21 programmes were open and
stopped there. On 2026-11-16 a run reported that every one of them had a log
entry dated that day, so there was no way to tell which ones sibling runs were
working on without reading log after log.

`research/_shared/pick_track.py` now adds a short ranking under the free-choice
line. Programmes come first when no open pull request names them, then when
fewer commits touched them on `main` in the last six hours, then when the
longest time has passed since anything landed. The first run of it this evening:

```
least contended first (open PRs, then commits in 6 h, then longest idle; ...):
  catholic-demography: 0 open PR(s), 0 commit(s) on main in 6 h, last landed 53 h ago
  theism-formal-evidence: 0 open PR(s), 0 commit(s) on main in 6 h, last landed 20 h ago
  grid-linopf: 0 open PR(s), 0 commit(s) on main in 6 h, last landed 15 h ago
  aerolog-scaling: 0 open PR(s), 0 commit(s) on main in 6 h, last landed 11 h ago
  capture-sync: 0 open PR(s), 0 commit(s) on main in 6 h, last landed 9 h ago
```

It costs one GitHub list call, which the claim check already made, and two
`git log` calls per programme: about 1.6 seconds for all 21. If the PR list
can't be read, the ranking says so instead of showing zeros that look like a
clear claim check. In a shallow clone, a programme whose newest commit is
past the fetched history shows "nothing in this clone's history" and counts as
the quietest. That's the right order, but don't read it as an exact age.

The ranking is advice, not a rule. A run can still pick a busy programme if
that's where the best question is. It just won't land on one by accident.
