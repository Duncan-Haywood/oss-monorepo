# E12: Anderson's emendation with varying domains: the conclusion follows, A5' does the work, and full semantics needs a necessary existent

**Headline.** E7 to E11 used one domain for every world. Anderson (1990) means varying domains and
actualist quantifiers. With them, and with his own A2, every model of his four axioms has a
God-like individual existing at every world: the argument's conclusion follows in every model, for
any property algebra and any domains (proved in Lean 4, `lean/TheismFormal/Varying.lean`,
`godlike_exists_everywhere`). Unlike in E10 and E11, axiom A5' ("necessary existence is
positive") now does real work: drop it and 1,612 of the 8,534 models of the other three axioms
found by the search have a world where no God-like individual exists. Under full property
semantics there is one model per individual that exists at every world, and none when no
individual does (Lean: `full_godlike_necessary`, `full_model_of_necessary`). The exhaustive search
agrees with the predicted model counts on all 17,440 (domain, algebra) frames checked.

So the varying-domain reading does not rescue the argument from a critic, nor sink it: it moves
the whole question into A5' and into which individuals the domains contain. A model of the four
axioms exists only if some individual is, in the relevant sense, already everywhere.

## Setting

Worlds W, individuals D, S5, positive set P rigid. Each world w has a non-empty domain; Ex is the
set of cells (w, y) with y existing at w. Properties are the unions of the blocks of a partition
of all W x D cells (possibilist: a property may hold of an individual where it does not exist).

