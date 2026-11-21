---
title: "OpenROAD ignores netlist order but not names: renaming moves routing 2%, a canonical form fixes it"
seo_title: "OpenROAD placement depends on instance names, not order"
date: 2026-11-21
tags: [research, chip-design, verified-dse, open-source, eda, reproducibility]
description: "Same Yosys, same OpenROAD, same circuit: shuffling a netlist changes nothing on 90 of 90 points, renaming moves routing on 90 of 90; a canonical form fixes it."
---

Earlier today we [corrected a finding](2026-11-21-verified-dse-openroad-drift-was-yosys.md)
in the [verified-dse](../../research/verified-dse/) chip-flow study. Two Yosys
builds wrote netlists that differed only in names and order, and OpenROAD
still routed them about 2% apart. That came out of comparing two tool
builds, so it could not say which of the two mattered. This run tested it
directly.

## The test

We took 90 points (a design plus a synthesis recipe) from the earlier sample.
Every tool stayed fixed: Yosys 0.71 and one OpenROAD 26Q3 executable, pinned
by nix store path, on SkyWater's SKY130 cells at the slow corner. For each
point we kept Yosys's mapped netlist and wrote it again seven ways. No rewrite
changes a cell, a connection or a port:

- the instances in two random orders;
- the wire declarations in a random order;
- every internal net and instance given a random name, with the order kept;
- a canonical form of the original, of a shuffled copy and of a renamed copy.

Every rewrite was checked to be the same circuit before it ran. All 720 runs
went through the same place-and-route script. We wrote the predictions down
and pushed them before the flow started.

## What happened

| Rewrite | Routed result changed | Median change |
|---|---|---|
| instance order shuffled | 0 of 90 | 0 |
| wire declarations shuffled | 0 of 90 | 0 |
| every name randomised | 90 of 90 | 2.1% (max 12.5%) |
| canonical form of original, shuffled or renamed copy | identical to each other on 90 of 90 | |

Our main prediction was that order would matter. It was wrong. The order of
lines in the file makes no difference at all: every field of every result is
the same. Names make all the difference. A random renaming moves the routed
area x delay score on every point, starting at global placement. The DEF
file OpenROAD writes lists the cells in name order whether or not the input
was shuffled, which fits a reader that sorts by name and throws the file
order away.

Because the effect comes from names, a fix is easy. The canonical form names
every cell and net from the circuit's structure alone, using colour refinement
of the cell/net graph, so any naming and any order of the same circuit give
the same file. On all 90 points the three canonical copies were byte-identical,
and so were their routed results. Refinement left no tied cells on any of the
90 netlists, so the tie-breaking step never had to run.

## Why it matters

The noise is the same size as the differences people optimise for. On the 22
designs sampled, 15.8% of pairs of synthesis recipes for the same design differ
by less than renaming one of them does. On one design (rng8r) the figure is 49%.
A search that ranks netlists on routed numbers is, on those pairs, ranking
names.

Canonical naming does not make a result better. It picks one draw from the
same noise. What it does is make the result a function of the circuit, so two
candidates are compared on their structure and a rerun gives the same answer.
The renamer is about a hundred lines of standard-library Python
(`canonical()` in
[`experiments/netlist_noise/run.py`](../../research/verified-dse/experiments/netlist_noise/run.py))
and takes about half a second on a 3,000-cell netlist.

## Limits

One OpenROAD build, one corner, global-route estimates, and one random renaming
per point. We read the mechanism off OpenROAD's output, not its source. Swapping
inputs on symmetric gates, which the earlier run also saw, was not tested here.

Next we will check whether the study's main result, that a cheap ladder of
fidelity rungs beats random routed search, still holds when routed numbers
carry less naming noise. The numbers are in
[`results.txt`](../../research/verified-dse/experiments/netlist_noise/results.txt)
and the full entry is in the project's
[research log](../../research/verified-dse/LOG.md).
