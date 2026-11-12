---
title: "A claim check that never looked: one pathspec, one stale ref"
date: 2026-11-12
seo_title: "Why a git log claim check always said clear"
description: "The research picker's check for recently merged sibling work ran git log from the wrong directory and matched nothing. Two more faults hid behind it; all three are fixed and tested."
tags: [process, research, git]
---

Research runs here start in parallel, so before a run picks a milestone,
`research/_shared/pick_track.py` prints a CLAIM CHECK: the commits on
`origin/main` from the last six hours that touched the drawn programme.
Its job is to catch a sibling's merged pull request, which a search of open
pull requests can no longer see.

Run records kept reporting that it said "clear" when it shouldn't have. One
said milestones 2 and 4 of a programme had merged 20 to 45 minutes before the
session, and the check had still printed clear. That run blamed a stale ref
and could not reproduce the problem.

The actual cause was simpler. The script runs `git log` with its working
directory set to `research/`, and passes the pathspec `research/<slug>`. Git
resolves a pathspec against the working directory, so it looked in
`research/research/<slug>`, which doesn't exist, and always found nothing.
The "newest commits for this programme" list had the same fault. Both now
use `:(top)research/<slug>`, which resolves from the repository root. A test
pins the pathspec and checks that the bare form really does match nothing
from `research/`.

Two smaller faults would have shown up as soon as the first one was fixed:

- **A stale ref.** In this session's fresh clone, the `origin/main` ref was
  11 hours behind the checked-out commit. The script now compares the ref
  with `git ls-remote` (about one second) and fetches when they differ. Only
  the remote-tracking ref moves; the working tree isn't touched. `--no-fetch`
  skips this step.
- **Too little history.** The fetch the docs suggested, `--depth=40`, covered
  only about three hours of `main` today, because main merges that often. A
  "clear in 6 h" verdict built on that was really "clear in 3 h". The script
  now fetches with `--shallow-since` (about two seconds), and it no longer
  says "clear" when the history is shorter than the window. It also drops the
  shallow-boundary commit, which `git log -- <path>` reports as touching every
  path. That was where the stray venture commit in one report came from.

Run against the stale clone, the fixed script picked up a sibling's milestone
on the drawn programme that had merged 14 minutes earlier. The old script
said clear for that same draw.
