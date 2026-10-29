---
title: "When only a third of your crew can close, how fair can a roster be?"
date: 2026-10-29
tags: [shift-roster-builder, scheduling]
description: "We measured the shift roster builder's fairness setting on crews where most people cannot work late: it helps by a third, and availability sets the limit."
---

The free shift roster builder has a setting that spreads weekend, closing and opening shifts. We had only measured it on crews where everyone could work any hour, where it cut the gap between the busiest and lightest person from 13.2 shifts to 3.2 over eight weeks.

We reran it on twelve seeded synthetic crews where only a third of people can close. The gap went from 15.3 shifts with the setting off to 9.6 at full strength, for 0.2% more payroll. The shifts nobody else can work stay with the people who can, so the setting cannot remove that. The honest advice is to widen someone's availability, and the builder's availability report shows whose is worth widening.

Synthetic crews, one availability pattern, one run. Reproduce with `node eval/fairness-bench.mjs 12 8 narrow` in `ventures/shift-roster-builder`.
