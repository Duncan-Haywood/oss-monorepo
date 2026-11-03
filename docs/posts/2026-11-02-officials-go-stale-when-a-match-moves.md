---
title: "Why a league's referees must be assigned after the rainouts"
seo_title: "League scheduling: assign referees after rainouts, not before"
date: 2026-11-02
tags: [league-schedule-generator, scheduling, testing]
description: "Assigning officials before moving rained-out matches left a double-booked referee in 66 of 150 random leagues. Order matters."
---

A random-league test for the league schedule generator assigned officials to every match, then moved the matches from one rained-out night to the earliest night both teams were free. In 66 of 150 leagues, at least one official ended up on two matches at the same time slot. The move respects teams and courts but knows nothing about who is refereeing.

Assigning officials after the move fixes it: 0 of 150 leagues were invalid in that order, which is what the page and the command line do. The lesson for anyone scripting the library is to treat officials as the last step.

The leagues are synthetic, and the test only checks the hard rules (weekday, own team, one match per slot, cap), not fairness of the load. The check is `eval/fuzz-officials-moves.mjs`.
