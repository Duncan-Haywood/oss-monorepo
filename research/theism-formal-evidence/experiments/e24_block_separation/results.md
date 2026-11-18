# E24: the exact no-A4a frame condition for GodIsEssential over block algebras

**Question.** E23 proved E21's back condition exact for the essence step GodIsEssential
(Fuenmayor & Benzmüller, AFP 2017, `AndersonProof.thy`) without rigid positivity A4a, but its
countermodel is not closed under complement. Over block algebras, the setting of E21's search,
24 of the 60 (relation, world) pairs at 3 worlds with no back witness showed no failure. What is
the exact frame condition when every property has a complement?

**Prediction.** H28 in `LOG.md`, committed before this script and the Lean file.

## The condition

A successor v of w is *separable* if there are sets of worlds A ⊇ R(w) and S ∌ v such that for
every t in R*(v):

- (i) R(t) ⊆ A iff R(t) ⊆ S, and
- (ii) R(t) misses A iff R(t) misses S.

Why it is necessary: if GodIsEssential fails for x at w, `essential_iff` gives a successor v, a
God-like z at v and a property Z positive at w that z lacks at v. Take A = where x has Z and
S = where z has Z. T2 keeps x and z God-like on R*(v), so at each such t, "x has Z on R(t)" and
"z has Z on R(t)" are both equivalent to "Z is positive at t" (i), and the same for Z's
complement (ii).

## Method

- **Lean 4** (`lean/TheismFormal/AndersonSep.lean`, core library only, no `sorry`, no warnings;
  `lean_build.txt`). Necessity (`essential_nosep`) in any model with A2, T2 and complements.
  Sufficiency: for any separable v, two individuals existing everywhere; G = the worlds all of whose
  R*-reachable worlds satisfy (i) and (ii); the properties are the unions of four blocks, the
  classes of cells by (in B?, in g?), where x is in B on A and z on S, x is in g everywhere and z
  on G; positivity at t is "x has it on all of R(t)".
- **Independent check** (`run.py`, no code shared with E19, E21 or E23). Finds separable pairs by
  brute force over (A, S) on every serial relation up to 4 worlds, builds the four-block collection
  explicitly for each, and computes God-likeness, actualist entailment, essence and Anderson's NE
  from `AndersonK.lean`'s definitions. It reads E21's `results.json` only for its list of misses.

## Results

| H28 | claim | Lean | definition-level check |
|---|---|---|---|
| (a) | failure at w ⇒ some successor separable (complements, A2, T2) | `essential_nosep` | — |
| (b) | x God-like everywhere, z exactly on G ⊇ R*(v) | `Sep.god_x`, `Sep.god_z_iff` | 11,628 / 11,628 |
| (b) | g, complements of every property, NE (every cell) in the collection | `Sep.model` | 11,628 / 11,628 |
| (b) | A2, T2, A5 (any frame); A1a (serial) | `Sep.model`, `Sep.model_A1a` | 11,628 / 11,628 |
| (b) | GodIsEssential fails for x at w | `Sep.fails` (axiom-free) | 11,628 / 11,628 |
| (c) | exact: holds at w in every model iff no successor of w is separable | `essential_sep_iff` (A2, T2, complements; any frame), `essential_sep_iff_III` (adds A1a, A5, NE; serial) | — |
| (d) | separable ⇒ no back witness | `not_back_of_sep` (axiom-free) | 0 separable pairs with a back witness |
| (d) | at 3 worlds, separable pairs = E21's block-algebra failing pairs | — | 36 = 36, same pairs (0 either way) |

(Relation, world) pairs over every serial relation:

| worlds | pairs | back condition fails (E23: general collections) | some successor separable (E24: complement-closed) |
|---|---|---|---|
| 1 | 1 | 0 | 0 |
| 2 | 18 | 0 | 0 |
| 3 | 1,029 | 60 | 36 |
| 4 | 202,500 | 14,688 | 10,464 |

At 4 worlds, 4,224 (relation, world) pairs fail GodIsEssential in some model over a general
collection but in no model over a complement-closed one. Run time 14 s.

**Reading.** Without A4a, whether GodIsEssential can fail at a world depends on the frame and on
one property of the collection: whether properties have complements. Over block algebras (and
any complement-closed collection, which includes full semantics' powerset) the exact condition is
separability; over arbitrary collections it is the weaker-to-satisfy back condition of E23. Both
are proved at every size. E21's 24 misses are exactly the pairs with no back witness that are not
separable. Example (E21's encoding [3, 2, 1], w = 2): world 0 sees 0 and 1, world 1 sees 1, world
2 sees 0. With v = 0, A must contain world 0. At t = 1, (i) and (ii) make world 1 lie in both A and S
or in neither; at t = 0, if world 1 is in both then (i) puts world 0 in S, and if in neither
then (ii) does. So v ∈ S either way: not separable, though no world reachable from 0 sees 0
while seeing only world 0 (no back witness).

Not predicted: the countermodel never needed its fourth block on frames up to 4 worlds (at most 3
non-empty blocks). The Lean file compiled on the first build.

## Limits

- The semantics is the AFP file's as we read it (`AndersonK.lean`), not Anderson (1990) directly.
- Separability quantifies over sets of worlds; we have no closed-form graph condition for it, and
  the check is exponential in the number of worlds (fine at 4).
- Stage I here is A2, T2 and complements (plus A1a, A5 and NE at III-noA4); with A4a the exact
  condition is E22's cycle condition, whose countermodel is already a block algebra.
