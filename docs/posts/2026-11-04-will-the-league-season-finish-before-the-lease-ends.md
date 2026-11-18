---
title: "Will the league season finish before the lease ends?"
date: 2026-11-04
description: "The multi-division league scheduler now checks a season against a hard end date and says which divisions run over and by how many matches."
tags: [league-schedule-generator, scheduling, sports]
---

# Will the league season finish before the lease ends?

School gyms close for the holidays and park permits expire. A league organiser
with three divisions on four courts needs to know early whether the last game
lands before that date.

`node divisions.mjs spec.json --deadline 2026-12-15` now answers it. It lists
each division's last game, the days spare or late, and how many matches fall
after the date. It exits 0 when the season fits and 2 when it does not, so a
script can gate on it.

On the made-up example league (U10, U12 and an adult double round robin) the
season ends 2026-11-10, so a 2026-11-20 deadline leaves 10 days spare. A
deadline of 2026-10-20 reports every division running over.

This is tested on that made-up league only. It checks dates, not whether a
facility will actually grant extra nights. Source and tests:
`ventures/league-schedule-generator/`.
