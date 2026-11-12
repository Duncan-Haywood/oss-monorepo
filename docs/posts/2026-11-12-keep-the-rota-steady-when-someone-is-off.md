---
title: "One day off, four people moved: keeping a rota steady"
seo_title: "Keep a consistent work schedule when someone takes time off"
date: 2026-11-12
tags: [shift-roster-builder, product, measurement]
description: "A rebuilt roster moves people who weren't off. Scoring each usual shift kept cut week-to-week changes 56-72% on five invented teams, with the same open hours and pay within 0.2%."
---

The [shift roster builder](https://marisstella.app/shift-roster-builder/) can plan a month: four weeks in a row, with each person's dated days off landing in the right week. Earlier today it learned to reuse a week instead of rebuilding it when nothing had changed. The obvious next question was how often nothing changes once people take time off. The answer was "rarely". Looking at why turned up a worse problem.

## The rebuild moves people who weren't off

Take the builder's invented café: seven people, 32 shifts a week. Ana is off on the Tuesday of week 3 and Ben on the Friday. The builder's exact check proves its week-3 roster is the best possible. It also changes 15 person-shifts from the usual week. One of those is a swap of Dev's and Gus's weekend opens that neither day off needed. In week 4, with nobody off, it changes 15 back.

Nothing is wrong with the arithmetic. Many rosters cover the same hours for the same money, and the search has no reason to prefer the one that looks like last week. Staff do have a reason.

## What changed

There's a new setting, "Keep people on their usual shifts" (`--keep-shifts 0.1` on the command line). The planner first builds the usual week with the dated days off left out. Each planned week then earns a small bonus, a tenth of the person's wage, for every hour someone works one of their usual shifts. An open shift costs far more than any bonus, so the setting can't leave a shift open to keep someone in place. The bonus goes through the same code path as the existing `prefer:` hours, so the exact check's bounds account for it. A test compares the exact search with brute force on 24 tiny weeks.

The first version kept people on *last week's* shifts. That carried week 3's reshuffle into week 4, so it now keeps the usual week instead.

## What it measured

Five invented teams, four weeks each, days off scattered at random, five draws per rate, every week built with the exact check on:

| days off | setting | changes week to week | forced by the time off | open hours | payroll |
|---|---|---|---|---|---|
| 2% | plain | 617 | 25 | 785 | $286,537 |
| 2% | keep | 170 | 26 | 785 | $286,423 |
| 4% | plain | 1,022 | 67 | 952 | $283,733 |
| 4% | keep | 378 | 64 | 952 | $283,542 |
| 8% | plain | 1,226 | 106 | 1,147 | $280,042 |
| 8% | keep | 536 | 107 | 1,147 | $279,496 |

The plain rebuild moved 12 to 25 times more shifts than the time off forced. Keeping usual shifts cut that by 56-72%. Open hours were identical every time and payroll moved by less than 0.2%. The price is a plan that takes 20-42% longer to build.

Two limits. The leave rates are a sweep, not real leave records: the public absence datasets weren't reachable from where this ran. And whether staff notice the difference is unmeasured.

There's a guide with the café example: [keep a consistent schedule when someone is off](https://marisstella.app/shift-roster-builder/keep-a-consistent-schedule-when-someone-is-off.html).
