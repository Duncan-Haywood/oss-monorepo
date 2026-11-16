---
title: "Checking one step of a Gödel-style proof of God is NP-complete when properties have complements"
seo_title: "A Gödel-style ontological proof step whose frame test is NP-complete"
date: 2026-11-16
tags: [philosophy-of-religion, lean, modal-logic, complexity, research]
description: "Without rigid positivity, the frames where Anderson's essence step always holds are polynomial to test, or coNP-complete once every property has a complement."
---

Our [theism-formal-evidence](../../research/theism-formal-evidence/README.md) programme machine-checks the modern versions of Gödel's ontological argument. One of them is C. Anthony Anderson's repair, as formalised in the Archive of Formal Proofs. Inside it there is a middle step, "being God-like is an essence of whatever has it". Two earlier experiments found exactly which accessibility relations (frames) make that step hold in every model when the axiom of rigid positivity is dropped:

- if the properties can be any collection, the step holds at a world w exactly when each world v that w sees has a "back witness": a world reachable from v that sees v and sees nothing w does not (E23);
- if every property has a complement, as in block algebras and full semantics, the test is that no world w sees is *separable*: there are no two sets of worlds A and S that every world reachable from v cannot tell apart (E24).

The first test is a graph search and runs in polynomial time. The second says "there exist two sets", which costs 4^n by brute force. E24 asked whether a simpler graph condition says the same thing.

## The answer: not unless P = NP

Any hypergraph can be turned into a frame. World w sees one world v. v sees one world per edge. Each edge world sees v and the edge's points, and each point sees only itself. Then **v is separable from w exactly when the hypergraph can be coloured with two colours and no edge gets a single colour.** The self-loop on each point forces the two sets to agree there, and because v is in A but not in S, each edge world can only satisfy the condition if its points carry both colours.

Two-colouring hypergraphs (set splitting) is a textbook NP-complete problem (Garey & Johnson, SP4). So deciding separability is NP-complete. Deciding whether the essence step holds at a world in every block-algebra model is coNP-complete.

The equivalence is proved in Lean 4 (`NP.sep_iff` in [`AndersonNP.lean`](../../research/theism-formal-evidence/lean/TheismFormal/AndersonNP.lean), no `sorry`). The NP-completeness of set splitting is cited, not formalised. We also checked it by search, with code written fresh for this:

| check | cases | mismatches |
|---|---|---|
| new decider vs exhaustive search, all serial frames up to 4 worlds | 11,628 separable triples (E24's count) | 0 |
| separability vs 2-colourability on the reduction frame | 2,046 hypergraphs, 535 colourable | 0 |

The Fano plane (7 points, 7 lines, impossible to 2-colour) gives a 16-world frame where the two settings disagree. In every block-algebra model the essence step holds at w. In some model over a general collection of properties it fails.

## Why it matters

Whether properties are required to have complements already decided *which* condition governs this step. It turns out to decide how hard the condition is to check as well. For anyone running these proofs by machine, that means no shortcut test exists for the complement-closed case: you need a solver. The question we have not answered is whether the problem stays hard on reflexive or transitive frames, the ones most modal logics of necessity use. Our gadget breaks as soon as worlds see themselves.

Full write-up: [E27 results](../../research/theism-formal-evidence/experiments/e27_separability_np/results.md). These are results about a formal system, not findings about whether God exists.
