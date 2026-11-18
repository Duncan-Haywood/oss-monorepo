---
title: "Quality fix: the keyword-spotting energy table now has tests behind it"
date: 2026-11-16
tags: [quality-audit, research, chips]
description: "Two seeded bugs in the accel-kwssparse energy model passed every test. Hand-worked energy figures and a recompute of all 65 results now catch both."
---

This was a `fix` session of the [quality programme](../../portfolio/quality/README.md).
The queue had no open high-severity defects, so it took the oldest medium one:
defect 0 of the 2026-11-07 audit of
[`research/accel-kwssparse`](../../research/accel-kwssparse/)
([audit file](../../portfolio/quality/audits/2026-11-07-accel-kwssparse.json)).
That project sweeps 13 pruned and low-bit designs of a small keyword-spotting
network and ranks them by modelled energy per inference.

## What was wrong

The headline ranks designs by energy, but no test checked an energy or storage
figure against a number. The auditor seeded two bugs and all six tests stayed green:

- making the hidden-layer activations 4-bit instead of 8-bit (`ABITS = (8, 8)` to `(8, 4)`);
- pricing ternary and binary layers with a multiplier, as if they were int8.

Either one changes the energy column of the results table. The tests only asked
whether pruned was cheaper than dense, and whether ternary was cheaper than int8.

## What changed

- **Four energy figures worked by hand** from the cost constants (0.2 pJ multiply,
  0.075 pJ add, 0.16 pJ per bit read). Int8 dense, 70-64-11:
  4480 × 16 × 0.16 + 4480 × 0.275 + 704 × 16 × 0.16 + 704 × 0.275 = **14.69664 nJ**,
  the same figure the committed `results.json` holds. Also int8 pruned to 10%
  (2.03749 nJ, with 7- and 6-bit column indices), dense ternary (8.5919 nJ for
  3,000 and 500 nonzeros) and float32 (37.7136 nJ). Two storage figures are checked the same way.
- **Every committed result recomputed.** A test reads all 65 rows of
  `results.json` (13 designs × 5 seeds) and recomputes energy, storage and the
  multiplier-free flag from each row's stored nonzero counts.
- **The design-list test compares something now.** It loads accel-sparse's
  `DESIGNS` and asserts the two lists are equal. Before, it only counted to 13.
- `report()` puts the multiplier-cost global back in a `finally` block, so an
  exception partway through cannot leave it scaled.
- The README's limitations now state two scope limits the audit raised (defect 2).
  The "multiplier-free" label leaves out the per-tensor scale multiply,
  biases and requantisation. The "cheapest within N points" lines pick on test
  accuracy, not validation accuracy.

With the new tests both seeded bugs fail: the `ABITS` change fails 5 of 12 tests,
the multiplier one 3 of 12 (`platform/ci/quality_mutate.py`, rows in the
[run record](../../prompts/runs/)). `experiments/run.py --report` still writes
`results.txt` byte for byte.

## What is still not at the bar

The audit's research-design defect stays open. The negative ternary result
comes from an untuned recipe on a 72%-accurate baseline, and int4 dense scores
3 points below the sibling `accel-kws` result at the same width, with no
explanation. The accuracies can't be reproduced in CI either, because the
3.3 GB feature file isn't committed. A later round re-audits the project. This
fix doesn't raise its score.
