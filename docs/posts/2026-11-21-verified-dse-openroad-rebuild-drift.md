---
title: "Same netlist, same OpenROAD release, different routing: half of a tool upgrade's drift is the rebuild"
seo_title: "OpenROAD rebuild drift on identical SKY130 netlists"
date: 2026-11-21
tags: [research, chip-design, verified-dse, open-source, eda, reproducibility]
description: "On 374 SKY130 points with identical mapped netlists, a rebuilt OpenROAD 26Q3 changed every routed result, about half of a Yosys upgrade's drift."
---

> **Correction (later the same day):** the OpenROAD binary in both builds turned out to be byte-identical, and the
> "same netlist" points did not have the same netlist. The drift described below is Yosys's, from netlists that differ only
> in names, order or pin assignment. See [the follow-up](2026-11-21-verified-dse-openroad-drift-was-yosys.md).

The [verified-dse](../../research/verified-dse/) programme asks how much of an
open-source chip design search (Yosys, ABC and OpenROAD on SKY130) can be
skipped by trusting cheap estimates.
[Yesterday's run](2026-11-20-verified-dse-stale-recipe-after-yosys-upgrade.md)
compared two builds of the same flow on 27 designs. Build A was Yosys 0.70
with OpenROAD 26Q3. Build B was Yosys 0.71 with OpenROAD 26Q3 as nixpkgs
rebuilt it a few days later. The search rule's edge over random routing held
under both builds. A synthesis recipe tuned on one build did not: carried to
the other, it had 14% regret.

That left an open question. Two things changed between the builds, so which
one moved the results?

## A natural experiment already in the tables

We could not fetch a third build to change one tool at a time. But the two
tables already contained a test. On some points, both Yosys versions wrote the
same mapped netlist from the same pass sequence. There were 374 such points
out of 2,781 that ran in both builds. On those points OpenROAD got the same
input, so any difference after that comes from the OpenROAD build alone. An
earlier control showed that a fixed build gives the same results every time,
so the difference is not noise.

We wrote down seven predictions and committed them
([`analyse159.py`](../../research/verified-dse/experiments/tool_build/analyse159.py))
before running anything.

## What we found

All seven held
([results](../../research/verified-dse/experiments/tool_build/results159.txt)).

- **On the same netlist, the rebuilt OpenROAD changed the routed result on all
  374 points.** The median change in routed area times delay was 1.9%.
- **The difference starts at global placement.** Global-placement slack was
  identical on only 8 of the 374 points.
- **Within a design, that is about half of the drift.** On 18 designs with
  enough points of both kinds, same-netlist points drifted 54% as much as
  points where both tools changed (95% interval 45% to 63%). They drifted less
  on all 18.
- **It reshuffles the ranking but costs little.** Among same-netlist points
  the routed order agrees at Kendall tau-b 0.68. Still, the best sequence
  carried across builds lost only 0.79% on average, because those points sit
  close together.

## What it means

Both builds report the same version, "OpenROAD 26Q3". Rebuilding it, which
can pick up a new compiler or library, was enough to move every routed number
by about 2%. Then the Yosys change adds the larger part: new netlists whose
routed costs spread further. That spread is where yesterday's 14%
recipe-transfer regret comes from.

The practical advice: if you want a routed table to reproduce, pin the whole
tool closure, for example the nix store paths, not the release names. Treat
differences of a couple of percent between builds as noise.

The caveats: "same netlist" is a proxy here (equal mapped area and equal
timing, since no netlists were kept). Same-netlist points are not a random
sample (none of the dividers have them). We also have not found out which
part of the rebuild moves placement. The
[research log](../../research/verified-dse/LOG.md) has the full entry.
