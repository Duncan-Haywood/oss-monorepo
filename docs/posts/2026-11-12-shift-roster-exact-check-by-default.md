---
title: "The proof was faster than the guess, so now it always runs"
seo_title: "Exact staff-schedule optimisation on by default: better rosters, usually faster"
date: 2026-11-12
tags: [shift-roster-builder, product, optimisation, measurement]
description: "The roster builder's exact check now runs on every week, not only weeks of 14 shifts or fewer. On 40 test weeks it was never worse, better on 22, proven on 38, and faster above 60 shifts."
---

The [Shift Roster Builder](https://marisstella.app/shift-roster-builder/) builds a week's staff schedule in two layers. A quick search (simulated annealing, then a few repair passes) finds a good roster. An exact check (column generation) then tries to prove that no roster under the same rules covers more hours or costs less. If a better one exists, the check finds it.

Until today the exact check ran on its own only on weeks of 14 shift copies or fewer. That limit dates from when the check was a plain branch-and-bound tree, which took minutes on a real week. [Earlier today](2026-11-12-shift-roster-proof-first.md) the column generation started proving 40-person weeks in 6-12 seconds. That raised the obvious question: why is it still off by default?

## The measurement

`eval/auto-exact.mjs` builds each week twice, once with the old default and once with the check on, and prints time, open hours, pay, score and whether the result is proven. It ran on 36 seeded weeks from 6 to 60 people (18 to 245 shift copies) and on the page's four built-in templates.

| weeks | shift copies | score with the check | open hours | proven | time |
|---|---|---|---|---|---|
| 4 templates | 16-32 | better on the café, same on 3 | café 19 h to 15 h | 4 of 4 | within 0.07 s |
| 23 random | 18-55 | better on 10, same on 13 | 1 h fewer on 2 | 23 of 23 | -0.3 to +1.0 s each |
| 10 random | 62-149 | better on all 10 | 1-5 h fewer on 7 | 10 of 10 | 3.0-8.7 s faster each |
| 3 random | 162-245 | better on 1, same on 2 | same | 1 of 3 | 20 s time budget either way |

It was never worse on any of the 40 weeks. It was better on 22, left fewer hours open on 10 and was proven on 38. It was faster on most of the larger weeks because, once column generation has proved a roster, the quick search's slowest repair pass (about 10 seconds on 40 people) can be skipped.

The surprise was the café. That invented 7-person, 32-shift week is what the page's example button loads and what the CLI's `--example` runs. With the quick search it left 19 hours open. With the check on, it leaves 15 and reports the result as proven, in the same 2.6 seconds. Until today the demo showed a worse roster than the tool could build.

## What changed

- The exact check now runs by default on every week the builder accepts (up to its 400-shift cap). The page's selector is now On / Off, and `--no-prove` or `exact: false` turns it off.
- Under the default the exact cover repair also runs, so "default" and "on" give the same roster.
- The check stays off when you price open shifts (`--open-shift-hours`). It scores open hours only, so it would hand back the roster you set the weight to avoid (15 h across 5 open shifts instead of 19 h across 3).
- Fourteen guide pages quote figures from the quick search. Each now says so, and the ten built on the café give its new numbers, so a reader who opens the tool and sees 15 hours open instead of 19 knows why.

## What it does not show

These are seeded synthetic weeks and the built-in templates, measured on one cloud machine. On weeks under 60 shift copies the check can take up to a second longer, and the page runs it on the main thread, so a slow phone waits a bit longer. Two weeks over 150 copies were not proven: those stop on the same 20-second budget either way, and the builder reports how far from proven they are. When a time limit stops the search, the roster can depend on how fast the machine is. That was already true above 150 copies.

The bench and its output are in `ventures/shift-roster-builder/eval/auto-exact.mjs` and `eval/auto-exact.out.txt`.
