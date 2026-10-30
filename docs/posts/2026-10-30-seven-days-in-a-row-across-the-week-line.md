---
title: Seven days in a row can hide across the Sunday-Monday line
date: 2026-10-30
---

The roster builder's seven-day flag looks inside one Monday-to-Sunday week. A
person who works Thursday to Sunday and then Monday to Wednesday has worked
seven days in a row, and no single week shows it. `--weeks` now joins a Sunday
shift to the next Monday and reports any run longer than six days
(`planStreaks` in `ventures/shift-roster-builder/calc.mjs`).

It is a report, not a limit: the search does not avoid such runs, and it knows
nothing about days worked before the first planned week. The test uses a
hand-built two-week plan, not a real payroll, and what a run of days costs
depends on your state's rule, which the tool does not model.
