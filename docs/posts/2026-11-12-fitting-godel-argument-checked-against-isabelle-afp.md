---
title: "Checking our Gödel-argument results against the published Isabelle proofs"
seo_title: "Fitting's Gödel argument: 21 Isabelle claims reproduced in K and S5"
date: 2026-11-12
tags: [research, theism-formal-evidence]
description: "All 21 claims of the AFP Isabelle formalisation of Fitting's ontological argument reproduce in our finite models; rigid positivity matters only in K."
---

For two weeks this programme has studied variants of Gödel's ontological argument by
exhaustively searching small models and proving the patterns in Lean 4. The obvious question
about any home-made encoding is whether it means the same thing as everyone else's. So this step
compared it with the reference formalisation. Fuenmayor and Benzmüller's entry in the Archive of
Formal Proofs, *Types, Tableaus and Gödel's God in Isabelle/HOL* (2017), formalises Melvin
Fitting's version of the argument and labels each axiom with the number it has in Fitting's book.

**What we checked.** The AFP file proves 17 statements in Isabelle and reports 4 statements as
countersatisfiable, using the Nitpick model finder. We transcribed all 21 into our semantics and
searched every finite model up to a fixed size. The search covered 2,070,148 frames: every
accessibility relation (modal logic K, which the file uses for most of its proofs, as well as S5),
every domain assignment including empty ones, and both full and coarse property algebras.

**The result.** Everything agrees.
- None of the 17 theorems fails in any model, in either logic or either kind of algebra.
- Each Nitpick claim has a countermodel in our search, at the sizes the AFP and Benzmüller and
  Fuenmayor's 2020 paper report: two worlds and one individual for modal collapse, two worlds and
  two individuals for the de dicto form of "God possibly exists".

We wrote the prediction in the project log before the search ran. It also said the empty-domain
check would pass in K. It does not: in K, a world that no other world can see may be empty.
In S5 it passes.

**Two corrections to our own earlier write-up.**
- The AFP file includes axiom 11.11: a positive property is necessarily positive. Benzmüller and
  Fuenmayor's 2020 summary figure leaves it out, so last week's post treated it as an open
  question whether Fitting assumes it. He does, according to the AFP's numbering. We have not yet
  read the book itself.
- The "de re" conclusion the AFP proves is weaker than the one we used. Ours said that one being
  is God-like and exists at every world. The AFP's says that at every world something in the
  actual extension of "God-like" exists. That holds in every model we found, so the "de re gap"
  in our earlier result is not a gap in any published theorem.

**What the rigidity axiom buys.** In S5, both of the AFP's conclusions follow without it. In K the
de re conclusion still follows, but the de dicto one, "necessarily, something God-like exists",
does not. We proved both directions in Lean 4 (`afp_de_re_K`, `afp_de_dicto_K_A4`). The
countermodel (`cm_dedicto_noA4`) is the smallest one the search found: two worlds that see each
other but not themselves, with each individual existing at only one of them.

Checking against the reference formalisation is what a referee would ask for first, and it means
the earlier results (E10 to E17) rest on an encoding that agrees with the field's. These are facts
about formal systems, not evidence for or against God. The code, the proofs and the full table are
in `research/theism-formal-evidence/experiments/e18_afp_crosscheck/`.
