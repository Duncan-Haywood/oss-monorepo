# E10: Anderson's axioms over every finite property algebra, a theorem and its check

**Headline.** In the semantics of E7 to E9, Anderson's emendation of Gödel's ontological argument
has a model exactly when the property algebra has a block made of whole individuals, and every such
model makes the God-like individual's properties all rigid and leaves the algebra unable to express
any contingent proposition. The proof below covers every finite model, so it settles the 6-cell
full-powerset case E9 had to skip (no model with two or more worlds) and every larger size. The
exhaustive search of E8 agrees with the theorem's model count on all 568 of 568 partitions it
was run on.

**Correction (2026-11-11, E11).** E7 to E10 use Scott's A2 (exactly one of f and its complement is positive). Anderson (1990) keeps only "if f is positive its complement is not". With Anderson's own A2 the characterisation changes (any qualifying hull, not only a block) and full property semantics has one model per individual at every number of worlds: see `../e11_anderson_a2/results.md`. This theorem stands for the hybrid it states (Anderson's G\* and essence with Scott's A2), and is now proved in Lean (`lean/TheismFormal/Anderson.lean`).

## Setting

Worlds W, individuals D (constant domain), S5, cells W × D. The *row* of x is W × {x}. A property
is a set of cells; the properties form a finite Boolean algebra 𝔄 of sets of cells, which is always
the set of unions of the blocks (atoms) of a partition π of the cells. x has f necessarily (□f(x))
iff row(x) ⊆ f. The positive set 𝒫 ⊆ 𝔄 is the same at every world (A4 built in). As in E7 and
`experiments/e8_restricted/run.py`:

- **A1** f ∈ 𝒫 and f ⊆ g ∈ 𝔄 imply g ∈ 𝒫.
- **A2** for each f ∈ 𝔄 exactly one of f and its complement f' is in 𝒫.
- **G\*(x)** iff for every f ∈ 𝔄: f ∈ 𝒫 ⟺ □f(x). G is the union of the rows of the x with G\*(x).
- **A3'** G ∈ 𝒫 (so in particular G ∈ 𝔄).
- **ess(f, x)** iff for every g ∈ 𝔄: □g(x) ⟺ f ⊆ g. **NE(x)** iff every f with ess(f, x) has a
  cell at every world. **A5'** the union of the rows of the x with NE(x) is in 𝒫.

## Theorem

A1, A2, A3', A5' hold for some 𝒫 iff π has a block B that is a union of rows. For each such block
there is exactly one model, 𝒫_B = {f ∈ 𝔄 : B ⊆ f}, and every model is of this form. So the number
of models of 𝔄 is the number of its blocks that are unions of rows.

**Proof.**

1. *G is non-empty.* If G = ∅ then A3' puts ∅ in 𝒫, A1 then puts the set of all cells in 𝒫, and
   A2 is violated for the pair (∅, all cells).
2. *𝒫 is principal at the block holding a God-like row.* Take x with G\*(x). For any f ∈ 𝔄, A2
   puts f or f' in 𝒫, so by G\*(x) row(x) ⊆ f or row(x) ⊆ f'. Applied to each block, row(x) lies
   inside a single block B. Then 𝒫 = {f : row(x) ⊆ f} = {f : B ⊆ f}, since every f ∈ 𝔄 is a union
   of blocks.
3. *G = B, so B is a union of rows.* For any y, G\*(y) iff (B ⊆ f ⟺ row(y) ⊆ f for all f ∈ 𝔄).
   If row(y) ⊆ B this holds (f is a union of blocks); if G\*(y), take f = B ∈ 𝒫 to get row(y) ⊆ B.
   So G is the union of the rows inside B, and G ⊆ B. A3' says G ∈ 𝒫, i.e. B ⊆ G. Hence G = B.
