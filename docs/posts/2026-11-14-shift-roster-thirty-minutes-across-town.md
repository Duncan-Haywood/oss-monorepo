---
title: "Thirty minutes across town: the trip a two-shop roster never checked"
seo_title: "Scheduling staff across two locations: travel time between shifts"
date: 2026-11-14
tags: [shift-roster-builder, product, measurement]
description: "On made-up split-shift weeks, half the days someone worked at both shops left them 30 minutes for the trip. A travel rule fixes it, sometimes at a price."
---

This morning [Shift Roster Builder](https://marisstella.app/shift-roster-builder/) learned to plan [two shops from one staff list](2026-11-14-one-staff-list-for-two-shops.md). With one list, the weekly hour limit and the rest rule hold across both shops. That post ended with a caveat: nothing modelled the trip between them. With the default 10 hours of rest between shifts, that caveat never matters. Restaurants that run split shifts turn the rest rule down, though, and then it does.

## What the roster was quietly asking

I built a made-up pair of restaurants. Main runs lunch 11-3, a short afternoon 3-5 and dinner 5-10. Harbour, across town, runs lunch 11:30-2:30 and dinner 5:30-9:30. Everyone may work at either. Rest is 0 so split shifts are allowed, and nobody works more than 10 hours a day. The closest two shifts at different shops are 30 minutes apart: Harbour's lunch ends at 2:30 and Main's afternoon starts at 3.

Over 12 seeded weeks with seven people, the roster had someone at both shops on 109 person-days. On 52 of them, the gap between the shops was those 30 minutes. If the drive takes 45, each of those is a late arrival that the manager finds out about at 3:05. With eight people it was 34 of 102.

## The rule, and what it costs

`--travel 45` (or a field on the page) now says shifts at two different named sites must be at least 45 minutes apart, on top of the rest rule. `--travel "30; Main to Airport 60"` sets one pair of shops separately. The rule lives in the same hard-rule check that every part of the tool uses, so it holds in the search, in the exact check, in call-out covers and in reissues of a posted week. A shift it leaves open says why: "1 would have no time to travel from another site."

| team | travel rule | open hours over 12 weeks | days at both shops with a hop under 45 min |
|---|---|---|---|
| 7 people | off | 12 | 52 |
| 7 people | 45 min | 24 | 0 |
| 8 people | off | 0 | 34 |
| 8 people | 45 min | 0 | 0 |

With eight people the rule cost nothing. The same hours were covered by sending different people across, and payroll moved by $9 over 12 weeks. With seven it left 12 more hours open, in 5 of the 12 weeks. That is not the rule making things worse. Those 12 hours had only ever been covered on paper, by a trip nobody could make. Now the roster says so in advance, and the manager can call someone in or move a shift instead of finding out at 3:05.

## What this does not show

The shops, times and teams are invented, and no real two-site business's travel times have been read. There is one number per pair of shops, the same both ways and at every hour, so rush hour is not modelled. The trip is not paid. A travel allowance, or a different wage at each site, is the next thing to build. The script and its output are in the venture's `eval/` folder (`travel-between-sites.mjs`), and the README section "Travel time between sites" has the full table.

*Planning aid, not legal or employment advice.*
