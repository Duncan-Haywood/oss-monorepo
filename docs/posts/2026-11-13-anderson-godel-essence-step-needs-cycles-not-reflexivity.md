---
title: "Anderson's Gödel argument: the essence step needs cycles, not reflexivity"
seo_title: "Anderson's ontological argument: which frames break GodIsEssential"
date: 2026-11-13
tags: [research, theism-formal-evidence]
description: "Proved in Lean 4, checked on 6.9 million frames: with rigid positivity, God-likeness is an essence wherever every accessible world lies on a cycle."
---

This is the next step of our [theism-formal-evidence](../../research/theism-formal-evidence/)
programme. It continues the [previous step](2026-11-12-anderson-godel-essence-needs-no-frame-condition.md)
on C. Anthony Anderson's version of Gödel's ontological argument, as the Isabelle/HOL Archive of
Formal Proofs formalises it. One middle step there is **GodIsEssential**: being God-like is the
essence of whatever is God-like. The published proof assumes a reflexive frame and rigid
positivity (axiom A4a, "a positive property is necessarily positive"). Our earlier searches found
this step failing only in some frames that are not reflexive. The last step showed those failures
need a coarse property algebra. This step asks which frames allow a failure at all.

**The prediction**, committed to the project log before any code, had four parts:

1. An exact test inside any one model: God-likeness is x's essence at w iff every God-like
   being that exists at a world w sees has, there, every property positive at w.
2. God-likeness persists: whatever is God-like at a world stays God-like at every world
   reachable from it.
3. Without A4a, the step holds at w if every arrow out of w lies on a cycle.
4. With A4a, it holds at w if every world w sees lies on a cycle, of any length.

We also predicted converses: the step fails in some model exactly where the condition in part 3
or part 4 is false.

**Proved in Lean 4.** Parts 1 to 4 are theorems in `lean/TheismFormal/AndersonFrames.lean`, for any
accessibility relation, any domains and any property collection: `essential_iff`, `god_reach`,
`essential_cycle_edges` and `essential_a4`. None uses an axiom beyond Lean's core logic. The two
frame results E19 proved separately (the step in symmetric frames, and in reflexive frames with
A4a) now follow from these in one line each.

**Checked by search.** We reused the exact model enumeration from the earlier steps, unchanged,
on every frame up to 3 worlds × 2 individuals and 2 × 3: 6,884,324 frames and 3.47 million models.
Part 1 never failed, in 7.9 million checks. With A4a the converse held exactly: at all 1,048
(relation, world) pairs, the step fails in some model just when the world sees a world that lies
on no cycle. The smallest failure has three worlds, 2 → 0 → 1, with world 1 seeing itself, and two
individuals.

**What we got wrong.** Without A4a, the predicted converse was refuted at 226 worlds. We had
forgotten that a God-like x at w is God-like at every world w sees as well. So the positive
properties there can cover those at w without rigid positivity. A sharper sufficient condition,
written after a quick 2-world run and labelled post-hoc, is also proved (`essential_back`). It
still allows failures at 24 worlds where no model has one. In those cases, which properties are
positive at the worlds w sees forces two individuals' cells into one block. So without A4a the
exact condition depends on the property algebra, not on the frame alone. That stays open.

**What it means.** The reflexivity the published proof assumes for this step is much stronger
than needed. In the setting of that proof, the step only fails at a world that can see a
"transient" world, one that never leads back to itself. These are results about what follows
from Anderson's axioms in a stated semantics. They are not findings about whether God exists.

Code, Lean and tables: [`research/theism-formal-evidence`](../../research/theism-formal-evidence/),
experiment `e21_frame_characterisation`.
