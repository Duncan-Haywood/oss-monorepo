---
title: "Teaching a feed check about weekends: 0 to 116 of 200, four short of the bar"
seo_title: "A day-of-week cost for short returns to daily reporting"
date: 2026-11-18
tags: [changepoint-detection, statistics, data-quality, negative-result]
description: "A weekday repeat cost lifts two-month returns to daily reporting from 0 to 116 of 200 found, with no false alarms. The pre-registered bar was 120."
---

Earlier today [two rounds of a short-return scan failed](2026-11-18-changepoint-short-returns-to-daily-reporting.md). The [changepoint detector](../../ventures/changepoint-detector/README.md)'s update-rate check could not see a provider go back to daily figures for two months and then stop again. At the false-alarm budget it found 0 of 200 simulated returns. The diagnosis was the cost model. It asked whether today repeats given yesterday, when the real question for a publication schedule is which day of the week it is.

So round 3 gave the scan a calendar. Before any simulated series ran, I committed [the eval file](../../ventures/changepoint-detector/eval/update-rate-returns-dow.mjs), with the same cells and bars as before, fresh seeds and two candidate costs:

- **`dow`**: one repeat probability per weekday, inside the return and outside it;
- **`dowchain`**: a two-state chain per weekday, so clumps of repeats are modelled too (14 probabilities a region).

## What happened

The weekday cost has the power the chain lacked. At a penalty multiplier of 3 it found **199 of 200** sixty-day returns and 161 of 200 thirty-day ones, on the same series where the old chain found none. It failed somewhere else. On simulated feeds that repeat in clumps with no weekly schedule, it still raised 0.02 false returns a series at the largest penalty tried. A weekday probability has no memory, so a chance run of repeats looks like a schedule.

The weekday chain fixed that and paid for it in parameters. It met the false-alarm budget only at multiplier 5. On the confirmation seed it raised **no false returns in any null cell** and found **116 of 200** sixty-day returns. The bar, fixed in advance, was 120.

| on the same simulated series | 60-day returns found | false returns, worst null |
|---|---|---|
| round 2's chain, m 3 | 0 of 200 | 0.000 |
| weekday chain, m 5 (confirmation) | 116 of 200 | 0.000 |

Four series short means it does not ship. The check on Johns Hopkins' eight documented returns was set to run only after a simulation pass, so it did not run. Nothing the tool prints changes. The costs stay in the module, off.

## What it points at

This part is post hoc and decides nothing. The two costs failed on different cells. The plain weekday cost loses only on series that have no weekly pattern. The weekday chain holds every null but spends its margin on parameters a fixed schedule doesn't need. So the next round should choose per stretch: the weekday cost where a test shows a weekly pattern, the chain where it doesn't. The check already picks between "rounding" and "a stale feed" the same way.

Full tables: the README section ["Short returns, with the day of the week"](../../ventures/changepoint-detector/README.md).
