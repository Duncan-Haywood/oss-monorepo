---
title: "Skipping the rebuilds a call-out doesn't need"
seo_title: "A faster call-out check for staff schedules"
date: 2026-11-13
tags: [shift-roster-builder, product, performance]
description: "The call-out check played every single call-out against every tied schedule, one rebuild each. Two exact short cuts and pruning cut 419 rebuilds to 243 with the same pick, and the check is now on the page."
---

This morning [Shift Roster Builder](https://marisstella.app/shift-roster-builder/) learned to [pick, among equally good schedules, the one a call-out hurts least](2026-11-13-shift-roster-which-tied-roster-holds-up.md). It does that by playing every possible single call-out against each tied schedule. For each one it rebuilds the rest of the week. On the sample café that took 30 seconds, so it stayed a command-line flag.

Most of those rebuilds were answering a question that had a quicker answer.

## When nobody needs a rebuild

The question each rebuild answers is "how many more hours go uncovered if this person is out that day?" Two cheap checks can prove the answer is zero:

- **Someone can take the shift outright.** If another person is free, under their hours cap and rested enough, and everyone else keeps their shifts, the week loses nothing. The tool already had this check: it is the "who can take it" list on the page.
- **A short chain of hand-overs covers it.** Bo takes the shift and gives up one of theirs, which Cy takes. Up to three hand-overs, with every rule checked at each step. Shifts that have already started are pinned to the person working them, so no chain can move one.

The point is that these are proofs, not guesses. A chain that covers the shift is a valid schedule with no extra open hours. A rebuild that covers as many hours as it can will find at least that. I checked this rather than trusting the reasoning: on five test teams times six tied schedules, all 570 call-out cases gave the same answer with the short cuts as with a full rebuild.

## Stopping early

The second saving comes from the comparison itself. The tool only needs to know which tied schedule is least exposed, not every schedule's exact score. Once a later schedule's running total reaches the best one found so far, it cannot win, so the check stops and reports it as "at least" that much. It also plays first the call-outs that cost the most on the schedules already checked, so a schedule that is going to lose usually hits the limit early.

## What it bought

| team | before | after | rebuilds |
|---|---|---|---|
| café | 30.1 s | 20.5 s | 138 to 101 |
| retail | 11.5 s | 8.7 s | 102 to 28 |
| clinic | 15.2 s | 6.8 s | 72 to 37 |
| salon | 3.3 s | 3.2 s | 80 to 50 |
| café with a spare part-timer | 6.6 s | 6.3 s | 27 to 27 |

Every team posts the same schedule as before. The short cuts never fire on the café. On that tight team nobody can take a called-out shift without a bigger reshuffle, which is the same finding as this morning's: the café has no slack. The café's saving comes from stopping early. Most of its remaining 20 seconds goes on building the six candidate schedules, each with its exact check, so building fewer candidates is the next thing to work on.

## On the page

There is now a setting under the options: **When several rosters tie at the best score**, then **Post the one a call-out hurts least**. It runs off the main thread with a progress line ("roster 2 of 6, call-out 14 of 23") and the Stop button. The result leads the notices: how many schedules tied, how exposed this one is against the others, and which call-outs would still leave hours open. It is off by default. A phone will be slower than these timings, and the steadier schedule tends to mean telling more people about a change when someone does call out, which is a trade the manager should choose to make.

The method, the case-by-case check and the timing script are in the [README](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/shift-roster-builder/README.md) ("A quicker call-out check") and `eval/steady-speed.mjs`.
