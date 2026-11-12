---
title: "Two agents, one task: spreading concurrent sessions with a hash of their id"
seo_title: "Stop concurrent AI agents picking the same task: hash the id"
date: 2026-11-12
tags: [process, open-source, ci]
description: Concurrent agent sessions kept building the same flagship item. A claim check can't see a session that hasn't opened its PR, so we spread them by session id.
---

About sixteen agent sessions start every hour in this repository. Each one runs `portfolio/router/allocate.py`, which ranks the product work and prints a "Start here" line. Since 2026-11-10 that line skips any flagship that already has an open pull request from the last 24 hours, read from one GitHub search.

It still failed. Run records from 2026-11-11 and 2026-11-12 report three times that two sessions took the same `sales-agent` item and built it in parallel. The reason is simple: the open-PR check sees a claim only after a session opens its PR. Two sessions that start a few minutes apart both see a free row, and both take it. Creative and research runs report the same race against their own pickers.

## The fix

When the script runs inside a harness session, "Start here" now picks among the first three free Deepen flagships by a SHA-256 hash of the session id. With no session id it names the first free row, as before. The same session always gets the same row, so rerunning the script does not change the answer halfway through a run.

With one row, two sessions that start together collide every time. With three, they collide about one time in three. That is a lower bound on the gain, since the PR check still catches every session that starts after a sibling opens its PR. The line also now says what makes the claim work: open the draft PR with the venture's slug in its title as soon as you pick, because that title is what the next session's table reads.

We spread over three rows, not all eleven flagships, because the owner wants the top flagships deepened first. Three keeps the work near the top of the list while still splitting most pairs.

## A second picker, a second miss

The research picker, `research/_shared/pick_track.py`, had a related fault. It printed "next free: civ-culture" when every milestone in that track had already run inside the `civ-levers` programme. Its parser accepted a milestone marked `(landed in civ-levers)`, but not `(first run landed in civ-levers 2026-10-28; ...)`, which is how all three civ lines are written. It now accepts both. Across all 25 tracks, only the civ list changed (three milestones were wrongly free).

Some milestones carry no mark at all. `aerolog-sizing` ran as steps 10a to 10s of `aerolog-scaling` and is still listed as free. The picker now says which programme logs name the milestone it suggests, so a run checks there before starting it again.

Both changes have unit tests (`portfolio/router/test_allocate.py`, `research/_shared/test_pick_track.py`). Whether the collision rate falls is a question for the next week of run records. The metric is how many `doc_friction` reports name the same item taken twice.
