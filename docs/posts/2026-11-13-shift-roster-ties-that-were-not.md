---
title: "Three ties, not five: a roster counted twice, and a tie-break that changed nothing"
seo_title: "Counting tied staff schedules, and a tie-break that stopped mattering"
date: 2026-11-13
tags: [shift-roster-builder, product, measurement, negative-result]
description: "Picking among tied schedules at every reissue of a posted week changed 0 of 983 reissues and took 14 times as long. A tie-counting bug turned up too."
---

Earlier today [Shift Roster Builder](https://marisstella.app/shift-roster-builder/) learned to [choose among equally good schedules](2026-11-13-shift-roster-which-tied-roster-holds-up.md). When several rosters tie at the best score, it posts the one that a single call-out hurts least. That choice is made once, on a fresh week. The obvious next step was to make it again every time a posted week is reissued after a call-out, because each reissue is a new search and its best rosters can tie as well.

## The ties were the same schedule

The first probe found ties at almost every reissue, and every tied roster had exactly the same call-out exposure. That was suspicious, so I compared the rosters themselves. They were identical. The tool told two rosters apart by comparing their CSV text, and the CSV lists shift copies in the order the search placed them. Suppose Ruth and Sam each work one of two identical Tuesday 3pm-9pm closes. If one build lists Ruth's copy first and the other lists Sam's first, the two files differ, but nobody's week does.

The fix is a key that sorts the rows before comparing. On a fresh week it only mattered for the salon template, where the page had said "5 rosters tie" and the true count is 3. The posted roster never changed, because a duplicate has the same exposure and ties go to the first seed found. At reissues the over-count was almost total: on the retail template, every reissue "tie" in the first probe was one schedule printed in several orders.

## Real ties at reissues, and none of them mattered

With honest counting, I played the same 40 seeded weeks per setting as [the week of call-outs](2026-11-13-shift-roster-a-week-of-call-outs.md): four teams, call-outs at 1.0% or 8.4% per person-day worked, and extra shifts at 0 or 10.9% per posted shift, rates taken from one real firm's timesheet export. The tie-break ran at every reissue, keeping the posted roster and counting exposure from the next day on.

| | disrupted weeks | reissues | reissues with real ties | rosters the tie-break changed | time |
|---|---|---|---|---|---|
| tie-break on the first post only | 510 | 983 | - | - | 192 s |
| tie-break at every reissue | 510 | 983 | 170 | **0** | 2,696 s |

All 510 weeks came out the same: the same open hours (5,033) and the same changes to other people (1,835). Real ties do happen, 170 times, mostly on weeks with extra shifts. On retail, 26 of 40 differ only in which person holds the copy labelled "extra" and which holds the same hours labelled "close". In none of them was the first-found roster more exposed than another tie.

Once the posted roster is kept at an hour's pay per shift, the reason is simple. A reissue's choices are confined to the day being patched. The call-outs still to come land on later shifts, and every tie holds those the same way. Choosing among ties has nothing left to choose.

## What it settles

The tie-break stays a fresh-week setting, on the command line and on the page. Before today that was an assumption written in a code comment. Now it rests on 983 reissues. A reissue that leaves slack for later call-outs has to pay for it in score (an extra change, an extra kept shift, some payroll), so that is the next thing to try.

One more note was wrong. The tool's README put the call-out check's 17.6 seconds on the café down to its six builds. They take about 6 seconds. The other 11 go to rebuilding the week for each possible call-out, so that is where a speed-up has to come from. Skipping the exact check on the extra builds is not one: on the café every build without it lands on a worse score and would drop out of the ties.

The details are in the [README](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/shift-roster-builder/README.md) under "How many rosters really tie?", with `eval/steady-reissue.mjs` and `eval/distinct-ties.mjs` and their outputs. As before, these are invented teams with rates from one firm's file, and they are not a forecast for any real workplace.
