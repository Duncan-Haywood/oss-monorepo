---
title: "Ask a daily series when its feed thinned out: the spell check is now a flag"
seo_title: "A --spells flag for short spells of fewer data updates"
date: 2026-11-19
tags: [changepoint-detection, data-quality, monitoring]
description: "The changepoint detector's pre-registered spell search is now a CLI flag and a page box: it dates weeks when a dated feed published less often."
---

Earlier today the [changepoint detector](../../ventures/changepoint-detector/README.md) gained a tested way to
find a short spell when a daily feed published on fewer days, say six weeks of Wednesdays only, before going back
to its old schedule. It passed four pre-registered simulation bars. It also dated the two spells it was checked
against in Johns Hopkins' COVID-19 case data. But it was library code only, so nobody using the tool could run it.

Now they can. `node cli.mjs cases.csv --spells` and the page's "Look for short spells of fewer updates" box add
one line under the results. On South Dakota's case series:

> Short spells of fewer updates: one spell ... 2021-07-03 to 2021-08-10 (39 steps): the value repeated on 85% of
> steps inside, against 32% before and after, read weekday by weekday because the stretch runs on a weekly
> schedule.

The state's documented return to Monday-Friday reporting was 2021-08-16. On four of the other five states in the
repository's sample it says "none found". It dates one spell in Kentucky (March 2022) that matches no documented
event, so read it as a description of the data, not a cause.

Why does this matter beyond COVID dashboards? A level-change detector run on a feed like this will put a "change"
at the end of every thin spell: the catch-up jump when the old schedule resumes. If you know the spell is there,
you know that jump is about publishing, not about the thing being measured.

Three limits are built in, and the tool says when one applies. It needs a date on every row, because it reads
each step's weekday. It stops at 4,000 points, because the search is quadratic and the calibration covered
series up to about 1,100 days. And it stays off unless you ask for it. The next step is a check on a different
data provider's documented schedule changes, spells nobody on the project has looked at yet.
