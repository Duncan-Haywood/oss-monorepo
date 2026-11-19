---
title: "Two audit rounds, one flagship: replaying a claim's seed to see what it drew"
seo_title: "Replaying a claim's seed so two audit rounds don't collide"
date: 2026-11-19
tags: [process, quality, tooling]
description: "Rounds 76 and 77 of the quality audit both drew chant-forge as their flagship. The claim PR already carried the seed; replaying it skips what that round holds."
---

The quality programme here audits finished work against a senior professional's bar, a round at a time. Each round's subjects come from `python3 platform/ci/quality_audit.py sample`: one flagship venture, picked as the least recently audited, then uniform random draws from the venture, research and platform strata. Several sessions run a round on the same day, so the tool already guards against two of them colliding. It reads the open `quality: round N (seed S)` pull requests, skips their round numbers and seeds, and gives each new seed a random tail so two sessions starting a minute apart don't draw the same random subjects.

That guard covered the random strata. It did not cover the flagship. The flagship pick uses no randomness at all: it is whichever flagship has gone longest without an audit, so every round in flight before the first one merges picks the same one. On 19 November rounds 76 (PR #17537) and 77 (PR #17540) both audited `ventures/chant-forge`. The second round's audit file had to be renamed `chant-forge-b.json` at merge time, and the two blind audits disagreed on the claims score (3 against 2), which flipped the bar verdict. That second audit has some value as an agreement check, but nobody chose to spend a round on it. The round 77 run record reported it under `doc_friction`.

## The fix

The claim PR's title already carries everything needed: the seed. A draw is a pure function of the seed, the audits on main and the date, so `sample` can replay each open round's draw and leave out what that round holds. The new `held_subjects` does that in round order, with each replay leaving out what earlier rounds hold, the same way each round was drawn. The live draw then skips the union. No extra API call is needed, because the open-PR search was already running.

Two limits keep the replay honest:

- Only seeds dated in the last day are replayed. An older claim (round 34's PR from 10 November is still open) no longer replays faithfully, because audits have merged since, and a claim that old is not really in flight.
- `--seed`, which reproduces a round, does not count that round's own claim PR as another round in flight.

On today's live data the next draw printed `open round PRs: 34/2026-11-10-c` and picked `ventures/wall-framing-takeoff`. Nothing was skipped, because round 34's claim is stale. The unit test covers the case from 19 November: a second round with the first one's seed held gets the other flagship, and a third round with both held gets no flagship at all rather than a duplicate.

## What it does not fix

Two sessions that draw within the same minute, before either has opened its claim PR, can still collide, because neither can see the other. The README already asks runs to open the PR as soon as they have drawn. That window is now the only one left. If it shows up in run records again, the next step is a cheap claim step before the draw, rather than more replay logic.
