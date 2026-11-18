---
title: "Does the chip-flow routing shortlist fail on adder chains at the fast corner? Blind test: weaker, not failing"
seo_title: "Routing shortlist on SKY130 adder chains at ff: a blind test"
date: 2026-11-18
tags: [research, chip-design, verified-dse, open-source, eda, statistics]
description: "20 fresh SKY130 designs at ff_n40C_1v95: the cheap routing shortlist loses on 3 of 10 adder chains and 0 of 10 others, with a smaller edge on adds."
---

The [verified-dse](../../research/verified-dse/) programme asks how much of an
open-source chip design search (Yosys, ABC and OpenROAD on SKY130) can be
skipped by trusting cheap estimates. Its rule, the clipped ladder (SWC), maps
every ABC pass sequence, ranks the mapped netlists with a cheap score, and
routes only the best 8. The baseline routes 8 sequences picked at random, for
the same cost.

[The last run](2026-11-18-verified-dse-fast-corner.md) moved to the fast-fast
library corner (ff, -40 C, 1.95 V). The rule still won 20 of 27 blind designs.
But the seven losses had a look to them: every carry-save adder and every dot
product was among them. In both families the shifter's amount is computed by a
chain of additions. A pattern spotted in the table that suggested it is a
hypothesis, not a finding, so this run tested it on designs nobody had run at
ff.

## What this run did

It wrote down two groups of 128-bit shifter designs before running anything.
The add-chain group has 10 designs whose shift amount sums three or more
multi-bit terms: carry-save sums, dot products, multi-term sums, averages and
sums of absolute differences. The control group has 10 designs whose amount
comes from a compare, select, clamp or divide chain. Seven predictions went into
the same commit. The primary one: the rule loses on a larger share of add-chain
designs, with a one-sided Fisher exact p below 0.05.

The flow ran all 2,400 points (20 designs, 120 pass sequences each) in about 70
minutes on 4 cores.

## What it found

| | add chains | controls |
|---|---|---|
| designs where the shortlist loses | 3 of 10 | 0 of 10 |
| mean regret, shortlist | 5.64% | 1.33% |
| mean regret, random routing | 7.21% | 10.16% |
| mean edge over random | 1.57 points | 8.83 points |
| rank correlation, mapped vs routed (median tau-b) | 0.27 | 0.47 |

- **The primary prediction failed.** 3 of 10 against 0 of 10 gives Fisher
  p = 0.105. Seven of the ten add-chain designs still favour the shortlist, so
  "it loses on adder chains at ff" is wrong as stated.
- **A weaker version held.** On add chains the shortlist's edge over random
  routing is 7.3 points smaller (label-permutation p = 0.026).
- **The mechanism fits.** The rule screens with the mapped netlist. On add
  chains, that cheap score agrees less with the routed result.
- **The rule still wins overall:** 16 designs to 3, with one tie (sign
  p = 0.0044).

## The catch

Every add-chain design in this set maps to a shorter critical path (6.9 to 14.8
ns) than every control (16.7 to 30.2 ns). So this table cannot tell "the
amount is an add chain" apart from "the design is short and fast". The earlier
table has only three short designs outside the add-chain group, all counters,
and the rule won all three. That points weakly at structure, but three designs
cannot settle it. The next step is a set that breaks the confound on purpose:
slow add chains and fast compare chains.

Two smaller disclosures. nixpkgs now ships Yosys 0.71, and the earlier ff runs
used 0.70. Also, the session's worker restarted near the end, and the last 141
points ran under `--resume`.

Full table, predictions and code:
[`experiments/addchain_ff/`](../../research/verified-dse/experiments/addchain_ff/results.txt).
