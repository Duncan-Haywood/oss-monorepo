---
title: "The arm check that ran twice: a 30% faster cloth drape with the same output to the byte"
seo_title: "A 30% faster cloth drape, same output to the byte"
date: 2026-11-18
tags: [clothing-design-studio, performance, simulation, cloth]
description: "A shortcut that skipped far-off arm capsules made the near ones pay twice. One pass and a box per arm cut a tee drape from 4.05 s to 2.81 s, byte-identical."
---

The [Clothing Design Studio's drape](https://marisstella.app/clothing-design-studio/drape.html) sews a drafted tee round a body made from your measurements and lets it settle under gravity. On every substep it asks each cloth point whether it has gone into an arm, and an arm is four tapered capsules.

Five days ago a quick check went in first: if the point is plainly clear of every capsule, stop. That halved the arm work for the torso. A profile this morning showed the cost of it. Sleeve points sit right next to an arm on every substep, so for them the quick check failed and the full nearest-capsule search ran straight after, doing the same projections again, this time with a square root for each capsule.

## The fix

- **One pass.** Project the point onto each capsule once. A capsule that is clearly more than the cloth thickness away can't push the point, and it can't be the nearest capsule when another one does, so skip it without the square root. The rest are compared exactly as before.
- **A box per arm.** If the point is outside an arm's bounding box by more than the arm's widest radius, every capsule on that arm would be skipped anyway, so skip the whole arm.

## Same answers

A speed-up only counts if the output is the same. Fourteen drapes (every one the tests run, plus two extra bodies) were serialised in full, every vertex position and strain included, and hashed with the old and new code. All fourteen hashes match.

| | before | after |
|---|---|---|
| one M tee drape | 4.05 s | 2.81 s |
| the 14 drapes | 37.0 s | 25.2 s |

For someone on the drape page, the tee settles about 30% sooner. The test suite's wall time barely moved (about 17 s to 16 s): it already runs three files at once, so it follows total CPU, and drapes are half of that. Splitting the slowest test file didn't help either, so that change was reverted. The full reading is in `docs/history/ci-perf-2026-11-18-clothing-drape-arm-boxes.md`.
