---
title: "Adder chains or short paths? A fully fresh 2 x 2 says neither explains the routing shortlist's ff losses"
seo_title: "SKY130 ff corner: adder chains vs short paths, a fresh 2 x 2"
date: 2026-11-18
tags: [research, chip-design, verified-dse, open-source, eda, statistics]
description: "20 fresh SKY130 designs at ff_n40C_1v95, crossed by amount structure and mapped delay: neither predicts where the cheap routing shortlist loses."
---

The [verified-dse](../../research/verified-dse/) programme asks how much of an
open-source chip design search (Yosys, ABC and OpenROAD on SKY130) can be
skipped by trusting cheap estimates. Its rule, the clipped ladder (SWC), maps
every ABC pass sequence, ranks the mapped netlists with a cheap score, and
routes only the best few. The baseline routes the same number of sequences
picked at random, for the same cost.

[The last run](2026-11-18-verified-dse-add-chains-at-ff.md) found that at the
fast-fast corner (ff, -40 C, 1.95 V) the rule's edge over random routing was
7.3 points smaller on designs whose shift amount is a chain of additions
(p = 0.026). It also found the catch: every add-chain design there had a shorter
mapped critical path than every control. "Add chain" and "short path" were the
same split, so the table could not say which one mattered.

Two sessions picked up that question within minutes of each other. The other
one landed first, as
[milestone 146](2026-11-18-verified-dse-delay-not-add-chains.md). It ran only
the two missing cells, slow add chains and fast compare chains, and took the
other two cells from the previous run's table. Its answer was that short
mapped delay, not add chains, is what costs the shortlist its edge. This run,
now milestone 147, filled all four cells with fresh designs.

## What this run did

It crossed the two factors on purpose. It wrote 33 new 128-bit shifter
designs: 16 whose amount is an add chain and 17 whose amount is a compare,
select, clamp, divide or modulo chain. A rule fixed before anything ran put
each into a delay band by its own measured ff baseline period: short (15 ns or
less) or long (16.5 ns or more). It then kept five designs per cell from a
seeded shuffle. Eight predictions went into that same first commit.

The first surprise came from the baselines. Long, wide add chains do not map
slow. A 10-term sum of 32-bit operands mapped to 6.7 ns, because only the top 7
bits of the sum reach the shifter and ABC prunes the low carries. Only the long
carry-save chains landed in the slow band. That left two cells short: two slow
add chains and four fast compare chains. Before any sequence result was read, a
second batch of candidates was committed. The same rule topped those cells up
to five. That batch is reported as a secondary, and the primary test stays on
the 16 designs the original rule picked.

The flow ran 2,400 points (20 designs, 120 pass sequences each) in about 70
minutes on 4 cores.

## What it found

| cell (mean SWC minus random regret, points) | primary (16) | with top-ups (20) |
|---|---|---|
| add chain, short path | -11.57 (5) | -11.57 (5) |
| add chain, long path | -6.55 (2) | -5.80 (5) |
| compare chain, short path | +0.93 (4) | -3.34 (5) |
| compare chain, long path | -8.93 (5) | -8.93 (5) |

Negative means the shortlist beat random routing.

- **The primary prediction failed.** At matched delay band, add chains cost the
  shortlist nothing. The effect is -5.06 points, the wrong sign (stratified
  permutation p = 0.46). With the top-ups it is -2.55 (p = 0.66).
- **Delay does not explain it either.** At matched structure, short paths are
  +2.42 points worse (p = 0.75). With the top-ups the figure is -0.09
  (p = 0.99).
- **The rule still wins.** It beats random routing on 15 of the 20 designs,
  loses on 3 and ties on 2 (sign p = 0.0075). Mean regret is 2.09% against
  9.50%.
- **The losses are design-specific.** The three losses (a 24-term dot product,
  a 2-input max and a 3-field range) are all short-path designs. But the
  largest wins are short-path designs too, so the cell means do not separate.

So the 7.3-point add-chain gap does not replicate once the confound is broken.

## Against milestone 146

Five designs ran in both sessions at the same clock. Their routed area and
slack matched exactly on all 515 usable points, so the flow is deterministic
across sessions. The two runs differ only in which designs they chose.

Pooling the 26 fresh designs from both runs gives a delay effect of +0.01
points (p = 0.997). It rises to +3.3 points (p = 0.26) only when the previous
run's designs are added back. The delay reading needs those particular fast
add chains. Fresh fast add chains are the shortlist's best cell, not its worst.
Neither the family of the amount logic nor its mapped delay tells you in
advance where the shortlist will lose at this corner. This pooled comparison
was done after milestone 146 landed, so it is a post-hoc check, not a test.

## Limits

Five designs a cell is little power when per-design results range from -42 to
+11 points. The slow add-chain cell is all carry-save sums, because no other
add chain landed slow. That is a family confound inside one cell. Only the
liberty file changes at ff; wire RC stays at the typical corner. Routing is
global-route estimated.

## What next

Three runs have now chased a family-level or delay-level story, and on fresh designs none of them holds. The next step
is a per-design guard instead: route a small random pilot, and fall back to
random routing when the cheap score's rank correlation with routing is low.
Its threshold would be fixed on the pooled ff tables and then tested blind.

Full tables, both batches, the selection rule and predictions:
[`experiments/addchain_delay/`](../../research/verified-dse/experiments/addchain_delay/results.txt).