4. *A5' never binds.* For any y let hull(y) be the union of the blocks that meet row(y). Then
   □g(y) ⟺ hull(y) ⊆ g, so hull(y) is an essence of y, and it is the only one (if f and hull(y)
   both satisfy the biconditional, taking g = f and g = hull(y) gives f = hull(y)). hull(y) ⊇
   row(y) has a cell at every world, so NE holds of everyone, the NE set is all cells, and all
   cells ⊇ B is in 𝒫.
5. *Converse.* Let B be a block that is a union of rows and 𝒫_B = {f : B ⊆ f}. A1 holds. A2 holds
   because B is an atom: exactly one of f, f' contains it. By step 3, G = B ∈ 𝒫_B, and A5' holds
   by step 4. Distinct blocks give distinct 𝒫_B, and step 2 shows there are no other models. ∎

## Corollaries

- **(a) The God-like individuals have no contingent property.** Their rows lie inside the block B,
  so every f ∈ 𝔄 holds of them at every world or at none. This is what E9 observed in its examples;
  it is forced.
- **(b) The algebra expresses no contingent proposition.** For a set of worlds S, the property
  "S obtains" is S × D. If it is in 𝔄 then B ⊆ S × D or B ∩ (S × D) = ∅; B contains a whole row, so
  S = W or S = ∅. Under the usual comprehension principle that "being such that p" is a property
  for every proposition p, a model of Anderson's axioms therefore has only non-contingent
  propositions: modal collapse is avoided only for propositions the property space cannot express.
- **(c) One individual.** With |D| = 1 the only union of rows is the set of all cells, so B is that
  set and 𝔄 = {∅, all cells}: no property is contingent. E8's null for one individual and 2 to 5
  worlds holds at every size.
- **(d) Full property semantics.** When every set of cells is a property the blocks are single
  cells, which are unions of rows only when |W| = 1. So E7's result (one model per individual at one
  world, none with two or more worlds) holds at every finite size, including the 6-cell case E9
  skipped.

## Check against exhaustive search

`run.py` reruns E8's search on every partition below (rigid-only algebras included, unlike E8/E9)
and compares its model count with the theorem's; it also checks on every model that G is non-empty
(the search's "nontrivial" count equals its total) and that no contingent proposition is in the
algebra. The 6-cell rows cover partitions with at most 5 blocks; the one 6-block partition is
corollary (d).

| worlds | individuals | partitions checked | search count = theorem count | algebras with a model | models in total | contingent proposition in a model's algebra | seconds |
|---|---|---|---|---|---|---|---|
| 1 | 1 | 1 | 1 | 1 | 1 | none | 0.0 |
| 1 | 2 | 2 | 2 | 2 | 3 | none | 0.0 |
| 1 | 3 | 5 | 5 | 5 | 10 | none | 0.0 |
| 1 | 4 | 15 | 15 | 15 | 37 | none | 0.0 |
| 1 | 5 | 52 | 52 | 52 | 151 | none | 0.2 |
| 2 | 1 | 2 | 2 | 1 | 1 | none | 0.0 |
| 3 | 1 | 5 | 5 | 1 | 1 | none | 0.0 |
| 4 | 1 | 15 | 15 | 1 | 1 | none | 0.0 |
| 5 | 1 | 52 | 52 | 1 | 1 | none | 0.1 |
| 2 | 2 | 15 | 15 | 4 | 5 | none | 0.0 |
| 3 | 2 | 202 (of 203) | 202 | 10 | 11 | none | 2.7 |
| 2 | 3 | 202 (of 203) | 202 | 44 | 52 | none | 2.5 |

The counts restricted to algebras with a contingent property reproduce E8 (2 at 2 × 2) and E9
(8 at 3 × 2, 39 at 2 × 3): 4 − 2, 10 − 2 and 44 − 5 rigid-only partitions.

## Limits

Finite models only (a non-atomic, infinite property algebra is not covered), constant domain, S5,
positivity rigid by construction, and Anderson's axioms as encoded in E7. The proof is on paper and
checked by search; it is not yet in Lean (the toolchain could not be installed in these sessions).
We have not yet checked whether the characterisation is already stated in the literature on
Anderson's system; it may be known, and the paper will say so if it is.
