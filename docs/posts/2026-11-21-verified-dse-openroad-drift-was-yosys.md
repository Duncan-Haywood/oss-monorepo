---
title: "Correction: the OpenROAD 'rebuild' never changed a byte; renaming a netlist moves routing 2%"
seo_title: "OpenROAD drift was Yosys: renamed netlists move routing 2%"
date: 2026-11-21
tags: [research, chip-design, verified-dse, open-source, eda, reproducibility]
description: "Same OpenROAD binary, Yosys 0.70 vs 0.71: both SKY130 tables reproduce exactly, and netlists differing only in names still move routing by 1.75%."
---

This morning's post, [Same netlist, same OpenROAD release, different
routing](2026-11-21-verified-dse-openroad-rebuild-drift.md), said that about
half of a tool upgrade's drift in the
[verified-dse](../../research/verified-dse/) chip-flow study came from a
rebuilt OpenROAD. That was wrong. The OpenROAD binary was the same in both
builds. The drift came from Yosys, through a netlist difference our check
could not see.

## Finding the builds

The study compared two builds of an open-source flow (Yosys, ABC and OpenROAD
on SkyWater's SKY130 cells, from the nixpkgs package set). Build A had Yosys
0.70 and build B had Yosys 0.71. Both reported "OpenROAD 26Q3". We had
not recorded their nix store paths, so this run recovered them from public
records: the nixpkgs-unstable release history on releases.nixos.org and the
Hydra build farm. Every Yosys 0.70 release from 12 to 17 November carried
one OpenROAD store path. The releases of 18 and 20 November carried two
others.

Then we compared what was inside them, using the binary cache's metadata.

- The OpenROAD executable has the same sha256 in all three.
- The three runtime closures (206 store paths each) are identical apart from
  one entry, Yosys 0.70 or 0.71. The OpenROAD wrapper only adds that Yosys to
  `PATH`.

So the "rebuild" was a new store hash, not new code. The
[closure diff](../../research/verified-dse/experiments/yosys_swap/closures.txt)
lists both.

## The swap test

If OpenROAD is the same, then changing only Yosys should reproduce both old
tables. We committed seven predictions
([`run.py`](../../research/verified-dse/experiments/yosys_swap/run.py)) before
running anything. Then we ran 90 sampled points through one OpenROAD
executable, once with each Yosys.

Six of the seven predictions held, the main one among them
([results](../../research/verified-dse/experiments/yosys_swap/results.txt)).

- **Both tables reproduce exactly.** Yosys 0.70 gave build A's numbers on 90
  of 90 points, and Yosys 0.71 gave build B's on 90 of 90. That covers all 15
  fields, from mapped area to routed power.
- **The "same netlist" points did not have the same netlist.** Yesterday's
  split relied on points where both Yosys versions gave the same mapped area
  and timing. On all 60 sampled points of that kind, the two netlists differ.
  58 of the 60 use exactly the same cells.
- **Renaming alone moves routing.** On 21 of the 60, the netlists are the same
  graph and differ only in instance names, net names and order. Every one of
  those 21 still routed differently, by a median 1.75% in area times delay.
  The difference starts at global placement.
- One prediction failed: we expected at least half of those points to be
  equal up to renaming, and it was 21 of 60. Most of the rest connect the same
  nets to a gate's inputs in a different order. A check written after we saw
  this, so not a prediction, puts 52 of the 60 in that class.

## What it means

The earlier advice stands in part: pin the store paths, not the release
names. Pinned this way, the flow reproduced every number exactly.

The new point is a noise floor. The placer is deterministic, but it is not
invariant to how a netlist is written down. Rename the nets or reorder the
instances, and the routed result moves by one or two percent. That applies
to any two netlists you compare, including two synthesis recipes on the same
build. An optimiser that ranks candidates on routed differences that small is
partly ranking the netlist's spelling.

Limits: 90 points out of 2,781, one corner, global-route estimates. Our graph
check (Weisfeiler-Lehman hashing) is a strong test of equal structure, not a
proof. We have also not yet found out which part of the rewrite (instance
order, names or pin order) the placer reacts to. That is the next experiment:
write one netlist several ways and measure the spread directly. The
[research log](../../research/verified-dse/LOG.md) has the full entry.
