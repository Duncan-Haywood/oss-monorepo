# E23: the exact no-A4a frame condition for GodIsEssential, over general property collections

**Question.** E21 proved a sufficient condition for GodIsEssential (a middle step of the AFP's
formalisation of Anderson's ontological argument, Fuenmayor & Benzmüller, AFP 2017,
`AndersonProof.thy`) without rigid positivity A4a: `essential_back`, "every successor v of w has
some u in R*(v) with u R v and R(u) ⊆ R(w)". Its search, over block algebras only, found 24
(relation, world) entries at 3 worlds where this condition fails yet no model breaks the step.
Is the condition exact over the collections the Lean semantics quantifies over (any Henkin-style
collection), so that the 24 are an artefact of partitions?

**Prediction.** H27 in `LOG.md`, committed before this script and the Lean file.

## Method

- **Lean 4** (`lean/TheismFormal/AndersonHorn.lean`, core library only, no `sorry`, no warnings;
  `lean_build.txt`). For any relation R, world w and successor v0 of w with no back witness: two
  individuals x and z, both existing everywhere; a property is any set of cells closed under the
  Horn rules "for t in R*(v0): x has Y on all of R(t) iff z has Y on all of R(t)"; P t Y iff x has
  Y on all of R(t). The failing property is Z = (x on R(w); z on every R(t) with t in R*(v0) and
  R(t) ⊆ R(w)).
- **Independent check** (`run.py`, no code shared with E19 or E21). For every serial relation on
  1 to 4 worlds and every (w, v0) with R w v0 and no back witness, it enumerates the collection
  explicitly (every closed subset of the 2n cells), computes God-likeness, actualist entailment,
  essence and Anderson's NE from `AndersonK.lean`'s definitions, and checks each axiom and the
  failure. It reads E21's `results.json` only for the list of E21's misses.

## Results

| H27 | claim | Lean | definition-level check |
|---|---|---|---|
| (a) | x God-like everywhere, z on R*(v0) | `Horn.god_x`, `Horn.god_z` (axiom-free) | 16,596 / 16,596 |
| (b) | g, its complement and NE (every cell) are in the collection | `Horn.g`, `Horn.gc` (serial), `Horn.n`; `Horn.model` | 16,596 / 16,596 |
| (c) | A2, T2, A5 (any frame); A1a (serial) | `Horn.model`, `Horn.model_A1a` (axiom-free) | 16,596 / 16,596 |
| (d) | GodIsEssential fails for x at w | `Horn.fails` (axiom-free) | 16,596 / 16,596 |
| exact | holds at w in every model iff every successor has a back witness | `essential_back_iff` (A2, T2; any frame), `essential_back_iff_III` (A1a, A2, T2, A5, complement, NE; serial) | — |
| (e) | E21's 24 misses get a valid failing model, none a block algebra | — | 24 / 24 valid; 0 / 24 closed under complement |

(Relation, world) pairs where the back condition fails, over every serial relation:

| worlds | pairs | back condition fails | (frame, w, v0) cases checked |
|---|---|---|---|
| 1 | 1 | 0 | 0 |
| 2 | 18 | 0 | 0 |
| 3 | 1,029 | 60 | 60 |
| 4 | 202,500 | 14,688 | 16,536 |

At 3 worlds, 60 = E21's 36 block-algebra failing pairs + its 24 misses. Of all 16,596 Horn
collections, 3,864 happen to be block algebras (closed under complement); at E21's misses none is.
Run time 107 s.

**Reading.** Without A4a, GodIsEssential can fail at w exactly when some world v that w sees has
no world u reachable from v that both sees v and sees only worlds w sees. This holds for every
frame of any size, over the general collections the AFP's and our Lean semantics use. E21's
"the exact condition depends on the algebra" is true of block algebras: there the 24 extra cases
are safe, because a partition cannot separate z's cell at v from x's cells without also allowing
complements that collapse the Horn rules. With E22, both the A4a and the no-A4a frame conditions
are now exact.

Not predicted: nothing in the mathematics. The Lean file compiled after one fix (an explicit
argument passed implicitly).

## Limits

- The semantics is the AFP file's as we read it (`AndersonK.lean`), not Anderson (1990) directly.
- The countermodel's collection is not complement-closed, so the exact condition for block
  algebras (E21's setting) remains open; E21's search answers it up to 3 worlds only.
- Stage I here means A1a, A2, T2 (plus A5 at III-noA4); the iff without A1a also covers
  non-serial frames, where E19 found no model with A1a.
