---
title: "In Anderson's Gödel argument, the frame conditions depend on which properties exist"
seo_title: "Anderson's ontological argument: God-likeness is an essence in K"
date: 2026-11-12
tags: [research, theism-formal-evidence]
description: "Proved in Lean 4: with singleton properties, two steps of Anderson's argument hold in every Kripke frame. God necessarily existing still needs symmetry."
---

The [previous step](2026-11-12-anderson-godel-argument-needs-only-symmetry.md) of our
[theism-formal-evidence](../../research/theism-formal-evidence/) programme checked C. Anthony
Anderson's version of Gödel's ontological argument against the Isabelle/HOL proof in the Archive
of Formal Proofs. It found that the conclusion needs one modal condition: accessibility has to be
symmetric (the B axiom). Two intermediate steps behaved oddly in that search, and this step
explains why.

The two steps are **GodIsEssential** (being God-like is the essence of whatever is God-like) and
**GodExistenceImpliesNecExistence** (if something is God-like, then at every accessible world
something God-like exists). The published proof uses reflexivity and rigid positivity (axiom A4a)
for the first. Our exhaustive search did find failures of both in frames that are not reflexive.
But every failure was in a *coarse* property algebra, where not every set of
(world, individual) pairs counts as a property. Under full semantics, where every such set does
count, the search found no failure. That was a search result only, and it covered at most 4
worlds.

**The prediction.** We wrote it in the project log before writing any Lean. The deciding feature
is whether the algebra can tell individuals apart. Call a property collection *separating* if, for
each individual x, it contains the property "is x", that property's complement, and existence.
Then:

1. At any world, at most one individual is God-like (A1a and T2 suffice).
2. GodIsEssential holds in every Kripke frame, from A1a, A2 and T2. No reflexivity, no
   symmetry, no A4a.
3. GodExistenceImpliesNecExistence holds in every frame, from A2 and T2 alone. A God-like x
   has "is x" as a positive property, and "is x" entails existence. So x exists at every
   accessible world, and T2 makes it God-like there.
4. In *any* algebra, when GodIsEssential fails for x, some accessible world has a second
   God-like individual that exists there.
5. The conclusion still needs symmetry, even under full semantics.

**Proved in Lean 4.** Points 1 to 4 are theorems in
`lean/TheismFormal/AndersonFull.lean`: `god_unique`, `essential_any`, `geine_any` and
`essential_failure`. They hold for any accessibility relation, any domains (including empty
ones) and any property collection meeting the stated hypotheses. Point 5 is `cm_s4_full`, a
certified countermodel with two worlds and one individual. The relation is ≤, which is
reflexive and transitive but not symmetric, so this is an S4 frame. The individual exists only
at world 1, and every function of type `Unit → Fin 2 → Prop` counts as a property. Every axiom
of Anderson's system holds, including A4a and A5. Yet world 0 can see itself, and nothing
God-like exists there. The file has no `sorry` and builds with no warnings.

**Checked against the search.** We reused the earlier step's exact model enumeration,
unchanged, on every frame up to 3 worlds and 2 individuals: 6,884,324 frames. Of the 71,002
stage-III models whose algebra is separating, none fails either step, in any frame class. Every
failure the earlier search found is in a non-separating algebra: 648 in K and 1,512 in K4 for
GodIsEssential, and 1,164 in K4 for the other step. In each of the 5,256 failing cases, an
accessible world has a second God-like individual that exists there, as point 4 says.

**What it means.** E19's result stands: of S5's three conditions, the argument's conclusion
needs symmetry and nothing else. This step adds that the frame-condition picture for the middle
steps comes from the choice of property algebra, not from the modal logic. In a coarse algebra,
two individuals can share every property and both be God-like. Then "God-like" stops picking out
one being, and essence can fail. Give the algebra enough properties to tell individuals apart,
and the essence step goes through in plain K.

These are results about what follows from Anderson's axioms in a stated semantics. They are not
findings about whether God exists.

Code, Lean and tables: [`research/theism-formal-evidence`](../../research/theism-formal-evidence/),
experiment `e20_full_semantics`.
