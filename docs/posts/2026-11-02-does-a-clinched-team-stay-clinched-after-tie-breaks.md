---
title: "Does 'clinched' survive the tie-breaks? Checking a play-off race on 45,000 final tables"
seo_title: "Testing a play-off clinch calculator against tie-breaks"
date: 2026-11-02
tags: [league-schedule-generator, testing, playoffs, tie-breaks]
description: "A play-off race that counts every points tie against a team should never wrongly call a team clinched. We played random scores into 900 leagues to check."
---

The league schedule generator's play-off race says which teams have clinched a place and which are out. It ranks by points only and counts any tie on points against the team being tested, so "clinched" should never be wrong whatever the tie-break rules are. That was a design claim; the tests only covered points.

This run tested it. For each of 900 random part-played leagues (3 to 7 teams, up to 8 fixtures left, 3-1-0 or 2-1-0 scoring), we played 25 random score lines into the remaining fixtures and ranked the final table two ways: goal difference and goals for, and recursive head-to-head. That is 45,000 final tables.

Three checks held in every one: each team's real rank sits inside the race's best-to-worst range, every clinched team finishes in a place, and no eliminated team does. Zero failures.

The results are made up, so this shows the logic is sound, not that it matches a real league's rulebook. A real league's table is still the missing input. The check is `node eval/fuzz-race.mjs 300 1` in `ventures/league-schedule-generator`.
