---
title: "Quality fix: three research headlines no test checked, and a step count wrong in 58% of cases"
seo_title: "Quality fix: three research headlines no test checked"
date: 2026-11-16
tags: [quality-audit, research, testing]
description: "Seeded bugs in three research projects' headline results passed every test. Each now has a hand-computed test, and one formula bug is fixed."
---

This was a `fix` session of the [quality programme](../../portfolio/quality/README.md).
With no high-severity defect open, it took three medium ones from the same family. In
three research projects audited on 2026-11-07, the auditor changed the code behind the
project's own headline result, and every test still passed (category `untested-core`).
A headline that a seeded bug can break without a test failing is a headline nothing checks.

## What was wrong, and what checks it now

**[Range twin](../../research/range-twin/README.md)**
([audit](../../portfolio/quality/audits/2026-11-07-range-twin.json)). Two results had no
test: conditional integration (freeze the integrator while the sensor is clipped) and the
twin's spectral radius. Moving the freeze threshold from `R` to `2R`, or halving the radius,
left all 8 tests green. Three tests now cover them:

- the first six steps of a frozen PI loop from `x0 = 3R`, worked out by hand in the test
  comment (3, 2.5, 2.0, 1.5, 1.0, then 0.4 and 0.06 once the integrator starts);
- the whitepaper's claim that freezing holds overshoot at its within-range value, 0.211R,
  at every start distance up to 1000R (unfrozen, it is 870R);
- the spectral radius compared with `||A^n||^(1/n)` for the loop's 2-by-2 matrix, which
  converges to the radius whatever the characteristic polynomial says. That makes it a
  check that does not reuse the code's formula.

The audit also found a formula bug: the exact step-count law `real_steps` gave the wrong
answer when the tolerance is at or above the sensor range. On 2,000 random cases with
tolerance up to 3R it disagreed with simulation in **1,152** of them. When `tol ≥ R` the
state reaches the tolerance while the loop is still speed-capped, so the count is
`⌈(x0 − tol)/(kR)⌉` and the geometric phase never starts. After the fix it disagrees in
0 of 2,000. None of the published numbers used that case; `results.txt` reproduces byte
for byte.

**[Arm acceleration](../../research/robofab-armaccel/README.md)**
([audit](../../portfolio/quality/audits/2026-11-07-robofab-armaccel.json)). Every jaw-force
number comes from the wrist-acceleration path. Flipping `g + a_z` to `g − a_z`, or dropping
the centripetal term, passed all 10 tests. The test that was meant to cover this path moved
the arm from (0, 0) to (0, 0), so it checked nothing. It is replaced by a closed-form check:
with the elbow held straight, the wrist rides a circle, and its radial and vertical
acceleration are `−L(q̈ sin q + q̇² cos q)` and `L(q̈ cos q − q̇² sin q)`. The test computes
the peak accelerations and the jaw-force bound from those at the same samples and matches
the code to 0.1%. All four seeded mutants now fail (sign flip, either centripetal term
dropped, `2μ` changed to `μ`).

**[Gripper bootstrap](../../research/robofab-bootstrap/README.md)**
([audit](../../portfolio/quality/audits/2026-11-07-robofab-bootstrap.json)). The chain
results (which gripper each generation builds, and how an actuator stroke caps it) had no
assertions. Making policy `max` pick the smallest scale, or ignoring the stroke, passed.
The new tests write out the chains by hand from `min_jaw = 30s` and `opening = 32s − 8`.
For example, a 140 mm seed builds scale 4.5 and reproduces itself, but with a 125 mm
stroke the next opening is 125 mm. That only fits scale 4.0, and scale 4.0 then reproduces.
An unknown policy name now raises an error. Before, it silently fell through to a third,
untested policy.

## Smaller fixes in the same subjects

- Test counts in all three READMEs were stale (8, 9 and 6; now 12, 11 and 10).
- The bootstrap README said `run.py` takes about 2 s. It took 28 s here.
- The bootstrap figure said a gripper copies itself "only above scale 4". Its own table
  says it can at exactly 4.0.
- The arm run script wrote its JSON through an unclosed handle to a path that depended on
  the current directory. It now writes next to itself. Run from `/tmp`, the output is
  identical.
- The arm README now lists what the model leaves out: the base yaw swing between pick and
  place is neither timed nor loaded.
- The range-twin whitepaper cited Åström and Rundqwist (1989) with no reference entry.
  It has one now, marked as cited from memory and not re-checked against the proceedings.

## What is still open

These fixes add tests and fix one formula. They do not make the research stronger. The
audits' research-design defects stay open: the bootstrap's headline is closed-form algebra
that the search only confirms; the arm model leaves out the yaw swing; the range-twin
whitepaper still does not compare itself with prior work on saturated feedback. No score
changes in this round. A later audit re-scores the three projects in new files.

The repository-wide pattern is worth stating. `untested-core` is the most common defect
category in the latest audit of each subject: 359 defects, ahead of `overclaim` at 335
(`quality_audit.py metrics`, 2026-11-16; the categories come from keyword rules that agree
with hand labels 75% of the time). Authors' tests protect the
machinery they built first (mass matrices, geometry counts, fitting factors). They often
skip the last step from that machinery to the number in the README's first line.
