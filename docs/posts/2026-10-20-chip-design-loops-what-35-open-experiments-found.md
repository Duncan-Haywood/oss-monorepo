---
title: "What 35 open chip-design experiments found about Yosys and ABC"
date: 2026-10-20
description: "Equivalent Verilog does not synthesise equally, local rewriting has little left to remove, and a MAC engine beat a systolic array: 35 open chip projects."
tags: [research, chip-design, verilog, yosys, abc, open-source]
---

# What 35 open chip-design experiments found about Yosys and ABC

If an AI agent proposes a rewrite of a piece of Verilog, how would you know the
rewrite helped? This repository's chip track (`research/chip-*`, track 3 in
[`research/PROJECTS.md`](../../research/PROJECTS.md)) spent 35 small projects
on that question, using only open tools: Yosys, ABC, Icarus Verilog, Verilator,
OpenROAD with SKY130, and Python. Each project is a directory with code,
tests, an `experiments/results.txt` and a README that states its limits.

**Who did this.** AI coding agents (Claude) working unattended in scheduled
sessions, under the owner's direction. No chip designer has reviewed it.

**Read this first.** Almost every number below is a *generic-gate count* from
Yosys 0.33 on tiny, stylised blocks (adders, a 6x6 multiplier, a tiny
quantised MLP). The one project that maps to SKY130 cells shows that such counts
mislead across kinds of logic (below). Treat these as measurements of a toolchain's
behaviour on toy designs, not as advice for a real tape-out.

## 1. Equivalent text is not equivalent input

[`chip-abc-order`](../../research/chip-abc-order/) took provably equivalent
Verilog and changed only how it was written. Renaming wires and shuffling
statements never changed a score (864 scored variants). Reordering the
operands of added terms did, but only for the carry-select adder: up to
**1.43x** between orders of the same function under the same script. That
spread is as large as the 1.17x to 1.75x that
[`chip-abc-sweep`](../../research/chip-abc-sweep/) had credited to the choice
of ABC script. The best order under the `dch; map` script (1,024) beat the text
earlier called the best adder (1,232) by 17%, with the same function.

[`chip-abc-orderpass`](../../research/chip-abc-orderpass/) traced the cause to
Yosys's `opt_merge`, which shares `a+b` between two adders only when both are
written with `a` and `b` first.
[`chip-cse-style`](../../research/chip-cse-style/) then checked the obvious
human fix. Factoring out the common sum by hand scores *exactly* what the flow
already found. A regrouped sum was 17% (`dch_map`) and 22% (`resyn2_map`)
smaller, but 9% larger under Yosys's default script. The sign depended on the
script.

Why it matters: a rewrite loop that reports a win on one text and one script
may be measuring one draw from a distribution that text order controls.

## 2. Local rewriting has almost nothing left to remove

[`chip-exact4`](../../research/chip-exact4/) computed the true minimum gate
count of every 4-input function (all 222 NPN classes, by SAT) and compared
Yosys/ABC against it on 884 functions. The default flow is exactly optimal on
only **34%**, averaging 1.19 gates above the minimum. Heavier scripts did not
help: `resyn2` was worse (mean gap 1.72).

That suggests an exact local rewriter should find gains. It does not.
[`chip-cutheadroom`](../../research/chip-cutheadroom/) looked for 4-input cones
in real flow output that an exact optimum could shrink. Over 30 netlists
(6 blocks, 5 flows), headroom was **0 gates in 28 runs** and 1 gate in the other
two. Yet the default script's `add16` has 82 gates against 110 for plain
`strash; map`. Whatever the flow gains is not local: it uses wider cuts,
sharing or restructuring. A "swap a small cone for its optimum" proposer would
be wasted effort on these netlists.

## 3. Constants: the operator is not the best you can write

[`chip-constmul`](../../research/chip-constmul/) tried all 255 8-bit constants.
Yosys's `x * K` behaves like binary shift-and-add (cells correlate with the
number of set bits of K at 0.972). Writing it as canonical signed digit (CSD)
cut mean cells from 112.9 to 75.7 (**-33%**), with K = 255 falling from 222
cells to 30. CSD is not always better: it lost to the operator on 14 constants.

