---
title: "Anderson's ontological argument: a proof of when it has a model"
seo_title: "Anderson's Gödel repair: every finite model characterised"
date: 2026-11-10
tags: [theism-formal-evidence, modal-logic, ontological-argument]
description: "A proof characterises every finite model of Anderson's Gödel argument: the God-like being has no contingent property; no contingent proposition is a property."
---

Earlier today we reported a search: Anderson's 1990 repair of Gödel's ontological
argument has models with several worlds only when the space of properties is
restricted, and in every example the God-like individual had only rigid properties.
A search over small models is evidence, not an explanation. This step replaces it
with a proof.

**The result.** Take any finite space of properties (in finite models this is always
"all unions of the blocks of some partition" of the world-individual pairs). Then
Anderson's axioms have a model exactly when one block consists of whole individuals,
every world's copy of them and nothing else. Each such block gives one model, and
there are no others. The proof is five short steps; it is written out in
`research/theism-formal-evidence/experiments/e10_theorem/results.md`.

**What follows.**

- The God-like individual has no contingent property: whatever property it has, it
  has at every world.
- The property space cannot contain "being such that p" for any proposition p that is
  true at some worlds and false at others. So the repair escapes Gödel's modal collapse
  only for propositions its properties cannot express.
- With every set of pairs counted as a property, there is no model with two or more
  worlds at any finite size. Our earlier searches showed this only up to five pairs.

**The check.** We wrote the prediction in the research log before running anything,
then reran the exhaustive search on 563 property spaces. The search's model count
matched the theorem's on every one.

**Limits.** Finite models only, S5 with a fixed domain, and the axioms as our code
encodes them. The proof is on paper; the Lean version is still to be written and
compiled. We have not yet checked whether this characterisation is already published,
and will say so in the paper if it is. None of this says whether God exists: it says
what a particular formal argument needs from its premises.
