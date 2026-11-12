---
title: "Fitting's repair of Gödel's argument has the same gap as Anderson's"
seo_title: "Fitting's Gödel argument: the de re gap, proved in Lean 4"
date: 2026-11-12
tags: [research, theism-formal-evidence]
description: "Fitting's variant of Gödel's ontological argument proves necessary existence de dicto in every model, but de re fails when properties lump individuals together."
---

Gödel's ontological argument, in Dana Scott's version, has a famous defect: it proves too much. Every true proposition comes out necessarily true ("modal collapse"). Two repairs are well known. C. Anthony Anderson changed the definitions of God-likeness and essence. Melvin Fitting took a different route: positive properties are *extensions*, sets of individuals that stay the same from world to world, rather than intensions that can vary. Benzmüller and Fuenmayor checked both repairs by computer ([arXiv:1910.08955](https://arxiv.org/abs/1910.08955)) and showed that each avoids collapse.

Over the past week we studied Anderson's repair with domains that vary from world to world. The main finding (experiment E13) was a gap between two readings of the conclusion. The axioms prove *de dicto* necessary existence: at every world, something God-like exists. They do not prove *de re* necessary existence: that some one being is God-like and exists at every world. The de re reading fails whenever the space of properties is coarse enough to treat two individuals alike.

This step asked whether that gap is a quirk of Anderson's definitions. It is not.

**The result.** We took Fitting's axioms as Benzmüller and Fuenmayor encode them. Properties are the unions of groups ("blocks") of individuals, and the domains vary. In that setting the models have a simple shape. At each world the positive properties are exactly those that contain one block. That block must hold an individual that exists somewhere. Necessary existence (axiom A5) adds one condition: the block must hold an existent at every world. We proved this in Lean 4 for any algebra and any domains (`model_iff`, `model_a5_iff` in `research/theism-formal-evidence/lean/TheismFormal/Fitting.lean`). A brute-force search over 119,890 small frames agrees with the formula on every one.

Three things follow:

- **De dicto always holds.** In every model of all the axioms, every world has a God-like existent (`de_dicto`).
- **De re can fail.** Take two worlds, two individuals in one block, each existing at only one world. All the axioms hold and both individuals are God-like, yet neither exists at every world (`cm_de_re`). In the search, 33,102 of 131,573 models fail de re this way, all of them in coarse algebras.
- **With every set of individuals as a property, the gap closes, but only if positivity is the same at every world.** There is then exactly one God-like being, and it exists everywhere (`god_unique_full`, `de_re_full`). Benzmüller and Fuenmayor's encoding of Fitting does not list the axiom that positivity is fixed across worlds. Without it, each world can have a different God-like being (`cm_no_a4`).

One difference from Anderson's version does stand out. In Anderson's variant the property "is a necessary existent" can fall outside the algebra, so his axiom A5' can fail for reasons that have nothing to do with theology (experiment E15). In Fitting's variant it never can (`ne_in_algebra`). Fitting's necessary existence, though, belongs to a block rather than to a being. In 82,074 of the frames searched, it holds of someone who does not exist at every world.

**What it means.** Both repairs avoid modal collapse, and both prove "necessarily, something God-like exists". Neither proves "something God-like necessarily exists" unless the property space can tell every individual apart. With Fitting's repair, positivity must also be fixed across worlds. A critic can contest those choices, and a defender has to make them. These are facts about formal systems, not evidence for or against God.

We predicted every part of this result in the project's log before the search ran. We have not yet checked Fitting's own book to see whether it assumes positivity is fixed across worlds, so the results cover both readings. The code, the proofs and the log are in `research/theism-formal-evidence/` (experiment E17).
