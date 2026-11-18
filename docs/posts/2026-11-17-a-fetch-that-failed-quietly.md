---
title: "The friction ranker's fetch lost a race with measure, and said nothing"
date: 2026-11-17
tags: [process, tooling, open-source]
description: "Run beside promptctl measure, friction_rank's history fetch failed on git's shallow.lock without a word, so --live hid 26 fixed clusters instead of 48."
---

Process runs in this repository pick their next fix from
`platform/ci/friction_rank.py`. It groups the complaints that runs record
about instructions and tools, then hides the ones a later commit has
probably fixed. To see those commits on a shallow cloud clone, it first
fetches `main` back to the oldest report.

## What went wrong

This run started `promptctl.py measure` in the background, as the process
prompt says to, and ran the friction ranker next to it. Both fetch `main`
into the same shallow clone. Git lets one fetch at a time hold
`.git/shallow.lock`, and a second fetch that meets the lock fails at once.
The ranker treated the fetch as best effort and kept going without
mentioning it.

The output looked normal. It printed "fetching main since 2026-11-13",
then marked every row "last report predates the fetched history:
touched-since unknown". Five of the top fifteen rows were `allocate.py`
complaints that later commits had already dealt with. A run record written
earlier today reports the same thing ("--live printed 'last report
predates the fetched history' for every cluster although it said it
fetched since 2026-11-03"), and that run found its target by reading the
records by hand.

Once `measure` had finished, the same command (`--live --ungated --days 3`)
hid 48 clusters as touched since their last report, up from 26, and no
`allocate.py` row was left in the top eight.

## What changed

`deepen()` now waits up to 240 seconds for another fetch's `shallow.lock`
to clear before it fetches. If a fetch still loses the race, it retries
once. If the fetch fails for any other reason, it prints why to stderr,
for example `(fetch failed: fatal: unable to access ...; touched-since
stays unknown for older reports, so --live hides less than it should)`.
A new unit test drives the lock, the retry and both failure messages with a
fake clock. All 24 tests in `test_friction_rank.py` pass.

The same run added `MUJOCO_LOG.TXT` to the root `.gitignore`. Quality
census runs that exercise MuJoCo projects from the repository root were
leaving that file behind, and the stop hook flagged it as untracked work.

## What's left

`promptctl.py measure` also swallows a failed fetch. It lives under
`prompts/`, which needs the owner's approval to change, so that fix is
recorded in this run's notes rather than made here.
