---
title: "Adder chains or short paths? Why a chip-flow routing shortlist weakens at the fast corner"
seo_title: "SKY130 routing shortlist at ff: mapped delay, not adder chains"
date: 2026-11-18
tags: [research, chip-design, verified-dse, open-source, eda, statistics]
description: "A 2x2 test on 33 SKY130 designs at ff_n40C_1v95: the routing shortlist's edge shrinks on designs that map under 15 ns, whatever computes the shift."
---

The [verified-dse](../../research/verified-dse/) programme asks how much of an
open-source chip design search (Yosys, ABC and OpenROAD on SKY130) can be
skipped by trusting cheap estimates. Its rule, the clipped ladder, maps every
ABC pass sequence, ranks the mapped netlists with a cheap score, and routes
only the best 8. The baseline routes 8 random sequences for the same cost.

[The last run](2026-11-18-verified-dse-add-chains-at-ff.md) found that at the
fast-fast library corner the ladder's edge over random routing was 7.3 points
smaller on designs whose shift amount is a chain of additions. It also found a
catch: every one of those adder-chain designs mapped to a short critical path
(under 15 ns), and every control design mapped to a long one. "Adder chains are
hard for the ladder" and "short paths are hard for the ladder" predicted the
same table.

## What this run did

It ran the two missing corners of the comparison: adder chains that map slow,
and control chains (compare, select, divide) that map fast. All were fresh
designs nobody had run at this corner. The candidates, a selection rule by
baseline delay and eight predictions were committed before any flow ran.

The selection had a finding of its own. Of 14 adder-chain candidates, only the
ones'-complement sums stayed slow (18 to 42 ns). Sums of absolute differences,
wide multi-term sums and dot products all mapped at 8 to 15 ns however long we
made them: synthesis turns them into trees. So the slow adder cell has 5
designs, all from one family, against 8 fast controls.

## What it found

| cell | designs | mean edge of the ladder (points of regret) | ladder losses |
|---|---|---|---|
| fast adder chains (last run) | 10 | 1.57 | 3 |
| slow adder chains (this run) | 5 | 6.21 | 0 |
| fast control chains (this run) | 8 | 1.31 | 2 |
| slow control chains (last run) | 10 | 8.83 | 0 |

The slow adder chains behave like the slow controls, and the fast controls like
the fast adder chains. Averaged across the cells, a short mapped path costs the
ladder 6.08 points of its edge (95% interval 2.58 to 9.73). Adder-chain
structure costs 1.18 (interval -2.43 to 4.69, so no clear effect). Every loss
in either run is on a design that maps under 15 ns. The primary prediction,
that structure was the cause, is refuted. Four of the eight predictions held.

## What it means

For someone pruning a routing search at a fast corner, what predicts trouble is
a cheap number already on hand, the baseline mapped delay. What computes the
shift amount does not. That suggests the next rule to test blind: when the
baseline maps fast, route more points or fall back to random.

## Limits

The slow adder cell is one family of 5 designs. Two of the four cells come from
the previous run (same tools, liberty and protocol). Baseline delay both picked
the designs and serves as the factor. The study covers one corner, varies the
liberty only, and uses global-route estimates. Numbers, code and the
pre-registration commit are in
[`experiments/delay_split_ff/`](../../research/verified-dse/experiments/delay_split_ff/results.txt).
