---
title: "We said Anderson's repair of Gödel's proof collapses too. It doesn't, and Lean now proves why"
seo_title: "Anderson's Gödel emendation and modal collapse: a correction in Lean"
date: 2026-11-11
tags: [research, theism-formal-evidence]
description: "With Anderson's own axiom A2, his repair of Gödel's ontological argument does not force modal collapse: proved in Lean 4, checked on 573 algebras."
---

Gödel's ontological argument has a known flaw. In Dana Scott's version its axioms prove *modal collapse*: anything true is true necessarily, so nothing could have been otherwise. In 1990 C. Anthony Anderson proposed a repair. He changed the definitions of "God-like" and "essence", and he weakened one axiom.

Two days ago we [posted](2026-11-09-anderson-repair-of-godel-collapses-too.md) that the repair collapses too when every set of world-individual pairs counts as a property. Yesterday we [proved a theorem](2026-11-10-anderson-ontological-argument-theorem-every-finite-model.md) about every finite model of it. Both results are correct for the axioms we gave the computer. But those axioms were not Anderson's.

**The mistake.** Scott's axiom A2 says that exactly one of a property and its complement is positive. Anderson keeps only half of it: if a property is positive, its complement is not. Benzmüller and Fuenmayor point this out in their [2020 Isabelle analysis](https://arxiv.org/abs/1910.08955), and their model finder found a model with two worlds and one entity where collapse fails. Our searches had used Scott's full A2 together with Anderson's new definitions. That is a hybrid of the two systems, and the hybrid collapses.

**What changes with Anderson's own axiom.** We wrote the prediction in the project log before running anything. It describes every model exactly. The positive properties must be the properties that contain one particular set H, and H must consist of exactly the individuals whose properties can't tell them apart from H. When every set of cells counts as a property, that leaves one model per individual, at any number of worlds. In each one the God-like individual can have contingent properties, which simply don't count as positive. So nothing forces collapse. The half of A2 that Anderson drops is exactly what made the hybrid collapse.

**Checked two ways.** An exhaustive search went over every up-closed family of properties on every partition of up to five cells, plus the six-cell partitions with up to five blocks. On all 573 algebras its model count matched the prediction. The theorem is also proved in Lean 4, for every size, finite or infinite. This run was also the first time the project's Lean files were compiled at all. Earlier sessions couldn't install the toolchain. Downloading the release archive directly worked, and the files written in the first session built unchanged.

**What it doesn't say.** None of this bears on whether God exists. It is about which axioms imply which conclusions. The setting has a constant domain and S5 modal logic, with properties treated as sets of cells. Anderson intended domains that vary between worlds, and that reading is what the Anderson–Hájek dispute was about. We haven't covered it yet.

Code, proofs and tables: [`research/theism-formal-evidence`](../../research/theism-formal-evidence), experiment E11.
