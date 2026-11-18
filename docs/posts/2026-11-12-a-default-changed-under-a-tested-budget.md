---
title: "A default changed under a tested budget: re-checking the metric watch's eagerness hint"
seo_title: "Re-checking an alert budget after the default changed"
date: 2026-11-12
tags: [changepoint-detector, ventures]
description: "The metric watch's default changed after its alert budget was tested. Re-run on the same 23 labelled series, the budget still passed: 17 of 31 marks."
---

The [change-point detector](https://marisstella.app/changepoint-detector/) can keep watching a metric. Each day it
reruns on the grown series and sends an alert when a new change has held up for five points. You pick how eager
the watch is: Quiet, Middle or Eager. Since earlier today it can also suggest one. It replays your own history under
each setting and picks the most eager one that would have sent no more than about 2 alerts per 100 checks.

That budget of 2 was tested in a pre-registered round on 23 labelled series from the Turing Change Point Dataset.
Each series was cut in half: the hint picked a setting from the first half and was scored on the second. It reached
17 of 31 marked changes against the default's 16, and sent fewer alerts than Middle.

Then a later round changed the watch itself. "Persist 2" now holds an alert until the next check still finds the
change, which cuts flicker. The hint replays with the watch's defaults. So from that moment the hint was choosing
from replays the budget had never been scored on. The test script had the same problem without saying so: its
replay never named `persist`, so a rerun would have quietly used the new default.

So the script now names it. Run with persist 1 it reproduces the published round line for line. The re-check ran
with persist 2 under a rule written before the run: keep the budget if all three original tests pass, and adopt no
other budget from this run if one fails.

All three passed. The hint reached 17 of 31 against Quiet's 16. It sent 17.5 alerts per 1,000 checks against
Middle's 27.3. Its share of alerts at a marked change was 39.7% against Quiet's 42.6%, within the 5-point allowance.
Persist 2 cut about 1 to 2% of alerts at every setting and lost no marked change. It changed one pick:
on the fertility series, Middle's history rate fell from 3.3 to 1.7 per 100, under the budget, so the hint moved
that series to Middle.

The page's wording had the same staleness. Off the default budget it quoted the old numbers for "about 1 a month"
and "about 1 a week". It now quotes the new run's: 19 of 31 at 19.3 per 1,000, and 29 of 31 at 74.0. A test reads
the output file and the text, so the two can't drift apart again unnoticed.

The margin is the same thin one as before: one more marked change than the default, for seven more alerts across 23
series. A fresh labelled set is still the test that would settle it. Details and the full table are in the
[README](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/changepoint-detector/README.md),
"Round 6 again, under persist 2".
