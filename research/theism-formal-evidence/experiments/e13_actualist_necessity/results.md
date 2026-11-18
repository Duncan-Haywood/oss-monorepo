# E13: Anderson's argument with an actualist "has f necessarily": the conclusion holds de dicto, not de re

**Headline.** E12 read "x has f necessarily" possibilistically. Read actualistically, as box
(x exists -> x has f), Anderson's four axioms with varying domains still give the argument's
conclusion in every model: at every world some God-like individual exists (Lean 4,
`lean/TheismFormal/Actualist.lean`, `godlike_exists_everywhereA`, any algebra, any domains).
But under **both** readings the stronger, de re claim, that **one** God-like individual exists at
every world, fails: 580 of the 3,638 models of all four axioms found under the actualist reading,
and 382 of the 6,706 under E12's possibilist one, have God-likeness shared by individuals that
each exist at only some worlds. The smallest is two worlds, two individuals, one block (Lean:
`de_re_fails`, checked under both readings, using no axioms at all). Under full property semantics
de re never fails (Lean: `full_godlike_necessaryA`). The exhaustive search agrees with the predicted
model counts on all 17,440 (domain, algebra) frames checked.

So with varying domains Anderson's axioms prove "necessarily, something God-like exists", not
"something God-like necessarily exists", unless the property space can tell individuals apart.
The gap is Anderson's NE: in a coarse algebra "every essence of x is exemplified at every world"
can be met by someone other than x.

## Setting

As E12 (S5, positive set rigid, properties the unions of the blocks of a partition of the
world x individual cells, Anderson's own A2, actualist entailment f &cap; Ex &sube; g), with one change:

| notion | E12 | E13 |
|---|---|---|
| x has f necessarily | every cell of x's row is in f | every *existing* cell of x's row is in f (rowE(x) &sube; f) |

G\* ("f is positive iff x has f necessarily") and essence ("x has g necessarily iff f entails g")
both use it. NE ("every essence of x is had by some existent at every world"), A1, A2w, A3', A5'
are E12's. **De dicto:** at every world some God-like individual exists. **De re:** some God-like
individual exists at every world.

## Prediction H18 (LOG.md, committed before the search ran)

With hE(y) the union of the blocks meeting rowE(y), and G(H) the union of the full rows of the y
with hE(y) = H:

- **(a)** Models of A1, A2w, A3' are P = {f : H &sube; f} for the non-empty unions of blocks H with
  H &sube; G(H) and G(H) a union of blocks.
- **(b)** NE is the rows of the y whose hE(y) &cap; Ex meets every world; A5' adds that NE is a union
  of blocks and H &sube; NE.
- **(c)** De dicto holds in every model of all four axioms, and fails in some model of the first three.
- **(d)** Full property semantics: one model per individual existing at every world.
- **(e)** De re fails in some model of all four axioms under both readings, never under full semantics.

*Why (c):* each cell of H lies both in the row of a God-like individual and in the row of a
necessary existent; a cell has one individual, so some y is both; the God-like individuals'
existing cells are exactly H &cap; Ex, and NE(y) says that set meets every world. *Why (e):* every
essence of y has existing part hE(y) &cap; Ex, which other individuals' cells can make up.

## Result

All five parts held. Columns (a) and (b) count the frames where the search's count equals the
formula's; they equal the number of frames checked on every row.

| worlds | individuals | frames | (a) search = formula | (b) search = formula | models of A1, A2w, A3' | of which also A5' | frames where A5' binds | de dicto fails without A5' | de dicto fails with A5' | de re fails with A5' (actualist) | E12 models of all four | de re fails with A5' (E12, possibilist) | frames where the two readings' counts differ | full semantics: models = necessary existents | seconds |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 1 | 1 | 1 | 1 | 1 | 1 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | yes (1) | 0.0 |
| 1 | 2 | 6 | 6 | 6 | 5 | 5 | 0 | 0 | 0 | 0 | 7 | 0 | 2 | yes (3) | 0.0 |
| 2 | 1 | 2 | 2 | 2 | 2 | 2 | 0 | 0 | 0 | 0 | 2 | 0 | 0 | yes (1) | 0.0 |
| 1 | 3 | 35 | 35 | 35 | 31 | 25 | 6 | 0 | 0 | 0 | 49 | 0 | 18 | yes (7) | 0.0 |
| 3 | 1 | 5 | 5 | 5 | 5 | 5 | 0 | 0 | 0 | 0 | 5 | 0 | 0 | yes (1) | 0.0 |
| 1 | 4 | 225 | 225 | 225 | 217 | 133 | 72 | 0 | 0 | 0 | 375 | 0 | 146 | yes (15) | 0.1 |
| 2 | 2 | 135 | 135 | 135 | 85 | 53 | 24 | 32 | 0 | 10 | 57 | 4 | 28 | yes (9) | 0.1 |
| 4 | 1 | 15 | 15 | 15 | 15 | 15 | 0 | 0 | 0 | 0 | 15 | 0 | 0 | yes (1) | 0.0 |
| 1 | 5 | 1612 | 1612 | 1612 | 1691 | 761 | 710 | 0 | 0 | 0 | 3141 | 0 | 1210 | yes (31) | 7.6 |
| 5 | 1 | 52 | 52 | 52 | 52 | 52 | 0 | 0 | 0 | 0 | 52 | 0 | 0 | yes (1) | 0.3 |
| 3 | 2 | 5454 | 5454 | 5454 | 1663 | 799 | 576 | 864 | 0 | 240 | 999 | 240 | 692 | skipped (6 blocks) | 83.3 |
| 2 | 3 | 9898 | 9898 | 9898 | 4271 | 1787 | 2214 | 2208 | 0 | 330 | 2003 | 138 | 1296 | skipped (6 blocks) | 145.5 |

Totals: 17,440 frames; 8,038 models of A1, A2w, A3', 3,638 of all four; A5' binds in 3,602 frames;
de dicto fails in 3,104 models without A5' and in none with it; de re fails in 580 models of all
four (actualist) and 382 (E12's possibilist reading, whose model totals, 6,706 of all four and
8,534 of the first three, match E12's own run). The two readings give different counts in 3,392
frames; with one world they differ only when someone does not exist there. De re failures need at
least two worlds and two individuals; every example found has two God-like individuals that
exist at complementary worlds and fall in one block.

**Smallest de re countermodel** (2 worlds x 2 individuals, one block, x0 exists only at w0 and x1
only at w1, P = "holds of the block"): both individuals are God-like and both satisfy NE, since
their one essence (the block) is exemplified by an existent at each world, but neither exists at
both worlds. Lean: `de_re_fails` proves all four axioms under both readings and that no individual
exists at every world.

## Lean

`lean/TheismFormal/Actualist.lean`, built with Lean 4.15.0 (`lean_build.txt`). No `sorry`.
`godlike_exists_everywhereA` and `full_godlike_necessaryA` use the standard axioms
(`propext`, `Classical.choice`, `Quot.sound`); `de_re_fails` uses none.

## Limits

- A search to 5 cells (6 cells with at most 5 blocks) plus three Lean theorems; (a) and (b) are
  checked by the search, not yet proved in Lean.
- S5, rigid positive set, extensional properties. Other essence variants (Hájek's, Fitting's
  intensional reading) are not covered.
- Whether the de re / de dicto gap in Anderson's system has been stated before is not yet checked
  against the literature; we claim only that we computed it.
- These are facts about a formal system, not evidence for or against God.

## Reproduce

```
python3 research/theism-formal-evidence/experiments/e13_actualist_necessity/run.py   # about 4 min
research/theism-formal-evidence/lean/build.sh
```
