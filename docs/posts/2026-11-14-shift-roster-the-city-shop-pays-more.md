---
title: "The city shop pays more: pricing a higher minimum wage into a two-shop roster"
seo_title: "Scheduling staff across locations with different minimum wages"
date: 2026-11-14
tags: [shift-roster-builder, product, measurement]
description: "A roster that knows only each person's own wage understated payroll by about 5% on made-up weeks with a Seattle-rate shop. Pricing the floor cut 2.2%."
---

[Shift Roster Builder](https://marisstella.app/shift-roster-builder/) can now plan [two shops from one staff list](2026-11-14-one-staff-list-for-two-shops.md), keep people's shifts at different shops [far enough apart for the drive](2026-11-14-shift-roster-thirty-minutes-across-town.md), and [pay that drive](2026-11-14-shift-roster-the-drive-is-on-the-clock.md). Until today it still priced every hour at the person's own wage, wherever they worked it.

That is wrong for a lot of real businesses. In Washington the 2026 state minimum wage is $17.13 an hour and Seattle's is $21.30 ([Washington L&I](https://lni.wa.gov/workers-rights/wages/minimum-wage/local-minimum-wage-rates)). A café with one shop in Seattle and one outside it pays an $18 barista $21.30 for every Seattle hour. Airports, malls and hard-to-staff locations often carry a premium of their own.

## What the tool does now

`--site-wage "City min 21.30"` on the command line, or the "Wages by site" field on the page, sets a site's pay. `+2` means two dollars an hour above the person's own wage, `+10%` a percentage, `min 21.30` a floor, and parts combine. The search, the exact check and the call-out cover finder all price it.

Overtime needed care. When someone works at two rates in a week, US federal rules pay overtime on the weighted average of the week's pay, the "regular rate" ([29 CFR 778.115](https://www.ecfr.gov/current/title-29/subtitle-B/chapter-V/subchapter-B/part-778/subpart-C/section-778.115)). Thirty hours at $18 and twenty at $20 is $940 for 50 hours. That makes the regular rate $18.80, so the ten overtime hours owe $9.40 each on top: $1,034 in all, against $990 if every hour were $18. The tool now computes it that way.

The optimizer's proofs needed care too. Its exact check proves that no better roster exists by keeping lower bounds on what any finished roster could cost. With one wage per person, adding a shift never lowers the overtime premium on hours already worked. With mixed rates it can, because a cheap shift drags the average down. So the per-shift bound now subtracts the most that drag could take off. A test enumerates every possible roster for six tiny random weeks and checks that none beats a roster the exact check proved.

## What it changes, on made-up weeks

I built 40 seeded weeks: a seven-day "City" shop at the $21.30 floor and a smaller "Suburb" shop at the state floor, ten people with base wages from $17.13 to $23.13. For each week I compared two rosters. One was built as before, then costed with the city floor paid. The other was built knowing the floor.

- **The old roster's own total was about 5.4% short.** Over 40 weeks it said $234,472, and with the floor paid it cost $247,933. A manager would find that gap on the first payroll run, not when posting the schedule.
- **Knowing the floor saved 2.2%** ($5,531 over 40 weeks) when everyone could work at both shops. It was cheaper in all 40 weeks, mostly because it sent the people already paid near $21.30 to the city shop and kept the $17 people in the suburb. With only half the team able to work at both, it saved 0.65%. That run was cheaper in 35 weeks, the same in 4, and $6.64 dearer in one, where the search also balances hours between people.
- **No week left an hour more open.**

The full numbers are in [`eval/site-wages.out.txt`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/shift-roster-builder/eval/site-wages.out.txt). The weeks and wages are invented, and only the two minimum wages are real.

## What it does not do yet

A rule covers everyone at a site. A person's own negotiated rate at one shop is the next step. Shift differentials and split-shift premiums aren't folded into the regular rate yet. And it is a planning aid, not payroll or legal advice: which minimum applies to whom depends on the facts and the place.
