---
title: "Why the league scheduler now shows who has the hard run-in"
date: 2026-11-03
---

Two teams on 12 points can face very different finishes: one still plays the
top three, the other the bottom three. The multi-division league scheduler
now prints that. `node divisions.mjs spec.json --results results.txt --remaining`
lists, per division, each team's games left and the average points per game of
the opponents it has yet to face, hardest first.

It is informational, not a forecast, and was tested only on the made-up example
league. A real league's results would show whether the number matches what
coaches feel. The code is MIT licensed in `ventures/league-schedule-generator/`.
