---
title: "Anderson's ontological argument needs symmetry, not S5"
seo_title: "Anderson's Gödel argument: the B axiom is the only modal premise it uses"
date: 2026-11-12
tags: [research, theism-formal-evidence]
description: "Checked against the Isabelle AFP proof: Anderson's version of Gödel's argument holds in every symmetric frame and fails in S4, in 96,036 of 136,466 finite models."
---

C. Anthony Anderson's 1990 emendation of Gödel's ontological argument is usually stated in S5,
the strongest standard modal logic. Fuenmayor and Benzmüller's Isabelle/HOL formalisation in the
Archive of Formal Proofs, *Types, Tableaus and Gödel's God* (2017), follows Fitting's textbook
and does the same. Before its Part II it adds all three of S5's frame conditions: reflexive,
symmetric and transitive accessibility.

This step of our [theism-formal-evidence](../../research/theism-formal-evidence/) programme
asked two questions. Does our own finite-model encoding of Anderson's system (experiments E11 to
E16) agree with that published proof? And which of the three conditions does the argument
actually use?

**Agreement first.** We transcribed every statement of the AFP's `AndersonProof.thy` and checked
it in every finite model up to a fixed size. That came to 8,112,532 frames: every accessibility
relation up to 3 worlds and 2 individuals, every domain assignment including empty ones, and full
and coarse property algebras. Every theorem the file proves holds in every S5 model. Modal collapse
has the 2-world, 1-individual countermodel Benzmüller and Fuenmayor report. On the 17,742 frames
where the two overlap, the S5 models are exactly the ones our earlier experiment E12 characterised
by formula.

**Then the frame conditions.** We wrote the predictions in the project log before writing any
code. The argument's conclusion is that at every world something God-like exists:

| frame class | models | conclusion fails in |
|---|---|---|
| K (no condition) | 102,360 | 49,998 |
| T (reflexive) | 18,880 | 7,252 |
| K4 (transitive) | 178,022 | 71,232 |
| S4 (reflexive, transitive) | 136,466 | 96,036 |
| KB (symmetric) | 10,690 | 0 |
| B (reflexive, symmetric) | 603 | 0 |
| S5 | 30,270 | 0 |

So symmetry decides it. The smallest failure has two worlds and one individual. World 0 sees
both worlds, world 1 sees only itself, and the individual exists only at world 1. God possibly
exists at world 0 but not necessarily, which is the familiar failure of "possibly necessary
implies necessary" without symmetry. The AFP's proof of that step cites symmetry and
transitivity, but transitivity turns out to be unnecessary. The conclusion also holds without
reflexivity, and without the axiom that positive properties are necessarily positive.

We proved this in Lean 4 for any accessibility relation, any domains and any collection of
properties (`nec_exists_symm` in `lean/TheismFormal/AndersonK.lean`). The proof is short. A
God-like being at a world you can see is, by symmetry, God-like at your own world. Anderson's
necessary-existence axiom then makes God-likeness instantiated at every world you can see.

**What surprised us.** The step "God-likeness is the essence of anything God-like" is proved in
the AFP using reflexivity. It also holds in symmetric frames without reflexivity, and there it does
not even need positivity to be rigid. Where it fails (in K and K4), every failure is in a coarse
property algebra. Under full semantics we found none at these sizes, but we have no proof of that.

**Why it matters.** Critics of modal ontological arguments have long focused on S5's
"possibly necessary implies necessary". This result narrows the target for Anderson's version.
The only modal premise it uses is the B axiom: what is actual is necessarily possible. Our
programme found the same for the Hartshorne–Plantinga argument at its first milestone. These are
results about the logic of an argument, not about whether God exists.

The full table, the countermodels and the reproduction command are in the
[E19 results](../../research/theism-formal-evidence/experiments/e19_afp_anderson/results.md).
