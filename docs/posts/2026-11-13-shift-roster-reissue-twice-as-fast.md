---
title: "Reissuing a posted schedule twice as fast, with the same schedule quality"
seo_title: "Rebuilding a posted staff schedule after a call-out, faster"
date: 2026-11-13
tags: [shift-roster-builder, product, measurement]
description: "Exact solver first, local search second: 570 posted-schedule reissues after a call-out ran 2.2x faster with the same score, changes and premiums."
---

When someone calls out after the schedule is posted, [Shift Roster Builder](https://marisstella.app/shift-roster-builder/) rebuilds the rest of the week. Shifts that have already started stay where they are, and the posted shifts are kept wherever it can, so the fewest other people get moved. It then proves the new week is the best one possible under those rules.

Earlier today the tool's [call-out check](2026-11-13-shift-roster-which-tied-roster-holds-up.md) got faster by changing the order of two steps. It now runs the exact solver (whole-schedule column generation) first, and the slow local search that hunts for fewer open hours runs only if the solver can't prove the answer. That check reads only open hours. A posted reissue is different: the manager pins up whatever schedule comes back, so a different schedule is a different week on the wall, even if it is equally good. So the reissue stayed on the old order until someone measured what a manager would see.

## The measurement

There are five invented teams (a café, the café with a spare part-timer, a salon, a retail shop, a clinic), each with six seeded weeks. In every week, every person working a day from Tuesday to Sunday calls out for it at 5pm the evening before. That makes 570 reissues, each built both ways and priced against the posted week at one hour of pay per short-notice change, with the caller exempt.

| 570 reissues | old order | solver first |
|---|---|---|
| proven best | 570 | 570 |
| changes to other people | 1,069 | 1,069 |
| short-notice premiums | $19,163 | $19,163 |
| payroll | $1,731,325 | $1,731,325 |
| time | 72.2 s | 32.5 s |

Every case gave the same score, open hours, number of changes, premium and pay. On 33 of the 570, the two orders post different schedules. Those are ties: both are proven best, and they match on every count the tool shows a manager. The search has to return one of them either way.

So reissues now take the faster order by default. The retail template's reissues went from 11.6 s to 2.4 s in total, about 0.02 s each, and the café's from 21.7 s to 10.2 s.

## Not changed: fresh weeks

A fresh build is also faster this way: 8.6 s down to 2.7 s over 30 weeks, with the same score on every one. But it posts a different (tied) schedule on 6 of the 30, and the tool's guide pages quote specific example schedules. Switching fresh builds means re-deriving those pages first. That is now the next item on the list.

The script, the readings and the caveats are in the [README](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/shift-roster-builder#posted-reissues-column-generation-first-2026-11-13-later). The teams are invented, the timings come from one machine, and the equivalence is measured on these cases, not proven.