[`chip-mcm`](../../research/chip-mcm/) added sharing across a bank of
constant multipliers. Against per-constant CSD the saving grew from 9% (two
constants) to about 20% (eight or sixteen), and the number of adders removed in
the source predicted cells saved with Pearson 0.875. It cost depth: sharing
recovered most but not all of what per-constant CSD lost.

## 4. A MAC engine beat a systolic array, everywhere we looked

A systolic array is the fashionable accelerator shape. For a tiny quantised MLP,
[`chip-systolic`](../../research/chip-systolic/) found it lost to a plain
MAC-lane engine in cells times cycles, and eight follow-ups
(`chip-systolic-batch`, `-fanin`, `-edge`, `-hidden`, `-hidewide`, `-p32`,
`-small`, `-abcrobust`) tried to find a regime where it caught up: larger
batches, wider fan-in, wider hidden layers, up to 32 lanes. It never did.
[`chip-systolic-abcrobust`](../../research/chip-systolic-abcrobust/) repeated
the comparison under five ABC scripts: the MAC engine won every time, by
**1.28x to 1.60x**, so quote "at least 1.28x", not one number. This is a result
about 4-bit, tiny networks; it says nothing about large arrays.

One side project found a trap in the tooling itself. Cell counts suggested
P = 32 lanes was smaller than P = 16 at equal cycles.
[`chip-p32passes`](../../research/chip-p32passes/) localised the sign flip to
the `opt -fast` after `techmap`, before any ABC, and corrected the label an
earlier project had put on that stage. The project also records the earlier
error rather than hiding it.

## 5. How far generic gates sit from silicon

[`chip-pnr`](../../research/chip-pnr/) ran placement and routing on SKY130.
Mapped area per generic gate was 5.1 to 5.8 um² for combinational designs but
about 17 um² for FIFOs, because flops are large: a gate count is a poor guide
across kinds of logic. Mapping erased the ripple-versus-`+` adder difference
completely (byte-identical cells). Layout added area only when timing needed
repair: 9% to 28% for the 16- and 32-bit adders.

[`chip-scriptsearch`](../../research/chip-scriptsearch/) searched ABC pass
sequences on a SKY130 MAC. The landscape is needle-like: 0.1% of 800 points are
within 1% of the optimum. Random search and hill climbing were close at equal
budget, and one run of session-written proposals matched their median but did
not find the optimum. That optimum (1,062 um²·ns) was 11% below the best number
an earlier project had reported, and flipped which design won.

## 6. Checking a proposer's output

[`chip-rtl-probe`](../../research/chip-rtl-probe/) mutated 12 working designs
414 ways and asked which checker rejects each. Of 389 rejected mutants, **30
(7.7%)** passed lint and 4,000 random vectors and were caught only by the
formal equivalence proof. That is the case for keeping the proof in a loop.
Its no-model repair baseline fixed 11 of 36 broken designs in 4 random edits
and 22 of 36 in 16, a floor any LLM result should beat.

## What to trust

- Each claim above has a script and `results.txt` in its project; rerun them
  with the commands in the READMEs (about a minute for most).
- Everything is one Yosys/ABC build (0.33), generic gates, small blocks. Newer
  versions or other scripts (`&deepsyn`, exact mapping) may close the gaps.
- Most "negative" results are negative *at this size*.
- Some mutation survivors in `chip-rtl-probe` were not inspected, so a few may
  be equivalent mutants.
- Nothing here was reviewed by a hardware engineer.

If you work on EDA or LLM-for-RTL, the practical takeaways are cheap to
check yourself: score several operand orders and scripts before believing a
rewrite win, and keep the formal stage.

## Update, 2026-10-21: real data, same question

[`chip-digits`](../../research/chip-digits) repeats the bit-width question of
`chip-accel` on the scikit-learn digits images instead of synthetic clusters
(64-16-10 MLP, 5 splits). Float test accuracy is 96.8%. A lane with 5-bit
weights and activations (268 generic gates) gives 96.3%; 4 and 4 bits (189
gates) give 94.8%; 3-bit weights fall to 79 to 82% and 2-bit to about a third.
This is plain post-training quantisation, so the cliff is that scheme's, not a
hardware limit. Lane gate counts are not monotonic in width (ABC noise), a
reminder of the operand-order effects above.

See also [Open-source chip design loops on Yosys, OpenROAD and SKY130](2026-10-20-open-source-chip-design-yosys-openroad-sky130-findings.md), which reads this track together with the algorithmic `eda-*` track.
