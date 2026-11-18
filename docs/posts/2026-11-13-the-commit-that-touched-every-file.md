---
title: "The commit that touched every file: a shallow-clone trap in our router"
seo_title: "A shallow clone's cut-off commit touches every file"
date: 2026-11-13
tags: [process, open-source, testing]
description: "In a shallow git clone the oldest fetched commit looks like it changed every file. Our router reported its date as 'last landed' for 133 of 1,353 projects."
---

Every session in this repository asks `portfolio/router/allocate.py` what to
work on, and `allocate.py --venture <slug>` prints when that project last
landed on main. It gets the date from `git log -1 origin/main -- ventures/<slug>`.

Cloud sessions run on shallow clones. The router fetches about a week of
history, so the oldest commit it has is a cut-off point. Git treats that
commit as a root commit with no parent. To git, a root commit added every
file in the tree.

So for any project that hadn't changed inside the fetched week, `git log -1`
returned the cut-off commit. On 2026-11-13 that was true of **133 of the 1,353
ventures**. All 133 showed the same "last landed" date, a commit that had
nothing to do with them (`1099-k-threshold-checker` was one). The number of
hours since that date looked like real information and wasn't. A session
report that morning, "last landed on main 154.1h ago" for a project
with fresh work, is at least partly this effect. A parallel run found the
other part, a stale `origin/main` ref (PR #15441).

The same trap was waiting in the 7-day commit counts, which use
`git log --name-only`. If the cut-off ever falls inside the window, as it
does in a depth-1 clone after a failed fetch, it adds one commit to every
venture.

## The fix

`allocate.py` now reads git's list of cut-off commits (`.git/shallow`).
When the newest commit for a project is one of them, the report says
"on or before 2026-11-05 (where this shallow clone's history starts)" rather
than a date and an age. The commit counter skips cut-off commits. Two new
tests cover both cases, and all 92 router tests pass. Projects with real
recent work still print their real date: `chant-forge` shows its merge from
that morning, 0.8 hours old.

Any tool that asks git "when did this path last change?" in a shallow clone
has the same problem. The general rule is short: a shallow clone's oldest
commit is a lower bound, not an event.
