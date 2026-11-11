# E11: Anderson's emendation with Anderson's own A2, a theorem, its Lean proof and its check

**Headline.** E7 to E10 gave Anderson's emendation of Gödel's ontological argument Scott's axiom A2
("exactly one of a property and its complement is positive"). Anderson keeps only half of it ("if a
property is positive, its complement is not"; Benzmüller & Fuenmayor 2020, sec. 5). With his own
A2 the picture changes: under full property semantics each individual gives exactly one model at
every number of worlds, and the God-like individual can have contingent properties, so nothing
forces modal collapse. This agrees with Benzmüller & Fuenmayor's Nitpick countermodel (two worlds,
one entity). The exact characterisation below holds for every block algebra of properties, is
proved in Lean 4 (`lean/TheismFormal/Anderson.lean`, section "Anderson's own A2"), and the
exhaustive search agrees with it on all 573 partitions checked.

So E7's "Anderson's repair collapses under full property semantics" is a fact about a hybrid
(Anderson's G\* and essence, Scott's A2), not about Anderson's system. E10's theorem stands as
stated, for that hybrid.

## Setting

As in E10: worlds W, individuals D, constant domain, S5, cells W × D, properties the unions of the
blocks of a partition of the cells, positive set P rigid. The *hull* of y is the union of the
blocks that meet y's row. Axioms: A1 (P up-closed), **A2w** (f ∈ P implies f' ∉ P), A3' (G is in
the algebra and positive, G the union of the rows of the y with G\*(y)), A5' (as E10; it never
binds, E10 step 4, proved in Lean as `ne_everyone`).

## Theorem (prediction H16, written in LOG.md before the search ran)

A1, A2w, A3', A5' hold for P iff P = {f : H ⊆ f} for a non-empty union of blocks H such that
H is the union of the rows of exactly the individuals whose hull is H. Distinct H give distinct
models, so the number of models is the number of such H.

**Proof.** (Lean: `weak_model_form`, `weak_model_of`, `weak_models_distinct`.)

1. *Some individual is God-like.* As E10 step 1, which uses only A2w: if G = ∅, A3' makes ∅
   positive, A1 then every property, against A2w on (all cells, ∅).
2. *P is the principal filter at a hull.* For a God-like x, f ∈ P iff x has f necessarily iff
   hull(x) ⊆ f (f is a union of blocks). Put H = hull(x).
3. *G\*(y) iff hull(y) = H*, since two principal filters agree iff their generators do.
4. *G = H.* A cell c is in H iff its individual is God-like: if c's individual y is God-like then
   hull(y) = H contains c; if c ∈ H, then since G ∈ P, H ⊆ G, so c ∈ G. So H is the union of the
   rows of exactly the y with hull(y) = H.
5. *Converse.* For such an H, ↑H is up-closed, satisfies A2w because H is non-empty, makes G\* hold
   of exactly the y with hull(y) = H (step 3), so G = H, which is in the algebra and positive. ∎

## Corollaries

- **Full property semantics** (every cell a block): hull(y) is y's row, so H must be a single row:
  exactly one model per individual, P = the properties that individual has necessarily, at any
  number of worlds. With two worlds, the God-like individual has the contingent property "being
  this cell" (Lean: `weak_full_semantics_model`). Modal collapse is not forced, as Benzmüller &
  Fuenmayor found by model finding; here it is proved for every domain and world set.
- **One individual:** every algebra has exactly one model (H = all cells).
- **Several God-like individuals** exist when the algebra cannot tell them apart (equal hulls):
  at one world with one block, every individual is God-like.
- **Against Scott's A2.** The difference is exactly the missing half of A2. Scott's A2 forces P to
  be an ultrafilter, so H must be a single block (E10); Anderson's lets it be any hull that meets
  the condition.

## Check against exhaustive search

`run.py` enumerates every up-closed family of properties (as monotone Boolean functions on the
blocks; counts checked against the Dedekind numbers 2, 3, 6, 20, 168), applies A2w, G\*, A3' and
A5' directly with E8's definitions, and compares the number of models with the theorem's count.
The 6-cell rows cover partitions with at most 5 blocks (the full 6-block case would mean 7.8
million families; it is covered by the Lean proof).

| worlds | individuals | partitions checked | search = prediction | algebras with a model | models in total | algebras where a God-like individual has a contingent property | models under full semantics (every cell a block) | seconds |
|---|---|---|---|---|---|---|---|---|
| 1 | 1 | 1 | 1 | 1 | 1 | 0 | 1 | 0.0 |
| 1 | 2 | 2 | 2 | 2 | 3 | 0 | 2 | 0.0 |
| 2 | 1 | 2 | 2 | 2 | 2 | 1 | 1 | 0.0 |
| 1 | 3 | 5 | 5 | 5 | 10 | 0 | 3 | 0.0 |
| 3 | 1 | 5 | 5 | 5 | 5 | 4 | 1 | 0.0 |
| 1 | 4 | 15 | 15 | 15 | 37 | 0 | 4 | 0.0 |
| 2 | 2 | 15 | 15 | 7 | 11 | 5 | 2 | 0.0 |
| 4 | 1 | 15 | 15 | 15 | 15 | 14 | 1 | 0.0 |
| 1 | 5 | 52 | 52 | 52 | 151 | 0 | 5 | 0.1 |
| 5 | 1 | 52 | 52 | 52 | 52 | 51 | 1 | 0.1 |
| 3 | 2 | 202 | 202 | 49 | 73 | 47 | skipped (6 blocks) | 1.8 |
| 2 | 3 | 202 | 202 | 78 | 110 | 49 | skipped (6 blocks) | 1.9 |

## Lean

`lean/build.sh` output (`lean_build.txt`): the library builds with Lean 4.15.0, no `sorry`, and
`#print axioms` shows the forward theorems use only `propext`, `Classical.choice` and
`Quot.sound` (Lean's standard classical axioms); the converse and the full-semantics model need
none.

## Limits

Constant domain, S5, positive set rigid, properties as sets of cells (extensional, as in E7 to
E10). Benzmüller & Fuenmayor's setting is intensional higher-order logic with actualist
quantifiers; our corollary agrees with their countermodel but the settings are not identical.
Anderson also intends varying domains (the Anderson–Hájek controversy); not covered here.

## Reference

Benzmüller, C. & Fuenmayor, D. (2020). Computer-supported analysis of positive properties,
ultrafilters and modal collapse in variants of Gödel's ontological argument. *Bulletin of the
Section of Logic* 49(2). doi:10.18778/0138-0680.2020.08; arXiv:1910.08955.
