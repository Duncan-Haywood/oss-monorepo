# E15: plain necessary existence does not imply Anderson's (E14's conjecture refuted)

**Headline.** E14 found, in every frame up to 6 cells, that each model of A1, A2 (Anderson's), A3'
and A5₀ ("exists at every world" is positive) also satisfied Anderson's A5', and conjectured that
A5₀ implies A5'. It does not. The smallest counterexamples have **8 cells**: two worlds and four
individuals, with three blocks when every individual exists at some world (proved in Lean 4,
`lean/TheismFormal/Closure.lean`, `cm8`). An exact census finds **4,608 of 57,413** A5₀ models at
2 worlds x 4 individuals and **11,520 of 160,645** at 3 x 3 where A5' fails, and none at 4 x 2.

What decides it is one condition, proved in Lean (`a5a_iff_closed`): given A1 and A5₀, A5' holds
exactly when the cells of Anderson's necessary existents form a property of the algebra.
Positivity is never the problem, since plain necessary existence implies Anderson's. So under full
property semantics A5₀ does imply A5' (`full_a5z_imp_a5a`); in a coarse algebra a non-necessary
individual can share a block with a necessary one, and A5' asks for a property that is not there.

Corrected reading of E14: A5₀ and A5' are **independent** premises in coarse algebras (E13's
countermodels have A5' without A5₀, this one A5₀ without A5'). A5₀ still delivers de re
(`godlike_necessary_plain`, untouched); it is just not a strengthening of Anderson's axiom but a
different one.

## Setting

As E14: S5, positive set rigid, properties the unions of the blocks of a partition of the world x
individual cells, actualist entailment (f &cap; Ex &sube; g), actualist "x has f necessarily" (x's
existing cells lie in f), Anderson's A2 (not both f and its complement positive). Each world has a
non-empty domain (E12's convention); the census also reports the frames where every individual
exists at some world, the usual convention that the outer domain is the union of the worlds'
domains.

## Prediction H20 (LOG.md, committed before the census ran)

- **(a)** Given A1 and A5₀, A5' holds iff Anderson's NE is a union of blocks.
- **(b)** Under full property semantics A5₀ implies A5'.
- **(c)** No counterexample at 7 cells or fewer, so the smallest has 8.
- **(d)** Two individuals never suffice: none at 4 x 2; some at 2 x 4 and at 3 x 3.

The 2 x 4 countermodel was found on paper and checked with E14's own definition-level `search` on
that single frame before the entry was written; the census, the 3 x 3 case and the 4 x 2 null were
predicted before they ran.

## Result

All four parts held.

| worlds | individuals | frames | frames with an A5₀ model | A5₀ models | of which A5' fails | frames with such a model | fewest blocks in a counterexample | of which every individual exists somewhere | fewest blocks then |
|---|---|---|---|---|---|---|---|---|---|
| 4 | 2 | 335,340 | 7,314 | 7,539 | 0 | 0 | none | 0 | none |
| 2 | 4 | 931,500 | 52,906 | 57,413 | 4,608 | 4,608 | 2 | 2,592 | 3 |
| 3 | 3 | 7,253,421 | 157,395 | 160,645 | 11,520 | 11,520 | 3 | 11,520 | 3 |

(`table.md` adds run times: the whole census takes about 30 s.)

- **(a), (b)** proved in Lean for any algebra and any domains (`a5a_iff_closed`,
  `full_a5z_imp_a5a`; neither uses any axiom).
- **(c)** E14's search covered every frame up to 6 cells except the 6-cell full powerset, which
  (b) settles; 7 cells is 1 x 7 or 7 x 1, and with one world or one individual NE equals NE₀.
  The census's enumeration agrees with E14's search frame by frame on all 17,440 of those frames
  (`crosscheck`).
- **(d)** 4 x 2: no counterexample in 335,340 frames, as argued on paper (with two individuals NE
  is either NE₀ or every cell).
- **Not predicted.** The 2-block counterexamples (2 x 4) need an individual that exists at no
  world: its row sits in the one non-God block, which holds an existent at each world, so its
  neighbours are Anderson-necessary and it is not. Under the union-of-domains convention the
  minimum is 3 blocks. Every frame with a counterexample has exactly one A5₀ model.

## The countermodel (Lean `cm8`)

Worlds 0, 1. Individuals: g at both worlds, a only at 0, c and b only at 1. Blocks:
B = g's row; k1 = {(0,a), (1,c), (0,b)}; k3 = {(1,b), (1,a), (0,c)}. Positive = "holds of B".

- g is the only God-like individual and the only plain necessary existent, so A3' and A5₀ hold
  with the property B.
- a's essence is k1 (`nea_iff`: Anderson-necessity is "the blocks meeting x's existing cells hold
  an existent at every world"), and k1 holds (0,a) and (1,c), so a is Anderson-necessary; so is c.
- b's essence is k3, whose only existent is (1,b), so b is not. But (0,b) shares k1 with (0,a):
  no property holds at exactly the Anderson-necessary cells, and A5' fails.

## Method

Exact, no search over positive sets. In any model the positive set is {f : NecA f x} for any
God-like x (the definition of G\*); with A5₀ every God-like x exists at every world (E14, Lean
`godlike_necessary_plain`) and one exists (`exists_godlikeA`). So every model is
P_H = {f : H &sube; f} with H the closure of a necessary existent's row, and the census checks each
such H against A3' and A5₀ and then whether NE is a union of blocks. `crosscheck()` confirms this
enumeration equals E14's definition-level search, model by model and flag by flag, on every frame
E14 covered.

## Lean

`lean/TheismFormal/Closure.lean`, Lean 4.15.0 (`lean_build.txt`), no `sorry`, no warnings:

- `nea_iff`: Anderson's necessary existence without quantifying over essences (E13 (b), until now
  search-only); no axioms;
- `a5a_iff_closed`: given A1 and A5₀, A5' iff the NE cells form a property; no axioms;
- `full_a5z_imp_a5a`: full property semantics, A5₀ implies A5'; no axioms;
- `cm8`: the 8-cell model of A1, A2w, A3', A5₀ with A5' false; uses `propext` only.

## Limits

- The census is exhaustive at 8 and 9 cells for these three shapes, not at larger sizes; the
  Lean results hold at every size.
- S5, rigid positive set, extensional properties, as in E10 to E14. Hájek's and Fitting's
  variants are not covered.
- A5₀ is our variant; the literature check for prior statements of it and of the de re gap is
  still open.
- These are facts about a formal system, not evidence for or against God.

## Reproduce

```
python3 research/theism-formal-evidence/experiments/e15_a5z_not_a5/run.py --3x3 --full-crosscheck   # about 2.5 min
research/theism-formal-evidence/lean/build.sh
```
