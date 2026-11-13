---
title: "Anderson's Gödel argument: an exact frame condition for the essence step, at every size"
seo_title: "Anderson's Gödel proof: exactly which frames break GodIsEssential"
date: 2026-11-13
tags: [research, theism-formal-evidence]
description: "Proved in Lean 4: with rigid positivity, God-likeness is an essence at w in every model iff every world w sees lies on a cycle."
---

This step of our [theism-formal-evidence](../../research/theism-formal-evidence/) programme closes
a question the [previous one](2026-11-13-anderson-godel-essence-step-needs-cycles-not-reflexivity.md)
left half open. The setting is C. Anthony Anderson's version of Gödel's ontological argument, as
the Isabelle/HOL Archive of Formal Proofs formalises it. One middle step there, **GodIsEssential**,
says that being God-like is the essence of whatever is God-like. The published proof of that step
assumes a reflexive accessibility relation and rigid positivity (axiom A4a: a positive property is
necessarily positive).

Last time we proved one direction in Lean 4. With A4a, the step holds at a world w whenever every
world w sees lies on a cycle, of any length. A search over every frame up to three worlds found the
converse too, but only up to three worlds.

**The prediction**, committed to the project log before any Lean: for any serial frame of any
size, if w sees a world v0 that never leads back to itself, one model breaks the step at w. The
model has two individuals, x and z, both existing everywhere. x has a property at every world or
at none. z agrees with x everywhere except at the worlds that lead to v0, where z's properties
vary freely. Positivity is the same at every world: a property is positive iff x has it. Then x is
God-like everywhere, z is God-like at v0, and z lacks at v0 a property that is positive at w. That
is exactly a failure of the step.

**Proved in Lean 4.** All five parts of the prediction are theorems in
`lean/TheismFormal/AndersonTransient.lean`. The model satisfies every axiom of the AFP's stage II
and stage III, A5 included. Combined with last step's theorem, this gives an exact
characterisation:

> For any serial frame and any world w, GodIsEssential holds at w in every model of Anderson's
> axioms with rigid positivity if and only if every world w sees lies on a cycle.

**Checked a second way.** A Lean model could, in principle, fit our Lean encoding while differing
from the semantics our earlier searches used. So we built the same model in the earlier search
code, unchanged, and checked every axiom from those definitions. We ran it on every serial frame
up to four worlds and 12,000 sampled frames at five, six and eight worlds: 9,502 cases, all passing.
At three worlds there are 24 cases, the same count as the failures last step's search found.

**A mistake on the way.** The first full check reported 581 failures at five worlds. The bug was in
our test harness: a Python generator picked up the world count late, so it drew six-world frames
and checked them as five-world ones. We fixed the harness before writing any result down. The
results page records the episode.

**What it means.** In the setting of the published proof, the frame question for this step now has
an exact answer at every size. The step can fail at w just when w sees a "transient" world, one
that never comes back to itself. The reflexivity assumption is far stronger than the step needs.
The countermodel uses a coarse property algebra. Under full semantics the step holds in every
frame, as an earlier step showed. Without rigid positivity, the exact condition is still open.
These are results about what follows from Anderson's axioms in a stated semantics. They are not
findings about whether God exists.

Code, Lean and tables: [`research/theism-formal-evidence`](../../research/theism-formal-evidence/),
experiment `e22_transient_countermodel`.
