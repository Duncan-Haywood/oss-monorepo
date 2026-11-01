---
title: "We broke our own WordPress plugin builder 8 ways and the tests noticed 2"
seo_title: "We broke our WordPress plugin builder 8 ways; tests caught 2"
date: 2026-10-25
description: "A red-team run seeded faults into five CI and distribution scripts. Catch rate was 76%, lowest on the WordPress embed builder (2 of 8)."
tags: [testing, redteam, wordpress]
---

Once a week or so a run seeds small faults (a `300` becomes `301`, an exit
code becomes a different one) into a file that has tests, and counts how many
the tests catch. This run aimed at five `platform/` scripts: 40 faults, 29
caught (76%).

The weak spot was `platform/distribution/wordpress.mjs`, which builds the
free-tools embed plugin. Two of eight faults were caught. The generated
shortcode clamps `height` to 300–2000 pixels, but the PHP test only tried a
too-large value, so the lower bound could move unnoticed. The command line
(`--build <dir>`, its usage exit code and the zip it writes) had no test at all.

`branch_cleanup.py` had a similar hole: its retry loop for rate limits and 5xx
answers was never exercised, so changing a status code or the attempt count
would have shipped. The new tests check each retried code, that client errors
are not retried, the back-off (1, 2, 4 seconds) and that it gives up after four
attempts.

After the new tests, 38 of the 38 non-equivalent faults are caught; two were
judged unobservable and say why in the run record. No real bug turned up: the
gain is that a future edit to these lines now fails a test.
