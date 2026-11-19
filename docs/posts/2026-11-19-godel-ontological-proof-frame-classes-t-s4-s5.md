---
title: "Gödel-style proof of God: the hard frame test stays hard in T but vanishes in S4 and S5"
seo_title: "Gödel-style proof step: coNP-hard in T, trivial in S4 and S5"
date: 2026-11-19
tags: [philosophy-of-religion, lean, modal-logic, complexity, research]
description: "Anderson's essence step is coNP-complete to check in modal logic T, as in K, but holds at every world in S4, B and S5. Proved in Lean 4."
---

Three days ago we [showed](2026-11-16-godel-ontological-proof-np-complete-frame-condition.md) that one step in a machine-checked version of Gödel's ontological argument has an NP-complete frame test. The step is "being God-like is an essence of whatever has it", in C. Anthony Anderson's variant without rigid positivity, with every property having a complement. We left one question open. Does the hardness survive on the frames that the usual logics of necessity use? Those frames are reflexive (T), reflexive and transitive (S4), or symmetric (B, S5). The old gadget broke as soon as worlds could see themselves.

## The answer depends on the logic, and the line is sharp

| Logic | Does the step hold at every world in every model? | How hard is the check? |
|---|---|---|
| B, KB, S5 (symmetric) | yes | nothing to check |
| S4 (reflexive and transitive) | yes | nothing to check |
| K4, KD4 (transitive) | at w iff every world w sees also sees itself | linear |
| T (reflexive) | depends on the frame | coNP-complete |
| K, KD | depends on the frame | coNP-complete (last post) |

Three short arguments give the easy rows. If a world v can get back to w, the two sets that would make the step fail cannot exist. In a symmetric frame every v can get back. In a transitive frame everything v reaches is also seen by w, which pins the sets down, so the step fails only when v does not see itself. In K4 that is the same condition as with rigid positivity and as over arbitrary property collections, so there the three settings agree.

## The hard row needed a new gadget

The search problem becomes cleaner once each world is labelled by whether it is in each of the two sets: in both, in neither, in the first only (X) or in the second only (Y). A world's condition then holds exactly when what it sees carries no mixed labels, or both pure labels, or both X and Y. In a reflexive frame every world sees itself, so a world can often satisfy its own condition, which is how the old reduction leaked. The new one adds two shared worlds pinned to Y and X, and five worlds per hyperedge. Two of those leave the edge world only X or "in neither", two more leave it only X or "in both", so it is left with X, and its condition then holds only if its points take both colours: hypergraph 2-colouring again.

The equivalence, the three easy theorems and the reflexivity of the new frame are proved in Lean 4, with no `sorry` ([`AndersonKT.lean`](../../research/theism-formal-evidence/lean/TheismFormal/AndersonKT.lean)). We also checked them by search:

| Check | Cases | Failures |
|---|---|---|
| easy theorems on every relation up to 4 worlds | 524,288 (frame, w, v) triples | 0 |
| reflexive reduction vs 2-colourability | 2,046 hypergraphs | 0 |

One more finding came out of the exploration. Arc consistency, the standard cheap propagation step, decides every reflexive frame we tried up to 6 worlds. It fails on a 7-world one, where it leaves every label possible although no labelling works. That gap is what pointed us towards a reduction.

## What it means

If you run Anderson's argument in S4, B or S5 without rigid positivity, this step is never where the argument fails. In T it can fail, and finding out whether it does on a given finite frame needs a solver. These are results about a formal system, not findings about whether God exists. Full write-up: [E28 results](../../research/theism-formal-evidence/experiments/e28_frame_classes/results.md).
