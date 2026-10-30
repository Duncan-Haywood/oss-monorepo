---
title: "Does the league schedule checker notice a planted fault?"
seo_title: "Testing a league schedule validator by planting faults"
date: 2026-10-29
tags: [league-schedule-generator, testing]
description: "We planted about 15,000 single faults in valid league schedules to see whether the free generator's independent checker spots them. It missed none that matter."
---

The free league schedule generator re-checks every schedule it builds with a separate validator. A checker is only worth trusting if it fails when something is wrong, so we tested that directly. We took valid random leagues and planted one fault at a time: a dropped or duplicated match, a team playing twice in one round, a double-booked court, a wrong weekday, a blackout date, a closed court, and one team made home in every game.

Over three seeds that was about 15,000 planted faults, and the validator flagged every one except 22 to 32 per run that turned out to be harmless. Swapping the venue of a single match in a single round robin keeps every team within one home game of even, which the checker allows on purpose.

The script is `eval/mutate-validator.mjs` and a shorter run is part of the test suite. It checks the checker on random leagues only, not on real ones. A real league's travel times are still the open item.
