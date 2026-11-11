# E14: making "necessary existence" plain closes Anderson's de re gap

**Headline.** E13 showed that Anderson's axioms, read with varying domains and an actualist
"x has f necessarily", prove only *de dicto* ("at every world something God-like exists"): in 580
of 3,638 models two God-like individuals share one essence and each exists at only some worlds.
Replace Anderson's A5' (his essence-based necessary existence is positive) with **A5₀**, "exists
at every world" is positive, and the gap closes: in every model of A1, A2 (Anderson's), A3' and
A5₀, **every** God-like individual exists at every world (Lean 4, `lean/TheismFormal/Plain.lean`,
`godlike_necessary_plain` and `de_re_plain`, any property algebra, any domains). The price: 2,516
of the 3,638 E13 models survive, and nothing new is gained, since every A5₀ model already
satisfies A5' in all 17,440 frames searched. Plain necessary existence implies Anderson's
(`ne0_imp_nea`), and the 1,122 models lost include all 580 of E13's de re failures.

So the de re step needs either a property space that separates individuals (E13) or an axiom that
says outright that the property "exists at every world" is positive. The second is a stronger
premise than Anderson's. Its proof of de re is three lines, which says where the work in the
argument is being done.

## Setting

As E13: S5, positive set rigid, properties the unions of the blocks of a partition of the world x
individual cells, Anderson's own A2 (not both f and its complement positive), actualist
entailment (f &cap; Ex &sube; g) and actualist "x has f necessarily" (rowE(x) &sube; f). A1, G\*, A3' and
essence are E13's. The one change:

| axiom | E13 | E14 |
|---|---|---|
| fifth axiom | A5': the cells of the y with NE(y) form a positive property, where NE(y) = every essence of y is had by some existent at every world | A5₀: the cells of the y that exist at every world form a positive property |

Both require the property to be in the algebra. **De re** here is the stronger form: *every*
God-like individual exists at every world (E13's de re column counted "some").

## Prediction H19 (LOG.md, committed before the search ran)

- **(a)** De re in every model of the four axioms, any algebra and domains.
- **(b)** De dicto too.
- **(c)** With E13's H and G(H): models are the H with H &sube; G(H), G(H) a union of blocks, NE₀ a
  union of blocks and H &sube; NE₀.
- **(d)** NE₀ &sube; NE always; the model sets are not nested. The second half was flagged as a guess:
  E13's countermodels give A5' without A5₀; I guessed some frame gives A5₀ without A5'.
- **(e)** Full property semantics: A5₀ and A5' give the same models, one per necessary existent.

## Result

(a), (b), (c), (e) and the first half of (d) held. **The guess in (d) was refuted**: no model of
A5₀ fails A5' in any frame searched, so the A5₀ models are a strict subset of E13's.

| worlds | individuals | frames | (c) search = formula | NE₀ &sube; NE | models of A1, A2w, A3' | + A5' (E13) | + A5₀ | both | A5₀ not A5' | A5' not A5₀ | of which de re fails | de dicto fails with A5₀ | some God-like individual not necessary, with A5₀ | same with A5' | full semantics: A5₀ = A5' = necessary existents | seconds |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | yes (1) | 0.0 |
| 1 | 2 | 6 | 6 | 6 | 5 | 5 | 5 | 5 | 0 | 0 | 0 | 0 | 0 | 0 | yes (3) | 0.0 |
| 2 | 1 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | yes (1) | 0.0 |
| 1 | 3 | 35 | 35 | 35 | 31 | 25 | 25 | 25 | 0 | 0 | 0 | 0 | 0 | 0 | yes (7) | 0.0 |
| 3 | 1 | 5 | 5 | 5 | 5 | 5 | 5 | 5 | 0 | 0 | 0 | 0 | 0 | 0 | yes (1) | 0.0 |
| 1 | 4 | 225 | 225 | 225 | 217 | 133 | 133 | 133 | 0 | 0 | 0 | 0 | 0 | 0 | yes (15) | 0.0 |
| 2 | 2 | 135 | 135 | 135 | 85 | 53 | 35 | 35 | 0 | 18 | 10 | 0 | 0 | 18 | yes (9) | 0.0 |
| 4 | 1 | 15 | 15 | 15 | 15 | 15 | 15 | 15 | 0 | 0 | 0 | 0 | 0 | 0 | yes (1) | 0.0 |
| 1 | 5 | 1612 | 1612 | 1612 | 1691 | 761 | 761 | 761 | 0 | 0 | 0 | 0 | 0 | 0 | yes (31) | 3.4 |
| 5 | 1 | 52 | 52 | 52 | 52 | 52 | 52 | 52 | 0 | 0 | 0 | 0 | 0 | 0 | yes (1) | 0.1 |
| 3 | 2 | 5454 | 5454 | 5454 | 1663 | 799 | 409 | 409 | 0 | 390 | 240 | 0 | 0 | 390 | skipped (6 blocks) | 42.5 |
| 2 | 3 | 9898 | 9898 | 9898 | 4271 | 1787 | 1073 | 1073 | 0 | 714 | 330 | 0 | 0 | 594 | skipped (6 blocks) | 76.7 |

Totals over 17,440 (domain, algebra) frames: (c) search = formula in all 17,440; NE₀ &sube; NE in all
17,440; 8,038 models of A1, A2w, A3'; 3,638 with A5' (E13); 2,516 with A5₀, all of which also
satisfy A5'; 1,122 with A5' and not A5₀, including all 580 of E13's de re failures. With A5', 1,002
models have at least one God-like individual missing from some world (580 have no God-like
individual existing at every world); with A5₀, none. Full semantics (70 frames): A5₀ count = A5'
count = number of individuals existing at every world, in every frame.

**Why A5₀ never adds a model (observed, not proved).** In the 1,394 frames at 2x2, 3x2 and 2x3
that have an A5₀ model, Anderson's NE equals NE₀ in 1,334; in the other 60 it is larger but still
a union of blocks, so A5' holds as well. We have no proof that this holds at every size; it is a
conjecture checked to these sizes.

## Lean

`lean/TheismFormal/Plain.lean`, Lean 4.15.0 (`lean_build.txt`), no `sorry`:

- `godlike_necessary_plain`: with Anderson's A2 and A5₀, every God-like individual exists at
  every world (only those two axioms used);
- `de_re_plain`: with all four, some God-like individual exists and exists at every world;
- `ne0_imp_nea`: plain necessary existence implies Anderson's (no axioms at all);
- `cm_a5_not_a5z`: E13's two-world countermodel satisfies A5' but not A5₀ (no axioms).

## Limits

- (c) and the conjecture above are checked by exhaustive search to 5 cells (6 with at most 5
  blocks), not proved in Lean; E13's characterisation (a), which (c) builds on, is also search-only.
- S5, rigid positive set, extensional properties; Hájek's and Fitting's variants are not covered.
- A5₀ is our variant, not Anderson's; whether it has been proposed under another name is not yet
  checked against the literature.
- These are facts about a formal system, not evidence for or against God.

## Reproduce

```
python3 research/theism-formal-evidence/experiments/e14_plain_necessity/run.py   # about 2 min
research/theism-formal-evidence/lean/build.sh
```
