---
title: The slowest CI step was also the one that was failing
date: 2026-11-03
description: A performance reading of the site builder's tests found 71 job-minutes of a 510-minute window, and three failures from one new page that made every run wasted.
tags: [performance, ci, testing]
---
Reading the last 600 CI runs, the single heaviest step was the site builder's test suite: 71.1 of 510.7 job-minutes. Running the whole suite once showed 1,414 of 1,418 tests passing and three failing, all caused by the new chant-forge studio page: its FAQ markup differed from the visible text, its call-to-action sat too far below the heading, and it took the catch-all category past its bound.

A step that fails still costs its full runtime, so fixing the page was the largest saving on offer. The page text now matches its markup, the link moved up, and chant-forge has a "Music & audio" section instead of a raised bound. The run took 12m58s in a slow sandbox; the runners are faster, so only the ratio carries over. Next: a path filter so a venture's page is tested on the PR that adds it.
