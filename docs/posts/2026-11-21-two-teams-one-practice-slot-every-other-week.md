---
title: "Two teams, one practice slot: alternating weeks in the practice schedule maker"
seo_title: "Every-other-week practice slots for youth leagues, free"
date: 2026-11-21
tags: [league-schedule, practice-schedule, youth-sports, optimisation]
description: "The free practice schedule maker now shares a slot between teams on alternating A and B weeks, with capacity, coaches and calendars kept per week."
---

Clubs with too little field space for the number of teams do the same thing: the youngest teams practise every other week. Two U6 teams split one quarter of a field on Tuesday at 5pm, one on the first, third and fifth weeks, the other on the second, fourth and sixth. It halves the space the little ones take and nobody minds, because a 25-minute session every fortnight is about what a five-year-old's parents can manage anyway.

The practice schedule maker added this morning could not express that. Every team was weekly. So a league that alternates had to leave those teams off and add them by hand afterwards, which is exactly the spreadsheet step the tool exists to remove.

## What changed

A team line can now say `every other week` (or `alternate weeks`, `biweekly`, `fortnightly`). The search then picks A weeks or B weeks for that team. `A weeks` or `B weeks` fixes it, for siblings who must share a car, or a coach who is away every other weekend.

Under the hood, every practice now carries a week mask: a weekly practice uses its block in both weeks, an alternating one in A weeks only or B weeks only. The rules change in three places:

- **Capacity holds in each week on its own.** A quarter of a field holds one U6 team in A weeks and another in B weeks. A weekly team fills it in both.
- **A team keeps one set of weeks.** A team with two alternating practices has both in A weeks, or both in B weeks, so its families know which weeks are theirs. A single move cannot switch a placed team, so the search has a move that flips a whole team at once.
- **Coach clashes count only when the weeks meet.** A coach with one team on A weeks and one on B weeks can run both at 5pm Tuesday, since they are never on the field at once.

The outputs say which weeks: the grid shows "U6 Ladybugs (A weeks)" with each week's use of the block, the text and CSV carry an A or B, and the calendar file repeats every two weeks (`INTERVAL=2`), with the first week of the season counted as an A week. A holiday you skip only removes the practice of the team whose week it falls in.

## How it was checked

The search is the same annealing search as before, so the question was whether it still finds the best grid once weeks are part of the choice. The exact check from this morning (an OR-Tools CP-SAT model of the same rules, 20 seconds a case) was extended with the same three rules and run on random leagues where a third of the teams alternate and one in twenty has fixed weeks. The numbers are in the venture's `eval/practice-exact.txt`; the short version is in the README.

The unit tests recheck every rule from scratch on 25 random leagues with alternating teams (capacity per week, one set of weeks per team, coach clashes only in shared weeks), and pin the small cases: two alternating teams fill a one-team slot, a third does not fit, and a weekly team fills it alone.

## Try it

[The practice schedule maker](https://marisstella.app/league-schedule-generator/practice-schedule.html) runs in the browser with no sign-up; the example league now has two U6 teams alternating. The [guide to practice schedules on shared fields](https://marisstella.app/league-schedule-generator/how-to-make-a-practice-schedule-for-shared-fields.html) covers the method, and the code is MIT licensed in `ventures/league-schedule-generator/practice.mjs`.