| notion | definition here |
|---|---|
| f entails g | at every world, every *existing* y with f has g: f &cap; Ex &sube; g |
| A1 | f &isin; P and f entails g imply g &isin; P |
| A2w (Anderson's own A2) | f &isin; P implies f' &notin; P |
| G\*(x) | for every f: f &isin; P iff x has f at every world (possibilist, as in Anderson's definition) |
| A3' | G (the rows of the G\* individuals) is in the algebra and in P |
| ess(f, x) | for every g: x has g at every world iff f entails g |
| NE(x) | for every essence f of x, at every world some existing y has f |
| A5' | NE is in the algebra and in P |
| conclusion | at every world some God-like individual exists |

## Prediction H17 (LOG.md, committed before the search ran)

With hull(y) the union of the blocks meeting y's row:

- **(a)** Models of A1, A2w, A3' are P = {f : H &sube; f} for the non-empty unions of blocks H
  that satisfy E11's condition (H is the union of the rows of exactly the y with hull(y) = H) and
  in which every block of H meets Ex.
- **(b)** A5' adds: H &cap; Ex meets every world, and NE is in the algebra.
- **(c)** The conclusion holds in every model of all four axioms, and fails somewhere in some
  model of the first three.
- **(d)** Full property semantics: one model per individual existing at every world.

*Why (a):* actualist entailment makes P closed under "same existing part"; a block of H that
missed Ex could be removed from a positive property without changing its existing part, so P
would contain a property not containing H. *Why (b):* for a God-like x, essences exist (every
block of hull(x) meets Ex) and each has existing part hull(x) &cap; Ex, so NE(x) says that set
meets every world. *Why (c):* that set is made of God-like individuals' cells.

## Result

All four parts held. Columns (a) and (b) count the frames where the search's count equals the
formula's; they equal the number of frames checked on every row.

| worlds | individuals | domain assignments | frames checked | (a) search = formula | (b) search = formula | models of A1, A2w, A3' | of which also A5' | frames where A5' binds | conclusion fails without A5' | conclusion fails with A5' | full semantics: models = necessary existents | full-semantics frames with no model | seconds |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 0 | 0 | 0 | yes (1) | 0 | 0.0 |
| 1 | 2 | 3 | 6 | 6 | 6 | 7 | 7 | 0 | 0 | 0 | yes (3) | 0 | 0.0 |
| 2 | 1 | 1 | 2 | 2 | 2 | 2 | 2 | 0 | 0 | 0 | yes (1) | 0 | 0.0 |
| 1 | 3 | 7 | 35 | 35 | 35 | 49 | 49 | 0 | 0 | 0 | yes (7) | 0 | 0.0 |
| 3 | 1 | 1 | 5 | 5 | 5 | 5 | 5 | 0 | 0 | 0 | yes (1) | 0 | 0.0 |
| 1 | 4 | 15 | 225 | 225 | 225 | 375 | 375 | 0 | 0 | 0 | yes (15) | 0 | 0.0 |
| 2 | 2 | 9 | 135 | 135 | 135 | 73 | 57 | 14 | 16 | 0 | yes (9) | 2 | 0.0 |
| 4 | 1 | 1 | 15 | 15 | 15 | 15 | 15 | 0 | 0 | 0 | yes (1) | 0 | 0.0 |
| 1 | 5 | 31 | 1612 | 1612 | 1612 | 3141 | 3141 | 0 | 0 | 0 | yes (31) | 0 | 2.9 |
| 5 | 1 | 1 | 52 | 52 | 52 | 52 | 52 | 0 | 0 | 0 | yes (1) | 0 | 0.1 |
| 3 | 2 | 27 | 5454 | 5454 | 5454 | 1419 | 999 | 348 | 420 | 0 | skipped (6 blocks) | 0 | 35.5 |
| 2 | 3 | 49 | 9898 | 9898 | 9898 | 3395 | 2003 | 1302 | 1176 | 0 | skipped (6 blocks) | 0 | 64.4 |

Frames are (domain assignment, partition) pairs. One-world and one-individual sizes are
degenerate (non-empty domains force a constant domain there), so the informative rows are 2 x 2,
3 x 2 and 2 x 3. The 6-cell rows cover partitions with at most 5 blocks (as in E11), so the full
semantics corollary at 6 cells rests on the Lean proof, not the search. With Ex = all cells the
search reproduces E11's counts on every partition (`constant_domain_matches_e11`).

**Observation not predicted beforehand.** In every model of the four axioms whose algebra
contains the property "exists" (Ex), existence is positive: all 1,830 such models across the sizes
(results.json). This follows from (a): if Ex is a union of blocks, every block meeting Ex lies
inside it, so H &sube; Ex. Whether existence should be a property at all is the old objection;
in this semantics, whenever the algebra can express it, it is positive.

## Lean

`lean_build.txt`: the library builds with Lean 4.15.0, no `sorry`, no warnings. Proved for every
block algebra and any domains (finite or not):

- `godlike_exists_everywhere`: A1 (actualist), A2w, A3', A5' imply that at every world some
  God-like individual exists. The proof is Anderson's: God-likeness is an essence of a God-like
  x; x has the positive property NE necessarily; so that essence is had by an existent at every
  world.
- `godlike_unique_full`, `full_godlike_necessary`: under full semantics the God-like individual
  is unique and exists at every world.
- `nev_everyone_full`: under full semantics every individual satisfies NE (one missing from some
  world has no essence, so NE holds vacuously), which is why A5' costs nothing there.
- `full_model_of_necessary`: under full semantics each individual existing at every world is the
  God-like individual of a model of all four axioms.

The counting statement (a)/(b) for coarser algebras is checked by the search only, not in Lean.

## Limits

S5, rigid P, extensional (cell-set) properties, finite search to 6 cells. "x has f necessarily"
is read possibilistically, as in Anderson's G\*; an actualist reading of that clause (x has f at
every world where x exists) is a different system, not checked here. Other variants of the essence
clause in the literature are not covered. Benzmüller & Fuenmayor (2020) work in intensional higher-order logic; our structures are
a finite extensional fragment of that setting.

## Reference

Anderson, C. A. (1990). Some emendations of Gödel's ontological proof. *Faith and Philosophy* 7.
(Title confirmed by a catalogue lookup on 2026-11-11, https://www.relbib.de/Record/1837469997 ;
issue and pages not confirmed.)

Benzmüller, C. & Fuenmayor, D. (2020). Computer-supported analysis of positive properties,
ultrafilters and modal collapse in variants of Gödel's ontological argument. *Bulletin of the
Section of Logic* 49(2). doi:10.18778/0138-0680.2020.08; arXiv:1910.08955.
