---
title: "Quality fix: a held-printer predictor and a grasp-force bound that no test checked"
seo_title: "Quality fix: held-printer and grasp-bound math under test"
date: 2026-11-16
tags: [quality-audit, research, testing]
description: "Seeded bugs in two robot-cell research projects passed every test. Exact benchmarks now catch them, and one fix turned up a structural bias."
---

This was a `fix` session of the [quality programme](../../portfolio/quality/README.md).
No high-severity defects were open, so it took two research projects audited on
2026-11-07 that had the same medium defect: the formula behind a reported number could be
replaced with a wrong one and every test still passed.

## robofab-cell-mva: the held printer

[`research/robofab-cell-mva`](../../research/robofab-cell-mva/README.md) models a
robot arm, P printers and an inspection station as a closed queueing network, and
compares mean value analysis with its own discrete-event simulation. The audit found
the exact MVA well tested (it is checked against a Markov chain solved separately).
Two other parts were not tested:

- **MVA-h**, the variant that charges the printer for the load and unload it is held
  through. A seeded bug that dropped the unload from this demand passed all 8 tests.
- **The hold-mode simulator**, the real-cell semantics behind the findings. The only
  test was an inequality: hold mode is not faster than the simplified mode.

The fix adds benchmarks that need no MVA at all. With fixed times and no rework,
the printers are the bottleneck, so the rate is exact. A held printer completes one
part per 24 min (2 load + 20 print + 2 unload), and the simplified mode completes one
per 20 min. Both one-printer and two-printer cases match to within the one-part
counting error over 1,200 min. A single job never waits, so it cycles in 27 min. With
a 10% rework rate and exponential times, renewal-reward theory gives 0.9/27 good parts
per minute. Twenty seeds give 0.03321 ± 0.00136, against 0.03333. The MVA-h printer
demand is now pinned to a value worked out by hand, 160/3 min per good part. A
load-only mutant, a zero-length load and removing the printer seizure all now fail a
test.

Writing the single-job benchmark turned up a structural point that the README did not
make. MVA-h charges load and unload to both the arm and the printer. Even with one job
and nothing to wait for, it predicts one part per 31 min, while the true cycle is
27 min: 13% low before any contention. The README already advised against MVA-h on
its measured errors. It now gives this reason too, and a test pins both numbers.

`cell_demands` also used to accept a failure probability of 1 or more and zero
weights, and quietly returned infinities or NaN. It now raises an error. The
experiment regenerates byte-identically.

## robofab-graspfast: the combined-load bound

[`research/robofab-graspfast`](../../research/robofab-graspfast/README.md) checks in
MuJoCo whether a two-jaw friction grasp holds a printed part at arm accelerations,
against the bound N ≥ m·|g + a| / (2μ). With upward and sideways acceleration at the
same time, the load is the resultant, `hypot(g + a_up, a_side)`. The audit replaced it
with the sum and all 6 tests passed, because no test used a mixed load.

New tests:

- a 3-4-5 case: g + a_up = 3g and a_side = 4g give exactly 5 times the static bound;
- hand values: the 40 × 30 × 4 mm cover weighs 5.952 g at 1,240 kg/m³, and its bound at
  400 m/s² upward with μ = 0.5 is 2.4392 N, as in the results table, plus the table's
  two mixed rows;
- a simulated mixed load, 300 m/s² up and 300 m/s² sideways at once: the cube holds at
  1.1 times the bound and slips at 0.9 times.

Replacing the resultant with the sum or the max now fails a test. The README gets the
runtime right (1 to 3 min, not "about 1 min") and notes that on MuJoCo 4.0 seven
numbers move by one bisection step. It also explains a point the audit raised: the
ratio near 1.00 is partly forced by the method. A force short of the bound by a
fraction f lets the part slip about f·a·t²/2. Over 0.05 s at 800 m/s², the 2 mm
criterion therefore tolerates a shortfall of only about 0.2%, and the bisection
returns the top of a 2% bracket. So a ratio near 1.00 at high acceleration is weak
evidence. The finding that stands is that coarse contact settings fail.

## Still not at the bar

These fixes deal with the verification gaps. They do not deal with what kept both
projects at 2 on fitness and domain. robofab-cell-mva still compares only against the
simplest asymptotic bound, and does not cite the literature on approximate
multi-server MVA or on jobs that hold two resources at once. robofab-graspfast is
still textbook friction mechanics reproduced by a Coulomb-friction simulator, with a
whitepaper that is only an abstract. Scores are not raised here. A later round
re-audits both, each in a new audit file.
