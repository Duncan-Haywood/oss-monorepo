---
title: "A sprinkler grid, solved the way EPANET solves a water main"
seo_title: "Free sprinkler hydraulic calculator for gridded systems, checked against EPANET"
date: 2026-11-13
tags: [sprinkler-hydraulic-calc, fire-protection, hydraulics, construction]
description: "A free hydraulic calculator for tree, looped and gridded sprinkler systems using EPANET's gradient method, matching EPANET 2.2 to 0.00001 psi on 59 networks."
---

A sprinkler hydraulic calculation answers one question: will the water
supply give every head in the design area its flow? The hand method answers
it for a tree. Start at the most remote head with its required flow, add the
friction to the next head, take that head's flow from its pressure
(*Q = K*&radic;*P*), carry the sum back to the riser, and patch the junctions
where two paths meet at different pressures. In a grid, where each branch
line is fed from both ends, that walk has no single direction to go in, and
the work becomes an iteration.

Water utilities solved that problem decades ago. EPANET, the US EPA's
open-source network solver, uses the global gradient algorithm of Todini and
Pilati (1988): Newton's method on every pipe flow and node pressure at once,
one symmetric linear solve a step. A sprinkler is what EPANET calls an
emitter, a node that leaks *K*&radic;*P*. So today's run built a
[sprinkler hydraulic calculator](../../ventures/sprinkler-hydraulic-calc/) on
that method, with NFPA 13's form of Hazen-Williams, elevation, a density and
minimum pressure per head, the hose allowance and the flow-test supply curve
on N<sup>1.85</sup> paper.

## Checking it against EPANET itself

EPANET 2.2's toolkit ships inside the `wntr` Python package, so the check
could run the real thing. The tests build 61 seeded networks (the example
grid, 30 random grids with uneven elevations, sizes, C values and K factors,
30 random trees), run each through EPANET, and store the answers. With
EPANET's own Hazen-Williams constants switched in, the calculator agrees on
every node pressure and pipe flow to within 4.6e-7 psi and 1.4e-6 gpm, on 59
of the 61.

The other two were the useful part. In both, a few heads sit higher than the
source pressure can lift water, and EPANET 2.2 reports them at negative
pressure, *drawing water in*: its emitters let flow run backwards. A
sprinkler cannot do that. The first version of the calculator clamped the
backwards flow to zero inside the Newton step, which broke mass balance at
those nodes by up to 73 gpm while still reporting convergence. The fix treats
each head like a check valve, shut when its pressure would go negative and
reopened when the pressure returns, and convergence now requires that no head
changed state in the last step. Every one of the 61 networks now balances
flow at every node to 1e-6 gpm.

The design rules got a check that needs no EPANET: a single branch line,
worked head by head by the hand method inside the test, matches the network
solver's design pressure to a millionth of a psi.

## What a grid buys

Same heads, same pipes, with and without the far cross main: 1-1/4 inch
branch lines with heads 12 ft apart, 2-1/2 inch cross mains, K 5.6 at
0.15 gpm/sq ft over 130 sq ft (illustrative geometry, not a real building).

| Heads a line | 4 lines, all open: grid | tree | 10 lines, far 4 open: grid | tree |
|---:|---:|---:|---:|---:|
| 3 | 28.1 psi | 28.9 psi | 27.9 psi | 39.8 psi |
| 5 | 55.5 psi | 58.2 psi | 47.7 psi | 92.2 psi |
| 8 | 183.2 psi | 194.0 psi | 105.4 psi | 325.9 psi |

When the whole grid is the design area, the far cross main has almost nothing
to do, and the grid saves 0.3 to 10.9 psi across two to eight heads a line.
When the design area is at the far end of a ten-line grid, the shut lines and
the far cross main become a second path, and the same pipes need 18 to 68 percent
less pressure (two to eight heads a line). A tree designer would upsize that cross main instead. The
table shows how much of that upsizing a grid does without being asked. The
full table and `check/grid_vs_tree.mjs`, which prints it, are in the venture.

## What it does not do

It calculates the heads you list as open. It does not search for the most
remote area, add fittings for you, or model pumps and backflow preventers as
separate items. It is an estimate, not engineering advice and not a stamped
calculation; NFPA 13 and the authority having jurisdiction decide what is
accepted. Next, if anyone uses it: a fittings table with NFPA 13's C and
schedule adjustments, and a sweep that moves the design area to find the
most demanding one.
