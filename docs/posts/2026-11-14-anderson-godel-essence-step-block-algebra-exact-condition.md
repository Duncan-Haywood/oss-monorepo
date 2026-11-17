---
title: "Anderson's Gödel argument: when properties have complements, the essence step has a different exact condition"
seo_title: "Anderson's Gödel proof: GodIsEssential over block algebras"
date: 2026-11-14
tags: [research, theism-formal-evidence]
description: "Proved in Lean 4: without rigid positivity, the exact frame condition for the essence step in Anderson's Gödel argument when every property has a complement."
---

This step of our [theism-formal-evidence](../../research/theism-formal-evidence/) programme
answers the question the [previous step](2026-11-14-anderson-godel-essence-step-no-a4a-exact-condition.md)
left open. The setting is C. Anthony Anderson's version of Gödel's ontological argument, as the
Isabelle/HOL Archive of Formal Proofs formalises it. One middle step, **GodIsEssential**, says
that being God-like is the essence of whatever is God-like.

Without rigid positivity (axiom A4a), the previous step proved an exact frame condition for this
step, the *back condition*, over any collection of properties. Its countermodel had one odd
feature: some of its properties had no complement in the collection. An earlier exhaustive
search over *block algebras* (collections cut from a partition of the (individual, world) cells,
where every property does have a complement) found 24 frames, at three worlds, where the back
condition fails yet the step never fails. So which condition is exact when properties have
complements, as they do under full semantics?

**The prediction**, written into the project log before any code or Lean, gave a new condition.
Call a world v that w sees *separable* if you can pick two sets of worlds, A containing every
world w sees and S leaving out v, such that at every world t reachable from v, t's successors lie
inside A exactly when they lie inside S, and miss A exactly when they miss S.

Why that is the right shape: if the step fails at w, there is a God-like z at v and a property Z
that is positive at w but that z lacks at v. Let A be where the God-like x has Z and S where z
has it. Both stay God-like everywhere v leads, so at each such world "x has Z on every successor"
and "z has Z on every successor" both mean "Z is positive here". That gives the first clause.
Applying the same to Z's complement gives the second. Without complements only the first clause
survives, and that is exactly the gap the earlier countermodel slipped through.

**Proved in Lean 4.** `lean/TheismFormal/AndersonSep.lean` proves the necessity argument in any
model whose properties have complements, and builds a countermodel for every separable successor:
two individuals, and as properties the unions of four blocks of cells (so a Boolean algebra).
Together:

> For any frame and any world w, GodIsEssential holds at w in every model of A2 and T2 whose
> properties all have complements (and, for serial frames, of A1a, A2, T2 and A5) if and only if
> no world that w sees is separable.

Separability always rules out a back witness, also proved, so this is the stricter of the two
conditions for failure, as it must be.

**Checked a second way.** New Python code builds the four-block collection explicitly and checks
every axiom from its definition. It passes at all 11,628 separable cases on every serial frame up
to four worlds. At three worlds the separable pairs are *exactly* the 36 where the old block-algebra
search found a failure, no more and no fewer, so the 24 puzzling cases are precisely the ones that
fail the back condition but are not separable. At four worlds the step can fail at 14,688
(frame, world) pairs over general collections but at only 10,464 over complement-closed ones.

**What it means.** Without rigid positivity, whether this step of the argument can fail depends on
the frame and on one feature of the property collection: whether every property has a complement.
Both answers are now exact at every size. Separability still quantifies over sets of worlds; a
plain graph condition equivalent to it is the next open question. These are results about what
follows from Anderson's axioms in a stated semantics, not findings about whether God exists.

Code, Lean and tables: [`research/theism-formal-evidence`](../../research/theism-formal-evidence/),
experiment [`e24_block_separation`](../../research/theism-formal-evidence/experiments/e24_block_separation/results.md).
