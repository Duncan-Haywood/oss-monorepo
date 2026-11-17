---
title: "Two shops, one staff list: what pooling people is worth"
seo_title: "Scheduling staff across two locations from one list"
date: 2026-11-14
tags: [shift-roster-builder, product, measurement]
description: "Shift Roster Builder plans several shops from one staff list. On 40 made-up weeks, letting people work at both shops left 55% fewer hours open."
---

Plenty of small businesses run two places: a café and a kiosk, a salon and its second chair across town, a restaurant and a food truck. Until today [Shift Roster Builder](https://marisstella.app/shift-roster-builder/) planned them one at a time. Its sales forecast could already split a Square or Toast export by location, but the roster itself took one staff list per run. So someone who works at both shops had to be split by hand, and nothing stopped the two plans from booking them for 50 hours between them.

## What it does now

Add `site: Harbour` to a shift and `sites: Main | Harbour` to a person. A person with no `sites:` cell can work anywhere. One build then plans every shop at once. The weekly hour limit, the rest rule, days in a row and no double-booking all hold across the shops, and nobody is offered a shift at a shop their row does not list.

The report adds a **By site** table: shifts, hours, covered and open hours, payroll and headcount per shop, plus who works at more than one and how many hours at each. Overtime is earned on the week, not at one shop, so each person's pay is shared out by their hours at each site. The shop totals add back to the roster total.

The sales forecast now tags every shift it writes with its site. That means one till export can become one roster: forecast each shop, list everyone once, build.

## What pooling buys

We tested it on 40 seeded, made-up weeks. "Main" is open seven days with two openers and two closers (224 hours). "Harbour" is smaller: one person Monday to Thursday and two Friday to Sunday, 11 to 7 (80 hours). Main has seven people and Harbour three, each with one to three random days off, a weekly cap of 24 to 40 hours and a wage of $15 to $22. Every plan used the same weeks and the same engine:

| plan | hours left open (40 weeks) | payroll |
|---|---|---|
| each shop separately | 1,040 | $204,560 |
| one build, a quarter of each team can work at both | 728 | $210,184 |
| one build, half can | 608 | $212,424 |
| one build, everyone can | 464 | $215,144 |

When nobody may cross over, the joint build leaves exactly the same hours open as the two separate builds, on every one of the 40 weeks. That is the check that the site rule really keeps the two teams apart. Once people may cross over, pooling never left more hours open. Letting a quarter of each team float removed 30% of the open hours, and letting everyone float removed 55%. Payroll rises because more of the week gets covered, not because any hour costs more.

The first few floaters do most of the work. Going from nobody to a quarter of the team saved 312 hours. Going from half to everyone saved 144 more. So you don't need everyone trained for both shops. Two or three people who can float carry most of the benefit.

## What it does not do yet

These are invented teams. The tool has not yet read a real two-shop staff list or a real multi-site till export. Travel time between shops is not modelled either. The rest rule, 10 hours by default, already keeps any two shifts of one person apart, so travel only matters if you set rest below the trip. Each shop has the same wages for now, with no per-site rate and no travel allowance.

The code and the measurement are in the [repository](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/shift-roster-builder) (`eval/shared-staff-sites.mjs`). The tool runs in your browser and nothing is uploaded.
