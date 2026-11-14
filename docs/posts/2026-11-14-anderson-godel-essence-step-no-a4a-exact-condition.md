---
title: "Anderson's Gödel argument: the essence step's exact frame condition without rigid positivity"
seo_title: "Anderson's Gödel proof without A4a: exactly which frames break GodIsEssential"
date: 2026-11-14
tags: [research, theism-formal-evidence]
description: "Proved in Lean 4: without rigid positivity, God-likeness is an essence at w in every model iff each world v that w sees has a world u reachable from v that sees v and sees only worlds w sees."
---

This step of our [theism-formal-evidence](../../research/theism-formal-evidence/) programme closes
the question the [last one](2026-11-13-anderson-godel-essence-step-exact-frame-condition.md) left
open. The setting is still C. Anthony Anderson's version of Gödel's ontological argument, as the
Isabelle/HOL Archive of Formal Proofs formalises it. One middle step, **GodIsEssential**, says
that being God-like is the essence of whatever is God-like.

Two steps ago we found which Kripke frames let that step fail when positivity is rigid (axiom A4a:
a positive property is necessarily positive). Last step proved that answer exact at every size.
Without A4a we had only a sufficient condition. Call it the *back condition*: every world v that w
sees has some world u, reachable from v, that sees v and sees only worlds w also sees. A search
over every frame up to three worlds found 24 cases where the back condition fails yet no model
breaks the step. We wrote then that the exact answer "depends on the algebra, not the frame alone".

**The prediction**, committed to the project log before any code or Lean: that reading is right
for the search and wrong for the theorem. The search only tried *block algebras*, property
collections cut from a partition of the (individual, world) cells. Our Lean semantics, like the
AFP's, allows any collection of properties. Over any collection, we predicted, the back condition
is exact.

The argument is short. Suppose x is God-like at w and z is God-like at a world v that w sees.
Axiom T2 keeps both God-like at every world v leads to. At each such world t, a property is
positive iff x has it on every world t sees, and also iff z does. Those are Horn rules on cells:
"if x has Y on all of R(t), z has Y on all of R(t)", and back. Start from the cells x has on the
worlds w sees and chain the rules forward. The chain never adds an x cell outside those worlds, and
it adds the z cell at v only through a world u like the one the back condition asks for. So the
countermodel is: two individuals existing everywhere, and as properties *every* set of cells closed
under those rules. Positivity at t is "x has it on all of R(t)".

**Proved in Lean 4.** `lean/TheismFormal/AndersonHorn.lean` builds that model for any frame, world
w and successor with no back witness. Every piece is a theorem: x is God-like everywhere, z on
every world the successor reaches, the God-like property, its complement and Anderson's necessary
existence are in the collection, A2, T2 and A5 hold, A1a holds when the frame is serial, and the
step fails at w. The model parts use no axioms at all. With last step's sufficiency theorem:

> For any frame and any world w, GodIsEssential holds at w in every model of A2 and T2 (and, for
> serial frames, of A1a, A2, T2 and A5) if and only if every world v that w sees has a world u
> reachable from v that sees v and sees only worlds w sees.

**Checked a second way.** An independent Python script lists the collection explicitly and checks
every axiom from its definition, sharing no code with the earlier searches. At three worlds the back
condition fails at 60 (relation, world) pairs: the 36 where the block-algebra search had found a
failure plus its 24 misses. The model passes at all 60. At each of the 24 misses the collection is
not closed under complement, so no partition gives it, which is why the earlier search could not
see these failures. The full run covers every serial relation on four worlds as well (numbers on
the [results page](../../research/theism-formal-evidence/experiments/e23_horn_countermodel/results.md)).

**What it means.** With and without rigid positivity, the frame question for this step now has an
exact answer at every size, in the semantics the published proof uses. The answer without A4a is
a little stranger: it asks not for cycles but for a world that both returns to v and stays inside
what w can see. The earlier "depends on the algebra" is a fact about block algebras, worth keeping
in the paper as a warning about searching a narrower class than the theorem quantifies over.
These are results about what follows from Anderson's axioms in a stated semantics. They are not
findings about whether God exists.

Code, Lean and tables: [`research/theism-formal-evidence`](../../research/theism-formal-evidence/),
experiment `e23_horn_countermodel`.
