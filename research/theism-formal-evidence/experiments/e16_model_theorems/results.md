# E16: the model counts of E13 and E14, proved for every algebra and every domain assignment

**Headline.** E13 (a), E13 (b) and E14 (c) were, until this step, claims checked by exhaustive
search over 17,440 small frames (up to 6 cells). They are now Lean 4 theorems for **any** block
algebra and **any** domains (`lean/TheismFormal/Models.lean`, no `sorry`, no warnings; build log
in [`lean_build.txt`](lean_build.txt)). The models of Anderson's A1, A2 (his own), A3' with
actualist entailment and actualist "x has f necessarily" correspond one-to-one to the sets of
blocks H that pass three checks, and adding A5' or A5₀ adds exactly two more checks each. So the
counts E13 and E14 report are counts of a closed-form condition, not artefacts of the search's
size limit.

No new prediction was made for this step: the statements are the ones predicted, and confirmed by
search, in the E13 and E14 entries of `LOG.md`. What is new is that they hold beyond 6 cells.

## Notation

`hE y` = the blocks meeting the cells where y exists. For a set of blocks H, `Same H y` = "`hE y`
is exactly H"; `Up H` = the properties containing every block of H. H is **admissible** when it is
non-empty, every cell in H belongs to some y with `Same H y` (H &sube; G(H)), and the cells of
those y form a property (G(H) a union of blocks).

## Theorems

| Lean name | statement | axioms used |
|---|---|---|
| `model_iff` | P satisfies A1, A2w, A3' iff P = `Up H` for an admissible H (E13 (a)) | propext, Classical.choice, Quot.sound |
| `godlike_iff` | in `Up H`, y is God-like iff `Same H y` | propext |
| `positive_set_unique` | any two God-like individuals of a model have the same `hE`, so model and H determine each other | none |
| `a5a_iff` | `Up H` satisfies A5' iff the Anderson-necessary individuals' cells form a property and H lies inside them (E13 (b), with `Closure.nea_iff`) | none |
| `a5z_iff` | `Up H` satisfies A5₀ iff the everywhere-existents' cells form a property and H lies inside them (E14 (c)) | none |
| `model_a5a_iff`, `model_a5z_iff` | the two assembled: models of all four axioms, either reading of A5 | propext, Classical.choice, Quot.sound |

Classical.choice enters through `exists_godlikeA` (E13), which argues by excluded middle that some
individual is God-like; the soundness direction (`model_of_admissible`) is constructive.

## Reading

E15 showed that A5' and A5₀ are independent in coarse algebras. These theorems say why in one
line each: both have the form "a row property is in the algebra and contains H", for two different
row properties (Anderson's NE and plain NE₀). Whether a frame has an A5' model, an A5₀ model, both
or neither is decided by those two closure facts and the admissible H, which a reader can check by
hand on any frame.

## Not done

Hájek's and Fitting's variants; the literature check for A5₀ and the de re gap; Swinburne's (2003)
inputs (the primary sources, a Swinburne 2013 paper on two hosts, were unreachable from this
session's network, and the inputs are not transcribed from a secondary summary).

## Reproduce

```
research/theism-formal-evidence/lean/build.sh
```
