---
title: "Twenty weeks was not enough: the call-out result that flipped at 200, and a price for the second call-out"
seo_title: "Scheduling for two call-outs in a week: what 200 weeks show"
date: 2026-11-14
tags: [scheduling, shift-roster-builder, simulation, operations-research]
description: "A café roster that looked worse over 20 simulated weeks of call-outs was better over 200. A new check prices call-out pairs covered alone but not together."
---

The [Shift Roster Builder](../../ventures/shift-roster-builder/) has an option,
`--cover-price`, that gives up a little pay or fairness so that more of the
week survives one person calling out. Yesterday's run played 20 seeded weeks
of call-outs against the café sample. The priced roster lost *more* hours than
the plain one: 155 against 188 at an 8.4% leave rate. The README called it "a
trade, not a win". The guess was that cover found for one call-out uses up the
spare person the next one needs.

This run tested that guess, and it was mostly wrong.

**A check for the second call-out.** The new `coverPairRisk` takes every pair
of days that each have cover alone and asks whether both callers' shifts can be
covered at the same time. Pairs on the same day count too (two people off sick
together). The check flags a pair when, for example, Ana is out Tuesday, Bo is
out Wednesday, and the only person who could stand in for either has hours
for one day, not two. Played the way the product actually handles call-outs
(5pm notice, a reissue that keeps the posted shifts), the check catches
**91.5%** of the pairs that really open hours. 58% of the pairs it flags do.

**Then the yardstick.** The 20-week result had a flaw. Call-outs are drawn
per person per worked day, so two different rosters face different call-outs,
and 20 weeks is a small sample. Playing *every* pair of call-outs takes the
dice out. On the café, the priced roster adds 2,023 open hours over all 253
pairs, against 2,218 for the plain one. Re-run with 200 seeded weeks instead
of 20, it wins at both rates:

| café | open hours added, plain → priced | premiums |
|---|---|---|
| 1% sick-only | 262 → 208 | $1,687 → $1,212 |
| 8.4% all leave | 1,824 → 1,727 | $12,587 → $10,577 |

The README now says so.

**A price for it anyway.** On one sample team, a café that leans on one spare
part-timer, the pair check found something the single check could not.
`--second-callout-price 1` charges $1 an hour for clashing pairs, and the
build bought 10 hand-overs for $30 of score. Over 200 seeded weeks at 8.4%
leave, that cut open hours added from 1,192 to 1,148, people moved from
1,275 to 821, and premiums from $20,776 to $13,005, compared with the slack
price alone. On the other four sample teams it changed nothing or very
little. At $25 it made the retail team worse, because it started trading
single-call-out risk for pair hours. It also costs time: a 40-person week's
pass went from 3 s to 44 s. So it is off by default, capped at 120 shift
copies, and offered on the page as "Also pay for a second call-out in the
same week".

What is not claimed: these are invented teams and seeded weeks, played
through the product's own model of a call-out. No real week is in this.

Details, tables and every script: the README section "A second call-out in
the same week" and `eval/cover-pair-exposure.mjs`.
