---
title: "Three expensive runs, then only what the bound can't rule out: picking a hanger width"
seo_title: "Screen and verify: a multi-fidelity regret bound for cloth design"
date: 2026-11-12
tags: [research, robotics, cloth-simulation, laundry-robot, digital-twin, multi-fidelity]
description: "Keeping the cheap model's own penalty makes the regret bound 2.8x tighter; a loop built on it finds the best hanger width in 48 of 50 cases with 3.9 of 7 runs."
---

The [`hanger-codesign`](../../research/hanger-codesign/) programme asks how
good a cloth simulator must be before the hanger it designs for a laundry
robot is the right one. The last step proved a bound on how much a cheap
simulator's choice can cost, and found it too loose to certify anything
the fast 2D model picked. This step finds out why it was loose and turns the
fixed version into a procedure.

**What the old bound threw away.** The cheap choice's regret on the
expensive model is exactly the change in the paired error between the two
designs, *minus* how much worse the cheap model thinks the true best design
is. The first bound dropped that second term. For the 2D chain it is large,
because the chain is sharp: it thinks the widths next to its pick are clearly
worse. Keep it, bound the error's change by a slope K times the distance from
the cheap pick, and maximise over the unknown best design. The result needs
only the cheap scores and K.

**How much tighter.** On the 16 cases where the 2D chain's pick is not the 3D
sheet's best, the realised regret is a median 34% of the new bound against
12% of the old one: 2.8 times tighter. With K estimated from just three
expensive runs (the cheap pick and its two neighbours), the bound still
covers the realised regret in 47 of 50 tier pairs, and all 50 if the
estimate is doubled.

**The loop.** Run the expensive model at those three widths, estimate K,
run every width the bound cannot rule out, update K, repeat. Over the 50
pairs from milestones 1b to 1d (no new simulation):

| strategy | expensive runs (of 7) | finds the best | mean regret |
|---|---|---|---|
| trust the cheap model | 1 | 23 of 50 | 0.028 cm |
| best of the three nearby runs | 3.0 | 47 of 50 | 0.0022 cm |
| screen and verify | 3.9 | 48 of 50 | 0.0010 cm |
| run everything | 7 | 50 of 50 | 0 |

Both misses are the softest cloth (stretch stiffness 40 N/m), where the
best width sits 1 cm from the 2D pick and the error curves away, so the
slope near the pick understates it. Doubling the screen catches them but,
on the 2D chain, runs all seven widths.

**Limits.** Seven candidates is a small set, so the saving is a few runs;
it should matter more in the continuous design loop that comes next. The
50 cases overlap, so there are no intervals, and the "expensive" model is
still our own converged sheet, not a validated solver. Full tables: the
project [README](../../research/hanger-codesign/README.md), "Milestone 5b".

*Simulation only; produced with AI assistance.*
