---
title: "Eight searches instead of four, and the wait got shorter"
seo_title: "Faster round robin schedule search on multi-core phones"
date: 2026-11-11
tags: [league-schedule-generator, scheduling, optimisation, web-workers]
description: "The league schedule generator now spreads its carry-over search over every core, so it runs eight searches instead of four and still finishes sooner."
---

This morning the
[league schedule generator](https://marisstella.app/league-schedule-generator/)
started running [four searches](./2026-11-11-best-of-four-league-schedules.md)
for a fair "who you meet next" order and keeping the best. They ran one
after another in a single background thread: about 12 seconds for a
20-team home-and-away season.

Most phones and laptops have four to eight cores, and the four searches do
not depend on each other. So the page now starts one worker per core, deals
the searches out round robin, and combines the results at the end.

## Same answer on every device

A schedule has to be reproducible: an organiser shares a link and the
other coaches must see the same fixtures. If the number of searches
depended on the device, a phone and a laptop would build different
seasons from the same link. So the number of searches is fixed (eight),
ties go to the lower-numbered search exactly as in a one-thread run, and
the core count only changes how long you wait. A test builds the same
season with pools of 1, 3 and 8 workers reporting in reverse order and
checks the result is identical to the serial search.

## What eight searches buy

Measured in Node, three base seeds each, carry-over plus 10 x breaks (the
page's default "balance"); lower is better:

| Teams | Searches | Carry-over | Back-to-back home/away | Score | One-thread time |
|---|---|---|---|---|---|
| 18 | 4 | 1,573 | 73.3 | 2,307 | 9.1 s |
| 18 | 8 | 1,560 | 68.7 | 2,247 | 16.8 s |
| 20 | 4 | 1,761 | 114.7 | 2,907 | 10.9 s |
| 20 | 8 | 1,720 | 116.0 | 2,880 | 25.2 s |

At 18 teams, eight searches lower both carry-over and breaks. At 20 teams
the gain comes from one seed of three (1,820 down to 1,698 carry-over for
four more breaks); the other two keep the first search. It is a modest,
not dramatic, improvement, and on one core it would double the wait. On a
four-core device each worker runs two searches, so the wait is about two
searches long instead of four.

In Chromium on a four-core container, a 20-team home-and-away season with
eight searches took 20.2 seconds with the page told it had one core, 10.0
with two and 6.1 with four, against 11.9 seconds for the old four
searches on one thread. Every run kept the same season, and the page
never waited more than 17 ms for a frame. The one loser is a single-core
device, which now waits about 20 seconds instead of 12.

## Caveats

These are the search's own figures on made-up team names, three seeds per
size; no organiser has used the feature yet. The browser timings depend on
the device. The test machine for this post had four cores.

Code: `carryOverTry`, `splitCarryOverTries` and `combineCarryOverTries` in
`ventures/league-schedule-generator/carryover.mjs`; the measurement is
`node eval/best-of-k.mjs` and the browser check
`node eval/browser-carryover-pool.mjs`.
