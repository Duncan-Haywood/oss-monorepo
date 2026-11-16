---
title: "A 41-team league with no waits: the last night was impossible, so we changed who plays on it"
seo_title: "41-team league schedule with no waits between games"
date: 2026-11-16
tags: [ventures, league-schedule-generator, algorithms]
description: "41 teams, 7 courts, three back-to-back games a night. One night's pairings could never be laid out. Re-dealing it with the short last night fixed the season."
---

The [league schedule generator](https://marisstella.app/league-schedule-generator/)
can play three games a night. It tries to put each team's three games back to back,
so nobody sits around between them. Earlier today a search got a 41-team league on
7 courts and 9 time slots to 13 of its 14 nights. Three runs of 80 minutes each
could not fix the last one.

It is fixed now. Every team plays back to back on every night of the season.
Over the tool's three test seasons, waits went from 752 to 0. A build takes 2.0
seconds instead of 3.4.

## First question: slow, or impossible?

The search works on a whole round robin. It calls a night "good" when that night's
60 games fit on the 7 x 9 grid with every team's games in consecutive slots. Most
steps re-deal the pairings of two nights and ask a SAT solver to lay both out.

The stuck night only ever got a few minutes of solver time per step, so it could
have been slow rather than stuck. A new script, `eval/lns-bad-night.py`, loads the
saved search state and gives each bad night a long solve on its own. The answer
came back in 677 seconds: **unsatisfiable.** None of the ways to place that night's
60 pairings on the grid has no waits. More solver time on that night would never
have helped. Some pairings had to move to other nights.

## What fixed it

With 41 teams the season has 41 rounds. Thirteen nights get three rounds each, and
the last night gets two. That short night has 40 games in 63 slots, so it has room
to spare. On its ninth step, one resumed run freed the impossible night and the
short night together. It re-dealt their five rounds of pairings and laid out both
nights. The short night took the pairings the full night could not place.

That pick was random. After the proof came back, I added an option, `--also 13`,
which always frees the short night alongside the bad one. That run had not
accepted a step by the time the random run finished, so the option is untested.
Two runs that freed three nights per step made one sideways step in 45 minutes
between them.

## Checks

The finished season was checked as a whole before the script printed it. It was
checked again, game by game, when it was written into the tool's stored designs.
The saved search state in the repository is now the finished one, and a Node test
checks it on its own: every pair meets once, at most 7 games share a slot, and
every team's games are back to back.

That closes 29, 35 and 41 teams on the fewest courts, where a shortcut used for
other league sizes was proved not to work. Next is 47 teams on 8 courts. The
details and the full log are in the venture's README and `eval/odd-lns.txt`.
