---
title: "One constant survives both corners: a blind tt run keeps the routing shortlist's clip at 1.25"
seo_title: "SKY130 tt vs ff: does a routing shortlist's clip alpha transfer?"
date: 2026-11-19
tags: [research, chip-design, verified-dse, open-source, eda, statistics]
description: "Run blind at the typical corner, alpha = 1 has 2.08% regret against 1.25's 1.69%; over 223 ff and tt units 1.25 stays the best single value."
---

The [verified-dse](../../research/verified-dse/) programme asks how much of an
open-source chip design search (Yosys, ABC and OpenROAD on SKY130) can be
skipped by trusting cheap estimates. Its rule, the clipped ladder (SWC), maps
every ABC pass sequence and routes only the best eight by
`area x max(period, alpha x mapped delay)`. alpha = 1.25 was chosen at the
typical corner (tt) in milestone 115.

[This morning's run](2026-11-19-verified-dse-short-add-chains-ff.md) ran 15
fresh short add chains at the fast corner (ff) and, after the fact, alpha = 1
had the lowest mean regret there: 5.57% against 7.18% for 1.25. A number found
after looking is a hypothesis, not a result. So this run took the same designs
to the other corner, where nothing had been chosen on them, and scored the two
values blind.

## What was fixed in advance

Thirteen of the 15 designs had never been run at tt (csum4 and avg6 sit in
older tt tables and were left out; a test checks every tt table). Each kept
its ff clock tag, tight or relaxed, applied to its own tt baseline, so the two
corners pair design by design. The designs, clocks and seven predictions were
committed and pushed before the first of the 1,560 flow points ran
(24 minutes on four cores).

## What came out

| 13 fresh designs at tt | mean regret | worst |
|---|---|---|
| SWC, alpha = 1.25 | 1.69% | 10.24% (sad2) |
| SWC, alpha = 1 (and 0, 0.5, 0.8) | 2.08% | 10.24% (sad2) |
| equal-cost random routing | 3.19% | |

- **The primary held: 1.25 is at least as good as 1 at tt.** The difference
  is +0.39 points (bootstrap interval -0.05 to +1.01). Ten designs tie; 1.25
  wins on avg10 (3.86 points) and wsum8 (1.58) and loses on avg8 (0.35).
- **Preferences do not carry across corners.** On avg10, alpha = 1 is a
  12.6-point win at ff and a 3.9-point loss at tt. Across the 13 designs, the
  rank correlation of the alpha = 1 advantage at ff and at tt is -0.46.
- **Over everything measured, 1.25 is still the best single constant:**
  2.58% mean regret over 223 ff and tt units, against 2.73% for alpha = 1 and
  6.70% for area alone.

Six of seven predictions held. The one that failed predicted the area-only
advantage would correlate across corners; it came out slightly negative.

## What it means

Three runs today pulled on the same thread. Smaller alphas looked better at
the fast corner, on a few designs, in hindsight. Asked blind, at the corner
where the constant was set, the same designs do not want the change, and the
designs that prefer a smaller alpha at ff are not the ones that prefer it at
tt. The paper keeps one value, 1.25, and states the fast-corner losses as a
limit rather than tuning per corner.

The honest caveat: ten of the 13 designs tie, so this rests on three, and the
interval touches zero. It says 1.25 is not beaten, not that it is better by a
known margin.

Code, tables and the pre-registration commit:
[`experiments/addshort_tt/`](../../research/verified-dse/experiments/addshort_tt/results.txt),
log entry in [`LOG.md`](../../research/verified-dse/LOG.md).
