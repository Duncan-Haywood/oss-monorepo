---
title: "The tennis feeder's CAD tests took 27 minutes because they rebuilt the robot 60 times"
seo_title: "build123d test suite: caching the part build cut 27 min to 5"
date: 2026-11-13
tags: [process, ci, open-tennis-robots, cad, build123d]
description: "The tennis feeder's CAD check ran 19 of 20 CI minutes: an 18 s part build was requested ~60 times. A cache cut the suite from 1637 s to 323 s."
---

The [open tennis robots](https://marisstella.app/open-tennis-robots/) feeder
is checked in CAD on every pull request. The check builds every part in
build123d, then moves the head through its tilt range, turns the turntable to
its stops, runs the shuttle through its feed stroke and drapes the cable loop
at each pose. At every step it looks for parts that overlap. On the hopper
agitator PR earlier today that job ran for 19 minutes against a 20 minute
limit. Every new part adds pairs to check, so the next part was likely to push
it over and show red CI on a design that was fine.

**Where the time went.** One call to `all_parts`, which builds every solid of
the feeder from its parameters, takes 18.4 s on a 4-CPU container. Each sweep
asked for a fresh copy at every pose. I counted the calls by wrapping the
function:

| step | calls | time before | time after |
|---|---:|---:|---:|
| elevation sweep | 5 | 47.0 s | 13.3 s |
| azimuth sweep | 10 | 70.6 s | 5.3 s |
| feed-stroke sweep | 16 | 103.0 s | 2.2 s |
| cable sweep | 21 | 147.0 s | 11.2 s |
| gravity table | 10 | 65.6 s | 0.8 s |

The "after" column is with the parts already built once (18.4 s, paid once).
Later calls were faster than the first one even before the change, which is
why five calls cost 47 s and not 92. Most of each sweep's time was still
spent rebuilding solids nobody had changed, not intersecting them.

**The fix** is a small cache in `otr_cad/feeder.py`. It keeps the last four
builds, keyed by parameters that compare equal. The `Feeder` parameters are a
frozen dataclass that holds a list, so they can't be hashed and
`functools.lru_cache` won't take them. Sharing the parts is safe because
nothing changes a `Part` after it is built: `placed()` and build123d's
`rotate()` both return copies. I checked `rotate`'s source in the pinned
0.13.0 to be sure. Each caller gets its own list.

**Result.** The whole CAD suite, `python -m unittest discover -s tests`, ran
80 tests in 1636.6 s before (from the backlog item's local reading) and
322.6 s after, all passing, in the same 4-CPU container type. Both
committed-package freshness tests passed too. They rebuild the collector and
feeder packages in a fresh process and compare every file hash with the
committed zip, so the cache changes no output. The CI job should now finish
in roughly 4 minutes, not 19. The first PR to run it will confirm that.

The CI timeout itself is under `.github/`, which waits for the owner's
approval, so I left it alone. With the suite five times faster it no longer
needs raising.
