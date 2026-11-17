# E17: Fitting's variant of Gödel's argument over block algebras, with varying domains

**Headline.** In Fitting's variant, where positive properties are *extensions* (sets of
individuals fixed across worlds) rather than intensions, the models over any block algebra and
any domains are exactly "contains b" for one block b, chosen per world, and the axiom of necessary
existence (A5) asks only that b have an existent at every world. So, as in Anderson's variant
(E13), the argument proves **de dicto** necessary existence ("at every world something God-like
exists") in every model, but **not de re** ("some one being is God-like and exists at every
world") once the property algebra lumps individuals together. Unlike Anderson's, Fitting's NE is
always a property of the algebra. Under full property semantics (every set of individuals is a
property) there is exactly one God-like individual and, if positivity is the same at every world
(A4), it exists at every world; without A4, which Benzmüller & Fuenmayor's encoding does not
list, a different individual can be God-like at each world. All of this is proved in Lean 4 for
every algebra and domain assignment (`lean/TheismFormal/Fitting.lean`, no `sorry`, no warnings)
and agrees with an exhaustive definition-level search on 119,890 frames.

Prediction H21 was written in `LOG.md` before the search ran; every part held.

## Setting

Fitting's axioms as encoded by Benzmüller & Fuenmayor (2020, *Computer-supported analysis of
positive properties, ultrafilters and modal collapse in variants of Gödel's ontological argument*,
arXiv:1910.08955, Fig. 6), read in S5 with actualist quantifiers:

| | definition |
|---|---|
| G x | x is in every positive extension |
| A1a, A1b | exactly one of Y and its complement is positive |
| A2 | P X, and every existent (at any world) in X is in Y, gives P Y |
| T2 | the extension of G is positive |
| E Y x | x is in Y, and every existent in Y is in every Z that contains x |
| NE x | every essence of x has an existent at every world |
| A5 | the extension of NE is positive |
| A4 (optional) | positivity the same at every world (not in B&F's Fig. 6) |

Properties are the unions of the blocks of a partition of the individuals (full semantics: the
partition into singletons). Every world has a non-empty domain; an individual may exist nowhere.

## Results

Search: every partition of up to 5 individuals, every non-empty domain assignment for 1 to 3
worlds (4 worlds at 3 individuals; 1 to 2 worlds at 5 individuals), every positive set A1 allows
at each world. Full table: [`table.md`](table.md); raw numbers: [`results.json`](results.json).

| quantity (all 119,890 frames) | count |
|---|---|
| frames where the search's count differs from H21's closed form | **0** |
| models of all axioms, with A4 / without A4 | 131,573 / 233,519 |
| frames where Fitting's NE is not a union of blocks | 0 |
| models with A5 where de dicto fails (with A4 / without) | 0 / 0 |
| models of A1, A2, T2 without A5 where de dicto fails (with A4) | 149,846 |
| models with A4 where de re fails | 33,102 |
| ... of them under full semantics | 0 |
| models without A4, full semantics, where de re fails | 4,858 |
| models with A4 and more than one God-like individual (coarse algebras only) | 97,422 |
| frames where Fitting's NE contains someone who does not exist at every world | 82,074 |

The smallest de re failure with A4: two worlds, two individuals in one block, each existing at
one world. Both are God-like, both are "necessary existents" in Fitting's sense (their shared
essence has an existent at each world), and neither exists at every world.

## Theorems (`lean/TheismFormal/Fitting.lean`)

| Lean name | statement | axioms used |
|---|---|---|
| `exists_god` | A1a, A2, T2 give a God-like individual that exists at some world | propext, Classical.choice, Quot.sound |
| `ne_iff`, `ne_in_algebra` | NE x iff x's block has an existent at every world, so NE is always a property (H21 (b)) | none |
| `model_iff` | P satisfies A1a, A1b, A2, T2 iff P = "contains x's block" for some x that exists somewhere (H21 (a)) | propext, Classical.choice, Quot.sound |
| `model_a5_iff` | adding A5: x's block has an existent at every world | propext, Classical.choice, Quot.sound |
| `de_dicto` | with A5, at every world some God-like individual exists (H21 (c)) | propext, Classical.choice, Quot.sound |
| `god_unique_full` | full semantics: at most one God-like individual | propext, Classical.choice, Quot.sound |
| `de_re_full` | full semantics and one positive set for all worlds: some God-like individual exists at every world (H21 (d), (e)) | propext, Classical.choice, Quot.sound |
| `cm_de_re` | the 2x2 one-block countermodel: all axioms hold, both individuals God-like, neither exists at every world | propext, Classical.choice, Quot.sound |
| `cm_no_a4` | full semantics without A4: each world's positive set a model, no individual God-like at both worlds | propext, Classical.choice, Quot.sound |

Classical.choice enters through excluded middle (A1b is used as "either f or its complement").
Build log: [`lean_build.txt`](lean_build.txt).

## Reading

- **The de re gap is not peculiar to Anderson.** E13 found that Anderson's axioms with varying
  domains give "necessarily something God-like exists" but not "something God-like necessarily
  exists" when the algebra is coarse. Fitting's quite different repair (extensional positivity)
  has the same gap for the same structural reason: necessary existence is defined through
  essences, and in a coarse algebra an essence can be exemplified by different individuals at
  different worlds. Both repairs secure de re only with a property space that separates
  individuals.
- **Where the two variants differ.** Anderson's NE can fall outside the algebra (E15), which
  makes A5' fail for reasons unrelated to theology; Fitting's NE never does (`ne_in_algebra`).
- **A4 matters.** Benzmüller & Fuenmayor's Fig. 6 lists no axiom that positivity is the same at
  every world. Without it the argument still gives "at every world exactly one God-like being
  exists" under full semantics, but not that it is the same being (`cm_no_a4`). Whether Fitting's
  book intends rigid positivity we have not checked against the book itself (not reachable here);
  the result is stated for both readings.
- **Monotheism.** B&F leave monotheism versus polytheism as further work. Here: under full
  semantics uniqueness is a theorem (`god_unique_full`); in coarse algebras a world can have
  several God-like individuals, all existing everywhere (example: one block of two individuals
  who both exist at both worlds).

These are facts about formal systems, not evidence for or against God.

## Limits

S5 only (B&F also work in KB); finite search sizes for the counts, though the theorems cover every
size; the block algebras are Boolean subalgebras generated by a partition, which for finitely
many individuals is every Boolean algebra of sets of individuals. Fitting's own book was not
consulted; the encoding follows B&F's figure.

## Reproduce

```
python3 research/theism-formal-evidence/experiments/e17_fitting/run.py   # about 10 s
research/theism-formal-evidence/lean/build.sh
```

**Correction (E18, 2026-11-12).** The AFP formalisation of Fitting's variant (Fuenmayor &
Benzmüller 2017, `FittingProof.thy`) includes A4a, which it labels as Fitting's axiom 11.11. So
positivity is rigid in Fitting's book, and the no-A4 case above is B&F 2020's Fig. 6 reading, not
Fitting's. Also, the AFP's "de re" conclusion `GodNecExists_v2` (at every world some existent is
in the actual extension of G) is weaker than the de re reading used here. It holds in every model
above, so the de re gap reported here is not a failure of any published theorem.
See `../e18_afp_crosscheck/results.md`.
