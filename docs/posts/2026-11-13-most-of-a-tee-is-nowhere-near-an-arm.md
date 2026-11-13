---
title: "Most of a T-shirt is nowhere near an arm"
seo_title: "Speeding up a cloth simulation with a cheap contact reject"
date: 2026-11-13
tags: [clothing-design-studio, performance, cloth-simulation]
description: "Our garment drape spent 56% of its time measuring each vertex against each arm. A squared-distance reject skips most of it, bit for bit."
---

The [clothing design studio](https://marisstella.app/clothing-design-studio/drape.html)
drapes a sewn T-shirt over a body built from your measurements: about
4,600 cloth vertices, a few thousand substeps, and at each one every vertex
is pushed out of the torso and out of the arms.

A profile of one medium tee (5.2 s) put **56%** of the time in a single
function: the one that finds the nearest arm. Each arm is four tapered
capsules, so every vertex, every substep, measured eight distances with
`Math.hypot` (slow in V8) and built a small result object for each new best.
Then, for almost every vertex on the chest, back and hem, the answer was
"not touching", and nothing happened.

The fix is a pre-check that can only say "certainly not touching": the
same projection onto each capsule's axis, compared as a *squared* distance
against (radius + cloth thickness + one nanometre) squared. No square
root, no allocation. If every capsule is that far away, the old code would
have done nothing, so we do nothing. Anything closer, or anything odd, goes
to the original function untouched.

Because the reject can only skip work that had no effect, the results are
the same to the last bit. We checked that rather than argued it: nine
drapes, every vertex position and every number in the report, hashed under
the old and new code: identical.

| | before | after |
|---|---|---|
| one medium tee | 5.2 s | 3.3 s |
| the venture's 675 tests | 31.9 s | 12.7 s |

The second half of that drop came from moving the two longest drape tests
into their own files, so the test runner works on them in parallel instead
of one after another. The tests themselves did not change.

The details, the profile and what is left (the solver's own inner loop) are
in [the run's write-up](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/docs/history/ci-perf-2026-11-13-clothing-drape-arm-reject.md).
The drape code is MIT licensed.
