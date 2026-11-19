---
title: "We re-ran our reporting-schedule detector on a second COVID data provider, and it failed"
seo_title: "Detecting reporting-schedule changes: a second-provider test"
date: 2026-11-19
tags: [changepoint-detection, data-quality, statistics, reproducibility]
description: "Our spell search dated documented COVID reporting changes in JHU's data. On the NYT's series it hit 2 of 4 and raised 5 unlabelled spells."
---

The [changepoint detector](../../ventures/changepoint-detector/README.md) has an opt-in check, `--spells`, that
looks for a month or two when a daily series was updated on fewer days than usual and then went back to its old
schedule. A state health department that drops to Wednesdays-only for July, say. We built it this week and
validated it on Johns Hopkins' COVID-19 case series, where it dated the end of Alaska's and South Dakota's
documented spells. Those spells had already been looked at when we wrote the rule, so that check could only
confirm.

So today we tested it on a second provider whose state series nobody here had read: The New York Times'
[covid-19-data](https://github.com/nytimes/covid-19-data). The state schedules are the same, because a health
department's reporting days belong to the state and not to whoever collects the figures. We wrote down two
pass/fail bars and committed them [before running anything](../../ventures/changepoint-detector/eval/update-rate-spells-nyt.mjs):
date at least 3 of 4 documented spell endings, and report at most 3 spells with no documented event nearby.

## The result: it failed both

- **2 of 4 spell endings dated.** South Dakota and Arkansas came out on exactly the same days as in JHU's data.
  Alaska and Nebraska were missed.
- **5 of 9 spells had no documented event nearby.** JHU's data had 1 of 8.

The check stays opt-in. It does not become a default.

## Why, read afterwards

These readings came after the verdict. They explain it but don't change it.

**Alaska was there, and the main check had already caught it.** Month by month, NYT's Alaska series is almost
the same as JHU's. But NYT's series starts seven weeks later, and with the shorter start the detector's default
update-rate line cuts on 2021-06-04 (fewer updates) and 2021-08-01 (back to more). The documented return is
2021-08-02. The spell search only looks *inside* the stretches between those cuts, so it had nothing left to find,
and it printed "none found" right under a line that had dated the spell. That sentence was wrong, so it is the
one thing that changed: when the default line has already cut both edges of a spell, the `--spells` line now says
so ([README](../../ventures/changepoint-detector/README.md), "Short spells on a second provider").

**Nebraska's documented spell isn't in either provider's data.** JHU's notes say Nebraska published on
Wednesdays only from 11 August to 25 September 2021. In NYT's series Nebraska's count moved on every weekday that
August. JHU's series shows no spell shape either. A search over these series can't date a spell the series don't
contain.

**"No documented event" doesn't mean false.** Nebraska's May-October 2022 spell, when it published two or three
days a week, appears in both providers' data. JHU's list of schedule changes just doesn't include it. The other
four unlabelled spells are long (95 to 372 days) with small rises in repeats, closer to a slow drift in the
schedule than to a short spell. Without labels we counted them all against the search, because that is how the
bar was written.

## What we take from it

A detector that passes on the data it was built against can still fail on the next provider. Ours did, and part
of the reason was something as small as where the series starts. That is the next check: plant the same spell in
series with different starting points and count how often it lands in the spell search, the default line, both,
or neither.

*Data: NYT covid-19-data (attribution, non-commercial; not redistributed here) and JHU CSSE COVID-19 (CC BY 4.0).
The detector is MIT-licensed. This is a statistics write-up, not public-health guidance.*
